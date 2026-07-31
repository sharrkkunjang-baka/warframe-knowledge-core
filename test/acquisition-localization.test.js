'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('../src')

const USER_VISIBLE_ENGLISH_ENTITIES = /\b(?:Earth|Venus|Mercury|Mars|Phobos|Ceres|Jupiter|Europa|Saturn|Uranus|Neptune|Pluto|Sedna|Eris|Lua|Deimos|Spy|Defense|Survival|Capture|Rescue|Disruption|Exterminate|Interception|Excavation)\b/

test('灼痕焦点的星球和任务类型通过共享实体本地化', () => {
  for (const approvedOnly of [true, false]) {
    const core = createKnowledgeCore({ approvedOnly })
    const card = core.getAcquisitionCard('灼痕焦点')
    assert.deepEqual(card.sections.acquisition, [
      '完成下列间谍任务的 C 轮后概率获得：\n阋神星/Cyath\n阋神星/Gnathos\n海王星/Nereid\n冥王星/Oceanum\n赛德娜/Kelpie\n赛德娜/Tikoloshe\n天王星/Rosalind',
      '完成下列间谍任务的 B 轮后概率获得：\n赤毒要塞/Pago'
    ])
    assert.doesNotMatch(card.sections.acquisition.join('\n'), /\b(?:Eris|Sedna|Spy)\b/)
  }
})

test('所有 Mod 获取卡不暴露可本地化的英文实体', () => {
  const core = createKnowledgeCore({ approvedOnly: false })
  const leaks = core.officialMods.flatMap(mod => {
    const card = core.getAcquisitionCard(mod.canonical)
    const lines = Object.values(card?.sections || {}).flat().filter(line => USER_VISIBLE_ENGLISH_ENTITIES.test(line))
    return lines.map(line => `${mod.canonical}: ${line}`)
  })
  assert.deepEqual(leaks, [], leaks.join('\n'))
})
