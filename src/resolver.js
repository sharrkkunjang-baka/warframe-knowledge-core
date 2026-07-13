'use strict';

const { pinyin } = require('pinyin-pro');

const normalize = value => {
  let result = String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[‘’`´]/g, "'").replace(/[\s·・‧•_-]+/g, '');
  if (/[^a-z]p$/.test(result)) result = `${result.slice(0, -1)}prime`;
  return result;
};
const pinyinTokens = value => pinyin(String(value || ''), { toneType: 'none', type: 'array' }).filter(Boolean);

function textScore(query, candidate) {
  const q = normalize(query), c = normalize(candidate);
  if (!q || !c) return -Infinity;
  if (q === c) return 300;
  if (c.startsWith(q)) return 180 + q.length / c.length * 20;
  if (q.startsWith(c) && c.length >= 2) return 160 + c.length / q.length * 20;
  const shared = [...new Set(q)].filter(char => c.includes(char)).length;
  const coverage = shared / Math.max(new Set(q).size, 1);
  return q.length >= 2 && coverage >= 0.75
    ? 100 + coverage * 20 - Math.abs(c.length - q.length) * 2
    : -Infinity;
}

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
  const staticCandidates = buildCandidates(aliases);
  return function resolveName(query, options = {}) {
    const raw = String(query || '').trim();
    if (!raw) return null;
    const supplied = Array.isArray(options.candidates) ? options.candidates : [];
    const candidates = [...staticCandidates, ...supplied]
      .filter(item => item && item.alias && item.canonical)
      .filter(item => !options.categories || options.categories.includes(item.category));
    const direct = candidates.find(item => normalize(item.alias) === normalize(raw));
    if (direct) return { ...direct, match: 'exact', score: 300 };
    const ranked = candidates.map(item => {
      const literal = textScore(raw, item.alias);
      const phonetic = phoneticScore(raw, item.alias);
      const score = Math.max(literal, phonetic) + Number(item.priority || 0);
      return { ...item, score, match: literal >= phonetic ? 'text-weighted' : 'pinyin-weighted' };
    })
      .filter(item => item.score >= (options.minScore ?? 50))
      .sort((a, b) => b.score - a.score || Number(b.priority || 0) - Number(a.priority || 0) || b.alias.length - a.alias.length);
    if (!ranked.length) return null;
    const best = ranked[0];
    const second = ranked.find(item => item.canonical !== best.canonical);
    const minLead = options.minLead ?? 5;
    if (second && best.score - second.score < minLead) {
      return {
        ambiguous: [...new Map(ranked.filter(item => best.score - item.score < minLead).map(item => [item.canonical, item])).values()].slice(0, options.limit || 8),
        score: best.score
      };
    }
    return best;
  };
}

module.exports = { createResolver, phoneticScore, textScore, normalize };
