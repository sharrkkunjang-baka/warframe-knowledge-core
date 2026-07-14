'use strict'

function cleanCell(value) {
  return String(value || '')
    .replace(/^\s*[•*#-]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeHeader(value) {
  return cleanCell(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function extractCells(text) {
  const cells = []
  let current = null
  for (const rawLine of String(text || '').replace(/\r/g, '').split('\n')) {
    const match = rawLine.match(/^\s*\|\s?(.*?)\s*$/)
    if (match) {
      const value = match[1].replace(/\s*\|\s*$/, '').trim()
      if (value) {
        current = { value }
        cells.push(current)
      }
      continue
    }
    const continuation = cleanCell(rawLine)
    if (current && continuation && !/^Sourced from the official drop table repository/i.test(continuation)) current.value += `\n${continuation}`
  }
  return cells.map(cell => cleanCell(cell.value)).filter(Boolean)
}

function parseMediaWikiTable(text, expectedHeaders) {
  const normalizedHeaders = expectedHeaders.map(group => group.map(normalizeHeader))
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/)
  const headerIndex = blocks.findIndex(block => {
    const cells = extractCells(block)
    return normalizedHeaders.every((aliases, offset) => aliases.includes(normalizeHeader(cells[offset])))
  })
  if (headerIndex < 0) return { headers: expectedHeaders.map(group => group[0]), rows: [], found: false }
  const rows = []
  for (const block of blocks.slice(headerIndex + 1)) {
    const values = extractCells(block)
    const prose = block.split('\n').filter(line => !/^\s*\|/.test(line)).map(cleanCell).filter(Boolean).join('\n')
    if (!values.length) {
      if (prose && rows.length && !/^Sourced from the official drop table repository/i.test(prose)) rows.at(-1)._continuation = [rows.at(-1)._continuation, prose].filter(Boolean).join('\n')
      continue
    }
    if (/^Sourced from the official drop table repository/i.test(values[0])) continue
    const row = Object.fromEntries(expectedHeaders.map((group, offset) => [group[0], values[offset] || '']))
    if (prose) row._continuation = prose
    rows.push(row)
  }
  return { headers: expectedHeaders.map(group => group[0]), rows, found: true }
}

module.exports = { cleanCell, extractCells, normalizeHeader, parseMediaWikiTable }
