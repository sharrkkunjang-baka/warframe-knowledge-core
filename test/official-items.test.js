'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');

const core = createKnowledgeCore();

test('Cipher 及 100x 配方变体共用稳定物品身份', () => {
  const cipher = core.getOfficialItem('Cipher');
  assert.equal(cipher.uniqueName, '/Lotus/Types/Restoratives/Cipher');
  assert.equal(cipher.displayName, '破解器');
  assert.equal(cipher.recipes[0].outputQuantity, 1);
  assert.equal(cipher.recipes[0].ingredients.find(item => item.canonical === 'Ferrite').quantity, 400);

  const hundred = core.resolveItem('100x Cipher');
  assert.equal(hundred.item, cipher);
  assert.equal(hundred.recipeVariant.id, 'cipher.100x');
  assert.equal(hundred.recipeVariant.outputQuantity, 100);
  assert.equal(hundred.recipeVariant.pendingWikiEvidence, true);
  assert.equal(hundred.recipeVariant.recipeId, null);
  assert.match(core.getItemAcquisition('100x Cipher').notes[0], /未提供 100x Cipher 配方/);
});

test('代表性官方物品保留语义、掉落、配方和交易事实', () => {
  const vice = core.getOfficialItem('Elemental Vice');
  assert.ok(vice.semanticKinds.includes('droppable'));
  assert.ok(vice.drops.some(drop => drop.location === 'Temporal Archimedea Gold Rewards'));
  const adapters = core.searchOfficialItems('Arcane Adapter');
  assert.ok(adapters.some(item => item.canonical === 'Melee Arcane Adapter'));
  assert.ok(adapters.every(item => item.semanticKinds.includes('adapter')));
  const adapterResolution = core.resolveItem('Arcane Adapter');
  assert.equal(adapterResolution.kind, 'ambiguous');
  assert.ok(adapterResolution.candidates.length >= 4);
  assert.equal(core.getItemAcquisition('Arcane Adapter').status, 'ambiguous');
  const reactor = core.getOfficialItem('Orokin Reactor');
  assert.equal(reactor.tradable, false);
  assert.equal(reactor.recipes[0].credits, 35000);
  assert.equal(reactor.buildQuantity, 1);
});

test('统一目录严格排除非道具、内部镜像和占位对象', () => {
  const items = core.officialItems.items;
  const forbidden = [
    ['captura', item => item.semanticKinds.includes('captura') || item.type === 'Captura' || /Photobooth|PhotoBooth|\bScene\b/i.test(`${item.uniqueName} ${item.canonical}`)],
    ['exalted', item => /exalted weapon/i.test(item.semanticKinds.join(' ')) || /\/Powersuits\/.*(?:Weapon|Sword|Pistols|Claws|Melee|Bow)/i.test(item.uniqueName)],
    ['ships', item => /\/(?:Items\/Ships|Ship\/|Game\/CrewShip\/Ships)\//i.test(item.uniqueName) || /ship segment|orbiter|extractor/i.test(item.semanticKinds.join(' '))],
    ['fusion bundle', item => /FusionBundles?|RewardBundles?/i.test(`${item.uniqueName} ${item.canonical}`)],
    ['StoreItems mirror', item => /\/StoreItems\//i.test(item.uniqueName)],
    ['internal placeholder', item => /^(?:Arcane|Photoboothtile|Dangerroomtile|Shipfeatureitem|Plantitem|Dogtag|Tnwarchonitembase)$/i.test(item.canonical)]
  ];
  for (const [label, predicate] of forbidden) assert.deepEqual(items.filter(predicate).map(item => item.uniqueName), [], label);
  assert.deepEqual(items.filter(item => item.localizationStatus === 'fallback-en').map(item => item.canonical).sort(), ['Echoes Of Umbra', 'Forma', 'Umbra Forma']);
  assert.equal(core.officialItems.counts.input, 1519);
  assert.equal(core.officialItems.counts.excluded, core.officialItems.counts.input - items.length);
  assert.ok(core.officialItemSources.counts.excludedByReason['captura-scene'] >= 156);
  assert.ok(core.officialItemSources.policy.semanticKindAllowlist.Resources.includes('Resource'));
});

test('地点、商人和货币注册表准确区分开放世界与城镇', () => {
  assert.equal(core.getLocation('Cetus').id, 'hub.cetus');
  assert.equal(core.getLocation('Plains of Eidolon').id, 'landscape.plains-of-eidolon');
  assert.notEqual(core.getLocation('Cetus').id, core.getLocation('Plains of Eidolon').id);
  assert.equal(core.getLocation('Fortuna').id, 'hub.fortuna');
  assert.equal(core.getLocation('Orb Vallis').id, 'landscape.orb-vallis');
  assert.equal(core.getVendor('孔祝').locationId, 'hub.cetus');
  assert.equal(core.getCurrency('星币').id, 'currency.credits');
  assert.equal(core.frameAcquisition.translateLocation('Earth/Cetus and Venus/Orb Vallis'), '地球/希图斯 and 金星/奥布山谷');
});

test('统一解析与获取 DTO 对已有 Mod 和战甲保持共享兼容', () => {
  const mod = core.resolveItem('Narrow Minded');
  assert.equal(mod.kind, 'mod');
  assert.equal(mod.item, core.getOfficialMod('Narrow Minded'));
  assert.equal(core.getItemAcquisition('Narrow Minded').status, 'resolved');

  const frame = core.resolveItem('Wisp');
  assert.equal(frame.kind, 'warframe');
  assert.equal(frame.item.name, 'Wisp');
  assert.equal(core.getItemAcquisition('Wisp').evidence[0].type, 'warframe');
});

test('共享 DTO 返回冻结且稳定的输出结构', () => {
  const result = core.createRenderResult({ text: 'ok', acquisition: core.getItemAcquisition('Elemental Vice') });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.acquisition.evidence), true);
  assert.equal(result.text, 'ok');
});
