'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');

const core = createKnowledgeCore();

test('集团部件查询优先把带空格的完整部件名识别为一个实体', () => {
  const result = core.querySyndicateExchange('集团 黑鸦 枪托');
  assert.equal(result.kind, 'item');
  assert.equal(result.text, '钢铁防线');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].offers[0].itemName, '黑鸦 枪托');
});

test('集团整套查询列出每个部件对应的集团且不输出等级和数量', () => {
  const result = core.querySyndicateExchange('集团 黑鸦');
  assert.equal(result.text, '黑鸦 枪管：均衡仲裁者\n黑鸦 枪机：中枢苏达\n黑鸦 枪托：钢铁防线');
  assert.doesNotMatch(result.text, /级|声望|20,?000/u);
});

test('兑换多物品支持空格和任意符号分隔并采用最长实体切分', () => {
  for (const query of ['兑换 黑鸦枪托 黑鸦枪管', '兑换 黑鸦枪托、黑鸦枪管', '集团兑换 黑鸦枪托/黑鸦枪管']) {
    const result = core.querySyndicateExchange(query);
    assert.equal(result.kind, 'items', query);
    assert.equal(result.text, '黑鸦 枪托：钢铁防线\n黑鸦 枪管：均衡仲裁者', query);
  }
});

test('多物品查询把同一物品的多个集团合并到一行', () => {
  const result = core.querySyndicateExchange('兑换 效价炼成 蓄积长鞭');
  assert.equal(result.kind, 'items');
  assert.equal(result.text, '效价炼成：新世间、血色面纱\n蓄积长鞭：血色面纱、钢铁防线');
});

test('集团名反查接口按 Mod、集团武器和空战部件分组', () => {
  const result = core.querySyndicateExchange('集团 血色面纱');
  assert.equal(result.kind, 'faction-catalog');
  assert.equal(result.factionName, '血色面纱');
  assert.ok(result.categories.mods.includes('梅萨的华尔兹'));
  assert.ok(result.categories.weapons.includes('绯红·西诺斯'));
  assert.ok(result.categories.archwingComponents.includes('巨浪 枪托'));
});
