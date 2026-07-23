'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('..');

test('急进猛突间谍掉落进入获取途径并展开间谍 C 轮玩法', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const card = core.getAcquisitionCard('急进猛突');
  const acquisitionText = card.sectionItems.acquisition.map(item => item.text).join('\n');

  assert.ok(card.sectionItems.acquisition.some(item => /月球间谍\s*A轮概率获得/.test(item.text)), acquisitionText);
  assert.ok(card.sectionItems.acquisition.every(item => !/一个/.test(item.text)), acquisitionText);
  assert.equal(card.sectionItems.other.length, 0);
  assert.ok(card.detailOptions.some(option => option.id === 'gameplay.spy-missions' && option.query === '间谍'));
  assert.ok(card.relatedItems.some(item => /三个金库|C\s*轮/.test(item.text)), card.relatedItems.map(item => item.text).join('\n'));
});

test('全部间谍轮换 Mod 掉落统一省略单个数量措辞', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const samples = ['Rush', 'North Wind', 'Blood Rush', 'Rime Rounds'];
  for (const query of samples) {
    const card = core.getAcquisitionCard(query);
    const spyLines = (card.sectionItems.acquisition || []).filter(item => /间谍/.test(item.text));
    if (!spyLines.length) continue;
    assert.ok(spyLines.every(item => !/一个/.test(item.text)), `${query}: ${spyLines.map(item => item.text).join(' | ')}`);
    assert.ok(spyLines.every(item => /概率获得/.test(item.text)), `${query}: ${spyLines.map(item => item.text).join(' | ')}`);
  }
});

test('白霜弹头间谍掉落按 T 级与月球分行，不输出空泛间谍行', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  const result = core.getAcquisition('Rime Rounds');
  const card = core.getAcquisitionCard('Rime Rounds');
  const spyLines = (card.sectionItems.acquisition || []).filter(item => /间谍/.test(item.text)).map(item => item.text);
  assert.ok(result.description.includes('T2间谍 C轮概率获得'), result.description);
  assert.ok(result.description.includes('月球间谍 C轮概率获得'), result.description);
  assert.equal(result.description.includes('完成（间谍）'), false, result.description);
  assert.equal(result.description.match(/^间谍$/m), null, result.description);
  assert.deepEqual(spyLines, ['T2间谍 C轮概率获得', '月球间谍 C轮概率获得']);
});
