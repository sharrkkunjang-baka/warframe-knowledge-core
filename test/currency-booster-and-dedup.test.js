'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('../src')
const { acquisitionCardSections, nearDuplicateVisibleLines } = require('../src/acquisition-protocol')
const { buildPlan } = require('../scripts/sync-currency-booster-effects')

const core = createKnowledgeCore({ approvedOnly: false })

test('生息精华按实体证据区分拾取加成、掉率加成与固定兑换成本', () => {
  const result = core.getAcquisition('镀层增幅线圈')
  const method = result.structuredMethods[0]
  assert.deepEqual(method.requirements, {
    type: 'currency',
    usage: 'exchange',
    npcId: 'acquisition-source.arbitration-honors',
    locationId: 'hub.any-relay',
    currency: [{ currencyId: 'currency.vitus-essence', amount: 20 }],
    boosterPolicy: 'currency-entity-metadata'
  })
  assert.match(method.requirementLines.join('\n'), /任务内拾取数量可翻倍/)
  assert.match(method.requirementLines.join('\n'), /任务内掉落几率受影响/)
  assert.match(method.requirementLines.join('\n'), /兑换成本固定为20个生息精华，不会因加成改变/)
  const text = core.getAcquisitionCard('Galvanized Reflex').sections.exchange.join('\n')
  assert.equal((text.match(/仲裁阁下处消耗20个生息精华兑换/g) || []).length, 1)
  assert.deepEqual(nearDuplicateVisibleLines(text.split('\n')), [])
})

test('真正不受加成的命运之珠不会被默认成未知或有效', () => {
  const text = core.getAcquisition('Amanata Pressure').structuredMethods[0].requirementLines.join('\n')
  assert.match(text, /资源数量加成：命运之珠不受影响/)
  assert.match(text, /资源掉落几率加成：命运之珠不受影响/)
  assert.doesNotMatch(text, /缺少明确证据|可翻倍/)
})

test('全量货币加成同步保留 unknown 而不把缺证据武断写成无效', () => {
  const plan = buildPlan({ db: require('node:path').join(__dirname, '..', '.cache', 'warframe-wiki.sqlite') })
  assert.equal(plan.counts.currencies, core.currencies.values.length)
  assert.ok(plan.counts.resourceAmount.unknown > 0)
  assert.ok(plan.counts.resourceDropChance.unknown > 0)
  const credits = core.currencies.get('currency.credits')
  assert.equal(credits.boosterEffects.resourceAmount, 'unknown')
  assert.equal(credits.boosterEffects.resourceDropChance, 'unknown')
})

test('Grendel 三种同价定位装置按 grantsItemId 保留为独立兑换', () => {
  const result = core.getAcquisition('Grendel')
  const exchanges = result.structuredMethods.filter(method => method.type === 'vendor-exchange' && method.scope === 'component-access')
  assert.equal(exchanges.length, 3)
  assert.deepEqual(new Set(exchanges.map(method => method.variables.grantsItemId)).size, 3)
  assert.ok(exchanges.every(method => method.requirements.currency.some(item => item.currencyId === 'currency.vitus-essence' && item.amount === 25)))
  const missions = result.structuredMethods.filter(method => method.type === 'mission-reward' && method.scope === 'component')
  assert.deepEqual(missions.map(method => [method.variables.partName, method.locationId, method.requirements.items[0].itemId]), [
    ['头部神经光元', 'mission.grendel-archaeo-freighter', '/Lotus/Types/Keys/GrendelKeyB'],
    ['机体', 'mission.grendel-icefields-of-riddah', '/Lotus/Types/Keys/GrendelKeyA'],
    ['系统', 'mission.grendel-mines-of-karishh', '/Lotus/Types/Keys/GrendelKeyC']
  ])
  assert.ok(missions.every(method => method.requirementLines.includes('特殊任务规则：')))
  assert.ok(missions.every(method => method.requirementLines.includes('Mod 和赋能均被禁用；技能强化 Mod（Augment Mods，包括战甲技能强化 Mod）仍然生效')))
  const text = result.frameRoute.lines.join('\n')
  assert.match(text, /Grendel 头部神经光元定位装置.*25个生息精华/)
  assert.match(text, /Grendel 机体定位装置.*25个生息精华/)
  assert.match(text, /Grendel 系统定位装置.*25个生息精华/)
  assert.match(text, /上古货船（生存），生存 20 分钟获得/)
  assert.match(text, /Riddah 冰原（防御），完成 6 波防御获得/)
  assert.match(text, /卡瑞什之矿（挖掘），挖掘 800 永冻晶矿获得/)
  assert.match(text, /特殊任务规则：\nMod 和赋能均被禁用；技能强化 Mod（Augment Mods，包括战甲技能强化 Mod）仍然生效/)
  assert.doesNotMatch(text, /集团武器|科达|Helminth|执刑官源力石|完成指定任务/)
})

test('共享去重保留地点和费用不同的两个相似兑换 method', () => {
  const methods = [
    {
      type: 'vendor-exchange',
      sourceEntityId: 'npc.one',
      locationId: 'hub.one',
      sourceDisplayName: '甲商人',
      locationDisplayName: '甲地点',
      requirements: { type: 'currency' },
      requirementLines: ['在甲地点找甲商人兑换，需要20个测试货币']
    },
    {
      type: 'vendor-exchange',
      sourceEntityId: 'npc.two',
      locationId: 'hub.two',
      sourceDisplayName: '乙商人',
      locationDisplayName: '乙地点',
      requirements: { type: 'currency' },
      requirementLines: ['在乙地点找乙商人兑换，需要30个测试货币']
    }
  ]
  const sections = acquisitionCardSections(methods)
  assert.equal(sections.exchange.length, 2)
  assert.match(sections.exchange[0].text, /甲地点.*20个/)
  assert.match(sections.exchange[1].text, /乙地点.*30个/)
})
