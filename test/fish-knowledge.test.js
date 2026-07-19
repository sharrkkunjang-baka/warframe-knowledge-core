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

test('Fish.json 全部47种唯一鱼类均已加载', () => {
  const core = createKnowledgeCore()
  const fish = core.officialItems.items.filter(item => item.sourceCategory === 'Fish' && item.semanticKinds?.includes('fish'))
  assert.equal(new Set(fish.map(item => item.canonical)).size, 47)
})
