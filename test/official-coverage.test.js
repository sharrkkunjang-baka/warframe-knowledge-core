'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const coverage = require('../scripts/sync-official-coverage');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'generated', 'official-coverage-manifest.json');

test('coverage pipeline is idempotent and check-only does not write', () => {
  coverage.run([]);
  const before = fs.readFileSync(output, 'utf8');
  coverage.run(['--check']);
  assert.equal(fs.readFileSync(output, 'utf8'), before);
});

test('manifest covers required domains and records policy states', () => {
  const manifest = coverage.buildManifest('stable');
  assert.deepEqual(Object.keys(manifest.domains), ['warframe', 'quest', 'mod', 'official-items', 'resources', 'weapons']);
  for (const domain of Object.values(manifest.domains)) {
    assert.equal(domain.counts.identities, domain.entries.length);
    assert.ok(domain.differences.publicExportMissingFromPackage);
    assert.ok(domain.entries.every(entry => manifest.allowedDispositions.includes(entry.disposition)));
    assert.ok(domain.entries.every(entry => Object.hasOwn(entry, 'excludedPolicy') && Object.hasOwn(entry, 'sourceConflict') && Object.hasOwn(entry, 'reviewRequired')));
  }
  assert.ok(manifest.domains.warframe.entries.some(entry => entry.disposition === 'excluded-policy'));
  assert.ok(manifest.domains.mod.entries.some(entry => entry.disposition === 'review-required'));
  assert.ok(manifest.domains.mod.entries.some(entry => entry.disposition === 'excluded-policy'));
  const catalog = require('../knowledge/categories/official.json');
  assert.equal(manifest.domains.mod.entries.length, catalog.mods.length + catalog.excludedMods.length);
  assert.equal(new Set(manifest.domains.mod.entries.map(entry => entry.identity)).size, manifest.domains.mod.entries.length);
});

test('source differences are derived from identities rather than fixed totals', () => {
  assert.deepEqual(coverage.sourceDiff(['a', 'b'], ['b', 'c'], ['c', 'd']), {
    publicExportOnly: ['a'], packageOnly: [], wikiOnly: ['d'], publicExportMissingFromPackage: ['a'], packageMissingFromWiki: ['b']
  });
  const manifest = coverage.buildManifest('stable');
  for (const domain of Object.values(manifest.domains)) assert.ok(domain.counts.identities > 0);
});

test('ordinary frames absent from package cannot be identity-only shells', () => {
  const manifest = coverage.buildManifest('stable');
  const gaps = manifest.domains.warframe.entries.filter(entry => entry.sourcePresence.publicExport && !entry.sourcePresence.package && !/ Prime$/i.test(entry.canonical) && entry.disposition !== 'excluded-policy');
  assert.ok(gaps.length > 0, 'fixture should exercise a real dynamic package gap');
  assert.deepEqual(gaps.filter(entry => entry.evidence !== 'substantive-acquisition').map(entry => entry.canonical), []);
  assert.equal(manifest.qualityGate.passed, true);
});
