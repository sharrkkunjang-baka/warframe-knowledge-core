'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('../src')

const core = createKnowledgeCore({ approvedOnly: false })
const forbidden = /Granum|Extended|Nightmare|\bC轮\b|C 轮/

test('Protea 部件使用三级格拉努虚空中文语义', () => {
  const text = core.getAcquisition('Protea').description
  assert.match(text, /头部神经光元：初级格拉努虚空（剩余击杀量不高于25%）/)
  assert.match(text, /机体：中级格拉努虚空（剩余击杀量不高于25%）/)
  assert.match(text, /系统：高级格拉努虚空（剩余击杀量不高于25%）/)
  assert.doesNotMatch(text, forbidden)
})

test('格拉努武器统一显示任务等级和击杀完成度条件', () => {
  for (const query of ['钢刃步枪', '诡计之刃']) {
    const text = core.getAcquisition(query).description
    assert.match(text, /总图：击败豺狼（金星刺杀）概率获得/, query)
    assert.match(text, /初级格拉努虚空（剩余击杀量不高于25%）概率获得/, query)
    assert.match(text, /中级格拉努虚空（剩余击杀量不高于25%）概率获得/, query)
    assert.match(text, /高级格拉努虚空（剩余击杀量不高于25%）概率获得/, query)
    assert.doesNotMatch(text, forbidden, query)
  }
})
