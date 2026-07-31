'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('../src')

const core = createKnowledgeCore({ approvedOnly: false })

test('消耗品模糊名称与正式名复用同一稳定身份和官方中文说明', () => {
  const fuzzy = core.resolveItem('重力磁抵系统')
  assert.equal(fuzzy?.kind, 'consumable')
  assert.equal(fuzzy?.item?.subject?.canonical, 'Gravimag')
  assert.equal(fuzzy?.item?.subject?.displayName, '重力磁抵器')

  for (const query of ['重力磁抵系统', '重力磁抵器', 'Gravimag']) {
    const acquisition = core.getAcquisition(query)
    assert.equal(acquisition?.entry?.subject?.canonical, 'Gravimag', query)
    assert.equal(acquisition?.entry?.subject?.displayName, '重力磁抵器', query)
    assert.equal(acquisition?.entry?.subject?.category, 'consumable', query)
    assert.match(acquisition.description, /允许曲翼枪械在陆地区域使用/, query)
    assert.doesNotMatch(acquisition.description, /Allows|Install this device|Deployment requires|的Mod/, query)
  }
})
