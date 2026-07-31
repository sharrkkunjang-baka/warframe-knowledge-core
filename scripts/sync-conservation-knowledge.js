'use strict'
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const INPUT = path.join(ROOT, 'knowledge', 'generated', 'official-items.json')
const OUTPUT = path.join(ROOT, 'knowledge', 'supplemental', 'conservation-items.json')
const WIKI_URL = 'https://wiki.warframe.com/w/Conservation'
const PROVENANCE = Object.freeze({
  source: 'wiki.warframe.com',
  url: WIKI_URL,
  pageTitle: 'Conservation',
  pageRevisionTimestamp: '2026-07-21T01:11:00Z',
  fetchedAt: '2026-07-30T01:13:00+08:00'
})
const WORLD_DISPLAY = Object.freeze({
  'plains-of-eidolon': '夜灵平野',
  'orb-vallis': '奥布山谷',
  'cambion-drift': '魔胎之境'
})
function worldFromIdentity(uniqueName) {
  if (/\/Eidolon\//i.test(uniqueName)) return 'plains-of-eidolon'
  if (/\/Solaris\//i.test(uniqueName)) return 'orb-vallis'
  if (/\/Deimos\//i.test(uniqueName)) return 'cambion-drift'
  return null
}
function field(value, displayName = null) {
  return { value, displayName: displayName || value, reviewStatus: value ? 'approved' : 'review-required', provenance: value ? PROVENANCE : null }
}
function buildEntry(item) {
  const world = worldFromIdentity(item.uniqueName)
  const animalName = item.displayName.replace(/标签$/, '')
  return {
    ...item,
    ecologyInfo: {
      schemaVersion: 1,
      type: 'conservation-animal',
      stableIdentity: item.uniqueName,
      animal: { canonical: item.canonical.replace(/ Tag$/, ''), displayName: animalName },
      openWorld: field(world, WORLD_DISPLAY[world]),
      biome: { value: null, displayName: null, reviewStatus: 'review-required', provenance: null },
      activity: { value: null, displayName: null, reviewStatus: 'review-required', provenance: null },
      lure: { status: 'available', canonical: null, displayName: '回声诱饵（追踪捕获）', reviewStatus: 'approved', provenance: PROVENANCE },
      captureTool: { status: 'required', canonicalNames: ['Tranq Rifle'], displayNames: ['麻醉步枪'], reviewStatus: 'approved', provenance: PROVENANCE },
      perfectCapture: { status: 'condition', displayName: '未被动物察觉且不使用受限技能麻醉', reviewStatus: 'approved', provenance: PROVENANCE },
      method: 'conservation',
      relations: { animalTags: [], processingOutputs: [], baitTargets: [] },
      reviewStatus: world ? 'approved' : 'review-required',
      provenance: PROVENANCE
    }
  }
}
function run() {
  const source = JSON.parse(fs.readFileSync(INPUT, 'utf8'))
  const entries = source.items.filter(item => item.semanticKinds?.includes('conservation-tag')).map(buildEntry)
  fs.writeFileSync(OUTPUT, `${JSON.stringify(entries, null, 2)}\n`)
  return { output: OUTPUT, entries: entries.length, worlds: [...new Set(entries.map(entry => entry.ecologyInfo.openWorld.value))] }
}
if (require.main === module) console.log(JSON.stringify(run(), null, 2))
module.exports = { OUTPUT, PROVENANCE, buildEntry, run, worldFromIdentity }
