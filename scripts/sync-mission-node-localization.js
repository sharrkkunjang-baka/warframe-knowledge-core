'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const en=read('.cache/node-localization/en.json'),zh=read('.cache/node-localization/zh.json'),regions=read('cache/warframe-export-regions.json'),enemies=read('.cache/official-localization/ExportEnemies.json');
const source=read('.cache/node-localization/source.json');
const nodes=[],bossLocations={};
for(const [nodeId,node] of Object.entries(regions)){
 if(!node.name||!node.systemName)continue;
 const canonical=en[node.name]||'',displayName=zh[node.name]||canonical,planetCanonical=en[node.systemName]||'',planetDisplayName=zh[node.systemName]||planetCanonical;
 if(!canonical)continue;
 const record={nodeId,canonical,displayName,planetCanonical,planetDisplayName,nameKey:node.name,planetKey:node.systemName};
 nodes.push(record);
 // A vipAgent in a survival/exterminate node is not an assassination location.
 if(node.missionType!=='MT_ASSASSINATION'||!node.vipAgent)continue;
 const avatars=Object.values(enemies.agents?.[node.vipAgent]?.avatarTypes||{});
 const names=[...new Set(avatars.map(p=>en[enemies.avatars?.[p]?.name]).filter(Boolean))];
 const boss={...record,nodeCanonical:canonical,nodeDisplayName:displayName,missionTypeId:'mission-type.assassination'};
 const keys=[node.vipAgent,...avatars];
 if(names.length===1)for(const avatar of avatars){const label=zh[enemies.avatars?.[avatar]?.name];if(label)keys.push('display:'+label);}
 if(names.length===1)keys.push(names[0]);
 else if(names.length>1){keys.push(names.join(' and '),[...names].reverse().join(' and '));}
 for(const key of keys)bossLocations[key.toLowerCase()]=boss;
}
const reviewed=read('knowledge/reviewed/assassination-locations.json');
for(const entry of reviewed.entries){
 const node=nodes.find(n=>n.nodeId===entry.nodeId);
 if(!node||regions[entry.nodeId]?.missionType!=='MT_ASSASSINATION')throw new Error('Invalid reviewed assassination node '+entry.nodeId);
 const boss={...node,nodeCanonical:node.canonical,nodeDisplayName:node.displayName,missionTypeId:'mission-type.assassination',provenance:entry.sources};
 for(const key of entry.canonicals)bossLocations[key.toLowerCase()]=boss;
}
// Mobile assassination sources are reviewed data, not a guessed fixed planet/node.
const dynamicBossLocations={
 phorid:{planetCanonical:'Infested Invasion',planetDisplayName:'I\u7cfb\u5165\u4fb5',nodeCanonical:en['/Lotus/Language/Menu/InfestedInvasionBoss'],nodeDisplayName:zh['/Lotus/Language/Menu/InfestedInvasionBoss']||en['/Lotus/Language/Menu/InfestedInvasionBoss'],missionTypeId:'mission-type.assassination',dynamic:true,provenance:'DE /Lotus/Language/WarframeCrafting/NyxRecipeHelp + /Lotus/Language/Menu/InfestedInvasionBoss'}
};
Object.assign(bossLocations,dynamicBossLocations);
const result={schemaVersion:1,generatedAt:new Date().toISOString(),source,regionsSha256:crypto.createHash('sha256').update(JSON.stringify(regions)).digest('hex'),nodes,bossLocations};
fs.writeFileSync(path.join(root,'generated/mission-node-localization.json'),JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify({nodes:nodes.length,bossKeys:Object.keys(bossLocations).length,mars:nodes.filter(n=>n.planetCanonical==='Mars').length}));
