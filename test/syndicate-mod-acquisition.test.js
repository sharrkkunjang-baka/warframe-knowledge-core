'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const coreModule = require('..')
const { getSyndicateMethods, SYNDICATE_IDS } = require('../src/mod-entry-builder')

const mods = require(path.join(path.dirname(require.resolve('warframe-items')), 'data', 'json', 'Mods.json'))

test('电击奇兵通过集团变量和 method JSON 渲染双来源', () => {
  const core = coreModule.createKnowledgeCore()
  const result = core.getAcquisition('电击奇兵')
  assert.equal(result.structuredMethods.length, 1)
  assert.equal(result.structuredMethods[0].type, 'syndicate-exchange-group')
  assert.deepEqual(result.structuredMethods[0].factionIds, ['faction.arbiters-of-hexis', 'faction.red-veil'])
  assert.deepEqual(result.entry.subject.categoryRefs, ['syndicatemod', 'warframemod', 'standardmod'])
  assert.equal(result.description, '电击奇兵通过集团声望兑换获取')
})

test('全部官方集团 Mod 均能编译为已注册 factionId', () => {
  const factionIds = new Set(Object.values(SYNDICATE_IDS))
  const syndicateMods = mods.filter(mod => getSyndicateMethods(mod).length)
  assert.ok(syndicateMods.length >= 180)
  for (const mod of syndicateMods) {
    for (const method of getSyndicateMethods(mod)) assert.ok(factionIds.has(method.factionId), `${mod.name}: ${method.factionId}`)
  }
})

test('全部已发布集团 Mod 都能渲染且不泄露英文集团名', () => {
  const core = coreModule.createKnowledgeCore()
  const entries = core.knowledge.filter(entry => entry.modAcquisition?.generated?.wiki?.methods?.some(method => ['syndicate-exchange', 'syndicate-exchange-group'].includes(method.type)))
  assert.ok(entries.length >= 200)
  for (const entry of entries) {
    const result = core.getAcquisition(entry.subject.canonical)
    assert.ok(result.description?.trim() || result.sourceOptions.length, `${entry.subject.canonical} 缺少发布文案与刷取入口`)
    assert.doesNotMatch(result.description, /\{集团卡\}/)
    assert.ok(result.sourceOptions.some(source => source.id === 'gameplay.syndicate-offerings'), `${entry.subject.canonical} 缺少集团刷取入口`)
    assert.doesNotMatch(result.description, /Arbiters of Hexis|Red Veil|Steel Meridian|Cephalon Suda|New Loka|The Perrin Sequence/)
  }
})
