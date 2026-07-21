'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { resolveWikiDatabase, inspectWikiDatabase } = require('../src/wiki-db')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'generated', 'current-version-coverage.json')
const IMAGE_TARGET = path.join(ROOT, 'generated', 'recent-mod-image-requirements.json')
const RECENT_MOD_EXPECTATIONS = path.join(ROOT, 'knowledge', 'supplemental', 'current-mod-identities.json')
const START_UPDATE = 40
const RECENT_MOD_START_UPDATE = 38.5
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
function loadImageEvidence(filename) {
  if (!filename) return new Map()
  const value = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'))
  const items = value.ledger || value.items || []
  return new Map(items.map(item => [normalize(item.canonical), item]))
}
function loadRecentModExpectations(filename = RECENT_MOD_EXPECTATIONS) {
  const document = JSON.parse(fs.readFileSync(filename, 'utf8'))
  return (document.items || []).map(item => ({
    canonical: item.canonical,
    uniqueName: item.uniqueName,
    introduced: Number(item.introduced)
  }))
}
function buildImageRequirements(ledger, evidence = new Map()) {
  const items = ledger.map(item => {
    const actual = evidence.get(normalize(item.canonical)) || {}
    const status = field => actual[field] === true ? 'approved' : 'missing'
    const production = ['source', 'localized', 'manifest', 'resolver'].every(field => status(field) === 'approved')
    return {
      canonical: item.canonical,
      displayName: item.displayName,
      uniqueName: item.uniqueName,
      introduced: item.introduced,
      version: `Update ${item.introduced}`,
      sourceRequirement: {
        kind: 'full-mod-card',
        variant: 'standard',
        canonical: item.canonical,
        displayName: item.displayName,
        uniqueName: item.uniqueName
      },
      sourceStatus: status('source'),
      localizationStatus: status('localized'),
      manifestStatus: status('manifest'),
      resolverStatus: status('resolver'),
      reviewStatus: production ? 'approved' : 'pending',
      productionStatus: production ? 'approved' : 'missing'
    }
  })
  const count = field => items.filter(item => item[field] === 'approved').length
  return {
    schemaVersion: 1,
    status: items.every(item => item.productionStatus === 'approved') ? 'complete' : 'pending-stage-2',
    counts: {
      expected: items.length,
      source: count('sourceStatus'),
      localized: count('localizationStatus'),
      manifest: count('manifestStatus'),
      resolver: count('resolverStatus'),
      production: count('productionStatus')
    },
    ledger: items
  }
}
function currentPages(db, spec, startUpdate = START_UPDATE) {
  return db.prepare('SELECT p.title,p.page_id pageId,p.revision_id revisionId,p.timestamp,p.text FROM categories c JOIN pages p ON p.page_id=c.page_id WHERE c.category=? ORDER BY p.title').all(spec.wikiCategory)
    .map(page => ({ ...page, introduced: introduced(page.text) }))
    .filter(page => Number(page.introduced) >= startUpdate && !spec.exclusions.some(pattern => pattern.test(page.title)))
}
function loadPublished() {
  const { loadData, readObjectDirectory } = require('../src/loader')
  const data = loadData(ROOT, { approvedOnly: false })
  const names = values => new Set(values.flatMap(value => [value.subject?.canonical, value.subject?.displayName, value.canonical, value.displayName]).map(normalize).filter(Boolean))
  const runtimeMods = (data.knowledge || []).filter(entry => entry.subject?.category === 'mod')
  return {
    weapons: names(data.weapons || []),
    mods: names(runtimeMods),
    runtimeMods,
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
      const pages = currentPages(db, spec, domain === 'mods' ? RECENT_MOD_START_UPDATE : START_UPDATE)
      const excluded = pages.filter(page => EXPLICIT_EXCLUSIONS[domain].has(page.title))
      const candidates = pages.filter(page => !EXPLICIT_EXCLUSIONS[domain].has(page.title))
      const missing = candidates.filter(page => !published[domain]?.has(normalize(page.title))).map(({ text, ...page }) => page)
      categories[domain] = { wikiCategory: spec.wikiCategory, pages: pages.length, candidates: candidates.length, excluded: excluded.map(page => ({ title: page.title, reason: domain === 'mods' && !/Mods$/i.test(page.title) ? 'stance-combo-name-not-mod-item' : 'explicit-non-query-object' })), missing }
    }
    const runtimeMods = published.runtimeMods || []
    const byCanonical = new Map(runtimeMods.map(entry => [normalize(entry.subject?.canonical), entry]))
    const recentModPages = new Map(currentPages(db, CATEGORY_SPECS.mods, RECENT_MOD_START_UPDATE)
      .filter(page => !EXPLICIT_EXCLUSIONS.mods.has(page.title))
      .map(page => [normalize(page.title), page]))
    const expectedMods = options.expectedMods || loadRecentModExpectations()
    const ledger = expectedMods.map(expected => {
      const { text, ...page } = recentModPages.get(normalize(expected.canonical)) || {}
      const entry = byCanonical.get(normalize(expected.canonical))
      const uniqueName = entry?.officialUniqueName || entry?.subject?.officialUniqueName || null
      const methods = [
        ...(entry?.modAcquisition?.generated?.wiki?.methods || []),
        ...(entry?.modAcquisition?.generated?.officialDrops || []),
        ...(entry?.modAcquisition?.manual?.methods || [])
      ]
      return {
        ...page,
        canonical: expected.canonical,
        introduced: expected.introduced,
        expectedUniqueName: expected.uniqueName,
        externalExpected: true,
        versionEvidence: page.title ? 'official-wiki-category' : 'identity-ledger-only',
        displayName: entry?.subject?.displayName || null,
        uniqueName,
        runtime: Boolean(entry),
        approved: entry?.reviewStatus === 'approved',
        acquisitionComplete: methods.length > 0 && entry?.acquisitionStatus === 'complete',
        methodCount: methods.length,
        identityOfficial: uniqueName === expected.uniqueName
      }
    })
    const summarize = items => ({
      expected: items.length,
      runtime: items.filter(item => item.runtime).length,
      approved: items.filter(item => item.approved).length,
      acquisitionComplete: items.filter(item => item.acquisitionComplete).length,
      officialIdentity: items.filter(item => item.identityOfficial).length
    })
    const recent = summarize(ledger)
    const update40 = summarize(ledger.filter(item => Number(item.introduced) >= START_UPDATE))
    const imageChain = buildImageRequirements(ledger, options.imageEvidence || new Map())
    return {
      schemaVersion: 3,
      generatedAt: new Date().toISOString(),
      startUpdate: START_UPDATE,
      recentModStartUpdate: RECENT_MOD_START_UPDATE,
      recentModExpectationSource: path.relative(ROOT, RECENT_MOD_EXPECTATIONS).replace(/\\/g, '/'),
      sourceDatabase: { sha256: database.sha256, size: database.size, latestSync: database.syncState['incremental.last_run'] || null },
      categories,
      recentMods: { counts: recent, ledger },
      update40Mods: { counts: update40 },
      imageChain,
      counts: { candidates: Object.values(categories).reduce((n, item) => n + item.candidates, 0), missing: Object.values(categories).reduce((n, item) => n + item.missing.length, 0) }
    }
  } finally { db.close() }
}
function strictFailures(report, options = {}) {
  const qualityMissing = report.recentMods.ledger.filter(item => !item.runtime || !item.approved || !item.acquisitionComplete || !item.identityOfficial)
  return {
    published: report.counts.missing,
    recentModQuality: qualityMissing.length,
    images: options.images ? report.imageChain.counts.expected - report.imageChain.counts.production : 0
  }
}
function run(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--db'), db = index >= 0 ? argv[index + 1] : process.env.WF_WIKI_DB
  const imageIndex = argv.indexOf('--image-evidence')
  const strict = argv.includes('--strict'), strictImages = argv.includes('--strict-images'), check = argv.includes('--check')
  const report = buildReport({ db, skipHash: false, imageEvidence: loadImageEvidence(imageIndex >= 0 ? argv[imageIndex + 1] : null) })
  const imageRequirements = { ...report.imageChain, sourceDatabase: report.sourceDatabase }
  const stable = value => ({ ...value, generatedAt: '<ignored>' })
  if (check) {
    if (!fs.existsSync(TARGET) || serialize(stable(JSON.parse(fs.readFileSync(TARGET, 'utf8')))) !== serialize(stable(report))) throw new Error('当前版本覆盖报告已漂移')
    if (!fs.existsSync(IMAGE_TARGET) || serialize(JSON.parse(fs.readFileSync(IMAGE_TARGET, 'utf8'))) !== serialize(imageRequirements)) throw new Error('近期 Mod 图片需求清单已漂移')
  } else {
    fs.mkdirSync(path.dirname(TARGET), { recursive: true })
    fs.writeFileSync(TARGET, serialize(report))
    fs.writeFileSync(IMAGE_TARGET, serialize(imageRequirements))
  }
  console.log(`更新 ${START_UPDATE}+ 跨源覆盖：${report.counts.candidates} 个候选，${report.counts.missing} 个缺口；近期 Mod 运行时 ${report.recentMods.counts.runtime}/${report.recentMods.counts.expected}`)
  console.log(`近期 Mod 图片链：生产 ${report.imageChain.counts.production}/${report.imageChain.counts.expected}（${report.imageChain.status}）`)
  for (const [domain, item] of Object.entries(report.categories)) if (item.missing.length) console.log(`${domain}: ${item.missing.map(value => `${value.title}@${value.introduced}`).join('、')}`)
  const failures = strictFailures(report, { images: strictImages })
  if (strict && (failures.published || failures.recentModQuality)) throw new Error(`当前版本仍有 ${failures.published} 个未发布对象、${failures.recentModQuality} 个近期 Mod 质量缺口`)
  if (strictImages && failures.images) throw new Error(`近期 Mod 图片链仍有 ${failures.images} 项未进入生产`)
  return report
}
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { START_UPDATE, RECENT_MOD_START_UPDATE, CATEGORY_SPECS, EXPLICIT_EXCLUSIONS, IMAGE_TARGET, RECENT_MOD_EXPECTATIONS, normalize, introduced, loadImageEvidence, loadRecentModExpectations, buildImageRequirements, currentPages, loadPublished, buildReport, strictFailures, run }
