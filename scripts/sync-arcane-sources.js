'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { sourceId, sourceKind, displaySource } = require('../src/arcane-source')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'knowledge', 'arcane-sources')
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const ARCANES = require(path.join(ITEMS_ROOT, 'data/json/Arcanes.json'))
const MODS = require(path.join(ITEMS_ROOT, 'data/json/Mods.json'))
const SUPPLEMENTS = path.join(ROOT, 'generated', 'official-arcane-supplements.json')
const REGIONS = path.join(ROOT, 'cache', 'warframe-export-regions.json')
const EN = path.join(ROOT, '.cache', 'official-localization', 'languages.en.json')
const ZH = path.join(ROOT, '.cache', 'official-localization', 'languages.zh.json')
const GENERIC_SOURCE_RELATIONS = Object.freeze([
  [/^Arbitrations, Rotation [ABC]$/, { sourceEntityId: 'acquisition-source.arbitration-honors', missionTypeId: 'mission-type.arbitration' }],
  [/^(?:Deep|Temporal) Archimedea/, { locationId: 'hub.sanctum-anatomica', missionTypeId: 'mission-type.archimedea' }],
  [/^Duviri\/Endless:/, { locationId: 'landscape.duviri', missionTypeId: 'mission-type.the-circuit' }],
  [/^Höllvania\/Antivirus Bounty \(Caches\)$/, { sourceEntityId: 'acquisition-source.hollvania-missions', missionTypeId: 'mission-type.wf1999-bounty' }]
])
function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'source' }
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
function createMissionSourceOverrides() {
  const regions = JSON.parse(fs.readFileSync(REGIONS, 'utf8')), en = JSON.parse(fs.readFileSync(EN, 'utf8')), zh = JSON.parse(fs.readFileSync(ZH, 'utf8')), overrides = new Map()
  for (const [officialNodeId, node] of Object.entries(regions)) {
    const nodeCanonical = en[node.name] || node.name, nodeDisplayName = zh[node.name] || '', planetCanonical = en[node.systemName] || node.systemName, planetDisplayName = zh[node.systemName] || '', missionCanonical = en[node.missionName] || node.missionName || '', missionDisplayName = zh[node.missionName] || ''
    if (!nodeCanonical || !missionDisplayName) continue
    overrides.set(`${planetCanonical}/${nodeCanonical}`, { officialNodeId, nodeCanonical, nodeDisplayName, planetCanonical, planetDisplayName, missionCanonical, missionDisplayName })
    if (planetCanonical.endsWith(' Proxima')) overrides.set(`${planetCanonical.replace(/ Proxima$/, '')}/${nodeCanonical}`, { officialNodeId, nodeCanonical, nodeDisplayName, planetCanonical, planetDisplayName, missionCanonical, missionDisplayName })
  }
  return overrides
}
function resolveMissionSource(canonical, overrides) {
  const match = String(canonical).match(/^([^/]+)\/(.+?) \(([^)]+)\)(?:, Rotation ([A-Z]))?$/)
  if (!match) return null
  const node = overrides.get(`${match[1]}/${match[2]}`)
  if (!node) return null
  const displayName = `${node.planetDisplayName}/${node.nodeDisplayName}（${node.missionDisplayName}）${match[4] ? `，轮次 ${match[4]}` : ''}`
  return { ...node, rotation: match[4] || null, displayName }
}
function sourceRelation(canonical, mission) {
  if (mission) {
    const isBounty = /Bount(?:y|ies)|Isolation Vault/i.test(canonical)
    return { locationId: isBounty ? (/Cambion Drift/i.test(canonical) ? 'landscape.cambion-drift' : `planet.${slug(mission.planetCanonical.replace(/ Proxima$/,''))}`) : `mission.${slug(mission.nodeCanonical)}-${String(mission.officialNodeId).toLowerCase()}`, missionTypeId: isBounty ? (/Cambion Drift/i.test(canonical) ? 'mission-type.cambion-drift-bounty' : `mission-type.${slug(mission.missionCanonical)}`) : `mission-type.${slug(mission.missionCanonical)}` }
  }
  return GENERIC_SOURCE_RELATIONS.find(([pattern]) => pattern.test(canonical))?.[1] || null
}
function buildPlan() {
  const missionOverrides = createMissionSourceOverrides()
  const supplementMethods = fs.existsSync(SUPPLEMENTS) ? (JSON.parse(fs.readFileSync(SUPPLEMENTS, 'utf8')).entries || []).flatMap(entry => entry.methods || []) : []
  const canonicals = [...new Set([...ARCANES.filter(item => item.name !== 'Arcane' && !item.excludeFromCodex).flatMap(item => (item.drops || []).map(drop => String(drop.location || '').trim()).filter(Boolean)), ...MODS.flatMap(item => (item.drops || []).map(drop => String(drop.location || '').trim()).filter(Boolean)), ...supplementMethods.map(method => method.sourceCanonical).filter(Boolean)])].sort()
  const entries = canonicals.map(canonical => { const mission = resolveMissionSource(canonical, missionOverrides), displayName = mission?.displayName || displaySource(canonical), kind = mission ? 'mission-reward' : sourceKind(canonical), relation = kind === 'mission-reward' ? sourceRelation(canonical, mission) : null; return { id: sourceId(canonical), canonical, displayName, kind, aliases: [], ...(relation ? { relation } : {}), ...(mission ? { mission: { officialNodeId: mission.officialNodeId, planetCanonical: mission.planetCanonical, nodeCanonical: mission.nodeCanonical, missionTypeCanonical: mission.missionCanonical, missionTypeDisplayName: mission.missionDisplayName, rotation: mission.rotation } } : {}), localization: { status: displayName === canonical ? 'canonical-fallback' : mission ? 'official-zh' : 'official-or-audited', rule: '禁止运行时猜译' }, source: mission ? 'DE ExportRegions + Languages.bin; route from warframe-items' : 'warframe-items Arcanes.json/Mods.json + official i18n/audited mapping' } })
  const categories = [...new Set(entries.map(entry => entry.kind))].sort().map(id => ({ id, count: entries.filter(entry => entry.kind === id).length }))
  return { entries, index: { schemaVersion: 1, generatedAt: new Date().toISOString().slice(0, 10), type: 'arcane-sources', count: entries.length, categories, variables: entries.map(entry => ({ id: entry.id, canonical: entry.canonical, displayName: entry.displayName, kind: entry.kind, category: entry.kind, file: `${entry.kind}/${slug(entry.canonical)}-${entry.id.slice(-8)}.json` })) } }
}
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check'); const plan = buildPlan(); const expected = new Set(); const changes = []
  const add = (file, value) => { expected.add(path.resolve(file).toLowerCase()); const next=serialize(value), old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null; if(next!==old)changes.push({file,next}) }
  add(path.join(TARGET,'categories.json'), plan.index)
  for(const entry of plan.entries){const route=plan.index.variables.find(item=>item.id===entry.id);add(path.join(TARGET,...route.file.split('/')),entry)}
  if(fs.existsSync(TARGET)){const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).forEach(item=>{const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.name.endsWith('.json')&&!expected.has(path.resolve(file).toLowerCase()))changes.push({file,remove:true})});walk(TARGET)}
  if(check){if(changes.length)throw new Error(`赋能源变量已漂移（${changes.length} 项）`);console.log(`赋能源变量无漂移：${plan.entries.length} 个`);return plan}
  for(const change of changes){if(change.remove)fs.unlinkSync(change.file);else{fs.mkdirSync(path.dirname(change.file),{recursive:true});fs.writeFileSync(change.file,change.next)}}
  console.log(`已同步 ${plan.entries.length} 个赋能源变量；写入 ${changes.length} 项`);return plan
}
if(require.main===module){try{run()}catch(error){console.error(error.stack||error);process.exit(1)}}
module.exports={GENERIC_SOURCE_RELATIONS,createMissionSourceOverrides,resolveMissionSource,sourceRelation,buildPlan,run}
