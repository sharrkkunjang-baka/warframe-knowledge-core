'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { auditModCardFaceLabels } = require('../src/mod-card-face-label')

const ROOT = path.resolve(__dirname, '..')
const OFFICIAL = path.join(ROOT, 'knowledge', 'categories', 'official.json')
const OUTPUT = path.join(ROOT, 'generated', 'mod-card-face-label-audit.json')

function build(generatedAt = new Date().toISOString()) {
  const official = JSON.parse(fs.readFileSync(OFFICIAL, 'utf8'))
  const mods = official.mods || []
  const audit = auditModCardFaceLabels(mods)
  const exchangeGameplayOnly = []
  const { createKnowledgeCore } = require('../src')
  const core = createKnowledgeCore({ approvedOnly: false })
  for (const mod of mods) {
    const card = core.getAcquisitionCard(mod.displayName || mod.canonical)
    if (!card || card.kind !== 'mod') continue
    const acquisition = core.getAcquisition(mod.canonical)
    const exchangeMethods = (acquisition?.structuredMethods || [])
      .filter(method => method.reviewStatus !== 'review-required')
      .filter(method => ['vendor-exchange', 'vendor-or-syndicate-exchange', 'syndicate-exchange', 'syndicate-exchange-group'].includes(method.type))
    if (!exchangeMethods.length) continue
    if (card.sections.exchange.length) continue
    if (!card.sections.other.length && !card.relatedItems?.length) continue
    exchangeGameplayOnly.push({
      canonical: mod.canonical,
      displayName: mod.displayName,
      uniqueName: mod.uniqueName,
      methodTypes: exchangeMethods.map(method => method.type),
      reviewStatuses: exchangeMethods.map(method => method.reviewStatus)
    })
  }
  return {
    schemaVersion: 1,
    generatedAt,
    modCount: mods.length,
    ...audit,
    exchangeGameplayOnlyCount: exchangeGameplayOnly.length,
    exchangeGameplayOnly
  }
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  const current = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : null
  const report = build(check && current?.generatedAt ? current.generatedAt : undefined)
  if (check && serialize(current) !== serialize(report)) throw new Error('Mod 卡面类型审计已漂移')
  if (!check) fs.writeFileSync(OUTPUT, serialize(report), 'utf8')
  console.log(JSON.stringify({
    parazon: report.counts.parazon,
    stance: report.counts.stance,
    railjack: report.counts.railjack,
    needsTypeSlot: report.counts.needsTypeSlot,
    exchangeGameplayOnly: report.exchangeGameplayOnlyCount
  }))
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
