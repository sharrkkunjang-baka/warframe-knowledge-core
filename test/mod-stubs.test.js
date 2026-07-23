'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Items = require('warframe-items');
const { readEntryDirectory } = require('../src/loader');
const {
  filterPlayableMods,
  getCanonical,
  getTypeDisplayName,
  isFlawedMod
} = require('../src/playable-mod-filter');
const fs = require('node:fs');
const { createSyncPlan } = require('../scripts/sync-mods');
const { buildOfficialCatalog } = require('../scripts/sync-official-mods');
const { buildPlan: buildWikiPlan } = require('../scripts/sync-mod-wiki');
const { createKnowledgeCore } = require('../src');
const { renderStructuredMethod } = require('../src/acquisition-protocol');
const { buildPlans: buildEntityPlans } = require('../scripts/migrate-entity-registries');

const root = path.join(__dirname, '..');
const items = new Items({ category: ['Mods'], i18n: ['zh'] });
const { playable, excluded } = filterPlayableMods(items);

test('真实 Mod 过滤排除专精、转换核心与内部重复记录', () => {
  assert.equal(playable.length + excluded.length, items.length);
  assert.equal(playable.some(item => item.type === 'Focus Way'), false);
  assert.equal(playable.some(item => item.type === 'Transmutation Mod'), false);
  assert.equal(playable.some(item => item.type === 'Mod Set Mod'), false);
  assert.equal(playable.some(item => item.name === 'Unfused Artifact'), false);
  assert.equal(playable.some(item => /SPSubMod/i.test(item.uniqueName)), false);
  assert.equal(playable.some(item => item.uniqueName === '/Lotus/Upgrades/Mods/Melee/Expert/WeaponCritChanceSPMod' && item.name === 'Galvanized Steel'), true);
  for (const item of items.filter(item => /SPMod/i.test(item.uniqueName) && !/SPSubMod/i.test(item.uniqueName) && item.wikiaUrl && item.wikiAvailable !== false)) {
    assert.equal(playable.includes(item), true, `${item.name} 被 SP 路径规则误排除`);
  }
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

test('镀层近战主 Mod 不能因 SP 内部路径规则被排除', () => {
  const galvanizedSteel = playable.find(item => item.uniqueName === '/Lotus/Upgrades/Mods/Melee/Expert/WeaponCritChanceSPMod');
  const internalSubMod = excluded.find(({ item }) => item.uniqueName === '/Lotus/Upgrades/Mods/Melee/Expert/WeaponCritChanceSPSubMod');
  assert.equal(galvanizedSteel?.name, 'Galvanized Steel');
  assert.equal(items.i18n[galvanizedSteel.uniqueName]?.zh?.name, '镀层 斩铁');
  assert.equal(internalSubMod?.reason, 'steel-path-internal-submod');
  const core = createKnowledgeCore({ approvedOnly: false });
  for (const query of ['镀层斩铁', '镀层 斩铁', 'Galvanized Steel']) {
    const result = core.getAcquisition(query);
    assert.equal(result?.entry?.officialUniqueName, galvanizedSteel.uniqueName);
    assert.equal(result?.structuredMethods?.[0]?.sourceEntityId, 'acquisition-source.arbitration-honors');
    assert.deepEqual(result?.structuredMethods?.[0]?.requirements?.currency, [{ currencyId: 'currency.vitus-essence', amount: 20 }]);
  }
});

test('全部已审核组合 Mod 都有官方证据化组合效果', () => {
  const acquisitions = readEntryDirectory(path.join(root, 'knowledge', 'acquisition', 'mod'));
  const setMods = acquisitions.filter(entry => entry.reviewStatus === 'approved' && entry.subject?.categoryRefs?.includes('setmod'));
  assert.equal(setMods.length, 72);
  assert.equal(new Set(setMods.map(entry => entry.setFamily)).size, 19);
  for (const entry of setMods) {
    assert.ok(entry.setBonusDetails?.length, `${entry.subject.canonical}: 缺组合效果`);
    assert.equal(entry.setBonusReviewStatus, 'approved', `${entry.subject.canonical}: 组合效果未审核`);
    assert.equal(entry.setBonusEvidence?.reviewStatus, 'approved', `${entry.subject.canonical}: 组合证据未审核`);
    assert.match(entry.setBonusEvidence?.languageKey || '', /^\/Lotus\/Language\//, `${entry.subject.canonical}: 缺官方语言键`);
    assert.match(entry.setBonusEvidence?.source || '', /DE Languages\.bin.*official full English Mod card/, `${entry.subject.canonical}: 缺来源说明`);
  }
});

test('全部公开 Mod 类型都有稳定中文展示名且不泄漏英文类型', () => {
  const publicTypes = [...new Set(playable.map(item => item.type).filter(Boolean))];
  for (const type of publicTypes) {
    const display = getTypeDisplayName(type);
    assert.ok(display.endsWith('Mod'), type);
    assert.doesNotMatch(display, /^(?:Primary|Secondary|Shotgun|Melee|Warframe|Companion|Stance|Plexus|Parazon|Necramech|Railjack|Posture) Mod$/, type);
  }
  assert.equal(getTypeDisplayName('Primary Mod'), '主要武器 Mod');
});

test('头目 Mod 掉落由官方区域映射显示对应星球刺杀',()=>{const core=createKnowledgeCore({approvedOnly:false}),result=core.getAcquisition('酸性弹药'),method=result.structuredMethods.find(item=>item.type==='enemy-drop');assert.equal(method.bossLocation.planetCanonical,'Sedna');assert.equal(method.bossLocation.planetDisplayName,'赛德娜');assert.match(result.description,/击败Kela De Thaym（赛德娜刺杀）概率获得/)});
test('Mod 敌人掉落统一省略精确概率并在已知时写清限定任务', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  for (const query of ['步枪元素师', '手枪元素师']) {
    const result = core.getAcquisition(query);
    assert.ok(result.description.includes('击败朱诺工兵恐鸟（仅在天王星布鲁图斯的扬升任务中出现）概率获得'));
    assert.doesNotMatch(result.description, /0\.4287|综合概率|%/);
  }
  const publishedMods = core.officialCatalog.mods.filter(item => item.status === 'complete');
  for (const mod of publishedMods) {
    const result = core.getAcquisition(mod.canonical);
    for (const method of result?.structuredMethods?.filter(item => item.type === 'enemy-drop') || []) {
      const line = renderStructuredMethod(method);
      if (method.sourceKind !== 'enemy' && !method.bossLocation) continue;
      assert.match(line, /概率获得(?: 1个)?$/, mod.canonical);
      assert.equal([ '综合概率', '来源掉落触发', '触发后占' ].some(value => line.includes(value)), false, mod.canonical);
      assert.doesNotMatch(line, /\d+(?:\.\d+)?%/, mod.canonical);
      if (method.locationDisplayName || method.missionTypeDisplayName) assert.ok(line.includes('仅在') && line.includes('中出现'), mod.canonical);
    }
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
    sourceEntityId: 'enemy.juno-sapper-moa', sourceDisplayName: '朱诺工兵恐鸟', planetDisplayName: '天王星', locationDisplayName: '布鲁图斯', missionTypeDisplayName: '扬升', chance: 0.004287
  });
});

test('所有获取方法引用的 NPC 实体均已注册且仲裁商店保留官方名称', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const preparation = core.getAcquisition('有备而来');
  assert.match(preparation.description, /在任意中继站的仲裁阁下处消耗30个生息精华兑换/);
  assert.equal((preparation.description.match(/消耗30个生息精华兑换/g) || []).length, 1);
  assert.equal(preparation.structuredMethods[0].sourceDisplayName, '仲裁阁下');
  assert.equal(preparation.structuredMethods[0].sourceEntityId, 'acquisition-source.arbitration-honors');
  assert.equal(core.getAcquisition('Amanata Pressure').structuredMethods[0].sourceEntityId, 'acquisition-source.koumei-shrine');
});

test('执刑官 Mod 使用切片哥和存货储备统一兑换协议', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  for (const query of ['执刑官 延伸', 'Archon Stretch']) {
    const result = core.getAcquisition(query);
    assert.deepEqual(result.structuredMethods.map(method => ({ type: method.type, sourceEntityId: method.sourceEntityId, sourceDisplayName: method.sourceDisplayName, locationId: method.locationId, locationDisplayName: method.locationDisplayName })), [{
      type: 'vendor-or-syndicate-exchange', sourceEntityId: 'npc.chipper', sourceDisplayName: '切片哥', locationId: 'hub.drifters-camp', locationDisplayName: '漂泊者营地'
    }]);
    assert.deepEqual(result.requirements, { type: 'currency', usage: 'exchange', npcId: 'npc.chipper', locationId: 'hub.drifters-camp', currency: [{ currencyId: 'currency.stock', amount: 40 }], boosterPolicy: 'currency-entity-metadata' });
    assert.deepEqual(result.requirementLines, [
      '在漂泊者营地的切片哥处消耗40个存货储备兑换',
      '所需货币怎么刷：',
      '存货储备（需要40个）：完成卡尔每周的“击溃合一众”任务挑战获得，并同时推进卡尔驻军等级',
      '资源数量加成：存货储备不受影响',
      '资源掉落几率加成：存货储备不受影响',
      '兑换成本固定为40个存货储备，不会因加成改变'
    ]);
    assert.equal(result.structuredMethods.some(method => method.type === 'enemy-drop'), false);
  }
  for (const query of ['执行官卡', '执刑官卡']) assert.equal(core.getGameplay(query)?.entry.id, 'gameplay.kahl-chipper');
  assert.equal(core.renderGameText('+45% 技能范围；造成 <DT_ELECTRICITY_COLOR>电击伤害'), '+45% 技能范围；造成 电击伤害');
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
  assert.ok(condition.structuredMethods.some(method => method.chance === 0.0149 && /Tier 4|Tier 6/.test(method.sourceCanonical || '')));
  assert.ok(condition.structuredMethods.some(method => method.type === 'enemy-drop' && method.sourceCanonical === 'Kuva Bombard'));
  assert.ok(condition.mechanicsEvidence.notes.length > 0);
  const frostbite = core.getAcquisition('Frostbite');
  assert.ok(frostbite.structuredMethods.some(method => method.rotation === 'C' && method.chance === 0.086 && method.nodes.length === 4));
  assert.ok(frostbite.structuredMethods.some(method => method.chance === 0.1 && /Pago.*Rotation B/.test(method.sourceCanonical || '')));
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
  assert.deepEqual(razorMortar.structuredMethods.map(method => method.type), ['syndicate-exchange', 'syndicate-exchange']);
  assert.deepEqual(fireballFrenzy.structuredMethods.map(method => method.type), ['syndicate-exchange-group']);
  assert.ok(razorMortar.structuredMethods.every(method => method.factionId));
  assert.equal(fireballFrenzy.structuredMethods[0].factionIds.length, 2);
  assert.equal(razorMortar.entry.subject.categoryRefs[0], fireballFrenzy.entry.subject.categoryRefs[0]);
});

test('官方目录为全部上游记录给出完整、待审或排除状态', () => {
  const catalog = buildOfficialCatalog('2026-07-15T00:00:00.000Z');
  const upstreamRecords = new (require('warframe-items'))({ category: ['Mods'], i18n: ['zh'] }).length;
  assert.equal(catalog.counts.upstreamRecords, upstreamRecords);
  assert.equal(catalog.counts.mods, catalog.mods.length);
  assert.ok(catalog.counts.mods > playable.length);
  assert.equal(catalog.counts.excludedMods, excluded.length);
  assert.equal(catalog.counts.completeMods + catalog.counts.reviewRequiredMods, catalog.mods.length);
  assert.equal(catalog.mods.every(mod => ['complete', 'review-required'].includes(mod.status)), true);
  assert.equal(catalog.excludedMods.every(mod => mod.status === 'excluded-policy' && mod.exclusionReason), true);
  assert.equal(new Set([...catalog.mods, ...catalog.excludedMods].map(mod => mod.uniqueName)).size, upstreamRecords + (catalog.mods.length - playable.length));
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
    sourceEntityId: 'acquisition-source.koumei-shrine',
    locationId: 'hub.cetus',
    prerequisite: 'steel-path',
    requirements: {
      type: 'currency', usage: 'exchange', npcId: 'acquisition-source.koumei-shrine', locationId: 'hub.cetus',
      currency: [{ currencyId: 'currency.fate-pearl', amount: 150 }], boosterPolicy: 'currency-entity-metadata'
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
  for (const canonical of ['Primed Vigor', 'Primed Shred', 'Primed Fury']) {
    const result = core.getAcquisition(canonical);
    assert.deepEqual(result.methods, []);
    assert.deepEqual(result.structuredMethods.map(method => method.type), ['daily-tribute']);
    assert.match(result.description, /每日献礼里程碑奖励中选择获得/);
    assert.doesNotMatch(result.description, /虚空商人|奸商/);
  }
});

test('多来源 Mod 返回全部可展示刷取入口', () => {
  const result = createKnowledgeCore().getAcquisition('全面驱动');
  assert.deepEqual(result.sourceOptions, [
    { id: 'gameplay.duviri-endless', title: '双衍王境无尽回廊奖励', query: '双衍王境无尽' },
    { id: 'gameplay.uranus-caches', title: '天王星资源储藏舱', query: '天王星储藏舱' },
    { id: 'gameplay.enemy-and-mission-drops', title: '敌人与任务掉落', query: '敌人与任务掉落' }
  ]);
});
test('\u81f4\u547d\u6d2a\u6d41\u4fdd\u7559\u5669\u68a6\u68af\u7ea7\u4e14\u4e0d\u91cd\u590d\u901a\u7528\u6765\u6e90', () => {
  const result = createKnowledgeCore({ approvedOnly: false }).getAcquisition('Lethal Torrent');
  assert.ok(result.description.includes('噩梦模式 C轮（概率15.49%）'));
  assert.equal(result.description.includes('获取任务名称待审核'), false);
  assert.equal(result.description.includes('细节'), false);
  assert.equal(result.description.includes('刷 噩梦'), false);
  const nightmareMethods = (result.structuredMethods || []).filter(method => method.type === 'mission-reward');
  assert.equal(nightmareMethods.length, 1);
  assert.equal(nightmareMethods[0].provenanceAlternatives.length, 2);
  assert.deepEqual(nightmareMethods.map(method => createKnowledgeCore().renderStructuredMethod(method)), ['噩梦模式 C轮（概率15.49%）']);
  assert.deepEqual(createKnowledgeCore({ approvedOnly: false }).getAcquisitionCard('致命洪流').sections.acquisition, ['噩梦模式 C轮']);
});
test('\u95f4\u8c0d Mod \u6309\u6389\u843d\u8868 T \u7ea7\u5206\u884c\u5e76\u63d0\u4f9b\u95f4\u8c0d\u73a9\u6cd5', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const result = core.getAcquisition('Heavy Impact');
  const spyLines = result.structuredMethods.filter(method => method.type === 'mission-reward' && method.missionTypeCanonical === 'Spy').map(method => core.renderStructuredMethod(method));
  assert.deepEqual(spyLines, ['T1\u95f4\u8c0d C\u8f6e\u6982\u7387\u83b7\u5f97']);
  assert.equal(spyLines.some(line => /Cyath|Gnathos|Cambria/.test(line)), false);
  assert.ok(result.sourceOptions.some(source => source.id === 'gameplay.spy-missions' && source.query === '\u95f4\u8c0d'));
  assert.equal(core.getGameplay('\u95f4\u8c0d').entry.id, 'gameplay.spy-missions');
  assert.equal(core.getGameplay('\u95f4\u8c0d T1').rewardTier, 'T1');
  assert.deepEqual(core.getGameplay('\u95f4\u8c0d T1').rewardGroup.planets, ['\u6c34\u661f', '\u91d1\u661f', '\u5730\u7403', '\u706b\u661f', '\u706b\u536b\u4e00']);
});
test('集团 Mod 统一提供刷集团入口', () => {
  for (const query of ['Iron Shrapnel', 'Razor Mortar']) {
    const result = createKnowledgeCore({ approvedOnly: false }).getAcquisition(query);
    assert.ok(result.sourceOptions.some(source => source.id === 'gameplay.syndicate-offerings' && source.query === '集团'));
  }
});


test('\u5b89\u9b42 Mod \u7531\u5185\u90e8\u8eab\u4efd\u7edf\u4e00\u5f52\u7c7b\u5e76\u5173\u8054\u5b89\u9b42\u73a9\u6cd5', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const expected = ['Lohk', 'Xata', 'Jahu', 'Vome', 'Fass', 'Ris', 'Khra', 'Netra', 'Oull'];
  for (const query of expected) {
    const result = core.getAcquisition(query);
    assert.equal(result.entry.subject.categoryRefs[0], 'requiemmod');
    assert.ok(result.sourceOptions.some(source => source.id === 'gameplay.requiem-mods' && source.query === '\u5b89\u9b42'));
  }
  assert.equal(core.getCategoryDetail('\u5b89\u9b42').entries.length, 9);
  assert.equal(core.getGameplay('\u5b89\u9b42').entry.id, 'gameplay.requiem-mods');
  assert.equal(core.getGameplay('anhun').entry.id, 'gameplay.requiem-mods');
  for (const query of ['Xata', 'Khra']) {
    const result = core.getAcquisition(query);
    assert.deepEqual(result.entry.effectDetails, []);
    assert.ok(result.structuredMethods.length >= 4);
    assert.ok(result.structuredMethods.every(method => /Requiem/i.test(method.sourceCanonical || '')));
    assert.doesNotMatch(result.description, /Munio|\u5893\u5792|\u955c\u50cf\u9632\u5fa1|[ABC]\u8f6e/);
    assert.match(result.description, /\u53ef\u7528\u4e8e\u7384\u9ab8\u89e3\u5bc6\u7684\u5bc6\u7801/);
    assert.match(result.description, /科腐系玄骸请使用杀毒 Mod（蠕虫驱逐）/);
    assert.deepEqual(core.getAcquisitionCard(query).modInfo.descriptionLines, [
      '可用于玄骸解密的密码',
      '科腐系玄骸请使用杀毒 Mod（蠕虫驱逐）'
    ]);
  }
  const oull = core.getAcquisition('Oull');
  assert.deepEqual(oull.entry.effectDetails, []);
  assert.equal(core.renderStructuredMethod(oull.structuredMethods[0]), '\u6210\u529f\u5c06\u8d64\u6bd2\u7384\u9ab8\u6216\u59d0\u59b9\u8d76\u53bb\u51b3\u6218\u670925%\u6982\u7387\u6389\u843d');
  assert.match(oull.description, /\u53ef\u7528\u4e8e\u7384\u9ab8\u89e3\u5bc6\u7684\u5bc6\u7801/);
  assert.match(oull.description, /\u53ef\u89c6\u4e3a\u4efb\u610f\u5bc6\u7801/);
  assert.match(oull.description, /\u6210\u529f\u5c06\u8d64\u6bd2\u7384\u9ab8\u6216\u59d0\u59b9\u8d76\u53bb\u51b3\u6218\u670925%\u6982\u7387\u6389\u843d/);
  const oullCard = core.getAcquisitionCard('Oull');
  assert.deepEqual(oullCard.modInfo.descriptionLines, [
    '可用于玄骸解密的密码',
    '可视为任意密码',
    '科腐系玄骸请使用杀毒 Mod（蠕虫驱逐）'
  ]);
  assert.ok(oullCard.sections.enemy.some(line => /\u8d64\u6bd2\u7384\u9ab8\u6216\u59d0\u59b9.*\u51b3\u6218.*25%/.test(line)));
});

test('\u5df2\u53d1\u5e03 Mod \u4efb\u52a1\u6765\u6e90\u4e0d\u6cc4\u6f0f\u53ef\u672c\u5730\u5316\u82f1\u6587', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  for (const entry of core.knowledge.filter(item => item.subject?.category === 'mod' && item.reviewStatus === 'approved')) {
    const result = core.getAcquisition(entry.subject.canonical);
    for (const method of result.structuredMethods || []) {
      if (method.type !== 'mission-reward') continue;
      assert.doesNotMatch(method.missionTypeDisplayName || '', /^(?:Fortuna Bounty|Orokin Vault|Arbitrations|Nightmare Mode|Annihilation|Cephalon Capture|Team Annihilation|Necralisk Bounty|Ghoul Bounty|Profit-Taker Bounty)$/);
    }
  }
  const synth = core.getAcquisition('Synth Fiber').description;
  assert.match(synth, /\u4ece\u5965\u5e03\u5c71\u8c37\u8d4f\u91d1\u5956\u52b1\u4e2d\u83b7\u5f97/);
  assert.match(synth, /\u79d1\u666e\u65af\u72d9\u51fb\u624b\u76ee\u6807\u3001\u79d1\u666e\u65af\u82cf\u666e\u62c9\u76ee\u6807/);
  assert.ok((synth.match(/\u5965\u5e03\u5c71\u8c37\u8d4f\u91d1/g) || []).length >= 1);
  const vault=core.getAcquisition('Critical Deceleration').description;
  assert.match(vault, /\u5965\u7f57\u91d1\u5b9d\u5e93\u6982\u7387\u83b7\u5f97/);
  assert.doesNotMatch(vault, /[ABC]\u8f6e|Orokin Vault|4\.17%/);
});
