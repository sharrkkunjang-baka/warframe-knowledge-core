'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { createKnowledgeCore } = require('../src');
const { buildPlan } = require('../scripts/sync-arcanes');

const core = createKnowledgeCore({ approvedOnly: false });

test('官方赋能目录排除基类并按 officialUniqueName 唯一索引', () => {
  const catalog = core.arcaneCatalog;
  assert.equal(catalog.counts.input, 172);
  assert.equal(catalog.counts.placeholdersExcluded, 16);
  assert.equal(catalog.counts.arcanes, 156);
  assert.equal(catalog.counts.reviewRequired, 7);
  assert.equal(new Set(catalog.arcanes.map(item => item.officialUniqueName)).size, 156);
  assert.deepEqual(catalog.categories.map(item => item.id), ['warframe', 'primary', 'bow', 'shotgun', 'secondary', 'melee', 'operator', 'amp', 'kitgun', 'zaw', 'legacy']);
  assert.ok(catalog.categories.every(item => item.mutuallyExclusive));
  for (const route of catalog.arcanes) {
    const hash = crypto.createHash('sha256').update(route.officialUniqueName).digest('hex').slice(0, 8);
    assert.match(route.file, new RegExp(`-${hash}\\.json$`));
  }
});

test('无官方来源赋能进入 legacy/review-required', () => {
  const legacy = core.arcaneCatalog.arcanes.filter(item => item.category === 'legacy');
  assert.equal(legacy.length, 7);
  assert.ok(legacy.every(item => item.acquisitionStatus === 'review-required'));
  assert.deepEqual(legacy.map(item => item.canonical).sort(), ['Arcane Defense', 'Arcane Detoxifier', 'Arcane Liquid', 'Arcane Protection', 'Arcane Shield', 'Arcane Survival', 'Arcane Temperance']);
});

test('官方字段和 generated/manual 分层完整', () => {
  const arcane = core.getArcane('Cascadia Flare');
  assert.equal(arcane.subject.category, 'arcane');
  assert.equal(arcane.arcaneType, 'Secondary Arcane');
  assert.equal(arcane.equipmentClass, 'Secondary');
  assert.equal(arcane.rarity, 'Rare');
  assert.equal(arcane.maxRank, arcane.levelStats.length - 1);
  assert.ok(arcane.arcaneAcquisition.generated.identity.officialUniqueName);
  assert.deepEqual(Object.keys(arcane.arcaneAcquisition.manual), ['aliases', 'methods', 'methodRefs', 'notes', 'overrides', 'reviewStatus', 'reviewedBy']);
  const official = core.getOfficialItem('Cascadia Flare');
  assert.equal(official.arcaneType, 'Secondary Arcane');
  assert.equal(official.equipmentClass, 'Secondary');
  assert.equal(official.maxRank, official.levelStats.length - 1);
});

test('chance=1 的商店和集团来源不渲染为 100% 掉落', () => {
  const result = core.getItemAcquisition('Cascadia Flare');
  const exchange = result.evidence.find(item => item.type === 'vendor-or-syndicate-exchange');
  assert.ok(exchange);
  assert.equal(exchange.chance, null);
  assert.match(exchange.note, /不是 100% 随机掉落/);
});

test('同步计划保留 manual 人工字段', () => {
  const target = structuredClone(core.getArcane('Cascadia Flare'));
  target.arcaneAcquisition.manual.notes = ['人工备注'];
  const rebuilt = require('../scripts/sync-arcanes').buildEntry({
    name: target.subject.canonical, uniqueName: target.officialUniqueName, type: target.arcaneType,
    rarity: target.rarity, levelStats: target.levelStats, tradable: target.tradable, drops: []
  }, target);
  assert.deepEqual(rebuilt.arcaneAcquisition.manual.notes, ['人工备注']);
});
