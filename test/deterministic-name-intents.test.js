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

// 回归：DE ExportWeapons 缓存会滞后于新内容发布。武器目录没有和
// official-items 一样的 supplemental 通道时，新发布的 Prime 武器会永久
// 解析不到 Prime 变体（市场侧只会回「没有 Prime 版本」）。
test('官方导出滞后的新 Prime 武器经 supplemental 身份仍可解析', () => {
  const cases = [
    ['闪劫', 'Corufell', 'Corufell Prime', '闪劫 Prime', '/Lotus/Weapons/Tenno/Archwing/Melee/PrimeCorufell/PrimeCorufellScytheWeapon'],
    ['石晶之花', 'Steflos', 'Steflos Prime', '石晶之花 Prime', '/Lotus/Weapons/Tenno/LongGuns/PrimeSteflos/PrimeSteflosShotgun']
  ];
  for (const [query, baseCanonical, primeCanonical, displayName, uniqueName] of cases) {
    const family = core.resolvePrimeVariantIntent(query);
    assert.ok(family, `${query} 未解析出武器家族`);
    assert.equal(family.identity.canonical, baseCanonical, query);
    assert.ok(family.prime, `${query} 缺少 Prime 变体`);
    assert.equal(family.prime.canonical, primeCanonical, query);

    const resolved = core.resolveName(`${query} Prime`, { minScore: 70, minLead: 8 });
    assert.equal(resolved.canonical, primeCanonical, query);
    assert.equal(resolved.ambiguous, undefined, query);

    const byUniqueName = core.officialWeapons.weapons.filter(weapon => weapon.uniqueName === uniqueName);
    assert.equal(byUniqueName.length, 1, uniqueName);
    assert.equal(byUniqueName[0].canonical, primeCanonical, uniqueName);
    assert.equal(byUniqueName[0].displayName, displayName, uniqueName);
    assert.doesNotMatch(uniqueName, /Types\/Recipes\/Weapons/i);
  }
});

test('supplemental 武器身份按 uniqueName 去重且计数可见', () => {
  const seen = new Set();
  for (const weapon of core.officialWeapons.weapons) {
    assert.equal(seen.has(weapon.uniqueName), false, weapon.uniqueName);
    seen.add(weapon.uniqueName);
  }
  assert.equal(seen.size, core.officialWeapons.weapons.length);
  assert.ok(core.officialWeapons.counts.supplemental >= 2, 'supplement 计数丢失');
});

test('统一官方术语词片候选覆盖赋能英文词与市场 slug', () => {
  for (const query of ['molt', 'augment', 'molt_augmented']) {
    const result = core.searchOfficialTermNameFragments(query);
    const molt = result.find(item => item.canonical === 'Molt Augmented');
    assert.ok(molt, query);
    assert.equal(molt.displayName, '蜕化·升腾', query);
    assert.equal(molt.category, 'arcane', query);
    assert.equal(molt.uniqueName, '/Lotus/Upgrades/CosmeticEnhancers/Offensive/PowerStrengthOnKill', query);
  }
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
