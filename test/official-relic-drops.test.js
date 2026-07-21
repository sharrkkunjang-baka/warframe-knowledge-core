'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { relicRewardRarity } = require('../scripts/compile-official-drop-tables');

test('完整遗物奖励按官方概率稳定归入铜银金', () => {
  assert.equal(relicRewardRarity(0.2533, 'Uncommon (25.33%)'), 'Common');
  assert.equal(relicRewardRarity(0.11, 'Uncommon (11.00%)'), 'Uncommon');
  assert.equal(relicRewardRarity(0.02, 'Rare (2.00%)'), 'Rare');
});

test('概率缺失时保留官方标签作为证据回退', () => {
  assert.equal(relicRewardRarity(null, 'Common (Unknown)'), 'Common');
  assert.equal(relicRewardRarity(undefined, ''), null);
});
