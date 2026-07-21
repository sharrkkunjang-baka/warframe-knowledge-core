'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const {
  baseFishUniqueName,
  buildCatalog,
  exactFishRelations,
  mineralStage,
  worldFromUniqueName
} = require('../scripts/build-resource-asset-catalog')

test('鱼类尺寸变体归并到稳定物种身份', () => {
  assert.equal(
    baseFishUniqueName('/Lotus/Types/Items/Fish/Eidolon/NightRareFishAItemLarge'),
    '/Lotus/Types/Items/Fish/Eidolon/NightRareFishAItem'
  )
  assert.equal(
    baseFishUniqueName('/Lotus/Types/Items/Fish/Solaris/OrokinCoolRareFishALargeItem'),
    '/Lotus/Types/Items/Fish/Solaris/OrokinCoolRareFishAItem'
  )
})

test('开放世界与矿物加工阶段只由官方身份字段分类', () => {
  assert.equal(worldFromUniqueName('/Lotus/Types/Items/Gems/Eidolon/CommonGemAItem'), 'plains-of-eidolon')
  assert.equal(worldFromUniqueName('/Lotus/Types/Items/Gems/Solaris/SolarisRareGemAItem'), 'orb-vallis')
  assert.equal(worldFromUniqueName('/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreAItem'), 'cambion-drift')
  assert.equal(mineralStage({ type: 'Gem', uniqueName: '/Lotus/Types/Items/Gems/Deimos/DeimosCommonOreAItem' }), 'raw')
  assert.equal(mineralStage({ type: 'Cut Gem', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/CommonGemACutAItem' }), 'cut')
  assert.equal(mineralStage({ type: 'Alloy', uniqueName: '/Lotus/Types/Items/Gems/Eidolon/CommonOreAAlloyAItem' }), 'refined')
})

test('鱼部件关系只接受官方说明中的完整鱼名', () => {
  const relations = exactFishRelations({
    semanticKinds: ['fish-part'],
    description: { canonical: 'Source: Cut from Norg and Cuthol fish.' }
  }, ['Norg', 'Cuthol', 'Org'])
  assert.deepEqual(relations, ['Norg', 'Cuthol'])
})

test('跨源目录完整枚举三系鱼类、鱼部件与矿物稳定身份', () => {
  const catalog = buildCatalog({ generatedAt: 'test' })
  const identities = new Set(catalog.entries.map(entry => entry.stableIdentity.uniqueName))
  assert.equal(identities.size, catalog.entries.length)
  for (const world of ['plains-of-eidolon', 'orb-vallis', 'cambion-drift']) {
    const scope = catalog.openWorldScope[world]
    assert.ok(scope.fish > 0, `${world} 缺鱼类`)
    assert.ok(scope.fishParts > 0, `${world} 缺鱼部件`)
    assert.ok(scope.rawMinerals > 0, `${world} 缺原矿/宝石`)
    assert.ok(scope.refinedMinerals > 0, `${world} 缺精炼/切割成品`)
  }
  for (const entry of catalog.entries.filter(entry => ['fish', 'mineral-raw', 'mineral-refined'].includes(entry.category))) {
    assert.ok(entry.stableIdentity.uniqueName.startsWith('/Lotus/'))
    if (!entry.expectedMediaFilename) assert.equal(entry.catalogStatus, 'review-required')
  }
  assert.equal(path.extname(catalog.entries.find(entry => entry.stableIdentity.canonical === 'Norg').expectedMediaFilename), '.png')
})
