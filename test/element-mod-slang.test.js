'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const { CATEGORIES, ELEMENTS } = require('../src/element-mod-slang');
const core = createKnowledgeCore({ approvedOnly: false });

test('1442 官方目录生成完整金银元素关系审计', () => {
  assert.equal(core.elementModSlang.catalogCount, 1442);
  assert.equal(core.elementModSlang.audit.length, CATEGORIES.length * Object.keys(ELEMENTS).length * 2);
  assert.deepEqual(core.elementModSlang.counts, { automatic: 48, manualResolved: 1, resolved: 48, missing: 0, ambiguous: 0 });
  assert.equal(core.elementModSlang.audit.every(item => item.status === 'resolved'), true);
});

test('所有审核类别别称覆盖前后置空格金银活动矩阵', () => {
  for (const category of CATEGORIES) for (const alias of category.aliases) for (const element of Object.keys(ELEMENTS)) for (const modifier of ['金', '活动', '银']) {
    for (const query of [`${alias}${modifier}${element}`, `${modifier}${element}${alias}`, `${alias} ${modifier}${element}`, `${modifier}${element} ${alias}`]) {
      assert.equal(core.resolveElementModSlang(query).status, 'resolved', query);
    }
  }
});

test('用户金卡、银卡、活动元素与功能型例子绑定稳定身份', () => {
  const cases = {
    手枪金冰: ['/Lotus/Upgrades/Mods/Pistol/DualStat/IceEventPistolMod', '结霜侵蚀'],
    近战金电: ['/Lotus/Upgrades/Mods/Melee/DualStat/ElectEventMeleeMod', '伏打电能'],
    步枪金冰: ['/Lotus/Upgrades/Mods/Rifle/DualStat/IceEventRifleMod', '白霜弹头'],
    空战金电: ['/Lotus/Upgrades/Mods/Archwing/Rifle/ArchwingEventElectricStatusRifleMod', '带电子弹'],
    近战效率电: ['/Lotus/Upgrades/Mods/Melee/DualStat/FocusEnergyMod', '聚焦能量'],
    近战银毒: ['/Lotus/Upgrades/Mods/Melee/Expert/WeaponToxinDamageModExpert', '热病打击 Prime'],
    手枪银电: ['/Lotus/Upgrades/Mods/Pistol/Expert/PrimedWeaponElectricityDamageMod', '痉挛 Prime'],
    步枪活动电: ['/Lotus/Upgrades/Mods/Rifle/DualStat/ElectEventRifleMod', '高压电流'],
    活动电步枪: ['/Lotus/Upgrades/Mods/Rifle/DualStat/ElectEventRifleMod', '高压电流'],
    主手活动电: ['/Lotus/Upgrades/Mods/Rifle/DualStat/ElectEventRifleMod', '高压电流']
  };
  for (const [query, [uniqueName, displayName]] of Object.entries(cases)) {
    const relation = core.resolveElementModSlang(query).relation;
    assert.equal(relation.uniqueName, uniqueName, query);
    assert.equal(relation.displayName, displayName, query);
  }
  assert.equal(core.resolveElementModSlang('手枪银毒').relation.displayName, '病原弹头');
  assert.notEqual(core.resolveElementModSlang('手枪银电').relation.displayName, '病原弹头');
  assert.equal(core.resolveElementModSlang('活动').status, 'missing');
});
