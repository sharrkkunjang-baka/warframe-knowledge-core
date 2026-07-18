'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildRegistryPlan, applyRegistryPlan, walkJson, slug } = require('./entity-registry-io')
const { readIndexedEntries } = require('../src/entities')

const ROOT = path.resolve(__dirname, '..')
const KNOWLEDGE = path.join(ROOT, 'knowledge')
const LEGACY = path.join(KNOWLEDGE, 'entities')
const LOCALIZATION_SNAPSHOT = path.join(ROOT, 'generated', 'official-localization-snapshot.json')
const REGIONS = path.join(ROOT, 'cache', 'warframe-export-regions.json')
const LANG_ZH = path.join(ROOT, '.cache', 'official-localization', 'languages.zh.json')
const LANG_EN = path.join(ROOT, '.cache', 'official-localization', 'languages.en.json')
const AUDITED_ENEMY_OVERRIDES = Object.freeze({
  'Juno Sapper MOA': { locationId: 'mission-node.brutus', missionTypeId: 'mission-type.ascension' }
})
function officialBossLocationIndex() {
  const regions = JSON.parse(fs.readFileSync(REGIONS, 'utf8'))
  const zh = JSON.parse(fs.readFileSync(LANG_ZH, 'utf8'))
  const en = JSON.parse(fs.readFileSync(LANG_EN, 'utf8'))
  const output = new Map()
  for (const [nodeId, node] of Object.entries(regions)) {
    if (node.missionType !== 'MT_ASSASSINATION' || !node.vipAgent) continue
    const planetCanonical = en[node.systemName] || node.systemName || ''
    const planetDisplayName = zh[node.systemName] || planetCanonical
    const nodeCanonical = en[node.name] || node.name || ''
    const nodeDisplayName = zh[node.name] || nodeCanonical
    const record = { nodeId, planetCanonical, planetDisplayName, nodeCanonical, nodeDisplayName, missionTypeId: 'mission-type.assassination' }
    output.set(String(node.vipAgent), record)
    output.set(String(node.vipAgent).replace(/Agent$/i, 'Avatar'), record)
  }
  return output
}
const ACQUISITION_ENEMIES = Object.freeze([
  ['Hunhow','Hunhow'],['Decaying Conculyst','腐朽震荡使'],['Typholyst','巨锤使'],['Archimedean Itzam','哲士伊赞'],['Kuva Lich Agor Rok','赤毒玄骸 Agor Rok'],['Garv','加弗'],['Narmer Gunner Warden','合一众机枪手典狱长'],['Razorback','鬣狗舰队'],['Zanuka Hunter','Zanuka 猎犬']
].map(([canonical,displayName])=>({id:`enemy.${slug(canonical)}`,canonical,displayName,kind:'enemy',category:'enemy',aliases:[],factionId:null,internalPaths:[],languageKey:null,localization:{status:'audited-acquisition-evidence',source:'Warframe Wiki'},source:{source:'Warframe Wiki acquisition evidence'}})))
function officialEnemyEntries() {
  if (!fs.existsSync(LOCALIZATION_SNAPSHOT)) throw new Error('缺少官方本地化快照，请先运行 npm run sync:localization')
  const snapshot = JSON.parse(fs.readFileSync(LOCALIZATION_SNAPSHOT, 'utf8'))
  const bossLocations = officialBossLocationIndex()
  return snapshot.entities.map(item => {
    const bossLocation = (item.internalPaths || []).map(internalPath => bossLocations.get(internalPath)).find(Boolean)
    return ({
    id: `enemy.${slug(item.canonical)}`,
    canonical: item.canonical,
    displayName: item.displayName,
    kind: item.kind || 'enemy',
    category: item.kind || 'enemy',
    aliases: [],
    factionId: item.factionCanonical ? `faction.${slug(item.factionCanonical)}` : null,
    internalPaths: item.internalPaths || [],
    languageKey: item.languageKey || null,
    localization: { status: item.status, source: 'DE Languages.bin', languageVersion: snapshot.provenance.languageVersion, languageCommit: snapshot.provenance.languageCommit },
    source: snapshot.provenance,
    ...(bossLocation ? { bossLocation } : {}),
    ...(AUDITED_ENEMY_OVERRIDES[item.canonical] || {})
  })})
}
const DEFINITIONS = Object.freeze({
  enemies: { legacy: 'enemies', categoryOf: entry => entry.category || 'enemy', names: { boss: '首领与刺杀目标', enemy: '敌人单位', 'enemy-family': '敌人家族', 'enemy-group': '敌人群组来源' } }
})
function readLegacy(name, directory) {
  const legacyPath = path.join(LEGACY, `${name}.json`)
  if (fs.existsSync(legacyPath)) return JSON.parse(fs.readFileSync(legacyPath, 'utf8'))
  const indexed = readIndexedEntries(ROOT, directory)
  const loose = walkJson(path.join(KNOWLEDGE, directory)).filter(file => path.basename(file) !== 'categories.json').map(file => JSON.parse(fs.readFileSync(file, 'utf8')))
  const supplements = directory === 'enemies' ? [...officialEnemyEntries(), ...ACQUISITION_ENEMIES] : []
  const byId = new Map([...indexed, ...loose, ...supplements].map(entry => [entry.id, entry]))
  return [...byId.values()]
}
function buildPlans() {
  return Object.entries(DEFINITIONS).map(([directory, definition]) => buildRegistryPlan({ type: directory, root: path.join(KNOWLEDGE, directory), entries: readLegacy(definition.legacy, directory), categoryOf: definition.categoryOf, categoryNames: definition.names, source: { migratedFrom: `knowledge/entities/${definition.legacy}.json` } }))
}
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  let changes = 0
  for (const plan of buildPlans()) changes += applyRegistryPlan(plan, { check }).length
  console.log(check ? '基础实体变量目录无漂移' : `已同步 ${Object.keys(DEFINITIONS).length} 类基础实体变量；写入 ${changes} 项`)
}
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { LOCALIZATION_SNAPSHOT, REGIONS, LANG_ZH, LANG_EN, AUDITED_ENEMY_OVERRIDES, officialBossLocationIndex, ACQUISITION_ENEMIES, officialEnemyEntries, DEFINITIONS, buildPlans, run }
