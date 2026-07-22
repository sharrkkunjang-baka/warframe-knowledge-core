'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DOMAIN_ORDER,
  buildReport,
  methodQuality,
  shopQuality
} = require('../scripts/audit-full-entity-coverage')

test('全量目录保留全部要求域、严格缺口和资产角色统计', { timeout: 120000 }, () => {
  const report = buildReport({ generatedAt: 'test' })
  assert.deepEqual(Object.keys(report.domains), DOMAIN_ORDER)
  assert.ok(report.totals.expected > report.totals.resolved, '尚未录入对象不得被伪装为 resolved')
  assert.ok(report.domains.weapon.counts.expected > 619)
  assert.ok(report.domains.mod.counts.expected >= 1400)
  assert.equal(report.domains.weapon.counts.resolved, 619)
  assert.ok(report.domains.weapon.counts.missing >= 60)
  assert.ok(report.domains.weapon.entries.some(item => item.canonical === 'Balla' && item.status === 'missing' && item.stableId))
  assert.ok(report.domains.weapon.entries.some(item => item.canonical === 'Quassus Prime' && item.status === 'missing' && item.stableId))
  assert.equal(report.domains.weapon.entries.some(item => item.canonical === 'Ebisu Spear'), false)
  assert.equal(report.domains.mod.counts.missing, 0)
  assert.equal(report.domains.mod.counts.ambiguous, 0)
  assert.equal(report.domains.warframe.counts.missing, 0)
  assert.ok(report.domains.weapon.directoryOnlyExcluded.some(item => item.canonical === 'Blueprints'))
  assert.ok(report.domains.mod.directoryOnlyExcluded.some(item => item.canonical === 'Mod/List of Mods'))
  assert.ok(report.domains.warframe.directoryOnlyExcluded.some(item => item.canonical === 'Warframes Comparison'))
  assert.ok(report.domains['npc-faction-enemy'].counts.expected >= 700)
  assert.ok(report.domains['mission-location'].counts.expected >= 300)
  assert.equal(report.domains['shop-inventory'].counts.expected, 114)
  assert.ok(report.domains.weapon.assetsByRole.icon.manifest >= 500)
  assert.ok(report.domains.mod.assetsByRole.card.manifest >= 659)
  assert.equal(report.domains.mod.assetsByRole.card.validFiles, report.domains.mod.assetsByRole.card.manifest)
  assert.ok(report.domains.warframe.assetsByRole.component.manifest >= 400)
  assert.equal(report.scope.stableIdentityRequiredForAssets, true)
  assert.equal(report.scope.wikiDirectoryRowsRequireStableIdentity, true)
  assert.equal(report.qualityGate.strictPass, false)
})

test('获取协议审计拒绝 require/cost 平行字段', () => {
  const result = methodQuality({
    domain: 'weapon',
    raw: {
      acquisition: {
        routes: [{
          methods: [
            { type: 'vendor-exchange', require: { type: 'currency' } },
            { type: 'vendor-exchange', cost: 100 }
          ]
        }]
      }
    }
  })
  assert.deepEqual(result.issues.sort(), ['parallel-cost-schema', 'parallel-require-schema'])
})

test('普通战甲分类路由计入统一获取协议而 Prime 空路由仍待审', () => {
  const ordinary = methodQuality({
    domain: 'warframe',
    raw: {
      frameAcquisition: {
        generated: {
          isPrime: false,
          routing: {
            componentCategory: 'frame-dojo',
            requirements: { type: 'none' },
            methods: []
          }
        }
      }
    }
  })
  const prime = methodQuality({
    domain: 'warframe',
    raw: {
      frameAcquisition: {
        generated: {
          isPrime: true,
          routing: {
            componentCategory: 'frame-prime-relic',
            requirements: { type: 'none' },
            methods: []
          }
        }
      }
    }
  })
  assert.deepEqual(ordinary, { methods: 1, structured: true, issues: [] })
  assert.deepEqual(prime, { methods: 0, structured: false, issues: ['structured-methods-missing'] })
})

test('商店审计要求 NPC、地点、价格和已注册货币', () => {
  const registry = { get: () => null }
  const result = shopQuality({
    offer: {
      npcId: 'npc.missing',
      locationId: 'hub.missing',
      prices: [{ currencyId: 'currency.missing', amount: 0 }]
    }
  }, { currencies: registry, npcs: registry, locations: registry })
  assert.deepEqual(result.issues.sort(), [
    'availability-missing',
    'currency-registry-unresolved',
    'item-display-name-unresolved',
    'item-identity-missing',
    'location-registry-unresolved',
    'npc-registry-unresolved',
    'price-display-name-unresolved',
    'price-invalid',
    'requirement-lines-missing',
    'requirements-missing',
    'unlock-conditions-missing'
  ])
})

test('货币、资源与赋能域按稳定身份审计，不把导航页和赋能基类计为实体', { timeout: 120000 }, () => {
  const report = buildReport({ generatedAt: 'test' })
  const currency = report.domains.currency
  const resources = report.domains['resource-material']
  const arcanes = report.domains.arcane

  assert.deepEqual(currency.counts, {
    expected: 89, resolved: 89, missing: 0, ambiguous: 0, reviewRequired: 0, extra: 0
  })
  assert.equal(new Set(currency.entries.map(item => item.stableId)).size, 89)
  for (const stableId of ['/Lotus/Types/Items/MiscItems/WaterFightBucks', '/Lotus/Types/Items/MiscItems/1999ConquestBucks', '/Lotus/Types/Items/MiscItems/MechSurvivalEventCreds']) {
    assert.equal(currency.entries.find(item => item.stableId === stableId)?.status, 'resolved', stableId)
  }
  assert.equal(currency.entries.filter(item => item.canonical === 'Technocyte Coda Token').length, 5)

  assert.equal(resources.counts.expected, 573)
  assert.equal(resources.counts.missing, 0)
  assert.equal(resources.counts.ambiguous, 0)
  assert.equal(resources.counts.extra, 0)
  assert.ok(resources.counts.resolved > 0)
  assert.ok(resources.counts.reviewRequired > 0, '缺少已实体化获取关系的资源必须继续待审')

  assert.deepEqual(arcanes.counts, {
    expected: 173, resolved: 166, missing: 0, ambiguous: 0, reviewRequired: 7, extra: 0
  })
  assert.equal(arcanes.entries.filter(item => item.reviewReasons.includes('structured-methods-missing')).length, 7)
  assert.equal(arcanes.entries.filter(item => item.reviewReasons.includes('expected-asset-unbound')).length, 0)
})

test('跨源内部路径和节点代码解析到同一注册实体', { timeout: 120000 }, () => {
  const report = buildReport({ generatedAt: 'test' })
  const enemies = report.domains['npc-faction-enemy'].entries
  const locations = report.domains['mission-location'].entries
  assert.notEqual(
    enemies.find(item => item.stableId === '/Lotus/Types/Enemies/Grineer/Eidolon/Vip/Avatars/EidolonVipPilotAvatar')?.status,
    'missing'
  )
  assert.notEqual(locations.find(item => item.stableId === 'SolNode203')?.status, 'missing')
})
