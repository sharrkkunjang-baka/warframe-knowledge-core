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

test('道场战甲输出可操作的三步复制指引', () => {
  assert.deepEqual(frameAcquisition.renderRoutedAcquisition('Wukong').lines, [
    'ESC → 通讯 → 氏族，进入氏族道场\n移动至 Tenno 实验室\n与操作台交互并复制蓝图'
  ])
})

test('Prime 战甲不使用预编译历史遗物路由', () => {
  assert.equal(frameAcquisition.renderRoutedAcquisition('Wukong Prime'), null)
})

test('牛甲精确定位 Rhino 且单字牛不截断未知复合词', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  assert.equal(frameAcquisition.resolveWarframe('牛甲').name, 'Rhino');
  assert.equal(frameAcquisition.resolveWarframeMention('刷 牛甲').frame.name, 'Rhino');
  assert.equal(core.getAcquisition('牛甲').entry.subject.canonical, 'Rhino');
  assert.equal(frameAcquisition.resolveWarframeMention('刷 牛头怪'), null);
});

test('刷磁妹走商城总图与刺杀模板', () => {
  const routed = frameAcquisition.renderRoutedAcquisition('磁妹')
  assert.deepEqual(routed.lines, ['商城购买总图', '火卫一刺杀 海军陆战队中士 刷取部件'])
  const core = createKnowledgeCore()
  const result = core.getAcquisition('磁妹')
  assert.equal(result.frameRoute.source, 'category-method')
  assert.equal(result.description, '商城购买总图\n火卫一刺杀 海军陆战队中士 刷取部件')
})

test('全部刺杀战甲只显示刺杀地点与目标，不显示分部件概率', () => {
  const core = createKnowledgeCore()
  for (const item of INDEX.frames.filter(frame => frame.componentCategory === 'frame-assassination')) {
    const result = core.getAcquisition(item.canonical)
    const text = result.frameRoute.lines.join('\n')
    assert.match(text, /刺杀.+刷取部件/, item.canonical)
    assert.doesNotMatch(text, /%|概率|掉率|头、机体|系统：|头：|机体：/, item.canonical)
  }
})

test('指定战甲主分类正确且特定任务按可用结构化数据渲染', () => {
  assert.equal(route('Cyte-09').componentCategory, 'frame-bounty')
  assert.equal(route('Gara').componentCategory, 'frame-bounty')
  assert.equal(route('Garuda').componentCategory, 'frame-bounty')
  assert.equal(route('Octavia').componentCategory, 'frame-mixed-missions')
  assert.equal(route('Xaku').componentCategory, 'frame-bounty')
  for (const name of ['Jade', 'Citrine', 'Kullervo']) assert.equal(route(name).componentCategory, 'frame-specific-mission')
  assert.equal(entry('Kullervo').frameAcquisition.manual.acquisitionText, undefined)
  assert.equal(frameAcquisition.renderRoutedAcquisition('Kullervo').source, 'category-method')
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
    '也可在 Ordis 处使用残存微粒兑换：部件蓝图每张 150，总图 450',
    '所需货币怎么刷：',
    '残存微粒（需要900个）：完成天王星布鲁图斯的扬升任务结算获得，任务中的帕尔沃斯姐妹也会额外掉落',
    '资源数量加成无效'
  ])
})

test('Dante 使用节点、任务类型、NPC 与兑换货币变量', () => {
  const routing = entry('Dante').frameAcquisition.generated.routing.componentVariables
  assert.equal(routing.sources[0].missionNodeId, 'mission-node.armatus')
  assert.equal(routing.exchange.npcId, 'npc.loid')
  assert.equal(routing.exchange.currencyId, 'currency.vessel-capillaries')
  assert.deepEqual(frameAcquisition.renderRoutedAcquisition('Dante').lines, [
    '在火卫二的卫城区（中断） C 轮刷取部件蓝图\n也可在 洛德 处使用承载体毛细血管兑换：部件蓝图每张 90，总图 270，全套共 540',
    '所需货币怎么刷：',
    '承载体毛细血管（需要540个）：在火卫二的卫城区（中断）击败爆破使获得，普通每只 2-4，钢铁之路每只 5-7',
    '资源数量加成无效'
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

test('Nokko 通过赏金、NPC、地点、任务和铁离石变量渲染', () => {
  const result = createKnowledgeCore().getAcquisition('Nokko')
  assert.equal(result.frameRoute.route.componentCategory, 'frame-bounty')
  assert.equal(result.frameRoute.route.blueprintCategory, null)
  assert.match(result.description, /完成《新纪之战》后，在福尔图娜气密舱找夜帽接取深矿赏金刷取全部蓝图/)
  assert.match(result.description, /铁离石兑换：部件蓝图每张 160，总图 240，全套共 720/)
  assert.match(result.description, /普通难度 11-15 个，钢铁之路 15-19 个/)
  assert.doesNotMatch(result.description, /官方结构化数据缺少|Deepmines|Nightcap|Fergolyte/)
})

test('Narmer 赏金通过 faction 注册表自动显示为合一众', () => {
  const caliban = entry('Caliban')
  assert.equal(caliban.frameAcquisition.generated.routing.componentVariables.factionId, 'faction.narmer')
  assert.equal(createKnowledgeCore().getFaction('Narmer').displayName, '合一众')
  assert.equal(frameAcquisition.renderRoutedAcquisition('卡利班').lines.join('\n'), '商城购买总图\n在希图斯找孔祝，或在福尔图娜找尤迪科接取合一众赏金刷取部件')
  assert.deepEqual(caliban.frameAcquisition.generated.routing.componentVariables.levelRange, { min: 50, max: 70 })
  assert.equal(caliban.frameAcquisition.generated.routing.componentVariables.hubs[0].npcId, 'npc.konzu')
})

test('require 区分声望与货币并通过 NPC 地点变量渲染', () => {
  const currencyFrames = ['Citrine', 'Dagath', 'Dante', 'Follie', 'Jade', 'Kullervo', 'Nokko', 'Oraxia', 'Sirius & Orion', 'Vauban']
  for (const name of currencyFrames) {
    const requirement = entry(name).frameAcquisition.generated.routing.requirements
    assert.equal(requirement.type, 'currency', name)
    assert.equal(requirement.isBuffUseless, true, name)
    const result = createKnowledgeCore().getAcquisition(name)
    assert.equal(result.description.split('\n').at(-1), '资源数量加成无效', name)
  }
  assert.deepEqual(entry('Dante').frameAcquisition.generated.routing.requirements, { type: 'currency', usage: 'exchange', npcId: 'npc.loid', locationId: 'hub.sanctum-anatomica', currency: [{ currencyId: 'currency.vessel-capillaries', amount: 540 }], isBuffUseless: true })
  assert.match(createKnowledgeCore().getAcquisition('Dante').description, /也可在 洛德 处使用承载体毛细血管兑换[\s\S]*资源数量加成无效$/)
  assert.deepEqual(entry('Nokko').frameAcquisition.generated.routing.requirements, { type: 'currency', usage: 'exchange', npcId: 'npc.nightcap', locationId: 'hub.fortuna-airlock', currency: [{ currencyId: 'currency.fergolyte', amount: 720 }], isBuffUseless: true })
  assert.match(createKnowledgeCore().getAcquisition('Nokko').description, /也可在气密舱向夜帽使用铁离石兑换[\s\S]*资源数量加成无效$/)
  const dagath = entry('Dagath').frameAcquisition.generated.routing.requirements
  assert.deepEqual(dagath, { type: 'currency', usage: 'crafting', npcId: null, locationId: 'hub.clan-dojo', currency: [{ currencyId: 'currency.vainthorn', amount: 102 }], isBuffUseless: true })
  assert.equal(createKnowledgeCore().getAcquisition('Dagath').description, [
    '在氏族道场的 Dagath 空阁制造需要102个浮华荆棘',
    '所需货币怎么刷：',
    '浮华荆棘（需要102个）：使用深渊信标进入谷神星深渊区歼灭任务，完成任务结算获得',
    '资源数量加成无效'
  ].join('\n'))
  const baruuk = entry('Baruuk').frameAcquisition.generated.routing.requirements
  assert.deepEqual(baruuk, { type: 'standing', npcId: 'npc.little-duck', locationId: null, rank: 3, rankName: 'Hand', blueprintRank: 2, blueprintRankName: 'Agent' })
  assert.equal(createKnowledgeCore().getAcquisition('Baruuk').description, '福尔图娜的Little Duck：总图需要 2级声望，部件蓝图需要 3级声望兑换')
  const hildryn = entry('Hildryn').frameAcquisition.generated.routing.requirements
  assert.deepEqual(hildryn, { type: 'standing', npcId: 'npc.little-duck', locationId: null, rank: 2, rankName: 'Agent', blueprintRank: null, blueprintRankName: null })
  assert.equal(createKnowledgeCore().getAcquisition('Hildryn').description, '击败剥削者圆蛛刷取部件蓝图\n在福尔图娜找Little Duck 2级（Agent）声望兑换')
  assert.equal(entry('Mag').frameAcquisition.generated.routing.requirements.type, 'none')
  assert.doesNotMatch(createKnowledgeCore().getAcquisition('Mag').description, /资源数量加成|声望兑换/)
})

test('全部 currency require 都有地点、货币、数量和唯一语义段落', () => {
  const core = createKnowledgeCore()
  for (const item of INDEX.frames) {
    const routing = entry(item.canonical).frameAcquisition.generated.routing
    if (routing.requirements.type !== 'currency') continue
    assert.ok(routing.requirements.locationId, item.canonical)
    assert.ok(routing.requirements.currency.length, item.canonical)
    for (const currency of routing.requirements.currency) assert.ok(currency.currencyId && Number.isFinite(currency.amount), `${item.canonical}: ${currency.currencyId}`)
    const description = core.getAcquisition(item.canonical).description
    const lines = description.split('\n')
    assert.equal(lines.filter(line => line === '所需货币怎么刷：').length, 1, item.canonical)
    assert.equal(lines.filter(line => /^资源数量加成(有效|无效)$/.test(line)).length, 1, item.canonical)
    const dependencyLines = lines.filter(line => /（(?:需要\d+个|各需要\d+个)）/.test(line))
    const representedCurrencies = dependencyLines.reduce((count, line) => count + routing.requirements.currency.filter(currency => {
      const entity = core.getCurrency(currency.currencyId)
      return entity && line.includes(entity.displayName || entity.canonical)
    }).length, 0)
    assert.equal(representedCurrencies, routing.requirements.currency.length, item.canonical)
    assert.equal(new Set(lines).size, lines.length, `${item.canonical}: 存在完全重复行`)
    if (routing.componentVariables?.exchange) {
      assert.equal(lines.filter(line => line.includes('兑换')).length, 1, `${item.canonical}: 兑换入口重复`)
    }
    assert.doesNotMatch(description, /官方结构化数据缺少该蓝图的获取来源/, item.canonical)
  }
})

test('Oraxia 蜘蛛别名通过织屿人独立任务与急行蛛外壳路由', () => {
  const core = createKnowledgeCore()
  const route = entry('Oraxia').frameAcquisition.generated.routing
  assert.equal(route.componentCategory, 'frame-specific-mission')
  assert.deepEqual(route.requirements.currency, [{ currencyId: 'currency.scuttler-husks', amount: 120 }])
  assert.equal(core.getAcquisition('蜘蛛').entry.subject.canonical, 'Oraxia')
  assert.equal(core.getAcquisition('蜘蛛').description, [
    '在双衍王境的织屿人刷取，部件蓝图掉率 7.69%',
    '也可在 言录使 处使用急行蛛外壳兑换：部件蓝图每张 20，总图 60',
    '所需货币怎么刷：',
    '急行蛛外壳（需要120个）：完成双衍王境织屿人节点的复眠螺旋，在结尾击败接肢怪后获得：普通模式 3-5 个，钢铁之路 5-8 个',
    '资源数量加成无效'
  ].join('\n'))
})

test('method 模板与编译路由可自动发布', () => {
  const core = createKnowledgeCore()
  assert.equal(core.frameCategories.count, 116)
  assert.ok(core.frameMethods.some(item => item.scope === 'components' && item.category === 'frame-assassination'))
  assert.ok(core.frameMethods.some(item => item.scope === 'blueprint' && item.category === 'market'))
})

test('method JSON 是全部分类句式的单一权威源', () => {
  const routing = require('../src/frame-acquisition-routing')
  const definitions = routing.loadMethodDefinitions()
  const componentCategories = new Set(INDEX.frames.map(item => item.componentCategory))
  const blueprintCategories = new Set(INDEX.frames.map(item => item.blueprintCategory).filter(Boolean))
  for (const category of componentCategories) assert.ok(definitions.components[category], `缺少 ${category}`)
  for (const category of blueprintCategories) assert.ok(definitions.blueprints[category], `缺少 ${category}`)
  assert.equal(routing.methodTemplate('components', 'frame-dojo'), JSON.parse(fs.readFileSync(path.join(FRAME_ROOT, 'method', 'components', 'dojo.json'), 'utf8')).template)
  assert.equal(routing.methodTemplate('components', 'frame-bounty', 'hubTemplate'), '在{locationName}{subLocationText}找{npcName}')
  assert.equal(routing.methodTemplate('components', 'frame-specific-mission', 'exchangeTemplate'), '也可在 {npcName} 处使用{currencyName}兑换：部件蓝图每张 {componentCost}，总图 {blueprintCost}')
  assert.equal(routing.methodTemplate('components', 'frame-prime-relic', 'vaultedTemplate'), '当前已入库，没有可刷取的遗物')
})

test('所有非 Prime 分类路由都不会意外回退到旧详情渲染', () => {
  for (const item of INDEX.frames.filter(frame => !/ Prime$/.test(frame.canonical))) {
    const rendered = frameAcquisition.renderRoutedAcquisition(item.canonical)
    assert.ok(rendered, item.canonical)
    assert.ok(['category-method', 'frame-json'].includes(rendered.source), `${item.canonical}: ${rendered.source}`)
    assert.ok(rendered.lines.length, item.canonical)
  }
})

test('核心查询对全部普通战甲强制返回分类 method 路由', () => {
  const core = createKnowledgeCore()
  for (const item of INDEX.frames.filter(frame => !/ Prime$/.test(frame.canonical))) {
    const result = core.getAcquisition(item.canonical)
    assert.ok(result.frameRoute, item.canonical)
    assert.equal(result.description, result.frameRoute.lines.join('\n'), item.canonical)
  }
})

test('同步计划原样保留 method JSON 的人工扩展模板', () => {
  const sync = require('../scripts/sync-frame-acquisition-categories')
  const methods = sync.methodDocuments().map(item => item.value)
  const bounty = methods.find(item => item.scope === 'components' && item.category === 'frame-bounty')
  const prime = methods.find(item => item.scope === 'components' && item.category === 'frame-prime-relic')
  assert.equal(bounty.hubTemplate, '在{locationName}{subLocationText}找{npcName}')
  assert.equal(prime.vaultedTemplate, '当前已入库，没有可刷取的遗物')
})
