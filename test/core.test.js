'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');

const core = createKnowledgeCore();

test('精确社区别名统一解析', () => {
  assert.equal(core.resolveName('蛆爹').canonical, 'Nidus');
  assert.equal(core.resolveName('花甲').canonical, 'Wisp');
  assert.equal(core.resolveName('吉他哥').canonical, 'Temple');
});

test('加权拼音支持缺失中间音节', () => {
  assert.equal(core.resolveName('心智狭').canonical, 'Narrow Minded');
  assert.equal(core.resolveName('乐音').canonical, 'Euphona Prime');
});

test('知识检索区分事实与加工知识', () => {
  assert.equal(core.searchFacts('增幅器')[0].id, 'fact.amp.numbering');
  assert.equal(core.searchKnowledge('九重天')[0].id, 'knowledge.railjack.outpost-carry');
});

test('术语归一化复用单一表', () => {
  assert.equal(core.normalizeTerms('法穆里安与夜幕安神香'), '巨人战舰与夜幕药剂');
});

test('上下文包含来源和加工知识', () => {
  const context = core.buildWikiContext('增幅器');
  assert.match(context.text, /Warframe Wiki/);
  assert.match(context.text, /编号是部件解锁顺序/);
});

test('同一解析器接受调用方动态官方候选', () => {
  const candidates = [
    { alias: '恶毒弹匣', canonical: 'Primed Venomous Clip', category: 'official', priority: 3 },
    { alias: '恶毒偏折', canonical: 'Venomous Clip', category: 'official', priority: 1 }
  ];
  assert.equal(core.resolveName('恶毒弹匣', { candidates }).canonical, 'Primed Venomous Clip');
  assert.equal(core.resolveName('恶毒弹', { candidates }).canonical, 'Primed Venomous Clip');
});

test('统一解析器支持类别过滤与共享黑话', () => {
  assert.equal(core.resolveName('电妹', { categories: ['frame'] }).canonical, 'Gyre');
  assert.equal(core.resolveName('金首发', { categories: ['term'] }).canonical, 'Primed Chamber');
  assert.equal(core.resolveName('玻棍', { categories: ['term'] }).canonical, 'Bo Prime Set');
});

test('近分候选返回统一歧义结构', () => {
  const candidates = [
    { alias: '成长之力', canonical: 'Growing Power', category: 'official' },
    { alias: '成长纹章', canonical: 'Growth Badge', category: 'official' }
  ];
  const result = core.resolveName('成长', { candidates, minLead: 5 });
  assert.ok(result.ambiguous);
  assert.deepEqual(result.ambiguous.map(item => item.canonical), ['Growing Power', 'Growth Badge']);
});
