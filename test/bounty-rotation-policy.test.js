'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const { localizeAcquisitionText, stripBountyRotationTerms } = require('../src/acquisition-protocol');

const core = createKnowledgeCore({ approvedOnly: false });

test('所有赏金用户可见来源统一剥离 A B C 和 Rotation 轮次', () => {
  for (const source of [
    '深矿赏金 B/C 轮结算奖励',
    '阿尔布雷希特的实验室 115-120 级赏金 C轮',
    'WF1999 Bounty Rotation C',
    '合一众赏金 A/B/C轮'
  ]) {
    const localized = localizeAcquisitionText(source);
    assert.doesNotMatch(localized, /(?:[ABC](?:\s*[\/、,，]\s*[ABC])?\s*轮|Rotation\s*[ABC])/i, source);
  }
  assert.equal(stripBountyRotationTerms('深矿赏金 B/C 轮结算奖励'), '深矿赏金结算奖励');
});

test('五个夜帽赋能统一显示深矿赏金结算奖励概率且不暴露轮次', () => {
  for (const query of ['主要·毒侵', '主要·霜冻', '联结·电压', '次要·妨害', '次要·筑垒']) {
    const result = core.getAcquisition(query);
    assert.match(result.description, /深矿赏金结算奖励（概率）/, query);
    assert.doesNotMatch(result.description, /深矿赏金[^\n]*(?:[ABC](?:\s*[\/、,，]\s*[ABC])?\s*轮|Rotation\s*[ABC])/, query);
  }
});

test('夜帽和言录使全组来源由当前 Wiki 证据结构化发布', () => {
  const nightcap = ['主要·毒侵', '主要·霜冻', '联结·电压', '次要·妨害', '次要·筑垒'];
  for (const query of nightcap) {
    const result = core.getAcquisition(query);
    assert.match(result.description, /夜帽处消耗10个铁离石兑换/, query);
    assert.match(result.description, /深矿赏金结算奖励（概率）/, query);
  }
  const acrithis = ['弓箭·利矢', '魔导·侵略', '主要·毒侵', '主要·激昂', '主要·滞阻', '次要·爆发', '次要·冷颤', '霰弹·仇杀', '赋能·心相', '赋能·收割', '赋能·力升', '双枪·滑射'];
  for (const query of acrithis) {
    const result = core.getAcquisition(query);
    assert.match(result.description, /言录使处消耗(?:10|20)个苦栓兑换/, query);
    assert.match(result.description, /钢铁之路无尽回廊每周进度奖励/, query);
    assert.match(result.description, /钢铁之路双衍王境地下密室传送门奖励（概率）/, query);
  }
});
