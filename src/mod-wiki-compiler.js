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
const MISSION_TYPE_ZH = Object.freeze({ Spy: '间谍', 'The Circuit': '无尽回廊' })
const LOCATION_ZH = Object.freeze({ Earth: '地球', Venus: '金星', Mercury: '水星', Mars: '火星', Phobos: '火卫一', Ceres: '谷神星', Jupiter: '木星', Europa: '欧罗巴', Saturn: '土星', Uranus: '天王星', Neptune: '海王星', Pluto: '冥王星', Sedna: '赛德娜', Eris: '阋神星', Lua: '月球', Deimos: '火卫二', 'Kuva Fortress': '赤毒要塞' })

function normalizeSection(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() }
function percentage(value) {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*%/)
  return match ? Number(match[1]) : null
}
function integer(value) {
  const match = String(value || '').match(/\d+/)
  return match ? Number(match[0]) : null
}
function evidenceProvenance(page, section, excerpt) {
  return { pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId, section: section.title, excerpt: cleanCell(excerpt) }
}
function entityLocalization(canonical, kind) {
  const registry = kind === 'vendor' ? REGISTRIES.vendors : REGISTRIES.locations
  const registered = registry.get(canonical)
  if (registered && registered.displayName !== registered.canonical) return { entityId: registered.id, displayName: registered.displayName, status: 'resolved' }
  if (kind === 'node') {
    const node = NODES.find(item => item.name === canonical)
    const localized = node && I18N[node.uniqueName]?.zh?.name
    if (localized && localized !== canonical) return { entityId: `node.${node.uniqueName}`, displayName: localized, status: 'resolved' }
    if (node) return { entityId: `node.${node.uniqueName}`, displayName: null, status: 'canonical-only' }
  }
  if (kind === 'location' && LOCATION_ZH[canonical]) return { entityId: `location.${canonical.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, displayName: LOCATION_ZH[canonical], status: 'resolved' }
  if (kind === 'enemy') {
    const enemy = ENEMIES.find(item => item.name === canonical)
    const localized = enemy && I18N[enemy.uniqueName]?.zh?.name
    if (localized && localized !== canonical) return { entityId: `enemy.${enemy.uniqueName}`, displayName: localized, status: 'resolved' }
    return { entityId: enemy ? `enemy.${enemy.uniqueName}` : null, displayName: null, status: 'unresolved' }
  }
  if (kind === 'missionType' && MISSION_TYPE_ZH[canonical]) return { entityId: `mission-type.${canonical.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, displayName: MISSION_TYPE_ZH[canonical], status: 'resolved' }
  return { entityId: registered?.id || null, displayName: null, status: 'unresolved' }
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
    else if (ACQUISITION_SECTIONS.has(title)) evidence.push(...splitEvidenceItems(section.text).map(excerpt => ({ type: 'acquisition-prose', reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) })))
    if (MECHANICS_SECTIONS.has(title)) mechanicsEvidence[title].push(...splitEvidenceItems(section.text).map(excerpt => ({ reviewStatus: 'draft', provenance: evidenceProvenance(page, section, excerpt) })))
  }
  const unresolvedEntities = uniqueUnresolved(unresolved)
  const usable = methods.filter(method => method.chance !== null || method.type === 'mission-reward')
  return {
    wiki: { pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId, pageTimestamp: page.timestamp, compiledAt, sourceDatabase },
    methods, evidence, mechanicsEvidence, unresolvedEntities,
    status: usable.length ? (unresolvedEntities.length ? 'partial' : 'complete') : 'unresolved'
  }
}

module.exports = { ACQUISITION_SECTIONS, ENEMY_HEADERS, LOCATION_HEADERS, MISSION_HEADERS, compileModWikiPage, percentage }
