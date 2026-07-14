'use strict'

const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const ENEMIES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Enemy.json'))
const TARGET = path.join(ROOT, 'knowledge', 'entities', 'factions.json')
const AUDITED = Object.freeze({
  Corpus: { id: 'faction.corpus', displayName: 'Corpus', aliases: ['科普斯'] },
  Grineer: { id: 'faction.grineer', displayName: 'Grineer', aliases: ['克隆尼'] },
  Infestation: { id: 'faction.infested', displayName: 'Infested', aliases: ['感染者'] },
  Orokin: { id: 'faction.orokin', displayName: 'Orokin', aliases: ['奥罗金'] },
  Sentient: { id: 'faction.sentient', displayName: 'Sentient', aliases: ['Sentient造物'] },
  Stalker: { id: 'faction.stalker', displayName: 'Stalker', aliases: ['追猎者'] },
  Tenno: { id: 'faction.tenno', displayName: 'Tenno', aliases: ['天诺'] },
  Neutral: { id: 'faction.neutral', displayName: '中立', aliases: [] },
  Narmer: { id: 'faction.narmer', displayName: '合一众', aliases: ['Narmer'] }
})
function canonicalTypes() { return [...new Set(ENEMIES.map(enemy => enemy.type).filter(type => AUDITED[type]))].sort().concat('Narmer') }
function build() { return canonicalTypes().map(canonical => ({ ...AUDITED[canonical], canonical, kind: 'faction', officialSource: canonical === 'Narmer' ? 'Warframe Wiki Acquisition / audited official localization' : 'warframe-items Enemy.json / audited localization' })) }
function run(argv = process.argv.slice(2)) { const check = argv.includes('--check'); const next = JSON.stringify(build(), null, 2) + '\n'; const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null; if (check) { if (current !== next) throw new Error('阵营实体已漂移，请运行 npm run sync:factions'); console.log(`阵营实体无漂移：${build().length} 个`); return } fs.writeFileSync(TARGET, next); console.log(`已同步 ${build().length} 个阵营实体`) }
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { AUDITED, build, run }
