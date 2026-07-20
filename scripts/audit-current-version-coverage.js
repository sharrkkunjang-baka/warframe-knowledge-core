'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { resolveWikiDatabase, inspectWikiDatabase } = require('../src/wiki-db')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'generated', 'current-version-coverage.json')
const START_UPDATE = 40
const CATEGORY_SPECS = Object.freeze({
  weapons: { wikiCategory: 'Weapons', exclusions: [/\bSkin$/i, /\bArtifact$/i] },
  mods: { wikiCategory: 'Mods', exclusions: [/\bMods$/i] },
  arcanes: { wikiCategory: 'Arcane_Enhancements', exclusions: [] },
  resources: { wikiCategory: 'Resources', exclusions: [] },
  warframes: { wikiCategory: 'Warframes', exclusions: [/\/Main$/i, /\/Prime$/i, /\/Abilities(?:\/Passive)?$/i, /^(?:Warframes|Warframes Comparison|Warframe Cosmetics|Passives|Helmet|Blueprints\/Warframe|Ultimate Warframe Pack)$/i] },
  consumables: { wikiCategory: 'Gear', exclusions: [] }
})
const EXPLICIT_EXCLUSIONS = Object.freeze({
  weapons: new Set(['Tektolyst Artifact']),
  mods: new Set(),
  arcanes: new Set(['Arcane Enhancement', 'Vosfor']),
  resources: new Set(), warframes: new Set(), consumables: new Set()
})
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
function normalize(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '') }
function introduced(text) { return String(text || '').match(/Introduced(?:\s+Update)?\s+(\d+(?:\.\d+)?)/i)?.[1] || null }
function currentPages(db, spec) {
  return db.prepare('SELECT p.title,p.page_id pageId,p.revision_id revisionId,p.timestamp,p.text FROM categories c JOIN pages p ON p.page_id=c.page_id WHERE c.category=? ORDER BY p.title').all(spec.wikiCategory)
    .map(page => ({ ...page, introduced: introduced(page.text) }))
    .filter(page => Number(page.introduced) >= START_UPDATE && !spec.exclusions.some(pattern => pattern.test(page.title)))
}
function loadPublished() {
  const { loadData, readObjectDirectory } = require('../src/loader')
  const data = loadData(ROOT, { approvedOnly: false })
  const names = values => new Set(values.flatMap(value => [value.subject?.canonical, value.subject?.displayName, value.canonical, value.displayName]).map(normalize).filter(Boolean))
  return {
    weapons: names(data.weapons || []),
    mods: names([...(data.officialCatalog?.mods || []), ...readObjectDirectory(path.join(ROOT, 'knowledge', 'acquisition', 'mod')).filter(entry => entry.subject?.category === 'mod')]),
    arcanes: names(data.arcanes || []),
    resources: names(readObjectDirectory(path.join(ROOT, 'knowledge', 'acquisition', 'resource', 'entries')).filter(entry => entry.subject?.category === 'resource')),
    warframes: names((data.knowledge || []).filter(entry => entry.subject?.category === 'frame')),
    consumables: names(data.consumables || [])
  }
}
function buildReport(options = {}) {
  const filename = resolveWikiDatabase(options.db)
  const database = inspectWikiDatabase(filename, { skipHash: options.skipHash })
  const published = options.published || loadPublished()
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    const categories = {}
    for (const [domain, spec] of Object.entries(CATEGORY_SPECS)) {
      const pages = currentPages(db, spec)
      const excluded = pages.filter(page => EXPLICIT_EXCLUSIONS[domain].has(page.title))
      const candidates = pages.filter(page => !EXPLICIT_EXCLUSIONS[domain].has(page.title))
      const missing = candidates.filter(page => !published[domain]?.has(normalize(page.title))).map(({ text, ...page }) => page)
      categories[domain] = { wikiCategory: spec.wikiCategory, pages: pages.length, candidates: candidates.length, excluded: excluded.map(page => ({ title: page.title, reason: domain === 'mods' && !/Mods$/i.test(page.title) ? 'stance-combo-name-not-mod-item' : 'explicit-non-query-object' })), missing }
    }
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), startUpdate: START_UPDATE, sourceDatabase: { sha256: database.sha256, size: database.size, latestSync: database.syncState['incremental.last_run'] || null }, categories, counts: { candidates: Object.values(categories).reduce((n, item) => n + item.candidates, 0), missing: Object.values(categories).reduce((n, item) => n + item.missing.length, 0) } }
  } finally { db.close() }
}
function run(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--db'), db = index >= 0 ? argv[index + 1] : process.env.WF_WIKI_DB
  const strict = argv.includes('--strict'), check = argv.includes('--check')
  const report = buildReport({ db, skipHash: false })
  const stable = value => ({ ...value, generatedAt: '<ignored>' })
  if (check) {
    if (!fs.existsSync(TARGET) || serialize(stable(JSON.parse(fs.readFileSync(TARGET, 'utf8')))) !== serialize(stable(report))) throw new Error('当前版本覆盖报告已漂移')
  } else { fs.mkdirSync(path.dirname(TARGET), { recursive: true }); fs.writeFileSync(TARGET, serialize(report)) }
  console.log(`更新 ${START_UPDATE}+ 跨源覆盖：${report.counts.candidates} 个候选，${report.counts.missing} 个缺口`)
  for (const [domain, item] of Object.entries(report.categories)) if (item.missing.length) console.log(`${domain}: ${item.missing.map(value => `${value.title}@${value.introduced}`).join('、')}`)
  if (strict && report.counts.missing) throw new Error(`当前版本仍有 ${report.counts.missing} 个未发布对象`)
  return report
}
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { START_UPDATE, CATEGORY_SPECS, EXPLICIT_EXCLUSIONS, normalize, introduced, currentPages, loadPublished, buildReport, run }
