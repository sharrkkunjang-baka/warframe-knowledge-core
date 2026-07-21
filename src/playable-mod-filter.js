'use strict'

const path = require('node:path')
const CURRENT_WIKI_PUBLISHED_OVERRIDES = new Set(require(path.join(__dirname, '..', 'knowledge', 'supplemental', 'current-wiki-published-mods.json')).items.map(item => item.uniqueName))

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

const TYPE_DISPLAY_NAMES = Object.freeze({
  'Warframe Mod': '战甲 Mod',
  'Primary Mod': '主要武器 Mod',
  'Shotgun Mod': '霰弹枪 Mod',
  'Secondary Mod': '次要武器 Mod',
  'Melee Mod': '近战 Mod',
  'Companion Mod': '同伴 Mod',
  'Stance Mod': '架式 Mod',
  'Plexus Mod': '航电系统 Mod',
  'Parazon Mod': '灭骸之刃 Mod',
  'Necramech Mod': '殁世机甲 Mod',
  'Archwing Mod': 'Archwing Mod',
  'Arch-Gun Mod': 'Archwing 枪械 Mod',
  'Arch-Melee Mod': 'Archwing 近战 Mod',
  'Railjack Mod': '九重天 Mod',
  'K-Drive Mod': 'K 式悬浮板 Mod',
  'Posture Mod': '姿态 Mod',
  'Rifle Riven Mod': '步枪裂罅 Mod',
  'Shotgun Riven Mod': '霰弹枪裂罅 Mod',
  'Pistol Riven Mod': '手枪裂罅 Mod',
  'Melee Riven Mod': '近战裂罅 Mod',
  'Zaw Riven Mod': 'Zaw 裂罅 Mod',
  'Kitgun Riven Mod': '组合枪裂罅 Mod',
  'Companion Weapon Riven Mod': '同伴武器裂罅 Mod',
  'Archgun Riven Mod': 'Archwing 枪械裂罅 Mod'
})

function getTypeDisplayName(type) {
  return TYPE_DISPLAY_NAMES[type] || (type === 'Peculiar Mod' ? '奇特 Mod' : 'Mod')
}

function normalizeCanonical(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase()
}

function hasWikiIdentity(item) {
  return Boolean(item?.wikiaUrl && item.wikiAvailable !== false)
}

function isCurrentWikiPublishedOverride(item) {
  return CURRENT_WIKI_PUBLISHED_OVERRIDES.has(item?.uniqueName || '')
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

function isRequiemMod(item) {
  return /^\/Lotus\/Upgrades\/Mods\/Immortal\/Immortal(?:One|Two|Three|Four|Five|Six|Seven|Eight|Wildcard)Mod$/i.test(item?.uniqueName || '')
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
  // SPMod 既可能是正式发布的镀层近战 Mod，也可能是其仅供效果叠加使用的 SubMod。
  // 不能按路径统统排除：有 Wiki 身份的主 Mod 必须进入公开目录，只有 SubMod 才是内部记录。
  if (/SPSubMod/i.test(uniqueName)) return 'steel-path-internal-submod'
  if (/SPMod/i.test(uniqueName) && !hasWikiIdentity(item)) return 'steel-path-internal'
  if (uniqueName === '/Lotus/Upgrades/Mods/Sentinel/Kubrow/ChargerFinisherMod') return 'removed-replaced-mod'
  if (uniqueName === '/Lotus/Upgrades/Mods/Warframe/AvatarDamageResistanceStun') return 'retrieved-unreleased-mod'
  if (uniqueName === '/Lotus/Upgrades/Mods/Hoverboard/HBFireWorksMod') return 'codex-hidden-no-acquisition-evidence'
  if (uniqueName === '/Lotus/Upgrades/Mods/Necromech/NecromechSprintEfficiencyMod') return 'codex-hidden-no-acquisition-evidence'
  if (isBeginner(item) && !isFlawedMod(item)) return 'non-flawed-beginner'
  if (isExpert(item) && !hasWikiIdentity(item) && !isCurrentWikiPublishedOverride(item)) return 'unreleased-expert'

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
  TYPE_DISPLAY_NAMES,
  CURRENT_WIKI_PUBLISHED_OVERRIDES,
  filterPlayableMods,
  getCanonical,
  getDisplayName,
  getExclusionReason,
  getModVariant,
  getTypeCategory,
  getTypeFolder,
  getTypeDisplayName,
  hasWikiIdentity,
  isCurrentWikiPublishedOverride,
  isFlawedMod,
  isRequiemMod,
  normalizeCanonical
}
