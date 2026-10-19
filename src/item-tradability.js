'use strict';
const fs = require('node:fs');
const path = require('node:path');
const reviewedRules = require('../knowledge/reviewed/non-tradable-items.json').entries;
const identityKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s·・‧•_\-]+/gu, '');
function reviewedNonTradableItem(input) {
  const item = typeof input === 'string' ? { canonical: input } : input || {};
  const unique = item.uniqueName || item.officialUniqueName || item.gameRef;
  const names = [item.canonical, item.name, item.displayName].filter(Boolean).map(identityKey).map(name => name.replace(/(?:(?:blueprint|neuroptics|chassis|systems|barrel|receiver|stock|blade|hilt|set|全套|总图|蓝图|头部神经光元|机体|系统|枪管|枪机|枪托|刀刃|握柄))+$/u, ''));
  return reviewedRules.find(rule => (unique && unique === rule.uniqueName) ||
    [rule.canonical, rule.displayName, ...rule.aliases].some(name => names.includes(identityKey(name)))) || null;
}
let rows;
function marketRows() {
  if (rows) return rows;
  try { rows = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../warframe-runtime/state/wfm-lkg.json'), 'utf8')).entries['items:catalog'].data; }
  catch (_) { rows = []; }
  return rows;
}
function resolveItemTradable(item, catalog = marketRows()) {
  if (reviewedNonTradableItem(item)) return false;
  const unique = item.uniqueName || item.officialUniqueName;
  const canonical = String(item.name || item.canonical || '').normalize('NFKC').trim().toLowerCase();
  const match = catalog.find(row => unique && row.gameRef === unique)
    || catalog.find(row => canonical && String(row.i18n?.en?.name || row.canonical || '').normalize('NFKC').trim().toLowerCase() === canonical);
  return match ? match.tradable !== false : item.tradable;
}
module.exports = { resolveItemTradable, reviewedNonTradableItem };

