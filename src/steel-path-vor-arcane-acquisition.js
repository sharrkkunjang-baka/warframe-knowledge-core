'use strict'

const STEEL_PATH_VOR_EVIDENCE = /Captain Vor in Tolstoj[^.]{0,80}Steel Path/i

function hasSteelPathVorWikiEvidence(entry) {
  const evidence = entry?.arcaneAcquisition?.generated?.wiki?.evidence || []
  return evidence.some(item => STEEL_PATH_VOR_EVIDENCE.test(String(item.provenance?.excerpt || '')))
}

function hasSteelPathVorDrop(methods) {
  return (methods || []).some(method => method.sourceEntityId === 'enemy.captain-vor'
    || /Vor|沃尔|Tolstoj/i.test(String(method.sourceDisplayName || method.sourceCanonical || '')))
}

function appendSteelPathVorArcaneDrop(methods, entry) {
  const list = [...(methods || [])]
  if (!hasSteelPathVorWikiEvidence(entry) || hasSteelPathVorDrop(list)) return list
  list.push({
    type: 'enemy-drop',
    sourceEntityId: 'enemy.captain-vor',
    sourceCanonical: 'Captain Vor',
    locationId: 'mission.tolstoj-solnode108',
    quantity: 1,
    availability: 'farmable',
    requirements: { type: 'mode', modeId: 'steel-path' },
    reviewStatus: 'approved',
    provenance: {
      source: 'wiki-steel-path-vor-enrichment',
      note: 'Wiki 记载水星 Tolstoj 钢铁之路沃尔上尉掉落；由共享 enrichment 从 wiki evidence 实体化。'
    }
  })
  return list
}

module.exports = { STEEL_PATH_VOR_EVIDENCE, hasSteelPathVorWikiEvidence, hasSteelPathVorDrop, appendSteelPathVorArcaneDrop }
