'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { loadData } = require('../src/loader')
const review = require('../scripts/review-recent-mods')

const ROOT = path.join(__dirname, '..')
const KNOWLEDGE_ROOT = path.join(ROOT, 'knowledge')
const MOD_ROOT = path.join(KNOWLEDGE_ROOT, 'acquisition', 'mod')
const LEDGER_DOCUMENT = JSON.parse(fs.readFileSync(path.join(KNOWLEDGE_ROOT, 'supplemental', 'current-mod-identities.json'), 'utf8'))
const LEDGER = LEDGER_DOCUMENT.items
const REVIEW_CANDIDATES = [...LEDGER, ...(LEDGER_DOCUMENT.reviewCandidates || [])]
const EXPECTED = new Set(LEDGER.map(item => item.canonical))
const ORIGINALLY_MISSING = new Set(['Pain Points', 'Spontaneous Singularity'])

function jsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return jsonFiles(target)
    return entry.isFile() && entry.name.endsWith('.json') ? [target] : []
  })
}

function entriesIn(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'))
  return Array.isArray(value) ? value : [value]
}

function recentRuntimeEntries(data) {
  return data.knowledge.filter(entry =>
    entry.subject?.category === 'mod' && EXPECTED.has(entry.subject.canonical)
  )
}

test('近期 Mod 从旧 runtime 36 补齐至 41，U40+ runtime 为 30', () => {
  const legacy = jsonFiles(KNOWLEDGE_ROOT)
    .flatMap(file => {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'))
      return Array.isArray(value) ? value : []
    })
    .filter(entry =>
      entry.kind === 'knowledge'
      && entry.subject?.category === 'mod'
      && EXPECTED.has(entry.subject.canonical)
      && !ORIGINALLY_MISSING.has(entry.subject.canonical)
    )
  assert.equal(new Set(legacy.map(entry => entry.subject.canonical)).size, 36)

  const runtime = recentRuntimeEntries(loadData(ROOT, { approvedOnly: false }))
  assert.equal(new Set(runtime.map(entry => entry.subject.canonical)).size, 41)
  const runtimeNames = new Set(runtime.map(entry => entry.subject.canonical))
  assert.equal(LEDGER.filter(item => item.introduced >= 40 && runtimeNames.has(item.canonical)).length, 30)
})

test('loader 递归发现所有 supplemental 单对象知识文件', () => {
  const runtime = loadData(ROOT, { approvedOnly: false }).knowledge
  const runtimeIds = new Set(runtime.map(entry => entry.id))
  const runtimeIdentities = new Set(runtime.map(review.officialUniqueNameOf).filter(Boolean))
  const singletonEntries = jsonFiles(KNOWLEDGE_ROOT).flatMap(file => {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    return !Array.isArray(value) && value?.kind === 'knowledge' ? [value] : []
  })
  assert.ok(singletonEntries.length > 0)
  for (const entry of singletonEntries) {
    const identity = review.officialUniqueNameOf(entry)
    assert.ok(runtimeIds.has(entry.id) || identity && runtimeIdentities.has(identity), entry.id)
  }
})

test('近期 Mod 的正式目录唯一发布且 current 不残留重复身份', () => {
  const supplements = require('../scripts/sync-current-wiki-supplements')
  const indexed = supplements.indexExistingMods()
  const published = jsonFiles(MOD_ROOT).flatMap(entriesIn)
  const identities = published.map(review.officialUniqueNameOf).filter(Boolean)
  assert.equal(new Set(identities).size, identities.length)
  assert.deepEqual(supplements.staleCurrentModFiles(indexed), [])
  for (const canonical of [
    'Kumihimo Loading',
    'Lingering Transmutation',
    'Noctua Swarm',
    'Reverse Rotorswell',
    'Rhythm Guard',
    'Tharros Lethality',
    'Untime Rift'
  ]) {
    const selected = indexed.get(String(canonical).toLowerCase().replace(/[^a-z0-9]+/g, ''))
    assert.match(path.relative(MOD_ROOT, selected.file), /^standardmod[\\/]/)
  }
})

test('近期 Mod 审核只由统一证据资格决定', () => {
  const expectedByCanonical = new Map(REVIEW_CANDIDATES.map(item => [item.canonical, item]))
  const byCanonical = new Map(
    jsonFiles(MOD_ROOT)
      .flatMap(entriesIn)
      .filter(entry => expectedByCanonical.has(entry.subject?.canonical))
      .map(entry => [entry.subject.canonical, entry])
  )

  for (const canonical of ['Primary Acuity', 'Pistol Acuity']) {
    const entry = structuredClone(byCanonical.get(canonical))
    entry.reviewStatus = 'draft'
    entry.modAcquisition.manual.reviewStatus = 'draft'
    assert.equal(review.isReviewEligible(entry, expectedByCanonical.get(canonical)), true)
    review.approve(entry, expectedByCanonical.get(canonical))
    assert.equal(entry.reviewStatus, 'approved')
    assert.equal(entry.modAcquisition.manual.reviewStatus, 'approved')
  }

  const withoutAcquisition = structuredClone(byCanonical.get('Evir-Ti'))
  withoutAcquisition.modAcquisition.generated.wiki.methods = []
  withoutAcquisition.modAcquisition.generated.officialDrops = []
  assert.equal(review.isReviewEligible(withoutAcquisition, expectedByCanonical.get('Evir-Ti')), false)

  const withoutOfficialIdentity = structuredClone(byCanonical.get('Primary Acuity'))
  withoutOfficialIdentity.officialUniqueName = 'wiki-current:mod:Primary Acuity'
  delete withoutOfficialIdentity.subject.officialUniqueName
  withoutOfficialIdentity.modAcquisition.generated.identity.officialUniqueName = 'wiki-current:mod:Primary Acuity'
  assert.equal(review.isReviewEligible(withoutOfficialIdentity, expectedByCanonical.get('Primary Acuity')), false)

  for (const file of jsonFiles(path.join(MOD_ROOT, 'standardmod'))) {
    for (const entry of entriesIn(file)) {
      if (!expectedByCanonical.has(entry.subject?.canonical)) continue
      assert.equal(entry.id, review.knowledgeIdForFile(file), entry.subject.canonical)
    }
  }
})
