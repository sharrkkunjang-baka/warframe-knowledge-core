'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createKnowledgeCore } = require('..')
const { officialBossLocationIndex } = require('../scripts/migrate-entity-registries')

const core = createKnowledgeCore({ approvedOnly: false })
const MOD_ROOT = path.resolve(__dirname, '..', 'knowledge', 'acquisition', 'mod')

function jsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? jsonFiles(target) : entry.name.endsWith('.json') ? [target] : []
  })
}

function acquisitionEntries() {
  return jsonFiles(MOD_ROOT)
    .flatMap(file => JSON.parse(fs.readFileSync(file, 'utf8')))
    .filter(entry => entry?.subject?.canonical)
}

function generatedMethods(entry) {
  const generated = entry.modAcquisition?.generated || {}
  return [
    ...(generated.wiki?.methods || []),
    ...(generated.officialDrops || [])
  ]
}

function enemyLine(query, enemyName) {
  const card = core.getAcquisitionCard(query)
  assert.ok(card, `${query} 应生成获取卡`)
  return card.sections.enemy.find(line => line.includes(enemyName))
}

test('云暴山碎保留官方锤架式身份、单一规范敌人和武形秘仪中文协议', () => {
  const card = core.getAcquisitionCard('云暴山碎')
  assert.deepEqual(card.identity, {
    canonical: 'Shattering Storm',
    displayName: '云暴山碎',
    uniqueName: '/Lotus/Weapons/Tenno/Melee/MeleeTrees/HammerCmbOneMeleeTree'
  })
  assert.deepEqual({ type: card.modInfo.type, compatName: card.modInfo.compatName }, { type: 'Stance Mod', compatName: 'Hammers' })
  assert.deepEqual(card.sections.enemy, ['- 土星 Tethys 刺杀 · Sargas Ruk 将军（概率获得，11.06%）'])
  assert.ok(card.sections.other.some(line => /武形秘仪每周挑战奖励 A轮（概率获得，2\.27%）/.test(line)))
  assert.doesNotMatch(JSON.stringify(card.sections), /Weekly Conclave Challenge Reward|指挥官/)
})

test('刺杀 Boss 掉落协议跨至少三个其他 Mod 保留星球、节点、Boss 和概率语义', () => {
  assert.match(enemyLine('Vulcan Blitz', 'Kela De Thaym'), /赛德娜 Merrow 刺杀 · Kela De Thaym（概率获得，11\.11%）/)
  assert.match(enemyLine('Intensify', 'Alad V'), /木星 Themisto 刺杀 · Alad V（概率获得，2\.01%）/)
  assert.match(enemyLine('Pressure Point', 'Ambulas'), /冥王星 Hades 刺杀 · Ambulas（概率获得，60\.704%）/)
})

test('全部 Mod 敌人掉落都引用注册实体，且复合头衔实体不会拆分', () => {
  let checked = 0
  for (const entry of acquisitionEntries()) {
    const result = core.getAcquisition(entry.subject.canonical)
    for (const method of result?.structuredMethods || []) {
      if (method.type !== 'enemy-drop') continue
      assert.ok(method.sourceEntityId, `${entry.subject.canonical}: enemy-drop 缺少 stable identity`)
      const enemy = core.resolveEntityVariables(method.sourceEntityId)
      assert.ok(enemy.some(candidate => candidate.type === 'enemy' && candidate.id === method.sourceEntityId), `${entry.subject.canonical}: ${method.sourceEntityId} 未解析到敌人实体`)
      checked += 1
    }
  }
  assert.ok(checked > 100, `应全量审计大量 Mod 敌人来源，实际 ${checked}`)
  for (const [canonical, expectedId] of [
    ['General Sargas Ruk', 'enemy.general-sargas-ruk'],
    ['Captain Vor', 'enemy.captain-vor'],
    ['Narmer Commander', 'enemy.narmer-commander'],
    ['Blite Captain', 'enemy.blite-captain']
  ]) {
    const resolved = core.resolveEntityVariables(canonical)
    assert.ok(resolved.some(candidate => candidate.id === expectedId), `${canonical} 必须保持完整 stable identity`)
  }
})

test('全部已录入刺杀 Boss Mod 掉落都保留完整上下文并按敌人去重', () => {
  const bossCanonicals = new Set(jsonFiles(path.resolve(__dirname, '..', 'knowledge', 'enemies', 'enemy'))
    .map(file => JSON.parse(fs.readFileSync(file, 'utf8')))
    .filter(enemy => enemy.bossLocation)
    .map(enemy => enemy.canonical))
  const affected = acquisitionEntries().filter(entry =>
    generatedMethods(entry).some(method => bossCanonicals.has(method.sourceCanonical)))
  let checked = 0
  for (const entry of affected) {
    const result = core.getAcquisition(entry.subject.canonical)
    const card = core.getAcquisitionCard(entry.subject.canonical)
    if (!result || !card) continue
    const methods = result.structuredMethods.filter(method => method.bossLocation && method.sourceDisplayName)
    for (const method of methods) {
      const expectedContext = `${method.bossLocation.planetDisplayName} ${method.bossLocation.nodeDisplayName} 刺杀 · ${method.sourceDisplayName}`
      const matches = card.sections.enemy.filter(line => line.includes(expectedContext))
      assert.equal(matches.length, 1, `${entry.subject.canonical}: ${expectedContext}`)
      assert.match(matches[0], /（概率获得(?:，\d+(?:\.\d+)?%)?）$/)
      checked += 1
    }
  }
  assert.ok(checked >= 4, `应覆盖至少 4 个刺杀 Boss 掉落，实际 ${checked}`)
})

test('全部武形秘仪每周挑战来源都使用审核中文而非内部 token', () => {
  const affected = acquisitionEntries().filter(entry => {
    const methods = entry.modAcquisition?.generated?.wiki?.methods || []
    return methods.some(method => method.missionTypeCanonical === 'Weekly Conclave Challenge Reward')
  })
  assert.ok(affected.length > 1, '审计必须覆盖同来源类型而非单个 Mod')
  for (const entry of affected) {
    const card = core.getAcquisitionCard(entry.subject.canonical)
    assert.ok(card.sections.other.some(line => /武形秘仪每周挑战奖励 [A-Z]轮（概率获得，\d+(?:\.\d+)?%）/.test(line)), entry.subject.canonical)
    assert.doesNotMatch(JSON.stringify(card.sections), /Weekly Conclave Challenge Reward/, entry.subject.canonical)
  }
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
