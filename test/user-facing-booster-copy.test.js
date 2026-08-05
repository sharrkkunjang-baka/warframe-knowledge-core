'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('../src')
const { renderRequirements, collectCurrencyBoosterDiagnostics } = require('../src/acquisition-protocol')

const INTERNAL_COPY = /缺少明确证据|暂按未知处理|不会因加成改变|成本固定为/

test('虚空商人兑换只保留可确证的消耗句，未知加成降级为内部诊断', () => {
  const core = createKnowledgeCore({ approvedOnly: false })
  const result = core.getAcquisition('蓄能重划 Prime')
  const method = result.structuredMethods[0]
  assert.deepEqual(method.requirementLines, [
    '在任意中继站的虚空商人处消耗225,000个现金、350个Orokin 杜卡德金币兑换'
  ])
  assert.doesNotMatch(result.description, INTERNAL_COPY)
  assert.doesNotMatch(core.getAcquisitionCard('蓄能重划 Prime').sections.exchange.join('\n'), INTERNAL_COPY)
  assert.ok(method.boosterDiagnostics?.length >= 2)
  assert.ok(method.boosterDiagnostics.every(item => item.kind === 'currency-booster-unknown' && item.reviewStatus === 'review-required'))
  assert.match(method.requirementLines[0], /虚空商人/)
  assert.match(method.requirementLines[0], /中继站/)
  assert.match(method.requirementLines[0], /225,000个现金/)
  assert.match(method.requirementLines[0], /350个Orokin 杜卡德金币/)
})

test('共享 renderRequirements 对未知加成不输出用户文案但仍可收集诊断', () => {
  const core = createKnowledgeCore({ approvedOnly: false })
  const registries = {
    currencies: core.currencies,
    npcs: core.npcs,
    locations: core.locations,
    factions: core.factions,
    quests: core.quests
  }
  const requirements = {
    type: 'currency',
    usage: 'exchange',
    npcId: 'npc.baro-ki-teer',
    locationId: 'hub.any-relay',
    currency: [
      { currencyId: 'currency.credits', amount: 1000 },
      { currencyId: 'currency.orokin-ducats', amount: 10 }
    ]
  }
  const lines = renderRequirements(requirements, registries)
  assert.deepEqual(lines, ['在任意中继站的虚空商人处消耗1,000个现金、10个Orokin 杜卡德金币兑换'])
  assert.doesNotMatch(lines.join('\n'), INTERNAL_COPY)
  const diagnostics = collectCurrencyBoosterDiagnostics(requirements, registries)
  assert.equal(diagnostics.length, 2)
})

test('全量货币兑换 method 的用户可见文案不泄漏内部推断句式', () => {
  const core = createKnowledgeCore({ approvedOnly: false })
  const samples = ['蓄能重划 Prime', '棱晶·什长双枪', '执刑官 延伸', '镀层增幅线圈', 'Oraxia', '赋能·坚定']
  for (const query of samples) {
    const result = core.getAcquisition(query)
    const card = core.getAcquisitionCard(query)
    const text = [
      result.description || '',
      ...(result.structuredMethods || []).flatMap(method => method.requirementLines || []),
      ...(card?.sections?.exchange || []),
      ...(card?.sections?.acquisition || [])
    ].join('\n')
    assert.doesNotMatch(text, INTERNAL_COPY, query)
  }
})
