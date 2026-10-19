'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { REGION_ORDER, REGION_NAMES, REGION_ALIASES } = require('./fishing');

const TABLE_ALIASES = Object.freeze(['挖矿', '挖矿表', '矿物', '矿物表', '宝石', '宝石表']);
const EXTRA_ALIASES = Object.freeze({ '酸化矿物': Object.freeze(['酸性矿物']) });
const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[\s·・‧•_\-/]+/g, '');

function enemyDisplayName(root, canonical) {
  const slug = String(canonical || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = path.join(root, 'knowledge', 'enemies', 'enemy', `${slug}.json`);
  if (!slug || !fs.existsSync(file)) return canonical;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).displayName || canonical; } catch (_) { return canonical; }
}

function veinLabel(region, type) {
  if (type === 'gem') return '宝石（蓝色矿脉）';
  return region === 'cambion-drift' ? '矿物（黄色矿脉）' : '矿物（红色矿脉）';
}

function parseMiningCommand(text) {
  const raw = String(text || '').normalize('NFKC').trim().replace(/^[\\/。.．]\s*/u, '');
  const alias = TABLE_ALIASES.find(value => raw === value || raw.startsWith(`${value} `));
  if (!alias) return null;
  let query = raw.slice(alias.length).trim(), region = null;
  for (const [id, aliases] of Object.entries(REGION_ALIASES)) {
    const matched = aliases.find(value => query === value || query.startsWith(`${value} `));
    if (matched) { region = id; query = query.slice(matched.length).trim(); break; }
  }
  return query ? { kind: 'mining-query', query, region } : { kind: 'mining-table', region };
}

function createMiningQueries(root = path.join(__dirname, '..')) {
  const official = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'generated', 'official-items.json'), 'utf8'));
  const source = Array.isArray(official) ? official : official.items || official.entries || [];
  const sourceByUniqueName = new Map(source.map(item => [item.uniqueName, item]));
  const catalogFile = path.join(root, 'generated', 'resource-asset-catalog.json');
  const catalog = fs.existsSync(catalogFile) ? JSON.parse(fs.readFileSync(catalogFile, 'utf8')) : { entries: [] };
  const assets = new Map((catalog.entries || catalog.resources || []).map(entry => [entry.stableIdentity?.uniqueName, entry]));
  const regionByPath = { Eidolon: 'plains-of-eidolon', Solaris: 'orb-vallis', Deimos: 'cambion-drift' };
  const processedItems = source.filter(item => /\/Types\/Items\/Gems\/(Eidolon|Solaris|Deimos)\/.+(?:Alloy|Cut)[AB]?Item$/i.test(item.uniqueName || ''));
  const imageFor = item => {
    const asset = assets.get(item.uniqueName) || {};
    return { kind: 'resource', uniqueName: item.uniqueName, canonical: item.canonical, displayName: item.displayName, expectedMediaFilename: asset.expectedMediaFilename || null };
  };
  const items = source.filter(item => /\/Types\/Items\/Gems\/(Eidolon|Solaris|Deimos)\/(?:Solaris|Deimos)?(?:Common|Uncommon|Rare|Eidolon)(?:Gem|Ore)[AB]?Item$/i.test(item.uniqueName || ''))
    .map(item => {
      const family = Object.keys(regionByPath).find(key => item.uniqueName.includes(`/${key}/`));
      const type = /(?:Gem)[AB]?Item$/i.test(item.uniqueName) ? 'gem' : 'ore';
      const rawPrefix = item.uniqueName.replace(/Item$/i, '');
      const processedItem = processedItems.find(candidate => candidate.uniqueName.startsWith(rawPrefix) && (type === 'gem' ? /Cut/i : /Alloy/i).test(candidate.uniqueName));
      const recipe = processedItem?.recipes?.[0] || null;
      const processed = processedItem ? Object.freeze({
        stableId: processedItem.uniqueName,
        canonical: processedItem.canonical,
        displayName: processedItem.displayName,
        aliases: processedItem.aliases || [],
        image: imageFor(processedItem),
        recipe: recipe ? Object.freeze({
          outputQuantity: Number(recipe.outputQuantity || processedItem.buildQuantity || 1),
          credits: Number(recipe.credits || 0),
          buildTimeSeconds: Number(recipe.buildTimeSeconds || 0),
          ingredients: Object.freeze((recipe.ingredients || [])
            .filter(ingredient => ingredient.canonical !== 'Blueprint' && !/\/Types\/Recipes\//.test(ingredient.uniqueName || ''))
            .map(ingredient => {
              const identity = sourceByUniqueName.get(ingredient.uniqueName) || ingredient;
              return Object.freeze({
                stableId: ingredient.uniqueName,
                canonical: identity.canonical || ingredient.canonical,
                displayName: identity.displayName || ingredient.displayName || ingredient.canonical,
                quantity: Number(ingredient.quantity || 0),
                isMineral: /\/Types\/Items\/Gems\/(?:Eidolon|Solaris|Deimos)\//i.test(identity.uniqueName || ingredient.uniqueName || ''),
                image: imageFor(identity)
              });
            }))
        }) : null
      }) : null;
      const directDrops = (item.drops || [])
        .filter(drop => normalize(drop.type) === normalize(item.canonical))
        .map(drop => Object.freeze({ kind: 'enemy-drop', canonical: drop.location, displayName: enemyDisplayName(root, drop.location), chance: Number(drop.chance || 0) }))
        .sort((a, b) => a.chance - b.chance || Number(/^Narmer\b/i.test(a.canonical)) - Number(/^Narmer\b/i.test(b.canonical)) || a.displayName.localeCompare(b.displayName, 'zh-CN'));
      const thumperDrops = directDrops.filter(drop => /^(?:Narmer|Tusk) Thumper(?: Bull| Doma)?$/i.test(drop.canonical));
      const extraSources = thumperDrops.length ? [
        Object.freeze({
          kind: 'enemy-family-drop',
          canonical: 'Tusk Thumper family',
          displayName: '任意巨牙重击者',
          chanceMin: Math.min(...thumperDrops.map(drop => drop.chance)),
          chanceMax: Math.max(...thumperDrops.map(drop => drop.chance))
        }),
        ...directDrops.filter(drop => !thumperDrops.includes(drop))
      ] : directDrops;
      const region = regionByPath[family];
      const aliases = Object.freeze([...new Set([...(item.aliases || []), ...(EXTRA_ALIASES[item.displayName] || []), ...(EXTRA_ALIASES[item.canonical] || [])])]);
      return Object.freeze({ stableId: item.uniqueName, canonical: item.canonical, displayName: item.displayName, aliases, region, regionName: REGION_NAMES[region], type, typeName: veinLabel(region, type), rarity: /Eidolon/.test(path.basename(item.uniqueName)) ? '稀有' : /Rare/.test(path.basename(item.uniqueName)) ? '稀有' : /Uncommon/.test(path.basename(item.uniqueName)) ? '罕见' : '常见', description: item.description?.display || '', image: imageFor(item), extraSources: Object.freeze(extraSources), processed });
    });
  function table(regionId = null) {
    const ids = regionId ? [regionId] : REGION_ORDER;
    return { kind: 'mining-table', title: regionId ? REGION_NAMES[regionId] : '矿物表', regions: ids.map(id => ({ id, displayName: REGION_NAMES[id], groups: ['ore', 'gem'].map(type => ({ type, displayName: type === 'ore' ? '矿物' : '宝石', items: items.filter(item => item.region === id && item.type === type) })) })), footerLines: ['输入“挖矿 地区”只看单个平原；输入“挖矿 矿物名”查看具体来源。'] };
  }
  function resolve(query) {
    const key = normalize(query);
    // Processed gems/alloys are represented by the raw mineral entry so the
    // detail renderer can show the complete recipe (raw inputs → processed
    // output).  They must still be first-class query targets: `挖矿 阿德拉玛
    // 合金` and the shared `刷/wk` route should resolve to the same card as
    // `挖矿 阿德拉玛金属`.
    const processedExact = items.find(item => item.processed && [
      item.processed.displayName,
      item.processed.canonical,
      ...(item.processed.aliases || [])
    ].some(value => normalize(value) === key));
    if (processedExact) return { kind: 'mining-detail', title: processedExact.processed.displayName, item: processedExact, queryTarget: 'processed' };
    const exact = items.find(item => [item.displayName, item.canonical, ...item.aliases].some(value => normalize(value) === key));
    if (exact) return { kind: 'mining-detail', title: exact.displayName, item: exact };
    const processedFuzzy = items.filter(item => item.processed && [
      item.processed.displayName,
      item.processed.canonical,
      ...(item.processed.aliases || [])
    ].some(value => normalize(value).includes(key) || key.includes(normalize(value))));
    if (processedFuzzy.length === 1) return { kind: 'mining-detail', title: processedFuzzy[0].processed.displayName, item: processedFuzzy[0], queryTarget: 'processed' };
    const fuzzy = items.filter(item => [item.displayName, item.canonical, ...item.aliases].some(value => normalize(value).includes(key) || key.includes(normalize(value))));
    return fuzzy.length === 1 ? { kind: 'mining-detail', title: fuzzy[0].displayName, item: fuzzy[0] } : { kind: 'mining-not-found', title: '矿物查询', query, suggestions: fuzzy.slice(0, 8).map(item => item.displayName) };
  }
  function query(text) { const parsed = parseMiningCommand(text); if (!parsed) return null; return parsed.kind === 'mining-table' ? table(parsed.region) : resolve(parsed.query); }
  return Object.freeze({ items, parseCommand: parseMiningCommand, table, resolve, query });
}

module.exports = { TABLE_ALIASES, parseMiningCommand, createMiningQueries };
