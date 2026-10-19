'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');

const core = createKnowledgeCore({ approvedOnly: false });

test('九重天特殊获取目标不会回归成泛称前哨战兴趣点', () => {
  const nautilus = core.getAcquisition('Nautilus').description;
  const quellor = core.getAcquisition('Quellor').description;
  const ignis = core.getAcquisition('Ignis Wraith').description;
  const spectra = core.getAcquisition('Spectra Vandal').description;
  const athodai = core.getAcquisition('Athodai').description;
  const carmine = core.getAcquisition('Carmine Penta').description;
  const ignisCard = core.getAcquisitionCard('Ignis Wraith');
  const spectraCard = core.getAcquisitionCard('Spectra Vandal');
  const carmineCard = core.getAcquisitionCard('Carmine Penta');

  assert.match(nautilus, /废弃冰矿.*破解终端.*资源缓存 B 轮/u);
  assert.match(quellor, /Pyr 舰长|Glacik 指挥官/u);
  assert.doesNotMatch(quellor, /兴趣点|资源缓存/u);
  assert.deepEqual(ignisCard.sections.acquisition, ['总图：面纱比邻星域前哨战白点（概率）']);
  assert.deepEqual(spectraCard.sections.acquisition, ['总图及全部部件：面纱比邻星域前哨战白点（概率）']);
  assert.match(athodai, /废弃运联站.*破解终端.*资源缓存 B 轮/u);
  assert.deepEqual(carmineCard.sections.acquisition, ['总图及全部部件：面纱比邻星域前哨战白点（概率）']);

  for (const text of [nautilus, quellor, ignis, spectra, athodai, carmine]) {
    assert.doesNotMatch(text, /前哨战兴趣点|任务缓存任务|找到 3 个储藏箱/u);
  }
});
