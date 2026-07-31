'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCoreVectorDocuments, wikiSectionDocuments, stableId, sanitizeUnicode } = require('../src/vector-documents');

test('核心向量文档覆盖所有统一类别且稳定 ID 唯一', () => {
  const docs = buildCoreVectorDocuments({ root: require('node:path').resolve(__dirname, '..'), approvedOnly: true });
  assert.ok(docs.length > 4000, `expected broad coverage, got ${docs.length}`);
  assert.equal(new Set(docs.map(doc => doc.id)).size, docs.length);
  const categories = new Set(docs.map(doc => doc.metadata.category));
  for (const category of ['mod', 'weapon', 'ability', 'locations', 'npcs', 'quests', 'enemies', 'missionTypes']) assert.ok(categories.has(category), category);
  assert.ok(docs.some(doc => /急冻喷枪/.test(doc.document) && doc.metadata.category === 'weapon'));
  const heat = docs.find(doc => doc.metadata.sourceId === 'fact.status.heat-mechanics');
  assert.ok(heat, '火焰完整机制必须进入统一向量文档');
  assert.match(heat.document, /第一跳在1秒后/);
  assert.match(heat.document, /社区术语/);
  assert.ok(docs.some(doc => doc.metadata.sourceType === 'knowledge-core' && doc.metadata.canonical));
});

test('Unicode 清洗仅移除孤立代理字符并保留合法非 BMP 字符', () => {
  assert.equal(sanitizeUnicode(`A\uD800B\uDC00C😀D`), 'ABC😀D');
});

test('Wiki 每页生成一个稳定语义文档并清除 Fandom/Wikia URL', () => {
  const page = {
    pageId: 42,
    revisionId: 9,
    title: 'Example Item',
    timestamp: '2026-07-26T00:00:00Z',
    syncedAt: '2026-07-26T00:01:00Z',
    aliases: ['示例物品'],
    categories: ['Weapons'],
    sections: [
      { title: 'Usage', ordinal: 1, text: `官方正文 https://warframe.fandom.com/wiki/Bad ${'甲'.repeat(1200)}` },
      { title: 'Notes', ordinal: 2, text: '补充\uD800机制😀' }
    ]
  };
  const docs = wikiSectionDocuments(page, { maxChars: 800, sectionChars: 400 });
  assert.equal(docs.length, 1);
  assert.equal(docs[0].metadata.sourceUrl, 'https://wiki.warframe.com/w/Example_Item');
  assert.match(docs[0].document, /Usage/);
  assert.match(docs[0].document, /Notes/);
  assert.match(docs[0].document, /补充机制😀/);
  assert.doesNotMatch(docs[0].document, /fandom|wikia/i);
  assert.equal(docs[0].id, stableId('wiki-page', '42'));
});
