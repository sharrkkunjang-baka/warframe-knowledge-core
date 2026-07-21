'use strict'

const fs = require('node:fs')
const path = require('node:path')
const CDP = require(path.join('D:/Minecraft/qq-bot/node_modules/chrome-remote-interface'))

const ROOT = path.join(__dirname, '..')
const OUTPUT = path.join(ROOT, 'knowledge', 'supplemental', 'current-wiki-mod-directory.json')
const API = 'https://wiki.warframe.com/api.php'

async function withBrowser(callback) {
  const targets = await CDP.List({ port: 9222 })
  const target = targets.find(item => item.type === 'page' && /^https:\/\/wiki\.warframe\.com\//i.test(item.url)) || targets.find(item => item.type === 'page')
  if (!target) throw new Error('Chroma Beta CDP 9222 没有可用页面')
  const client = await CDP({ target, port: 9222 })
  try { await client.Runtime.enable(); return await callback(client) } finally { await client.close() }
}

async function query(client, parameters) {
  const url = new URL(API)
  for (const [key, value] of Object.entries({ action: 'query', format: 'json', formatversion: '2', ...parameters })) url.searchParams.set(key, value)
  const expression = `(async()=>{const r=await fetch(${JSON.stringify(url.href)},{credentials:'include',cache:'no-cache'});return {status:r.status,body:await r.text()}})()`
  const result = await client.Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  if (result.result.value.status !== 200) throw new Error(`current Wiki API HTTP ${result.result.value.status}`)
  return JSON.parse(result.result.value.body)
}

async function fetchCategoryMembers(client) {
  const pages = []
  let cmcontinue
  do {
    const data = await query(client, { list: 'categorymembers', cmtitle: 'Category:Mods', cmnamespace: '0', cmlimit: 'max', ...(cmcontinue ? { cmcontinue } : {}) })
    pages.push(...data.query.categorymembers)
    cmcontinue = data.continue?.cmcontinue
  } while (cmcontinue)
  return pages
}

async function buildDirectory() {
  return withBrowser(async client => {
    const pages = await fetchCategoryMembers(client)
    const items = []
    for (let index = 0; index < pages.length; index += 50) {
      const batch = pages.slice(index, index + 50)
      const data = await query(client, { prop: 'info|revisions|pageimages', rvprop: 'ids|timestamp', piprop: 'original', titles: batch.map(page => page.title).join('|') })
      for (const page of data.query.pages) items.push({
      pageId: page.pageid,
      title: page.title,
      revisionId: page.lastrevid || null,
      timestamp: page.revisions?.[0]?.timestamp || null,
      original: page.original || null,
      url: `https://wiki.warframe.com/w/${encodeURIComponent(page.title.replace(/ /g, '_'))}`
      })
    }
    items.sort((left, right) => left.title.localeCompare(right.title))
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), source: { category: 'https://wiki.warframe.com/w/Category:Mods', api: API, transport: 'Chroma Beta CDP 9222', fandomUsed: false }, count: items.length, items }
  })
}

async function run(argv = process.argv.slice(2)) {
  const next = await buildDirectory()
  const current = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : null
  if (argv.includes('--check')) {
    const currentItems = JSON.stringify(current?.items || [])
    if (currentItems !== JSON.stringify(next.items)) throw new Error(`current Wiki Mod 目录已漂移：${current?.count || 0} -> ${next.count}`)
    console.log(`current-wiki-mod-directory-in-sync count=${next.count}`)
    return next
  }
  fs.writeFileSync(OUTPUT, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`current-wiki-mod-directory count=${next.count}`)
  return next
}

if (require.main === module) run().catch(error => { console.error(error.stack || error); process.exit(1) })
module.exports = { API, OUTPUT, buildDirectory, fetchCategoryMembers, run }
