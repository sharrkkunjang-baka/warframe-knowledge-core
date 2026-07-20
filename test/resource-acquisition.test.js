'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const coreModule = require('..')
const sync = require('../scripts/sync-resource-knowledge')

const ROOT = path.resolve(__dirname, '..')
const RESOURCE_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'resource')

test('资源知识自动编译并区分自动层与人工技巧层', () => {
  const entry = sync.buildPlan().entries.find(item => item.subject.canonical === 'Argon Crystal')
  assert.equal(entry.resourceAcquisition.generated.routing.category, 'resource-location')
  assert.ok(entry.resourceAcquisition.manual.tips.includes('击杀敌人、破坏容器并寻找氩结晶矿脉；氩结晶会随现实时间衰减，最好在准备制造对应物品时再刷取。'))
  assert.ok(entry.resourceAcquisition.manual.tipKeywords.includes('衰减'))
})

test('同步资源时保留人工技巧、关键词和路由覆盖', () => {
  const official = require('../knowledge/generated/official-items.json').items.find(item => item.canonical === 'Argon Crystal')
  const old = {
    updatedAt: '2026-07-14', prerequisites: [], methodRefs: [],
    resourceAcquisition: { manual: { tips: ['携带资源探测类 Mod，优先寻找氩结晶岩柱。'], tipKeywords: ['探测', '岩柱'], routingOverride: { category: 'resource-location', variables: { resourceName: '氩结晶', locationIds: ['planet.void'] }, status: 'compiled' }, reviewedBy: ['manual-review'] } }
  }
  const next = sync.buildEntry(official, old)
  assert.deepEqual(next.resourceAcquisition.manual, old.resourceAcquisition.manual)
  assert.equal(next.reviewStatus, 'approved')
})

test('刷资源读取 method JSON 并只发布已结构化资源', () => {
  const core = coreModule.createKnowledgeCore()
  assert.equal(core.getResourceAcquisition('氩结晶').routeText, '推荐前往虚空收集氩结晶')
  assert.match(core.getResourceAcquisition('氩结晶').text, /小技巧：/)
  assert.equal(core.getAcquisition('氩结晶').resourceRoute.source, 'resource-method')
  const unresolved = core.listResources().find(item => item.reviewStatus === 'draft')
  assert.ok(unresolved)
  assert.equal(core.getResourceAcquisition(unresolved.canonical), null)
})

test('所有已批准资源都能通过 method 模板渲染且不含原始英文地点', () => {
  const core = coreModule.createKnowledgeCore()
  for (const item of core.listResources().filter(resource => resource.reviewStatus === 'approved')) {
    const result = core.getResourceAcquisition(item.canonical)
    assert.ok(result?.routeText, item.canonical)
    assert.doesNotMatch(result.routeText, /\b(?:Earth|Venus|Mars|Ceres|Saturn|Void|Deimos|Eris|Lua)\b/, item.canonical)
  }
})

test('生息精华仲裁来源不泄漏游戏富文本图标',()=>{const core=coreModule.createKnowledgeCore({approvedOnly:false}),text=core.getAcquisition('生息精华').description;assert.match(text,/完成仲裁任务的轮次奖励/);assert.doesNotMatch(text,/<DT_|[⚡🔥☠❄]/)});
test('资源 method 目录覆盖索引中的全部分类', () => {
  const index = JSON.parse(fs.readFileSync(path.join(RESOURCE_ROOT, 'categories.json'), 'utf8'))
  const methods = coreModule.resourceAcquisition.METHODS
  for (const item of index.resources) assert.ok(methods[item.category], item.category)
})

test('刷 碲使用官方简中获取文案且不会落入希图斯赏金模板', () => {
  const core = coreModule.createKnowledgeCore({ approvedOnly: false })
  assert.deepEqual(core.parseAcquisitionCommand('刷 碲'), { intent: 'acquisition', query: '碲' })
  const candidates = core.searchOfficialItems('碲', { limit: 20 })
  assert.deepEqual(candidates.map(item => item.canonical), ['Tellurium'])
  assert.equal(core.resolveItem('碲').item.canonical, 'Tellurium')

  const result = core.getAcquisition('碲')
  assert.equal(result.entry.id, 'knowledge.acquisition.resource.tellurium')
  assert.equal(result.entry.resourceAcquisition.generated.routing.category, 'resource-activity')
  assert.match(result.description, /获取地点：天王星上的曲翼任务/)
  assert.doesNotMatch(result.description, /希图斯赏金/)
  assert.deepEqual(result.entry.methodRefs, [])
  assert.deepEqual(result.requirements, { type: 'none' })
  assert.deepEqual(result.requirementLines, [])
  assert.deepEqual(result.structuredMethods.map(method => ({
    type: method.type,
    category: method.category,
    locationId: method.locationId,
    locationDisplayName: method.locationDisplayName,
    requirements: method.requirements,
    requirementLines: method.requirementLines
  })), [{
    type: 'route',
    category: 'resource-activity',
    locationId: 'planet.uranus',
    locationDisplayName: '天王星',
    requirements: { type: 'none' },
    requirementLines: []
  }])
})

test('资源证据区分百分百商店项与真实希图斯赏金', () => {
  const plan = sync.buildPlan()
    const approvedManual = plan.entries.filter(entry => entry.resourceAcquisition?.manual?.routingOverride)
  for (const entry of approvedManual) {
    assert.deepEqual(entry.resourceAcquisition.generated.routing, entry.resourceAcquisition.manual.routingOverride, entry.subject.canonical)
  }

  const vendorEvidence = plan.entries.flatMap(entry => entry.resourceAcquisition.generated.evidence)
    .filter(source => sync.isVendorOffer({ location: source.canonical, chance: source.chance }))
  assert.ok(vendorEvidence.length > 0)
  assert.ok(vendorEvidence.every(source => source.type === 'raw-official-vendor-offer'))

  const cetusWisp = plan.entries.find(entry => entry.subject.canonical === 'Cetus Wisp')
  const bountyEvidence = cetusWisp.resourceAcquisition.generated.evidence
    .filter(source => /Cetus Bounty/.test(source.canonical))
  assert.ok(bountyEvidence.length > 0)
  assert.ok(bountyEvidence.every(source => source.type === 'raw-official-drop' && source.chance < 1))
})
