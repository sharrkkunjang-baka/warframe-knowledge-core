'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('..');
const { PROTECTED_DIRECTORIES, structuredAcquisition } = require('../scripts/sync-arcanes');

const core = createKnowledgeCore({ approvedOnly: false });

test('sync protects the authoritative arcane method directory', () => {
  assert.ok(PROTECTED_DIRECTORIES.includes('method'));
  assert.ok(core.arcaneMethods.some(method => method.id === 'arcane.method.authoritative'));
});

test('Arcane Energize exposes display DTO and rank-5 copy count', () => {
  const result = core.getAcquisition('赋能·充沛');
  assert.match(result.description, /战甲赋能/);
  assert.match(result.description, /满级共需 21 个/);
  assert.equal(result.arcane.maxRank, 5);
  assert.equal(result.arcane.requiredCopies, 21);
  assert.ok(result.structuredMethods.length > 0);
  assert.ok(Array.isArray(result.wikiEvidence));
});

test('Primary Merciless merges official methods before Wiki evidence', () => {
  const result = core.getAcquisition('主要·无情');
  assert.equal(result.categories[0].id, 'primary');
  assert.equal(result.structuredMethods[0].provenance.source, 'warframe-items');
  assert.ok(result.wikiEvidence.length > 0);
});

test('Shotgun Vendetta accepts the common full category alias', () => {
  const result = core.getAcquisition('霰弹枪·仇杀');
  assert.equal(result.entry.subject.displayName, '霰弹·仇杀');
  assert.equal(result.categories[0].displayName, '霰弹枪赋能');
  assert.ok(result.structuredMethods.length > 0);
});

test('syndicate chance=1 is represented as exchange, never a 100% drop', () => {
  const [method] = structuredAcquisition({
    uniqueName: '/Test/Arcane',
    drops: [{ location: 'The Holdfasts (Rank 5)', chance: 1, rarity: 'Common' }]
  });
  assert.equal(method.type, 'vendor-or-syndicate-exchange');
  assert.equal(method.availability, 'guaranteed-when-requirements-met');
  assert.equal(method.chancePercent, undefined);
  assert.match(method.provenance.note, /不是 100% 随机掉落/);
});

test('legacy arcanes are explicitly unavailable and review-required', () => {
  const result = core.getAcquisition('赋能·求生');
  assert.equal(result.arcane.availability, 'unavailable-review-required');
  assert.match(result.description, /不可获取/);
  assert.match(result.description, /等待人工审核/);
});

test('rank copy rule is cumulative for rank 3', () => {
  const definition = core.arcaneMethods.find(method => method.category === 'authoritative');
  assert.equal(definition.rankCopyRule.examples['3'], 10);
});

test('赋能狂怒排除 Codex 隐藏旧对象并显示官方中文满级效果', () => {
  const result = core.getAcquisition('赋能·狂怒');
  assert.match(result.entry.officialUniqueName, /GolemArcaneMeleeDamageOnCrit$/);
  assert.match(result.description, /类型：战甲赋能/);
  assert.match(result.description, /满级效果/);
  assert.match(result.description, /60% 几率在近战武器上附加 \+180% 近战伤害/);
  assert.doesNotMatch(result.description, /Pistols|On Critical Hit|Melee Damage/);
});

test('全部发布赋能都有官方中文满级效果和实体化来源', () => {
  for (const entry of core.arcanes) {
    const result = core.getAcquisition(entry.officialUniqueName);
    assert.ok(result, entry.officialUniqueName);
    assert.match(result.description, /类型：/);
    assert.match(result.description, /满级效果：/);
    if (result.arcane.availability === 'available') {
      assert.ok(result.structuredMethods.length > 0, entry.subject.canonical);
      assert.ok(result.structuredMethods.every(method => method.type === 'crafting' || (method.sourceEntityId && method.sourceDisplayName)), entry.subject.canonical);
    }
  }
});

test('双衍王境和夜灵来源使用注册变量显示', () => {
  const result = core.getAcquisition('赋能·狂怒');
  assert.ok(result.structuredMethods.some(method => /普通无尽回廊第 1 阶段奖励/.test(method.sourceDisplayName)));
  assert.ok(result.structuredMethods.some(method => /夜灵水力使/.test(method.sourceDisplayName)));
  assert.doesNotMatch(result.structuredMethods.map(method => method.sourceDisplayName).join('\n'), /Duviri|Eidolon Hydrolyst/);
});
