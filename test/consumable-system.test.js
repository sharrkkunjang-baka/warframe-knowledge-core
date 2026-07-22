'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {createKnowledgeCore}=require('../src')
const {classify}=require('../scripts/sync-consumable-knowledge')
const core=createKnowledgeCore({approvedOnly:false})

test('消耗品目录排除装饰、内部能力和魅影军团对象',()=>{
  assert.equal(core.consumables.some(item=>/Specter Regiment$/.test(item.subject.canonical)),false)
  assert.equal(core.consumables.some(item=>/Fireworks|Arrow Skin/.test(item.subject.canonical)),false)
  assert.equal(core.consumables.some(item=>/\/Types\/Restoratives\/Liset(?:AutoHack|Barrage|Turret)$/.test(item.subject.officialUniqueName)),false)
  assert.equal(classify({uniqueName:'/Lotus/Types/Game/SpectreArmies/BronzeSpectreArmy',canonical:'Vapor Specter Regiment',semanticKinds:['consumable']}).include,false)
})

test('关键消耗品使用统一获取协议并保留配方属性',()=>{
  for(const query of ['幻雾魅影','Orokin 催化剂','重力磁抵器','Infested 催化剂','破解器']){
    const result=core.getAcquisition(query)
    assert.ok(result,`${query} 未收录`)
    assert.equal(result.entry.subject.category,'consumable')
    assert.ok(result.structuredMethods.length,`${query} 没有统一 acquisition methods`)
    assert.ok(result.structuredMethods.every(method=>method.requirements&&typeof method.requirements.type==='string'))
    assert.doesNotMatch(result.description,/official-zh-unavailable|review-required|\/Lotus\//)
  }
  const specter=core.getAcquisition('幻雾魅影')
  assert.match(specter.description,/总图：在福尔图娜的夜帽处消耗50个铁离石兑换；完成救援任务，根据救援等级获得/)
  assert.equal(specter.recipes[0].outputQuantity,10)
  assert.equal(specter.recipes[0].consumeOnBuild,true)
  const infested=core.getAcquisition('Infested 催化剂')
  assert.match(infested.description,/生物实验室.*复制蓝图/)
  assert.equal(infested.recipes[0].outputQuantity,5)
  assert.equal(infested.recipes[0].consumeOnBuild,false)
  assert.ok(core.getAcquisition('破解器').recipes.every(recipe=>recipe.consumeOnBuild===false))
})

test('Gravimag 错标 Rifle 仍归入升级消耗品',()=>{
  const entry=core.getConsumable('重力磁抵器')
  assert.ok(entry)
  assert.equal(entry.classification.type,'upgrade')
  const result=core.getAcquisition('重力磁抵器')
  assert.match(result.description,/利润收割者抢劫第 3 阶段获得/)
  assert.match(result.description,/总图：在商店购买/)
})

test('人工 tips 与自动来源分层存在且不会被编译器混写',()=>{
  const entry=core.getConsumable('Orokin 催化剂')
  assert.ok(Array.isArray(entry.consumableAcquisition.manual.tips))
  assert.ok(Array.isArray(entry.consumableAcquisition.manual.tipKeywords))
  assert.ok(Array.isArray(entry.consumableAcquisition.manual.methods))
  assert.ok(Array.isArray(entry.consumableAcquisition.generated.routes))
})
