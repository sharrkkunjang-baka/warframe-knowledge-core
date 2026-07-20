'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeCore } = require('..')
const { officialBossLocationIndex } = require('../scripts/migrate-entity-registries')

const core = createKnowledgeCore({ approvedOnly: false })

function enemyLine(query, enemyName) {
  const card = core.getAcquisitionCard(query)
  assert.ok(card, `${query} 应生成获取卡`)
  return card.sections.enemy.find(line => line.includes(enemyName))
}

test('云暴山碎保留官方身份、全部敌人来源和武形秘仪中文协议', () => {
  const card = core.getAcquisitionCard('云暴山碎')
  assert.deepEqual(card.identity, {
    canonical: 'Shattering Storm',
    displayName: '云暴山碎',
    uniqueName: '/Lotus/Weapons/Tenno/Melee/MeleeTrees/HammerCmbOneMeleeTree'
  })
  assert.match(enemyLine('云暴山碎', 'Sargas Ruk 将军'), /土星 Tethys 刺杀 · Sargas Ruk 将军（概率获得，11\.06%）/)
  assert.match(enemyLine('云暴山碎', '指挥官'), /指挥官（概率获得，11\.06%）/)
  assert.ok(card.sections.other.some(line => /武形秘仪每周挑战奖励 A轮（概率获得）/.test(line)))
  assert.doesNotMatch(JSON.stringify(card.sections), /Weekly Conclave Challenge Reward/)
})

test('刺杀 Boss 掉落协议跨至少三个其他 Mod 保留星球、节点、Boss 和概率语义', () => {
  assert.match(enemyLine('Vulcan Blitz', 'Kela De Thaym'), /赛德娜 Merrow 刺杀 · Kela De Thaym（概率获得，11\.11%）/)
  assert.match(enemyLine('Intensify', 'Alad V'), /木星 Themisto 刺杀 · Alad V（概率获得，2\.01%）/)
  assert.match(enemyLine('Pressure Point', 'Ambulas'), /冥王星 Hades 刺杀 · Ambulas（概率获得，60\.704%）/)
})

test('Boss 节点由官方 agent/avatar 关系生成而非字符串猜测', () => {
  const locations = officialBossLocationIndex()
  assert.equal(
    locations.get('/Lotus/Types/Enemies/Grineer/Vip/SargasRuk/Avatars/SargasRukAvatarNew')?.nodeId,
    'SolNode32'
  )
  assert.equal(
    locations.get('/Lotus/Types/Enemies/Corpus/Vip/AladV/AladBossAvatar')?.nodeCanonical,
    'Themisto'
  )
  assert.equal(
    locations.get('/Lotus/Types/Enemies/Corpus/Vip/Ambulas/AmbulasPackAvatar')?.planetDisplayName,
    '冥王星'
  )
})
