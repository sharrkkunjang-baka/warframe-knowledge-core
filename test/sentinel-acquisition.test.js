'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const { SENTINELS, resolveSentinel, auditSentinelAcquisition } = require('../src/sentinel-acquisition');

const core = createKnowledgeCore({ approvedOnly: false });

test('守护刷取目录覆盖全部 17 个 Sentinel', () => {
  const audit = auditSentinelAcquisition();
  assert.equal(audit.count, 17);
  assert.deepEqual(audit.missingMethods, []);
});

test('守护刷取可通过简中/英文/别名解析', () => {
  const matrix = [
    ['鹦鹉螺', 'Nautilus'],
    ['赫利俄斯 Prime', 'Helios Prime'],
    ['搬运者', 'Carrier'],
    ['棱晶阴影', 'Prisma Shade'],
    ['塔克桑', 'Taxon']
  ];
  for (const [query, canonical] of matrix) {
    assert.equal(resolveSentinel(query)?.canonical, canonical, query);
  }
});

test('每个守护都有结构化刷取说明且不含掉落概率表', () => {
  for (const sentinel of SENTINELS) {
    const result = core.getAcquisition(sentinel.displayName);
    assert.ok(result, sentinel.canonical);
    assert.ok(result.structuredMethods?.length, sentinel.canonical);
    assert.match(result.description, /同伴栏位/u, sentinel.canonical);
    assert.doesNotMatch(result.description, /\d+\.\d+%/u, sentinel.canonical);
    assert.doesNotMatch(result.description, /Expected|Nearly Guaranteed/u, sentinel.canonical);
  }
});

test('鹦鹉螺与 Prime 守护刷取语义', () => {
  const nautilus = core.getAcquisition('鹦鹉螺');
  assert.match(nautilus.description, /海王星比邻星域/u);
  assert.match(nautilus.description, /废弃冰矿.*破解终端.*资源缓存 B 轮/u);
  assert.match(nautilus.description, /时空坐标任务的 B\/C 轮/u);
  assert.doesNotMatch(nautilus.description, /前哨战兴趣点|海王星比邻星域的兴趣点/u);
  assert.doesNotMatch(nautilus.description, /暂未收录|未识别/u);

  const heliosPrime = core.getAcquisition('赫利俄斯 Prime');
  assert.match(heliosPrime.description, /已入库/u);
  assert.doesNotMatch(heliosPrime.description, /Lith |Meso |Neo |Axi /u);
});
