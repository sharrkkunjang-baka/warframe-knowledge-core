'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildRegistryPlan, applyRegistryPlan, slug } = require('./entity-registry-io')
const { readIndexedEntries } = require('../src/entities')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'knowledge', 'locations')
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const WARFRAMES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Warframes.json'))

const PLANET_ZH = Object.freeze({ Earth: '地球', Venus: '金星', Mercury: '水星', Mars: '火星', Phobos: '火卫一', Ceres: '谷神星', Jupiter: '木星', Europa: '欧罗巴', Saturn: '土星', Uranus: '天王星', Neptune: '海王星', Pluto: '冥王星', Sedna: '赛德娜', Eris: '阋神星', Lua: '月球', Deimos: '火卫二', Void: '虚空', 'Kuva Fortress': '赤毒要塞', Höllvania: '霍瓦尼亚' })
const NODE_ZH = Object.freeze({ Armatus: '卫城区', 'Solstice Square': '至日广场', Brutus: '布鲁图斯' })
const MISSION_ZH = Object.freeze({ Assassination: '刺杀', Defense: '防御', Survival: '生存', Capture: '捕获', Rescue: '救援', Spy: '间谍', Disruption: '中断', Exterminate: '歼灭', Interception: '拦截', Excavation: '挖掘', Defection: '叛逃', Skirmish: '前哨战', Caches: '任务缓存', 'Infested Salvage': 'INFESTED 资源回收', Ascension: '扬升', 'Shrine Defense': '神龛防御' })
const SPECIAL_ZH = Object.freeze({ 'Void Fissure Corrupted Enemy': '虚空裂缝中的堕落敌人', 'Orokin Storage Container': '奥罗金存储容器', 'Void Storm (Neptune)': '海王星比邻星域虚空风暴', 'Void Storm (Pluto)': '冥王星比邻星域虚空风暴', 'Void Storm (Veil Proxima)': '面纱比邻星域虚空风暴', "Kahl's Garrison (Chipper), Fort": '在卡尔驻军向 Chipper 以堡垒等级兑换', "Kahl's Garrison (Chipper), Settlement": '在卡尔驻军向 Chipper 以定居地等级兑换', "Kahl's Garrison (Chipper), Encampment": '在卡尔驻军向 Chipper 以营地等级兑换', "Kahl's Garrison (Chipper), Home": '在卡尔驻军向 Chipper 以家园等级兑换', 'Cephalon Simaris, Complete Uranus Junction': '首次完成天王星接合点后可在中枢 Simaris 处回购', 'Cephalon Simaris, Complete Neptune Junction': '首次完成海王星接合点后可在中枢 Simaris 处回购', 'Cephalon Simaris, Complete Pluto Junction': '首次完成冥王星接合点后可在中枢 Simaris 处回购' })

function parseSource(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/^([^/]+)\/([^,(]+?)(?:\s*\(([^)]+)\))?(?:,\s*Rotation\s*[A-Z])?$/i)
  if (!match || /Level\s*\d+|Bount(?:y|ies)/i.test(raw)) return null
  return { location: match[1].trim(), node: match[2].trim(), missionType: (match[3] || '').trim() }
}
function generatedEntries() {
  const entries = Object.entries(PLANET_ZH).map(([canonical, displayName]) => ({ id: `planet.${slug(canonical)}`, canonical, displayName, kind: 'planet', aliases: [], officialSource: 'audited-official-zh' }))
  entries.push({ id: 'hub.fortuna-airlock', canonical: 'The Airlock', displayName: '气密舱', kind: 'hub', aliases: [], parentId: 'hub.fortuna', officialSource: 'Warframe Update 40 official zh-hans patch notes' })
  for (const frame of WARFRAMES.filter(item => !item.isPrime)) for (const component of frame.components || []) for (const drop of component.drops || []) {
    const raw = String(drop.location || '').trim()
    const parsed = parseSource(raw)
    if (!parsed) {
      if (raw) entries.push({ id: `source.${slug(raw)}`, canonical: raw, displayName: SPECIAL_ZH[raw] || '', kind: 'acquisition-source', aliases: [], officialSource: SPECIAL_ZH[raw] ? 'audited-official-zh' : 'official-drop-canonical' })
      continue
    }
    const parentId = `planet.${slug(parsed.location)}`
    entries.push({ id: parentId, canonical: parsed.location, displayName: PLANET_ZH[parsed.location] || '', kind: 'planet', aliases: [], officialSource: PLANET_ZH[parsed.location] ? 'audited-official-zh' : 'official-drop-canonical' })
    entries.push({ id: `mission-node.${slug(parsed.node)}`, canonical: parsed.node, displayName: NODE_ZH[parsed.node] || '', kind: 'mission-node', aliases: [], parentId, missionTypeId: parsed.missionType ? `mission-type.${slug(parsed.missionType)}` : null, officialSource: NODE_ZH[parsed.node] ? 'audited-official-zh' : 'official-drop-canonical' })
  }
  return entries
}
function build() {
  const byId = new Map(readIndexedEntries(ROOT, 'locations').map(entry => [entry.id, entry]))
  for (const entry of generatedEntries()) {
    const previous = byId.get(entry.id)
    const legacyType = previous?.missionTypeCanonical
    byId.set(entry.id, previous ? { ...entry, ...previous, parentId: previous.parentId || entry.parentId, missionTypeId: previous.missionTypeId || entry.missionTypeId || (legacyType ? `mission-type.${slug(legacyType)}` : null), missionTypeCanonical: undefined, missionTypeDisplayName: undefined } : entry)
  }
  return [...byId.values()]
}
function buildPlan() { return buildRegistryPlan({ type: 'locations', root: TARGET, entries: build(), categoryOf: entry => entry.kind, categoryNames: { planet: '星球', hub: '中继聚落', landscape: '开放世界', 'proxima-region': '比邻星域', 'railjack-mission': '航道星舰任务', 'mission-node': '任务节点', 'acquisition-source': '特殊获取来源' }, source: { generatedFrom: 'warframe-items Warframes component drops' } }) }
function run(argv = process.argv.slice(2)) { const check = argv.includes('--check'); const changes = applyRegistryPlan(buildPlan(), { check }); console.log(check ? `战甲来源地点变量无漂移：${build().length} 个` : `已同步 ${build().length} 个战甲来源地点变量；写入 ${changes.length} 项`) }
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { parseSource, generatedEntries, build, buildPlan, run }
