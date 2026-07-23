'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const core = createKnowledgeCore({ approvedOnly: false });

test('集团卡支持前后置、空格与事实兼容限制', () => {
  for (const query of ['伯斯顿集团卡', '集团卡伯斯顿', '集团卡 伯斯顿 Prime']) {
    const result = core.queryModRelations(query);
    assert.equal(result.status, 'ok', query);
    assert.deepEqual(result.mods.map(x => x.displayName), ['镀金真相']);
  }
  assert.equal(core.queryModRelations('伯斯顿 Prime 集团卡').mods[0].canonical, 'Gilded Truth');
  assert.equal(core.queryModRelations('Braton Prime集团卡').text, '这把武器没有集团·强化 Mod。');
});

test('点播卡支持战甲、武器、英文与审核黑话', () => {
  const cases = [
    ['视使之触电波卡', 'weapon', 'Sentient 涌现'],
    ['电波卡逐电', 'weapon', null],
    ['nyx电波卡', 'frame', '奇异点'],
    ['咖喱电波卡', 'frame', '净化斩']
  ];
  for (const [query, type, name] of cases) {
    const result = core.queryModRelations(query);
    assert.equal(result.type, type, query);
    if (name) assert.ok(result.mods.some(x => x.displayName === name), query);
    else assert.equal(result.text, '这把武器没有点播卡。');
  }
  assert.equal(core.queryModRelations('点播卡 Nyx').mods[0].specialProgram, 'cred-offerings');
});

test('关系命令帮助、错误名称与无结果分类均确定性', () => {
  assert.match(core.queryModRelations('集团卡 帮助').text, /武器名集团卡/);
  assert.match(core.queryModRelations('电波卡帮助').text, /实体名电波卡/);
  assert.equal(core.queryModRelations('不存在的名字电波卡').status, 'not-found');
  assert.equal(core.queryModRelations('Wisp电波卡').text, '这个战甲没有点播卡。');
});

test('裸关键词无实体查询词不构成关系命令，交回常规处理', () => {
  for (const bare of ['集团卡', '电波卡', '点播卡', '集团·强化 Mod', '集团·强化Mod']) {
    assert.equal(core.parseModRelationCommand(bare), null, bare);
    assert.equal(core.queryModRelations(bare), null, bare);
  }
  // 显式帮助与真实实体查询不受影响
  assert.match(core.queryModRelations('集团卡 帮助').text, /武器名集团卡/);
  assert.equal(core.queryModRelations('伯斯顿集团卡').status, 'ok');
});

test('生成索引全量质量门', () => {
  const relations = core.modRelations;
  assert.equal(relations.counts.syndicate.mods, relations.syndicateWeaponAugments.length);
  assert.equal(relations.counts.nightwave.mods, relations.nightwaveTargetMods.length);
  const ids = new Set();
  for (const row of [...relations.syndicateWeaponAugments, ...relations.nightwaveTargetMods]) {
    assert.ok(row.stableId && row.canonical && row.displayName && row.target?.stableId && row.target?.canonical);
    assert.ok(row.wikiUrl?.startsWith('https://wiki.warframe.com/'));
    assert.equal(row.reviewStatus, 'approved');
    assert.ok(!ids.has(`${row.distribution}:${row.stableId}`));
    ids.add(`${row.distribution}:${row.stableId}`);
    if (row.target.type === 'weapon') assert.ok(core.resolveOfficialWeaponIdentity(row.target.canonical));
    else assert.ok(core.resolveName(row.target.canonical, { categories: ['frame'] }));
    if (row.distribution === 'nightwave') assert.ok(row.sourceEvidence?.excerpts?.some(x => /Nightwave/i.test(x)));
  }
});

test('全部集团武器强化 Mod 通过二级实体关系注入六种触发效果', () => {
  const relations = core.modRelations;
  const catalog = relations.syndicateProcEffects;
  const expected = new Set(['Truth', 'Justice', 'Purity', 'Blight', 'Entropy', 'Sequence']);
  assert.deepEqual(new Set(catalog.effects.map(effect => effect.canonical)), expected);
  assert.equal(relations.counts.syndicate.procEntities, 6);
  assert.equal(relations.counts.syndicate.procRelations, relations.syndicateWeaponAugments.length);
  const procIds = new Set(catalog.effects.map(effect => effect.id));
  for (const row of relations.syndicateWeaponAugments) {
    assert.equal(row.relationRefs.length, 1, row.canonical);
    assert.equal(row.relationRefs[0].type, 'triggers-syndicate-proc');
    assert.ok(procIds.has(row.relationRefs[0].targetId), row.canonical);
  }
});

test('镀金真相机制问句注入 Truth 证据且普通真相不误判', () => {
  const context = core.buildWikiContext('镀金真相词条中的真相是做什么的');
  assert.equal(context.resolution.canonical, 'Gilded Truth');
  assert.match(context.text, /syndicate-proc\.truth/);
  assert.match(context.text, /25 米范围/);
  assert.match(context.text, /1000 点毒气伤害/);
  assert.match(context.text, /恢复 25% 生命值/);
  assert.match(context.text, /跑酷速度 \+25%/);
  assert.match(context.text, /revision 2777323/);
  const ordinary = core.buildWikiContext('真相是做什么的');
  assert.ok(!ordinary || !/syndicate-proc\.truth/.test(ordinary.text));
});
