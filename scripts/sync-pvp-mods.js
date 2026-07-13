const fs = require('node:fs')
const path = require('node:path')
const Items = require('warframe-items')

const root = path.resolve(__dirname, '..')
const outputDir = path.join(root, 'knowledge', 'acquisition', 'mod', 'pvpmod')
const acquisitionDir = path.join(root, 'knowledge', 'acquisition')
const today = new Date().toISOString().slice(0, 10)
const items = new Items({ category: ['Mods'], i18n: ['zh'] })

function listJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return listJsonFiles(file)
    return entry.name.endsWith('.json') ? [file] : []
  })
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function cleanStat(value) {
  return String(value || '')
    .replace(/\\n/g, '；')
    .replace(/\r?\n/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\bAtlas\b/g, '阿特拉斯')
    .replace(/\bNezha\b/g, '哪吒')
    .replace(/\bMirage\b/g, '幻影')
    .replace(/\s+/g, ' ')
    .replace(/\s*；\s*/g, '；')
    .trim()
}

function makeEffects(details) {
  return details.map((displayName, index) => {
    const match = displayName.match(/[+-]?\d+(?:\.\d+)?/)
    return {
      stat: `effect-${index + 1}`,
      displayName,
      value: match ? Number(match[0]) : 0,
      unit: displayName.includes('%') ? '%' : '',
    }
  })
}

function wikiUrl(name) {
  return `https://wiki.warframe.com/w/${encodeURIComponent(name.replace(/ /g, '_'))}`
}

function buildEntry(item) {
  const localized = items.i18n[item.uniqueName]?.zh || {}
  const displayName = localized.name && localized.name !== item.name ? localized.name : item.name
  const maxStats = localized.levelStats?.at(-1)?.stats
    || item.levelStats?.at(-1)?.stats
    || localized.description
    || item.description
    || []
  const effectDetails = [...new Set([maxStats].flat().map(cleanStat).filter(Boolean))]
  const conclaveDrop = (item.drops || []).find(drop => /^Conclave, /.test(drop.location || ''))
  const hasMissionOrEnemyDrop = (item.drops || []).some(drop => !/^Conclave, /.test(drop.location || ''))
  const categoryRefs = ['pvpmod']

  if (item.isExilus) categoryRefs.push('exilusmod')
  if (item.type === 'Aura Mod') categoryRefs.push('auramod')

  const methodRefs = ['gameplay.conclave-offerings']
  if (hasMissionOrEnemyDrop) methodRefs.push('gameplay.enemy-and-mission-drops')

  const entry = {
    id: `knowledge.acquisition.${slugify(item.name)}`,
    kind: 'knowledge',
    module: 'acquisition',
    title: displayName,
    aliases: displayName === item.name ? [] : [item.name],
    subject: {
      canonical: item.name,
      displayName,
      category: 'mod',
      categoryRefs,
    },
    maxRank: Math.max(0, (localized.levelStats || item.levelStats || []).length - 1),
    officialUniqueName: item.uniqueName,
    pvpKind: /PvPAugmentCard/.test(item.uniqueName) ? 'augment' : 'pool',
    pvpSlot: item.compatName || item.type.replace(/ Mod$/, ''),
    tradable: Boolean(item.tradable),
    effectDetails,
    prerequisites: [],
    methodRefs,
    sources: [
      { url: wikiUrl(item.name), label: `Warframe Wiki - ${item.name}` },
      { url: 'https://wiki.warframe.com/w/Conclave_Mods', label: 'Warframe Wiki - Conclave Mods' },
    ],
    gameVersion: 'warframe-items@1.1269.87',
    updatedAt: today,
    reviewStatus: 'approved',
    reviewedBy: ['sharrkkunjang-baka'],
    tags: ['acquisition', 'mod', 'pvp-mod'],
  }

  if (conclaveDrop) entry.conclaveTier = conclaveDrop.location.replace(/^Conclave, /, '')
  if (effectDetails.length) entry.effects = makeEffects(effectDetails)
  return entry
}

const pvpMods = [...items]
  .filter(item => /\/PvPMods\//.test(item.uniqueName || '') || /PvPAugmentCard/.test(item.uniqueName || ''))
  .sort((left, right) => left.name.localeCompare(right.name, 'en'))

const existingByUniqueName = new Map()
for (const file of listJsonFiles(acquisitionDir)) {
  if (file.startsWith(outputDir)) continue
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const entry of entries) {
    const uniqueName = entry.officialUniqueName || entry.subject?.officialUniqueName
    if (uniqueName) existingByUniqueName.set(uniqueName, { entry, entries, file })
  }
}

fs.rmSync(outputDir, { recursive: true, force: true })
fs.mkdirSync(outputDir, { recursive: true })

let mergedCount = 0
for (const item of pvpMods) {
  const existing = existingByUniqueName.get(item.uniqueName)
  if (existing) {
    mergedCount += 1
    const conclaveDrop = (item.drops || []).find(drop => /^Conclave, /.test(drop.location || ''))
    existing.entry.subject.categoryRefs = [...new Set([
      ...(existing.entry.subject.categoryRefs || []),
      'pvpmod',
    ])]
    existing.entry.pvpKind = /PvPAugmentCard/.test(item.uniqueName) ? 'augment' : 'pool'
    existing.entry.pvpSlot ||= item.compatName || item.type.replace(/ Mod$/, '')
    if (conclaveDrop) existing.entry.conclaveTier ||= conclaveDrop.location.replace(/^Conclave, /, '')
    fs.writeFileSync(existing.file, `${JSON.stringify(existing.entries, null, 2)}\n`)
    continue
  }
  const file = path.join(outputDir, `${slugify(item.name)}.json`)
  fs.writeFileSync(file, `${JSON.stringify([buildEntry(item)], null, 2)}\n`)
}

console.log(`Synced ${pvpMods.length} PvP Mods (${pvpMods.length - mergedCount} generated, ${mergedCount} merged).`)
