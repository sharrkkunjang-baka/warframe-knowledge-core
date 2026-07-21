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
    chooseCount: Number.isInteger(source.chooseCount) && source.chooseCount > 0 ? source.chooseCount : null,
    currency: (source.currency || []).map(item => {
      const amount = Number(item.amount)
      const amountRange = Array.isArray(item.amountRange) && item.amountRange.length === 2
        ? item.amountRange.map(Number)
        : null
      if (item.currencyId && amountRange?.every(value => Number.isFinite(value) && value > 0)) return { currencyId: item.currencyId, amountRange }
      if (item.currencyId && Number.isFinite(amount) && amount > 0) return { currencyId: item.currencyId, amount }
      return null
    }).filter(Boolean),
    boosterPolicy: 'currency-entity-metadata'
  }
  if (type === 'standing') {
    const amount = Number(source.amount ?? source.standing)
    return { type, npcId: source.npcId || null, locationId: source.locationId || null, rank: source.rank ?? null, rankName: source.rankName || null, blueprintRank: source.blueprintRank ?? null, blueprintRankName: source.blueprintRankName || null, ...(source.factionId ? { factionId: source.factionId } : {}), ...(Number.isFinite(amount) && amount > 0 ? { amount } : {}) }
  }
  if (type === 'item') return { ...source, type, items: (source.items || []).map(item => ({ ...item, amount: Number(item.amount || 1) })), taskRules: (source.taskRules || []).map(String).filter(Boolean) }
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
  if (dependency.type === 'boss-and-spiral-completion') {
    const gameMode = name(registries.locations, dependency.gameModeId)
    const location = name(registries.locations, dependency.locationId)
    if (!gameMode || !location || !dependency.bossName || !dependency.finalBossName) return null
    const moods = (dependency.moodSpirals || []).join('、')
    const route = `在${gameMode}中，于${moods}复眠螺旋前往${location}，击败 ${dependency.bossName}，并在同一轮任务中击败${dependency.finalBossName}后结算获得`
    return dependency.note ? `${route}；${dependency.note}` : route
  }
  if (dependency.type === 'bounty-completion-or-compost') return `完成${dependency.bountyName}获得：普通难度 ${dependency.normalAmount.min}-${dependency.normalAmount.max} 个，钢铁之路 ${dependency.steelPathAmount.min}-${dependency.steelPathAmount.max} 个；多余蘑菇样本每个可堆肥获得 ${dependency.compostAmount} 个`
  if (dependency.type === 'mission-completion-or-container') return `完成${name(registries.locations, dependency.locationId)}获得：普通难度 ${dependency.normalAmount} 个，钢铁之路 ${dependency.steelPathAmount} 个；破坏${dependency.containerName}可额外获得，普通每个 ${dependency.normalContainerAmount.min}-${dependency.normalContainerAmount.max} 个，钢铁之路每个 ${dependency.steelPathContainerAmount.min}-${dependency.steelPathContainerAmount.max} 个`
  if (dependency.type === 'mission-reward-or-container') return `在${name(registries.locations, dependency.locationId)}通过层级结算或储存容器获得：普通结算 ${dependency.normalAmount} 个，钢铁之路结算 ${dependency.steelPathAmount} 个`
  if (dependency.type === 'mission-completion') {
    const location = name(registries.locations, dependency.locationId)
    const missionType = name(registries.missionTypes, dependency.missionTypeId)
    return `完成${location}${missionType && !location.includes(`（${missionType}）`) ? `（${missionType}）` : ''}获得`
  }
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
    return [...(items.length ? [`任务入口：使用${items.join('和')}开启对应特殊任务`] : []), ...(requirement.taskRules?.length ? ['特殊任务规则：', ...requirement.taskRules] : [])]
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
  const amountText = item => item.amountRange
    ? `${item.amountRange[0]}-${item.amountRange[1]}个`
    : `${item.amount}个`
  const currencyText = currencies.map(item => `${amountText(item)}${item.entity.displayName || item.entity.canonical}`).join('、')
  const choiceText = requirement.chooseCount && requirement.chooseCount < currencies.length
    ? `（随机选择其中${requirement.chooseCount}种）`
    : ''
  const route = requirement.usage === 'crafting'
    ? `在${locationName}制造需要${currencyText}`
    : npcName ? `在${locationName}找${npcName}兑换，需要${currencyText}${choiceText}` : `在${locationName}兑换，需要${currencyText}${choiceText}`
  const fixedCurrencies = currencies.filter(item => Number.isFinite(item.amount))
  const combinedDependency = fixedCurrencies.length === currencies.length ? combinedMissionCurrencySummary(currencies, registries) : null
  const dependencies = combinedDependency ? [combinedDependency] : currencies.map(({ entity, amount, amountRange }) => {
    const summary = currencyAcquisitionSummary(entity, registries)
    return summary ? `${entity.displayName || entity.canonical}（需要${amountRange ? `${amountRange[0]}-${amountRange[1]}` : amount}个）：${summary}` : null
  }).filter(Boolean)
  const boosterLines = []
  const boosterLabel = {
    resourceAmount: '资源数量加成',
    resourceDropChance: '资源掉落几率加成'
  }
  const boosterEffect = {
    resourceAmount: {
      affected: names => `${names}的任务内拾取数量可翻倍`,
      unaffected: names => `${names}不受影响`,
      unknown: names => `${names}缺少明确证据，暂按未知处理`
    },
    resourceDropChance: {
      affected: names => `${names}的任务内掉落几率受影响`,
      unaffected: names => `${names}不受影响`,
      unknown: names => `${names}缺少明确证据，暂按未知处理`
    }
  }
  for (const field of Object.keys(boosterLabel)) {
    const groups = new Map()
    for (const { entity } of currencies) {
      const status = ['affected', 'unaffected'].includes(entity.boosterEffects?.[field]) ? entity.boosterEffects[field] : 'unknown'
      const names = groups.get(status) || []
      names.push(entity.displayName || entity.canonical)
      groups.set(status, names)
    }
    for (const [status, names] of groups) boosterLines.push(`${boosterLabel[field]}：${boosterEffect[field][status](names.join('、'))}`)
  }
  const costKind = requirement.usage === 'crafting' ? '制造' : '兑换'
  return [
    route,
    ...(dependencies.length ? ['所需货币怎么刷：', ...dependencies] : []),
    ...boosterLines,
    `${costKind}成本固定为${currencyText}，不会因加成改变`
  ].filter(Boolean)
}

function normalizeVisibleLine(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[，,。；;：:！？!?（）()「」『』【】]/g, '')
    .replace(/仲裁阁下的奖励处/g, '仲裁荣誉商店')
    .replace(/找(.+?)兑换/g, '$1处兑换')
    .trim()
}

function mergeMethodPresentationLines(method, headline, requirementLines = []) {
  const output = []
  const add = line => {
    if (!line) return
    const key = normalizeVisibleLine(line)
    if (!key || output.some(item => normalizeVisibleLine(item) === key)) return
    output.push(line)
  }
  let mergedHeadline = headline
  for (const line of requirementLines) {
    if (
      mergedHeadline &&
      /兑换/.test(mergedHeadline) &&
      /兑换/.test(line) &&
      method?.requirements?.type === 'currency' &&
      /^在.+兑换，需要/.test(String(line)) &&
      ['vendor-exchange', 'vendor-or-syndicate-exchange', 'syndicate-exchange'].includes(method?.type)
    ) {
      const cost = String(line).match(/(?:，|,)?需要(.+)$/)
      if (cost && !/需要/.test(mergedHeadline)) mergedHeadline = `${mergedHeadline}，需要${cost[1]}`
      continue
    }
    add(line)
  }
  const result = []
  if (mergedHeadline) result.push(mergedHeadline)
  for (const line of output) {
    const key = normalizeVisibleLine(line)
    if (!result.some(item => normalizeVisibleLine(item) === key)) result.push(line)
  }
  return result
}

function nearDuplicateVisibleLines(lines) {
  const values = (lines || []).map(line => String(line || '').trim()).filter(Boolean)
  const failures = []
  for (let left = 0; left < values.length; left++) {
    for (let right = left + 1; right < values.length; right++) {
      const a = normalizeVisibleLine(values[left])
      const b = normalizeVisibleLine(values[right])
      if (!a || !b) continue
      const same = a === b
      const redundantExchange = !/成本固定/.test(a + b) && /兑换/.test(a) && /兑换/.test(b) && (
        a.includes(b) || b.includes(a) ||
        (/需要\d+个/.test(a) !== /需要\d+个/.test(b))
      )
      if (same || redundantExchange) failures.push({ left: values[left], right: values[right] })
    }
  }
  return failures
}

function localizeAcquisitionText(value) {
  return String(value || '').replace(/Höllvania/g, '霍瓦尼亚').replace(/WF1999 Bounty/g, '1999 赏金').replace(/Nightmare Mode/g, '\u5669\u68a6\u6a21\u5f0f').replace(/\bRotation\s*([A-C])\b/gi, '$1轮').replace(/\bStanding\b/gi, '声望').replace(/\s*[（(](?:Void Armageddon|Void Cascade)[）)]/gi, '')
}
function renderStructuredMethod(method, options = {}) {
  const variables = method.variables || {}
  const location = localizeAcquisitionText(method.locationDisplayName || variables.locationName || '')
  const npc = localizeAcquisitionText(method.npcDisplayName || (method.type === 'vendor-exchange' || method.type === 'vendor-or-syndicate-exchange' ? method.sourceDisplayName : '') || variables.npcName || '')
  const source = localizeAcquisitionText(method.sourceDisplayName || location || variables.sourceName || '')
  const exchangeSource = npc ? `${location ? `${location}的` : ''}${npc}` : source
  const scopeName = method.scope === 'blueprint' ? '总图' : method.scope === 'component' ? (variables.partName || '部件') : method.scope === 'component-access' ? (variables.grantsItemDisplayName || '任务定位装置') : method.scope === 'item' ? '成品' : ''
  const prefix = scopeName ? `${scopeName}：` : ''
  // 配方属于“合成”查询的数据，不是“刷”查询中的独立获取来源。
  if (method.type === 'recipe' || method.category === 'crafting') return null
  if (method.type === 'market-purchase' || method.category === 'market') return `${prefix}${source ? `在${source}购买` : '在商店购买'}`
  if (method.type === 'dojo-research') return `${prefix}${source ? `在氏族道场「${source}」复制蓝图` : '在氏族道场研究并复制蓝图'}`
  if (method.type === 'included-with-equipment') return `${prefix}${source ? `达到${source}时获得` : '随对应装备一并取得'}`
  if (method.type === 'open-world-gathering') return `${prefix}${source ? `在${source}采集获得` : '在开放世界采集获得'}`
  if (method.type === 'nightwave-offering') return `${prefix}在午夜电波商店轮换购买`
  if (method.type === 'invasion-reward') return `${prefix}完成入侵任务概率获得`
  if (method.type === 'daily-tribute') return `${prefix}从每日献礼里程碑奖励中选择获得`
  if (method.type === 'anniversary-reward') return `${prefix}完成周年庆典警报获得`
  if (method.type === 'adversary-reward') return `${prefix}击败并处决携带该武器的赤毒玄骸获得`
  if (method.type === 'vendor-exchange' || method.type === 'vendor-or-syndicate-exchange') return `${prefix}${exchangeSource ? `在${exchangeSource}处兑换` : '向指定 NPC 兑换'}`
  if (method.type === 'syndicate-exchange') {
    const faction = method.factionDisplayName || source || '指定集团'
    const rank = Number.isInteger(method.requiredLevel) ? `达到 ${method.requiredLevel} 级后` : ''
    const standing = Number.isFinite(method.standing) ? `花费${Number(method.standing).toLocaleString('zh-CN')}声望` : '使用声望'
    return `${prefix}在${faction}${rank}${standing}兑换`
  }
  if (method.type === 'quest-reward' || method.category === 'quest') return `${prefix}${method.questDisplayName ? `完成任务「${method.questDisplayName}」获得` : '完成指定任务获得'}`
  if (method.type === 'relic-reward') {
    const { localizeRelicName, relicRewardTier } = require('./prime-acquisition')
    return `${prefix}开启${localizeRelicName(method.relicCanonical)}遗物（${relicRewardTier(method)}）获得`
  }
  if (method.type === 'reward-or-drop' && method.sourceKind === 'relic-reward' && source) return `${prefix}开启${source}概率获得`
  if (method.type === 'reward-or-drop' && method.sourceKind === 'mission-reward') return `${prefix}${source ? `完成${source}` : '完成指定任务'}概率获得`
  if (method.type === 'reward-or-drop' && method.sourceKind === 'enemy-drop') return `${prefix}${source ? `击败${source}` : '击败指定敌人'}概率获得`
  if (method.type === 'adversary-drop') {
    const adversary = localizeAcquisitionText(method.sourceDisplayName || method.sourceCanonical || '')
      .replace(/Kuva Lich/gi, '\u8d64\u6bd2\u7384\u9ab8')
      .replace(/Sister of Parvos/gi, '\u5e15\u5c14\u6c83\u65af\u7684\u59d0\u59b9')
    return `${prefix}\u51fb\u8d25${adversary || '\u5bf9\u624b'}\u6982\u7387\u83b7\u5f97`
  }
  if (method.type === 'enemy-drop') {
    const appearanceCondition = localizeAcquisitionText(variables.appearanceCondition || '')
    if (appearanceCondition) return `${prefix}在${appearanceCondition}中击败 ${source || '指定头目'} 获得`
    const bossPlanet = localizeAcquisitionText(method.bossLocation?.planetDisplayName || '')
    if (bossPlanet) return `${prefix}${source ? `击败${source}` : '击败指定头目'}（${bossPlanet}刺杀）${method.hideProbability ? '获得' : '概率获得'}`
    const missionType = localizeAcquisitionText(method.missionTypeDisplayName || '')
    const node = localizeAcquisitionText(method.locationDisplayName || '')
    const planet = localizeAcquisitionText(method.planetDisplayName || '')
    const locationText = [...new Set([planet, node].filter(Boolean))].join('')
    const missionContext = locationText || missionType
      ? `（仅在${locationText ? `${locationText}${missionType ? `的${missionType}任务` : ''}` : missionType}中出现）`
      : ''
    return `${prefix}${source ? `击败${source}` : '击败指定敌人'}${missionContext}概率获得`
  }
  if (method.type === 'mission-reward') {
    const rawSource = String(method.sourceCanonical || '')
    const isGenericNightmareSource = /^Nightmare Mode(?: Missions| Rescue)?$/i.test(rawSource)
    const isSpyMission = /^Spy$/i.test(String(method.missionTypeCanonical || '')) || /\u95f4\u8c0d/.test(String(method.missionTypeDisplayName || ''))
    const spyTier = /^Tier\s*(\d+)\s*Spy$/i.exec(rawSource)?.[1]
    if (isSpyMission && spyTier) return `${prefix}T${spyTier}\u95f4\u8c0d${method.rotation ? ` ${method.rotation}\u8f6e` : ''}`
    if (isSpyMission && /^Lua Spy$/i.test(rawSource)) return `${prefix}\u6708\u7403\u95f4\u8c0d${method.rotation ? ` ${method.rotation}\u8f6e` : ''}`
    const locationName = isGenericNightmareSource ? '' : localizeAcquisitionText(method.locationDisplayName || source)
    const missionTypeName = localizeAcquisitionText(method.missionTypeDisplayName || method.missionTypeCanonical || '')
    const isOrokinVault = method.missionTypeId === 'mission-type.orokin-vault' || /^(?:Orokin Vault|奥罗金宝库)$/i.test(missionTypeName)
    if (isOrokinVault) return `${prefix}奥罗金宝库概率获得`
    if (/赏金/.test(missionTypeName)) {
      const bountyName = /合一众赏金/.test(locationName) || /合一众赏金/.test(missionTypeName) ? '合一众赏金' : (locationName || missionTypeName)
      return `${prefix}从${bountyName}奖励中获得`
    }
    if (!locationName && missionTypeName) {
      const rotation = method.rotation ? ` ${method.rotation}轮` : ''
      if (method.missionTypeCanonical === 'Weekly Conclave Challenge Reward') {
        const probability = options.showProbabilities === false || !Number.isFinite(method.chance)
          ? ''
          : `，${Number((method.chance * 100).toFixed(4))}%`
        return `${prefix}${missionTypeName}${rotation}（概率获得${probability}）`
      }
      const probability = options.showProbabilities === false || !Number.isFinite(method.chance)
        ? ''
        : `（概率${Number((method.chance * 100).toFixed(4))}%）`
      return `${prefix}${missionTypeName}${rotation}${probability}`
    }
    const missionTypeSuffix = missionTypeName && !String(locationName).includes(missionTypeName) ? `（${missionTypeName}）` : ''
    const mission = [locationName, missionTypeSuffix].join('')
    const chance = options.showProbabilities !== false && Number.isFinite(method.chance) && Number(method.chance) < 1 ? `（概率${Number((method.chance * 100).toFixed(4))}%）` : ''
    const guaranteed = Number(method.chance) >= 1
    const verb = guaranteed ? '获得' : chance ? '获得' : '概率获得'
    const objective = variables.objective ? `，${variables.objective}` : ''
    return `${prefix}${mission ? `完成${mission}${objective}${method.rotation && !/赏金/.test(mission) ? ` ${method.rotation}轮` : ''}${verb}` : `获取任务名称待审核，暂不发布空泛任务描述`}${chance}`
  }
  if (method.type === 'route') return variables.text || source || null
  return source ? `来源：${source}` : null
}

function joinPartNames(partNames) {
  const names = [...new Set((partNames || []).filter(Boolean))]
  if (names.length < 2) return names[0] || ''
  const firstSpace = names[0].indexOf(' ')
  if (firstSpace <= 0) return names.join('、')
  const prefix = names[0].slice(0, firstSpace + 1)
  if (!names.every(name => name.startsWith(prefix) && name.length > prefix.length)) return names.join('、')
  return `${names[0]}、${names.slice(1).map(name => name.slice(prefix.length)).join('、')}`
}

function mergeAlternativeSources(methods, options = {}) {
  const groups = new Map(), passthrough = []
  const canonicalEnemy = name => localizeAcquisitionText(name).replace(/\s*\([^)]*\)\s*$/g, '').trim()
  const canonicalMethods = []
  const seenEnemies = new Map()
  for (const method of methods || []) {
    if (method.type !== 'enemy-drop') { canonicalMethods.push(method); continue }
    const key = JSON.stringify([method.scope || 'item', method.variables?.partName || '', canonicalEnemy(method.sourceDisplayName || method.sourceCanonical || '')])
    const previous = seenEnemies.get(key)
    if (!previous || String(method.provenance?.source) === 'local-wiki-sqlite') seenEnemies.set(key, method)
  }
  canonicalMethods.push(...seenEnemies.values())
  for (const method of canonicalMethods) {
    if (!['enemy-drop', 'mission-reward'].includes(method.type)) { passthrough.push(method); continue }
    const variables = method.variables || {}
    const probabilityKey = options.showProbabilities === false ? [] : [method.chance ?? null, method.sourceDropChance ?? null, method.conditionalChance ?? null]
    const key = JSON.stringify([method.type, method.scope || 'item', variables.partName || '', method.missionTypeDisplayName || '', method.rotation || '', ...probabilityKey])
    const group = groups.get(key) || []
    group.push(method); groups.set(key, group)
  }
  const merged = []
  for (const group of groups.values()) {
    if (group.length === 1) { merged.push(group[0]); continue }
    const names = [...new Set(group.map(method => method.sourceDisplayName || method.locationDisplayName).filter(Boolean))]
    if (!names.length) { merged.push(...group); continue }
    const locations = [...new Set(group.map(method => method.locationDisplayName).filter(Boolean))]
    merged.push({ ...group[0], sourceDisplayName: names.join('、'), locationDisplayName: locations.length === 1 ? locations[0] : '', sourceCanonical: group.map(method => method.sourceCanonical).filter(Boolean).join(' | '), mergedSourceCount: group.length })
  }
  return [...merged, ...passthrough]
}

function applyDisplaySummaries(methods) {
  const counts = new Map()
  for (const method of methods || []) if (method.displayGroupId && method.displaySummary) counts.set(method.displayGroupId, (counts.get(method.displayGroupId) || 0) + 1)
  const emitted = new Set(), output = []
  for (const method of methods || []) {
    if (!method.displayGroupId || !method.displaySummary) { output.push(method); continue }
    if (emitted.has(method.displayGroupId)) continue
    emitted.add(method.displayGroupId)
    output.push({ type: 'route', scope: 'item', variables: { text: method.displaySummary }, requirements: { type: 'none' }, requirementLines: [], reviewStatus: 'approved', provenance: { source: 'compiled-display-summary', methodCount: counts.get(method.displayGroupId) || 1 } })
  }
  return output
}

const ACQUISITION_CARD_GROUPS = Object.freeze({
  exchange: new Set(['vendor-exchange', 'vendor-or-syndicate-exchange', 'syndicate-exchange', 'syndicate-exchange-group', 'market-purchase', 'nightwave-offering', 'dojo-research']),
  enemy: new Set(['enemy-drop', 'adversary-drop'])
})

function acquisitionCardGroup(method) {
  if (ACQUISITION_CARD_GROUPS.exchange.has(method?.type) || method?.category === 'market') return 'exchange'
  if (ACQUISITION_CARD_GROUPS.enemy.has(method?.type) || (method?.type === 'reward-or-drop' && method?.sourceKind === 'enemy-drop')) return 'enemy'
  return 'other'
}

function acquisitionCardSections(methods, options = {}) {
  const sections = { exchange: [], enemy: [], other: [] }
  const seen = new Set()
  const sourceMethods = methods || []
  // 图片卡片的敌人栏是一敌人一行；禁止套用文字协议的“替代来源合并”，
  // 否则几十个敌人会重新拼成一个难以阅读的长句。
  for (const method of sourceMethods.filter(method => acquisitionCardGroup(method) === 'enemy')) {
    const name = method.sourceDisplayName || method.variables?.sourceName || method.sourceCanonical
    if (!name) continue
    const bossLocation = method.bossLocation || null
    const bossContext = bossLocation
      ? [...new Set([
          bossLocation.planetDisplayName,
          bossLocation.nodeDisplayName,
          '刺杀'
        ].filter(Boolean))].join(' ')
      : ''
    const context = bossContext || method.locationDisplayName || method.variables?.locationName || ''
    const chance = Number.isFinite(Number(method.chance))
      ? `，${Number((Number(method.chance) * 100).toFixed(4))}%`
      : ''
    const sourceText = context && context !== name ? `${context} · ${name}` : name
    const text = `- ${sourceText}（概率获得${chance}）`
    const identity = method.sourceEntityId || method.sourceCanonical || name
    if (seen.has(`enemy:${identity}`)) continue
    seen.add(`enemy:${identity}`)
    sections.enemy.push({ text, method })
  }
  const nonEnemy = sourceMethods.filter(method => acquisitionCardGroup(method) !== 'enemy')
  for (const method of mergeAlternativeSources(applyDisplaySummaries(nonEnemy), { ...options, showProbabilities: false })) {
    const showProbabilities = method.missionTypeCanonical === 'Weekly Conclave Challenge Reward'
      ? options.showProbabilities !== false
      : false
    const headline = renderStructuredMethod(method, { ...options, showProbabilities })
    if (!headline) continue
    const lines = mergeMethodPresentationLines(method, headline, method.requirementLines || [])
    if (method.prerequisite === 'steel-path') lines.push('需要已解锁钢铁之路')
    const text = [...new Set(lines.filter(Boolean))].join('\n')
    const group = acquisitionCardGroup(method)
    // 卡片隐藏概率后，相同的人类可见来源只保留一行。赏金的“阶段 2/3”和
    // “最终阶段”等上游 sourceCanonical 不应让同一句“从希图斯赏金奖励中获得”重复。
    const identity = JSON.stringify([group, text])
    if (seen.has(identity)) continue
    seen.add(identity)
    sections[group].push({ text, method })
  }
  return sections
}

function renderAcquisition(methods, options = {}) {
  const renderMethods = mergeAlternativeSources(applyDisplaySummaries(methods), options)
    .map((method, index) => ({ method, index }))
    .sort((left, right) => (left.method.scope === 'blueprint' ? -1 : 0) - (right.method.scope === 'blueprint' ? -1 : 0) || left.index - right.index)
    .map(item => item.method)
  const sourceGroups = new Map()
  for (const method of renderMethods) {
    if (!['enemy-drop', 'mission-reward'].includes(method.type) || method.scope !== 'component') continue
    const variables = method.variables || {}
    const source = method.sourceDisplayName || method.locationDisplayName || variables.sourceName || variables.locationName || ''
    if (!source) continue
    const probabilityKey = options.showProbabilities === false ? [] : [method.chance ?? null, method.sourceDropChance ?? null, method.conditionalChance ?? null]
    const key = JSON.stringify([method.type, source, method.missionTypeDisplayName || '', method.rotation || '', ...probabilityKey])
    const group = sourceGroups.get(key) || { methods: [], partNames: [] }
    group.methods.push(method)
    if (variables.partName) group.partNames.push(variables.partName)
    sourceGroups.set(key, group)
  }
  const groupedMethods = new Set([...sourceGroups.values()].filter(group => group.methods.length > 1).flatMap(group => group.methods))
  const lines = []
  for (const method of renderMethods) {
    if (groupedMethods.has(method)) {
      const group = [...sourceGroups.values()].find(item => item.methods[0] === method)
      if (!group) continue
      const merged = { ...method, variables: { ...(method.variables || {}), partName: joinPartNames(group.partNames) } }
      const headline = renderStructuredMethod(merged, options)
      if (headline) lines.push(headline)
      continue
    }
    const headline = renderStructuredMethod(method, options)
    const isVendorExchange = method.type === 'vendor-exchange' || method.type === 'vendor-or-syndicate-exchange'
    if (method.type !== 'quest-reward' && !isVendorExchange) lines.push(...mergeMethodPresentationLines(method, headline, method.requirementLines || []))
    if (isVendorExchange) {
      const variables = method.variables || {}
      const scopeName = method.scope === 'blueprint' ? '总图' : method.scope === 'component' ? (variables.partName || '部件') : '该物品'
      if (method.prerequisiteQuestId) {
        const quest = options.registries?.quests?.get(method.prerequisiteQuestId)
        lines.push(`${scopeName}兑换前置：完成任务「${quest?.displayName || quest?.canonical || method.prerequisiteQuestId}」`)
      }
      lines.push(...mergeMethodPresentationLines(method, headline, method.requirementLines || []))
    } else if (method.type === 'quest-reward' && headline) {
      lines.push(headline)
    }
    if (method.prerequisiteText) lines.push(`前置：${method.prerequisiteText}`)
    if (method.prerequisite === 'steel-path') lines.push('需要已解锁钢铁之路')
  }
  const unique = [...new Set(lines.filter(Boolean))]
  const name = options.displayName || ''
  return unique.length ? `${name ? `${name}获取方式：\n` : ''}${unique.join('\n')}` : null
}

module.exports = { TYPES, ACQUISITION_CARD_GROUPS, normalizeRequirements, currencyAcquisitionSummary, renderRequirements, normalizeVisibleLine, mergeMethodPresentationLines, nearDuplicateVisibleLines, localizeAcquisitionText, renderStructuredMethod, joinPartNames, mergeAlternativeSources, applyDisplaySummaries, acquisitionCardGroup, acquisitionCardSections, renderAcquisition }
