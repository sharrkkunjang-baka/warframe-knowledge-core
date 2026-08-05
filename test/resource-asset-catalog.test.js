'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  baseFishUniqueName,
  buildCatalog,
  exactFishRelations,
  mineralStage,
  worldFromUniqueName
} = require('../scripts/build-resource-asset-catalog')

const ROOT = path.resolve(__dirname, '..')

test('审核素材目录绑定 active-current Maphica 的稳定身份与跨角色', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'knowledge/assets/reviewed-resource-assets.json'), 'utf8'))
  assert.equal(catalog.entries.length, 33)
  assert.equal(catalog.entries.some(entry => entry.stableEntityId === 'currency.standing.ostron'), false)
  assert.equal(catalog.entries.some(entry => entry.stableEntityId === 'currency.standing.solaris-united'), false)
  assert.equal(catalog.entries.every(entry => entry.availability === 'active-current'), true)
  assert.equal(catalog.entries.every(entry => entry.evidence.source === 'wiki.warframe.com'), true)
  assert.equal(catalog.entries.every(entry => !/fandom\.com|wikia\.com/i.test(JSON.stringify(entry))), true)
  const maphica = catalog.entries.find(entry => entry.stableEntityId === 'currency.maphica')
  assert.ok(maphica)
  assert.equal(maphica.uniqueName, 'wiki-current:resource:Maphica')
  assert.equal(maphica.availability, 'active-current')
  assert.deepEqual(maphica.assetRoles, ['currency-inline-icon', 'crafting-resource-icon', 'inventory-resource-icon'])
  assert.equal(maphica.evidence.source, 'wiki.warframe.com')
  assert.equal(maphica.evidence.provenanceType, 'user-provided')
  assert.match(maphica.evidence.sha256, /^[a-f0-9]{64}$/)
})

test('生成目录合并 reviewed asset 身份、角色与媒体绑定', () => {
  const catalog = buildCatalog({ generatedAt: 'test' })
  const reviewed = catalog.entries.filter(entry => entry.reviewedAsset)
  assert.equal(reviewed.length, 33)
  for (const entry of reviewed) {
    assert.equal(entry.catalogStatus, 'ready', entry.stableIdentity.stableEntityId)
    assert.equal(entry.reviewReasons.length, 0, entry.stableIdentity.stableEntityId)
    assert.match(entry.reviewedAsset.evidence.sha256, /^[a-f0-9]{64}$/)
    assert.ok(entry.reviewedAsset.assetRoles.includes('currency-inline-icon'))
  }
  const agnovidisc = reviewed.find(entry => entry.stableIdentity.stableEntityId === 'currency.agnovidisc')
  assert.ok(agnovidisc)
  assert.equal(agnovidisc.stableIdentity.uniqueName, '/Lotus/Types/Gameplay/Tau/Resources/TwelveResourceCommonItem')
  assert.deepEqual(agnovidisc.reviewedAsset.assetRoles, ['currency-inline-icon', 'crafting-resource-icon', 'inventory-resource-icon'])
})

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

test('Toroid 图片目录覆盖全部五个稳定身份', () => {
  const catalog = buildCatalog({ generatedAt: 'test' })
  const toroids = catalog.entries.filter(entry => / Toroid$/.test(entry.stableIdentity.canonical))
  assert.equal(toroids.length, 5)
  assert.ok(toroids.every(entry => entry.category === 'resource'))
  assert.ok(toroids.every(entry => entry.catalogStatus === 'ready'))
  assert.ok(toroids.every(entry => path.extname(entry.expectedMediaFilename) === '.png'))
})
