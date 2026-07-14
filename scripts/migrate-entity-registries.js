'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildRegistryPlan, applyRegistryPlan } = require('./entity-registry-io')
const { readIndexedEntries } = require('../src/entities')

const ROOT = path.resolve(__dirname, '..')
const KNOWLEDGE = path.join(ROOT, 'knowledge')
const LEGACY = path.join(KNOWLEDGE, 'entities')
const DEFINITIONS = Object.freeze({
  curreicies: { legacy: 'currencies', categoryOf: entry => entry.kind, names: { standard: '通用货币', premium: '高级货币', standing: '声望', 'exchange-token': '兑换代币' } },
  locations: { legacy: 'locations', categoryOf: entry => entry.kind, names: { planet: '星球', hub: '中继聚落', landscape: '开放世界', 'proxima-region': '比邻星域', 'railjack-mission': '航道星舰任务' } },
  enemies: { legacy: 'enemies', categoryOf: () => 'boss', names: { boss: '首领与刺杀目标' } }
})
function readLegacy(name, directory) {
  const legacyPath = path.join(LEGACY, `${name}.json`)
  return fs.existsSync(legacyPath) ? JSON.parse(fs.readFileSync(legacyPath, 'utf8')) : readIndexedEntries(ROOT, directory).map(({ category, ...entry }) => entry)
}
function buildPlans() {
  return Object.entries(DEFINITIONS).map(([directory, definition]) => buildRegistryPlan({ type: directory, root: path.join(KNOWLEDGE, directory), entries: readLegacy(definition.legacy, directory), categoryOf: definition.categoryOf, categoryNames: definition.names, source: { migratedFrom: `knowledge/entities/${definition.legacy}.json` } }))
}
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  let changes = 0
  for (const plan of buildPlans()) changes += applyRegistryPlan(plan, { check }).length
  console.log(check ? '基础实体变量目录无漂移' : `已同步 3 类基础实体变量；写入 ${changes} 项`)
}
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { DEFINITIONS, buildPlans, run }
