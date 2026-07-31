'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const { WEAPON_FAMILIES, FACTIONS, SUFFIXES } = require('../src/faction-damage-mod-slang');

const core = createKnowledgeCore({ approvedOnly: false });

test('官方目录动态构建 4 武器家族 × 4 派系 Prime/Expert 关系', () => {
  assert.deepEqual(core.factionDamageModSlang.counts, { resolved: 16, missing: 0, ambiguous: 0 });
  assert.equal(core.factionDamageModSlang.relations.length, 16);
  for (const relation of core.factionDamageModSlang.relations) {
    assert.equal(relation.variant, 'prime');
    assert.equal(relation.source, 'automatic-official-catalog');
    assert.match(relation.canonical, /^Primed /);
    assert.match(relation.uniqueName, /\/Expert\//);
    assert.doesNotMatch(relation.uniqueName, /\/(?:Beginner|Flawed)\//i);
  }
});

test('六类别词 × 四派系 × 三后缀共 72 组合默认命中 Prime', () => {
  for (const family of WEAPON_FAMILIES) for (const category of family.aliases) for (const [code, faction] of Object.entries(FACTIONS)) for (const suffix of SUFFIXES) {
    for (const query of [`${category}${code}${suffix}`, `${category} ${code} ${suffix}`]) {
      const result = core.resolveFactionDamageModSlang(query);
      assert.equal(result.status, 'resolved', query);
      assert.equal(result.relation.variant, 'prime', query);
      assert.equal(result.relation.faction, faction.canonical, query);
      assert.equal(result.relation.categoryId, family.id, query);
      assert.equal(core.resolveItem(query)?.item?.canonical, result.relation.canonical, query);
    }
  }
});

test('Orokin 展示保持官方语义且稳定身份对齐 Corrupted', () => {
  const result = core.resolveFactionDamageModSlang('副手o骑士');
  assert.equal(result.relation.canonical, 'Primed Expel Orokin');
  assert.equal(result.relation.displayName, '驱逐 Orokin Prime');
  assert.match(result.relation.uniqueName, /CorruptedExpert$/);
});

test('wk/查/刷前缀复用 resolveItem，正式名仍由共享解析器处理', () => {
  const cases = [
    ['wk近战g骑士', 'Primed Smite Grineer'],
    ['刷 步枪c歧视', 'Primed Bane Of Corpus'],
    ['查霰弹i骑', 'Primed Cleanse Infested']
  ];
  for (const [query, canonical] of cases) {
    const resolved = core.resolveItem(query);
    assert.equal(resolved?.kind, 'mod', query);
    assert.equal(resolved?.item?.canonical, canonical, query);
    assert.equal(resolved?.factionDamageModSlang?.relation?.canonical, canonical, query);
  }
  assert.equal(core.resolveItem('Primed Smite Grineer')?.item?.canonical, 'Primed Smite Grineer');
  assert.equal(core.resolveName('Primed Smite Grineer')?.canonical, 'Primed Smite Grineer');
});

test('缺类别、未知字母/类别/后缀和额外普通词均拒绝且不误配 Flawed', () => {
  for (const query of ['骑', 'g骑士', '战甲g骑士', '近战n骑士', '近战g普通词']) {
    assert.equal(core.resolveFactionDamageModSlang(query).status, 'missing', query);
    assert.equal(core.resolveItem(query), null, query);
  }
  const grineer = core.resolveFactionDamageModSlang('近战g骑士').relation;
  assert.equal(grineer.canonical, 'Primed Smite Grineer');
  assert.match(grineer.uniqueName, /\/Expert\//);
  assert.doesNotMatch(grineer.uniqueName, /Beginner|Flawed/i);
});
