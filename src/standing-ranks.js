'use strict'

const SIX_SYNDICATE_RANK_KEYS = Object.freeze({
  'faction.arbiters-of-hexis': Object.freeze({ canonical: 'Arbiters of Hexis', prefix: '/Lotus/Language/Syndicates/ArbitersTitle' }),
  'faction.cephalon-suda': Object.freeze({ canonical: 'Cephalon Suda', prefix: '/Lotus/Language/Syndicates/CephalonTitle' }),
  'faction.new-loka': Object.freeze({ canonical: 'New Loka', prefix: '/Lotus/Language/Syndicates/NewLokaTitle' }),
  'faction.the-perrin-sequence': Object.freeze({ canonical: 'The Perrin Sequence', prefix: '/Lotus/Language/Syndicates/PerrinTitle' }),
  'faction.red-veil': Object.freeze({ canonical: 'Red Veil', prefix: '/Lotus/Language/Syndicates/RedVeilTitle' }),
  'faction.steel-meridian': Object.freeze({ canonical: 'Steel Meridian', prefix: '/Lotus/Language/Syndicates/SteelMeridianTitle' })
})

const AUDITED_STANDING_RANKS = Object.freeze({
  'faction.the-holdfasts': Object.freeze([
    Object.freeze({ rank: 0, canonical: 'Neutral', displayName: null }),
    Object.freeze({ rank: 1, canonical: 'Fallen', displayName: '堕天使' }),
    Object.freeze({ rank: 2, canonical: 'Watcher', displayName: '守望天使' }),
    Object.freeze({ rank: 3, canonical: 'Guardian', displayName: '守护天使' }),
    Object.freeze({ rank: 4, canonical: 'Seraph', displayName: '炽天使' }),
    Object.freeze({ rank: 5, canonical: 'Angel', displayName: '大天使' })
  ])
})

function buildStandingRankRegistry(en, zh) {
  const byFaction = new Map()
  for (const [factionId, definition] of Object.entries(SIX_SYNDICATE_RANK_KEYS)) {
    const ranks = []
    for (let rank = 1; rank <= 5; rank++) {
      const languageKey = `${definition.prefix}${rank}`
      if (!en[languageKey] || !zh[languageKey]) throw new Error(`${factionId} 缺少官方声望等级本地化：${languageKey}`)
      ranks.push(Object.freeze({ rank, canonical: en[languageKey], displayName: zh[languageKey], languageKey, provenance: Object.freeze({ source: 'DE Languages.bin' }) }))
    }
    byFaction.set(factionId, Object.freeze(ranks))
  }
  for (const [factionId, ranks] of Object.entries(AUDITED_STANDING_RANKS)) byFaction.set(factionId, ranks)
  const canonicalToFactionId = new Map(Object.entries(SIX_SYNDICATE_RANK_KEYS).map(([id, definition]) => [definition.canonical.toLowerCase(), id]))
  return Object.freeze({
    get(factionId, rankOrCanonical) {
      const ranks = byFaction.get(factionId) || []
      if (Number.isInteger(rankOrCanonical)) return ranks.find(item => item.rank === rankOrCanonical) || null
      const canonical = String(rankOrCanonical || '').trim().toLowerCase()
      return ranks.find(item => String(item.canonical || '').toLowerCase() === canonical) || null
    },
    factionIdForCanonical(canonical) { return canonicalToFactionId.get(String(canonical || '').trim().toLowerCase()) || null },
    values(factionId) { return byFaction.get(factionId) || [] }
  })
}

module.exports = { SIX_SYNDICATE_RANK_KEYS, AUDITED_STANDING_RANKS, buildStandingRankRegistry }
