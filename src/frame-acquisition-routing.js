'use strict'

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
const METHOD_TEMPLATES = Object.freeze({
  components: {
    'frame-prime-relic': '{sourceText}',
    'frame-assassination': '{planetName}刺杀 {enemyName} 刷取部件',
    'frame-quest': '{sourceText}',
    'frame-mixed-missions': '{sourceText} 刷取部件',
    'frame-bounty': '{sourceText} 刷取部件',
    'frame-dojo': '氏族道场复制部件蓝图',
    'frame-vendor': '{sourceText}兑换部件蓝图'
  },
  blueprints: {
    market: '商城购买总图',
    quest: '完成《{questName}》获得总图',
    dojo: '氏族道场复制总图',
    bounty: '{sourceText}获取总图',
    vendor: '{sourceText}兑换总图',
    relic: '{sourceText}',
    'specific-mission': '{sourceText}',
    'mixed-missions': '{sourceText}获取总图',
    assassination: '{sourceText}获取总图'
  }
})

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
  'Eris/Mutalist Alad V Assassinate': { planetName: '阋神星', enemyName: '异融 Alad V' },
  'Deimos/Magnacidium': { planetName: '火卫二', enemyName: 'Lephantis' }
})

const BLUEPRINT_OVERRIDES = Object.freeze({
  'Excalibur Umbra': { category: null },
  Mesa: { category: 'market', variables: {} },
  Jade: { category: 'quest', variables: { questName: '翠玉之影' } },
  'Sirius & Orion': { category: 'quest', variables: { questName: '翠玉之影：星座' } }
})

function categoryDirectory(categoryId) { return CATEGORY_DIRS[categoryId] || null }
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
    return { category: componentEquivalent ? null : category, variables: { sourceText: String(drops[0].location || '') }, source: 'official-component-drop' }
  }
  const text = firstAcquisitionText(page)
  const quest = text.match(/main blueprint[^.]{0,180}(?:completion of|completing|quest)\s+(?:the\s+)?([^.;\n]+)/i) || text.match(/main blueprint[^.]{0,100}(?:awarded|acquired)[^.]{0,80}\bquest\b/i)
  if (quest) return { category: 'quest', variables: quest[1] ? { questName: quest[1].trim() } : {}, source: 'wiki-acquisition' }
  if (componentCategory === 'frame-dojo' || componentCategory === 'frame-quest' || componentCategory === 'frame-vendor' || componentCategory === 'frame-specific-mission') return { category: null, source: 'same-as-components' }
  return { category: 'unresolved', variables: {}, source: 'unresolved' }
}
function assassinationVariables(frame) {
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
function componentVariables(frame, componentCategory, page) {
  if (componentCategory === 'frame-assassination') return assassinationVariables(frame)
  if (componentCategory === 'frame-bounty') return bountyVariables(frame, page)
  const sources = partDrops(frame, 'Neuroptics').concat(partDrops(frame, 'Chassis'), partDrops(frame, 'Systems')).map(drop => String(drop.location || '')).filter(Boolean)
  return { sourceText: [...new Set(sources)].join('；') }
}
function buildRouting(frame, componentCategory, page) {
  const blueprint = classifyBlueprint(frame, componentCategory, page)
  return {
    componentCategory,
    blueprintCategory: blueprint.category,
    componentVariables: componentVariables(frame, componentCategory, page),
    blueprintVariables: blueprint.variables || {},
    blueprintSource: blueprint.source
  }
}
function applyTemplate(template, variables) {
  if (!template) return null
  let missing = false
  const text = String(template).replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, key) => {
    if (variables?.[key] == null || variables[key] === '') { missing = true; return '' }
    return variables[key]
  })
  return missing ? null : text
}

module.exports = { CATEGORY_DIRS, BLUEPRINT_CATEGORIES, METHOD_TEMPLATES, ASSASSINATION_SOURCES, BLUEPRINT_OVERRIDES, categoryDirectory, classifyBlueprint, bountyVariables, buildRouting, applyTemplate }
