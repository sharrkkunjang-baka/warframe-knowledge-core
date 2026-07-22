'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const ROOT = path.resolve(__dirname, '..')
const OFFICIAL_ITEMS = path.join(ROOT, 'knowledge', 'generated', 'official-items.json')
const OUTPUT = path.join(ROOT, 'generated', 'item-display-asset-catalog.json')
const WIKI_DB = path.join(ROOT, '.cache', 'warframe-wiki.sqlite')
const EQUIPMENT_KINDS = new Set(['arcane'])
const DISPLAY_ROLE = 'item-display'

function readJson(filename) { return JSON.parse(fs.readFileSync(filename, 'utf8')) }
function normalize(value) { return String(value || '').trim().toLocaleLowerCase('en-US') }
function primaryCategory(item) {
  const order = ['ayatan','archon-shard','fish','fish-part','fish-bait','mineral','plant','conservation-tag','focus-lens','currency','currency-token','currency-token-material','consumable','gear','key','upgrade-item','material-or-usable','material','resource']
  return order.find(kind => item.semanticKinds.includes(kind)) || 'other-item'
}
function wikiDirectory(filename = WIKI_DB) {
  if (!fs.existsSync(filename)) return { available: false, byTitle: new Map(), metadata: null }
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    const rows = db.prepare('SELECT page_id pageId,title,revision_id revisionId FROM pages').all()
    return { available: true, byTitle: new Map(rows.map(row => [normalize(row.title), row])), metadata: { path: path.relative(ROOT, filename).replace(/\\/g, '/'), pageCount: rows.length } }
  } finally { db.close() }
}
function buildCatalog(options = {}) {
  const source = readJson(OFFICIAL_ITEMS)
  const wiki = wikiDirectory(options.wikiDb || WIKI_DB)
  const entries = source.items
    .filter(item => !item.semanticKinds.some(kind => EQUIPMENT_KINDS.has(kind)))
    .map(item => {
      const page = wiki.byTitle.get(normalize(item.canonical)) || null
      return {
        stableIdentity: { kind: 'item', uniqueName: item.uniqueName, canonical: item.canonical, displayName: item.displayName },
        aliases: item.aliases || [],
        category: primaryCategory(item),
        semanticKinds: item.semanticKinds,
        requiredAssetRole: DISPLAY_ROLE,
        presentation: 'display',
        currentWikiDirectory: page ? { pageId: page.pageId, title: page.title, revisionId: page.revisionId } : null,
        directoryStatus: page ? 'current-wiki-listed' : 'browser-verification-required'
      }
    })
    .sort((a,b) => a.stableIdentity.uniqueName.localeCompare(b.stableIdentity.uniqueName))
  const byCategory = {}
  for (const entry of entries) byCategory[entry.category] = (byCategory[entry.category] || 0) + 1
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    scope: {
      claim: 'all published non-equipment items requiring user-visible display assets',
      excludedIndependentGates: ['arcane', 'weapon', 'warframe', 'mod', 'ability'],
      assetRole: DISPLAY_ROLE,
      sourcePolicy: { currentWiki: 'https://wiki.warframe.com', legacyFallbackAllowed: false }
    },
    sourceMetadata: { officialItemsGeneratedAt: source.generatedAt, wikiDirectory: wiki.metadata },
    totals: { items: entries.length, byCategory },
    entries
  }
}
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  const current = fs.existsSync(OUTPUT) ? readJson(OUTPUT) : null
  const catalog = buildCatalog({ generatedAt: check && current?.generatedAt ? current.generatedAt : undefined })
  if (check) {
    if (serialize(current) !== serialize(catalog)) throw new Error('全道具展示资产目录已漂移')
    console.log(`全道具展示资产目录无漂移：${catalog.totals.items} 个已发布道具`)
    return catalog
  }
  fs.writeFileSync(OUTPUT, serialize(catalog))
  console.log(JSON.stringify({ output: OUTPUT, totals: catalog.totals }))
  return catalog
}
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { DISPLAY_ROLE, EQUIPMENT_KINDS, buildCatalog, primaryCategory, run }
