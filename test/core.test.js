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

test('获取类知识进入 Wiki 上下文时使用效果与获取描述且禁止 undefined', () => {
  const context = reviewCore.buildWikiContext('库狛蛋是否享受资源数量加成和富足寻回者');
  assert.match(context.text, /【富足寻回者】/);
  assert.match(context.text, /18% 几率使资源拾取数量翻倍/);
  assert.doesNotMatch(context.text, /undefined|null/);
  const entry = context.knowledge.find(item => item.title === '富足寻回者');
  assert.ok(entry.contextBody);
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

test('战甲官方实体完整名区分本体与 Prime', () => {
  for (const query of ['Nidus', 'nidus', 'NIDUS']) {
    const result = reviewCore.resolveName(query, { categories: ['frame'] });
    assert.equal(result.canonical, 'Nidus', query);
    assert.equal(result.category, 'frame', query);
    assert.equal(result.match, 'exact', query);
  }
  const prime = reviewCore.resolveName('Nidus Prime', { categories: ['frame'] });
  assert.equal(prime.canonical, 'Nidus Prime');
  assert.equal(prime.category, 'frame');
  assert.equal(prime.match, 'exact');
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

test('精确 Prime 战甲获取不会降级为普通战甲', () => {
  for (const query of ['Wukong Prime', 'wukong prime']) {
    const result = reviewCore.getAcquisition(query);
    assert.equal(result.entry.subject.canonical, 'Wukong Prime', query);
    assert.equal(result.entry.subject.categoryRefs[0], 'frame-prime-relic', query);
    assert.equal(result.frameRoute, null, query);
  }
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

test('玩法模块响应有无斜杠的明确命令', () => {
  assert.deepEqual(reviewCore.parseGameplayCommand('/玩法'), { intent: 'gameplay', query: '' });
  assert.deepEqual(reviewCore.parseGameplayCommand('/玩法 火卫二orikon 宝库'), { intent: 'gameplay', query: '火卫二orikon 宝库' });
  assert.deepEqual(reviewCore.parseGameplayCommand('玩法 火卫二宝库'), { intent: 'gameplay', query: '火卫二宝库' });
  assert.equal(reviewCore.parseGameplayCommand('我想玩火卫二宝库'), null);
});

test('分类模块只响应明确命令句式', () => {
  assert.deepEqual(core.parseCategoryCommand('/分类'), { intent: 'category', query: '' });
  assert.deepEqual(core.parseCategoryCommand('/分类 4k卡'), { intent: 'category', query: '4k卡' });
  assert.deepEqual(core.parseCategoryCommand('分类 4k卡'), { intent: 'category', query: '4k卡' });
  assert.equal(core.parseCategoryCommand('分类4k卡'), null);
  assert.equal(core.parseCategoryCommand('这是什么分类 4k卡'), null);
});

test('玩法查询支持别名并返回结构化步骤', () => {
  const result = reviewCore.getGameplay('火卫二orikon 宝库');
  assert.equal(result.entry.id, 'gameplay.deimos-orokin-vault');
  assert.match(result.entry.steps[0], /龙钥蓝图/);
  const acquisitionGameplay = reviewCore.getGameplay('4k');
  assert.equal(acquisitionGameplay.entry.id, 'gameplay.deimos-orokin-vault');
  assert.equal(acquisitionGameplay.entry.acquisitionQuery, '4k');
  assert.equal(reviewCore.getGameplay('heyiz').entry.id, 'gameplay.narmer-bounty');
  assert.equal(reviewCore.getGameplay('heyizhong').entry.id, 'gameplay.narmer-bounty');
  assert.equal(reviewCore.getGameplay('合一众赏金').entry.id, 'gameplay.narmer-bounty');
});

test('材料和生存别名统一进入材料车玩法', () => {
  for (const query of ['材料', '材料车', '生存', '生存材料车']) {
    assert.equal(reviewCore.getGameplay(query)?.entry?.id, 'gameplay.material-farming', query);
  }
});

test('圣殿突袭玩法统一普通与精英模式并说明轮次和主要奖励', () => {
  for (const query of ['圣殿突袭', '普通圣殿', '精英圣殿', 'ESO', 'Sanctuary Onslaught']) {
    const result = reviewCore.getGameplay(query);
    assert.equal(result?.entry?.id, 'gameplay.sanctuary-onslaught', query);
    assert.match(result.entry.steps.join('\n'), /第2\/10\/18区为A轮.*第8\/16\/24区为C轮/);
    assert.match(result.entry.notes.join('\n'), /Khora.*普通圣殿突袭 A、B、C轮/);
    assert.match(result.entry.notes.join('\n'), /布莱顿·破坏者和拉托·破坏者.*精英圣殿突袭 A、B、C轮/);
  }
});

test('统一获取卡片按来源分区并使用审核变种家族', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const growingPower = core.getAcquisitionCard('成长之力');
  assert.deepEqual(growingPower.sections.enemy, ['- 无赖魅影']);
  assert.deepEqual(growingPower.detailOptions, [{ id: 'gameplay.silver-grove-specters', title: '药剂', query: '药剂' }]);
  const flameGland = core.getAcquisitionCard('火焰腺体');
  assert.deepEqual(flameGland.sections.enemy, ['- 炉渣翻打鬣狗', '- 回旋鬣狗', '- 冰沼鬣狗', '- 奥布山谷航天站内的敌人', '- 烈背鬣狗']);
  const galvanized = core.getAcquisitionCard('镀层斩铁');
  assert.equal(galvanized.kind, 'mod');
  assert.deepEqual(galvanized.sections.enemy, []);
  assert.match(galvanized.sections.exchange.join('\n'), /20个生息精华/);
  assert.deepEqual(galvanized.variants.map(item => item.displayName), ['斩铁', '残缺 斩铁', '镀层 斩铁']);
  const trueSteel = core.getAcquisitionCard('斩铁');
  assert.ok(trueSteel.sections.enemy.length >= 2);
  assert.match(trueSteel.sections.enemy.join('\n'), /^\- 轰击者/m);
  assert.ok(trueSteel.sections.enemy.every(line => /^\- [^、]+$/.test(line)), '敌人必须逐条显示，不得用顿号拼接');
  assert.equal(new Set(trueSteel.sections.enemy).size, trueSteel.sections.enemy.length);
  const pressure = core.getAcquisitionCard('压迫点 Prime');
  assert.deepEqual(pressure.variants.map(item => item.displayName), ['压迫点', '残缺 压迫点', '压迫点 Prime']);
  assert.match(pressure.sections.exchange.join('\n'), /虚空商人|Baro/);
  const energize = core.getAcquisitionCard('赋能·充沛');
  assert.equal(energize.kind, 'arcane');
  assert.deepEqual(energize.variants, []);
  assert.match(energize.sections.enemy.join('\n'), /夜灵水力使/);
  assert.ok(energize.sections.other.length > 0);
  const braton = core.getAcquisitionCard('布莱顿·破坏者');
  assert.deepEqual(braton.variants.map(item => item.displayName), ['布莱顿', 'MK1-布莱顿', '布莱顿 Prime', '布莱顿·破坏者']);
  assert.equal(braton.materials.length, 3);
  const magnumForce = core.getAcquisitionCard('重装火力');
  assert.deepEqual(magnumForce.detailOptions, [{ id: 'gameplay.deimos-orokin-vault', title: '火卫二奥罗金宝库', query: '4k' }]);
  const augurAccord = core.getAcquisitionCard('预言 协约');
  assert.deepEqual(augurAccord.sections.other, ['从夜灵平野赏金奖励中获得']);
  assert.deepEqual(augurAccord.detailOptions, [{ id: 'gameplay.cetus-bounty-set-mods', title: '希图斯赏金', query: '希图斯赏金' }]);
  const pistolPestilence = core.getAcquisitionCard('瘟疫手枪');
  assert.deepEqual(pistolPestilence.detailOptions, [{ id: 'gameplay.corrupted-vor', title: '堕落的沃尔', query: '堕落的沃尔' }]);
  assert.equal(core.getGameplay('堕落的沃尔').entry.id, 'gameplay.corrupted-vor');
  const razorGyre = core.getAcquisitionCard('刀锋环流');
  assert.equal(razorGyre.identity.displayName, '刀锋迫击');
  assert.deepEqual(razorGyre.detailOptions, [{ id: 'gameplay.syndicate-offerings', title: '集团供品', query: '集团' }]);
});

test('圣殿突袭来源统一附加刷取玩法入口', () => {
  for (const query of ['Khora', '布莱顿破坏者', '拉托破坏者']) {
    const result = reviewCore.getAcquisition(query);
    assert.ok(result.sourceOptions.some(source => source.id === 'gameplay.sanctuary-onslaught' && source.query === '圣殿突袭'), query);
  }
});

test('科技细胞终幕者覆盖I玄骸、科腐者安可和终幕别名', () => {
  for (const query of ['I玄骸', 'i玄骸', 'I佬玄骸', '科腐者安可', '终幕', '终幕者', '科技细胞终幕者', 'Technocyte Coda']) {
    const result = reviewCore.getGameplay(query);
    assert.equal(result?.entry?.id, 'gameplay.technocyte-coda', query);
    assert.match(result.entry.summary, /混音带/);
    assert.match(result.entry.steps.join('\n'), /地球比邻星/);
  }
});

test('分类别名独立解析且不进入物品名称索引', () => {
  assert.equal(reviewCore.getCategory('4kmod').canonical, 'Corrupted Mods');
  assert.equal(reviewCore.getCategory('堕落mod').id, '4kmod');
  assert.equal(reviewCore.getCategory('4k卡').id, '4kmod');
  assert.equal(reviewCore.getCategory('堕落卡').id, '4kmod');
  assert.equal(reviewCore.resolveName('4k卡'), null);
  const detail = core.getCategoryDetail('4k卡');
  assert.equal(detail.category.id, '4kmod');
  assert.equal(detail.entries.length, 24);
  assert.ok(detail.entries.some(entry => entry.id === 'knowledge.acquisition.narrow-minded'));
});

test('刷取查询只通过统一名称索引关联 canonical', () => {
  assert.equal(reviewCore.getAcquisition('电妹').entry.id, 'knowledge.acquisition.warframe.gyre');
  const narrow = reviewCore.getAcquisition('心智狭');
  assert.equal(narrow.entry.id, 'knowledge.acquisition.narrow-minded');
  assert.equal(narrow.entry.subject.displayName, '心志偏狭');
  assert.match(narrow.description, /奥罗金宝库概率获得/);
  assert.doesNotMatch(narrow.description, /[ABC]轮|4\.17%|Orokin Vault/);
  assert.equal(narrow.entry.subject.category, 'mod');
  assert.deepEqual(narrow.entry.subject.categoryRefs.slice(0, 3), ['4kmod', 'duration4kmod', 'durationmod']);
  assert.ok(narrow.entry.subject.categoryRefs.includes('warframemod'));
  assert.ok(narrow.entry.subject.categoryRefs.includes('standardmod'));
  assert.equal(narrow.categories[0].canonical, 'Corrupted Mods');
  assert.equal(narrow.categories[0].parent, 'mod');
  assert.equal(narrow.categories[1].parent, '4kmod');
  assert.equal(narrow.categories[2].parent, 'mod');
  const taintedShell = reviewCore.getAcquisition('Tainted Shell');
  assert.deepEqual(taintedShell.entry.subject.categoryRefs.slice(0, 3), ['4kmod', 'accuracy4kmod', 'accuracymod']);
  assert.ok(taintedShell.entry.subject.categoryRefs.includes('shotgunmod'));
  assert.equal(taintedShell.entry.summary, undefined);
  assert.equal(taintedShell.entry.content, undefined);
  assert.match(taintedShell.description, /奥罗金宝库概率获得/);
  assert.doesNotMatch(taintedShell.description, /[ABC]轮|4\.17%|Orokin Vault/);
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

test('官方 Mod 中文名精确命中且效果技能名不替代条目身份', () => {
  const official = core.getOfficialMod('猛毒附加');
  assert.equal(official.canonical, 'Venom Dose');
  assert.equal(official.displayName, '猛毒附加');
  assert.equal(core.resolveName('猛毒附加').canonical, 'Venom Dose');
  const result = core.getAcquisition('猛毒附加');
  assert.equal(result.entry.subject.canonical, 'Venom Dose');
  assert.equal(result.entry.subject.displayName, '猛毒附加');
  assert.match(result.entry.effectDetails.join('\n'), /毒性孢子强化/);
});

test('跑酷 Mod 泛类查询聚合成员与全部来源', () => {
  const result = core.getAcquisition('跑酷mod');
  assert.equal(result.entry, null);
  assert.equal(result.collection.id, 'parkour-mods');
  const memberNames = result.entries.map(entry => entry.subject.displayName);
  assert.ok(memberNames.includes('全面驱动'));
  assert.ok(memberNames.includes('剧毒飞腾'));
  const methodIds = result.methods.map(method => method.id);
  assert.deepEqual(methodIds, [
    'gameplay.lua-halls-of-ascension',
    'gameplay.duviri-endless',
    'gameplay.uranus-caches',
    'gameplay.enemy-and-mission-drops',
    'gameplay.narmer-bounty'
  ]);
  assert.equal(new Set(methodIds).size, methodIds.length);
  assert.equal(new Set(result.sourceOptions.map(source => source.id)).size, result.sourceOptions.length);
  for (const alias of ['跑酷 Mod', '跑酷卡']) {
    assert.equal(core.getAcquisition(alias).collection.id, 'parkour-mods');
  }

  const mobilize = core.getAcquisition('全面驱动');
  assert.equal(mobilize.collection, undefined);
  assert.equal(mobilize.entry.subject.displayName, '全面驱动');
  assert.deepEqual(mobilize.methods.map(method => method.id), [
    'gameplay.duviri-endless',
    'gameplay.uranus-caches',
    'gameplay.enemy-and-mission-drops'
  ]);
});
test('默认批准的刷取知识直接进入生产核心', () => {
  assert.equal(core.getAcquisition('电妹').entry.id, 'knowledge.acquisition.warframe.gyre');
});

test('官方 Mod 快照为全部当前上游记录给出可用或排除状态', () => {
  const upstreamRecords = new (require('warframe-items'))({ category: ['Mods'], i18n: ['zh'] }).length;
  assert.equal(core.officialCatalog.counts.upstreamRecords, upstreamRecords);
  const supplementalRecords = core.officialCatalog.mods.filter(mod => String(mod.uniqueName).startsWith('language:')).length;
  assert.equal(core.officialCatalog.mods.length + core.officialCatalog.excludedMods.length, upstreamRecords + supplementalRecords);
  assert.equal(new Set([...core.officialCatalog.mods, ...core.officialCatalog.excludedMods].map(mod => mod.uniqueName)).size, upstreamRecords + supplementalRecords);
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
  assert.equal(narrow.status, 'complete');
  assert.equal(core.listMissingOfficialMods({ categoryId: 'trait.corrupted' }).some(mod => mod.uniqueName === narrow.uniqueName), false);
});

test('噩梦 Mod 完整关联分类、玩法与官方目录', () => {
  const detail = core.getCategoryDetail('噩梦卡');
  assert.equal(detail.category.id, 'nightmaremod');
  assert.equal(detail.entries.length, 19);
  const blaze = core.getAcquisition('Blaze', {
    resolveOptions: { candidates: [{ alias: 'Blaze', canonical: 'Blaze', category: 'official' }] }
  });
  assert.deepEqual(blaze.entry.effects.map(effect => effect.value), [60, 60]);
  assert.equal(blaze.methods[0].id, 'gameplay.nightmare-mode');
  assert.equal(core.getGameplay('噩梦').entry.id, 'gameplay.nightmare-mode');
  const constitution = core.getAcquisition('Constitution', {
    resolveOptions: { candidates: [{ alias: 'Constitution', canonical: 'Constitution', category: 'official' }] }
  });
  assert.equal(constitution.entry.rewardTier, 'C');
  assert.match(constitution.description, /\u5669\u68a6\u6a21\u5f0f C\u8f6e\uff08\u6982\u738715\.49%\uff09/);
  assert.deepEqual(
    Object.fromEntries(['A', 'B', 'C'].map(tier => [tier, detail.entries.filter(entry => entry.rewardTier === tier).length])),
    { A: 7, B: 6, C: 6 }
  );
  const tierB = core.getGameplay('噩梦 b');
  assert.equal(tierB.rewardTier, 'B');
  assert.deepEqual(tierB.rewardGroup.planets, ['火卫一', '谷神星', '木星', '欧罗巴', '虚空', '月球', '赤毒要塞', '火卫二', '土星']);
  assert.equal(core.getGameplay('噩梦 d'), null);
  const official = core.listOfficialCategories().find(category => category.id === 'trait.nightmare');
  assert.equal(official.count, 19);
  assert.deepEqual(official.localCategoryIds, ['nightmaremod']);
  assert.equal(official.status, 'covered');
});

test('新增 Mod 系列完整关联分类、玩法与官方目录', () => {
  assert.equal(core.getCategoryDetail('武形秘仪').entries.length, 152);
  assert.equal(core.getCategoryDetail('组合卡').entries.length, 72);
  assert.equal(core.getCategoryDetail('光环卡').entries.length, 36);
  assert.equal(core.getCategoryDetail('功能槽').entries.length, 51);
  assert.equal(core.getCategoryDetail('窜升').entries.length, 7);
  assert.equal(core.getCategoryDetail('执刑官卡').entries.length, 5);
  assert.equal(core.getCategoryDetail('怪奇').entries.length, 3);

  const pvp = core.getAcquisition('Air Martial');
  assert.equal(pvp.entry.subject.displayName, '空中武术');
  assert.equal(pvp.methods[0].id, 'gameplay.conclave-offerings');
  assert.equal(core.getGameplay('精英圣殿').entry.id, 'gameplay.sanctuary-onslaught');
  assert.equal(core.getAcquisition('Peculiar Growth').entry.rewardTier, 'B');

  const officialPvp = core.listOfficialCategories().find(category => category.id === 'trait.pvp');
  assert.equal(officialPvp.count, 152);
  assert.deepEqual(officialPvp.localCategoryIds, ['pvpmod']);
  assert.equal(officialPvp.status, 'covered');
});

test('仲裁使用当前接合点解锁条件', () => {
  const arbitration = core.getGameplay('仲裁').entry;
  assert.match(arbitration.steps[0], /冥王星至阋神星接合点/);
  assert.doesNotMatch(arbitration.steps.join(''), /解锁全部星图|完成全部星图|清完星图/);
});

test('官方目录加载为只读对象', () => {
  assert.equal(Object.isFrozen(core.officialCatalog), true);
  assert.equal(Object.isFrozen(core.officialCatalog.mods), true);
  assert.equal(Object.isFrozen(core.getOfficialMod('Narrow Minded')), true);
});


test('科研脉冲问题命中固定事实', () => {
  const context = core.buildWikiContext('科研的脉冲次数是如何计算的');
  assert.equal(context.facts[0].id, 'fact.search-pulse.weekly-consumption');
  assert.match(context.text, /每周固定刷新 5 次/);
  assert.match(context.text, /深层科研消耗 2 次/);
});
