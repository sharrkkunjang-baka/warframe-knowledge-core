'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { ReadonlyWikiDatabase, resolveWikiDatabase, sha256File } = require('../src/wiki-db')
const { CATEGORY_DEFINITIONS, classifyFrameAcquisition } = require('../src/frame-acquisition-categories')
const { CATEGORY_DIRS, METHOD_TEMPLATES, categoryDirectory, buildRouting } = require('../src/frame-acquisition-routing')
const syncFrames = require('./sync-frame-knowledge')

const ROOT = path.resolve(__dirname, '..')
const FRAME_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'warframe')
const CATEGORY_DIR = path.join(ROOT, 'knowledge', 'categories')
const INDEX_PATH = path.join(FRAME_ROOT, 'categories.json')
const METHOD_DIR = path.join(FRAME_ROOT, 'method')
const WIKI_SOURCE_URL = 'https://wiki.warframe.com/w/Category:Warframes'

function categoryDocument(definition) { return { ...definition, parent: 'frame', sources: [{ url: WIKI_SOURCE_URL, label: 'Warframe Wiki - Warframes acquisition pages（获取方式由 Acquisition 章节确定性编译）' }], updatedAt: new Date().toISOString().slice(0, 10) } }
function comparable(value) { return JSON.stringify(value, null, 2) + '\n' }
function walkJson(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
    const target = path.join(dir, item.name)
    if (item.isDirectory()) return walkJson(target)
    return item.isFile() && item.name.endsWith('.json') ? [target] : []
  })
}
function methodDocuments() {
  return [
    ...Object.entries(METHOD_TEMPLATES.components).map(([category, template]) => ({ path: path.join(METHOD_DIR, 'components', `${categoryDirectory(category)}.json`), value: { schemaVersion: 1, kind: 'frame-acquisition-method', scope: 'components', category, template } })),
    ...Object.entries(METHOD_TEMPLATES.blueprints).map(([category, template]) => ({ path: path.join(METHOD_DIR, 'blueprints', `${category}.json`), value: { schemaVersion: 1, kind: 'frame-acquisition-method', scope: 'blueprint', category, template } }))
  ]
}
function buildPlan(dbPath) {
  const resolved = resolveWikiDatabase(dbPath); const wiki = new ReadonlyWikiDatabase(resolved); const dbHash = sha256File(resolved); const framePlan = syncFrames.buildPlan(); const entries = []
  try {
    for (const item of framePlan.included) {
      const old = item.entry; const runtimeFrame = require('../src/frame-acquisition').resolveWarframe(old.subject.canonical) || item.frame; const page = item.frame.isPrime ? null : wiki.getPage(old.subject.canonical); const refs = classifyFrameAcquisition(runtimeFrame, page); const componentCategory = refs[0] || null
      const routing = componentCategory ? buildRouting(runtimeFrame, componentCategory, page) : { componentCategory: null, blueprintCategory: 'unresolved', componentVariables: {}, blueprintVariables: {}, blueprintSource: 'unresolved' }
      const directory = categoryDirectory(componentCategory); const relativePath = directory ? `${directory}/${syncFrames.slugify(old.subject.canonical)}.json` : null
      const existingGenerated = old.frameAcquisition.generated || {}
      const generated = { ...existingGenerated, acquisitionCategories: { categoryRefs: refs, status: refs.length === 1 ? 'classified' : 'review-required', source: item.frame.isPrime ? { type: 'official-item-data', canonical: 'Prime' } : page ? { type: 'wiki-page', pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId, sourceDatabase: { sha256: dbHash } } : { type: 'missing-wiki-page' } }, routing }
      let manual = old.frameAcquisition.manual || {}
      if (componentCategory === 'frame-specific-mission' && !manual.acquisitionText) {
        if (runtimeFrame) manual = { ...manual, acquisitionText: require('../src/frame-acquisition').renderAcquisition({ frame: runtimeFrame, materials: { available: false, reason: '制造材料数据由运行时补充' } }).split('\n材料统计：')[0] }
      }
      const entry = { ...old, subject: { ...old.subject, categoryRefs: refs }, frameAcquisition: { ...old.frameAcquisition, generated, manual } }
      entries.push({ frame: item.frame, relativePath, target: relativePath ? path.join(FRAME_ROOT, ...relativePath.split('/')) : null, entry, routing })
    }
  } finally { wiki.close() }
  const index = { schemaVersion: 1, generatedAt: new Date().toISOString().slice(0, 10), count: entries.length, sourceDatabase: { sha256: dbHash }, frames: entries.map(item => ({ canonical: item.entry.subject.canonical, displayName: item.entry.subject.displayName, officialUniqueName: item.entry.subject.officialUniqueName, file: item.relativePath, componentCategory: item.routing.componentCategory, blueprintCategory: item.routing.blueprintCategory })) }
  return { resolved, dbHash, categories: CATEGORY_DEFINITIONS.map(categoryDocument), entries, index, methods: methodDocuments() }
}
function addChange(changes, target, value) { const next = comparable(value); const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null; if (current !== next) changes.push({ type: current == null ? 'create' : 'update', target, file: path.relative(FRAME_ROOT, target), next }) }
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check'), dryRun = argv.includes('--dry-run'), report = argv.includes('--report-unclassified'); const dbArgIndex = argv.indexOf('--db'); const plan = buildPlan(dbArgIndex >= 0 ? argv[dbArgIndex + 1] : undefined); const changes = []; const expected = new Set()
  for (const category of plan.categories) addChange(changes, path.join(CATEGORY_DIR, `${category.id}.json`), category)
  addChange(changes, INDEX_PATH, plan.index); expected.add(path.resolve(INDEX_PATH).toLowerCase())
  for (const method of plan.methods) { addChange(changes, method.path, method.value); expected.add(path.resolve(method.path).toLowerCase()) }
  for (const item of plan.entries) { if (!item.target) continue; addChange(changes, item.target, [item.entry]); expected.add(path.resolve(item.target).toLowerCase()) }
  for (const file of walkJson(FRAME_ROOT)) if (!expected.has(path.resolve(file).toLowerCase())) changes.push({ type: 'remove', target: file, file: path.relative(FRAME_ROOT, file) })
  const unresolved = plan.entries.filter(item => !item.relativePath || item.routing.blueprintCategory === 'unresolved')
  if (report) console.log(JSON.stringify({ total: plan.entries.length, counts: Object.fromEntries(CATEGORY_DEFINITIONS.map(category => [category.id, plan.entries.filter(item => item.routing.componentCategory === category.id).length])), unresolved: unresolved.map(item => ({ frame: item.entry.subject.canonical, componentCategory: item.routing.componentCategory, blueprintCategory: item.routing.blueprintCategory })) }, null, 2))
  if (check) { if (changes.length) throw new Error(`战甲获取路由已漂移（${changes.length} 项）`); if (unresolved.length) throw new Error(`仍有 ${unresolved.length} 个战甲路由待审核`); console.log(`战甲获取路由无漂移：${plan.entries.length} 个条目`); return plan }
  if (dryRun) { for (const change of changes) console.log(`${change.type}: ${change.file}`); console.log(`dry-run：${changes.length} 项变更，未写文件`); return plan }
  for (const change of changes) { if (change.type === 'remove') fs.unlinkSync(change.target); else { fs.mkdirSync(path.dirname(change.target), { recursive: true }); fs.writeFileSync(change.target, change.next) } }
  for (const dir of walkDirectories(FRAME_ROOT).sort((a,b)=>b.length-a.length)) if (dir !== FRAME_ROOT && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  console.log(`已同步 ${plan.entries.length} 个战甲获取路由；写入 ${changes.length} 项；待审核 ${unresolved.length} 个`); return plan
}
function walkDirectories(dir) { if (!fs.existsSync(dir)) return []; return [dir, ...fs.readdirSync(dir,{withFileTypes:true}).filter(x=>x.isDirectory()).flatMap(x=>walkDirectories(path.join(dir,x.name)))] }
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { categoryDocument, methodDocuments, buildPlan, run }
