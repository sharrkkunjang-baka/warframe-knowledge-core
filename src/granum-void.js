'use strict'

const GRANUM_VOID_TIERS = Object.freeze([
  { tier: '初级', missionTypeId: 'mission-type.granum-void', sourceId: 'source.granum-void-rotation-c', canonical: 'Granum Void' },
  { tier: '中级', missionTypeId: 'mission-type.extended-granum-void', sourceId: 'source.extended-granum-void-rotation-c', canonical: 'Extended Granum Void' },
  { tier: '高级', missionTypeId: 'mission-type.nightmare-granum-void', sourceId: 'source.nightmare-granum-void-rotation-c', canonical: 'Nightmare Granum Void' }
])

const GRANUM_VOID_OBJECTIVE = '剩余击杀量不高于25%'

function resolveGranumVoidTier(value) {
  const candidate = String(value || '').trim()
  if (!candidate) return null
  return GRANUM_VOID_TIERS.find(item =>
    candidate === item.missionTypeId ||
    candidate === item.sourceId ||
    candidate === item.canonical ||
    candidate.startsWith(`${item.canonical},`)
  ) || null
}

function granumVoidDisplayName(value) {
  const match = resolveGranumVoidTier(value)
  return match ? `${match.tier}格拉努虚空` : null
}

module.exports = { GRANUM_VOID_TIERS, GRANUM_VOID_OBJECTIVE, resolveGranumVoidTier, granumVoidDisplayName }
