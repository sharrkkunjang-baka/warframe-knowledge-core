'use strict';

const { normalizeRequirements } = require('./acquisition-protocol');
const CATALOG = Object.freeze([
  { id:'equipment.voidrig', canonical:'Voidrig', displayName:'虚空锐将', kind:'vehicle', aliases:['机甲'], imageQuery:'Voidrig', methods:[
    { type:'quest-unlock', scope:'item', questId:'quest.heart-of-deimos', requirements:{type:'quest',questId:'quest.heart-of-deimos'}, variables:{text:'完成任务「惊惧之心」后，在殁世幽都通过殁世械灵体系取得虚空锐将总图与部件蓝图。'} },
    { type:'vendor-exchange', scope:'blueprint-and-components', npcId:'npc.loid', locationId:'hub.necralisk', requirements:{type:'standing',factionId:'faction.necraloid'}, variables:{text:'提升殁世械灵声望后向洛德兑换总图和部件蓝图；损坏部件来自隔离库中的敌方殁世机甲。'} }
  ]},
  { id:'equipment.k-drive', canonical:'K-Drive', displayName:'K式悬浮板', kind:'modular-equipment', aliases:['滑板','K式滑板'], imageQuery:'K-Drive', overview:'K式悬浮板是模块化载具，由板身、反应堆、鼻锥和喷射器组装；在福尔图娜找通风小子取得和组装部件。', methods:[{type:'vendor-exchange',scope:'components',npcId:'npc.roky',locationId:'hub.fortuna',requirements:{type:'standing',factionId:'faction.ventkids'},variables:{text:'在福尔图娜找通风小子，用通风小子声望兑换板身、反应堆、鼻锥和喷射器后组装。'}}]},
  { id:'equipment.k-drive-launcher', canonical:'K-Drive Launcher', displayName:'K式发射器', kind:'gear', aliases:['K式发射器'], imageQuery:'K-Drive Launcher', methods:[{type:'quest-reward',scope:'item',questId:'quest.vox-solaris',requirements:{type:'quest',questId:'quest.vox-solaris'},variables:{text:'完成任务「索拉里斯之声」后获得 K式发射器，并在军械库装备到物品栏用于召唤 K式悬浮板。'}}]},
  { id:'equipment.amp', canonical:'Amp', displayName:'增幅器', kind:'modular-equipment', aliases:['增幅器'], imageQuery:'Amp', overview:'增幅器是指挥官模块化武器，由棱镜、支架和曲柄组成。', methods:[
    {type:'vendor-exchange',scope:'components',npcId:'npc.onkko',locationId:'hub.cetus',requirements:{type:'standing',factionId:'faction.the-quills'},variables:{text:'完成「内战」并解锁指挥官后，在希图斯找昂克，用夜羽声望兑换棱镜、支架和曲柄。'}},
    {type:'vendor-exchange',scope:'components',npcId:'npc.little-duck',locationId:'hub.fortuna',requirements:{type:'standing',factionId:'faction.vox-solaris'},variables:{text:'达到索拉里斯联盟最高等级并完成相关前置后，在福尔图娜找小鸭子，用索拉里斯之声声望兑换另一组增幅器部件。'}}
  ]},
  { id:'equipment.zaw', canonical:'Zaw', displayName:'组合近战', kind:'modular-equipment', aliases:['Zaw','自制近战'], imageQuery:'Zaw', overview:'组合近战由击打部、握柄和环接组成。', methods:[{type:'vendor-exchange',scope:'components',npcId:'npc.hok',locationId:'hub.cetus',requirements:{type:'standing',factionId:'faction.ostron'},variables:{text:'在希图斯找浩，用 Ostron 声望兑换击打部、握柄和环接后组装。'}}]},
  { id:'equipment.kitgun', canonical:'Kitgun', displayName:'组合枪', kind:'modular-equipment', aliases:['Kitgun'], imageQuery:'Kitgun', overview:'组合枪由枪膛、握把和装填器组成。', methods:[{type:'vendor-exchange',scope:'components',npcId:'npc.rude-zuud',locationId:'hub.fortuna',requirements:{type:'standing',factionId:'faction.solaris-united'},variables:{text:'在福尔图娜找粗鲁的佐德，用索拉里斯联盟声望兑换枪膛、握把和装填器后组装。'}}]}
]);
function normalize(value){return String(value||'').normalize('NFKC').trim().toLowerCase().replace(/[\s·・_-]+/g,'')}
const INDEX=new Map(CATALOG.flatMap(entry=>[entry.canonical,entry.displayName,...entry.aliases].map(alias=>[normalize(alias),entry])));
function resolveEquipment(query){return INDEX.get(normalize(query))||null}
function getEquipmentAcquisition(query){const entry=resolveEquipment(query);if(!entry)return null;const structuredMethods=entry.methods.map(method=>({...method,requirements:normalizeRequirements(method.requirements),requirementLines:[method.variables.text],reviewStatus:'approved',provenance:{source:'current-wiki-reviewed-equipment-protocol'}}));return {query:String(query||''),resolution:{canonical:entry.canonical,exact:true},entry:{id:entry.id,kind:'knowledge',module:'acquisition',subject:{canonical:entry.canonical,displayName:entry.displayName,category:entry.kind},imageQuery:entry.imageQuery},description:[entry.overview,...structuredMethods.map(method=>method.variables.text)].filter(Boolean).join('\n'),structuredMethods,alternatives:[]}}
function auditEquipmentAcquisition(){return {count:CATALOG.length,vehicle:CATALOG.filter(x=>x.kind==='vehicle').length,modular:CATALOG.filter(x=>x.kind==='modular-equipment').length,missingMethods:CATALOG.filter(x=>!x.methods.length).map(x=>x.canonical)}}
module.exports={CATALOG,resolveEquipment,getEquipmentAcquisition,auditEquipmentAcquisition};
