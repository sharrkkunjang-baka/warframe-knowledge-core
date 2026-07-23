'use strict'

const path = require('node:path')
const { getTypeDisplayName } = require('./playable-mod-filter')

const COMPAT_ZH = Object.freeze(require(path.join(__dirname, '..', 'knowledge', 'facts', 'mod-compat-zh.json')).items)

function normalizeCompatKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
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

  if (type === 'Stance Mod' && compat) return localizeCompat(compat)
  if (type === 'Archwing Mod' && compat) return localizeCompat(compat)
  if (type === 'Archwing Mod') return localizeCompat('Archwing')
  if (type === 'Parazon Mod' || compat === 'Parazon') return localizeCompat('Parazon')
  if (type === 'Railjack Mod' || /\/Railjack\//i.test(mod?.uniqueName || '')) return localizeCompat('Railjack')
  if (compat === 'AURA' || compat === 'Aura') return localizeCompat('Aura')
  if (compat === 'WARFRAME' || compat === 'Warframe') return localizeCompat('Warframe')
  if (compat === 'Melee') return localizeCompat('Melee')
  if (compat === 'Rifle') return localizeCompat('Rifle')
  if (compat === 'Pistol') return localizeCompat('Pistol')
  if (compat === 'Shotgun') return localizeCompat('Shotgun')
  if (compat === 'Claws') return localizeCompat('Claws')
  if (compat === 'Archgun' || compat === 'Arch-Gun') return localizeCompat('Archgun')
  if (compat === 'Archmelee') return localizeCompat('Archmelee')
  if (type === 'Plexus Mod' && /\/Railjack\//i.test(mod?.uniqueName || '')) return localizeCompat('Railjack')
  if (compat) {
    const localized = localizeCompat(compat)
    if (localized && localized !== compat) return localized
    if (options.frameDisplayName) return options.frameDisplayName
  }
  const effectiveType = type || mod?.type || null
  const rawTypeDisplay = mod?.typeDisplayName && mod.typeDisplayName !== 'Mod'
    ? mod.typeDisplayName
    : getTypeDisplayName(effectiveType)
  const typeDisplay = String(rawTypeDisplay || '').replace(/\s*Mod$/i, '').trim()
  return typeDisplay || null
}

function modNeedsTypeSlotLocalization(mod) {
  const type = resolveEffectiveModType(mod)
  if (type === 'Stance Mod') return true
  if (type === 'Archwing Mod') return true
  if (type === 'Parazon Mod') return true
  if (type === 'Railjack Mod' || /\/Railjack\//i.test(mod?.uniqueName || '')) return true
  const compat = normalizeCompatKey(mod?.compatName)
  if (compat && resolveModCardFaceLabel(mod) !== compat) return true
  return false
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
  createCompatLocalizer,
  resolveEffectiveModType,
  resolveModCardFaceLabel,
  modNeedsTypeSlotLocalization,
  auditModCardFaceLabels
}
