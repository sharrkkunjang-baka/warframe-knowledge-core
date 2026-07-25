'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('../src')

const core = createKnowledgeCore({ approvedOnly: false })

test('创口溃烂优先显示魔胎之境赏金而非错误双衍王境来源', () => {
  const result = core.getAcquisition('创口溃烂')
  assert.equal(result.entry?.subject?.canonical, 'Weeping Wounds')
  assert.match(result.description, /魔胎之境赏金任务轮换/)
  assert.doesNotMatch(result.description, /双衍王境.*普通任务/)
  assert.doesNotMatch(result.description, /来源：火卫二/)
  assert.equal((result.description.match(/从魔胎之境赏金任务轮换/g) || []).length, 1)
  assert.match(result.description, /不同赏金档位概率7\.95%～14%/)
  const bounty = result.structuredMethods.find(method =>
    method.type === 'mission-reward' && method.missionTypeId === 'mission-type.cambion-drift-bounty')
  assert.ok(bounty, '缺少魔胎之境赏金结构化来源')
  assert.equal(bounty.locationId, 'landscape.cambion-drift')
  const circuit = result.structuredMethods.find(method => method.type === 'circuit-reward')
  assert.ok(circuit, '无尽回廊来源应保留为 circuit-reward')
})

test('Deimos 赏金轮换 Mod 合并同地点多阶段概率为一行', () => {
  const samples = ['Blood Rush', 'Weeping Wounds', 'Catalyzer Link', 'Hydraulic Crosshairs', 'Shrapnel Shot']
  for (const query of samples) {
    const result = core.getAcquisition(query)
    const bountyMethods = (result.structuredMethods || []).filter(method =>
      method.type === 'mission-reward' && /cambion-drift-bounty/.test(String(method.missionTypeId || '')))
    assert.ok(bountyMethods.length, `${query} 缺少魔胎之境赏金来源`)
    assert.ok(bountyMethods.every(method => method.locationId === 'landscape.cambion-drift'), query)
    assert.doesNotMatch(result.description || '', /双衍王境.*普通任务/, query)
    assert.equal((result.description.match(/从魔胎之境赏金任务轮换/g) || []).length, 1, query)
    assert.doesNotMatch(result.description, /从魔胎之境赏金奖励中获得.*\n从魔胎之境赏金奖励中获得/, query)
  }
})

test('创口溃烂获取卡 acquisition 区展示魔胎之境赏金任务轮换', () => {
  const card = core.getAcquisitionCard('创口溃烂')
  assert.ok(card)
  const acquisitionText = (card.sections.acquisition || []).join('\n')
  assert.match(acquisitionText, /魔胎之境赏金任务轮换/)
  assert.doesNotMatch(acquisitionText, /双衍王境.*普通任务/)
  assert.equal((acquisitionText.match(/魔胎之境赏金任务轮换/g) || []).length, 1)
})
