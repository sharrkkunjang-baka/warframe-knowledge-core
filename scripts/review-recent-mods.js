'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const MOD_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'mod')
const REVIEWER = 'recent-mod-evidence-audit'
const IDENTITY_PATH = path.join(ROOT, 'knowledge', 'supplemental', 'current-mod-identities.json')

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n` }

function jsonFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return jsonFiles(target)
    return entry.isFile() && entry.name.endsWith('.json') ? [target] : []
  })
}

function methodsOf(entry) {
  return [
    ...(entry.modAcquisition?.generated?.wiki?.methods || []),
    ...(entry.modAcquisition?.generated?.officialDrops || []),
    ...(entry.modAcquisition?.manual?.methods || [])
  ]
}

function officialUniqueNameOf(entry) {
  return entry.officialUniqueName
    || entry.subject?.officialUniqueName
    || entry.modAcquisition?.generated?.identity?.officialUniqueName
    || null
}

function hasOfficialEvidence(entry) {
  const wiki = entry.modAcquisition?.generated?.wiki
  const officialDrops = entry.modAcquisition?.generated?.officialDrops || []
  const officialSource = (entry.sources || []).some(source =>
    /(?:wiki\.warframe\.com|warframe\.com)/i.test(source.url || '')
  )
  return Boolean(
    officialDrops.length
    || wiki?.wiki?.revisionId
    || (officialSource && (wiki?.evidence || []).some(evidence => evidence.provenance?.revisionId))
  )
}

function isReviewEligible(entry, expected) {
  if (!entry || !expected) return false
  if (entry.subject?.canonical !== expected.canonical) return false
  if (!/^\/Lotus\//.test(expected.uniqueName || '')) return false
  if (officialUniqueNameOf(entry) !== expected.uniqueName) return false
  if (entry.acquisitionStatus !== 'complete') return false
  const methods = methodsOf(entry)
  if (!methods.length || !hasOfficialEvidence(entry)) return false
  return methods.every(method =>
    method.reviewStatus === 'approved'
    || Boolean(method.provenance)
    || Boolean(method.sourceEntityId || method.npcId || method.factionId || method.locationId)
  )
}

function approve(entry, expected) {
  if (!isReviewEligible(entry, expected)) return null
  const methods = methodsOf(entry)
  entry.reviewStatus = 'approved'
  entry.reviewedBy = [...new Set([...(entry.reviewedBy || []), REVIEWER])]
  entry.modAcquisition ||= {}
  entry.modAcquisition.manual ||= { methods: [], methodRefs: [], overrides: {} }
  entry.modAcquisition.manual.reviewStatus = 'approved'
  entry.modAcquisition.manual.reviewedBy = [...new Set([...(entry.modAcquisition.manual.reviewedBy || []), REVIEWER])]
  for (const method of methods) {
    if (method.provenance || method.sourceEntityId || method.npcId || method.factionId || method.locationId) method.reviewStatus = 'approved'
  }
  return entry
}

function buildChanges(options = {}) {
  const expectedByCanonical = new Map(
    (() => {
      const ledger = JSON.parse(fs.readFileSync(options.identityPath || IDENTITY_PATH, 'utf8'))
      return [...ledger.items, ...(ledger.reviewCandidates || [])]
    })()
      .map(item => [item.canonical, item])
  )
  const targets = new Set(expectedByCanonical.keys())
  const seen = new Set()
  const eligible = new Set()
  const changes = []
  for (const file of jsonFiles(options.modRoot || MOD_ROOT)) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'))
    const entries = Array.isArray(value) ? value : [value]
    let touched = false
    for (const entry of entries) {
      const canonical = entry?.subject?.canonical
      if (!targets.has(canonical)) continue
      seen.add(canonical)
      const expected = expectedByCanonical.get(canonical)
      if (!isReviewEligible(entry, expected)) continue
      eligible.add(canonical)
      if (entry.reviewStatus === 'approved' && entry.modAcquisition?.manual?.reviewStatus === 'approved') continue
      const before = serialize(entry)
      approve(entry, expected)
      touched ||= before !== serialize(entry)
    }
    if (touched) changes.push({ file, value: Array.isArray(value) ? entries : entries[0] })
  }
  return { targets, seen, eligible, changes }
}

function run(argv = process.argv.slice(2)) {
  const result = buildChanges()
  const missing = [...result.targets].filter(item => !result.seen.has(item))
  if (missing.length) throw new Error(`近期 Mod 审核缺少运行时源条目：${missing.join('、')}`)
  if (argv.includes('--check')) {
    if (result.changes.length) throw new Error(`近期 Mod 审核层已漂移（${result.changes.length} 个文件）`)
  } else {
    for (const change of result.changes) fs.writeFileSync(change.file, serialize(change.value))
  }
  console.log(`近期 Mod 审核：${result.targets.size} 项，${result.eligible.size} 项证据合格，修改 ${result.changes.length} 个文件`)
  return result
}

if (require.main === module) {
  try { run() } catch (error) { console.error(error.stack || error); process.exit(1) }
}

module.exports = {
  REVIEWER,
  jsonFiles,
  methodsOf,
  officialUniqueNameOf,
  hasOfficialEvidence,
  isReviewEligible,
  approve,
  buildChanges,
  run
}
