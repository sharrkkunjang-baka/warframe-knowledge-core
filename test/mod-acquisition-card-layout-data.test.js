'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('..');

test('Mod 获取卡提供描述、极性和有证据的满级消耗', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const quick = core.getAcquisitionCard('快速休整');
  assert.equal(quick.modInfo.polarity, 'zenurik');
  assert.deepEqual(quick.modInfo.descriptionLines, ['过载护盾未激活时，小队成员消耗的 150% 能量将转化为护盾。']);
  assert.equal(quick.modInfo.fusionCost.endo, 620);
  assert.equal(quick.modInfo.fusionCost.credits, 29946);
  assert.equal(quick.modInfo.fusionCost.status, 'calculated');

  const galvanized = core.getAcquisitionCard('镀层增幅线圈');
  assert.equal(galvanized.modInfo.fusionCost.endo, 30690);
  assert.equal(galvanized.modInfo.fusionCost.credits, 1482327);
  assert.deepEqual(galvanized.modInfo.descriptionLines, [
    '+50% 重击效率',
    '近战击杀时： +20 初始连击，持续 20 秒。最多叠加到 4 层。'
  ]);

  const growing = core.getAcquisitionCard('成长之力');
  assert.ok(growing.relatedItems.some(item => item.status === 'expanded' && /落银树庭圣所/.test(item.text)));
  assert.ok(growing.relatedItems.every(item => !/^刷\s/.test(item.text)));
});

test('Mod 获取卡保留套装效果并按来源语义分类', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const setMod = core.getAcquisitionCard('预言启示');
  assert.ok(setMod.modInfo.descriptionLines.includes('套装效果：40% 用在技能上的能量将转化成护盾。'));
  assert.ok(setMod.sectionItems.enemy.every(item => item.methodType === 'enemy-drop'));
  assert.ok(setMod.sectionItems.other.every(item => item.methodType === 'mission-reward'));
  assert.ok(!setMod.sectionItems.enemy.some(item => /赏金|瘟疫之星/.test(item.text)));
});

test('兑换货币通过 currency 实体 ID 输出身份和数量', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const card = core.getAcquisitionCard('镀层增幅线圈');
  const currency = card.sectionItems.exchange[0].currencies[0];
  assert.deepEqual(currency, {
    id: 'currency.vitus-essence',
    canonical: 'Vitus Essence',
    displayName: '生息精华',
    officialUniqueName: '/Lotus/Types/Items/MiscItems/Elitium',
    amount: 20
  });
});
