'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src').createKnowledgeCore({ approvedOnly: false });

const CASES = [
  ['Liset', 'Liset', 'Liset', '覆写'],
  ['伺航', 'Skaut', '伺航', '卡尔信标'],
  ['午夜电波登陆艇', 'Nightwave', '午夜电波', '梦回者'],
  ['星察', 'Parallax', '星察', 'Orokin 之眼'],
  ['Mantis', 'Mantis', 'Mantis', '治愈之塔'],
  ['Scimitar', 'Scimitar', 'Scimitar', '地毯式轰炸'],
  ['Xiphos', 'Xiphos', 'Xiphos', '自动炮台']
];

test('七艘登陆艇统一进入共享获取卡且各自仅声明对应空中支援技能', () => {
  for (const [query, canonical, displayName, abilityName] of CASES) {
    const card = core.getAcquisitionCard(query);
    assert.equal(card?.kind, 'landing-craft', query);
    assert.equal(card.identity.canonical, canonical, query);
    assert.equal(card.identity.displayName, displayName, query);
    assert.deepEqual(card.abilities.map(ability => ability.displayName), [abilityName], query);
    assert.ok(card.abilities[0].description.length > 5, query);
    assert.ok(card.sections.acquisition.length > 0, query);
  }
});

test('星察保留已审核的扎里曼储物箱获取文本', () => {
  const card = core.getAcquisitionCard('星察');
  assert.deepEqual(card.sections.acquisition, [
    '星察总图：在商店购买',
    '星察机身：从扎里曼储物箱中获得',
    '星察引擎：从扎里曼储物箱中获得',
    '星察系统：从扎里曼储物箱中获得'
  ]);
});
