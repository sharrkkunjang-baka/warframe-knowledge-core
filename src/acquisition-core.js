'use strict'

const { normalizeRequirements, renderRequirements, exchangeRequirementIssues, collectCurrencyBoosterDiagnostics } = require('./acquisition-protocol')
const { displayEntityName } = require('./entities')

function methodIdentity(method) {
  return JSON.stringify({
    scope: method.scope || 'item', type: method.type || null, category: method.category || null,
    sourceEntityId: method.sourceEntityId || null, sourceCanonical: method.sourceCanonical || null,
    sourceDisplayName: method.sourceDisplayName || null, locationId: method.locationId || null,
    missionNodeId: method.missionNodeId || null, factionId: method.factionId || null,
    rotation: method.rotation || null, chance: method.chance ?? method.probability ?? null,
    relicCanonical: method.relicCanonical || null, recipeId: method.recipeId || null, partRefs: method.partRefs || [],
    variables: method.variables || {}, requirements: method.requirements || { type: 'none' }
  })
}

function mergeMethods(...layers) {
  const output = [], seen = new Set()
  for (const method of layers.flat().filter(Boolean)) {
    const key = methodIdentity(method)
    if (seen.has(key)) continue
    seen.add(key); output.push(method)
  }
  return output
}

const LEGACY_ENTITY_IDS = Object.freeze({
  locations: Object.freeze({
    'location.the-descendia': 'activity.the-descendia'
  })
})

function entity(registries, kind, id) {
  const registry = registries?.[kind]
  if (!id || !registry?.get) return null
  const direct = registry.get(id)
  if (direct) return direct
  const canonicalId = LEGACY_ENTITY_IDS[kind]?.[id]
    || (kind === 'locations' && String(id).startsWith('mission-node.') ? String(id).replace(/^mission-node\./, 'mission.') : id)
  return registry.get(canonicalId)
}

function displayLocationName(location, registries) {
  if (!location) return ''
  const ownName = displayEntityName(location)
  if (location.kind !== 'mission-node') return ownName
  const parent = entity(registries, 'locations', location.parentId)
  if (!parent) return ownName
  const parentName = displayEntityName(parent)
  if (ownName === parentName || ownName.startsWith(`${parentName}/`)) return ownName
  return [parentName, ownName].filter(Boolean).join('/')
}

function enrichMethod(method, registries) {
  let rawRequirements = method.requirements || { type: 'none' };
  if (rawRequirements.type === 'currency' && Array.isArray(rawRequirements.currency)) {
    const currencyRegistry = registries?.currencies;
    rawRequirements = { ...rawRequirements, currency: rawRequirements.currency.map(item => {
      if (item.currencyId || !currencyRegistry?.get) return item;
      const resolved = currencyRegistry.get(item.currencyCanonical) || (item.currencyCanonical === 'Nightwave Cred' ? [...currencyRegistry.values].reverse().find(value => /^Nora's Mix Vol\. \d+ Cred$/i.test(value.canonical)) : null);
      return resolved ? { ...item, currencyId: resolved.id } : item;
    }) };
  }
  if (rawRequirements.type === 'standing') { rawRequirements = { ...rawRequirements, npcId: rawRequirements.npcId || method.npcId || null, locationId: rawRequirements.locationId || method.locationId || null, ...(method.factionId ? { factionId: rawRequirements.factionId || method.factionId } : {}), rank: rawRequirements.rank ?? method.requiredLevel ?? null, rankName: rawRequirements.rankName || method.requiredRankName || null, amount: rawRequirements.amount ?? method.standing ?? null } }
  if (rawRequirements.type === 'currency') { rawRequirements = { ...rawRequirements, npcId: rawRequirements.npcId || method.npcId || method.sourceEntityId || null, locationId: rawRequirements.locationId || method.locationId || null } }
  const sourceId = method.sourceEntityId || method.npcId || rawRequirements.npcId
  const source = sourceId && (
    entity(registries, 'arcaneSources', sourceId) || entity(registries, 'enemies', sourceId) ||
    entity(registries, 'npcs', sourceId) || entity(registries, 'locations', sourceId)
  )
  const npc = entity(registries, 'npcs', method.npcId || rawRequirements.npcId)
  const location = entity(registries, 'locations', method.locationId || rawRequirements.locationId || npc?.locationId || source?.locationId || source?.parentId)
  const quest = entity(registries, 'quests', method.questId || method.requirements?.questId)
  const faction = entity(registries, 'factions', method.factionId || method.requirements?.factionId)
  const inferredMissionTypeId = /^Narmer\b/i.test(String(method.sourceCanonical || '')) ? 'mission-type.narmer-bounty' : null
  const missionType = entity(registries, 'missionTypes', inferredMissionTypeId || method.missionTypeId || method.missionTypeEntityId)
  const requirements = normalizeRequirements(rawRequirements)
  const boosterDiagnostics = collectCurrencyBoosterDiagnostics(requirements, registries)
  return {
    ...method,
    requirements,
    requirementLines: renderRequirements(requirements, registries),
    ...(boosterDiagnostics.length ? { boosterDiagnostics } : {}),
    ...(source ? { sourceDisplayName: method.sourceDisplayName || (() => { const name = displayEntityName(source); const sourceFaction = source.factionId ? entity(registries, 'factions', source.factionId) : null; return sourceFaction ? name.replace(new RegExp(`^${sourceFaction.canonical}\\s*`, 'i'), displayEntityName(sourceFaction)) : name; })(), sourceKind: source.kind || null, ...(source.bossLocation ? { bossLocation: source.bossLocation } : {}) } : {}),
    ...(npc ? { npcId: npc.id, npcDisplayName: displayEntityName(npc) } : {}),
    ...(location ? { locationId: location.id, locationDisplayName: displayLocationName(location, registries) } : {}),
    ...(quest ? { questId: quest.id, questDisplayName: displayEntityName(quest) } : {}),
    ...(faction ? { factionId: faction.id, factionDisplayName: displayEntityName(faction) } : {}),
    ...(missionType ? { missionTypeDisplayName: displayEntityName(missionType) } : {})
  }
}

function finalizeMethod(method, registries) {
  const enriched = enrichMethod(method, registries)
  const protocolIssues = exchangeRequirementIssues(enriched, registries)
  const reviewIssues = [...new Set([...(enriched.reviewIssues || []), ...protocolIssues])]
  const reviewStatus = reviewIssues.length
    ? 'review-required'
    : (enriched.reviewStatus || 'approved')
  const boosterDiagnostics = collectCurrencyBoosterDiagnostics(enriched.requirements, registries)
  return {
    ...enriched,
    reviewStatus,
    reviewIssues,
    ...(boosterDiagnostics.length ? { boosterDiagnostics } : {}),
    requirementLines: reviewStatus === 'review-required'
      ? []
      : renderRequirements(enriched.requirements, registries)
  }
}

function structuredMethods(methods, registries) {
  const enriched = mergeMethods(methods).map(method => finalizeMethod(method, registries))
  const output = [], byPublicIdentity = new Map()
  for (const method of enriched) {
    // 上游表格可能把同一奖励池拆成多条内部来源（例如 Nightmare Mode
    // Missions / Rescue），但实体化后对用户是完全相同的方法。这里在共享
    // DTO 层按所有用户可见字段去重，避免每个文字/图片渲染器各自补丁。
    const key = JSON.stringify({
      scope: method.scope || 'item',
      type: method.type || null,
      category: method.category || null,
      sourceEntityId: method.sourceEntityId || null,
      sourceDisplayName: method.sourceDisplayName || null,
      locationId: method.locationId || null,
      locationDisplayName: method.locationDisplayName || null,
      missionTypeId: method.missionTypeId || method.missionTypeEntityId || null,
      missionTypeDisplayName: method.missionTypeDisplayName || null,
      factionId: method.factionId || null,
      npcId: method.npcId || null,
      rotation: method.rotation || null,
      chance: method.chance ?? method.probability ?? null,
      relicCanonical: method.relicCanonical || null,
      partRefs: method.partRefs || [],
      variables: method.variables || {},
      requirements: method.requirements || { type: 'none' }
    })
    const existingIndex = byPublicIdentity.get(key)
    if (existingIndex == null) {
      byPublicIdentity.set(key, output.length)
      output.push(method)
      continue
    }
    const existing = output[existingIndex]
    const alternatives = [
      ...(existing.provenanceAlternatives || [existing.provenance].filter(Boolean)),
      method.provenance
    ].filter(Boolean)
    output[existingIndex] = { ...existing, provenanceAlternatives: alternatives }
  }
  return output
}

function normalizeRoute(route = {}) {
  return {
    scope: route.scope || 'item',
    category: route.category || 'unresolved',
    partRefs: Array.isArray(route.partRefs) ? [...new Set(route.partRefs)] : [],
    variables: route.variables && typeof route.variables === 'object' ? route.variables : {},
    requirements: normalizeRequirements(route.requirements),
    methods: Array.isArray(route.methods) ? route.methods : [],
    status: route.status || 'review-required'
  }
}

function routesToMethods(routes, registries) {
  return structuredMethods((routes || []).flatMap(raw => {
    const route = normalizeRoute(raw)
    return route.methods.length ? route.methods.map(method => ({ ...method, scope: method.scope || route.scope, category: method.category || route.category, partRefs: method.partRefs || route.partRefs, variables: { ...route.variables, ...(method.variables || {}) }, requirements: method.requirements || route.requirements })) : [{ type: 'route', scope: route.scope, category: route.category, partRefs: route.partRefs, variables: route.variables, requirements: route.requirements, reviewStatus: route.status }]
  }), registries)
}

module.exports = { LEGACY_ENTITY_IDS, methodIdentity, mergeMethods, enrichMethod, finalizeMethod, structuredMethods, normalizeRoute, routesToMethods }
