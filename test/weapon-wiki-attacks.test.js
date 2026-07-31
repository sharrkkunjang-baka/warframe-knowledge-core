'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createKnowledgeCore } = require('../src');
const { buildWeaponInfo, resolvePanelTitle } = require('../src/weapon-wiki-attacks');

test('wiki 面板标题映射与伤害提取', () => {
  const panel = resolvePanelTitle({ AttackName: 'Heavy Slam Attack' }, {});
  assert.equal(panel, '重型震地');
  const semi = resolvePanelTitle({ AttackName: 'Normal Attack', Trigger: 'Semi-Auto' }, { Trigger: 'Semi-Auto' });
  assert.equal(semi, '半自动');
});

test('getAcquisitionCard 为武器附带 weaponInfo', () => {
  const core = createKnowledgeCore();
  const card = core.getAcquisitionCard('Tenet Arca Plasmor');
  assert.equal(card.kind, 'weapon');
  assert.ok(card.weaponInfo);
  assert.ok(Array.isArray(card.weaponInfo.panels));
});

test('已同步 Wiki 攻击页的普通武器显示完整攻击模式与灵化面板', () => {
  const core = createKnowledgeCore();
  const card = core.getAcquisitionCard('海波单剑');
  assert.equal(card.kind, 'weapon');
  assert.equal(card.identity.canonical, 'Nami Solo');
  assert.equal(card.weaponInfo.masteryReq, 6);
  assert.equal(card.weaponInfo.disposition, 1.43);
  assert.equal(card.weaponInfo.panels.length, 4);
  assert.deepEqual(card.weaponInfo.panels.map(panel => panel.title), ['普通攻击', '震地', '重型震地', '范围攻击']);
  assert.deepEqual(card.weaponInfo.incarnonPanel, {
    id: 'incarnon-/Lotus/Weapons/Tenno/Melee/Swords/CutlassAndPoignard/TennoCutlass',
    title: '灵化形态',
    activation: '达到 6x 连击倍率后使用重击激活',
    durationSeconds: 180,
    damage: [],
    stats: [
      { kind: 'range-bonus', label: '范围', value: '+3' },
      { kind: 'melee-damage-bonus', label: '近战伤害', value: '+100%' },
      { kind: 'sprint-speed-bonus', label: '冲刺速度', value: '+20%' },
      { kind: 'parkour-velocity-bonus', label: '跑酷速度', value: '+20%' }
    ],
    source: 'wiki.warframe.com',
    provenance: {
      source: 'current-wiki-reviewed',
      pageTitle: 'Nami Solo Incarnon Genesis',
      url: 'https://wiki.warframe.com/w/Nami_Solo_Incarnon_Genesis',
      fetchedAt: '2026-07-25T13:58:00.000Z'
    }
  });
  const panel = card.weaponInfo.panels[0];
  assert.equal(panel.title, '普通攻击');
  assert.ok(panel.damage.some(item => item.canonical === 'Slash' && item.amount === 120.4));
  assert.ok(panel.stats.some(item => item.label === '暴击几率' && item.value === '15%'));
  assert.ok(panel.stats.some(item => item.label === '触发几率' && item.value === '25%'));
});

test('已同步 wiki attacks 时信条弧电离子枪含辐射伤害面板', () => {
  const attacksPath = path.join(__dirname, '..', 'knowledge', 'generated', 'weapon-wiki-attacks.json');
  if (!fs.existsSync(attacksPath)) return;
  const core = createKnowledgeCore();
  const entry = core.getWeapon('Tenet Arca Plasmor');
  const info = buildWeaponInfo(entry);
  assert.ok(info.panels.length >= 1);
  const primary = info.panels[0];
  assert.match(primary.title, /半自动/);
  assert.ok(primary.damage.some(item => item.canonical === 'Radiation' && item.displayName === '辐射' && item.amount === 760));
  const radial = info.panels.find(panel => panel.title === '范围攻击');
  assert.ok(radial);
  assert.ok(radial.damage.some(item => item.canonical === 'Radiation' && item.displayName === '辐射' && item.amount === 500));
});
