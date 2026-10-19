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
  assert.deepEqual(card.ecologyInfo.relations.processingOutputs[0], {
    canonical: 'Benign Infested Tumor', displayName: '良性感染肿瘤',
    quantities: [{ quality: '小型', quantity: 3 }, { quality: '中型', quantity: 4 }, { quality: '大型', quantity: 8 }]
  })
  assert.deepEqual(card.ecologyInfo.relations.animalTags, [])
  assert.deepEqual(card.ecologyInfo.relations.baitTargets, [])
  const glappidCard = core.getAcquisitionCard('盖拉佩德')
  assert.equal(glappidCard.ecologyInfo.effectiveSpears.status, 'required')
  assert.deepEqual(glappidCard.ecologyInfo.effectiveSpears.displayNames, ['佩拉姆鱼叉'])
})

test('钓鱼总表、单鱼详情与材料反查共享结构化分解数据', () => {
  const core = createKnowledgeCore({ approvedOnly: false })
  const table = core.getFishingCard('钓鱼')
  assert.deepEqual(table.regions.map(region => region.displayName), ['夜灵平野', '奥布山谷', '魔胎之境'])
  assert.deepEqual(table.regions.map(region => region.groups.flatMap(group => group.fish).length), [13, 13, 13])
  assert.ok(table.regions[1].groups.some(group => group.activity === '无限制'))
  assert.deepEqual(table.regions[2].groups.map(group => group.activity), ['无限制', 'Vome', 'Fass'])
  const fish = core.getFishingCard('钓鱼 盖拉佩德')
  assert.equal(fish.kind, 'fishing-fish-detail')
  assert.deepEqual(fish.fish.processingOutputs.find(row => row.displayName === '鱼油').quantities.map(row => row.quantity), [3, 5, 7])
  const material = core.getFishingCard('捕鱼 鱼油')
  assert.equal(material.kind, 'fishing-material-detail')
  assert.equal(material.material.sources.length, 13)
  assert.equal(material.material.sources.every(row => row.fish && row.quantities.length === 3), true)
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
