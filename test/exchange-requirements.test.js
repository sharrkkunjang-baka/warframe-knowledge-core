'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('..')
const { loadData } = require('../src/loader')
const { routesToMethods } = require('../src/acquisition-core')
const { EXCHANGE_METHOD_TYPES, exchangeRequirementIssues } = require('../src/acquisition-protocol')

const data = loadData(undefined, { approvedOnly: false })

function publishedExchangeMethods() {
  const rows = []
  const seen = new Set()
  const add = (category, entry, methods) => {
    for (const method of methods) {
      if (!EXCHANGE_METHOD_TYPES.includes(method.type)) continue
      const key = JSON.stringify([entry.subject?.officialUniqueName || entry.subject?.canonical, method.type, method.scope, method.sourceEntityId, method.npcId, method.requirements])
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ category, entry, method })
    }
  }
  for (const entry of data.arcanes) add('arcane', entry, routesToMethods([{
    scope: 'item', category: 'arcane', requirements: { type: 'none' }, status: entry.acquisitionStatus,
    methods: [
      ...(entry.arcaneAcquisition?.manual?.methods || []).filter(method => method.reviewStatus === 'approved'),
      ...(entry.arcaneAcquisition?.generated?.acquisition?.methods || []),
      ...(entry.arcaneAcquisition?.generated?.wiki?.methods || []).filter(method => method.reviewStatus === 'approved')
    ]
  }], data))
  for (const entry of data.weapons) add('weapon', entry, routesToMethods(entry.acquisition?.routes || [], data))
  for (const entry of data.consumables) add('consumable', entry, routesToMethods(entry.consumableAcquisition?.generated?.routes || [], data))
  for (const entry of data.knowledge) {
    if (['arcane', 'weapon', 'consumable'].includes(entry.subject?.category)) continue
    const generated = entry.modAcquisition?.generated || {}
    const methods = [
      ...(entry.modAcquisition?.manual?.methods || []),
      ...(generated.wiki?.methods || []),
      ...(generated.officialDrops || []),
      ...(entry.frameAcquisition?.generated?.routing?.methods || []),
      ...(entry.resourceAcquisition?.generated?.methods || [])
    ]
    add(entry.subject?.category || 'item', entry, routesToMethods([{ methods }], data))
  }
  return rows
}

test('魔导·热熔兑换完整实体化并由共享 renderer 生成', () => {
  const result = createKnowledgeCore({ approvedOnly: false }).getAcquisition('魔导·热熔')
  const exchange = result.structuredMethods.find(method => EXCHANGE_METHOD_TYPES.includes(method.type))
  assert.deepEqual(exchange.requirements, {
    type: 'standing', npcId: 'npc.little-duck', locationId: 'hub.fortuna', rank: 5, rankName: '幕后推手',
    blueprintRank: null, blueprintRankName: null, amount: 10000
  })
  assert.deepEqual(exchange.requirementLines, ['在福尔图娜的Little Duck处达到5级（幕后推手）声望后消耗10,000声望兑换'])
  assert.match(result.description, /在福尔图娜的Little Duck处达到5级（幕后推手）声望后消耗10,000声望兑换/)
})

test('所有已发布兑换 method 必须具备完整 requirements，否则只能 review-required', () => {
  const rows = publishedExchangeMethods()
  assert.ok(rows.some(row => row.category === 'arcane'))
  assert.ok(rows.some(row => row.category === 'weapon'))
  assert.ok(rows.some(row => row.category === 'consumable'))
  assert.ok(rows.some(row => row.category === 'mod'))
  assert.ok(rows.some(row => row.category === 'frame'))
  for (const { category, entry, method } of rows) {
    const issues = exchangeRequirementIssues(method, data)
    if (issues.length) assert.equal(method.reviewStatus, 'review-required', `${category}/${entry.subject.canonical}: ${issues.join(',')}`)
    else assert.ok(method.requirementLines.length > 0, `${category}/${entry.subject.canonical}: 完整兑换缺 requirementLines`)
  }
})
