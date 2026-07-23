'use strict'

const ASCENSION_SISTER_SOURCE = /Sister Of Parvos \(Ascension(?: Hard)? Mode\)|Sister Of Parvos \(Ascension\)/i

function hasAscensionSisterDrop(methods) {
  return (methods || []).some(method => ASCENSION_SISTER_SOURCE.test(String(method.sourceCanonical || '')))
}

function appendAscensionArcaneVestigialExchange(methods) {
  const list = [...(methods || [])]
  if (!hasAscensionSisterDrop(list)) return list
  const hasExchange = list.some(method => (method.type === 'vendor-or-syndicate-exchange' || method.type === 'vendor-exchange')
    && (method.requirements?.currency || []).some(item => item.currencyId === 'currency.vestigial-motes' || item.currencyCanonical === 'Vestigial Motes'))
  if (hasExchange) return list
  list.push({
    type: 'vendor-or-syndicate-exchange',
    sourceEntityId: 'npc.ordis',
    sourceCanonical: "Ordis at Drifter's Camp",
    quantity: 1,
    availability: 'guaranteed-when-requirements-met',
    requirements: {
      type: 'currency',
      usage: 'exchange',
      npcId: 'npc.ordis',
      locationId: 'hub.drifters-camp',
      currency: [{ currencyId: 'currency.vestigial-motes', amount: 10 }],
      isBuffUseless: true
    },
    reviewStatus: 'approved',
    provenance: {
      source: 'ascension-arcane-enrichment',
      note: '可在漂泊者营地的 Ordis 处消耗 10 个残存微粒兑换；满级 5 共需 210 个。'
    }
  })
  return list
}

function collapseAscensionSisterDropVariants(methods) {
  const list = [...(methods || [])]
  const ascension = list
    .map((method, index) => ({ method, index }))
    .filter(({ method }) => ASCENSION_SISTER_SOURCE.test(String(method.sourceCanonical || '')))
  if (ascension.length < 2) return list
  const normal = ascension.find(({ method }) => /\(Ascension Mode\)$/i.test(String(method.sourceCanonical || '')))
  const hard = ascension.find(({ method }) => /Hard Mode\)/i.test(String(method.sourceCanonical || '')))
  if (!normal || !hard) return list
  const normalProb = Number(normal.method.probability ?? normal.method.chance ?? 0)
  const hardProb = Number(hard.method.probability ?? hard.method.chance ?? 0)
  const steelPathNote = hardProb > normalProb
    ? `钢铁之路掉落率 ${(hardProb * 100).toFixed(1).replace(/\.0$/, '')}%，普通模式 ${(normalProb * 100).toFixed(1).replace(/\.0$/, '')}%`
    : null
  const merged = {
    ...normal.method,
    sourceEntityId: 'arcane-source.5e13063804bb',
    sourceCanonical: 'Sister Of Parvos (Ascension)',
    sourceDisplayName: '帕尔沃斯的姐妹（扬升）',
    sourceKind: 'enemy-drop',
    probability: normalProb || null,
    chance: normalProb || null,
    chancePercent: normalProb ? normalProb * 100 : null,
    variables: {
      ...(normal.method.variables || {}),
      steelPathNote: steelPathNote || undefined
    },
    requirementLines: [],
    provenance: {
      ...(normal.method.provenance || {}),
      source: 'collapsed-ascension-sister-drop',
      mergedFrom: [normal.method.sourceCanonical, hard.method.sourceCanonical]
    }
  }
  const removeIndexes = new Set(ascension.map(item => item.index))
  const insertAt = Math.min(...ascension.map(item => item.index))
  const output = list.filter((_, index) => !removeIndexes.has(index))
  output.splice(insertAt, 0, merged)
  return output
}

module.exports = { ASCENSION_SISTER_SOURCE, hasAscensionSisterDrop, appendAscensionArcaneVestigialExchange, collapseAscensionSisterDropVariants }
