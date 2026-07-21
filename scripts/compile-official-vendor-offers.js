'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { loadEntityRegistries } = require('../src/entities')
const { renderRequirements } = require('../src/acquisition-protocol')

const ROOT = path.resolve(__dirname, '..')
const INPUT = path.join(ROOT, 'cache', 'warframe-export-vendors.json')
const ZH = path.join(ROOT, '.cache', 'official-localization', 'languages.zh.json')
const OUTPUT = path.join(ROOT, 'generated', 'official-vendor-offer-index.json')
const OFFICIAL_ITEMS = path.join(ROOT, 'knowledge', 'generated', 'official-items.json')
const KNOWN_VENDORS = Object.freeze({
  '/Lotus/Types/Game/VendorManifests/Hubs/HunhowVendorManifest': {
    npcId: 'npc.hunhow',
    locationId: 'hub.pontis-tower',
    unlockConditions: [{ type: 'quest-completion', questId: 'quest.jade-shadows-constellations' }]
  },
  '/Lotus/Types/Game/VendorManifests/Duviri/AcrithisKullervoShopManifest': {
    npcId: 'npc.acrithis',
    locationId: 'landscape.duviri',
    unlockConditions: [{ type: 'location-access', locationId: 'landscape.duviri' }]
  },
  '/Lotus/Types/Game/VendorManifests/Duviri/DrifterWeaponsVendorManifest': {
    npcId: 'npc.teshin',
    locationId: 'landscape.duviri',
    unlockConditions: [{ type: 'location-access', locationId: 'landscape.duviri' }]
  },
  '/Lotus/Types/Game/VendorManifests/Solaris/NightcapVendorManifest': {
    npcId: 'npc.nightcap',
    locationId: 'hub.fortuna',
    factionId: 'faction.the-descendia',
    unlockConditions: [{ type: 'quest-completion', questId: 'quest.the-new-war' }]
  }
})
const KNOWN_CURRENCIES = Object.freeze({
  '/Lotus/Types/JadeShadowsPart2Mission/Gameplay/Resources/AshFavor': { currencyId: 'currency.emerald-talent', canonical: 'Emerald Talent', languageKey: '/Lotus/Language/JadeShadowsPart2Mission/JS2MAshFavorName' },
  '/Lotus/Types/JadeShadowsPart2Mission/Gameplay/Resources/GarudaFavor': { currencyId: 'currency.crimson-talent', canonical: 'Crimson Talent', languageKey: '/Lotus/Language/JadeShadowsPart2Mission/JS2MGarudaFavorName' },
  '/Lotus/Types/Gameplay/Duviri/Resource/DuviriKullervoDropItem': { currencyId: 'currency.kullervos-bane', canonical: "Kullervo's Bane", languageKey: '/Lotus/Language/Duviri/DuviriKullervoDropItemName' },
  '/Lotus/Types/Gameplay/Duviri/Resource/DuviriDragonDropItem': { currencyId: 'currency.pathos-clamp', canonical: 'Pathos Clamp', languageKey: '/Lotus/Language/Duviri/DuviriDragonDropItemName' },
  '/Lotus/Types/Items/MiscItems/MushroomFood': { currencyId: 'currency.fergolyte', canonical: 'Fergolyte', languageKey: '/Lotus/Language/NokkoColony/NokkoCurrencyName' }
})

function normalItemId(storeItem) {
  return String(storeItem || '')
    .replace('/Lotus/StoreItems/', '/Lotus/')
    .replace('/Lotus/Types/StoreItems/Packages/DrifterWeaponBundles/DaxDuviriMaceShieldPlayerWeaponBundle', '/Lotus/Types/Recipes/Weapons/DaxDuviriMaceShieldBlueprint')
    .replace(/(NokkoArchGun(?:Barrel|Receiver|Stock))Blueprint$/, '$1Item')
}
function availability(vendor, offer) {
  if (offer.alwaysOffered === true) return { kind: 'always' }
  return {
    kind: 'rotation',
    dynamicVendor: vendor.isDynamic === true,
    bin: Number.isInteger(offer.bin) ? offer.bin : null,
    probability: Number.isFinite(offer.probability) ? offer.probability : null,
    durationHours: Number.isFinite(offer.durationHours) ? offer.durationHours : null,
    selectionCount: vendor.numItems || null
  }
}
function reputation(meta, offer) {
  if (!offer.syndicate) return null
  return {
    factionId: meta.factionId || null,
    officialTag: offer.syndicate.tag || null,
    rank: Number.isInteger(offer.syndicate.minRank) ? offer.syndicate.minRank : null,
    standing: Number(offer.syndicate.standingCost || 0)
  }
}
function build(generatedAt = new Date().toISOString()) {
  const vendors = JSON.parse(fs.readFileSync(INPUT, 'utf8'))
  const zh = JSON.parse(fs.readFileSync(ZH, 'utf8'))
  const officialItems = JSON.parse(fs.readFileSync(OFFICIAL_ITEMS, 'utf8')).items || []
  const officialItemById = new Map(officialItems.map(item => [item.uniqueName, item]))
  const registries = loadEntityRegistries(ROOT)
  const byItem = {}
  for (const [vendorId, meta] of Object.entries(KNOWN_VENDORS)) {
    const vendor = vendors[vendorId]
    if (!vendor) throw new Error(`${vendorId}: ExportVendors 缺失`)
    for (const offer of vendor.items || []) {
      const itemUniqueName = normalItemId(offer.storeItem)
      const prices = (offer.itemPrices || []).map(price => {
        const known = KNOWN_CURRENCIES[price.ItemType]
        const officialItem = officialItemById.get(price.ItemType)
        return {
          currencyUniqueName: price.ItemType,
          currencyId: known?.currencyId || null,
          canonical: known?.canonical || officialItem?.canonical || price.ItemType.split('/').pop(),
          displayName: known ? (zh[known.languageKey] || '') : (officialItem?.displayName || ''),
          localizationStatus: known && zh[known.languageKey]
            ? 'official-zh'
            : officialItem?.localizationStatus || 'official-zh-unavailable',
          amount: Number(price.ItemCount || 0)
        }
      })
      const requirements = prices.every(price => price.currencyId)
        ? {
            type: 'currency',
            usage: 'exchange',
            npcId: meta.npcId,
            locationId: meta.locationId,
            currency: prices.map(price => ({ currencyId: price.currencyId, amount: price.amount }))
          }
        : {
            type: 'item',
            items: prices.map(price => ({
              itemId: price.currencyUniqueName,
              canonical: price.canonical,
              displayName: price.displayName,
              amount: price.amount
            }))
          }
      const record = {
        type: 'vendor-exchange',
        vendorId,
        npcId: meta.npcId,
        locationId: meta.locationId,
        itemUniqueName,
        itemCanonical: officialItemById.get(itemUniqueName)?.canonical || null,
        itemDisplayName: officialItemById.get(itemUniqueName)?.displayName || null,
        quantity: Number(offer.quantity || 1),
        prices,
        requirements,
        requirementLines: renderRequirements(requirements, registries),
        unlockConditions: meta.unlockConditions || [],
        reputation: reputation(meta, offer),
        availability: availability(vendor, offer),
        purchaseLimit: offer.purchaseLimit ?? null,
        provenance: { source: 'DE ExportVendors', vendorManifest: vendorId, storeItem: offer.storeItem }
      }
      ;(byItem[itemUniqueName] || (byItem[itemUniqueName] = [])).push(record)
    }
  }
  return {
    schemaVersion: 1,
    generatedAt,
    source: {
      url: 'https://browse.wf/warframe-public-export-plus/ExportVendors.json',
      sha256: crypto.createHash('sha256').update(fs.readFileSync(INPUT)).digest('hex')
    },
    counts: { items: Object.keys(byItem).length, offers: Object.values(byItem).reduce((count, offers) => count + offers.length, 0) },
    byItem
  }
}
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  const current = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : null
  const built = build(check && current?.generatedAt ? current.generatedAt : undefined)
  if (check) {
    if (serialize(current) !== serialize(built)) throw new Error('官方商店报价索引已漂移')
    console.log(`官方商店报价索引无漂移：${built.counts.items} 项`)
    return built
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, serialize(built))
  console.log(`已编译官方商店报价：${built.counts.items} 项、${built.counts.offers} 报价`)
  return built
}

if (require.main === module) {
  try { run() } catch (error) { console.error(error.stack || error); process.exit(1) }
}
module.exports = { KNOWN_VENDORS, KNOWN_CURRENCIES, normalItemId, availability, reputation, build, run }
