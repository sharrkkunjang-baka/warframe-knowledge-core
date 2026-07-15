'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { normalizeRequirements } = require('./acquisition-protocol')

const CATEGORY_DIRS = Object.freeze({
  'frame-prime-relic': 'prime-relic',
  'frame-assassination': 'assassination',
  'frame-quest': 'quest',
  'frame-mixed-missions': 'mixed-missions',
  'frame-specific-mission': 'specific-mission',
  'frame-bounty': 'bounty',
  'frame-dojo': 'dojo',
  'frame-vendor': 'vendor'
})

const BLUEPRINT_CATEGORIES = Object.freeze(['market', 'quest', 'dojo', 'bounty', 'vendor', 'relic', 'specific-mission', 'mixed-missions', 'assassination', 'unresolved'])
const METHOD_ROOT = path.join(__dirname, '..', 'knowledge', 'acquisition', 'warframe', 'method')
function loadMethodDefinitions(root = METHOD_ROOT) {
  return Object.freeze(Object.fromEntries(['components', 'blueprints'].map(scope => {
    const directory = path.join(root, scope)
    const definitions = Object.fromEntries(fs.readdirSync(directory).filter(file => file.endsWith('.json')).map(file => {
      const document = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))
      return [document.category, Object.freeze(document)]
    }))
    return [scope, Object.freeze(definitions)]
  })))
}
const METHOD_DEFINITIONS = loadMethodDefinitions()
const METHOD_TEMPLATES = Object.freeze({
  components: Object.freeze(Object.fromEntries(Object.entries(METHOD_DEFINITIONS.components).map(([category, definition]) => [category, definition.template]))),
  blueprints: Object.freeze(Object.fromEntries(Object.entries(METHOD_DEFINITIONS.blueprints).map(([category, definition]) => [category, definition.template])))
})
function methodTemplate(scope, category, name = 'template') { return METHOD_DEFINITIONS[scope]?.[category]?.[name] || null }

const ASSASSINATION_SOURCES = Object.freeze({
  'Earth/Everest': { planetName: '地球', enemyName: '巨型豺狼' },
  'Venus/Fossa': { planetName: '金星', enemyName: '豺狼' },
  'Mercury/Tolstoj': { planetName: '水星', enemyName: '沃尔上尉' },
  'Mars/War': { planetName: '火星', enemyName: '莱希·克里尔中尉' },
  'Phobos/Iliad': { planetName: '火卫一', enemyName: '军士' },
  'Ceres/Exta': { planetName: '谷神星', enemyName: '沃尔上尉与莱希·克里尔中尉' },
  'Jupiter/The Ropalolyst': { planetName: '木星', enemyName: '蝠力使' },
  'Saturn/Tethys': { planetName: '土星', enemyName: '萨加斯·鲁克将军' },
  'Uranus/Titania': { planetName: '天王星', enemyName: '泰尔·雷格' },
  'Neptune/Psamathe': { planetName: '海王星', enemyName: '鬣狗群' },
  'Pluto/Hades': { planetName: '冥王星', enemyName: 'Ambulas' },
  'Sedna/Merrow': { planetName: '赛德娜', enemyName: '凯拉·德·赛姆' },
  'Eris/Mutalist Alad V Assassinate': { locationId: 'planet.eris', enemyId: 'enemy.mutalist-alad-v' },
  'Deimos/Magnacidium': { planetName: '火卫二', enemyName: 'Lephantis' }
})

const BLUEPRINT_OVERRIDES = Object.freeze({
  'Excalibur Umbra': { category: null },
  Mesa: { category: 'market', variables: {} },
  Nokko: { category: null },
  Jade: { category: 'quest', variables: { questName: '翠玉之影' } },
  'Sirius & Orion': { category: 'quest', variables: { questName: '翠玉之影：星座' } }
})
const COMPONENT_OVERRIDES = Object.freeze({
  Baruuk: {},
  Hildryn: { enemyName: '剥削者圆蛛' },
  Vauban: {},
  Nokko: { prerequisiteQuestId: 'quest.the-new-war', hubs: [{ locationId: 'hub.fortuna', subLocationId: 'hub.fortuna-airlock', npcId: 'npc.nightcap' }], bountyName: '深矿赏金', exchange: { npcId: 'npc.nightcap', locationId: 'hub.fortuna-airlock', currencyId: 'currency.fergolyte', componentCost: 160, blueprintCost: 240, totalCost: 720, rankName: '园丁', rank: 4 }, sourceCanonical: ['Deepmines Bounties'] },
  Dante: { sources: [{ type: 'mission-node', locationId: 'planet.deimos', missionNodeId: 'mission-node.armatus', rotation: 'C' }], exchange: { npcId: 'npc.loid', currencyId: 'currency.vessel-capillaries', componentCost: 90, blueprintCost: 270, totalCost: 540 }, sourceCanonical: ['Deimos/Armatus (Disruption), Rotation C'] },
  Jade: { locationId: 'planet.uranus', missionNodeId: 'mission-node.brutus', dropChance: 4.63, exchange: { npcId: 'npc.ordis', currencyId: 'currency.vestigial-motes', componentCost: 150, blueprintCost: 450 }, sourceCanonical: 'Uranus/Brutus (Ascension)' },
  Oraxia: { prerequisiteQuestId: 'quest.the-hex', locationId: 'landscape.duviri', missionNodeId: 'mission-node.isleweaver', dropChance: 7.69, exchange: { npcId: 'npc.acrithis', locationId: 'hub.dormizone', currencyId: 'currency.scuttler-husks', componentCost: 20, blueprintCost: 60, totalCost: 120 }, sourceCanonical: 'Duviri/Isleweaver' }
})

// require 是互斥的获取门槛变量。none 为默认值；standing 通过 NPC 变量
// 自动解析地点和集团等级；currency 的 isBuffuseless 默认 true。
const REQUIRE_OVERRIDES = Object.freeze({
  Baruuk: { type: 'standing', npcId: 'npc.little-duck', rank: 3, rankName: 'Hand', blueprintRank: 2, blueprintRankName: 'Agent' },
  Citrine: { type: 'currency', npcId: 'npc.otak', locationId: 'hub.necralisk', currency: [{ currencyId: 'currency.belric-crystal-fragment', amount: 1500 }, { currencyId: 'currency.rania-crystal-fragment', amount: 1550 }] },
  Dagath: { type: 'currency', usage: 'crafting', locationId: 'hub.clan-dojo', currency: [{ currencyId: 'currency.vainthorn', amount: 102 }] },
  Dante: { type: 'currency', npcId: 'npc.loid', locationId: 'hub.sanctum-anatomica', currency: [{ currencyId: 'currency.vessel-capillaries', amount: 540 }] },
  Follie: { type: 'currency', npcId: 'npc.aspirant-zorba', locationId: 'hub.any-relay', currency: [{ currencyId: 'currency.atramentum', amount: 2400 }] },
  Hildryn: { type: 'standing', npcId: 'npc.little-duck', rank: 2, rankName: 'Agent' },
  Jade: { type: 'currency', npcId: 'npc.ordis', locationId: 'hub.drifters-camp', currency: [{ currencyId: 'currency.vestigial-motes', amount: 900 }] },
  Kullervo: { type: 'currency', npcId: 'npc.acrithis', locationId: 'hub.dormizone', currency: [{ currencyId: 'currency.kullervos-bane', amount: 42 }] },
  Nokko: { type: 'currency', npcId: 'npc.nightcap', locationId: 'hub.fortuna-airlock', currency: [{ currencyId: 'currency.fergolyte', amount: 720 }] },
  Oraxia: { type: 'currency', npcId: 'npc.acrithis', locationId: 'hub.dormizone', currency: [{ currencyId: 'currency.scuttler-husks', amount: 120 }] },
  'Sirius & Orion': { type: 'currency', npcId: 'npc.hunhow', locationId: 'hub.pontis-tower', currency: [{ currencyId: 'currency.jade-talent', amount: 545 }, { currencyId: 'currency.crimson-talent', amount: 545 }] },
  Vauban: { type: 'currency', locationId: 'interface.nightwave', currency: [{ currencyId: 'currency.nora-s-mix-vol-8-cred', amount: 75 }] }
})

function categoryDirectory(categoryId) { return CATEGORY_DIRS[categoryId] || null }
function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function sourceEntityVariables(source) {
  const raw = String(source || '').trim()
  const quest = raw.match(/^Cephalon Simaris,\s*Complete\s+(.+?)(?:\s*\(Quest\))?$/i)
  if (quest && !/Junction$/i.test(quest[1])) return { type: 'quest-repurchase', npcId: 'npc.cephalon-simaris', questId: `quest.${slug(quest[1])}` }
  const mission = raw.match(/^([^/]+)\/([^,(]+?)(?:\s*\(([^)]+)\))?(?:,\s*Rotation\s*([A-Z]))?$/i)
  if (mission && !/Level\s*\d+|Bount(?:y|ies)/i.test(raw)) return { type: 'mission-node', locationId: `planet.${slug(mission[1])}`, missionNodeId: `mission-node.${slug(mission[2])}`, rotation: mission[4] || null }
  return raw ? { type: 'acquisition-source', sourceId: `source.${slug(raw)}` } : null
}
function structuredSources(sources) { return [...new Set(sources)].map(sourceEntityVariables).filter(Boolean) }
function firstAcquisitionText(page) { return (page?.sections || []).filter(section => /^(?:Acquisition|Blueprints)$/i.test(String(section.title || '').trim())).map(section => section.text).join('\n') }
function partDrops(frame, part) { return (frame.components || []).filter(component => (component.part || component.name) === part).flatMap(component => component.drops || []) }
function sourceCategory(location) {
  const raw = String(location || '')
  if (/Assassination/i.test(raw)) return 'assassination'
  if (/Bount(?:y|ies)/i.test(raw)) return 'bounty'
  if (/Relic/i.test(raw)) return 'relic'
  if (/Complete|Quest|Junction|Cephalon Simaris/i.test(raw)) return 'quest'
  return 'mixed-missions'
}
function classifyBlueprint(frame, componentCategory, page) {
  const override = BLUEPRINT_OVERRIDES[frame.name]
  if (override) return { ...override, source: 'manual-override' }
  if (frame.isPrime || / Prime$/i.test(frame.name || '')) return { category: null, source: 'same-as-components' }
  if (componentCategory === 'frame-dojo') return { category: null, source: 'same-as-components' }
  if (Number(frame.bpCost) > 0) return { category: 'market', variables: {}, source: 'official-bp-cost' }
  const drops = partDrops(frame, 'Blueprint')
  if (drops.length) {
    const category = sourceCategory(drops[0].location)
    const componentEquivalent = category === componentCategory.replace(/^frame-/, '')
    const raw = String(drops[0].location || '')
    return { category: componentEquivalent ? null : category, variables: sourceEntityVariables(raw) || { sourceCanonical: raw }, source: 'official-component-drop' }
  }
  const text = firstAcquisitionText(page)
  const quest = text.match(/main blueprint[^.]{0,180}(?:completion of|completing|quest)\s+(?:the\s+)?([^.;\n]+)/i) || text.match(/main blueprint[^.]{0,100}(?:awarded|acquired)[^.]{0,80}\bquest\b/i)
  if (quest) return { category: 'quest', variables: quest[1] ? { questName: quest[1].trim() } : {}, source: 'wiki-acquisition' }
  if (componentCategory === 'frame-dojo' || componentCategory === 'frame-quest' || componentCategory === 'frame-vendor' || componentCategory === 'frame-specific-mission') return { category: null, source: 'same-as-components' }
  return { category: 'unresolved', variables: {}, source: 'unresolved' }
}
function assassinationVariables(frame) {
  if (frame.name === 'Mesa') return { locationId: 'planet.eris', enemyId: 'enemy.mutalist-alad-v', sourceCanonical: 'Eris/Mutalist Alad V Assassinate' }
  const location = partDrops(frame, 'Neuroptics').concat(partDrops(frame, 'Chassis'), partDrops(frame, 'Systems')).map(drop => String(drop.location || '')).find(value => /Assassination/i.test(value)) || ''
  const key = Object.keys(ASSASSINATION_SOURCES).find(source => location.startsWith(source))
  return key ? { ...ASSASSINATION_SOURCES[key], sourceCanonical: location } : { sourceCanonical: location }
}
function bountyVariables(frame, page) {
  const sources = partDrops(frame, 'Neuroptics').concat(partDrops(frame, 'Chassis'), partDrops(frame, 'Systems')).map(drop => String(drop.location || '')).filter(Boolean)
  const evidence = `${sources.join('\n')}\n${firstAcquisitionText(page)}`
  const factionId = /Narmer/i.test(evidence) ? 'faction.narmer' : null
  const hubs = []
  if (/Earth\/Cetus|Narmer Cetus|\bCetus\b/i.test(evidence)) hubs.push({ locationId: 'hub.cetus', npcId: 'npc.konzu' })
  if (/Venus\/Orb Vallis|Narmer Fortuna|\bFortuna\b/i.test(evidence)) hubs.push({ locationId: 'hub.fortuna', npcId: 'npc.eudico' })
  if (sources.some(source => /Deimos\/Cambion Drift/i.test(source))) hubs.push({ locationId: 'landscape.cambion-drift', npcId: 'npc.mother' })
  if (sources.some(source => /Zariman Ten Zero/i.test(source))) hubs.push({ locationId: 'hub.zariman', npcId: 'npc.quinn' })
  const level = [...sources, evidence].map(source => source.match(/Level\s*(\d+)\s*-\s*(\d+)/i) || source.match(/Lvl\s*(\d+)\s*-\s*(\d+)/i)).find(Boolean)
  return { factionId, hubs, levelRange: level ? { min: Number(level[1]), max: Number(level[2]) } : null, sourceCanonical: [...new Set(sources)] }
}
function questVariables(frame) {
  const sources = partDrops(frame, 'Neuroptics').concat(partDrops(frame, 'Chassis'), partDrops(frame, 'Systems')).map(drop => String(drop.location || '')).filter(Boolean)
  const match = sources.map(source => source.match(/^Cephalon Simaris,\s*Complete\s+(.+?)(?:\s*\(Quest\))?$/i)).find(Boolean)
  if (!match) return { sourceCanonical: [...new Set(sources)] }
  const questCanonical = match[1].trim()
  return { npcId: 'npc.cephalon-simaris', questId: `quest.${questCanonical.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`, sourceCanonical: [...new Set(sources)] }
}
function mixedMissionVariables(frame) {
  const sources = partDrops(frame, 'Neuroptics').concat(partDrops(frame, 'Chassis'), partDrops(frame, 'Systems')).map(drop => String(drop.location || '')).filter(Boolean)
  const unique = [...new Set(sources)]
  const parsed = structuredSources(unique)
  if (parsed.length === unique.length && parsed.length) return { sources: parsed, sourceCanonical: unique }
  return { sourceCanonical: unique, unresolvedSources: unique.filter(source => !sourceEntityVariables(source)) }
}
function componentVariables(frame, componentCategory, page) {
  if (COMPONENT_OVERRIDES[frame.name]) return COMPONENT_OVERRIDES[frame.name]
  if (componentCategory === 'frame-assassination') return assassinationVariables(frame)
  if (componentCategory === 'frame-bounty') return bountyVariables(frame, page)
  if (componentCategory === 'frame-quest') return questVariables(frame)
  if (componentCategory === 'frame-mixed-missions' || componentCategory === 'frame-specific-mission') return mixedMissionVariables(frame)
  const sources = partDrops(frame, 'Neuroptics').concat(partDrops(frame, 'Chassis'), partDrops(frame, 'Systems')).map(drop => String(drop.location || '')).filter(Boolean)
  return { sourceText: [...new Set(sources)].join('；') }
}
function acquisitionRequirement(frame, componentCategory, variables) {
  const override = REQUIRE_OVERRIDES[frame.name]
  if (override?.type === 'standing') return { ...override }
  if (override?.type === 'currency') return { ...override, isBuffuseless: override.isBuffuseless ?? true }
  if (variables?.exchange) return { type: 'currency', isBuffuseless: true }
  return { type: 'none' }
}
function buildRouting(frame, componentCategory, page) {
  const blueprint = classifyBlueprint(frame, componentCategory, page)
  const variables = componentVariables(frame, componentCategory, page)
  return {
    componentCategory,
    blueprintCategory: blueprint.category,
    componentVariables: variables,
    blueprintVariables: blueprint.variables || {},
    blueprintSource: blueprint.source,
    requirements: normalizeRequirements(acquisitionRequirement(frame, componentCategory, variables))
  }
}
function applyTemplate(template, variables) {
  if (!template) return null
  let missing = false
  const text = String(template).replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, key) => {
    if (variables?.[key] == null) { missing = true; return '' }
    return variables[key]
  })
  return missing ? null : text
}

module.exports = { CATEGORY_DIRS, BLUEPRINT_CATEGORIES, METHOD_ROOT, METHOD_DEFINITIONS, METHOD_TEMPLATES, ASSASSINATION_SOURCES, BLUEPRINT_OVERRIDES, COMPONENT_OVERRIDES, REQUIRE_OVERRIDES, loadMethodDefinitions, methodTemplate, categoryDirectory, sourceEntityVariables, structuredSources, classifyBlueprint, bountyVariables, acquisitionRequirement, buildRouting, applyTemplate }
