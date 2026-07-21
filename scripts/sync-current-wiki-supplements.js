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
const DROP_INDEX_PATH = path.join(ROOT, 'generated', 'official-drop-table-index.json')
const IDENTITY_PATH = path.join(ROOT, 'knowledge', 'supplemental', 'current-mod-identities.json')
const START_UPDATE = 38.5
const DOMAINS = Object.freeze({ mods: 'Mods', resources: 'Resources' })
const MOD_PAGE_EXCLUSIONS = Object.freeze([/\bMods$/i])
const MARIE_COST_MULTIPLIERS = new Map([
  ...['Evir-Ti', 'Hayan-Dabor', 'Hok-Kaal', 'Lorun-Tash', 'Sey-Taph', 'Talsek-An', 'Ulashta-Shol', 'Vikla-Safor', 'Yar Dal'].map(name => [name, 1]),
  ...['Da-Ren', 'Kaal-zidi', 'Omn-Evi', 'Sil-Tabol', 'Vik-Anam'].map(name => [name, 2]),
  ...['Empazu-Shol', 'Esti Vel-Ikha', 'Lashta-Vak', 'Metem-Erun', 'Metem-Hakh', 'Ubri-Kaneph'].map(name => [name, 3])
])
const ANARCH_ENEMIES = Object.freeze({
  'Anarch Capsarii': { id: 'enemy.anarch-capsarii', displayName: '自由派医疗兵' },
  'Anarch Grineer Trapper': { id: 'enemy.anarch-grineer-trapper', displayName: '自由派 Grineer 捕猎者' },
  'Anarch Tenebra': { id: 'enemy.anarch-tenebra', displayName: '自由派暗杀兵' },
  'Anarch Arcus': { id: 'enemy.anarch-arcus', displayName: '自由派弓箭士' },
  'Anarch Arcus Lustratus': { id: 'enemy.anarch-arcus-lustratus', displayName: '自由派弓箭光肃官' },
  'Anarch Gladius': { id: 'enemy.anarch-gladius', displayName: '自由派剑士' },
  'Anarch Grineer Lancer': { id: 'enemy.anarch-grineer-lancer', displayName: '自由派 Grineer 枪兵' },
  'Anarch Libritor': { id: 'enemy.anarch-libritor', displayName: '自由派解放者' }
})
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
function normalize(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '') }
function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8) }
function jsonFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return jsonFiles(target)
    return entry.isFile() && entry.name.endsWith('.json') ? [target] : []
  })
}
function indexExistingMods() {
  const result = new Map()
  const modRoot = path.join(ROOT, 'knowledge', 'acquisition', 'mod')
  for (const file of jsonFiles(modRoot)) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const entry of Array.isArray(value) ? value : [value]) {
      const canonical = entry?.subject?.canonical
      if (!canonical) continue
      const relative = path.relative(modRoot, file)
      const candidate = {
        file,
        entry,
        value,
        authoritative: Boolean(entry.modAcquisition?.generated?.wiki?.wiki),
        standard: relative.split(path.sep)[0] === 'standardmod'
      }
      const key = normalize(canonical)
      const previous = result.get(key)
      // 正式 Mod 目录是已发布身份的唯一落点。current 仅用于官方目录尚未收录的
      // 补充项；即使两份记录都有 Wiki 证据，也不能依赖字典序随机抢占运行时。
      const score = Number(candidate.standard) * 2 + Number(candidate.authoritative)
      const previousScore = previous ? Number(previous.standard) * 2 + Number(previous.authoritative) : -1
      if (!previous || score > previousScore) result.set(key, candidate)
    }
  }
  return result
}
function staleCurrentModFiles(existingMods) {
  const currentRoot = path.join(ROOT, 'knowledge', 'acquisition', 'mod', 'current')
  const stale = []
  for (const file of jsonFiles(currentRoot)) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    const entries = Array.isArray(value) ? value : [value]
    if (!entries.length || !entries.every(entry => entry?.generator?.name === 'sync-current-wiki-supplements')) continue
    if (entries.every(entry => {
      const selected = existingMods.get(normalize(entry.subject?.canonical))
      return selected && selected.file !== file && selected.standard
        && (selected.entry.officialUniqueName || selected.entry.subject?.officialUniqueName)
          === (entry.officialUniqueName || entry.subject?.officialUniqueName)
    })) stale.push(file)
  }
  return stale
}
function introduced(text) { return String(text || '').match(/Introduced(?:\s+Update)?\s+(\d+(?:\.\d+)?)/i)?.[1] || null }
function officialLocalization(canonical, en, zh) {
  const matches = Object.entries(en).filter(([key, value]) =>
    (/Name$/i.test(key) || /^\/Lotus\/Language\/Upgrades\/Antique[^/]+$/i.test(key)) &&
    normalize(value) === normalize(canonical) &&
    zh[key]
  )
  const unique = [...new Set(matches.map(([key]) => renderGameText(zh[key]).trim()).filter(Boolean))]
  if (unique.length !== 1) return null
  const languageKey = matches.find(([key]) => renderGameText(zh[key]).trim() === unique[0])?.[0] || null
  const antiqueLeaf = languageKey?.match(/^\/Lotus\/Language\/Upgrades\/Antique(.+)$/)?.[1] || null
  return {
    displayName: unique[0],
    languageKey,
    officialUniqueName: antiqueLeaf ? `/Lotus/Upgrades/Mods/Antiques/${antiqueLeaf}` : null
  }
}
function officialModDetails(localized, pageText, zh, en = {}) {
  if (!localized?.officialUniqueName) return { maxRank: null, effectDetails: [] }
  const maxRank = Number(pageText.match(/Max Rank\s+(\d+)/i)?.[1])
  const description = pageText.match(/Max Rank Description\s+([\s\S]+?)\s+General Information/i)?.[1] || ''
  let values = [...description.matchAll(/[+-]?\d+(?:\.\d+)?%?/g)].map(match => match[0].replace(/^[+]/, '').replace(/%$/, ''))
  if (/NightwaveTnJetTurbinePistolAugmentModName$/.test(localized.languageKey) && values.length >= 3) {
    return {
      maxRank: Number.isInteger(maxRank) ? maxRank : null,
      effectDetails: [`主要射击命中弱点时：弱点伤害 +${values[0]}%，持续 ${values[1]} 秒，最多叠加 ${values[2]} 次。`]
    }
  }
  let cursor = 0
  const baseKey = localized.languageKey.replace(/Name$/, '')
  const uniqueLeaf = localized.officialUniqueName.split('/').at(-1).replace(/(?:Card|Mod)$/, '')
  const leafKeys = Object.keys(zh).filter(key =>
    new RegExp(`/${uniqueLeaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:Sub)?Desc$`, 'i').test(key)
  )
  const templateKeys = [...new Set([
    `${localized.languageKey}Desc`,
    `${localized.languageKey}SubDesc`,
    `${baseKey}Desc`,
    `${baseKey}SubDesc`,
    ...leafKeys
  ])]
  const literalValues = templateKeys.flatMap(key =>
    [...String(en[key] || '').replace(/\|[^|]+\|/g, '').matchAll(/[+-]?\d+(?:\.\d+)?%?/g)]
      .map(match => match[0].replace(/^[+]/, '').replace(/%$/, ''))
  )
  for (const literal of literalValues) {
    const index = values.indexOf(literal)
    if (index >= 0) values.splice(index, 1)
  }
  const templates = templateKeys.map(key => zh[key]).filter(Boolean)
  const effectDetails = templates.map(template => renderGameText(String(template).replace(/\|[^|]+\|/g, token => {
    const value = values[cursor++] || token
    return token.startsWith('|') && String(template).includes(`+${token}`) ? value.replace(/^\+/, '') : value
  })).trim()).filter(value => value && !/\|[^|]+\|/.test(value))
  return { maxRank: Number.isInteger(maxRank) ? maxRank : null, effectDetails }
}
function section(db, pageId, names) { return db.prepare(`SELECT title,text FROM sections WHERE page_id=? AND lower(title) IN (${names.map(() => '?').join(',')}) ORDER BY ordinal`).all(pageId, ...names.map(value => value.toLowerCase())).map(item => item.text).join('\n') }
const SYNDICATES = Object.freeze({ 'Arbiters of Hexis': 'faction.arbiters-of-hexis', 'New Loka': 'faction.new-loka', 'Red Veil': 'faction.red-veil', 'Cephalon Suda': 'faction.cephalon-suda', 'The Perrin Sequence': 'faction.the-perrin-sequence', 'Steel Meridian': 'faction.steel-meridian' })
const RANKS = Object.freeze({ Maxim: 5, Flawless: 5, Exalted: 5, Genius: 5, Partner: 5, General: 5 })
function parsePercent(value) {
  const number = Number(String(value || '').replace('%', '').trim())
  return Number.isFinite(number) ? Number((number / 100).toFixed(10)) : null
}
function parseEnemyDrops(canonical, text, page = {}) {
  const methods = []
  for (const block of String(text || '').split(/\n\s*\n/)) {
    const cells = [...block.matchAll(/\|\s*([^|\n]+?)\s*\|/g)].map(match => match[1].trim())
    const enemy = ANARCH_ENEMIES[cells[0]]
    if (!enemy || cells.length < 7) continue
    methods.push({
      type: 'enemy-drop',
      sourceCanonical: cells[0],
      sourceEntityId: enemy.id,
      sourceDisplayName: enemy.displayName,
      missionTypeId: 'mission-type.the-perita-rebellion',
      dropTableChance: parsePercent(cells[1]),
      itemChance: parsePercent(cells[2]),
      chance: parsePercent(cells[3]),
      quantity: Number(cells[5]),
      requirements: { type: 'none' },
      reviewStatus: 'approved',
      provenance: {
        source: 'DE Official Drop Tables',
        retrievedVia: 'Official Warframe Wiki local snapshot',
        pageTitle: canonical,
        pageId: page.pageId,
        revisionId: page.revisionId,
        section: 'Enemy Drop Tables',
        excerpt: cells.join(' | ')
      }
    })
  }
  return methods
}
function marieRequirements(canonical) {
  const multiplier = MARIE_COST_MULTIPLIERS.get(canonical)
  if (!multiplier) return null
  return {
    type: 'currency',
    usage: 'exchange',
    npcId: 'npc.marie',
    locationId: 'hub.sanctum-anatomica',
    chooseCount: 2,
    currency: [
      { currencyId: 'currency.agnovidisc', amountRange: [250 * multiplier, 350 * multiplier] },
      { currencyId: 'currency.laudavi', amountRange: [100 * multiplier, 140 * multiplier] },
      { currencyId: 'currency.servoris', amountRange: [40 * multiplier, 60 * multiplier] }
    ]
  }
}
function parseMethods(canonical, text, officialDrops = [], context = {}) {
  const methods = []
  if (/Sold by Marie as part of her rotating shop/i.test(text)) methods.push({
    type: 'vendor-exchange',
    npcId: 'npc.marie',
    locationId: 'hub.sanctum-anatomica',
    sourceCanonical: 'Marie at La Cathédrale, Sanctum Anatomica',
    sourceDisplayName: '始源星系解剖圣所拉卡瑟德拉勒的玛丽轮换商店',
    availability: 'rotating',
    requirements: marieRequirements(canonical) || { type: 'none' },
    reviewStatus: 'approved',
    provenance: {
      source: 'local-wiki-sqlite',
      pageTitle: 'Marie',
      pageId: context.mariePage?.pageId || null,
      revisionId: context.mariePage?.revisionId || null,
      section: 'Browse Items',
      excerpt: `${canonical} | ${MARIE_COST_MULTIPLIERS.get(canonical)}x rotating Antique Mod cost; each item randomly costs 2 listed resources`
    }
  })
  if (/Awarded from The Perita Rebellion missions/i.test(text) && !officialDrops.length) methods.push({
    type: 'event-mission-reward',
    sourceCanonical: 'The Perita Rebellion',
    sourceDisplayName: '佩里塔叛乱',
    missionTypeId: 'mission-type.the-perita-rebellion',
    requirements: { type: 'none' },
    reviewStatus: 'approved',
    provenance: { source: 'local-wiki-sqlite', pageTitle: canonical, pageId: context.page?.pageId || null, revisionId: context.page?.revisionId || null, section: 'Acquisition', excerpt: 'Awarded from The Perita Rebellion missions.' }
  })
  let match = text.match(/reaching Rank\s+(\d+)\s+with Nightwave/i)
  if (match) methods.push({
    type: 'legacy-nightwave-reward',
    locationId: 'interface.nightwave',
    rank: Number(match[1]),
    availability: 'legacy-or-future-rotation',
    requirements: { type: 'none' },
    reviewStatus: 'approved',
    provenance: { source: 'local-wiki-sqlite', pageTitle: canonical, section: 'Acquisition', excerpt: match[0] }
  })
  match = text.match(/Purchased from Aspirant Zorba at any relay for ([\d,]+) Atramentum/i)
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
  for (const drop of officialDrops) methods.push({
    type: 'mission-reward',
    sourceCanonical: drop.sourceCanonical,
    sourceDisplayName: drop.sourceDisplayName,
    locationId: drop.locationId || null,
    planetCanonical: drop.planetCanonical || null,
    nodeCanonical: drop.nodeCanonical || null,
    missionTypeId: drop.missionTypeId || null,
    rotation: drop.rotation || null,
    probability: Number(drop.chance),
    requirements: { type: 'none' },
    reviewStatus: 'approved',
    provenance: drop.provenance
  })
  methods.push(...parseEnemyDrops(canonical, context.enemyDropText, context.page))
  return methods
}
function buildPlan(options = {}) {
  const filename = resolveWikiDatabase(options.db), report = inspectWikiDatabase(filename, { skipHash: options.skipHash })
  const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8')), zh = JSON.parse(fs.readFileSync(ZH_PATH, 'utf8'))
  const currentIdentities = new Map(JSON.parse(fs.readFileSync(IDENTITY_PATH, 'utf8')).items.map(item => [normalize(item.canonical), item.uniqueName]))
  const officialDrops = JSON.parse(fs.readFileSync(DROP_INDEX_PATH, 'utf8')).byItem || {}
  const db = new Database(filename, { readonly: true, fileMustExist: true }), entries = [], exclusions = []
  try {
    const mariePage = db.prepare('SELECT page_id pageId, revision_id revisionId FROM pages WHERE title=?').get('Marie') || null
    for (const [domain, category] of Object.entries(DOMAINS)) {
      const pages = db.prepare('SELECT p.page_id pageId,p.title,p.revision_id revisionId,p.timestamp,p.text FROM categories c JOIN pages p ON p.page_id=c.page_id WHERE c.category=? ORDER BY p.title').all(category)
      for (const page of pages) {
        const update = introduced(page.text)
        if (Number(update) < START_UPDATE) continue
        if (domain === 'mods' && MOD_PAGE_EXCLUSIONS.some(pattern => pattern.test(page.title))) { exclusions.push({ domain, canonical: page.title, reason: 'category-overview' }); continue }
        const localized = officialLocalization(page.title, en, zh)
        if (!localized) { exclusions.push({ domain, canonical: page.title, reason: 'official-localization-unresolved' }); continue }
        if (domain === 'mods') localized.officialUniqueName = currentIdentities.get(normalize(page.title)) || localized.officialUniqueName
        const acquisitionText = section(db, page.pageId, ['Acquisition', 'Drop Locations'])
        const enemyDropText = section(db, page.pageId, ['Enemy Drop Tables'])
        const details = officialModDetails(localized, page.text, zh, en)
        const pageEvidence = { pageId: page.pageId, revisionId: page.revisionId, timestamp: page.timestamp }
        entries.push({ domain, canonical: page.title, displayName: localized.displayName, languageKey: localized.languageKey, officialUniqueName: localized.officialUniqueName, ...details, introduced: update, page: pageEvidence, methods: parseMethods(page.title, acquisitionText, localized.officialUniqueName ? (officialDrops[page.title] || []) : [], { page: pageEvidence, mariePage, enemyDropText }), acquisitionEvidence: [acquisitionText, enemyDropText].filter(Boolean).join('\n') })
      }
    }
  } finally { db.close() }
  entries.sort((a, b) => a.domain.localeCompare(b.domain) || a.canonical.localeCompare(b.canonical))
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), startUpdate: START_UPDATE, sourceDatabase: { sha256: report.sha256, size: report.size }, counts: { entries: entries.length, mods: entries.filter(x => x.domain === 'mods').length, resources: entries.filter(x => x.domain === 'resources').length, exclusions: exclusions.length }, entries, exclusions }
}
function modEntry(item, old) {
  const uniqueName = item.officialUniqueName || `wiki-current:mod:${item.canonical}`
  const officialDrops = item.methods.filter(method => method.provenance?.source === 'DE Official Drop Tables')
  const wikiMethods = item.methods.filter(method => method.provenance?.source !== 'DE Official Drop Tables')
  const oldManual = old?.modAcquisition?.manual || {}
  const manual = { methods: oldManual.methods || [], methodRefs: oldManual.methodRefs || [], overrides: oldManual.overrides || {}, reviewStatus: item.methods.length ? 'approved' : (oldManual.reviewStatus || 'draft'), reviewedBy: item.methods.length ? [...new Set([...(oldManual.reviewedBy || []), 'current-wiki-supplement'])] : (oldManual.reviewedBy || []) }
  return { id: `knowledge.acquisition.mod.${slug(item.canonical)}-${hash(uniqueName)}`, kind: 'knowledge', module: 'acquisition', title: item.displayName, subject: { canonical: item.canonical, displayName: item.displayName, category: 'mod', officialUniqueName: uniqueName, categoryRefs: ['standardmod'] }, officialUniqueName: uniqueName, maxRank: item.maxRank, effectDetails: item.effectDetails, rarity: null, polarity: null, tradable: true, prerequisites: [], tips: old?.tips || [], tipKeywords: old?.tipKeywords || [], methodRefs: [], modAcquisition: { generated: { identity: { officialUniqueName: uniqueName, canonical: item.canonical, displayName: item.displayName, variant: 'standard' }, wiki: { status: wikiMethods.length ? 'complete' : 'unresolved', methods: wikiMethods, evidence: [{ type: 'acquisition-prose', reviewStatus: 'approved', provenance: { source: 'current-wiki-sqlite', pageTitle: item.canonical, revisionId: item.page.revisionId }, excerpt: item.acquisitionEvidence }], mechanicsEvidence: {}, unresolvedEntities: [] }, officialDrops }, manual }, acquisitionStatus: item.methods.length ? 'complete' : 'partial', sources: [{ url: `https://wiki.warframe.com/w/${item.canonical.replace(/ /g, '_')}`, label: 'Official Warframe Wiki' }], gameVersion: `Update ${item.introduced}`, updatedAt: old?.updatedAt || new Date().toISOString().slice(0, 10), reviewStatus: item.methods.length ? 'approved' : 'draft', reviewedBy: item.methods.length ? [...new Set([...(old?.reviewedBy || []), 'current-wiki-supplement'])] : (old?.reviewedBy || []), tags: ['acquisition', 'mod', 'current-version-supplement'], generator: { name: 'sync-current-wiki-supplements', version: 1 } }
}
function resourceEntry(item, old) {
  const uniqueName = `wiki-current:resource:${item.canonical}`
  const routing = item.methods.length ? { category: 'resource-current-wiki', variables: { resourceName: item.displayName }, methods: item.methods, status: 'compiled' } : { category: 'resource-unresolved', variables: { resourceName: item.displayName }, status: 'review-required' }
  return { id: `knowledge.acquisition.resource.${slug(item.canonical)}`, kind: 'knowledge', module: 'acquisition', title: item.displayName, subject: { canonical: item.canonical, displayName: item.displayName, category: 'resource', officialUniqueName: uniqueName, categoryRefs: [routing.category] }, prerequisites: [], methodRefs: [], resourceAcquisition: { generated: { officialUniqueName: uniqueName, canonical: item.canonical, displayName: item.displayName, localizationStatus: 'official-zh', semanticKinds: ['resource'], evidence: [{ type: 'wiki-acquisition', canonical: item.acquisitionEvidence, reviewStatus: item.methods.length ? 'approved' : 'pending' }], routing }, manual: old?.resourceAcquisition?.manual || { tips: [], tipKeywords: [], routingOverride: null, reviewedBy: [] } }, sources: [{ url: `https://wiki.warframe.com/w/${item.canonical.replace(/ /g, '_')}`, label: 'Official Warframe Wiki' }], gameVersion: `Update ${item.introduced}`, updatedAt: old?.updatedAt || new Date().toISOString().slice(0, 10), reviewStatus: item.methods.length ? 'approved' : 'draft', reviewedBy: item.methods.length ? ['current-wiki-supplement'] : [], summary: `${item.displayName}的当前版本资源身份与获取证据。`, tags: ['acquisition', 'resource', 'current-version-supplement'], generator: { name: 'sync-current-wiki-supplements', version: 1 } }
}
function run(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--db'), db = index >= 0 ? argv[index + 1] : process.env.WF_WIKI_DB, check = argv.includes('--check')
  const plan = buildPlan({ db }), changes = [], existingMods = indexExistingMods()
  const compare = (target, value) => { const next = serialize(value), current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null; if (next !== current) changes.push({ target, next }) }
  for (const target of staleCurrentModFiles(existingMods)) changes.push({ target, remove: true })
  for (const item of plan.entries) {
    const dir = item.domain === 'mods' ? path.join(ROOT, 'knowledge', 'acquisition', 'mod', 'current') : path.join(ROOT, 'knowledge', 'acquisition', 'resource', 'entries')
    const uniqueName = item.domain === 'mods' ? item.officialUniqueName : `wiki-current:resource:${item.canonical}`
    const existingMod = item.domain === 'mods' ? existingMods.get(normalize(item.canonical)) : null
    const target = item.domain === 'mods'
      ? (existingMod?.file || path.join(dir, `${slug(item.canonical)}-${hash(uniqueName)}.json`))
      : path.join(dir, `${slug(item.canonical)}.json`)
    const oldValue = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : null
    const old = Array.isArray(oldValue) ? oldValue[0] : oldValue
    // sync-mod-wiki 已为部分当前 Mod 生成更完整的页面/机制证据；补充层只填空缺，
    // 不能用简化的 Acquisition 摘要覆盖那些高质量条目。
    if (item.domain === 'mods' && old?.modAcquisition?.generated?.wiki?.wiki) {
      if (!(old.effectDetails || []).length && item.effectDetails.length) {
        const mergedValue = structuredClone(oldValue)
        const merged = Array.isArray(mergedValue) ? mergedValue[0] : mergedValue
        merged.effectDetails = item.effectDetails
        if (merged.maxRank == null && item.maxRank != null) merged.maxRank = item.maxRank
        compare(target, mergedValue)
      }
      continue
    }
    compare(target, item.domain === 'mods' ? [modEntry(item, old)] : resourceEntry(item, old))
  }
  const oldPlan = fs.existsSync(TARGET) ? JSON.parse(fs.readFileSync(TARGET, 'utf8')) : null
  compare(TARGET, { ...plan, generatedAt: oldPlan?.generatedAt || plan.generatedAt })
  if (check) { if (changes.length) throw new Error(`当前 Wiki 补充层已漂移（${changes.length} 项）`); console.log(`当前 Wiki 补充层无漂移：${plan.counts.entries} 项`); return plan }
  for (const change of changes) {
    if (change.remove) fs.rmSync(change.target)
    else { fs.mkdirSync(path.dirname(change.target), { recursive: true }); fs.writeFileSync(change.target, change.next) }
  }
  console.log(`已同步当前 Wiki 补充层 ${plan.counts.entries} 项；变更 ${changes.length} 项`)
  return plan
}
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { START_UPDATE, DOMAINS, MOD_PAGE_EXCLUSIONS, MARIE_COST_MULTIPLIERS, ANARCH_ENEMIES, normalize, jsonFiles, indexExistingMods, staleCurrentModFiles, officialLocalization, officialModDetails, parseEnemyDrops, marieRequirements, parseMethods, buildPlan, modEntry, resourceEntry, run }
