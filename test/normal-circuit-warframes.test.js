'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const acquisition = require('../src/frame-acquisition');

test('普通无尽回廊覆盖十一周三十三套普通战甲', () => {
  const rows = acquisition.listNormalCircuitWarframes();
  assert.equal(acquisition.NORMAL_CIRCUIT_ROTATION.length, 11);
  assert.equal(rows.length, 33);
  assert.equal(new Set(rows.map(row => row.canonical)).size, 33);
  assert.deepEqual(new Set(rows.map(row => row.week)), new Set(Array.from({ length: 11 }, (_, index) => index + 1)));
  assert.ok(rows.every(row => row.difficulty === 'normal' && row.fullSet));
  assert.ok(rows.every(row => JSON.stringify(row.rewardTiers) === JSON.stringify({ Neuroptics: 2, Chassis: 5, Systems: 8, Blueprint: 10 })));
});

test('普通回廊集合支持共享别名解析且排除 Prime 与非轮换战甲', () => {
  assert.equal(acquisition.getNormalCircuitWarframe('Frost')?.canonical, 'Frost');
  assert.equal(acquisition.getNormalCircuitWarframe('冰男')?.canonical, 'Frost');
  assert.equal(acquisition.getNormalCircuitWarframe('Frost Prime'), null);
  assert.equal(acquisition.getNormalCircuitWarframe('Wisp'), null);
});
