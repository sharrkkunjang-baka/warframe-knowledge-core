'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const { renderStructuredMethod } = require('../src/acquisition-protocol');

test('adversary-reward 按 sourceEntityId 区分姐妹与玄骸', () => {
  const sister = renderStructuredMethod({
    type: 'adversary-reward',
    scope: 'item',
    sourceEntityId: 'acquisition-source.sister-weapon'
  });
  const lich = renderStructuredMethod({
    type: 'adversary-reward',
    scope: 'item',
    sourceEntityId: 'acquisition-source.kuva-lich-weapon'
  });
  assert.match(sister, /帕尔沃斯的姐妹/);
  assert.doesNotMatch(sister, /赤毒玄骸/);
  assert.match(lich, /赤毒玄骸/);
  assert.doesNotMatch(lich, /帕尔沃斯的姐妹/);
});

test('信条·弧电离子枪获取来源指向帕尔沃斯的姐妹', () => {
  const core = createKnowledgeCore();
  const result = core.getAcquisition('Tenet Arca Plasmor');
  assert.match(result.description, /帕尔沃斯的姐妹/);
  assert.doesNotMatch(result.description, /赤毒玄骸/);
});

test('赤毒武器获取来源仍指向赤毒玄骸', () => {
  const core = createKnowledgeCore();
  const result = core.getAcquisition('Kuva Nukor');
  assert.match(result.description, /赤毒玄骸/);
  assert.doesNotMatch(result.description, /帕尔沃斯的姐妹/);
});
