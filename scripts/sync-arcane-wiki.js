'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { inspectWikiDatabase, resolveWikiDatabase } = require('../src/wiki-db')
const { compileArcaneWikiPage } = require('../src/arcane-wiki-compiler')

const ROOT = path.resolve(__dirname, '..')
const ARCANE_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'arcane')
const REPORT_PATH = path.join(ROOT, 'generated', 'arcane-wiki-unresolved.json')
const OFFICIAL_ARCANES = require(path.join(path.dirname(require.resolve('warframe-items')), 'data', 'json', 'Arcanes.json'))
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
function argument(argv, name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null }
function officialDirectory(items = OFFICIAL_ARCANES) { return new Map(items.filter(item => item.name && item.name !== 'Arcane' && !item.excludeFromCodex).map(item => [item.name.toLowerCase(), item])) }
function listJson(directory) { if (!fs.existsSync(directory)) return []; return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? listJson(path.join(directory, entry.name)) : entry.isFile() && entry.name.endsWith('.json') ? [path.join(directory, entry.name)] : []) }
function readEntries(directory) { return listJson(directory).filter(file => !file.includes(`${path.sep}method${path.sep}`)).flatMap(file => { const raw = fs.readFileSync(file, 'utf8'); const value = JSON.parse(raw); return (Array.isArray(value) ? value : [value]).map((entry, index) => ({ file, raw, value, entry, index })) }) }
function mergeManual(entry) { const old = entry.arcaneAcquisition?.manual || {}; return { ...old, methods: Array.isArray(old.methods) ? old.methods : [], methodRefs: Array.isArray(old.methodRefs) ? old.methodRefs : [...(entry.methodRefs || [])], overrides: old.overrides || {}, reviewStatus: old.reviewStatus || entry.reviewStatus || 'draft', reviewedBy: Array.isArray(old.reviewedBy) ? old.reviewedBy : [...(entry.reviewedBy || [])] } }
function comparable(value) { const copy = JSON.parse(JSON.stringify(value)); delete copy.updatedAt; if (copy.arcaneAcquisition?.generated?.wiki?.wiki) delete copy.arcaneAcquisition.generated.wiki.wiki.compiledAt; return JSON.stringify(copy) }
function buildPlan(options = {}) {
  const filename = resolveWikiDatabase(options.db)
  const report = inspectWikiDatabase(filename, { skipHash: options.skipHash })
  if (!report.sha256 && !options.sourceSha256) throw new Error('编译赋能 Wiki 数据需要数据库 SHA-256')
  report.sha256 ||= options.sourceSha256
  const sourceDatabase = { sha256: report.sha256, size: report.size }
  const official = officialDirectory(options.items)
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  const categoryRows = db.prepare("SELECT p.page_id pageId,p.title,p.revision_id revisionId,p.timestamp,p.html FROM categories c JOIN pages p ON p.page_id=c.page_id WHERE c.category='Arcane_Enhancements' ORDER BY p.title").all()
  const selected = categoryRows.filter(page => official.has(page.title.toLowerCase())).filter(page => !options.canonical || page.title.toLowerCase() === options.canonical.toLowerCase())
  const existing = readEntries(options.arcaneRoot || ARCANE_ROOT)
  const byCanonical = new Map(existing.map(record => [String(record.entry.subject?.canonical || record.entry.title || '').toLowerCase(), record]))
  const expectedFiles = []; const unresolved = []; const filteredOut = categoryRows.filter(page => !official.has(page.title.toLowerCase())).map(page => page.title)
  try {
    for (const page of selected) {
      const record = byCanonical.get(page.title.toLowerCase())
      if (!record) { unresolved.push({ arcane: page.title, kind: 'entry', canonical: page.title, reason: '官方赋能存在，但本地 arcane entry 尚未生成', pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId }); continue }
      const oldWiki = record.entry.arcaneAcquisition?.generated?.wiki
      const sameSource = oldWiki?.wiki?.revisionId === page.revisionId && oldWiki?.wiki?.sourceDatabase?.sha256 === report.sha256
      const compiledAt = sameSource ? oldWiki.wiki.compiledAt : (options.compiledAt || new Date().toISOString())
      const wiki = compileArcaneWikiPage(page, sourceDatabase, compiledAt)
      wiki.unresolved.forEach(item => unresolved.push({ arcane: page.title, ...item }))
      const next = JSON.parse(JSON.stringify(record.entry))
      next.arcaneAcquisition = { generated: { ...(next.arcaneAcquisition?.generated || {}), wiki }, manual: mergeManual(next) }
      if (next.reviewStatus !== 'approved') next.reviewStatus = wiki.status === 'complete' ? 'draft' : 'review-required'
      if (!next.acquisitionStatus) next.acquisitionStatus = wiki.status
      if (comparable(next) !== comparable(record.entry)) next.updatedAt = options.today || new Date().toISOString().slice(0, 10)
      const value = JSON.parse(JSON.stringify(record.value)); (Array.isArray(value) ? value : [value])[record.index] = next
      const output = Array.isArray(value) ? value : next
      expectedFiles.push({ file: record.file, current: record.raw, content: serialize(output) })
    }
  } finally { db.close() }
  const counts = { categoryRows: categoryRows.length, officialDirectory: official.size, selected: selected.length, filteredOut: filteredOut.length, missingEntries: unresolved.filter(item => item.kind === 'entry').length, changed: expectedFiles.filter(item => item.current !== item.content).length, unresolved: unresolved.length }
  return { report, counts, filteredOut, unresolved, expectedFiles }
}
function run(argv = process.argv.slice(2)) {
  const plan = buildPlan({ db: argument(argv, '--db') || process.env.WF_WIKI_DB, canonical: argument(argv, '--canonical') })
  console.log(`arcane-category=${plan.counts.categoryRows} official=${plan.counts.officialDirectory} selected=${plan.counts.selected} filtered=${plan.counts.filteredOut} missing-entry=${plan.counts.missingEntries} unresolved=${plan.counts.unresolved} changed=${plan.counts.changed}`)
  if (argv.includes('--check')) { if (plan.counts.changed) throw new Error(`赋能 Wiki 编译数据已漂移：${plan.counts.changed} 个文件`); console.log('arcane-wiki-in-sync'); return plan }
  if (argv.includes('--dry-run')) return plan
  for (const update of plan.expectedFiles.filter(item => item.current !== item.content)) fs.writeFileSync(update.file, update.content)
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true }); fs.writeFileSync(REPORT_PATH, serialize({ generatedAt: new Date().toISOString(), sourceDatabase: { sha256: plan.report.sha256, size: plan.report.size }, counts: plan.counts, filteredCategoryPages: plan.filteredOut, entries: plan.unresolved }))
  return plan
}
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { ARCANE_ROOT, REPORT_PATH, buildPlan, comparable, mergeManual, officialDirectory, run }
