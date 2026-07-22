'use strict'
const fs=require('node:fs'),path=require('node:path')
const ROOT=path.resolve(__dirname,'..'), audit=JSON.parse(fs.readFileSync(path.join(ROOT,'generated/acquisition-quality-audit.json'),'utf8'))
const dispositions=audit.reviewRequired.map(entry=>{
  const categoryRefs=Array.isArray(entry.categoryRefs)?entry.categoryRefs:[]
  const disposition=categoryRefs.length?'official-evidence-missing':'category-placeholder'
  const reason=disposition==='category-placeholder'?'条目未归入有效发布分类，不能作为可获取对象发布':'当前权威核心未形成可审核的结构化获取方法；保留身份与审计队列，禁止伪造来源'
  return {id:entry.id,canonical:entry.canonical,displayName:entry.displayName,category:entry.category,disposition,reviewStatus:'review-required',reason,attemptedSources:['https://wiki.warframe.com','DE Languages.bin / Public Export','https://www.warframe.com/droptables'],sourceEvidence:[],stableIdentity:entry.id}
})
const counts=Object.fromEntries([...new Set(dispositions.map(x=>x.disposition))].map(k=>[k,dispositions.filter(x=>x.disposition===k).length]))
const out={schemaVersion:1,generatedAt:new Date().toISOString(),source:'acquisition-quality-audit.json',counts,entries:dispositions}
fs.writeFileSync(path.join(ROOT,'generated','acquisition-dispositions.json'),JSON.stringify(out,null,2)+'\n')
console.log(JSON.stringify({counts,total:dispositions.length}))