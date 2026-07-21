'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const { expandKnowledgeReferences } = require('../src/knowledge-reference-expander');

const core = createKnowledgeCore({ approvedOnly: false });

test('沉沦之地实体保持地点、玩法和任务类型分离', () => {
  const region = core.getLocation('region.dark-refractory');
  const activity = core.getLocation('activity.the-descendia');
  const missionType = core.getMissionType('mission-type.the-descendia');
  const bossSource = core.getLocation('acquisition-source.roathes-oblivion');

  assert.equal(region.canonical, 'The Dark Refractory');
  assert.equal(region.displayName, '深溯池');
  assert.equal(region.parentId, 'planet.deimos');
  assert.equal(activity.canonical, 'The Descendia');
  assert.equal(activity.displayName, '沉沦之地');
  assert.equal(activity.parentId, region.id);
  assert.equal(activity.missionTypeId, missionType.id);
  assert.equal(missionType.officialCode, 'MT_DESCENT');
  assert.equal(bossSource.canonical, "Roathe's Oblivion");
  assert.equal(bossSource.displayName, '罗瑟的遗忘');
  assert.equal(bossSource.parentId, activity.id);
  assert.notEqual(region.id, activity.id);
  assert.notEqual(activity.id, missionType.id);
});

test('三种刷取别名精确进入同一沉沦之地玩法', () => {
  for (const query of ['爬塔', '沉沦', '沉沦之地']) {
    const result = core.getGameplay(query);
    assert.equal(result?.entry?.id, 'gameplay.the-descendia', query);
    assert.equal(result?.resolution?.match, 'exact', query);
  }
});

test('沉沦之地结构化覆盖层数、存档、头目、掉落和钢铁证据边界', () => {
  const entry = core.getGameplay('沉沦之地').entry;
  assert.equal(entry.activity.randomChallengeInfernums, 20);
  assert.deepEqual(entry.activity.checkpointInfernums, [7, 14, 21]);
  assert.deepEqual(entry.activity.blessings.map(item => [item.infernum, item.choiceCount]), [[7, 2], [14, 2]]);
  assert.equal(entry.activity.boss.canonical, 'Roathe');
  assert.equal(entry.activity.boss.infernum, 21);
  assert.equal(entry.activity.repeatableRewards[0].chancePercentEach, 12.5);
  assert.equal(entry.activity.repeatableRewards[1].chancePercentEach, 12.5);
  assert.equal(entry.activity.repeatableRewards[1].outcomeCount, 5);
  assert.equal(entry.activity.roatheRewardTable.length, 8);
  assert.equal(entry.activity.roatheRewardTable.every(item => item.chancePercent === 12.5), true);
  assert.deepEqual(entry.activity.roatheRewardTable.map(item => item.canonical), [
    'Uriel Neuroptics Blueprint',
    'Uriel Chassis Blueprint',
    'Uriel Systems Blueprint',
    'Vinquibus Blueprint',
    'Vinquibus Blade Blueprint',
    'Vinquibus Barrel Blueprint',
    'Vinquibus Receiver Blueprint',
    'Vinquibus Stock Blueprint'
  ]);
  assert.equal(entry.activity.urielMainBlueprint.exchange.amount, 75);
  assert.equal(entry.activity.steelPath.activityWideDamageAttenuation, false);
  assert.equal(entry.activity.steelPath.roatheDamageAttenuation.applies, null);
  assert.equal(entry.activity.steelPath.roatheDamageAttenuation.reviewStatus, 'review-required');
});

test('沉沦之地知识引用展开为正文而非残留命令', () => {
  const expanded = expandKnowledgeReferences([{ id: 'gameplay.the-descendia', title: '沉沦之地' }], {
    resolve: reference => core.getGameplay(reference)
  });
  assert.equal(expanded.length, 1);
  assert.equal(expanded[0].status, 'expanded');
  assert.match(expanded[0].text, /前 20 层/);
  assert.match(expanded[0].text, /第 7、14、21 层为存档点/);
  assert.match(expanded[0].text, /击败罗瑟必定获得 8 项之一/);
  assert.doesNotMatch(expanded[0].text, /^刷\s/);
});
