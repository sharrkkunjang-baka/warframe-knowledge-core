'use strict'

const RELATION_TYPES = Object.freeze({
  ANIMAL_TAG: 'animal-tag',
  FISH_PROCESSING_OUTPUT: 'fish-processing-output',
  BAIT_TARGET_FISH: 'bait-target-fish'
})
function createEcologyRelationIndex(catalog = { relations: [] }) {
  const relations = Array.isArray(catalog?.relations) ? catalog.relations : []
  const outgoing = new Map(), incoming = new Map()
  for (const relation of relations) {
    if (!relation?.type || !relation.fromIdentity || !relation.toIdentity) continue
    const from = outgoing.get(relation.fromIdentity) || []
    const to = incoming.get(relation.toIdentity) || []
    from.push(relation); to.push(relation)
    outgoing.set(relation.fromIdentity, from); incoming.set(relation.toIdentity, to)
  }
  const filter = (values, type) => type ? values.filter(relation => relation.type === type) : values
  return Object.freeze({
    schemaVersion: catalog.schemaVersion || 1,
    relationTypes: RELATION_TYPES,
    relations,
    from: (stableIdentity, type = null) => filter(outgoing.get(stableIdentity) || [], type),
    to: (stableIdentity, type = null) => filter(incoming.get(stableIdentity) || [], type),
    related: (stableIdentity, type = null) => [
      ...filter(outgoing.get(stableIdentity) || [], type).map(relation => ({ direction: 'outgoing', stableIdentity: relation.toIdentity, relation })),
      ...filter(incoming.get(stableIdentity) || [], type).map(relation => ({ direction: 'incoming', stableIdentity: relation.fromIdentity, relation }))
    ]
  })
}
module.exports = { RELATION_TYPES, createEcologyRelationIndex }
