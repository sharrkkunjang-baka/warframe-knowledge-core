'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadData } = require('../src/loader');
const { build } = require('../scripts/sync-mission-type-gameplay');

const root = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'gameplay', 'mission-type-dispositions.json'), 'utf8'));

test('73 个任务类型正好拥有一个合法 disposition', () => {
  assert.equal(catalog.count, 73);
  assert.equal(catalog.entries.length, 73);
  assert.equal(new Set(catalog.entries.map(row => row.missionTypeId)).size, 73);
  assert.deepEqual(catalog, build().dispositions);
});

test('自动 gameplay 只提供证据边界明确的 draft 身份说明', () => {
  const generated = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'gameplay-generated', 'mission-types.json'), 'utf8'));
  assert.equal(generated.length, catalog.counts.generated);
  for (const entry of generated) {
    assert.equal(entry.layer, 'generated');
    assert.equal(entry.reviewStatus, 'draft');
    assert.equal(entry.qualityStatus, 'review-required');
    assert.deepEqual(entry.steps, []);
  }
});

test('approvedOnly 不发布自动低质量 gameplay', () => {
  const approved = loadData(root, { approvedOnly: true, includeGeneratedGameplay: true }).knowledge;
  const all = loadData(root, { approvedOnly: false, includeGeneratedGameplay: true }).knowledge;
  const runtime = loadData(root, { approvedOnly: false }).knowledge;
  assert.equal(approved.some(entry => entry.id.startsWith('gameplay.generated.')), false);
  assert.equal(all.some(entry => entry.id.startsWith('gameplay.generated.')), true);
  assert.equal(runtime.some(entry => entry.id.startsWith('gameplay.generated.')), false);
});
