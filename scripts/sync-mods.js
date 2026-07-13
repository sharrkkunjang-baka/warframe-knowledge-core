'use strict'

const fs = require('node:fs')
const path = require('node:path')
const Items = require('warframe-items')
const {
  filterPlayableMods,
  getCanonical,
  getModVariant,
  getTypeFolder,
  normalizeCanonical
} = require('../src/playable-mod-filter')
const {
  buildModEntry,
  getCategoryRefs,
  getGeneratedIdentity,
  getMaxRank,
  isGeneratedModEntry
} = require('../src/mod-entry-builder')

const root = path.resolve(__dirname, '..')
const acquisitionDirectory = path.join(root, 'knowledge', 'acquisition')

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function listJsonFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap(entry => {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) return listJsonFiles(target)
      return entry.isFile() && entry.name.endsWith('.json') ? [target] : []
    })
}

function getOfficialUniqueName(entry) {
  return entry.officialUniqueName || entry.subject?.officialUniqueName || ''
}

function readAcquisitionRecords(directory) {
  const records = []
  for (const file of listJsonFiles(directory)) {
    const raw = fs.readFileSync(file, 'utf8')
    const value = JSON.parse(raw)
    const entries = Array.isArray(value)
      ? value
      : value && typeof value === 'object'
        ? [value]
        : []
    entries.forEach((entry, index) => {
      records.push({
        entry,
        entries,
        value,
        file,
        index,
        raw,
        managed: entries.length === 1 && isGeneratedModEntry(entry)
      })
    })
  }
  return records
}

function addToIndex(index, key, record) {
  if (!key) return
  const records = index.get(key) || []
  records.push(record)
  index.set(key, records)
}

function selectRecord(records) {
  if (!records?.length) return null
  return [...records].sort((left, right) =>
    Number(left.managed) - Number(right.managed))[0]
}

function canonicalRankKey(canonical, maxRank) {
  if (!Number.isInteger(maxRank)) return ''
  return `${normalizeCanonical(canonical)}\u0000${maxRank}`
}

function withoutUpdatedAt(value) {
  const copy = JSON.parse(JSON.stringify(value))
  delete copy.updatedAt
  return copy
}

function getPackageVersion() {
  const packageFile = path.join(path.dirname(require.resolve('warframe-items')), 'package.json')
  return JSON.parse(fs.readFileSync(packageFile, 'utf8')).version
}

function createSyncPlan(options = {}) {
  const items = options.items || new Items({ category: ['Mods'], i18n: ['zh'] })
  const packageVersion = options.packageVersion || getPackageVersion()
  const today = options.today || new Date().toISOString().slice(0, 10)
  const scanDirectory = options.acquisitionDirectory || acquisitionDirectory
  const outputRoot = path.join(scanDirectory, 'mod')
  const records = readAcquisitionRecords(scanDirectory)
  const byUniqueName = new Map()
  const byCanonicalRank = new Map()

  for (const record of records) {
    addToIndex(byUniqueName, getOfficialUniqueName(record.entry), record)
    addToIndex(
      byCanonicalRank,
      canonicalRankKey(record.entry.subject?.canonical, record.entry.maxRank),
      record
    )
  }

  const { playable, excluded } = filterPlayableMods(items)
  const officialByCanonicalRank = new Map()
  for (const item of playable) {
    addToIndex(
      officialByCanonicalRank,
      canonicalRankKey(getCanonical(item), getMaxRank(item)),
      item
    )
  }
  const expectedFiles = []
  const existingUpdates = new Map()
  const usedRecords = new Set()
  let existing = 0
  let generated = 0
  let patchedExisting = 0

  for (const item of playable) {
    const uniqueMatch = selectRecord(
      (byUniqueName.get(item.uniqueName) || []).filter(record => !usedRecords.has(record))
    )
    const fallbackKey = canonicalRankKey(getCanonical(item), getMaxRank(item))
    const canonicalCandidates = (byCanonicalRank.get(fallbackKey) || [])
      .filter(record => !usedRecords.has(record))
    const canonicalMatch = uniqueMatch
      || (officialByCanonicalRank.get(fallbackKey) || []).length !== 1
      || canonicalCandidates.length !== 1
      ? null
      : canonicalCandidates[0]
    const match = uniqueMatch || canonicalMatch

    if (match && !match.managed) {
      usedRecords.add(match)
      existing += 1
      const update = existingUpdates.get(match.file) || {
        file: match.file,
        value: JSON.parse(JSON.stringify(match.value)),
        current: match.raw,
        changed: false
      }
      existingUpdates.set(match.file, update)
      const nextEntries = Array.isArray(update.value) ? update.value : [update.value]
      const nextEntry = nextEntries[match.index]
      let changed = false

      if (!getOfficialUniqueName(nextEntry)) {
        nextEntry.officialUniqueName = item.uniqueName
        changed = true
      }
      const currentRefs = nextEntry.subject.categoryRefs || []
      const missingRefs = getCategoryRefs(item).filter(ref => !currentRefs.includes(ref))
      if (missingRefs.length) {
        nextEntry.subject.categoryRefs = [...currentRefs, ...missingRefs]
        changed = true
      }
      if (changed) {
        patchedExisting += 1
        update.changed = true
      }
      continue
    }

    if (match) usedRecords.add(match)
    generated += 1
    const identity = getGeneratedIdentity(item)
    const localized = items.i18n?.[item.uniqueName]?.zh || {}
    const defaultFile = path.join(
      outputRoot,
      `${getModVariant(item)}mod`,
      getTypeFolder(item),
      identity.fileName
    )
    const file = match?.file || defaultFile
    const oldEntry = match?.entry
    const stableUpdatedAt = oldEntry?.updatedAt || today
    let entry = buildModEntry(item, localized, {
      gameVersion: `warframe-items@${packageVersion}`,
      updatedAt: stableUpdatedAt
    })
    if (oldEntry) {
      entry.tips = Array.isArray(oldEntry.tips) ? oldEntry.tips : []
      entry.tipKeywords = Array.isArray(oldEntry.tipKeywords) ? oldEntry.tipKeywords : entry.tipKeywords
    }

    if (oldEntry
      && JSON.stringify(withoutUpdatedAt(oldEntry)) !== JSON.stringify(withoutUpdatedAt(entry))) {
      entry = buildModEntry(item, localized, {
        gameVersion: `warframe-items@${packageVersion}`,
        updatedAt: today
      })
      if (oldEntry) {
        entry.tips = Array.isArray(oldEntry.tips) ? oldEntry.tips : []
        entry.tipKeywords = Array.isArray(oldEntry.tipKeywords) ? oldEntry.tipKeywords : entry.tipKeywords
      }
    }

    const content = serialize([entry])
    expectedFiles.push({
      file,
      content,
      current: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null,
      item,
      kind: 'generated'
    })
  }

  for (const update of existingUpdates.values()) {
    if (!update.changed) continue
    expectedFiles.push({
      file: update.file,
      content: serialize(update.value),
      current: update.current,
      kind: 'existing'
    })
  }

  return {
    counts: {
      playable: playable.length,
      excluded: excluded.length,
      existing,
      generated,
      patchedExisting
    },
    excluded,
    expectedFiles
  }
}

function printSummary(plan) {
  const { playable, excluded, existing, generated, patchedExisting } = plan.counts
  console.log(`playable=${playable} excluded=${excluded} existing=${existing} generated=${generated}`)
  console.log(`existing-patches=${patchedExisting}`)
}

function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check')
  const dryRun = argv.includes('--dry-run')
  const plan = createSyncPlan()
  const changes = plan.expectedFiles.filter(file => file.current !== file.content)

  printSummary(plan)
  if (check) {
    if (changes.length) {
      console.error(`mod-stubs-out-of-sync=${changes.length}`)
      process.exitCode = 1
    } else {
      console.log('mod-stubs-in-sync')
    }
    return plan
  }

  if (dryRun) {
    const creates = changes.filter(file => file.current === null).length
    console.log(`dry-run create=${creates} update=${changes.length - creates}`)
    return plan
  }

  for (const change of changes) {
    if (change.current !== null && change.kind === 'generated') {
      const currentValue = JSON.parse(change.current)
      const currentEntries = Array.isArray(currentValue) ? currentValue : [currentValue]
      if (currentEntries.length !== 1 || !isGeneratedModEntry(currentEntries[0])) {
        throw new Error(`Refusing to overwrite unmanaged file: ${change.file}`)
      }
    }
    fs.mkdirSync(path.dirname(change.file), { recursive: true })
    fs.writeFileSync(change.file, change.content)
  }
  console.log(`created-or-updated=${changes.length}`)
  return plan
}

if (require.main === module) run()

module.exports = {
  createSyncPlan,
  getOfficialUniqueName,
  listJsonFiles,
  readAcquisitionRecords,
  run,
  serialize
}
