'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { compileMissionRows, splitLocationProvider } = require('../src/mod-wiki-compiler')

test('Wiki 复合地点把赏金接取 NPC 从星球 canonical 中拆出', () => {
  assert.deepEqual(splitLocationProvider('Venus ; talk to Eudico'), {
    canonical: 'Venus', npcId: 'npc.eudico', npcCanonical: 'Eudico'
  })
  assert.deepEqual(splitLocationProvider('Earth ; talk to Konzu'), {
    canonical: 'Earth', npcId: 'npc.konzu', npcCanonical: 'Konzu'
  })
  assert.deepEqual(splitLocationProvider('Eris'), {
    canonical: 'Eris', npcId: null, npcCanonical: null
  })
})

test('Mission Drop Tables 不再把 talk to NPC 写入地点实体', () => {
  const page = { title: 'Fixture Mod', pageId: 1, revisionId: 2 }
  const section = {
    title: 'Mission Drop Tables',
    text: [
      '| Mission Type', '| Source', '| RotationsorDrop Table', '| Chance', '| Quantity', '| Avg. per roll', '| Star Chart Nodes',
      '',
      '| Fortuna Bounty', '| Fortuna Bounty Lvl 10-30 Final Stage', '| A', '| 25%', '| 1', '| 0.25', '| Orb Vallis / Fortuna , Venus ; talk to Eudico',
      '',
      '| Cetus Bounty', '| Cetus Bounty Lvl 10-30 Final Stage', '| A', '| 25%', '| 1', '| 0.25', '| Plains of Eidolon / Cetus , Earth ; talk to Konzu'
    ].join('\n')
  }
  const unresolved = []
  const methods = compileMissionRows(page, section, unresolved)
  assert.equal(methods.length, 2)
  assert.deepEqual(methods.map(method => method.npcId), ['npc.eudico', 'npc.konzu'])
  assert.deepEqual(methods.map(method => method.nodes[0].planetCanonical), ['Venus', 'Earth'])
  assert.deepEqual(methods.map(method => method.nodes[0].npcId), ['npc.eudico', 'npc.konzu'])
  const structuredFields = methods.map(({ provenance, ...method }) => method)
  assert.equal(JSON.stringify(structuredFields).includes('talk to'), false)
  assert.ok(methods.every(method => method.provenance.excerpt.includes('talk to')))
  assert.deepEqual(unresolved.filter(item => item.kind === 'npc'), [])
})
