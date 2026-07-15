'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { inspectWikiDatabase, ReadonlyWikiDatabase, resolveWikiDatabase } = require('../src/wiki-db')
const { compileModWikiPage } = require('../src/mod-wiki-compiler')
const { migrateManualModData } = require('../src/mod-entry-builder')
const { readAcquisitionRecords, serialize } = require('./sync-mods')

const ROOT = path.resolve(__dirname, '..')
const ACQUISITION_DIR = path.join(ROOT, 'knowledge', 'acquisition')
const REPORT_PATH = path.join(ROOT, 'generated', 'mod-wiki-unresolved.json')

function argument(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : null
}
function comparable(value) {
  const copy = JSON.parse(JSON.stringify(value))
  if (copy?.modAcquisition?.generated?.wiki?.wiki) delete copy.modAcquisition.generated.wiki.wiki.compiledAt
  delete copy.updatedAt
  return JSON.stringify(copy)
}
function sourceInfo(report) { return { sha256: report.sha256, size: report.size } }
function sameWikiSource(oldWiki, report, page) {
  return oldWiki?.wiki?.revisionId === page.revisionId && oldWiki?.wiki?.sourceDatabase?.sha256 === report.sha256
}
function buildPlan(options = {}) {
  const filename = resolveWikiDatabase(options.db)
  const report = inspectWikiDatabase(filename, { skipHash: options.skipHash })
  if (!report.sha256 && !options.sourceSha256) throw new Error('编译 Wiki 数据需要数据库 SHA-256')
  if (!report.sha256) report.sha256 = options.sourceSha256
  const database = new ReadonlyWikiDatabase(filename)
  const records = readAcquisitionRecords(options.acquisitionDirectory || ACQUISITION_DIR)
    .filter(record => record.entry.subject?.category === 'mod')
    .filter(record => !options.canonical || record.entry.subject?.canonical === options.canonical)
    .slice(0, options.limit || Infinity)
  const updates = new Map()
  const unresolved = []
  const counts = { selected: records.length, pages: 0, compiled: 0, missing: 0, changed: 0, complete: 0, partial: 0, unresolved: 0 }
  try {
    for (const record of records) {
      const entry = record.entry
      const canonical = entry.subject.canonical
      const page = database.getPage(canonical)
      let generatedWiki
      if (!page) {
        counts.missing += 1
        generatedWiki = { wiki: null, methods: [], evidence: [], mechanicsEvidence: { status: 'draft', notes: [], usage: [] }, unresolvedEntities: [{ kind: 'wiki-page', canonical }], status: 'unresolved' }
      } else {
        counts.pages += 1
        const oldWiki = entry.modAcquisition?.generated?.wiki
        const compiledAt = sameWikiSource(oldWiki, report, page) ? oldWiki.wiki.compiledAt : (options.compiledAt || new Date().toISOString())
        generatedWiki = compileModWikiPage(page, sourceInfo(report), compiledAt)
        counts.compiled += 1
      }
      const maintainedMethods = (entry.modAcquisition?.generated?.wiki?.methods || []).filter(method => method.type === 'syndicate-exchange' || method.provenance?.source === 'local-wiki-sqlite')
      if (maintainedMethods.length) {
        const maintainedKeys = new Set(maintainedMethods.map(method => `${method.type}\0${method.sourceCanonical || method.sourceEntityId || (method.factionIds || []).join(',')}`))
        generatedWiki.methods = [...maintainedMethods, ...(generatedWiki.methods || []).filter(method => !maintainedKeys.has(`${method.type}\0${method.sourceCanonical || method.sourceEntityId || (method.factionIds || []).join(',')}`))]
        if (generatedWiki.status === 'unresolved') generatedWiki.status = 'complete'
      }
      counts[generatedWiki.status] += 1
      for (const item of generatedWiki.unresolvedEntities || []) unresolved.push({ mod: canonical, ...item, pageTitle: generatedWiki.wiki?.pageTitle || null, revisionId: generatedWiki.wiki?.revisionId || null })
      const nextEntry = JSON.parse(JSON.stringify(entry))
      nextEntry.modAcquisition = {
        generated: { ...(entry.modAcquisition?.generated || {}), wiki: generatedWiki },
        manual: migrateManualModData(entry)
      }
      if (nextEntry.reviewStatus !== 'approved') nextEntry.acquisitionStatus = generatedWiki.status === 'unresolved' ? 'stub' : generatedWiki.status
      if (!nextEntry.modAcquisition.generated.identity) {
        nextEntry.modAcquisition.generated.identity = {
          officialUniqueName: entry.officialUniqueName || entry.subject?.officialUniqueName,
          canonical,
          displayName: entry.subject.displayName,
          maxRank: entry.maxRank
        }
      }
      if (comparable(entry) !== comparable(nextEntry)) nextEntry.updatedAt = options.today || new Date().toISOString().slice(0, 10)
      const update = updates.get(record.file) || { file: record.file, value: JSON.parse(JSON.stringify(record.value)), current: record.raw }
      const values = Array.isArray(update.value) ? update.value : [update.value]
      values[record.index] = nextEntry
      update.value = Array.isArray(update.value) ? values : values[0]
      updates.set(record.file, update)
    }
  } finally { database.close() }
  const expectedFiles = [...updates.values()].map(update => ({ ...update, content: serialize(update.value) }))
  counts.changed = expectedFiles.filter(update => update.current !== update.content).length
  return { report, counts, unresolved, expectedFiles }
}

function printPlan(plan) {
  const c = plan.counts
  console.log(`wiki-db=${plan.report.filename}`)
  console.log(`quick-check=${plan.report.quickCheck} sha256=${plan.report.sha256} pages=${plan.report.counts.pages} sections=${plan.report.counts.sections}`)
  console.log(`selected=${c.selected} pages=${c.pages} compiled=${c.compiled} missing=${c.missing} complete=${c.complete} partial=${c.partial} unresolved=${c.unresolved} changed=${c.changed}`)
}
function run(argv = process.argv.slice(2)) {
  const db = argument(argv, '--db') || process.env.WF_WIKI_DB
  const check = argv.includes('--check')
  const dryRun = argv.includes('--dry-run')
  const canonical = argument(argv, '--canonical')
  const limitValue = argument(argv, '--limit')
  const limit = limitValue == null ? null : Number(limitValue)
  if (limitValue != null && (!Number.isInteger(limit) || limit < 1)) throw new Error('--limit 必须是正整数')
  const plan = buildPlan({ db, canonical, limit })
  printPlan(plan)
  if (argv.includes('--report-unresolved')) console.log(JSON.stringify(plan.unresolved, null, 2))
  if (check) {
    if (plan.counts.changed) throw new Error(`Mod Wiki 编译数据已漂移：${plan.counts.changed} 个文件`)
    console.log('mod-wiki-in-sync')
    return plan
  }
  if (dryRun) { console.log(`dry-run updates=${plan.counts.changed}`); return plan }
  for (const update of plan.expectedFiles.filter(item => item.current !== item.content)) fs.writeFileSync(update.file, update.content)
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, serialize({ generatedAt: new Date().toISOString(), sourceDatabase: sourceInfo(plan.report), count: plan.unresolved.length, entries: plan.unresolved }))
  console.log(`created-or-updated=${plan.counts.changed} unresolved-report=${REPORT_PATH}`)
  return plan
}

if (require.main === module) {
  try { run() } catch (error) { console.error(error.stack || error); process.exit(1) }
}
module.exports = { REPORT_PATH, buildPlan, comparable, run, sameWikiSource }
