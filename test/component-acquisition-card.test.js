'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');

const core = createKnowledgeCore({ approvedOnly: false });

test('战甲部件命令解析为独立可寻址图片身份', () => {
  for (const query of ['Ember 头部神经光元', 'Ember头', 'Ember Neuroptics']) {
    const card = core.getAcquisitionCard(query);
    assert.equal(card?.kind, 'frame-component', query);
    assert.equal(card?.identity?.canonical, 'Ember Neuroptics', query);
    assert.equal(card?.identity?.uniqueName, '/Lotus/Types/Recipes/WarframeRecipes/EmberHelmetComponent', query);
    assert.ok(Object.values(card.sections).flat().length, query);
  }
});

test('武器部件命令兼容有无空格并只保留该部件身份', () => {
  for (const query of ['舍杜 枪管', '舍杜枪管', 'Shedu Barrel']) {
    const card = core.getAcquisitionCard(query);
    assert.equal(card?.kind, 'weapon-component', query);
    assert.equal(card?.identity?.canonical, 'Shedu Barrel', query);
    assert.equal(card?.identity?.displayName, '舍杜 枪管', query);
    assert.equal(card?.identity?.uniqueName, '/Lotus/Types/Recipes/Weapons/WeaponParts/SheduHeavyWeaponBarrel', query);
    assert.ok(Object.values(card.sections).flat().length, query);
  }
});
