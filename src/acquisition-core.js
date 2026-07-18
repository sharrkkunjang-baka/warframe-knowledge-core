'use strict'

const { normalizeRequirements, renderRequirements } = require('./acquisition-protocol')
const { displayEntityName } = require('./entities')

function methodIdentity(method) {
  return JSON.stringify({
    scope: method.scope || 'item', type: method.type || null, category: method.category || null,
    sourceEntityId: method.sourceEntityId || null, sourceCanonical: method.sourceCanonical || null,
    sourceDisplayName: method.sourceDisplayName || null, locationId: method.locationId || null,
    missionNodeId: method.missionNodeId || null, factionId: method.factionId || null,
    rotation: method.rotation || null, chance: method.chance ?? method.probability ?? null,
    relicCanonical: method.relicCanonical || null, recipeId: method.recipeId || null, partRefs: method.partRefs || []
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

function entity(registries, kind, id) {
  const registry = registries?.[kind]
  return id && registry?.get ? registry.get(id) : null
}

function enrichMethod(method, registries) {
  const source = method.sourceEntityId && (
    entity(registries, 'arcaneSources', method.sourceEntityId) || entity(registries, 'enemies', method.sourceEntityId) ||
    entity(registries, 'npcs', method.sourceEntityId) || entity(registries, 'locations', method.sourceEntityId)
  )
  const npc = entity(registries, 'npcs', method.npcId || method.requirements?.npcId)
  const location = entity(registries, 'locations', method.locationId || method.requirements?.locationId || npc?.locationId)
  const quest = entity(registries, 'quests', method.questId || method.requirements?.questId)
  const faction = entity(registries, 'factions', method.factionId || method.requirements?.factionId)
  const inferredMissionTypeId = /^Narmer\b/i.test(String(method.sourceCanonical || '')) ? 'mission-type.narmer-bounty' : null
  const missionType = entity(registries, 'missionTypes', inferredMissionTypeId || method.missionTypeId || method.missionTypeEntityId)
  const requirements = normalizeRequirements(method.requirements)
  return {
    ...method,
    requirements,
    requirementLines: renderRequirements(requirements, registries),
    ...(source ? { sourceDisplayName: (() => { const name = displayEntityName(source); const sourceFaction = source.factionId ? entity(registries, 'factions', source.factionId) : null; return sourceFaction ? name.replace(new RegExp(`^${sourceFaction.canonical}\\s*`, 'i'), displayEntityName(sourceFaction)) : name; })(), sourceKind: source.kind || null } : {}),
    ...(npc ? { npcId: npc.id, npcDisplayName: displayEntityName(npc) } : {}),
    ...(location ? { locationId: location.id, locationDisplayName: displayEntityName(location) } : {}),
    ...(quest ? { questId: quest.id, questDisplayName: displayEntityName(quest) } : {}),
    ...(faction ? { factionId: faction.id, factionDisplayName: displayEntityName(faction) } : {}),
    ...(missionType ? { missionTypeDisplayName: displayEntityName(missionType) } : {})
  }
}

function structuredMethods(methods, registries) {
  return mergeMethods(methods).map(method => enrichMethod(method, registries))
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

module.exports = { methodIdentity, mergeMethods, enrichMethod, structuredMethods, normalizeRoute, routesToMethods }
