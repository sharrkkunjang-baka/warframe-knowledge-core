'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const { createModEffectResolver, parseEffectDetail } = require('../src/combat/mod-effects');
const { calculateToridIncarnon } = require('../src/combat/calculator');
const core = createKnowledgeCore({ approvedOnly: false });
const resolver = createModEffectResolver(core);

test('严格解析知识库文本词条', () => {
  assert.deepEqual(parseEffectDetail('+165% 冰冻伤害'), { stat: 'cold', displayName: '冰冻伤害', value: 165, unit: '%', supported: true, sourceKind: 'strict-text-parser' });
  assert.equal(parseEffectDetail('击杀时触发特殊效果').supported, false);
});
test('自动解析中文 Mod 满级词条', () => {
  const cryo = resolver.resolve('低温弹头 Prime');
  assert.equal(cryo.status, 'resolved');
  assert.equal(cryo.effects[0].stat, 'cold');
  assert.equal(cryo.effects[0].value, 165);
  const vile = resolver.resolve('卑劣加速');
  assert.deepEqual(vile.effects.map(e => [e.stat, e.value]), [['fire-rate', 90], ['damage', -15]]);
});
test('镀层 Mod 使用审核动态词条', () => {
  const aptitude = resolver.resolve('镀层步枪才能');
  assert.equal(aptitude.effects[1].stat, 'gun-condition-overload');
  assert.equal(aptitude.effects[1].condition, 'on-kill-2-stacks');
});
test('托里德 GunCO 只读取一半灵化基础伤害', () => {
  const resolvedMods = resolver.resolveMany(['镀层步枪才能', '并合 膛线']);
  const stats = calculateToridIncarnon({ resolvedMods, stacks: { 'on-kill-2-stacks': true } });
  assert.equal(stats.baseDamage, 102);
  assert.equal(stats.gunCo.eligibleFraction, 0.5);
  assert.ok(Math.abs(stats.statusChance - 0.972) < 1e-12);
});
test('未知 Mod 明确失败而不猜值', () => {
  const result = resolver.resolve('根本不存在的卡');
  assert.equal(result.status, 'not-found');
  assert.equal(result.effects.length, 0);
});
