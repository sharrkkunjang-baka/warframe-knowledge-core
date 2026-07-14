'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sync = require('../scripts/sync-frame-knowledge');
const root = path.resolve(__dirname, '..');
const knowledgeDir = path.join(root, 'knowledge', 'acquisition', 'warframe');

function snapshot() {
  return new Map(fs.readdirSync(knowledgeDir).filter(name => name.endsWith('.json')).sort().map(name => [name, fs.readFileSync(path.join(knowledgeDir, name), 'utf8')]));
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
  const entry = JSON.parse(fs.readFileSync(path.join(knowledgeDir, 'dagath.json'), 'utf8'))[0];
  const rebuilt = sync.buildEntry(sync.buildPlan().included.find(item => item.frame.name === 'Dagath').frame, entry);
  assert.deepEqual(rebuilt.frameAcquisition.manual, entry.frameAcquisition.manual);
  assert.equal(rebuilt.frameAcquisition.generated.officialUniqueName, '/Lotus/Powersuits/Dagath/Dagath');
});

test('classification excludes only audited internal placeholders', () => {
  const plan = sync.buildPlan();
  assert.equal(plan.included.length, 116);
  assert.deepEqual(plan.excluded.map(item => item.name).sort(), ['Demon Frame']);
  assert.equal(plan.included.filter(item => item.entry.subject.canonical === 'Follie').length, 1);
  assert.equal(plan.included.filter(item => item.entry.subject.canonical === 'Sirius & Orion').length, 1);
});
