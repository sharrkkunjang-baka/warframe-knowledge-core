'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { renderGameText } = require('../src/game-text');

const root = path.join(__dirname, '..');
const itemsRoot = path.dirname(require.resolve('warframe-items'));
const dataRoot = path.join(itemsRoot, 'data', 'json');
const outputPath = path.join(root, 'knowledge', 'generated', 'official-items.json');
const sourcesPath = path.join(root, 'generated', 'official-item-sources.json');
const supplementsPath = path.join(root, 'knowledge', 'reviewed', 'current-item-supplements.json');
const packageInfo = require(path.join(itemsRoot, 'package.json'));
const i18n = require(path.join(dataRoot, 'i18n.json'));
const INPUTS = ['Resources', 'Gear', 'Misc', 'Arcanes'];

const ALLOWED_TYPES = Object.freeze({
  Resources: new Set(['Resource', 'Gem', 'Plant']),
  Gear: new Set(['Gear', 'Fish', 'Specter', 'Fish Bait', 'Key']),
  Misc: new Set([
    'Resource', 'Conservation Tag', 'Equipment Adapter', 'Fish Part', 'Medallion', 'Focus Lens',
    'Cut Gem', 'Ayatan Sculpture', 'Ayatan Star', 'Pet Resource', 'Eidolon Shard', 'Alloy',
    'Boosters', 'Key', 'Currency', 'Fish Bait'
  ]),
  Arcanes: new Set([
    'Warframe Arcane', 'Arcane', 'Operator Arcane', 'Secondary Arcane', 'Amp Arcane',
    'Primary Arcane', 'Melee Arcane', 'Zaw Arcane', 'Kitgun Arcane', 'Bow Arcane', 'Shotgun Arcane'
  ])
});

const EXCLUSIONS = Object.freeze([
  ['unstable-identity', item => !String(item.uniqueName || '').startsWith('/Lotus/') || !String(item.name || '').trim()],
  ['captura-scene', item => item.type === 'Captura' || /(?:Photobooth|PhotoBooth|Captura|\bScene\b)/i.test(`${item.uniqueName} ${item.name}`)],
  ['exalted-weapon', item => item.type === 'Exalted Weapon' || /\/Powersuits\/.*(?:Weapon|Sword|Pistols|Claws|Melee|Bow)/i.test(item.uniqueName || '')],
  ['weapon-amp-kitgun-component', item => ['Amp', 'Kitgun Component', 'K-Drive Component', 'Pistol', 'Rifle'].includes(item.type)
    && !/Arcane Adapter$/i.test(item.name || '')
    && item.uniqueName !== '/Lotus/Types/Items/MiscItems/HeavyWeaponCatalyst'],
  ['ship-or-ship-component', item => ['Ship Segment', 'Orbiter', 'Extractor'].includes(item.type)
    || /\/Types\/(?:Items\/Ships|Ship\/|Game\/CrewShip\/Ships)\//i.test(item.uniqueName || '')],
  ['fusion-or-reward-bundle', item => /(?:FusionBundles?|RewardBundles?|Randomized\/Raw)/i.test(`${item.uniqueName} ${item.name}`)],
  ['store-item-mirror', item => /\/StoreItems\//i.test(item.uniqueName || '')],
  ['cosmetic-or-decoration', item => /(?:Skin|Helmet|Syandana|Armor|Deco|Glyph|Emote|ColorPicker|OperatorSuit|Simulacrum|Conservation Prey|Pet Collar)/i.test(item.type || '')
    || /(?:\/Skins\/|\/Cosmetics\/|\/SongItems\/|\/LoreCards\/|\/Gifts\/)/i.test(item.uniqueName || '')],
  ['weapon-component-material', item => item.sourceCategory === 'Resources'
    && /(?:Weapon (?:Pod|Barrel|Receiver|Stock)|(?:Cortege|Morgha) (?:Barrel|Receiver|Stock))$/i.test(item.name || '')],
  ['base-class-or-placeholder', item => /^(?:Arcane|Photoboothtile|Dangerroomtile|Shipfeatureitem|Plantitem|Dogtag|Autoshareddogtag|Tnwarchonitembase)$/i.test(item.name || '')
    || /(?:Base|Placeholder|Test|Dummy|Generic)(?:Item|Resource|Upgrade|Class)?$/i.test(item.name || '')
    || /\[(?:ph|placeholder|test)\]/i.test(item.name || '')],
  ['internal-name', item => {
    if (i18n[item.uniqueName]?.zh?.name) return false;
    const name = String(item.name || '');
    if (!/^[A-Za-z0-9]+$/.test(name)) return false;
    return name.length > 18 || /(?:storeitem|fusionbundle|dogtag|tile|base|upgrade|unlocker|blueprint|randommod)$/i.test(name);
  }]
]);

function allowedSemanticKind(item, sourceCategory) {
  const type = String(item.type || '');
  if (sourceCategory === 'Misc' && /Arcane Adapter$/i.test(item.name || '')) return 'upgrade-item';
  // Gravimag 的上游 type 错标为 Rifle，但它是安装在曲翼枪械上的一次性升级物品。
  if (sourceCategory === 'Misc' && item.uniqueName === '/Lotus/Types/Items/MiscItems/HeavyWeaponCatalyst') return 'upgrade-item';
  if (!ALLOWED_TYPES[sourceCategory]?.has(type)) {
    if (sourceCategory === 'Misc' && type === 'Misc') {
      const text = `${item.name || ''} ${item.uniqueName || ''}`;
      if (['/Lotus/Types/Items/MiscItems/WaterFightBucks', '/Lotus/Types/Items/MiscItems/1999ConquestBucks', '/Lotus/Types/Items/MiscItems/MechSurvivalEventCreds'].includes(item.uniqueName)) return 'currency-token';
      if (/ArchonCrystal|Archon Shard/i.test(text)) return 'archon-shard';
      if (/(?:Adapter|Reactor|Catalyst|Forma|Lens|Booster)/i.test(text)) return 'upgrade-item';
      if (item.components?.length || item.drops?.length) return 'material-or-usable';
      if (/(?:Cred|Credit|Token|Pearl|Stock|Ducat|Kuva|Vosfor|Holokey|Isoplast|Vainthorn|Thermia|Cipher|Key|Coordinate|Beacon|Fragment|Shard|Cell|Extract|Alloy|Resource|Code)$/i.test(item.name || '')) return 'currency-token-material';
    }
    return null;
  }
  if (sourceCategory === 'Arcanes') return 'arcane';
  const map = {
    Resource: 'resource', Gem: 'mineral', Plant: 'plant', Gear: 'gear', Fish: 'fish', Specter: 'consumable',
    'Fish Bait': 'fish-bait', Key: 'key', 'Conservation Tag': 'conservation-tag', 'Equipment Adapter': 'upgrade-item',
    'Fish Part': 'fish-part', Medallion: 'currency-token', 'Focus Lens': 'focus-lens', 'Cut Gem': 'mineral',
    'Ayatan Sculpture': 'ayatan', 'Ayatan Star': 'ayatan', 'Pet Resource': 'material', 'Eidolon Shard': 'material',
    Alloy: 'material', Boosters: 'booster', Currency: 'currency'
  };
  return map[type] || type.toLowerCase();
}

function classifyItem(item, sourceCategory) {
  const candidate = { ...item, sourceCategory };
  for (const [reason, matches] of EXCLUSIONS) if (matches(candidate)) return { include: false, reason };
  const semanticKind = allowedSemanticKind(item, sourceCategory);
  return semanticKind ? { include: true, semanticKind } : { include: false, reason: 'semantic-kind-not-allowed' };
}

function semanticKinds(item, sourceCategory, primaryKind = allowedSemanticKind(item, sourceCategory)) {
  const kinds = new Set([primaryKind]);
  const text = `${item.name || ''} ${item.type || ''}`;
  if (/adapter/i.test(text)) kinds.add('adapter');
  if (/arcane/i.test(text) || sourceCategory === 'Arcanes') kinds.add('arcane');
  if (item.components?.length) kinds.add('craftable');
  if (item.drops?.length || item.components?.some(component => component.drops?.length)) kinds.add('droppable');
  return [...kinds].filter(Boolean).sort();
}

function isUserFacing(item, sourceCategory = item.sourceCategory || 'Misc') { return classifyItem(item, sourceCategory).include; }

function recipeFrom(item) {
  if (!item.components?.length) return null;
  return {
    id: `${item.uniqueName}#recipe-${Number(item.buildQuantity || 1)}`,
    outputQuantity: Number(item.buildQuantity || 1),
    credits: Number(item.buildPrice || 0),
    buildTimeSeconds: Number(item.buildTime || 0),
    consumeOnBuild: item.consumeOnBuild !== false,
    ingredients: item.components.map(component => ({ uniqueName: component.uniqueName || null, canonical: component.name || null, quantity: Number(component.itemCount || 0), drops: component.drops || [] }))
  };
}

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function increment(map, key) { map[key] = (map[key] || 0) + 1; }
function countSummary(counts) {
  const reasons = Object.entries(counts.excludedByReason || {}).sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${reason}=${count}`).join('，');
  return `${counts.items} 个目录内物品；从 ${counts.input} 个候选中排除 ${counts.excluded} 个目录边界外/内部/重复对象（${reasons}）`;
}

function buildOfficialItems(generatedAt = new Date().toISOString()) {
  const byUniqueName = new Map();
  const sourceFiles = {};
  const excludedByReason = {};
  for (const category of INPUTS) {
    const file = `${category}.json`;
    const values = require(path.join(dataRoot, file));
    const fileReasons = {};
    sourceFiles[category] = { file, inputCount: values.length, includedCount: 0, excludedCount: 0, excludedByReason: fileReasons };
    for (const item of values) {
      const classification = classifyItem(item, category);
      if (!classification.include) {
        sourceFiles[category].excludedCount += 1;
        increment(fileReasons, classification.reason);
        increment(excludedByReason, classification.reason);
        continue;
      }
      if (byUniqueName.has(item.uniqueName)) {
        sourceFiles[category].excludedCount += 1;
        increment(fileReasons, 'duplicate-uniqueName');
        increment(excludedByReason, 'duplicate-uniqueName');
        continue;
      }
      sourceFiles[category].includedCount += 1;
      const localized = i18n[item.uniqueName]?.zh || {};
      const recipe = recipeFrom(item);
      const recipes = recipe ? [recipe] : [];
      const recipeVariants = [];
      if (item.name === 'Cipher') {
        recipeVariants.push({ id: 'cipher.single', aliases: ['Cipher', '1x Cipher', '1 Cipher', '破解器'], outputQuantity: 1, recipeId: recipe?.id || null, evidenceStatus: recipe ? 'upstream' : 'missing' });
        recipeVariants.push({ id: 'cipher.100x', aliases: ['100x Cipher', 'Cipher x100', '100 Cipher', '100个破解器', '破解器x100'], outputQuantity: 100, recipeId: null, evidenceStatus: 'wiki-required', pendingWikiEvidence: true, note: '当前 warframe-items 快照未提供 100x Cipher 配方；仅保留变体解析，不补写材料或价格。' });
      }
      byUniqueName.set(item.uniqueName, {
        uniqueName: item.uniqueName, canonical: item.name, displayName: localized.name || item.name,
        localizationStatus: localized.name && localized.name !== item.name ? 'official-zh' : 'fallback-en',
        kind: category.toLowerCase(), semanticKinds: semanticKinds(item, category, classification.semanticKind),
        description: { canonical: renderGameText(item.description || ''), display: renderGameText(localized.description || item.description || '') },
        tradable: Boolean(item.tradable), drops: item.drops || [], recipes, recipeVariants,
        ...(category === 'Arcanes' ? {
          arcaneType: item.type || null,
          equipmentClass: ({ 'Warframe Arcane': 'Warframe', Arcane: 'Warframe', 'Primary Arcane': 'Primary', 'Bow Arcane': 'Bow', 'Shotgun Arcane': 'Shotgun', 'Secondary Arcane': 'Secondary', 'Melee Arcane': 'Melee', 'Operator Arcane': 'Operator', 'Amp Arcane': 'Amp', 'Kitgun Arcane': 'Kitgun', 'Zaw Arcane': 'Zaw' })[item.type] || null,
          rarity: item.rarity || null,
          levelStats: (localized.levelStats || item.levelStats || []).map(level => ({ ...level, stats: (level.stats || []).map(renderGameText) })),
          maxRank: Math.max(0, (item.levelStats?.length || 1) - 1)
        } : {}),
        buildQuantity: Number(item.buildQuantity || 1), sourceCategory: category, sourceFile: file
      });
    }
  }
  const supplements = fs.existsSync(supplementsPath) ? JSON.parse(fs.readFileSync(supplementsPath, 'utf8')).items || [] : [];
  for (const item of supplements) {
    if (byUniqueName.has(item.uniqueName)) continue;
    byUniqueName.set(item.uniqueName, item);
  }
  const items = [...byUniqueName.values()].sort((a, b) => a.uniqueName.localeCompare(b.uniqueName));
  const upstreamInputCount = Object.values(sourceFiles).reduce((sum, source) => sum + source.inputCount, 0);
  const inputCount = upstreamInputCount + supplements.length;
  return {
    catalog: {
      schemaVersion: 1, generatedAt,
      source: { package: packageInfo.name, version: packageInfo.version, repository: 'https://github.com/WFCD/warframe-items', inputs: [...INPUTS.map(name => `${name}.json`), 'knowledge/reviewed/current-item-supplements.json'], localization: 'i18n.json + DE Languages.bin reviewed supplements' },
      counts: { input: inputCount, items: items.length, excluded: inputCount - items.length, byKind: Object.fromEntries(INPUTS.map(name => [name.toLowerCase(), items.filter(item => item.kind === name.toLowerCase()).length])), excludedByReason },
      items
    },
    sources: {
      schemaVersion: 1, generatedAt, package: packageInfo.name, version: packageInfo.version,
      repository: 'https://github.com/WFCD/warframe-items', upstream: 'Warframe Public Export', files: sourceFiles,
      policy: { boundary: 'player-obtainable non-cosmetic items', semanticKindAllowlist: Object.fromEntries(Object.entries(ALLOWED_TYPES).map(([key, values]) => [key, [...values].sort()])), explicitExclusionReasons: EXCLUSIONS.map(([reason]) => reason) },
      counts: { input: inputCount, included: items.length, excluded: inputCount - items.length, excludedByReason },
      supplements: { file: 'knowledge/reviewed/current-item-supplements.json', count: supplements.length, sourcePolicy: 'DE identity/localization plus current wiki.warframe.com directory evidence' },
      caveats: [{ item: 'Cipher', variant: '100x Cipher', status: 'wiki-required', reason: `warframe-items ${packageInfo.version} does not include the 100x blueprint recipe` }]
    }
  };
}

function main() {
  const check = process.argv.includes('--check');
  const current = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
  const generatedAt = check && current?.generatedAt ? current.generatedAt : new Date().toISOString();
  const built = buildOfficialItems(generatedAt);
  if (check) {
    const currentSources = fs.existsSync(sourcesPath) ? JSON.parse(fs.readFileSync(sourcesPath, 'utf8')) : null;
    if (serialize(current) !== serialize(built.catalog) || serialize(currentSources) !== serialize(built.sources)) { console.error('官方物品目录或来源元数据需要同步'); process.exit(1); }
    console.log(`官方物品目录已同步：${countSummary(built.catalog.counts)}`);
    return;
  }
  fs.writeFileSync(outputPath, serialize(built.catalog));
  fs.writeFileSync(sourcesPath, serialize(built.sources));
  console.log(`已生成官方物品目录：${countSummary(built.catalog.counts)}`);
}

if (require.main === module) main();
module.exports = { ALLOWED_TYPES, EXCLUSIONS, buildOfficialItems, classifyItem, isUserFacing, allowedSemanticKind, semanticKinds, serialize, countSummary };
