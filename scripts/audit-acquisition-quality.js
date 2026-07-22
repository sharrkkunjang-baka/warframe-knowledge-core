'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createKnowledgeCore, resourceAcquisition } = require('../src')
const { loadData } = require('../src/loader')

const ROOT = path.resolve(__dirname, '..')
const OUTPUT = path.join(ROOT, 'generated', 'acquisition-quality-audit.json')
const BARE_NUMERIC = /^(?:[-•]\s*)?(?:\d+(?:\.\d+)?|\d+(?:\.\d+)?%\s*[（(]\d+(?:\.\d+)?%[）)])$/
const RAW_LABEL = /\((?:Bounty|Mission|Rotation)\)|\b(?:sourceCanonical|chance|quantity|rarity|reviewStatus|rawRows?|rawTable|dropTable|chart|probabilityArray|DTO|formatter|DT_[A-Z_]+)\b/i
const RAW_TABLE_LINE = /^(?:[-•]\s*)?(?:\|.*\||(?:[^|]+\|){2,}[^|]+|\[\s*\{?|\{\s*"(?:chance|location|rarity|sourceCanonical)"|(?:Common|Uncommon|Rare)\s+\d+(?:\.\d+)?%)$/i
const INTERNAL_FIELD = /\b(?:sourceCanonical|sourceEntityId|locationId|missionTypeId|reviewStatus|provenance|rawRows?|rawTable|dropTable|probabilityArray|DTO|formatter)\b/i

function inspectMethod(method, registries = null) {
  const issues = []
  if (!method || typeof method !== 'object' || !method.type) issues.push('invalid-method')
  if (!method?.requirements || !Array.isArray(method?.requirementLines)) issues.push('invalid-requirement-protocol')
  const requirement = method?.requirements || { type: 'none' }
  const invalidRequirement = (requirement.type === 'quest' && !requirement.questId && !requirement.questName)
    || (requirement.type === 'currency' && !(requirement.currency || []).length && !((method.currency || []).length || (method.requirements?.currency || []).some(item => item.displayName && Number(item.amount) > 0)))
    || (requirement.type === 'standing' && !requirement.npcId && !requirement.factionId && !method.npcId && !(method.factionIds || []).length)
    || (requirement.type === 'item' && !requirement.recipeId && !(requirement.items || []).length && !requirement.itemGroupId)
  if (invalidRequirement) issues.push('empty-requirement')
  const source = String(method?.sourceDisplayName || method?.locationDisplayName || method?.missionTypeDisplayName || method?.sourceEntityId || method?.locationId || method?.missionTypeId || method?.variables?.text || '').trim()
  if (['enemy-drop', 'mission-reward', 'bounty-reward', 'heist-reward'].includes(method?.type) && !source) issues.push('empty-source')
  if (BARE_NUMERIC.test(source)) issues.push('bare-numeric-source')
  if (RAW_LABEL.test(source)) issues.push('raw-upstream-label')
  if (method?.reviewStatus === 'review-required' || method?.category === 'unresolved') issues.push('unresolved-method')
  if (method?.type === 'enemy-drop') {
    const sourceIds = [...new Set([method.sourceEntityId, ...(method.variables?.sourceEntityIds || [])].filter(Boolean))]
    if (sourceIds.length && registries?.enemies && sourceIds.some(id => !registries.enemies.get(id))) issues.push('enemy-source-not-in-registry')
    if (!sourceIds.length && /^(?:(?:fragment|placeholder|objective)(?:\s|[-_]|\d|$)|(?:碎片|占位|任务对象))/i.test(source)) issues.push('suspicious-enemy-source')
  }
  return issues
}

function audit() {
  const core = createKnowledgeCore({ approvedOnly: false })
  const data = loadData(ROOT, { approvedOnly: false })
  const entries = data.knowledge.filter(entry => entry.module === 'acquisition')
  const resources = resourceAcquisition.ENTRIES
  const reviewRequired = entries.filter(entry => entry.reviewStatus !== 'approved' || /unresolved|review-required/.test(JSON.stringify(entry.subject?.categoryRefs || [])))
  const publishedIssues = []
  const reviewIssues = []
  for (const entry of entries) {
    const canonical = entry.subject?.canonical
    if (!canonical) continue
    const result = core.getAcquisition(canonical)
    const methods = result?.structuredMethods || []
    const issues = methods.flatMap(method => inspectMethod(method, data))
    const visible = String(result?.description || '')
    const visibleLines = visible.split(/\r?\n/).map(line => line.trim())
    if (visibleLines.some(line => BARE_NUMERIC.test(line))) issues.push('bare-numeric-line')
    if (visibleLines.some(line => RAW_TABLE_LINE.test(line))) issues.push('raw-table-line')
    if (RAW_LABEL.test(visible) || INTERNAL_FIELD.test(visible)) issues.push('raw-upstream-label')
    const vaultedPrime = entry.subject?.category === 'weapon' && entry.acquisition?.prime?.kind === 'prime-relic' && entry.acquisition?.prime?.status === '???';
    const primeEvidenceOnly = entry.subject?.category === 'weapon' && entry.acquisition?.prime?.kind === 'prime-relic' && entry.acquisition?.prime?.status !== '???' && (entry.acquisition?.routes || []).some(route => route.methods?.length);
    const publishedMethodlessAllowed = vaultedPrime || primeEvidenceOnly;
    if (entry.reviewStatus === 'approved' && !methods.length && ['resource', 'mod', 'arcane', 'weapon', 'frame'].includes(entry.subject?.category) && !['frame'].includes(entry.subject?.category) && !publishedMethodlessAllowed) issues.push('missing-structured-method')
    const target = entry.reviewStatus === 'approved' ? publishedIssues : reviewIssues
    for (const issue of [...new Set(issues)]) target.push({ id: entry.id, canonical, category: entry.subject?.category, issue })
  }
  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      acquisitionEntries: entries.length,
      resources: resources.length,
      approvedResources: resources.filter(entry => entry.reviewStatus === 'approved').length,
      reviewRequiredResources: resources.filter(entry => entry.reviewStatus !== 'approved').length,
      unresolvedOrReviewRequiredEntries: reviewRequired.length,
      publishedIssueCount: publishedIssues.length,
      reviewIssueCount: reviewIssues.length
    },
    publishedIssues,
    reviewRequired: reviewRequired.map(entry => ({ id: entry.id, canonical: entry.subject?.canonical, displayName: entry.subject?.displayName, category: entry.subject?.category, reviewStatus: entry.reviewStatus, categoryRefs: entry.subject?.categoryRefs || [] })),
    reviewIssues
  }
  return report
}

function run(argv = process.argv.slice(2)) {
  const report = audit()
  if (!argv.includes('--check')) fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report.totals, null, 2))
  if (argv.includes('--strict') && report.publishedIssues.length) throw new Error(`已发布获取条目存在 ${report.publishedIssues.length} 个质量问题；详见 generated/acquisition-quality-audit.json`)
  return report
}

if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { BARE_NUMERIC, RAW_LABEL, RAW_TABLE_LINE, INTERNAL_FIELD, inspectMethod, audit, run }
