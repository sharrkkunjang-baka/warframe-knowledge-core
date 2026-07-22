'use strict';

const { normalize } = require('./resolver');

const ASCII_WORD = /[A-Za-z0-9]/;
const EDGE_WORD = /[A-Za-z0-9]/;

function compactEnglish(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function englishWordCount(value) {
  return (String(value || '').match(/[A-Za-z0-9]+/g) || []).length;
}

function buildOfficialTermIndex(entries) {
  const forms = new Map();
  for (const entry of entries || []) {
    const canonical = String(entry?.canonical || '').trim();
    const displayName = String(entry?.displayName || '').trim();
    if (!canonical || !displayName || normalize(canonical) === normalize(displayName)) continue;
    for (const form of [canonical, ...(entry.aliases || [])]) {
      const english = String(form || '').trim();
      const compact = compactEnglish(english);
      if (!compact || !/[a-z]/.test(compact)) continue;
      // 单个普通英文单词在句中高度歧义；这里只锁定完整多词实体或明确的多词审核别名。
      if (englishWordCount(english) < 2) continue;
      const bucket = forms.get(compact) || new Map();
      bucket.set(canonical, {
        canonical,
        displayName,
        category: entry.category || 'official-item',
        officialUniqueName: entry.officialUniqueName || entry.uniqueName || null,
        evidenceKey: entry.evidenceKey || null
      });
      forms.set(compact, bucket);
    }
  }
  return new Map([...forms.entries()]
    .filter(([, candidates]) => candidates.size === 1)
    .map(([compact, candidates]) => [compact, { compact, ...candidates.values().next().value }]));
}

function scanEnglishRuns(text) {
  const source = String(text || '');
  const runs = [];
  let start = -1;
  for (let index = 0; index <= source.length; index++) {
    const char = source[index] || '';
    if (ASCII_WORD.test(char)) {
      if (start < 0) start = index;
      continue;
    }
    if (start >= 0) {
      runs.push({ start, end: index, text: source.slice(start, index) });
      start = -1;
    }
  }
  return runs;
}

function findOfficialTermsInText(text, index) {
  const source = String(text || '');
  const runs = scanEnglishRuns(source);
  const matches = [];
  for (let runIndex = 0; runIndex < runs.length; runIndex++) {
    const start = runs[runIndex].start;
    let compact = '';
    for (let endIndex = runIndex; endIndex < runs.length; endIndex++) {
      const between = source.slice(runs[endIndex - 1]?.end ?? start, runs[endIndex].start);
      if (endIndex > runIndex && /[^\s·・‧•_'’-]/u.test(between)) break;
      compact += compactEnglish(runs[endIndex].text);
      const term = index.get(compact);
      if (!term) continue;
      const end = runs[endIndex].end;
      if ((start > 0 && EDGE_WORD.test(source[start - 1])) || (end < source.length && EDGE_WORD.test(source[end]))) continue;
      matches.push({ ...term, start, end, matchedText: source.slice(start, end) });
    }
  }
  return matches
    .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
    .filter((match, position, sorted) => !sorted.slice(0, position).some(previous => previous.start <= match.start && previous.end > match.start));
}

module.exports = { buildOfficialTermIndex, findOfficialTermsInText, compactEnglish };
