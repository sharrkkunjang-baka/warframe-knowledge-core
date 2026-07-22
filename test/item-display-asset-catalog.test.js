'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildCatalog, primaryCategory } = require('../scripts/build-item-display-asset-catalog')

test('全道具展示资产目录遍历全部已发布非装备物品', () => {
  const catalog = buildCatalog({ generatedAt: 'test' })
  assert.equal(catalog.totals.items, catalog.entries.length)
  assert.ok(catalog.entries.length > 700)
  assert.ok(catalog.entries.every(entry => entry.requiredAssetRole === 'item-display'))
  assert.ok(catalog.entries.every(entry => entry.stableIdentity.uniqueName.startsWith('/Lotus/')))
  assert.equal(new Set(catalog.entries.map(entry => entry.stableIdentity.uniqueName)).size, catalog.entries.length)
})

test('琥珀星、青蓝星与 Chattraka 使用稳定身份和官方名称', () => {
  const catalog = buildCatalog({ generatedAt: 'test' })
  const byCanonical = new Map(catalog.entries.map(entry => [entry.stableIdentity.canonical, entry]))
  assert.equal(byCanonical.get('Ayatan Amber Star').stableIdentity.uniqueName, '/Lotus/Types/Items/FusionTreasures/OroFusexOrnamentB')
  assert.equal(byCanonical.get('Ayatan Cyan Star').stableIdentity.uniqueName, '/Lotus/Types/Items/FusionTreasures/OroFusexOrnamentA')
  const chattraka = byCanonical.get('Ayatan Chattraka Sculpture')
  assert.equal(chattraka.stableIdentity.uniqueName, '/Lotus/Types/Items/FusionTreasures/OroFusexI')
  assert.equal(chattraka.stableIdentity.displayName, '阿耶檀识 Chattraka 塑像')
  assert.ok(chattraka.aliases.includes('阿耶檀识 Chattraka 雕像'))
  assert.equal(primaryCategory({ semanticKinds: ['ayatan'] }), 'ayatan')
})
