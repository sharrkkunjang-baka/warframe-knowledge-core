'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('../src')
const { officialDropMethods } = require('../src/mod-entry-builder')
const core = createKnowledgeCore({ approvedOnly: false })

test('Mod 商店来源编译为统一声望 requirements，不伪装成敌人掉落', () => {
  const aerial = core.getAcquisition('空中连结')
  assert.match(aerial.description, /在福尔图娜找THE BUSINESS 2级（实践者）声望兑换/)
  assert.doesNotMatch(aerial.description, /Doer|击败|10000%/)
  assert.equal(aerial.structuredMethods[0].type, 'vendor-or-syndicate-exchange')
  assert.equal(aerial.structuredMethods[0].requirements.type, 'standing')
  assert.equal(aerial.structuredMethods[0].requirements.rank, 2)
})

test('Wiki 商店证据迁移出 NPC、等级和声望价格', () => {
  const seismic = core.getAcquisition('震撼连结')
  assert.match(seismic.description, /在殁世幽都找“儿子” 3级（同伴）声望兑换，需要20,000声望/)
  assert.doesNotMatch(seismic.description, /\bSon\b|\bAssociate\b|击败|10000%/)
  assert.equal(seismic.structuredMethods[0].type, 'vendor-or-syndicate-exchange')
})

test('Mod 上游概率统一保存为 0 到 1', () => {
  const methods = officialDropMethods({ uniqueName: '/Lotus/Types/Sentinels/SentinelPrecepts/VoidBond/Copilot' })
  assert.ok(methods.length)
  assert.ok(methods.every(method => method.chance == null || (method.chance >= 0 && method.chance <= 1)))
})

test('全部 Mod 与赋能发布输出不泄漏已知商店英文且概率不超过 1', () => {
  const entries = [...core.arcanes, ...core.knowledge.filter(entry => entry.subject?.category === 'mod')]
  for (const entry of entries) {
    const query = entry.subject?.displayName || entry.subject?.canonical
    const result = core.getAcquisition(query)
    if (!result) continue
    assert.doesNotMatch(result.description || '', /10000%|\b(?:Son|Associate|Doer|Entrati)\b/)
    for (const method of result.structuredMethods || []) {
      if (Number.isFinite(method.chance)) assert.ok(method.chance >= 0 && method.chance <= 1, `${query}: ${method.chance}`)
      if (method.type === 'enemy-drop') assert.notEqual(method.availability, 'guaranteed-when-requirements-met', query)
    }
  }
})
