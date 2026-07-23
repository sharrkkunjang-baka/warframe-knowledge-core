'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src/index');
const {
  parseSyndicateSlot,
  isSyndicateGroupModQuery
} = require('../src/syndicate-group-mod-resolver');

const core = createKnowledgeCore({ approvedOnly: false });

test('parseSyndicateSlot 支持阿拉伯数字与中文数字', () => {
  assert.equal(parseSyndicateSlot('1'), 1);
  assert.equal(parseSyndicateSlot('4'), 4);
  assert.equal(parseSyndicateSlot('二'), 2);
  assert.equal(parseSyndicateSlot('肆'), 4);
  assert.equal(parseSyndicateSlot('五'), null);
});

test('isSyndicateGroupModQuery 识别中文数字序号', () => {
  assert.equal(isSyndicateGroupModQuery('wukong集团二'), true);
  assert.equal(isSyndicateGroupModQuery('女枪集团4'), true);
  assert.equal(isSyndicateGroupModQuery('伯斯顿集团卡'), false);
});

test('集团N 解析为对应战甲第 N 张集团 Mod', () => {
  const cases = [
    ['摸尸集团3', 'Despoil', '掠夺', 'Nekros', 3],
    ['女枪集团1', 'Ballistic Bullseye', '弹道靶心', 'Mesa', 1],
    ['女枪集团4', "Mesa's Waltz", null, 'Mesa', 4],
    ['电男集团1', 'Shock Trooper', '电击奇兵', 'Volt', 1],
    ['wukong集团二', 'Enveloping Cloud', '包覆游云', 'Wukong', 2],
    ['猴哥集团2', 'Enveloping Cloud', '包覆游云', 'Wukong', 2]
  ];
  for (const [query, canonical, displayName, frame, slot] of cases) {
    const resolved = core.resolveSyndicateGroupMod(query);
    assert.ok(resolved, query);
    assert.equal(resolved.canonical, canonical, query);
    if (displayName) assert.equal(resolved.displayName, displayName, query);
    assert.equal(resolved.frame.canonical, frame, query);
    assert.equal(resolved.slot, slot, query);
    const item = core.resolveItem(query);
    assert.equal(item.kind, 'mod', query);
    assert.equal(item.item.canonical, canonical, query);
    const card = core.getAcquisitionCard(canonical);
    assert.equal(card.kind, 'mod', query);
    assert.ok(card.identity.displayName, query);
  }
});

test('GunFuPvPAugmentCard 不被误判为 PvP 专用 Mod', () => {
  const resolved = core.resolveSyndicateGroupMod('女枪集团4');
  assert.equal(resolved?.canonical, "Mesa's Waltz");
  assert.equal(resolved?.slot, 4);
});

test('无集团N 的战甲别名优先于武器模糊匹配', () => {
  const item = core.resolveItem('摸尸');
  assert.equal(item.kind, 'warframe');
  assert.equal(item.item.name, 'Nekros');
});

test('集团卡关键词不触发集团N 解析', () => {
  assert.equal(core.resolveSyndicateGroupMod('伯斯顿集团卡'), null);
  assert.equal(core.resolveSyndicateGroupMod('集团卡伯斯顿'), null);
});

test('刷命令解析保持 query 原样供上层路由', () => {
  assert.equal(core.resolveAcquisitionCommand('刷 摸尸集团3').query, '摸尸集团3');
  assert.equal(core.resolveAcquisitionCommand('刷 摸尸').query, '摸尸');
});
