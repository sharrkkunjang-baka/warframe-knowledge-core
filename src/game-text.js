'use strict'

const STYLE_TAGS = Object.freeze({
  DT_ELECTRIC_COLOR: '⚡',
  DT_ELECTRICITY_COLOR: '⚡',
  DT_FIRE_COLOR: '🔥',
  DT_FREEZE_COLOR: '❄',
  DT_COLD_COLOR: '❄',
  DT_POISON_COLOR: '☠',
  DT_TOXIN_COLOR: '☠',
  DT_SLASH_COLOR: '切割',
  DT_PUNCTURE_COLOR: '穿刺',
  DT_IMPACT_COLOR: '冲击',
  DT_RADIATION_COLOR: '辐射',
  DT_MAGNETIC_COLOR: '磁力',
  DT_CORROSIVE_COLOR: '腐蚀',
  DT_VIRAL_COLOR: '病毒',
  DT_GAS_COLOR: '毒气',
  DT_EXPLOSION_COLOR: '爆炸'
})

function renderGameText(value) {
  return String(value ?? '')
    .replace(/<\s*(DT_[A-Z0-9_]+)\s*>/gi, (_match, raw) => STYLE_TAGS[String(raw).toUpperCase()] || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function containsRawGameMarkup(value) { return /<\s*DT_[A-Z0-9_]+\s*>/i.test(String(value ?? '')) }

module.exports = { STYLE_TAGS, renderGameText, containsRawGameMarkup }
