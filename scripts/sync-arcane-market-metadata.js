'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CATALOG = path.join(ROOT, 'knowledge', 'acquisition', 'arcane', 'catalog.json');
const TARGET = path.join(ROOT, 'generated', 'arcane-market-metadata.json');
const WFM_ITEMS_URL = 'https://api.warframe.market/v2/items';
const USER_AGENT = 'sharrknyana-qq-bot/1.0 (contact: sharrknyana.wiki)';
const TAX_BY_RARITY = Object.freeze({ common: 2000, uncommon: 4000, rare: 8000, legendary: 100000 });

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function rarityFromTags(tags) {
  return Object.keys(TAX_BY_RARITY).find(rarity => (tags || []).map(tag => String(tag).toLowerCase()).includes(rarity)) || null;
}

function buildPlan(items, catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'))) {
  const arcanes = (items || []).filter(item => (item.tags || []).some(tag => /arcane/i.test(String(tag))));
  const byCanonical = new Map(arcanes.map(item => [normalize(item.i18n?.en?.name), item]));
  const entries = catalog.arcanes.map(identity => {
    const market = byCanonical.get(normalize(identity.canonical));
    if (!market) {
      return {
        canonical: identity.canonical,
        officialUniqueName: identity.officialUniqueName,
        marketSlug: null,
        marketGameRef: null,
        maxRank: null,
        rarity: null,
        tradingTax: null,
        tradingTaxStatus: 'unavailable-legacy',
        tradable: false
      };
    }
    const rarity = rarityFromTags(market.tags) || String(market.rarity || '').toLowerCase() || null;
    const tradingTax = Number.isInteger(market.tradingTax) ? market.tradingTax : (rarity ? TAX_BY_RARITY[rarity] : null);
    return {
      canonical: identity.canonical,
      officialUniqueName: identity.officialUniqueName,
      marketSlug: market.slug,
      marketGameRef: market.gameRef || null,
      maxRank: Number.isInteger(market.maxRank) ? market.maxRank : null,
      rarity,
      tradingTax,
      tradingTaxStatus: Number.isInteger(market.tradingTax) ? 'wfm-v2-detail' : (rarity ? 'official-wiki-rarity-rule' : 'missing-rarity'),
      tradable: market.bulkTradable !== false
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      identityAndRank: WFM_ITEMS_URL,
      tradingTaxRule: 'https://wiki.warframe.com/w/Trading#Trade_Tax'
    },
    counts: {
      core: entries.length,
      marketMatched: entries.filter(entry => entry.marketSlug).length,
      taxAvailable: entries.filter(entry => Number.isInteger(entry.tradingTax)).length,
      unavailableLegacy: entries.filter(entry => entry.tradingTaxStatus === 'unavailable-legacy').length
    },
    entries
  };
}

async function fetchMarketItems(fetchImpl = fetch) {
  const response = await fetchImpl(WFM_ITEMS_URL, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`WFM items HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.data)) throw new Error('WFM items 目录无效');
  return payload.data;
}

async function enrichMissingRarities(items, fetchImpl = fetch) {
  const output = [];
  for (const item of items) {
    if (rarityFromTags(item.tags) || item.rarity || !(item.tags || []).some(tag => /arcane/i.test(String(tag)))) {
      output.push(item);
      continue;
    }
    const response = await fetchImpl(`https://api.warframe.market/v2/item/${encodeURIComponent(item.slug)}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`WFM item ${item.slug} HTTP ${response.status}`);
    const detail = (await response.json())?.data || {};
    output.push({ ...item, ...detail, i18n: { ...(item.i18n || {}), ...(detail.i18n || {}) } });
  }
  return output;
}

async function run(options = {}) {
  const items = options.items || await fetchMarketItems(options.fetchImpl);
  const plan = buildPlan(await enrichMissingRarities(items, options.fetchImpl));
  fs.writeFileSync(TARGET, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(`赋能市场元数据：${plan.counts.marketMatched}/${plan.counts.core} 匹配，${plan.counts.taxAvailable} 项有交易税，${plan.counts.unavailableLegacy} 项历史不可用`);
  return plan;
}

if (require.main === module) {
  run().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = { TAX_BY_RARITY, buildPlan, enrichMissingRarities, fetchMarketItems, rarityFromTags, run };
