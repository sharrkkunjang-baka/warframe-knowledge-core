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
      assert.ok(result.structuredMethods.every(method => method.type === 'crafting' || (method.sourceEntityId && method.sourceDisplayName) || (method.locationId && method.locationDisplayName && method.missionTypeId && method.missionTypeDisplayName)), entry.subject.canonical);
      assert.ok(result.structuredMethods.every(method => method.requirements && Array.isArray(method.requirementLines)), `${entry.subject.canonical} 缺少方法级统一 requirements`);
    }
  }
});

test('官方包延迟时从 Wiki 官方分类补齐全部赋能且过滤都有理由', () => {
  const sculptor = core.getAcquisition('Arcane Sculptor');
  assert.equal(core.arcanes.length, 169);
  assert.equal(sculptor.entry.arcaneAcquisition.generated.identity.localizationStatus, 'official-zh');
  assert.equal(sculptor.entry.arcaneAcquisition.generated.stats.localizationStatus, 'official-zh');
  assert.match(sculptor.description, /类型：战甲赋能/);
  assert.match(sculptor.description, /通过技能创造物体时/);
  assert.ok(sculptor.structuredMethods.some(method => /天王星比邻星域任务完成奖励/.test(method.sourceDisplayName)));
  assert.ok(sculptor.structuredMethods.some(method => /边界之塔/.test(method.sourceDisplayName)));
  assert.doesNotMatch(sculptor.description, /Ability Efficiency/);
});

test('工匠使文物赋能具有独立类型和结构化来源', () => {
  const result = core.getAcquisition('Zid-An Asheir');
  assert.match(result.description, /类型：工匠使文物赋能/);
  assert.ok(result.structuredMethods.some(method => /玛丽的轮换商店/.test(method.sourceDisplayName)));
});

test('赋能坚定与战甲共用 requirements 协议显示双水晶兑换', () => {
  const result = core.getAcquisition('赋能·坚定');
  const exchange = result.structuredMethods.find(method => method.requirements.type === 'currency');
  assert.ok(exchange);
  assert.deepEqual(exchange.requirements.currency, [
    { currencyId: 'currency.belric-crystal-fragment', amount: 60 },
    { currencyId: 'currency.rania-crystal-fragment', amount: 60 }
  ]);
  const text = exchange.requirementLines.join('\n');
  assert.match(text, /殁世幽都/);
  assert.match(text, /贝里克水晶碎片/);
  assert.match(text, /拉尼娅水晶碎片/);
  assert.match(text, /资源数量加成无效/);
});

test('充沛使用官方奥影任务类型，不把第三方 Erato Skirmish 字符串当来源', () => {
  const result = core.getAcquisition('赋能·充沛');
  const sources = result.structuredMethods.map(method => `${method.locationDisplayName || ''}${method.missionTypeDisplayName || ''}${method.sourceDisplayName || ''}`).join('\n');
  assert.match(sources, /面纱比邻星域奥影/);
  assert.match(sources, /夜灵水力使/);
  assert.doesNotMatch(sources, /Erato|Skirmish|前哨战|前哨站/);
  assert.ok(result.structuredMethods.some(method => method.missionTypeId === 'mission-type.orphix' && method.rotation === 'C' && method.chancePercent === 1.41));
});

test('游戏格式标记通过统一文本层渲染，不泄漏 DT 原文本', () => {
  const result = core.getAcquisition('联结·电压');
  assert.match(result.description, /⚡电击异常状态/);
  assert.doesNotMatch(result.description, /DT_[A-Z_]+/);
});

test('双衍王境和夜灵来源使用注册变量显示', () => {
  const result = core.getAcquisition('赋能·狂怒');
  assert.ok(result.structuredMethods.some(method => /普通无尽回廊第 1 阶段奖励/.test(method.sourceDisplayName)));
  assert.ok(result.structuredMethods.some(method => /夜灵水力使/.test(method.sourceDisplayName)));
  assert.doesNotMatch(result.structuredMethods.map(method => method.sourceDisplayName).join('\n'), /Duviri|Eidolon Hydrolyst/);
});
