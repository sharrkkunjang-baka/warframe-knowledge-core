'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const Database = require('better-sqlite3')
const { resolveWikiDatabase, inspectWikiDatabase } = require('../src/wiki-db')
const { renderGameText } = require('../src/game-text')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'generated', 'current-wiki-supplements.json')
const EN_PATH = path.join(ROOT, '.cache', 'official-localization', 'languages.en.json')
const ZH_PATH = path.join(ROOT, '.cache', 'official-localization', 'languages.zh.json')
const START_UPDATE = 40
const DOMAINS = Object.freeze({ mods: 'Mods', resources: 'Resources' })
const MOD_PAGE_EXCLUSIONS = Object.freeze([/\bMods$/i, /^(?:Da-Ren|Empazu-Shol|Esti Vel-Ikha|Evir-Ti|Hayan-Dabor|Hok-Kaal|Kaal-zidi|Lashta-Vak|Lorun-Tash|Metem-Erun|Metem-Hakh|Omn-Evi|Sey-Taph|Sil-Tabol|Talsek-An|Ubri-Kaneph|Ulashta-Shol|Vik-Anam|Vikla-Safor|Yar Dal)$/])
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
function normalize(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '') }
function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8) }
function introduced(text) { return String(text || '').match(/Introduced(?:\s+Update)?\s+(\d+(?:\.\d+)?)/i)?.[1] || null }
function officialLocalization(canonical, en, zh) {
  const matches = Object.entries(en).filter(([key, value]) => /Name$/i.test(key) && normalize(value) === normalize(canonical) && zh[key])
  const unique = [...new Set(matches.map(([key]) => renderGameText(zh[key]).trim()).filter(Boolean))]
  return unique.length === 1 ? { displayName: unique[0], languageKey: matches.find(([key]) => renderGameText(zh[key]).trim() === unique[0])?.[0] || null } : null
}
function section(db, pageId, names) { return db.prepare(`SELECT title,text FROM sections WHERE page_id=? AND lower(title) IN (${names.map(() => '?').join(',')}) ORDER BY ordinal`).all(pageId, ...names.map(value => value.toLowerCase())).map(item => item.text).join('\n') }
const SYNDICATES = Object.freeze({ 'Arbiters of Hexis': 'faction.arbiters-of-hexis', 'New Loka': 'faction.new-loka', 'Red Veil': 'faction.red-veil', 'Cephalon Suda': 'faction.cephalon-suda', 'The Perrin Sequence': 'faction.the-perrin-sequence', 'Steel Meridian': 'faction.steel-meridian' })
const RANKS = Object.freeze({ Maxim: 5, Flawless: 5, Exalted: 5, Genius: 5, Partner: 5, General: 5 })
function parseMethods(canonical, text) {
  const methods = []
  let match = text.match(/Purchased from Aspirant Zorba at any relay for ([\d,]+) Atramentum/i)
  if (match) methods.push({ type: 'vendor-or-syndicate-exchange', npcId: 'npc.aspirant-zorba', locationId: 'hub.any-relay', sourceCanonical: 'Aspirant Zorba at any relay', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.aspirant-zorba', locationId: 'hub.any-relay', currency: [{ currencyId: 'currency.atramentum', amount: Number(match[1].replace(/,/g, '')) }], isBuffUseless: true } })
  match = text.match(/The Descendia\s*-\s*([\d.]+)% chance from Storage Containers/i)
  if (match) methods.push({ type: 'container-drop', locationId: 'acquisition-source.roathes-oblivion', sourceCanonical: 'The Descendia Storage Containers', sourceDisplayName: '沉沦之地储存容器', probability: Number(match[1]) / 100, chancePercent: Number(match[1]), requirements: { type: 'none' } })
  if (canonical === 'Atramentum') methods.push({ type: 'mission-reward', locationId: 'mission.follies-hunt', sourceCanonical: "Venus/Vesper Relay (Follie's Hunt)", quantity: 15, requirements: { type: 'quest', questName: 'Harrow 的枷锁' } }, { type: 'container-drop', locationId: 'mission.follies-hunt', sourceCanonical: "Follie's Hunt Atramentum Balloons", sourceDisplayName: 'Follie 的狩猎中的墨痕气球', quantityRange: [2, 4], requirements: { type: 'none' } })
  if (canonical === 'Maphica') methods.push({ type: 'mission-reward', locationId: 'acquisition-source.roathes-oblivion', sourceCanonical: 'The Descendia Infernum rewards', sourceDisplayName: '沉沦之地层级奖励', quantity: 5, requirements: { type: 'none' } }, { type: 'container-drop', locationId: 'acquisition-source.roathes-oblivion', sourceCanonical: 'The Descendia Storage Containers', sourceDisplayName: '沉沦之地储存容器', requirements: { type: 'none' } })
  const standing = Number(text.match(/spending\s+([\d,]+)\s+Standing/i)?.[1]?.replace(/,/g, '') || 0)
  if (standing) for (const [rankName, factionName] of [...text.matchAll(/rank of\s+(\w+)\s+under\s+(?:the\s+)?(Arbiters of Hexis|New Loka|Red Veil|Cephalon Suda|The Perrin Sequence|Steel Meridian)/gi)].map(match => [match[1], match[2]])) methods.push({ type: 'syndicate-exchange', factionId: SYNDICATES[Object.keys(SYNDICATES).find(name => name.toLowerCase() === factionName.toLowerCase())], standing, requiredLevel: RANKS[rankName] ?? null, requirements: { type: 'standing', factionId: SYNDICATES[Object.keys(SYNDICATES).find(name => name.toLowerCase() === factionName.toLowerCase())], amount: standing, rank: RANKS[rankName] ?? null }, reviewStatus: 'approved' })
  if (/Deepmines Bount(?:y|ies)/i.test(text)) methods.push({ type: 'bounty-reward', locationId: 'hub.fortuna-airlock', sourceCanonical: 'Deepmines Bounties', sourceDisplayName: '深矿赏金', requirements: { type: 'quest', questName: '新纪之战' } })
  match = text.match(/(?:purchased for\s+(\d+)\s+Fergolyte from Nightcap|purchased from Nightcap for\s+(\d+)\s+Fergolyte)(?:\s*,?\s*requiring Rank\s+(\d+)\s*-\s*([\w ]+))?/i)
  if (match) methods.push({ type: 'vendor-exchange', npcId: 'npc.nightcap', locationId: 'hub.fortuna', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.nightcap', locationId: 'hub.fortuna', rank: match[3] == null ? null : Number(match[3]), rankName: match[4]?.trim() || null, currency: [{ currencyId: 'currency.fergolyte', amount: Number(match[1] || match[2]) }] }, reviewStatus: 'approved' })
  if (/Incarnon Genesis/i.test(canonical) && /The Circuit/i.test(text)) methods.push({ type: 'circuit-reward', missionTypeEntityId: 'mission-type.the-circuit', missionTypeDisplayName: '无尽回廊', difficulty: 'steel-path', sourceCanonical: 'The Circuit Steel Path', requirements: { type: 'quest-list', quests: ['双衍王境悖论', '扎里曼的天使'], steelPath: true } }, { type: 'vendor-exchange', npcId: 'npc.cavalero', locationId: 'hub.zariman', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.cavalero', locationId: 'hub.zariman', currency: [{ currencyId: 'currency.platinum', amount: 120 }] } })
  if (canonical === 'Chromatic Atramentum') methods.push({ type: 'vendor-exchange', npcId: 'npc.aspirant-zorba', locationId: 'hub.any-relay', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.aspirant-zorba', locationId: 'hub.any-relay', currency: [{ currencyId: 'currency.atramentum', amount: 360 }], isBuffUseless: true } })
  if (/Talent$/.test(canonical)) methods.push({ type: 'mission-reward', locationId: canonical === 'Crimson Talent' ? 'mission.scorias-angel' : 'mission.the-kuva-wytch', missionTypeId: 'mission-type.skirmish', quantityRange: [12, 16], requirements: { type: 'quest', questName: '翠玉之影：星座' } })
  const perita = { 'Ascaris Prime': 'Recall: Prime Vanguard', 'Ren Hypercore': 'Recall: Dactolyst', 'Lyroic Bridge': 'Recall: Hunhullus', Laudavi: 'The Perita Rebellion', Servoris: 'The Perita Rebellion', Ignia: 'The Descendia', 'Nightmare Tatters': "Follie's Hunt" }
  if (perita[canonical]) methods.push({ type: /Descendia/.test(perita[canonical]) ? 'mission-reward' : 'event-mission-reward', sourceCanonical: perita[canonical], sourceDisplayName: ({ 'Recall: Prime Vanguard': '佩里塔叛乱：回忆·Prime 先锋', 'Recall: Dactolyst': '佩里塔叛乱：回忆·指节使', 'Recall: Hunhullus': '佩里塔叛乱：回忆·英魂统使', 'The Perita Rebellion': '佩里塔叛乱', 'The Descendia': '沉沦之地', "Follie's Hunt": 'Follie 的狩猎' })[perita[canonical]], locationId: /Descendia/.test(perita[canonical]) ? 'acquisition-source.roathes-oblivion' : /Follie/.test(perita[canonical]) ? 'mission.follies-hunt' : null, requirements: { type: 'none' } })
  return methods
}
function buildPlan(options = {}) {
  const filename = resolveWikiDatabase(options.db), report = inspectWikiDatabase(filename, { skipHash: options.skipHash })
  const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8')), zh = JSON.parse(fs.readFileSync(ZH_PATH, 'utf8'))
  const db = new Database(filename, { readonly: true, fileMustExist: true }), entries = [], exclusions = []
  try {
    for (const [domain, category] of Object.entries(DOMAINS)) {
      const pages = db.prepare('SELECT p.page_id pageId,p.title,p.revision_id revisionId,p.timestamp,p.text FROM categories c JOIN pages p ON p.page_id=c.page_id WHERE c.category=? ORDER BY p.title').all(category)
      for (const page of pages) {
        const update = introduced(page.text)
        if (Number(update) < START_UPDATE) continue
        if (domain === 'mods' && MOD_PAGE_EXCLUSIONS.some(pattern => pattern.test(page.title))) { exclusions.push({ domain, canonical: page.title, reason: /\bMods$/i.test(page.title) ? 'category-overview' : 'stance-combo-name-not-mod-item' }); continue }
        const localized = officialLocalization(page.title, en, zh)
        if (!localized) { exclusions.push({ domain, canonical: page.title, reason: 'official-localization-unresolved' }); continue }
        const acquisitionText = section(db, page.pageId, ['Acquisition', 'Drop Locations'])
        entries.push({ domain, canonical: page.title, displayName: localized.displayName, languageKey: localized.languageKey, introduced: update, page: { pageId: page.pageId, revisionId: page.revisionId, timestamp: page.timestamp }, methods: parseMethods(page.title, acquisitionText), acquisitionEvidence: acquisitionText })
      }
    }
  } finally { db.close() }
  entries.sort((a, b) => a.domain.localeCompare(b.domain) || a.canonical.localeCompare(b.canonical))
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), startUpdate: START_UPDATE, sourceDatabase: { sha256: report.sha256, size: report.size }, counts: { entries: entries.length, mods: entries.filter(x => x.domain === 'mods').length, resources: entries.filter(x => x.domain === 'resources').length, exclusions: exclusions.length }, entries, exclusions }
}
function modEntry(item, old) {
  const uniqueName = `wiki-current:mod:${item.canonical}`
  return { id: `knowledge.acquisition.mod.${slug(item.canonical)}-${hash(uniqueName)}`, kind: 'knowledge', module: 'acquisition', title: item.displayName, subject: { canonical: item.canonical, displayName: item.displayName, category: 'mod', officialUniqueName: uniqueName, categoryRefs: ['standardmod'] }, maxRank: null, effectDetails: [], rarity: null, polarity: null, tradable: true, prerequisites: [], tips: old?.tips || [], tipKeywords: old?.tipKeywords || [], methodRefs: [], modAcquisition: { generated: { identity: { officialUniqueName: uniqueName, canonical: item.canonical, displayName: item.displayName, variant: 'standard' }, wiki: { status: item.methods.length ? 'complete' : 'review-required', methods: item.methods, evidence: [{ type: 'acquisition-prose', reviewStatus: 'approved', provenance: { source: 'current-wiki-sqlite', pageTitle: item.canonical, revisionId: item.page.revisionId }, excerpt: item.acquisitionEvidence }], mechanicsEvidence: {}, unresolvedEntities: [] }, officialDrops: [] }, manual: old?.modAcquisition?.manual || { methods: [], methodRefs: [], overrides: {}, reviewStatus: 'draft', reviewedBy: [] } }, acquisitionStatus: item.methods.length ? 'complete' : 'partial', sources: [{ url: `https://wiki.warframe.com/w/${item.canonical.replace(/ /g, '_')}`, label: 'Official Warframe Wiki' }], gameVersion: `Update ${item.introduced}`, updatedAt: old?.updatedAt || new Date().toISOString().slice(0, 10), reviewStatus: item.methods.length ? 'approved' : 'draft', reviewedBy: item.methods.length ? ['current-wiki-supplement'] : [], tags: ['acquisition', 'mod', 'current-version-supplement'], generator: { name: 'sync-current-wiki-supplements', version: 1 } }
}
function resourceEntry(item, old) {
  const uniqueName = `wiki-current:resource:${item.canonical}`
  const routing = item.methods.length ? { category: 'resource-current-wiki', variables: { resourceName: item.displayName }, methods: item.methods, status: 'compiled' } : { category: 'resource-unresolved', variables: { resourceName: item.displayName }, status: 'review-required' }
  return { id: `knowledge.acquisition.resource.${slug(item.canonical)}`, kind: 'knowledge', module: 'acquisition', title: item.displayName, subject: { canonical: item.canonical, displayName: item.displayName, category: 'resource', officialUniqueName: uniqueName, categoryRefs: [routing.category] }, prerequisites: [], methodRefs: [], resourceAcquisition: { generated: { officialUniqueName: uniqueName, canonical: item.canonical, displayName: item.displayName, localizationStatus: 'official-zh', semanticKinds: ['resource'], evidence: [{ type: 'wiki-acquisition', canonical: item.acquisitionEvidence, reviewStatus: item.methods.length ? 'approved' : 'pending' }], routing }, manual: old?.resourceAcquisition?.manual || { tips: [], tipKeywords: [], routingOverride: null, reviewedBy: [] } }, sources: [{ url: `https://wiki.warframe.com/w/${item.canonical.replace(/ /g, '_')}`, label: 'Official Warframe Wiki' }], gameVersion: `Update ${item.introduced}`, updatedAt: old?.updatedAt || new Date().toISOString().slice(0, 10), reviewStatus: item.methods.length ? 'approved' : 'draft', reviewedBy: item.methods.length ? ['current-wiki-supplement'] : [], summary: `${item.displayName}的当前版本资源身份与获取证据。`, tags: ['acquisition', 'resource', 'current-version-supplement'], generator: { name: 'sync-current-wiki-supplements', version: 1 } }
}
function run(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--db'), db = index >= 0 ? argv[index + 1] : process.env.WF_WIKI_DB, check = argv.includes('--check')
  const plan = buildPlan({ db }), changes = []
  const compare = (target, value) => { const next = serialize(value), current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null; if (next !== current) changes.push({ target, next }) }
  for (const item of plan.entries) {
    const dir = item.domain === 'mods' ? path.join(ROOT, 'knowledge', 'acquisition', 'mod', 'current') : path.join(ROOT, 'knowledge', 'acquisition', 'resource', 'entries')
    const uniqueName = `wiki-current:${item.domain === 'mods' ? 'mod' : 'resource'}:${item.canonical}`
    const target = path.join(dir, item.domain === 'mods' ? `${slug(item.canonical)}-${hash(uniqueName)}.json` : `${slug(item.canonical)}.json`)
    const old = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null
    compare(target, item.domain === 'mods' ? modEntry(item, old) : resourceEntry(item, old))
  }
  compare(TARGET, plan)
  if (check) { if (changes.length) throw new Error(`当前 Wiki 补充层已漂移（${changes.length} 项）`); console.log(`当前 Wiki 补充层无漂移：${plan.counts.entries} 项`); return plan }
  for (const change of changes) { fs.mkdirSync(path.dirname(change.target), { recursive: true }); fs.writeFileSync(change.target, change.next) }
  console.log(`已同步当前 Wiki 补充层 ${plan.counts.entries} 项；写入 ${changes.length} 项`)
  return plan
}
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { START_UPDATE, DOMAINS, MOD_PAGE_EXCLUSIONS, normalize, officialLocalization, parseMethods, buildPlan, modEntry, resourceEntry, run }
