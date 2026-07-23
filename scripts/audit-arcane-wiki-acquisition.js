'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createKnowledgeCore } = require('../src')
const { ASCENSION_SISTER_SOURCE } = require('../src/ascension-arcane-acquisition')

const ROOT = path.resolve(__dirname, '..')
const WIKI_EVIDENCE_PATH = path.join(ROOT, 'generated', 'acquisition-wiki-evidence.json')
const OUTPUT = path.join(ROOT, '..', '..', 'qq-bot', 'artifacts', 'arcane-wiki-acquisition-audit.json')

const WIKI_PATTERNS = Object.freeze([
  { id: 'vestigial-motes-exchange', pattern: /(?:purchased|traded) from Ordis[^.]{0,120}?(\d+)\s+Vestigial Motes/i },
  { id: 'ascension-sister-drop', pattern: /Sisters? of Parvos \(Ascension(?: Hard)? Mode\)/i },
  { id: 'standing-vendor', pattern: /(?:purchased|bought) from ([A-Za-z0-9' -]+?) for ([\d,]+)\s+Standing/i },
  { id: 'steel-path-vor-arcane', pattern: /Captain Vor in Tolstoj[^.]{0,80}Steel Path/i }
])

function wikiExcerpt(entry) {
  const generated = entry?.arcaneAcquisition?.generated?.wiki?.evidence || []
  const captured = entry?.wikiEvidence || []
  const fromIndex = entry?.wikiIndexExcerpt || ''
  return [fromIndex, ...generated.map(item => item.provenance?.excerpt || ''), ...captured.map(item => item.provenance?.excerpt || item.excerpt || '')].filter(Boolean).join('\n')
}

function wikiMeta(entry, evidenceIndex) {
  const fromEvidence = evidenceIndex.get(entry.subject?.canonical?.toLowerCase())
  if (fromEvidence?.wiki) return fromEvidence.wiki
  const generated = entry?.arcaneAcquisition?.generated?.wiki?.wiki
  if (generated?.pageTitle) return { url: `https://wiki.warframe.com/w/${String(generated.pageTitle).replace(/ /g, '_')}`, ...generated }
  return null
}

function methodHasVestigialExchange(methods) {
  return (methods || []).some(method => (method.type === 'vendor-or-syndicate-exchange' || method.type === 'vendor-exchange')
    && (method.requirements?.currency || []).some(item => item.currencyId === 'currency.vestigial-motes' || /vestigial/i.test(String(item.currencyCanonical || ''))))
}

function methodHasDuplicateAscensionModes(methods) {
  const modes = (methods || []).filter(method => ASCENSION_SISTER_SOURCE.test(String(method.sourceCanonical || method.sourceDisplayName || '')))
  return modes.length >= 2
}

function auditArcane(entry, runtime, evidenceIndex, fetchedAt) {
  const canonical = entry.subject?.canonical
  const excerpt = wikiExcerpt({ ...entry, wikiEvidence: runtime.wikiEvidence, wikiIndexExcerpt: evidenceIndex.get(canonical?.toLowerCase())?.evidence?.excerpt || '' })
  const wiki = wikiMeta(entry, evidenceIndex)
  const methods = runtime.structuredMethods || []
  const issues = []
  const wikiSignals = WIKI_PATTERNS.filter(item => item.pattern.test(excerpt)).map(item => item.id)

  if (wikiSignals.includes('vestigial-motes-exchange') && !methodHasVestigialExchange(methods)) {
    issues.push({ code: 'missing-vestigial-exchange', detail: 'Wiki 记载 Ordis 残存微粒兑换，结构化方法缺失' })
  }
  if (methodHasDuplicateAscensionModes(methods)) {
    issues.push({ code: 'duplicate-ascension-mode-lines', detail: '仍分别显示 Ascension Mode 与 Hard Mode' })
  }
  if (wikiSignals.includes('ascension-sister-drop') && !methods.some(method => /扬升|Sister Of Parvos \(Ascension\)/i.test(String(method.sourceDisplayName || method.sourceCanonical || '')))) {
    issues.push({ code: 'missing-ascension-sister-drop', detail: 'Wiki 有扬升姐妹掉落，运行时未实体化' })
  }
  if (wikiSignals.includes('steel-path-vor-arcane') && !methods.some(method => /Vor|沃尔|Tolstoj/i.test(String(method.sourceDisplayName || method.sourceCanonical || '')))) {
    issues.push({ code: 'missing-steel-path-vor-drop', detail: 'Wiki 记载钢铁之路 Vor 掉落，结构化方法缺失' })
  }
  if (!methods.length && runtime.arcane?.availability === 'available') {
    issues.push({ code: 'missing-structured-methods', detail: '可获取赋能缺少结构化方法' })
  }
  if (!excerpt && runtime.arcane?.availability === 'available') {
    issues.push({ code: 'missing-wiki-evidence', detail: '尚无 wiki.warframe.com 抓取证据' })
  }

  return {
    canonical,
    displayName: entry.subject?.displayName,
    officialUniqueName: entry.officialUniqueName,
    category: entry.arcaneAcquisition?.generated?.classification?.category || 'legacy',
    availability: runtime.arcane?.availability,
    wiki: wiki ? {
      url: wiki.url || `https://wiki.warframe.com/w/${String(wiki.pageTitle || canonical).replace(/ /g, '_')}`,
      pageTitle: wiki.pageTitle || canonical,
      revisionId: wiki.revisionId || null,
      timestamp: wiki.timestamp || wiki.pageTimestamp || null,
      syncedAt: wiki.syncedAt || fetchedAt
    } : null,
    wikiSignals,
    structuredMethodCount: methods.length,
    issues
  }
}

function audit(options = {}) {
  const fetchedAt = new Date().toISOString()
  const core = createKnowledgeCore({ approvedOnly: false })
  const evidenceIndex = new Map()
  if (fs.existsSync(WIKI_EVIDENCE_PATH)) {
    for (const item of JSON.parse(fs.readFileSync(WIKI_EVIDENCE_PATH, 'utf8')).entries || []) {
      if (item.category === 'arcane' && item.canonical) evidenceIndex.set(item.canonical.toLowerCase(), item)
    }
  }
  const rows = (core.arcanes || []).map(entry => auditArcane(entry, core.getAcquisition(entry.subject.canonical), evidenceIndex, fetchedAt))
  const mismatches = rows.filter(row => row.issues.length)
  const issueCounts = {}
  for (const row of mismatches) for (const issue of row.issues) issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1
  return {
    schemaVersion: 1,
    generatedAt: fetchedAt,
    sourceHost: 'wiki.warframe.com',
    totals: {
      arcanes: rows.length,
      wikiEvidenceIndexed: evidenceIndex.size,
      checked: rows.length,
      mismatches: mismatches.length,
      clean: rows.length - mismatches.length,
      issueCounts
    },
    systematicIssues: Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count })),
    mismatches,
    rows
  }
}

function run(argv = process.argv.slice(2)) {
  const report = audit()
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report.totals, null, 2))
  if (argv.includes('--strict') && report.totals.mismatches) throw new Error(`赋能 Wiki 审计发现 ${report.totals.mismatches} 项差异；详见 ${OUTPUT}`)
  return report
}

if (require.main === module) {
  try { run() } catch (error) { console.error(error.stack || error); process.exit(1) }
}

module.exports = { audit, auditArcane, run, WIKI_PATTERNS }
