'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { renderGameText } = require('../src/game-text');
const Items = require('warframe-items');
const { filterPlayableMods, getTypeDisplayName } = require('../src/playable-mod-filter');
const { readCategoryDirectory, readEntryDirectory, readObjectDirectory } = require('../src/loader');

const root = path.join(__dirname, '..');
const knowledgeRoot = path.join(root, 'knowledge');
const outputPath = path.join(knowledgeRoot, 'categories', 'official.json');
const packagePath = path.join(path.dirname(require.resolve('warframe-items')), 'package.json');
const officialEnglishPath = path.join(root, '.cache', 'official-localization', 'languages.en.json');
const officialChinesePath = path.join(root, '.cache', 'official-localization', 'languages.zh.json');
const officialSyndicatesPath = path.join(root, 'cache', 'warframe-export-syndicates.json');
const supplementalEntryDirectory = path.join(root, 'knowledge', 'acquisition', 'mod', 'standardmod', 'warframe');
const currentModIdentitiesPath = path.join(root, 'knowledge', 'supplemental', 'current-mod-identities.json');

const SYNDICATE_FACTION_IDS = Object.freeze({
  ArbitersSyndicate: 'faction.arbiters-of-hexis',
  CephalonSudaSyndicate: 'faction.cephalon-suda',
  NewLokaSyndicate: 'faction.new-loka',
  PerrinSyndicate: 'faction.the-perrin-sequence',
  RedVeilSyndicate: 'faction.red-veil',
  SteelMeridianSyndicate: 'faction.steel-meridian'
});

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

function hasApprovedAcquisition(entry) {
  if (!entry || entry.reviewStatus !== 'approved') return false;
  const generated = entry.modAcquisition?.generated?.wiki;
  const manual = entry.modAcquisition?.manual || {};
  const methods = [...(generated?.methods || []), ...(manual.methods || []).filter(method => method.reviewStatus === 'approved')];
  const methodRefs = [...new Set([...(entry.methodRefs || []), ...(manual.methodRefs || [])])];
  return methods.length > 0 || methodRefs.length > 0 || entry.modAcquisition?.generated?.identity?.variant === 'prime';
}

function augmentStem(value) {
  return String(value || '').split('/').pop()
    .replace(/(?:Card|Mod|Name|Desc)$/i, '')
    .replace(/_?Ability(?=Augment)/i, '')
    .replace(/Augment1$/i, 'Augment')
    .toLowerCase();
}

function compileOfficialSyndicateOffers() {
  const syndicates = JSON.parse(fs.readFileSync(officialSyndicatesPath, 'utf8'));
  const byStem = new Map();
  for (const [syndicateId, factionId] of Object.entries(SYNDICATE_FACTION_IDS)) {
    const syndicate = syndicates[syndicateId];
    if (!syndicate) throw new Error(`ExportSyndicates 缺少六大集团：${syndicateId}`);
    for (const offer of syndicate.favours || []) {
      if (!/\/Powersuits\/.+(?:Augment|DisablePassive).*(?:Card|Mod)$/i.test(offer.storeItem || '')) continue;
      const stem = augmentStem(offer.storeItem);
      const methods = byStem.get(stem) || [];
      methods.push({
        type: 'syndicate-exchange',
        factionId,
        standing: Number(offer.standingCost) || null,
        requiredLevel: Number.isInteger(offer.requiredLevel) ? offer.requiredLevel : null,
        requirements: { type: 'standing', factionId, amount: Number(offer.standingCost) || null, rank: Number.isInteger(offer.requiredLevel) ? offer.requiredLevel : null },
        reviewStatus: 'approved',
        provenance: { source: 'DE ExportSyndicates', syndicateId, storeItem: offer.storeItem }
      });
      byStem.set(stem, methods);
    }
  }
  return byStem;
}

function renderSupplementalEffect(value) {
  const rendered = renderGameText(value);
  return /\|[A-Z][A-Z0-9_]*\|/.test(rendered)
    ? '官方效果模板包含随等级或技能变化的动态数值，当前公开导出未提供可验证的最终数值；具体数值以游戏内 Mod 界面为准。'
    : rendered;
}

function supplementalEntryIdentity(mod) {
  const base = slug(mod.canonical) || 'mod';
  const suffix = crypto.createHash('sha1').update(mod.uniqueName).digest('hex').slice(0, 8);
  return { id: `knowledge.acquisition.mod.${base}-${suffix}`, file: path.join(supplementalEntryDirectory, `${base}-${suffix}.json`) };
}

function buildSupplementalEntry(mod, updatedAt = new Date().toISOString().slice(0, 10), previous = null) {
  const identity = supplementalEntryIdentity(mod);
  const previousWiki = previous?.modAcquisition?.generated?.wiki;
  const approvedMethods = mod.acquisitionMethods || [];
  const approvedKeys = new Set(approvedMethods.map(method => `${method.type}\0${method.factionId || method.sourceEntityId || method.sourceCanonical || ''}`));
  const mergedWiki = previousWiki
    ? {
        ...previousWiki,
        methods: [...approvedMethods, ...(previousWiki.methods || []).filter(method => !approvedKeys.has(`${method.type}\0${method.factionId || method.sourceEntityId || method.sourceCanonical || ''}`))]
      }
    : { status: 'complete', methods: approvedMethods, evidence: [], mechanicsEvidence: {}, unresolvedEntities: [] };
  return [{
    id: previous?.id || identity.id,
    kind: 'knowledge',
    module: 'acquisition',
    title: mod.displayName,
    subject: { canonical: mod.canonical, displayName: mod.displayName, category: 'mod', categoryRefs: ['syndicatemod', 'warframemod', 'standardmod'] },
    officialUniqueName: mod.uniqueName,
    maxRank: mod.maxRank,
    effectDetails: previous?.effectDetails?.length && !String(previous.effectDetails[0]).includes('官方效果模板包含')
      ? previous.effectDetails
      : mod.maxRankEffectsZh,
    rarity: mod.rarity,
    polarity: mod.polarity,
    tradable: true,
    prerequisites: [],
    tips: [],
    tipKeywords: ['本质机制', '具体计算公式', '加成层级', '与同类效果的叠加方式', '适用限制'],
    methodRefs: [],
    modAcquisition: {
      generated: {
        identity: { officialUniqueName: mod.uniqueName, canonical: mod.canonical, displayName: mod.displayName, maxRank: mod.maxRank, variant: 'standard', typeFolder: 'warframe' },
        wiki: mergedWiki,
        officialDrops: []
      },
      manual: { methods: [], methodRefs: [], overrides: {}, reviewStatus: 'approved', reviewedBy: ['official-sync:syndicate-exchange'] }
    },
    acquisitionStatus: 'complete',
    sources: [{ url: 'https://www.warframe.com/', label: 'DE Languages.bin + ExportSyndicates' }],
    gameVersion: 'DE Languages.bin + ExportSyndicates',
    updatedAt,
    reviewStatus: 'approved',
    reviewedBy: ['official-sync:syndicate-exchange'],
    tags: ['acquisition', 'mod', 'standard-mod', 'warframe-mod'],
    generator: { name: 'sync-official-mods', version: 1 }
  }];
}

function syncSupplementalEntries(mods, options = {}) {
  const changes = [];
  const existingByCanonical = new Map();
  if (fs.existsSync(supplementalEntryDirectory)) {
    for (const name of fs.readdirSync(supplementalEntryDirectory).filter(name => name.endsWith('.json'))) {
      const file = path.join(supplementalEntryDirectory, name);
      const canonical = JSON.parse(fs.readFileSync(file, 'utf8'))?.[0]?.subject?.canonical;
      if (canonical) existingByCanonical.set(normalize(canonical), file);
    }
  }
  for (const mod of mods) {
    const identity = supplementalEntryIdentity(mod);
    identity.file = existingByCanonical.get(normalize(mod.canonical)) || identity.file;
    const current = fs.existsSync(identity.file) ? fs.readFileSync(identity.file, 'utf8') : null;
    const existing = current ? JSON.parse(current)?.[0] : null;
    const next = `${JSON.stringify(buildSupplementalEntry(mod, existing?.updatedAt || options.updatedAt, existing), null, 2)}\n`;
    if (current !== next) changes.push({ file: identity.file, current, next });
  }
  if (options.check) return changes;
  for (const change of changes) {
    fs.mkdirSync(path.dirname(change.file), { recursive: true });
    fs.writeFileSync(change.file, change.next);
  }
  return changes;
}

function compileSupplementalMods(rawItems) {
  const en = JSON.parse(fs.readFileSync(officialEnglishPath, 'utf8'));
  const zh = JSON.parse(fs.readFileSync(officialChinesePath, 'utf8'));
  const syndicateOffers = compileOfficialSyndicateOffers();
  const descriptionKeysByStem = new Map(Object.keys(en).filter(key => key.endsWith('Desc')).map(key => [augmentStem(key), key]));
  const knownNames = new Set(rawItems.map(item => normalize(item.name)));
  const currentIdentities = new Map(JSON.parse(fs.readFileSync(currentModIdentitiesPath, 'utf8')).items.map(item => [normalize(item.canonical), item.uniqueName]));
  const records = [];
  for (const [nameKey, canonical] of Object.entries(en)) {
    if (!nameKey.endsWith('Name') || knownNames.has(normalize(canonical))) continue;
    const offerMethods = syndicateOffers.get(augmentStem(nameKey)) || [];
    if (!/AugmentName$/i.test(nameKey) && !offerMethods.length) continue;
    const descriptionKey = en[nameKey.replace(/Name$/, 'Desc')]
      ? nameKey.replace(/Name$/, 'Desc')
      : descriptionKeysByStem.get(augmentStem(nameKey));
    const description = en[descriptionKey];
    const displayName = zh[nameKey];
    const descriptionZh = zh[descriptionKey];
    if (!displayName || displayName === canonical || !descriptionZh || !/Augment:/i.test(description || '') || /^\[PH\]/i.test(canonical)) continue;
    const acquisitionMethods = offerMethods;
    const acquisitionComplete = acquisitionMethods.length > 0;
    records.push({
      uniqueName: currentIdentities.get(normalize(canonical)) || `language:${nameKey}`,
      canonical,
      displayName,
      localizationStatus: 'official-zh',
      type: 'Warframe Mod',
      category: 'Mods',
      compatName: null,
      rarity: null,
      polarity: null,
      maxRank: 3,
      maxRankEffects: [renderSupplementalEffect(description)],
      maxRankEffectsZh: [renderSupplementalEffect(descriptionZh)],
      traits: { prime: false, augment: true, exilus: false, utility: false, set: false, riven: false, pvp: false, archon: false, drift: false },
      modSet: null,
      officialCategoryIds: ['type.warframe-mod', 'trait.augment'],
      wiki: { available: false, url: null },
      localEntryIds: [],
      acquisitionMethods,
      status: acquisitionComplete ? 'complete' : 'review-required',
      reviewRequired: !acquisitionComplete,
      evidenceStatus: acquisitionComplete ? 'official-syndicate-acquisition' : 'official-language-identity-acquisition-missing',
      provenance: { source: 'DE Languages.bin + ExportSyndicates', nameKey, descriptionKey }
    });
  }
  return records.sort((a, b) => a.uniqueName.localeCompare(b.uniqueName));
}

function buildOfficialCatalog(generatedAt = new Date().toISOString()) {
  const packageInfo = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const rawItems = new Items({ category: ['Mods'], i18n: ['zh'] });
  const { playable: items, excluded } = filterPlayableMods(rawItems);
  const localCategories = readCategoryDirectory(path.join(knowledgeRoot, 'categories'));
  const acquisitionEntries = readObjectDirectory(path.join(root, 'knowledge', 'acquisition'));
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

  const packageMods = [...items]
    .sort((a, b) => a.uniqueName.localeCompare(b.uniqueName))
    .map(item => {
      const localized = rawItems.i18n[item.uniqueName]?.zh || {};
      const hasChineseName = Boolean(localized.name && localized.name !== item.name);
      const officialCategoryIds = [`type.${slug(item.type)}`];
      if (item.compatName) officialCategoryIds.push(`compat.${slug(item.compatName)}`);
      officialCategoryIds.push(...getTraitCategories(item).map(([id]) => id));
      for (const id of officialCategoryIds) officialCategoryMap.get(id).count += 1;
      const localEntryIds = [...new Set([
        ...(acquisitionsByUniqueName.get(item.uniqueName) || []),
        ...(acquisitionsByCanonical.get(normalize(item.name)) || [])
      ])].sort();
      const hasCompleteEntry = localEntryIds.some(id => hasApprovedAcquisition(acquisitionById.get(id)));
      return {
        uniqueName: item.uniqueName,
        canonical: item.name,
        displayName: hasChineseName ? localized.name : item.name,
        localizationStatus: hasChineseName ? 'official-zh' : 'missing-zh',
        type: item.type,
        typeDisplayName: getTypeDisplayName(item.type),
        category: item.category || null,
        compatName: item.compatName || null,
        rarity: item.rarity || null,
        polarity: item.polarity || null,
        maxRank: Number.isInteger(item.fusionLimit) ? item.fusionLimit : 0,
        maxRankEffects: (item.levelStats?.at(-1)?.stats || item.stats || []).map(renderGameText),
        maxRankEffectsZh: (localized.levelStats?.at(-1)?.stats || []).map(renderGameText),
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
        status: hasCompleteEntry ? 'complete' : 'review-required',
        reviewRequired: !hasCompleteEntry,
        evidenceStatus: hasCompleteEntry ? 'approved-acquisition' : localEntryIds.length ? 'identity-present-acquisition-unapproved' : 'identity-missing'
      };
    });
  const packageUniqueNames = new Set(packageMods.map(mod => mod.uniqueName));
  const supplementalMods = compileSupplementalMods(rawItems).filter(mod => !packageUniqueNames.has(mod.uniqueName)).map(mod => {
    const localEntryIds = [...new Set([...(acquisitionsByUniqueName.get(mod.uniqueName) || []), ...(acquisitionsByCanonical.get(normalize(mod.canonical)) || [])])].sort();
    const hasCompleteEntry = localEntryIds.some(id => hasApprovedAcquisition(acquisitionById.get(id)));
    return {
      ...mod,
      localEntryIds,
      status: hasCompleteEntry ? 'complete' : mod.status,
      reviewRequired: hasCompleteEntry ? false : mod.reviewRequired,
      evidenceStatus: hasCompleteEntry ? 'approved-acquisition' : mod.evidenceStatus
    };
  });
  const linkedSyndicateOfferStems = new Set([
    ...items.map(item => augmentStem(item.uniqueName)),
    ...supplementalMods.map(item => augmentStem(item.provenance.nameKey))
  ]);
  const officialSyndicateOffers = compileOfficialSyndicateOffers();
  const unmatchedSyndicateOffers = [...officialSyndicateOffers.entries()]
    .filter(([stem]) => !linkedSyndicateOfferStems.has(stem))
    .map(([stem, methods]) => ({ stem, methods }));
  for (const mod of supplementalMods) for (const id of mod.officialCategoryIds) {
    if (!officialCategoryMap.has(id)) addCategory(officialCategoryMap, id, id.startsWith('type.') ? 'type' : 'trait', id === 'type.warframe-mod' ? 'Warframe Mod' : 'Augment Mods');
    officialCategoryMap.get(id).count += 1;
  }
  const mods = [...packageMods, ...supplementalMods].sort((a, b) => a.uniqueName.localeCompare(b.uniqueName));

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

  const completeMods = mods.filter(mod => mod.status === 'complete').length;
  const reviewRequiredMods = mods.filter(mod => mod.status === 'review-required').length;
  const excludedMods = excluded.map(({ item, reason }) => ({
    uniqueName: item.uniqueName,
    canonical: item.name,
    type: item.type || null,
    status: 'excluded-policy',
    exclusionReason: reason
  })).sort((a, b) => a.uniqueName.localeCompare(b.uniqueName));
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
      upstreamRecords: rawItems.length,
      mods: mods.length,
      excludedMods: excludedMods.length,
      officialCategories: officialCategories.length,
      localCategories: localCategorySnapshot.length,
      completeMods,
      reviewRequiredMods,
      coveredOfficialCategories: coveredCategories,
      missingOfficialCategories: officialCategories.length - coveredCategories,
      missingChineseNames,
      syndicateAugmentProducts: officialSyndicateOffers.size,
      syndicateAugmentOfferRows: [...officialSyndicateOffers.values()].flat().length,
      unmatchedSyndicateAugmentProducts: unmatchedSyndicateOffers.length
    },
    unmatchedSyndicateOffers,
    officialCategories,
    localCategories: localCategorySnapshot,
    excludedMods,
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
  const rawItems = new Items({ category: ['Mods'], i18n: ['zh'] });
  const supplementalChanges = syncSupplementalEntries(compileSupplementalMods(rawItems), { check, updatedAt: generatedAt.slice(0, 10) });
  if (check && supplementalChanges.length) {
    console.error(`标准 Mod 条目需要同步：${supplementalChanges.length}`);
    process.exitCode = 1;
    return;
  }
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

module.exports = { hasApprovedAcquisition, compileOfficialSyndicateOffers, compileSupplementalMods, buildSupplementalEntry, syncSupplementalEntries, buildOfficialCatalog, serialize };
