'use strict';

const { pinyin } = require('pinyin-pro');

const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[\s·・‧•_-]+/g, '');
const pinyinTokens = value => pinyin(String(value || ''), { toneType: 'none', type: 'array' }).filter(Boolean);

function lcsLength(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  return dp[a.length][b.length];
}

function phoneticScore(query, candidate) {
  const q = pinyinTokens(query), c = pinyinTokens(candidate);
  if (!q.length || !c.length) return -Infinity;
  const matched = lcsLength(q, c);
  if (!matched) return -Infinity;
  let prefix = 0;
  while (prefix < Math.min(q.length, c.length) && q[prefix] === c[prefix]) prefix++;
  let longest = 0;
  for (let i = 0; i < q.length; i++) for (let j = 0; j < c.length; j++) {
    let run = 0;
    while (i + run < q.length && j + run < c.length && q[i + run] === c[j + run]) run++;
    longest = Math.max(longest, run);
  }
  const coverage = matched / q.length;
  const targetCoverage = matched / c.length;
  return matched * 18 + coverage * 28 + targetCoverage * 12 + prefix * 8 + longest * 5 - (q.length - matched) * 16 - (c.length - matched) * 4 - Math.abs(q.length - c.length) * 2;
}

function buildCandidates(aliases) {
  const result = [];
  for (const [canonical, names] of Object.entries(aliases.frames || {})) {
    result.push({ alias: canonical, canonical, category: 'frame' });
    for (const alias of names) {
      result.push({ alias, canonical, category: 'frame' });
      if (!alias.endsWith('甲') && alias.length > 1) result.push({ alias: `${alias}甲`, canonical, category: 'frame' });
    }
  }
  for (const [alias, canonical] of Object.entries(aliases.terms || {})) result.push({ alias, canonical, category: 'term' });
  return result;
}

function createResolver(aliases) {
  const candidates = buildCandidates(aliases);
  const exact = new Map(candidates.map(item => [normalize(item.alias), item]));
  return function resolveName(query, options = {}) {
    const raw = String(query || '').trim();
    if (!raw) return null;
    const direct = exact.get(normalize(raw));
    if (direct) return { ...direct, match: 'exact', score: 200 };
    const ranked = candidates.map(item => ({ ...item, score: phoneticScore(raw, item.alias) }))
      .filter(item => item.score >= (options.minScore || 50))
      .sort((a, b) => b.score - a.score || b.alias.length - a.alias.length);
    if (!ranked.length) return null;
    const best = ranked[0];
    const second = ranked.find(item => item.canonical !== best.canonical);
    if (second && best.score - second.score < (options.minLead || 5)) {
      return { ambiguous: [...new Map(ranked.filter(item => best.score - item.score < 5).map(item => [item.canonical, item])).values()].slice(0, 8) };
    }
    return { alias: best.alias, canonical: best.canonical, category: best.category, match: 'pinyin-weighted', score: best.score };
  };
}

module.exports = { createResolver, phoneticScore, normalize };
