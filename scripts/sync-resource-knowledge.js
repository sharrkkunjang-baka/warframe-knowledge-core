'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '..')
const RESOURCE_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'resource')
const ENTRY_ROOT = path.join(RESOURCE_ROOT, 'entries')
const INDEX_PATH = path.join(RESOURCE_ROOT, 'categories.json')
const OFFICIAL_PATH = path.join(ROOT, 'knowledge', 'generated', 'official-items.json')
const RESOURCE_CATALOG_PATH = path.join(ROOT, 'generated', 'resource-asset-catalog.json')
const RESOURCE_CATALOG = fs.existsSync(RESOURCE_CATALOG_PATH) ? JSON.parse(fs.readFileSync(RESOURCE_CATALOG_PATH, 'utf8')) : { entries: [] }
const ASSET_BY_UNIQUE = new Map((RESOURCE_CATALOG.entries || []).map(entry => [entry.stableIdentity?.uniqueName, entry]))
const RESOURCE_KINDS = new Set([
  'resource', 'material', 'material-or-usable', 'mineral', 'plant', 'fish', 'fish-part',
  'fish-bait', 'conservation-tag', 'upgrade-item', 'key'
])
const REVIEWED_RESOURCE_ROUTES = Object.freeze({
  'Stela': {
    description: '在火卫二阿尔布雷希特的实验室赏金 C轮奖励中获得。',
    methods: [
      { type: 'mission-reward', sourceDisplayName: '阿尔布雷希特的实验室 115-120 级赏金 C轮', locationDisplayName: '阿尔布雷希特的实验室（火卫二）', missionTypeDisplayName: '赏金', rotation: 'C', quantity: 15, chance: 0.084, requirements: { type: 'none' }, reviewStatus: 'approved', provenance: { source: 'wiki.warframe.com current acquisition + DE Official Drop Tables', sourceCanonical: "Deimos/Albrecht's Laboratories (Level 115 - 120 Entrati Lab Bounty), Rotation C" } },
      { type: 'mission-reward', sourceDisplayName: '阿尔布雷希特的实验室 95-100 级赏金 C轮', locationDisplayName: '阿尔布雷希特的实验室（火卫二）', missionTypeDisplayName: '赏金', rotation: 'C', quantity: 15, chance: 0.0877, requirements: { type: 'none' }, reviewStatus: 'approved', provenance: { source: 'wiki.warframe.com current acquisition + DE Official Drop Tables', sourceCanonical: "Deimos/Albrecht's Laboratories (Level 95 - 100 Entrati Lab Bounty), Rotation C" } }
    ],
    provenance: { source: 'wiki.warframe.com current acquisition + DE Official Drop Tables', fetchedAt: '2026-07-22' }
  },
  'Steel Essence': {
    description: '钢铁之路专属资源，可在中继站的 Teshin「钢铁之路荣誉」商店消费。',
    aliases: ['小小黑精华'],
    methods: [
      { type: 'enemy-drop', sourceDisplayName: '追随者（焦虑、怨恨、躁狂、苦难、折磨、暴力）', quantity: 2, chance: 1, variables: { appearanceCondition: '任意可生成追随者的钢铁之路任务' }, requirements: { type: 'mode', modeId: 'steel-path' }, reviewStatus: 'approved' },
      { type: 'mission-reward', sourceDisplayName: '钢铁之路虚空裂缝', quantity: 1, chance: 1, variables: { objective: '开启 1 个虚空遗物' }, requirements: { type: 'none' }, reviewStatus: 'approved' },
      { type: 'mission-reward', sourceDisplayName: '钢铁无尽回廊第 9 阶段', quantity: 25, chance: 1, requirements: { type: 'none' }, reviewStatus: 'approved' },
      { type: 'mission-reward', sourceDisplayName: '每日钢铁之路侵袭', quantity: 5, chance: 1, variables: { objective: '完成每项侵袭；每日 6 项，共 30 个' }, requirements: { type: 'none' }, reviewStatus: 'approved' },
      { type: 'enemy-drop', sourceEntityId: 'enemy.tusk-thumper', sourceDisplayName: '巨牙重击者、巨牙重击者公牛、巨牙重击者朵玛', quantity: 1, chance: 1, variables: { appearanceCondition: '钢铁之路夜灵平野', sourceEntityIds: ['enemy.tusk-thumper', 'enemy.tusk-thumper-bull', 'enemy.tusk-thumper-doma'] }, requirements: { type: 'mode', modeId: 'steel-path' }, reviewStatus: 'approved' },
      { type: 'mission-reward', sourceDisplayName: '钢铁之路星球节点全清', quantity: 25, chance: 1, variables: { objective: '首次清完一个星球的全部节点' }, requirements: { type: 'none' }, reviewStatus: 'approved' },
      { type: 'mission-reward', sourceDisplayName: '钢铁之路双衍王境奥金魇龙宝箱', quantity: 5, chance: 1, requirements: { type: 'none' }, reviewStatus: 'approved' },
      { type: 'mission-reward', sourceDisplayName: '钢铁之路双衍王境体验额外地穴传送门', quantity: 2, chance: 1, variables: { objective: '每个额外传送门 2 个，每轮最多 6 个' }, requirements: { type: 'none' }, reviewStatus: 'approved' },
      { type: 'mission-reward', sourceDisplayName: '钢铁之路深渊区', quantity: 1, chance: 1, requirements: { type: 'none' }, reviewStatus: 'approved' },
      { type: 'enemy-drop', sourceEntityId: 'enemy.the-fragmented-one', quantity: 1, chance: 1, variables: { appearanceCondition: '钢铁之路 Effervo（火卫二）' }, requirements: { type: 'mode', modeId: 'steel-path' }, reviewStatus: 'approved' },
      { type: 'mission-reward', sourceDisplayName: '钢铁之路沉沦之地第 18 层', quantity: 25, chance: 1, variables: { objective: '每周首次达到第 18 层' }, requirements: { type: 'none' }, reviewStatus: 'approved' }
    ],
    provenance: { source: 'current wiki Steel Essence oldid 2764337 + DE Official Drop Tables', fetchedAt: '2026-07-22' }
  },
  'Corrupted Holokey': {
    description: '用于在中继站向 Ergo Glast 购买轮换的信条近战武器；这是消费用途，不是获取来源。',
    methods: [
      ...[
        ['地球比邻星域虚空风暴', 1, 3, 0.375], ['金星比邻星域虚空风暴', 1, 3, 0.375],
        ['土星比邻星域虚空风暴', 1, 5, 0.3571], ['海王星比邻星域虚空风暴', 1, 4, 0.3571],
        ['冥王星比邻星域虚空风暴', 1, 6, 0.375], ['面纱比邻星域虚空风暴', 2, 10, 0.375]
      ].flatMap(([sourceDisplayName, guaranteed, bonus, chance]) => [
        { type: 'mission-reward', sourceDisplayName, quantity: guaranteed, chance: 1, variables: { rewardKind: '任务完成保底' }, requirements: { type: 'none' }, reviewStatus: 'approved' },
        { type: 'mission-reward', sourceDisplayName, quantity: bonus, chance, variables: { rewardKind: '任务结算额外奖励' }, requirements: { type: 'none' }, reviewStatus: 'approved' }
      ]),
      { type: 'mission-reward', sourceDisplayName: '海王星比邻星域帕尔沃斯的姐妹最终对决', quantityRange: [1, 4], chance: 1, variables: { objective: '每名被击败或感化的姐妹都会让每位队员获得 1 个；满队最多 4 个' }, requirements: { type: 'none' }, reviewStatus: 'approved' }
    ],
    provenance: { source: 'current wiki Corrupted Holokey oldid 2770468 + DE Official Drop Tables', fetchedAt: '2026-07-22' }
  }
})

const TOROID_FAMILY = Object.freeze({
  '/Lotus/Types/Gameplay/Venus/Resources/ArachnoidMicroidItem': {
    aliases: ['维加环形装置'],
    methods: [
      { type: 'enemy-drop', sourceEntityId: 'enemy.mite-raknoid', locationId: 'landscape.orb-vallis', chance: 0.01, requirements: { type: 'none' }, reviewStatus: 'approved' },
      { type: 'open-world-gathering', locationId: 'landscape.orb-vallis', sourceDisplayName: '奥布山谷航天站及洞穴', requirements: { type: 'none' }, reviewStatus: 'approved' }
    ]
  },
  '/Lotus/Types/Gameplay/Venus/Resources/ArachnoidHungerItem': {
    aliases: ['告达环形装置'],
    methods: [
      { type: 'enemy-drop', sourceEntityId: 'enemy.scyto-raknoid', locationId: 'landscape.orb-vallis', chance: 0.2, requirements: { type: 'none' }, reviewStatus: 'approved' },
      { type: 'open-world-gathering', locationId: 'landscape.orb-vallis', sourceDisplayName: '奥布山谷升华实验室及洞穴', requirements: { type: 'none' }, reviewStatus: 'approved' }
    ]
  },
  '/Lotus/Types/Gameplay/Venus/Resources/ArachnoidWraithItem': {
    aliases: ['索拉环形装置'],
    methods: [
      { type: 'enemy-drop', sourceEntityId: 'enemy.kyta-raknoid', locationId: 'landscape.orb-vallis', chance: 0.2, requirements: { type: 'none' }, reviewStatus: 'approved' },
      { type: 'open-world-gathering', locationId: 'landscape.orb-vallis', sourceDisplayName: '奥布山谷润盈殿及洞穴', requirements: { type: 'none' }, reviewStatus: 'approved' }
    ]
  },
  '/Lotus/Types/Gameplay/Venus/Resources/ArachnoidCamperTerraItem': {
    aliases: ['天蓝环形装置'],
    methods: [{ type: 'enemy-drop', sourceEntityId: 'enemy.exploiter-orb', locationId: 'landscape.orb-vallis', hideProbability: true, requirements: { type: 'none' }, reviewStatus: 'approved' }]
  },
  '/Lotus/Types/Gameplay/Venus/Resources/ArachnoidCamperItem': {
    aliases: ['圣油环形装置'],
    methods: [{ type: 'enemy-drop', sourceEntityId: 'enemy.profit-taker-orb', locationId: 'landscape.orb-vallis', hideProbability: true, requirements: { type: 'none' }, reviewStatus: 'approved' }]
  }
})
const { readIndexedEntries, normalizeEntityName } = require('../src/entities')
const LOCATIONS = readIndexedEntries(ROOT, 'locations')
const LOCATION_BY_NAME = new Map(LOCATIONS.flatMap(entry => [entry.id, entry.canonical, entry.displayName, ...(entry.aliases || [])].filter(Boolean).map(name => [normalizeEntityName(name), entry])))

function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function stableSuffix(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8) }
function serialize(value) { return JSON.stringify(value, null, 2) + '\n' }
function isResource(item) { return (item.semanticKinds || []).some(kind => RESOURCE_KINDS.has(kind)) }
function readEntries() {
  if (!fs.existsSync(ENTRY_ROOT)) return []
  return fs.readdirSync(ENTRY_ROOT).filter(file => file.endsWith('.json')).map(file => ({ file, value: JSON.parse(fs.readFileSync(path.join(ENTRY_ROOT, file), 'utf8')) }))
}
function generatedSources(item) {
  return (item.drops || []).map(drop => ({
    type: isVendorOffer(drop) ? 'raw-official-vendor-offer' : 'raw-official-drop', canonical: String(drop.location || '').trim(), chance: Number.isFinite(Number(drop.chance)) ? Number(drop.chance) : null,
    rarity: drop.rarity || null, reviewStatus: 'pending'
  })).filter(source => source.canonical)
}
function isVendorOffer(drop) {
  const source = String(drop?.location || '').trim()
  if (Number(drop?.chance) !== 1 || !source || /(?:\/|Rotation|Bounty)/i.test(source)) return false
  return /\([^)]*\)\s*,\s*[^,]+$/.test(source) || /,\s*[A-Za-z][A-Za-z '\-]+$/.test(source)
}
function descriptionLocations(item) {
  const description = String(item.description?.canonical || '')
  const match = description.match(/(?:^|\n)Location:\s*([^\n]+)/i)
  if (!match) return []
  return match[1].replace(/^Missions? in\s+/i, '').split(/\s*,\s*|\s+and\s+/i).map(name => name.trim().replace(/^the\s+/i, '')).filter(Boolean).map(name => LOCATION_BY_NAME.get(normalizeEntityName(name))).filter(Boolean)
}
function descriptionActivityRouting(item) {
  const canonical = String(item.description?.canonical || '')
  const display = String(item.description?.display || '')
  const source = canonical.match(/(?:^|\n)Location:\s*([^\n]+?)\s+Missions?\s+on\s+([^\n]+)\s*$/i)
  const localized = display.match(/(?:^|\n)获取地点[：:]\s*([^\n]+)\s*$/)
  if (!source || !localized) return null
  const location = LOCATION_BY_NAME.get(normalizeEntityName(source[2]))
  if (!location?.displayName) return null
  const activityText = localized[1].trim()
  const prefix = `${location.displayName}上的`
  if (!activityText.startsWith(prefix) || activityText.length <= prefix.length) return null
  return {
    category: 'resource-activity',
    variables: { resourceName: item.displayName, locationIds: [location.id], activityName: activityText.slice(prefix.length) },
    status: 'compiled'
  }
}
function orbVallisBountyMethods(item) {
  const unique = new Map()
  for (const drop of item.drops || []) {
    const match = String(drop.location || '').match(/^Venus\/Orb Vallis \(Level (\d+) - (\d+) (Orb Vallis Bounty|PROFIT-TAKER - PHASE (\d+))\), Rotation ([A-C])$/i)
    if (!match) continue
    const type = match[3].startsWith('PROFIT') ? 'heist-reward' : 'bounty-reward'
    const label = type === 'heist-reward' ? `利润收割者抢劫第 ${match[4]} 阶段 C轮` : `奥布山谷 ${match[1]}-${match[2]} 级赏金 ${match[5]}轮`
    const key = `${type}:${label}`
    const previous = unique.get(key)
    const chance = Number(drop.chance)
    if (!previous || chance > previous.chance) unique.set(key, {
      type,
      locationId: 'landscape.orb-vallis',
      npcId: type === 'bounty-reward' ? 'npc.eudico' : 'npc.little-duck',
      sourceDisplayName: label,
      rotation: match[5],
      chance,
      requirements: { type: 'none' },
      reviewStatus: 'approved',
      provenance: { source: 'DE Official Drop Tables', sourceCanonical: drop.location }
    })
  }
  return [...unique.values()]
}
function localizedDropRouting(item) {
  if (item.localizationStatus !== 'official-zh' || !(item.drops || []).length) return null
  const locationText = String(item.description?.display || '').match(/(?:^|\n)获取地点[：:]\s*([^\n]+)/)?.[1]?.replace(/[。.]$/, '')
  if (!locationText) return null
  const clauses = locationText.split(/\s*[、；]\s*/).map(value => value.trim()).filter(Boolean)
  const enemyClause = clauses.find(value => /敌人|头目|单位/.test(value))
  const missionClause = clauses.find(value => /任务|轮|赏金|生存|扰乱|防御|间谍|刺杀/.test(value) && value !== enemyClause)
  const enemyDrops = item.drops.filter(drop => !/[\/]|Rotation|Bounty/i.test(String(drop.location || '')))
  const missionDrops = item.drops.filter(drop => /[\/]|Rotation|Bounty/i.test(String(drop.location || '')))
  const methods = []
  const safeClause = value => String(value || '').replace(/\b[A-Za-z][A-Za-z0-9' -]*\s*[（(]([^）)]+)[）)]/g, '$1').trim()
  if (enemyClause && enemyDrops.length && enemyDrops.every(drop => Number.isFinite(Number(drop.chance)))) methods.push({
    type: 'enemy-drop', sourceDisplayName: safeClause(enemyClause), chance: Math.max(...enemyDrops.map(drop => Number(drop.chance))),
    requirements: { type: 'none' }, reviewStatus: 'approved',
    provenance: { source: 'official-localized-description-and-drop-table', sourceCount: enemyDrops.length }
  })
  if (missionClause && missionDrops.length && missionDrops.every(drop => Number.isFinite(Number(drop.chance)))) methods.push({
    type: 'mission-reward', sourceDisplayName: safeClause(missionClause), chance: Math.max(...missionDrops.map(drop => Number(drop.chance))),
    requirements: { type: 'none' }, reviewStatus: 'approved',
    provenance: { source: 'official-localized-description-and-drop-table', sourceCount: missionDrops.length }
  })
  return methods.length
    ? { category: 'resource-current-wiki', variables: { resourceName: item.displayName }, methods, status: 'compiled' }
    : null
}
function orbVallisRouting(item) {
  const uniqueName = String(item.uniqueName || '')
  if (!/^\/Lotus\/(?:Types\/Gameplay\/Venus|Types\/Items\/Solaris|Types\/Items\/Gems\/Solaris|Types\/Items\/Fish\/Solaris)/.test(uniqueName)) return null
  const asset = ASSET_BY_UNIQUE.get(uniqueName)
  const kinds = new Set(item.semanticKinds || [])
  const methods = []
  if (/\/DebtToken[A-E]$/.test(uniqueName)) {
    methods.push(...orbVallisBountyMethods(item), {
      type: 'vendor-purchase', npcId: 'npc.ticker', locationId: 'hub.fortuna',
      sourceDisplayName: 'Ticker 债务债券轮换库存', requirements: { type: 'none' }, reviewStatus: 'approved',
      provenance: { source: 'DE Public Export official localized description' }
    })
  } else if (/\/CorpusWidget[A-C]Item$/.test(uniqueName)) {
    methods.push(...orbVallisBountyMethods(item))
    const offers = {
      CorpusWidgetAItem: { standing: 1000, rank: 1, rankName: 'Operative' },
      CorpusWidgetBItem: { standing: 2500, rank: 2, rankName: 'Agent' },
      CorpusWidgetCItem: { standing: 5000, rank: 3, rankName: 'Hand' }
    }
    const offer = offers[uniqueName.split('/').at(-1)]
    methods.push({ type: 'syndicate-exchange', npcId: 'npc.little-duck', locationId: 'hub.fortuna', sourceDisplayName: '索拉里斯之声', requiredLevel: offer.rank, standing: offer.standing, variables: { rankName: offer.rankName }, requirements: { type: 'standing', npcId: 'npc.little-duck', locationId: 'hub.fortuna', rank: offer.rank, rankName: offer.rankName, amount: offer.standing }, reviewStatus: 'approved', provenance: { source: 'current wiki cache Acquisition section' } })
  } else if (kinds.has('mineral')) {
    const refined = asset?.category === 'mineral-refined'
    methods.push({
      type: refined ? 'vendor-processing' : 'open-world-gathering',
      npcId: refined ? 'npc.smokefinger' : null,
      locationId: refined ? 'hub.fortuna' : 'landscape.orb-vallis',
      sourceDisplayName: refined ? 'SMOKEFINGER 的矿物精炼蓝图' : '奥布山谷矿脉',
      variables: { activityName: refined ? '使用对应原矿制造' : '采矿' },
      requirements: { type: 'none' }, reviewStatus: 'approved',
      provenance: { source: 'DE Public Export mineral identity and current Wiki resource directory' }
    })
  } else if (kinds.has('fish')) {
    methods.push({ type: 'open-world-gathering', locationId: 'landscape.orb-vallis', sourceDisplayName: '奥布山谷水域', variables: { activityName: '捕鱼' }, requirements: { type: 'none' }, reviewStatus: 'approved', provenance: { source: 'DE Public Export fish identity' } })
  } else if (kinds.has('fish-part')) {
    const fish = asset?.officialRelations?.sourceFishCanonicals || []
    const allServofish = item.canonical === 'Scrap'
    if (fish.length || allServofish) methods.push({ type: 'resource-processing', npcId: 'npc.the-business', locationId: 'hub.fortuna', sourceDisplayName: allServofish ? '拆解任意伺服鱼' : `拆解${fish.join('、')}`, variables: { sourceFishCanonicals: fish, allServofish }, requirements: { type: 'none' }, reviewStatus: 'approved', provenance: { source: allServofish ? 'current wiki cache Acquisition section revision 2711731' : 'DE Public Export official fish-part description' } })
  } else if (kinds.has('conservation-tag')) {
    methods.push({ type: 'open-world-conservation', npcId: 'npc.the-business', locationId: 'landscape.orb-vallis', sourceDisplayName: `奥布山谷保育捕获：${item.displayName.replace(/标签$/, '')}`, requirements: { type: 'none' }, reviewStatus: 'approved', provenance: { source: 'DE Public Export conservation-tag identity' } })
  } else if (kinds.has('resource')) {
    const description = String(item.description?.canonical || '')
    if (/Location:\s*Orb Vallis on Venus/i.test(description)) {
      methods.push({ type: 'open-world-gathering', locationId: 'landscape.orb-vallis', sourceDisplayName: '奥布山谷野外资源容器或植物', requirements: { type: 'none' }, reviewStatus: 'approved', provenance: { source: 'DE Public Export official localized description' } })
      methods.push(...orbVallisBountyMethods(item))
    }
  }
  if (!methods.length) return null
  return { category: 'resource-current-wiki', variables: { resourceName: item.displayName }, methods, status: 'compiled' }
}
function automaticRouting(item) {
  const orbVallis = orbVallisRouting(item)
  if (orbVallis) return orbVallis
  const activity = descriptionActivityRouting(item)
  if (activity && item.localizationStatus === 'official-zh') return activity
  const locations = [...new Map(descriptionLocations(item).map(entry => [entry.id, entry])).values()]
  if (locations.length && item.localizationStatus === 'official-zh') {
    const semantic = new Set(item.semanticKinds || [])
    const variables = { resourceName: item.displayName, locationIds: locations.map(entry => entry.id) }
    if (semantic.has('mineral')) return { category: 'resource-gathering', variables: { ...variables, activityName: '采矿' }, status: 'compiled' }
    if (semantic.has('plant')) return { category: 'resource-gathering', variables: { ...variables, activityName: '扫描植物' }, status: 'compiled' }
    if (semantic.has('fish-part')) return { category: 'resource-gathering', variables: { ...variables, activityName: '捕鱼' }, status: 'compiled' }
    return { category: 'resource-location', variables, status: 'compiled' }
  }
  return localizedDropRouting(item)
}
function buildEntry(item, old) {
  const previousManual = old?.resourceAcquisition?.manual || {}
  const reviewedRoute = REVIEWED_RESOURCE_ROUTES[item.canonical] || null
  const toroid = TOROID_FAMILY[item.uniqueName] || null
  const toroidRouting = toroid ? {
    category: 'resource-current-wiki',
    variables: { resourceName: item.displayName },
    methods: toroid.methods,
    status: 'compiled'
  } : null
  const reviewedRouting = reviewedRoute ? {
    category: 'resource-current-wiki', variables: { resourceName: item.displayName },
    methods: reviewedRoute.methods.map(method => ({ ...method, provenance: reviewedRoute.provenance })), status: 'compiled'
  } : null
  const previousRoutingOverride = previousManual.routingOverride
  const staleReviewedOverride = previousRoutingOverride?.methods?.some(method =>
    ['DE Official Drop Tables reviewed resource route', 'official-localized-description-and-drop-table'].includes(method?.provenance?.source))
  const preservedRoutingOverride = staleReviewedOverride ? null : previousRoutingOverride
  const manual = {
    tips: Array.isArray(previousManual.tips) ? previousManual.tips : [],
    tipKeywords: Array.isArray(previousManual.tipKeywords) ? previousManual.tipKeywords : [],
    ...(previousManual.presentationText ? { presentationText: previousManual.presentationText } : {}),
    ...((previousManual.description || reviewedRoute?.description) ? { description: previousManual.description || reviewedRoute.description } : {}),
    // 此表中的审核路由由生成器维护；重建时用最新审核事实替换旧的同源路由。
    // 其他资源仍严格保留人工 routingOverride，不受影响。
    routingOverride: reviewedRouting || preservedRoutingOverride || toroidRouting,
    reviewedBy: Array.isArray(previousManual.reviewedBy) && previousManual.reviewedBy.length ? previousManual.reviewedBy : reviewedRoute ? ['current-wiki-and-de-drop-table-audit-2026-07-22'] : toroid ? ['de-public-export-and-current-wiki-audit'] : []
  }
  const sources = generatedSources(item)
  const automatic = automaticRouting(item)
  const existingGeneratedRouting = old?.resourceAcquisition?.generated?.routing
  const routing = reviewedRouting || preservedRoutingOverride || toroidRouting || automatic || existingGeneratedRouting || { category: 'resource-unresolved', variables: { resourceName: item.displayName || item.canonical }, status: sources.length ? 'review-required' : 'unresolved' }
  manual.routingOverride = reviewedRouting || preservedRoutingOverride || toroidRouting
  const generated = {
    officialUniqueName: item.uniqueName,
    canonical: item.canonical,
    displayName: item.displayName,
    localizationStatus: item.localizationStatus,
    semanticKinds: item.semanticKinds || [],
    evidence: sources,
    routing
  }
  return {
    id: `knowledge.acquisition.resource.${slug(item.canonical)}`,
    kind: 'knowledge', module: 'acquisition', title: item.canonical,
    subject: { canonical: item.canonical, displayName: item.displayName, category: 'resource', officialUniqueName: item.uniqueName, categoryRefs: [routing.category], ...(toroid ? { roleTags: ['resource', 'exchange-token', 'standing-turn-in'] } : {}) },
    ...((old?.aliases?.length || toroid?.aliases?.length || reviewedRoute?.aliases?.length) ? { aliases: [...new Set([...(old?.aliases || []), ...(toroid?.aliases || []), ...(reviewedRoute?.aliases || [])])] } : {}),
    prerequisites: Array.isArray(old?.prerequisites) ? old.prerequisites : [], methodRefs: Array.isArray(old?.methodRefs) ? old.methodRefs : [],
    resourceAcquisition: { generated, manual },
    sources: [{ url: 'https://github.com/WFCD/warframe-items', label: 'warframe-items / Warframe Public Export' }],
    gameVersion: 'current', updatedAt: old?.updatedAt || new Date().toISOString().slice(0, 10),
    reviewStatus: routing.status === 'compiled' || routing.status === 'approved' || manual.routingOverride || old?.reviewStatus === 'approved' ? 'approved' : 'draft',
    reviewedBy: manual.routingOverride ? manual.reviewedBy : old?.reviewStatus === 'approved' && Array.isArray(old.reviewedBy) && old.reviewedBy.length ? old.reviewedBy : ['compiled', 'approved'].includes(routing.status) ? ['official-resource-sync'] : manual.reviewedBy,
    summary: `${item.displayName || item.canonical}的资源身份与获取证据。`, tags: ['acquisition', 'resource', 'official-generated']
  }
}
function buildPlan() {
  const official = JSON.parse(fs.readFileSync(OFFICIAL_PATH, 'utf8'))
  const existing = readEntries()
  const externallyManaged = existing
    .map(item => item.value)
    .filter(entry => entry.generator?.name && entry.generator.name !== 'sync-resource-knowledge')
  const byUnique = new Map(existing.map(item => [item.value.subject?.officialUniqueName, item.value]))
  const byCanonical = new Map(existing.map(item => [item.value.subject?.canonical, item.value]))
  const deduped = new Map()
  const officialResources = official.items.filter(isResource)
  const canonicalCounts = new Map(officialResources.map(item => [
    item.canonical,
    officialResources.filter(candidate => candidate.canonical === item.canonical).length
  ]))
  for (const item of officialResources) {
    const old = byUnique.get(item.uniqueName) || byCanonical.get(item.canonical)
    const entry = buildEntry(item, old)
    if (canonicalCounts.get(item.canonical) > 1) entry.id = `knowledge.acquisition.resource.${slug(item.canonical)}.${stableSuffix(item.uniqueName)}`
    deduped.set(entry.subject.officialUniqueName, entry)
  }
  const resourceCatalog = fs.existsSync(RESOURCE_CATALOG_PATH)
    ? JSON.parse(fs.readFileSync(RESOURCE_CATALOG_PATH, 'utf8'))
    : { entries: [] }
  for (const catalogEntry of resourceCatalog.entries || []) {
    if (catalogEntry.category === 'token-or-currency') continue
    const identity = catalogEntry.stableIdentity || {}
    if (!identity.uniqueName || deduped.has(identity.uniqueName)) continue
    const item = {
      uniqueName: identity.uniqueName,
      canonical: identity.canonical,
      displayName: identity.displayName,
      localizationStatus: catalogEntry.localizationStatus,
      semanticKinds: catalogEntry.semanticKinds || [],
      description: {},
      drops: []
    }
    const old = byUnique.get(item.uniqueName) || byCanonical.get(item.canonical)
    const entry = buildEntry(item, old)
    entry.resourceAcquisition.generated.evidence = [{
      type: 'current-wiki-directory',
      pageId: catalogEntry.evidence?.wikiDirectory?.pageId || null,
      revisionId: catalogEntry.evidence?.wikiDirectory?.revisionId || null,
      reviewStatus: 'approved'
    }]
    deduped.set(entry.subject.officialUniqueName, entry)
  }
  for (const entry of externallyManaged) {
    const key = entry.subject.officialUniqueName || entry.id
    deduped.set(key, entry)
  }
  const entries = [...deduped.values()].sort((a, b) => a.subject.canonical.localeCompare(b.subject.canonical, 'en'))
  const entryCanonicalCounts = new Map(entries.map(entry => [
    entry.subject.canonical,
    entries.filter(candidate => candidate.subject.canonical === entry.subject.canonical).length
  ]))
  const filename = entry => `${slug(entry.subject.canonical)}${entryCanonicalCounts.get(entry.subject.canonical) > 1 ? `-${stableSuffix(entry.subject.officialUniqueName || entry.id)}` : ''}.json`
  const index = { schemaVersion: 1, generatedAt: new Date().toISOString().slice(0, 10), count: entries.length, resources: entries.map(entry => ({ canonical: entry.subject.canonical, displayName: entry.subject.displayName, officialUniqueName: entry.subject.officialUniqueName, file: `entries/${filename(entry)}`, category: entry.resourceAcquisition.generated.routing.category, reviewStatus: entry.reviewStatus })) }
  return { entries, index, filename }
}
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check'), plan = buildPlan(), changes = [], expected = new Set()
  function compare(target, value) { const next = serialize(value), current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null; if (current !== next) changes.push({ target, next }) }
  for (const entry of plan.entries) { const target = path.join(ENTRY_ROOT, plan.filename(entry)); expected.add(path.resolve(target).toLowerCase()); compare(target, entry) }
  compare(INDEX_PATH, plan.index)
  for (const item of readEntries()) { const target = path.join(ENTRY_ROOT, item.file); if (!expected.has(path.resolve(target).toLowerCase())) changes.push({ target, remove: true }) }
  if (check) { if (changes.length) throw new Error(`资源知识已漂移（${changes.length} 项）`); console.log(`资源知识无漂移：${plan.entries.length} 个资源`); return plan }
  for (const change of changes) { if (change.remove) fs.unlinkSync(change.target); else { fs.mkdirSync(path.dirname(change.target), { recursive: true }); fs.writeFileSync(change.target, change.next) } }
  console.log(`已同步 ${plan.entries.length} 个资源知识条目；写入 ${changes.length} 项`); return plan
}

if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { RESOURCE_KINDS, REVIEWED_RESOURCE_ROUTES, TOROID_FAMILY, isResource, isVendorOffer, descriptionActivityRouting, localizedDropRouting, orbVallisBountyMethods, orbVallisRouting, buildEntry, buildPlan, run }
