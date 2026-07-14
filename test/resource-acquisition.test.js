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

test('资源 method 目录覆盖索引中的全部分类', () => {
  const index = JSON.parse(fs.readFileSync(path.join(RESOURCE_ROOT, 'categories.json'), 'utf8'))
  const methods = coreModule.resourceAcquisition.METHODS
  for (const item of index.resources) assert.ok(methods[item.category], item.category)
})
