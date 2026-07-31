'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');

const core = createKnowledgeCore({ approvedOnly: false });

test('资源缓存 C 轮统一渲染为找到三个储藏箱且隔离被取代的旧活动节点', () => {
  const card = core.getAcquisitionCard('高压电流');
  assert.deepEqual(card.sections.acquisition, ['在阋神星/Naeglar的清巢任务中找到 3 个储藏箱概率获得']);
  assert.doesNotMatch(card.sections.acquisition.join('\n'), /Eris|Candiru|Lepis|Psoro|Viver|Caches|轮次 C|C轮/);
  const methods = core.getAcquisition('高压电流').structuredMethods.filter(method => method.type === 'mission-reward');
  assert.equal(methods.length, 1);
  assert.equal(methods[0].missionTypeId, 'mission-type.hive');
  assert.equal(methods[0].missionTypeDisplayName, '清巢');
  assert.equal(methods[0].locationDisplayName, '阋神星/Naeglar');
  assert.equal(methods[0].variables.objective, '找到 3 个储藏箱');
});
