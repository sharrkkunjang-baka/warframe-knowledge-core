'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');

const core = createKnowledgeCore();

test('执法者 Prime 意图以官方 identity family 返回圣洁变体', () => {
  const result = core.resolvePrimeVariantIntent('执法者');
  assert.equal(result.identity.canonical, 'Magistar');
  assert.equal(result.prime, null);
  assert.deepEqual(result.alternatives.map(item => item.displayName), ['圣洁·执法者']);
});

test('正式 Prime 名不会重复套 Prime，普通武器能定位已发布 Prime', () => {
  const prime = core.resolvePrimeVariantIntent('Bo Prime');
  assert.equal(prime.identity.variantKind, 'prime');
  assert.equal(prime.prime.canonical, 'Bo Prime');
  const base = core.resolvePrimeVariantIntent('玻之武杖');
  assert.equal(base.prime.canonical, 'Bo Prime');
});

test('全量官方武器 family 成员 identity 唯一且组件不混入', () => {
  const seen = new Set();
  for (const weapon of core.officialWeapons.weapons) {
    const family = core.getWeaponVariantFamily(weapon.uniqueName);
    assert.ok(family && family.members.length >= 1, weapon.canonical);
    assert.ok(family.members.some(member => member.uniqueName === weapon.uniqueName), weapon.canonical);
    assert.equal(seen.has(weapon.uniqueName), false, weapon.uniqueName);
    seen.add(weapon.uniqueName);
    assert.doesNotMatch(weapon.uniqueName, /Types\/Recipes\/Weapons/i);
  }
  assert.equal(seen.size, core.officialWeapons.weapons.length);
});

test('1442 Mod 目录词片检索稳定、去重且使用官方简中', () => {
  assert.equal(core.officialCatalog.mods.length, 1442);
  const rime = core.searchOfficialModNameFragments('rime');
  assert.deepEqual(rime.map(item => `${item.displayName} — ${item.canonical}`), [
    '白霜弹头 — Rime Rounds',
    '盖霜跳马 — Rime Vault'
  ]);
  assert.deepEqual(core.searchOfficialModNameFragments('RIME').map(item => item.uniqueName), rime.map(item => item.uniqueName));
  assert.deepEqual(core.searchOfficialModNameFragments('reinforced').map(item => `${item.displayName} — ${item.canonical}`), ['强固连结 — Reinforced Bond']);
  assert.ok(core.searchOfficialModNameFragments('白霜').some(item => item.canonical === 'Rime Rounds'));
  assert.deepEqual(core.searchOfficialModNameFragments('绝对不存在的词片'), []);
  assert.equal(new Set(rime.map(item => item.uniqueName)).size, rime.length);
});
