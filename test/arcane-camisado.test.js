'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('..')
const { normalizeArcaneEffectLines } = require('../src/arcane-effect-text')
const { parseWikiStandingVendorFromExcerpt, structuredAcquisition } = require('../scripts/sync-arcanes')

const core = createKnowledgeCore({ approvedOnly: false })

test('赋能·奇袭满级效果去除复活次数并翻译移动速度', () => {
  const lines = normalizeArcaneEffectLines([
    '召唤物进行攻击时会使下一次施放的技能强度增加 6%，最高可达 60%。Summons gain 20% Movement Speed.\n赋能复活次数 +1',
    '赋能复活次数 +1'
  ])
  assert.deepEqual(lines, [
    '召唤物进行攻击时会使下一次施放的技能强度增加 6%，最高可达 60%。',
    '召唤物获得 20% 移动速度加成。'
  ])
  const result = core.getAcquisition('赋能·奇袭')
  assert.match(result.description, /召唤物获得 20% 移动速度加成/)
  assert.doesNotMatch(result.description, /Summons gain|赋能复活次数 \+1/)
})

test('赋能·奇袭 Wiki 冒号等级可解析埃莉诺 7500 声望兑换', () => {
  const excerpt = 'Can be bought from Eleanor of The Hex for 7,500 Standing 7,500 at Rank 3: 2-For-1.'
  const parsed = parseWikiStandingVendorFromExcerpt(excerpt, { provenance: { section: 'Acquisition' } })
  assert.ok(parsed)
  assert.equal(parsed.requirements.npcId, 'npc.eleanor')
  assert.equal(parsed.requirements.amount, 7500)
  assert.equal(parsed.requirements.rankName, '双份惊喜')
})

test('赋能·奇袭掉落来源与埃莉诺兑换', () => {
  const previous = core.getArcane('Arcane Camisado')
  const methods = structuredAcquisition({ uniqueName: previous.officialUniqueName, name: 'Arcane Camisado', drops: [] }, undefined, previous)
  const exchange = methods.find(method => method.type === 'vendor-or-syndicate-exchange')
  assert.ok(exchange, '应补全埃莉诺声望兑换')
  assert.equal(exchange.requirements.amount, 7500)

  const result = core.getAcquisition('赋能·奇袭')
  assert.match(result.description, /埃莉诺|霍瓦尼亚/)
  assert.match(result.description, /7,500声望/)
  assert.match(result.description, /双份惊喜/)
  assert.match(result.description, /1999 歼灭补给箱|歼灭补给箱/)
  assert.match(result.description, /H-09 艾弗旺坦克/)
  assert.doesNotMatch(result.description, /H-09 顶点|H-09 定点|H-09 埃弗隆/)
})
