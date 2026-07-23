'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('..');
const { standingRankPrefix } = require('../src/acquisition-protocol');

const core = createKnowledgeCore({ approvedOnly: false });

test('默认 0 级声望不显示“达到0级”前缀', () => {
  assert.equal(standingRankPrefix(0, '微尘'), '');
  assert.equal(standingRankPrefix(null, '微尘'), '');
  assert.equal(standingRankPrefix(4, '学者'), '达到4级（学者）声望后');

  for (const query of ['Virtuos Null', '正直·空无', 'Magus Vigor', '魔导·活力']) {
    const result = core.getAcquisition(query);
    const exchange = result.structuredMethods.find(method => method.requirements?.type === 'standing');
    assert.ok(exchange, `${query} 应有声望兑换`);
    assert.doesNotMatch(exchange.requirementLines.join('\n'), /达到0级/);
    assert.match(exchange.requirementLines.join('\n'), /消耗2,500声望兑换/);
  }
});

test('非默认声望等级仍显示等级要求', () => {
  const shadow = core.getAcquisition('正直·暗影');
  const exchange = shadow.structuredMethods.find(method => method.requirements?.type === 'standing');
  assert.match(exchange.requirementLines.join('\n'), /达到4级（构筑师）声望后消耗10,000声望兑换/);
});
