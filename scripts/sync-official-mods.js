'use strict';

const fs = require('fs');
const path = require('path');
const Items = require('warframe-items');
const { readCategoryDirectory, readEntryDirectory } = require('../src/loader');

const root = path.join(__dirname, '..');
const knowledgeRoot = path.join(root, 'knowledge');
const outputPath = path.join(knowledgeRoot, 'categories', 'official.json');
const packagePath = path.join(path.dirname(require.resolve('warframe-items')), 'package.json');

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function slug(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function addCategory(map, id, dimension, canonical) {
  if (!id || map.has(id)) return;
  map.set(id, { id, dimension, canonical, count: 0, localCategoryIds: [], status: 'missing' });
}

function getTraitCategories(item) {
  const traits = [];
  const isCorrupted = (item.drops || []).some(drop =>
    drop.location === 'Derelict Vault' && drop.type === item.name);
  const isNightmare = (item.drops || []).some(drop =>
    /^Nightmare Mode Rewards/.test(drop.location) && drop.type === item.name);
  const isPvp = /\/PvPMods\//.test(item.uniqueName || '') || /PvPAugmentCard/.test(item.uniqueName || '');
  const isArchon = /^Archon /.test(item.name || '');
  const isDrift = /\/OrokinChallenge\//.test(item.uniqueName || '') && / Drift$/.test(item.name || '');
  if (item.isPrime) traits.push(['trait.prime', 'Prime Mods']);
  if (item.isAugment) traits.push(['trait.augment', 'Augment Mods']);
  if (item.isExilus) traits.push(['trait.exilus', 'Exilus Mods']);
  if (item.isUtility) traits.push(['trait.utility', 'Utility Mods']);
  if (item.modSet) traits.push(['trait.set', 'Set Mods']);
  if (/Riven Mod$/.test(item.type || '')) traits.push(['trait.riven', 'Riven Mods']);
  if (item.type === 'Peculiar Mod') traits.push(['trait.peculiar', 'Peculiar Mods']);
  if (item.type === 'Stance Mod') traits.push(['trait.stance', 'Stance Mods']);
  if (item.type === 'Posture Mod') traits.push(['trait.posture', 'Posture Mods']);
  if (isCorrupted) traits.push(['trait.corrupted', 'Corrupted Mods']);
  if (isNightmare) traits.push(['trait.nightmare', 'Nightmare Mode Mods']);
  if (isPvp) traits.push(['trait.pvp', 'PvP Mods']);
  if (isArchon) traits.push(['trait.archon', 'Archon Mods']);
  if (isDrift) traits.push(['trait.drift', 'Drift Mods']);
  return traits;
}

function findLocalCategoryMatches(officialCategory, localCategories) {
  const officialNames = new Set([officialCategory.id, officialCategory.canonical].map(normalize));
  return localCategories
    .filter(category => [category.id, category.canonical, category.displayName, ...(category.aliases || [])]
      .some(name => officialNames.has(normalize(name))))
    .map(category => category.id)
    .sort();
}

function buildOfficialCatalog(generatedAt = new Date().toISOString()) {
  const packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const items = new Items({ category: ['Mods'], i18n: ['zh'] });
  const localCategories = readCategoryDirectory(path.join(knowledgeRoot, 'categories'));
  const acquisitionEntries = readEntryDirectory(path.join(root, 'knowledge', 'acquisition'));
  const acquisitionsByCanonical = new Map();
  const acquisitionsByUniqueName = new Map();
  const acquisitionById = new Map(acquisitionEntries.map(entry => [entry.id, entry]));

  for (const entry of acquisitionEntries) {
    const uniqueName = entry.officialUniqueName || entry.subject?.officialUniqueName;
    if (uniqueName) {
      const ids = acquisitionsByUniqueName.get(uniqueName) || [];
      ids.push(entry.id);
      acquisitionsByUniqueName.set(uniqueName, ids);
      continue;
    }
    const key = normalize(entry.subject?.canonical);
    if (!key) continue;
    const ids = acquisitionsByCanonical.get(key) || [];
    ids.push(entry.id);
    acquisitionsByCanonical.set(key, ids);
  }

  const officialCategoryMap = new Map();
  for (const item of items) {
    addCategory(officialCategoryMap, `type.${slug(item.type)}`, 'type', item.type);
    if (item.compatName) addCategory(officialCategoryMap, `compat.${slug(item.compatName)}`, 'compatibility', item.compatName);
    for (const [id, canonical] of getTraitCategories(item)) addCategory(officialCategoryMap, id, 'trait', canonical);
  }

  const mods = [...items]
    .sort((a, b) => a.uniqueName.localeCompare(b.uniqueName))
    .map(item => {
      const localized = items.i18n[item.uniqueName]?.zh || {};
      const hasChineseName = Boolean(localized.name && localized.name !== item.name);
      const officialCategoryIds = [`type.${slug(item.type)}`];
      if (item.compatName) officialCategoryIds.push(`compat.${slug(item.compatName)}`);
      officialCategoryIds.push(...getTraitCategories(item).map(([id]) => id));
      for (const id of officialCategoryIds) officialCategoryMap.get(id).count += 1;
      const localEntryIds = [...new Set([
        ...(acquisitionsByUniqueName.get(item.uniqueName) || []),
        ...(acquisitionsByCanonical.get(normalize(item.name)) || [])
      ])].sort();
      const hasCompleteEntry = localEntryIds.some(id => {
        const entry = acquisitionById.get(id);
        return entry && entry.acquisitionStatus !== 'stub' && entry.methodRefs?.length;
      });
      return {
        uniqueName: item.uniqueName,
        canonical: item.name,
        displayName: hasChineseName ? localized.name : item.name,
        localizationStatus: hasChineseName ? 'official-zh' : 'missing-zh',
        type: item.type,
        category: item.category || null,
        compatName: item.compatName || null,
        rarity: item.rarity || null,
        polarity: item.polarity || null,
        maxRank: Number.isInteger(item.fusionLimit) ? item.fusionLimit : 0,
        maxRankEffects: item.levelStats?.at(-1)?.stats || item.stats || [],
        maxRankEffectsZh: localized.levelStats?.at(-1)?.stats || [],
        traits: {
          prime: Boolean(item.isPrime),
          augment: Boolean(item.isAugment),
          exilus: Boolean(item.isExilus),
          utility: Boolean(item.isUtility),
          set: Boolean(item.modSet),
          riven: /Riven Mod$/.test(item.type || ''),
          pvp: /\/PvPMods\//.test(item.uniqueName || '') || /PvPAugmentCard/.test(item.uniqueName || ''),
          archon: /^Archon /.test(item.name || ''),
          drift: /\/OrokinChallenge\//.test(item.uniqueName || '') && / Drift$/.test(item.name || '')
        },
        modSet: item.modSet || null,
        officialCategoryIds,
        wiki: item.wikiaUrl ? { available: item.wikiAvailable !== false, url: item.wikiaUrl } : { available: false, url: null },
        localEntryIds,
        status: hasCompleteEntry ? 'covered' : localEntryIds.length ? 'stub' : 'missing'
      };
    });

  const officialCategories = [...officialCategoryMap.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(category => {
      const localCategoryIds = findLocalCategoryMatches(category, localCategories);
      return { ...category, localCategoryIds, status: localCategoryIds.length ? 'covered' : 'missing' };
    });

  const categoryById = new Map(officialCategories.map(category => [category.id, category]));
  const localCategorySnapshot = localCategories
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(category => {
      const officialCategoryIds = officialCategories
        .filter(official => official.localCategoryIds.includes(category.id))
        .map(official => official.id);
      return {
        id: category.id,
        canonical: category.canonical,
        displayName: category.displayName,
        parent: category.parent,
        aliases: category.aliases || [],
        officialCategoryIds,
        officialStatus: officialCategoryIds.length ? 'matched' : 'local-only'
      };
    });

  const coveredMods = mods.filter(mod => mod.status === 'covered').length;
  const stubMods = mods.filter(mod => mod.status === 'stub').length;
  const coveredCategories = officialCategories.filter(category => category.status === 'covered').length;
  const missingChineseNames = mods.filter(mod => mod.localizationStatus === 'missing-zh').length;

  for (const mod of mods) {
    for (const id of mod.officialCategoryIds) {
      if (!categoryById.has(id)) throw new Error(`${mod.uniqueName}: 官方分类不存在 ${id}`);
    }
  }

  return {
    schemaVersion: 1,
    generatedAt,
    source: {
      package: packageInfo.name,
      version: packageInfo.version,
      repository: 'https://github.com/WFCD/warframe-items',
      upstream: 'Warframe Public Export'
    },
    counts: {
      mods: mods.length,
      officialCategories: officialCategories.length,
      localCategories: localCategorySnapshot.length,
      coveredMods,
      stubMods,
      missingMods: mods.length - coveredMods - stubMods,
      coveredOfficialCategories: coveredCategories,
      missingOfficialCategories: officialCategories.length - coveredCategories,
      missingChineseNames
    },
    officialCategories,
    localCategories: localCategorySnapshot,
    mods
  };
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function summarizeDiff(current, next) {
  const currentMods = new Map((current?.mods || []).map(mod => [mod.uniqueName, mod]));
  const nextMods = new Map(next.mods.map(mod => [mod.uniqueName, mod]));
  const added = [...nextMods.keys()].filter(key => !currentMods.has(key));
  const removed = [...currentMods.keys()].filter(key => !nextMods.has(key));
  const changed = [...nextMods.keys()].filter(key => currentMods.has(key)
    && JSON.stringify(currentMods.get(key)) !== JSON.stringify(nextMods.get(key)));
  return { added: added.length, removed: removed.length, changed: changed.length };
}

function main() {
  const check = process.argv.includes('--check');
  const current = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
  const generatedAt = check && current?.generatedAt ? current.generatedAt : new Date().toISOString();
  const next = buildOfficialCatalog(generatedAt);
  if (check) {
    if (!current || serialize(current) !== serialize(next)) {
      const diff = summarizeDiff(current, next);
      console.error(`official.json 需要同步：新增 ${diff.added}，删除 ${diff.removed}，变更 ${diff.changed}`);
      process.exit(1);
    }
    console.log(`official.json 已同步：${next.counts.mods} 个 Mod，${next.counts.officialCategories} 个官方分类`);
    return;
  }
  fs.writeFileSync(outputPath, serialize(next));
  console.log(`已生成 official.json：${next.counts.mods} 个 Mod，${next.counts.officialCategories} 个官方分类`);
}

if (require.main === module) main();

module.exports = { buildOfficialCatalog, serialize };
