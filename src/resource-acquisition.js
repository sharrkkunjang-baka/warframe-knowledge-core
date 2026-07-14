'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createRegistry, loadEntityRegistries } = require('./entities')

const ROOT = path.resolve(__dirname, '..')
const RESOURCE_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'resource')
const INDEX_PATH = path.join(RESOURCE_ROOT, 'categories.json')
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
const INDEX = fs.existsSync(INDEX_PATH) ? readJson(INDEX_PATH) : { resources: [] }
const ENTRIES = INDEX.resources.map(item => readJson(path.join(RESOURCE_ROOT, ...item.file.split('/'))))
const REGISTRY = createRegistry(ENTRIES.map(entry => ({ id: entry.id, canonical: entry.subject.canonical, displayName: entry.subject.displayName, aliases: entry.aliases || [], entry })))
const METHODS = Object.fromEntries(fs.readdirSync(path.join(RESOURCE_ROOT, 'method')).filter(file => file.endsWith('.json')).map(file => { const value = readJson(path.join(RESOURCE_ROOT, 'method', file)); return [value.category, value] }))
const ENTITIES = loadEntityRegistries(ROOT)

function applyTemplate(template, variables) {
  if (!template) return null
  let missing = false
  const text = String(template).replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, key) => {
    if (variables?.[key] == null) { missing = true; return '' }
    return variables[key]
  })
  return missing ? null : text
}
function methodTemplate(category, name = 'template') { return METHODS[category]?.[name] || null }
function entityName(registry, id) { const entry = registry.get(id); return entry ? (entry.displayName || entry.canonical) : null }
function renderRoute(entry) {
  const routing = entry.resourceAcquisition?.manual?.routingOverride || entry.resourceAcquisition?.generated?.routing
  if (!routing) return null
  const category = routing.category
  const variables = routing.variables || {}
  const method = METHODS[category]
  if (!method) return null
  const resourceName = variables.resourceName || entry.subject.displayName
  if (category === 'resource-location' || category === 'resource-gathering') {
    const locations = (variables.locationIds || []).map(id => entityName(ENTITIES.locations, id)).filter(Boolean)
    if (!locations.length) return null
    const locationsText = locations.join(method.locationSeparator || methodTemplate(category, 'locationSeparator') || '、')
    return applyTemplate(method.template, { ...variables, resourceName, locationsText })
  }
  if (category === 'resource-enemy') {
    const enemiesText = (variables.enemyIds || []).map(id => entityName(ENTITIES.enemies, id)).filter(Boolean)
      .map(enemyName => applyTemplate(method.enemyTemplate, { enemyName })).filter(Boolean).join(method.enemySeparator || '、')
    return enemiesText ? applyTemplate(method.template, { ...variables, resourceName, enemiesText }) : null
  }
  if (category === 'resource-vendor') {
    return applyTemplate(method.template, {
      ...variables, resourceName,
      npcName: entityName(ENTITIES.npcs, variables.npcId),
      locationText: variables.locationId ? `在${entityName(ENTITIES.locations, variables.locationId)}` : '',
      costText: variables.costText || ''
    })
  }
  if (category === 'resource-mission') {
    const sources = (variables.sources || []).map(source => {
      const node = ENTITIES.locations.get(source.missionNodeId)
      const missionType = node?.missionTypeId ? entityName(ENTITIES.missionTypes, node.missionTypeId) : ''
      return applyTemplate(method.sourceTemplate, {
        locationName: entityName(ENTITIES.locations, source.locationId), missionNodeName: entityName(ENTITIES.locations, source.missionNodeId),
        missionTypeText: missionType ? `（${missionType}）` : '', rotationText: source.rotation ? ` ${source.rotation} 轮` : ''
      })
    }).filter(Boolean)
    return sources.length ? applyTemplate(method.template, { ...variables, resourceName, sourcesText: sources.join(method.sourceSeparator || '；') }) : null
  }
  if (category === 'resource-mixed') {
    const lines = (variables.methods || []).map(route => renderRoute({ ...entry, resourceAcquisition: { generated: { routing: route }, manual: {} } })).filter(Boolean)
    return lines.length ? applyTemplate(method.template, { resourceName, methodsText: lines.join(method.methodSeparator || '\n') }) : null
  }
  return applyTemplate(method.template, { ...variables, resourceName })
}
function resolveResource(query) { return REGISTRY.get(query)?.entry || null }
function getResourceAcquisition(query) {
  const entry = resolveResource(query)
  if (!entry || entry.reviewStatus !== 'approved') return null
  const routeText = renderRoute(entry)
  if (!routeText) throw new Error(`资源 ${entry.subject.canonical} 无法从 method 模板渲染`)
  const tips = entry.resourceAcquisition?.manual?.tips || []
  return { entry, routeText, tips, text: [routeText, tips.length ? `小技巧：\n${tips.map(tip => `- ${tip}`).join('\n')}` : ''].filter(Boolean).join('\n\n') }
}
function listResources() { return ENTRIES.map(entry => ({ canonical: entry.subject.canonical, displayName: entry.subject.displayName, reviewStatus: entry.reviewStatus, category: entry.subject.categoryRefs[0] })) }

module.exports = { INDEX, ENTRIES, METHODS, applyTemplate, methodTemplate, resolveResource, renderRoute, getResourceAcquisition, listResources }
