'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '..')
const CACHE = path.join(ROOT, '.cache', 'official-localization')
const TARGET = path.join(ROOT, 'generated', 'official-localization-snapshot.json')
const LANGUAGE_COMMIT = '41016b40717123fed2b3c221bb69da9cfddcaf3a'
const SOURCES = Object.freeze({
  languagesEn: `https://raw.githubusercontent.com/calamity-inc/warframe-languages-bin-data/${LANGUAGE_COMMIT}/en.json`,
  languagesZh: `https://raw.githubusercontent.com/calamity-inc/warframe-languages-bin-data/${LANGUAGE_COMMIT}/zh.json`,
  exportEnemies: 'https://browse.wf/warframe-public-export-plus/ExportEnemies.json'
})
const KEY_OVERRIDES = Object.freeze({
  Kavat: '/Lotus/Language/Game/FeralCatName',
  'Councilor Vay Hek': '/Lotus/Language/Bosses/BossCouncilorVayHek'
})
const CANONICAL_BASE_OVERRIDES = Object.freeze({
  'Attack Drone (Archwing)': 'Attack Drone',
  'Cannon Battery (2)': 'Cannon Battery',
  'Comba (Orb Vallis)': 'Comba',
  'Corpus Power Carrier (Orb Vallis)': 'Corpus Power Carrier',
  'Netracell Arcocanid': 'Rogue Arcocanid',
  'Netracell Culverin': 'Rogue Culverin',
  'Narmer Crewman (2)': 'Narmer Crewman',
  'Orphid Specter (Husk)': 'Orphid Specter',
  'Necramech (Tier 1)': 'Necramech',
  'Necramech (Tier 2)': 'Necramech',
  'Necramech (Tier 3)': 'Necramech'
})
const AUDITED_COMPOSITES = Object.freeze({
  Comba: { displayName: '驱逐员', kind: 'enemy-family', languageKeys: ['/Lotus/Language/Game/ModCorpPerception','/Lotus/Language/Game/ModCorpDamage','/Lotus/Language/Game/ModCorpBuff','/Lotus/Language/Game/ModCorpMobility'], rule: '四种官方简中变体（迷雾/衰竭/虚无/滞缓驱逐员）的共同职业名' },
  'Comba (Orb Vallis)': { displayName: '奥布山谷驱逐员', kind: 'enemy-family', languageKeys: ['/Lotus/Language/Game/ModCorpPerception','/Lotus/Language/Game/ModCorpDamage','/Lotus/Language/Game/ModCorpBuff','/Lotus/Language/Game/ModCorpMobility'], rule: '四种官方简中变体共同职业名 + 官方地点名' },
  Scrambus: { displayName: '扰敌员', kind: 'enemy-family', languageKeys: ['/Lotus/Language/Game/ModCorpPerceptionSkate','/Lotus/Language/Game/ModCorpDamageSkate','/Lotus/Language/Game/ModCorpBuffSkate','/Lotus/Language/Game/ModCorpMobilitySkate'], rule: '四种官方简中变体（迷雾/衰竭/虚无/滞缓扰敌员）的共同职业名' },
  'Orb Vallis - Enrichment Labs Enemies': { displayName: '奥布山谷升华实验室内的敌人', kind: 'enemy-group', languageKeys: ['/Lotus/Language/SolarisVenus/ArachnoidPowerCoreHungerDesc'], rule: '官方简中物品描述中的原文来源' },
  'Orb Vallis - Spaceport Enemies': { displayName: '奥布山谷航天站内的敌人', kind: 'enemy-group', languageKeys: ['/Lotus/Language/SolarisVenus/ArachnoidPowerCoreMicroidDesc'], rule: '官方简中物品描述中的原文来源' },
  'Orb Vallis - Temple of Profit Enemies': { displayName: '奥布山谷润盈殿内的敌人', kind: 'enemy-group', languageKeys: ['/Lotus/Language/SolarisVenus/ArachnoidPowerCoreWraithDesc'], rule: '官方简中物品描述中的原文来源' },
  'Captain Vor and Lieutenant Lech Kril': { displayName: '沃尔上尉与 Lech Kril 中尉', kind: 'enemy-group', languageKeys: ['/Lotus/Language/Game/VorBossName','/Lotus/Language/Game/KrilBossName'], rule: '由同一刺杀节点的两个官方敌人名称组合，不新增猜译' }
})
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }
function normalize(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '') }
function cleanDisplay(value) { return String(value || '').trim().replace(/^['‘’]+|['‘’：:]+$/g, '').trim() }
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }
function walk(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(dir, item.name)) : item.name.endsWith('.json') ? [path.join(dir, item.name)] : []) : [] }
function referencedEnemies() {
  const names = new Set()
  for (const file of walk(path.join(ROOT, 'knowledge', 'acquisition', 'mod'))) {
    const values = [].concat(JSON.parse(fs.readFileSync(file, 'utf8')))
    for (const entry of values) for (const method of entry.modAcquisition?.generated?.wiki?.methods || []) if (method.type === 'enemy-drop' && method.sourceCanonical) names.add(method.sourceCanonical)
  }
  // 战甲刺杀模板和 Mod 共用同一敌人实体注册表；自动维护必须覆盖两类引用。
  const { ASSASSINATION_SOURCES, ASSASSINATION_FRAME_OVERRIDES } = require('../src/frame-acquisition-routing')
  for (const variables of [...Object.values(ASSASSINATION_SOURCES), ...Object.values(ASSASSINATION_FRAME_OVERRIDES)]) {
    if (variables.enemyCanonical) names.add(variables.enemyCanonical)
  }
  names.add('Raptor')
  names.add('Ropalolyst')
  names.add('Captain Vor and Lieutenant Lech Kril')
  return [...names].sort((a, b) => a.localeCompare(b, 'en'))
}
async function download(url, target) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()))
}
async function ensureSources(options = {}) {
  const files = { languagesEn: path.join(CACHE, 'languages.en.json'), languagesZh: path.join(CACHE, 'languages.zh.json'), exportEnemies: path.join(CACHE, 'ExportEnemies.json') }
  for (const [name, file] of Object.entries(files)) if (options.refresh || !fs.existsSync(file)) await download(SOURCES[name], file)
  return files
}
function buildSnapshot(files) {
  const english = JSON.parse(fs.readFileSync(files.languagesEn, 'utf8'))
  const chinese = JSON.parse(fs.readFileSync(files.languagesZh, 'utf8'))
  const exported = JSON.parse(fs.readFileSync(files.exportEnemies, 'utf8'))
  const keysByEnglish = new Map()
  for (const [key, value] of Object.entries(english)) {
    const normalized = normalize(value)
    if (normalized) (keysByEnglish.get(normalized) || keysByEnglish.set(normalized, []).get(normalized)).push(key)
  }
  const avatarPathsByNameKey = new Map()
  for (const [internalPath, avatar] of Object.entries(exported.avatars || {})) if (avatar.name) (avatarPathsByNameKey.get(avatar.name) || avatarPathsByNameKey.set(avatar.name, []).get(avatar.name)).push({ internalPath, faction: avatar.faction || null })
  const entities = referencedEnemies().map(canonical => {
    const composite = AUDITED_COMPOSITES[canonical]
    if (composite) return { canonical, lookupCanonical: canonical, kind: composite.kind, status: 'official-zh-audited-composite', displayName: composite.displayName, languageKey: null, languageKeys: composite.languageKeys, internalPaths: [], factionCanonical: null, auditRule: composite.rule, candidates: [] }
    const lookup = CANONICAL_BASE_OVERRIDES[canonical] || canonical
    let keys = keysByEnglish.get(normalize(lookup)) || []
    const override = KEY_OVERRIDES[canonical] || KEY_OVERRIDES[lookup]
    if (override) keys = [override]
    const structuralKeys = keys.filter(key => avatarPathsByNameKey.has(key))
    if (structuralKeys.length) keys = structuralKeys
    const candidates = keys.map(key => ({ key, displayName: cleanDisplay(chinese[key]), references: avatarPathsByNameKey.get(key) || [] })).filter(item => item.displayName)
    const uniqueNames = [...new Set(candidates.map(item => item.displayName))]
    const selected = uniqueNames.length === 1 ? candidates.find(item => item.displayName === uniqueNames[0]) : null
    return {
      canonical,
      lookupCanonical: lookup,
      kind: 'enemy',
      status: selected ? 'official-zh' : candidates.length ? 'ambiguous-review-required' : 'official-zh-unavailable',
      displayName: selected?.displayName || '',
      languageKey: selected?.key || null,
      internalPaths: selected?.references.map(item => item.internalPath) || [],
      factionCanonical: selected?.references.map(item => item.faction).find(Boolean) || null,
      candidates: selected ? [] : candidates
    }
  })
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    provenance: {
      authority: 'DE Languages.bin official localization strings',
      transport: 'calamity-inc automated Languages.bin extraction; public-export-plus structural mirror',
      languageCommit: LANGUAGE_COMMIT,
      languageVersion: '43.0.8',
      sources: Object.fromEntries(Object.entries(files).map(([name, file]) => [name, { url: SOURCES[name], sha256: sha256(file) }]))
    },
    counts: {
      referenced: entities.length,
      officialZh: entities.filter(item => item.status === 'official-zh').length,
      auditedComposite: entities.filter(item => item.status === 'official-zh-audited-composite').length,
      reviewed: entities.filter(item => ['official-zh','official-zh-audited-composite','official-zh-unavailable'].includes(item.status)).length,
      ambiguous: entities.filter(item => item.status === 'ambiguous-review-required').length,
      unavailable: entities.filter(item => item.status === 'official-zh-unavailable').length
    },
    entities
  }
}
async function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  const files = await ensureSources({ refresh: argv.includes('--refresh') })
  const snapshot = buildSnapshot(files)
  const next = serialize(snapshot)
  const old = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null
  if (check) {
    if (old !== next) throw new Error('官方本地化快照已漂移')
    console.log(`官方本地化快照无漂移：${snapshot.counts.officialZh}/${snapshot.counts.referenced} 个敌人具有官方简中`)
    return snapshot
  }
  fs.mkdirSync(path.dirname(TARGET), { recursive: true })
  fs.writeFileSync(TARGET, next)
  console.log(`官方本地化快照：${snapshot.counts.officialZh}/${snapshot.counts.referenced}；歧义 ${snapshot.counts.ambiguous}；官方简中缺失 ${snapshot.counts.unavailable}`)
  return snapshot
}
if (require.main === module) run().catch(error => { console.error(error.stack || error); process.exit(1) })
module.exports = { SOURCES, LANGUAGE_COMMIT, KEY_OVERRIDES, CANONICAL_BASE_OVERRIDES, AUDITED_COMPOSITES, referencedEnemies, buildSnapshot, run }
