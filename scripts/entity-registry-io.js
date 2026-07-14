'use strict'

const fs = require('node:fs')
const path = require('node:path')

function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function text(value) { return `${JSON.stringify(value, null, 2)}\n` }
function walkJson(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walkJson(path.join(dir, entry.name)) : entry.isFile() && entry.name.endsWith('.json') ? [path.join(dir, entry.name)] : [])
}
function buildRegistryPlan({ type, root, entries, categoryOf, categoryNames = {}, source }) {
  const normalized = entries.map(entry => ({ ...entry, category: categoryOf(entry) || 'unclassified' })).sort((a, b) => a.id.localeCompare(b.id, 'en'))
  const files = normalized.map(entry => ({ entry, relative: `${entry.category}/${slug(entry.canonical || entry.id)}.json` }))
  const categoryIds = [...new Set(normalized.map(entry => entry.category))].sort()
  const categories = categoryIds.map(id => ({ id, displayName: categoryNames[id] || id, count: normalized.filter(entry => entry.category === id).length }))
  return {
    root,
    files,
    index: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString().slice(0, 10),
      type,
      source,
      count: files.length,
      categories,
      variables: files.map(({ entry, relative }) => ({ id: entry.id, canonical: entry.canonical, displayName: entry.displayName, kind: entry.kind, category: entry.category, file: relative, parentId: entry.parentId || null, locationId: entry.locationId || null, factionId: entry.factionId || null }))
    }
  }
}
function applyRegistryPlan(plan, options = {}) {
  const check = Boolean(options.check)
  const expected = new Set()
  const changes = []
  const add = (target, value) => {
    expected.add(path.resolve(target).toLowerCase())
    const next = text(value)
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
    if (next !== current) changes.push({ type: current == null ? 'create' : 'update', target, next })
  }
  add(path.join(plan.root, 'categories.json'), plan.index)
  for (const item of plan.files) add(path.join(plan.root, ...item.relative.split('/')), item.entry)
  for (const file of walkJson(plan.root)) if (!expected.has(path.resolve(file).toLowerCase())) changes.push({ type: 'remove', target: file })
  if (check) {
    if (changes.length) throw new Error(`${plan.index.type} 变量知识已漂移（${changes.length} 项）`)
    return changes
  }
  for (const change of changes) {
    if (change.type === 'remove') fs.unlinkSync(change.target)
    else { fs.mkdirSync(path.dirname(change.target), { recursive: true }); fs.writeFileSync(change.target, change.next) }
  }
  return changes
}

module.exports = { slug, walkJson, buildRegistryPlan, applyRegistryPlan }
