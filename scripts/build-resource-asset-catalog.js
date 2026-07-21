'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const ROOT = path.resolve(__dirname, '..')
const OUTPUT = path.join(ROOT, 'generated', 'resource-asset-catalog.json')
const WIKI_DB = path.join(ROOT, '.cache', 'warframe-wiki.sqlite')
const OFFICIAL_ITEMS = path.join(ROOT, 'knowledge', 'generated', 'official-items.json')
const packageRoot = path.dirname(require.resolve('warframe-items'))
const dataRoot = path.join(packageRoot, 'data', 'json')

const ASSET_SEMANTIC_KINDS = new Set([
  'resource', 'material', 'material-or-usable', 'mineral', 'plant', 'fish-part',
  'fish-bait', 'currency', 'currency-token', 'currency-token-material',
  'conservation-tag', 'upgrade-item', 'key'
])

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'))
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US')
}

function worldFromUniqueName(uniqueName) {
  const value = String(uniqueName || '')
  if (/(?:\/Eidolon\/|\/Ostron\/)/i.test(value)) return 'plains-of-eidolon'
  if (/(?:\/Solaris\/|\/Venus\/Landscape\/)/i.test(value)) return 'orb-vallis'
  if (/(?:\/Deimos\/|\/Entrati\/)/i.test(value)) return 'cambion-drift'
  if (/\/Duviri\//i.test(value)) return 'duviri'
  return null
}

function mineralStage(raw) {
  if (!raw) return 'review-required'
  if (raw.type === 'Cut Gem') return 'cut'
  if (raw.type === 'Alloy') return 'refined'
  if (raw.type === 'Gem') {
    if (/(?:Alloy|Cut|Polished)Item$/i.test(raw.uniqueName || '')) return 'refined'
    return 'raw'
  }
  return 'review-required'
}

function categoryFor(item, raw) {
  const kinds = new Set(item.semanticKinds || [])
  if (kinds.has('fish')) return /Boot/i.test(`${item.uniqueName} ${item.canonical}`) ? 'review-required' : 'fish'
  if (kinds.has('fish-part')) return 'fish-part'
  if (kinds.has('mineral') || /\/Types\/Items\/Gems\//i.test(item.uniqueName || '')) {
    return mineralStage(raw) === 'raw' ? 'mineral-raw' : 'mineral-refined'
  }
  if (kinds.has('currency') || kinds.has('currency-token') || kinds.has('currency-token-material')) return 'token-or-currency'
  if (kinds.has('plant')) return 'plant'
  if (kinds.has('fish-bait')) return 'fish-bait'
  return 'resource'
}

function wikiDirectory(filename = WIKI_DB) {
  if (!fs.existsSync(filename)) return { available: false, pages: new Set(), categoriesByPage: new Map(), metadata: null }
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    const pages = db.prepare('SELECT page_id pageId,title,revision_id revisionId FROM pages').all()
    const pageSet = new Set(pages.map(row => normalize(row.title)))
    const categoriesByPage = new Map()
    const columns = new Set(db.prepare('PRAGMA table_info(categories)').all().map(row => row.name))
    if (columns.has('page_id') && columns.has('category')) {
      for (const row of db.prepare('SELECT page_id pageId,category FROM categories').all()) {
        if (!categoriesByPage.has(row.pageId)) categoriesByPage.set(row.pageId, [])
        categoriesByPage.get(row.pageId).push(row.category)
      }
    }
    const byTitle = new Map(pages.map(row => [normalize(row.title), row]))
    return {
      available: true,
      pages: pageSet,
      categoriesByPage,
      byTitle,
      metadata: {
        path: path.relative(ROOT, filename).replace(/\\/g, '/'),
        pageCount: pages.length,
        categoryLinks: [...categoriesByPage.values()].reduce((sum, values) => sum + values.length, 0)
      }
    }
  } finally {
    db.close()
  }
}

function rawItemIndex() {
  const values = ['Resources', 'Gear', 'Misc', 'Fish']
    .flatMap(name => readJson(path.join(dataRoot, `${name}.json`)))
  return new Map(values.filter(item => item.uniqueName).map(item => [item.uniqueName, item]))
}

function baseFishUniqueName(uniqueName) {
  return String(uniqueName || '')
    .replace(/Item(?:Small|Medium|Large)$/, 'Item')
    .replace(/(?:Small|Medium|Large)Item$/, 'Item')
}

function exactFishRelations(item, fishCanonicals) {
  if (!(item.semanticKinds || []).includes('fish-part')) return []
  const text = `${item.description?.canonical || ''}\n${item.description?.display || ''}`
  return fishCanonicals.filter(name => new RegExp(`(?:^|[^A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^A-Za-z0-9])`, 'i').test(text))
}

function isAssetEntity(item) {
  return (item.semanticKinds || []).some(kind => ASSET_SEMANTIC_KINDS.has(kind))
}

function buildCatalog(options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString()
  const official = readJson(OFFICIAL_ITEMS)
  const fish = readJson(path.join(dataRoot, 'Fish.json'))
  const i18n = readJson(path.join(dataRoot, 'i18n.json'))
  const rawByUniqueName = rawItemIndex()
  const wiki = wikiDirectory(options.wikiDb || WIKI_DB)
  const fishGroups = new Map()
  for (const item of fish.filter(item => item.uniqueName && item.name && item.imageName)) {
    const baseUniqueName = baseFishUniqueName(item.uniqueName)
    if (!fishGroups.has(baseUniqueName) || item.uniqueName === baseUniqueName) {
      fishGroups.set(baseUniqueName, { ...item, baseUniqueName, variantUniqueNames: [] })
    }
  }
  for (const item of fish.filter(item => item.uniqueName)) {
    const baseUniqueName = baseFishUniqueName(item.uniqueName)
    const group = fishGroups.get(baseUniqueName)
    if (group) group.variantUniqueNames.push(item.uniqueName)
  }
  const fishEntities = [...fishGroups.values()].map(item => ({
    uniqueName: item.baseUniqueName,
    canonical: item.name,
    displayName: i18n[item.baseUniqueName]?.zh?.name || i18n[item.uniqueName]?.zh?.name || item.name,
    localizationStatus: i18n[item.baseUniqueName]?.zh?.name || i18n[item.uniqueName]?.zh?.name ? 'official-zh' : 'fallback-en',
    semanticKinds: ['fish'],
    sourceCategory: 'Fish',
    variantUniqueNames: item.variantUniqueNames.sort()
  }))
  const candidates = [...official.items.filter(isAssetEntity), ...fishEntities]
  const deduped = new Map(candidates.map(item => [item.uniqueName, item]))
  const fishCanonicals = fishEntities.map(item => item.canonical).sort((a, b) => b.length - a.length)
  const entries = [...deduped.values()].map(item => {
    const raw = rawByUniqueName.get(item.uniqueName)
    const page = wiki.byTitle?.get(normalize(item.canonical))
    const world = worldFromUniqueName(item.uniqueName)
    const category = categoryFor(item, raw)
    const reviewReasons = []
    if (category === 'review-required') reviewReasons.push('upstream-fish-type-is-not-a-fish-entity')
    if (!raw?.imageName) reviewReasons.push('public-export-imageName-missing')
    if (!page) reviewReasons.push('wiki-page-missing')
    if (['fish', 'mineral-raw', 'mineral-refined'].includes(category) && !world) reviewReasons.push('open-world-identity-unclassified')
    const relatedFishCanonicals = exactFishRelations(item, fishCanonicals)
    return {
      stableIdentity: {
        kind: 'resource',
        uniqueName: item.uniqueName,
        canonical: item.canonical,
        displayName: item.displayName
      },
      category,
      semanticKinds: item.semanticKinds || [],
      openWorld: world,
      processingStage: category.startsWith('mineral-') ? mineralStage(raw) : null,
      expectedMediaFilename: raw?.imageName || null,
      officialType: raw?.type || null,
      localizationStatus: item.localizationStatus,
      officialRelations: relatedFishCanonicals.length ? { sourceFishCanonicals: relatedFishCanonicals } : null,
      evidence: {
        publicExport: {
          sourceFile: `${item.sourceCategory || 'Fish'}.json`,
          uniqueName: item.uniqueName,
          imageName: raw?.imageName || null,
          variantUniqueNames: item.variantUniqueNames || null
        },
        wikiDirectory: page ? {
          pageId: page.pageId,
          title: page.title,
          revisionId: page.revisionId,
          categories: wiki.categoriesByPage.get(page.pageId) || []
        } : null
      },
      catalogStatus: reviewReasons.length ? 'review-required' : 'ready',
      reviewReasons
    }
  }).sort((a, b) => a.stableIdentity.uniqueName.localeCompare(b.stableIdentity.uniqueName))

  const categories = {}
  for (const entry of entries) {
    const stats = categories[entry.category] ||= { total: 0, ready: 0, reviewRequired: 0 }
    stats.total++
    if (entry.catalogStatus === 'ready') stats.ready++
    else stats.reviewRequired++
  }
  const openWorldScope = {}
  for (const world of ['plains-of-eidolon', 'orb-vallis', 'cambion-drift']) {
    const scoped = entries.filter(entry => entry.openWorld === world && ['fish', 'fish-part', 'mineral-raw', 'mineral-refined'].includes(entry.category))
    openWorldScope[world] = {
      total: scoped.length,
      fish: scoped.filter(entry => entry.category === 'fish').length,
      fishParts: scoped.filter(entry => entry.category === 'fish-part').length,
      rawMinerals: scoped.filter(entry => entry.category === 'mineral-raw').length,
      refinedMinerals: scoped.filter(entry => entry.category === 'mineral-refined').length
    }
  }
  return {
    schemaVersion: 1,
    generatedAt,
    scope: {
      claim: 'cross-source released resource asset directory; not the entire Warframe Wiki',
      sources: [
        'warframe-items Public Export categories and i18n (Languages.bin-derived)',
        'workspace .cache/warframe-wiki.sqlite current page/category directory',
        'knowledge/generated/official-items.json released resource directory',
        'generated/official-drop-table-index.json bounty/drop evidence boundary'
      ],
      includedSemanticKinds: [...ASSET_SEMANTIC_KINDS].sort(),
      ambiguityPolicy: 'stable uniqueName required; unclassified entities remain review-required'
    },
    sourceMetadata: {
      publicExportVersion: require(path.join(packageRoot, 'package.json')).version,
      wiki: wiki.metadata,
      officialItemsGeneratedAt: official.generatedAt,
      officialDropTableIndexPresent: fs.existsSync(path.join(ROOT, 'generated', 'official-drop-table-index.json'))
    },
    totals: {
      entities: entries.length,
      ready: entries.filter(entry => entry.catalogStatus === 'ready').length,
      reviewRequired: entries.filter(entry => entry.catalogStatus !== 'ready').length
    },
    categories,
    openWorldScope,
    entries
  }
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  const current = fs.existsSync(OUTPUT) ? readJson(OUTPUT) : null
  const catalog = buildCatalog({ generatedAt: check && current?.generatedAt ? current.generatedAt : undefined })
  if (check) {
    if (serialize(current) !== serialize(catalog)) throw new Error('资源资产目录已漂移')
    console.log(`资源资产目录无漂移：${catalog.totals.entities} 个稳定身份`)
    return catalog
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, serialize(catalog))
  console.log(JSON.stringify({ output: OUTPUT, totals: catalog.totals, categories: catalog.categories, openWorldScope: catalog.openWorldScope }))
  return catalog
}

if (require.main === module) {
  try { run() } catch (error) { console.error(error.stack || error); process.exit(1) }
}

module.exports = {
  ASSET_SEMANTIC_KINDS,
  baseFishUniqueName,
  buildCatalog,
  categoryFor,
  exactFishRelations,
  mineralStage,
  run,
  worldFromUniqueName
}
