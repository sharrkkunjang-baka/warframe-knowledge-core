'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createKnowledgeCore } = require('..');

const core = createKnowledgeCore(path.resolve(__dirname, '..'));

test('矿物表包含完整加工产物并使用精简标题', () => {
  const table = core.getMiningCard('挖矿');
  const items = table.regions.flatMap(region => region.groups.flatMap(group => group.items));
  assert.equal(table.title, '矿物表');
  assert.equal(core.getMiningCard('挖矿 希图斯').title, '夜灵平野');
  assert.equal(items.length, 30);
  assert.equal(items.filter(item => item.processed).length, 30);
  const auron = items.find(item => item.displayName === '金辉');
  assert.equal(auron.processed.displayName, '金辉合金');
  assert.ok(auron.processed.image.expectedMediaFilename);
});

test('鱼类表总图和地区图使用精简标题', () => {
  assert.equal(core.getFishingCard('钓鱼').title, '鱼类表');
  assert.equal(core.getFishingCard('钓鱼 希图斯').title, '夜灵平野');
});

test('矿物详情提供矿脉、额外来源和完整加工配方', () => {
  const pyrol = core.getMiningCard('挖矿 炎晶').item;
  assert.equal(pyrol.regionName, '夜灵平野');
  assert.equal(pyrol.typeName, '矿物（红色矿脉）');
  assert.deepEqual(pyrol.extraSources, [{ kind: 'enemy-family-drop', canonical: 'Tusk Thumper family', displayName: '任意巨牙重击者', chanceMin: 0.1668, chanceMax: 0.3336 }]);
  assert.equal(pyrol.processed.displayName, '炎晶合金');
  assert.equal(pyrol.processed.recipe.outputQuantity, 20);
  assert.deepEqual(
    Object.fromEntries(pyrol.processed.recipe.ingredients.map(item => [item.displayName, item.quantity])),
    { 永冻晶矿: 200, 炎晶: 20, 红化结晶: 50 }
  );
  assert.deepEqual(pyrol.processed.recipe.ingredients.filter(item => item.isMineral).map(item => item.displayName), ['炎晶']);
  const adramalium = core.getMiningCard('挖矿 阿德拉玛金属').item;
  assert.equal(adramalium.typeName, '矿物（黄色矿脉）');
  assert.doesNotMatch(adramalium.typeName, /红色/u);
  assert.deepEqual(adramalium.processed.recipe.ingredients.filter(item => item.isMineral).map(item => item.displayName), ['阿德拉玛金属', '铁镍矿']);
});

test('酸性矿物作为酸化矿物的兼容别名', () => {
  const card = core.getMiningCard('挖矿 酸性矿物');
  assert.equal(card.kind, 'mining-detail');
  assert.equal(card.item.displayName, '酸化矿物');
});
