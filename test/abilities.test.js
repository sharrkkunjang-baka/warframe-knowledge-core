'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const core = createKnowledgeCore();

test('普通战甲技能具有官方简中且支持中英文解析', () => {
  const vauban = core.listAbilities({ frame: 'Vauban' });
  assert.equal(vauban.length, 4);
  assert.equal(core.resolveAbility('布雷器').ability.canonical, 'Minelayer');
  assert.equal(core.resolveAbility('Minelayer').ability.displayName, '布雷器');
});

test('Sirius 与 Orion 双形态收录七个唯一技能并共享 Celestial Clash', () => {
  const sirius = core.listAbilities({ form: 'Sirius' }), orion = core.listAbilities({ form: 'Orion' });
  assert.equal(sirius.length, 4); assert.equal(orion.length, 4);
  const unique = new Set([...sirius, ...orion].map(item => item.abilityId));
  assert.equal(unique.size, 7);
  const shared = [...unique].map(id => core.listAbilities().find(item => item.abilityId === id)).find(item => item.owners.length === 2);
  assert.equal(shared.canonical, 'Celestial Clash');
});

test('近期 Temple 与 Uriel 均完整收录四技能', () => {
  assert.equal(core.listAbilities({ frame: 'Temple' }).length, 4);
  assert.equal(core.listAbilities({ frame: 'Uriel' }).length, 4);
  assert.equal(core.listAbilities({ frame: 'Temple' }).every(item => item.review.status === 'official-zh'), true);
  assert.equal(core.listAbilities({ frame: 'Uriel' }).every(item => item.review.status === 'official-zh'), true);
});

test('同名技能不静默选取并可用战甲和槽位消歧', () => {
  const catalog = core.listAbilities();
  const groups = new Map();
  for (const ability of catalog) (groups.get(ability.displayName) || groups.set(ability.displayName, []).get(ability.displayName)).push(ability);
  const duplicate = [...groups.entries()].find(([, items]) => items.length > 1);
  if (duplicate) assert.equal(core.resolveAbility(duplicate[0]).ambiguous, true);
  assert.equal(core.listAbilities({ frame: 'Vauban', slot: 2 })[0].displayName, '布雷器');
});
