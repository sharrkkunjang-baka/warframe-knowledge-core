'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const frameRecipes = require('../../../qq-bot/warframe-knowledge-core/cache/warframe-export-recipes.json');

const core = createKnowledgeCore({ approvedOnly: false, frameRecipes });

test('战甲部件命令解析为独立可寻址图片身份', () => {
  for (const query of ['Ember 头部神经光元', 'Ember头', 'Ember Neuroptics']) {
    const card = core.getAcquisitionCard(query);
    assert.equal(card?.kind, 'frame-component', query);
    assert.equal(card?.identity?.canonical, 'Ember Neuroptics', query);
    assert.equal(card?.identity?.uniqueName, '/Lotus/Types/Recipes/WarframeRecipes/EmberHelmetComponent', query);
    assert.ok(Object.values(card.sections).flat().length, query);
  }
});

test('Ivara 系统只展示系统来源、系统配方与稳定素材身份', () => {
  const card = core.getAcquisitionCard('Ivara 系统');
  const sourceText = Object.values(card.sections).flat().join('\n');
  assert.equal(card.kind, 'frame-component');
  assert.equal(card.identity.canonical, 'Ivara Systems');
  assert.equal(card.assetIdentity.kind, 'frame-component');
  assert.equal(card.assetIdentity.uniqueName, '/Lotus/Types/Recipes/WarframeRecipes/IvaraSystemsComponent');
  assert.match(sourceText, /系统：1-15 级间谍任务 C 轮/);
  assert.match(sourceText, /普通无尽回廊第 8 周轮换可获取/);
  assert.doesNotMatch(sourceText, /机体：|头部神经光元：|整套蓝图：|总图：/);
  assert.deepEqual(card.materials.map(item => [item.displayName, item.count]), [
    ['控制模块', 5], ['红化结晶', 1000], ['泥炭萃取物', 5], ['氩结晶', 1]
  ]);
  assert.equal(card.credits, 15000);
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
