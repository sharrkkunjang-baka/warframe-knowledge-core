'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { buildRegistryPlan, applyRegistryPlan, slug } = require('./entity-registry-io')

const ROOT = path.resolve(__dirname, '..')
const TARGET = path.join(ROOT, 'knowledge', 'mission-types')
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const WARFRAMES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Warframes.json'))
const SOURCES = Object.freeze({ regions: 'https://browse.wf/warframe-public-export-plus/ExportRegions.json', english: 'https://browse.wf/warframe-public-export-plus/dict.en.json', chinese: 'https://browse.wf/warframe-public-export-plus/dict.zh.json' })
const AUDITED_ZH = Object.freeze({ Assassination: '刺杀', Defense: '防御', Survival: '生存', Capture: '捕获', Rescue: '救援', Spy: '间谍', Disruption: '中断', Exterminate: '歼灭', Interception: '拦截', Excavation: '挖掘', Defection: '叛逃', Skirmish: '前哨战', Caches: '任务缓存', 'Infested Salvage': 'INFESTED 资源回收', Ascension: '扬升', 'Shrine Defense': '神龛防御' })
const CATEGORY_NAMES = Object.freeze({ endless: '无尽与轮次任务', standard: '常规任务', railjack: '航道星舰任务', 'reward-source': '奖励来源类型', special: '特殊任务', event: '活动任务', bounty: '赏金任务' })
const SPECIAL_TYPES = Object.freeze([
  { canonical: 'Skirmish', displayName: '前哨战', category: 'railjack', officialSource: 'DE Languages.bin official mission terminology' },
  { canonical: 'Sanctuary Onslaught', displayName: '圣殿突袭', category: 'special', officialSource: 'wf_en_cn_full.json' },
  { canonical: 'Granum Void', displayName: '格拉努虚空', category: 'special', officialSource: 'wf_en_cn_full.json' },
  { canonical: 'Extended Granum Void', displayName: '', category: 'special', officialSource: 'official-drop-canonical' },
  { canonical: 'Nightmare Granum Void', displayName: '', category: 'special', officialSource: 'official-drop-canonical' },
  { canonical: 'Void Storm', displayName: '', category: 'railjack', officialSource: 'official-drop-canonical' },
  { canonical: 'Orphix', displayName: '奥影', category: 'railjack', officialSource: 'DE official zh-hans Operation: Orphix Venom terminology' },
  { canonical: 'Operation: Orphix Venom', displayName: '行动代号：奥影之毒', category: 'event', officialSource: 'DE official zh-hans news' },
  { canonical: 'Arbitration', displayName: '仲裁', category: 'special', officialSource: 'DE official zh-hans terminology' },
  { canonical: 'Archimedea', displayName: '科研任务', category: 'special', officialSource: 'Warframe official mode terminology' },
  { canonical: 'Bounty', displayName: '赏金', category: 'bounty', officialSource: 'official-drop-canonical' },
  { canonical: 'Narmer Bounty', displayName: '合一众赏金', category: 'bounty', officialSource: 'official-drop-canonical' },
  { canonical: 'Normal', displayName: '普通任务', category: 'standard', officialSource: 'official-drop-canonical' },
  { canonical: 'Hard', displayName: '钢铁之路', category: 'special', officialSource: 'official-drop-canonical' },
  ...['Cetus Bounty','Orb Vallis Bounty','Cambion Drift Bounty','Entrati Lab Bounty','Zariman Bounty','WF1999 Bounty','Plague Star'].map(canonical => ({ canonical, displayName: '', category: canonical === 'Plague Star' ? 'event' : 'bounty', officialSource: 'official-drop-canonical' }))
])
const ENDLESS = /DEFENSE|SURVIVAL|DISRUPTION|TERRITORY|EXCAVATE|DEFECTION|SALVAGE|ASCENSION/i
function categoryOf(entry) { if (entry.categoryOverride) return entry.categoryOverride; if (entry.canonical === 'Caches') return 'reward-source'; if (/Skirmish/i.test(entry.canonical)) return 'railjack'; if (ENDLESS.test(entry.officialCode || entry.canonical)) return 'endless'; return entry.officialCode ? 'standard' : 'special' }
async function fetchJson(url) { const response = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json() }
function syntheticTypes() {
  const values = new Set()
  for (const frame of WARFRAMES.filter(item => !item.isPrime)) for (const component of frame.components || []) for (const drop of component.drops || []) {
    const match = String(drop.location || '').match(/^[^/]+\/[^,(]+?\s*\(([^)]+)\)(?:,\s*Rotation\s*[A-Z])?$/i)
    if (match && !/Level\s*\d+|Bount(?:y|ies)/i.test(drop.location)) values.add(match[1].trim())
  }
  return values
}
async function build() {
  const [regions, english, chinese] = await Promise.all([fetchJson(SOURCES.regions), fetchJson(SOURCES.english), fetchJson(SOURCES.chinese)])
  const byCanonical = new Map()
  for (const node of Object.values(regions)) {
    if (!node.missionType || !node.missionName) continue
    const canonical = english[node.missionName] || String(node.missionType).replace(/^MT_/, '').toLowerCase().replace(/(^|_)([a-z])/g, (_, _s, c) => `${_s ? ' ' : ''}${c.toUpperCase()}`)
    const entry = { id: `mission-type.${slug(canonical)}`, canonical, displayName: chinese[node.missionName] || AUDITED_ZH[canonical] || '', kind: 'mission-type', aliases: [], officialCode: node.missionType, officialNameKey: node.missionName, officialSource: chinese[node.missionName] ? 'ExportRegions + dict.zh' : 'ExportRegions canonical' }
    byCanonical.set(canonical, entry)
  }
  for (const definition of SPECIAL_TYPES) byCanonical.set(definition.canonical, { id: `mission-type.${slug(definition.canonical)}`, canonical: definition.canonical, displayName: definition.displayName, kind: 'mission-type', aliases: [], officialCode: null, officialNameKey: null, officialSource: definition.officialSource, categoryOverride: definition.category })
  for (const canonical of syntheticTypes()) {
    const id = `mission-type.${slug(canonical)}`
    const existing = [...byCanonical.values()].find(entry => entry.id === id)
    if (existing) { if (!existing.displayName && AUDITED_ZH[canonical]) existing.displayName = AUDITED_ZH[canonical]; continue }
    byCanonical.set(canonical, { id, canonical, displayName: AUDITED_ZH[canonical] || '', kind: 'mission-type', aliases: [], officialCode: null, officialNameKey: null, officialSource: AUDITED_ZH[canonical] ? 'audited-official-zh' : 'official-drop-canonical' })
  }
  return [...new Map([...byCanonical.values()].map(entry => [entry.id, entry])).values()].sort((a, b) => a.id.localeCompare(b.id, 'en'))
}
async function buildPlan() { return buildRegistryPlan({ type: 'mission-types', root: TARGET, entries: await build(), categoryOf, categoryNames: CATEGORY_NAMES, source: { generatedFrom: SOURCES, supplemental: 'warframe-items Warframes component drops' } }) }
async function run(argv = process.argv.slice(2)) { const check = argv.includes('--check'); const plan = await buildPlan(); const changes = applyRegistryPlan(plan, { check }); console.log(check ? `任务类型变量无漂移：${plan.index.count} 个` : `已同步 ${plan.index.count} 个任务类型变量；写入 ${changes.length} 项`) }
if (require.main === module) run().catch(error => { console.error(error.stack || error); process.exit(1) })
module.exports = { SOURCES, AUDITED_ZH, SPECIAL_TYPES, categoryOf, syntheticTypes, build, buildPlan, run }
