'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')
const { ReadonlyWikiDatabase, resolveWikiDatabase } = require('../src/wiki-db')
const ROOT = path.resolve(__dirname, '..')
const NPC_ROOT = path.join(ROOT, 'knowledge', 'npc')
const CATEGORY_PAGES = Object.freeze({
  syndicates: { displayName: '集团', locationId: null, names: ['Cressa Tal','Cephalon Suda','Amaryn','Ergo Glast','Palladino','Teshin','Nora Night'] },
  cetus: { displayName: '希图斯', locationId: 'hub.cetus', names: ['Konzu','Saya','Hok','Hai-Luk','Nakak','Master Teasonai','Old Man Suumbaat','Onkko','Quill Onkko'] },
  fortuna: { displayName: '福尔图娜', locationId: 'hub.fortuna', names: ['Eudico','The Business','Smokefinger','Ticker','Legs','Roky','Little Duck','Rude Zuud','Thursby','Nightcap'] },
  necralisk: { displayName: '殁世幽都', locationId: 'hub.necralisk', names: ['Mother','Father','Daughter','Son','Grandmother','Otak','Loid'] },
  'sanctum-anatomica': { displayName: '解剖圣所', locationId: 'hub.sanctum-anatomica', names: ['Fibonacci','Bird 3','Tagfer','Loid'] }
})
const ROOT_NPCS = Object.freeze(['Lotus','Ordis'])
// 仅收录能确认的官方简中；空字符串表示未核验，运行时必须回退 canonical，禁止猜译。
const AUDITED_ZH = Object.freeze({ Lotus: 'Lotus', Ordis: 'Ordis', Darvo: 'Darvo', Clem: 'Clem', Maroo: 'Maroo', Teshin: 'Teshin', Konzu: '孔祝', Eudico: '尤迪科', Mother: '母亲', Quinn: '奎因', 'Cephalon Simaris': '中枢 Simaris' })
function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') }
function npcId(name) { return `npc.${slug(name)}` }
function sourceFor(db, name) { const page = db.getPage(name); return page ? { pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId } : { pageTitle: name, missing: true } }
const NPC_ROLES = Object.freeze({ Konzu: ['bounty-provider'], Eudico: ['bounty-provider'], Mother: ['bounty-provider'], Hunhow: ['exchange-provider'] })
function buildNpc(db, name, category, locationId) { return { id: npcId(name), canonical: name, displayName: AUDITED_ZH[name] || '', kind: 'npc', aliases: [], ...(NPC_ROLES[name] ? { roles: NPC_ROLES[name] } : {}), category, locationId, factionId: null, source: sourceFor(db, name), localization: { status: AUDITED_ZH[name] ? 'official-audited' : 'unresolved', rule: 'empty-displayName-falls-back-to-canonical' } } }
function listCharacterPages(resolved) {
  const raw = new Database(resolved, { readonly: true, fileMustExist: true })
  try { return raw.prepare("SELECT p.title FROM pages p JOIN categories c ON c.page_id=p.page_id WHERE c.category='Characters' ORDER BY p.title COLLATE NOCASE").all().map(row => row.title).filter(title => title !== 'Characters' && !title.includes('/')) }
  finally { raw.close() }
}
function buildPlan(dbPath) {
  const resolved = resolveWikiDatabase(dbPath); const db = new ReadonlyWikiDatabase(resolved); const records = []; const seen = new Map()
  try {
    for (const [category, definition] of Object.entries(CATEGORY_PAGES)) for (const name of definition.names) {
      if (seen.has(name)) { const existing = seen.get(name); existing.categories.push(category); continue }
      const npc = buildNpc(db, name, category, definition.locationId); npc.categories = [category]; records.push(npc); seen.set(name, npc)
    }
    for (const name of [...ROOT_NPCS, ...listCharacterPages(resolved)]) if (!seen.has(name)) { const npc = buildNpc(db, name, null, null); npc.categories = []; records.push(npc); seen.set(name, npc) }
  } finally { db.close() }
  const categories = Object.entries(CATEGORY_PAGES).map(([id, value]) => ({ id, displayName: value.displayName, locationId: value.locationId, count: records.filter(npc => npc.categories.includes(id)).length }))
  const files = records.map(npc => ({ npc, relative: npc.category ? `${npc.category}/${slug(npc.canonical)}.json` : `${slug(npc.canonical)}.json` }))
  return { resolved, records, categories, files, index: { schemaVersion: 1, generatedAt: new Date().toISOString().slice(0,10), source: { pageTitle: 'Characters', database: path.basename(resolved) }, count: records.length, categories, npcs: files.map(item => ({ id: item.npc.id, canonical: item.npc.canonical, displayName: item.npc.displayName, file: item.relative, categories: item.npc.categories, locationId: item.npc.locationId, factionId: item.npc.factionId })) } }
}
function walk(dir) { if (!fs.existsSync(dir)) return []; return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):x.name.endsWith('.json')?[path.join(dir,x.name)]:[]) }
function text(value) { return JSON.stringify(value,null,2)+'\n' }
function run(argv=process.argv.slice(2)) {
  const check=argv.includes('--check'), dry=argv.includes('--dry-run'); const i=argv.indexOf('--db'); const plan=buildPlan(i>=0?argv[i+1]:undefined); const expected=new Set; const changes=[]
  const add=(target,value)=>{expected.add(path.resolve(target).toLowerCase());const next=text(value),current=fs.existsSync(target)?fs.readFileSync(target,'utf8'):null;if(next!==current)changes.push({type:current==null?'create':'update',target,next})}
  add(path.join(NPC_ROOT,'categories.json'),plan.index); for(const item of plan.files)add(path.join(NPC_ROOT,...item.relative.split('/')),item.npc)
  for(const file of walk(NPC_ROOT))if(!expected.has(path.resolve(file).toLowerCase()))changes.push({type:'remove',target:file})
  if(check){if(changes.length)throw new Error(`NPC 知识已漂移（${changes.length} 项）`);console.log(`NPC 知识无漂移：${plan.records.length} 个`);return plan}
  if(dry){changes.forEach(x=>console.log(`${x.type}: ${path.relative(NPC_ROOT,x.target)}`));return plan}
  for(const change of changes){if(change.type==='remove')fs.unlinkSync(change.target);else{fs.mkdirSync(path.dirname(change.target),{recursive:true});fs.writeFileSync(change.target,change.next)}}
  console.log(`已同步 ${plan.records.length} 个 NPC，${plan.categories.length} 个地区分类；写入 ${changes.length} 项`);return plan
}
if(require.main===module){try{run()}catch(error){console.error(error.stack||error);process.exit(1)}}
module.exports={CATEGORY_PAGES,ROOT_NPCS,AUDITED_ZH,NPC_ROLES,listCharacterPages,buildPlan,run}
