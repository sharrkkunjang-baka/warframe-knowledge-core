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
const WIKI_EVIDENCE_PATH = path.join(ROOT, 'generated', 'acquisition-wiki-evidence.json')
const ASSET_CATALOG_PATH = path.join(ROOT, 'generated', 'resource-asset-catalog.json')
const NON_FISH_CATCHES = new Set(['Boot', 'Crewman’S Boot', "Crewman's Boot", 'Stocking'])

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function uniqueFishName(item) { return item.name }
function pageText(db, name) {
  if (!db) return ''
  const exact = db.prepare('select text from pages where title = ? collate nocase').get(name)
  return exact?.text || ''
}
function match(text, pattern) { return (String(text).match(pattern) || [])[1]?.trim() || null }
function labelled(text, label, following) {
  return match(text, new RegExp(`${label}:\\s*(.+?)(?=\\s+(?:${following.join('|')}):|\\s+[A-Z][A-Za-z-]*(?:\\s+[A-Z][A-Za-z-]*)*\\s+Bait\\s+(?:needed|recommended)\\.|\\s+(?:Small|Medium|Large|Farming spots|Trophy)\\b|$)`, 'i'))
}
function baitProfile(text) {
  const required = match(text, /\b([A-Z][A-Za-z-]*(?:\s+[A-Z][A-Za-z-]*)*\s+Bait)\s+needed\./i)
  if (required) return { status: 'required', name: required }
  const recommended = match(text, /\b([A-Z][A-Za-z-]*(?:\s+[A-Z][A-Za-z-]*)*\s+Bait)\s+recommended\./i)
  if (recommended) return { status: 'recommended', name: recommended }
  if (/\b(?:no bait (?:is )?required|without bait|does not require bait)\b/i.test(text)) return { status: 'not-required', name: null }
  return { status: 'review-required', name: null }
}
function field(value, provenance) {
  return { value: value || null, reviewStatus: value ? 'approved' : 'review-required', provenance: value ? provenance : null }
}
function displayBiome(value) {
  return String(value || '').replace(/Duviri pond \(Maw Feeding platform\)/gi, '双衍王境池塘·贪食圆喉平台').replace(/Cave/gi, '洞穴').replace(/Surface/gi, '地表').replace(/Lake/gi, '湖泊').replace(/Pond/gi, '池塘').replace(/River/gi, '河流').replace(/Ocean/gi, '海岸').replace(/hotspot/gi, '热点') || null
}
function displayActivity(value) {
  return String(value || '').replace(/Any Duviri mood/gi, '任意双衍王境心境').replace(/Cathemeral \(Day and Night time\)/gi, '昼夜均可').replace(/Diurnal \(Day time\)/gi, '白昼').replace(/Nocturnal \(Night time\)/gi, '夜晚').replace(/Warm weather/gi, '温暖').replace(/Cold weather/gi, '寒冷').replace(/Cold\/Warm weather/gi, '寒冷/温暖').replace(/Fass\s*\/\s*Vome/gi, 'Fass/Vome 主宰期') || null
}
const SPEAR_DISPLAY_NAMES = Object.freeze({ Lanzo: '兰佐鱼叉', Tulok: '图洛克鱼叉', Peram: '佩拉姆鱼叉', Spari: '弯刃鱼叉', Ebisu: '渔神鱼叉', Shockprod: '电冲刺鱼叉', Stunna: '震荡鱼叉' })
function spearProfile(value, provenance) {
  const canonicalNames = String(value || '').split(/[\/,，、]+/).map(name => name.trim()).filter(Boolean)
  return {
    status: canonicalNames.length ? 'required' : 'none',
    canonicalNames,
    displayNames: canonicalNames.map(name => SPEAR_DISPLAY_NAMES[name] || name),
    reviewStatus: 'approved',
    provenance: canonicalNames.length ? provenance : null
  }
}
function parseProfile(text) {
  const following = ['Biome', 'Activity', 'Effective Spears', 'Maximum Weight', 'Maximum Point', 'Rarity']
  const biome = labelled(text, 'Biome', following)
  const activity = labelled(text, 'Activity', following)
  const bait = baitProfile(text)
  return {
    biome,
    activity,
    bait,
    effectiveSpears: labelled(text, 'Effective Spears', following),
    maximumWeight: labelled(text, 'Maximum Weight', following),
    maximumPoint: labelled(text, 'Maximum Point', following),
    rarity: labelled(text, 'Rarity', following)
  }
}
function evidenceText(entry) {
  return entry?.evidence?.sections?.map(section => section.text).filter(Boolean).join('\n') || entry?.evidence?.excerpt || ''
}
function fishEntry(item, i18n, db, wikiByCanonical = new Map(), assetByUniqueName = new Map(), displayByCanonical = new Map()) {
  const localized = i18n[item.uniqueName]?.zh || {}
  const wikiEvidence = wikiByCanonical.get(String(item.name).toLowerCase())
  const cachedText = pageText(db, item.name)
  const currentText = evidenceText(wikiEvidence)
  const text = currentText || cachedText
  const cachedProfile = parseProfile(cachedText)
  const currentProfile = parseProfile(currentText)
  const profile = Object.fromEntries(Object.keys(currentProfile).map(key => [key, key === 'bait'
    ? (currentProfile.bait.status !== 'review-required' ? currentProfile.bait : cachedProfile.bait)
    : (currentProfile[key] || cachedProfile[key])]))
  const isFish = !NON_FISH_CATCHES.has(item.name)
  const wiki = wikiEvidence?.wiki || null
  const asset = assetByUniqueName.get(item.uniqueName.replace(/(?:Small|Medium|Large)$/, ''))
  const requiredFieldsComplete = Boolean(profile.biome && profile.activity && profile.bait.status !== 'review-required')
  const provenance = wiki ? {
    source: 'wiki.warframe.com', url: wiki.url, pageTitle: wiki.pageTitle,
    revisionId: wiki.revisionId, revisionTimestamp: wiki.timestamp, fetchedAt: wiki.syncedAt
  } : null
  const base = {
    uniqueName: item.uniqueName.replace(/(?:Small|Medium|Large)$/, ''),
    canonical: item.name,
    displayName: localized.name || item.name,
    localizationStatus: localized.name ? 'official-zh' : 'fallback-en',
    aliases: localized.name && localized.name !== item.name ? [localized.name] : [],
    kind: isFish ? 'fish' : 'catch-junk',
    semanticKinds: isFish ? ['fish'] : ['fish-catch-junk'],
    description: { canonical: item.description || '', display: localized.description || item.description || '' },
    tradable: Boolean(item.tradable),
    drops: item.drops || [],
    recipes: [], recipeVariants: [], buildQuantity: 1,
    sourceCategory: 'Fish', sourceFile: 'Fish.json',
    fishProfile: isFish ? {
      biome: profile.biome,
      activity: profile.activity,
      bait: profile.bait.name,
      effectiveSpears: profile.effectiveSpears,
      maximumWeight: profile.maximumWeight,
      maximumPoint: profile.maximumPoint,
      rarity: profile.rarity,
      wikiPage: text ? item.name : null,
      dataStatus: requiredFieldsComplete ? 'complete' : 'review-required'
    } : null,
    fishInfo: isFish ? {
      canonical: item.name,
      displayName: localized.name || item.name,
      openWorld: field(asset?.openWorld || null, provenance),
      biome: { ...field(profile.biome, provenance), displayName: displayBiome(profile.biome) },
      activity: { ...field(profile.activity, provenance), displayName: displayActivity(profile.activity) },
      bait: {
        status: profile.bait.status,
        canonical: profile.bait.name,
        displayName: displayByCanonical.get(profile.bait.name) || profile.bait.name,
        reviewStatus: profile.bait.status === 'review-required' ? 'review-required' : 'approved',
        provenance: profile.bait.status === 'review-required' ? null : provenance
      },
      effectiveSpears: spearProfile(profile.effectiveSpears, provenance),
      method: asset?.openWorld === 'duviri' ? 'maw-feeding' : 'fishing',
      reviewStatus: requiredFieldsComplete ? 'approved' : 'review-required',
      provenance
    } : null,
    ecologyInfo: isFish ? {
      schemaVersion: 1,
      type: 'fish',
      stableIdentity: item.uniqueName.replace(/(?:Small|Medium|Large)$/, ''),
      openWorld: field(asset?.openWorld || null, provenance),
      biome: { ...field(profile.biome, provenance), displayName: displayBiome(profile.biome) },
      activity: { ...field(profile.activity, provenance), displayName: displayActivity(profile.activity) },
      bait: {
        status: profile.bait.status,
        canonical: profile.bait.name,
        displayName: displayByCanonical.get(profile.bait.name) || profile.bait.name,
        reviewStatus: profile.bait.status === 'review-required' ? 'review-required' : 'approved',
        provenance: profile.bait.status === 'review-required' ? null : provenance
      },
      effectiveSpears: spearProfile(profile.effectiveSpears, provenance),
      method: asset?.openWorld === 'duviri' ? 'maw-feeding' : 'fishing',
      relations: { animalTags: [], processingOutputs: [], baitTargets: [] },
      reviewStatus: requiredFieldsComplete ? 'approved' : 'review-required',
      provenance
    } : null,
    reviewStatus: isFish && requiredFieldsComplete ? 'approved' : 'review-required',
    reviewedBy: provenance ? 'current-wiki-evidence + official-localization' : 'official-localization'
  }
  return base
}
function run() {
  const fish = readJson(FISH_PATH), i18n = readJson(I18N_PATH)
  const db = fs.existsSync(DB_PATH) ? new Database(DB_PATH, { readonly: true }) : null
  const evidence = fs.existsSync(WIKI_EVIDENCE_PATH) ? readJson(WIKI_EVIDENCE_PATH) : { entries: [] }
  const catalog = fs.existsSync(ASSET_CATALOG_PATH) ? readJson(ASSET_CATALOG_PATH) : { entries: [] }
  const wikiByCanonical = new Map((evidence.entries || []).map(entry => [String(entry.canonical || '').toLowerCase(), entry]))
  const assetByUniqueName = new Map((catalog.entries || catalog.resources || []).map(entry => [entry.stableIdentity?.uniqueName || entry.uniqueName, entry]))
  const officialItems = readJson(path.join(ROOT, 'knowledge', 'generated', 'official-items.json')).items || []
  const displayByCanonical = new Map(officialItems.filter(item => item.canonical && item.displayName).map(item => [item.canonical, item.displayName]))
  const byName = new Map()
  for (const item of fish) if (!byName.has(uniqueFishName(item))) byName.set(uniqueFishName(item), fishEntry(item, i18n, db, wikiByCanonical, assetByUniqueName, displayByCanonical))
  db?.close()
  const current = fs.existsSync(OUTPUT) ? readJson(OUTPUT) : []
  const nonFish = current.filter(item => item.sourceCategory !== 'Fish')
  const output = [...nonFish, ...[...byName.values()].sort((a, b) => a.canonical.localeCompare(b.canonical))]
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`已同步鱼类：${byName.size} 种；Wiki完整 ${[...byName.values()].filter(x => x.reviewStatus === 'approved').length} 种；待审 ${[...byName.values()].filter(x => x.reviewStatus !== 'approved').length} 种`)
  return output
}
if (require.main === module) run()
module.exports = { parseProfile, fishEntry, run }
