'use strict';

const COMMAND_RE = /^\/?(?:集团兑换|兑换|集团)(?:[\s\p{P}\p{S}]*(.*))?$/iu;
const COMPACT_RE = /[^a-z0-9\u3400-\u9fff]+/giu;

function compact(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(COMPACT_RE, '');
}

function parseSyndicateExchangeCommand(text) {
  const match = String(text || '').normalize('NFKC').trim().match(COMMAND_RE);
  if (!match) return null;
  return Object.freeze({ matched: true, query: String(match[1] || '').trim() });
}

function factionValues(factions) {
  if (factions instanceof Map) return [...factions.values()];
  if (Array.isArray(factions)) return factions;
  if (Array.isArray(factions?.values)) return factions.values;
  if (typeof factions?.values === 'function') return [...factions.values()];
  if (factions && typeof factions === 'object') return Object.values(factions);
  return [];
}

function nestedSyndicateMethods(value, output = [], visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return output;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) nestedSyndicateMethods(item, output, visited);
    return output;
  }
  if (['syndicate-exchange', 'syndicate-exchange-group'].includes(value.type)) output.push(value);
  for (const child of Object.values(value)) nestedSyndicateMethods(child, output, visited);
  return output;
}

function createSyndicateExchangeQuery(options = {}) {
  const knowledge = Array.isArray(options.knowledge) ? options.knowledge : [];
  const mergeMethods = typeof options.mergeMethods === 'function' ? options.mergeMethods : (() => []);
  const factions = factionValues(options.factions);
  const factionById = new Map(factions.map(faction => [faction.id, faction]));
  const factionAliases = new Map();
  for (const faction of factions) {
    if (faction.category !== 'syndicate') continue;
    for (const alias of [faction.displayName, faction.canonical, ...(faction.aliases || [])]) {
      const key = compact(alias);
      if (key) factionAliases.set(key, faction);
    }
  }

  const offers = [];
  const seen = new Set();
  for (const entry of knowledge) {
    const subject = entry?.subject || {};
    for (const method of [...mergeMethods(entry), ...nestedSyndicateMethods(entry)]) {
      if (method?.reviewStatus === 'review-required') continue;
      if (!['syndicate-exchange', 'syndicate-exchange-group'].includes(method?.type)) continue;
      const factionIds = method.type === 'syndicate-exchange-group' ? method.factionIds || [] : [method.factionId];
      const itemName = String(method.variables?.partName || subject.displayName || subject.canonical || '').trim();
      if (!itemName) continue;
      const category = subject.category === 'mod'
        ? 'mod'
        : method.scope === 'component' ? 'archwing-component'
          : subject.category === 'weapon' ? 'weapon' : 'other';
      for (const factionId of factionIds) {
        const faction = factionById.get(factionId);
        if (!faction?.displayName) continue;
        const key = `${compact(itemName)}:${factionId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        offers.push(Object.freeze({
          itemName,
          itemCanonical: subject.canonical || null,
          subjectName: subject.displayName || subject.canonical || itemName,
          factionId,
          factionName: faction.displayName,
          category
        }));
      }
    }
  }

  const itemAliases = new Map();
  const addItemAlias = (alias, rows) => {
    const key = compact(alias);
    if (!key) return;
    const existing = itemAliases.get(key) || [];
    itemAliases.set(key, [...new Map([...existing, ...rows].map(row => [`${row.itemName}:${row.factionId}`, row])).values()]);
  };
  for (const row of offers) {
    addItemAlias(row.itemName, [row]);
    if (row.itemName === row.subjectName) addItemAlias(row.itemCanonical, [row]);
  }
  const bySubject = new Map();
  for (const row of offers) {
    const key = compact(row.subjectName);
    if (!key) continue;
    const rows = bySubject.get(key) || [];
    rows.push(row);
    bySubject.set(key, rows);
  }
  for (const [key, rows] of bySubject) itemAliases.set(key, rows);

  const aliasKeys = [...itemAliases.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  function segmentItems(raw) {
    const source = compact(raw);
    if (!source) return [];
    if (itemAliases.has(source)) return [source];
    const memo = new Map();
    const visit = offset => {
      if (offset === source.length) return [];
      if (memo.has(offset)) return memo.get(offset);
      for (const key of aliasKeys) {
        if (!source.startsWith(key, offset)) continue;
        const rest = visit(offset + key.length);
        if (rest) {
          const result = [key, ...rest];
          memo.set(offset, result);
          return result;
        }
      }
      memo.set(offset, null);
      return null;
    };
    return visit(0) || [];
  }

  function query(text) {
    const parsed = parseSyndicateExchangeCommand(text);
    if (!parsed) return null;
    if (!parsed.query) return Object.freeze({ kind: 'help', text: '用法：集团 物品名；兑换 A B C；集团 集团名' });
    const faction = factionAliases.get(compact(parsed.query));
    if (faction) {
      const rows = offers.filter(row => row.factionId === faction.id && ['mod', 'weapon', 'archwing-component'].includes(row.category));
      const categories = {
        mods: [...new Set(rows.filter(row => row.category === 'mod').map(row => row.itemName))].sort(),
        weapons: [...new Set(rows.filter(row => row.category === 'weapon').map(row => row.itemName))].sort(),
        archwingComponents: [...new Set(rows.filter(row => row.category === 'archwing-component').map(row => row.itemName))].sort()
      };
      const lines = [
        `${faction.displayName}：`,
        `集团 Mod：${categories.mods.join('、') || '无'}`,
        `集团武器：${categories.weapons.join('、') || '无'}`,
        `空战武器部件：${categories.archwingComponents.join('、') || '无'}`
      ];
      return Object.freeze({ kind: 'faction-catalog', factionId: faction.id, factionName: faction.displayName, categories, text: lines.join('\n') });
    }

    const keys = segmentItems(parsed.query);
    if (!keys.length) return Object.freeze({ kind: 'not-found', query: parsed.query, text: `未找到“${parsed.query}”的集团兑换记录。` });
    const results = keys.map(key => {
      const rows = itemAliases.get(key) || [];
      return Object.freeze({
        itemName: rows.length > 1 && rows.every(row => row.subjectName === rows[0].subjectName) ? rows[0].subjectName : rows[0]?.itemName || key,
        offers: rows.map(row => Object.freeze({ itemName: row.itemName, factionId: row.factionId, factionName: row.factionName }))
      });
    });
    const flattened = results.flatMap(result => result.offers);
    const exactSingle = results.length === 1 && new Set(flattened.map(row => row.itemName)).size === 1;
    const textOutput = exactSingle
      ? [...new Set(flattened.map(row => row.factionName))].join('、')
      : results.flatMap(result => {
        const offersByItem = new Map();
        for (const offer of result.offers) {
          const factionNames = offersByItem.get(offer.itemName) || [];
          if (!factionNames.includes(offer.factionName)) factionNames.push(offer.factionName);
          offersByItem.set(offer.itemName, factionNames);
        }
        return [...offersByItem].map(([itemName, factionNames]) => `${itemName}：${factionNames.join('、')}`);
      }).join('\n');
    return Object.freeze({ kind: results.length === 1 ? 'item' : 'items', results, text: textOutput });
  }

  return Object.freeze({ query, offers: Object.freeze(offers), segmentItems });
}

module.exports = { compact, parseSyndicateExchangeCommand, createSyndicateExchangeQuery };
