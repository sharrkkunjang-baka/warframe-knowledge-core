'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const frameAcquisition = require('../src/frame-acquisition');
const frameCard = require('../src/frame-card');

test('全部可查询战甲都有等级0和等级30基础数值及四个主动技能', () => {
  const queryable = frameAcquisition.listWarframes();
  const audit = frameCard.auditFrameCardMetadata();
  assert.equal(audit.expected, queryable.length);
  assert.equal(audit.found, queryable.length);
  assert.deepEqual(audit.malformed, []);
  for (const summary of queryable) {
    const dto = frameCard.buildFrameCardDTO(summary.canonical);
    assert.ok(dto, summary.canonical);
    assert.equal(dto.frameId, summary.officialUniqueName);
    assert.equal(dto.stats.length, 5);
    assert.equal(dto.abilities.length, 4);
    assert.equal(new Set(dto.abilities.map(ability => ability.abilityId)).size, 4);
    assert.match(dto.statPolicy.rank0, /Public Export/);
    assert.match(dto.statPolicy.rank30, /util\.wasm/);
  }
});

test('Public Export 数值按等级口径缩放且不使用配卡数值', () => {
  const excalibur = frameCard.buildFrameCardDTO('Excalibur');
  const values = Object.fromEntries(excalibur.stats.map(stat => [stat.key, stat]));
  assert.deepEqual([values.health.rank0, values.health.rank30], [270, 370]);
  assert.deepEqual([values.shield.rank0, values.shield.rank30], [270, 370]);
  assert.deepEqual([values.energy.rank0, values.energy.rank30], [100, 150]);
  assert.deepEqual([values.armor.rank0, values.armor.rank30], [240, 240]);
  assert.deepEqual([values.sprintSpeed.rank0, values.sprintSpeed.rank30], [1, 1]);
});

test('Prime 和真实变体锁定自身 stats，禁止回退普通版', () => {
  const rhino = frameCard.buildFrameCardDTO('Rhino');
  const prime = frameCard.buildFrameCardDTO('Rhino Prime');
  const umbra = frameCard.buildFrameCardDTO('Excalibur Umbra');
  assert.notEqual(prime.frameId, rhino.frameId);
  assert.equal(rhino.stats.find(stat => stat.key === 'armor').rank0, 240);
  assert.equal(prime.stats.find(stat => stat.key === 'armor').rank0, 290);
  assert.equal(rhino.stats.find(stat => stat.key === 'sprintSpeed').rank0, 0.95);
  assert.equal(prime.stats.find(stat => stat.key === 'sprintSpeed').rank0, 1);
  assert.equal(umbra.stats.find(stat => stat.key === 'energy').rank0, 175);
});

test('Prime 继承技能身份但 stats 独立，Helminth 只按权威映射标记', () => {
  const rhino = frameCard.buildFrameCardDTO('Rhino');
  const prime = frameCard.buildFrameCardDTO('Rhino Prime');
  assert.deepEqual(prime.abilities.map(ability => ability.abilityId), rhino.abilities.map(ability => ability.abilityId));
  assert.deepEqual(prime.abilities.filter(ability => ability.helminthSubsumable).map(ability => ability.canonical), ['Roar']);
  assert.deepEqual(frameCard.buildFrameCardDTO('Uriel').abilities.filter(ability => ability.helminthSubsumable).map(ability => ability.displayName), ['恶魔再生']);
  assert.deepEqual(frameCard.buildFrameCardDTO('Excalibur Umbra').abilities.filter(ability => ability.helminthSubsumable), []);
});

test('无盾战甲明确显示 0 且不伪造成缺失字段', () => {
  const nidus = frameCard.buildFrameCardDTO('Nidus');
  const shield = nidus.stats.find(stat => stat.key === 'shield');
  assert.deepEqual(shield, { key: 'shield', label: '护盾', rank0: 0, rank30: 0, grows: false });
});

test('Uriel 官方显示名与五个稳定身份来自 Public Export', () => {
  const entry = frameAcquisition.getWarframeKnowledge('Uriel');
  const generated = entry.frameAcquisition.generated;
  assert.equal(entry.subject.displayName, 'Uriel');
  assert.equal(generated.identities.frame, '/Lotus/Powersuits/DemonFrame/DemonFrame');
  assert.equal(generated.identities.blueprint, '/Lotus/Types/Recipes/WarframeRecipes/UrielBlueprint');
  assert.equal(generated.identities.neuroptics.component, '/Lotus/Types/Recipes/WarframeRecipes/UrielHelmetComponent');
  assert.equal(generated.identities.chassis.component, '/Lotus/Types/Recipes/WarframeRecipes/UrielChassisComponent');
  assert.equal(generated.identities.systems.component, '/Lotus/Types/Recipes/WarframeRecipes/UrielSystemsComponent');
  assert.deepEqual(generated.components.map(component => component.part), ['Blueprint', 'Neuroptics', 'Chassis', 'Systems']);
});
