'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { renderGameText } = require('../src/game-text')
const ROOT = path.resolve(__dirname, '..')
const CACHE = path.join(ROOT, 'cache')
const WEAPONS = path.join(CACHE, 'warframe-export-weapons.json')
const RECIPES = path.join(CACHE, 'warframe-export-recipes.json')
const LANG_ZH = path.join(ROOT, '.cache', 'official-localization', 'languages.zh.json')
const LANG_EN = path.join(ROOT, '.cache', 'official-localization', 'languages.en.json')
const OUTPUT = path.join(ROOT, 'knowledge', 'generated', 'official-weapons.json')
const SOURCES = path.join(ROOT, 'generated', 'official-weapon-sources.json')
const URLS = Object.freeze({ weapons: 'https://browse.wf/warframe-public-export-plus/ExportWeapons.json', recipes: 'https://browse.wf/warframe-public-export-plus/ExportRecipes.json', localization: 'DE Languages.bin official localization strings' })
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }
function serialize(value) { return JSON.stringify(value, null, 2) + '\n' }
function classify(uniqueName, weapon) {
  const text = `${uniqueName} ${weapon.parentName || ''}`
  if (/Powersuits|Exalted|Ability|NPC|Enemies|SentientWeapon|Operator/i.test(text)) return { include: false, reason: 'exalted-enemy-or-internal' }
  if (/Zaw|Modular|Kitgun|Amp|OperatorAmp/i.test(text)) return { include: false, reason: 'modular-component-or-assembled-instance' }
  if (weapon.codexSecret && !weapon.masteryReq && !weapon.omegaAttenuation && !weapon.totalDamage) return { include: false, reason: 'internal-placeholder' }
  if (/Archwing.*Melee|ArchMelee/i.test(text)) return { include: true, equipmentType: 'arch-melee' }
  if (/Archwing|SpaceGun|ArchGun/i.test(text)) return { include: true, equipmentType: 'arch-gun' }
  if (/Sentinel|Companion|Pet/i.test(text)) return { include: true, equipmentType: 'companion' }
  if (/Melee|Sword|Blade|Scythe|Hammer|Staff|Polearm|Fist|Claw|Glaive|Dagger|Tonfa|Nikana|Whip/i.test(text)) return { include: true, equipmentType: 'melee' }
  if (/Pistol|Secondary|Akimbo|Thrown/i.test(text)) return { include: true, equipmentType: 'secondary' }
  return { include: true, equipmentType: 'primary' }
}
function attackClassification(weapon) {
  const modes = Object.values(weapon.fireModes || {}).length ? Object.values(weapon.fireModes) : [weapon]
  return {
    modes: modes.map(mode => ({ trigger: mode.trigger || null, projectileSpeed: Number.isFinite(mode.projectileSpeed) ? mode.projectileSpeed : null, totalDamage: Number(mode.totalDamage || 0), range: Number.isFinite(mode.range) ? mode.range : null })),
    hitscan: modes.some(mode => mode.projectileSpeed === Infinity || mode.hitscan === true) ? true : modes.some(mode => Number.isFinite(mode.projectileSpeed) && mode.projectileSpeed > 0) ? false : 'unknown',
    projectile: modes.some(mode => Number.isFinite(mode.projectileSpeed) && mode.projectileSpeed > 0) ? true : 'unknown',
    aoe: modes.some(mode => Number(mode.radialDamage || 0) > 0 || Number(mode.radius || 0) > 0) ? true : 'unknown',
    punchThrough: Number.isFinite(weapon.punchThrough) ? weapon.punchThrough : 'unknown', lockOn: 'review-required', tracking: 'review-required', medium: 'review-required'
  }
}
function build(generatedAt = new Date().toISOString()) {
  const weapons = read(WEAPONS), zh = read(LANG_ZH), en = read(LANG_EN), included = [], excluded = []
  for (const [uniqueName, weapon] of Object.entries(weapons)) {
    const boundary = classify(uniqueName, weapon)
    const canonical = en[weapon.name] || weapon.name || uniqueName
    const displayName = zh[weapon.name] || ''
    const descriptionCanonical = renderGameText(en[weapon.description] || '')
    const descriptionDisplay = renderGameText(zh[weapon.description] || '')
    const identity = { uniqueName, canonical, displayName: displayName || canonical, nameLanguageKey: weapon.name || null, descriptionLanguageKey: weapon.description || null, description: { canonical: descriptionCanonical, display: descriptionDisplay, localizationStatus: descriptionDisplay ? 'official-zh' : 'official-zh-unavailable' }, localizationStatus: displayName ? 'official-zh' : 'official-zh-unavailable' }
    if (!boundary.include) { excluded.push({ ...identity, exclusionReason: boundary.reason }); continue }
    included.push({ ...identity, equipmentType: boundary.equipmentType, omegaAttenuation: Number.isFinite(weapon.omegaAttenuation) ? weapon.omegaAttenuation : null, disposition: Number.isFinite(weapon.disposition) ? weapon.disposition : null, masteryReq: weapon.masteryReq ?? null, productCategory: weapon.productCategory || null, attackClassification: attackClassification(weapon), classification: { categoryRefs: [`weapon.${boundary.equipmentType}`, ...(/Kuva|Lich/i.test(`${canonical} ${uniqueName}`) ? ['weapon.kuva'] : []), ...(/Tenet|Sister/i.test(`${canonical} ${uniqueName}`) ? ['weapon.tenet'] : [])] }, sourceFields: { identity: 'ExportWeapons', localization: displayName ? 'Languages.bin/zh' : 'missing', stats: 'ExportWeapons' }, status: displayName && Number.isFinite(weapon.omegaAttenuation) ? 'identity-complete' : 'review-required' })
  }
  const officialEventWeapons = Object.freeze({
    '/Lotus/Language/Weapons/TnoOctaMiniGunName': { uniqueName: '/Lotus/Weapons/Sentients/SentOctaMiniGun/SentOctaMiniGun', equipmentType: 'primary', acquisition: { type: 'limited-event-reward', eventCanonical: 'TennoCon 2026', eventDisplayName: 'TennoCon 2026', startAt: '2026-07-11T15:00:00Z', endAt: '2026-07-11T20:30:00Z', availability: 'expired', sourceUrl: 'https://www.warframe.com/en/news/tennocon-2026-giveaways-and-digital-extras' } }
  })
  for (const [languageKey, supplement] of Object.entries(officialEventWeapons)) {
    if (included.some(item => item.nameLanguageKey === languageKey)) continue
    const displayName = zh[languageKey], canonical = en[languageKey]
    if (!displayName || !canonical) continue
    const descriptionLanguageKey = languageKey.replace(/Name$/, 'Desc'), descriptionCanonical = renderGameText(en[descriptionLanguageKey] || ''), descriptionDisplay = renderGameText(zh[descriptionLanguageKey] || '')
    included.push({ uniqueName: supplement.uniqueName, canonical, displayName, nameLanguageKey: languageKey, descriptionLanguageKey, description: { canonical: descriptionCanonical, display: descriptionDisplay, localizationStatus: descriptionDisplay ? 'official-zh' : 'official-zh-unavailable' }, localizationStatus: 'official-zh', equipmentType: supplement.equipmentType, omegaAttenuation: null, disposition: null, masteryReq: null, productCategory: 'LongGuns', attackClassification: { hitscan: 'unknown', projectile: 'unknown', aoe: 'unknown', punchThrough: 'unknown', lockOn: 'review-required', tracking: 'review-required', medium: 'review-required', modes: [] }, classification: { categoryRefs: [`weapon.${supplement.equipmentType}`, 'weapon.limited-event'] }, sourceFields: { identity: 'official-event-supplement', localization: 'Languages.bin/zh', stats: 'pending-ExportWeapons' }, acquisitionSupplement: supplement.acquisition, status: 'review-required' })
  }
  const languageOnlyWeapons = Object.entries(zh).filter(([key,value]) => /\/Language\/Weapons\/.+Name$/.test(key) && value === '哈尔武' && !included.some(item => item.nameLanguageKey === key) && !excluded.some(item => item.nameLanguageKey === key)).map(([key,value]) => ({ uniqueName: null, canonical: en[key] || value, displayName: value, nameLanguageKey: key, descriptionLanguageKey: key.replace(/Name$/, 'Desc'), localizationStatus: 'official-zh', equipmentType: null, omegaAttenuation: null, disposition: null, attackClassification: { hitscan: 'unknown', projectile: 'unknown', aoe: 'unknown', punchThrough: 'unknown', lockOn: 'review-required', tracking: 'review-required', medium: 'review-required', modes: [] }, classification: { categoryRefs: [] }, sourceFields: { identity: 'missing-from-ExportWeapons', localization: 'Languages.bin/zh', stats: 'missing' }, status: 'review-required', reviewReason: 'official-language-present-but-ExportWeapons-structure-missing' }))
  included.sort((a,b)=>String(a.uniqueName).localeCompare(String(b.uniqueName))); excluded.sort((a,b)=>a.uniqueName.localeCompare(b.uniqueName))
  const catalog = { schemaVersion: 1, generatedAt, counts: { included: included.length, excluded: excluded.length, reviewRequired: included.filter(x=>x.status==='review-required').length, languageOnly: languageOnlyWeapons.length }, weapons: included, languageOnlyWeapons, excludedWeapons: excluded }
  const sources = { schemaVersion: 1, generatedAt, authority: 'Digital Extremes Public Export and Languages.bin', urls: URLS, sha256: { weapons: sha(WEAPONS), recipes: sha(RECIPES), languagesZh: sha(LANG_ZH), languagesEn: sha(LANG_EN) }, files: { weapons: path.relative(ROOT, WEAPONS).replace(/\\/g,'/'), recipes: path.relative(ROOT, RECIPES).replace(/\\/g,'/'), languagesZh: path.relative(ROOT, LANG_ZH).replace(/\\/g,'/'), languagesEn: path.relative(ROOT, LANG_EN).replace(/\\/g,'/') }, policy: { included: 'player-equippable completed weapons', excluded: ['exalted-enemy-or-internal','modular-component-or-assembled-instance','internal-placeholder'], noThirdPartyFacts: true } }
  return { catalog, sources }
}
function run(argv=process.argv.slice(2)) { const check=argv.includes('--check'), current=fs.existsSync(OUTPUT)?read(OUTPUT):null, built=build(check&&current?.generatedAt?current.generatedAt:undefined); if(check){if(serialize(current)!==serialize(built.catalog)||serialize(fs.existsSync(SOURCES)?read(SOURCES):null)!==serialize(built.sources))throw new Error('官方武器目录已漂移');console.log(`官方武器目录无漂移：${built.catalog.counts.included} 项`);return built} fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});fs.writeFileSync(OUTPUT,serialize(built.catalog));fs.writeFileSync(SOURCES,serialize(built.sources));console.log(`已生成 ${built.catalog.counts.included} 个武器身份；排除 ${built.catalog.counts.excluded}`);return built }
if(require.main===module){try{run()}catch(e){console.error(e.stack||e);process.exit(1)}}
module.exports={URLS,classify,attackClassification,build,run}
