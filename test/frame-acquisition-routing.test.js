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
  assert.equal(INDEX.count, 117)
  assert.equal(INDEX.frames.length, 117)
  assert.equal(new Set(INDEX.frames.map(item => item.officialUniqueName)).size, 117)
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
  assert.match(result.description, /^Mag获取方式：\n总图：在商店购买\n头部神经光元、机体、系统：击败海军陆战队中士（火卫一刺杀）获得\n整套蓝图：普通无尽回廊第 2 周轮换可获取$/)
  assert.equal(result.structuredMethods.filter(method => method.type === 'circuit-reward' && method.scope === 'all-blueprints').length, 1)
})

test('全部刺杀战甲只显示刺杀地点与目标，不显示分部件概率', () => {
  const core = createKnowledgeCore()
  for (const item of INDEX.frames.filter(frame => frame.componentCategory === 'frame-assassination')) {
    const result = core.getAcquisition(item.canonical)
    const text = result.frameRoute.lines.join('\n')
    assert.match(text, /刺杀.+刷取(?:总图与)?部件/, item.canonical)
    assert.doesNotMatch(text, /%|概率|掉率|头、机体|系统：|头：|机体：/, item.canonical)
    const components = result.structuredMethods.filter(method => method.type === 'enemy-drop' && method.scope === 'component')
    assert.equal(components.length, 1, `${item.canonical}: 必须有且只有一个刺杀部件 DTO`)
    assert.equal(components[0].missionTypeId, 'mission-type.assassination', item.canonical)
    assert.ok(components[0].sourceEntityId, `${item.canonical}: 刺杀目标必须实体化`)
    assert.equal(components[0].variables.partName, '头部神经光元、机体、系统', item.canonical)
    if (item.blueprintCategory === 'market') {
      assert.equal(result.structuredMethods.filter(method => method.type === 'market-purchase' && method.scope === 'blueprint').length, 1, `${item.canonical}: 商城总图必须只出现一次`)
      assert.equal((result.description.match(/总图/g) || []).length, 1, `${item.canonical}: 最终文案重复总图`)
    }
  }
})

test('Nyx 使用官方 Phorid 动态入侵刺杀关系且不重复商城总图', () => {
  const result = createKnowledgeCore().getAcquisition('Nyx')
  assert.match(result.description, /^Nyx获取方式：\n总图：在商店购买\n头部神经光元、机体、系统：在入侵中出现的 Phorid 刺杀节点中击败 Phorid 获得\n整套蓝图：普通无尽回廊第 3 周轮换可获取$/)
  assert.equal(result.structuredMethods.filter(method => method.type === 'circuit-reward' && method.scope === 'all-blueprints').length, 1)
  const component = result.structuredMethods.find(method => method.type === 'enemy-drop' && method.scope === 'component')
  assert.equal(component.sourceEntityId, 'enemy.phorid')
  assert.equal(component.locationId, 'source.phorid-assassination')
  assert.equal(component.locationDisplayName, '入侵中出现的 Phorid 刺杀节点')
  assert.equal(component.missionTypeId, 'mission-type.assassination')
  assert.equal(component.missionTypeDisplayName, '刺杀')
  assert.equal(component.variables.appearanceCondition, '入侵中出现的 Phorid 刺杀节点')
  assert.deepEqual(component.requirements, { type: 'none' })
  assert.deepEqual(component.requirementLines, [])
  assert.equal(result.structuredMethods.filter(method => method.type === 'market-purchase' && method.scope === 'blueprint').length, 1)
})

test('全部普通战甲最终文案和结构化来源均不存在概率无关重复', () => {
  const normalizeSourceSentence = value => String(value)
    .replace(/\d+(?:\.\d+)?%/g, '')
    .replace(/[，、；：:（）()\s]/g, '');
  for (const summary of frameAcquisition.listWarframes()) {
    const frame = frameAcquisition.resolveWarframe(summary.canonical);
    if (!frame || frame.isPrime) continue;
    const result = frameAcquisition.renderRoutedAcquisition(frame);
    if (result) {
      const normalized = result.lines.filter(Boolean).map(normalizeSourceSentence).filter(Boolean);
      assert.equal(new Set(normalized).size, normalized.length, `${summary.canonical}: ${result.lines.join(' | ')}`);
    }
    const methods = frameAcquisition.getWarframeKnowledge(summary.canonical)?.frameAcquisition?.generated?.routing?.methods || [];
    const identities = methods.map(method => JSON.stringify([method.type, method.scope, method.variables?.part || '', method.sourceEntityId || method.sourceCanonical || '', method.rotation || '']));
    assert.equal(new Set(identities).size, identities.length, `${summary.canonical} 存在重复结构化来源`);
  }
});

test('Khora使用当前官方统一部件掉落且总图仅显示商城', () => {
  const result = frameAcquisition.renderRoutedAcquisition('Khora');
  assert.deepEqual(result.lines, ['总图：商城购买', '普通圣殿突袭 A、B、C轮（A轮 7.14%，B轮 7.14%，C轮 9.09%）']);
  assert.doesNotMatch(result.lines.join('\n'), /Sanctuary Onslaught|11\.28|8\.33/);
  const methods = frameAcquisition.getWarframeKnowledge('Khora').frameAcquisition.generated.routing.methods;
  assert.equal(methods.filter(method => method.type === 'market-purchase' && method.scope === 'blueprint').length, 1);
  assert.equal(methods.filter(method => method.type === 'mission-reward' && method.scope === 'component').length, 9);
  for (const part of ['Neuroptics', 'Chassis', 'Systems']) {
    const partMethods = methods.filter(method => method.variables?.part === part);
    assert.deepEqual(partMethods.map(method => [method.rotation, method.chancePercent]), [['A', 7.14], ['B', 7.14], ['C', 9.09]]);
  }
});

test('总图与部件同源的Wisp明确显示总图，商城总图战甲不重复', () => {
  assert.equal(frameAcquisition.renderRoutedAcquisition('Wisp').lines.join('\n'), '木星刺杀 蝠力使 刷取总图与部件')
  assert.equal(frameAcquisition.renderRoutedAcquisition('Mag').lines.join('\n'), '商城购买总图\n火卫一刺杀 海军陆战队中士 刷取部件')
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
  const kullervo = createKnowledgeCore().getAcquisition('刀哥')
  assert.equal(kullervo.resolution.canonical, 'Kullervo')
  const kullervoExchange = kullervo.structuredMethods.find(method => method.type === 'vendor-exchange')
  assert.equal(kullervoExchange.requirements.currency[0].currencyId, 'currency.kullervos-bane')
  assert.match(kullervoExchange.requirementLines.join('\n'), /在双衍历程中，于恐惧、愤怒、悲伤复眠螺旋前往Kullervo 的牢房/)
  assert.match(kullervoExchange.requirementLines.join('\n'), /刷取时请选择双衍历程；孤独纪事只有该战斗被选为复眠螺旋事件时才会出现/)
  assert.doesNotMatch(kullervoExchange.requirementLines.join('\n'), /The Duviri Experience|The Lone Story|Kullervo's Hold|库尔沃之灾/)
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
    '在漂泊者营地的Ordis处消耗900个残存微粒兑换',
    '所需货币怎么刷：',
    '残存微粒（需要900个）：完成天王星布鲁图斯的扬升任务结算获得，任务中的帕尔沃斯姐妹也会额外掉落',
    '资源数量加成：残存微粒不受影响',
    '资源掉落几率加成：残存微粒不受影响',
    '兑换成本固定为900个残存微粒，不会因加成改变'
  ])
})

test('Dante 使用节点、任务类型、NPC 与兑换货币变量', () => {
  const routing = entry('Dante').frameAcquisition.generated.routing.componentVariables
  assert.equal(routing.sources[0].missionNodeId, 'mission-node.armatus')
  assert.equal(routing.exchange.npcId, 'npc.loid')
  assert.equal(routing.exchange.currencyId, 'currency.vessel-capillaries')
  assert.deepEqual(frameAcquisition.renderRoutedAcquisition('Dante').lines, [
    '在火卫二的卫城区（中断） C 轮刷取部件蓝图\n也可在 洛德 处使用承载体毛细血管兑换：部件蓝图每张 90，总图 270，全套共 540',
    '在解剖圣所的洛德处消耗540个承载体毛细血管兑换',
    '所需货币怎么刷：',
    '承载体毛细血管（需要540个）：在火卫二的卫城区（中断）击败爆破使获得，普通每只 2-4，钢铁之路每只 5-7',
    '资源数量加成：承载体毛细血管不受影响',
    '资源掉落几率加成：承载体毛细血管不受影响',
    '兑换成本固定为540个承载体毛细血管，不会因加成改变'
  ])
})

test('Gauss、Temple 与 Nidus 保留按部件来源组且不会串入同池奖励', () => {
  for (const name of ['Gauss', 'Nidus']) {
    const routing = entry(name).frameAcquisition.generated.routing
    assert.deepEqual(routing.componentVariables.sourceGroups.map(group => group.part), ['Neuroptics', 'Chassis', 'Systems'])
    assert.ok(routing.componentVariables.sourceGroups.every(group => group.sources.length && group.sources.every(source => source.type === 'mission-node')))
    const routeMethod = createKnowledgeCore().getAcquisition(name).structuredMethods.find(method => method.type === 'route' && method.scope === 'components')
    assert.deepEqual(routeMethod.variables.sourceGroups.map(group => group.part), ['Neuroptics', 'Chassis', 'Systems'])
  }
  const temple = entry('Temple').frameAcquisition.generated.routing
  assert.deepEqual(temple.componentVariables.sourceGroups[0].sources.map(source => [source.rotation, source.chance]), [['A', 0.0097], ['B', 0.0198], ['C', 0.0458]])
  assert.equal(frameAcquisition.renderRoutedAcquisition('Temple').lines[0], '部件蓝图：至日广场防御A/B/C轮分别有 2.91% / 5.94% / 13.74% 概率获得')
  assert.doesNotMatch(createKnowledgeCore().getAcquisition('Temple').description, /mission-node\.|source\.|97%/)
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
  assert.match(result.description, /在气密舱的夜帽处消耗720个铁离石兑换/)
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
  const currencyFrames = ['Citrine', 'Dagath', 'Dante', 'Follie', 'Jade', 'Kullervo', 'Nokko', 'Oraxia', 'Sirius & Orion', 'Temple', 'Vauban']
  for (const name of currencyFrames) {
    const requirement = entry(name).frameAcquisition.generated.routing.requirements
    assert.equal(requirement.type, 'currency', name)
    assert.equal(requirement.boosterPolicy, 'currency-entity-metadata', name)
    const result = createKnowledgeCore().getAcquisition(name)
    assert.match(result.description, /资源数量加成：/i, name)
    assert.match(result.description, /资源掉落几率加成：/i, name)
    assert.match(result.description, /(兑换|制造)成本固定为.+不会因加成改变/i, name)
  }
  assert.deepEqual(entry('Dante').frameAcquisition.generated.routing.requirements, { type: 'currency', usage: 'exchange', npcId: 'npc.loid', locationId: 'hub.sanctum-anatomica', currency: [{ currencyId: 'currency.vessel-capillaries', amount: 540 }], boosterPolicy: 'currency-entity-metadata' })
  assert.match(createKnowledgeCore().getAcquisition('Dante').description, /在解剖圣所的洛德处消耗540个承载体毛细血管兑换[\s\S]*资源数量加成：承载体毛细血管不受影响[\s\S]*兑换成本固定为540个承载体毛细血管，不会因加成改变$/)
  assert.deepEqual(entry('Nokko').frameAcquisition.generated.routing.requirements, { type: 'currency', usage: 'exchange', npcId: 'npc.nightcap', locationId: 'hub.fortuna-airlock', currency: [{ currencyId: 'currency.fergolyte', amount: 720 }], boosterPolicy: 'currency-entity-metadata' })
  assert.match(createKnowledgeCore().getAcquisition('Nokko').description, /在气密舱的夜帽处消耗720个铁离石兑换[\s\S]*资源数量加成：[\s\S]*兑换成本固定为720个铁离石，不会因加成改变$/)
  const dagath = entry('Dagath').frameAcquisition.generated.routing.requirements
  assert.deepEqual(dagath, { type: 'currency', usage: 'crafting', npcId: null, locationId: 'hub.clan-dojo', currency: [{ currencyId: 'currency.vainthorn', amount: 102 }], boosterPolicy: 'currency-entity-metadata' })
  assert.equal(createKnowledgeCore().getAcquisition('Dagath').description, [
    '在氏族道场的 Dagath 空阁制造需要102个浮华荆棘',
    '所需货币怎么刷：',
    '浮华荆棘（需要102个）：使用深渊信标进入谷神星深渊区歼灭任务，完成任务结算获得',
    '资源数量加成：浮华荆棘不受影响',
    '资源掉落几率加成：浮华荆棘不受影响',
    '制造成本固定为102个浮华荆棘，不会因加成改变'
  ].join('\n'))
  const baruuk = entry('Baruuk').frameAcquisition.generated.routing.requirements
  assert.deepEqual(baruuk, { type: 'standing', npcId: 'npc.little-duck', locationId: null, rank: 3, rankName: 'Hand', blueprintRank: 2, blueprintRankName: 'Agent' })
  const baruukResult = createKnowledgeCore().getAcquisition('Baruuk')
  assert.doesNotMatch(baruukResult.description, /Little Duck|声望兑换/)
  assert.match(baruukResult.description, /整套蓝图：普通无尽回廊第 11 周轮换可获取$/)
  assert.equal(baruukResult.structuredMethods.filter(method => method.type === 'circuit-reward').length, 1)
  const hildryn = entry('Hildryn').frameAcquisition.generated.routing.requirements
  assert.deepEqual(hildryn, { type: 'standing', npcId: 'npc.little-duck', locationId: null, rank: 2, rankName: 'Agent', blueprintRank: null, blueprintRankName: null })
  const hildrynResult = createKnowledgeCore().getAcquisition('Hildryn')
  assert.match(hildrynResult.description, /击败剥削者圆蛛刷取部件蓝图/)
  assert.match(hildrynResult.description, /在福尔图娜的Little Duck处达到2级（Agent）声望后消耗5,000声望兑换/)
  assert.equal(entry('Mag').frameAcquisition.generated.routing.requirements.type, 'none')
  assert.doesNotMatch(createKnowledgeCore().getAcquisition('Mag').description, /资源数量加成|声望兑换/)
})

test('全部 currency require 都有地点、货币、数量和唯一语义段落', () => {
  const core = createKnowledgeCore()
  for (const item of INDEX.frames) {
    const routing = entry(item.canonical).frameAcquisition.generated.routing
    if (routing.requirements?.type !== 'currency') continue
    assert.ok(routing.requirements.locationId, item.canonical)
    assert.ok(routing.requirements.currency.length, item.canonical)
    for (const currency of routing.requirements.currency) assert.ok(currency.currencyId && Number.isFinite(currency.amount), `${item.canonical}: ${currency.currencyId}`)
    const description = core.getAcquisition(item.canonical).description
    const lines = description.split('\n')
    const hasDependency = routing.requirements.currency.some(currency => core.getCurrency(currency.currencyId)?.acquisitionDependency)
    assert.equal(lines.filter(line => line === '所需货币怎么刷：').length, hasDependency ? 1 : 0, item.canonical)
    assert.equal(lines.filter(line => /^资源数量加成：/.test(line)).length, 1, item.canonical)
    assert.equal(lines.filter(line => /^资源掉落几率加成：/.test(line)).length, 1, item.canonical)
    assert.equal(lines.filter(line => /^(兑换|制造)成本固定为.+不会因加成改变$/.test(line)).length, 1, item.canonical)
    const dependencyLines = lines.filter(line => /（(?:需要\d+个|各需要\d+个)）/.test(line))
    const representedCurrencies = dependencyLines.reduce((count, line) => count + routing.requirements.currency.filter(currency => {
      const entity = core.getCurrency(currency.currencyId)
      return entity && line.includes(entity.displayName || entity.canonical)
    }).length, 0)
    assert.equal(representedCurrencies, routing.requirements.currency.length, item.canonical)
    assert.equal(new Set(lines).size, lines.length, `${item.canonical}: 存在完全重复行`)
    if (routing.componentVariables?.exchange) {
      const exchangeEntryLines = lines.filter(line => /兑换/.test(line) && !/成本固定/.test(line))
      assert.equal(exchangeEntryLines.length, 1, `${item.canonical}: 兑换入口重复`)
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
    '在宿舍的言录使处消耗120个急行蛛外壳兑换',
    '所需货币怎么刷：',
    '急行蛛外壳（需要120个）：完成双衍王境织屿人节点的复眠螺旋，在结尾击败接肢怪后获得：普通模式 3-5 个，钢铁之路 5-8 个',
    '资源数量加成：急行蛛外壳缺少明确证据，暂按未知处理',
    '资源掉落几率加成：急行蛛外壳缺少明确证据，暂按未知处理',
    '兑换成本固定为120个急行蛛外壳，不会因加成改变'
  ].join('\n'))
})

test('method 模板与编译路由可自动发布', () => {
  const core = createKnowledgeCore()
  assert.equal(core.frameCategories.count, 117)
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
    if (!rendered) {
      const route = entry(item.canonical).frameAcquisition.generated.routing
      assert.ok((route.methods || []).some(method => method.requirements?.type === 'standing' && !(Number(method.requirements.amount) > 0)), item.canonical)
      continue
    }
    assert.ok(['category-method', 'frame-json'].includes(rendered.source), `${item.canonical}: ${rendered.source}`)
    assert.ok(rendered.lines.length, item.canonical)
  }
})

test('核心查询对全部普通战甲保留主路由并仅结构化追加兑换或回廊', () => {
  const core = createKnowledgeCore()
  for (const item of INDEX.frames.filter(frame => !/ Prime$/.test(frame.canonical))) {
    const result = core.getAcquisition(item.canonical)
    if (!result.frameRoute) {
      assert.ok(result.structuredMethods.some(method => method.reviewStatus === 'review-required' && method.reviewIssues?.includes('amount')), item.canonical)
      continue
    }
    const expectedPrimaryLines = result.frameRoute.lines.flatMap(line => line.split('\n')).filter(line => !/^也可.+兑换：/.test(line))
    for (const line of expectedPrimaryLines) {
      if (item.componentCategory === 'frame-assassination' || line === '商城购买总图') continue
      const mergedQuestRoute = /^首次完成《.+》获得部件蓝图；之后可在/.test(line)
        && result.description.includes(line.replace(/获得部件蓝图；之后可在.+回购/, '获得'))
        && /之后可在.+兑换|之后可在.+回购/.test(result.description)
      assert.ok(result.description.includes(line) || mergedQuestRoute, `${item.canonical}: 缺少主路由 ${line}`)
    }
    const circuitMethods = result.structuredMethods.filter(method => method.type === 'circuit-reward')
    assert.ok(circuitMethods.length <= 1, `${item.canonical}: 回廊方法重复`)
    if (circuitMethods.length) assert.match(result.description, /普通无尽回廊/, item.canonical)
    assert.ok(result.structuredMethods.every(method => method.requirements && Array.isArray(method.requirementLines)), item.canonical)
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
