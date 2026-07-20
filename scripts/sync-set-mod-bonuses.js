'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const MOD_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'mod')
const OFFICIAL_ZH = require(path.join(ROOT, '.cache', 'official-localization', 'languages.zh.json'))

const FAMILIES = Object.freeze({
  'Aero Set': {
    languageKey: '/Lotus/Language/Mods/HawkSetPassiveDesc',
    officialTemplate: '在飞身瞄准时对敌人造成伤害后，落地时将使最多 5 名敌人进入|val| 秒的睡眠状态。',
    detail: '在飞身瞄准时对敌人造成伤害后，落地时将使最多 5 名敌人进入 3 秒的睡眠状态。',
    representative: 'Aero Agility'
  },
  "Amar's Set": {
    languageKey: '/Lotus/Language/Upgrades/AmarSetBonus',
    officialTemplate: '使用重击时可瞬移至在 |RANGE| 米内目标的身边。',
    detail: '使用重击时可瞬移至在 10 米内目标的身边。',
    representative: "Amar's Anguish"
  },
  'Augur Set': {
    languageKey: '/Lotus/Language/Upgrades/WarframeAugurSetDesc',
    officialTemplate: '|STAT1|% 用在技能上的能量将转化成护盾。',
    detail: '40% 用在技能上的能量将转化成护盾。',
    representative: 'Augur Accord'
  },
  "Boreal's Set": {
    languageKey: '/Lotus/Language/Upgrades/BorealSetBonus',
    officialTemplate: '在空中时减少 |val|% 受到的伤害。',
    detail: '在空中时减少 20% 受到的伤害。',
    representative: "Boreal's Anguish"
  },
  'Carnis Set': {
    languageKey: '/Lotus/Language/Upgrades/HeavyAttackMovementBonusDesc',
    officialTemplate: '通过重击击杀敌人可以使敌人对战甲的精准度降低 |STAT1|%，并免疫异常状态，持续 |STAT2| 秒',
    detail: '通过重击击杀敌人可以使敌人对战甲的精准度降低 10%，并免疫异常状态，持续 2 秒。',
    representative: 'Carnis Carapace'
  },
  'Gladiator Set': {
    languageKey: '/Lotus/Language/Upgrades/WarframeGladiatorSetDesc',
    officialTemplate: '连击倍率可叠加 |STAT1|% 近战暴击几率',
    detail: '连击倍率可叠加 10% 近战暴击几率。',
    representative: 'Gladiator Aegis'
  },
  'Hunter Set': {
    languageKey: '/Lotus/Language/Upgrades/WarframeHunterSetDesc',
    officialTemplate: '同伴对受到 <DT_SLASH_COLOR>切割状态影响的敌人造成 +|STAT1|% 伤害。',
    detail: '同伴对受到切割状态影响的敌人造成 +25% 伤害。',
    representative: 'Hunter Adrenaline'
  },
  'Jugulus Set': {
    languageKey: '/Lotus/Language/Upgrades/BonebladeSetDesc',
    officialTemplate: '震地攻击产生卷须，来抽打 |STAT1| 米内的敌人，击晕敌人 |STAT3| 秒，并造成 |STAT2| <DT_PUNCTURE_COLOR>穿刺伤害。冷却时间：|STAT4| 秒',
    detail: '震地攻击产生卷须来抽打 3 米内的敌人，击晕他们并造成 25 点穿刺伤害。冷却时间：12 秒。',
    representative: 'Jugulus Barbs'
  },
  'Mecha Set': {
    languageKey: '/Lotus/Language/Upgrades/MechaModSetBonus',
    officialTemplate: '每隔 |COOLDOWN| 秒同伴将会标记一名目标，持续 |DURATION| 秒。击杀被标记的目标会将其身上所受的状态作用于 |RANGE| 米范围内的所有敌人。',
    detail: '每隔 60 秒同伴将会标记一名目标，持续 3 秒。击杀被标记的目标会将其身上所受的状态作用于 7.5 米范围内的所有敌人。',
    representative: 'Mecha Empowered'
  },
  'Motus Set': {
    languageKey: '/Lotus/Language/Mods/RaptorSetModPassiveDesc',
    officialTemplate: '在空中时有 |val|% 几率免疫击倒效果。',
    detail: '在空中时有 33% 几率免疫击倒效果。',
    representative: 'Motus Impact'
  },
  "Nira's Set": {
    languageKey: '/Lotus/Language/Upgrades/NiraSetBonus',
    officialTemplate: '增加 |val|% 震地攻击伤害。',
    detail: '增加 100% 震地攻击伤害。',
    representative: "Nira's Anguish"
  },
  'Proton Set': {
    languageKey: '/Lotus/Language/Mods/SpiderSetModPassiveDesc',
    officialTemplate: '壁面攀附期间获得 |val|% 伤害减免',
    detail: '壁面攀附期间获得 17% 伤害减免。',
    representative: 'Proton Jet'
  },
  'Sacrificial Set': {
    languageKey: '/Lotus/Language/Mods/WarframeUmbraModSetDesc',
    officialTemplate: '增强这个组合中的 MOD。',
    detail: '增强这个组合中的 MOD。',
    representative: 'Sacrificial Pressure'
  },
  'Saxum Set': {
    languageKey: '/Lotus/Language/Upgrades/LiftedEnemiesExplodeImpactDamageDesc',
    officialTemplate: '击飞的敌人在死亡时爆炸，对 |STAT2| 米范围内的敌人造成最大生命值的 |STAT1|% 的 <DT_IMPACT_COLOR>冲击伤害。\r\n冷却时间：|DURATION| 秒',
    detail: '击飞的敌人在死亡时爆炸，对 4 米范围内的敌人造成最大生命值 10% 的冲击伤害。冷却时间：6 秒。',
    representative: 'Saxum Carapace'
  },
  'Strain Set': {
    languageKey: '/Lotus/Language/Upgrades/StrainModSetBonus',
    officialTemplate: '在 |COOLDOWN| 秒内生长至多 |COUNT| 颗包囊，包囊每 |DELAY| 秒会爆裂并生出一只蛆虫。',
    detail: '在 6 秒内生长至多 2 颗包囊，包囊每 25 秒会爆裂并生出一只蛆虫。',
    representative: 'Strain Consume'
  },
  'Synth Set': {
    languageKey: '/Lotus/Language/Upgrades/SynthModSetBonus',
    officialTemplate: '收起主要武器/次要武器时，每秒自动装填 |val|% 的弹匣。',
    detail: '收起主要武器/次要武器时，每秒自动装填 5% 的弹匣。',
    representative: 'Synth Deconstruct'
  },
  'Tek Set': {
    languageKey: '/Lotus/Language/Upgrades/TekModSetBonus',
    officialTemplate: '每 |COOLDOWN| 秒创造一个半径 |RADIUS| 米的区域并造成每秒 |DAMAGE| 的伤害。',
    detail: '每 60 秒创造一个半径 3 米的区域并对敌人造成每秒 50 点伤害。',
    representative: 'Tek Assault'
  },
  'Umbral Set': {
    languageKey: '/Lotus/Language/Mods/WarframeUmbraModSetDesc',
    officialTemplate: '增强这个组合中的 MOD。',
    detail: '增强这个组合中的 MOD。',
    representative: 'Umbral Fiber'
  },
  'Vigilante Set': {
    languageKey: '/Lotus/Language/Upgrades/WarframeVigilanteSetDesc',
    officialTemplate: '|STAT1|% 的几率强化主要武器的暴击。',
    detail: '5% 的几率强化主要武器的暴击。',
    representative: 'Vigilante Armaments'
  }
})

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name)
    return entry.isDirectory() ? files(full) : entry.name.endsWith('.json') ? [full] : []
  })
}

function build(checkOnly = false) {
  for (const [family, definition] of Object.entries(FAMILIES)) {
    if (OFFICIAL_ZH[definition.languageKey] !== definition.officialTemplate) {
      throw new Error(`${family}: 官方简中模板漂移或缺失（${definition.languageKey}）`)
    }
  }
  const changed = []
  const coveredFamilies = new Set()
  let members = 0
  for (const file of files(MOD_ROOT)) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    const entries = Array.isArray(value) ? value : [value]
    let dirty = false
    for (const entry of entries) {
      if (!entry?.subject?.categoryRefs?.includes('setmod') || entry.reviewStatus !== 'approved') continue
      const definition = FAMILIES[entry.setFamily]
      if (!definition) throw new Error(`${entry.subject.canonical}: 未登记组合家族 ${entry.setFamily || '(empty)'}`)
      coveredFamilies.add(entry.setFamily)
      members++
      const evidence = {
        reviewStatus: 'approved',
        source: 'DE Languages.bin + official full English Mod card',
        languageKey: definition.languageKey,
        representativeCanonical: definition.representative
      }
      if (JSON.stringify(entry.setBonusDetails) !== JSON.stringify([definition.detail])) {
        entry.setBonusDetails = [definition.detail]
        dirty = true
      }
      if (entry.setBonusReviewStatus !== 'approved') {
        entry.setBonusReviewStatus = 'approved'
        dirty = true
      }
      if (JSON.stringify(entry.setBonusEvidence) !== JSON.stringify(evidence)) {
        entry.setBonusEvidence = evidence
        dirty = true
      }
    }
    if (dirty) {
      changed.push(path.relative(ROOT, file))
      if (!checkOnly) fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    }
  }
  if (coveredFamilies.size !== Object.keys(FAMILIES).length) throw new Error(`组合家族覆盖不完整：${coveredFamilies.size}/${Object.keys(FAMILIES).length}`)
  return { families: coveredFamilies.size, members, changed: changed.length }
}

if (require.main === module) {
  try {
    const report = build(process.argv.includes('--check'))
    console.log(JSON.stringify(report))
    if (process.argv.includes('--check') && report.changed) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { FAMILIES, build }
