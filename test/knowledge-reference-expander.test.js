'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { expandKnowledgeReferences, parseKnowledgeReference } = require('../src/knowledge-reference-expander');

test('只识别明确知识引用，不把普通正文当命令', () => {
  assert.equal(parseKnowledgeReference('刷 药剂').query, '药剂');
  assert.equal(parseKnowledgeReference('{知识引用|药剂}').query, '药剂');
  assert.equal(parseKnowledgeReference('去银光林地刷魅影'), null);
});

test('知识引用展开正文并去重', () => {
  const entry = { id: 'gameplay.apothic', title: '药剂', summary: '在地球森林的落银树庭圣所使用药剂。' };
  const expanded = expandKnowledgeReferences(['刷 药剂', { id: 'gameplay.apothic', title: '药剂' }], {
    resolve: () => ({ entry })
  });
  assert.equal(expanded.length, 1);
  assert.equal(expanded[0].status, 'expanded');
  assert.match(expanded[0].text, /落银树庭圣所/);
});

test('循环、深度和未知引用均安全终止', () => {
  const entries = {
    a: { id: 'a', summary: 'A', references: [{ id: 'b' }] },
    b: { id: 'b', summary: 'B', references: [{ id: 'a' }] },
    deep1: { id: 'deep1', summary: 'D1', references: [{ id: 'deep2' }] },
    deep2: { id: 'deep2', summary: 'D2', references: [{ id: 'deep3' }] },
    deep3: { id: 'deep3', summary: 'D3' }
  };
  const resolve = id => entries[id] ? { entry: entries[id] } : null;
  const cycle = expandKnowledgeReferences([{ id: 'a' }], { resolve });
  assert.ok(cycle.some(item => item.status === 'cycle'));
  const depth = expandKnowledgeReferences([{ id: 'deep1' }], { resolve, maxDepth: 1 });
  assert.ok(depth.some(item => item.status === 'depth-limit'));
  const missing = expandKnowledgeReferences(['刷 未知玩法'], { resolve });
  assert.equal(missing[0].status, 'missing');
  assert.match(missing[0].text, /明确缺失/);
});
