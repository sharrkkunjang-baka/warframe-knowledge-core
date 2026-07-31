'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { audit, entityClosureIssues, FORBIDDEN_PROVENANCE } = require('../scripts/audit-acquisition-quality')
const { structuredMethods } = require('../src/acquisition-core')
const { compileOfficialTemplateEffect } = require('../scripts/sync-mod-wiki')
const { exchangeRequirementIssues } = require('../src/acquisition-protocol')
const { loadData } = require('../src/loader')

const ROOT = path.resolve(__dirname, '..')
const BASELINE = path.join(ROOT, 'artifacts', 'acquisition-zero-baseline.json')

test('已发布获取目录严格为零且覆盖不低于修复前基线', () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  const report = audit()
  assert.equal(report.totals.publishedIssueCount, 0)
  assert.deepEqual(report.publishedIssues, [])
  assert.ok(report.totals.approvedEntries >= baseline.coverage.approvedEntries)
  assert.ok(report.totals.publishedMethods >= baseline.coverage.publishedMethods)
})

test('共享终结器幂等并保持 requirementLines 与审核状态稳定', () => {
  const registries = loadData(ROOT, { approvedOnly: false })
  const input = [{
    type: 'vendor-exchange',
    sourceEntityId: 'npc.cavalero',
    npcId: 'npc.cavalero',
    locationId: 'hub.zariman',
    requirements: { type: 'standing', factionId: 'faction.the-holdfasts', rank: 0, amount: 5000 },
    reviewStatus: 'approved'
  }]
  const once = structuredMethods(input, registries)
  const twice = structuredMethods(once, registries)
  assert.deepEqual(twice, once)
  assert.ok(Array.isArray(once[0].requirementLines))
})

test('地点商店兑换合法但普通地点不能冒充兑换 Actor', () => {
  const registries = loadData(ROOT, { approvedOnly: false })
  const base = { type: 'vendor-or-syndicate-exchange', requirements: { type: 'currency', usage: 'exchange', currency: [{ currencyId: 'currency.nora-s-mix-vol-8-cred', amount: 20 }] } }
  assert.deepEqual(exchangeRequirementIssues({ ...base, locationId: 'interface.nightwave', requirements: { ...base.requirements, locationId: 'interface.nightwave' } }, registries), [])
  assert.ok(exchangeRequirementIssues({ ...base, locationId: 'hub.any-relay', requirements: { ...base.requirements, locationId: 'hub.any-relay' } }, registries).includes('actor'))
})

test('实体闭包和生产 provenance 拒绝悬空引用及 Fandom/Wikia', () => {
  const registries = loadData(ROOT, { approvedOnly: false })
  assert.deepEqual(entityClosureIssues({ requirements: { type: 'none' } }, registries), [])
  assert.deepEqual(entityClosureIssues({ locationId: 'location.the-descendia', requirements: { type: 'none' } }, registries), [])
  assert.deepEqual(entityClosureIssues({ locationId: 'mission-node.hyf-solnode707', requirements: { type: 'none' } }, registries), [])
  assert.ok(entityClosureIssues({ npcId: 'npc.not-real', requirements: { type: 'none' } }, registries).includes('unresolved-actor-reference'))
  assert.equal(entityClosureIssues({ sourceEntityId: 'acquisition-source.arbitration-honors', requirements: { type: 'currency', npcId: 'acquisition-source.arbitration-honors', currency: [] } }, registries).includes('unresolved-actor-reference'), false)
  assert.ok(FORBIDDEN_PROVENANCE.test('https://warframe.fandom.com/wiki/Test'))
  assert.ok(entityClosureIssues({ requirements: { type: 'none' }, provenance: { url: 'https://x.wikia.com/wiki/Test' } }, registries).includes('forbidden-fandom-provenance'))
})

test('共享实体终结器规范化旧地点 ID 和任务类型', () => {
  const registries = loadData(ROOT, { approvedOnly: false })
  const methods = structuredMethods([
    { type: 'container-drop', locationId: 'location.the-descendia', requirements: { type: 'none' } },
    { type: 'route', locationId: 'mission-node.hyf-solnode707', requirements: { type: 'none' } },
    { type: 'mission-reward', missionTypeEntityId: 'mission-type.weekly-conclave-challenge-reward', requirements: { type: 'none' } }
  ], registries)
  assert.equal(methods[0].locationId, 'activity.the-descendia')
  assert.equal(methods[0].locationDisplayName, '沉沦之地')
  assert.equal(methods[1].locationId, 'mission.hyf-solnode707')
  assert.equal(methods[2].missionTypeDisplayName, '武形秘仪每周挑战奖励')
})

test('共享 Wiki 效果编译器用页面满级数值填充本地化占位符', () => {
  const entry = {
    officialUniqueName: '/Lotus/Powersuits/Frost/FrostPassiveAugmentCard',
    effectDetails: ['被动强化：Frost 攻击被冻住的敌人时获得 +|几率|% 暴击几率和 +|伤害|% 暴击伤害。']
  }
  const page = { sections: [{ title: 'Lead', text: 'Max Rank Description Frost gains +200% Critical Chance and +200% Critical Damage against frozen enemies. General Information' }] }
  const effect = compileOfficialTemplateEffect(entry, page)
  assert.equal(effect, '被动强化：Frost 攻击被冻住的敌人时获得 +200% 暴击几率和 +200% 暴击伤害。')
  assert.doesNotMatch(effect, /\|[^|]+\|/)
})
