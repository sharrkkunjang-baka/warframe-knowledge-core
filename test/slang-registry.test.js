'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src').createKnowledgeCore({ approvedOnly: false });

test('统一黑话注册表按功能域开放人工维护数据', () => {
  for (const domain of ['frames', 'fissures', 'mods', 'weapons', 'resources', 'consumables']) {
    const value = core.getSlangDomain(domain);
    assert.equal(typeof value, 'object', domain);
  }
  assert.deepEqual(core.resolveSlang('frames', '老9'), { alias: '老9', canonical: 'Cyte-09', category: 'frames', match: 'exact', score: 300 });
  assert.equal(core.resolveSlang('mods', '真相之yan').canonical, "Truth's Flame");
  assert.equal(core.resolveSlang('mods', 'zhenxiangzhiyan').canonical, "Truth's Flame");
});

test('黑话域返回副本，调用者不能修改核心数据', () => {
  const fissures = core.getSlangDomain('fissures');
  fissures.planetAliases.Void.push('污染');
  assert.equal(core.getSlangDomain('fissures').planetAliases.Void.includes('污染'), false);
});

test('审核英文错拼别名稳定解析炼狱轰击且不误配相近 Mod', () => {
  for (const query of ['Scattering Inferno', 'SCATTERING INFERNO', 'scarttering inferno']) {
    const mod = core.getOfficialMod(query);
    assert.equal(mod.canonical, 'Scattering Inferno', query);
    assert.equal(mod.displayName, '炼狱轰击', query);
    assert.equal(core.resolveItem(query).item.canonical, 'Scattering Inferno', query);
  }
  assert.equal(core.resolveSlang('mods', 'scarttering inferno').canonical, 'Scattering Inferno');
  assert.notEqual(core.getOfficialMod('Shattering Impact').canonical, 'Scattering Inferno');
  assert.notEqual(core.getOfficialMod('Shattering Storm').canonical, 'Scattering Inferno');
});
