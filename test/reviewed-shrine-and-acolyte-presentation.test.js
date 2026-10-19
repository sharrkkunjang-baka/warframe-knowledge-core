'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../src').createKnowledgeCore({approvedOnly:false});
test('shrine weapon acquisition retains full-set exchange currency and blade multiplicity',()=>{
 for(const [q,amount] of [['天薙刀',270],['晴日伞',225]]){
  const card=core.getAcquisitionCard(q);
  assert.deepEqual(card.sections.acquisition,['全套：地球——萨娅的异象结算概率获得','兑换：地球——希图斯——Koumei——"献上命定之珠"处 花费'+amount+'命运之珠兑换']);
  assert.deepEqual(card.sectionItems.acquisition[1].currencies.map(c=>[c.id,c.amount]),[['currency.fate-pearl',amount]]);
 }
 assert.equal(core.getAcquisitionCard('天薙刀').materials.find(i=>i.canonical==='Amanata Blade').count,2);
});
test('reviewed sources survive rebuilding weapon routes',()=>{
 const {applyReviewedAcquisitionPresentation}=require('../scripts/sync-weapon-knowledge');
 for(const q of ['天薙刀','晴日伞']){const entry=core.getAcquisition(q).entry;
 const original=entry.acquisition.routes.filter(r=>r.category!=='vendor');
 const rebuilt=applyReviewedAcquisitionPresentation({uniqueName:entry.subject.officialUniqueName,displayName:q},original,entry.recipes[0]);
 assert.ok(rebuilt.flatMap(r=>r.methods).some(m=>m.displaySummary?.startsWith('兑换：')));
 }
});
test('six steel-path arcanes share the approved enemy copy',()=>{
 for(const q of ['主要·无情','主要·熟练','主要·死首','次要·无情','次要·熟练','次要·死首'])assert.deepEqual(core.getAcquisitionCard(q).sections.enemy,['击杀钢铁之路任务中出现的暴力、苦难、折磨等共6种精英怪后概率获得']);
 assert.notDeepEqual(core.getAcquisitionCard('赋能·充沛').sections.enemy,['击杀钢铁之路任务中出现的暴力、苦难、折磨等共6种精英怪后概率获得']);
});
