'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const REQUIRED_TABLES = ['pages', 'sections', 'aliases', 'categories', 'sync_state', 'recent_changes', 'pages_fts', 'sections_fts']

function resolveWikiDatabase(input) {
  const filename = input || process.env.WF_WIKI_DB
  if (!filename) throw new Error('缺少 Wiki 数据库路径；请使用 --db <path> 或设置 WF_WIKI_DB')
  const resolved = path.resolve(filename)
  if (!fs.existsSync(resolved)) throw new Error(`Wiki 数据库不存在：${resolved}`)
  return resolved
}

function sha256File(filename) {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(filename, 'r')
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024)
  try {
    let read
    do {
      read = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (read) hash.update(buffer.subarray(0, read))
    } while (read)
  } finally { fs.closeSync(fd) }
  return hash.digest('hex').toUpperCase()
}

function parseState(value) {
  try { return JSON.parse(value) } catch (_) { return value }
}

function inspectWikiDatabase(filename, options = {}) {
  const resolved = resolveWikiDatabase(filename)
  const stat = fs.statSync(resolved)
  const db = new Database(resolved, { readonly: true, fileMustExist: true })
  try {
    const quickCheck = db.pragma('quick_check', { simple: true })
    if (quickCheck !== 'ok') throw new Error(`Wiki 数据库 quick_check 失败：${quickCheck}`)
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all().map(row => row.name))
    const missingTables = REQUIRED_TABLES.filter(name => !tables.has(name))
    if (missingTables.length) throw new Error(`Wiki 数据库 schema 不完整，缺少：${missingTables.join(', ')}`)
    const counts = {
      pages: db.prepare('SELECT COUNT(*) count FROM pages').get().count,
      sections: db.prepare('SELECT COUNT(*) count FROM sections').get().count,
      aliases: db.prepare('SELECT COUNT(*) count FROM aliases').get().count,
      ftsPages: db.prepare('SELECT COUNT(*) count FROM pages_fts').get().count
    }
    const syncState = Object.fromEntries(db.prepare('SELECT key,value,updated_at updatedAt FROM sync_state ORDER BY key').all().map(row => [row.key, { value: parseState(row.value), updatedAt: row.updatedAt }]))
    return { filename: resolved, size: stat.size, sha256: options.skipHash ? null : sha256File(resolved), quickCheck, counts, syncState }
  } finally { db.close() }
}

class ReadonlyWikiDatabase {
  constructor(filename) {
    this.filename = resolveWikiDatabase(filename)
    this.db = new Database(this.filename, { readonly: true, fileMustExist: true })
    this.page = this.db.prepare('SELECT page_id pageId,title,revision_id revisionId,timestamp,synced_at syncedAt FROM pages WHERE title=? COLLATE NOCASE LIMIT 1')
    this.sections = this.db.prepare('SELECT anchor,title,level,ordinal,text FROM sections WHERE page_id=? ORDER BY ordinal')
  }
  getPage(title) {
    const page = this.page.get(title)
    if (!page) return null
    page.sections = this.sections.all(page.pageId)
    return page
  }
  close() { this.db.close() }
}

module.exports = { REQUIRED_TABLES, ReadonlyWikiDatabase, inspectWikiDatabase, resolveWikiDatabase, sha256File }
