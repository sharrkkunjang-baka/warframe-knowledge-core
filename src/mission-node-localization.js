'use strict';
const path=require('node:path'),fs=require('node:fs');
let snapshot=null;
function nodeLocalization(){
 if(snapshot)return snapshot;
 try{snapshot=JSON.parse(fs.readFileSync(path.join(__dirname,'../generated/mission-node-localization.json'),'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw error;snapshot={nodes:[],bossLocations:{}};}
 return snapshot;
}
function officialMissionNode(entry,registries){
 if(!entry||entry.kind!=='mission-node')return entry;
 const parent=registries?.get?.(entry.parentId);
 const matching=nodeLocalization().nodes.filter(n=>n.canonical.toLowerCase()===String(entry.canonical||'').toLowerCase());
 const record=matching.find(n=>n.planetCanonical.toLowerCase()===String(parent?.canonical||'').toLowerCase())||(matching.length===1?matching[0]:null);
 return record?{...entry,displayName:record.displayName,nodeId:record.nodeId,nameLanguageKey:record.nameKey,localization:{...entry.localization,status:record.displayName===record.canonical?'official-en':'official-zh',source:'DE Languages.bin'}}:entry;
}
function assassinationLocation(enemy){
 if(!enemy)return null;
 const index=nodeLocalization().bossLocations;
 const keys=[enemy.canonical,'display:'+enemy.displayName,...(enemy.internalPaths||[])];
 return keys.map(k=>index[String(k||'').toLowerCase()]).find(Boolean)||enemy.bossLocation||null;
}
function nodeDisplayName(value,planet){
 const matches=nodeLocalization().nodes.filter(n=>[n.canonical,n.nodeId].some(k=>String(k).toLowerCase()===String(value||'').toLowerCase()));
 const record=matches.find(n=>[n.planetCanonical,n.planetDisplayName].some(k=>String(k).toLowerCase()===String(planet||'').toLowerCase()))||(matches.length===1?matches[0]:null);
 return record?.displayName||value||'';
}
module.exports={officialMissionNode,assassinationLocation,nodeDisplayName};
