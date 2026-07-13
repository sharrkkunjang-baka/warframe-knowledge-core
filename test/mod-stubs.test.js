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
const { createSyncPlan } = require('../scripts/sync-mods');
const { createKnowledgeCore } = require('../src');

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

test('全量 Mod 空壳幂等且刷法保持为空', () => {
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
    assert.equal(entry.acquisitionStatus, 'stub');
    assert.deepEqual(entry.prerequisites, []);
    assert.deepEqual(entry.methodRefs, []);
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

test('官方目录区分空壳、完整刷法与缺失状态', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const pressurePoint = core.getOfficialMod('/Lotus/Upgrades/Mods/Melee/WeaponMeleeDamageMod');
  const narrowMinded = core.getOfficialMod('Narrow Minded');
  assert.equal(pressurePoint.status, 'stub');
  assert.equal(narrowMinded.status, 'covered');
  assert.equal(core.listStubOfficialMods().some(mod => mod.uniqueName === pressurePoint.uniqueName), true);
  assert.equal(core.listMissingOfficialMods().some(mod => mod.uniqueName === pressurePoint.uniqueName), false);
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
