'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createKnowledgeCore } = require('../src')
const { renderStructuredMethod } = require('../src/acquisition-protocol')
const {
  resolveModCardFaceLabel,
  modNeedsTypeSlotLocalization,
  auditModCardFaceLabels
} = require('../src/mod-card-face-label')
const { isRequiemModEntry } = require('../src/requiem-mod-usage')

const ROOT = path.resolve(__dirname, '..')
const OFFICIAL = path.join(ROOT, 'knowledge', 'categories', 'official.json')
const OUTPUT = path.join(ROOT, 'generated', 'mod-card-systematic-audit.json')

const ENGLISH_TYPE_PATTERN = /\b(?:PARAZON|Railjack|Stance|Bayonet|Rifle|Pistol|Shotgun|Melee|Warframe|Aura|Archwing|Arch-Gun|Archgun|Archmelee|Plexus|Crewship)\b/i
const QUANTITY_WORD_PATTERN = /(?:^|[\s，,；;：:])(?:1个|一个)(?:$|[\s，,；;])/
const EXCHANGE_TYPES = new Set(['vendor-exchange', 'vendor-or-syndicate-exchange', 'syndicate-exchange', 'syndicate-exchange-group'])

function structuredHeadlines(acquisition) {
  return new Set((acquisition?.structuredMethods || [])
    .filter(method => method.reviewStatus !== 'review-required')
    .map(method => renderStructuredMethod(method))
    .filter(Boolean))
}

function sectionTexts(card) {
  return [...(card.sections.exchange || []), ...(card.sections.enemy || []), ...(card.sections.acquisition || []), ...(card.sections.other || [])]
}

function build(generatedAt = new Date().toISOString()) {
  const official = JSON.parse(fs.readFileSync(OFFICIAL, 'utf8'))
  const mods = official.mods || []
  const core = createKnowledgeCore({ approvedOnly: false })
  const faceAudit = auditModCardFaceLabels(mods)

  const issues = {
    untranslatedFaceLabel: [],
    wrongStanceCompat: [],
    exchangeInGameplayOnly: [],
    structuredAcquisitionOnlyInGameplay: [],
    strayQuantityWord: [],
    missingExchangeSection: [],
    englishLeakInSections: [],
    requiemMissingPassword: [],
    adversaryDropWording: []
  }

  for (const mod of mods) {
    const card = core.getAcquisitionCard(mod.displayName || mod.canonical)
    if (!card || card.kind !== 'mod') continue

    const faceLabel = resolveModCardFaceLabel(mod)
    const needsLocalization = modNeedsTypeSlotLocalization(mod)
    if (needsLocalization && ENGLISH_TYPE_PATTERN.test(faceLabel || '')) {
      issues.untranslatedFaceLabel.push({
        canonical: mod.canonical,
        displayName: mod.displayName,
        type: mod.type,
        compatName: mod.compatName,
        faceLabel
      })
    }
    if (mod.type === 'Stance Mod' && mod.compatName && faceLabel === '刺刀') {
      issues.wrongStanceCompat.push({ canonical: mod.canonical, compatName: mod.compatName, faceLabel })
    }

    const acquisition = core.getAcquisition(mod.canonical)
    const exchangeMethods = (acquisition?.structuredMethods || [])
      .filter(method => method.reviewStatus !== 'review-required')
      .filter(method => EXCHANGE_TYPES.has(method.type))
    if (exchangeMethods.length && !card.sections.exchange.length) {
      issues.missingExchangeSection.push({
        canonical: mod.canonical,
        displayName: mod.displayName,
        methodTypes: exchangeMethods.map(method => method.type),
        rendered: exchangeMethods.map(method => renderStructuredMethod(method)).filter(Boolean)
      })
      if ((card.sections.other?.length || card.relatedItems?.length)) {
        issues.exchangeInGameplayOnly.push({
          canonical: mod.canonical,
          displayName: mod.displayName,
          methodTypes: exchangeMethods.map(method => method.type)
        })
      }
    }

    const headlines = structuredHeadlines(acquisition)
    const sectionBlob = sectionTexts(card).join('\n')
    const entry = core.getAcquisition(mod.canonical)?.entry

    for (const line of [...(card.sections.other || []), ...(card.relatedItems || []).map(item => item.text || '')]) {
      if (!line) continue
      for (const headline of headlines) {
        if (!line.includes(headline)) continue
        if (sectionBlob.includes(headline)) continue
        issues.structuredAcquisitionOnlyInGameplay.push({
          canonical: mod.canonical,
          headline,
          line: String(line).slice(0, 120)
        })
        break
      }
      if (QUANTITY_WORD_PATTERN.test(line)) {
        issues.strayQuantityWord.push({ canonical: mod.canonical, section: 'other/related', line: String(line).slice(0, 120) })
      }
      if (/[A-Za-z]{4,}/.test(line) && !/Mod|Prime|Archwing|Steel Path|C轮|A轮|B轮|T\d/.test(line)) {
        if (/\b(?:PARAZON|Railjack|Bayonet|Standing|Rotation|Spy|Vault|Bounty)\b/i.test(line)) {
          issues.englishLeakInSections.push({ canonical: mod.canonical, line: String(line).slice(0, 120) })
        }
      }
    }

    for (const group of ['exchange', 'enemy', 'acquisition']) {
      for (const line of card.sections[group] || []) {
        if (QUANTITY_WORD_PATTERN.test(line)) {
          issues.strayQuantityWord.push({ canonical: mod.canonical, section: group, line: String(line).slice(0, 120) })
        }
      }
    }

    if (isRequiemModEntry(entry)) {
      const lines = card.modInfo?.descriptionLines || []
      if (!lines.some(line => /密码/.test(line))) {
        issues.requiemMissingPassword.push({ canonical: mod.canonical, descriptionLines: lines })
      }
    }
    if (mod.canonical === 'Oull') {
      const enemyLine = (card.sections.enemy || []).join('\n')
      if (!/赤毒玄骸或姐妹.*25%/.test(enemyLine)) {
        issues.adversaryDropWording.push({ canonical: 'Oull', enemyLine })
      }
      const desc = (card.modInfo?.descriptionLines || []).join('\n')
      if (!/任意密码/.test(desc)) {
        issues.adversaryDropWording.push({ canonical: 'Oull', descriptionLines: card.modInfo?.descriptionLines })
      }
    }
  }

  const counts = Object.fromEntries(Object.entries(issues).map(([key, list]) => [key, list.length]))
  const fixedCategories = {
    parazonFaceLabels: faceAudit.counts.parazon,
    stanceFaceLabels: faceAudit.counts.stance,
    railjackFaceLabels: faceAudit.counts.railjack,
    archwingFaceLabels: mods.filter(mod => mod.type === 'Archwing Mod').length,
    exchangeGameplayOnlyBeforeFix: 0
  }

  return {
    schemaVersion: 1,
    generatedAt,
    modCount: mods.length,
    scannedCards: mods.filter(mod => {
      const card = core.getAcquisitionCard(mod.displayName || mod.canonical)
      return card && card.kind === 'mod'
    }).length,
    fixedCategories,
    counts,
    failures: Object.values(counts).reduce((sum, value) => sum + value, 0),
    issues: Object.fromEntries(Object.entries(issues).map(([key, list]) => [key, list.slice(0, 20)])),
    issueTotals: counts
  }
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  const current = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : null
  const report = build(check && current?.generatedAt ? current.generatedAt : undefined)
  if (!check) fs.writeFileSync(OUTPUT, serialize(report), 'utf8')
  if (check && current && serialize({ ...current, generatedAt: report.generatedAt }) !== serialize(report)) {
    throw new Error('Mod 卡系统性审计已漂移')
  }
  if (report.failures) {
    console.error(JSON.stringify({ failures: report.failures, counts: report.counts }, null, 2))
    if (!argv.includes('--report-only')) throw new Error(`Mod 卡系统性审计失败：${report.failures} 项`)
  }
  console.log(JSON.stringify({ modCount: report.modCount, scannedCards: report.scannedCards, counts: report.counts, failures: report.failures }))
  return report
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    console.error(error.stack || error)
    process.exit(1)
  }
}

module.exports = { build, run }
