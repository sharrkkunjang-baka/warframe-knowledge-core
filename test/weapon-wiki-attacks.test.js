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
