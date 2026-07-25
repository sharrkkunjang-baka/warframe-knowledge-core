'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const { isEligibleWeaponAcquisitionMethod } = require('../scripts/sync-weapon-knowledge');

test('普通无尽回廊第 6 阶段不作为常规武器蓝图获取来源', () => {
  for (const type of ['mission-reward', 'enemy-drop']) assert.equal(isEligibleWeaponAcquisitionMethod({
    type,
    scope: 'blueprint',
    sourceCanonical: 'Duviri/Endless: Tier 6  (Normal)'
  }), false);
  assert.equal(isEligibleWeaponAcquisitionMethod({
    type: 'market-purchase',
    scope: 'blueprint',
    sourceCanonical: 'Market'
  }), true);
});

test('空刃双刀只保留商店蓝图来源', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const result = core.getAcquisition('空刃双刀');
  assert.ok(result);
  assert.match(result.description, /在商店购买/);
  assert.doesNotMatch(result.description, /双衍王境|无尽回廊/);
  const methods = result.structuredMethods || [];
  assert.ok(methods.some(method => method.type === 'market-purchase'));
  assert.ok(!methods.some(method => method.sourceEntityId === 'mission.the-circuit-tier-6'));
});
