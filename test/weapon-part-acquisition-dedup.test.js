'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('../src')
const { acquisitionCardSections, renderAcquisition, collapseSharedPartAcquisitionMethods } = require('../src/acquisition-protocol')

const core = createKnowledgeCore({ approvedOnly: false })

test('米特尔总图与全部部件来源一致时合并为一条', () => {
  const result = core.getAcquisition('Miter')
  const description = result.description || ''
  assert.match(description, /总图及全部部件：完成谷神星\/Exta（刺杀）概率获得/)
  assert.doesNotMatch(description, /Assassination/)
  assert.doesNotMatch(description, /米特尔 枪管：/)
  const sections = acquisitionCardSections(result.structuredMethods, { registries: core._data })
  assert.equal(sections.other.length, 1)
  assert.match(sections.other[0].text, /总图及全部部件：完成谷神星\/Exta（刺杀）概率获得/)
  assert.doesNotMatch(sections.other[0].text, /Assassination/)
})

test('预言者刺杀节点不泄漏英文任务类型括注', () => {
  const result = core.getAcquisition('Seer')
  const text = result.description || ''
  assert.match(text, /水星\/Tolstoj（刺杀）/)
  assert.doesNotMatch(text, /Assassination/)
})

test('Grendel 三部件来源不同时不合并', () => {
  const result = core.getAcquisition('Grendel')
  const missions = result.structuredMethods.filter(method => method.type === 'mission-reward' && method.scope === 'component')
  assert.equal(missions.length, 3)
  const collapsed = collapseSharedPartAcquisitionMethods(missions)
  assert.equal(collapsed.length, 3)
  const sections = acquisitionCardSections(result.structuredMethods, { registries: core._data })
  assert.ok(sections.other.length >= 3)
  const text = sections.other.map(item => item.text).join('\n')
  assert.match(text, /头部神经光元/)
  assert.match(text, /机体/)
  assert.match(text, /系统/)
})

test('仅部件来源一致时合并部件名称，总图来源不同则保留独立行', () => {
  const methods = [
    {
      type: 'mission-reward',
      scope: 'blueprint',
      reviewStatus: 'approved',
      locationDisplayName: '节点A',
      missionTypeDisplayName: '刺杀',
      chance: 0.1,
      variables: {}
    },
    {
      type: 'mission-reward',
      scope: 'component',
      reviewStatus: 'approved',
      locationDisplayName: '节点B',
      missionTypeDisplayName: '刺杀',
      chance: 0.1,
      variables: { partName: '测试 枪管' }
    },
    {
      type: 'mission-reward',
      scope: 'component',
      reviewStatus: 'approved',
      locationDisplayName: '节点B',
      missionTypeDisplayName: '刺杀',
      chance: 0.1,
      variables: { partName: '测试 枪托' }
    }
  ]
  const collapsed = collapseSharedPartAcquisitionMethods(methods, { showProbabilities: false })
  assert.equal(collapsed.length, 2)
  const text = renderAcquisition(methods, { showProbabilities: false })
  assert.match(text, /总图：/)
  assert.match(text, /测试 枪管、枪托：/)
})

test('部件概率不同时不合并', () => {
  const methods = [
    {
      type: 'mission-reward',
      scope: 'component',
      reviewStatus: 'approved',
      locationDisplayName: '节点A',
      missionTypeDisplayName: '刺杀',
      chance: 0.1,
      variables: { partName: '测试 枪管' }
    },
    {
      type: 'mission-reward',
      scope: 'component',
      reviewStatus: 'approved',
      locationDisplayName: '节点A',
      missionTypeDisplayName: '刺杀',
      chance: 0.2,
      variables: { partName: '测试 枪托' }
    }
  ]
  assert.equal(collapseSharedPartAcquisitionMethods(methods).length, 2)
})
