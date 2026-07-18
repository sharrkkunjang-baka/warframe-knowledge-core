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
  assert.equal(result.structuredMethods.length, 2)
  assert.deepEqual(result.entry.subject.categoryRefs, ['syndicatemod', 'warframemod', 'standardmod'])
  assert.equal(result.description, [
    '电击奇兵：电击强化：对队友施展技能，能使 15 米范围内队友的攻击增加 100% 电击伤害，持续 40 秒的战甲强化MOD',
    '',
    '获取来源：',
    '- 在均衡仲裁者达到最高等级后使用声望兑换',
    '- 在血色面纱达到最高等级后使用声望兑换'
  ].join('\n'))
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
  const entries = core.knowledge.filter(entry => entry.modAcquisition?.generated?.wiki?.methods?.some(method => method.type === 'syndicate-exchange'))
  assert.ok(entries.length >= 180)
  for (const entry of entries) {
    assert.equal(entry.subject.categoryRefs[0], 'syndicatemod', entry.subject.canonical)
    const result = core.getAcquisition(entry.subject.canonical)
    assert.match(result.description, /的.+强化MOD/)
    assert.doesNotMatch(result.description, /\{集团卡\}/)
    assert.match(result.description, /获取(?:来源|方式)：/)
    assert.doesNotMatch(result.description, /Arbiters of Hexis|Red Veil|Steel Meridian|Cephalon Suda|New Loka|The Perrin Sequence/)
  }
})
