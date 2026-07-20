'use strict';

const { pinyin } = require('pinyin-pro');

const HAN_RE = /[\u3400-\u9fff]/;
const VARIANT_PREFIX_RE = /^(?:终幕|赤毒|信条|棱晶|亡魂|破坏者|圣洁|绯红|保障|枢议|苦痛|Dex)[·・‧•\s_-]+/i;

function normalizeName(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[\s·・‧•_'’`´-]+/g, '');
}

function compactPinyin(value) {
  return pinyin(String(value || ''), { toneType: 'none', type: 'array' }).join('').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(left, right) {
  const a = String(left || ''), b = String(right || '');
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(
      current[j - 1] + 1,
      previous[j] + 1,
      previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
    );
    previous = current;
  }
  return previous[b.length];
}

function similarity(left, right) {
  const longest = Math.max(left.length, right.length);
  return longest ? 1 - levenshtein(left, right) / longest : 0;
}

function fuzzySimilarity(query, candidate) {
  let score = similarity(query, candidate);
  if (candidate.startsWith(query) && query.length >= 3) score = Math.max(score, 0.65 + (query.length / candidate.length) * 0.1);
  if (query.startsWith(candidate) && candidate.length >= 3) score = Math.max(score, 0.6 + (candidate.length / query.length) * 0.1);
  return Math.min(score, 1);
}

function rivenWeaponIdentities(officialWeapons) {
  const catalog = [
    ...(officialWeapons?.weapons || []),
    ...(officialWeapons?.excludedWeapons || []).filter(item => item.exclusionReason === 'non-functional-placeholder')
  ];
  return [...new Map(catalog.filter(item => item?.uniqueName && item?.canonical && item?.displayName)
    .map(item => [item.uniqueName, {
      canonical: item.canonical,
      displayName: item.displayName,
      officialUniqueName: item.uniqueName,
      localizationStatus: item.localizationStatus,
      equipmentType: item.equipmentType || null,
      omegaAttenuation: Number.isFinite(Number(item.omegaAttenuation)) ? Number(item.omegaAttenuation) : null
    }])).values()];
}

function createRivenWeaponResolver(officialWeapons, reviewedAliases = {}) {
  const identities = rivenWeaponIdentities(officialWeapons);
  const entries = [];
  const add = (identity, alias, source, exactScore) => {
    const normalized = normalizeName(alias);
    if (!normalized) return;
    entries.push({
      identity,
      alias,
      source,
      exactScore,
      normalized,
      phonetic: HAN_RE.test(alias) ? compactPinyin(alias) : ''
    });
  };
  for (const identity of identities) {
    add(identity, identity.displayName, 'official-zh', 1000);
    for (const alias of reviewedAliases[identity.canonical] || []) add(identity, alias, 'reviewed-alias', 950);
    add(identity, identity.canonical, 'official-en', 900);
    const baseDisplayName = identity.displayName.replace(VARIANT_PREFIX_RE, '');
    if (baseDisplayName !== identity.displayName) add(identity, baseDisplayName, 'official-variant-base', 875);
  }

  const byUniqueName = new Map(identities.map(identity => [identity.officialUniqueName, identity]));
  const exactGroups = new Map();
  const pinyinGroups = new Map();
  for (const entry of entries) {
    const exactKey = `${entry.source}:${entry.normalized}`;
    if (!exactGroups.has(exactKey)) exactGroups.set(exactKey, []);
    exactGroups.get(exactKey).push(entry);
    if (entry.phonetic) {
      if (!pinyinGroups.has(entry.phonetic)) pinyinGroups.set(entry.phonetic, []);
      pinyinGroups.get(entry.phonetic).push(entry);
    }
  }

  const result = (entry, match, score) => ({
    alias: entry.alias,
    canonical: entry.identity.canonical,
    displayName: entry.identity.displayName,
    officialUniqueName: entry.identity.officialUniqueName,
    category: 'riven-weapon',
    match,
    score,
    source: entry.source
  });
  const ambiguity = (ranked, reason, score) => ({
    ambiguous: ranked.map(row => result(row.entry, row.match, row.score)),
    reason,
    score
  });

  function resolve(query, options = {}) {
    const raw = String(query || '').normalize('NFKC').trim();
    const normalized = normalizeName(raw);
    if (!normalized) return null;
    if (byUniqueName.has(raw)) {
      const identity = byUniqueName.get(raw);
      return result({ identity, alias: identity.displayName, source: 'official-id' }, 'exact-id', 1100);
    }

    for (const source of ['official-zh', 'reviewed-alias', 'official-en', 'official-variant-base']) {
      const matches = exactGroups.get(`${source}:${normalized}`) || [];
      if (matches.length === 1) return result(matches[0], 'exact', matches[0].exactScore);
      if (matches.length > 1) return ambiguity(matches.map(entry => ({ entry, match: 'exact', score: entry.exactScore })), 'exact-collision', matches[0].exactScore);
    }

    const phoneticQuery = normalized.replace(/[^a-z0-9]/g, '');
    if (phoneticQuery) {
      const matches = [...new Map((pinyinGroups.get(phoneticQuery) || []).map(entry => [entry.identity.officialUniqueName, entry])).values()];
      if (matches.length === 1) return result(matches[0], 'pinyin-exact', 850);
      if (matches.length > 1) return ambiguity(matches.map(entry => ({ entry, match: 'pinyin-exact', score: 850 })), 'pinyin-collision', 850);
    }

    const queryIsChinese = HAN_RE.test(raw);
    const fuzzyQuery = queryIsChinese ? normalized : phoneticQuery;
    if (!fuzzyQuery || fuzzyQuery.length < 3) return null;
    const rankedByIdentity = new Map();
    for (const entry of entries) {
      const candidate = queryIsChinese ? entry.normalized : entry.phonetic;
      if (!candidate) continue;
      const score = fuzzySimilarity(fuzzyQuery, candidate) * 100;
      const previous = rankedByIdentity.get(entry.identity.officialUniqueName);
      if (!previous || score > previous.score) rankedByIdentity.set(entry.identity.officialUniqueName, {
        entry,
        score,
        match: queryIsChinese ? 'zh-fuzzy' : 'pinyin-fuzzy'
      });
    }
    const ranked = [...rankedByIdentity.values()].sort((a, b) => b.score - a.score || a.entry.identity.canonical.localeCompare(b.entry.identity.canonical));
    if (!ranked.length) return null;
    const minScore = options.minScore ?? 78;
    const minLead = options.minLead ?? 8;
    const candidateFloor = options.candidateFloor ?? 45;
    const limit = options.limit ?? 6;
    const visible = ranked.filter(row => row.score >= candidateFloor && ranked[0].score - row.score <= 18).slice(0, limit);
    if (ranked[0].score < minScore) return visible.length ? ambiguity(visible, 'low-confidence', ranked[0].score) : null;
    if (ranked[1] && ranked[0].score - ranked[1].score < minLead) {
      return ambiguity(ranked.filter(row => ranked[0].score - row.score < minLead).slice(0, limit), 'insufficient-lead', ranked[0].score);
    }
    return result(ranked[0].entry, ranked[0].match, ranked[0].score);
  }

  function get(query) {
    const raw = String(query || '').trim();
    const byId = byUniqueName.get(raw);
    if (byId) return byId;
    const resolved = resolve(raw);
    if (!resolved || resolved.ambiguous) return null;
    return byUniqueName.get(resolved.officialUniqueName) || null;
  }

  return { resolve, get, identities };
}

module.exports = {
  createRivenWeaponResolver,
  rivenWeaponIdentities,
  normalizeName,
  compactPinyin,
  similarity
};
