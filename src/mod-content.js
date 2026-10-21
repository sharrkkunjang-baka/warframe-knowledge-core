'use strict';
// Mod prose is owned by one acquisition document per stable official identity.
// Catalogs and image manifests persist references; callers hydrate only in memory.
const fs = require('node:fs');
const path = require('node:path');
const { EFFECTS_TOKEN, modEffectLines, hydrateModEntry } = require('./mod-effect-template');
function files(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(item => item.isDirectory()
    ? files(path.join(directory,item.name)) : item.name.endsWith('.json') ? [path.join(directory,item.name)] : []);
}
function modDocuments(root = path.resolve(__dirname,'..')) {
  const documents = new Map();
  for (const file of files(path.join(root,'knowledge','acquisition','mod'))) {
    const raw = JSON.parse(fs.readFileSync(file,'utf8'));
    for (const entry of Array.isArray(raw) ? raw : [raw]) {
      if (entry.subject?.category !== 'mod') continue;
      const identity = entry.officialUniqueName || entry.subject?.officialUniqueName;
      if (!identity) continue;
      if (documents.has(identity)) throw new Error('Duplicate authoritative Mod document: '+identity);
      documents.set(identity,{file,entry,ref:path.relative(root,file).replace(/\\/g,'/')+'#'+entry.id});
    }
  }
  return documents;
}
function resolveModContent(ref, root = path.resolve(__dirname,'..')) {
  const [relative,id] = String(ref||'').split('#');
  const base = path.resolve(root,'knowledge','acquisition','mod');
  const file = path.resolve(root,relative||'');
  if (!file.startsWith(base+path.sep) || !file.endsWith('.json') || !id) throw new Error('Invalid Mod content reference: '+ref);
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  const entry=(Array.isArray(raw)?raw:[raw]).find(row=>row.id===id && row.subject?.category==='mod');
  if(!entry)throw new Error('Unresolved Mod content reference: '+ref);
  return hydrateModEntry(entry);
}
function hydrateModCatalog(catalog,root=path.resolve(__dirname,'..')) {
  if(!catalog?.mods)return catalog;
  return {...catalog,mods:catalog.mods.map(mod=>{
    if(!mod.contentRef)return mod;
    const entry=resolveModContent(mod.contentRef,root);
    return {...mod,maxRankEffectsZh:modEffectLines(entry),maxRankEffects:entry.effectDetailsEn||[]};
  })};
}
function externalizeModCatalog(catalog,root=path.resolve(__dirname,'..'),documents) {
  if(!catalog?.mods)return catalog;
  documents ||= modDocuments(root);
  return {...catalog,modContentSchemaVersion:1,mods:catalog.mods.map(mod=>{
    const doc=documents.get(mod.uniqueName);
    if(!doc)throw new Error('Mod document missing; run sync-mods before catalog generation: '+mod.uniqueName);
    const {maxRankEffectsZh,maxRankEffects,...metadata}=mod;
    return {...metadata,contentRef:doc.ref};
  })};
}
function externalizeModAssetManifest(manifest,root=path.resolve(__dirname,'..'),documents) {
  if(!Array.isArray(manifest?.items))return manifest;
  documents ||= modDocuments(root);
  return {...manifest,items:manifest.items.map(item=>{
    const doc=documents.get(item.uniqueName);
    if(!doc)return item;
    const {renderedEffectLines,...metadata}=item;
    if(metadata.renderedTypography){const {lines,...typography}=metadata.renderedTypography;metadata.renderedTypography=typography;}
    return {...metadata,modContentRef:doc.ref};
  })};
}
function externalizeModKnowledge(rows,root=path.resolve(__dirname,'..'),documents=modDocuments(root)) {
  return rows.map(entry=>{const doc=documents.get(entry.officialUniqueName||entry.subject?.officialUniqueName);if(entry.subject?.category!=='mod'||!doc)return entry;return {id:entry.id,kind:entry.kind,module:entry.module,title:entry.title,subject:entry.subject,reviewStatus:entry.reviewStatus,contentRef:doc.ref};});
}
function seedModContent(catalog,root=path.resolve(__dirname,'..')) {
  const documents=modDocuments(root);let written=0;
  for(const mod of catalog.mods||[]){const doc=documents.get(mod.uniqueName);if(!doc)throw new Error('Missing Mod source '+mod.uniqueName);const raw=JSON.parse(fs.readFileSync(doc.file,'utf8'));const entry=(Array.isArray(raw)?raw:[raw]).find(row=>row.id===doc.entry.id);let changed=false;
    if(!Array.isArray(entry.effectDetails)){entry.effectDetails=entry.effects?.length ? [EFFECTS_TOKEN] : mod.maxRankEffectsZh||[];changed=true;}
    if(!Array.isArray(entry.effectDetailsEn)){entry.effectDetailsEn=mod.maxRankEffects||[];changed=true;}
    if(changed){const temporary=doc.file+'.mod-content-tmp';fs.writeFileSync(temporary,JSON.stringify(raw,null,2)+'\n');fs.renameSync(temporary,doc.file);written++;}
  }
  return written;
}
module.exports={seedModContent,files,modDocuments,resolveModContent,hydrateModCatalog,externalizeModCatalog,externalizeModAssetManifest,externalizeModKnowledge};
