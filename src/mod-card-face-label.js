'use strict'

const path = require('node:path')
const { getTypeDisplayName } = require('./playable-mod-filter')

const COMPAT_ZH = Object.freeze(require(path.join(__dirname, '..', 'knowledge', 'facts', 'mod-compat-zh.json')).items)
const WARFRAME_CARD_LABEL = 'WARFRAME'

const GENERIC_COMPAT_KEYS = new Set([
  'AURA', 'Aura', 'Parazon', 'Railjack', 'Plexus', 'Crewship',
  'Melee', 'Rifle', 'Pistol', 'Shotgun', 'Claws', 'Archgun', 'Arch-Gun', 'Archmelee', 'Archwing'
])

let compatEntityMaps = null
let itemsI18nCache = null

function normalizeCompatKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function normalizeLookupKey(value) {
  return normalizeCompatKey(value).toLowerCase()
}

function loadCompatEntityMaps() {
  if (compatEntityMaps) return compatEntityMaps
  const root = path.join(__dirname, '..')
  const warframes = new Map()
  try {
    const frames = require(path.join(root, 'knowledge', 'acquisition', 'warframe', 'categories.json')).frames || []
    for (const frame of frames) {
      if (!frame?.canonical) continue
      warframes.set(normalizeLookupKey(frame.canonical), frame.canonical)
    }
  } catch (_) {}

  const itemLabels = new Map()
  try {
    const weapons = require(path.join(root, 'knowledge', 'generated', 'official-weapons.json')).weapons || []
    for (const weapon of weapons) {
      if (!weapon?.canonical || !weapon.displayName) continue
      if (weapon.localizationStatus && weapon.localizationStatus !== 'official-zh') continue
      itemLabels.set(normalizeLookupKey(weapon.canonical), weapon.displayName)
    }
  } catch (_) {}

  compatEntityMaps = { warframes, itemLabels }
  return compatEntityMaps
}

function loadItemsI18nName(canonical) {
  if (!canonical) return null
  if (!itemsI18nCache) {
    itemsI18nCache = new Map()
    try {
      const Items = require('warframe-items')
      const catalog = new Items({ i18n: ['zh'] })
      for (const entry of catalog) {
        const zhName = catalog.i18n?.[entry.uniqueName]?.zh?.name
        if (entry?.name && zhName) itemsI18nCache.set(normalizeLookupKey(entry.name), zhName)
      }
    } catch (_) {}
  }
  return itemsI18nCache.get(normalizeLookupKey(canonical)) || null
}

function resolveWarframeCardLabel(canonical) {
  return String(canonical || '').trim().toUpperCase()
}

function resolveWeaponItemCardLabel(compat) {
  const key = normalizeLookupKey(compat)
  const { itemLabels } = loadCompatEntityMaps()
  return itemLabels.get(key) || loadItemsI18nName(compat) || null
}

function isWarframeCompat(compat) {
  const key = normalizeLookupKey(compat)
  return loadCompatEntityMaps().warframes.has(key)
}

function isGenericCompat(compat) {
  const normalized = normalizeCompatKey(compat)
  return GENERIC_COMPAT_KEYS.has(normalized) || GENERIC_COMPAT_KEYS.has(normalized.replace(/\band\b/gi, 'And'))
}

function createCompatLocalizer(extra = {}) {
  const map = { ...COMPAT_ZH, ...extra }
  return english => {
    const key = normalizeCompatKey(english)
    if (!key) return ''
    return map[key] || map[key.replace(/\band\b/gi, 'And')] || map[key.replace(/\sAnd\s/g, ' and ')] || key
  }
}

function resolveEffectiveModType(mod) {
  const uniqueName = String(mod?.uniqueName || '')
  if (/\/Railjack\//i.test(uniqueName)) return 'Railjack Mod'
  return mod?.type || null
}

function resolveModCardFaceLabel(mod, options = {}) {
  const localizeCompat = options.localizeCompat || createCompatLocalizer(options.extraCompat || {})
  const type = resolveEffectiveModType(mod)
  const compat = normalizeCompatKey(mod?.compatName)

  if (compat === 'WARFRAME' || compat === 'Warframe') return WARFRAME_CARD_LABEL
  if (type === 'Stance Mod' && compat) return localizeCompat(compat)
  if (type === 'Archwing Mod' && compat) return localizeCompat(compat)
  if (type === 'Archwing Mod') return localizeCompat('Archwing')
  if (type === 'Parazon Mod' || compat === 'Parazon') return localizeCompat('Parazon')
  if (type === 'Railjack Mod' || /\/Railjack\//i.test(mod?.uniqueName || '')) return localizeCompat('Railjack')
  if (compat === 'AURA' || compat === 'Aura') return localizeCompat('Aura')
  if (compat === 'Melee') return localizeCompat('Melee')
  if (compat === 'Rifle') return localizeCompat('Rifle')
  if (compat === 'Pistol') return localizeCompat('Pistol')
  if (compat === 'Shotgun') return localizeCompat('Shotgun')
  if (compat === 'Claws') return localizeCompat('Claws')
  if (compat === 'Archgun' || compat === 'Arch-Gun') return localizeCompat('Archgun')
  if (compat === 'Archmelee') return localizeCompat('Archmelee')
  if (type === 'Plexus Mod' && /\/Railjack\//i.test(mod?.uniqueName || '')) return localizeCompat('Railjack')

  if (compat && isWarframeCompat(compat)) return resolveWarframeCardLabel(compat)

  if (compat && !isGenericCompat(compat)) {
    const weaponLabel = resolveWeaponItemCardLabel(compat)
    if (weaponLabel) return weaponLabel
  }

  if (compat) {
    const localized = localizeCompat(compat)
    if (localized && localized !== compat) return localized
  }

  const effectiveType = type || mod?.type || null
  if (!compat && effectiveType === 'Warframe Mod') return WARFRAME_CARD_LABEL

  const rawTypeDisplay = mod?.typeDisplayName && mod.typeDisplayName !== 'Mod'
    ? mod.typeDisplayName
    : getTypeDisplayName(effectiveType)
  const typeDisplay = String(rawTypeDisplay || '').replace(/\s*Mod$/i, '').trim()
  return typeDisplay || null
}

function labelsEquivalentForTypeSlot(faceLabel, compatName) {
  const face = normalizeCompatKey(faceLabel)
  const compat = normalizeCompatKey(compatName)
  if (!face || !compat) return false
  if (face === compat) return true
  if (face.toUpperCase() === compat.toUpperCase()) return true
  return false
}

function modNeedsTypeSlotLocalization(mod) {
  const type = resolveEffectiveModType(mod)
  if (type === 'Stance Mod') return true
  if (type === 'Archwing Mod') return true
  if (type === 'Parazon Mod') return true
  if (type === 'Railjack Mod' || /\/Railjack\//i.test(mod?.uniqueName || '')) return true
  const compat = normalizeCompatKey(mod?.compatName)
  const faceLabel = resolveModCardFaceLabel(mod)
  if (!faceLabel) return false
  if (!compat) return false
  return !labelsEquivalentForTypeSlot(faceLabel, compat)
}

function auditModCardFaceLabels(mods, options = {}) {
  const localizeCompat = options.localizeCompat || createCompatLocalizer(options.extraCompat || {})
  const counts = {
    parazon: 0,
    stance: 0,
    railjack: 0,
    exchangeGameplayOnly: 0,
    needsTypeSlot: 0
  }
  const samples = { parazon: [], stance: [], railjack: [], missingLabel: [] }
  for (const mod of mods || []) {
    const type = resolveEffectiveModType(mod)
    const faceLabel = resolveModCardFaceLabel(mod, { ...options, localizeCompat })
    if (type === 'Parazon Mod') {
      counts.parazon += 1
      if (samples.parazon.length < 3) samples.parazon.push({ canonical: mod.canonical, faceLabel })
    }
    if (type === 'Stance Mod') {
      counts.stance += 1
      if (samples.stance.length < 3) samples.stance.push({ canonical: mod.canonical, compatName: mod.compatName, faceLabel })
    }
    if (type === 'Railjack Mod' || /\/Railjack\//i.test(mod.uniqueName || '')) {
      counts.railjack += 1
      if (samples.railjack.length < 3) samples.railjack.push({ canonical: mod.canonical, faceLabel })
    }
    if (modNeedsTypeSlotLocalization(mod)) counts.needsTypeSlot += 1
    if (!faceLabel && samples.missingLabel.length < 5) samples.missingLabel.push(mod.canonical)
  }
  return { counts, samples }
}

module.exports = {
  COMPAT_ZH,
  WARFRAME_CARD_LABEL,
  createCompatLocalizer,
  resolveEffectiveModType,
  resolveModCardFaceLabel,
  modNeedsTypeSlotLocalization,
  labelsEquivalentForTypeSlot,
  auditModCardFaceLabels,
  resolveWarframeCardLabel,
  resolveWeaponItemCardLabel,
  isWarframeCompat
}
