'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildRegistryPlan, applyRegistryPlan, walkJson } = require('./entity-registry-io')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'knowledge', 'curreicies')
const OFFICIAL_ITEMS = path.join(ROOT, 'knowledge', 'generated', 'official-items.json')
const FRAME_CURRENCIES = Object.freeze([
  { canonical: 'Vessel Capillaries', kind: 'resource-token', acquisitionDependency: { type: 'mission-enemy-drop', missionNodeId: 'mission-node.armatus', missionTypeId: 'mission-type.disruption', enemyRole: 'Demolisher', normalAmount: { min: 2, max: 4 }, steelPathAmount: { min: 5, max: 7 }, source: 'Dante Wiki Acquisition' } },
  { canonical: 'Stock', kind: 'exchange-token' },
  { canonical: 'Belric Crystal Fragment', kind: 'resource-token' },
  { canonical: 'Rania Crystal Fragment', kind: 'resource-token' },
  { canonical: 'Fate Pearl', kind: 'resource-token' },
  { canonical: 'Lua Thrax Plasm', kind: 'resource-token' },
  { canonical: 'Vainthorn', kind: 'exchange-token' },
  { canonical: 'Vestigial Motes', kind: 'resource-token' },
  { canonical: 'Beating Heartstrings', kind: 'resource-token' },
  { canonical: 'Vitus Essence', kind: 'exchange-token' },
  { canonical: 'Mother Token', kind: 'exchange-token' },
  { canonical: 'Orokin Ducats', kind: 'standard' },
  { canonical: "Nora's Mix Vol. 8 Cred", kind: 'seasonal-token' },
  { canonical: "Kullervo's Bane", kind: 'exchange-token', aliases: ['灾刃'], acquisitionDependency: { canonical: "Kullervo's Bane", displayName: 'Kullervo 的灾刃', acquisitionSummary: '在恐惧、愤怒或悲伤心情阶段的双衍王境中前往库尔沃之灾，击败 Kullervo，并在同一轮任务中击败奥金魇龙后结算获得', sourceRefs: ['https://wiki.warframe.com/w/Kullervo%27s_Bane'], reviewStatus: 'approved' } }
])
const ID_OVERRIDES = Object.freeze({ "Kullervo's Bane": 'currency.kullervos-bane' })
const CATEGORY_NAMES = Object.freeze({ standard: '通用货币', premium: '高级货币', standing: '声望', 'exchange-token': '兑换代币', 'resource-token': '资源代币', 'seasonal-token': '赛季代币' })
function officialByCanonical() { const data = JSON.parse(fs.readFileSync(OFFICIAL_ITEMS, 'utf8')); return new Map((data.items || []).map(item => [item.canonical, item])) }
function build() {
  const byId = new Map(walkJson(TARGET).filter(file => path.basename(file) !== 'categories.json').map(file => JSON.parse(fs.readFileSync(file, 'utf8'))).map(entry => [entry.id, entry]))
  const official = officialByCanonical()
  for (const definition of FRAME_CURRENCIES) {
    const item = official.get(definition.canonical)
    if (!item || item.localizationStatus !== 'official-zh') throw new Error(`${definition.canonical}: 官方物品目录缺少官方中文`)
    const id = ID_OVERRIDES[definition.canonical] || `currency.${definition.canonical.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    for (const [existingId, existing] of byId) if (existing.canonical === definition.canonical && existingId !== id) byId.delete(existingId)
    const previous = byId.get(id) || {}
    byId.set(id, { id, canonical: definition.canonical, displayName: item.displayName, kind: definition.kind, aliases: definition.aliases || [], officialUniqueName: item.uniqueName, officialSource: 'knowledge/generated/official-items.json', ...previous, ...(definition.acquisitionDependency ? { acquisitionDependency: definition.acquisitionDependency } : {}) })
  }
  return [...byId.values()]
}
function buildPlan() { return buildRegistryPlan({ type: 'curreicies', root: TARGET, entries: build(), categoryOf: entry => entry.kind, categoryNames: CATEGORY_NAMES, source: { generatedFrom: 'official-items.json + audited frame exchange definitions' } }) }
function run(argv = process.argv.slice(2)) { const check = argv.includes('--check'); const plan = buildPlan(); const changes = applyRegistryPlan(plan, { check }); console.log(check ? `战甲兑换货币变量无漂移：${plan.index.count} 个` : `已同步 ${plan.index.count} 个战甲兑换货币变量；写入 ${changes.length} 项`) }
if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { FRAME_CURRENCIES, build, buildPlan, run }
