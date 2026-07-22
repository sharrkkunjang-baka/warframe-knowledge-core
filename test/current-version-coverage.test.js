'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const audit = require('../scripts/audit-current-version-coverage')
const supplements = require('../scripts/sync-current-wiki-supplements')
const { acquisitionCardSections, renderRequirements } = require('../src/acquisition-protocol')
const { loadEntityRegistries } = require('../src/entities')

const db = path.join(__dirname, '..', '.cache', 'warframe-wiki.sqlite')
const REMAINING_TEN = new Set([
  'Evir-Ti', 'Hayan-Dabor', 'Hok-Kaal', 'Kaal-zidi', 'Lorun-Tash',
  'Sey-Taph', 'Talsek-An', 'Ulashta-Shol', 'Vikla-Safor', 'Yar Dal'
])
test('更新40至当前跨源目录没有静默缺项', () => {
  const report = audit.buildReport({ db, skipHash: true })
  assert.equal(report.counts.missing, 0)
  assert.ok(report.counts.candidates >= 70)
  assert.deepEqual(report.recentMods.counts, {
    expected: 41,
    runtime: 41,
    approved: 41,
    acquisitionComplete: 41,
    officialIdentity: 41
  })
  assert.deepEqual(report.update40Mods.counts, {
    expected: 30,
    runtime: 30,
    approved: 30,
    acquisitionComplete: 30,
    officialIdentity: 30
  })
  assert.equal(report.recentModExpectationSource, 'knowledge/supplemental/current-mod-identities.json')
  assert.ok(report.recentMods.ledger.every(item => item.externalExpected && item.uniqueName === item.expectedUniqueName))
  assert.deepEqual(audit.strictFailures(report), { published: 0, recentModQuality: 0, images: 0 })
})
test('旧式文件计数会漏过运行时未加载对象，新严格门会失败', () => {
  const published = audit.loadPublished()
  const omitted = new Set(['Harrowing Spire', 'Reroot Rampage', "Truth's Flame"])
  const runtimeMods = published.runtimeMods.filter(entry => !omitted.has(entry.subject?.canonical))
  const report = audit.buildReport({ db, skipHash: true, published: { ...published, runtimeMods } })
  assert.equal(report.categories.mods.missing.length, 0, '旧式目录名称集合仍会误报全覆盖')
  assert.equal(report.recentMods.counts.runtime, 38)
  assert.equal(audit.strictFailures(report).recentModQuality, 3)
})
test('近期 Mod 图片需求清单可机读且独立严格门默认失败', () => {
  const report = audit.buildReport({ db, skipHash: true })
  assert.equal(report.imageChain.counts.expected, 41)
  assert.equal(report.imageChain.counts.production, 0)
  assert.equal(audit.strictFailures(report, { images: true }).images, 41)
  assert.ok(report.imageChain.ledger.every(item => item.sourceRequirement.uniqueName?.startsWith('/Lotus/')))
  assert.ok(report.imageChain.ledger.every(item =>
    item.version.startsWith('Update ')
    && item.sourceStatus === 'missing'
    && item.reviewStatus === 'pending'
    && item.productionStatus === 'missing'
  ))
  const evidence = new Map(report.imageChain.ledger.map(item => [audit.normalize(item.canonical), {
    canonical: item.canonical,
    source: true,
    localized: true,
    manifest: true,
    resolver: true
  }]))
  const complete = audit.buildReport({ db, skipHash: true, imageEvidence: evidence })
  assert.equal(complete.imageChain.counts.production, 41)
  assert.equal(complete.imageChain.status, 'complete')
  assert.ok(complete.imageChain.ledger.every(item => item.reviewStatus === 'approved' && item.productionStatus === 'approved'))
  assert.equal(audit.strictFailures(complete, { images: true }).images, 0)
})
test('当前版本补充对象都有官方简中和结构化获取路线', () => {
  const plan = supplements.buildPlan({ db, skipHash: true })
  assert.ok(plan.entries.length >= 45)
  for (const entry of plan.entries.filter(item => item.domain === 'mods')) {
    assert.ok(entry.displayName, entry.canonical)
    assert.ok(entry.languageKey, entry.canonical)
    assert.ok(entry.methods.length, entry.canonical)
  }
  const truth = plan.entries.find(entry => entry.canonical === "Truth's Flame")
  assert.equal(truth.displayName, '真相之焰')
  assert.equal(truth.methods[0].requirements.currency[0].currencyId, 'currency.atramentum')
  const evir = plan.entries.find(entry => entry.canonical === 'Evir-Ti')
  assert.deepEqual(evir.methods.find(method => method.type === 'vendor-exchange').requirements, {
    type: 'currency',
    usage: 'exchange',
    npcId: 'npc.marie',
    locationId: 'hub.sanctum-anatomica',
    chooseCount: 2,
    currency: [
      { currencyId: 'currency.agnovidisc', amountRange: [250, 350] },
      { currencyId: 'currency.laudavi', amountRange: [100, 140] },
      { currencyId: 'currency.servoris', amountRange: [40, 60] }
    ]
  })
  assert.deepEqual(evir.methods.filter(method => method.type === 'enemy-drop').map(method => method.sourceEntityId), [
    'enemy.anarch-capsarii',
    'enemy.anarch-grineer-trapper',
    'enemy.anarch-tenebra'
  ])
  const kaal = plan.entries.find(entry => entry.canonical === 'Kaal-zidi')
  assert.ok(kaal.methods.some(method => method.type === 'event-mission-reward' && method.missionTypeId === 'mission-type.the-perita-rebellion'))
  const adapter = plan.entries.find(entry => entry.canonical === 'Archgun Arcane Adapter')
  assert.ok(adapter.methods.some(method => method.npcId === 'npc.nightcap'))
  for (const canonical of ['Harrowing Spire', 'Reroot Rampage', "Truth's Flame"]) {
    const entry = plan.entries.find(item => item.canonical === canonical)
    assert.ok(entry.effectDetails.length, canonical)
    assert.ok(entry.effectDetails.every(value => !/\|[^|]+\|/.test(value)), canonical)
  }
})
test('官方效果模板不把未替换占位符带入用户可见文本', () => {
  const details = supplements.officialModDetails(
    {
      officialUniqueName: '/Lotus/Upgrades/Mods/Antiques/Test',
      languageKey: '/Lotus/Language/Upgrades/AntiqueTestName'
    },
    'Max Rank 5 Max Rank Description 300 30 General Information',
    {
      '/Lotus/Language/Upgrades/AntiqueTestNameDesc': '|val| 指挥官护盾；每个学派 +|val|',
      '/Lotus/Language/Upgrades/AntiqueTestDesc': '|val| 指挥官护盾；每个学派 +|val|'
    }
  )
  assert.deepEqual(details.effectDetails, ['300 指挥官护盾；每个学派 +30'])
  assert.ok(details.effectDetails.every(value => !/\|[^|]+\|/.test(value)))
  const withLiteralNumbers = supplements.officialModDetails(
    {
      officialUniqueName: '/Lotus/Upgrades/Mods/Test',
      languageKey: '/Lotus/Language/Test/CursedName'
    },
    'Max Rank 3 Max Rank Description 4 120 100 6 General Information',
    {
      '/Lotus/Language/Test/CursedDesc': '获得额外 4 秒机会，伤害提高 |val1|%；每秒承受 |val2| 伤害，持续 6 秒。'
    },
    {
      '/Lotus/Language/Test/CursedDesc': 'Gain 4s, increase damage by |val1|%; suffer |val2| damage for 6s.'
    }
  )
  assert.deepEqual(withLiteralNumbers.effectDetails, ['获得额外 4 秒机会，伤害提高 120%；每秒承受 100 伤害，持续 6 秒。'])
})
test('剩余十项获取协议完整且卡片来源去重', () => {
  const plan = supplements.buildPlan({ db, skipHash: true })
  const targets = plan.entries.filter(entry => REMAINING_TEN.has(entry.canonical))
  assert.equal(targets.length, 10)
  for (const entry of targets) {
    assert.ok(entry.methods.length > 0, entry.canonical)
    assert.ok(entry.methods.every(method => method.requirements), `${entry.canonical}: requirements`)
    assert.ok(entry.methods.some(method =>
      method.type === 'vendor-exchange'
      && method.npcId === 'npc.marie'
      && method.locationId === 'hub.sanctum-anatomica'
    ), `${entry.canonical}: Marie`)
    const sections = acquisitionCardSections(entry.methods)
    for (const items of Object.values(sections).filter(Array.isArray)) {
      const texts = items.map(item => item.text)
      assert.equal(new Set(texts).size, texts.length, `${entry.canonical}: duplicate card line`)
    }
    const enemyIds = sections.enemy.map(item => item.method.sourceEntityId)
    assert.equal(new Set(enemyIds).size, enemyIds.length, `${entry.canonical}: duplicate enemy`)
  }
})
test('玛丽轮换商店保留随机两种资源与费用范围', () => {
  const lines = renderRequirements(supplements.marieRequirements('Evir-Ti'), loadEntityRegistries(path.join(__dirname, '..')))
  assert.match(lines[0], /解剖圣所/)
  assert.match(lines[0], /玛丽/)
  assert.match(lines[0], /250-350个名盘/)
  assert.match(lines[0], /100-140个荣誉勋章/)
  assert.match(lines[0], /40-60个军功勋章/)
  assert.match(lines[0], /随机选择其中2种/)
})
