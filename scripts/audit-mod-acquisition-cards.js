'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { createKnowledgeCore } = require('../src')
const { nearDuplicateVisibleLines, renderStructuredMethod } = require('../src/acquisition-protocol')

const ROOT = path.resolve(__dirname, '..')
const OFFICIAL = path.join(ROOT, 'knowledge', 'categories', 'official.json')
const OUTPUT = path.join(ROOT, 'generated', 'mod-acquisition-card-audit.json')

function build(generatedAt = new Date().toISOString()) {
  const core = createKnowledgeCore({ approvedOnly: false })
  const official = JSON.parse(fs.readFileSync(OFFICIAL, 'utf8'))
  const reviewed = (official.mods || []).filter(item => item.status === 'complete')
  const failures = []
  let deduplicatedCards = 0
  let deduplicatedLines = 0
  for (const item of reviewed) {
    const result = core.getAcquisition(item.canonical)
    const card = core.getAcquisitionCard(item.canonical)
    if (!result || !card || card.identity?.uniqueName !== item.uniqueName) {
      failures.push({ canonical: item.canonical, uniqueName: item.uniqueName, reason: 'runtime-card-unreachable' })
      continue
    }
    let cardMerged = false
    for (const method of result.structuredMethods || []) {
      const headline = renderStructuredMethod(method, { registries: core })
      const redundant = method.requirements?.type === 'currency' &&
        /兑换/.test(headline || '') &&
        (method.requirementLines || []).some(line => /^在.+兑换，需要/.test(line))
      if (redundant) {
        deduplicatedLines++
        cardMerged = true
      }
    }
    if (cardMerged) deduplicatedCards++
    for (const text of Object.values(card.sections || {}).flat()) {
      const duplicate = nearDuplicateVisibleLines(String(text).split(/\r?\n/))
      if (duplicate.length) failures.push({
        canonical: item.canonical,
        uniqueName: item.uniqueName,
        reason: 'near-duplicate-visible-lines',
        duplicate
      })
    }
  }
  return {
    schemaVersion: 1,
    generatedAt,
    reviewedMods: reviewed.length,
    reachableCards: reviewed.length - failures.filter(item => item.reason === 'runtime-card-unreachable').length,
    deduplicatedCards,
    deduplicatedLines,
    failed: failures.length,
    failures
  }
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  const current = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : null
  const report = build(check && current?.generatedAt ? current.generatedAt : undefined)
  if (check && serialize(current) !== serialize(report)) throw new Error('Mod 获取卡语义去重审计已漂移')
  if (!check) fs.writeFileSync(OUTPUT, serialize(report), 'utf8')
  if (report.failed) throw new Error(`Mod 获取卡语义去重质量门失败：${report.failed}/${report.reviewedMods}`)
  console.log(JSON.stringify({ reviewedMods: report.reviewedMods, deduplicatedCards: report.deduplicatedCards, deduplicatedLines: report.deduplicatedLines, failed: report.failed }))
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
