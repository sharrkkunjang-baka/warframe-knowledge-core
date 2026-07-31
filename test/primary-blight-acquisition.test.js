'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');

const core = createKnowledgeCore({ approvedOnly: false });

test('主要毒侵发布夜帽兑换、深矿赏金、言录使轮换及钢铁回廊来源', () => {
  const result = core.getAcquisition('主要·毒侵');
  assert.ok(result);
  assert.match(result.description, /福尔图娜的夜帽处消耗10个铁离石兑换/);
  assert.match(result.description, /10个铁离石/);
  assert.match(result.description, /深矿赏金结算奖励（概率）/);
  assert.doesNotMatch(result.description, /赏金[^\n]*(?:[ABC](?:\s*[\/、,，]\s*[ABC])?\s*轮|Rotation\s*[ABC])/i);
  assert.match(result.description, /宿舍的言录使处消耗10个苦栓兑换/);
  assert.match(result.description, /10个苦栓/);
  assert.match(result.description, /钢铁之路无尽回廊第 1 阶段奖励/);
  assert.doesNotMatch(result.description, /言录使每周奖励|Fergolyte|Pathos Clamp|Nightcap|Acrithis|指定任务/);
  const nightcap = result.structuredMethods.find(method => method.sourceEntityId === 'npc.nightcap');
  assert.deepEqual(nightcap.requirements.currency, [{ currencyId: 'currency.fergolyte', amount: 10 }]);
  const acrithis = result.structuredMethods.find(method => method.sourceEntityId === 'npc.acrithis');
  assert.deepEqual(acrithis.requirements.currency, [{ currencyId: 'currency.pathos-clamp', amount: 10 }]);
  const bounty = result.structuredMethods.find(method => method.sourceCanonical === 'Deepmines Bounties from Nightcap');
  assert.equal(bounty.sourceKind, 'mission-reward');
  assert.equal(bounty.reviewStatus, 'approved');
});
