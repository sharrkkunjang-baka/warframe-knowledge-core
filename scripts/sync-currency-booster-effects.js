'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { ReadonlyWikiDatabase, resolveWikiDatabase } = require('../src/wiki-db')

const ROOT = path.resolve(__dirname, '..')
const CURRENCY_ROOT = path.join(ROOT, 'knowledge', 'curreicies')
const INDEX = path.join(CURRENCY_ROOT, 'categories.json')
const STATUS = Object.freeze({
  affected: 'affected',
  unaffected: 'unaffected',
  unknown: 'unknown'
})

function section(page, title) {
  return page?.sections?.find(item => item.title === title) || null
}

function mentions(text, canonical) {
  const escaped = String(canonical).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[•|\\n])\\s*${escaped}\\s*(?=$|[•|\\n])`, 'im').test(String(text || ''))
}

function classify(canonical, affectedSection, unaffectedSection) {
  const affected = mentions(affectedSection?.text, canonical)
  const unaffected = mentions(unaffectedSection?.text, canonical)
  if (affected === unaffected) return STATUS.unknown
  return affected ? STATUS.affected : STATUS.unaffected
}

function evidence(page, status, affectedTitle, unaffectedTitle) {
  if (status === STATUS.unknown) return []
  const title = status === STATUS.affected ? affectedTitle : unaffectedTitle
  const found = section(page, title)
  return [{
    source: 'local-wiki-sqlite',
    pageTitle: page.title,
    revisionId: page.revisionId,
    section: title,
    excerpt: found?.text || ''
  }]
}

function buildMetadata(canonical, amountPage, chancePage) {
  const amountAffectedTitle = 'List of Resources affected by Resource Booster'
  const amountUnaffectedTitle = 'List of Resources not affected by Resource Booster'
  const chanceAffectedTitle = 'List of Resources affected by Resource Drop Chance Booster'
  const chanceUnaffectedTitle = 'List of Resources not affected by Resource Drop Chance Booster'
  const amountAffected = section(amountPage, amountAffectedTitle)
  const amountUnaffected = section(amountPage, amountUnaffectedTitle)
  const chanceAffected = section(chancePage, chanceAffectedTitle)
  const chanceUnaffected = section(chancePage, chanceUnaffectedTitle)
  const resourceAmount = classify(canonical, amountAffected, amountUnaffected)
  const resourceDropChance = classify(canonical, chanceAffected, chanceUnaffected)
  return {
    resourceAmount,
    resourceDropChance,
    exchangeCost: STATUS.unaffected,
    scope: 'in-mission-pickups-only',
    evidence: [
      ...evidence(amountPage, resourceAmount, amountAffectedTitle, amountUnaffectedTitle),
      ...evidence(chancePage, resourceDropChance, chanceAffectedTitle, chanceUnaffectedTitle)
    ]
  }
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function buildPlan(options = {}) {
  const db = new ReadonlyWikiDatabase(resolveWikiDatabase(options.db))
  try {
    const amountPage = db.getPage('Resource Booster')
    const chancePage = db.getPage('Resource Drop Chance Booster')
    if (!amountPage || !chancePage) throw new Error('本地 Wiki 缺少资源加成页面')
    const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'))
    const files = []
    const counts = {
      currencies: 0,
      resourceAmount: { affected: 0, unaffected: 0, unknown: 0 },
      resourceDropChance: { affected: 0, unaffected: 0, unknown: 0 }
    }
    for (const item of index.variables || []) {
      const file = path.join(CURRENCY_ROOT, ...String(item.file).split('/'))
      const current = JSON.parse(fs.readFileSync(file, 'utf8'))
      const boosterEffects = buildMetadata(current.canonical, amountPage, chancePage)
      const next = { ...current, boosterEffects }
      counts.currencies++
      counts.resourceAmount[boosterEffects.resourceAmount]++
      counts.resourceDropChance[boosterEffects.resourceDropChance]++
      files.push({ file, current: serialize(current), content: serialize(next) })
    }
    return { files, counts, revisions: { resourceBooster: amountPage.revisionId, resourceDropChanceBooster: chancePage.revisionId } }
  } finally {
    db.close()
  }
}

function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  const dbIndex = argv.indexOf('--db')
  const plan = buildPlan({ db: dbIndex >= 0 ? argv[dbIndex + 1] : path.join(ROOT, '.cache', 'warframe-wiki.sqlite') })
  const changed = plan.files.filter(item => item.current !== item.content)
  if (!check) for (const item of changed) fs.writeFileSync(item.file, item.content, 'utf8')
  console.log(JSON.stringify({ ...plan.counts, revisions: plan.revisions, changed: changed.length }))
  if (check && changed.length) throw new Error(`货币加成元数据漂移：${changed.length} 个文件`)
  return plan
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    console.error(error.stack || error)
    process.exit(1)
  }
}

module.exports = { STATUS, mentions, classify, buildMetadata, buildPlan, run }
