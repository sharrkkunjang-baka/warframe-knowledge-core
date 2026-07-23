'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('..');
const { structuredAcquisition } = require('../scripts/sync-arcanes');

const core = createKnowledgeCore({ approvedOnly: false });

test('刷 和平电充 解析到 Pax Charge 并显示福尔图娜 ZUUD 声望兑换', () => {
  const resolved = core.resolveItem('和平电充');
  assert.equal(resolved.kind, 'arcane');
  assert.equal(resolved.item.subject.canonical, 'Pax Charge');
  assert.equal(resolved.item.subject.displayName, '和平·电充');

  const result = core.getAcquisition('和平电充');
  assert.equal(result.entry.subject.displayName, '和平·电充');
  const exchange = result.structuredMethods.find(method => method.type === 'vendor-or-syndicate-exchange');
  assert.ok(exchange, '应有 vendor-or-syndicate-exchange 结构化来源');
  assert.equal(exchange.requirements.npcId, 'npc.rude-zuud');
  assert.equal(exchange.requirements.locationId, 'hub.fortuna');
  assert.equal(exchange.requirements.amount, 10000);
  assert.equal(exchange.requirements.rankName, '老朋友');
  assert.match(exchange.requirementLines.join('\n'), /10[,，]000声望/);
  assert.match(result.description, /福尔图娜.*ZUUD|粗鲁的 ZUUD/);
  assert.doesNotMatch(result.description, /Cavalero|Old Mate|Rude Zuud/);

  const card = core.getAcquisitionCard('和平电充');
  assert.equal(card.kind, 'arcane');
  assert.ok(card.sections.exchange.length > 0, '获取卡应显示商店兑换栏');
  assert.match(card.sections.exchange.join('\n'), /ZUUD|福尔图娜/);
});

test('warframe-items 缺失 drops 时 sync-arcanes 从 Wiki 证据补全 Pax 声望兑换', () => {
  const previous = core.getArcane('Pax Charge');
  const methods = structuredAcquisition({
    uniqueName: '/Lotus/Upgrades/CosmeticEnhancers/Utility/BulletToBattery',
    name: 'Pax Charge',
    components: [{ uniqueName: '/Lotus/Types/Recipes/SolarisRecipes/Arcanes/BulletToBatteryBlueprint', name: 'Blueprint', itemCount: 1 }],
    drops: []
  }, undefined, previous);
  const exchange = methods.find(method => method.type === 'vendor-or-syndicate-exchange');
  assert.ok(exchange);
  assert.equal(exchange.requirements.amount, 10000);
  assert.equal(exchange.reviewStatus, 'approved');
});
