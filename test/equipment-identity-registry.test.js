'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const {
  listEquipmentIdentities,
  resolveEquipmentIdentity,
  knowledgeLoaderRowsFromIdentities
} = require('../src/equipment-identity-registry');

const core = createKnowledgeCore({ approvedOnly: false });

test('装备身份注册表覆盖守护、同伴、载具与模块化装备', () => {
  const identities = listEquipmentIdentities({
    companionAliases: { 'Smeeta Kavat': ['笑猫'] },
    companionMainlandNames: { 'Smeeta Kavat': '笑面型库娃' },
    officialItems: core.officialItems?.items || []
  });
  assert.ok(identities.length >= 80, `expected broad equipment coverage, got ${identities.length}`);
  const nautilus = identities.find(item => item.canonical === 'Nautilus');
  assert.equal(nautilus?.displayName, '鹦鹉螺');
  assert.ok(nautilus?.aliases.includes('鹦鹉螺'));
  assert.ok(nautilus?.domains.includes('acquisition'));
  assert.ok(nautilus?.domains.includes('market'));
  const smeeta = identities.find(item => item.canonical === 'Smeeta Kavat');
  assert.equal(smeeta?.displayName, '笑面型库娃');
  assert.ok(smeeta?.aliases.includes('笑猫'));
  const rail = identities.find(item => item.canonical === 'Railjack');
  assert.equal(rail?.displayName, '航道星舰');
  assert.ok(rail?.aliases.includes('深控'));
  const kDrive = identities.find(item => item.canonical === 'K-Drive');
  assert.ok(kDrive?.aliases.includes('滑板'));
});

test('共享解析器可识别守护/载具/模块化装备', () => {
  const matrix = [
    ['鹦鹉螺', 'Nautilus', 'companion'],
    ['赫利俄斯', 'Helios', 'companion'],
    ['笑猫', 'Smeeta Kavat', 'companion'],
    ['滑板', 'K-Drive', 'equipment'],
    ['增幅器', 'Amp', 'equipment'],
    ['虚空锐将', 'Voidrig', 'vehicle'],
    ['深控', 'Railjack', 'vehicle'],
    ['伺航', 'Skaut', 'vehicle']
  ];
  for (const [query, canonical, category] of matrix) {
    const resolved = core.resolveItem(query);
    assert.ok(resolved, query);
    assert.equal(resolved.item?.canonical || resolved.item?.subject?.canonical, canonical, query);
    if (category === 'companion') assert.equal(resolved.kind, 'companion', query);
    else if (category === 'vehicle') assert.equal(resolved.kind, 'vehicle', query);
    else assert.equal(resolved.kind, 'equipment', query);
  }
  assert.equal(core.resolveName('鹦鹉螺')?.canonical, 'Nautilus');
});

test('knowledge-loader 行包含 acquisition 域', () => {
  const rows = knowledgeLoaderRowsFromIdentities(listEquipmentIdentities({
    companionAliases: { 'Smeeta Kavat': ['笑猫'] },
    companionMainlandNames: { 'Smeeta Kavat': '笑面型库娃' },
    officialItems: core.officialItems?.items || []
  }));
  const nautilusRows = rows.filter(row => row.canonical === 'Nautilus');
  assert.ok(nautilusRows.some(row => row.domain === 'acquisition'));
  assert.ok(nautilusRows.some(row => row.domain === 'market'));
  assert.ok(resolveEquipmentIdentity('鹦鹉螺', { identities: listEquipmentIdentities({ officialItems: core.officialItems?.items || [] }) })?.canonical === 'Nautilus');
});
