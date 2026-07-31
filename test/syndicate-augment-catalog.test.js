'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../generated/syndicate-augment-catalog.json');
const { parseWikiBinding, stableTargetId } = require('../scripts/build-syndicate-augment-catalog');
const { auditCatalog } = require('../scripts/audit-syndicate-augment-catalog');

test('集团卡目录使用稳定 Mod ID 并保留权威证据', () => {
  assert.ok(catalog.count > 100);
  assert.equal(catalog.count, catalog.entries.length);
  for (const entry of catalog.entries) {
    assert.match(entry.modId, /^\/Lotus\//, entry.canonical);
    assert.ok(entry.evidence.some(item => item.source === 'knowledge/categories/official.json'), entry.canonical);
    if (entry.status !== 'review-required') {
      assert.ok(entry.frame?.familyId, entry.canonical);
      assert.ok(entry.target?.id, entry.canonical);
      assert.ok(entry.evidence.some(item => item.source === 'local-wiki-sqlite' || item.kind === 'manual-review'), entry.canonical);
    }
  }
});

test('Wiki 只从明确的技能或被动标签生成绑定', () => {
  assert.deepEqual(parseWikiBinding('Description Passive Augment: effect', 'Lavos'), { kind: 'passive', canonical: 'Lavos Passive', evidence: 'Description Passive Augment' });
  assert.deepEqual(parseWikiBinding("X is a Warframe Augment Mod for Nova's Molecular Prime that changes it.", 'Nova'), { kind: 'ability', canonical: 'Molecular Prime', evidence: 'Wiki lead sentence' });
  assert.equal(parseWikiBinding('No authoritative target here.', 'Nova'), null);
  assert.match(stableTargetId('ability', 'Molecular Prime'), /^ability:molecular-prime-[a-f0-9]{8}$/);
});

test('质量门发现孤立、未知家族、重复绑定和缺证据覆盖', () => {
  const fixture = { entries: [
    { modId: '/Lotus/A', frame: null, target: null, status: 'review-required', issues: ['unknown-family', 'orphan-target'], evidence: [] },
    { modId: '/Lotus/B', frame: { familyId: 'frame.nova' }, target: { id: 'ability:x' }, status: 'generated-evidence', issues: [], evidence: [{ source: 'local-wiki-sqlite' }] },
    { modId: '/Lotus/C', frame: { familyId: 'frame.nova' }, target: { id: 'ability:x' }, status: 'generated-evidence', issues: [], evidence: [{ source: 'local-wiki-sqlite' }] }
  ] };
  const codes = auditCatalog(fixture).diagnostics.map(item => item.code);
  assert.ok(codes.includes('orphan-target'));
  assert.ok(codes.includes('unknown-family'));
  assert.ok(codes.includes('duplicate-binding'));
  assert.ok(codes.includes('missing-evidence'));
});

test('当前目录没有稳定身份或审核状态结构错误', () => {
  const report = auditCatalog(catalog);
  assert.deepEqual(report.diagnostics.filter(item => ['unstable-mod-id', 'duplicate-mod-id', 'review-status-mismatch'].includes(item.code)), []);
});
