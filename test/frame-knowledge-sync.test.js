'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sync = require('../scripts/sync-frame-knowledge');
const root = path.resolve(__dirname, '..');
const knowledgeDir = path.join(root, 'knowledge', 'acquisition', 'warframe');

function snapshot(directory = knowledgeDir) {
  const files = fs.readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? snapshot(path.join(directory, item.name)) : item.name.endsWith('.json') ? [[path.relative(knowledgeDir, path.join(directory, item.name)), fs.readFileSync(path.join(directory, item.name), 'utf8')]] : []);
  return directory === knowledgeDir ? new Map(files.sort(([a], [b]) => a.localeCompare(b))) : files;
}

test('frame knowledge sync is idempotent and check does not write', () => {
  sync.run([]);
  const before = snapshot();
  sync.run(['--check']);
  const after = snapshot();
  assert.deepEqual(after, before);
  sync.run(['--dry-run']);
  assert.deepEqual(snapshot(), before);
});

test('sync keeps manual fields while regenerating official fields', () => {
  const entry = JSON.parse(fs.readFileSync(path.join(knowledgeDir, 'dojo', 'dagath.json'), 'utf8'))[0];
  const rebuilt = sync.buildEntry(sync.buildPlan().included.find(item => item.frame.name === 'Dagath').frame, entry);
  assert.deepEqual(rebuilt.frameAcquisition.manual, entry.frameAcquisition.manual);
  assert.equal(rebuilt.frameAcquisition.generated.officialUniqueName, '/Lotus/Powersuits/Dagath/Dagath');
});

test('classification excludes only audited internal placeholders', () => {
  const plan = sync.buildPlan();
  assert.equal(plan.included.length, 117);
  assert.deepEqual(plan.excluded.map(item => item.name).sort(), []);
  assert.equal(plan.included.filter(item => item.entry.subject.canonical === 'Follie').length, 1);
  assert.equal(plan.included.filter(item => item.entry.subject.canonical === 'Sirius & Orion').length, 1);
});
