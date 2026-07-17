'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveWarframeAbilityQueries } = require('../src/frame-acquisition');

test('多战甲技能比较分别锁定 Mirage 3 与 Jade 2', () => {
  const result = resolveWarframeAbilityQueries('mirage的3和jade的2增伤是否为同一乘区');
  assert.deepEqual(result.map(item => ({ frame: item.abilityFrame.name, index: item.ability.index, ability: item.ability.name })), [
    { frame: 'Mirage', index: 3, ability: 'Eclipse' },
    { frame: 'Jade', index: 2, ability: 'Symphony Of Mercy' }
  ]);
});

test('中文战甲黑话同样支持多技能比较', () => {
  const result = resolveWarframeAbilityQueries('小丑3和Jade 2有什么区别');
  assert.equal(result.length, 2);
  assert.equal(result[0].ability.index, 3);
  assert.equal(result[1].ability.index, 2);
});
