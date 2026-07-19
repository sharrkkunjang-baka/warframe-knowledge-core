'use strict'

const { extractHtmlTables, tableMatrix, textContent } = require('./mediawiki-html-table')

const SUPPORTED_METHODS = Object.freeze(['enemy', 'mission', 'bounty', 'vendor', 'syndicate', 'eidolon', 'event', 'rotating', 'dissolution'])
const METHOD_PATTERNS = [
  ['dissolution', /dissolution|vosfor|arcane pack/i],
  ['eidolon', /eidolon|teralyst|gantulyst|hydrolyst/i],
  ['bounty', /bount(?:y|ies)|stage\s*\d/i],
  ['syndicate', /syndicate|standing|the quills|vox solaris|holdfasts/i],
  ['vendor', /vendor|purchased|buy|sold by|offered by/i],
  ['event', /event|operation:|plague star|scarlet spear/i],
  ['enemy', /enemy|kills?|thrax|angel|acolyte|stalker/i],
  ['rotating', /rotation|rotat(?:ing|es)|weekly|daily|circuit/i],
  ['mission', /mission|reward|drop table|survival|defense|disruption|cascade|flood/i]
]
function normalize(value) { return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim() }
function classifyMethod(text) { return (METHOD_PATTERNS.find(([, pattern]) => pattern.test(text)) || [null])[0] }
function reviewStatus(method, cells) { return method && cells.some(Boolean) ? 'draft' : 'review-required' }
function provenance(page, sourceDatabase, sourceType, section, excerpt, extra = {}) {
  return { pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId, sourceDatabase, sourceType, section, excerpt: normalize(excerpt), ...extra }
}
function sectionForOffset(html, offset) {
  const before = String(html || '').slice(0, offset)
  const headings = [...before.matchAll(/<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
  return headings.length ? normalize(textContent(headings.at(-1)[2])) : 'Article'
}
function compileTables(page, sourceDatabase) {
  const methods = []
  const tables = extractHtmlTables(page.html)
  let searchOffset = 0
  for (const table of tables) {
    const matrix = tableMatrix(table)
    if (matrix.length < 2) continue
    const headerRows = table.rows.findIndex(row => row.cells.some(cell => cell.tag === 'td'))
    if (headerRows < 1 || headerRows >= matrix.length) continue
    const width = Math.max(...matrix.slice(0, headerRows).map(row => row.length))
    const headers = Array.from({ length: width }, (_, column) => [...new Set(matrix.slice(0, headerRows).map(row => normalize(row[column])).filter(Boolean))].join(' / '))
    const headerText = headers.join(' | ')
    if (!/source|enemy|mission|chance|reward|vendor|syndicate|dissolution|rotation|bounty/i.test(headerText)) continue
    const tableNeedle = '<table'
    const offset = String(page.html).toLowerCase().indexOf(tableNeedle, searchOffset)
    if (offset >= 0) searchOffset = offset + tableNeedle.length
    const section = sectionForOffset(page.html, Math.max(0, offset))
    for (let rowIndex = headerRows; rowIndex < matrix.length; rowIndex += 1) {
      const cells = matrix[rowIndex].map(normalize)
      const excerpt = cells.join(' | ')
      const type = classifyMethod(`${section} ${headerText} ${excerpt}`)
      if (!type) continue
      const values = Object.fromEntries(headers.map((header, index) => [header || `column${index + 1}`, cells[index] || '']))
      methods.push({ type, values, reviewStatus: reviewStatus(type, cells), provenance: provenance(page, sourceDatabase, 'table', section, excerpt, { tableIndex: table.tableIndex, rowIndex, headers }) })
    }
  }
  return methods
}
function stripTables(html) { return String(html || '').replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, ' ') }
const VENDOR_PROSE_ENTITIES = Object.freeze({
  'Bird 3': { sourceEntityId: 'npc.bird-3', locationId: 'hub.sanctum-anatomica' }
})
const RANK_ZH = Object.freeze({ Assistant: '助手', Researcher: '研究者', Colleague: '同僚', Scholar: '学者' })
function compileVendorProse(excerpt, page, sourceDatabase, section) {
  const match = normalize(excerpt).match(/Can be bought from (Bird 3)(?: of Cavia)? for ([\d,]+) Standing(?:\s+[\d,]+)?\s*,?\s*requiring Rank (\d+)\s*-\s*([A-Za-z ]+?)\s*\.?$/i)
  if (!match) return null
  const entity = VENDOR_PROSE_ENTITIES[match[1]]
  if (!entity) return null
  const rankCanonical = match[4].trim()
  return {
    type: 'vendor-or-syndicate-exchange',
    sourceCanonical: match[1],
    sourceEntityId: entity.sourceEntityId,
    locationId: entity.locationId,
    requirements: { type: 'standing', npcId: entity.sourceEntityId, locationId: entity.locationId, rank: Number(match[3]), rankName: RANK_ZH[rankCanonical] || rankCanonical, amount: Number(match[2].replace(/,/g, '')) },
    availability: 'guaranteed-when-requirements-met',
    reviewStatus: 'approved',
    provenance: provenance(page, sourceDatabase, 'prose', section, excerpt)
  }
}
function compileProse(page, sourceDatabase) {
  const evidence = [], methods = []
  const html = stripTables(page.html)
  const headingPattern = /<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi
  const headings = [...html.matchAll(headingPattern)]
  const ranges = [{ title: 'Article', start: 0, end: headings[0]?.index ?? html.length }]
  headings.forEach((heading, index) => ranges.push({ title: normalize(textContent(heading[2])), start: heading.index + heading[0].length, end: headings[index + 1]?.index ?? html.length }))
  for (const range of ranges) {
    if (!/acquisition|drop|reward|vendor|dissolution|source/i.test(range.title)) continue
    const paragraphs = [...html.slice(range.start, range.end).matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/gi)].map(match => normalize(textContent(match[1]))).filter(Boolean)
    for (const excerpt of paragraphs) {
      evidence.push({ type: 'acquisition-prose', reviewStatus: 'draft', provenance: provenance(page, sourceDatabase, 'prose', range.title, excerpt) })
      const vendor = compileVendorProse(excerpt, page, sourceDatabase, range.title)
      if (vendor) methods.push(vendor)
    }
  }
  return { evidence, methods }
}
function compileArcaneWikiPage(page, sourceDatabase, compiledAt = new Date().toISOString()) {
  const prose = compileProse(page, sourceDatabase)
  const methods = [...compileTables(page, sourceDatabase), ...prose.methods]
  const evidence = prose.evidence
  const unresolved = methods.filter(method => method.reviewStatus === 'review-required').map(method => ({ kind: 'method', canonical: method.provenance.excerpt, reason: '无法可靠分类或实体化表格行', provenance: method.provenance }))
  return { wiki: { pageTitle: page.title, pageId: page.pageId, revisionId: page.revisionId, pageTimestamp: page.timestamp, compiledAt, sourceDatabase }, methods, evidence, unresolved, status: unresolved.length ? (methods.length ? 'partial' : 'unresolved') : (methods.length ? 'complete' : 'unresolved') }
}
module.exports = { SUPPORTED_METHODS, classifyMethod, compileArcaneWikiPage, compileProse, compileVendorProse, compileTables }
