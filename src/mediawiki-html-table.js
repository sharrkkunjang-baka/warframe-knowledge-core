'use strict'

function decodeHtml(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return String(value || '').replace(/&#(x[0-9a-f]+|\d+);|&([a-z]+);/gi, (_, numeric, name) => {
    if (numeric) return String.fromCodePoint(parseInt(numeric.replace(/^x/i, ''), numeric[0].toLowerCase() === 'x' ? 16 : 10))
    return named[name.toLowerCase()] ?? `&${name};`
  })
}
function textContent(html) {
  return decodeHtml(String(html || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
}
function parseAttributes(tag) {
  const attributes = {}
  for (const match of String(tag).matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attributes[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4])
  return attributes
}
function extractHtmlTables(html) {
  const tables = []
  for (const [tableIndex, match] of [...String(html || '').matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)].entries()) {
    const rows = []
    for (const rowMatch of match[2].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
      const cells = []
      for (const cellMatch of rowMatch[2].matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) cells.push({ tag: cellMatch[1].toLowerCase(), text: textContent(cellMatch[3]), html: cellMatch[3], attributes: parseAttributes(cellMatch[2]) })
      if (cells.length) rows.push({ cells, attributes: parseAttributes(rowMatch[1]) })
    }
    if (rows.length) tables.push({ tableIndex, attributes: parseAttributes(match[1]), rows })
  }
  return tables
}
function tableMatrix(table) {
  const matrix = []
  const occupied = []
  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    matrix[rowIndex] ||= []
    let column = 0
    for (const cell of table.rows[rowIndex].cells) {
      while (occupied[rowIndex]?.[column]) column += 1
      const rowSpan = Math.max(1, Number(cell.attributes.rowspan) || 1)
      const colSpan = Math.max(1, Number(cell.attributes.colspan) || 1)
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        matrix[r] ||= []; occupied[r] ||= []
        for (let c = column; c < column + colSpan; c += 1) { matrix[r][c] = cell.text; occupied[r][c] = true }
      }
      column += colSpan
    }
  }
  return matrix.map(row => row.map(value => value || ''))
}
module.exports = { decodeHtml, extractHtmlTables, parseAttributes, tableMatrix, textContent }
