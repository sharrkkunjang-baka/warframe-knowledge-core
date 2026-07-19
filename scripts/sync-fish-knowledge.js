'use strict'
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const ROOT = path.resolve(__dirname, '..')
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const FISH_PATH = path.join(ITEMS_ROOT, 'data', 'json', 'Fish.json')
const I18N_PATH = path.join(ITEMS_ROOT, 'data', 'json', 'i18n.json')
const DB_PATH = path.join(ROOT, '.cache', 'warframe-wiki.sqlite')
const OUTPUT = path.join(ROOT, 'knowledge', 'supplemental', 'fish-items.json')

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function uniqueFishName(item) { return item.name }
function pageText(db, name) {
  const exact = db.prepare('select text from pages where title = ? collate nocase').get(name)
  return exact?.text || ''
}
function match(text, pattern) { return (String(text).match(pattern) || [])[1]?.trim() || null }
function parseProfile(text) {
  return {
    biome: match(text, /(?:•\s*)?Biome:\s*([^\n•]+)/i),
    activity: match(text, /(?:•\s*)?Activity:\s*([^\n•]+)/i),
    bait: match(text, /(?:•\s*)?([^\n•]+?)\s+Bait\s+needed\./i),
    effectiveSpears: match(text, /(?:•\s*)?Effective Spears:\s*([^\n•]+)/i),
    maximumWeight: match(text, /(?:•\s*)?Maximum Weight:\s*([^\n•]+)/i),
    maximumPoint: match(text, /(?:•\s*)?Maximum Point:\s*([^\n•]+)/i),
    rarity: match(text, /(?:•\s*)?Rarity:\s*([^\n•]+)/i)
  }
}
function fishEntry(item, i18n, db) {
  const localized = i18n[item.uniqueName]?.zh || {}
  const text = pageText(db, item.name)
  const profile = parseProfile(text)
  const base = {
    uniqueName: item.uniqueName.replace(/(?:Small|Medium|Large)$/, ''),
    canonical: item.name,
    displayName: localized.name || item.name,
    localizationStatus: localized.name ? 'official-zh' : 'fallback-en',
    aliases: localized.name && localized.name !== item.name ? [localized.name] : [],
    kind: 'fish',
    semanticKinds: ['fish'],
    description: { canonical: item.description || '', display: localized.description || item.description || '' },
    tradable: Boolean(item.tradable),
    drops: item.drops || [],
    recipes: [], recipeVariants: [], buildQuantity: 1,
    sourceCategory: 'Fish', sourceFile: 'Fish.json',
    fishProfile: { ...profile, wikiPage: text ? item.name : null, dataStatus: text ? 'complete' : 'review-required' },
    reviewStatus: text ? 'approved' : 'review-required',
    reviewedBy: 'local-wiki-sqlite + official-localization'
  }
  return base
}
function run() {
  const fish = readJson(FISH_PATH), i18n = readJson(I18N_PATH)
  const db = fs.existsSync(DB_PATH) ? new Database(DB_PATH, { readonly: true }) : null
  const byName = new Map()
  for (const item of fish) if (!byName.has(uniqueFishName(item))) byName.set(uniqueFishName(item), fishEntry(item, i18n, db))
  db?.close()
  const current = fs.existsSync(OUTPUT) ? readJson(OUTPUT) : []
  const nonFish = current.filter(item => !item.semanticKinds?.includes('fish') || item.sourceCategory !== 'Fish')
  const output = [...nonFish, ...[...byName.values()].sort((a, b) => a.canonical.localeCompare(b.canonical))]
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`已同步鱼类：${byName.size} 种；Wiki完整 ${[...byName.values()].filter(x => x.reviewStatus === 'approved').length} 种；待审 ${[...byName.values()].filter(x => x.reviewStatus !== 'approved').length} 种`)
  return output
}
if (require.main === module) run()
module.exports = { parseProfile, fishEntry, run }
