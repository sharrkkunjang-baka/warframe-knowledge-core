'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');

const core = createKnowledgeCore();

test('模块化武器配件优先命中专用商人而非通用武器模糊结果', () => {
  const result = core.resolveAccessory('墓指');
  assert.equal(result.kind, 'vendor');
  assert.equal(result.identity.canonical, 'Tombfinger');
  assert.equal(result.npcId, 'npc.rude-zuud');
  assert.equal(result.locationId, 'hub.fortuna');
  assert.equal(result.text, '福尔图娜的 ZUUD');
});

test('普通武器组件返回母体获取身份', () => {
  const result = core.resolveAccessory('舍杜枪机');
  assert.equal(result.kind, 'parent-acquisition');
  assert.equal(result.identity.displayName, '舍杜 枪机');
  assert.equal(result.parent.canonical, 'Shedu');
  assert.equal(result.parent.displayName, '舍杜');
});

test('集团组件仍保留组件身份供 Runtime 优先走集团查询', () => {
  const result = core.resolveAccessory('合成燃气炮枪管');
  assert.equal(result.kind, 'parent-acquisition');
  assert.equal(result.identity.displayName, '合成燃气炮 枪管');
  assert.equal(result.parent.canonical, 'Cyngas');
});

test('感染 Kitgun 枪管唯一命中殁世幽都父亲', () => {
  const result = core.resolveAccessory('孢射');
  assert.equal(result.kind, 'vendor');
  assert.equal(result.text, '殁世幽都的父亲');
});

test('武器专属兑换 Mod 可由武器名命中 NPC 商店', () => {
  assert.equal(core.resolveAccessory('天薙刀').text, '希图斯的 Koumei 神龛');
  assert.equal(core.resolveAccessory('天机伞').text, '希图斯的 Koumei 神龛');
});

test('完整普通武器名回退到自身获取卡片', () => {
  const result = core.resolveAccessory('凯旋将军');
  assert.equal(result.kind, 'parent-acquisition');
  assert.equal(result.parent.canonical, 'Imperator');
  assert.equal(result.parent.displayName, '凯旋将军');
});
