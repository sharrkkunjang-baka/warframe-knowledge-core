'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const coreRoot = path.resolve(__dirname, '..');
const core = require(path.join(coreRoot, 'src')).createKnowledgeCore({ root: coreRoot, approvedOnly: false });

const DESCENDIA_ARCANES = [
  'Melee Careen',
  'Primary Bulwark',
  'Primary Debilitate',
  'Primary Overcharge',
  'Secondary Irradiate',
  'Arcane Circumvent',
  'Arcane Concentration',
  'Arcane Expertise',
  'Arcane Persistence'
];

const EXPECTED_EXCHANGE = [
  '在解剖圣所的大教堂"罗瑟"处花费5个怒火核兑换',
  '怒火核：沉沦之地奖励层砸罐子 或 层次奖励',
  '资源数量加成：不吃',
  '资源掉落几率加成：不吃'
].join('\n');

test('沉沦之地九个赋能共享精简兑换文案', () => {
  for (const canonical of DESCENDIA_ARCANES) {
    const card = core.getAcquisitionCard(canonical);
    assert.ok(card, canonical);
    assert.deepEqual(card.sections.exchange, [EXPECTED_EXCHANGE], canonical);
    assert.equal(card.sectionItems.exchange[0].currencies[0].id, 'currency.maphica', canonical);
    assert.doesNotMatch(card.sections.exchange[0], /成品：|所需货币怎么刷|需要5个|不受影响|普通结算|钢铁之路结算/, canonical);
  }
});

test('所有兑换途径的已知加成状态只输出吃或不吃', () => {
  for (const query of ['Galvanized Reflex', 'Amanata Pressure', 'Dante', 'Jade', 'Archon Stretch']) {
    const result = core.getAcquisition(query);
    assert.ok(result, query);
    const lines = (result.structuredMethods || []).flatMap(method => method.requirementLines || []);
    const boosterLines = lines.filter(line => /^资源(?:数量|掉落几率)加成：/.test(line));
    assert.ok(boosterLines.length > 0, query);
    assert.equal(boosterLines.every(line => /^资源(?:数量|掉落几率)加成：(吃|不吃)$/.test(line)), true, query);
    assert.doesNotMatch(boosterLines.join('\n'), /不受影响|任务内拾取数量可翻倍|任务内掉落几率受影响/, query);
  }
});
