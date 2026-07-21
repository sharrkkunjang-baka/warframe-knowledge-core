'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { build } = require('../scripts/compile-official-vendor-offers')
const { loadEntityRegistries } = require('../src/entities')

test('官方商店报价使用统一 requirements 并实体化商人、地点和轮换', () => {
  const report = build('test')
  const registries = loadEntityRegistries()
  const offers = Object.values(report.byItem).flat()
  assert.equal(offers.length, 114)
  for (const offer of offers) {
    assert.ok(registries.npcs.get(offer.npcId), `${offer.vendorId}: NPC 未注册`)
    assert.ok(registries.locations.get(offer.locationId), `${offer.vendorId}: 地点未注册`)
    assert.equal(offer.require, undefined)
    assert.equal(offer.cost, undefined)
    assert.equal(offer.exchangeRequirement, undefined)
    assert.ok(['currency', 'item'].includes(offer.requirements.type))
    assert.ok(['always', 'rotation'].includes(offer.availability.kind))
    assert.ok(Array.isArray(offer.unlockConditions))
  }
})

test('轮换与声望条件保留 DE ExportVendors 原始结构', () => {
  const offers = Object.values(build('test').byItem).flat()
  const rotations = offers.filter(offer => offer.availability.kind === 'rotation')
  const reputationOffers = offers.filter(offer => offer.reputation)
  assert.equal(rotations.length, 20)
  assert.deepEqual([...new Set(rotations.map(offer => offer.availability.durationHours))].sort((a, b) => a - b), [24, 168])
  assert.ok(reputationOffers.length > 0)
  assert.ok(reputationOffers.every(offer => Number.isInteger(offer.reputation.rank)))
})
