'use strict'

const TYPE_FOLDERS = Object.freeze({
  'Warframe Mod': 'warframe',
  'Primary Mod': 'primary',
  'Shotgun Mod': 'shotgun',
  'Secondary Mod': 'secondary',
  'Melee Mod': 'melee',
  'Companion Mod': 'companion',
  'Stance Mod': 'stance',
  'Plexus Mod': 'plexus',
  'Parazon Mod': 'parazon',
  'Necramech Mod': 'necramech',
  'Archwing Mod': 'archwing',
  'Arch-Gun Mod': 'archgun',
  'Arch-Melee Mod': 'archmelee',
  'Railjack Mod': 'railjack',
  'K-Drive Mod': 'kdrive',
  'Posture Mod': 'posture'
})

function normalizeCanonical(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase()
}

function hasWikiIdentity(item) {
  return Boolean(item?.wikiaUrl && item.wikiAvailable !== false)
}

function isBeginner(item) {
  return /\/Beginner\//i.test(item?.uniqueName || '')
}

function isExpert(item) {
  return /\/Expert\//i.test(item?.uniqueName || '')
}

function isFlawedMod(item) {
  return isBeginner(item) && /\/Flawed_/i.test(item?.wikiaUrl || '')
}

function getModVariant(item) {
  if (isFlawedMod(item)) return 'flawed'
  if (item?.isPrime) return 'prime'
  return 'standard'
}

function getTypeFolder(item) {
  if (/Riven Mod$/i.test(item?.type || '')) return 'riven'
  return TYPE_FOLDERS[item?.type] || 'other'
}

function getTypeCategory(item) {
  return `${getTypeFolder(item)}mod`
}

function getCanonical(item) {
  return isFlawedMod(item) ? `Flawed ${item.name}` : item.name
}

function getDisplayName(item, localized = {}) {
  const localizedName = localized.name && localized.name !== item.name
    ? localized.name
    : item.name
  const cleanedName = localizedName
    .replace(/\bCorpus\b/g, '科普斯')
    .replace(/\bGrineer\b/g, '克隆尼')
    .replace(/\bInfested\b/g, '感染者')
    .replace(/\bOrokin\b/g, '奥罗金')
  return isFlawedMod(item) ? `\u6b8b\u7f3a ${cleanedName}` : cleanedName
}

function getExclusionReason(item, recordsByCanonical) {
  const uniqueName = item?.uniqueName || ''
  if (item?.type === 'Focus Way' || /\/Upgrades\/Focus(?:\/|$)/i.test(uniqueName)) {
    return 'focus-upgrade'
  }
  if (item?.type === 'Transmutation Mod') return 'transmutation'
  if (item?.type === 'Mod Set Mod') return 'internal-mod-set-marker'
  if (item?.name === 'Unfused Artifact') return 'unfused-artifact-internal'
  if (/\/BrokenFrame\//i.test(uniqueName)) return 'broken-frame-internal'
  if (/SP(?:Sub)?Mod/i.test(uniqueName)) return 'steel-path-internal'
  if (isBeginner(item) && !isFlawedMod(item)) return 'non-flawed-beginner'
  if (isExpert(item) && !hasWikiIdentity(item)) return 'unreleased-expert'

  const siblings = recordsByCanonical.get(normalizeCanonical(item?.name)) || []
  if (isExpert(item) && siblings.some(other =>
    other !== item
    && !isBeginner(other)
    && !isExpert(other)
    && hasWikiIdentity(other))) {
    return 'duplicate-expert'
  }
  if (!hasWikiIdentity(item) && siblings.some(other =>
    other !== item && hasWikiIdentity(other))) {
    return 'duplicate-internal'
  }
  return null
}

function filterPlayableMods(items) {
  const records = [...items]
  const recordsByCanonical = new Map()
  for (const item of records) {
    const key = normalizeCanonical(item.name)
    const siblings = recordsByCanonical.get(key) || []
    siblings.push(item)
    recordsByCanonical.set(key, siblings)
  }

  const playable = []
  const excluded = []
  for (const item of records) {
    const reason = getExclusionReason(item, recordsByCanonical)
    if (reason) excluded.push({ item, reason })
    else playable.push(item)
  }
  return { playable, excluded }
}

module.exports = {
  TYPE_FOLDERS,
  filterPlayableMods,
  getCanonical,
  getDisplayName,
  getExclusionReason,
  getModVariant,
  getTypeCategory,
  getTypeFolder,
  hasWikiIdentity,
  isFlawedMod,
  normalizeCanonical
}
