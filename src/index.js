'use strict';

const path = require('path');
const fs = require('fs');
const { loadData } = require('./loader');
const { CAMBION_CYCLE_TERMS } = require('./cambion-cycles');
const { normalizeAliasFacts } = require('./alias-facts');
const { createResolver, resolveDomainAlias, normalize, parseResolverIntent, weaponAliasForms, WEAPON_VARIANT_INTENT_ALIASES } = require('./resolver');
const frameAcquisition = require('./frame-acquisition');
const { officialItemZhName } = require('./official-item-names');
const frameCard = require('./frame-card');
const resourceAcquisition = require('./resource-acquisition');
const { createAcquisitionEvidence, createAcquisitionResult, createRenderResult } = require('./acquisition-dto');
const { displayEntityName } = require('./entities');
const { renderGameText } = require('./game-text');
const { normalizeArcaneEffectLines } = require('./arcane-effect-text');
const {
  normalizeRequirements,
  renderRequirements,
  renderAcquisition,
  acquisitionCardSections,
  normalizeVisibleLine,
  extractSimarisStandingAmount: _extractSimarisStandingAmount
} = require('./acquisition-protocol');
// Keep the core loadable while an older bundled protocol is being rolled out.
const extractSimarisStandingAmount = typeof _extractSimarisStandingAmount === 'function'
  ? _extractSimarisStandingAmount
  : () => null;
const { appendAscensionArcaneVestigialExchange } = require('./ascension-arcane-acquisition');
const { appendSteelPathVorArcaneDrop } = require('./steel-path-vor-arcane-acquisition');
const { structuredMethods: compileStructuredMethods, routesToMethods } = require('./acquisition-core');
const { createCraftingGraph, renderCraftingUses, renderCrafting } = require('./weapon-crafting');
const { parseWeaponCraftingCommand } = require('./weapon-command');
const { expandKnowledgeReferences } = require('./knowledge-reference-expander');
const { createRivenWeaponResolver } = require('./riven-weapon-resolver');
const { createModRelationQueries } = require('./mod-relation-queries');
const { getLichPasswordModUsageLines } = require('./requiem-mod-usage');
const { createSyndicateGroupModResolver, isSyndicateGroupModQuery } = require('./syndicate-group-mod-resolver');
const { createSyndicateExchangeQuery } = require('./syndicate-exchange-query');
const { resolveAccessory } = require('./accessory-query');
const { createElementModSlangResolver } = require('./element-mod-slang');
const { createFactionDamageModSlangResolver } = require('./faction-damage-mod-slang');
const equipmentAcquisition = require('./equipment-acquisition');
const sentinelAcquisition = require('./sentinel-acquisition');
const { isRailjackCacheSource, railjackCacheObjective } = require('./railjack-cache-acquisition');
const {
  listEquipmentIdentities,
  equipmentNameCandidates,
  resolveEquipmentIdentity,
  knowledgeLoaderRowsFromIdentities
} = require('./equipment-identity-registry');
const ampComponents = require('./amp-components');
const { buildOfficialTermIndex, findOfficialTermsInText } = require('./official-term-matcher');
const { resolveModCardFaceLabel, resolveEffectiveModType } = require('./mod-card-face-label');
const { getTypeDisplayName } = require('./playable-mod-filter');
const {
  TRADABLE_SENTINEL_PRIME_FAMILIES,
  resolveCompanionVariantIntent,
  resolveCompanionPrimeVariantIntent,
  getCompanionVariantFamily
} = require('./companion-variant-family');

// Reviewed Chinese shorthand for complete Set Mod families.  These aliases
// intentionally resolve to a candidate collection (rather than one Mod) so
// `wk 猎人`/`刷 空飞` can enumerate the whole family safely.
const SET_MOD_FAMILY_ALIASES = Object.freeze({
  'Aero Set': ['空飞', '空飞套', 'Aero', 'Aero Set'],
  "Amar's Set": ['欺谋狼主', '欺谋', 'Amar', "Amar's Set"],
  'Augur Set': ['预言', '预言套', 'Augur', 'Augur Set'],
  "Boreal's Set": ['诡文枭主', '诡文', 'Boreal', "Boreal's Set"],
  'Carnis Set': ['肉碾虫', '肉碾', 'Carnis', 'Carnis Set'],
  'Gladiator Set': ['角斗士', '角斗士套', 'Gladiator', 'Gladiator Set'],
  'Hunter Set': ['猎人', '猎人套', 'Hunter', 'Hunter Set'],
  'Jugulus Set': ['喉骨刃者', '喉骨', 'Jugulus', 'Jugulus Set'],
  'Mecha Set': ['机甲', '机甲套', 'Mecha', 'Mecha Set'],
  'Motus Set': ['动能', '动能套', 'Motus', 'Motus Set'],
  "Nira's Set": ['混沌蛇主', '混沌蛇', 'Nira', "Nira's Set"],
  'Proton Set': ['质子', '质子套', 'Proton', 'Proton Set'],
  'Sacrificial Set': ['牺牲', '牺牲套', 'Sacrificial', 'Sacrificial Set'],
  'Saxum Set': ['重岩者', '重岩', 'Saxum', 'Saxum Set'],
  'Strain Set': ['菌株', '菌株套', 'Strain', 'Strain Set'],
  'Synth Set': ['合成', '合成套', 'Synth', 'Synth Set'],
  'Tek Set': ['泰克', '泰克套', 'Tek', 'Tek Set'],
  'Umbral Set': ['暗影', '暗影套', 'Umbral', 'Umbral Set'],
  'Vigilante Set': ['私法', '私法套', 'Vigilante', 'Vigilante Set']
});

function scoreEntry(query, entry) {
  const q = normalize(query);
  if (!q) return 0;
  const fields = [entry.title, ...(entry.aliases || []), ...(entry.tags || [])];
  let score = 0;
  for (const field of fields) {
    const value = normalize(field);
    if (value === q) score = Math.max(score, 100);
    else if (value.includes(q) || q.includes(value)) score = Math.max(score, 70 - Math.abs(value.length - q.length));
  }
  if (normalize(entry.content).includes(q)) score = Math.max(score, 25);
  return score;
}

function searchEntries(query, entries, options = {}) {
  return entries.map(entry => ({ ...entry, _score: scoreEntry(query, entry) }))
    .filter(entry => entry._score > 0)
    .sort((a, b) => b._score - a._score || a.title.localeCompare(b.title, 'zh-CN'))
    .slice(0, options.limit || 8)
    .map(({ _score, ...entry }) => entry);
}

const MOD_NON_TRANSMUTABLE = (() => {
  try {
    const file = path.join(__dirname, '..', 'knowledge', 'facts', 'mod-transmutation.json');
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Set((payload.nonTransmutable || []).map(value => normalize(value)));
  } catch (_) { return new Set(); }
})();
function modTransmutable(entry, officialMod) {
  const canonical = normalize(entry?.subject?.canonical || officialMod?.canonical || entry?.title || '');
  return !MOD_NON_TRANSMUTABLE.has(canonical);
}
const MOD_FUSION_RARITY = Object.freeze({
  common: { multiplier: 1, creditBase: 483 },
  uncommon: { multiplier: 2, creditBase: 966 },
  peculiar: { multiplier: 2, creditBase: 966 },
  rare: { multiplier: 3, creditBase: 1449 },
  amalgam: { multiplier: 3, creditBase: 1449 },
  riven: { multiplier: 3, creditBase: 1449 },
  requiem: { multiplier: 3, creditBase: 1449 },
  legendary: { multiplier: 4, creditBase: 1932 }
});

function modFusionCost(maxRank, rarity) {
  const rank = Number(maxRank);
  const normalizedRarity = String(rarity || '').trim().toLowerCase();
  const rule = MOD_FUSION_RARITY[normalizedRarity];
  if (!Number.isInteger(rank) || rank < 0 || !rule) {
    return { maxRank: Number.isInteger(rank) ? rank : null, rarity: rarity || null, endo: null, credits: null, status: 'missing-evidence' };
  }
  const rankFactor = (2 ** rank) - 1;
  return {
    maxRank: rank,
    rarity,
    endo: 10 * rule.multiplier * rankFactor,
    credits: rule.creditBase * rankFactor,
    status: 'calculated',
    formula: {
      endo: '10 × rarityMultiplier × (2^maxRank - 1)',
      credits: 'creditBase × (2^maxRank - 1)',
      rarityMultiplier: rule.multiplier,
      creditBase: rule.creditBase
    },
    evidence: ['Warframe Wiki: Endo', 'Warframe Wiki: Fusion']
  };
}

function arcaneFusionMetadata(maxRank, rule = {}) {
  const rank = Number(maxRank);
  const protocol = String(rule.protocol || 'standard-triangular');
  const formula = String(rule.formula || '(maxRank + 1) * (maxRank + 2) / 2');
  if (!Number.isInteger(rank) || rank < 0) {
    return { protocol, baseRank: 0, maxRank: null, requiredCopies: null, upgradeable: null, status: 'missing-evidence', formula: null };
  }
  if (rule.upgradeable === false || protocol === 'not-upgradeable') {
    const requiredCopies = Number.isInteger(rule.requiredCopies) && rule.requiredCopies > 0 ? rule.requiredCopies : 1;
    return { protocol: 'not-upgradeable', baseRank: 0, maxRank: rank, requiredCopies, upgradeable: false, status: 'entity-protocol', formula: null };
  }
  if (protocol !== 'standard-triangular') {
    const requiredCopies = Number(rule.requiredCopies);
    return {
      protocol,
      baseRank: 0,
      maxRank: rank,
      requiredCopies: Number.isInteger(requiredCopies) && requiredCopies > 0 ? requiredCopies : null,
      upgradeable: rank > 0,
      status: Number.isInteger(requiredCopies) && requiredCopies > 0 ? 'entity-protocol' : 'missing-evidence',
      formula: null
    };
  }
  return {
    protocol,
    baseRank: 0,
    maxRank: rank,
    requiredCopies: ((rank + 1) * (rank + 2)) / 2,
    upgradeable: rank > 0,
    status: 'calculated',
    formula
  };
}

function modDescriptionLines(entry, officialMod) {
  const lichPasswordLines = getLichPasswordModUsageLines(entry);
  if (lichPasswordLines.length) return lichPasswordLines;
  const direct = (entry.effectDetails || []).map(renderGameText).filter(Boolean);
  const official = (officialMod?.maxRankEffectsZh || []).map(renderGameText).filter(Boolean);
  const structured = (entry.effects || []).map(effect => {
    if (effect?.displayName && /[+\-\d%]/.test(effect.displayName)) return renderGameText(effect.displayName);
    if (!effect?.displayName) return '';
    const value = effect.value == null ? '' : `：${effect.value}${effect.unit || ''}`;
    return `${effect.displayName}${value}`;
  }).filter(Boolean);
  const effects = direct.length ? direct : official.length ? official : structured;
  const setBonus = (entry.setBonusDetails || []).map(renderGameText).filter(Boolean).map(text => `套装效果：${text}`);
  return [...effects, ...setBonus];
}

function createKnowledgeCore(options = {}) {
  const root = options.root || path.join(__dirname, '..');
  const data = loadData(root, { approvedOnly: options.approvedOnly !== false });
  const fishingQueries = require('./fishing').createFishingQueries(root);
  const miningQueries = require('./mining').createMiningQueries(root);
  const allKnowledge = options.approvedOnly === false ? data.knowledge : loadData(root, { approvedOnly: false }).knowledge;
  const frameRecipeCache = options.frameRecipes || (() => {
    try { return JSON.parse(fs.readFileSync(path.join(root, 'cache', 'warframe-export-recipes.json'), 'utf8')); }
    catch (_) { return null; }
  })();
  const officialMods = data.officialCatalog?.mods || [];
  const excludedOfficialMods = data.officialCatalog?.excludedMods || [];
  const officialItems = data.officialItems?.items || [];
  const ecologyRelations = require('./ecology-relations').createEcologyRelationIndex(data.ecologyRelations);
  const ampComponentQueries = ampComponents.createAmpComponentQueries(ampComponents.loadAmpComponents(root));
  const officialWeapons = data.officialWeapons?.weapons || [];
  // 这些条目不参与普通武器、交易或刷取解析，但仍是图标变量需要的稳定实体身份。
  const excludedOfficialWeapons = data.officialWeapons?.excludedWeapons || [];
  const officialCategories = data.officialCatalog?.officialCategories || [];
  const localModEntries = allKnowledge.filter(entry => entry.module === 'acquisition' && entry.subject?.category === 'mod');
  const setModFamilies = new Map();
  for (const entry of localModEntries) {
    const family = String(entry.setFamily || '').trim();
    if (!family || !SET_MOD_FAMILY_ALIASES[family]) continue;
    const row = setModFamilies.get(family) || { family, aliases: SET_MOD_FAMILY_ALIASES[family], mods: [], bonus: entry.setBonusDetails?.[0] || '' };
    row.mods.push({
      canonical: entry.subject?.canonical,
      displayName: entry.subject?.displayName || entry.title || entry.subject?.canonical,
      stableId: entry.subject?.officialUniqueName || entry.officialUniqueName || entry.id,
      category: 'mod'
    });
    if (!row.bonus && entry.setBonusDetails?.[0]) row.bonus = entry.setBonusDetails[0];
    setModFamilies.set(family, row);
  }
  const getSetModFamily = query => {
    const key = normalize(query);
    if (!key) return null;
    for (const row of setModFamilies.values()) {
      if (row.aliases.some(alias => normalize(alias) === key)) {
        const localized = row.mods.map(mod => String(mod.displayName || '')).find(name => /[\u3400-\u9fff]/u.test(name));
        const displayFamily = localized ? localized.split(/\s+/u)[0] : row.family.replace(/\s+Set$/i, '');
        return Object.freeze({ family: displayFamily, familyId: row.family, alias: query, bonus: row.bonus, mods: Object.freeze(row.mods.map(mod => Object.freeze({ ...mod }))) });
      }
    }
    return null;
  };
  const modLookupAliases = new Map();
  for (const entry of localModEntries) {
    const inferredAbilityAliases = (entry.effectDetails || []).map(text => String(text).match(/^(.+?)强化[：:]/)?.[1]).filter(Boolean);
    for (const alias of [...(entry.aliases || []), ...inferredAbilityAliases]) {
      const key = normalize(alias);
      if (!key) continue;
      const targets = modLookupAliases.get(key) || new Set();
      targets.add(entry.subject.canonical);
      modLookupAliases.set(key, targets);
    }
  }
  const weaponNameCandidates = officialWeapons.flatMap(weapon => [weapon.canonical, weapon.displayName, ...weaponAliasForms(weapon.canonical, data.aliases?.weapons?.[weapon.canonical] || [])]
    .filter(Boolean).map(alias => ({ alias, canonical: weapon.canonical, category: 'weapon', priority: 35, nameRole: [weapon.canonical, weapon.displayName].some(name => normalize(name) === normalize(alias)) ? 'name' : 'alias' })));
  const resolveReviewedWeaponAlias = query => {
    const key = normalize(query);
    if (!key) return null;
    // Official weapon names identify a member, not the first member of a family.
    // Explicit reviewed alias preferences (e.g. a variant-specific nickname) remain authoritative.
    const preference = Object.entries(data.aliases?.aliasPreferences || {})
      .find(([alias, entry]) => normalize(alias) === key && entry.section === 'weapons')?.[1];
    if (preference?.prefer) {
      const preferred = officialWeapons.find(weapon => normalize(weapon.canonical) === normalize(preference.prefer));
      if (preferred) return preferred;
    }
    const official = officialWeapons.find(weapon => [weapon.uniqueName, weapon.canonical, weapon.displayName]
      .some(name => normalize(name) === key));
    if (official) return official;
    const matches = officialWeapons.filter(weapon => weaponAliasForms(weapon.canonical, data.aliases?.weapons?.[weapon.canonical] || [])
      .some(alias => normalize(alias) === key));
    if (matches.length === 1) return matches[0];
    return matches.length > 1 ? { ambiguous: matches, reason: 'reviewed-weapon-alias-collision' } : null;
  };
  const weaponVariantPrefixes = /^(?:(?:MK1)[- ]|Prisma\s+|Kuva\s+|Tenet\s+|Coda\s+|Dual\s+Coda\s+|Dex\s+|Mara\s+|Sancti\s+|Secura\s+|Synoid\s+|Telos\s+|Vaykor\s+|Rakta\s+|Carmine\s+)/i;
  const weaponVariantSuffixes = /\s+(?:Prime|Vandal|Wraith|Prisma|Dex|Mara|MK1)$/i;
  const weaponVariantKind = canonical => {
    const name = String(canonical || '');
    if (/\sPrime$/i.test(name)) return 'prime';
    if (/^Sancti\s/i.test(name)) return 'sancti';
    if (/^Vaykor\s/i.test(name)) return 'vaykor';
    if (/^Rakta\s/i.test(name)) return 'rakta';
    if (/^Secura\s/i.test(name)) return 'secura';
    if (/^Synoid\s/i.test(name)) return 'synoid';
    if (/^Telos\s/i.test(name)) return 'telos';
    if (/Wraith$/i.test(name)) return 'wraith';
    if (/Vandal$/i.test(name)) return 'vandal';
    if (/Prisma/i.test(name)) return 'prisma';
    if (/^Kuva\s/i.test(name)) return 'kuva';
    if (/^Tenet\s/i.test(name)) return 'tenet';
    if (/^(?:Dual\s+)?Coda\s/i.test(name)) return 'coda';
    return 'base';
  };
  const weaponFamilyKey = canonical => {
    let value = String(canonical || '').trim(), previous = '';
    while (value && value !== previous) {
      previous = value;
      value = value.replace(weaponVariantPrefixes, '').replace(weaponVariantSuffixes, '').trim();
    }
    // DE 少数变体把基础名称由单数改成复数（Dual Decurion → Prisma Dual Decurions）。
    // 家族键只处理末尾英语复数，不改正式 identity。
    value = value.replace(/ions$/i, 'ion').replace(/([^s])s$/i, '$1');
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  };
  const officialWeaponByCanonical = new Map(officialWeapons.map(weapon => [normalize(weapon.canonical), weapon]));
  const officialWeaponFamilies = new Map();
  for (const weapon of officialWeapons) {
    const key = weaponFamilyKey(weapon.canonical);
    if (!key) continue;
    const family = officialWeaponFamilies.get(key) || [];
    family.push({ ...weapon, variantKind: weaponVariantKind(weapon.canonical) });
    officialWeaponFamilies.set(key, family);
  }
  const stablePrimeVariantByBaseId = new Map();
  const registerStablePrimeRelation = (base, prime, category) => {
    const baseStableId = base?.uniqueName || base?.subject?.officialUniqueName;
    const primeStableId = prime?.uniqueName || prime?.subject?.officialUniqueName;
    const baseCanonical = base?.canonical || base?.subject?.canonical;
    const primeCanonical = prime?.canonical || prime?.subject?.canonical;
    if (!baseStableId || !primeStableId || !baseCanonical || !primeCanonical) return;
    stablePrimeVariantByBaseId.set(baseStableId, Object.freeze({
      kind: 'prime',
      category,
      base: Object.freeze({ stableId: baseStableId, canonical: baseCanonical }),
      variant: Object.freeze({ stableId: primeStableId, canonical: primeCanonical })
    }));
  };
  for (const members of officialWeaponFamilies.values()) {
    const base = members.find(member => member.variantKind === 'base');
    const prime = members.find(member => member.variantKind === 'prime');
    if (base && prime) registerStablePrimeRelation(base, prime, 'weapon');
  }
  const reviewedWeapons = allKnowledge.filter(entry => entry.subject?.category === 'weapon' && entry.id && entry.subject?.canonical);
  for (const base of reviewedWeapons.filter(entry => !/\sPrime$/i.test(entry.subject.canonical))) {
    const officialBase = officialWeaponByCanonical.get(normalize(base.subject.canonical));
    const relation = officialBase && stablePrimeVariantByBaseId.get(officialBase.uniqueName);
    if (relation) stablePrimeVariantByBaseId.set(base.id, Object.freeze({
      ...relation,
      base: Object.freeze({ stableId: base.id, canonical: base.subject.canonical })
    }));
  }
  const frameIdentities = allKnowledge.filter(entry => entry.subject?.category === 'frame' && entry.subject?.officialUniqueName);
  const frameByCanonical = new Map(frameIdentities.map(entry => [normalize(entry.subject.canonical), entry]));
  for (const base of frameIdentities.filter(entry => !/\sPrime$/i.test(entry.subject.canonical))) {
    const prime = frameByCanonical.get(normalize(`${base.subject.canonical} Prime`));
    if (prime) registerStablePrimeRelation(base, prime, 'frame');
  }
  for (const family of TRADABLE_SENTINEL_PRIME_FAMILIES) {
    registerStablePrimeRelation(
      { uniqueName: family.base.stableId, canonical: family.base.canonical, subject: family.base },
      { uniqueName: family.prime.stableId, canonical: family.prime.canonical, subject: family.prime },
      'companion'
    );
  }
  const resolveStablePrimeVariant = stableId => stablePrimeVariantByBaseId.get(String(stableId || '').trim()) || null;
  const rivenWeaponResolver = createRivenWeaponResolver(data.officialWeapons, Object.fromEntries(Object.entries(data.aliases?.weapons || {}).map(([canonical, names]) => [canonical, weaponAliasForms(canonical, names)])), data.rivenMarketWeapons);
  const frameNameCandidates = allKnowledge.filter(entry => entry.subject?.category === 'frame')
    .flatMap(frame => [frame.subject?.canonical, frame.subject?.displayName, data.aliases?.frameMainlandNames?.[frame.subject?.canonical], ...(data.aliases?.frames?.[frame.subject?.canonical] || [])]
      .filter(Boolean).map(alias => ({ alias, canonical: frame.subject.canonical, category: 'frame', priority: 35 })));
  const weaponCraftingGraph = createCraftingGraph(data.weapons || []);
  const weaponComponents = new Map();
  for (const weapon of data.weapons || []) {
    for (const ingredient of (weapon.recipes || []).flatMap(recipe => recipe.ingredients || [])) {
      if (!ingredient.uniqueName || !ingredient.canonical || !/\/Types\/Recipes\/Weapons\//.test(ingredient.uniqueName)) continue;
      for (const alias of [ingredient.canonical, ingredient.displayName].filter(Boolean)) {
        const key = normalize(alias);
        if (!weaponComponents.has(key)) weaponComponents.set(key, { weapon, ingredient });
      }
    }
  }
  const frameComponents = new Map();
  const framePartDisplay = { Blueprint: '蓝图', Neuroptics: '头部', Chassis: '机体', Systems: '系统' };
  for (const frame of allKnowledge.filter(entry => entry.subject?.category === 'frame')) {
    const bases = [frame.subject.canonical, frame.subject.displayName, data.aliases?.frameMainlandNames?.[frame.subject.canonical], ...(data.aliases?.frames?.[frame.subject.canonical] || [])].filter(Boolean);
    for (const component of frame.frameAcquisition?.generated?.components || []) {
      const suffixes = [
        component.part,
        framePartDisplay[component.part],
        component.part === 'Neuroptics' ? '头' : null,
        // Keep the older full Chinese component name as an input alias while
        // displaying the shorter, user-facing “头部” label on cards.
        component.part === 'Neuroptics' ? '头部神经光元' : null
      ].filter(Boolean);
      const identity = {
        frame,
        component,
        canonical: `${frame.subject.canonical} ${component.part}`,
        displayName: `${frame.subject.displayName || frame.subject.canonical} ${framePartDisplay[component.part] || component.part}`
      };
      for (const base of bases) for (const suffix of suffixes) frameComponents.set(normalize(`${base}${suffix}`), identity);
    }
  }
  const acquisitionIdentityEntries = [
    ...allKnowledge.filter(entry => ['mod', 'arcane', 'weapon'].includes(entry.subject?.category)),
    ...(data.weapons || []), ...(data.arcanes || [])
  ];
  const acquisitionIdentityByUniqueName = new Map(acquisitionIdentityEntries.map(entry => [entry.officialUniqueName || entry.subject?.officialUniqueName, entry]).filter(([id]) => id));
  const acquisitionVariantFamilyByMember = new Map();
  for (const family of data.acquisitionVariantFamilies?.families || []) for (const member of family.members || []) acquisitionVariantFamilyByMember.set(member, family);
  const consumableNameCandidates = (data.consumables || []).flatMap(item => [item.subject?.canonical, item.subject?.displayName, ...(item.consumableAcquisition?.manual?.aliases || [])]
    .filter(Boolean).map(alias => ({ alias, canonical: item.subject.canonical, category: 'consumable', priority: 32 })));
  const arcaneNameCandidates = (data.arcanes || []).flatMap(arcane => [arcane.subject?.canonical, arcane.subject?.displayName, ...(arcane.arcaneAcquisition?.manual?.aliases || [])]
    .filter(Boolean).map(alias => ({ alias, canonical: arcane.subject.canonical, category: 'arcane', priority: 30 })));
  const fishNameCandidates = officialItems.filter(item => item.semanticKinds?.includes('fish')).flatMap(item => [item.canonical, item.displayName, ...(item.aliases || [])].filter(Boolean).map(alias => ({ alias, canonical: item.canonical, category: 'fish', priority: 40 })));
  const knowledgeItemCandidates = allKnowledge.filter(entry => ['resource', 'item'].includes(entry.subject?.category))
    .flatMap(entry => [entry.subject?.canonical, entry.subject?.displayName, ...(entry.aliases || [])].filter(Boolean)
      .map(alias => ({ alias, canonical: entry.subject.canonical, category: entry.subject.category === 'resource' ? 'resource' : 'official-item', priority: 32 })));
  const officialItemNameCandidates = officialItems.filter(item => !item.semanticKinds?.includes('arcane'))
    .flatMap(item => [item.canonical, item.displayName, ...(item.aliases || [])].filter(Boolean)
      .map(alias => ({ alias, canonical: item.canonical, category: 'official-item', priority: 30 })));
  const equipmentIdentities = listEquipmentIdentities({
    companionAliases: data.aliases?.companions || {},
    companionMainlandNames: data.aliases?.companionMainlandNames || {},
    vehicleAliases: data.aliases?.vehicles || {},
    officialItems
  });
  const reviewedWeaponLoaderRows = (data.weapons || []).flatMap(weapon => {
    const canonical = weapon.subject?.canonical;
    if (!canonical) return [];
    return [{
      title: weapon.subject?.displayName || canonical,
      displayName: weapon.subject?.displayName || canonical,
      canonical,
      stableId: weapon.subject?.officialUniqueName || weapon.officialUniqueName || weapon.id || null,
      aliases: [...new Set([
        canonical,
        weapon.subject?.displayName,
        ...weaponAliasForms(canonical, data.aliases?.weapons?.[canonical] || [])
      ].filter(Boolean))],
      type: 'weapon',
      domain: 'acquisition'
    }];
  });
  const officialNameCandidates = [
    ...fishNameCandidates,
    ...officialMods.flatMap(mod => [mod.canonical, mod.displayName, ...(data.aliases?.mods?.[mod.canonical] || [])].filter(Boolean).map(alias => ({ alias, canonical: mod.canonical, category: 'mod' }))),
    ...arcaneNameCandidates,
    ...frameNameCandidates,
    ...weaponNameCandidates,
    ...consumableNameCandidates,
    ...equipmentNameCandidates(equipmentIdentities)
  ];
  const officialTermIndex = buildOfficialTermIndex([
    ...officialMods.map(mod => ({
      canonical: mod.canonical,
      displayName: mod.displayName,
      aliases: data.aliases?.mods?.[mod.canonical] || [],
      category: 'mod',
      officialUniqueName: mod.uniqueName
    })),
    ...officialItems.map(item => ({
      canonical: item.canonical,
      displayName: item.displayName,
      aliases: item.aliases || [],
      category: item.semanticKinds?.includes('arcane') ? 'arcane' : 'official-item',
      officialUniqueName: item.uniqueName
    })),
    ...officialWeapons.map(weapon => ({
      canonical: weapon.canonical,
      displayName: weapon.displayName,
      aliases: weaponAliasForms(weapon.canonical, data.aliases?.weapons?.[weapon.canonical] || []),
      category: 'weapon',
      officialUniqueName: weapon.uniqueName
    })),
    ...allKnowledge.filter(entry => entry.subject?.category === 'frame').map(frame => ({
      canonical: frame.subject.canonical,
      displayName: frame.subject.displayName,
      aliases: [data.aliases?.frameMainlandNames?.[frame.subject.canonical], ...(data.aliases?.frames?.[frame.subject.canonical] || [])].filter(Boolean),
      category: 'frame',
      officialUniqueName: frame.subject.officialUniqueName
    })),
    ...consumableNameCandidates.map(candidate => ({ ...candidate, displayName: (data.consumables || []).find(item => item.subject?.canonical === candidate.canonical)?.subject?.displayName }))
  ]);
  const baseResolveName = createResolver(data.aliases);
  const resolveName = (query, resolveOptions = {}) => {
    const intent = parseResolverIntent(query);
    const suppliedCandidates = [
      ...(resolveOptions.candidates || []),
      ...(intent.categories.includes('resource') ? knowledgeItemCandidates.filter(candidate => candidate.category === 'resource') : []),
      ...(intent.categories.includes('official-item') ? [...knowledgeItemCandidates.filter(candidate => candidate.category === 'official-item'), ...officialItemNameCandidates] : [])
    ];
    const suppliedAliases = new Set(suppliedCandidates.map(candidate => normalize(candidate.alias)));
    return baseResolveName(query, {
      ...resolveOptions,
      candidates: [
        ...suppliedCandidates,
        ...officialNameCandidates.filter(candidate => !suppliedAliases.has(normalize(candidate.alias)))
      ]
    });
  };
  const abilityEntries = data.officialAbilities?.abilities || [];
  const listAbilities = options => abilityEntries.filter(ability => {
    const frame = normalize(options?.frame || options?.warframe || '');
    const form = normalize(options?.form || '');
    const slot = Number(options?.slot || 0);
    return (!frame || ability.owners.some(owner => [owner.frameCanonical, owner.frameDisplayName].some(value => normalize(value) === frame)))
      && (!form || ability.owners.some(owner => normalize(owner.form) === form))
      && (!slot || ability.owners.some(owner => owner.slot === slot));
  });
  const resolveAbility = (query, options = {}) => {
    const q = normalize(query);
    if (!q) return null;
    const frame = normalize(options.frame || options.warframe || '');
    const slot = Number(options.slot || 0);
    const matches = abilityEntries.filter(ability => ability.aliases.some(alias => normalize(alias) === q))
      .filter(ability => !frame || ability.owners.some(owner => [owner.frameCanonical, owner.frameDisplayName, owner.form].some(value => normalize(value) === frame)))
      .filter(ability => !slot || ability.owners.some(owner => owner.slot === slot));
    if (!matches.length) return null;
    if (matches.length > 1) return { ambiguous: true, query: String(query), candidates: matches };
    return { ambiguous: false, query: String(query), ability: matches[0] };
  };
  const normalizeTerms = text => {
    let output = String(text || '');
    for (const key of Object.keys(data.aliases.normalization || {}).sort((a, b) => b.length - a.length)) output = output.split(key).join(data.aliases.normalization[key]);
    return output;
  };
  const resolveSlang = (domain, query) => resolveDomainAlias(data.aliases, domain, query);
  const getSlangDomain = domain => JSON.parse(JSON.stringify(data.aliases?.[domain] || {}));
  const searchFacts = (query, searchOptions) => searchEntries(query, data.facts, searchOptions);
  const searchKnowledge = (query, searchOptions) => searchEntries(query, data.knowledge, searchOptions);
  const ACQUISITION_CATEGORY_COMMANDS = Object.freeze([
    { domain: 'frame', pattern: /^\/?战甲(?:\s+(.+))?$/i },
    { domain: 'weapon', pattern: /^\/?武器(?:\s+(.+))?$/i },
    { domain: 'companion', pattern: /^\/?同伴(?:\s+(.+))?$/i },
    { domain: 'vehicle', pattern: /^\/?载具(?:\s+(.+))?$/i }
  ]);
  const parseAcquisitionCommand = text => {
    const raw = String(text || '').trim();
    for (const command of ACQUISITION_CATEGORY_COMMANDS) {
      const scoped = raw.match(command.pattern);
      if (scoped) return { intent: 'acquisition', domain: command.domain, query: String(scoped[1] || '').trim() };
    }
    let match = raw.match(/^\/?(?:刷|查|wk)(?:\s+(.+))?$/i);
    if (match) return { intent: 'acquisition', query: String(match[1] || '').trim() };
    match = raw.match(/^怎么刷\s*(.+)$/i);
    if (!match) return null;
    return { intent: 'acquisition', query: match[1].trim() };
  };
  const resolveAcquisitionCommand = text => {
    const parsed = parseAcquisitionCommand(text);
    if (!parsed) return null;
    if (parsed.domain) {
      const scope = [parsed.domain];
      const resolution = parsed.query ? resolveName(parsed.query, {
        categoryScope: scope,
        weaponAliasesExactOnly: true,
        minScore: 100,
        minLead: 8
      }) : null;
      return { ...parsed, resolution };
    }
    if (!parsed.query) return parsed;
    const syndicateGroup = syndicateGroupModResolver?.resolve(parsed.query);
    if (syndicateGroup) return {
      ...parsed,
      domain: null,
      resolution: {
        canonical: syndicateGroup.canonical,
        displayName: syndicateGroup.displayName,
        category: 'mod',
        match: 'syndicate-group-index',
        score: 400
      }
    };
    // “赋能槽连接器”是资源道具，不是赋能。仅凭名称包含“赋能”会把
    // Amp/Primary/Secondary/Melee Arcane Adapter 等稳定资源错误送进赋能解析器。
    // 先锁定知识核心中的精确非赋能实体；其余带“赋能”的查询继续保留旧赋能意图。
    const exactNonArcane = allKnowledge.find(entry => entry.module === 'acquisition'
      && entry.subject?.category !== 'arcane'
      && [entry.subject?.canonical, entry.subject?.displayName, entry.subject?.officialUniqueName]
        .some(value => normalize(value) === normalize(parsed.query)));
    if (exactNonArcane) return {
      ...parsed,
      domain: null,
      resolution: {
        canonical: exactNonArcane.subject.canonical,
        displayName: exactNonArcane.subject.displayName,
        category: exactNonArcane.subject.category,
        match: 'exact',
        score: 400
      }
    };
    const arcaneIntent = /赋能/i.test(parsed.query);
    if (!arcaneIntent) return { ...parsed, domain: null, resolution: null };
    return { ...parsed, domain: 'arcane', resolution: resolveArcane(parsed.query) };
  };
  const parseGameplayCommand = text => {
    const raw = String(text || '').trim();
    const match = raw.match(/^\/?\u73a9\u6cd5(?:\s*(.*))$/i);
    return match ? { intent: 'gameplay', query: String(match[1] || '').trim() } : null;
  };
  const parseCategoryCommand = text => {
    const raw = String(text || '').trim();
    const match = raw.match(/^\/分类(?:\s+(.+))?$/i) || raw.match(/^分类\s+(.+)$/i);
    return match ? { intent: 'category', query: String(match[1] || '').trim() } : null;
  };
  const searchAcquisition = (query, searchOptions = {}) => searchEntries(query, data.knowledge.filter(entry => entry.module === 'acquisition'), searchOptions);
  const gameplayEntries = data.knowledge.filter(entry => entry.module === 'gameplay');
  const gameplayResolver = createResolver({ frames: {}, terms: {} });
  const gameplayCandidates = gameplayEntries.flatMap(entry => [entry.id, entry.title, entry.acquisitionQuery, ...(entry.aliases || [])].filter(Boolean).map(alias => ({ alias, canonical: entry.id, category: 'gameplay', priority: 20 })));
  const searchGameplay = (query, searchOptions = {}) => searchEntries(query, gameplayEntries, searchOptions);
  const resolveGameplayEntry = query => {
    const resolution = gameplayResolver(query, { candidates: gameplayCandidates, categories: ['gameplay'], ignoreIntentCategories: true, minScore: 70, minLead: 8 });
    if (!resolution || resolution.ambiguous) return { resolution, entry: null };
    return { resolution, entry: gameplayEntries.find(item => item.id === resolution.canonical) || null };
  };
  const getGameplay = query => {
    const raw = String(query || '').trim();
    if (!raw) return null;
    let rewardTier = null;
    let rewardRound = null;
    let baseQuery = raw;
    const optionMatch = raw.match(/^(.+?)\s+(\S+)$/i);
    if (optionMatch) {
      const resolvedBase = resolveGameplayEntry(optionMatch[1].trim());
      if (resolvedBase.entry?.rewardGroups || resolvedBase.entry?.rewardRounds) {
        const requestedOption = optionMatch[2].toUpperCase();
        const tier = Object.keys(resolvedBase.entry.rewardGroups || {}).find(key => key.toUpperCase() === requestedOption);
        const roundMatch = requestedOption.match(/^([ABC])(?:轮)?$/i);
        const round = roundMatch && Object.keys(resolvedBase.entry.rewardRounds || {}).find(key => key.toUpperCase() === roundMatch[1]);
        if (!tier && !round) return null;
        baseQuery = optionMatch[1].trim();
        rewardTier = tier || null;
        rewardRound = round || null;
      }
    }
    let { resolution, entry } = resolveGameplayEntry(baseQuery);
    if (!entry && !rewardTier && !rewardRound) ({ resolution, entry } = resolveGameplayEntry(raw));
    if (!entry) return null;
    if (rewardTier && !entry.rewardGroups?.[rewardTier]) return null;
    if (rewardRound && !entry.rewardRounds?.[rewardRound]) return null;
    const rewardGroup = rewardTier ? entry.rewardGroups[rewardTier] : null;
    const rewardRoundDetail = rewardRound ? entry.rewardRounds[rewardRound] : null;
    return { query: raw, entry, rewardTier, rewardGroup, rewardRound, rewardRoundDetail, resolution, alternatives: [] };
  };
  const searchCategories = query => {
    const q = normalize(query);
    if (!q) return [];
    return data.categories.filter(category => [category.id, category.canonical, category.displayName, ...(category.aliases || [])].some(name => normalize(name) === q));
  };
  const itemAliases = item => [item.uniqueName, item.canonical, item.displayName, ...(item.aliases || []), ...(item.recipeVariants || []).flatMap(variant => variant.aliases || [])];
  // 名称 → 条目 索引。下面的 getOfficialMod/getOfficialItem/getWeapon/getArcane 会被市场目录
  // 逐行调用（每次冷启动数千次），而它们原本每次都线性扫描整个语料并逐名 normalize
  // （实测单次 13–29ms，市场模块因此要 240s+）。核心构建时一次建索引，保持语料顺序，
  // 语义与原来的 find/filter 等价（同键多条时仍按语料顺序返回，交给调用方原有排序逻辑）。
  const nameIndex = (entries, namesOf, normalizeName = normalize) => {
    const index = new Map();
    for (const entry of entries) {
      for (const name of namesOf(entry) || []) {
        const key = normalizeName(name);
        if (!key) continue;
        const bucket = index.get(key);
        if (bucket) bucket.push(entry);
        else index.set(key, [entry]);
      }
    }
    return index;
  };
  const officialItemIndex = nameIndex(officialItems, itemAliases);
  const officialModIndex = nameIndex(officialMods, mod => [mod.uniqueName, mod.canonical, mod.displayName]);
  const officialWeaponIndex = nameIndex(data.weapons || [], entry => [entry.subject?.officialUniqueName, entry.subject?.canonical, entry.subject?.displayName]);
  const getOfficialItem = query => {
    const q = normalize(query);
    if (!q) return null;
    return officialItemIndex.get(q)?.[0] || null;
  };
  const searchOfficialItems = (query, searchOptions = {}) => {
    const q = normalize(query);
    if (!q) return [];
    return officialItems.map(item => {
      const names = itemAliases(item).map(normalize);
      const score = names.some(name => name === q) ? 100 : names.some(name => name.includes(q) || q.includes(name)) ? 70 : 0;
      return { item, score };
    }).filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.item.canonical.localeCompare(b.item.canonical))
      .slice(0, searchOptions.limit || 20).map(result => result.item);
  };
  // 官方道具（DE 导出）的配方/材料在卡面上要显示官方简中：配料里 canonical 常常只是
  // `Blueprint`/`Breath Of The Eidolon` 这样的英文，中文名靠 officialItemZhName 或官方道具表
  // 反查（Eidolonium → 夜灵之息），蓝图走 `<道具名>蓝图` 规则（夜灵晶体 → 夜灵晶体蓝图）。
  const officialItemIngredientName = (item, ingredient) => {
    const zh = officialItemZhName(ingredient?.uniqueName) || officialItemZhName(ingredient?.canonical);
    if (zh) return zh;
    const canonical = String(ingredient?.canonical || '').trim();
    const isBlueprint = /\/Recipes\//i.test(String(ingredient?.uniqueName || '')) || /^blueprint$/i.test(canonical);
    const base = String(item?.displayName || item?.canonical || '').trim();
    if (isBlueprint && base) return `${base}蓝图`;
    return canonical;
  };
  const officialItemRecipes = item => (item?.recipes || []).map(recipe => ({
    ...recipe,
    ingredients: (recipe.ingredients || []).map(ingredient => ({
      ...ingredient,
      displayName: officialItemIngredientName(item, ingredient)
    }))
  }));
  const formatBuildTime = seconds => {
    const total = Number(seconds);
    if (!Number.isFinite(total) || total <= 0) return '';
    if (total >= 3600) return `${Math.round(total / 3600)} 小时`;
    return `${Math.max(1, Math.round(total / 60))} 分钟`;
  };
  const officialItemRecipeLine = recipe => {
    if (!recipe) return null;
    const parts = (recipe.ingredients || [])
      .map(ingredient => `${ingredient.displayName || ingredient.canonical} ×${ingredient.quantity ?? 1}`);
    const credits = Number(recipe.credits) > 0 ? `${Number(recipe.credits).toLocaleString('en-US')} 信用点` : '';
    const tokens = [...(credits ? [credits] : []), ...parts];
    if (!tokens.length) return null;
    const buildTime = formatBuildTime(recipe.buildTimeSeconds);
    return `制作：${tokens.join(' + ')}${buildTime ? `（建造 ${buildTime}）` : ''}`;
  };
  // 「<道具名>蓝图」这类带部件后缀的查询：官方道具表里没有部件条目，但用户问的还是同一件道具。
  // 只在后缀是公认部件词、且道具名正好是查询前缀时才认——否则 `夜灵` 会被包含它的
  // `夜灵之息` 抢走，`刷 夜灵` 就不再是 Revenant 了。
  const OFFICIAL_ITEM_PART_SUFFIXES = ['蓝图', '总图', '部件', '枪管', '枪机', '枪托', '刀刃', '握柄', '弓臂', '镖袋'];
  const officialItemByPartSuffix = query => {
    const raw = String(query || '').trim();
    if (!raw) return null;
    for (const suffix of OFFICIAL_ITEM_PART_SUFFIXES) {
      if (!raw.endsWith(suffix) || raw.length <= suffix.length) continue;
      const hit = getOfficialItem(raw.slice(0, raw.length - suffix.length));
      if (hit) return hit;
    }
    return null;
  };
  // 有 curation 的官方道具（神经传感器/氩结晶/夜灵之息…）在 KC 里有已审核的 resource 条目：
  // 它们的材料/掉落是人工审过的，官方导出的原始配方不能顶掉它，所以官方道具层要给它们让路。
  const hasReviewedResourceEntry = (item, query) => Boolean(item) && allKnowledge.some(entry => entry.module === 'acquisition'
    && entry.subject?.category === 'resource'
    && (normalize(entry.subject?.canonical) === normalize(item.canonical)
      || normalize(entry.subject?.displayName) === normalize(query)
      || (entry.subject?.aliases || []).some(alias => normalize(alias) === normalize(query))));
  const pickPreferredOfficialMod = mods => {
    if (!mods?.length) return null;
    if (mods.length === 1) return mods[0];
    const score = mod => {
      let value = 0;
      const uniqueName = String(mod.uniqueName || '');
      if (!/\/Beginner\//i.test(uniqueName)) value += 100;
      if (!/\/Expert\//i.test(uniqueName)) value += 20;
      if (mod.status === 'complete') value += 50;
      if (!mod.reviewRequired) value += 40;
      if (mod.marketIdentity?.slug || mod.marketSlug) value += 30;
      if (mod.wiki?.available !== false) value += 5;
      return value;
    };
    return [...mods].sort((a, b) => score(b) - score(a) || String(a.uniqueName).localeCompare(String(b.uniqueName)))[0];
  };
  const getOfficialMod = query => {
    const q = normalize(query);
    if (!q) return null;
    const direct = officialModIndex.get(q);
    if (direct?.length) return pickPreferredOfficialMod(direct);
    const reviewedAlias = resolveDomainAlias(data.aliases, 'mods', query, { exactOnly: true });
    if (reviewedAlias && !reviewedAlias.ambiguous && reviewedAlias.match === 'exact') {
      const reviewed = officialMods.find(mod => normalize(mod.canonical) === normalize(reviewedAlias.canonical));
      if (reviewed) return reviewed;
    }
    const targets = [...(modLookupAliases.get(q) || [])];
    if (targets.length === 1) return officialMods.find(mod => normalize(mod.canonical) === normalize(targets[0])) || null;
    if (targets.length > 1) {
      const candidates = officialMods.filter(mod => targets.some(target => normalize(mod.canonical) === normalize(target)));
      return pickPreferredOfficialMod(candidates);
    }
    return null;
  };
  const getExcludedOfficialMod = query => {
    const q = normalize(query);
    if (!q) return null;
    return excludedOfficialMods.find(mod => [mod.uniqueName, mod.canonical, mod.displayName].some(value => normalize(value) === q)) || null;
  };
  const getOfficialModAvailability = query => {
    const available = getOfficialMod(query);
    if (available) return { status: 'available', item: available, message: '' };
    const excluded = getExcludedOfficialMod(query);
    if (!excluded) return null;
    return {
      status: 'unavailable',
      item: excluded,
      reason: excluded.exclusionReason,
      message: `${excluded.displayName || excluded.canonical} 尚未发布或不可用，不能生成或显示 Mod 卡片。`
    };
  };
  // 赋能名的中文形态普遍带间隔号（主要·无情、赋能·充沛），而玩家/Bot 常直接写不带间隔号的形式。
  // 精确索引对间隔号与空格必须不敏感，否则 getArcane 找不到该赋能，它就会在下面被官方道具层吞掉。
  const normalizeArcaneName = value => normalize(value)
    .replace(/^霰弹枪(?=仇杀)/, '霰弹')
    .replace(/[\s\u00b7\u30fb\u2027\u2022]+/g, '');
  const officialArcaneIndex = nameIndex(data.arcanes || [], entry => [entry.officialUniqueName, entry.subject?.canonical, entry.subject?.displayName, ...(entry.arcaneAcquisition?.manual?.aliases || [])], normalizeArcaneName);
  const getArcane = query => {
    const q = normalizeArcaneName(query);
    if (!q) return null;
    const matches = [...(officialArcaneIndex.get(q) || [])];
    return matches.sort((a, b) => Number(Boolean(a.arcaneAcquisition?.generated?.identity?.excludedFromCodex)) - Number(Boolean(b.arcaneAcquisition?.generated?.identity?.excludedFromCodex)) || String(a.officialUniqueName).localeCompare(String(b.officialUniqueName)))[0] || null;
  };
  const getArcaneMetadata = query => {
    const entry = getArcane(query);
    if (!entry) return null;
    const generated = entry.arcaneAcquisition?.generated || {};
    const market = data.arcaneMetadata?.get(String(entry.subject?.canonical || '').toLowerCase()) || null;
    const maxRank = Number(market?.maxRank ?? entry.maxRank ?? generated.stats?.maxRank);
    const sharedRankRule = (data.arcaneMethods || []).find(method => method.category === 'authoritative')?.rankCopyRule || {};
    const entityRankRule = entry.arcaneAcquisition?.manual?.rankCopyRule || generated.stats?.rankCopyRule || entry.rankCopyRule || {};
    const rankFusion = arcaneFusionMetadata(maxRank, { ...sharedRankRule, ...entityRankRule });
    const topStats = generated.stats?.levelStats?.[maxRank]?.stats || entry.levelStats?.[maxRank]?.stats || [];
    const descriptionLines = normalizeArcaneEffectLines(topStats);
    return {
      canonical: entry.subject.canonical,
      displayName: entry.subject.displayName,
      officialUniqueName: entry.subject.officialUniqueName,
      marketSlug: market?.marketSlug || null,
      marketGameRef: market?.marketGameRef || null,
      maxRank: Number.isInteger(maxRank) ? maxRank : null,
      requiredCopies: rankFusion.requiredCopies,
      rankFusion,
      rarity: market?.rarity || entry.rarity || generated.stats?.rarity || null,
      tradingTax: Number.isInteger(market?.tradingTax) ? market.tradingTax : null,
      tradingTaxStatus: market?.tradingTaxStatus || 'missing',
      tradable: market ? market.tradable : Boolean(entry.tradable),
      descriptionLines,
      descriptionStatus: descriptionLines.length ? generated.stats?.localizationStatus || 'reviewed' : 'missing'
    };
  };
  const resolveArcane = (query, resolveOptions = {}) => {
    const raw = String(query || '').trim();
    const explicitType = /赋能/i.test(raw);
    const name = raw.replace(/赋能/gi, '').replace(/^[\s·・‧•:：_\-/]+|[\s·・‧•:：_\-/]+$/g, '').trim();
    if (!name) return null;
    const exact = getArcane(raw) || getArcane(name);
    if (exact) return { alias: exact.subject.displayName, canonical: exact.subject.canonical, category: 'arcane', match: 'exact', score: 300 };
    if (explicitType && name.length > 6) return null;
    return resolveName(name, {
      minScore: 70,
      minLead: 8,
      ...resolveOptions,
      categories: ['arcane'],
      candidates: arcaneNameCandidates,
      stripTerms: explicitType ? ['赋能', '近战', '主要', '次要', '霰弹枪', '组合枪', '增幅器', '指挥官', '战甲'] : resolveOptions.stripTerms
    });
  };
  const getWeapon = query => {
    const q = normalize(query);
    if (!q) return null;
    return officialWeaponIndex.get(q)?.[0] || null;
  };
  const reviewedExaltedWeaponIds = new Set((data.exaltedWeaponIntents?.families || []).flatMap(family => family.members || []));
  const listOfficialIconOnlyWeapons = () => excludedOfficialWeapons
    .filter(weapon => weapon.exclusionReason === 'non-weapon-special-item'
      && (/\/Powersuits\//i.test(weapon.uniqueName || '') || reviewedExaltedWeaponIds.has(weapon.uniqueName)))
    .map(weapon => ({ ...weapon, iconOnly: true }));
  const getOfficialIconOnlyWeapon = query => {
    const q = normalize(query);
    if (!q) return null;
    return listOfficialIconOnlyWeapons().find(weapon => [weapon.uniqueName, weapon.canonical, weapon.displayName].some(value => normalize(value) === q)) || null;
  };
  const exaltedWeaponByUniqueName = new Map(listOfficialIconOnlyWeapons().map(weapon => [weapon.uniqueName, weapon]));
  const exaltedWeaponFamilies = (data.exaltedWeaponIntents?.families || []).map(family => {
    const members = (family.members || []).map(uniqueName => exaltedWeaponByUniqueName.get(uniqueName)).filter(Boolean);
    return { ...family, members };
  });
  const exaltedWeaponIntentFamilyRows = Object.freeze(exaltedWeaponFamilies.map(family => Object.freeze({
    id: family.id,
    frameCanonical: family.frameCanonical,
    aliases: Object.freeze([...(family.aliases || [])]),
    members: Object.freeze(family.members.map(member => Object.freeze({
      uniqueName: member.uniqueName,
      canonical: member.canonical,
      displayName: member.displayName,
      category: 'weapon',
      variantKind: weaponVariantKind(member.canonical)
    }))),
    provenance: family.provenance || null
  })));
  const listExaltedWeaponIntentFamilies = () => exaltedWeaponIntentFamilyRows;
  const resolveExaltedWeaponIntent = (query, options = {}) => {
    const q = normalize(query);
    if (!q) return null;
    for (const family of exaltedWeaponFamilies) {
      const direct = family.members.find(member => [member.uniqueName, member.canonical, member.displayName].some(value => normalize(value) === q));
      const aliasMatch = (family.aliases || []).some(alias => normalize(alias) === q);
      if (!direct && !aliasMatch) continue;
      const identity = direct || family.members.find(member => !/Prime$/i.test(member.canonical)) || family.members[0];
      if (!identity) return null;
      return {
        intent: options.intent || 'weapon',
        frameCanonical: family.frameCanonical,
        family: {
          id: family.id,
          identity: { uniqueName: identity.uniqueName, canonical: identity.canonical, displayName: identity.displayName, variantKind: weaponVariantKind(identity.canonical) },
          members: family.members.map(member => ({ uniqueName: member.uniqueName, canonical: member.canonical, displayName: member.displayName, variantKind: weaponVariantKind(member.canonical) }))
        },
        identity: { uniqueName: identity.uniqueName, canonical: identity.canonical, displayName: identity.displayName, category: 'weapon', match: 'exact', score: 300 },
        source: aliasMatch ? 'reviewed-exalted-alias' : 'official-exalted-identity'
      };
    }
    return null;
  };
  const resolveOfficialWeaponIdentity = query => {
    const q = normalize(query);
    if (!q) return null;
    const reviewed = resolveReviewedWeaponAlias(query);
    if (reviewed?.ambiguous) return null;
    if (reviewed) return reviewed;
    const exact = officialWeapons.find(weapon => [weapon.uniqueName, weapon.canonical, weapon.displayName].some(value => normalize(value) === q));
    if (exact) return exact;
    const resolution = resolveName(query, { minScore: 70, minLead: 8, categories: ['weapon'], candidates: weaponNameCandidates });
    return resolution && !resolution.ambiguous ? officialWeaponByCanonical.get(normalize(resolution.canonical)) || null : null;
  };
  const getWeaponVariantFamily = query => {
    const exalted = resolveExaltedWeaponIntent(query, { intent: 'family' });
    if (exalted) return exalted.family;
    const identity = resolveOfficialWeaponIdentity(query);
    if (!identity) return null;
    const members = officialWeaponFamilies.get(weaponFamilyKey(identity.canonical)) || [identity];
    return {
      identity: { uniqueName: identity.uniqueName, canonical: identity.canonical, displayName: identity.displayName, variantKind: weaponVariantKind(identity.canonical) },
      members: members.map(member => ({ uniqueName: member.uniqueName, canonical: member.canonical, displayName: member.displayName, variantKind: member.variantKind }))
    };
  };
  const resolvePrimeVariantIntent = query => {
    const weaponFamily = getWeaponVariantFamily(query);
    if (weaponFamily) {
      const prime = weaponFamily.members.find(member => member.variantKind === 'prime') || null;
      return { ...weaponFamily, prime, alternatives: weaponFamily.members.filter(member => member.uniqueName !== weaponFamily.identity.uniqueName && member.variantKind !== 'prime') };
    }
    const companionFamily = getCompanionVariantFamily(query);
    if (!companionFamily) return null;
    return { ...companionFamily, alternatives: companionFamily.alternatives || [] };
  };
  const weaponVariantIntentAliases = WEAPON_VARIANT_INTENT_ALIASES;
  const compactWeaponIntent = value => normalize(value).replace(/[^a-z0-9\u3400-\u9fff]+/gi, '');
  const resolveWeaponVariantIntent = query => {
    const raw = String(query || '').trim();
    if (!raw) return null;
    const compact = compactWeaponIntent(raw);
    const constraints = [];
    const stripped = new Set([compact]);
    for (const [kind, aliases] of Object.entries(weaponVariantIntentAliases)) for (const alias of aliases) {
      const token = compactWeaponIntent(alias);
      if (!token || !compact.includes(token)) continue;
      constraints.push(kind);
      stripped.add(compact.replace(token, ''));
    }
    const exactWeaponIdentity = value => {
      const key = compactWeaponIntent(value);
      const reviewed = resolveReviewedWeaponAlias(value);
      if (reviewed?.ambiguous) return null;
      return reviewed || officialWeapons.find(weapon => [weapon.uniqueName, weapon.canonical, weapon.displayName].some(alias => compactWeaponIntent(alias) === key)) || null;
    };
    const identities = [...stripped].filter(Boolean).map(exactWeaponIdentity).filter(Boolean);
    const strippedInputs = [...stripped].filter(value => value && value !== compact);
    const resolvedStripped = strippedInputs.map(value => {
      const candidate = resolveOfficialWeaponIdentity(value);
      if (!candidate) return null;
      const inputLength = compactWeaponIntent(value).length;
      const candidateLength = Math.max(compactWeaponIntent(candidate.displayName).length, compactWeaponIntent(candidate.canonical).length);
      return inputLength <= candidateLength ? candidate : null;
    }).find(Boolean);
    const identity = identities[0] || resolvedStripped || (!constraints.length ? resolveOfficialWeaponIdentity(raw) : null);
    if (!identity) return null;
    const family = getWeaponVariantFamily(identity.uniqueName);
    if (!family) return null;
    const uniqueConstraints = [...new Set(constraints)];
    const matches = uniqueConstraints.length ? family.members.filter(member => uniqueConstraints.includes(member.variantKind)) : [family.identity];
    return { query: raw, family, constraints: uniqueConstraints, matches, ambiguous: matches.length !== 1, identity: matches.length === 1 ? matches[0] : null };
  };
  const getConsumable = query => {
    const q = normalize(query);
    if (!q) return null;
    return (data.consumables || []).find(entry => [entry.subject?.officialUniqueName, entry.subject?.canonical, entry.subject?.displayName, ...(entry.consumableAcquisition?.manual?.aliases || [])].some(value => normalize(value) === q)) || null;
  };
  const resolveConsumable = (query, resolveOptions = {}) => {
    const exact = getConsumable(query);
    if (exact) return { alias: exact.subject.displayName, canonical: exact.subject.canonical, category: 'consumable', match: 'exact', score: 300 };
    return resolveName(query, { minScore: 50, minLead: 5, ...resolveOptions, categories: ['consumable'], candidates: consumableNameCandidates });
  };
  const getWeaponGap = query => {
    const q = normalize(query);
    return (data.officialWeapons?.languageOnlyWeapons || []).find(item => [item.canonical, item.displayName, item.nameLanguageKey].some(value => normalize(value) === q)) || null;
  };
  const resolveWeapon = (query, resolveOptions = {}) => {
    const reviewed = resolveReviewedWeaponAlias(query);
    if (reviewed?.ambiguous) return { ambiguous: reviewed.ambiguous, reason: reviewed.reason };
    if (reviewed) return { alias: String(query || '').trim(), canonical: reviewed.canonical, category: 'weapon', match: 'reviewed-alias-exact', score: 410 };
    const exact = getWeapon(query);
    if (exact) return { alias: exact.subject.displayName, canonical: exact.subject.canonical, category: 'weapon', match: 'exact', score: 300 };
    return resolveName(query, { minScore: 50, minLead: 5, ...resolveOptions, categories: ['weapon'], candidates: weaponNameCandidates });
  };
  const resolveRivenWeaponFamilyIntent = query => {
    const variant = resolveWeaponVariantIntent(query);
    if (!variant?.family) return rivenWeaponResolver.resolve(query);
    const candidates = variant.family.members.map(member => rivenWeaponResolver.resolve(member.canonical)).filter(item => item && !item.ambiguous);
    const unique = [...new Map(candidates.map(item => [item.marketSlug, item])).values()];
    if (unique.length === 1) return { ...unique[0], familyInput: variant.identity, familyNormalized: true };
    if (unique.length > 1) return { ambiguous: unique, reason: 'riven-family-collision' };
    return null;
  };
  const syndicateGroupModResolver = createSyndicateGroupModResolver({
    resolveWarframe: frameAcquisition.resolveWarframe,
    resolveWarframeMention: frameAcquisition.resolveWarframeMention,
    getOfficialMod,
    officialMods: [
      ...officialMods,
      ...localModEntries
        .filter(entry => (entry.subject?.categoryRefs || []).includes('syndicatemod'))
        .filter(entry => !officialMods.some(mod => mod.canonical === entry.subject?.canonical))
        .map(entry => ({
          uniqueName: entry.subject.officialUniqueName,
          canonical: entry.subject.canonical,
          displayName: entry.subject.displayName,
          compatName: null,
          effectDetails: entry.effectDetails || [],
          traits: { augment: true }
        }))
    ],
    officialAbilities: abilityEntries
  });
  const resolveSyndicateGroupMod = query => syndicateGroupModResolver.resolve(query);
  const inspectSyndicateGroupMod = query => syndicateGroupModResolver.inspect(query);
  const resolveItem = query => {
    const intent = parseResolverIntent(query);
    const effectiveQuery = intent.query || intent.commandStripped;
    const elementModSlang = elementModSlangResolver.resolve(effectiveQuery);
    if (elementModSlang.status === 'resolved') {
      const mod = getOfficialMod(elementModSlang.relation.canonical);
      if (mod) return { kind: 'mod', item: mod, recipeVariant: null, elementModSlang };
    }
    const factionDamageModSlang = factionDamageModSlangResolver.resolve(effectiveQuery);
    if (factionDamageModSlang.status === 'resolved') {
      const mod = getOfficialMod(factionDamageModSlang.relation.canonical);
      if (mod) return { kind: 'mod', item: mod, recipeVariant: null, factionDamageModSlang };
    }
    if (intent.categories.length) {
      if (intent.categories.includes('weapon')) {
        const reviewed = resolveReviewedWeaponAlias(effectiveQuery);
        if (reviewed?.ambiguous) return { kind: 'ambiguous', item: null, recipeVariant: null, candidates: reviewed.ambiguous };
        if (reviewed) return { kind: 'weapon', item: getWeapon(reviewed.canonical), recipeVariant: null };
      }
      const resolution = resolveName(query, { minScore: 50, minLead: 5 });
      if (resolution?.ambiguous) return { kind: 'ambiguous', item: null, recipeVariant: null, candidates: resolution.ambiguous };
      if (!resolution) return null;
      if (resolution.category === 'mod') return { kind: 'mod', item: getOfficialMod(resolution.canonical), recipeVariant: null };
      if (resolution.category === 'weapon') return { kind: 'weapon', item: getWeapon(resolution.canonical), recipeVariant: null };
      if (resolution.category === 'arcane') return { kind: 'arcane', item: getArcane(resolution.canonical), recipeVariant: null };
      if (resolution.category === 'frame') return { kind: 'warframe', item: frameAcquisition.resolveWarframe(resolution.canonical), recipeVariant: null };
      const knowledgeItem = allKnowledge.find(entry => entry.module === 'acquisition' && normalize(entry.subject?.canonical) === normalize(resolution.canonical));
      if (knowledgeItem) return { kind: resolution.category, item: knowledgeItem, recipeVariant: null };
      return null;
    }
    const syndicateGroup = syndicateGroupModResolver.resolve(effectiveQuery);
    if (syndicateGroup) return { kind: 'mod', item: syndicateGroup.mod, recipeVariant: null, syndicateGroup };
    const reviewedWeapon = resolveReviewedWeaponAlias(effectiveQuery);
    if (reviewedWeapon?.ambiguous) return { kind: 'ambiguous', item: null, recipeVariant: null, candidates: reviewedWeapon.ambiguous };
    if (reviewedWeapon) return { kind: 'weapon', item: getWeapon(reviewedWeapon.canonical), recipeVariant: null };
    const equipmentIdentity = resolveEquipmentIdentity(effectiveQuery, {
      identities: equipmentIdentities,
      companionAliases: data.aliases?.companions || {},
      companionMainlandNames: data.aliases?.companionMainlandNames || {},
      vehicleAliases: data.aliases?.vehicles || {},
      officialItems
    });
    if (equipmentIdentity?.ambiguous) return { kind: 'ambiguous', item: null, recipeVariant: null, candidates: equipmentIdentity.ambiguous };
    if (equipmentIdentity) {
      return {
        kind: equipmentIdentity.category === 'companion' ? 'companion' : equipmentIdentity.category === 'vehicle' ? 'vehicle' : 'equipment',
        item: equipmentIdentity,
        recipeVariant: null
      };
    }
    const weapon = getWeapon(effectiveQuery);
    if (weapon) return { kind: 'weapon', item: weapon, recipeVariant: null };
    const arcane = getArcane(query);
    if (arcane) return { kind: 'arcane', item: arcane, recipeVariant: null };
    const officialItem = getOfficialItem(query);
    if (officialItem) {
      const q = normalize(query);
      const recipeVariant = officialItem.recipeVariants?.find(variant => (variant.aliases || []).some(alias => normalize(alias) === q)) || null;
      return { kind: 'official-item', item: officialItem, recipeVariant };
    }
    const mod = getOfficialMod(effectiveQuery);
    if (mod) return { kind: 'mod', item: mod, recipeVariant: null };
    const frameExact = frameAcquisition.resolveWarframe(effectiveQuery)
      || (!isSyndicateGroupModQuery(effectiveQuery) ? frameAcquisition.resolveWarframeMention(effectiveQuery)?.frame : null);
    if (frameExact) return { kind: 'warframe', item: frameExact, recipeVariant: null };
    const sharedResolution = resolveName(effectiveQuery, { minScore: 70, minLead: 8 });
    if (sharedResolution && !sharedResolution.ambiguous) {
      if (sharedResolution.category === 'official-item') {
        const resolvedOfficialItem = getOfficialItem(sharedResolution.canonical);
        if (resolvedOfficialItem) return { kind: 'official-item', item: resolvedOfficialItem, recipeVariant: null, resolution: sharedResolution };
      }
      if (sharedResolution.category === 'consumable') {
        const resolvedConsumable = getConsumable(sharedResolution.canonical);
        if (resolvedConsumable) return { kind: 'consumable', item: resolvedConsumable, recipeVariant: null, resolution: sharedResolution };
      }
    }
    const weaponResolution = resolveWeapon(query);
    if (weaponResolution && !weaponResolution.ambiguous) {
      const resolvedWeapon = getWeapon(weaponResolution.canonical);
      if (resolvedWeapon) return { kind: 'weapon', item: resolvedWeapon, recipeVariant: null };
    }
    const consumable = getConsumable(query);
    if (consumable) return { kind: 'consumable', item: consumable, recipeVariant: null };
    const weaponGap = getWeaponGap(query);
    if (weaponGap) return { kind: 'weapon-gap', item: weaponGap, recipeVariant: null };
    const officialMatches = searchOfficialItems(query, { limit: 20 });
    if (officialMatches.length > 1) return { kind: 'ambiguous', item: null, recipeVariant: null, candidates: officialMatches };
    return officialMatches.length === 1 ? { kind: 'official-item', item: officialMatches[0], recipeVariant: null } : null;
  };
  const getModTips = query => {
    const q = normalize(query);
    if (!q) return [];
    const official = officialMods.find(mod => [mod.uniqueName, mod.canonical, mod.displayName].some(value => normalize(value) === q));
    const canonical = official?.canonical || query;
    const entry = allKnowledge.find(item => item.module === 'acquisition' && normalize(item.subject?.canonical) === normalize(canonical));
    return Array.isArray(entry?.tips) ? entry.tips : [];
  };
  const getModTipKeywords = query => {
    const q = normalize(query);
    if (!q) return [];
    const official = officialMods.find(mod => [mod.uniqueName, mod.canonical, mod.displayName].some(value => normalize(value) === q));
    const canonical = official?.canonical || query;
    const entry = allKnowledge.find(item => item.module === 'acquisition' && normalize(item.subject?.canonical) === normalize(canonical));
    return Array.isArray(entry?.tipKeywords) ? entry.tipKeywords : [];
  };
  const searchOfficialMods = (query, searchOptions = {}) => {
    const q = normalize(query);
    if (!q) return [];
    return officialMods
      .map(mod => {
        const names = [mod.uniqueName, mod.canonical, mod.displayName].map(normalize);
        const score = names.some(name => name === q) ? 100 : names.some(name => name.includes(q)) ? 70 : 0;
        return { mod, score };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.mod.canonical.localeCompare(b.mod.canonical))
      .slice(0, searchOptions.limit || 20)
      .map(result => result.mod);
  };
  const scoreOfficialNameFragment = (raw, name) => {
    const q = String(raw || '').normalize('NFKC').trim().toLowerCase();
    const value = String(name || '').normalize('NFKC').toLowerCase();
    if (!q || !value) return 0;
    const latin = /[a-z]/i.test(raw);
    if (value === q) return 400;
    const tokens = value.split(latin ? /[^a-z0-9]+/ : /[\s·・‧•_\-]+/u).filter(Boolean);
    if (tokens.includes(q)) return 320;
    if (tokens.some(token => token.startsWith(q))) return 260;
    if (q.length >= 5 && tokens.some(token => token.endsWith(q))) return 240;
    // 短拉丁词不做 token 后缀匹配，避免 rime 误命中 prime；augment 仍可命中 augmented。
    if (latin && /^[a-z0-9]+$/.test(q)) return 0;
    if (value.includes(q)) return 180;
    return 0;
  };
  const officialTermNameCandidates = [
    ...CAMBION_CYCLE_TERMS,
    ...officialMods.map(mod => ({ ...mod, category: 'mod', aliases: data.aliases?.mods?.[mod.canonical] || [] })),
    ...officialItems.map(item => ({ ...item, category: item.semanticKinds?.includes('arcane') ? 'arcane' : 'official-item', aliases: item.aliases || [] })),
    ...officialWeapons.map(weapon => ({ ...weapon, category: 'weapon', aliases: weaponAliasForms(weapon.canonical, data.aliases?.weapons?.[weapon.canonical] || []) })),
    ...allKnowledge.filter(entry => entry.subject?.category === 'frame').map(entry => ({
      uniqueName: entry.subject.officialUniqueName,
      canonical: entry.subject.canonical,
      displayName: entry.subject.displayName,
      category: 'warframe',
      aliases: [data.aliases?.frameMainlandNames?.[entry.subject.canonical], ...(data.aliases?.frames?.[entry.subject.canonical] || [])].filter(Boolean)
    }))
  ];
  const arcaneSlugByCanonical = new Map((data.arcaneMetadataCatalog?.entries || []).map(entry => [normalize(entry.canonical), entry.marketSlug]).filter(([, slug]) => slug));
  const categoryPriority = new Map(['cycle', 'mod', 'weapon', 'warframe', 'arcane', 'official-item'].map((category, index) => [category, index]));
  const searchOfficialTermNameFragments = (query, searchOptions = {}) => {
    const raw = String(query || '').normalize('NFKC').trim();
    if (!raw) return [];
    const latin = /[a-z]/i.test(raw);
    const dedup = new Map();
    for (const candidate of officialTermNameCandidates) {
      const forms = latin
        ? [candidate.canonical, ...(candidate.aliases || []), candidate.category === 'arcane' ? arcaneSlugByCanonical.get(normalize(candidate.canonical)) : null]
        : [candidate.displayName, candidate.canonical, ...(candidate.aliases || [])];
      const score = Math.max(0, ...forms.map(name => scoreOfficialNameFragment(raw, name)));
      if (!score) continue;
      const key = normalize(candidate.canonical);
      const current = dedup.get(key);
      const candidatePriority = categoryPriority.get(candidate.category) ?? 99;
      const currentPriority = categoryPriority.get(current?.category) ?? 99;
      if (!current || score > current.score || (score === current.score && candidatePriority < currentPriority)) {
        dedup.set(key, { ...candidate, score });
      }
    }
    return [...dedup.values()]
      .sort((a, b) => b.score - a.score
        || (categoryPriority.get(a.category) ?? 99) - (categoryPriority.get(b.category) ?? 99)
        || a.canonical.localeCompare(b.canonical))
      .slice(0, searchOptions.limit || 12);
  };
  const searchOfficialModNameFragments = (query, searchOptions = {}) => searchOfficialTermNameFragments(query, { limit: Number.MAX_SAFE_INTEGER })
    .filter(item => item.category === 'mod')
    .slice(0, searchOptions.limit || 12);
  const listOfficialCategories = (filter = {}) => officialCategories.filter(category =>
    (!filter.dimension || category.dimension === filter.dimension)
    && (!filter.status || category.status === filter.status));
  const listReviewRequiredOfficialMods = (filter = {}) => officialMods.filter(mod =>
    mod.status === 'review-required'
    && (!filter.categoryId || mod.officialCategoryIds.includes(filter.categoryId))
    && (!filter.localizationStatus || mod.localizationStatus === filter.localizationStatus));
  // 兼容旧调用方；新目录不再区分 missing/stub，二者都属于明确的待审状态。
  const listMissingOfficialMods = listReviewRequiredOfficialMods;
  const listStubOfficialMods = listReviewRequiredOfficialMods;
  const listMissingOfficialCategories = (filter = {}) => listOfficialCategories({ ...filter, status: 'missing' });
  const getCategory = query => searchCategories(query)[0] || null;
  const getCategoryDetail = query => {
    const category = getCategory(query);
    if (!category) return null;
    const entries = data.knowledge
      .filter(entry => entry.module === 'acquisition'
        && (entry.subject?.category === category.id || entry.subject?.categoryRefs?.includes(category.id)))
      .sort((a, b) => String(a.subject?.displayName || a.title).localeCompare(String(b.subject?.displayName || b.title), 'zh-CN'));
    return { query: String(query || '').trim(), category, entries };
  };
  const renderTemplate = (template, values) => String(template || '').replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (match, key) => values[key] ?? match);
  const modMethodDefinitions = new Map((data.modMethods || []).map(method => [method.category, method]));
  const arcaneMethodDefinition = (data.arcaneMethods || []).find(method => method.category === 'authoritative') || null;
  const arcaneMethodIdentity = method => JSON.stringify({ type: method.type, sourceEntityId: method.sourceEntityId, sourceCanonical: method.sourceCanonical, probability: method.probability, quantity: method.quantity, outputQuantity: method.outputQuantity });
  const mergeArcaneMethods = entry => {
    const manual = entry?.arcaneAcquisition?.manual?.methods || [];
    const official = entry?.arcaneAcquisition?.generated?.acquisition?.methods || [];
    // Wiki 表格保留为 evidence 供审计；未经过实体变量审核的 draft method 不直接发布给用户。
    const wiki = entry?.arcaneAcquisition?.generated?.wiki?.methods || [];
    const methods = [];
    const seen = new Set();
    for (const method of [...manual.filter(item => item.reviewStatus === 'approved'), ...official, ...wiki.filter(item => item.reviewStatus === 'approved')]) {
      const key = arcaneMethodIdentity(method);
      if (!seen.has(key)) { seen.add(key); methods.push(method); }
    }
    return appendSteelPathVorArcaneDrop(appendAscensionArcaneVestigialExchange(methods), entry);
  };
  const renderArcaneAcquisition = entry => {
    const generated = entry.arcaneAcquisition?.generated || {};
    const category = generated.classification?.category || 'legacy';
    const maxRank = Number(entry.maxRank ?? generated.stats?.maxRank ?? 0);
    const rankFusion = getArcaneMetadata(entry.subject?.officialUniqueName || entry.subject?.canonical)?.rankFusion
      || arcaneFusionMetadata(maxRank, arcaneMethodDefinition?.rankCopyRule);
    const label = arcaneMethodDefinition?.categoryLabels?.[category] || category;
    const header = renderTemplate(arcaneMethodDefinition?.headerTemplate || '【{displayName}】\n类型：{categoryLabel}\n最高等级：{maxRank}（满级共需 {requiredCopies} 个）', {
      displayName: entry.subject?.displayName || entry.title,
      categoryLabel: label,
      maxRank,
      requiredCopies: rankFusion.requiredCopies ?? '数据暂缺'
    });
    const topStats = generated.stats?.levelStats?.[maxRank]?.stats || entry.levelStats?.[maxRank]?.stats || [];
    const effectLines = normalizeArcaneEffectLines(topStats);
    const statsLocalized = generated.stats?.localizationStatus === 'official-zh';
    const effect = statsLocalized && effectLines.length ? `满级效果：\n${effectLines.map(line => `- ${line}`).join('\n')}` : effectLines.length ? `满级效果：官方简中数据暂缺（英文证据已保存，禁止猜译）` : '满级效果：官方中文数据暂缺，等待审核';
    if (category === 'legacy' || generated.acquisition?.status === 'review-required') return `${header}\n\n${effect}\n\n${arcaneMethodDefinition?.legacyDescription || '当前不可获取，等待人工审核。'}`;
    return `${header}\n\n${effect}`;
  };
  const generatedAcquisitionMethods = entry => {
    const rawWikiMethods = entry?.modAcquisition?.generated?.wiki?.methods || [];
    const simarisMethods = (entry?.modAcquisition?.generated?.wiki?.evidence || [])
      .map(evidence => ({ excerpt: evidence?.provenance?.excerpt || evidence?.excerpt || '' }))
      .map(({ excerpt }) => ({ excerpt, amount: extractSimarisStandingAmount(excerpt) }))
      .filter(item => Number.isFinite(item.amount))
      .map(item => ({
        type: 'vendor-or-syndicate-exchange',
        sourceEntityId: 'npc.cephalon-simaris',
        locationId: 'hub.any-relay',
        requirements: { type: 'standing', npcId: 'npc.cephalon-simaris', locationId: 'hub.any-relay', amount: item.amount },
        standing: item.amount,
        chance: null,
        quantity: 1,
        availability: 'guaranteed-when-requirements-met',
        reviewStatus: 'draft',
        provenance: { source: 'local-wiki-sqlite', excerpt: item.excerpt }
      }));
    const existingSimarisAmounts = new Set(rawWikiMethods
      .filter(method => method.type === 'vendor-or-syndicate-exchange' && method.sourceEntityId === 'npc.cephalon-simaris')
      .map(method => Number(method.standing ?? method.requirements?.amount)));
    const inferredSimarisMethods = simarisMethods.filter(method => !existingSimarisAmounts.has(method.standing));
    const individualFactions = new Set(rawWikiMethods.filter(method => method.type === 'syndicate-exchange').map(method => method.factionId));
    const rawOfficialDrops = entry?.modAcquisition?.generated?.officialDrops || [];
    const isAuthoritativeCacheReward = method => method.type === 'mission-reward'
      && Number.isFinite(method.chance)
      && /(?:Resource\s+Caches|Caches)/i.test(String(method.sourceCanonical || ''))
      && method.rotation
      && Array.isArray(method.nodes)
      && method.nodes.length > 0;
    const hasOfficialChance = method => ['mission-reward', 'circuit-reward'].includes(method.type)
      && Number.isFinite(method.chance)
      && rawOfficialDrops.some(drop => Number.isFinite(drop.chance)
        && Math.abs(drop.chance - method.chance) < 1e-8
        && /\//.test(drop.sourceCanonical || ''));
    const wikiMethods = rawWikiMethods.filter(method => (method.type !== 'syndicate-exchange-group'
      || !(method.factionIds || []).every(id => individualFactions.has(id)))
      && (isAuthoritativeCacheReward(method) || !hasOfficialChance(method)));
    const authoritativeCacheRewards = wikiMethods.filter(isAuthoritativeCacheReward);
    const hasSyndicateRoute = wikiMethods.some(method => method.type === 'syndicate-exchange' || method.type === 'syndicate-exchange-group');
    const sourceKey = value => normalize(value).replace(/archwing/g, '').replace(/[^a-z0-9\u3400-\u9fff]/g, '');
    const wikiSourceKeys = new Set(wikiMethods.filter(method => method.sourceCanonical).map(method => `${method.type}:${sourceKey(method.sourceCanonical)}`));
    const authoritativeEnemySources = new Set(wikiMethods
      .filter(method => method.type === 'enemy-drop' && method.sourceEntityId)
      .map(method => method.sourceEntityId));
    const officialDrops = rawOfficialDrops.filter(method => {
      if (hasSyndicateRoute && /^(?:Arbiters of Hexis|Red Veil|Steel Meridian|Cephalon Suda|New Loka|The Perrin Sequence),/i.test(method.sourceCanonical || '')) return false;
      const rawSource = String(method.sourceCanonical || '');
      const cacheMatch = rawSource.match(/\(Caches\),\s*Rotation\s*([A-Z])/i);
      if (cacheMatch && authoritativeCacheRewards.some(authoritative => authoritative.rotation === cacheMatch[1].toUpperCase()
        && Math.abs(Number(authoritative.chance) - Number(method.chance)) < 1e-8)) return false;
      const source = sourceKey(method.sourceCanonical);
      if (!source) return true;
      if (authoritativeEnemySources.size) {
        const enemy = data.enemies.get(String(method.sourceCanonical || '').replace(/\s*\(Level\s*\d+\s*-\s*\d+\)\s*$/i, ''));
        if (enemy && !authoritativeEnemySources.has(enemy.id)) return false;
      }
      return !wikiSourceKeys.has(`${method.type}:${source}`) && !wikiSourceKeys.has(`official-drop:${source}`) && !wikiSourceKeys.has(`enemy-drop:${source}`);
    });
    return [...wikiMethods, ...inferredSimarisMethods, ...officialDrops];
  };
  const manualAcquisitionMethods = entry => {
    const entryRequirements = entry?.modAcquisition?.manual?.requirements;
    return (entry?.modAcquisition?.manual?.methods || []).map(method => method.requirements || !entryRequirements
      ? method
      : { ...method, requirements: entryRequirements });
  };
  const mergeStructuredMethods = entry => {
    const methods = [...manualAcquisitionMethods(entry)];
    const identities = new Set(methods.map(method => JSON.stringify({ type: method.type, sourceEntityId: method.sourceEntityId, sourceCanonical: method.sourceCanonical, factionId: method.factionId, rotation: method.rotation, chance: method.chance })));
    for (const method of generatedAcquisitionMethods(entry)) {
      const key = JSON.stringify({ type: method.type, sourceEntityId: method.sourceEntityId, sourceCanonical: method.sourceCanonical, factionId: method.factionId, rotation: method.rotation, chance: method.chance });
      if (!identities.has(key)) { methods.push(method); identities.add(key); }
    }
    return methods;
  };
  const syndicateExchangeQuery = createSyndicateExchangeQuery({
    knowledge: allKnowledge,
    factions: data.factions,
    mergeMethods: mergeStructuredMethods
  });
  const resolveOfficialDropMissionType = label => {
    const text = String(label || '').trim();
    if (!text) return null;
    const bounty = text.match(/(?:Level\s*\d+\s*-\s*\d+\s+)?(.+?\s*Bounty)$/i);
    const canonical = bounty ? bounty[1].trim() : text;
    return data.missionTypes.get(canonical) || data.missionTypes.get(text) || null;
  };
  const enrichOfficialDrop = method => {
    if (method.type !== 'official-drop') return method;
    const raw = String(method.sourceCanonical || '');
    const requiemRelic = raw.match(/^Requiem\s+([IVX]+)\s+Relic(?:\s+\([^)]+\))?$/i);
    if (requiemRelic) return { ...method, type: 'reward-or-drop', sourceDisplayName: `安魂遗物 ${requiemRelic[1].toUpperCase()}`, sourceKind: 'relic-reward' };
    const registered = data.arcaneSources.get(raw);
    const parsedMission = raw.match(/^([^/]+)\/([^,(]+?)(?:\s*\(([^)]+)\))?(?:,\s*Rotation\s*([A-Z]))?$/i);
    if (registered && registered.localization?.status !== 'canonical-fallback' && registered.kind !== 'enemy-drop') {
      const relation = registered.relation || {};
      const missionMeta = registered.mission || {};
      const parsedNodeCanonical = parsedMission?.[2]?.trim() || null;
      const parsedNode = parsedNodeCanonical ? data.locations.get(parsedNodeCanonical) : null;
      const parsedPlanet = data.locations.get(parsedNode?.parentId || parsedMission?.[1]);
      const location = data.locations.get(relation.locationId) || parsedNode;
      const missionType = data.missionTypes.get(relation.missionTypeId || parsedMission?.[3]);
      const planetName = parsedPlanet ? displayEntityName(parsedPlanet) : '';
      const nodeName = location ? displayEntityName(location) : parsedNodeCanonical;
      const locationDisplayName = [planetName, nodeName].filter(Boolean).join('/');
      const isCircuit = relation.missionTypeId === 'mission-type.the-circuit' || /^Duviri\/Endless:/i.test(raw);
      const isBounty = /Bounty/i.test(raw) || String(relation.missionTypeId || '').includes('bounty');
      return {
        ...method,
        type: isCircuit ? 'circuit-reward' : (registered.kind === 'mission-reward' || isBounty ? 'mission-reward' : 'reward-or-drop'),
        ...(isBounty ? {} : { sourceEntityId: registered.id, sourceKind: registered.kind }),
        locationId: location?.id || relation.locationId || null,
        ...(locationDisplayName ? { locationDisplayName } : {}),
        missionTypeId: missionType?.id || relation.missionTypeId || null,
        ...(missionType ? { missionTypeDisplayName: displayEntityName(missionType) } : {}),
        rotation: missionMeta.rotation || parsedMission?.[4] || method.rotation || null,
        nodeCanonical: missionMeta.nodeCanonical || parsedNodeCanonical
      };
    }
    const mission = parsedMission;
    if (mission && !/:/.test(mission[2])) {
      const nodeCanonical = mission[2].trim();
      const location = data.locations.get(nodeCanonical) || data.locations.get(mission[1]);
      const missionType = resolveOfficialDropMissionType(mission[3]);
      return {
        ...method,
        type: missionType ? 'mission-reward' : 'reward-or-drop',
        locationId: location?.id || null,
        nodeCanonical,
        missionTypeId: missionType?.id || null,
        rotation: mission[4] || method.rotation || null
      };
    }
    const enemy = data.enemies.get(raw.replace(/\s*\(Level\s*\d+\s*-\s*\d+\)\s*$/i, ''));
    if (enemy) return enrichModMethod({ ...method, type: 'enemy-drop', sourceEntityId: enemy.id });
    return { ...method, type: 'unresolved-source', sourceDisplayName: null };
  };
  const enrichModMethod = method => {
    if (method.type === 'mission-reward' && method.missionTypeCanonical) {
      const node = (method.nodes || [])[0];
      const location = node ? data.locations.get(node.nodeEntityId) || data.locations.get(node.nodeCanonical) : null;
      const isCacheReward = /(?:Resource\s+Caches|Caches)/i.test(String(method.sourceCanonical || '')) && method.rotation;
      const isHiveCacheReward = isCacheReward && /Hive\s+Sabotage/i.test(String(method.sourceCanonical || ''));
      const missionType = data.missionTypes.get(isHiveCacheReward ? 'mission-type.hive' : method.missionTypeCanonical);
      return {
        ...method,
        ...(isCacheReward ? {
          locationId: location?.id || method.locationId || null,
          locationDisplayName: location ? displayEntityName(location) : (node?.planetDisplayName && node?.nodeCanonical ? `${node.planetDisplayName}/${node.nodeCanonical}` : method.locationDisplayName)
        } : {}),
        missionTypeId: missionType?.id || (isHiveCacheReward ? 'mission-type.hive' : method.missionTypeEntityId) || null,
        missionTypeDisplayName: missionType
          ? displayEntityName(missionType)
          : method.missionTypeDisplayName || method.missionTypeCanonical,
        ...(isCacheReward ? {
          variables: {
            ...(method.variables || {}),
            objective: isRailjackCacheSource(method.sourceCanonical)
              ? railjackCacheObjective(method.sourceCanonical)
              : method.rotation === 'C' ? '找到 3 个储藏箱' : `完成资源缓存 ${method.rotation} 轮条件`
          }
        } : {})
      };
    }
    if (method.type === 'official-drop') return enrichOfficialDrop(method);
    if (method.type === 'syndicate-exchange') {
      const faction = data.factions.get(method.factionId);
      return { ...method, factionDisplayName: faction ? displayEntityName(faction) : null };
    }
    if (method.type === 'syndicate-exchange-group') return { ...method, factionDisplayNames: (method.factionIds || []).map(id => data.factions.get(id)).filter(Boolean).map(displayEntityName) };
    if (method.type === 'quest-reward' && method.questCanonical) {
      const quest = data.quests.get(method.questCanonical);
      return { ...method, questId: quest?.id || null, questDisplayName: quest ? displayEntityName(quest) : null };
    }
    if (method.type === 'companion-included') return method;
    if (method.type === 'vendor-or-syndicate-exchange') {
      const npc = method.sourceEntityId ? (data.npcs.get(method.sourceEntityId) || data.arcaneSources.get(method.sourceEntityId) || data.locations.get(method.sourceEntityId)) : null;
      const location = data.locations.get(method.locationId || npc?.locationId || npc?.parentId);
      const excerpt = String(method.provenance?.excerpt || '');
      const standingMatch = excerpt.match(/(?:for\s+)?([\d,]+)\s+Standing/i);
      const rankMatch = excerpt.match(/Rank\s+(\d+)\s*-\s*([A-Za-z ]+?)(?:\s+with\s+|\s+in\s+|[.,]|$)/i);
      const officialRankNames = { Doer: '实践者', Associate: '同伴', Friend: '朋友', Trusted: '信赖' };
      const inferredStanding = standingMatch ? Number(standingMatch[1].replace(/,/g, '')) : null;
      const inferredRank = rankMatch ? Number(rankMatch[1]) : null;
      const inferredRankCanonical = rankMatch ? rankMatch[2].trim() : null;
      const rawRequirements = method.requirements?.type && method.requirements.type !== 'none' ? { ...method.requirements, rank: method.requirements.rank ?? inferredRank, rankName: method.requirements.rankName || officialRankNames[inferredRankCanonical] || null, amount: method.requirements.amount ?? method.standing ?? inferredStanding } : method.currency?.length ? { type: 'currency', usage: 'exchange', npcId: method.sourceEntityId, locationId: method.locationId || npc?.locationId, currency: method.currency } : method.standing || method.rank != null || inferredStanding || inferredRank != null ? { type: 'standing', npcId: method.sourceEntityId, locationId: method.locationId || npc?.locationId, rank: method.rank ?? inferredRank, rankName: method.rankName || officialRankNames[inferredRankCanonical] || null, amount: method.standing ?? inferredStanding } : null;
      if (rawRequirements?.type === 'currency') rawRequirements.currency = rawRequirements.currency.map(item => { const entity = data.currencies.get(item.currencyId || item.currencyCanonical) || (item.currencyCanonical === 'Nightwave Cred' ? [...data.currencies.values].reverse().find(value => /^Nora's Mix Vol\. \d+ Cred$/i.test(value.canonical)) : null); return entity ? { ...item, currencyId: entity.id } : item; });
      if (method.type === 'syndicate-exchange' && rawRequirements?.type === 'standing') rawRequirements.factionId = rawRequirements.factionId || method.factionId || null;
      if (method.type === 'syndicate-exchange' && rawRequirements?.type === 'standing') { rawRequirements.rank = rawRequirements.rank ?? method.requiredLevel ?? null; rawRequirements.rankName = rawRequirements.rankName || method.requiredRankName || null; rawRequirements.amount = rawRequirements.amount ?? method.standing ?? null; }
      const requirements = normalizeRequirements(rawRequirements);
      return { ...method, requirements, ...(npc ? { sourceDisplayName: displayEntityName(npc) } : {}), ...(location ? { locationId: location.id, locationDisplayName: displayEntityName(location) } : {}) };
    }
    if (method.type !== 'enemy-drop') return method;
    const enemy = data.enemies.get(method.sourceEntityId || method.sourceCanonical);
    if (!enemy) return { ...method, type: 'unresolved-source', sourceDisplayName: null };
    const location = enemy.locationId ? data.locations.get(enemy.locationId) : null;
    const parent = location?.parentId ? data.locations.get(location.parentId) : null;
    const missionType = enemy?.missionTypeId ? data.missionTypes.get(enemy.missionTypeId) : null;
    return {
      ...method,
      sourceEntityId: enemy.id,
      sourceDisplayName: (() => { const name = displayEntityName(enemy); const faction = enemy.factionId ? data.factions.get(enemy.factionId) : null; return faction ? name.replace(new RegExp(`^${faction.canonical}\\s*`, 'i'), displayEntityName(faction)) : name; })(),
      ...(enemy.bossLocation ? { bossLocation: enemy.bossLocation } : {}),
      ...(location ? { locationId: location.id, locationDisplayName: displayEntityName(location) } : {}),
      ...(parent ? { planetId: parent.id, planetDisplayName: displayEntityName(parent) } : {}),
      ...(missionType ? { missionTypeId: missionType.id, missionTypeDisplayName: displayEntityName(missionType) } : {})
    };
  };
  const renderModAcquisition = entry => {
    const syndicateMethods = mergeStructuredMethods(entry).filter(method => method.type === 'syndicate-exchange');
    if (!syndicateMethods.length) return null;
    const definition = modMethodDefinitions.get('syndicate-exchange');
    if (!definition) throw new Error('缺少 Mod 集团兑换 method 定义');
    const sourceLines = syndicateMethods.map(method => {
      const faction = data.factions.get(method.factionId);
      if (!faction?.displayName) throw new Error(`未注册集团变量 ${method.factionId}`);
      return renderTemplate(definition.sourceTemplate, { factionName: faction.displayName });
    });
    const effectText = (entry.effectDetails || []).join('；').replace(/[。；]+$/, '');
    const functionalCategory = getCategory(entry.subject?.categoryRefs?.[0]);
    const equipmentCategory = (entry.subject?.categoryRefs || []).map(getCategory).find(category => / Mod$/.test(category?.canonical || '') && category.id !== 'syndicatemod');
    if (functionalCategory?.id !== 'syndicatemod' || !functionalCategory.displayTemplate || !functionalCategory.modTypeText || !equipmentCategory?.displayName) throw new Error(`${entry.subject?.canonical} 缺少集团功能分类显示模板或装备位置变量`);
    const equipmentPositionText = equipmentCategory.displayName.replace(/\s*Mod$/i, '').trim();
    const categoryDisplayText = renderTemplate(functionalCategory.displayTemplate, {
      equipmentPositionText,
      modTypeText: functionalCategory.modTypeText
    });
    const header = renderTemplate(definition.headerTemplate, {
      modName: entry.subject?.displayName || entry.title,
      effectText,
      categoryDisplayText
    });
    return [header, `${definition.sourcesHeader}\n${sourceLines.join('\n')}`].join('\n\n');
  };
  const expandMethodRefs = entry => {
    const explicitRefs = entry.modAcquisition?.manual?.methodRefs || entry.methodRefs || [];
    const hasApprovedSourceOverride = mergeStructuredMethods(entry).some(method => method.reviewStatus === 'approved' && method.type === 'daily-tribute');
    const inheritedRefs = explicitRefs.length || hasApprovedSourceOverride
      ? []
      : (entry.subject?.categoryRefs || [])
        .flatMap(id => getCategory(id)?.defaultMethodRefs || []);
    return [...new Set([...explicitRefs, ...inheritedRefs])]
      .map(id => data.knowledge.find(item => item.module === 'gameplay' && item.id === id))
      .filter(Boolean);
  };
  const aggregateAcquisitionMethods = entries => {
    const methods = [];
    const seen = new Set();
    for (const entry of entries) {
      for (const method of expandMethodRefs(entry)) {
        if (seen.has(method.id)) continue;
        seen.add(method.id);
        methods.push(method);
      }
    }
    return {
      methods,
      sourceOptions: methods.map(method => ({
        id: method.id,
        title: method.title,
        query: method.acquisitionQuery || method.aliases?.[0] || method.title
      }))
    };
  };
  const getAcquisitionSourceOptions = entry => aggregateAcquisitionMethods([entry]).sourceOptions;
  const structuredGameplayMethods = entry => {
    if (mergeStructuredMethods(entry).length) return [];
    return expandMethodRefs(entry).map(method => {
      const requirements = normalizeRequirements(method.requirements);
      return {
        type: 'gameplay-route',
        methodRef: method.id,
        sourceDisplayName: method.title,
        acquisitionQuery: method.acquisitionQuery || method.aliases?.[0] || method.title,
        requirements,
        requirementLines: renderRequirements(requirements, data),
        provenance: { source: 'local-reviewed-gameplay', entryId: method.id }
      };
    });
  };
  const getAcquisitionDescription = entry => {
    if (entry.summary || entry.content) return entry.summary || entry.content;
    const primaryCategory = getCategory(entry.subject?.categoryRefs?.[0]);
    const methods = expandMethodRefs(entry);
    if (methods.length === 1 && methods[0].id === 'gameplay.baro-ki-teer') return `${entry.subject?.displayName || entry.title} 通常由虚空商人的轮换库存出售\n输入“刷 奸商”可了解兑换准备与轮换规则`;
    if (methods.length === 1 && methods[0].title) return `${entry.subject?.displayName || entry.title}从${methods[0].title}奖励中获得`;
    const acquisitionQuery = entry.acquisitionQuery
      || methods.find(method => method.acquisitionQuery)?.acquisitionQuery
      || methods[0]?.aliases?.[0]
      || primaryCategory?.displayName
      || '';
    return primaryCategory?.modDescription
      ? renderTemplate(primaryCategory.modDescription, {
        name: entry.subject?.displayName || entry.title,
        rewardTierSuffix: entry.rewardTier ? ` ${String(entry.rewardTier).toLowerCase()}` : '',
        acquisitionQuery
      })
      : null;
  };
  const acquisitionCollections = [
    {
      id: 'parkour-mods',
      title: '跑酷 Mod',
      description: '收录效果中明确包含跑酷速度的已审核 Mod，并汇总这些 Mod 的全部获取来源。',
      aliases: ['跑酷mod', '跑酷 Mod', '跑酷卡'],
      matches: entry => (entry.effects || []).some(effect => String(effect.displayName || '').includes('跑酷速度'))
        || (entry.effectDetails || []).some(detail => String(detail || '').includes('跑酷速度'))
    }
  ];
  const getAcquisitionCollection = query => {
    const raw = String(query || '').trim();
    if (!raw) return null;
    const definition = acquisitionCollections.find(collection => collection.aliases.some(alias => normalize(alias) === normalize(raw)));
    if (!definition) return null;
    const entries = data.knowledge.filter(entry => entry.module === 'acquisition' && definition.matches(entry));
    const { methods, sourceOptions } = aggregateAcquisitionMethods(entries);
    return {
      query: raw,
      resolution: null,
      entry: null,
      collection: {
        id: definition.id,
        title: definition.title,
        description: definition.description
      },
      entries,
      methods,
      sourceOptions,
      structuredMethods: entries.flatMap(mergeStructuredMethods),
      wikiEvidence: entries.flatMap(entry => entry.modAcquisition?.generated?.wiki?.evidence || []),
      alternatives: []
    };
  };
  const getItemAcquisition = (query, acquisitionOptions = {}) => {
    const resolved = resolveItem(query);
    if (!resolved) return createAcquisitionResult({ query, status: 'not-found' });
    if (resolved.kind === 'ambiguous') return createAcquisitionResult({ query, status: 'ambiguous', notes: resolved.candidates.map(item => item.displayName) });
    if (resolved.kind === 'official-item') {
      const resourceEntry = allKnowledge.find(entry => entry.module === 'acquisition' && entry.subject?.category === 'resource' && normalize(entry.subject?.canonical) === normalize(resolved.item.canonical));
      const resourceResult = resourceEntry?.reviewStatus === 'approved' ? resourceAcquisition.getResourceAcquisition(resolved.item.canonical) : null;
      const evidence = resourceEntry
        ? (resourceResult?.structuredMethods || []).map(method => createAcquisitionEvidence({
            type: method.type,
            source: method.sourceDisplayName || method.locationDisplayName || method.missionTypeDisplayName || '审核获取方法',
            sourceId: method.sourceEntityId || null,
            locationId: method.locationId || null,
            chance: method.chance ?? null,
            quantity: method.quantity ?? null
          }))
        : (resolved.item.drops || []).map(drop => createAcquisitionEvidence({ type: 'drop', source: drop.location || 'Warframe Public Export', chance: drop.chance ?? null }));
      if (!resolved.recipeVariant?.pendingWikiEvidence) evidence.push(...(resolved.item.recipes || []).map(recipe => createAcquisitionEvidence({ type: 'recipe', source: resourceEntry ? '审核制造配方' : (resolved.item.sourceFile || recipe.provenance?.source || 'Warframe Public Export'), sourceId: recipe.id, quantity: recipe.outputQuantity })));
      const notes = [
        ...(resolved.recipeVariant?.pendingWikiEvidence ? [resolved.recipeVariant.note] : []),
        ...(resourceEntry && !resourceResult ? ['资源获取来源尚未完成实体化审核，原始上游字段已从发布证据隔离。'] : [])
      ];
      return createAcquisitionResult({ query, item: resolved.item, evidence, recipeVariants: resolved.recipeVariant ? [resolved.recipeVariant] : resolved.item.recipeVariants, status: !resourceEntry || resourceResult ? 'resolved' : 'review-required', notes });
    }
    if (resolved.kind === 'weapon' || resolved.kind === 'consumable') {
      const local = getAcquisition(query, acquisitionOptions);
      const evidence = (local?.structuredMethods || []).map(method => createAcquisitionEvidence({
        type: method.type,
        source: method.sourceDisplayName || method.sourceCanonical || method.sourceEntityId || method.npcId || method.factionId || method.questId || method.locationId || method.missionTypeId || method.provenance?.source || 'structured-acquisition',
        sourceId: method.sourceEntityId || null,
        locationId: method.locationId || null,
        npcId: method.npcId || null,
        chance: method.chance ?? null,
        quantity: method.quantity ?? null,
        note: method.provenance?.source || null
      }));
      return createAcquisitionResult({ query, item: resolved.item, evidence, recipeVariants: local?.recipes || [], status: local ? 'resolved' : 'review-required' });
    }
    if (resolved.kind === 'arcane') {
      const generated = resolved.item.arcaneAcquisition?.generated?.acquisition;
      const methods = [...(resolved.item.arcaneAcquisition?.manual?.methods || []), ...(generated?.methods || [])];
      const evidence = methods.map(method => createAcquisitionEvidence({
        type: method.type, source: method.sourceCanonical || 'Warframe Public Export',
        chance: method.type === 'vendor-or-syndicate-exchange' ? null : method.probability ?? null,
        quantity: method.quantity ?? method.outputQuantity ?? 1,
        note: method.provenance?.note || null
      }));
      return createAcquisitionResult({ query, item: resolved.item, evidence, status: generated?.status === 'review-required' ? 'review-required' : 'resolved' });
    }
    if (resolved.kind === 'mod') {
      const local = getAcquisition(query, acquisitionOptions);
      return createAcquisitionResult({ query, item: resolved.item, evidence: local ? [createAcquisitionEvidence({ type: 'knowledge', source: local.entry?.id || 'official-mod-catalog' })] : [], status: 'resolved' });
    }
    return createAcquisitionResult({ query, item: resolved.item, evidence: [createAcquisitionEvidence({ type: 'warframe', source: resolved.item.uniqueName || resolved.item.officialUniqueName || resolved.item.subject?.officialUniqueName || resolved.item.id || 'warframe-catalog' })], status: 'resolved' });
  };
  const getAcquisition = (query, searchOptions = {}) => {
    // Acquisition accepts fuzzy official names, but never partial weapon aliases.
    searchOptions = { ...searchOptions, resolveOptions: { ...searchOptions.resolveOptions, weaponAliasesExactOnly: true } };
    const raw = String(query || '').trim();
    if (!raw) return null;
    const resolverIntent = parseResolverIntent(raw);
    // Locations are authoritative entities too.  `wk` should be able to
    // resolve a hub/mission location and return its Wiki links even when it
    // has no item acquisition card of its own.
    const locationQuery = resolverIntent.query || resolverIntent.commandStripped || raw;
    const location = data.locations?.get(raw)
      || data.locations?.get(locationQuery)
      || data.locations?.get(resolverIntent.commandStripped);
    if (location) {
      const displayName = displayEntityName(location) || location.canonical;
      return {
        query: raw,
        resolution: { canonical: location.canonical, exact: true },
        entry: null,
        description: `${displayName}（${location.canonical}）`,
        categories: [location.category || location.kind || 'location'],
        methods: [],
        sourceOptions: [],
        structuredMethods: [],
        location,
        alternatives: []
      };
    }
    // 1) 黑话优先（元素/派系伤害 mod 的常用黑话）
    const elementModSlang = elementModSlangResolver.resolve(resolverIntent.query || resolverIntent.commandStripped);
    if (elementModSlang.status === 'resolved' && normalize(elementModSlang.relation.canonical) !== normalize(raw)) {
      return getAcquisition(elementModSlang.relation.canonical, searchOptions);
    }
    const factionDamageModSlang = factionDamageModSlangResolver.resolve(resolverIntent.query || resolverIntent.commandStripped);
    if (factionDamageModSlang.status === 'resolved' && normalize(factionDamageModSlang.relation.canonical) !== normalize(raw)) {
      return getAcquisition(factionDamageModSlang.relation.canonical, searchOptions);
    }
    // 2) 之后按固定层级逐层模糊匹配，命中即返回（用户指定的优先级，逐层过一遍）：
    //    战甲 → 武器 → 赋能 → MOD → 挖矿 → 钓鱼。
    //    这样 `刷 水晶` 命中 Citrine（战甲层）、`刷 咖喱` 命中 Excalibur（战甲层），
    //    不会被「女侯爵赤色水晶」这类名字里含该串的物品、或被 MOD 的模糊命中抢先。
    //    注意：这里不能再加 getOfficialMod 之类的"MOD 提前命中"短路，那正是 咖喱→Endurance Drift 的原因。
    for (const domain of ['frames', 'weapons']) {
      const hit = resolveDomainAlias(data.aliases, domain, raw, { exactOnly: true });
      if (!hit?.canonical || normalize(hit.canonical) === normalize(raw)) continue;
      return getAcquisition(hit.canonical, searchOptions);
    }
    const rawArcaneHit = resolveArcane(raw, searchOptions.resolveOptions || {});
    // 赋能层同样只认精确名字/别名：它的模糊匹配会把 `水晶` 这类查询糊到别的赋能上。
    // 精确判定提到块外保存：下面的官方道具层必须知道「这个查询就是某个赋能」，见那里的守卫。
    // 注意 resolveArcane 的精确命中只回 {alias, canonical, match:'exact'}，不带 displayName/别名列表，
    // 所以中文形态（主要无情 / 主要·无情）必须认 match==='exact'，否则会被判成"非精确"而落进官方道具层。
    const rawArcaneExact = Boolean(rawArcaneHit && !rawArcaneHit.ambiguous
      && (rawArcaneHit.match === 'exact'
        || [rawArcaneHit.canonical, rawArcaneHit.displayName, ...(rawArcaneHit.aliases || [])]
          .some(name => String(name || '').trim() === raw)));
    {
      if (rawArcaneExact && normalize(rawArcaneHit.canonical || '') !== normalize(raw)) {
        return getAcquisition(rawArcaneHit.canonical, searchOptions);
      }
      const modHit = resolveDomainAlias(data.aliases, 'mods', raw, { exactOnly: true });
      if (modHit?.canonical && normalize(modHit.canonical) !== normalize(raw)) return getAcquisition(modHit.canonical, searchOptions);
      const miningHit = miningQueries.resolve(raw);
      if (miningHit?.canonical && normalize(miningHit.canonical) !== normalize(raw)) return getAcquisition(miningHit.canonical, searchOptions);
      const fishingHit = fishingQueries.resolve(raw);
      if (fishingHit?.canonical && normalize(fishingHit.canonical) !== normalize(raw)) return getAcquisition(fishingHit.canonical, searchOptions);
    }
    // 3) 官方道具层（DE 导出里可制作/可掉落的道具，如聚焦晶体）。名字精确命中就直接落到道具本身：
    //    「夜灵晶体」的短别名「夜灵」会让下面的 resolveName 按 text-weighted 把它判成 Revenant
    //    （徘徊夜灵），于是 getAcquisition 返回战甲卡、`刷 夜灵晶体` 渲染出一张夜灵卡。
    //    放在这里（已审核资源层/战甲武器层之后、模糊层之前）：`刷 神经传感器`/`刷 夜灵之息` 这类
    //    有审核条目的道具仍走原路径，`刷 夜灵` 也仍然是 Revenant（没有叫「夜灵」的官方道具）。
    // 赋能不能被官方道具层吞掉：DE 官方道具导出里同样存在赋能条目，但导出只带 uniqueName 与说明，
    // 没有任何获取方法。这里若按 official-item 返回，entry 就是 null，getAcquisitionCard 直接返回
    // null，运行时只会回「X 暂时无法用于刷取查询」——整张赋能卡消失。精确命中的赋能放行到下面的赋能层。
    const officialItemHit = rawArcaneExact ? null : (getOfficialItem(raw) || officialItemByPartSuffix(raw));
    if (officialItemHit?.canonical && !hasReviewedResourceEntry(officialItemHit, raw)) {
      return {
        query: raw,
        resolution: {
          canonical: officialItemHit.canonical,
          displayName: officialItemHit.displayName || officialItemHit.canonical,
          uniqueName: officialItemHit.uniqueName || null,
          category: 'official-item',
          exact: true
        },
        entry: null,
        officialItem: officialItemHit,
        description: officialItemHit.description?.display || officialItemHit.description?.canonical || null,
        recipes: officialItemRecipes(officialItemHit),
        methods: [],
        sourceOptions: [],
        structuredMethods: [],
        alternatives: []
      };
    }
    if (resolverIntent.categories.length && !resolverIntent.categories.includes('arcane') && !getOfficialMod(raw)) {
      const typedCollection = getAcquisitionCollection(raw);
      if (typedCollection) return typedCollection;
      const typedResolution = resolveName(raw, searchOptions.resolveOptions || {});
      if (!typedResolution || typedResolution.ambiguous) return { query: raw, resolution: typedResolution, entry: null, methods: [], sourceOptions: [], alternatives: [] };
      return getAcquisition(typedResolution.canonical, searchOptions);
    }
    const explicitArcaneType = /赋能/i.test(raw);
    const explicitArcaneResolution = explicitArcaneType ? resolveArcane(raw, searchOptions.resolveOptions || {}) : null;
    if (explicitArcaneResolution?.ambiguous) {
      return { query: raw, resolution: explicitArcaneResolution, entry: null, methods: [], sourceOptions: [], alternatives: [] };
    }
    if (explicitArcaneType && !explicitArcaneResolution) {
      return { query: raw, resolution: null, entry: null, methods: [], sourceOptions: [], alternatives: [] };
    }
    const equipmentResult = equipmentAcquisition.getEquipmentAcquisition(raw);
    if (equipmentResult) return equipmentResult;
    const sentinelResult = sentinelAcquisition.getSentinelAcquisition(raw);
    if (sentinelResult) return sentinelResult;
    const weaponGap = getWeaponGap(raw);
    if (weaponGap) return { query: raw, resolution: { canonical: weaponGap.canonical, exact: true }, entry: null, description: `${weaponGap.displayName}已在 DE 官方简体中文语言数据中出现，但当前 ExportWeapons 尚未提供完整 uniqueName、属性、倾向和来源结构，因此保持待审，禁止猜造获取路径。`, categories: [], methods: [], sourceOptions: [], structuredMethods: [], weaponGap, alternatives: [] };
    const consumableEntry = getConsumable(raw);
    if (consumableEntry) {
      const structuredMethods = routesToMethods(consumableEntry.consumableAcquisition?.generated?.routes || [], data)
        .filter(method => method.reviewStatus === 'approved' && method.type !== 'recipe' && method.category !== 'unresolved');
      const acquisitionText = renderAcquisition(structuredMethods, { displayName: consumableEntry.subject.displayName, registries: data, showProbabilities: false });
      const officialDescription = consumableEntry.description?.display || '';
      const tips = consumableEntry.consumableAcquisition?.manual?.tips || [];
      const description = [officialDescription, acquisitionText, tips.length ? `小技巧：\n${tips.map(tip => `- ${tip}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
      return { query: raw, resolution: { canonical: consumableEntry.subject.canonical, exact: true }, entry: consumableEntry, description, categories: consumableEntry.subject.categoryRefs || [], methods: [], sourceOptions: [], structuredMethods, recipes: consumableEntry.recipes || [], alternatives: [] };
    }
    const reviewedWeapon = resolveReviewedWeaponAlias(raw);
    const weaponEntry = reviewedWeapon?.ambiguous ? null : getWeapon(reviewedWeapon?.canonical || raw);
    if (weaponEntry) {
      const { isFounderPrime } = require('./prime-acquisition');
      const allStructuredMethods = routesToMethods(weaponEntry.acquisition?.routes || [], data).filter(method => method.reviewStatus !== 'review-required' || method.category !== 'unresolved');
      const prime = weaponEntry.acquisition?.prime;
      const founderPrime = isFounderPrime(weaponEntry.subject?.canonical);
      const structuredMethods = founderPrime ? [] : prime?.kind === 'prime-relic'
        ? (prime.status === '已入库' ? [] : allStructuredMethods.filter(method => method.type === 'relic-reward' && prime.methods.some(selected => selected.relicCanonical === method.relicCanonical)))
        : allStructuredMethods.filter(method => method.type !== 'relic-reward');
      const primeStatusText = founderPrime ? '已绝版' : prime?.kind === 'prime-relic' ? (prime.status === '已入库' ? `${weaponEntry.subject.displayName}当前已入库，官方当前掉落表中没有可刷取遗物。` : `Prime 状态：${prime.status}`) : null;
      const primeRelicText = prime?.kind === 'prime-relic' && prime.status !== '已入库' ? (() => { const { renderPrimePartGroups } = require('./prime-acquisition'); const componentNames = (weaponEntry.acquisition?.routes || []).filter(route => route.scope === 'component').map(route => route.variables?.partName).filter(Boolean); return `${weaponEntry.subject.displayName}当前可刷遗物：\n${renderPrimePartGroups(structuredMethods, { componentNames }).join('\n')}` })() : null;
      const acquisitionText = [primeStatusText, primeRelicText || renderAcquisition(structuredMethods, { displayName: weaponEntry.subject.displayName, canonical: weaponEntry.subject.canonical, recipes: weaponEntry.recipes || [], registries: data, showProbabilities: false })].filter(Boolean).join('\n');
      const officialDescription = weaponEntry.description?.localizationStatus === 'official-zh' ? weaponEntry.description.display : '';
      // 待审 route 属于维护报告，不是用户文案。运行时只发布已经结构化、批准并本地化的来源；
      // 禁止将“缺哪个部件来源”这类内部质量门结果泄漏到群聊。
      const description = [officialDescription, acquisitionText].filter(Boolean).join('\n\n');
      const sourceOptions = structuredMethods.some(method => /Sanctuary(?:\/|\s|.*\()|Sanctuary Onslaught/i.test(String(method.sourceCanonical || method.missionTypeCanonical || method.sourceDisplayName || '')))
        ? [{ id: 'gameplay.sanctuary-onslaught', title: '\u5723\u6bbf\u7a81\u88ad', query: '\u5723\u6bbf\u7a81\u88ad' }]
        : [];
      return { query: raw, resolution: { canonical: weaponEntry.subject.canonical, exact: true }, entry: weaponEntry, description, categories: weaponEntry.subject.categoryRefs || [], methods: [], sourceOptions, structuredMethods, recipes: weaponEntry.recipes || [], disposition: weaponEntry.weaponIdentity?.omegaAttenuation ?? null, alternatives: [] };
    }
    const arcaneEntry = explicitArcaneResolution
      ? (data.arcanes || []).find(entry => normalize(entry.subject?.canonical) === normalize(explicitArcaneResolution.canonical))
      : getArcane(raw);
    if (arcaneEntry) {
      const generated = arcaneEntry.arcaneAcquisition?.generated || {};
      const category = generated.classification?.category || 'legacy';
      const maxRank = Number(arcaneEntry.maxRank ?? generated.stats?.maxRank ?? 0);
      const rankFusion = getArcaneMetadata(arcaneEntry.subject?.officialUniqueName || arcaneEntry.subject?.canonical)?.rankFusion
        || arcaneFusionMetadata(maxRank, arcaneMethodDefinition?.rankCopyRule);
      const structuredMethods = routesToMethods([{ scope: 'item', category: 'arcane', requirements: { type: 'none' }, methods: mergeArcaneMethods(arcaneEntry), status: arcaneEntry.acquisitionStatus || 'review-required' }], data);
      const publishedMethods = structuredMethods.filter(method => method.reviewStatus !== 'review-required');
      const methodRequirements = structuredMethods.map(method => normalizeRequirements(method.requirements)).filter(requirement => requirement.type !== 'none');
      // 多来源赋能的条件属于各自 method，不能再提升到结果顶层重复渲染。
      const requirements = { type: 'none' };
      const requirementLines = [];
      const wikiEvidence = generated.wiki?.evidence || [];
      return {
        query: raw,
        resolution: { canonical: arcaneEntry.subject.canonical, exact: true },
        entry: arcaneEntry,
        description: [renderArcaneAcquisition(arcaneEntry), renderAcquisition(publishedMethods, { displayName: arcaneEntry.subject?.displayName || arcaneEntry.title, registries: data, showProbabilities: false })].filter(Boolean).join('\n\n'),
        categories: [{ id: category, displayName: arcaneMethodDefinition?.categoryLabels?.[category] || category }],
        methods: [],
        sourceOptions: [],
        requirements,
        requirementLines,
        structuredMethods,
        wikiEvidence,
        arcane: { category, maxRank, requiredCopies: rankFusion.requiredCopies, rankFusion, availability: category === 'legacy' ? 'unavailable-review-required' : 'available' },
        alternatives: []
      };
    }
    const officialMod = getOfficialMod(raw);
    const collection = getAcquisitionCollection(raw);
    if (collection) return collection;
    const resourceCollection = resourceAcquisition.getResourceCollection(raw);
    if (resourceCollection) return {
      query: raw,
      resolution: { ambiguous: resourceCollection.candidates.map(candidate => ({ alias: candidate.displayName, canonical: candidate.canonical, category: 'resource' })) },
      entry: null,
      collection: { id: resourceCollection.id, title: resourceCollection.title, description: '该泛称对应多个官方资源实体，请选择具体名称。' },
      entries: resourceCollection.entries,
      methods: [],
      sourceOptions: [],
      structuredMethods: [],
      alternatives: []
    };
    const resourceResult = resourceAcquisition.getResourceAcquisition(raw);
    if (resourceResult) return {
      query: raw, resolution: { canonical: resourceResult.entry.subject.canonical, exact: true }, entry: resourceResult.entry,
      description: resourceResult.text, resourceRoute: { text: resourceResult.routeText, tips: resourceResult.tips, source: 'resource-method' },
      categories: [], methods: [], sourceOptions: [], requirements: { type: 'none' }, requirementLines: [],
      structuredMethods: resourceResult.structuredMethods, alternatives: []
    };
    // 战甲规范名已经由命令层完成解析时必须精确锁定；通用别名解析可能把
    // "Wukong Prime" 之类的名称再次降级为普通 "Wukong"。
    const exactKnowledgeEntry = allKnowledge.find(item => item.module === 'acquisition'
      && [item.subject?.canonical, item.subject?.displayName, item.officialUniqueName].some(value => normalize(value) === normalize(raw)));
    const exactFrameEntry = exactKnowledgeEntry?.subject?.category === 'frame' ? exactKnowledgeEntry : null;
    const resolution = exactKnowledgeEntry
      ? { canonical: exactKnowledgeEntry.subject.canonical, exact: true }
      : officialMod
        ? { canonical: officialMod.canonical, exact: true }
        : resolveName(raw, searchOptions.resolveOptions || {});
    if (resolution?.ambiguous) return { query: raw, resolution, entry: null, methods: [], sourceOptions: [], alternatives: [] };
    const canonical = exactKnowledgeEntry?.subject?.canonical || resolution?.canonical || raw;
    // 所有 Mod 都必须在编译阶段生成同一种标准 acquisition entry；运行时禁止
    // 根据 Languages.bin、warframe-items 或任何其他上游来源临时合成第二类条目。
    const entry = exactKnowledgeEntry || allKnowledge.find(item => item.module === 'acquisition' && normalize(item.subject?.canonical) === normalize(canonical));
    if (!entry) return getAcquisitionCollection(raw);
    const resolvedOfficialMod = officialMod || getOfficialMod(entry.subject?.canonical || entry.subject?.displayName);
    const { methods, sourceOptions: inheritedSourceOptions } = aggregateAcquisitionMethods([entry]);
    const rawStructuredMethods = mergeStructuredMethods(entry);
    const hasSyndicateMethods = rawStructuredMethods.some(method => ['syndicate-exchange', 'syndicate-exchange-group'].includes(method.type));
    const sourceOptions = [...inheritedSourceOptions];
    if (hasSyndicateMethods && !sourceOptions.some(source => source.id === 'gameplay.syndicate-offerings')) sourceOptions.push({ id: 'gameplay.syndicate-offerings', title: '\u96c6\u56e2\u4f9b\u54c1', query: '\u96c6\u56e2' });
    const requirements = normalizeRequirements(entry.modAcquisition?.manual?.requirements);
    const requirementLines = renderRequirements(requirements, data);
    const isFrame = entry.subject?.category === 'frame';
    const { isFounderPrime } = require('./prime-acquisition');
    const isFounderFrame = isFrame && isFounderPrime(entry.subject?.canonical);
    const primeFrame = isFrame && entry.frameAcquisition?.generated?.isPrime && !isFounderFrame
      ? frameAcquisition.getPrimeRelics(entry.subject.canonical, null, null)
      : null;
    const primeFrameDescription = primeFrame
      ? frameAcquisition.renderAcquisition({ frame: frameAcquisition.resolveWarframe(entry.subject.canonical), prime: primeFrame })
      : isFounderFrame ? '已绝版' : null;
    const frameRoute = isFrame ? frameAcquisition.renderRoutedAcquisition(canonical) : null;
    const hasReviewRequiredExchange = rawStructuredMethods.some(method => ['vendor-exchange', 'vendor-or-syndicate-exchange', 'syndicate-exchange'].includes(method.type) && method.reviewStatus === 'review-required')
      || (entry.frameAcquisition?.generated?.routing?.methods || []).some(method => ['vendor-exchange', 'vendor-or-syndicate-exchange', 'syndicate-exchange'].includes(method.type) && method.requirements?.type === 'standing' && !(Number(method.requirements.amount) > 0));
    if (isFrame && !entry.frameAcquisition?.generated?.isPrime && !frameRoute && !hasReviewRequiredExchange) {
      throw new Error(`战甲 ${canonical} 的分类路由未能从 method 或人工条目渲染，禁止回退到旧硬编码文案`);
    }
    const frameRouting = entry.frameAcquisition?.manual?.routingOverride || entry.frameAcquisition?.generated?.routing || {};
    const frameRouteMethods = isFrame && (frameRoute || hasReviewRequiredExchange) ? (() => {
      const variables = frameRouting.componentVariables || {};
      const frameCost = Number(frameAcquisition.resolveWarframe(canonical)?.bpCost || entry.subject?.bpCost);
      const methods = (frameRouting.methods || []).map(method => method.type === 'market-purchase'
        && method.scope === 'blueprint'
        && frameCost > 0
        ? {
            ...method,
            requirements: {
              ...(method.requirements || {}),
              type: 'currency',
              currency: [{ currencyId: 'currency.credits', amount: frameCost }],
              isBuffUseless: true
            }
          }
        : method);
      if (frameRouting.componentCategory === 'frame-assassination' && variables.enemyId) {
        methods.push({
          type: 'enemy-drop',
          scope: 'component',
          category: 'frame-assassination',
          sourceEntityId: variables.enemyId,
          locationId: variables.locationId || variables.acquisitionSourceId,
          missionTypeId: variables.missionTypeId || 'mission-type.assassination',
          variables: { partName: '头部、机体、系统', appearanceCondition: variables.appearanceCondition || null },
          requirements: frameRouting.requirements || { type: 'none' },
          hideProbability: true,
          reviewStatus: 'approved',
          provenance: { source: 'frame-route', entryId: entry.id, sourceCanonical: variables.sourceCanonical }
        });
      } else if (frameRoute?.componentLine || variables.sourceGroups?.length) {
        const questComponent = frameRouting.componentCategory === 'frame-quest' && variables.questId
        methods.push({
          type: questComponent ? 'quest-reward' : 'route',
          scope: questComponent ? 'component' : 'components',
          category: frameRouting.componentCategory || entry.subject?.categoryRefs?.[0],
          ...(questComponent ? { questId: variables.questId } : {}),
          variables: {
            ...(questComponent ? { partName: '部件蓝图', firstCompletion: true } : { text: frameRoute?.componentLine || '' }),
            ...(variables.sourceGroups ? { sourceGroups: variables.sourceGroups } : {}),
            ...(variables.objective ? { objective: variables.objective } : {}),
            ...(variables.presentation ? { presentation: variables.presentation } : {})
          },
          requirements: frameRouting.requirements || { type: 'none' },
          provenance: { source: 'frame-route', entryId: entry.id }
        });
      }
      if (frameRoute?.blueprintLine && !methods.some(method => method.scope === 'blueprint')) methods.push({
        type: 'route',
        scope: 'blueprint',
        category: frameRouting.blueprintCategory || 'blueprint',
        variables: { text: frameRoute.blueprintLine },
        requirements: frameRouting.blueprintCategory === 'market' && Number(frameAcquisition.resolveWarframe(canonical)?.bpCost || entry.subject?.bpCost) > 0
          ? { type: 'currency', currency: [{ currencyId: 'currency.credits', amount: Number(frameAcquisition.resolveWarframe(canonical)?.bpCost || entry.subject.bpCost) }], isBuffUseless: true }
          : { type: 'none' },
        provenance: { source: 'frame-route', entryId: entry.id }
      });
      methods.sort((left, right) => (left.scope === 'blueprint' ? -1 : 0) - (right.scope === 'blueprint' ? -1 : 0));
      return methods;
    })() : [];
    if (isFrame && !primeFrameDescription && !isFounderFrame && entry.frameAcquisition?.generated?.isPrime && frameRouting.componentVariables?.sourceText) {
      frameRouteMethods.push({ type: 'route', scope: 'components', category: 'frame-prime-relic', variables: { text: frameRouting.componentVariables.sourceText }, requirements: { type: 'none' }, reviewStatus: 'approved', provenance: { source: 'official-prime-relic-evidence', entryId: entry.id } });
    }
    const circuit = isFrame ? frameAcquisition.getNormalCircuitWarframe(canonical) : null;
    if (circuit) frameRouteMethods.push({
      type: 'circuit-reward',
      scope: 'all-blueprints',
      sourceEntityId: 'activity.the-circuit',
      variables: { week: circuit.week, fullSet: true, rewardTiers: circuit.rewardTiers },
      requirements: { type: 'none' },
      reviewStatus: 'approved',
      provenance: { source: 'normal-circuit-warframes', factId: circuit.sourceFactId }
    });
    const frameStructuredMethods = compileStructuredMethods(frameRouteMethods, data);
    const structuredMethods = compileStructuredMethods([
      ...rawStructuredMethods.map(enrichModMethod).map(method => Number.isFinite(method.chance) && method.chance > 1 ? { ...method, chance: method.chance / 100 } : method).filter(method => method.type !== 'unresolved-source'),
      ...structuredGameplayMethods(entry),
      ...frameStructuredMethods
    ], data);
    const hasSpyMethods = structuredMethods.some(method => method.type === 'mission-reward' && (
      /^Spy$/i.test(String(method.missionTypeCanonical || ''))
      || method.missionTypeId === 'mission-type.spy'
      || /\u95f4\u8c0d/.test(String(method.missionTypeDisplayName || ''))
      || /(?:^|\/)Lua(?:\/|\s|$)|\(Spy\)|\sSpy(?:\/|\s|$)/i.test(String(method.sourceCanonical || ''))
    ));
    if (hasSpyMethods && !sourceOptions.some(source => source.id === 'gameplay.spy-missions')) sourceOptions.push({ id: 'gameplay.spy-missions', title: '\u95f4\u8c0d\u4efb\u52a1', query: '\u95f4\u8c0d' });
    for (const gameplay of gameplayEntries) {
      const sourceEntityIds = new Set(gameplay.sourceEntityIds || []);
      const missionTypeIds = new Set(gameplay.missionTypeIds || []);
      // Narmer bounty rows are exported with the underlying Cetus/Fortuna
      // mission type, but they belong exclusively to the Narmer bounty route.
      // Do not let those rows pull in the ordinary Cetus/Orb Vallis set-mod
      // gameplay descriptions as related sources.
      const matches = structuredMethods.some(method => {
        const isNarmerSource = /^Narmer\b/i.test(String(method.sourceCanonical || ''));
        if (isNarmerSource && gameplay.id !== 'gameplay.narmer-bounty') return false;
        return sourceEntityIds.has(method.sourceEntityId) || sourceEntityIds.has(method.locationId) || missionTypeIds.has(method.missionTypeId);
      });
      if (matches && !sourceOptions.some(source => source.id === gameplay.id)) {
        sourceOptions.push({ id: gameplay.id, title: gameplay.title, query: gameplay.acquisitionQuery || gameplay.aliases?.[0] || gameplay.title });
      }
    }
    const hasSanctuaryMethods = structuredMethods.some(method => /Sanctuary(?:\/|\s|.*\()|Sanctuary Onslaught/i.test(String(method.sourceCanonical || method.missionTypeCanonical || method.sourceDisplayName || '')))
      || /Sanctuary Onslaught/i.test(JSON.stringify(entry.acquisition?.prime?.methods || []));
    if (hasSanctuaryMethods && !sourceOptions.some(source => source.id === 'gameplay.sanctuary-onslaught')) sourceOptions.push({ id: 'gameplay.sanctuary-onslaught', title: '\u5723\u6bbf\u7a81\u88ad', query: '\u5723\u6bbf\u7a81\u88ad' });
    const syndicateDescription = renderModAcquisition(entry);
    const defaultDescription = frameRoute?.lines?.join('\n') || syndicateDescription || getAcquisitionDescription(entry);
    const structuredDescription = renderAcquisition(structuredMethods, { displayName: entry.subject?.displayName || entry.title, registries: data });
    const hasApprovedDailyTribute = structuredMethods.some(method => method.type === 'daily-tribute' && method.reviewStatus === 'approved');
    const syndicateHeader = hasSyndicateMethods && syndicateDescription ? syndicateDescription.split(/\n\n获取来源：/)[0] : null;
    const exchangeMethods = structuredMethods.filter(method => method.reviewStatus !== 'review-required' && (method.type === 'vendor-or-syndicate-exchange' || method.type === 'vendor-exchange'));
    const hasStructuredExchange = exchangeMethods.length > 0;
    const hasScopedExchangePricing = exchangeMethods.some(method => ['blueprint', 'component'].includes(method.scope) && Number(method.requirements?.amount) > 0);
    const hasReviewedManualFrameDescription = isFrame && Boolean(entry.frameAcquisition?.manual?.acquisitionText);
    // 显式 sourceText 是数据驱动的权威文案：此时不再拼 structured 描述，
    // 否则刺客类会额外注入“总图：完成指定任务获得”占位与重复的兑换行。
    const useStructuredFrameDescription = (frameRouting.componentCategory === 'frame-assassination' && !frameRouting.componentVariables?.sourceText)
      || (isFrame && hasStructuredExchange && (frameRouting.componentCategory === 'frame-quest' || (hasScopedExchangePricing && !hasReviewedManualFrameDescription)));
    const framePrimaryDescription = primeFrameDescription || (useStructuredFrameDescription && structuredDescription
      ? structuredDescription
      : isFrame && hasStructuredExchange
        ? defaultDescription?.split('\n').filter(line => !/^也可.+兑换：/.test(line)).join('\n')
        : defaultDescription);
    const frameMarketSupplement = isFrame && !/总图/.test(framePrimaryDescription || '')
      ? renderAcquisition(structuredMethods.filter(method => method.type === 'market-purchase' && method.scope === 'blueprint'), { registries: data }) : null;
    const hasVisibleExchangeEntry = /(?:找|向|在).{0,40}兑换|兑换：部件蓝图|整套蓝图：.+兑换/m.test(framePrimaryDescription || '');
    const frameExchangeSupplement = isFrame && hasStructuredExchange && !hasVisibleExchangeEntry
      ? renderAcquisition(exchangeMethods, { registries: data }) : null;
    const frameCircuitSupplement = isFrame && circuit && !/普通无尽回廊/.test(framePrimaryDescription || '')
      ? renderAcquisition(structuredMethods.filter(method => method.type === 'circuit-reward'), { registries: data }) : null;
    const frameDescription = isFrame
      ? (() => {
          const lines = [frameMarketSupplement, framePrimaryDescription, frameExchangeSupplement, frameCircuitSupplement]
            .filter(Boolean).flatMap(value => String(value).split('\n'))
            // 标签规范化（用户口径）：任务赠送总图的行必须是「总图：完成《…》获得总图」。
            .map(line => (/^\s*(?:全套|总图|部件)\s*[：:]/.test(line) || !/^完成《.+》获得总图/.test(String(line).trim()) ? line : `总图：${String(line).trim()}`));
          // 分类去重（底层）：同一类获取方式只保留一条——优先保留带「全套/总图/部件」标签的
          // 规范行，再退化为内容更长的行。这样 Nidus 的
          //   「总图：于中枢SIMARIS处花费50,000声望兑换」+「于中枢SIMARIS处花费50,000声望兑换」
          // 只留一条，无尽回廊也不会同时出现规范行与方法行。
          const dedupeKey = (value) => String(value || '').replace(/\s+/g, '').replace(/[，。、；：·,.;:()（）“”"']/g, '');
          const kindOf = (value) => {
            const text = String(value || '');
            if (/无尽回廊|灵化表/.test(text)) return 'circuit';
            if (/SIMARIS|Simaris/i.test(text)) return 'simaris';
            if (/商店|市场/.test(text)) return 'market';
            if (/完成《|系列任务/.test(text)) return 'quest';
            return null;
          };
          const isLabeled = (value) => /^\s*(全套|总图|部件)\s*[：:]/.test(String(value || ''));
          const kept = [];
          const keptKeys = [];
          const kinds = new Map();
          for (const line of lines) {
            const key = normalizeVisibleLine(line);
            if (!key) continue;
            const norm = dedupeKey(line);
            if (keptKeys.some(existing => existing.includes(norm) || norm.includes(existing))) continue;
            const kind = kindOf(line);
            if (kind && kinds.has(kind)) {
              const previous = kinds.get(kind);
              const preferNew = (isLabeled(line) && !isLabeled(previous.line))
                || (!isLabeled(previous.line) && !isLabeled(line) && norm.length > dedupeKey(previous.line).length);
              if (preferNew) {
                kept[previous.index] = line;
                keptKeys[previous.index] = key;
                kinds.set(kind, { line, index: previous.index });
              }
              continue;
            }
            if (kind) kinds.set(kind, { line, index: kept.length });
            kept.push(line);
            keptKeys.push(key);
          }
          const headerPattern = /^\s*\S*获取方式\s*[：:]\s*$/;
          // 总图合并/分类去重/定序统一由 runtime 的 frameAcquisitionLines 收口（单一实现），
          // 这里不再重复实现一套，避免两份逻辑漂移。
          const orderOf = (line) => {
            const text = String(line || '');
            if (/^\s*全套\s*[：:]/.test(text) || /无尽回廊|灵化表/.test(text)) return 0;
            if (/总图/.test(text)) return 1;
            if (/^\s*部件\s*[：:]/.test(text) || /^部件/.test(text)) return 2;
            return 3;
          };
          // 顺序（用户口径）：全套 → 总图 → 部件 → 其它。
          // 「总图」的合并由模板负责（blueprints/quest.json 的 repurchaseTemplate 自带金额），
          // 这里只做通用定序与标签规范化，不写任何单帧特例。
          const bodies = kept
            .map(line => (/^\s*(?:全套|总图|部件)\s*[：:]/.test(line) || !/^完成《.+》获得总图/.test(String(line).trim()) ? line : `总图：${String(line).trim()}`))
            .filter(line => !headerPattern.test(String(line).trim()))
            .map((line, index) => ({ line, index, order: orderOf(line) }))
            .sort((a, b) => (a.order - b.order) || (a.index - b.index));
          return bodies.map(row => row.line).join('\n');
        })()
      : null;
    const preferStructuredDescription = !isFrame && (!defaultDescription || /尚未收录/.test(defaultDescription) || hasApprovedDailyTribute
      || (entry.subject?.category === 'weapon' && Boolean(structuredDescription))
      || (entry.subject?.category === 'mod' && structuredMethods.some(method => method.reviewStatus !== 'review-required' && ['mission-reward', 'circuit-reward', 'enemy-drop', 'vendor-exchange', 'vendor-or-syndicate-exchange', 'syndicate-exchange', 'legacy-nightwave-reward'].includes(method.type)) && Boolean(structuredDescription)));
    const lichPasswordUsage = getLichPasswordModUsageLines(entry);
    const acquisitionDescription = frameDescription || (preferStructuredDescription && structuredDescription ? [syndicateHeader, structuredDescription].filter(Boolean).join('\n\n') : defaultDescription);
    const description = lichPasswordUsage.length
      ? [lichPasswordUsage.join('\n'), structuredDescription || acquisitionDescription].filter(Boolean).join('\n\n')
      : acquisitionDescription;
    return {
      query: raw,
      resolution,
      entry,
      officialMod: resolvedOfficialMod,
      description,
      frameRoute,
      categories: (entry.subject.categoryRefs || []).map(getCategory).filter(Boolean),
      methods,
      sourceOptions,
      requirements,
      requirementLines,
      structuredMethods,
      wikiEvidence: entry.modAcquisition?.generated?.wiki?.evidence || [],
      mechanicsEvidence: entry.modAcquisition?.generated?.wiki?.mechanicsEvidence || null,
      alternatives: []
    };
  };
  const frameComponentMethods = (result, frameComponent) => {
    const part = frameComponent.component.part;
    const partName = framePartDisplay[part] || part;
    return (result?.structuredMethods || []).flatMap(method => {
      if (method.type === 'route' && method.scope === 'components' && method.variables?.sourceGroups?.length) {
        const sourceGroup = method.variables.sourceGroups.find(group => group.part === part);
        if (!sourceGroup) return [];
        const objective = method.variables.objective ? `\n间谍 C 轮要求：${method.variables.objective}` : '';
        return [{
          ...method,
          scope: 'component',
          variables: {
            ...method.variables,
            part,
            partName,
            presentationLabel: partName,
            sourceGroups: [sourceGroup],
            text: `${partName}：${sourceGroup.summary}${objective}`
          }
        }];
      }
      if (method.type === 'circuit-reward' && method.scope === 'all-blueprints') {
        const tier = method.variables?.rewardTiers?.[part];
        if (!tier) return [];
        return [{
          ...method,
          scope: 'component',
          variables: { ...method.variables, part, partName, presentationLabel: partName, rewardTier: tier, fullSet: false }
        }];
      }
      if (method.scope === 'component' && (method.partRefs || []).includes(frameComponent.component.officialUniqueName)) return [method];
      if (method.scope === 'components' && !method.variables?.sourceGroups?.length) return [
        { ...method, scope: 'component', variables: { ...method.variables, part, partName, presentationLabel: partName } }
      ];
      return [];
    });
  };
  // Some non-prime frames (for example Wisp) expose their official route as
  // frameRoute rather than as structured component methods.  Keep a component
  // lookup a component card in that case, and retain the route as its source
  // instead of letting the runtime fall back to a generic resource card.
  const frameComponentFallbackMethod = (result, frameComponent) => {
    const route = result?.frameRoute || {};
    const part = frameComponent?.component?.part;
    const candidates = part === 'Blueprint'
      ? [route.blueprintLine, route.componentLine, ...(route.lines || [])]
      : [route.componentLine, route.blueprintLine, ...(route.lines || [])];
    return [...new Set(candidates.map(value => String(value || '').trim()).filter(Boolean))][0] || null;
  };
  const getAcquisitionCard = query => {
    const frameComponent = frameComponents.get(normalize(query));
    const resolvedItem = resolveItem(query);
    const landingCraft = resolvedItem?.kind === 'official-item' && resolvedItem.item?.semanticKinds?.includes('landing-craft')
      ? resolvedItem.item
      : null;
    if (landingCraft) {
      return {
        query: String(query),
        kind: 'landing-craft',
        identity: {
          canonical: landingCraft.canonical,
          displayName: landingCraft.displayName || landingCraft.canonical,
          uniqueName: landingCraft.uniqueName
        },
        aliases: (landingCraft.aliases || []).filter(alias => normalize(alias) !== normalize(landingCraft.canonical) && normalize(alias) !== normalize(landingCraft.displayName)),
        abilities: (landingCraft.airSupportAbilities || []).map(ability => ({
          abilityId: ability.uniqueName,
          canonical: ability.canonical,
          displayName: ability.displayName || ability.canonical,
          description: ability.description || ''
        })),
        variants: [],
        sections: {
          exchange: [],
          enemy: [],
          acquisition: (landingCraft.drops || []).map(drop => drop.location).filter(Boolean),
          other: []
        },
        sectionNotes: {},
        materials: [],
        detailOptions: [],
        credits: null,
        wikiUrl: null
      };
    }
    // 官方道具卡面：landing-craft 之外的官方道具（聚焦晶体一类）没有知识条目，卡面必须自己造，
    // 否则 getAcquisitionCard 返回 null，运行时守门会报「暂时无法用于刷取查询」。
    if (resolvedItem?.kind === 'official-item' && resolvedItem.item && !hasReviewedResourceEntry(resolvedItem.item, query)) {
      const item = resolvedItem.item;
      const recipes = officialItemRecipes(item);
      const itemDescription = item.description?.display || item.description?.canonical || '';
      const acquisitionLines = [
        ...recipes.map(recipe => officialItemRecipeLine(recipe)).filter(Boolean),
        ...(item.drops || []).map(drop => drop.location).filter(Boolean).map(location => `掉落：${location}`)
      ];
      const materials = [];
      const seenMaterials = new Set();
      for (const recipe of recipes) {
        for (const ingredient of recipe.ingredients || []) {
          const key = String(ingredient.uniqueName || ingredient.displayName || ingredient.canonical || '');
          if (!key || seenMaterials.has(key)) continue;
          seenMaterials.add(key);
          materials.push({
            uniqueName: ingredient.uniqueName || null,
            canonical: ingredient.displayName || ingredient.canonical,
            displayName: ingredient.displayName || ingredient.canonical,
            count: ingredient.quantity ?? 1
          });
        }
      }
      if (acquisitionLines.length || materials.length) {
        return {
          query: String(query),
          kind: 'item',
          identity: {
            canonical: item.canonical,
            displayName: item.displayName || item.canonical,
            uniqueName: item.uniqueName || null
          },
          aliases: (item.aliases || []).filter(alias => normalize(alias) !== normalize(item.canonical) && normalize(alias) !== normalize(item.displayName)),
          variants: [],
          sections: { exchange: [], enemy: [], acquisition: acquisitionLines, other: [] },
          sectionNotes: {},
          materials,
          detailOptions: [],
          credits: recipes.find(recipe => Number(recipe.credits) > 0)?.credits || null,
          wikiUrl: null
        };
      }
      // 导出里既没有配方也没有掉落的官方道具（如升级用晶体）：仍然给一张只带说明的卡，
      // 否则运行时守门会直接回「“X”暂时无法用于刷取查询」，用户连说明都看不到。
      if (itemDescription) {
        return {
          query: String(query),
          kind: 'item',
          identity: {
            canonical: item.canonical,
            displayName: item.displayName || item.canonical,
            uniqueName: item.uniqueName || null
          },
          aliases: (item.aliases || []).filter(alias => normalize(alias) !== normalize(item.canonical) && normalize(alias) !== normalize(item.displayName)),
          variants: [],
          sections: { exchange: [], enemy: [], acquisition: [itemDescription], other: [] },
          sectionNotes: {},
          materials: [],
          detailOptions: [],
          credits: null,
          wikiUrl: null
        };
      }
    }
    const exaltedIntent = resolveExaltedWeaponIntent(query, { intent: 'acquisition' });
    if (exaltedIntent) {
      const member = exaltedIntent.family.members.find(item => item.uniqueName === exaltedIntent.identity.uniqueName) || exaltedIntent.family.members[0];
      const frame = frameAcquisition.resolveWarframe(exaltedIntent.frameCanonical);
      if (member && frame) {
        return {
          query: String(query),
          kind: 'weapon',
          identity: { canonical: member.canonical, displayName: member.displayName || member.canonical, uniqueName: member.uniqueName },
          assetIdentity: { kind: 'weapon', canonical: member.canonical, displayName: member.displayName || member.canonical, uniqueName: member.uniqueName, role: 'weapon-display' },
          variants: exaltedIntent.family.members.map(item => ({ canonical: item.canonical, displayName: item.displayName || item.canonical, uniqueName: item.uniqueName, current: item.uniqueName === member.uniqueName })),
          sections: { exchange: [], enemy: [], acquisition: [`制作 ${frame.displayName || exaltedIntent.frameCanonical}`], other: [] },
          sectionNotes: {}, materials: [], detailOptions: [], credits: null,
          weaponInfo: require('./weapon-wiki-attacks').buildWeaponInfo({ officialUniqueName: member.uniqueName, subject: { canonical: member.canonical, displayName: member.displayName } }),
          wikiUrl: null
        };
      }
    }
    let result = frameComponent ? null : getAcquisition(query);
    if (frameComponent) {
      result = getAcquisition(frameComponent.frame.subject.canonical);
      const methods = frameComponentMethods(result, frameComponent);
      const sections = acquisitionCardSections(methods, { registries: data, displayName: frameComponent.frame.subject.displayName });
      if (!sections.exchange.length && !sections.enemy.length && !sections.acquisition.length && !sections.other.length) {
        const fallback = frameComponentFallbackMethod(result, frameComponent);
        if (fallback) sections.acquisition.push({ text: fallback, method: null });
      }
      const recipe = frameAcquisition.getCraftingRecipes(frameComponent.frame.subject.canonical, frameRecipeCache)
        .find(item => item.part === frameComponent.component.part);
      return {
        query: String(query),
        kind: 'frame-component',
        identity: {
          canonical: frameComponent.canonical,
          displayName: frameComponent.displayName,
          uniqueName: frameComponent.component.officialUniqueName
        },
        assetIdentity: {
          kind: 'frame-component',
          canonical: frameComponent.canonical,
          displayName: frameComponent.displayName,
          uniqueName: frameComponent.component.officialUniqueName,
          role: `warframe-${String(frameComponent.component.part).toLowerCase()}-component-icon`
        },
        variants: [],
        sections: {
          exchange: sections.exchange.map(item => item.text),
          enemy: sections.enemy.map(item => item.text),
          acquisition: sections.acquisition.map(item => item.text),
          other: sections.other.map(item => item.text)
        },
        sectionNotes: sections.notes,
        materials: (recipe?.ingredients || []).map(item => ({
          uniqueName: item.uniqueName,
          canonical: item.displayName,
          displayName: item.displayName,
          count: item.count
        })),
        detailOptions: [],
        credits: recipe?.credits || null,
        wikiUrl: frameComponent.frame.sources?.find(source => /wiki\.warframe\.com\/w\//i.test(source.url || ''))?.url || null
      };
    }
    const component = weaponComponents.get(normalize(query));
    if (component) {
      result = getAcquisition(component.weapon.subject.canonical);
      const methods = (result?.structuredMethods || []).filter(method =>
        (method.partRefs || []).includes(component.ingredient.uniqueName) ||
        normalize(method.variables?.partName) === normalize(component.ingredient.displayName)
      );
      const sections = acquisitionCardSections(methods, { registries: data, displayName: component.weapon.subject.displayName });
      return {
        query: String(query),
        kind: 'weapon-component',
        identity: {
          canonical: component.ingredient.canonical,
          displayName: component.ingredient.displayName || component.ingredient.canonical,
          uniqueName: component.ingredient.uniqueName
        },
        variants: [],
        sections: {
          exchange: sections.exchange.map(item => item.text),
          enemy: sections.enemy.map(item => item.text),
          acquisition: sections.acquisition.map(item => item.text),
          other: sections.other.map(item => item.text)
        },
        sectionNotes: sections.notes,
        materials: [],
        detailOptions: [],
        credits: null,
        wikiUrl: component.weapon.sources?.find(source => /wiki\.warframe\.com\/w\//i.test(source.url || ''))?.url || null
      };
    }
    const entry = result?.entry;
    const ecologyItem = resolvedItem?.kind === 'official-item' ? resolvedItem.item : null;
    const fishItem = ecologyItem?.semanticKinds?.includes('fish') ? ecologyItem : null;
    const kind = entry?.subject?.category;
    if (kind === 'companion' && entry.subject?.categoryRefs?.includes('companion.sentinel')) {
      return require('./sentinel-card').buildSentinelCard(result);
    }
    if (!result || !['mod', 'arcane', 'weapon', 'resource', 'material', 'currency', 'item'].includes(kind)) return null;
    const uniqueName = entry.officialUniqueName || entry.subject?.officialUniqueName;
    const family = acquisitionVariantFamilyByMember.get(uniqueName);
    const acquisitionVariants = (family?.members || []).map(member => acquisitionIdentityByUniqueName.get(member)).filter(Boolean).map(variant => ({
      canonical: variant.subject?.canonical,
      displayName: variant.subject?.displayName || variant.title,
      uniqueName: variant.officialUniqueName || variant.subject?.officialUniqueName,
      current: (variant.officialUniqueName || variant.subject?.officialUniqueName) === uniqueName
    }));
    const weaponFamily = kind === 'weapon' ? getWeaponVariantFamily(uniqueName) : null;
    const weaponVariants = (weaponFamily?.members || []).map(variant => ({
      canonical: variant.canonical,
      displayName: variant.displayName || variant.canonical,
      uniqueName: variant.uniqueName,
      variantKind: variant.variantKind,
      current: variant.uniqueName === uniqueName
    }));
    const variants = [...new Map([...acquisitionVariants, ...weaponVariants].map(variant => [variant.uniqueName || variant.canonical, variant])).values()]
      .sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current))
        || Number(weaponVariantKind(a.canonical) !== 'base') - Number(weaponVariantKind(b.canonical) !== 'base')
        || String(a.canonical || '').localeCompare(String(b.canonical || ''), 'en'));
    const sections = acquisitionCardSections(result.structuredMethods || [], {
      registries: data,
      canonical: kind === 'weapon' ? entry?.subject?.canonical : null,
      recipes: kind === 'weapon' ? (result.recipes || entry.recipes || []) : [],
      displayName: entry?.subject?.displayName || entry?.title || null,
      presentation: entry?.arcaneAcquisition?.manual?.overrides?.presentation || null
    });
    if (kind === 'weapon') {
      const { buildPrimeWeaponCardAcquisitionLines } = require('./prime-acquisition');
      const primeLines = buildPrimeWeaponCardAcquisitionLines(entry, result.structuredMethods || []);
      if (primeLines) sections.acquisition = primeLines.map(text => ({ text, method: null }));
    }
    const recipes = kind === 'weapon' ? (result.recipes || entry.recipes || []) : [];
    const recipe = recipes[0] || null;
    const sectionItems = Object.fromEntries(Object.entries(sections).filter(([, items]) => Array.isArray(items)).map(([group, items]) => [group, items.map(item => {
      const methods = item.methods || [item.method].filter(Boolean);
      return {
      text: item.text,
      methodType: methods.length === 1 ? methods[0].type || null : 'multiple',
      currencies: methods.flatMap(method => [...(method.currency || []), ...(method.requirements?.currency || [])])
        .filter((currency, index, list) => list.findIndex(candidate => candidate.currencyId === currency.currencyId && candidate.amount === currency.amount) === index)
        .map(currency => {
          const entity = currency.currencyId ? data.currencies.get(currency.currencyId) : null;
          return {
            id: currency.currencyId || null,
            canonical: entity?.canonical || currency.currencyCanonical || null,
            displayName: displayEntityName(entity) || currency.currencyCanonical || currency.currencyId || '未知货币',
            officialUniqueName: entity?.officialUniqueName || null,
            amount: Number.isFinite(Number(currency.amount)) ? Number(currency.amount) : null
          };
        })
    }})]));
    const rarity = entry.rarity || result.officialMod?.rarity || null;
    const maxRank = Number.isInteger(entry.maxRank) ? entry.maxRank : result.officialMod?.maxRank;
    const detailOptions = (result.sourceOptions || []).map(source => ({ id: source.id, title: source.title, query: source.query })).filter(source => source.query);
    const relatedItems = expandKnowledgeReferences(detailOptions, {
      resolve: reference => getGameplay(reference),
      maxDepth: 4
    });
    return {
      query: String(query), kind,
      renderVersion: kind === 'weapon' ? JSON.stringify(recipes) : null,
      identity: { canonical: entry.subject?.canonical, displayName: entry.subject?.displayName || entry.title, uniqueName },
      assetIdentity: entry.subject?.assetIdentity || null,
      variants: variants.length > 1 ? variants : [],
      sections: {
        exchange: sections.exchange.map(item => item.text),
        enemy: sections.enemy.map(item => item.text),
        acquisition: sections.acquisition.map(item => item.text),
        other: sections.other.map(item => item.text)
      },
      sectionNotes: sections.notes,
      sectionItems,
      modInfo: kind === 'mod' ? {
        maxRank: Number.isInteger(maxRank) ? maxRank : null,
        rarity,
        polarity: entry.polarity || result.officialMod?.polarity || null,
        type: resolveEffectiveModType(result.officialMod || {}) || result.officialMod?.type || null,
        typeDisplayName: getTypeDisplayName(resolveEffectiveModType(result.officialMod || {}) || result.officialMod?.type) || result.officialMod?.typeDisplayName || null,
        faceLabel: resolveModCardFaceLabel(result.officialMod || {}, {
          frameDisplayName: result.officialMod?.compatName && data.frames?.get?.(result.officialMod.compatName)?.displayName
        }),
        compatName: result.officialMod?.compatName || null,
        descriptionLines: modDescriptionLines(entry, result.officialMod),
        fusionCost: modFusionCost(maxRank, rarity),
        transmutable: modTransmutable(entry, result.officialMod)
      } : null,
      arcaneInfo: kind === 'arcane' ? getArcaneMetadata(entry.subject?.canonical) : null,
      weaponInfo: kind === 'weapon' ? require('./weapon-wiki-attacks').buildWeaponInfo(entry) : null,
      ecologyInfo: kind === 'resource' && ecologyItem?.ecologyInfo ? ecologyItem.ecologyInfo : null,
      fishInfo: kind === 'resource' && fishItem?.fishInfo ? fishItem.fishInfo : null,
      materials: (recipe?.ingredients || []).map(item => ({ uniqueName: item.uniqueName, canonical: item.canonical, displayName: officialItemZhName(item.uniqueName) || officialItemZhName(item.canonical) || item.displayName || item.canonical, count: item.quantity })),
      craftingRecipes: recipes.map(item => ({ part: item.part || null, displayName: item.displayName || (item.part === 'Blueprint' ? entry.subject?.displayName || entry.title : item.part), credits: item.credits || null, buildTimeSeconds: item.buildTimeSeconds || null, ingredients: (item.ingredients || []).map(ingredient => ({ uniqueName: ingredient.uniqueName, canonical: ingredient.canonical, displayName: officialItemZhName(ingredient.uniqueName) || officialItemZhName(ingredient.canonical) || ingredient.displayName || ingredient.canonical, count: ingredient.quantity })) })),
      detailOptions,
      relatedItems,
      credits: recipe?.credits || null,
      wikiUrl: entry.sources?.find(source => /wiki\.warframe\.com\/w\//i.test(source.url || ''))?.url || result.officialMod?.wiki?.url || null
    };
  };
  const resolveEntityVariables = query => {
    const sources = [
      ['npc', data.npcs], ['location', data.locations], ['faction', data.factions],
      ['quest', data.quests], ['currency', data.currencies], ['enemy', data.enemies], ['mission-type', data.missionTypes], ['arcane-source', data.arcaneSources]
    ];
    const seen = new Set();
    return sources.flatMap(([type, registry]) => registry.search(query).slice(0, 8).map(entry => ({
      type, id: entry.id, canonical: entry.canonical, displayName: displayEntityName(entry),
      localized: Boolean(entry.displayName && entry.displayName.trim()), locationId: entry.locationId || null,
      factionId: entry.factionId || null
    }))).filter(variable => !seen.has(variable.id) && seen.add(variable.id));
  };
  const syndicateProcCatalog = data.modRelations?.syndicateProcEffects || { sharedMechanics: null, effects: [] };
  const syndicateProcById = new Map((syndicateProcCatalog.effects || []).map(effect => [effect.id, effect]));
  const syndicateModByCanonical = new Map((data.modRelations?.syndicateWeaponAugments || []).map(mod => [normalize(mod.canonical), mod]));
  const syndicateProcForEntry = entry => {
    if (entry.subject?.category !== 'mod') return null;
    const relation = syndicateModByCanonical.get(normalize(entry.subject?.canonical))?.relationRefs?.find(ref => ref.type === 'triggers-syndicate-proc');
    return relation ? syndicateProcById.get(relation.targetId) || null : null;
  };
  const renderSyndicateProcEvidence = effect => {
    if (!effect) return null;
    const shared = syndicateProcCatalog.sharedMechanics || {};
    return [
      `关联机制实体：${effect.id}（${effect.displayName} / ${effect.canonical}）`,
      `触发：${shared.trigger}`,
      `触发效果：造成 ${shared.radialDamage} 点${effect.damageType}伤害（${shared.radiusMeters} 米范围）；${effect.statusEffect}；${effect.restore}；${effect.buff}，持续 ${shared.durationSeconds} 秒；冷却 ${shared.cooldownSeconds} 秒。`,
      `证据：DE 官方简体中文 ${effect.officialLocalizationKey}；Warframe Wiki Syndicate Radial Effects（revision ${shared.wikiEvidence?.revisionId}，${shared.wikiEvidence?.url}）`
    ].join('\n');
  };
  const wikiKnowledgeBody = entry => {
    const direct = [entry.content, entry.summary].find(value => typeof value === 'string' && value.trim());
    if (direct) return direct.trim();
    if (entry.module !== 'acquisition') return null;
    const effectLines = (entry.effectDetails || []).filter(value => typeof value === 'string' && value.trim());
    const acquisition = getAcquisition(entry.subject?.canonical || entry.title);
    const parts = [
      effectLines.length ? `效果：${effectLines.join('；')}` : null,
      renderSyndicateProcEvidence(syndicateProcForEntry(entry)),
      acquisition?.description ? `获取方式：${acquisition.description}` : null,
      ...(entry.tips || []).filter(value => typeof value === 'string' && value.trim())
    ].filter(Boolean);
    return parts.length ? parts.join('\n') : null;
  };
  const modRelationQueries = createModRelationQueries({
    root,
    resolveWeapon,
    resolveName,
    getWeapon,
    getFrame: frameAcquisition.resolveWarframe
  });
  const elementModSlangResolver = createElementModSlangResolver(data.elementModSlang);
  const factionDamageModSlangResolver = createFactionDamageModSlangResolver(officialMods);
  const buildWikiContext = query => {
    const resolution = resolveName(query);
    const facts = searchFacts(query);
    const knowledge = searchKnowledge(query).map(item => ({ ...item, contextBody: wikiKnowledgeBody(item) })).filter(item => item.contextBody);
    const entityVariables = resolveEntityVariables(query);
    if (!facts.length && !knowledge.length && !resolution && !entityVariables.length) return null;
    const sections = [];
    if (resolution && !resolution.ambiguous) sections.push(`名称解析：${query} → ${resolution.canonical}`);
    if (entityVariables.length) sections.push(`实体变量（NPC/地点/阵营/任务/货币/敌人/任务类型）：\n${entityVariables.map(item => `${item.id} = ${item.displayName} [canonical: ${item.canonical}]`).join('\n')}\n输出规则：需要提及这些实体时必须使用变量的 displayName；localized=false 表示没有已审核官方中文，只能保留 canonical 英文，禁止自行翻译、音译或补中文。不要输出未被当前问题需要的变量。`);
    if (facts.length) sections.push(`基础事实：\n${facts.map(item => `【${item.title}】\n${item.content}\n来源：${item.sources.map(source => `${source.label} ${source.url}`).join('、')}`).join('\n\n')}`);
    if (knowledge.length) sections.push(`加工知识：\n${knowledge.map(item => `【${item.title}】\n${item.contextBody}`).join('\n\n')}`);
    return { query, resolution, facts, knowledge, entityVariables, text: sections.join('\n\n') };
  };
  return {
    ...data,
    resolveName,
    findOfficialTermsInText: text => findOfficialTermsInText(text, officialTermIndex),
    normalizeTerms,
    parseAcquisitionCommand,
    resolveAcquisitionCommand,
    parseGameplayCommand,
    parseCategoryCommand,
    resolveSlang,
    getSlangDomain,
    parseWeaponCraftingCommand: text => parseWeaponCraftingCommand(text, data.weapons || []),
    renderWeaponCraftingCommand: text => {
      const parsed = parseWeaponCraftingCommand(text, data.weapons || []);
      if (!parsed) return null;
      const lines = parsed.items.map(({ entry }) => renderCraftingUses(entry, weaponCraftingGraph)).filter(Boolean);
      return lines.length ? lines.join('\n') : '这些武器不能用于合成其他武器';
    },
    renderWeaponCraftingUses: queries => {
      const unique = new Map();
      for (const query of queries || []) {
        const resolution = resolveWeapon(query, { minScore: 70, minLead: 8 });
        if (!resolution || resolution.ambiguous || !resolution.canonical) continue;
        const entry = getWeapon(resolution.canonical);
        if (entry) unique.set(entry.subject.officialUniqueName, entry);
      }
      return [...unique.values()].map(entry => renderCraftingUses(entry, weaponCraftingGraph)).join('\n');
    },
    searchFacts,
    searchKnowledge,
    searchAcquisition,
    searchGameplay,
    searchCategories,
    getCategory,
    getCategoryDetail,
    getGameplay,
    getAcquisition,
    getAcquisitionCard,
    getSetModFamily,
    getAcquisitionCollection,
    getResourceAcquisition: resourceAcquisition.getResourceAcquisition,
    getResourceCollection: resourceAcquisition.getResourceCollection,
    listResources: resourceAcquisition.listResources,
    listOfficialItems: () => officialItems,
    resolveItem,
    resolveSyndicateGroupMod,
    inspectSyndicateGroupMod,
    isSyndicateGroupModQuery,
    querySyndicateExchange: syndicateExchangeQuery.query,
    syndicateExchangeOffers: syndicateExchangeQuery.offers,
    resolveAccessory: query => resolveAccessory(query, {
      frameComponents,
      weaponComponents,
      excludedOfficialWeapons,
      weapons: data.weapons,
      knowledge: allKnowledge,
      accessoryAliases: { 天机伞: '晴日伞' }
    }),
    getWeapon,
    getWeaponGap,
    listOfficialIconOnlyWeapons,
    getOfficialIconOnlyWeapon,
    listExaltedWeaponIntentFamilies,
    resolveExaltedWeaponIntent,
    resolveWeapon,
    resolveReviewedWeaponAlias,
    resolveOfficialWeaponIdentity,
    getWeaponVariantFamily,
    resolveStablePrimeVariant,
    resolvePrimeVariantIntent,
    resolveCompanionVariantIntent,
    resolveCompanionPrimeVariantIntent,
    getCompanionVariantFamily,
    resolveWeaponVariantIntent,
    weaponVariantIntentAliases,
    parseModRelationCommand: modRelationQueries.parseRelationCommand,
    queryModRelations: modRelationQueries.query,
    modRelations: data.modRelations,
    normalizeAliasFacts,
    aliasPreferences: data.aliases?.aliasPreferences || {},
    acquisitionVariantFamilies: data.acquisitionVariantFamilies,
    ecologyRelations,
    queryEcologyRelations: (stableIdentity, type = null) => ecologyRelations.related(stableIdentity, type),
    elementModSlang: data.elementModSlang,
    resolveElementModSlang: elementModSlangResolver.resolve,
    renderElementModSlang: elementModSlangResolver.render,
    factionDamageModSlang: factionDamageModSlangResolver.index,
    resolveFactionDamageModSlang: factionDamageModSlangResolver.resolve,
    getRivenWeapon: rivenWeaponResolver.get,
    resolveRivenWeapon: rivenWeaponResolver.resolve,
    resolveRivenWeaponFamilyIntent,
    resolveRivenWeaponPrefix: rivenWeaponResolver.resolvePrefix,
    rivenWeapons: rivenWeaponResolver.identities,
    getConsumable,
    resolveConsumable,
    consumables: data.consumables || [],
    getWeaponCrafting: query => { const entry = getWeapon(query); return entry ? { entry, text: renderCrafting(entry, weaponCraftingGraph), recipes: weaponCraftingGraph.recipesFor(entry.subject.officialUniqueName), craftTo: weaponCraftingGraph.craftTo(entry.subject.officialUniqueName) } : null; },
    weaponCraftingGraph,
    searchOfficialItems,
    getOfficialItem,
    getArcane,
    getArcaneMetadata,
    resolveArcane,
    getItemAcquisition,
    getOfficialMod,
    officialMods,
    getExcludedOfficialMod,
    getOfficialModAvailability,
    getModTips,
    getModTipKeywords,
    searchOfficialMods,
    searchOfficialModNameFragments,
    searchOfficialTermNameFragments,
    listOfficialCategories,
    listReviewRequiredOfficialMods,
    listMissingOfficialMods,
    listStubOfficialMods,
    listMissingOfficialCategories,
    buildWikiContext,
    getLocation: data.locations.get,
    listLocations: () => data.locations.values,
    searchLocations: data.locations.search,
    getCurrency: data.currencies.get,
    searchCurrencies: data.currencies.search,
    getFaction: data.factions.get,
    searchFactions: data.factions.search,
    getNpc: data.npcs.get,
    searchNpcs: data.npcs.search,
    resolveEntityVariables,
    getQuest: data.quests.get,
    searchQuests: data.quests.search,
    getEnemy: data.enemies.get,
    searchEnemies: data.enemies.search,
    getMissionType: data.missionTypes.get,
    searchMissionTypes: data.missionTypes.search,
    renderGameText,
    renderStructuredMethod: require('./acquisition-protocol').renderStructuredMethod,
    renderAcquisition: (methods, options = {}) => renderAcquisition(methods, { ...options, registries: data }),
    createAcquisitionEvidence,
    createAcquisitionResult,
    createRenderResult,
    listWarframes: frameAcquisition.listWarframes,
    listEquipmentIdentities: () => equipmentIdentities,
    knowledgeLoaderEquipmentRows: () => [
      ...knowledgeLoaderRowsFromIdentities(equipmentIdentities),
      // Identity lookup must cover official weapons even without an acquisition
      // document. Otherwise a full weapon name can fall through to frame slang.
      ...officialWeapons.map(weapon => ({
        title: weapon.displayName || weapon.canonical,
        displayName: weapon.displayName || weapon.canonical,
        canonical: weapon.canonical,
        stableId: weapon.uniqueName || weapon.officialUniqueName || null,
        aliases: [...new Set([
          weapon.canonical,
          weapon.displayName,
          ...weaponAliasForms(weapon.canonical, data.aliases?.weapons?.[weapon.canonical] || [])
        ].filter(Boolean))],
        type: 'weapon',
        domain: 'acquisition'
      })),
      ...reviewedWeaponLoaderRows
    ],
    resolveEquipmentIdentity: query => resolveEquipmentIdentity(query, {
      identities: equipmentIdentities,
      companionAliases: data.aliases?.companions || {},
      companionMainlandNames: data.aliases?.companionMainlandNames || {},
      officialItems
    }),
    listAbilities,
    resolveAbility,
    getWarframeKnowledge: frameAcquisition.getWarframeKnowledge,
    getWarframeMaintenanceReport: frameAcquisition.getWarframeMaintenanceReport,
    getFrameCardMetadata: frameCard.getFrameCardMetadata,
    buildFrameCardDTO: frameCard.buildFrameCardDTO,
    auditFrameCardMetadata: frameCard.auditFrameCardMetadata,
    frameAcquisition,
    frameCard,
    resourceAcquisition,
    equipmentAcquisition,
    ampComponents: ampComponentQueries,
    parseAmpCommand: ampComponentQueries.parseCommand,
    getAmpCard: ampComponentQueries.query,
    getFishingCard: fishingQueries.query,
    resolveFishing: fishingQueries.resolve,
    listFishing: () => fishingQueries.fish,
    getMiningCard: miningQueries.query,
    resolveMining: miningQueries.resolve,
    listMining: () => miningQueries.items,
    getEquipmentAcquisition: equipmentAcquisition.getEquipmentAcquisition,
    resolveEquipment: equipmentAcquisition.resolveEquipment,
    auditEquipmentAcquisition: equipmentAcquisition.auditEquipmentAcquisition
  };
}

module.exports = { createKnowledgeCore, officialItemZhName, searchEntries, frameAcquisition, frameCard, resourceAcquisition, arcaneFusionMetadata, resolveModCardFaceLabel, createFishingQueries: require('./fishing').createFishingQueries, parseFishingCommand: require('./fishing').parseFishingCommand, createMiningQueries: require('./mining').createMiningQueries, parseMiningCommand: require('./mining').parseMiningCommand, createCompatLocalizer: require('./mod-card-face-label').createCompatLocalizer };
