'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildRegistryPlan, applyRegistryPlan, slug } = require('./entity-registry-io')
const { readIndexedEntries } = require('../src/entities')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'knowledge', 'locations')
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const WARFRAMES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Warframes.json'))
const OFFICIAL_DROPS = path.join(ROOT, 'generated', 'official-drop-table-index.json')

const PLANET_ZH = Object.freeze({ Earth: '地球', Venus: '金星', Mercury: '水星', Mars: '火星', Phobos: '火卫一', Ceres: '谷神星', Jupiter: '木星', Europa: '欧罗巴', Saturn: '土星', Uranus: '天王星', Neptune: '海王星', Pluto: '冥王星', Sedna: '赛德娜', Eris: '阋神星', Lua: '月球', Deimos: '火卫二', Void: '虚空', 'Kuva Fortress': '赤毒要塞', Höllvania: '霍瓦尼亚' })
const NODE_ZH = Object.freeze({ Armatus: '卫城区', 'Solstice Square': '至日广场', Brutus: '布鲁图斯' })
const MISSION_ZH = Object.freeze({ Assassination: '刺杀', Defense: '防御', Survival: '生存', Capture: '捕获', Rescue: '救援', Spy: '间谍', Disruption: '中断', Exterminate: '歼灭', Interception: '拦截', Excavation: '挖掘', Defection: '叛逃', Skirmish: '前哨战', Caches: '任务缓存', 'Infested Salvage': 'INFESTED 资源回收', Ascension: '扬升', 'Shrine Defense': '神龛防御' })
const SPECIAL_ZH = Object.freeze({ 'Phorid Assassination': '入侵中出现的 Phorid 刺杀节点', 'Void Fissure Corrupted Enemy': '虚空裂缝中的堕落敌人', 'Orokin Storage Container': '奥罗金存储容器', 'Void Storm (Neptune)': '海王星比邻星域虚空风暴', 'Void Storm (Pluto)': '冥王星比邻星域虚空风暴', 'Void Storm (Veil Proxima)': '面纱比邻星域虚空风暴', "Kahl's Garrison (Chipper), Fort": '在卡尔驻军向 Chipper 以堡垒等级兑换', "Kahl's Garrison (Chipper), Settlement": '在卡尔驻军向 Chipper 以定居地等级兑换', "Kahl's Garrison (Chipper), Encampment": '在卡尔驻军向 Chipper 以营地等级兑换', "Kahl's Garrison (Chipper), Home": '在卡尔驻军向 Chipper 以家园等级兑换', 'Cephalon Simaris, Complete Uranus Junction': '首次完成天王星接合点后可在中枢 Simaris 处回购', 'Cephalon Simaris, Complete Neptune Junction': '首次完成海王星接合点后可在中枢 Simaris 处回购', 'Cephalon Simaris, Complete Pluto Junction': '首次完成冥王星接合点后可在中枢 Simaris 处回购' })

function parseSource(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/^([^/]+)\/([^,(]+?)(?:\s*\(([^)]+)\))?(?:,\s*Rotation\s*[A-Z])?$/i)
  if (!match || /Level\s*\d+|Bount(?:y|ies)/i.test(raw)) return null
  return { location: match[1].trim(), node: match[2].trim(), missionType: (match[3] || '').trim() }
}
function generatedEntries() {
  const entries = Object.entries(PLANET_ZH).map(([canonical, displayName]) => ({ id: `planet.${slug(canonical)}`, canonical, displayName, kind: 'planet', aliases: [], officialSource: 'audited-official-zh' }))
  entries.push(
    { id: 'hub.cetus', canonical: 'Cetus', displayName: '希图斯', kind: 'hub', aliases: [], parentId: 'planet.earth', officialSource: 'audited-official-zh' },
    { id: 'hub.fortuna', canonical: 'Fortuna', displayName: '福尔图娜', kind: 'hub', aliases: [], parentId: 'planet.venus', officialSource: 'audited-official-zh' },
    { id: 'hub.necralisk', canonical: 'Necralisk', displayName: '殁世幽都', kind: 'hub', aliases: [], parentId: 'planet.deimos', officialSource: 'audited-official-zh' },
    { id: 'hub.zariman', canonical: 'Zariman', displayName: '扎里曼号', kind: 'hub', aliases: ['Zariman Ten Zero'], officialSource: 'audited-official-zh' },
    { id: 'hub.sanctum-anatomica', canonical: 'Sanctum Anatomica', displayName: '解剖圣所', kind: 'hub', aliases: [], parentId: 'planet.deimos', officialSource: 'audited-official-zh' },
    { id: 'landscape.cambion-drift', canonical: 'Cambion Drift', displayName: '魔胎之境', kind: 'landscape', aliases: [], parentId: 'planet.deimos', officialSource: 'audited-official-zh' },
    { id: 'landscape.plains-of-eidolon', canonical: 'Plains of Eidolon', displayName: '夜灵平野', kind: 'landscape', aliases: [], parentId: 'planet.earth', officialSource: 'audited-official-zh' },
    { id: 'landscape.orb-vallis', canonical: 'Orb Vallis', displayName: '奥布山谷', kind: 'landscape', aliases: [], parentId: 'planet.venus', officialSource: 'audited-official-zh' },
    { id: 'hub.fortuna-airlock', canonical: 'The Airlock', displayName: '气密舱', kind: 'hub', aliases: [], parentId: 'hub.fortuna', officialSource: 'Warframe Update 40 official zh-hans patch notes' },
    { id: 'hub.drifters-camp', canonical: "Drifter's Camp", displayName: '漂泊者营地', kind: 'hub', aliases: [], parentId: 'planet.earth', officialSource: 'audited-official-zh' },
    { id: 'hub.dormizone', canonical: 'Dormizone', displayName: '宿舍', kind: 'hub', aliases: [], parentId: 'hub.zariman', officialSource: 'audited-official-zh' },
    { id: 'hub.any-relay', canonical: 'Any Relay', displayName: '任意中继站', kind: 'hub', aliases: [], officialSource: 'audited-official-zh' },
    { id: 'region.uranus-proxima', canonical: 'Uranus Proxima', displayName: '天王星比邻星域', kind: 'proxima-region', aliases: [], officialSource: 'DE Languages.bin JS2MAshFavorDesc' },
    { id: 'hub.pontis-tower', canonical: 'Pontis Tower', displayName: '渡界之塔', kind: 'hub', aliases: ['边界之塔'], parentId: 'region.uranus-proxima', officialSource: 'DE Languages.bin /Lotus/Language/JadeShadowsPart2Constellations/HunhowHubName' },
    { id: 'region.dark-refractory', canonical: 'The Dark Refractory', displayName: '深溯池', kind: 'region', aliases: ['深邃池', 'Dark Refractory'], parentId: 'planet.deimos', officialSource: 'DE Languages.bin /Lotus/Language/TauPrequel/TauPrequelFinal/TauMissionSelectAction' },
    { id: 'activity.the-descendia', canonical: 'The Descendia', displayName: '沉沦之地', kind: 'activity', aliases: ['沉沦之地', '沉沦', '爬塔'], parentId: 'region.dark-refractory', missionTypeId: 'mission-type.the-descendia', officialSource: 'DE Languages.bin /Lotus/Language/Missions/MissionName_Descent' },
    { id: 'mission.the-kuva-wytch', canonical: 'The Kuva Wytch', displayName: '赤毒女巫号', kind: 'railjack-mission', aliases: [], parentId: 'region.uranus-proxima', missionTypeId: 'mission-type.skirmish', officialSource: 'DE Languages.bin /Lotus/Language/JadeShadowsPart2Constellations/AshRJMissionName' },
    { id: 'mission.scorias-angel', canonical: "Scoria's Angel", displayName: '火山石天使号', kind: 'railjack-mission', aliases: [], parentId: 'region.uranus-proxima', missionTypeId: 'mission-type.skirmish', officialSource: 'DE Languages.bin /Lotus/Language/JadeShadowsPart2Constellations/GarudaRJMissionName' },
    { id: 'hub.clan-dojo', canonical: 'Clan Dojo', displayName: '氏族道场的 Dagath 空阁', kind: 'hub', aliases: [], officialSource: 'Warframe Wiki - Dagath' },
    { id: 'interface.nightwave', canonical: 'Nightwave Cred Offerings', displayName: '午夜电波贡品界面', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki - Vauban' },
    { id: 'acquisition-source.profit-taker-phase-3', canonical: 'Phase 3 of the Profit-Taker Orb Heist', displayName: '利润收割者抢劫第 3 阶段', kind: 'acquisition-source', aliases: [], parentId: 'hub.fortuna', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.baro-weekly-mission', canonical: 'Baro Weekly Mission', displayName: '虚空商人每周任务', kind: 'acquisition-source', aliases: [], officialSource: 'DE ExportKeys BaroWeeklyMission' },
    { id: 'acquisition-source.jade-shadows-event-store', canonical: 'Jade Shadows Event Store', displayName: '「行动代号：兽之腹」活动商店', kind: 'acquisition-source', aliases: [], officialSource: 'DE ExportVendors JadeShadowsEventVendorManifest' },
    { id: 'acquisition-source.hallowed-flame-cache', canonical: 'Hallowed Flame Cache Rewards', displayName: '万圣之焰活动任务缓存', kind: 'acquisition-source', aliases: [], officialSource: 'warframe-items drop evidence' },
    { id: 'acquisition-source.clem-weekly-mission', canonical: 'Help Clem Retrieve The Relic', displayName: '每周帮助 Clem 取回遗物任务', kind: 'acquisition-source', aliases: [], officialSource: 'warframe-items drop evidence' },
    { id: 'interface.market', canonical: 'Market', displayName: '商店', kind: 'acquisition-source', aliases: [], officialSource: 'DE ExportWeapons/ExportRecipes creditsCost' },
    { id: 'interface.nightwave-offerings', canonical: 'Nightwave Offerings', displayName: '午夜电波商店', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.arbitration-honors', canonical: 'Arbitration Honors', displayName: '仲裁阁下', kind: 'acquisition-source', aliases: ['仲裁阁下的奖励'], parentId: 'hub.any-relay', officialSource: 'DE Languages.bin /Lotus/Language/Syndicates/Syndicates_ArbitersEliteAlertVendor' },
    { id: 'mission.grendel-archaeo-freighter', canonical: 'Archaeo-Freighter', displayName: '上古货船', kind: 'special-mission', aliases: [], parentId: 'planet.europa', missionTypeId: 'mission-type.survival', officialSource: 'DE Languages.bin /Lotus/Language/Locations/GrendelKeyBMissionName' },
    { id: 'mission.grendel-icefields-of-riddah', canonical: 'Icefields of Riddah', displayName: 'Riddah 冰原', kind: 'special-mission', aliases: [], parentId: 'planet.europa', missionTypeId: 'mission-type.defense', officialSource: 'DE Languages.bin /Lotus/Language/Locations/GrendelKeyAMissionName' },
    { id: 'mission.grendel-mines-of-karishh', canonical: 'Mines of Karishh', displayName: '卡瑞什之矿', kind: 'special-mission', aliases: [], parentId: 'planet.europa', missionTypeId: 'mission-type.excavation', officialSource: 'DE Languages.bin /Lotus/Language/Locations/GrendelKeyCMissionName' },
    { id: 'acquisition-source.koumei-shrine', canonical: "Koumei's Shrine", displayName: 'Koumei 的神龛', kind: 'acquisition-source', aliases: [], parentId: 'hub.cetus', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.archimedean-yonta', canonical: 'Archimedean Yonta', displayName: '执刑官 Yonta', kind: 'acquisition-source', aliases: ['Yonta'], parentId: 'hub.zariman', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.operational-supply', canonical: 'Operational Supply', displayName: '行动补给', kind: 'acquisition-source', aliases: [], officialSource: 'warframe-items acquisition evidence' },
    { id: 'acquisition-source.hollvania-missions', canonical: 'Höllvania Missions', displayName: '霍瓦尼亚任务', kind: 'acquisition-source', aliases: [], officialSource: 'warframe-items acquisition evidence' },
    { id: 'acquisition-source.teshins-cave', canonical: "Teshin's Cave", displayName: 'Teshin 的洞穴', kind: 'acquisition-source', aliases: [], parentId: 'landscape.duviri', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.kullervos-hold', canonical: "Kullervo's Hold", displayName: 'Kullervo 的牢房', kind: 'acquisition-source', aliases: [], parentId: 'landscape.duviri', officialSource: 'DE Languages.bin /Lotus/Language/Duviri/MapLabelKullervosHold' },
    { id: 'acquisition-source.dagaths-hollow', canonical: "Dagath's Hollow", displayName: 'Dagath 的空阁', kind: 'acquisition-source', aliases: [], parentId: 'hub.clan-dojo', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.duviri-enigma', canonical: 'Duviri Enigma Puzzles', displayName: '双衍王境谜题', kind: 'acquisition-source', aliases: [], parentId: 'landscape.duviri', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.limited-event-store', canonical: 'Limited-time Event Store', displayName: '限时活动商店', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.acrithis-or-dominus-thrax', canonical: 'Acrithis or Dominus Thrax', displayName: '宿舍的 Acrithis 或 Dominus Thrax', kind: 'acquisition-source', aliases: [], parentId: 'hub.dormizone', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.albrecht-laboratories-endless', canonical: "Albrecht's Laboratories Endless Mission", displayName: '阿尔布雷希特的实验室无尽任务', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.balor-fomorian-sabotage', canonical: 'Balor Fomorian Sabotage', displayName: '巴罗尔巨人战舰破坏任务', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.sanctum-anatomica-bounty', canonical: 'Sanctum Anatomica Bounty', displayName: '圣所解剖室赏金', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.roathes-oblivion', canonical: "Roathe's Oblivion", displayName: '罗瑟的遗忘', kind: 'acquisition-source', aliases: ['罗瑟遗忘之境'], parentId: 'activity.the-descendia', officialSource: 'DE Languages.bin /Lotus/Language/CircleOfHell/CoHProtoframeDevil' },
    { id: 'acquisition-source.earth-proxima-void-storm', canonical: 'Earth Proxima Void Storm', displayName: '地球比邻星虚空风暴', kind: 'acquisition-source', aliases: [], officialSource: 'DE official drop tables' },
    { id: 'acquisition-source.venus-proxima-void-storm', canonical: 'Venus Proxima Void Storm', displayName: '金星比邻星虚空风暴', kind: 'acquisition-source', aliases: [], officialSource: 'DE official drop tables' },
    { id: 'acquisition-source.saturn-proxima-void-storm', canonical: 'Saturn Proxima Void Storm', displayName: '土星比邻星虚空风暴', kind: 'acquisition-source', aliases: [], officialSource: 'DE official drop tables' },
    { id: 'acquisition-source.invasion', canonical: 'Invasion Reward', displayName: '入侵任务', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.daily-tribute', canonical: 'Daily Tribute', displayName: '每日献礼里程碑', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.anniversary-alert', canonical: 'Anniversary Alert', displayName: '周年庆典警报', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.founder-package', canonical: 'Founder Package', displayName: '创始人礼包', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.kuva-lich-weapon', canonical: 'Kuva Lich Weapon Reward', displayName: '携带该武器的赤毒玄骸', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'acquisition-source.sister-weapon', canonical: 'Sister of Parvos Weapon Reward', displayName: '携带该武器的 Corpus 姐妹', kind: 'acquisition-source', aliases: [], officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'dojo.tenno-lab', canonical: 'Tenno Lab', displayName: 'Tenno 实验室', kind: 'acquisition-source', aliases: [], parentId: 'hub.clan-dojo', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'dojo.chem-lab', canonical: 'Chem Lab', displayName: '化学实验室', kind: 'acquisition-source', aliases: [], parentId: 'hub.clan-dojo', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'dojo.energy-lab', canonical: 'Energy Lab', displayName: '能源实验室', kind: 'acquisition-source', aliases: [], parentId: 'hub.clan-dojo', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'dojo.bio-lab', canonical: 'Bio Lab', displayName: '生物实验室', kind: 'acquisition-source', aliases: [], parentId: 'hub.clan-dojo', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'dojo.orokin-lab', canonical: 'Orokin Lab', displayName: '奥罗金实验室', kind: 'acquisition-source', aliases: [], parentId: 'hub.clan-dojo', officialSource: 'Warframe Wiki acquisition evidence' },
    { id: 'region.veil-proxima', canonical: 'Veil Proxima', displayName: '面纱比邻星域', kind: 'proxima-region', aliases: [], officialSource: 'DE official zh-hans terminology' },
    { id: 'landscape.duviri', canonical: 'Duviri', displayName: '双衍王境', kind: 'landscape', aliases: [], officialSource: 'Warframe Update 39 official zh-hans patch notes' },
    { id: 'mission-node.the-duviri-experience-solnode236', canonical: 'The Duviri Experience', displayName: '双衍历程', kind: 'mission-node', aliases: [], officialCode: 'SolNode236', identityAliases: ['SolNode236'], parentId: 'landscape.duviri', missionTypeId: 'mission-type.free-roam', localizationStatus: 'official-zh', officialSource: 'DE ExportRegions + Languages.bin snapshots' },
    { id: 'mission-node.the-lone-story-solnode237', canonical: 'The Lone Story', displayName: '孤独纪事', kind: 'mission-node', aliases: [], officialCode: 'SolNode237', identityAliases: ['SolNode237'], parentId: 'landscape.duviri', missionTypeId: 'mission-type.free-roam', localizationStatus: 'official-zh', officialSource: 'DE ExportRegions + Languages.bin snapshots' },
    { id: 'mission-node.isleweaver', canonical: 'Isleweaver', displayName: '织屿人', kind: 'mission-node', aliases: [], parentId: 'landscape.duviri', officialSource: 'Warframe Update 39 official zh-hans patch notes' }
  )
  if (fs.existsSync(OFFICIAL_DROPS)) {
    const dropIndex = JSON.parse(fs.readFileSync(OFFICIAL_DROPS, 'utf8'))
    for (const methods of Object.values(dropIndex.byItem || {})) for (const method of methods) {
      if (!method.locationId) continue
      const parsed = parseSource(method.sourceCanonical)
      if (parsed?.location) entries.push({ id: `planet.${slug(parsed.location)}`, canonical: parsed.location, displayName: PLANET_ZH[parsed.location] || '', kind: 'planet', aliases: [], officialSource: PLANET_ZH[parsed.location] ? 'audited-official-zh' : 'official-drop-canonical' })
      entries.push({ id: method.locationId, canonical: method.sourceCanonical, displayName: method.sourceDisplayName || '', kind: method.provenance?.section === 'Bounty Rewards' ? 'acquisition-source' : 'mission-node', aliases: [], parentId: parsed?.location ? `planet.${slug(parsed.location)}` : null, missionTypeId: method.missionTypeId || null, officialSource: method.provenance?.source || 'DE Official Drop Tables' })
    }
  }
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
  const byId = new Map()
  const legacyById = new Map(readIndexedEntries(ROOT, 'locations').map(entry => [entry.id, entry]))
  for (const entry of generatedEntries()) {
    const previous = legacyById.get(entry.id)
    const legacyType = previous?.missionTypeCanonical
    const officialOverride = ['hub.zariman','hub.pontis-tower','region.uranus-proxima','region.dark-refractory','activity.the-descendia','acquisition-source.roathes-oblivion','mission.the-kuva-wytch','mission.scorias-angel','acquisition-source.arbitration-honors','mission.grendel-archaeo-freighter','mission.grendel-icefields-of-riddah','mission.grendel-mines-of-karishh'].includes(entry.id)
    byId.set(entry.id, previous ? { ...entry, ...previous, displayName: officialOverride ? entry.displayName : previous.displayName || entry.displayName, aliases: officialOverride ? entry.aliases : previous.aliases || entry.aliases, officialSource: officialOverride ? entry.officialSource : previous.officialSource || entry.officialSource, parentId: entry.parentId || previous.parentId, missionTypeId: entry.missionTypeId || previous.missionTypeId || (legacyType ? `mission-type.${slug(legacyType)}` : null), missionTypeCanonical: undefined, missionTypeDisplayName: undefined } : entry)
  }
  return [...byId.values()]
}
function buildPlan() { return buildRegistryPlan({ type: 'locations', root: TARGET, entries: build(), categoryOf: entry => entry.kind, categoryNames: { planet: '星球', hub: '中继聚落', landscape: '开放世界', region: '区域', activity: '玩法', 'proxima-region': '比邻星域', 'railjack-mission': '航道星舰任务', 'mission-node': '任务节点', 'special-mission': '特殊任务', 'acquisition-source': '特殊获取来源' }, source: { generatedFrom: 'warframe-items Warframes component drops' } }) }
function run(argv = process.argv.slice(2)) { const check = argv.includes('--check'); const changes = applyRegistryPlan(buildPlan(), { check }); console.log(check ? `战甲来源地点变量无漂移：${build().length} 个` : `已同步 ${build().length} 个战甲来源地点变量；写入 ${changes.length} 项`) }
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { parseSource, generatedEntries, build, buildPlan, run }
