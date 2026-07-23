'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REQUIEM_MOD_CANONICALS,
  TECHROT_LICH_PASSWORD_MOD,
  getRequiemModUsageLines,
  getLichPasswordModUsageLines
} = require('../src/requiem-mod-usage');

test('安魂 Mod 统一输出玄骸解密密码说明', () => {
  for (const canonical of REQUIEM_MOD_CANONICALS) {
    const lines = getRequiemModUsageLines(canonical);
    assert.ok(lines[0].includes('玄骸解密'), canonical);
    assert.ok(lines.some(line => line.includes('科腐系玄骸') && line.includes(TECHROT_LICH_PASSWORD_MOD.displayName)), canonical);
  }
});

test('Oull 额外标注可视为任意密码', () => {
  assert.deepEqual(getRequiemModUsageLines('Oull'), [
    '可用于玄骸解密的密码',
    '可视为任意密码',
    `科腐系玄骸请使用${TECHROT_LICH_PASSWORD_MOD.playerAlias}（${TECHROT_LICH_PASSWORD_MOD.displayName}）`
  ]);
});

test('Vome 仅输出基础密码说明与科腐提醒', () => {
  assert.deepEqual(getRequiemModUsageLines('Vome'), [
    '可用于玄骸解密的密码',
    `科腐系玄骸请使用${TECHROT_LICH_PASSWORD_MOD.playerAlias}（${TECHROT_LICH_PASSWORD_MOD.displayName}）`
  ]);
  assert.ok(!getRequiemModUsageLines('Vome').some(line => line.includes('可视为任意密码')));
});

test('蠕虫驱逐单独标注科腐系玄骸密码用途', () => {
  const entry = { subject: { canonical: TECHROT_LICH_PASSWORD_MOD.canonical, categoryRefs: ['parazonmod'] } };
  assert.deepEqual(getLichPasswordModUsageLines(entry), ['可用于科腐系玄骸解密的密码']);
});
