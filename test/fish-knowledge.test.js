'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('../src')

test('鱼类名称优先解析为鱼而不是同名鱼饵', () => {
  const core = createKnowledgeCore()
  for (const query of ['盖拉佩德', 'Glappid']) {
    const resolved = core.resolveItem(query)
    assert.equal(resolved.kind, 'official-item')
    assert.equal(resolved.item.canonical, 'Glappid')
    assert.equal(resolved.item.semanticKinds.includes('fish'), true)
    assert.equal(resolved.item.fishProfile.biome, 'Ocean')
    assert.equal(resolved.item.fishProfile.maximumWeight, '44 kg')
    assert.equal(resolved.item.fishProfile.rarity, 'Legendary')
  }
  assert.equal(core.resolveItem('盖拉佩德鱼饵').item.canonical, 'Glappid Bait')
})

test('Fish.json 47种捕获物分出44条真实鱼类与3个非鱼捕获物', () => {
  const core = createKnowledgeCore()
  const catches = core.officialItems.items.filter(item => item.sourceCategory === 'Fish')
  const fish = catches.filter(item => item.semanticKinds?.includes('fish'))
  assert.equal(new Set(catches.map(item => item.canonical)).size, 47)
  assert.equal(new Set(fish.map(item => item.canonical)).size, 44)
  assert.deepEqual(catches.filter(item => item.semanticKinds?.includes('fish-catch-junk')).map(item => item.canonical).sort(), ['Boot', 'Crewman’S Boot', 'Stocking'])
  assert.ok(catches.filter(item => item.semanticKinds?.includes('fish-catch-junk')).every(item => item.fishInfo === null))
})

test('鱼类信息契约保留字段级证据和鱼饵未知语义', () => {
  const core = createKnowledgeCore()
  const amniophysi = core.resolveItem('针刺长鳄').item
  assert.equal(amniophysi.fishInfo.biome.value, 'Cave')
  assert.equal(amniophysi.fishInfo.biome.displayName, '洞穴')
  assert.match(amniophysi.fishInfo.activity.displayName, /Fass\/Vome 主宰期/)
  assert.equal(amniophysi.fishInfo.bait.status, 'review-required')
  assert.equal(amniophysi.fishInfo.bait.displayName, null)
  assert.equal(amniophysi.fishInfo.biome.provenance.source, 'wiki.warframe.com')
  assert.match(amniophysi.fishInfo.biome.provenance.url, /\/Amniophysi$/)
  const glappid = core.resolveItem('盖拉佩德').item
  assert.equal(glappid.fishInfo.bait.status, 'required')
  assert.match(glappid.fishInfo.bait.canonical, /Glappid Bait$/)
  assert.ok(['approved', 'review-required'].includes(amniophysi.fishInfo.reviewStatus))
  const card = core.getAcquisitionCard('针刺长鳄')
  assert.equal(card.kind, 'resource')
  assert.equal(card.fishInfo.canonical, 'Amniophysi')
  assert.equal(card.ecologyInfo.type, 'fish')
  assert.equal(card.ecologyInfo.stableIdentity, amniophysi.uniqueName)
  assert.equal(card.ecologyInfo.effectiveSpears.status, 'none')
  assert.deepEqual(card.ecologyInfo.relations, { animalTags: [], processingOutputs: [], baitTargets: [] })
  const glappidCard = core.getAcquisitionCard('盖拉佩德')
  assert.equal(glappidCard.ecologyInfo.effectiveSpears.status, 'required')
  assert.deepEqual(glappidCard.ecologyInfo.effectiveSpears.displayNames, ['佩拉姆鱼叉'])
})

test('保育标签使用共享生态 DTO 且关系接口为空时可双向查询', () => {
  const core = createKnowledgeCore({ approvedOnly: false })
  const card = core.getAcquisitionCard('狡黠狐帕菲拉标签')
  assert.equal(card.ecologyInfo.type, 'conservation-animal')
  assert.equal(card.ecologyInfo.openWorld.displayName, '魔胎之境')
  assert.deepEqual(card.ecologyInfo.captureTool.displayNames, ['麻醉步枪'])
  assert.match(card.ecologyInfo.perfectCapture.displayName, /未被动物察觉/)
  assert.deepEqual(core.queryEcologyRelations(card.ecologyInfo.stableIdentity), [])
  assert.equal(core.ecologyRelations.relationTypes.FISH_PROCESSING_OUTPUT, 'fish-processing-output')
  assert.equal(core.ecologyRelations.relationTypes.BAIT_TARGET_FISH, 'bait-target-fish')
  assert.equal(core.ecologyRelations.relationTypes.ANIMAL_TAG, 'animal-tag')
})
