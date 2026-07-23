'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src/index');

const core = createKnowledgeCore({ approvedOnly: false });

test('集团N 解析为对应战甲第 N 张集团 Mod', () => {
  const cases = [
    ['摸尸集团3', 'Despoil', '掠夺', 'Nekros', 3],
    ['女枪集团1', 'Ballistic Bullseye', '弹道靶心', 'Mesa', 1],
    ['电男集团1', 'Shock Trooper', '电击奇兵', 'Volt', 1]
  ];
  for (const [query, canonical, displayName, frame, slot] of cases) {
    const resolved = core.resolveSyndicateGroupMod(query);
    assert.ok(resolved, query);
    assert.equal(resolved.canonical, canonical, query);
    assert.equal(resolved.displayName, displayName, query);
    assert.equal(resolved.frame.canonical, frame, query);
    assert.equal(resolved.slot, slot, query);
    const item = core.resolveItem(query);
    assert.equal(item.kind, 'mod', query);
    assert.equal(item.item.canonical, canonical, query);
    const card = core.getAcquisitionCard(canonical);
    assert.equal(card.kind, 'mod', query);
    assert.equal(card.identity.displayName, displayName, query);
  }
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
