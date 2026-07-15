'use strict'
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { resolveWikiDatabase, inspectWikiDatabase } = require('../src/wiki-db')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'generated', 'official-arcane-supplements.json')
const OFFICIAL = require(path.join(path.dirname(require.resolve('warframe-items')), 'data/json/Arcanes.json'))
const EXCLUSIONS = Object.freeze({ Vosfor: 'resource-not-arcane' })
const CATEGORY_MAP = Object.freeze({ Warframe: 'warframe', Primary: 'primary', Secondary: 'secondary', Melee: 'melee', 'Tektolyst Artifacts': 'tektolyst' })
const PATCH_URLS = Object.freeze({ '43.0': 'https://www.warframe.com/zh-hans/patch-notes/psn/43-0-0', '41.0': 'https://www.warframe.com/zh-hans/patch-notes/pc/41-0-0' })
const LANGUAGE_CACHE = path.join(ROOT, '.cache', 'official-localization')
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
function normalize(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '') }
function loadLanguages() {
  const enPath = path.join(LANGUAGE_CACHE, 'languages.en.json'), zhPath = path.join(LANGUAGE_CACHE, 'languages.zh.json')
  if (!fs.existsSync(enPath) || !fs.existsSync(zhPath)) throw new Error('缺少 Languages.bin 缓存，请先运行 npm run sync:localization')
  return { en: JSON.parse(fs.readFileSync(enPath, 'utf8')), zh: JSON.parse(fs.readFileSync(zhPath, 'utf8')) }
}
function officialLocalization(canonical, languages) {
  const matches = Object.entries(languages.en).filter(([key, value]) => /Name$/i.test(key) && normalize(value) === normalize(canonical) && languages.zh[key])
  const unique = [...new Set(matches.map(([key]) => String(languages.zh[key]).trim()).filter(Boolean))]
  return unique.length === 1 ? { displayName: unique[0], languageKey: matches.find(([key]) => String(languages.zh[key]).trim() === unique[0])?.[0] || null } : null
}
function parsePage(page) {
  const text = String(page.text || '')
  const type = text.match(/General Information Type (Warframe|Primary|Secondary|Melee|Tektolyst Artifacts) Rarity/)?.[1]
  if (!type) return null
  const description = text.match(/Max Rank Description ([\s\S]*?) General Information Type/)?.[1]?.trim() || ''
  const maxRank = Number(text.match(/Max Rank (\d+)/)?.[1] || 5)
  const rarity = text.match(/General Information Type .+? Rarity (\w+)/)?.[1] || null
  const introduced = text.match(/Introduced Update (\d+\.\d+)/)?.[1] || null
  const methods = []
  if (/Uranus Proxima Completion Bonuses/.test(text)) methods.push({ type: 'reward-or-drop', sourceCanonical: 'Uranus Proxima Completion Bonuses', probability: 0.25, chancePercent: 25, quantity: 1 })
  const hunhow = text.match(/Can be bought from Hunhow at Pontis Tower for (\d+) Emerald Talent and (\d+) Crimson Talent/)
  if (hunhow) methods.push({ type: 'vendor-or-syndicate-exchange', sourceCanonical: `Hunhow at Pontis Tower (${hunhow[1]} Emerald Talent + ${hunhow[2]} Crimson Talent)`, quantity: 1 })
  const roathe = text.match(/Can be bought from Roathe at La Cathédrale in the Sanctum Anatomica for (\d+) Maphica/)
  if (roathe) methods.push({ type: 'vendor-or-syndicate-exchange', sourceCanonical: `Roathe at La Cathédrale (${roathe[1]} Maphica)`, quantity: 1 })
  if (/Steel Path The Descendia reward/.test(text)) methods.push({ type: 'reward-or-drop', sourceCanonical: 'Steel Path The Descendia weekly reward', probability: null, chancePercent: null, quantity: 1 })
  if (/Can be bought from Marie for a randomly determined amount of Perita resources/.test(text)) methods.push({ type: 'vendor-or-syndicate-exchange', sourceCanonical: 'Marie rotating shop (random Perita resources)', quantity: 1 })
  return { officialUniqueName: `wiki-arcane:${page.title}`, canonical: page.title, displayName: '', localizationStatus: 'official-zh-unavailable', category: CATEGORY_MAP[type], arcaneType: type === 'Tektolyst Artifacts' ? type : `${type} Arcane`, equipmentClass: type, rarity, maxRank, maxRankEffectCanonical: description, methods, introduced, source: { wiki: { pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId, timestamp: page.timestamp }, patchNotesUrl: PATCH_URLS[introduced] || null } }
}
function buildPlan(options = {}) {
  const languages = options.languages || loadLanguages()
  const filename = resolveWikiDatabase(options.db)
  const report = inspectWikiDatabase(filename, { skipHash: options.skipHash })
  const officialNames = new Set(OFFICIAL.filter(item => item.name !== 'Arcane' && !item.excludeFromCodex).map(item => item.name.toLowerCase()))
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  let pages
  try { pages = db.prepare("SELECT p.page_id pageId,p.title,p.revision_id revisionId,p.timestamp,p.text FROM categories c JOIN pages p ON p.page_id=c.page_id WHERE c.category='Arcane_Enhancements' ORDER BY p.title").all() } finally { db.close() }
  const missing = pages.filter(page => !officialNames.has(page.title.toLowerCase()))
  const entries = missing.filter(page => !EXCLUSIONS[page.title]).map(parsePage).filter(Boolean).map(entry => {
    const localized = officialLocalization(entry.canonical, languages)
    return localized ? { ...entry, displayName: localized.displayName, localizationStatus: 'official-zh', languageKey: localized.languageKey } : entry
  })
  const exclusions = missing.filter(page => EXCLUSIONS[page.title]).map(page => ({ canonical: page.title, reason: EXCLUSIONS[page.title] }))
  const unclassified = missing.filter(page => !EXCLUSIONS[page.title] && !entries.some(entry => entry.canonical === page.title)).map(page => page.title)
  if (unclassified.length) throw new Error(`Wiki 赋能分类存在未分类页面：${unclassified.join('、')}`)
  return { schemaVersion: 1, generatedAt: new Date().toISOString().slice(0,10), sourceDatabase: { sha256: report.sha256, size: report.size }, counts: { wikiCategory: pages.length, packageCurrent: officialNames.size, supplementalArcanes: entries.length, explicitExclusions: exclusions.length, totalCurrent: officialNames.size + entries.length }, entries, exclusions }
}
function run(argv = process.argv.slice(2)) {
  const check=argv.includes('--check'); const plan=buildPlan({db:process.env.WF_WIKI_DB}); const next=serialize(plan), old=fs.existsSync(TARGET)?fs.readFileSync(TARGET,'utf8'):null
  if(check){if(next!==old)throw new Error('官方赋能补充层已漂移');console.log(`赋能补充层无漂移：${plan.counts.supplementalArcanes} 个补充赋能，${plan.counts.totalCurrent} 个当前赋能`);return plan}
  fs.mkdirSync(path.dirname(TARGET),{recursive:true});fs.writeFileSync(TARGET,next);console.log(`已生成 ${plan.counts.supplementalArcanes} 个补充赋能；当前总数 ${plan.counts.totalCurrent}`);return plan
}
if(require.main===module){try{run()}catch(error){console.error(error.stack||error);process.exit(1)}}
module.exports={EXCLUSIONS,CATEGORY_MAP,loadLanguages,officialLocalization,parsePage,buildPlan,run}
