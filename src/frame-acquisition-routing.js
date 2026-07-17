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

// 刺杀模板变量契约：固定节点只能使用 locationId + enemyId；动态来源使用
// acquisitionSourceId + enemyId。sourceCanonical 仅保存官方掉落证据，不参与渲染。
const ASSASSINATION_SOURCES = Object.freeze({
  'Venus/Fossa': { locationId: 'planet.venus', enemyId: 'enemy.jackal' },
  'Mars/War': { locationId: 'planet.mars', enemyId: 'enemy.lieutenant-lech-kril' },
  'Phobos/Iliad': { locationId: 'planet.phobos', enemyId: 'enemy.the-sergeant' },
  'Ceres/Exta': { locationId: 'planet.ceres', enemyId: 'enemy.captain-vor-and-lieutenant-lech-kril' },
  'Jupiter/The Ropalolyst': { locationId: 'planet.jupiter', enemyId: 'enemy.ropalolyst' },
  'Saturn/Tethys': { locationId: 'planet.saturn', enemyId: 'enemy.general-sargas-ruk' },
  'Uranus/Titania': { locationId: 'planet.uranus', enemyId: 'enemy.tyl-regor' },
  'Neptune/Psamathe': { locationId: 'planet.neptune', enemyId: 'enemy.hyena-pack' },
  'Pluto/Hades': { locationId: 'planet.pluto', enemyId: 'enemy.ambulas' },
  'Sedna/Merrow': { locationId: 'planet.sedna', enemyId: 'enemy.kela-de-thaym' },
  'Eris/Mutalist Alad V Assassinate': { locationId: 'planet.eris', enemyId: 'enemy.mutalist-alad-v' },
  'Deimos/Magnacidium': { locationId: 'planet.deimos', enemyId: 'enemy.lephantis' }
})
const ASSASSINATION_FRAME_OVERRIDES = Object.freeze({
  Atlas: { locationId: 'planet.eris', enemyId: 'enemy.jordas-golem', sourceCanonical: 'Eris/Jordas Golem (Assassination)' },
  Equinox: { locationId: 'planet.uranus', enemyId: 'enemy.tyl-regor', sourceCanonical: 'Uranus/Titania (Assassination)' },
  Hydroid: { locationId: 'planet.earth', enemyId: 'enemy.councilor-vay-hek', sourceCanonical: 'Earth/Oro (Assassination)' },
  Mesa: { locationId: 'planet.eris', enemyId: 'enemy.mutalist-alad-v', sourceCanonical: 'Mutalist Alad V Assassinate, Rotation C' },
  Nova: { locationId: 'planet.europa', enemyId: 'enemy.raptor', sourceCanonical: 'Europa/Naamah (Assassination)' },
  Nyx: { acquisitionSourceId: 'source.phorid-assassination', enemyId: 'enemy.phorid', sourceCanonical: 'Phorid Assassination' },
  Valkyr: { locationId: 'planet.jupiter', enemyId: 'enemy.alad-v', sourceCanonical: 'Jupiter/Themisto (Assassination)' }
})

const BLUEPRINT_OVERRIDES = Object.freeze({
  'Excalibur Umbra': { category: null },
  Mesa: { category: 'market', variables: {} },
  Nokko: { category: null },
  Jade: { category: 'quest', variables: { questName: '翠玉之影' } },
  'Sirius & Orion': { category: 'quest', variables: { questName: '翠玉之影：星座' } },
  'Cyte-09': { category: 'quest', variables: { questId: 'quest.the-hex' } },
  Qorvex: { category: 'quest', variables: { questId: 'quest.whispers-in-the-walls' } }
})
const COMPONENT_OVERRIDES = Object.freeze({
  Baruuk: {},
  'Cyte-09': { hubs: [{ locationId: 'acquisition-source.hollvania-missions', npcId: 'npc.arthur' }], sourceCanonical: ['Höllvania (Level  65 - 70 WF1999 Bounty), Rotation C','Höllvania (Level  55 - 60 WF1999 Bounty), Rotation C','Höllvania (Level  75 - 80 WF1999 Bounty), Rotation C'] },
  'Excalibur Umbra': { npcId: 'npc.cephalon-simaris', questId: 'quest.the-sacrifice', sourceCanonical: ['The Sacrifice'] },
  Qorvex: { hubs: [{ locationId: 'acquisition-source.sanctum-anatomica-bounty', npcId: 'npc.fibonacci' }], sourceCanonical: ["Deimos/Albrecht's Laboratories (Level  55 - 60 Entrati Lab Bounty), Rotation C","Deimos/Albrecht's Laboratories (Level  65 - 70 Entrati Lab Bounty), Rotation C","Deimos/Albrecht's Laboratories (Level  75 - 80 Entrati Lab Bounty), Rotation C"] },
  Hildryn: { enemyName: '剥削者圆蛛' },
  Vauban: {},
  Nokko: { prerequisiteQuestId: 'quest.the-new-war', hubs: [{ locationId: 'hub.fortuna', subLocationId: 'hub.fortuna-airlock', npcId: 'npc.nightcap' }], bountyName: '深矿赏金', exchange: { npcId: 'npc.nightcap', locationId: 'hub.fortuna-airlock', currencyId: 'currency.fergolyte', componentCost: 160, blueprintCost: 240, totalCost: 720, rankName: '园丁', rank: 4 }, sourceCanonical: ['Deepmines Bounties'] },
  Dante: { sources: [{ type: 'mission-node', locationId: 'planet.deimos', missionNodeId: 'mission-node.armatus', rotation: 'C' }], exchange: { npcId: 'npc.loid', currencyId: 'currency.vessel-capillaries', componentCost: 90, blueprintCost: 270, totalCost: 540 }, sourceCanonical: ['Deimos/Armatus (Disruption), Rotation C'] },
  Jade: { locationId: 'planet.uranus', missionNodeId: 'mission-node.brutus', dropChance: 4.63, exchange: { npcId: 'npc.ordis', currencyId: 'currency.vestigial-motes', componentCost: 150, blueprintCost: 450 }, sourceCanonical: 'Uranus/Brutus (Ascension)' },
  Oraxia: { prerequisiteQuestId: 'quest.the-hex', locationId: 'landscape.duviri', missionNodeId: 'mission-node.isleweaver', dropChance: 7.69, exchange: { npcId: 'npc.acrithis', locationId: 'hub.dormizone', currencyId: 'currency.scuttler-husks', componentCost: 20, blueprintCost: 60, totalCost: 120 }, sourceCanonical: 'Duviri/Isleweaver' }
})

// require 是互斥的获取门槛变量。none 为默认值；standing 通过 NPC 变量
// 自动解析地点和集团等级；currency 的 isBuffuseless 默认 true。
const FRAME_EXCHANGE_METHOD_OVERRIDES = Object.freeze({
  Nokko: [{ type: 'vendor-exchange', scope: 'all-blueprints', npcId: 'npc.nightcap', locationId: 'hub.fortuna-airlock', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.nightcap', locationId: 'hub.fortuna-airlock', currency: [{ currencyId: 'currency.fergolyte', amount: 720 }], isBuffUseless: true } }],
  Dante: [{ type: 'vendor-exchange', scope: 'all-blueprints', npcId: 'npc.loid', locationId: 'hub.sanctum-anatomica', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.loid', locationId: 'hub.sanctum-anatomica', currency: [{ currencyId: 'currency.vessel-capillaries', amount: 540 }], isBuffUseless: true } }],
  Citrine: [{ type: 'vendor-exchange', scope: 'all-blueprints', npcId: 'npc.otak', locationId: 'hub.necralisk', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.otak', locationId: 'hub.necralisk', currency: [{ currencyId: 'currency.belric-crystal-fragment', amount: 1500 }, { currencyId: 'currency.rania-crystal-fragment', amount: 1550 }], isBuffUseless: true } }],
  Follie: [{ type: 'vendor-exchange', scope: 'all-blueprints', npcId: 'npc.aspirant-zorba', locationId: 'hub.any-relay', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.aspirant-zorba', locationId: 'hub.any-relay', currency: [{ currencyId: 'currency.atramentum', amount: 2400 }], isBuffUseless: true } }],
  Jade: [{ type: 'vendor-exchange', scope: 'all-blueprints', npcId: 'npc.ordis', locationId: 'hub.drifters-camp', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.ordis', locationId: 'hub.drifters-camp', currency: [{ currencyId: 'currency.vestigial-motes', amount: 900 }], isBuffUseless: true } }],
  Kullervo: [{ type: 'vendor-exchange', scope: 'all-blueprints', npcId: 'npc.acrithis', locationId: 'hub.dormizone', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.acrithis', locationId: 'hub.dormizone', currency: [{ currencyId: 'currency.kullervos-bane', amount: 42 }], isBuffUseless: true } }],
  Oraxia: [{ type: 'vendor-exchange', scope: 'all-blueprints', npcId: 'npc.acrithis', locationId: 'hub.dormizone', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.acrithis', locationId: 'hub.dormizone', currency: [{ currencyId: 'currency.scuttler-husks', amount: 120 }], isBuffUseless: true } }],
  'Sirius & Orion': [{ type: 'vendor-exchange', scope: 'all-blueprints', npcId: 'npc.hunhow', locationId: 'hub.pontis-tower', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.hunhow', locationId: 'hub.pontis-tower', currency: [{ currencyId: 'currency.emerald-talent', amount: 545 }, { currencyId: 'currency.crimson-talent', amount: 545 }], isBuffUseless: true } }],
  Baruuk: [{ type: 'vendor-exchange', scope: 'all-blueprints', npcId: 'npc.little-duck', locationId: 'hub.fortuna', requirements: { type: 'standing', npcId: 'npc.little-duck', locationId: 'hub.fortuna', rank: 3, rankName: 'Hand', blueprintRank: 2, blueprintRankName: 'Agent' } }],
  Hildryn: [{ type: 'vendor-exchange', scope: 'blueprint', npcId: 'npc.little-duck', locationId: 'hub.fortuna', requirements: { type: 'standing', npcId: 'npc.little-duck', locationId: 'hub.fortuna', rank: 2, rankName: 'Agent', amount: 5000 } }],
  Sevagoth: [{ type: 'vendor-exchange', scope: 'blueprint', npcId: 'npc.cephalon-simaris', locationId: 'hub.any-relay', requirements: { type: 'standing', npcId: 'npc.cephalon-simaris', locationId: 'hub.any-relay', amount: 50000 } }],
  Temple: [{ type: 'vendor-exchange', scope: 'all-blueprints', npcId: 'npc.flare', locationId: 'acquisition-source.hollvania-missions', requirements: { type: 'standing', npcId: 'npc.flare', locationId: 'acquisition-source.hollvania-missions' } }],
  Koumei: [{ type: 'vendor-exchange', scope: 'all-blueprints', sourceEntityId: 'acquisition-source.koumei-shrine', locationId: 'hub.cetus', requirements: { type: 'currency', usage: 'exchange', locationId: 'hub.cetus', currency: [{ currencyId: 'currency.fate-pearl', amount: 330 }], isBuffUseless: true } }],
  Voruna: [{ type: 'vendor-exchange', scope: 'all-blueprints', sourceEntityId: 'acquisition-source.archimedean-yonta', locationId: 'hub.zariman', requirements: { type: 'currency', usage: 'exchange', locationId: 'hub.zariman', currency: [{ currencyId: 'currency.lua-thrax-plasm', amount: 350 }], isBuffUseless: true } }]
})
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
  'Sirius & Orion': { type: 'currency', npcId: 'npc.hunhow', locationId: 'hub.pontis-tower', currency: [{ currencyId: 'currency.emerald-talent', amount: 545 }, { currencyId: 'currency.crimson-talent', amount: 545 }] },
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
const FRAME_VENDOR_ENTITIES = Object.freeze({
  'Cephalon Simaris': { npcId: 'npc.cephalon-simaris', locationId: 'hub.any-relay' },
  Amir: { npcId: 'npc.amir', locationId: 'acquisition-source.hollvania-missions' },
  'Bird 3': { npcId: 'npc.bird-3', locationId: 'hub.sanctum-anatomica' },
  'Little Duck': { npcId: 'npc.little-duck', locationId: 'hub.fortuna' },
  Acrithis: { npcId: 'npc.acrithis', locationId: 'hub.dormizone' },
  Ordis: { npcId: 'npc.ordis', locationId: 'hub.drifters-camp' },
  Hunhow: { npcId: 'npc.hunhow', locationId: 'hub.pontis-tower' },
  Nightcap: { npcId: 'npc.nightcap', locationId: 'hub.fortuna-airlock' },
  Flare: { npcId: 'npc.flare', locationId: 'acquisition-source.hollvania-missions' }
})
const OFFICIAL_STANDING_RANKS = Object.freeze({
  'Fresh Slice': '现烤披萨片', 'Hot & Fresh': '新鲜出炉', Researcher: '研究者', Scholar: '学者', Agent: '代理人'
})
function standingRequirement(vendor, amount, rank, rankCanonical) {
  return normalizeRequirements({ type: 'standing', npcId: vendor.npcId, locationId: vendor.locationId, amount, rank, rankName: OFFICIAL_STANDING_RANKS[rankCanonical] || null })
}
function frameWikiExchangeMethods(page) {
  const text = firstAcquisitionText(page), methods = []
  if (!text) return methods
  const provenance = { source: 'local-wiki-sqlite', pageTitle: page.title, section: 'Acquisition' }
  if (/main blueprint (?:can be|is) purchased from the Market/i.test(text)) methods.push({ type: 'market-purchase', scope: 'blueprint', sourceEntityId: 'interface.market', requirements: { type: 'none' }, reviewStatus: 'approved', provenance })
  for (const [name, vendor] of Object.entries(FRAME_VENDOR_ENTITIES)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const relevant = text.split(/\n+/).find(line => new RegExp(`(?:purchased|bought)[^\\n]{0,220}(?:from|at)\\s+(?:the\\s+)?${escaped}|(?:purchased|bought)\\s+from\\s+${escaped}`, 'i').test(line))
    if (!relevant) continue
    const component = relevant.match(/component blueprints?\s+for\s+([\d,]+)\s+Standing[\s\S]{0,100}?Rank\s+(\d+)\s*-\s*([A-Za-z0-9 &'-]+)/i)
      || relevant.match(/([\d,]+)\s+Standing(?:\s+[\d,]+)?\s+for component blueprints?/i)
    const blueprint = relevant.match(/(?:main|blueprint)\s+blueprint\s+for\s+([\d,]+)\s+Standing[\s\S]{0,100}?Rank\s+(\d+)\s*-\s*([A-Za-z0-9 &'-]+)/i)
      || relevant.match(/([\d,]+)\s+Standing(?:\s+[\d,]+)?\s+for main blueprint/i)
    const allBlueprints = /additional blueprints|blueprints can be (?:purchased|bought)/i.test(relevant)
    if (component) methods.push({ type: 'vendor-exchange', scope: 'component', npcId: vendor.npcId, locationId: vendor.locationId, requirements: standingRequirement(vendor, Number(component[1].replace(/,/g, '')), component[2] ? Number(component[2]) : null, component[3]?.trim() || null), reviewStatus: 'approved', provenance: { ...provenance, excerpt: relevant } })
    if (blueprint) {
      const amount = Number(blueprint[1].replace(/,/g, '')), rank = blueprint[2] ? Number(blueprint[2]) : null, rankName = blueprint[3]?.trim() || null
      methods.push({ type: 'vendor-exchange', scope: 'blueprint', npcId: vendor.npcId, locationId: vendor.locationId, requirements: standingRequirement(vendor, amount, rank, rankName), reviewStatus: 'approved', provenance: { ...provenance, excerpt: relevant } })
    } else if (allBlueprints && name === 'Cephalon Simaris') {
      const amounts = [...relevant.matchAll(/([\d,]+)\s+Standing/g)].map(match => Number(match[1].replace(/,/g, '')))
      if (amounts.includes(25000)) methods.push({ type: 'vendor-exchange', scope: 'component', npcId: vendor.npcId, locationId: vendor.locationId, requirements: standingRequirement(vendor, 25000, null, null), reviewStatus: 'approved', provenance: { ...provenance, excerpt: relevant } })
      if (amounts.includes(50000)) methods.push({ type: 'vendor-exchange', scope: 'blueprint', npcId: vendor.npcId, locationId: vendor.locationId, requirements: standingRequirement(vendor, 50000, null, null), reviewStatus: 'approved', provenance: { ...provenance, excerpt: relevant } })
    }
  }
  return methods
}
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
  if (ASSASSINATION_FRAME_OVERRIDES[frame.name]) return { ...ASSASSINATION_FRAME_OVERRIDES[frame.name] }
  const location = partDrops(frame, 'Neuroptics').concat(partDrops(frame, 'Chassis'), partDrops(frame, 'Systems')).map(drop => String(drop.location || '')).find(value => /Assassination|Assassinate/i.test(value)) || ''
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
    requirements: normalizeRequirements(acquisitionRequirement(frame, componentCategory, variables)),
    methods: [...frameWikiExchangeMethods(page), ...(FRAME_EXCHANGE_METHOD_OVERRIDES[frame.name] || []).map(method => ({ ...method, reviewStatus: 'approved', provenance: { source: 'audited-current-wiki-acquisition', pageTitle: page?.title || frame.name, section: 'Acquisition' } }))]
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

module.exports = { CATEGORY_DIRS, BLUEPRINT_CATEGORIES, METHOD_ROOT, METHOD_DEFINITIONS, METHOD_TEMPLATES, ASSASSINATION_SOURCES, ASSASSINATION_FRAME_OVERRIDES, BLUEPRINT_OVERRIDES, COMPONENT_OVERRIDES, REQUIRE_OVERRIDES, FRAME_EXCHANGE_METHOD_OVERRIDES, FRAME_VENDOR_ENTITIES, OFFICIAL_STANDING_RANKS, loadMethodDefinitions, methodTemplate, categoryDirectory, sourceEntityVariables, structuredSources, frameWikiExchangeMethods, classifyBlueprint, assassinationVariables, bountyVariables, acquisitionRequirement, buildRouting, applyTemplate }
