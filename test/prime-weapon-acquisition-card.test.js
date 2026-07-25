'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('../src')
const { buildPrimeWeaponCardAcquisitionLines } = require('../src/prime-acquisition')

const core = createKnowledgeCore({ approvedOnly: false })

test('Prime 武器卡片获取来源显示入库状态', () => {
  const card = core.getAcquisitionCard('玻之武杖 Prime')
  assert.ok(card)
  assert.match(card.sections.acquisition.join('\n'), /当前已入库/)
  assert.match(card.sections.acquisition.join('\n'), /没有可刷取遗物/)
})

test('Prime 武器卡片获取来源显示出库遗物分组', () => {
  const card = core.getAcquisitionCard('塞多 Prime')
  const text = card.sections.acquisition.join('\n')
  assert.match(text, /Prime 状态：当前出库/)
  assert.match(text, /总图：中纪 C9（金）/)
  assert.match(text, /枪机：古纪 K12（银）；古纪 Q3（银）/)
  assert.doesNotMatch(text, /开启.*遗物.*获得/)
})

test('buildPrimeWeaponCardAcquisitionLines 对非遗物 Prime 返回 null', () => {
  const sagek = core.getWeapon('杀格 Prime')
  assert.equal(buildPrimeWeaponCardAcquisitionLines(sagek, []), null)
})
