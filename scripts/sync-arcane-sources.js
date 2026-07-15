'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { sourceId, sourceKind, displaySource } = require('../src/arcane-source')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'knowledge', 'arcane-sources')
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const ARCANES = require(path.join(ITEMS_ROOT, 'data/json/Arcanes.json'))
const SUPPLEMENTS = path.join(ROOT, 'generated', 'official-arcane-supplements.json')
function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'source' }
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
function buildPlan() {
  const supplementMethods = fs.existsSync(SUPPLEMENTS) ? (JSON.parse(fs.readFileSync(SUPPLEMENTS, 'utf8')).entries || []).flatMap(entry => entry.methods || []) : []
  const canonicals = [...new Set([...ARCANES.filter(item => item.name !== 'Arcane' && !item.excludeFromCodex).flatMap(item => (item.drops || []).map(drop => String(drop.location || '').trim()).filter(Boolean)), ...supplementMethods.map(method => method.sourceCanonical).filter(Boolean)])].sort()
  const entries = canonicals.map(canonical => ({ id: sourceId(canonical), canonical, displayName: displaySource(canonical), kind: sourceKind(canonical), aliases: [], localization: { status: displaySource(canonical) === canonical ? 'canonical-fallback' : 'official-or-audited', rule: '禁止运行时猜译' }, source: 'warframe-items Arcanes.json + official i18n/audited mapping' }))
  const categories = [...new Set(entries.map(entry => entry.kind))].sort().map(id => ({ id, count: entries.filter(entry => entry.kind === id).length }))
  return { entries, index: { schemaVersion: 1, generatedAt: new Date().toISOString().slice(0, 10), type: 'arcane-sources', count: entries.length, categories, variables: entries.map(entry => ({ id: entry.id, canonical: entry.canonical, displayName: entry.displayName, kind: entry.kind, category: entry.kind, file: `${entry.kind}/${slug(entry.canonical)}-${entry.id.slice(-8)}.json` })) } }
}
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check'); const plan = buildPlan(); const expected = new Set(); const changes = []
  const add = (file, value) => { expected.add(path.resolve(file).toLowerCase()); const next=serialize(value), old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null; if(next!==old)changes.push({file,next}) }
  add(path.join(TARGET,'categories.json'), plan.index)
  for(const entry of plan.entries){const route=plan.index.variables.find(item=>item.id===entry.id);add(path.join(TARGET,...route.file.split('/')),entry)}
  if(fs.existsSync(TARGET)){const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).forEach(item=>{const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.name.endsWith('.json')&&!expected.has(path.resolve(file).toLowerCase()))changes.push({file,remove:true})});walk(TARGET)}
  if(check){if(changes.length)throw new Error(`赋能源变量已漂移（${changes.length} 项）`);console.log(`赋能源变量无漂移：${plan.entries.length} 个`);return plan}
  for(const change of changes){if(change.remove)fs.unlinkSync(change.file);else{fs.mkdirSync(path.dirname(change.file),{recursive:true});fs.writeFileSync(change.file,change.next)}}
  console.log(`已同步 ${plan.entries.length} 个赋能源变量；写入 ${changes.length} 项`);return plan
}
if(require.main===module){try{run()}catch(error){console.error(error.stack||error);process.exit(1)}}
module.exports={buildPlan,run}
