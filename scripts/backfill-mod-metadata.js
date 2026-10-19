'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const metadata = {
  'Lingering Transmutation': ['rare', 'zenurik'],
  'Untime Rift': ['rare', 'zenurik'],
  "Jade's Judgment": ['rare', 'zenurik'],
  'Prismatic Companion': ['rare', 'zenurik'],
  'Reverse Rotorswell': ['rare', 'zenurik'],
  'Tharros Lethality': ['rare', 'zenurik'],
  'Kumihimo Loading': ['rare', 'zenurik'],
  'Noctua Swarm': ['rare', 'zenurik'],
  'Volatile Recompense': ['rare', 'zenurik'],
  'Rhythm Guard': ['rare', 'zenurik'],
  'Enduring Bastille': ['rare', 'zenurik'],
  Firequake: ['rare', null],
  'Razor Mortar': ['rare', 'madurai']
}

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function write(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`) }
function walk(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(file) : entry.name.endsWith('.json') ? [file] : []
  })
}

const identityFile = path.join(root, 'knowledge/supplemental/current-mod-identities.json')
const identities = read(identityFile)
for (const item of identities.items) {
  const values = metadata[item.canonical]
  if (!values) continue
  item.rarity = values[0]
  item.polarity = values[1]
  item.metadataSource = 'Official Warframe Wiki'
}
write(identityFile, identities)

for (const file of walk(path.join(root, 'knowledge/acquisition/mod/standardmod/warframe'))) {
  const value = read(file)
  const entries = Array.isArray(value) ? value : [value]
  let changed = false
  for (const entry of entries) {
    const values = metadata[entry.subject?.canonical]
    if (!values) continue
    entry.rarity = values[0]
    entry.polarity = values[1]
    changed = true
  }
  if (changed) write(file, value)
}

const officialFile = path.join(root, 'knowledge/categories/official.json')
const official = read(officialFile)
for (const mod of official.mods) {
  const values = metadata[mod.canonical]
  if (!values) continue
  mod.rarity = values[0] ? values[0][0].toUpperCase() + values[0].slice(1) : null
  mod.polarity = values[1]
}
write(officialFile, official)
console.log(`Backfilled ${Object.keys(metadata).length} mod metadata records`)
