'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');

const core = createKnowledgeCore();
const reviewCore = createKnowledgeCore({ approvedOnly: false });

test('精确社区别名统一解析', () => {
  assert.equal(core.resolveName('蛆爹').canonical, 'Nidus');
  assert.equal(core.resolveName('花甲').canonical, 'Wisp');
  assert.equal(core.resolveName('吉他哥').canonical, 'Temple');
});

test('加权拼音支持缺失中间音节', () => {
  assert.equal(core.resolveName('心智狭').canonical, 'Narrow Minded');
  assert.equal(core.resolveName('乐音').canonical, 'Euphona Prime');
});

test('知识检索区分事实与加工知识', () => {
  assert.equal(core.searchFacts('增幅器')[0].id, 'fact.amp.numbering');
  assert.equal(core.searchKnowledge('九重天')[0].id, 'knowledge.railjack.outpost-carry');
});

test('术语归一化复用单一表', () => {
  assert.equal(core.normalizeTerms('法穆里安与夜幕安神香'), '巨人战舰与夜幕药剂');
});

test('上下文包含来源和加工知识', () => {
  const context = core.buildWikiContext('增幅器');
  assert.match(context.text, /Warframe Wiki/);
  assert.match(context.text, /编号是部件解锁顺序/);
});

test('同一解析器接受调用方动态官方候选', () => {
  const candidates = [
    { alias: '恶毒弹匣', canonical: 'Primed Venomous Clip', category: 'official', priority: 3 },
    { alias: '恶毒偏折', canonical: 'Venomous Clip', category: 'official', priority: 1 }
  ];
  assert.equal(core.resolveName('恶毒弹匣', { candidates }).canonical, 'Primed Venomous Clip');
  assert.equal(core.resolveName('恶毒弹', { candidates }).canonical, 'Primed Venomous Clip');
});

test('统一解析器支持类别过滤与共享黑话', () => {
  assert.equal(core.resolveName('电妹', { categories: ['frame'] }).canonical, 'Gyre');
  assert.equal(core.resolveName('金首发', { categories: ['term'] }).canonical, 'Primed Chamber');
  assert.equal(core.resolveName('玻棍', { categories: ['term'] }).canonical, 'Bo Prime Set');
});

test('近分候选返回统一歧义结构', () => {
  const candidates = [
    { alias: '成长之力', canonical: 'Growing Power', category: 'official' },
    { alias: '成长纹章', canonical: 'Growth Badge', category: 'official' }
  ];
  const result = core.resolveName('成长', { candidates, minLead: 5 });
  assert.ok(result.ambiguous);
  assert.deepEqual(result.ambiguous.map(item => item.canonical), ['Growing Power', 'Growth Badge']);
});

test('刷取模块只响应明确命令句式', () => {
  assert.deepEqual(reviewCore.parseAcquisitionCommand('/刷'), { intent: 'acquisition', query: '' });
  assert.deepEqual(reviewCore.parseAcquisitionCommand('/刷 电妹'), { intent: 'acquisition', query: '电妹' });
  assert.deepEqual(reviewCore.parseAcquisitionCommand('刷 氩结晶'), { intent: 'acquisition', query: '氩结晶' });
  assert.deepEqual(reviewCore.parseAcquisitionCommand('怎么刷心智狭'), { intent: 'acquisition', query: '心智狭' });
  assert.deepEqual(reviewCore.parseAcquisitionCommand('怎么刷 电妹'), { intent: 'acquisition', query: '电妹' });
  assert.equal(reviewCore.parseAcquisitionCommand('我想刷电妹'), null);
  assert.equal(reviewCore.parseAcquisitionCommand('哪里刷电妹'), null);
  assert.equal(reviewCore.parseAcquisitionCommand('如何刷电妹'), null);
  assert.equal(reviewCore.parseAcquisitionCommand('刷电妹'), null);
});

test('玩法模块只响应明确的斜杠命令', () => {
  assert.deepEqual(reviewCore.parseGameplayCommand('/玩法'), { intent: 'gameplay', query: '' });
  assert.deepEqual(reviewCore.parseGameplayCommand('/玩法 火卫二orikon 宝库'), { intent: 'gameplay', query: '火卫二orikon 宝库' });
  assert.equal(reviewCore.parseGameplayCommand('玩法 火卫二宝库'), null);
  assert.equal(reviewCore.parseGameplayCommand('我想玩火卫二宝库'), null);
});

test('玩法查询支持别名并返回结构化步骤', () => {
  const result = reviewCore.getGameplay('火卫二orikon 宝库');
  assert.equal(result.entry.id, 'gameplay.deimos-orokin-vault');
  assert.match(result.entry.steps[0], /龙钥蓝图/);
  const acquisitionGameplay = reviewCore.getGameplay('4k');
  assert.equal(acquisitionGameplay.entry.id, 'gameplay.deimos-orokin-vault');
  assert.equal(acquisitionGameplay.entry.acquisitionQuery, '4k');
});

test('分类别名独立解析且不进入物品名称索引', () => {
  assert.equal(reviewCore.getCategory('4kmod').canonical, 'Corrupted Mods');
  assert.equal(reviewCore.getCategory('堕落mod').id, '4kmod');
  assert.equal(reviewCore.getCategory('4k卡').id, '4kmod');
  assert.equal(reviewCore.getCategory('堕落卡').id, '4kmod');
  assert.equal(reviewCore.resolveName('4k卡'), null);
});

test('刷取查询只通过统一名称索引关联 canonical', () => {
  assert.equal(reviewCore.getAcquisition('电妹').entry.id, 'knowledge.acquisition.gyre');
  const narrow = reviewCore.getAcquisition('心智狭');
  assert.equal(narrow.entry.id, 'knowledge.acquisition.narrow-minded');
  assert.equal(narrow.entry.subject.category, 'mod');
  assert.deepEqual(narrow.entry.subject.categoryRefs, ['4kmod', 'duration4kmod', 'durationmod']);
  assert.equal(narrow.categories[0].canonical, 'Corrupted Mods');
  assert.equal(narrow.categories[0].parent, 'mod');
  assert.equal(narrow.categories[1].parent, '4kmod');
  assert.equal(narrow.categories[2].parent, 'mod');
  const taintedShell = reviewCore.getAcquisition('Tainted Shell');
  assert.deepEqual(taintedShell.entry.subject.categoryRefs, ['4kmod', 'accuracy4kmod', 'accuracymod']);
  assert.equal(taintedShell.entry.summary, undefined);
  assert.equal(taintedShell.entry.content, undefined);
  assert.equal(taintedShell.description, '污秽弹药是火卫二 Orokin 宝库的堕落 Mod（4k Mod）其一\n输入“刷 4k”可了解刷取要求/小知识');
  assert.equal(reviewCore.getCategory('精准4k卡').id, 'accuracy4kmod');
  assert.equal(reviewCore.getCategory('精准卡').id, 'accuracymod');
  assert.equal(reviewCore.getCategory('爆击4k卡').id, 'criticalchance4kmod');
  assert.equal(reviewCore.getCategory('爆率卡').id, 'criticalchancemod');
  assert.equal(reviewCore.getCategory('爆击伤害4k卡').id, 'criticaldamage4kmod');
  assert.equal(reviewCore.getCategory('爆伤卡').id, 'criticaldamagemod');
  assert.deepEqual(narrow.entry.effects.map(effect => effect.value), [99, -66]);
  assert.equal(narrow.entry.maxRank, 10);
  assert.equal(narrow.methods[0].id, 'gameplay.deimos-orokin-vault');
  const officialCandidates = [{ alias: '氩结晶', canonical: 'Argon Crystal', category: 'official' }];
  assert.equal(reviewCore.getAcquisition('氩结晶', { resolveOptions: { candidates: officialCandidates } }).entry.subject.category, 'resource');
  assert.equal(reviewCore.getAcquisition('氩晶获取'), null);
});

test('生产核心不加载尚未人工批准的刷取样本', () => {
  assert.equal(core.getAcquisition('电妹'), null);
});

test('官方 Mod 快照包含完整且唯一的 1733 条记录', () => {
  assert.equal(core.officialCatalog.mods.length, 1733);
  assert.equal(new Set(core.officialCatalog.mods.map(mod => mod.uniqueName)).size, 1733);
  assert.equal(core.officialCatalog.source.version, '1.1269.87');
  assert.equal(core.categories.some(category => category.schemaVersion === 1), false);
});

test('官方 Mod 接口支持英文名、官方中文名和分类查询', () => {
  const narrow = core.getOfficialMod('Narrow Minded');
  assert.equal(narrow.displayName, '心志偏狭');
  assert.equal(core.getOfficialMod('心志偏狭').uniqueName, narrow.uniqueName);
  assert.equal(core.searchOfficialMods('心志')[0].canonical, 'Narrow Minded');
  assert.ok(core.listOfficialCategories({ dimension: 'type' }).length > 0);
  assert.ok(core.listMissingOfficialCategories().length > 0);
});

test('4k Mod 与本地分类和刷取条目建立覆盖关联', () => {
  const corrupted = core.listOfficialCategories().find(category => category.id === 'trait.corrupted');
  assert.deepEqual(corrupted.localCategoryIds, ['4kmod']);
  assert.equal(corrupted.count, 24);
  assert.equal(corrupted.status, 'covered');
  const narrow = core.getOfficialMod('Narrow Minded');
  assert.deepEqual(narrow.localEntryIds, ['knowledge.acquisition.narrow-minded']);
  assert.equal(narrow.status, 'covered');
  assert.equal(core.listMissingOfficialMods({ categoryId: 'trait.corrupted' }).some(mod => mod.uniqueName === narrow.uniqueName), false);
});

test('官方目录加载为只读对象', () => {
  assert.equal(Object.isFrozen(core.officialCatalog), true);
  assert.equal(Object.isFrozen(core.officialCatalog.mods), true);
  assert.equal(Object.isFrozen(core.getOfficialMod('Narrow Minded')), true);
});
