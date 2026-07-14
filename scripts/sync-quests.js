'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildRegistryPlan, applyRegistryPlan } = require('./entity-registry-io')
const ROOT = path.resolve(__dirname, '..')
const SOURCE = path.join(ROOT, 'knowledge', 'generated', 'official-quests.json')
const TARGET = path.join(ROOT, 'knowledge', 'quests')
const MANUAL = Object.freeze([{ id: 'quest.jade-shadows-constellations', canonical: 'Jade Shadows: Constellations', displayName: 'Jade 之影：众星', kind: 'quest', aliases: [], officialSource: 'wf_en_cn_full.json' }])
function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function categoryOf(entry) { return /MainQuest|NewWar|ZarimanQuest|SecondDream|WarWithin|Sacrifice|Apostasy|Chimera/i.test(entry.officialUniqueName || '') ? 'main' : entry.officialSource === 'wf_en_cn_full.json' ? 'manual-audited' : 'side' }
function build() {
  const official = JSON.parse(fs.readFileSync(SOURCE, 'utf8')).quests || []
  const generated = official.map(quest => ({ id: `quest.${slug(quest.name)}`, canonical: quest.name, displayName: quest.zhName || '', kind: 'quest', aliases: [], officialUniqueName: quest.uniqueName, officialSource: 'official-quests.json' }))
  const byId = new Map(generated.map(entry => [entry.id, entry])); for (const entry of MANUAL) byId.set(entry.id, entry); return [...byId.values()]
}
function buildPlan() { return buildRegistryPlan({ type: 'quests', root: TARGET, entries: build(), categoryOf, categoryNames: { main: '主线任务', side: '支线任务', 'manual-audited': '人工审核任务' }, source: { generatedFrom: 'knowledge/generated/official-quests.json' } }) }
function run(argv = process.argv.slice(2)) { const check = argv.includes('--check'); const changes = applyRegistryPlan(buildPlan(), { check }); console.log(check ? `任务变量无漂移：${build().length} 个` : `已同步 ${build().length} 个任务变量；写入 ${changes.length} 项`) }
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { build, buildPlan, run }
