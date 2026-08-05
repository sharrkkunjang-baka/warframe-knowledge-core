'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const REVIEWED = path.join(ROOT, 'knowledge', 'assets', 'reviewed-resource-assets.json')
const CURRENCY_INDEX = path.join(ROOT, 'knowledge', 'curreicies', 'categories.json')
const RESOURCE_ENTRIES = path.join(ROOT, 'knowledge', 'acquisition', 'resource', 'entries')
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '')
const serialize = value => `${JSON.stringify(value, null, 2)}\n`

function jsonFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return jsonFiles(target)
    return entry.isFile() && entry.name.endsWith('.json') ? [target] : []
  })
}

function binding(asset) {
  return {
    stableEntityId: asset.stableEntityId,
    uniqueName: asset.uniqueName,
    assetRoles: asset.assetRoles,
    availability: asset.availability,
    imageName: asset.imageName,
    sha256: asset.evidence.sha256,
    reviewStatus: asset.reviewStatus
  }
}

function sync(options = {}) {
  const reviewed = JSON.parse(fs.readFileSync(REVIEWED, 'utf8')).entries || []
  const byStableId = new Map(reviewed.map(asset => [asset.stableEntityId, asset]))
  const byCanonical = new Map(reviewed.map(asset => [normalize(asset.canonical), asset]))
  const changes = []
  const compare = (target, value) => {
    const next = serialize(value)
    if (fs.readFileSync(target, 'utf8') !== next) changes.push({ target, next })
  }

  const currencyIndex = JSON.parse(fs.readFileSync(CURRENCY_INDEX, 'utf8'))
  for (const row of currencyIndex.variables || []) {
    const asset = byStableId.get(row.id)
    if (!asset) continue
    const target = path.join(path.dirname(CURRENCY_INDEX), ...row.file.split('/'))
    const value = JSON.parse(fs.readFileSync(target, 'utf8'))
    value.officialUniqueName = asset.uniqueName
    value.assetBinding = binding(asset)
    compare(target, value)
  }

  for (const target of jsonFiles(RESOURCE_ENTRIES)) {
    const value = JSON.parse(fs.readFileSync(target, 'utf8'))
    const rows = Array.isArray(value) ? value : [value]
    let matched = false
    for (const row of rows) {
      const asset = byCanonical.get(normalize(row.subject?.canonical))
      if (!asset) continue
      row.subject.officialUniqueName = asset.uniqueName
      if (row.resourceAcquisition?.generated) row.resourceAcquisition.generated.officialUniqueName = asset.uniqueName
      row.assetBinding = binding(asset)
      matched = true
    }
    if (matched) compare(target, value)
  }

  if (options.check) {
    if (changes.length) throw new Error(`审核资源素材绑定已漂移（${changes.length} 项）`)
    console.log(`审核资源素材绑定无漂移：${reviewed.length} 个 active-current 身份`)
    return { reviewed: reviewed.length, changed: 0 }
  }
  for (const change of changes) {
    const temporary = `${change.target}.tmp-${process.pid}`
    fs.writeFileSync(temporary, change.next)
    fs.renameSync(temporary, change.target)
  }
  console.log(`已同步审核资源素材绑定：${reviewed.length} 个身份，更新 ${changes.length} 个文件`)
  return { reviewed: reviewed.length, changed: changes.length }
}

if (require.main === module) sync({ check: process.argv.includes('--check') })
module.exports = { binding, sync }
