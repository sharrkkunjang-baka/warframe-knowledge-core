'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Items = require('warframe-items');
const { readEntryDirectory } = require('../src/loader');
const {
  filterPlayableMods,
  getCanonical,
  isFlawedMod
} = require('../src/playable-mod-filter');
const fs = require('node:fs');
const { createSyncPlan } = require('../scripts/sync-mods');
const { buildOfficialCatalog } = require('../scripts/sync-official-mods');
const { buildPlan: buildWikiPlan } = require('../scripts/sync-mod-wiki');
const { createKnowledgeCore } = require('../src');
const { buildPlans: buildEntityPlans } = require('../scripts/migrate-entity-registries');

const root = path.join(__dirname, '..');
const items = new Items({ category: ['Mods'], i18n: ['zh'] });
const { playable, excluded } = filterPlayableMods(items);

test('真实 Mod 过滤排除专精、转换核心与内部重复记录', () => {
  assert.equal(playable.length + excluded.length, 1733);
  assert.equal(playable.some(item => item.type === 'Focus Way'), false);
  assert.equal(playable.some(item => item.type === 'Transmutation Mod'), false);
  assert.equal(playable.some(item => item.type === 'Mod Set Mod'), false);
  assert.equal(playable.some(item => item.name === 'Unfused Artifact'), false);
  assert.equal(playable.some(item => /SP(?:Sub)?Mod/i.test(item.uniqueName)), false);
  assert.equal(playable.some(item => item.name === 'Primed Streamline'), false);
  assert.equal(excluded.some(({ item }) => item.name === 'Pathogen Rounds' && /\/Expert\//.test(item.uniqueName)), true);
  for (const canonical of ['Fizzbang Flourish', 'Necramech Stamina']) {
    const record = excluded.find(({ item }) => item.name === canonical);
    assert.equal(record?.reason, 'codex-hidden-no-acquisition-evidence');
    assert.equal(Boolean(record?.item.excludeFromCodex), true);
    assert.equal(Boolean(record?.item.wikiaUrl), false);
    assert.equal((record?.item.drops || []).length, 0);
  }
});

test('朱诺工兵恐鸟通过实体变量携带布鲁图斯扬升地点', () => {
  const enemyPlan = buildEntityPlans().find(plan => plan.index.type === 'enemies');
  const enemy = enemyPlan.files.map(item => item.entry).find(entry => entry.id === 'enemy.juno-sapper-moa');
  assert.deepEqual(enemy && { canonical: enemy.canonical, displayName: enemy.displayName, locationId: enemy.locationId, missionTypeId: enemy.missionTypeId }, {
    canonical: 'Juno Sapper MOA', displayName: '朱诺工兵恐鸟', locationId: 'mission-node.brutus', missionTypeId: 'mission-type.ascension'
  });
});

test('手枪元素师显示实体化敌人及布鲁图斯扬升来源', () => {
  const result = createKnowledgeCore({ approvedOnly: false }).getAcquisition('手枪元素师');
  const method = result.structuredMethods.find(item => item.type === 'enemy-drop');
  assert.deepEqual(method && { sourceEntityId: method.sourceEntityId, sourceDisplayName: method.sourceDisplayName, planetDisplayName: method.planetDisplayName, locationDisplayName: method.locationDisplayName, missionTypeDisplayName: method.missionTypeDisplayName, chance: method.chance }, {
    sourceEntityId: 'enemy.juno-sapper-moa', sourceDisplayName: '朱诺工兵恐鸟', planetDisplayName: '天王星', locationDisplayName: '布鲁图斯', missionTypeDisplayName: '扬升', chance: 0.4287
  });
});

test('所有获取方法引用的 NPC 实体均已注册且仲裁商店保留官方名称', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const preparation = core.getAcquisition('有备而来');
  assert.match(preparation.description, /任意中继站找仲裁阁下兑换，需要30个生息精华/);
  assert.equal(preparation.structuredMethods[0].sourceDisplayName, '仲裁阁下');
  assert.ok(core.getNpc('npc.arbitration-honors'));
  assert.ok(core.getNpc('npc.koumei-shrine'));
});

test('执刑官 Mod 使用切片哥和存货储备统一兑换协议', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  for (const query of ['执刑官 延伸', 'Archon Stretch']) {
    const result = core.getAcquisition(query);
    assert.deepEqual(result.structuredMethods.map(method => ({ type: method.type, sourceEntityId: method.sourceEntityId, sourceDisplayName: method.sourceDisplayName, locationId: method.locationId, locationDisplayName: method.locationDisplayName })), [{
      type: 'vendor-or-syndicate-exchange', sourceEntityId: 'npc.chipper', sourceDisplayName: '切片哥', locationId: 'hub.drifters-camp', locationDisplayName: '漂泊者营地'
    }]);
    assert.deepEqual(result.requirements, { type: 'currency', usage: 'exchange', npcId: 'npc.chipper', locationId: 'hub.drifters-camp', currency: [{ currencyId: 'currency.stock', amount: 40 }], isBuffUseless: true });
    assert.deepEqual(result.requirementLines, [
      '在漂泊者营地找切片哥兑换，需要40个存货储备',
      '所需货币怎么刷：',
      '存货储备（需要40个）：完成卡尔每周的“击溃合一众”任务挑战获得，并同时推进卡尔驻军等级',
      '资源数量加成无效'
    ]);
    assert.equal(result.structuredMethods.some(method => method.type === 'enemy-drop'), false);
  }
  for (const query of ['执行官卡', '执刑官卡']) assert.equal(core.getGameplay(query)?.entry.id, 'gameplay.kahl-chipper');
  assert.equal(core.renderGameText('+45% 技能范围；造成 <DT_ELECTRICITY_COLOR>电击伤害'), '+45% 技能范围；造成 ⚡电击伤害');
});

test('普通、残缺与 Prime 代表 Mod 保持独立身份', () => {
  const pressurePoints = playable.filter(item => item.name === 'Pressure Point');
  assert.equal(pressurePoints.some(item => getCanonical(item) === 'Pressure Point'), true);
  assert.equal(pressurePoints.some(item => isFlawedMod(item) && getCanonical(item) === 'Flawed Pressure Point'), true);
  assert.equal(playable.some(item => item.name === 'Primed Pressure Point'), true);
  assert.equal(playable.some(item => item.name === 'Fever Strike' && !isFlawedMod(item)), true);
  assert.equal(playable.some(item => item.name === 'Fever Strike' && isFlawedMod(item)), true);
  assert.equal(playable.some(item => item.name === 'Pathogen Rounds' && !isFlawedMod(item)), true);
  assert.equal(playable.some(item => item.name === 'Pathogen Rounds' && isFlawedMod(item)), true);
});

test('全量 Mod 官方身份同步幂等且人工字段保持不变', () => {
  const plan = createSyncPlan({ today: '2026-07-13' });
  assert.equal(plan.expectedFiles.filter(file => file.current !== file.content).length, 0);
  assert.equal(plan.counts.playable, playable.length);
  assert.equal(plan.counts.existing + plan.counts.generated, playable.length);

  const acquisitions = readEntryDirectory(path.join(root, 'knowledge', 'acquisition'));
  const modAcquisitions = acquisitions.filter(entry => entry.subject?.category === 'mod');
  const byUniqueName = new Map(modAcquisitions.map(entry => [entry.officialUniqueName || entry.subject?.officialUniqueName, entry]));
  assert.equal(byUniqueName.size, modAcquisitions.length);

  const pressurePoint = byUniqueName.get('/Lotus/Upgrades/Mods/Melee/WeaponMeleeDamageMod');
  const flawedPressurePoint = byUniqueName.get('/Lotus/Upgrades/Mods/Melee/Beginner/WeaponMeleeDamageModBeginner');
  const primedPressurePoint = byUniqueName.get('/Lotus/Upgrades/Mods/Melee/Expert/WeaponMeleeDamageModExpert');
  for (const entry of [pressurePoint, flawedPressurePoint]) {
    assert.ok(entry);
    assert.equal(entry.reviewStatus, 'draft');
    assert.ok(['stub', 'partial', 'complete'].includes(entry.acquisitionStatus));
    assert.deepEqual(entry.prerequisites, []);
    assert.deepEqual(entry.methodRefs, []);
    assert.deepEqual(entry.modAcquisition.manual.methodRefs, []);
    assert.ok(entry.effectDetails.length);
  }
  assert.equal(primedPressurePoint.reviewStatus, 'approved');
  assert.equal(primedPressurePoint.acquisitionStatus, 'complete');
  assert.deepEqual(primedPressurePoint.methodRefs, []);
  assert.ok(primedPressurePoint.effectDetails.length);
  assert.deepEqual(pressurePoint.subject.categoryRefs.slice(0, 2), ['meleemod', 'standardmod']);
  assert.deepEqual(flawedPressurePoint.subject.categoryRefs.slice(0, 2), ['flawedmod', 'meleemod']);
  assert.deepEqual(primedPressurePoint.subject.categoryRefs.slice(0, 2), ['primemod', 'meleemod']);
});

test('Wiki 编译幂等且样本表格解析可靠', () => {
  const db = process.env.WF_WIKI_DB || path.resolve(root, '..', 'qq-bot', 'data', 'warframe-wiki.sqlite.download');
  if (!fs.existsSync(db)) return;
  const plan = buildWikiPlan({ db });
  assert.equal(plan.counts.changed, 0);
  const core = createKnowledgeCore({ approvedOnly: false });
  const growing = core.getAcquisition('Growing Power');
  assert.equal(growing.entry.reviewStatus, 'approved');
  assert.deepEqual(growing.entry.methodRefs, ['gameplay.silver-grove-specters']);
  assert.deepEqual(growing.entry.modAcquisition.manual.methodRefs, growing.entry.methodRefs);
  const condition = core.getAcquisition('Condition Overload');
  assert.ok(condition.structuredMethods.some(method => method.type === 'circuit-reward' && method.chance === 0.0149));
  assert.ok(condition.structuredMethods.some(method => method.type === 'enemy-drop' && method.sourceCanonical === 'Kuva Bombard'));
  assert.ok(condition.mechanicsEvidence.notes.length > 0);
  const frostbite = core.getAcquisition('Frostbite');
  assert.ok(frostbite.structuredMethods.some(method => method.rotation === 'C' && method.chance === 0.086 && method.nodes.length === 4));
  assert.ok(frostbite.structuredMethods.some(method => method.rotation === 'B' && method.chance === 0.1));
  assert.equal(frostbite.structuredMethods.some(method => method.type === 'enemy-drop'), false);
});

test('全部已发布 Mod 都通过统一 structuredMethods 与 requirements 协议输出', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  for (const mod of core.officialCatalog.mods.filter(item => item.status === 'complete')) {
    const result = core.getAcquisition(mod.canonical);
    assert.ok(result, mod.canonical);
    assert.ok(result.description?.trim(), `${mod.canonical} 缺少发布文案`);
    assert.ok(result.structuredMethods.length > 0, `${mod.canonical} 缺少结构化获取方法`);
    assert.ok(result.structuredMethods.every(method => method.requirements && Array.isArray(method.requirementLines)), `${mod.canonical} 未走统一 requirements`);
  }
});

test('官方六大集团强化商品全量编译并显式报告未关联身份', () => {
  const catalog = buildOfficialCatalog('2026-07-15T00:00:00.000Z');
  assert.equal(catalog.counts.syndicateAugmentProducts, 197);
  assert.equal(catalog.counts.syndicateAugmentOfferRows, 394);
  assert.deepEqual(catalog.unmatchedSyndicateOffers.map(item => item.stem), ['nokkorerootaugment', 'fireskinaugment']);
  const cases = [
    ['刀锋迫击', ['faction.cephalon-suda', 'faction.the-perrin-sequence']],
    ['夜枭群袭', ['faction.arbiters-of-hexis', 'faction.cephalon-suda']],
    ['律动护卫', ['faction.new-loka', 'faction.steel-meridian']]
  ];
  for (const [name, factionIds] of cases) {
    const mod = catalog.mods.find(item => item.displayName === name);
    assert.equal(mod.status, 'complete');
    assert.deepEqual(mod.acquisitionMethods.map(method => method.factionId), factionIds);
    assert.doesNotMatch(mod.maxRankEffectsZh.join(''), /\|[A-Z][A-Z0-9_]*\|/);
  }
});

test('全部 Mod 不按编译来源分流并返回同一标准 acquisition entry', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const cases = ['刀锋迫击', '夜枭群袭', '律动护卫', '狂热火球', '成长之力'];
  for (const query of cases) {
    const result = core.getAcquisition(query);
    assert.equal(result.entry?.subject?.category, 'mod', `${query} 未进入标准 Mod entry`);
    assert.equal(result.resolution?.canonical, result.entry.subject.canonical);
    assert.ok(result.officialMod, `${query} 缺少统一 officialMod 关联`);
    assert.ok(Array.isArray(result.structuredMethods));
    assert.ok(result.structuredMethods.every(method => method.requirements && Array.isArray(method.requirementLines)));
  }
  const razorMortar = core.getAcquisition('刀锋迫击');
  const fireballFrenzy = core.getAcquisition('狂热火球');
  assert.deepEqual(
    razorMortar.structuredMethods.map(method => method.type),
    fireballFrenzy.structuredMethods.map(method => method.type)
  );
  assert.equal(razorMortar.entry.subject.categoryRefs[0], fireballFrenzy.entry.subject.categoryRefs[0]);
});

test('官方目录为全部上游记录给出完整、待审或排除状态', () => {
  const catalog = buildOfficialCatalog('2026-07-15T00:00:00.000Z');
  assert.equal(catalog.counts.upstreamRecords, 1733);
  assert.equal(catalog.counts.mods, catalog.mods.length);
  assert.ok(catalog.counts.mods > playable.length);
  assert.equal(catalog.counts.excludedMods, excluded.length);
  assert.equal(catalog.counts.completeMods + catalog.counts.reviewRequiredMods, catalog.mods.length);
  assert.equal(catalog.mods.every(mod => ['complete', 'review-required'].includes(mod.status)), true);
  assert.equal(catalog.excludedMods.every(mod => mod.status === 'excluded-policy' && mod.exclusionReason), true);
  assert.equal(new Set([...catalog.mods, ...catalog.excludedMods].map(mod => mod.uniqueName)).size, 1733 + (catalog.mods.length - playable.length));
  const pressurePoint = catalog.mods.find(mod => mod.uniqueName === '/Lotus/Upgrades/Mods/Melee/WeaponMeleeDamageMod');
  const narrowMinded = catalog.mods.find(mod => mod.canonical === 'Narrow Minded');
  assert.equal(pressurePoint.status, 'review-required');
  assert.equal(narrowMinded.status, 'complete');
});

test('最后本地边界项有明确的发布或排除结论', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const amanata = core.getAcquisition('Amanata Pressure');
  const method = amanata.structuredMethods.find(item => item.type === 'vendor-or-syndicate-exchange');
  assert.deepEqual(method && {
    sourceEntityId: method.sourceEntityId,
    locationId: method.locationId,
    prerequisite: method.prerequisite,
    requirements: method.requirements
  }, {
    sourceEntityId: 'npc.koumei-shrine',
    locationId: 'hub.cetus',
    prerequisite: 'steel-path',
    requirements: {
      type: 'currency', usage: 'exchange', npcId: 'npc.koumei-shrine', locationId: 'hub.cetus',
      currency: [{ currencyId: 'currency.fate-pearl', amount: 150 }], isBuffUseless: true
    }
  });
  assert.match(amanata.description, /希图斯.*150个命运之珠/);
  assert.match(amanata.description, /需要已解锁钢铁之路/);
  assert.doesNotMatch(amanata.description, /尚未收录/);
  assert.equal(core.officialCatalog.mods.find(mod => mod.canonical === 'Amanata Pressure')?.status, 'complete');
  assert.equal(core.officialCatalog.mods.find(mod => mod.canonical === 'Soaring Truth')?.status, 'review-required');
  for (const canonical of ['Fizzbang Flourish', 'Necramech Stamina']) {
    const record = core.officialCatalog.excludedMods.find(mod => mod.canonical === canonical);
    assert.equal(record?.exclusionReason, 'codex-hidden-no-acquisition-evidence');
  }
});

test('Prime Mod 默认继承奸商玩法且保留明确来源例外', () => {
  const core = createKnowledgeCore();
  const primedPressurePoint = core.getAcquisition('压迫点p');
  const primedSureFooted = core.getAcquisition('Primed Sure Footed');
  assert.equal(primedPressurePoint.methods[0]?.id, 'gameplay.baro-ki-teer');
  assert.equal(primedPressurePoint.entry.reviewStatus, 'approved');
  assert.equal(primedPressurePoint.description, '压迫点 Prime 通常由虚空商人的轮换库存出售\n输入“刷 奸商”可了解兑换准备与轮换规则');
  assert.deepEqual(primedSureFooted.methods.map(method => method.id), ['gameplay.daily-tribute']);
});

test('多来源 Mod 返回全部可展示刷取入口', () => {
  const result = createKnowledgeCore().getAcquisition('全面驱动');
  assert.deepEqual(result.sourceOptions, [
    { id: 'gameplay.duviri-endless', title: '双衍王境无尽回廊奖励', query: '双衍王境无尽' },
    { id: 'gameplay.uranus-caches', title: '天王星资源储藏舱', query: '天王星储藏舱' },
    { id: 'gameplay.enemy-and-mission-drops', title: '敌人与任务掉落', query: '敌人与任务掉落' }
  ]);
});
