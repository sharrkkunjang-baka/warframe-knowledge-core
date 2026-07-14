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
const GENERATOR_VERSION = 3
const SYNDICATE_IDS = Object.freeze({ 'Arbiters of Hexis': 'faction.arbiters-of-hexis', 'Red Veil': 'faction.red-veil', 'Steel Meridian': 'faction.steel-meridian', 'Cephalon Suda': 'faction.cephalon-suda', 'New Loka': 'faction.new-loka', 'The Perrin Sequence': 'faction.the-perrin-sequence' })
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
        wiki: syndicateMethods.length ? { status: 'complete', methods: syndicateMethods, evidence: [], mechanicsEvidence: {}, unresolvedEntities: [] } : null
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
  const officialMethods = (generatedWiki.methods || []).filter(method => method.type === 'syndicate-exchange')
  if (!officialMethods.length) return oldWiki
  return {
    ...oldWiki,
    methods: [...officialMethods, ...(oldWiki.methods || []).filter(method => method.type !== 'syndicate-exchange')],
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
      wiki: mergeGeneratedWiki(generatedEntry.modAcquisition.generated.wiki, oldEntry.modAcquisition?.generated?.wiki)
    },
    manual: migrateManualModData(oldEntry)
  }
  const hasSyndicateRoute = next.modAcquisition.generated.wiki?.methods?.some(method => method.type === 'syndicate-exchange')
  if (hasSyndicateRoute && next.modAcquisition.manual.reviewStatus !== 'rejected') {
    next.modAcquisition.manual.reviewStatus = 'approved'
    next.modAcquisition.manual.reviewedBy = [...new Set([...(next.modAcquisition.manual.reviewedBy || []), 'official-sync:syndicate-exchange'])]
    next.acquisitionStatus = 'complete'
    next.reviewStatus = 'approved'
    next.reviewedBy = [...new Set([...(next.reviewedBy || []), 'official-sync:syndicate-exchange'])]
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
  SYNDICATE_IDS,
  isGeneratedModEntry,
  mergeGeneratedWiki,
  mergeModEntry,
  migrateManualModData,
  slugify
}
