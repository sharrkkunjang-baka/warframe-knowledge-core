'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { buildRegistryPlan, applyRegistryPlan, walkJson } = require('./entity-registry-io')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'knowledge', 'curreicies')
const OFFICIAL_ITEMS = path.join(ROOT, 'knowledge', 'generated', 'official-items.json')
const CURRENCY_KINDS = new Set(['currency', 'currency-token', 'currency-token-material'])
const FRAME_CURRENCIES = Object.freeze([
  { canonical: 'Emerald Talent', displayName: '翠绿天赋', kind: 'exchange-token', officialUniqueName: '/Lotus/Types/JadeShadowsPart2Mission/Gameplay/Resources/AshFavor', officialSource: 'DE Languages.bin /Lotus/Language/JadeShadowsPart2Mission/JS2MAshFavorName', acquisitionDependency: { type: 'mission-completion', locationId: 'mission.the-kuva-wytch', missionTypeId: 'mission-type.skirmish', acquisition: { type: 'mission-completion', locationId: 'mission.the-kuva-wytch', normalAmount: { min: 12, max: 16 }, steelPathAmount: { min: 16, max: 20 }, bonus: '任务中的额外目标可增加结算数量' }, source: 'DE Languages.bin JS2MAshFavorDesc', reviewStatus: 'approved' } },
  { canonical: 'Crimson Talent', displayName: '猩红天赋', kind: 'exchange-token', officialUniqueName: '/Lotus/Types/JadeShadowsPart2Mission/Gameplay/Resources/GarudaFavor', officialSource: 'DE Languages.bin /Lotus/Language/JadeShadowsPart2Mission/JS2MGarudaFavorName', acquisitionDependency: { type: 'mission-completion', locationId: 'mission.scorias-angel', missionTypeId: 'mission-type.skirmish', acquisition: { type: 'mission-completion', locationId: 'mission.scorias-angel', normalAmount: { min: 12, max: 16 }, steelPathAmount: { min: 16, max: 20 }, bonus: '任务中的额外目标可增加结算数量' }, source: 'DE Languages.bin JS2MGarudaFavorDesc', reviewStatus: 'approved' } },
  { canonical: 'Jade Talent', displayName: '翠玉天赋', kind: 'exchange-token', officialSource: 'Warframe Wiki acquisition evidence for Sirius & Orion', acquisitionDependency: { type: 'mission-completion', locationId: 'region.uranus-proxima', missionTypeId: 'mission-type.skirmish', source: 'Warframe Wiki acquisition evidence', reviewStatus: 'approved' } },
  { canonical: 'Fergolyte', displayName: '铁离石', kind: 'resource-token', officialSource: 'Warframe Update 40 official zh-hans patch notes', acquisitionDependency: { type: 'bounty-completion-or-compost', questId: 'quest.the-new-war', locationId: 'hub.fortuna-airlock', npcId: 'npc.nightcap', bountyName: '深矿赏金', normalAmount: { min: 11, max: 15 }, steelPathAmount: { min: 15, max: 19 }, compostAmount: 1, source: 'Warframe Update 40 official zh-hans patch notes' } },
  { canonical: 'Atramentum', displayName: '墨痕', kind: 'exchange-token', officialUniqueName: '/Lotus/Types/Gameplay/Shadowgrapher/Resources/ShadowgrapherResource', officialSource: 'DE Languages.bin /Lotus/Language/Shadowgrapher/ShadowgrapherResourceName', acquisitionDependency: { type: 'mission-completion-or-container', questId: 'quest.chains-of-harrow', locationId: 'mission.follies-hunt', normalAmount: 15, steelPathAmount: 25, containerName: '墨痕气球', normalContainerAmount: { min: 2, max: 4 }, steelPathContainerAmount: { min: 3, max: 6 }, source: 'Official Wiki Atramentum acquisition', reviewStatus: 'approved' } },
  { canonical: 'Maphica', displayName: '怒火核', kind: 'exchange-token', officialUniqueName: '/Lotus/Types/Gameplay/TauPrequel/TauPrequelFinal/Resources/CoHResourceRareItem', officialSource: 'DE Languages.bin /Lotus/Language/TauPrequel/TauPrequelFinal/CoHResourceRareItemName', acquisitionDependency: { type: 'mission-reward-or-container', locationId: 'acquisition-source.roathes-oblivion', normalAmount: 5, steelPathAmount: 15, source: 'Official Wiki Maphica acquisition', reviewStatus: 'approved' } },
  { canonical: 'Vessel Capillaries', kind: 'resource-token', acquisitionDependency: { type: 'mission-enemy-drop', missionNodeId: 'mission-node.armatus', missionTypeId: 'mission-type.disruption', enemyRole: 'Demolisher', normalAmount: { min: 2, max: 4 }, steelPathAmount: { min: 5, max: 7 }, source: 'Dante Wiki Acquisition' } },
  { canonical: 'Stock', displayName: '存货储备', kind: 'exchange-token', officialSource: 'DE Languages.bin /Lotus/Language/Veilbreaker/KahlCredsName', acquisitionDependency: { acquisitionSummary: '完成卡尔每周的“击溃合一众”任务挑战获得，并同时推进卡尔驻军等级', sourceRefs: ['https://wiki.warframe.com/w/Kahl%27s_Garrison'], reviewStatus: 'approved' } },
  { canonical: 'Belric Crystal Fragment', kind: 'resource-token', acquisitionDependency: { acquisitionSummary: '在火星 Tyana Pass 镜像防御中收集水晶残留，并通过轮次结算获得', sourceRefs: ['https://wiki.warframe.com/w/Crystal_Fragment'], reviewStatus: 'approved' } },
  { canonical: 'Rania Crystal Fragment', kind: 'resource-token', acquisitionDependency: { acquisitionSummary: '在火星 Tyana Pass 镜像防御中收集水晶残留，并通过轮次结算获得', sourceRefs: ['https://wiki.warframe.com/w/Crystal_Fragment'], reviewStatus: 'approved' } },
  { canonical: 'Fate Pearl', kind: 'resource-token' },
  { canonical: 'Pathos Clamp', kind: 'resource-token' },
  { canonical: 'Lua Thrax Plasm', kind: 'resource-token' },
  { canonical: 'Vainthorn', kind: 'exchange-token' },
  { canonical: 'Scuttler Husks', displayName: '急行蛛外壳', kind: 'exchange-token', officialSource: 'Warframe Update 39 official zh-hans patch notes', acquisitionDependency: { acquisitionSummary: '完成双衍王境织屿人节点的复眠螺旋，在结尾击败接肢怪后获得：普通模式 3-5 个，钢铁之路 5-8 个', sourceRefs: ['https://www.warframe.com/zh-hans/patch-notes/pc/39-0-0'], reviewStatus: 'approved' } },
  { canonical: 'Vestigial Motes', kind: 'resource-token', acquisitionDependency: { acquisitionSummary: '完成天王星布鲁图斯的扬升任务结算获得，任务中的帕尔沃斯姐妹也会额外掉落', sourceRefs: ['https://wiki.warframe.com/w/Vestigial_Motes'], reviewStatus: 'approved' } },
  { canonical: 'Beating Heartstrings', kind: 'resource-token' },
  { canonical: 'Corrupted Holokey', displayName: '\u5815\u843d\u5168\u606f\u5bc6\u94a5', kind: 'resource-token', boosterEffects: { resourceAmount: 'unknown', resourceDropChance: 'unknown', exchangeCost: 'unaffected', scope: 'in-mission-pickups-only', evidence: [] }, officialUniqueName: '/Lotus/Types/Items/MiscItems/GranumBucks', officialSource: 'DE Public Export + Languages.bin', acquisitionDependency: { acquisitionSummary: '\u5b8c\u6210\u4e5d\u91cd\u5929\u865a\u7a7a\u98ce\u66b4\u6216\u5e15\u5c14\u6c83\u65af\u7684\u59d0\u59b9\u6700\u7ec8\u5bf9\u51b3\u83b7\u5f97', sourceRefs: ['https://wiki.warframe.com/w/Corrupted_Holokey', 'https://www.warframe.com/droptables'], reviewStatus: 'approved' } },
  { canonical: 'Live Heartcell', displayName: '\u6d3b\u4f53\u5fc3\u808c\u7ec6\u80de', kind: 'resource-token', boosterEffects: { resourceAmount: 'unknown', resourceDropChance: 'unknown', exchangeCost: 'unaffected', scope: 'in-mission-pickups-only', evidence: [] }, officialSource: 'wiki.warframe.com current page revision 2789931; Public Export stable identity unavailable', acquisitionDependency: { acquisitionSummary: '\u6d88\u706d\u79d1\u6280\u7ec6\u80de\u7ec8\u5e55\u8005\u83b7\u5f97\uff1b\u7ec8\u5e55\u6f14\u5531\u4f1a\u4e2d\u9996\u4e2a\u4e4b\u540e\u6bcf\u51fb\u8d25\u4e00\u540d\u7ec8\u5e55\u8005\u4e5f\u4f1a\u83b7\u5f97', sourceRefs: ['https://wiki.warframe.com/w/Live_Heartcell'], reviewStatus: 'approved' } },
  { canonical: 'Vitus Essence', kind: 'exchange-token' },
  { canonical: 'Mother Token', kind: 'exchange-token' },
  { canonical: 'Orokin Ducats', kind: 'standard' },
  { canonical: "Nora's Mix Vol. 8 Cred", kind: 'seasonal-token', acquisitionDependency: { acquisitionSummary: '完成午夜电波行动并提升午夜电波等级，从等级奖励中获得', sourceRefs: ['https://www.warframe.com/news/nightwave-guide'], reviewStatus: 'approved' } },
  { canonical: "Kullervo's Bane", kind: 'exchange-token', aliases: ['灾刃'], acquisitionDependency: { type: 'boss-and-spiral-completion', gameModeId: 'mission-node.the-duviri-experience-solnode236', locationId: 'acquisition-source.kullervos-hold', moodSpirals: ['恐惧', '愤怒', '悲伤'], bossName: 'Kullervo', finalBossName: '奥金魇龙', note: '刷取时请选择双衍历程；孤独纪事只有该战斗被选为复眠螺旋事件时才会出现，不能稳定前往挑战', sourceRefs: ['local-current-wiki-db: Kullervo#Acquisition', 'DE Languages.bin /Lotus/Language/Duviri/MapLabelKullervosHold', 'DE ExportRegions SolNode236'], reviewStatus: 'approved' } }
])
const ID_OVERRIDES = Object.freeze({ 'Corrupted Holokey': 'currency.corrupted-holokey', 'Live Heartcell': 'currency.live-heartcell', "Kullervo's Bane": 'currency.kullervos-bane', 'Emerald Talent': 'currency.emerald-talent', 'Crimson Talent': 'currency.crimson-talent', 'Jade Talent': 'currency.jade-talent' })
const CATEGORY_NAMES = Object.freeze({ standard: '通用货币', premium: '高级货币', standing: '声望', 'exchange-token': '兑换代币', 'resource-token': '资源代币', 'seasonal-token': '赛季代币' })
function officialByCanonical() { const data = JSON.parse(fs.readFileSync(OFFICIAL_ITEMS, 'utf8')); return new Map((data.items || []).map(item => [item.canonical, item])) }
function stableSuffix(uniqueName) { return crypto.createHash('sha256').update(String(uniqueName)).digest('hex').slice(0, 8) }
function officialCurrencyKind(item) {
  if (/\/Nora(?:Intermission|Season|Wolf|Infested)/i.test(item.uniqueName || '')) return 'seasonal-token'
  const kinds = new Set(item.semanticKinds || [])
  if (kinds.has('currency')) return 'standard'
  if (kinds.has('currency-token-material')) return 'resource-token'
  return 'exchange-token'
}
function officialCurrencies() {
  const data = JSON.parse(fs.readFileSync(OFFICIAL_ITEMS, 'utf8'))
  return (data.items || []).filter(item => (item.semanticKinds || []).some(kind => CURRENCY_KINDS.has(kind)))
}
function build() {
  const byId = new Map(walkJson(TARGET).filter(file => path.basename(file) !== 'categories.json').map(file => JSON.parse(fs.readFileSync(file, 'utf8'))).map(entry => [entry.id, entry]))
  const existingByUniqueName = new Map([...byId.values()].filter(entry => entry.officialUniqueName).map(entry => [entry.officialUniqueName, entry]))
  const existingByCanonical = new Map([...byId.values()].map(entry => [entry.canonical, entry]))
  const officialEntries = officialCurrencies()
  const canonicalCounts = new Map(officialEntries.map(item => [item.canonical, officialEntries.filter(candidate => candidate.canonical === item.canonical).length]))
  for (const item of officialEntries) {
    if (!item.uniqueName || !item.displayName) throw new Error(`${item.canonical}: 官方货币身份或显示名不完整`)
    const previous = existingByUniqueName.get(item.uniqueName)
      || (canonicalCounts.get(item.canonical) === 1 ? existingByCanonical.get(item.canonical) : null)
      || {}
    const baseId = ID_OVERRIDES[item.canonical] || `currency.${item.canonical.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    const duplicateCanonical = canonicalCounts.get(item.canonical) > 1
    const id = previous.id || (duplicateCanonical ? `${baseId}-${stableSuffix(item.uniqueName)}` : baseId)
    byId.set(id, {
      ...previous,
      id,
      canonical: item.canonical,
      displayName: item.displayName,
      kind: previous.kind || officialCurrencyKind(item),
      aliases: previous.aliases || [],
      officialUniqueName: item.uniqueName,
      officialSource: previous.officialSource || 'knowledge/generated/official-items.json (DE Languages.bin / Public Export)',
      localizationStatus: item.localizationStatus,
      semanticKinds: item.semanticKinds || [],
      reviewStatus: previous.reviewStatus || 'draft',
      ...(duplicateCanonical ? { registryFileName: `${item.canonical.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${stableSuffix(item.uniqueName)}` } : {})
    })
  }
  const official = officialByCanonical()
  for (const definition of FRAME_CURRENCIES) {
    const item = official.get(definition.canonical)
    if ((!item || item.localizationStatus !== 'official-zh') && !definition.displayName) throw new Error(`${definition.canonical}: 官方物品目录缺少官方中文`)
    const id = ID_OVERRIDES[definition.canonical] || `currency.${definition.canonical.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    for (const [existingId, existing] of byId) if (existing.canonical === definition.canonical && existingId !== id) byId.delete(existingId)
    const previous = byId.get(id) || {}
    byId.set(id, { ...previous, id, canonical: definition.canonical, displayName: definition.displayName || item.displayName, kind: definition.kind, aliases: definition.aliases || previous.aliases || [], ...(definition.officialUniqueName || item?.uniqueName ? { officialUniqueName: definition.officialUniqueName || item.uniqueName } : {}), officialSource: definition.officialSource || 'knowledge/generated/official-items.json', ...(definition.acquisitionDependency ? { acquisitionDependency: definition.acquisitionDependency } : {}), ...((definition.boosterEffects || previous.boosterEffects) ? { boosterEffects: definition.boosterEffects || previous.boosterEffects } : {}) })
  }
  return [...byId.values()]
}
function buildPlan() { return buildRegistryPlan({ type: 'curreicies', root: TARGET, entries: build(), categoryOf: entry => entry.kind, categoryNames: CATEGORY_NAMES, source: { generatedFrom: 'official-items.json + audited frame exchange definitions' } }) }
function run(argv = process.argv.slice(2)) { const check = argv.includes('--check'); const plan = buildPlan(); const changes = applyRegistryPlan(plan, { check }); console.log(check ? `战甲兑换货币变量无漂移：${plan.index.count} 个` : `已同步 ${plan.index.count} 个战甲兑换货币变量；写入 ${changes.length} 项`) }
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { FRAME_CURRENCIES, build, buildPlan, run }
