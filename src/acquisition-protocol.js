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
  if (type === 'standing') {
    const amount = Number(source.amount ?? source.standing)
    return { type, npcId: source.npcId || null, locationId: source.locationId || null, rank: source.rank ?? null, rankName: source.rankName || null, blueprintRank: source.blueprintRank ?? null, blueprintRankName: source.blueprintRankName || null, ...(source.factionId ? { factionId: source.factionId } : {}), ...(Number.isFinite(amount) && amount > 0 ? { amount } : {}) }
  }
  return { ...source, type }
}

function missionCompletionDependency(entity) {
  const dependency = entity?.acquisitionDependency?.acquisition
  return dependency?.type === 'mission-completion' ? dependency : null
}

function sameMissionCompletionRule(left, right) {
  return left && right
    && left.normalAmount?.min === right.normalAmount?.min
    && left.normalAmount?.max === right.normalAmount?.max
    && left.steelPathAmount?.min === right.steelPathAmount?.min
    && left.steelPathAmount?.max === right.steelPathAmount?.max
    && left.bonus === right.bonus
}

function combinedMissionCurrencySummary(currencies, registries) {
  if (currencies.length < 2) return null
  const dependencies = currencies.map(item => missionCompletionDependency(item.entity))
  if (dependencies.some(dependency => !dependency) || !dependencies.every(dependency => sameMissionCompletionRule(dependency, dependencies[0]))) return null
  const names = currencies.map(item => item.entity.displayName || item.entity.canonical)
  const locations = dependencies.map(dependency => {
    const location = registries.locations.get(dependency.locationId)
    return location ? (location.displayName || location.canonical) : ''
  })
  if (locations.some(location => !location)) return null
  const amountText = new Set(currencies.map(item => item.amount)).size === 1
    ? `各需要${currencies[0].amount}个`
    : currencies.map(item => `${item.entity.displayName || item.entity.canonical}需要${item.amount}个`).join('，')
  const rule = dependencies[0]
  const routes = names.map((name, index) => `${name}完成${locations[index]}获得`).join('；')
  return `${names.join('和')}（${amountText}）：${routes}；普通难度 ${rule.normalAmount.min}-${rule.normalAmount.max} 个，钢铁之路 ${rule.steelPathAmount.min}-${rule.steelPathAmount.max} 个；${rule.bonus}`
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
  if (dependency.type === 'mission-completion') return `完成${name(registries.locations, dependency.locationId)}（${name(registries.missionTypes, dependency.missionTypeId)}）获得`
  if (dependency.acquisition?.type === 'mission-completion') return `完成${name(registries.locations, dependency.acquisition.locationId)}获得：普通难度 ${dependency.acquisition.normalAmount.min}-${dependency.acquisition.normalAmount.max} 个，钢铁之路 ${dependency.acquisition.steelPathAmount.min}-${dependency.acquisition.steelPathAmount.max} 个；${dependency.acquisition.bonus}`
  return null
}

function renderRequirements(value, registries) {
  const requirement = normalizeRequirements(value)
  if (requirement.type === 'none') return []
  if (requirement.type === 'quest') {
    const quest = requirement.questId ? registries.quests.get(requirement.questId) : null
    return [quest ? `完成任务「${quest.displayName || quest.canonical}」` : requirement.questName ? `完成任务「${requirement.questName}」` : '完成指定任务']
  }
  if (requirement.type === 'item') {
    if (requirement.recipeId) return []
    const items = (requirement.items || []).map(item => `${Number(item.amount || 1)}个${item.displayName || item.canonical || item.itemId}`).filter(Boolean)
    return items.length ? [`需要${items.join('和')}`] : []
  }
  const entityName = (registry, id) => { const item = id ? registry.get(id) : null; return item ? (item.displayName || item.canonical) : '' }
  const npc = requirement.npcId ? registries.npcs.get(requirement.npcId) : null
  const locationId = requirement.locationId || npc?.locationId
  const locationName = entityName(registries.locations, locationId)
  const npcName = entityName(registries.npcs, requirement.npcId)
  if (requirement.type === 'standing') {
    if (!locationName || !npcName) return []
    if (requirement.blueprintRank != null && requirement.blueprintRank !== requirement.rank) return [`${locationName}的${npcName}：总图需要 ${requirement.blueprintRank}级声望，部件蓝图需要 ${requirement.rank}级声望兑换`]
    const rank = requirement.rank == null ? '' : ` ${requirement.rank}级${requirement.rankName ? `（${requirement.rankName}）` : ''}`
    const amount = requirement.amount ? `，需要${requirement.amount.toLocaleString('zh-CN')}声望` : ''
    return [`在${locationName}找${npcName}${rank}声望兑换${amount}`]
  }
  if (requirement.type !== 'currency') return []
  const currencies = requirement.currency.map(item => ({ ...item, entity: registries.currencies.get(item.currencyId) })).filter(item => item.entity)
  const currencyText = currencies.map(item => `${item.amount}个${item.entity.displayName || item.entity.canonical}`).join('和')
  const route = requirement.usage === 'crafting'
    ? `在${locationName}制造需要${currencyText}`
    : npcName ? `在${locationName}找${npcName}兑换，需要${currencyText}` : `在${locationName}兑换，需要${currencyText}`
  const combinedDependency = combinedMissionCurrencySummary(currencies, registries)
  const dependencies = combinedDependency ? [combinedDependency] : currencies.map(({ entity, amount }) => {
    const summary = currencyAcquisitionSummary(entity, registries)
    return summary ? `${entity.displayName || entity.canonical}（需要${amount}个）：${summary}` : null
  }).filter(Boolean)
  return [route, ...(dependencies.length ? ['所需货币怎么刷：', ...dependencies] : []), requirement.isBuffUseless ? '资源数量加成无效' : '资源数量加成有效'].filter(Boolean)
}

function renderStructuredMethod(method) {
  const variables = method.variables || {}
  const source = method.sourceDisplayName || method.locationDisplayName || variables.sourceName || variables.locationName || ''
  const scopeName = method.scope === 'blueprint' ? '总图' : method.scope === 'component' ? (variables.partName || '部件') : method.scope === 'item' ? '成品' : ''
  const prefix = scopeName ? `${scopeName}：` : ''
  if (method.type === 'recipe' || method.category === 'crafting') return `${variables.productName ? `制造${variables.productName}` : '通过制造获得'}`
  if (method.type === 'market-purchase' || method.category === 'market') return `${prefix}${source ? `在${source}购买` : '在商店购买'}`
  if (method.type === 'vendor-exchange' || method.type === 'vendor-or-syndicate-exchange') return `${prefix}${source ? `在${source}兑换` : '向指定 NPC 兑换'}`
  if (method.type === 'quest-reward' || method.category === 'quest') return `${prefix}${method.questDisplayName ? `完成任务「${method.questDisplayName}」获得` : '完成指定任务获得'}`
  if (method.type === 'relic-reward') {
    const { localizeRelicName, relicRewardTier } = require('./prime-acquisition')
    return `${prefix}开启${localizeRelicName(method.relicCanonical)}遗物（${relicRewardTier(method)}）获得`
  }
  if (method.type === 'enemy-drop') {
    const chance = Number.isFinite(method.chance) ? `（综合概率${Number((method.chance * 100).toFixed(4))}%${Number.isFinite(method.sourceDropChance) && Number.isFinite(method.conditionalChance) ? `；来源掉落触发${Number((method.sourceDropChance * 100).toFixed(4))}%，触发后占${Number((method.conditionalChance * 100).toFixed(4))}%` : ''}）` : ''
    return `${prefix}${source ? `击败${source}获得` : '击败指定敌人获得'}${chance}`
  }
  if (method.type === 'mission-reward') {
    const mission = [method.locationDisplayName || source, method.missionTypeDisplayName ? `（${method.missionTypeDisplayName}）` : ''].join('')
    const chance = Number.isFinite(method.chance) ? `（概率${Number((method.chance * 100).toFixed(4))}%）` : ''
    return `${prefix}${mission ? `完成${mission}${method.rotation ? ` ${method.rotation}轮` : ''}获得` : '完成指定任务获得'}${chance}`
  }
  if (method.type === 'route') return variables.text || source || null
  return source ? `来源：${source}` : null
}

function renderAcquisition(methods, options = {}) {
  const sourceGroups = new Map()
  for (const method of methods || []) {
    if (!['enemy-drop', 'mission-reward'].includes(method.type) || method.scope !== 'component') continue
    const variables = method.variables || {}
    const source = method.sourceDisplayName || method.locationDisplayName || variables.sourceName || variables.locationName || ''
    if (!source) continue
    const key = JSON.stringify([method.type, source, method.missionTypeDisplayName || '', method.rotation || '', method.chance ?? null, method.sourceDropChance ?? null, method.conditionalChance ?? null])
    const group = sourceGroups.get(key) || { methods: [], partNames: [] }
    group.methods.push(method)
    if (variables.partName) group.partNames.push(variables.partName)
    sourceGroups.set(key, group)
  }
  const groupedMethods = new Set([...sourceGroups.values()].filter(group => group.methods.length > 1).flatMap(group => group.methods))
  const lines = []
  for (const method of methods || []) {
    if (groupedMethods.has(method)) {
      const group = [...sourceGroups.values()].find(item => item.methods[0] === method)
      if (!group) continue
      const merged = { ...method, variables: { ...(method.variables || {}), partName: [...new Set(group.partNames)].join('、') } }
      const headline = renderStructuredMethod(merged)
      if (headline) lines.push(headline)
      continue
    }
    const headline = renderStructuredMethod(method)
    if (headline) lines.push(headline)
    const isVendorExchange = method.type === 'vendor-exchange' || method.type === 'vendor-or-syndicate-exchange'
    if (method.type !== 'quest-reward' && !isVendorExchange) lines.push(...(method.requirementLines || []))
    if (isVendorExchange) {
      const variables = method.variables || {}
      const scopeName = method.scope === 'blueprint' ? '总图' : method.scope === 'component' ? (variables.partName || '部件') : '该物品'
      if (method.prerequisiteQuestId) {
        const quest = options.registries?.quests?.get(method.prerequisiteQuestId)
        lines.push(`${scopeName}兑换前置：完成任务「${quest?.displayName || quest?.canonical || method.prerequisiteQuestId}」`)
      }
      for (const line of method.requirementLines || []) lines.push(/^资源数量加成/.test(line) ? line : `${scopeName}兑换条件：${line}`)
    }
    if (method.prerequisite === 'steel-path') lines.push('需要已解锁钢铁之路')
  }
  const unique = [...new Set(lines.filter(Boolean))]
  const name = options.displayName || ''
  return unique.length ? `${name ? `${name}获取方式：\n` : ''}${unique.join('\n')}` : null
}

module.exports = { TYPES, normalizeRequirements, currencyAcquisitionSummary, renderRequirements, renderStructuredMethod, renderAcquisition }
