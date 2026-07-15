'use strict'

const crypto = require('node:crypto')
const path = require('node:path')
const {
  getCanonical,
  getDisplayName,
  getModVariant,
  getTypeCategory,
  getTypeFolder
} = require('./playable-mod-filter')

const GENERATOR_NAME = 'sync-mods'
const GENERATOR_VERSION = 4
const SYNDICATE_IDS = Object.freeze({ 'Arbiters of Hexis': 'faction.arbiters-of-hexis', 'Red Veil': 'faction.red-veil', 'Steel Meridian': 'faction.steel-meridian', 'Cephalon Suda': 'faction.cephalon-suda', 'New Loka': 'faction.new-loka', 'The Perrin Sequence': 'faction.the-perrin-sequence' })
const LOCAL_CROSS_PAGE_METHODS = Object.freeze({
  Afterburner: [{ type: 'enemy-group-drop', sourceCanonical: 'Archwing Eximus', chance: null, quantity: 1, availability: 'farmable', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Drop Tables', section: 'Missing Content', excerpt: 'Archwing Eximus enemies which are the only sources for Afterburner, Cold Snap, and Energy Field augments' } }],
  'Cold Snap': [{ type: 'enemy-group-drop', sourceCanonical: 'Archwing Eximus', chance: null, quantity: 1, availability: 'farmable', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Cold Snap', section: 'Drop Locations', excerpt: 'Obtained by defeating Eximus units in Archwing missions.' } }],
  'Energy Field': [{ type: 'enemy-group-drop', sourceCanonical: 'Archwing Eximus', chance: null, quantity: 1, availability: 'farmable', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Drop Tables', section: 'Missing Content', excerpt: 'Archwing Eximus enemies which are the only sources for Afterburner, Cold Snap, and Energy Field augments' } }],
  'Acidic Spittle': [{ type: 'companion-included', sourceItemCanonical: 'Vizier Predasite', chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Vizier Predasite', section: 'Lead', excerpt: 'Its precepts Acidic Spittle and Iatric Mycelium are tied to the Vizier Predasite.' } }],
  'Aerial Prospectus': [{ type: 'companion-included', sourceItemCanonical: 'Hound built with the Wanz Stabilizer', chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Hound (Companion)', section: 'Notes', excerpt: 'The Wanz Stabilizer comes with the Aerial Prospectus Precept.' } }],
  'Anabolic Pollination': [{ type: 'companion-included', sourceItemCanonical: 'Pharaoh Predasite', chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Pharaoh Predasite', section: 'Lead', excerpt: 'Its precepts Anabolic Pollination and Endoparasitic Vector are tied to the Pharaoh Predasite.' } }],
  'Anti-Grav Grenade': [{ type: 'companion-included', sourceItemCanonical: 'MOA built with the Para Model', chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'MOA (Companion)', section: 'Notes', excerpt: 'The Para Model comes with Anti-Grav Grenade and Whiplash Mine Precepts.' } }],
  'Arc Coil': [{ type: 'companion-included', sourceItemCanonical: 'Diriga', chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Diriga', section: 'Lead', excerpt: 'Diriga utilizes the Calculated Shot, Arc Coil and Electro Pulse precepts.' } }],
  Neutralize: [{ type: 'companion-included', sourceItemCanonical: 'Chesa Kubrow', chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Neutralize (Mod)', section: 'Acquisition', excerpt: 'Neutralize is automatically acquired upon obtaining a Chesa Kubrow.' } }],
  'Repair Kit': [{ type: 'object-drop', sourceCanonical: 'Domestik Drone', chance: null, quantity: 1, availability: 'farmable', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Repair Kit', section: 'Lead', excerpt: 'It is the only occasional drop from the Domestik Drone on Corpus Gas Cities and Corpus Ships.' } }],
  'Amalgam Shotgun Barrage': [{ type: 'event-milestone-reward', sourceCanonical: 'Thermia Fractures', points: 25, chance: null, quantity: 1, availability: 'recurring-event', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Thermia Fractures', section: 'Rewards', excerpt: '25 Points: Amalgam Shotgun Barrage and Amalgam Serration' } }],
  'Amalgam Serration': [{ type: 'event-milestone-reward', sourceCanonical: 'Thermia Fractures', points: 25, chance: null, quantity: 1, availability: 'recurring-event', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Thermia Fractures', section: 'Rewards', excerpt: '25 Points: Amalgam Shotgun Barrage and Amalgam Serration' } }],
  'Amalgam Barrel Diffusion': [{ type: 'event-milestone-reward', sourceCanonical: 'Thermia Fractures', points: 50, chance: null, quantity: 1, availability: 'recurring-event', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Thermia Fractures', section: 'Rewards', excerpt: '50 Points: Amalgam Barrel Diffusion and Amalgam Organ Shatter' } }],
  'Amalgam Organ Shatter': [{ type: 'event-milestone-reward', sourceCanonical: 'Thermia Fractures', points: 50, chance: null, quantity: 1, availability: 'recurring-event', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Thermia Fractures', section: 'Rewards', excerpt: '50 Points: Amalgam Barrel Diffusion and Amalgam Organ Shatter' } }],
  'Aerial Ace': [{ type: 'vendor-or-syndicate-exchange', sourceEntityId: 'npc.arbitration-honors', locationId: 'hub.any-relay', currency: [{ currencyId: 'currency.vitus-essence', amount: 30 }], chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Vitus Essence', section: 'Arbitration Honors', excerpt: '30 Aerial Ace' } }],
  'Archgun Riven Mod': [{ type: 'vendor-or-syndicate-exchange', sourceEntityId: 'npc.arbitration-honors', locationId: 'hub.any-relay', currency: [{ currencyId: 'currency.vitus-essence', amount: 35 }], chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Vitus Essence', section: 'Arbitration Honors', excerpt: '35 Archgun Riven Mod' } }],
  'Amanata Pressure': [{ type: 'vendor-or-syndicate-exchange', sourceEntityId: 'npc.koumei-shrine', locationId: 'hub.cetus', prerequisite: 'steel-path', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.koumei-shrine', locationId: 'hub.cetus', currency: [{ currencyId: 'currency.fate-pearl', amount: 150 }], isBuffUseless: true }, chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: "Koumei's Shrine", section: 'Offer Fate Pearls', excerpt: 'Players who have access to The Steel Path can purchase Amanata Pressure for 150 Fate Pearl.' } }],
  'Aegis Gale': [{ type: 'syndicate-exchange-group', factionIds: ['faction.cephalon-suda', 'faction.the-perrin-sequence'], standing: 25000, rankRequirement: 'max', chance: null, quantity: 1, availability: 'guaranteed-when-requirements-met', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Cephalon Suda / The Perrin Sequence', section: 'Offerings', excerpt: 'Aegis Gale (Hildryn), Rank 5, 25,000 Standing' } }],
  Oull: [{ type: 'adversary-drop', sourceCanonical: 'Kuva Lich', chance: 25, quantity: 1, availability: 'farmable', reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite', pageTitle: 'Kuva Lich', section: 'Requiem Mods', excerpt: 'Oull drops from the Kuva Lich at a 25% chance once they flee to the Saturn Proxima.' } }]
})
const RAW_MOD_DROPS_BY_UNIQUE_NAME = require(path.join(path.dirname(require.resolve('warframe-items')), 'data', 'json', 'Mods.json')).reduce((index, mod) => {
  index.set(mod.uniqueName, [...(index.get(mod.uniqueName) || []), ...(mod.drops || [])])
  return index
}, new Map())
const USER_FACING_REPLACEMENTS = new Map([
  ['Atlas', '阿特拉斯'],
  ['Mesa', '梅萨'],
  ['Nezha', '哪吒'],
  ['Mirage', '幻影'],
  ['Corpus', '科普斯'],
  ['Grineer', '克隆尼'],
  ['Infested', '感染者'],
  ['Orokin', '奥罗金'],
  ['Sentient', '灵煞'],
  ['Helminth', '大嘴'],
  ['CHANCE', '几率'],
  ['DAMAGE', '伤害']
])

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function cleanEffectDetail(value) {
  let result = String(value || '')
    .replace(/\\n/g, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/<[^>]*>/g, '')
  for (const [english, chinese] of USER_FACING_REPLACEMENTS) {
    result = result.replace(new RegExp(`\\b${english}\\b`, 'g'), chinese)
  }
  return result
    .replace(/\s+/g, ' ')
    .trim()
}

function getEffectDetails(item, localized = {}) {
  const candidates = [
    localized.levelStats?.at(-1)?.stats,
    localized.stats,
    localized.description,
    item.levelStats?.at(-1)?.stats,
    item.stats,
    item.description
  ]
  const selected = candidates.find(value =>
    (Array.isArray(value) && value.length) || (typeof value === 'string' && value.trim()))
  const details = [...new Set([selected].flat().map(cleanEffectDetail).filter(Boolean))]
  if (details.length) return details
  if (/Riven Mod$/i.test(item.type || '')) return ['属性由揭示结果随机生成']
  return ['上游数据未提供可显示的满级效果']
}

function getGeneratedIdentity(item) {
  const base = slugify(getCanonical(item)) || 'mod'
  const suffix = crypto
    .createHash('sha1')
    .update(item.uniqueName)
    .digest('hex')
    .slice(0, 8)
  return {
    id: `knowledge.acquisition.mod.${base}-${suffix}`,
    fileName: `${base}-${suffix}.json`
  }
}

function getCategoryRefs(item) {
  const variant = getModVariant(item)
  const typeCategory = getTypeCategory(item)
  if (variant === 'prime') return ['primemod', typeCategory]
  if (variant === 'flawed') return ['flawedmod', typeCategory]
  if (getSyndicateMethods(item).length) return ['syndicatemod', typeCategory, 'standardmod']
  return [typeCategory, 'standardmod']
}

function getMaxRank(item) {
  return Number.isInteger(item.fusionLimit)
    ? item.fusionLimit
    : Math.max(0, (item.levelStats || []).length - 1)
}

function getWikiSource(item) {
  const wikiName = getCanonical(item).replace(/ /g, '_')
  return {
    url: item.wikiaUrl || `https://wiki.warframe.com/w/${encodeURIComponent(wikiName)}`,
    label: `Warframe Wiki - ${getCanonical(item)}`
  }
}

function getSyndicateMethods(item) {
  const drops = RAW_MOD_DROPS_BY_UNIQUE_NAME.get(item.uniqueName) || item.drops || []
  return [...new Set(drops.map(drop => String(drop.location || '').split(',')[0].trim()).filter(name => SYNDICATE_IDS[name]))]
    .map(name => ({ type: 'syndicate-exchange', factionId: SYNDICATE_IDS[name], rankRequirement: 'max', currencyType: 'standing', provenance: { source: 'warframe-items', canonical: name } }))
}
function localCrossPageMethods(item) {
  return (LOCAL_CROSS_PAGE_METHODS[getCanonical(item)] || []).map(method => JSON.parse(JSON.stringify(method)))
}
function officialDropMethods(item) {
  const drops = RAW_MOD_DROPS_BY_UNIQUE_NAME.get(item.uniqueName) || item.drops || []
  return drops.filter(drop => drop.location && Number.isFinite(Number(drop.chance))).map(drop => ({
    type: 'official-drop', sourceCanonical: String(drop.location).trim(), chance: Number(drop.chance) * 100, quantity: 1,
    rarity: drop.rarity || null, reviewStatus: 'draft',
    provenance: { source: 'warframe-items', input: 'Mods.json', officialUniqueName: item.uniqueName }
  }))
}

function buildModEntry(item, localized = {}, options = {}) {
  const canonical = getCanonical(item)
  const displayName = getDisplayName(item, localized)
  const variant = getModVariant(item)
  const syndicateMethods = getSyndicateMethods(item)
  const hasDefaultAcquisition = variant === 'prime' || syndicateMethods.length > 0
  const identity = getGeneratedIdentity(item)
  const effectDetails = getEffectDetails(item, localized)
  const entry = {
    id: options.id || identity.id,
    kind: 'knowledge',
    module: 'acquisition',
    title: displayName,
    subject: {
      canonical,
      displayName,
      category: 'mod',
      categoryRefs: getCategoryRefs(item)
    },
    officialUniqueName: item.uniqueName,
    maxRank: getMaxRank(item),
    effectDetails,
    rarity: item.rarity || null,
    polarity: item.polarity || null,
    tradable: Boolean(item.tradable),
    prerequisites: [],
    tips: [],
    tipKeywords: ['本质机制', '具体计算公式', '加成层级', '与同类效果的叠加方式', '适用限制'],
    methodRefs: [],
    modAcquisition: {
      generated: {
        identity: {
          officialUniqueName: item.uniqueName,
          canonical,
          displayName,
          maxRank: getMaxRank(item),
          variant,
          typeFolder: getTypeFolder(item)
        },
        wiki: (syndicateMethods.length || localCrossPageMethods(item).length) ? { status: 'complete', methods: [...syndicateMethods, ...localCrossPageMethods(item)], evidence: [], mechanicsEvidence: {}, unresolvedEntities: [] } : null,
        officialDrops: officialDropMethods(item)
      },
      manual: {
        methods: [],
        methodRefs: [],
        overrides: {},
        reviewStatus: hasDefaultAcquisition ? 'approved' : 'draft',
        reviewedBy: syndicateMethods.length ? ['official-sync:syndicate-exchange'] : hasDefaultAcquisition ? ['category-default:primemod'] : []
      }
    },
    acquisitionStatus: hasDefaultAcquisition ? 'complete' : 'stub',
    sources: [getWikiSource(item)],
    gameVersion: options.gameVersion || 'warframe-items',
    updatedAt: options.updatedAt || new Date().toISOString().slice(0, 10),
    reviewStatus: hasDefaultAcquisition ? 'approved' : 'draft',
    reviewedBy: syndicateMethods.length ? ['official-sync:syndicate-exchange'] : hasDefaultAcquisition ? ['category-default:primemod'] : [],
    tags: ['acquisition', 'mod', `${variant}-mod`, `${getTypeFolder(item)}-mod`],
    generator: {
      name: GENERATOR_NAME,
      version: GENERATOR_VERSION
    }
  }
  return entry
}

function isGeneratedModEntry(entry) {
  return entry?.generator?.name === GENERATOR_NAME
}

function migrateManualModData(entry = {}) {
  const existing = entry.modAcquisition?.manual || {}
  return {
    ...existing,
    methods: Array.isArray(existing.methods) ? existing.methods : [],
    methodRefs: Array.isArray(existing.methodRefs) ? existing.methodRefs : [...(entry.methodRefs || [])],
    overrides: existing.overrides || {},
    reviewStatus: existing.reviewStatus || entry.reviewStatus || 'draft',
    reviewedBy: Array.isArray(existing.reviewedBy) ? existing.reviewedBy : [...(entry.reviewedBy || [])]
  }
}

function mergeGeneratedWiki(generatedWiki, oldWiki) {
  if (!generatedWiki) return oldWiki || null
  if (!oldWiki) return generatedWiki
  const maintainedMethods = (generatedWiki.methods || []).filter(method => method.type === 'syndicate-exchange' || method.provenance?.source === 'local-wiki-sqlite')
  if (!maintainedMethods.length) return oldWiki
  const maintainedKeys = new Set(maintainedMethods.map(method => `${method.type}\0${method.sourceCanonical || method.sourceEntityId || (method.factionIds || []).join(',')}`))
  return {
    ...oldWiki,
    methods: [...maintainedMethods, ...(oldWiki.methods || []).filter(method => !maintainedKeys.has(`${method.type}\0${method.sourceCanonical || method.sourceEntityId || (method.factionIds || []).join(',')}`))],
    status: oldWiki.status === 'unresolved' ? 'complete' : oldWiki.status
  }
}

function mergeModEntry(generatedEntry, oldEntry) {
  if (!oldEntry) return generatedEntry
  const next = { ...oldEntry, ...generatedEntry }
  for (const key of ['effects', 'tips', 'tipKeywords', 'methodRefs', 'prerequisites', 'reviewStatus', 'reviewedBy', 'acquisitionStatus', 'summary', 'content', 'acquisitionQuery']) {
    if (oldEntry[key] !== undefined) next[key] = oldEntry[key]
  }
  next.subject = { ...(oldEntry.subject || {}), ...generatedEntry.subject }
  next.modAcquisition = {
    generated: {
      ...generatedEntry.modAcquisition.generated,
      wiki: mergeGeneratedWiki(generatedEntry.modAcquisition.generated.wiki, oldEntry.modAcquisition?.generated?.wiki),
      officialDrops: generatedEntry.modAcquisition.generated.officialDrops
    },
    manual: migrateManualModData(oldEntry)
  }
  const hasGeneratedApprovedRoute = next.modAcquisition.generated.wiki?.methods?.some(method => method.type === 'syndicate-exchange' || method.reviewStatus === 'approved')
  if (hasGeneratedApprovedRoute && next.modAcquisition.manual.reviewStatus !== 'rejected') {
    next.modAcquisition.manual.reviewStatus = 'approved'
    const generatedReviewer = next.modAcquisition.generated.wiki.methods.some(method => method.provenance?.source === 'local-wiki-sqlite') ? 'local-wiki-cross-page-sync' : 'official-sync:syndicate-exchange'
    next.modAcquisition.manual.reviewedBy = [...new Set([...(next.modAcquisition.manual.reviewedBy || []), generatedReviewer])]
    next.acquisitionStatus = 'complete'
    next.reviewStatus = 'approved'
    next.reviewedBy = [...new Set([...(next.reviewedBy || []), generatedReviewer])]
  }
  return next
}

module.exports = {
  GENERATOR_NAME,
  GENERATOR_VERSION,
  buildModEntry,
  cleanEffectDetail,
  getCategoryRefs,
  getEffectDetails,
  getGeneratedIdentity,
  getMaxRank,
  getSyndicateMethods,
  localCrossPageMethods,
  officialDropMethods,
  SYNDICATE_IDS,
  isGeneratedModEntry,
  mergeGeneratedWiki,
  mergeModEntry,
  migrateManualModData,
  slugify
}
