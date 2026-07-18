'use strict'

const path = require('node:path')
const { buildRegistryPlan, applyRegistryPlan } = require('./entity-registry-io')
const ROOT = path.resolve(__dirname, '..')
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const ENEMIES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Enemy.json'))
const TARGET = path.join(ROOT, 'knowledge', 'factions')
const AUDITED = Object.freeze({
  Corpus: { id: 'faction.corpus', displayName: '科普斯', aliases: ['Corpus'] }, Grineer: { id: 'faction.grineer', displayName: '克隆尼', aliases: ['Grineer'] }, Infestation: { id: 'faction.infested', displayName: '感染者', aliases: ['Infested', 'Infestation'] }, Orokin: { id: 'faction.orokin', displayName: '奥罗金', aliases: ['Orokin'] }, Sentient: { id: 'faction.sentient', displayName: 'Sentient', aliases: ['Sentient造物'] }, Stalker: { id: 'faction.stalker', displayName: 'Stalker', aliases: ['追猎者'] }, Tenno: { id: 'faction.tenno', displayName: 'Tenno', aliases: ['天诺'] }, Neutral: { id: 'faction.neutral', displayName: '中立', aliases: [] }, Narmer: { id: 'faction.narmer', displayName: '合一众', aliases: ['Narmer'] },
  'Arbiters of Hexis': { id: 'faction.arbiters-of-hexis', displayName: '均衡仲裁者', aliases: [] }, 'Red Veil': { id: 'faction.red-veil', displayName: '血色面纱', aliases: [] }, 'Steel Meridian': { id: 'faction.steel-meridian', displayName: '钢铁防线', aliases: [] }, 'Cephalon Suda': { id: 'faction.cephalon-suda', displayName: '中枢苏达', aliases: [] }, 'New Loka': { id: 'faction.new-loka', displayName: '新世间', aliases: [] }, 'The Perrin Sequence': { id: 'faction.the-perrin-sequence', displayName: '佩兰数列', aliases: [] }, 'The Holdfasts': { id: 'faction.the-holdfasts', displayName: '坚守者', aliases: [] }
})
function canonicalTypes() { return [...new Set([...ENEMIES.map(enemy => enemy.type).filter(type => AUDITED[type]), 'Narmer', 'Arbiters of Hexis', 'Red Veil', 'Steel Meridian', 'Cephalon Suda', 'New Loka', 'The Perrin Sequence', 'The Holdfasts'])].sort() }
function build() { return canonicalTypes().map(canonical => ({ ...AUDITED[canonical], canonical, kind: 'faction', officialSource: canonical === 'Narmer' ? 'Warframe Wiki Acquisition / audited official localization' : 'warframe-items Enemy.json / audited localization' })) }
function categoryOf(entry) { return entry.canonical === 'Neutral' ? 'neutral' : entry.canonical === 'Narmer' ? 'special' : ['Arbiters of Hexis', 'Red Veil', 'Steel Meridian', 'Cephalon Suda', 'New Loka', 'The Perrin Sequence', 'The Holdfasts'].includes(entry.canonical) ? 'syndicate' : 'major' }
function buildPlan() { return buildRegistryPlan({ type: 'factions', root: TARGET, entries: build(), categoryOf, categoryNames: { major: '主要阵营', syndicate: '集团', special: '特殊阵营', neutral: '中立阵营' }, source: { generatedFrom: 'warframe-items Enemy.json + Mods syndicate drops', auditedOverrides: true } }) }
function run(argv = process.argv.slice(2)) { const check = argv.includes('--check'); const changes = applyRegistryPlan(buildPlan(), { check }); console.log(check ? `阵营变量无漂移：${build().length} 个` : `已同步 ${build().length} 个阵营变量；写入 ${changes.length} 项`) }
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { AUDITED, build, buildPlan, run }
