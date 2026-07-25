'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { renderGameText } = require('./game-text')

const LANGUAGE_CACHE = path.join(__dirname, '..', '.cache', 'official-localization')
const ARCANE_REVIVE_LINE = /^赋能复活次数\s*\+\s*1$/i
const SUMMON_MOVEMENT_SPEED = /^Summons gain ([+-]?\d+(?:\.\d+)?)%\s*Movement Speed\.?$/i
const OFFICIAL_BONUS_DESC_KEY = '/Lotus/Language/1999/AbilityStrengthOnSummonAttackBonusDesc'

let languagesCache = null
function loadLanguages() {
  if (languagesCache) return languagesCache
  languagesCache = {
    zh: JSON.parse(fs.readFileSync(path.join(LANGUAGE_CACHE, 'languages.zh.json'), 'utf8'))
  }
  return languagesCache
}

function translateSummonMovementSpeed(line, languages) {
  const match = String(line || '').trim().match(SUMMON_MOVEMENT_SPEED)
  if (!match) return line
  const langs = languages || loadLanguages()
  const bonusTemplate = langs?.zh?.[OFFICIAL_BONUS_DESC_KEY]
  if (!bonusTemplate) return line
  return renderGameText(String(bonusTemplate).replace('|BONUS_STAT|', match[1])).trim()
}

function normalizeArcaneEffectLine(line, options = {}) {
  const chunks = renderGameText(line).split(/\n/).map(part => part.trim()).filter(Boolean)
  if (!chunks.length) return null
  const normalizedChunks = chunks.flatMap(chunk => {
    let text = chunk
    if (!text || ARCANE_REVIVE_LINE.test(text)) return []

    const inlineBonus = text.match(/^(.*[。！？])\s*(Summons gain .+)$/i)
    if (inlineBonus) {
      return [
        inlineBonus[1].trim(),
        translateSummonMovementSpeed(inlineBonus[2], options.languages)
      ].filter(part => part && !ARCANE_REVIVE_LINE.test(part))
    }

    const translated = translateSummonMovementSpeed(text, options.languages)
    return translated && !ARCANE_REVIVE_LINE.test(translated) ? [translated] : []
  })
  return normalizedChunks.length ? normalizedChunks.join('\n') : null
}

function normalizeArcaneEffectLines(stats, options = {}) {
  const lines = []
  for (const stat of stats || []) {
    const normalized = normalizeArcaneEffectLine(stat, options)
    if (!normalized) continue
    for (const line of normalized.split(/\n/)) {
      const trimmed = line.trim()
      if (trimmed && !lines.includes(trimmed)) lines.push(trimmed)
    }
  }
  return lines
}

module.exports = {
  ARCANE_REVIVE_LINE,
  SUMMON_MOVEMENT_SPEED,
  normalizeArcaneEffectLine,
  normalizeArcaneEffectLines
}
