'use strict'

const path = require('node:path')
const { buildRegistryPlan, applyRegistryPlan } = require('./entity-registry-io')
const ROOT = path.resolve(__dirname, '..')
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const ENEMIES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Enemy.json'))
const TARGET = path.join(ROOT, 'knowledge', 'factions')
const AUDITED = Object.freeze({
  Corpus: { id: 'faction.corpus', displayName: 'Corpus', aliases: ['科普斯'] }, Grineer: { id: 'faction.grineer', displayName: 'Grineer', aliases: ['克隆尼'] }, Infestation: { id: 'faction.infested', displayName: 'Infested', aliases: ['感染者'] }, Orokin: { id: 'faction.orokin', displayName: 'Orokin', aliases: ['奥罗金'] }, Sentient: { id: 'faction.sentient', displayName: 'Sentient', aliases: ['Sentient造物'] }, Stalker: { id: 'faction.stalker', displayName: 'Stalker', aliases: ['追猎者'] }, Tenno: { id: 'faction.tenno', displayName: 'Tenno', aliases: ['天诺'] }, Neutral: { id: 'faction.neutral', displayName: '中立', aliases: [] }, Narmer: { id: 'faction.narmer', displayName: '合一众', aliases: ['Narmer'] }
})
function canonicalTypes() { return [...new Set(ENEMIES.map(enemy => enemy.type).filter(type => AUDITED[type]))].sort().concat('Narmer') }
function build() { return canonicalTypes().map(canonical => ({ ...AUDITED[canonical], canonical, kind: 'faction', officialSource: canonical === 'Narmer' ? 'Warframe Wiki Acquisition / audited official localization' : 'warframe-items Enemy.json / audited localization' })) }
function categoryOf(entry) { return entry.canonical === 'Neutral' ? 'neutral' : entry.canonical === 'Narmer' ? 'special' : 'major' }
function buildPlan() { return buildRegistryPlan({ type: 'factions', root: TARGET, entries: build(), categoryOf, categoryNames: { major: '主要阵营', special: '特殊阵营', neutral: '中立阵营' }, source: { generatedFrom: 'warframe-items Enemy.json', auditedOverrides: true } }) }
function run(argv = process.argv.slice(2)) { const check = argv.includes('--check'); const changes = applyRegistryPlan(buildPlan(), { check }); console.log(check ? `阵营变量无漂移：${build().length} 个` : `已同步 ${build().length} 个阵营变量；写入 ${changes.length} 项`) }
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { AUDITED, build, buildPlan, run }
