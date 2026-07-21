'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { loadData, readObjectDirectory } = require('../src/loader')
const { filterPlayableMods, getCanonical, getDisplayName } = require('../src/playable-mod-filter')
const { resolveWikiDatabase, inspectWikiDatabase } = require('../src/wiki-db')

const ROOT = path.resolve(__dirname, '..')
const BOT_ROOT = path.resolve(ROOT, '..', '..', 'qq-bot')
const CONTENT_ROOT = path.resolve(process.env.WF_CONTENT_ROOT || path.join(ROOT, '..', 'warframe-content'))
const OUTPUT = path.join(ROOT, 'generated', 'full-entity-coverage-audit.json')
const MARKDOWN_OUTPUT = path.join(ROOT, 'generated', 'full-entity-coverage-audit.md')
const PREVIEW_ROOT = path.join(BOT_ROOT, 'temp', 'full-entity-audit-previews')
const WIKI_DB = path.join(ROOT, '.cache', 'warframe-wiki.sqlite')
const PACKAGE_ROOT = path.dirname(require.resolve('warframe-items'))
const PACKAGE_DATA = path.join(PACKAGE_ROOT, 'data', 'json')

const DOMAIN_ORDER = [
  'currency',
  'resource-material',
  'weapon',
  'mod',
  'arcane',
  'warframe',
  'npc-faction-enemy',
  'mission-location',
  'shop-inventory'
]
const MANIFEST_SPECS = [
  ['frame-images', ['frames'], 'warframe', 'icon'],
  ['ability-images', ['abilities'], 'warframe', 'icon'],
  ['weapon-images', ['weapons'], 'weapon', 'icon'],
  ['mod-card-images', ['items'], 'mod', 'card'],
  ['arcane-images', ['arcanes'], 'arcane', 'icon'],
  ['item-images', ['items'], null, 'icon'],
  ['resource-images', ['resources'], 'resource-material', 'icon'],
  ['component-images', ['components'], null, 'component']
]
const WIKI_CATEGORY_SPECS = {
  weapon: ['Weapons'],
  mod: ['Mods'],
  arcane: ['Arcane_Enhancements'],
  warframe: ['Warframes'],
  'npc-faction-enemy': ['Characters', 'Enemies', 'Factions'],
  'mission-location': ['Quests', 'Mission_Types', 'Locations'],
  'resource-material': ['Resources'],
  currency: ['Currencies']
}
const RESOURCE_KINDS = new Set([
  'resource', 'material', 'material-or-usable', 'mineral', 'plant', 'fish', 'fish-part',
  'fish-bait', 'conservation-tag', 'upgrade-item', 'key'
])
const CURRENCY_KINDS = new Set(['currency', 'currency-token', 'currency-token-material'])

function readJson(filename, fallback = null) {
  return fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : fallback
}
function normalize(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s_\-·'’/&]+/g, '')
}
function normalizeIdentity(value) {
  return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/#\d+$/, '')
}
function stableKey(item) {
  return String(item.uniqueName || item.officialUniqueName || item.id || `${item.domain}:${normalize(item.canonical)}`)
}
function identityAliases(item) {
  const embeddedNodeId = String(item.id || '').match(/-((?:sol|clan)node\d+)$/i)?.[1] || null
  return [...new Set([
    ...(item.identityAliases || []),
    ...(item.internalPaths || []),
    item.officialCode,
    item.officialUniqueName,
    embeddedNodeId
  ].filter(Boolean))]
}
function toEntity(domain, source, item, extra = {}) {
  const canonical = item.canonical || item.name || item.title || item.displayName || ''
  return {
    domain,
    stableId: item.uniqueName || item.officialUniqueName || item.id || null,
    canonical,
    displayName: item.displayName || null,
    localizationStatus: item.localizationStatus || null,
    source,
    expectedMediaFilename: item.imageName || item.expectedMediaFilename || null,
    semanticKinds: item.semanticKinds || [],
    identityAliases: identityAliases(item),
    ...extra
  }
}
function dedupe(items) {
  const result = new Map(), names = new Map()
  for (const item of items) {
    if (!item.canonical && !item.stableId) continue
    const key = item.stableId || `${item.domain}:${normalize(item.canonical)}`
    const old = result.get(key)
    const merged = old ? {
      ...old,
      ...item,
      displayName: item.displayName || old.displayName,
      expectedMediaFilename: item.expectedMediaFilename || old.expectedMediaFilename,
      sources: [...new Set([...(old.sources || [old.source]), ...(item.sources || [item.source])])]
    } : { ...item, sources: item.sources || [item.source] }
    result.set(key, merged)
    const name = normalize(merged.canonical)
    if (name) {
      if (!names.has(name)) names.set(name, [])
      if (!names.get(name).includes(key)) names.get(name).push(key)
    }
  }
  // Wiki category pages usually have no stable ID. Merge those directory records into an
  // exact-name stable identity instead of inflating expected counts. Distinct stable IDs
  // sharing one display name remain separate entities.
  for (const [key, item] of [...result]) {
    if (item.stableId) continue
    const candidates = (names.get(normalize(item.canonical)) || []).filter(candidate => candidate !== key && result.get(candidate)?.stableId)
    if (!candidates.length) continue
    const target = candidates[0], old = result.get(target)
    result.set(target, {
      ...old,
      wiki: item.wiki || old.wiki,
      sources: [...new Set([...(old.sources || [old.source]), ...(item.sources || [item.source])])]
    })
    result.delete(key)
  }
  return [...result.values()]
}
function dedupeIdentityAliases(items) {
  const result = []
  const ownerByIdentity = new Map()
  for (const item of dedupe(items)) {
    const identities = [item.stableId, ...(item.identityAliases || [])].map(normalizeIdentity).filter(Boolean)
    const existing = identities.map(identity => ownerByIdentity.get(identity)).find(Boolean)
    if (existing) {
      existing.identityAliases = [...new Set([...(existing.identityAliases || []), item.stableId, ...(item.identityAliases || [])].filter(Boolean))]
      existing.sources = [...new Set([...(existing.sources || [existing.source]), ...(item.sources || [item.source])])]
      existing.displayName ||= item.displayName
      existing.expectedMediaFilename ||= item.expectedMediaFilename
      for (const identity of identities) ownerByIdentity.set(identity, existing)
      continue
    }
    const copy = { ...item }
    result.push(copy)
    for (const identity of identities) ownerByIdentity.set(identity, copy)
  }
  return result
}
function stableExpected(authoritative, wikiDirectory, options = {}) {
  const eligibleWiki = options.includeWikiStable === false
    ? wikiDirectory.filter(item => !item.stableId)
    : wikiDirectory.filter(item => options.includeWiki?.(item) !== false)
  const entries = dedupe([...authoritative, ...eligibleWiki])
  return {
    entries: entries.filter(item => item.stableId),
    directoryOnly: entries.filter(item => !item.stableId)
  }
}
function publicExport(name) {
  return readJson(path.join(PACKAGE_DATA, `${name}.json`), [])
}
function officialItems() {
  return readJson(path.join(ROOT, 'knowledge', 'generated', 'official-items.json'), { items: [] }).items || []
}
function registryEntities(registry, domain, source) {
  return (registry?.values || []).map(item => toEntity(domain, source, item))
}
function wikiInfoboxIdentity(text) {
  const match = String(text || '').match(/\bInfobox Data (\{[^\r\n]+\})/)
  if (!match) return null
  try {
    const infobox = JSON.parse(match[1])
    if (!String(infobox.InternalName || '').startsWith('/Lotus/')) return null
    return {
      uniqueName: infobox.InternalName,
      canonical: infobox.Name || null,
      wikiClass: infobox.Class || null,
      wikiSlot: infobox.Slot || null
    }
  } catch (_) {
    return null
  }
}
function wikiCategoryEntries(dbPath) {
  const byDomain = Object.fromEntries(DOMAIN_ORDER.map(domain => [domain, []]))
  if (!fs.existsSync(dbPath)) return byDomain
  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const query = db.prepare('SELECT p.title,p.text,p.page_id pageId,p.revision_id revisionId,c.category FROM categories c JOIN pages p ON p.page_id=c.page_id WHERE c.category=? ORDER BY p.title')
    for (const [domain, categories] of Object.entries(WIKI_CATEGORY_SPECS)) {
      for (const category of categories) for (const row of query.iterate(category)) {
        const identity = wikiInfoboxIdentity(row.text)
        byDomain[domain].push(toEntity(domain, `wiki-category:${category}`, {
          ...row,
          uniqueName: identity?.uniqueName,
          canonical: identity?.canonical || row.title
        }, {
          wiki: {
            pageId: row.pageId,
            revisionId: row.revisionId,
            category,
            identitySource: identity ? 'embedded-infobox-data' : null,
            class: identity?.wikiClass || null,
            slot: identity?.wikiSlot || null
          }
        }))
      }
    }
  } finally {
    db.close()
  }
  return byDomain
}
function buildExpected(data, dbPath) {
  const wiki = wikiCategoryEntries(dbPath)
  const items = officialItems()
  const coverage = readJson(path.join(ROOT, 'generated', 'official-coverage-manifest.json'), { domains: {} })
  const vendor = readJson(path.join(ROOT, 'generated', 'official-vendor-offer-index.json'), { byItem: {} })
  const resourceCatalog = readJson(path.join(ROOT, 'generated', 'resource-asset-catalog.json'), { entries: [] })
  const currentWikiSupplements = readJson(path.join(ROOT, 'generated', 'current-wiki-supplements.json'), { entries: [] })
  const recentMods = readJson(path.join(ROOT, 'knowledge', 'supplemental', 'current-mod-identities.json'), { items: [] }).items || []
  const packageMods = publicExport('Mods')
  const localizedMods = new (require('warframe-items'))({ category: ['Mods'], i18n: ['zh'] })
  const packageModLocalization = localizedMods.i18n || {}

  const currency = items.filter(item => (item.semanticKinds || []).some(kind => CURRENCY_KINDS.has(kind)))
    .map(item => toEntity('currency', 'public-export:official-items', item))
  const resources = items.filter(item => (item.semanticKinds || []).some(kind => RESOURCE_KINDS.has(kind)))
    .map(item => toEntity('resource-material', 'public-export:official-items', item))
  const catalogResources = (resourceCatalog.entries || [])
    .filter(item => item.category !== 'token-or-currency')
    .map(item => toEntity('resource-material', 'cross-source:resource-asset-catalog', {
      uniqueName: item.stableIdentity?.uniqueName,
      canonical: item.stableIdentity?.canonical,
      displayName: item.stableIdentity?.displayName,
      localizationStatus: item.stableIdentity?.localizationStatus,
      expectedMediaFilename: item.expectedMediaFilename
    }, {
      resourceCategory: item.category,
      wiki: item.wiki || null
    }))
  const currentWikiResources = (currentWikiSupplements.entries || [])
    .filter(item => item.domain === 'resources')
    .map(item => toEntity('resource-material', 'current-wiki:supplement', {
      uniqueName: `wiki-current:resource:${item.canonical}`,
      canonical: item.canonical,
      displayName: item.displayName,
      localizationStatus: item.displayName ? 'official-zh' : 'official-zh-unavailable'
    }, { wiki: item.page || null }))
  const weapons = (readJson(path.join(ROOT, 'knowledge', 'generated', 'official-weapons.json'), { weapons: [] }).weapons || [])
    .map(item => toEntity('weapon', 'DE-ExportWeapons+Languages.bin', item, { equipmentType: item.equipmentType }))
  const mods = [
    ...filterPlayableMods(packageMods).playable.map(item => toEntity('mod', 'public-export:Mods.json', {
      ...item,
      canonical: getCanonical(item),
      displayName: getDisplayName(item, packageModLocalization[item.uniqueName]?.zh || {}),
      localizationStatus: 'official-zh'
    })),
    ...recentMods.map(item => toEntity('mod', 'supplemental:current-mod-identities', {
      ...item,
      displayName: null
    }, { introduced: item.introduced }))
  ]
  const arcaneSupplements = readJson(path.join(ROOT, 'generated', 'official-arcane-supplements.json'), { entries: [] }).entries || []
  const arcanes = [
    ...publicExport('Arcanes')
      .filter(item => item.name !== 'Arcane' && !item.excludeFromCodex)
      .map(item => toEntity('arcane', 'public-export:Arcanes.json', item)),
    ...arcaneSupplements.map(item => toEntity('arcane', 'current-wiki:official-arcane-supplements', {
      uniqueName: item.officialUniqueName,
      canonical: item.canonical,
      displayName: item.displayName,
      localizationStatus: item.localizationStatus
    }))
  ]
  const frames = (coverage.domains?.warframe?.entries || []).map(item => toEntity('warframe', 'cross-source:official-coverage-manifest', {
    uniqueName: item.identity,
    canonical: item.canonical,
    displayName: null
  }, { sourcePresence: item.sourcePresence }))
  const abilities = (data.officialAbilities?.abilities || []).map(item => toEntity('warframe', 'DE-ExportWarframes+Languages.bin', {
    uniqueName: item.officialUniqueName || item.uniqueName,
    canonical: item.canonical,
    displayName: item.displayName,
    imageName: item.imageName,
    localizationStatus: item.localizationStatus || 'official-zh'
  }, { entityType: 'ability', requiresAcquisition: false }))
  const people = [
    ...registryEntities(data.enemies, 'npc-faction-enemy', 'registry:enemies'),
    ...registryEntities(data.npcs, 'npc-faction-enemy', 'wiki-directory:Characters'),
    ...registryEntities(data.factions, 'npc-faction-enemy', 'registry:factions'),
    // warframe-items 的 imageName 是旧包内文件提示，不代表 current Wiki 角色素材已接入。
    // 敌人素材必须由 current-Wiki manifest 显式绑定，不能把包字段误报成素材缺失。
    ...publicExport('Enemy').map(item => toEntity('npc-faction-enemy', 'public-export:Enemy.json', item, { expectedMediaFilename: null }))
  ]
  const places = [
    ...registryEntities(data.locations, 'mission-location', 'registry:locations'),
    ...registryEntities(data.quests, 'mission-location', 'registry:quests'),
    ...registryEntities(data.missionTypes, 'mission-location', 'registry:mission-types'),
    ...publicExport('Node').map(item => toEntity('mission-location', 'public-export:Node.json', item)),
    ...publicExport('Quests').map(item => toEntity('mission-location', 'public-export:Quests.json', item))
  ]
  const officialItemById = new Map(items.map(item => [item.uniqueName, item]))
  const shops = Object.entries(vendor.byItem || {}).flatMap(([itemUniqueName, offers]) => offers.map((offer, index) => {
    const item = officialItemById.get(itemUniqueName)
    return toEntity(
    'shop-inventory',
    'DE-ExportVendors',
    {
      uniqueName: `${itemUniqueName}#${index}`,
      canonical: offer.itemCanonical || item?.canonical || item?.name || itemUniqueName,
      displayName: offer.itemDisplayName || item?.displayName || null
    },
    { itemUniqueName, offer }
    )
  }))
  const stable = {
    weapon: stableExpected(weapons, wiki.weapon, {
      // Weapons 类别也含鱼叉等 Gear。只有拥有稳定 InternalName 且插槽不是 Gear
      // 的 Wiki 条目才可扩展 DE 武器目录；导航页仍进入 directoryOnly 供审查。
      includeWiki: item => item.wiki?.slot !== 'Gear'
    }),
    mod: stableExpected(mods, wiki.mod, { includeWikiStable: false }),
    warframe: stableExpected([...frames, ...abilities], wiki.warframe, { includeWikiStable: false }),
    'npc-faction-enemy': stableExpected(dedupeIdentityAliases(people), wiki['npc-faction-enemy']),
    'mission-location': stableExpected(dedupeIdentityAliases(places), wiki['mission-location'])
  }
  return {
    // Currencies 类别含 Currencies、Standing、Ducats/Prices 等导航/价格页。
    // 发布目录与 DE 稳定身份已覆盖真实货币，不能把这些页面当成实体。
    currency: dedupe([...currency, ...registryEntities(data.currencies, 'currency', 'registry:currencies')]),
    // Resources 类别包含导航页、装备和消耗品概览；资源资产目录已经用
    // Public Export 稳定身份与 current Wiki 页证据完成实体化分类。
    'resource-material': dedupe([...resources, ...catalogResources, ...currentWikiResources]),
    weapon: stable.weapon.entries,
    mod: stable.mod.entries,
    // Arcanes.json 含抽象 Arcane 基类，Wiki 类别还含 Arcane Enhancement
    // 导航页与资源 Vosfor；同步层已显式排除并收录当前 Wiki 补充赋能。
    arcane: dedupe(arcanes),
    warframe: stable.warframe.entries,
    'npc-faction-enemy': stable['npc-faction-enemy'].entries,
    'mission-location': stable['mission-location'].entries,
    'shop-inventory': dedupe(shops),
    directoryOnlyExcluded: Object.fromEntries(Object.entries(stable).map(([domain, value]) => [domain, value.directoryOnly]))
  }
}
function resourceEntries() {
  return readObjectDirectory(path.join(ROOT, 'knowledge', 'acquisition', 'resource', 'entries'))
    .filter(item => item.subject)
}
function buildPublished(data) {
  const knowledge = data.knowledge || []
  const subjectEntities = (category, domain) => knowledge.filter(item => item.subject?.category === category)
    .map(item => toEntity(domain, 'runtime:knowledge', {
      ...item.subject,
      uniqueName: item.officialUniqueName || item.subject.officialUniqueName
    }, { reviewStatus: item.reviewStatus, acquisitionStatus: item.acquisitionStatus, raw: item }))
  return {
    currency: registryEntities(data.currencies, 'currency', 'runtime:currencies'),
    'resource-material': resourceEntries().map(item => toEntity('resource-material', 'runtime:resources', {
      ...item.subject,
      uniqueName: item.officialUniqueName || item.subject.officialUniqueName
    }, { reviewStatus: item.reviewStatus, acquisitionStatus: item.acquisitionStatus, raw: item })),
    weapon: (data.weapons || []).map(item => toEntity('weapon', 'runtime:weapons', {
      ...item.subject,
      uniqueName: item.subject?.officialUniqueName
    }, { reviewStatus: item.reviewStatus, acquisitionStatus: item.status, raw: item })),
    mod: subjectEntities('mod', 'mod'),
    arcane: (data.arcanes || []).map(item => toEntity('arcane', 'runtime:arcanes', {
      ...item.subject,
      uniqueName: item.officialUniqueName || item.subject?.officialUniqueName
    }, { reviewStatus: item.reviewStatus, acquisitionStatus: item.acquisitionStatus, raw: item })),
    warframe: [
      ...subjectEntities('frame', 'warframe'),
      ...(data.officialAbilities?.abilities || []).map(item => toEntity('warframe', 'runtime:official-abilities', {
        uniqueName: item.officialUniqueName || item.uniqueName,
        canonical: item.canonical,
        displayName: item.displayName,
        localizationStatus: item.localizationStatus || 'official-zh'
      }, { entityType: 'ability', requiresAcquisition: false }))
    ],
    'npc-faction-enemy': [
      ...registryEntities(data.enemies, 'npc-faction-enemy', 'runtime:enemies'),
      ...registryEntities(data.npcs, 'npc-faction-enemy', 'runtime:npcs'),
      ...registryEntities(data.factions, 'npc-faction-enemy', 'runtime:factions')
    ],
    'mission-location': [
      ...registryEntities(data.locations, 'mission-location', 'runtime:locations'),
      ...registryEntities(data.quests, 'mission-location', 'runtime:quests'),
      ...registryEntities(data.missionTypes, 'mission-location', 'runtime:mission-types')
    ],
    'shop-inventory': []
  }
}
function indexEntities(items) {
  const byId = new Map(), byName = new Map()
  const add = (map, key, item) => {
    if (!key) return
    if (!map.has(key)) map.set(key, [])
    if (!map.get(key).includes(item)) map.get(key).push(item)
  }
  for (const item of items) {
    if (item.stableId) add(byId, normalizeIdentity(item.stableId), item)
    for (const alias of item.identityAliases || []) add(byId, normalizeIdentity(alias), item)
    const name = normalize(item.canonical)
    if (name) add(byName, name, item)
  }
  return { byId, byName }
}
function hasLocalizedDisplay(item) {
  if (item.localizationStatus === 'official-zh') return true
  const value = String(item.displayName || '')
  // DE 官方简中有意保留大量英文专名（如 Atlas、Loki、Endo）。非空的已生成
  // displayName 可作为已接入本地化字段，不以“必须含汉字”制造假阳性。
  return Boolean(value)
}
function methodQuality(item) {
  const raw = item.raw
  if (!raw) return { methods: 0, structured: false, issues: [] }
  if (item.requiresAcquisition === false || item.entityType === 'ability') return { methods: 0, structured: true, issues: [] }
  const resourceRouting = raw.resourceAcquisition?.manual?.routingOverride || raw.resourceAcquisition?.generated?.routing
  const resourceRoutingMethods = resourceRouting?.category === 'resource-current-wiki'
    ? resourceRouting.methods
    : resourceRouting && !['resource-unresolved', 'unresolved'].includes(resourceRouting.category)
      && !['review-required', 'unresolved'].includes(resourceRouting.status)
      ? [resourceRouting]
      : []
  const methodArrays = [
    raw.structuredMethods,
    raw.acquisition?.routes?.flatMap(route => route.methods || []),
    raw.arcaneAcquisition?.generated?.acquisition?.methods,
    raw.arcaneAcquisition?.manual?.methods,
    resourceRoutingMethods,
    raw.modAcquisition?.generated?.wiki?.methods,
    raw.modAcquisition?.generated?.officialDrops,
    raw.modAcquisition?.manual?.methods,
    raw.frameAcquisition?.generated?.methods,
    raw.frameAcquisition?.generated?.routing?.methods,
    raw.frameAcquisition?.manual?.methods
  ].filter(Array.isArray)
  const methods = methodArrays.flat()
  const issues = []
  const routing = raw.frameAcquisition?.generated?.routing
  const categoryRouted = item.domain === 'warframe'
    && !raw.frameAcquisition?.generated?.isPrime
    && routing?.componentCategory
    && routing.componentCategory !== 'frame-prime-relic'
    && routing.requirements
  const methodCount = methods.length || (categoryRouted ? 1 : 0)
  if (!methodCount && ['weapon', 'mod', 'arcane', 'warframe', 'resource-material'].includes(item.domain)) issues.push('structured-methods-missing')
  if (methods.some(method => method.require && !method.requirements)) issues.push('parallel-require-schema')
  if (methods.some(method => method.cost && !method.requirements)) issues.push('parallel-cost-schema')
  return { methods: methodCount, structured: methodCount > 0, issues: [...new Set(issues)] }
}
function shopQuality(entity, data) {
  const offer = entity.offer || {}
  const issues = []
  if (!entity.itemUniqueName) issues.push('item-identity-missing')
  if (!entity.displayName) issues.push('item-display-name-unresolved')
  if (!offer.npcId) issues.push('npc-id-missing')
  if (!offer.locationId) issues.push('location-id-missing')
  if (!Array.isArray(offer.prices) || !offer.prices.length) issues.push('prices-missing')
  for (const price of offer.prices || []) {
    if (!price.currencyId && !price.currencyUniqueName) issues.push('currency-identity-missing')
    if (!price.displayName) issues.push('price-display-name-unresolved')
    if (!Number.isFinite(price.amount) || price.amount <= 0) issues.push('price-invalid')
    if (price.currencyId && !data.currencies.get(price.currencyId)) issues.push('currency-registry-unresolved')
  }
  if (offer.npcId && !data.npcs.get(offer.npcId) && !String(offer.npcId).startsWith('/Lotus/')) issues.push('npc-registry-unresolved')
  if (offer.locationId && !data.locations.get(offer.locationId)) issues.push('location-registry-unresolved')
  if (!offer.requirements || typeof offer.requirements !== 'object' || Array.isArray(offer.requirements)) issues.push('requirements-missing')
  if (offer.require || offer.cost || offer.exchangeRequirement) issues.push('parallel-requirement-schema')
  if (!Array.isArray(offer.requirementLines) || !offer.requirementLines.length) issues.push('requirement-lines-missing')
  if (!Array.isArray(offer.unlockConditions)) issues.push('unlock-conditions-missing')
  if (!offer.availability?.kind) issues.push('availability-missing')
  if (offer.reputation && (!offer.reputation.factionId || !Number.isInteger(offer.reputation.rank))) issues.push('reputation-invalid')
  return { methods: 1, structured: issues.length === 0, issues: [...new Set(issues)] }
}
function readManifestEntries() {
  const assets = []
  for (const [directory, collections, defaultDomain, defaultRole] of MANIFEST_SPECS) {
    const manifestPath = path.join(CONTENT_ROOT, directory, 'manifest.json')
    const manifest = readJson(manifestPath)
    if (!manifest) continue
    for (const collection of collections) for (const entry of manifest[collection] || []) {
      const role = entry.assetRole || (entry.presentation === 'render-display' ? 'render/display' : defaultRole)
      const domain = entry.kind === 'frame-component' ? 'warframe'
        : entry.kind === 'weapon-component' ? 'weapon'
          : entry.kind === 'arcane' ? 'arcane'
            : defaultDomain
      const filename = entry.imageName || entry.fileName
      const fullPath = filename ? path.join(CONTENT_ROOT, directory, filename) : null
      assets.push({
        domain,
        role,
        directory,
        stableId: entry.uniqueName || entry.officialUniqueName || entry.id || null,
        canonical: entry.canonical || '',
        displayName: entry.displayName || null,
        filename,
        fullPath,
        assetKind: entry.assetKind || null,
        sourceUrl: entry.sourceUrl || entry.officialSourceUrl || null,
        reviewStatus: entry.reviewStatus || null,
        declared: {
          sha256: entry.sha256 || null,
          width: entry.width || null,
          height: entry.height || null,
          mime: entry.mime || null
        }
      })
    }
  }
  return assets
}
function inspectPng(filename) {
  if (!filename || !fs.existsSync(filename)) return { exists: false }
  const buffer = fs.readFileSync(filename)
  const png = buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  return {
    exists: true,
    signatureValid: png || jpeg,
    mime: png ? 'image/png' : jpeg ? 'image/jpeg' : 'unknown',
    width: png ? buffer.readUInt32BE(16) : null,
    height: png ? buffer.readUInt32BE(20) : null,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length
  }
}
function assetIndex(assets) {
  const byId = new Map(), byName = new Map()
  for (const asset of assets) {
    if (asset.stableId) {
      if (!byId.has(asset.stableId)) byId.set(asset.stableId, [])
      byId.get(asset.stableId).push(asset)
    }
    const name = normalize(asset.canonical)
    if (name) {
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name).push(asset)
    }
  }
  return { byId, byName }
}
function matchAssets(entity, index) {
  const exact = entity.stableId ? index.byId.get(entity.stableId) : null
  if (entity.stableId) return exact || []
  return index.byName.get(normalize(entity.canonical)) || []
}
function auditDomain(domain, expected, published, assets, data) {
  const publishedIndex = indexEntities(published)
  const assetLookup = assetIndex(assets)
  const entries = expected.map(entity => {
    if (domain === 'shop-inventory') {
      const quality = shopQuality(entity, data)
      return { ...entity, status: quality.issues.length ? 'review-required' : 'resolved', publishedMatches: 1, acquisition: quality, assets: [], reviewReasons: quality.issues }
    }
    const idMatches = entity.stableId ? publishedIndex.byId.get(normalizeIdentity(entity.stableId)) || [] : []
    // 有稳定身份的实体只允许按稳定身份命中；同名不同物（例如五种 Coda
    // Token）不得借 canonical 回退伪装为已发布。
    const rawMatches = entity.stableId ? idMatches : publishedIndex.byName.get(normalize(entity.canonical)) || []
    const duplicateLogicalIdentity = rawMatches.length > 1
      && new Set(rawMatches.map(item => normalize(item.canonical))).size === 1
    const nameMatches = duplicateLogicalIdentity
      ? [rawMatches.find(item => item.reviewStatus === 'approved' || item.acquisitionStatus === 'complete') || rawMatches[0]]
      : rawMatches
    const entityAssets = matchAssets(entity, assetLookup)
    const quality = nameMatches.length === 1 ? methodQuality(nameMatches[0]) : { methods: 0, structured: false, issues: [] }
    const reasons = []
    if (duplicateLogicalIdentity) reasons.push('duplicate-published-records')
    else if (nameMatches.length > 1) reasons.push('multiple-published-identity-matches')
    if (nameMatches.length === 1 && !hasLocalizedDisplay(nameMatches[0]) && !hasLocalizedDisplay(entity)) reasons.push('official-zh-unresolved')
    reasons.push(...quality.issues)
    if (entity.expectedMediaFilename && !entityAssets.length) reasons.push('expected-asset-unbound')
    let status = nameMatches.length === 0 ? 'missing' : nameMatches.length > 1 ? 'ambiguous' : reasons.length ? 'review-required' : 'resolved'
    return {
      ...entity,
      status,
      publishedMatches: rawMatches.length,
      resolvedStableId: nameMatches[0]?.stableId || null,
      acquisition: quality,
      assetRoles: [...new Set(entityAssets.map(asset => asset.role))],
      reviewReasons: [...new Set(reasons)]
    }
  })
  const extras = published.filter(item => {
    const expectedIndex = indexEntities(expected)
    return !(item.stableId && expectedIndex.byId.has(normalizeIdentity(item.stableId))) && !expectedIndex.byName.has(normalize(item.canonical))
  }).map(item => ({ stableId: item.stableId, canonical: item.canonical, displayName: item.displayName }))
  const roleNames = [...new Set(assets.filter(asset => asset.domain === domain).map(asset => asset.role))]
  const assetsByRole = Object.fromEntries(roleNames.map(role => {
    const domainAssets = assets.filter(asset => asset.domain === domain && asset.role === role)
    const valid = domainAssets.filter(asset => asset.file?.exists && asset.file.signatureValid)
    return [role, {
      manifest: domainAssets.length,
      validFiles: valid.length,
      boundExpected: entries.filter(entry => entry.assetRoles?.includes(role)).length
    }]
  }))
  return {
    counts: {
      expected: entries.length,
      resolved: entries.filter(item => item.status === 'resolved').length,
      missing: entries.filter(item => item.status === 'missing').length,
      ambiguous: entries.filter(item => item.status === 'ambiguous').length,
      reviewRequired: entries.filter(item => item.status === 'review-required').length,
      extra: extras.length
    },
    assetsByRole,
    entries,
    extras
  }
}
function sourcePolicyAudit() {
  const files = [
    path.join(BOT_ROOT, 'warframe-rich-icons', 'manifest.json'),
    path.join(BOT_ROOT, 'warframe-relic-assets', 'manifest.json')
  ]
  const violations = []
  for (const filename of files) {
    if (!fs.existsSync(filename)) continue
    const text = fs.readFileSync(filename, 'utf8')
    const matches = [...text.matchAll(/https?:\/\/(?:warframe\.)?fandom\.com[^"'\s]*/gi)]
    for (const match of matches) violations.push({ file: path.relative(BOT_ROOT, filename).replace(/\\/g, '/'), url: match[0], policy: 'legacy-source-not-production-authority' })
  }
  return {
    currentWikiOnlyForWikiMedia: true,
    allowedWikiHost: 'wiki.warframe.com',
    violations
  }
}
function duplicateAssetAudit(assets) {
  const groups = new Map()
  for (const asset of assets) {
    if (!asset.file?.sha256) continue
    if (!groups.has(asset.file.sha256)) groups.set(asset.file.sha256, [])
    groups.get(asset.file.sha256).push(asset)
  }
  return [...groups.entries()].filter(([, values]) => new Set(values.map(value => value.stableId || normalize(value.canonical))).size > 1)
    .map(([sha256, values]) => ({
      sha256,
      bindings: values.map(value => ({ domain: value.domain, role: value.role, stableId: value.stableId, canonical: value.canonical, assetKind: value.assetKind }))
    }))
}
function buildReport(options = {}) {
  const dbPath = resolveWikiDatabase(options.db || WIKI_DB)
  const data = loadData(ROOT, { approvedOnly: false })
  const expected = buildExpected(data, dbPath)
  const published = buildPublished(data)
  const assets = readManifestEntries().map(asset => ({ ...asset, file: inspectPng(asset.fullPath) }))
  const domains = {}
  for (const domain of DOMAIN_ORDER) domains[domain] = auditDomain(
    domain,
    expected[domain] || [],
    published[domain] || [],
    assets,
    data
  )
  for (const domain of ['weapon', 'mod', 'warframe', 'npc-faction-enemy', 'mission-location']) {
    domains[domain].directoryOnlyExcluded = expected.directoryOnlyExcluded?.[domain] || []
  }
  const sourcePolicy = sourcePolicyAudit()
  const duplicateHashes = duplicateAssetAudit(assets)
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    scope: {
      claim: 'cross-source coverage catalog; unresolved and unindexed objects are explicitly retained',
      excludedWork: 'no fish/fish-part/raw-mineral/refined-mineral media downloads; merge concurrent current-Wiki asset harvest before final release',
      sources: [
        'wiki.warframe.com current SQLite page/category directory',
        'DE Languages.bin zh/en snapshots',
        'DE Public Export-derived warframe-items package',
        'DE official drop table and ExportVendors compiled indices',
        'local supplemental/manual/review layers'
      ],
      stableIdentityRequiredForAssets: true,
      wikiDirectoryRowsRequireStableIdentity: true
    },
    sourceMetadata: {
      wiki: inspectWikiDatabase(dbPath),
      publicExportPackage: { name: 'warframe-items', version: require(path.join(PACKAGE_ROOT, 'package.json')).version },
      contentRoot: CONTENT_ROOT
    },
    totals: {
      expected: Object.values(domains).reduce((sum, item) => sum + item.counts.expected, 0),
      resolved: Object.values(domains).reduce((sum, item) => sum + item.counts.resolved, 0),
      missing: Object.values(domains).reduce((sum, item) => sum + item.counts.missing, 0),
      ambiguous: Object.values(domains).reduce((sum, item) => sum + item.counts.ambiguous, 0),
      reviewRequired: Object.values(domains).reduce((sum, item) => sum + item.counts.reviewRequired, 0)
    },
    domains,
    assetAudit: {
      manifests: MANIFEST_SPECS.map(([directory]) => path.join(CONTENT_ROOT, directory, 'manifest.json')),
      files: assets.length,
      validSignatures: assets.filter(asset => asset.file.exists && asset.file.signatureValid).length,
      missingFiles: assets.filter(asset => !asset.file.exists).map(asset => ({ domain: asset.domain, role: asset.role, stableId: asset.stableId, canonical: asset.canonical, filename: asset.filename })),
      invalidSignatures: assets.filter(asset => asset.file.exists && !asset.file.signatureValid).map(asset => ({ stableId: asset.stableId, canonical: asset.canonical, filename: asset.filename })),
      duplicateHashes
    },
    sourcePolicy,
    qualityGate: {
      strictPass: Object.values(domains).every(item => item.counts.missing === 0 && item.counts.ambiguous === 0 && item.counts.reviewRequired === 0)
        && sourcePolicy.violations.length === 0
        && assets.every(asset => asset.file.exists && asset.file.signatureValid),
      failures: [
        ...DOMAIN_ORDER.flatMap(domain => {
          const counts = domains[domain].counts
          return ['missing', 'ambiguous', 'reviewRequired'].filter(key => counts[key]).map(key => `${domain}:${key}:${counts[key]}`)
        }),
        ...(sourcePolicy.violations.length ? [`legacy-wiki-source:${sourcePolicy.violations.length}`] : []),
        ...(assets.some(asset => !asset.file.exists || !asset.file.signatureValid) ? ['asset-file-integrity'] : [])
      ]
    }
  }
}
function compactForDisk(report) {
  return {
    ...report,
    sourceMetadata: {
      ...report.sourceMetadata,
      wiki: {
        path: report.sourceMetadata.wiki.path,
        size: report.sourceMetadata.wiki.size,
        sha256: report.sourceMetadata.wiki.sha256,
        latestSync: report.sourceMetadata.wiki.syncState?.['incremental.last_run'] || null
      }
    }
  }
}
function markdown(report) {
  const lines = [
    '# Warframe 全量实体、知识与资产覆盖审计',
    '',
    `生成时间：${report.generatedAt}`,
    '',
    '> 这是跨源 expected/published 差异目录，不宣称全 Wiki 已完成。missing、ambiguous 与 review-required 均保留为真实缺口。',
    '',
    '| 域 | expected | resolved | missing | ambiguous | review-required | extra | 资产角色 |',
    '|---|---:|---:|---:|---:|---:|---:|---|'
  ]
  for (const domain of DOMAIN_ORDER) {
    const item = report.domains[domain], count = item.counts
    const roles = Object.entries(item.assetsByRole).map(([role, value]) => `${role} ${value.boundExpected}/${value.manifest}`).join('；') || '尚无清单'
    lines.push(`| ${domain} | ${count.expected} | ${count.resolved} | ${count.missing} | ${count.ambiguous} | ${count.reviewRequired} | ${count.extra} | ${roles} |`)
  }
  lines.push(
    '',
    `总计 expected ${report.totals.expected}，resolved ${report.totals.resolved}，missing ${report.totals.missing}，ambiguous ${report.totals.ambiguous}，review-required ${report.totals.reviewRequired}。`,
    '',
    `资产：${report.assetAudit.validSignatures}/${report.assetAudit.files} 个清单文件通过签名；缺失文件 ${report.assetAudit.missingFiles.length}；跨身份重复哈希 ${report.assetAudit.duplicateHashes.length} 组。`,
    '',
    `来源政策：发现 ${report.sourcePolicy.violations.length} 条旧 Fandom URL；这些只可视为待迁移旧证据，不得继续作为生产下载源。`,
    '',
    `严格门：${report.qualityGate.strictPass ? '通过' : '未通过'}。失败项：${report.qualityGate.failures.join('、') || '无'}。`,
    '',
    '## 每域优先缺口（最多列 20 项）'
  )
  for (const domain of DOMAIN_ORDER) {
    const gaps = report.domains[domain].entries.filter(item => item.status !== 'resolved').slice(0, 20)
    lines.push('', `### ${domain}`)
    if (!gaps.length) lines.push('- 当前 expected set 无缺口。')
    else for (const item of gaps) lines.push(`- ${item.status}: ${item.displayName || item.canonical || item.stableId} (${item.stableId || '无稳定 ID'})${item.reviewReasons?.length ? ` — ${item.reviewReasons.join(', ')}` : ''}`)
  }
  lines.push(
    '',
    '## 并发鱼矿成果集成边界',
    '',
    '- 本脚本会读取统一资源目录与最终 manifest，但不下载或覆盖鱼、鱼部件、原矿、精炼矿素材。',
    '- 父协调器合并 current-Wiki 鱼矿代理成果后，重跑本脚本即可把共享 manifest 纳入同一统计。',
    ''
  )
  return `${lines.join('\n')}\n`
}
async function generatePreviews(report) {
  let sharp
  try { sharp = require(path.join(BOT_ROOT, 'node_modules', 'sharp')) } catch (_) { return [] }
  fs.mkdirSync(PREVIEW_ROOT, { recursive: true })
  const generated = []
  for (const domain of DOMAIN_ORDER) {
    const files = readManifestEntries().filter(asset => asset.domain === domain && asset.fullPath && fs.existsSync(asset.fullPath)).slice(0, 12)
    if (!files.length) continue
    const columns = Math.min(4, files.length), rows = Math.ceil(files.length / columns)
    const tileWidth = 240, imageHeight = 184, labelHeight = 52, tileHeight = imageHeight + labelHeight
    const composites = []
    for (let i = 0; i < files.length; i++) {
      const asset = files[i], left = (i % columns) * tileWidth, top = Math.floor(i / columns) * tileHeight
      const image = await sharp(asset.fullPath).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize(tileWidth - 12, imageHeight - 8, { fit: 'contain' }).png().toBuffer()
      const label = String(asset.displayName || asset.canonical || asset.stableId || '').slice(0, 26).replace(/[&<>"]/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[value])
      const svg = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101820"/><text x="${tileWidth / 2}" y="31" text-anchor="middle" font-size="20" font-family="Microsoft YaHei, sans-serif" fill="#f1f5f9">${label}</text></svg>`)
      composites.push({ input: image, left: left + 6, top: top + 4 })
      composites.push({ input: svg, left, top: top + imageHeight })
    }
    const filename = path.join(PREVIEW_ROOT, `${domain}.png`)
    await sharp({ create: { width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: { r: 7, g: 12, b: 18, alpha: 1 } } })
      .composite(composites).png().toFile(filename)
    generated.push(filename)
  }
  report.previews = generated.map(filename => path.relative(ROOT, filename).replace(/\\/g, '/'))
  return generated
}
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
async function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  const strict = argv.includes('--strict')
  const previews = argv.includes('--previews')
  const dbIndex = argv.indexOf('--db')
  const current = readJson(OUTPUT)
  const report = buildReport({
    db: dbIndex >= 0 ? argv[dbIndex + 1] : undefined,
    generatedAt: check && current?.generatedAt ? current.generatedAt : undefined
  })
  if (previews) await generatePreviews(report)
  else if (check && Array.isArray(current?.previews)) report.previews = current.previews
  const disk = compactForDisk(report)
  if (check) {
    if (!current || serialize(current) !== serialize(disk)) throw new Error('全量实体覆盖审计已漂移')
    console.log(`全量实体覆盖审计无漂移：${report.totals.resolved}/${report.totals.expected} resolved`)
  } else {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
    fs.writeFileSync(OUTPUT, serialize(disk))
    fs.writeFileSync(MARKDOWN_OUTPUT, markdown(report))
    console.log(`全量实体覆盖：${report.totals.resolved}/${report.totals.expected} resolved；missing ${report.totals.missing}；review ${report.totals.reviewRequired}`)
    console.log(`报告：${OUTPUT}`)
  }
  if (strict && !report.qualityGate.strictPass) throw new Error(`全量严格门未通过：${report.qualityGate.failures.join('、')}`)
  return report
}

if (require.main === module) run().catch(error => { console.error(error.stack || error); process.exit(1) })
module.exports = {
  DOMAIN_ORDER,
  OUTPUT,
  MARKDOWN_OUTPUT,
  PREVIEW_ROOT,
  buildExpected,
  buildPublished,
  buildReport,
  generatePreviews,
  methodQuality,
  normalize,
  normalizeIdentity,
  run,
  shopQuality
}
