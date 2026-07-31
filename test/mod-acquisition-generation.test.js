'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { compileAcquisitionProseMethod } = require('../src/mod-wiki-compiler')
const { buildModEntry, getSyndicateMethods, mergeGeneratedWiki, mergeModEntry } = require('../src/mod-entry-builder')
const { createKnowledgeCore } = require('../src')

const page = { title: 'Fixture', pageId: 1, revisionId: 2 }
const section = { title: 'Acquisition' }

test('Nightwave 当前 Cred 轮换替换旧奖励 DTO', () => {
  const current = compileAcquisitionProseMethod('Available for 20 x Cred creds from the Nightwave Cred Offerings store on a rotational basis.', page, section)
  const merged = mergeGeneratedWiki({ status: 'complete', methods: [current] }, { status: 'complete', methods: [{ type: 'legacy-nightwave-reward', locationId: 'interface.nightwave' }] })
  assert.equal(merged.methods.length, 1)
  assert.equal(merged.methods[0].type, 'vendor-or-syndicate-exchange')
  assert.equal(merged.methods[0].requirements.currency[0].amount, 20)
})

test('Baro Wiki 证据编译 Credits 与 Ducats 双货币', () => {
  const method = compileAcquisitionProseMethod("This mod can be purchased unranked from the Void Trader Baro Ki'Teer for 175,000 Credits 175,000 and 350 350.", page, section)
  assert.equal(method.reviewStatus, 'approved')
  assert.deepEqual(method.requirements.currency, [
    { currencyId: 'currency.credits', amount: 175000 },
    { currencyId: 'currency.orokin-ducats', amount: 350 }
  ])
})

test('Archon Mod 条目级 requirements 注入到结构化方法', () => {
  const method = createKnowledgeCore({ approvedOnly: false }).getAcquisition('Archon Stretch').structuredMethods[0]
  assert.equal(method.sourceEntityId, 'npc.chipper')
  assert.equal(method.requirements.type, 'currency')
  assert.equal(method.requirements.currency[0].currencyId, 'currency.stock')
  assert.equal(method.requirements.currency[0].amount, 40)
})

test('DE ExportSyndicates 为已发布增幅 Mod 生成正式兑换方法', () => {
  const methods = getSyndicateMethods({ uniqueName: '/Lotus/Powersuits/Trinity/LinkAugmentCard', drops: [] })
  assert.equal(methods.length, 2)
  assert.ok(methods.every(method => method.reviewStatus === 'approved'))
  assert.ok(methods.every(method => method.requirements.amount === 25000 && method.requirements.rank === 5))
})

test('Prime 类别不再无证据默认 approved', () => {
  const entry = buildModEntry({ uniqueName: '/Lotus/Test/PrimeNoEvidence', name: 'Primed No Evidence', type: 'Rifle Mod', fusionLimit: 10, isPrime: true, drops: [] })
  assert.equal(entry.reviewStatus, 'draft')
  assert.equal(entry.acquisitionStatus, 'stub')
})

test('已批准 Wiki 集团方法拥有获取事实并抑制 warframe-items 回退', () => {
  const oldWiki = { status: 'complete', methods: [{ type: 'syndicate-exchange-group', factionIds: ['faction.new-loka'], reviewStatus: 'approved', provenance: { source: 'local-wiki-sqlite' } }] }
  const generatedWiki = { status: 'complete', methods: [{ type: 'syndicate-exchange', factionId: 'faction.new-loka', reviewStatus: 'draft', provenance: { source: 'warframe-items' } }] }
  assert.deepEqual(mergeGeneratedWiki(generatedWiki, oldWiki).methods, oldWiki.methods)
})

test('已编译效果文本归现有条目所有且不会被占位符覆盖', () => {
  const oldEntry = buildModEntry({ uniqueName: '/Lotus/Test/CompiledEffect', name: 'Compiled Effect', type: 'Warframe Mod', fusionLimit: 3, drops: [] })
  oldEntry.effectDetails = ['+200% 暴击几率']
  const generated = structuredClone(oldEntry)
  generated.effectDetails = ['+|几率|% 暴击几率']
  assert.deepEqual(mergeModEntry(generated, oldEntry).effectDetails, ['+200% 暴击几率'])
})
