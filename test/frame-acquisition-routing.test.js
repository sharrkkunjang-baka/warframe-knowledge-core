'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { createKnowledgeCore, frameAcquisition } = require('..')

const ROOT = path.resolve(__dirname, '..')
const FRAME_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'warframe')
const INDEX = JSON.parse(fs.readFileSync(path.join(FRAME_ROOT, 'categories.json'), 'utf8'))
function route(name) { return INDEX.frames.find(item => item.canonical === name) }
function entry(name) { const item = route(name); return JSON.parse(fs.readFileSync(path.join(FRAME_ROOT, item.file), 'utf8'))[0] }

test('categories.json 完整、互斥且路径归属主分类', () => {
  assert.equal(INDEX.count, 116)
  assert.equal(INDEX.frames.length, 116)
  assert.equal(new Set(INDEX.frames.map(item => item.officialUniqueName)).size, 116)
  for (const item of INDEX.frames) {
    assert.match(item.componentCategory, /^frame-/)
    assert.ok(item.file.startsWith(`${item.componentCategory.replace(/^frame-/, '')}/`), item.canonical)
    assert.ok(fs.existsSync(path.join(FRAME_ROOT, item.file)), item.file)
  }
})

test('总图第二分类仅在不同来源时显示', () => {
  assert.equal(route('Mag').componentCategory, 'frame-assassination')
  assert.equal(route('Mag').blueprintCategory, 'market')
  assert.equal(route('Ivara Prime').blueprintCategory, null)
  assert.equal(route('Volt').componentCategory, 'frame-dojo')
  assert.equal(route('Volt').blueprintCategory, null)
})

test('刷磁妹走商城总图与刺杀模板', () => {
  const routed = frameAcquisition.renderRoutedAcquisition('磁妹')
  assert.deepEqual(routed.lines, ['商城购买总图', '火卫一刺杀 军士 刷取部件'])
  const core = createKnowledgeCore()
  const result = core.getAcquisition('磁妹')
  assert.equal(result.frameRoute.source, 'category-method')
  assert.equal(result.description, '商城购买总图\n火卫一刺杀 军士 刷取部件')
})

test('指定战甲主分类正确且特定任务从独立 JSON 回退', () => {
  assert.equal(route('Cyte-09').componentCategory, 'frame-bounty')
  assert.equal(route('Gara').componentCategory, 'frame-bounty')
  assert.equal(route('Garuda').componentCategory, 'frame-bounty')
  assert.equal(route('Octavia').componentCategory, 'frame-mixed-missions')
  assert.equal(route('Xaku').componentCategory, 'frame-bounty')
  for (const name of ['Jade', 'Citrine', 'Kullervo']) {
    assert.equal(route(name).componentCategory, 'frame-specific-mission')
    assert.ok(entry(name).frameAcquisition.manual.acquisitionText)
    assert.equal(frameAcquisition.renderRoutedAcquisition(name).source, 'frame-json')
  }
})

test('任务、NPC、地点和刺杀目标均通过实体变量渲染', () => {
  const limbo = entry('Limbo').frameAcquisition.generated.routing.componentVariables
  assert.deepEqual({ npcId: limbo.npcId, questId: limbo.questId }, { npcId: 'npc.cephalon-simaris', questId: 'quest.the-limbo-theorem' })
  assert.equal(frameAcquisition.renderRoutedAcquisition('Limbo').lines.join('\n'), '商城购买总图\n首次完成《Limbo 定理》获得部件蓝图；之后可在 中枢 Simaris 处回购')
  const mesa = entry('Mesa').frameAcquisition.generated.routing.componentVariables
  assert.deepEqual({ locationId: mesa.locationId, enemyId: mesa.enemyId }, { locationId: 'planet.eris', enemyId: 'enemy.mutalist-alad-v' })
  assert.equal(frameAcquisition.renderRoutedAcquisition('女枪').lines.join('\n'), '商城购买总图\n阋神星刺杀 异融 Alad V 刷取部件')
  const gyre = entry('Gyre').frameAcquisition.generated.routing.componentVariables
  assert.equal(gyre.hubs[0].locationId, 'hub.zariman')
  assert.equal(gyre.hubs[0].npcId, 'npc.quinn')
  assert.equal(frameAcquisition.renderRoutedAcquisition('电妹').lines.at(-1), '在扎里曼号找奎因接取赏金刷取部件')
})

test('Narmer 赏金通过 faction 注册表自动显示为合一众', () => {
  const caliban = entry('Caliban')
  assert.equal(caliban.frameAcquisition.generated.routing.componentVariables.factionId, 'faction.narmer')
  assert.equal(createKnowledgeCore().getFaction('Narmer').displayName, '合一众')
  assert.equal(frameAcquisition.renderRoutedAcquisition('卡利班').lines.join('\n'), '商城购买总图\n在希图斯找孔祝，或在福尔图娜找尤迪科接取合一众赏金刷取部件')
  assert.deepEqual(caliban.frameAcquisition.generated.routing.componentVariables.levelRange, { min: 50, max: 70 })
  assert.equal(caliban.frameAcquisition.generated.routing.componentVariables.hubs[0].npcId, 'npc.konzu')
})

test('method 模板与编译路由可自动发布', () => {
  const core = createKnowledgeCore()
  assert.equal(core.frameCategories.count, 116)
  assert.ok(core.frameMethods.some(item => item.scope === 'components' && item.category === 'frame-assassination'))
  assert.ok(core.frameMethods.some(item => item.scope === 'blueprint' && item.category === 'market'))
})
