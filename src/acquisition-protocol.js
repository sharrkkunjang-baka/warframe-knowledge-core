'use strict'

const TYPES = Object.freeze(['none', 'currency', 'standing', 'quest', 'item'])

function normalizeRequirements(value) {
  const source = value && typeof value === 'object' ? value : { type: 'none' }
  const type = TYPES.includes(source.type) ? source.type : 'none'
  if (type === 'currency') return {
    type,
    usage: source.usage === 'crafting' ? 'crafting' : 'exchange',
    npcId: source.npcId || null,
    locationId: source.locationId || null,
    currency: (source.currency || []).map(item => ({ currencyId: item.currencyId, amount: Number(item.amount) })).filter(item => item.currencyId && Number.isFinite(item.amount) && item.amount > 0),
    isBuffUseless: source.isBuffUseless ?? source.isBuffuseless ?? true
  }
  if (type === 'standing') return { type, npcId: source.npcId || null, locationId: source.locationId || null, rank: source.rank ?? null, rankName: source.rankName || null, blueprintRank: source.blueprintRank ?? null, blueprintRankName: source.blueprintRankName || null }
  return { ...source, type }
}

function currencyAcquisitionSummary(entity, registries) {
  const dependency = entity?.acquisitionDependency
  if (!dependency) return null
  if (dependency.acquisitionSummary) return dependency.acquisitionSummary
  const name = (registry, id) => { const item = registry.get(id); return item ? (item.displayName || item.canonical) : '' }
  if (dependency.type === 'mission-enemy-drop') {
    const node = registries.locations.get(dependency.missionNodeId)
    if (!node) return null
    return `在${name(registries.locations, node.parentId)}的${name(registries.locations, node.id)}（${name(registries.missionTypes, dependency.missionTypeId)}）击败爆破使获得，普通每只 ${dependency.normalAmount.min}-${dependency.normalAmount.max}，钢铁之路每只 ${dependency.steelPathAmount.min}-${dependency.steelPathAmount.max}`
  }
  if (dependency.type === 'bounty-completion-or-compost') return `完成${dependency.bountyName}获得：普通难度 ${dependency.normalAmount.min}-${dependency.normalAmount.max} 个，钢铁之路 ${dependency.steelPathAmount.min}-${dependency.steelPathAmount.max} 个；多余蘑菇样本每个可堆肥获得 ${dependency.compostAmount} 个`
  if (dependency.acquisition?.type === 'mission-completion') return `完成${name(registries.locations, dependency.acquisition.locationId)}获得：普通难度 ${dependency.acquisition.normalAmount.min}-${dependency.acquisition.normalAmount.max} 个，钢铁之路 ${dependency.acquisition.steelPathAmount.min}-${dependency.acquisition.steelPathAmount.max} 个；${dependency.acquisition.bonus}`
  return null
}

function renderRequirements(value, registries) {
  const requirement = normalizeRequirements(value)
  if (requirement.type === 'none') return []
  const entityName = (registry, id) => { const item = id ? registry.get(id) : null; return item ? (item.displayName || item.canonical) : '' }
  const npc = requirement.npcId ? registries.npcs.get(requirement.npcId) : null
  const locationId = requirement.locationId || npc?.locationId
  const locationName = entityName(registries.locations, locationId)
  const npcName = entityName(registries.npcs, requirement.npcId)
  if (requirement.type === 'standing') {
    if (!locationName || !npcName) return []
    if (requirement.blueprintRank != null && requirement.blueprintRank !== requirement.rank) return [`${locationName}的${npcName}：总图需要 ${requirement.blueprintRank}级声望，部件蓝图需要 ${requirement.rank}级声望兑换`]
    const rank = requirement.rank == null ? '' : ` ${requirement.rank}级`
    return [`在${locationName}找${npcName}${rank}声望兑换`]
  }
  if (requirement.type !== 'currency') return []
  const currencies = requirement.currency.map(item => ({ ...item, entity: registries.currencies.get(item.currencyId) })).filter(item => item.entity)
  const currencyText = currencies.map(item => `${item.amount}个${item.entity.displayName || item.entity.canonical}`).join('和')
  const route = requirement.usage === 'crafting'
    ? `在${locationName}制造需要${currencyText}`
    : npcName ? `在${locationName}找${npcName}兑换，需要${currencyText}` : `在${locationName}兑换，需要${currencyText}`
  const dependencies = currencies.map(({ entity, amount }) => {
    const summary = currencyAcquisitionSummary(entity, registries)
    return summary ? `${entity.displayName || entity.canonical}（需要${amount}个）：${summary}` : null
  }).filter(Boolean)
  return [route, ...(dependencies.length ? ['所需货币怎么刷：', ...dependencies] : []), requirement.isBuffUseless ? '资源数量加成无效' : '资源数量加成有效'].filter(Boolean)
}

module.exports = { TYPES, normalizeRequirements, currencyAcquisitionSummary, renderRequirements }
