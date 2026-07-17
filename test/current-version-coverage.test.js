'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const audit = require('../scripts/audit-current-version-coverage')
const supplements = require('../scripts/sync-current-wiki-supplements')

const db = path.join(__dirname, '..', '.cache', 'warframe-wiki.sqlite')
test('更新40至当前跨源目录没有静默缺项', () => {
  const report = audit.buildReport({ db, skipHash: true })
  assert.equal(report.counts.missing, 0)
  assert.ok(report.counts.candidates >= 70)
})
test('当前版本补充对象都有官方简中和结构化获取路线', () => {
  const plan = supplements.buildPlan({ db, skipHash: true })
  assert.ok(plan.entries.length >= 45)
  for (const entry of plan.entries) {
    assert.ok(entry.displayName, entry.canonical)
    assert.ok(entry.languageKey, entry.canonical)
    assert.ok(entry.methods.length, entry.canonical)
  }
  const truth = plan.entries.find(entry => entry.canonical === "Truth's Flame")
  assert.equal(truth.displayName, '真相之焰')
  assert.equal(truth.methods[0].requirements.currency[0].currencyId, 'currency.atramentum')
  const adapter = plan.entries.find(entry => entry.canonical === 'Archgun Arcane Adapter')
  assert.ok(adapter.methods.some(method => method.npcId === 'npc.nightcap'))
})
