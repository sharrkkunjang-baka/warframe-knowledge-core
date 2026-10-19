'use strict';

// Official Simplified-Chinese item names.
//
// Crafting ingredient rows in `knowledge/**` carry hand-written `displayName`
// values, and several of them drifted away from the strings DE actually ships.
// `ZarimanMiscItemB` was stored as "恩培立烛" while the official zh-CN name is
// "英择谛灯笼"; `VoidWraithItem` was stored as "瑟拉格等离子" instead of
// "凶魂浆质". A few knowledge files also identify an ingredient by its English
// canonical name ("Entrati Lanthorn", "Voidgel Orb") instead of a `/Lotus/...`
// uniqueName, so a uniqueName-only lookup misses them.
//
// Every card and text renderer that prints a material name must therefore
// resolve the item identity here first and only fall back to the stored value
// when no official table knows the item. This module is the single owner of
// that resolution so frame cards and weapon cards cannot drift apart again.

const fs = require('node:fs');
const path = require('node:path');

const CORE_ROOT = path.resolve(__dirname, '..');
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'));
const ITEMS_DATA = path.join(ITEMS_ROOT, 'data', 'json');

// Reviewed names that must win over the generic tables. These were audited by
// hand (Tau bounty tokens, and resources whose in-game string differs from the
// older transcription still used by parts of the item package).
const OFFICIAL_ITEM_ZH = Object.freeze({
  '/Lotus/Types/Gameplay/Tau/Resources/TwelveResourceCommonItem': '名盘',
  '/Lotus/Types/Gameplay/Tau/Resources/TwelveResourceUncommonItem': '荣誉勋章',
  '/Lotus/Types/Gameplay/Tau/Resources/TwelveResourceRareItem': '军功勋章',
  '/Lotus/Types/Items/MiscItems/OrokinCell': '奥罗金电池',
  '/Lotus/Types/Items/MiscItems/Plastids': '生物质',
  '/Lotus/Types/Items/MiscItems/PolymerBundle': '聚合物束'
});

const byUniqueName = new Map();
const byCanonical = new Map();
const ambiguous = new Set();

function text(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw || '';
}
// Higher-priority source wins; the first registration for an identity sticks.
function registerUnique(uniqueName, zhName) {
  const key = text(uniqueName);
  const name = text(zhName);
  if (!key || !name || byUniqueName.has(key)) return;
  byUniqueName.set(key, name);
}
// An English canonical that maps to two different zh names is not safe to
// rename from, so it is dropped and the stored value is kept.
function registerCanonical(canonical, zhName) {
  const key = text(canonical);
  const name = text(zhName);
  if (!key || !name || ambiguous.has(key)) return;
  if (byUniqueName.has(key)) return;
  if (byCanonical.has(key)) {
    if (byCanonical.get(key) !== name) { byCanonical.delete(key); ambiguous.add(key); }
    return;
  }
  byCanonical.set(key, name);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { return null; }
}

for (const [uniqueName, zhName] of Object.entries(OFFICIAL_ITEM_ZH)) registerUnique(uniqueName, zhName);

// 1) Reviewed resource asset registry (wiki-provenanced, also drives currency icons).
const reviewedAssets = readJson(path.join(CORE_ROOT, 'knowledge', 'assets', 'reviewed-resource-assets.json'));
for (const entry of reviewedAssets?.entries || []) {
  registerUnique(entry.uniqueName, entry.displayName);
  registerCanonical(entry.canonical, entry.displayName);
}

// 2) Generated official item index (warframe-items + Public Export, zh reviewed).
const officialItems = readJson(path.join(CORE_ROOT, 'knowledge', 'generated', 'official-items.json'));
for (const item of officialItems?.items || []) {
  if (text(item.localizationStatus) && !/^official/.test(text(item.localizationStatus))) continue;
  registerUnique(item.uniqueName, item.displayName);
  registerCanonical(item.canonical, item.displayName);
}

// 3) Full DE localization table. `require` so it shares the already loaded copy.
const I18N = require(path.join(ITEMS_DATA, 'i18n.json'));
for (const [uniqueName, locales] of Object.entries(I18N)) {
  registerUnique(uniqueName, locales && locales.zh && locales.zh.name);
}

// 4) English canonical bridge: i18n.json has no English locale, so pair the
//    package's English item names with the official zh string of the same
//    uniqueName. Only the item families that appear as crafting materials.
for (const file of ['Resources.json', 'Misc.json', 'Gear.json', 'Arcanes.json']) {
  let items;
  try { items = require(path.join(ITEMS_DATA, file)); } catch (error) { continue; }
  if (!Array.isArray(items)) continue;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const locales = I18N[item.uniqueName];
    registerCanonical(item.name, locales && locales.zh && locales.zh.name);
  }
}

// Resolves an ingredient identity to the official zh name. `key` may be a
// `/Lotus/...` uniqueName or an English canonical name; returns null when no
// official table knows the item, so callers keep their stored value.
function officialItemZhName(key) {
  const probe = text(key);
  if (!probe) return null;
  return byUniqueName.get(probe) || byCanonical.get(probe) || null;
}

function officialNameIndexStats() {
  return {
    uniqueNames: byUniqueName.size,
    canonicalNames: byCanonical.size,
    ambiguousCanonicalCount: ambiguous.size,
    ambiguousCanonicalSample: [...ambiguous].slice(0, 20)
  };
}

module.exports = { OFFICIAL_ITEM_ZH, officialItemZhName, officialNameIndexStats };
