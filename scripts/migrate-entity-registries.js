'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildRegistryPlan, applyRegistryPlan, walkJson } = require('./entity-registry-io')
const { readIndexedEntries } = require('../src/entities')

const ROOT = path.resolve(__dirname, '..')
const KNOWLEDGE = path.join(ROOT, 'knowledge')
const LEGACY = path.join(KNOWLEDGE, 'entities')
const DEFINITIONS = Object.freeze({
  enemies: { legacy: 'enemies', categoryOf: () => 'boss', names: { boss: '首领与刺杀目标' } }
})
function readLegacy(name, directory) {
  const legacyPath = path.join(LEGACY, `${name}.json`)
  if (fs.existsSync(legacyPath)) return JSON.parse(fs.readFileSync(legacyPath, 'utf8'))
  const indexed = readIndexedEntries(ROOT, directory)
  const loose = walkJson(path.join(KNOWLEDGE, directory)).filter(file => path.basename(file) !== 'categories.json').map(file => JSON.parse(fs.readFileSync(file, 'utf8')))
  const byId = new Map([...indexed, ...loose].map(({ category, ...entry }) => [entry.id, entry]))
  return [...byId.values()]
}
function buildPlans() {
  return Object.entries(DEFINITIONS).map(([directory, definition]) => buildRegistryPlan({ type: directory, root: path.join(KNOWLEDGE, directory), entries: readLegacy(definition.legacy, directory), categoryOf: definition.categoryOf, categoryNames: definition.names, source: { migratedFrom: `knowledge/entities/${definition.legacy}.json` } }))
}
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  let changes = 0
  for (const plan of buildPlans()) changes += applyRegistryPlan(plan, { check }).length
  console.log(check ? '基础实体变量目录无漂移' : `已同步 ${Object.keys(DEFINITIONS).length} 类基础实体变量；写入 ${changes} 项`)
}
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { DEFINITIONS, buildPlans, run }
