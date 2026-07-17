'use strict'

const path = require('node:path')
const { parseMediaWikiTable, cleanCell, extractCells, normalizeHeader } = require('./mediawiki-table')
const { loadEntityRegistries } = require('./entities')

const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const NODES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Node.json'))
const ENEMIES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Enemy.json'))
const I18N = require(path.join(ITEMS_ROOT, 'data', 'json', 'i18n.json'))
const REGISTRIES = loadEntityRegistries(path.resolve(__dirname, '..'))

const MISSION_HEADERS = [['missionType', 'Mission Type'], ['sourceCanonical', 'Source'], ['rotation', 'Rotations or Drop Table', 'RotationsorDrop Table'], ['chance', 'Chance'], ['quantity', 'Quantity'], ['average', 'Avg. per roll'], ['nodes', 'Star Chart Nodes']]
const ENEMY_HEADERS = [['sourceCanonical', 'Enemy'], ['dropTableChance', 'Drop Table Chance'], ['itemChance', 'Item Chance'], ['chance', 'Chance'], ['expectedKills', 'Expected Kills'], ['quantity', 'Quantity'], ['average', 'Avg. per roll attempt']]
const LOCATION_HEADERS = [['target', 'Target'], ['planetCanonical', 'Planet'], ['nodeCanonical', 'Name'], ['missionType', 'Type'], ['level', 'Level'], ['tileSet', 'Tile Set']]
const MECHANICS_SECTIONS = new Set(['notes', 'usage'])
const ACQUISITION_SECTIONS = new Set(['acquisition', 'blueprints', 'drop location', 'drop locations', 'mission drop tables', 'enemy drop tables', 'vendor'])
const MISSION_TYPE_ZH = Object.freeze({ Spy: '间谍', 'The Circuit': '无尽回廊', 'Orokin Vault': '奥罗金宝库', 'Weekly Conclave Challenge Reward': '武形秘仪每周挑战奖励' })
const LOCATION_ZH = Object.freeze({ Earth: '地球', Venus: '金星', Mercury: '水星', Mars: '火星', Phobos: '火卫一', Ceres: '谷神星', Jupiter: '木星', Europa: '欧罗巴', Saturn: '土星', Uranus: '天王星', Neptune: '海王星', Pluto: '冥王星', Sedna: '赛德娜', Eris: '阋神星', Lua: '月球', Deimos: '火卫二', Zariman: '扎里曼号', 'Earth Proxima': '地球比邻星域', 'Venus Proxima': '金星比邻星域', 'Saturn Proxima': '土星比邻星域', 'Neptune Proxima': '海王星比邻星域', 'Pluto Proxima': '冥王星比邻星域', 'Veil Proxima': '面纱比邻星域', 'Kuva Fortress': '赤毒要塞' })
function baseLocationCanonical(value) { return cleanCell(String(value || '').split(/\s*;\s*/)[0]) }

function normalizeSection(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() }
function percentage(value) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*%/)
  return match ? Number(match[1]) / 100 : null
}
function integer(value) {
  const match = String(value || '').match(/\d+/)
  return match ? Number(match[0]) : null
}
function evidenceProvenance(page, section, excerpt) {
  return { source: 'local-wiki-sqlite', pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId, section: section.title, excerpt: cleanCell(excerpt) }
}
function entityLocalization(canonical, kind) {
  const registry = kind === 'enemy' ? REGISTRIES.enemies : kind === 'missionType' ? REGISTRIES.missionTypes : REGISTRIES.locations
  const lookupCanonical = kind === 'location' ? baseLocationCanonical(canonical) : canonical
  const registered = registry.get(lookupCanonical)
  if (registered && registered.displayName !== registered.canonical) return { entityId: registered.id, displayName: registered.displayName, status: 'resolved' }
  if (kind === 'node') {
    const node = NODES.find(item => item.name === lookupCanonical)
    const localized = node && I18N[node.uniqueName]?.zh?.name
    if (localized && localized !== canonical) return { entityId: `node.${node.uniqueName}`, displayName: localized, status: 'resolved' }
    if (node) return { entityId: `node.${node.uniqueName}`, displayName: null, status: 'canonical-only' }
  }
  if (kind === 'location' && LOCATION_ZH[lookupCanonical]) return { entityId: `location.${lookupCanonical.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, displayName: LOCATION_ZH[lookupCanonical], status: 'resolved' }
  if (kind === 'enemy') {
    if (registered) return { entityId: registered.id, displayName: registered.displayName || null, status: registered.displayName ? 'resolved' : 'canonical-only' }
    const enemy = ENEMIES.find(item => item.name === canonical)
    const localized = enemy && I18N[enemy.uniqueName]?.zh?.name
    if (localized && localized !== canonical) return { entityId: `enemy.${enemy.uniqueName}`, displayName: localized, status: 'resolved' }
    return { entityId: enemy ? `enemy.${enemy.uniqueName}` : null, displayName: null, status: 'unresolved' }
  }
  if (kind === 'missionType' && MISSION_TYPE_ZH[canonical]) return { entityId: `mission-type.${canonical.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, displayName: MISSION_TYPE_ZH[canonical], status: 'resolved' }
  if (registered) return { entityId: registered.id, displayName: registered.displayName || null, status: registered.displayName ? 'resolved' : 'canonical-only' }
  return { entityId: null, displayName: null, status: 'unresolved' }
}
function attachEntity(target, field, canonical, kind, unresolved) {
  if (!canonical) return
  const result = entityLocalization(canonical, kind)
  target[`${field}Canonical`] = canonical
  if (result.entityId) target[`${field}EntityId`] = result.entityId
  if (result.displayName) target[`${field}DisplayName`] = result.displayName
  if (result.status === 'unresolved') unresolved.push({ kind, canonical })
}
function splitEvidenceItems(text) {
  return String(text || '').replace(/\r/g, '').split(/\n\s*(?:[•*#-]\s*)?/).map(cleanCell).filter(line => line && !/^\[ edit \| edit source \]$/i.test(line))
}
function isNoRows(text, kind) { return new RegExp(`No ${kind} drop tables with this item`, 'i').test(String(text || '')) }

function compileMissionRows(page, section, unresolved) {
  if (isNoRows(section.text, 'mission')) return []
  const table = parseMediaWikiTable(section.text, MISSION_HEADERS)
  return table.rows.map(row => {
    const method = { type: row.missionType === 'The Circuit' ? 'circuit-reward' : 'mission-reward', rotation: cleanCell(row.rotation) || null, chance: percentage(row.chance), quantity: integer(row.quantity), nodes: [], availability: 'unknown', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, Object.values(row).join(' | ')) }
    attachEntity(method, 'missionType', cleanCell(row.missionType), 'missionType', unresolved)
    method.sourceCanonical = cleanCell(row.sourceCanonical)
    const nodeText = `${row.nodes || ''}\n${row._continuation || ''}`
    const nodes = [...nodeText.matchAll(/(?:^|\n|•)\s*([^,\n•]+?)\s*,\s*([^\n•]+)/g)]
    if (!nodes.length) {
      const pairs = nodeText.split(/\n|•/).map(cleanCell).filter(value => /^[^,]+,[^,]+$/.test(value))
      nodes.push(...pairs.map(value => { const [node, planet] = value.split(','); return [value, node, planet] }))
    }
    for (const match of nodes) {
      const node = {}
      attachEntity(node, 'node', cleanCell(match[1]), 'node', unresolved)
      attachEntity(node, 'planet', cleanCell(match[2]), 'location', unresolved)
      method.nodes.push(node)
    }
    return method
  }).filter(row => row.sourceCanonical && row.chance !== null)
}

function compileEnemyRows(page, section, unresolved) {
  if (isNoRows(section.text, 'enemy')) return []
  const table = parseMediaWikiTable(section.text, ENEMY_HEADERS)
  return table.rows.map(row => {
    const method = { type: 'enemy-drop', dropTableChance: percentage(row.dropTableChance), itemChance: percentage(row.itemChance), chance: percentage(row.chance), quantity: integer(row.quantity), availability: 'unknown', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, Object.values(row).join(' | ')) }
    attachEntity(method, 'source', cleanCell(row.sourceCanonical), 'enemy', unresolved)
    return method
  }).filter(row => row.sourceCanonical && row.chance !== null)
}

function compileAcquisitionProseMethod(excerpt, page, section) {
  let match = excerpt.match(/automatically acquired upon obtaining (?:an? |the )?(.+?)(?:\s*\.|$)/i)
  if (match) return { type: 'companion-included', sourceItemCanonical: cleanCell(match[1]), chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  match = excerpt.match(/(?:given one copy every time you claim|automatically acquired upon claiming) (?:an? |the )?(.+?) from your Foundry/i)
  if (match) return { type: 'companion-included', sourceItemCanonical: cleanCell(match[1]), chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  if (/Void Trader|Baro Ki['’]Teer/i.test(excerpt) && /(?:purchased|bought|sale|offered)/i.test(excerpt)) return { type: 'vendor-or-syndicate-exchange', sourceEntityId: 'npc.baro-ki-teer', locationId: 'hub.any-relay', chance: null, quantity: 1, availability: 'rotating', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  if (/Nightwave Cred Offerings/i.test(excerpt) && /rotational basis/i.test(excerpt)) return { type: 'vendor-or-syndicate-exchange', locationId: 'interface.nightwave', currency: [{ currencyCanonical: 'Nightwave Cred', amount: integer(excerpt) }], chance: null, quantity: 1, availability: 'rotating', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  match = excerpt.match(/(?:obtained|reaching Rank\s+(\d+))[^.]*?Nightwave[^.]*?(?:Rank\s+(\d+))?/i)
  if (match) return { type: 'legacy-nightwave-reward', locationId: 'interface.nightwave', rank: Number(match[1] || match[2] || 0) || null, chance: null, quantity: 1, availability: 'legacy-or-future-rotation', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  match = excerpt.match(/Arbitrations vendor[^.]*?for\s+(\d+)\s+Vitus Essence/i)
  if (match) return { type: 'vendor-or-syndicate-exchange', sourceEntityId: 'acquisition-source.arbitration-honors', locationId: 'hub.any-relay', currency: [{ currencyId: 'currency.vitus-essence', amount: Number(match[1]) }], chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  match = excerpt.match(/Teshin[^.]*?for\s+(\d+)\s+Steel Essence/i)
  if (match) return { type: 'vendor-or-syndicate-exchange', sourceEntityId: 'npc.teshin', locationId: 'hub.any-relay', currency: [{ currencyCanonical: 'Steel Essence', amount: Number(match[1]) }], chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  const factionIds = { 'Arbiters of Hexis': 'faction.arbiters-of-hexis', 'Cephalon Suda': 'faction.cephalon-suda', 'New Loka': 'faction.new-loka', 'The Perrin Sequence': 'faction.the-perrin-sequence', 'Steel Meridian': 'faction.steel-meridian', 'Red Veil': 'faction.red-veil' }
  if (/attaining the rank/i.test(excerpt) && /Standing/i.test(excerpt)) {
    const factions = Object.entries(factionIds).filter(([name]) => new RegExp(name.replace(/^The /, '(?:The )?'), 'i').test(excerpt))
    if (factions.length) return { type: 'syndicate-exchange-group', factionIds: factions.map(([, id]) => id), standing: integer(excerpt.match(/spending\s+([\d,]+)\s+Standing/i)?.[1]?.replace(/,/g, '') || 0), rankRequirement: 'max', chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  }
  match = excerpt.match(/(?:bought|purchased)\s+from\s+(Son|Father)[^.]*?for\s+([\d,]+)\s+Standing[^.]*?Rank\s+(\d+)\s*-\s*([A-Za-z ]+?)(?:\s+with\s+the\s+Entrati|\s+with\s+Entrati|[.,]|$)/i)
  if (match) return { type: 'vendor-or-syndicate-exchange', sourceEntityId: match[1].toLowerCase() === 'son' ? 'npc.son' : 'npc.father', locationId: 'hub.necralisk', requirements: { type: 'standing', npcId: match[1].toLowerCase() === 'son' ? 'npc.son' : 'npc.father', locationId: 'hub.necralisk', rank: Number(match[3]), rankName: ({ Associate: '同伴', Friend: '朋友' }[cleanCell(match[4])] || null) }, standing: Number(match[2].replace(/,/g, '')), chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  match = excerpt.match(/Rank\s+(\d+)[^.]*?Entrati[^.]*?purchased for\s+([\d,]+)\s+Standing/i)
  if (match) return { type: 'vendor-or-syndicate-exchange', sourceEntityId: 'npc.father', locationId: 'hub.necralisk', requirements: { type: 'standing', npcId: 'npc.father', locationId: 'hub.necralisk', rank: Number(match[1]) }, standing: Number(match[2].replace(/,/g, '')), chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  match = excerpt.match(/Koumei['’]s Shrine[^.]*?for\s+(\d+)\s+Fate Pearl/i)
  if (match) return { type: 'vendor-or-syndicate-exchange', sourceEntityId: 'acquisition-source.koumei-shrine', locationId: 'hub.cetus', prerequisite: 'steel-path', currency: [{ currencyId: 'currency.fate-pearl', amount: Number(match[1]) }], chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  const exchangeProviders = [{ pattern: /The Business/i, sourceEntityId: 'npc.the-business', locationId: 'hub.fortuna' }, { pattern: /Master Teasonai/i, sourceEntityId: 'npc.master-teasonai', locationId: 'hub.cetus' }, { pattern: /\bSon\b/i, sourceEntityId: 'npc.son', locationId: 'hub.necralisk' }]
  const provider = exchangeProviders.find(item => item.pattern.test(excerpt))
  if (provider && /(?:purchased|bought)/i.test(excerpt)) {
    const standing = Number((excerpt.match(/for\s+([\d,]+)\s+Standing/i)?.[1] || '').replace(/,/g, '')) || null
    const rankMatch = excerpt.match(/Rank\s+(\d+)\s*-\s*([A-Za-z ]+?)(?:\s+with\s+|\s+in\s+|[.,]|$)/i)
    const officialRanks = { Doer: '实践者', Associate: '同伴', Friend: '朋友', Trusted: '信赖' }
    const rankCanonical = rankMatch ? cleanCell(rankMatch[2]) : null
    const requirements = rankMatch ? { type: 'standing', npcId: provider.sourceEntityId, locationId: provider.locationId, rank: Number(rankMatch[1]), rankName: officialRanks[rankCanonical] || null } : { type: 'none' }
    return { type: 'vendor-or-syndicate-exchange', ...provider, requirements, standing, requirementsEvidence: excerpt.split(/\|\|/).slice(1).map(cleanCell).filter(Boolean), chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  }
  match = excerpt.match(/(?:completion of|completing) (?:the )?(.+?) Quest/i)
  if (match) return { type: 'quest-reward', questCanonical: cleanCell(match[1]), chance: null, quantity: 1, availability: 'one-time-or-repurchase', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  match = excerpt.match(/Rewarded upon completion of (?:the )?(.+?) Quest/i)
  if (match) return { type: 'quest-reward', questCanonical: cleanCell(match[1]), chance: null, quantity: 1, availability: 'one-time-or-repurchase', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) }
  return null
}
function compileAcquisition(page, section, unresolved) {
  const methods = []
  const cells = extractCells(section.text)
  const headerStart = cells.findIndex((cell, index) => normalizeHeader(cell) === 'target' && normalizeHeader(cells[index + 1]) === 'planet')
  if (headerStart >= 0) {
    const values = cells.slice(headerStart + LOCATION_HEADERS.length)
    for (let index = 0; index + 4 < values.length; index += 5) {
      const [planetCanonical, nodeCanonical, missionType, level, rawTileSet] = values.slice(index, index + 5)
      if (!planetCanonical || !nodeCanonical || !missionType) continue
      const tileSet = cleanCell(String(rawTileSet || '').split(/\bOriginally this mod\b/i)[0])
      const method = { type: 'mission-reward', chance: null, quantity: 1, rotation: null, availability: 'unknown', reviewStatus: 'draft', context: `Acquisition 章节列出的任务节点（${level}，${tileSet}）；概率与轮次以掉落表为准`, provenance: evidenceProvenance(page, section, [planetCanonical, nodeCanonical, missionType, level, tileSet].join(' | ')) }
      attachEntity(method, 'missionType', missionType, 'missionType', unresolved)
      attachEntity(method, 'node', nodeCanonical, 'node', unresolved)
      attachEntity(method, 'planet', planetCanonical, 'location', unresolved)
      methods.push(method)
    }
  }
  const prose = splitEvidenceItems(section.text).filter(item => !/^\|/.test(item) && !/^Drop Locations:?$/i.test(item) && !/^Originally\b/i.test(item))
  methods.push(...prose.map(excerpt => compileAcquisitionProseMethod(excerpt, page, section)).filter(Boolean))
  return { methods, evidence: prose.map(excerpt => ({ type: 'acquisition-prose', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) })) }
}

function uniqueUnresolved(values) {
  const seen = new Set()
  return values.filter(value => { const key = `${value.kind}\0${value.canonical}`; if (seen.has(key)) return false; seen.add(key); return true })
}
function compileModWikiPage(page, sourceDatabase, compiledAt = new Date().toISOString()) {
  const methods = []
  const evidence = []
  const mechanicsEvidence = { status: 'draft', notes: [], usage: [] }
  const unresolved = []
  for (const section of page.sections || []) {
    const title = normalizeSection(section.title)
    if (title === 'mission drop tables') methods.push(...compileMissionRows(page, section, unresolved))
    else if (title === 'enemy drop tables') methods.push(...compileEnemyRows(page, section, unresolved))
    else if (title === 'acquisition') { const compiled = compileAcquisition(page, section, unresolved); methods.push(...compiled.methods); evidence.push(...compiled.evidence) }
    else if (ACQUISITION_SECTIONS.has(title)) {
      const excerpts = splitEvidenceItems(section.text)
      methods.push(...excerpts.map(excerpt => compileAcquisitionProseMethod(excerpt, page, section)).filter(Boolean))
      evidence.push(...excerpts.map(excerpt => ({ type: 'acquisition-prose', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) })))
    }
    if (MECHANICS_SECTIONS.has(title)) mechanicsEvidence[title].push(...splitEvidenceItems(section.text).map(excerpt => ({ reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) })))
  }
  const unresolvedEntities = uniqueUnresolved(unresolved)
  const usable = methods.filter(method => method.chance !== null || ['mission-reward', 'companion-included', 'vendor-or-syndicate-exchange', 'syndicate-exchange-group', 'quest-reward', 'legacy-nightwave-reward'].includes(method.type))
  return {
    wiki: { pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId, pageTimestamp: page.timestamp, compiledAt, sourceDatabase },
    methods, evidence, mechanicsEvidence, unresolvedEntities,
    status: usable.length ? (unresolvedEntities.length ? 'partial' : 'complete') : 'unresolved'
  }
}

module.exports = { ACQUISITION_SECTIONS, ENEMY_HEADERS, LOCATION_HEADERS, MISSION_HEADERS, compileAcquisitionProseMethod, compileModWikiPage, percentage }
