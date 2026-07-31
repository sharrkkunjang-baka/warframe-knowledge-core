'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('../src');
const { TABLE_ALIASES, parseAmpCommand } = require('../src/amp-components');

test('增幅器总表五个别名共享21部件审核契约', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  for (const alias of TABLE_ALIASES) assert.equal(parseAmpCommand(alias).kind, 'amp-table');
  const dto = core.getAmpCard('增幅器部件表');
  assert.equal(dto.kind, 'amp-table');
  assert.deepEqual(dto.groups.map(group => [group.displayName, group.rows.length]), [['夜羽', 4], ['小鸭子', 3]]);
  const components = dto.groups.flatMap(group => group.rows.flatMap(row => [row.prism, row.scaffold, row.brace]));
  assert.equal(components.length, 21);
  assert.equal(new Set(components.map(item => item.uniqueName)).size, 21);
  assert.equal(components.every(item => item.wikiPage.startsWith('https://wiki.warframe.com/')), true);
});

test('增幅器组合接受所有审核问法并按棱镜支架曲柄解析147', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  assert.equal(parseAmpCommand('147'), null);
  for (const input of ['增幅器 147', '增幅器组合 147', '增幅器147', '147增幅器', '147是什么', '什么是147']) {
    assert.deepEqual(parseAmpCommand(input), { kind: 'amp-combination', code: '147' }, input);
  }
  const dto = core.getAmpCard('增幅器 147');
  assert.deepEqual(dto.components.map(item => [item.slotLabel, item.component.displayName]), [
    ['棱镜', '拉普拉克棱镜'], ['支架', '法得支架'], ['曲柄', '瑟图斯曲柄']
  ]);
});

test('增幅器组合非法数字返回确定性错误且不把裸数字识别为命令', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  for (const input of ['增幅器 148', '增幅器0', '890增幅器', '12是什么', '什么是7777']) {
    const parsed = parseAmpCommand(input);
    assert.equal(parsed.kind, 'amp-error', input);
    assert.match(parsed.error, /三位整数.*1～7/, input);
    assert.equal(core.getAmpCard(input).kind, 'amp-error', input);
  }
  for (const input of ['147', '148', '什么是abc', 'abc增幅器']) assert.equal(parseAmpCommand(input), null, input);
});
