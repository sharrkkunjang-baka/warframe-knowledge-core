'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const RESOURCE_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'resource')
const ENTRY_ROOT = path.join(RESOURCE_ROOT, 'entries')
const INDEX_PATH = path.join(RESOURCE_ROOT, 'categories.json')
const OFFICIAL_PATH = path.join(ROOT, 'knowledge', 'generated', 'official-items.json')
const RESOURCE_KINDS = new Set(['resource', 'material', 'material-or-usable', 'mineral', 'plant', 'fish-part', 'currency-token-material'])
const { readIndexedEntries, normalizeEntityName } = require('../src/entities')
const LOCATIONS = readIndexedEntries(ROOT, 'locations')
const LOCATION_BY_NAME = new Map(LOCATIONS.flatMap(entry => [entry.id, entry.canonical, entry.displayName, ...(entry.aliases || [])].filter(Boolean).map(name => [normalizeEntityName(name), entry])))

function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function serialize(value) { return JSON.stringify(value, null, 2) + '\n' }
function isResource(item) { return (item.semanticKinds || []).some(kind => RESOURCE_KINDS.has(kind)) }
function readEntries() {
  if (!fs.existsSync(ENTRY_ROOT)) return []
  return fs.readdirSync(ENTRY_ROOT).filter(file => file.endsWith('.json')).map(file => ({ file, value: JSON.parse(fs.readFileSync(path.join(ENTRY_ROOT, file), 'utf8')) }))
}
function generatedSources(item) {
  return (item.drops || []).map(drop => ({
    type: isVendorOffer(drop) ? 'raw-official-vendor-offer' : 'raw-official-drop', canonical: String(drop.location || '').trim(), chance: Number.isFinite(Number(drop.chance)) ? Number(drop.chance) : null,
    rarity: drop.rarity || null, reviewStatus: 'pending'
  })).filter(source => source.canonical)
}
function isVendorOffer(drop) {
  const source = String(drop?.location || '').trim()
  if (Number(drop?.chance) !== 1 || !source || /(?:\/|Rotation|Bounty)/i.test(source)) return false
  return /\([^)]*\)\s*,\s*[^,]+$/.test(source) || /,\s*[A-Za-z][A-Za-z '\-]+$/.test(source)
}
function descriptionLocations(item) {
  const description = String(item.description?.canonical || '')
  const match = description.match(/(?:^|\n)Location:\s*([^\n]+)/i)
  if (!match) return []
  return match[1].replace(/^Missions? in\s+/i, '').split(/\s*,\s*|\s+and\s+/i).map(name => name.trim().replace(/^the\s+/i, '')).filter(Boolean).map(name => LOCATION_BY_NAME.get(normalizeEntityName(name))).filter(Boolean)
}
function descriptionActivityRouting(item) {
  const canonical = String(item.description?.canonical || '')
  const display = String(item.description?.display || '')
  const source = canonical.match(/(?:^|\n)Location:\s*([^\n]+?)\s+Missions?\s+on\s+([^\n]+)\s*$/i)
  const localized = display.match(/(?:^|\n)获取地点[：:]\s*([^\n]+)\s*$/)
  if (!source || !localized) return null
  const location = LOCATION_BY_NAME.get(normalizeEntityName(source[2]))
  if (!location?.displayName) return null
  const activityText = localized[1].trim()
  const prefix = `${location.displayName}上的`
  if (!activityText.startsWith(prefix) || activityText.length <= prefix.length) return null
  return {
    category: 'resource-activity',
    variables: { resourceName: item.displayName, locationIds: [location.id], activityName: activityText.slice(prefix.length) },
    status: 'compiled'
  }
}
function automaticRouting(item) {
  const activity = descriptionActivityRouting(item)
  if (activity && item.localizationStatus === 'official-zh') return activity
  const locations = [...new Map(descriptionLocations(item).map(entry => [entry.id, entry])).values()]
  if (!locations.length || item.localizationStatus !== 'official-zh') return null
  const semantic = new Set(item.semanticKinds || [])
  const variables = { resourceName: item.displayName, locationIds: locations.map(entry => entry.id) }
  if (semantic.has('mineral')) return { category: 'resource-gathering', variables: { ...variables, activityName: '采矿' }, status: 'compiled' }
  if (semantic.has('plant')) return { category: 'resource-gathering', variables: { ...variables, activityName: '扫描植物' }, status: 'compiled' }
  if (semantic.has('fish-part')) return { category: 'resource-gathering', variables: { ...variables, activityName: '捕鱼' }, status: 'compiled' }
  return { category: 'resource-location', variables, status: 'compiled' }
}
function buildEntry(item, old) {
  const previousManual = old?.resourceAcquisition?.manual || {}
  const manual = {
    tips: Array.isArray(previousManual.tips) ? previousManual.tips : [],
    tipKeywords: Array.isArray(previousManual.tipKeywords) ? previousManual.tipKeywords : [],
    routingOverride: previousManual.routingOverride || null,
    reviewedBy: Array.isArray(previousManual.reviewedBy) ? previousManual.reviewedBy : []
  }
  const sources = generatedSources(item)
  const automatic = automaticRouting(item)
  const routing = previousManual.routingOverride || automatic || { category: 'resource-unresolved', variables: { resourceName: item.displayName || item.canonical }, status: sources.length ? 'review-required' : 'unresolved' }
  const generated = {
    officialUniqueName: item.uniqueName,
    canonical: item.canonical,
    displayName: item.displayName,
    localizationStatus: item.localizationStatus,
    semanticKinds: item.semanticKinds || [],
    evidence: sources,
    routing
  }
  return {
    id: `knowledge.acquisition.resource.${slug(item.canonical)}`,
    kind: 'knowledge', module: 'acquisition', title: item.canonical,
    subject: { canonical: item.canonical, displayName: item.displayName, category: 'resource', officialUniqueName: item.uniqueName, categoryRefs: [routing.category] },
    prerequisites: Array.isArray(old?.prerequisites) ? old.prerequisites : [], methodRefs: Array.isArray(old?.methodRefs) ? old.methodRefs : [],
    resourceAcquisition: { generated, manual },
    sources: [{ url: 'https://github.com/WFCD/warframe-items', label: 'warframe-items / Warframe Public Export' }],
    gameVersion: 'current', updatedAt: old?.updatedAt || new Date().toISOString().slice(0, 10),
    reviewStatus: routing.status === 'compiled' || manual.routingOverride ? 'approved' : 'draft', reviewedBy: manual.routingOverride ? manual.reviewedBy : routing.status === 'compiled' ? ['official-resource-sync'] : manual.reviewedBy,
    summary: `${item.displayName || item.canonical}的资源身份与获取证据。`, tags: ['acquisition', 'resource', 'official-generated']
  }
}
function buildPlan() {
  const official = JSON.parse(fs.readFileSync(OFFICIAL_PATH, 'utf8'))
  const existing = readEntries()
  const externallyManaged = existing
    .map(item => item.value)
    .filter(entry => entry.generator?.name && entry.generator.name !== 'sync-resource-knowledge')
  const byUnique = new Map(existing.map(item => [item.value.subject?.officialUniqueName, item.value]))
  const byCanonical = new Map(existing.map(item => [item.value.subject?.canonical, item.value]))
  const deduped = new Map()
  for (const item of official.items.filter(isResource)) {
    const old = byUnique.get(item.uniqueName) || byCanonical.get(item.canonical)
    const entry = buildEntry(item, old)
    const key = entry.subject.canonical.toLowerCase()
    const current = deduped.get(key)
    if (!current || (entry.resourceAcquisition.generated.localizationStatus === 'official-zh' && current.resourceAcquisition.generated.localizationStatus !== 'official-zh')) deduped.set(key, entry)
  }
  for (const entry of externallyManaged) {
    const key = entry.subject.canonical.toLowerCase()
    deduped.set(key, entry)
  }
  const entries = [...deduped.values()].sort((a, b) => a.subject.canonical.localeCompare(b.subject.canonical, 'en'))
  const index = { schemaVersion: 1, generatedAt: new Date().toISOString().slice(0, 10), count: entries.length, resources: entries.map(entry => ({ canonical: entry.subject.canonical, displayName: entry.subject.displayName, officialUniqueName: entry.subject.officialUniqueName, file: `entries/${slug(entry.subject.canonical)}.json`, category: entry.resourceAcquisition.generated.routing.category, reviewStatus: entry.reviewStatus })) }
  return { entries, index }
}
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check'), plan = buildPlan(), changes = [], expected = new Set()
  function compare(target, value) { const next = serialize(value), current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null; if (current !== next) changes.push({ target, next }) }
  for (const entry of plan.entries) { const target = path.join(ENTRY_ROOT, `${slug(entry.subject.canonical)}.json`); expected.add(path.resolve(target).toLowerCase()); compare(target, entry) }
  compare(INDEX_PATH, plan.index)
  for (const item of readEntries()) { const target = path.join(ENTRY_ROOT, item.file); if (!expected.has(path.resolve(target).toLowerCase())) changes.push({ target, remove: true }) }
  if (check) { if (changes.length) throw new Error(`资源知识已漂移（${changes.length} 项）`); console.log(`资源知识无漂移：${plan.entries.length} 个资源`); return plan }
  for (const change of changes) { if (change.remove) fs.unlinkSync(change.target); else { fs.mkdirSync(path.dirname(change.target), { recursive: true }); fs.writeFileSync(change.target, change.next) } }
  console.log(`已同步 ${plan.entries.length} 个资源知识条目；写入 ${changes.length} 项`); return plan
}

if (require.main === module) { try { run() } catch (error) { console.error(error.stack || error); process.exit(1) } }
module.exports = { RESOURCE_KINDS, isResource, isVendorOffer, descriptionActivityRouting, buildEntry, buildPlan, run }
