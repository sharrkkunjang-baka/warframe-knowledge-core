'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { createKnowledgeCore } = require('../src')
const { renderStructuredMethod } = require('../src/acquisition-protocol')
const {
  resolveModCardFaceLabel,
  resolveEffectiveModType,
  auditModCardFaceLabels,
  WARFRAME_CARD_LABEL,
  modNeedsTypeSlotLocalization
} = require('../src/mod-card-face-label')

const official = require('../knowledge/categories/official.json')

test('自动破解与灭骸之刃卡面类型显示为灭骸之刃', () => {
  const mod = official.mods.find(item => item.displayName === '自动破解')
  assert.ok(mod)
  assert.equal(resolveModCardFaceLabel(mod), '灭骸之刃')
})

test('双蛇牙突架式卡面类型显示为双剑', () => {
  const mod = official.mods.find(item => item.displayName === '双蛇牙突')
  assert.ok(mod)
  assert.equal(mod.compatName, 'Dual Swords')
  assert.equal(resolveModCardFaceLabel(mod), '双剑')
})

test('追踪齐射与铁甲矩阵识别为 Railjack 并显示航道星舰', () => {
  for (const displayName of ['追踪齐射', '铁甲矩阵']) {
    const mod = official.mods.find(item => item.displayName === displayName)
    assert.ok(mod, displayName)
    assert.equal(resolveEffectiveModType(mod), 'Railjack Mod')
    assert.equal(resolveModCardFaceLabel(mod), '航道星舰')
  }
})

test('电击奇兵获取卡展示集团兑换途径', () => {
  const core = createKnowledgeCore()
  const card = core.getAcquisitionCard('电击奇兵')
  assert.ok(card.sections.exchange.length > 0, 'exchange section empty')
  assert.match(card.sections.exchange[0], /均衡仲裁者|血色面纱/)
  assert.match(card.sections.exchange[0], /25000|25,000/)
  const method = core.getAcquisition('电击奇兵').structuredMethods[0]
  assert.equal(method.type, 'syndicate-exchange-group')
  assert.match(renderStructuredMethod(method), /均衡仲裁者或血色面纱满级后花费25,000声望兑换/)
})

test('Mod 卡面类型审计覆盖 Parazon、架式与 Railjack', () => {
  const report = auditModCardFaceLabels(official.mods)
  assert.equal(report.counts.parazon, 38)
  assert.equal(report.counts.stance, official.mods.filter(item => item.type === 'Stance Mod').length)
  assert.equal(report.counts.railjack, 49)
  assert.ok(report.counts.needsTypeSlot >= report.counts.parazon + report.counts.stance + report.counts.railjack)
  assert.equal(report.samples.missingLabel.length, 0)
})

test('曲翼 Mod 卡面类型显示对应曲翼名称', () => {
  for (const [displayName, expected] of [['加力燃烧', '鞘翅'], ['寒流来袭', '刺影'], ['能量力场', '陨蜓']]) {
    const mod = official.mods.find(item => item.displayName === displayName)
    assert.ok(mod, displayName)
    assert.equal(mod.type, 'Archwing Mod')
    assert.equal(resolveModCardFaceLabel(mod), expected)
  }
})

test('WARFRAME 类型槽保留英文 WARFRAME', () => {
  const mod = official.mods.find(item => item.compatName === 'WARFRAME')
  assert.ok(mod)
  assert.equal(resolveModCardFaceLabel(mod), WARFRAME_CARD_LABEL)
  assert.equal(modNeedsTypeSlotLocalization(mod), false)
})

test('战甲专属 Mod 类型槽保留英文战甲名 VOLT', () => {
  const mod = official.mods.find(item => item.canonical === 'Capacitance')
  assert.ok(mod)
  assert.equal(mod.compatName, 'Volt')
  assert.equal(resolveModCardFaceLabel(mod), 'VOLT')
  assert.equal(modNeedsTypeSlotLocalization(mod), false)
})

test('武器 Prime 兼容名翻译为 DE 官方简中', () => {
  const mod = official.mods.find(item => item.canonical === 'Gilded Truth')
  assert.ok(mod)
  assert.equal(mod.compatName, 'Burston Prime')
  assert.equal(resolveModCardFaceLabel(mod), '伯斯顿 Prime')
  assert.equal(modNeedsTypeSlotLocalization(mod), true)
})
