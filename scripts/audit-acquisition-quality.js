'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createKnowledgeCore, resourceAcquisition } = require('../src')
const { loadData } = require('../src/loader')
const { LEGACY_ENTITY_IDS } = require('../src/acquisition-core')

const ROOT = path.resolve(__dirname, '..')
const OUTPUT = path.join(ROOT, 'generated', 'acquisition-quality-audit.json')
const BARE_NUMERIC = /^(?:[-•]\s*)?(?:\d+(?:\.\d+)?|\d+(?:\.\d+)?%\s*[（(]\d+(?:\.\d+)?%[）)])$/
const RAW_LABEL = /\((?:Bounty|Mission|Rotation)\)|\b(?:sourceCanonical|chance|quantity|rarity|reviewStatus|rawRows?|rawTable|dropTable|chart|probabilityArray|DTO|formatter|DT_[A-Z_]+)\b/i
const RAW_TABLE_LINE = /^(?:[-•]\s*)?(?:\|.*\||(?:[^|]+\|){2,}[^|]+|\[\s*\{?|\{\s*"(?:chance|location|rarity|sourceCanonical)"|(?:Common|Uncommon|Rare)\s+\d+(?:\.\d+)?%)$/i
const INTERNAL_FIELD = /\b(?:sourceCanonical|sourceEntityId|locationId|missionTypeId|reviewStatus|provenance|rawRows?|rawTable|dropTable|probabilityArray|DTO|formatter)\b/i
const FORBIDDEN_PROVENANCE = /(?:fandom|wikia)\.com/i

function aggregate(items, keyOf) {
  return Object.fromEntries([...items.reduce((map, item) => {
    const key = String(keyOf(item) || 'unknown')
    map.set(key, (map.get(key) || 0) + 1)
    return map
  }, new Map())].sort(([a], [b]) => a.localeCompare(b)))
}

function registryHas(registry, id, aliases = null) {
  if (!id) return true
  if (registry?.get?.(id)) return true
  const canonicalId = aliases?.[id]
    || (aliases === LEGACY_ENTITY_IDS.locations && String(id).startsWith('mission-node.') ? String(id).replace(/^mission-node\./, 'mission.') : id)
  return Boolean(registry?.get?.(canonicalId))
}
function actorExists(registries, id) {
  if (!id) return true
  if (String(id).startsWith('acquisition-source.')) return Boolean(registries?.arcaneSources?.get?.(id) || registries?.locations?.get?.(id))
  if (String(id).startsWith('interface.')) return true
  return registryHas(registries?.npcs, id)
}

function entityClosureIssues(method, registries) {
  const issues = []
  const requirement = method?.requirements || {}
  const actorId = method?.npcId || requirement.npcId
  if (!actorExists(registries, actorId)) issues.push('unresolved-actor-reference')
  for (const [kind, id, aliases] of [
    ['locations', method?.locationId || requirement.locationId, LEGACY_ENTITY_IDS.locations],
    ['quests', method?.questId || requirement.questId, null],
    ['factions', method?.factionId || requirement.factionId, null],
    ['missionTypes', method?.missionTypeId || method?.missionTypeEntityId, null]
  ]) if (!registryHas(registries?.[kind], id, aliases)) issues.push(`unresolved-${kind.replace(/s$/, '')}-reference`)
  for (const item of requirement.currency || []) if (!registryHas(registries?.currencies, item.currencyId)) issues.push('unresolved-currency-reference')
  const provenance = JSON.stringify(method?.provenance || {})
  if (FORBIDDEN_PROVENANCE.test(provenance)) issues.push('forbidden-fandom-provenance')
  return issues
}

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
  issues.push(...entityClosureIssues(method, registries))
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
  const publishedMethods = []
  const approvedEntries = entries.filter(entry => entry.reviewStatus === 'approved')
  for (const entry of entries) {
    const canonical = entry.subject?.canonical
    if (!canonical) continue
    const result = core.getAcquisition(canonical)
    const methods = result?.structuredMethods || []
    if (entry.reviewStatus === 'approved') publishedMethods.push(...methods.map((method, methodIndex) => ({ entryId: entry.id, canonical, category: entry.subject?.category, methodIndex, method })))
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
      approvedEntries: approvedEntries.length,
      resources: resources.length,
      approvedResources: resources.filter(entry => entry.reviewStatus === 'approved').length,
      reviewRequiredResources: resources.filter(entry => entry.reviewStatus !== 'approved').length,
      unresolvedOrReviewRequiredEntries: reviewRequired.length,
      publishedMethods: publishedMethods.length,
      publishedIssueCount: publishedIssues.length,
      publishedBadEntries: new Set(publishedIssues.map(issue => issue.id)).size,
      publishedBadMethods: publishedMethods.filter(({ method }) => inspectMethod(method, data).length).length,
      publishedIssueIncidence: publishedMethods.reduce((count, { method }) => count + inspectMethod(method, data).length, 0),
      reviewIssueCount: reviewIssues.length
    },
    coverage: {
      approvedEntriesByCategory: aggregate(approvedEntries, entry => entry.subject?.category),
      publishedMethodsByCategory: aggregate(publishedMethods, item => item.category),
      publishedMethodsByType: aggregate(publishedMethods, item => item.method?.type)
    },
    issueAggregates: {
      publishedByCategory: aggregate(publishedIssues, issue => issue.category),
      publishedByIssue: aggregate(publishedIssues, issue => issue.issue),
      reviewByIssue: aggregate(reviewIssues, issue => issue.issue)
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
module.exports = { BARE_NUMERIC, RAW_LABEL, RAW_TABLE_LINE, INTERNAL_FIELD, FORBIDDEN_PROVENANCE, aggregate, actorExists, entityClosureIssues, inspectMethod, audit, run }
