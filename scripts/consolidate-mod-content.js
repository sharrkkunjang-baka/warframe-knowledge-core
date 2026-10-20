'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {modDocuments,externalizeModCatalog,externalizeModAssetManifest,externalizeModKnowledge}=require('../src/mod-content');
const archive=process.env.WF_MOD_MIGRATION_ARCHIVE||'D:/Warframe-archives/2026-10-20-mod-content';
function backup(file){const full=path.resolve(file);const key=full.replace(/:/g,'').replace(/\\/g,'/');const target=path.join(archive,key);fs.mkdirSync(path.dirname(target),{recursive:true});if(!fs.existsSync(target))fs.copyFileSync(full,target);}
function write(file,value){const text=JSON.stringify(value,null,2)+'\n';if(fs.readFileSync(file,'utf8')===text)return false;backup(file);const temp=file+'.mod-content-tmp';fs.writeFileSync(temp,text);fs.renameSync(temp,file);return true;}
function consolidate(){
 const docs=modDocuments(root),catalogFile=path.join(root,'knowledge/categories/official.json');const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));let migrated=0;
 for(const mod of catalog.mods||[]){const doc=docs.get(mod.uniqueName);if(!doc)throw Error('Missing source '+mod.uniqueName);const raw=JSON.parse(fs.readFileSync(doc.file,'utf8'));const row=(Array.isArray(raw)?raw:[raw]).find(x=>x.id===doc.entry.id);let changed=false;
  if(!Array.isArray(row.effectDetails) || !row.effectDetails.length && mod.maxRankEffectsZh?.length){row.effectDetails=mod.maxRankEffectsZh||[];changed=true;}
  if(!Array.isArray(row.effectDetailsEn)){row.effectDetailsEn=mod.maxRankEffects||[];changed=true;}
  if(changed&&write(doc.file,raw))migrated++;
 }
 const catalogs=[catalogFile,path.join(root,'official.json'),path.join(root,'dist/official.json'),'D:/qq-bot/warframe-knowledge-core/knowledge/categories/official.json'];let catalogCount=0;
 for(const file of catalogs)if(fs.existsSync(file)){const data=JSON.parse(fs.readFileSync(file,'utf8'));if(Array.isArray(data.mods)&&write(file,externalizeModCatalog(data,root,docs)))catalogCount++;}
 const manifests=['D:/Warframe/warframe-content/images/mod-card-images/manifest.json','D:/Warframe/warframe-content/images/reviewed-mod-card-images/manifest.json','D:/Warframe/warframe-content/images/manifest.json'];let manifestCount=0;
 for(const file of manifests)if(fs.existsSync(file)){const data=JSON.parse(fs.readFileSync(file,'utf8'));if(write(file,externalizeModAssetManifest(data,root,docs)))manifestCount++;}
 const distFile=path.join(root,'dist/knowledge.json');if(fs.existsSync(distFile)){const rows=JSON.parse(fs.readFileSync(distFile,'utf8'));write(distFile,externalizeModKnowledge(rows,root,docs));}
 const distManifest=path.join(root,'dist/manifest.json');if(fs.existsSync(distManifest)){const m=JSON.parse(fs.readFileSync(distManifest,'utf8'));for(const name of ['official.json','knowledge.json']){const file=path.join(root,'dist',name);if(m.files?.[name]&&fs.existsSync(file)){const bytes=fs.readFileSync(file);m.files[name]={bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}}write(distManifest,m);}
 const indexFile=path.join(root,'generated/mod-content-index.json');const index={schemaVersion:1,documents:[...docs.values()].map(doc=>({uniqueName:doc.entry.officialUniqueName||doc.entry.subject?.officialUniqueName,canonical:doc.entry.subject.canonical,displayName:doc.entry.subject.displayName,contentRef:doc.ref}))};if(!fs.existsSync(indexFile)){fs.writeFileSync(indexFile,JSON.stringify(index,null,2)+'\n');}else write(indexFile,index);
 return {documents:docs.size,migrated,catalogCount,manifestCount};
}
if(require.main===module)console.log(JSON.stringify(consolidate()));
module.exports={consolidate};
