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
  return String(value || '').replace(/Duviri pond \(Maw Feeding platform\)/gi, '双衍王境池塘·贪食圆喉平台').replace(/Cave/gi, '洞穴').replace(/Surface/gi, '地表').replace(/Lake/gi, '湖泊').replace(/Pond/gi, '池塘').replace(/River/gi, '河流').replace(/Ocean/gi, '海岸').replace(/hotspot/gi, '热点').replace(/Glowing parts/gi, '发光部位') || null
}
function normalizeBiome(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(Duviri pond \(Maw Feeding platform\)|(?:Cave|Surface|Lake|Pond|River|Ocean)(?:,\s*(?:Pond|River))?(?:\s*\([^)]*\))?)/i)
  return match?.[1] || text || null
}
function displayActivity(value) {
  return String(value || '').replace(/Any Duviri mood/gi, '任意双衍王境心境').replace(/Cathemeral \(Day and Night time\)/gi, '昼夜均可').replace(/Diurnal \(Day time\)/gi, '白昼').replace(/Nocturnal \(Night time\)/gi, '夜晚').replace(/Cold\/Freezing weather \(prefers Freezing\)/gi, '寒冷/极寒（偏好极寒）').replace(/Cold\/Freezing weather/gi, '寒冷/极寒').replace(/Cold\/Warm weather \(prefers Warm\)/gi, '寒冷/温暖（偏好温暖）').replace(/Cold\/Warm weather/gi, '寒冷/温暖').replace(/Warm weather/gi, '温暖').replace(/Cold weather/gi, '寒冷').replace(/Fass\s*\/\s*Vome/gi, 'Fass/Vome 主宰期') || null
}
function normalizeActivity(value) {
  const text = String(value || '').trim()
  if (/^Fass\s*\/\s*Vome/i.test(text)) return 'Fass/Vome'
  if (/^Vome\b/i.test(text)) return 'Vome'
  if (/^Fass\b/i.test(text)) return 'Fass'
  if (/^Cathemeral/i.test(text)) return 'Cathemeral (Day and Night time)'
  if (/^Diurnal/i.test(text)) return 'Diurnal (Day time)'
  if (/^Nocturnal/i.test(text)) return 'Nocturnal (Night time)'
  return text || null
}
const ORB_VALLIS_FISH = Object.freeze({
  Brickie: ['Pond, River', 'Warm weather', 'Broad-Spectrum Bait', [2, 3, 4], 'Brickie Muon Battery'],
  Charamote: ['Cave (hotspot)', 'Cold/Warm weather (prefers Warm)', 'Charamote Bait', [1, 3, 5], 'Charamote Sagan Module'],
  Echowinder: ['Lake', 'Warm weather', 'Broad-Spectrum Bait', [2, 3, 4], 'Echowinder Anoscopic Sensor'],
  'Eye-Eye': ['Pond', 'Warm weather', 'Narrow-Spectrum Bait', [3, 4, 5], 'Eye-Eye Rotoblade'],
  Kriller: ['Lake', 'Warm weather', 'Kriller Bait', [1, 2, 3], 'Kriller Thermal Laser'],
  Longwinder: ['Lake (hotspot)', 'Warm weather', 'Longwinder Bait', [2, 3, 4], 'Longwinder Lathe Coagulant'],
  Mirewinder: ['Cave', 'Cold/Warm weather', 'Mirewinder Bait', [4, 5, 6], 'Mirewinder Parallel Biode'],
  Recaster: ['Pond (hotspot)', 'Cold/Freezing weather', 'Narrow-Spectrum Bait', [3, 5, 7], 'Recaster Neural Relay'],
  Sapcaddy: ['Lake', 'Cold/Freezing weather', 'Broad-Spectrum Bait', [3, 4, 5], 'Sapcaddy Venedo Case'],
  Scrubber: ['Cave', 'Cold/Warm weather', 'Broad-Spectrum Bait', [1, 2, 3], 'Scrubber Exa Brain'],
  Synathid: ['Cave (hotspot)', 'Cold/Warm weather (prefers Warm)', 'Synathid Bait', [4, 6, 8], 'Synathid Ecosynth Analyzer'],
  Tink: ['Pond, River', 'Cold/Freezing weather', 'Broad-Spectrum Bait', [1, 2, 3], 'Tink Dissipator Coil'],
  Tromyzon: ['Pond (hotspot)', 'Cold/Freezing weather (prefers Freezing)', 'Tromyzon Bait', [3, 4, 5], 'Tromyzon Entroplasma']
})
function orbVallisProfile(canonical, displayByCanonical) {
  const row = ORB_VALLIS_FISH[canonical]
  if (!row) return null
  const qualities = ['基础', '精致', '完美']
  const output = (canonicalName, quantities) => ({ canonical: canonicalName, displayName: displayByCanonical.get(canonicalName) || canonicalName, quantities: quantities.map((quantity, index) => ({ quality: qualities[index], quantity })) })
  return { biome: row[0], activity: row[1], bait: row[2], processing: [output('Scrap', row[3]), output(row[4], [1, 1, 1])] }
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
const QUALITY_MARKERS = Object.freeze([
  { pattern: /\bSmall\s+Medium\s+Large\b/i, labels: ['小型', '中型', '大型'] },
  { pattern: /\bBasic\s+Adorned\s+Magnificent\b/i, labels: ['基础', '精致', '完美'] }
])
function processingOutputs(text, displayByCanonical = new Map()) {
  const marker = QUALITY_MARKERS.map(value => ({ ...value, match: value.pattern.exec(String(text || '')) })).find(value => value.match)
  if (!marker) return []
  const start = marker.match.index + marker.match[0].length
  const segment = String(text).slice(start).split(/\b(?:Trivia|Trophy|Gallery|Patch History)\b/i)[0]
    .replace(/\d[\d,]*\s+Standing\s+\d[\d,]*/gi, ' ')
  const matches = [...segment.matchAll(/([A-Z][A-Za-z'’\- ]*?[A-Za-z])\s+x(\d+)\b/g)]
    .map(match => ({ canonical: match[1].trim(), quantity: Number(match[2]) }))
  if (!matches.length || matches.length % 3 !== 0) return []
  const width = matches.length / 3
  const rows = []
  for (let index = 0; index < width; index++) {
    const variants = marker.labels.map((quality, qualityIndex) => ({
      quality,
      quantity: matches[qualityIndex * width + index]?.quantity || 0
    }))
    const canonical = matches[index].canonical
    if (marker.labels.some((_, qualityIndex) => matches[qualityIndex * width + index]?.canonical !== canonical)) return []
    rows.push({ canonical, displayName: displayByCanonical.get(canonical) || canonical, quantities: variants })
  }
  return rows
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
  const orb = asset?.openWorld === 'orb-vallis' ? orbVallisProfile(item.name, displayByCanonical) : null
  if (orb) {
    profile.biome = orb.biome
    profile.activity = orb.activity
    profile.bait = { status: 'recommended', name: orb.bait }
    profile.effectiveSpears = 'Shockprod/Stunna'
  } else profile.activity = normalizeActivity(profile.activity)
  profile.biome = normalizeBiome(profile.biome)
  const processing = isFish ? (orb?.processing || processingOutputs(text, displayByCanonical)) : []
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
      processingOutputs: processing,
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
      relations: { animalTags: [], processingOutputs: processing, baitTargets: [] },
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
module.exports = { parseProfile, processingOutputs, fishEntry, run }
