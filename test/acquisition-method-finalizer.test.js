'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { loadData } = require('../src/loader')
const { finalizeMethod, routesToMethods } = require('../src/acquisition-core')
const { EXCHANGE_REQUIREMENT_PROTOCOL } = require('../src/acquisition-protocol')

const registries = loadData(path.join(__dirname, '..'), { approvedOnly: false })

test('共享协议矩阵允许 vendor 类 itemGroup 兑换且仍拒绝空 item requirement', () => {
  assert.deepEqual(EXCHANGE_REQUIREMENT_PROTOCOL['vendor-exchange'], ['currency', 'standing', 'item'])
  assert.deepEqual(EXCHANGE_REQUIREMENT_PROTOCOL['vendor-or-syndicate-exchange'], ['currency', 'standing', 'item'])

  const approved = finalizeMethod({
    type: 'vendor-or-syndicate-exchange',
    sourceEntityId: 'npc.marie',
    locationId: 'hub.sanctum-anatomica',
    requirements: { type: 'item', itemGroupId: 'resource-group.perita', amountStatus: 'random' },
    reviewStatus: 'approved'
  }, registries)
  assert.equal(approved.reviewStatus, 'approved')
  assert.deepEqual(approved.reviewIssues, [])
  assert.match(approved.requirementLines[0], /兑换.*商店轮换决定/)

  const rejected = finalizeMethod({
    type: 'vendor-exchange',
    sourceEntityId: 'npc.marie',
    locationId: 'hub.sanctum-anatomica',
    requirements: { type: 'item' },
    reviewStatus: 'approved'
  }, registries)
  assert.equal(rejected.reviewStatus, 'review-required')
  assert.ok(rejected.reviewIssues.includes('item-group'))
  assert.deepEqual(rejected.requirementLines, [])
})

test('共享终结器接受 acquisition-source 商店 actor 并保持金额质量门', () => {
  const approved = routesToMethods([{
    scope: 'blueprint',
    category: 'weapon',
    status: 'complete',
    methods: [{
      type: 'vendor-exchange',
      sourceEntityId: 'acquisition-source.teshins-cave',
      requirements: { type: 'currency', currency: [{ currencyId: 'currency.pathos-clamp', amount: 50 }] },
      reviewStatus: 'approved'
    }]
  }], registries)[0]
  assert.equal(approved.reviewStatus, 'approved')
  assert.deepEqual(approved.reviewIssues, [])
  assert.equal(approved.locationId, 'landscape.duviri')
  assert.match(approved.requirementLines[0], /50个苦栓兑换/)

  const rejected = finalizeMethod({
    type: 'vendor-exchange',
    sourceEntityId: 'acquisition-source.teshins-cave',
    requirements: { type: 'currency', currency: [{ currencyId: 'currency.pathos-clamp', amount: 0 }] },
    reviewStatus: 'approved'
  }, registries)
  assert.equal(rejected.reviewStatus, 'review-required')
  assert.ok(rejected.reviewIssues.includes('currency-amount'))
  assert.deepEqual(rejected.requirementLines, [])
})

test('requirements 补全不会被旧 method 对象覆盖且最终字段统一', () => {
  const finalized = finalizeMethod({
    type: 'vendor-exchange',
    sourceEntityId: 'acquisition-source.teshins-cave',
    requirements: {
      type: 'currency',
      currency: [{ currencyCanonical: 'Pathos Clamp', amount: 50 }]
    },
    reviewStatus: 'approved',
    reviewIssues: []
  }, registries)
  assert.deepEqual(finalized.requirements.currency, [{ currencyId: 'currency.pathos-clamp', amount: 50 }])
  assert.equal(finalized.requirements.npcId, 'acquisition-source.teshins-cave')
  assert.equal(finalized.requirements.locationId, null)
  assert.equal(finalized.locationId, 'landscape.duviri')
  assert.deepEqual(finalized.reviewIssues, [])
  assert.equal(finalized.reviewStatus, 'approved')
  assert.ok(Array.isArray(finalized.requirementLines))
})
