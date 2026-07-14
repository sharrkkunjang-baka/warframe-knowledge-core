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
  for (const name of ['Jade', 'Citrine', 'Kullervo']) assert.equal(route(name).componentCategory, 'frame-specific-mission')
  assert.ok(entry('Kullervo').frameAcquisition.manual.acquisitionText)
  assert.equal(frameAcquisition.renderRoutedAcquisition('Kullervo').source, 'frame-json')
  assert.equal(frameAcquisition.renderRoutedAcquisition('Citrine').source, 'category-method')
  assert.equal(frameAcquisition.renderRoutedAcquisition('Jade').source, 'category-method')
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

test('Jade 使用任务节点、NPC 与货币变量展示掉落和保底兑换', () => {
  const jade = entry('Jade').frameAcquisition.generated.routing.componentVariables
  assert.equal(jade.locationId, 'planet.uranus')
  assert.equal(jade.missionNodeId, 'mission-node.brutus')
  assert.equal(jade.exchange.npcId, 'npc.ordis')
  assert.equal(jade.exchange.currencyId, 'currency.vestigial-motes')
  assert.deepEqual(frameAcquisition.renderRoutedAcquisition('Jade').lines, [
    '完成《翠玉之影》获得总图',
    '在天王星的布鲁图斯（扬升）刷取，部件蓝图掉率 4.63%',
    '也可在 Ordis 处使用残存微粒兑换：部件蓝图每张 150，总图 450'
  ])
})

test('Dante 使用节点、任务类型、NPC 与兑换货币变量', () => {
  const routing = entry('Dante').frameAcquisition.generated.routing.componentVariables
  assert.equal(routing.sources[0].missionNodeId, 'mission-node.armatus')
  assert.equal(routing.exchange.npcId, 'npc.loid')
  assert.equal(routing.exchange.currencyId, 'currency.vessel-capillaries')
  assert.deepEqual(frameAcquisition.renderRoutedAcquisition('Dante').lines, [
    '在火卫二的卫城区（中断） C 轮刷取部件蓝图\n也可在 洛德 处使用承载体毛细血管兑换：部件蓝图每张 90，总图 270，全套共 540\n承载体毛细血管怎么刷：在火卫二的卫城区（中断）击败爆破使，普通每只掉落 2-4，钢铁之路每只 5-7'
  ])
})

test('Gauss、Temple 与 Nidus 均通过任务节点变量渲染', () => {
  const cases = [
    ['Gauss', 'mission-node.kappa', '在赛德娜的Kappa（中断） C 轮刷取部件蓝图'],
    ['Temple', 'mission-node.solstice-square', '在霍瓦尼亚的至日广场（防御） A 轮；在霍瓦尼亚的至日广场（防御） B 轮；在霍瓦尼亚的至日广场（防御） C 轮刷取部件蓝图'],
    ['Nidus', 'mission-node.oestrus', '在阋神星的Oestrus（INFESTED 资源回收） C 轮刷取部件蓝图']
  ]
  for (const [name, nodeId, expected] of cases) {
    const routing = entry(name).frameAcquisition.generated.routing
    assert.ok(routing.componentVariables.sources.some(source => source.missionNodeId === nodeId))
    assert.equal(frameAcquisition.renderRoutedAcquisition(name).lines.at(-1), expected)
  }
  assert.equal(entry('Nidus').frameAcquisition.generated.routing.blueprintVariables.questId, 'quest.the-glast-gambit')
})

test('批准战甲的自动路由不再保存用户文案 sourceText', () => {
  const targetCategories = new Set(['frame-mixed-missions', 'frame-specific-mission', 'frame-quest', 'frame-bounty', 'frame-assassination'])
  for (const item of INDEX.frames.filter(frame => !/ Prime$/.test(frame.canonical) && targetCategories.has(frame.componentCategory))) {
    const routing = entry(item.canonical).frameAcquisition.generated.routing
    assert.equal(Object.hasOwn(routing.componentVariables || {}, 'sourceText'), false, item.canonical)
    assert.equal(Object.hasOwn(routing.blueprintVariables || {}, 'sourceText'), false, item.canonical)
  }
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
