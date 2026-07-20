'use strict';

const path = require('path');
const { loadData } = require('./loader');
const { createResolver, resolveDomainAlias, normalize } = require('./resolver');
const frameAcquisition = require('./frame-acquisition');
const resourceAcquisition = require('./resource-acquisition');
const { createAcquisitionEvidence, createAcquisitionResult, createRenderResult } = require('./acquisition-dto');
const { displayEntityName } = require('./entities');
const { renderGameText } = require('./game-text');
const { normalizeRequirements, renderRequirements, renderAcquisition, acquisitionCardSections } = require('./acquisition-protocol');
const { structuredMethods: compileStructuredMethods, routesToMethods } = require('./acquisition-core');
const { createCraftingGraph, renderCraftingUses, renderCrafting } = require('./weapon-crafting');
const { parseWeaponCraftingCommand } = require('./weapon-command');

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

function createKnowledgeCore(options = {}) {
  const root = options.root || path.join(__dirname, '..');
  const data = loadData(root, { approvedOnly: options.approvedOnly !== false });
  const allKnowledge = options.approvedOnly === false ? data.knowledge : loadData(root, { approvedOnly: false }).knowledge;
  const officialMods = data.officialCatalog?.mods || [];
  const officialItems = data.officialItems?.items || [];
  const officialCategories = data.officialCatalog?.officialCategories || [];
  const localModEntries = allKnowledge.filter(entry => entry.module === 'acquisition' && entry.subject?.category === 'mod');
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
  const weaponNameCandidates = (data.weapons || []).flatMap(weapon => [weapon.subject?.canonical, weapon.subject?.displayName, ...(data.aliases?.weapons?.[weapon.subject?.canonical] || [])]
    .filter(Boolean).map(alias => ({ alias, canonical: weapon.subject.canonical, category: 'weapon', priority: 35 })));
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
  const framePartDisplay = { Blueprint: '蓝图', Neuroptics: '头部神经光元', Chassis: '机体', Systems: '系统' };
  for (const frame of allKnowledge.filter(entry => entry.subject?.category === 'frame')) {
    const bases = [frame.subject.canonical, frame.subject.displayName, ...(data.aliases?.frames?.[frame.subject.canonical] || [])].filter(Boolean);
    for (const component of frame.frameAcquisition?.generated?.components || []) {
      const suffixes = [component.part, framePartDisplay[component.part], component.part === 'Neuroptics' ? '头' : null].filter(Boolean);
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
  const officialNameCandidates = [
    ...fishNameCandidates,
    ...officialMods.flatMap(mod => [mod.canonical, mod.displayName].filter(Boolean).map(alias => ({ alias, canonical: mod.canonical, category: 'official' }))),
    ...arcaneNameCandidates,
    ...weaponNameCandidates,
    ...consumableNameCandidates
  ];
  const baseResolveName = createResolver(data.aliases);
  const resolveName = (query, resolveOptions = {}) => {
    const suppliedCandidates = resolveOptions.candidates || [];
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
  const parseAcquisitionCommand = text => {
    const raw = String(text || '').trim();
    let match = raw.match(/^\/刷(?:\s+(.+))?$/i);
    if (match) return { intent: 'acquisition', query: String(match[1] || '').trim() };
    match = raw.match(/^刷\s+(.+)$/i) || raw.match(/^怎么刷\s*(.+)$/i);
    if (!match) return null;
    return { intent: 'acquisition', query: match[1].trim() };
  };
  const resolveAcquisitionCommand = text => {
    const parsed = parseAcquisitionCommand(text);
    if (!parsed) return null;
    const arcaneIntent = /^赋能(?:[\s·・‧•:：_\-/]*)(.*)$/i.exec(parsed.query);
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
  const gameplayCandidates = gameplayEntries.flatMap(entry => [entry.title, entry.acquisitionQuery, ...(entry.aliases || [])].filter(Boolean).map(alias => ({ alias, canonical: entry.id, category: 'gameplay', priority: 20 })));
  const searchGameplay = (query, searchOptions = {}) => searchEntries(query, gameplayEntries, searchOptions);
  const resolveGameplayEntry = query => {
    const resolution = gameplayResolver(query, { candidates: gameplayCandidates, categories: ['gameplay'], minScore: 70, minLead: 8 });
    if (!resolution || resolution.ambiguous) return { resolution, entry: null };
    return { resolution, entry: gameplayEntries.find(item => item.id === resolution.canonical) || null };
  };
  const getGameplay = query => {
    const raw = String(query || '').trim();
    if (!raw) return null;
    let rewardTier = null;
    let baseQuery = raw;
    const optionMatch = raw.match(/^(.+?)\s+(\S+)$/i);
    if (optionMatch) {
      const resolvedBase = resolveGameplayEntry(optionMatch[1].trim());
      if (resolvedBase.entry?.rewardGroups) {
        const requestedOption = optionMatch[2].toUpperCase();
        const option = Object.keys(resolvedBase.entry.rewardGroups).find(key => key.toUpperCase() === requestedOption);
        if (!option) return null;
        baseQuery = optionMatch[1].trim(); rewardTier = option;
      }
    }
    let { resolution, entry } = resolveGameplayEntry(baseQuery);
    if (!entry && !rewardTier) ({ resolution, entry } = resolveGameplayEntry(raw));
    if (!entry) return null;
    if (rewardTier && !entry.rewardGroups?.[rewardTier]) return null;
    const rewardGroup = rewardTier ? entry.rewardGroups[rewardTier] : null;
    return { query: raw, entry, rewardTier, rewardGroup, resolution, alternatives: [] };
  };
  const searchCategories = query => {
    const q = normalize(query);
    if (!q) return [];
    return data.categories.filter(category => [category.id, category.canonical, category.displayName, ...(category.aliases || [])].some(name => normalize(name) === q));
  };
  const itemAliases = item => [item.uniqueName, item.canonical, item.displayName, ...(item.aliases || []), ...(item.recipeVariants || []).flatMap(variant => variant.aliases || [])];
  const getOfficialItem = query => {
    const q = normalize(query);
    if (!q) return null;
    return officialItems.find(item => itemAliases(item).some(value => normalize(value) === q)) || null;
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
  const getOfficialMod = query => {
    const q = normalize(query);
    if (!q) return null;
    const direct = officialMods.find(mod => [mod.uniqueName, mod.canonical, mod.displayName].some(value => normalize(value) === q));
    if (direct) return direct;
    const targets = [...(modLookupAliases.get(q) || [])];
    return targets.length === 1 ? officialMods.find(mod => normalize(mod.canonical) === normalize(targets[0])) || null : null;
  };
  const normalizeArcaneName = value => normalize(value).replace(/^霰弹枪(?=仇杀)/, '霰弹');
  const getArcane = query => {
    const q = normalizeArcaneName(query);
    if (!q) return null;
    const matches = (data.arcanes || []).filter(entry => [entry.officialUniqueName, entry.subject?.canonical, entry.subject?.displayName, ...(entry.arcaneAcquisition?.manual?.aliases || [])].some(value => normalizeArcaneName(value) === q));
    return matches.sort((a, b) => Number(Boolean(a.arcaneAcquisition?.generated?.identity?.excludedFromCodex)) - Number(Boolean(b.arcaneAcquisition?.generated?.identity?.excludedFromCodex)) || String(a.officialUniqueName).localeCompare(String(b.officialUniqueName)))[0] || null;
  };
  const resolveArcane = (query, resolveOptions = {}) => {
    const raw = String(query || '').trim();
    const name = raw.replace(/^赋能(?:[\s·・‧•:：_\-/]*)/i, '').trim();
    if (!name) return null;
    const exact = getArcane(raw) || getArcane(name);
    if (exact) return { alias: exact.subject.displayName, canonical: exact.subject.canonical, category: 'arcane', match: 'exact', score: 300 };
    return resolveName(name, {
      minScore: 70,
      minLead: 8,
      ...resolveOptions,
      categories: ['arcane'],
      candidates: arcaneNameCandidates
    });
  };
  const getWeapon = query => {
    const q = normalize(query);
    if (!q) return null;
    return (data.weapons || []).find(entry => [entry.subject?.officialUniqueName, entry.subject?.canonical, entry.subject?.displayName].some(value => normalize(value) === q)) || null;
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
    const exact = getWeapon(query);
    if (exact) return { alias: exact.subject.displayName, canonical: exact.subject.canonical, category: 'weapon', match: 'exact', score: 300 };
    return resolveName(query, { minScore: 50, minLead: 5, ...resolveOptions, categories: ['weapon'], candidates: weaponNameCandidates });
  };
  const resolveItem = query => {
    const weapon = getWeapon(query);
    if (weapon) return { kind: 'weapon', item: weapon, recipeVariant: null };
    const consumable = getConsumable(query);
    if (consumable) return { kind: 'consumable', item: consumable, recipeVariant: null };
    const weaponGap = getWeaponGap(query);
    if (weaponGap) return { kind: 'weapon-gap', item: weaponGap, recipeVariant: null };
    const arcane = getArcane(query);
    if (arcane) return { kind: 'arcane', item: arcane, recipeVariant: null };
    const fish = getOfficialItem(query);
    if (fish?.semanticKinds?.includes('fish')) return { kind: 'official-item', item: fish, recipeVariant: null };
    const officialItem = getOfficialItem(query);
    if (officialItem) {
      const q = normalize(query);
      const recipeVariant = officialItem.recipeVariants?.find(variant => (variant.aliases || []).some(alias => normalize(alias) === q)) || null;
      return { kind: 'official-item', item: officialItem, recipeVariant };
    }
    const mod = getOfficialMod(query);
    if (mod) return { kind: 'mod', item: mod, recipeVariant: null };
    const frame = frameAcquisition.resolveWarframe(query);
    if (frame) return { kind: 'warframe', item: frame, recipeVariant: null };
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
  const arcaneRequiredCopies = maxRank => ((Number(maxRank) + 1) * (Number(maxRank) + 2)) / 2;
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
    return methods;
  };
  const enrichArcaneMethod = method => {
    const arcaneSource = method.sourceEntityId ? data.arcaneSources.get(method.sourceEntityId) : null;
    if (arcaneSource) method = { ...method, sourceDisplayName: displayEntityName(arcaneSource), sourceKind: arcaneSource.kind };
    if (method.type === 'vendor-or-syndicate-exchange' || method.type === 'vendor-exchange') {
      const npc = method.sourceEntityId ? data.npcs.get(method.sourceEntityId) : null;
      const location = data.locations.get(method.locationId || npc?.locationId);
      const requirements = normalizeRequirements(method.requirements);
      return { ...method, requirements, requirementLines: renderRequirements(requirements, data), ...(npc ? { sourceDisplayName: displayEntityName(npc) } : {}), ...(location ? { locationId: location.id, locationDisplayName: displayEntityName(location) } : {}) };
    }
    return method;
  };
  const renderArcaneAcquisition = entry => {
    const generated = entry.arcaneAcquisition?.generated || {};
    const category = generated.classification?.category || 'legacy';
    const maxRank = Number(entry.maxRank ?? generated.stats?.maxRank ?? 0);
    const label = arcaneMethodDefinition?.categoryLabels?.[category] || category;
    const header = renderTemplate(arcaneMethodDefinition?.headerTemplate || '【{displayName}】\n类型：{categoryLabel}\n最高等级：{maxRank}（满级共需 {requiredCopies} 个）', {
      displayName: entry.subject?.displayName || entry.title,
      categoryLabel: label,
      maxRank,
      requiredCopies: arcaneRequiredCopies(maxRank)
    });
    const topStats = generated.stats?.levelStats?.[maxRank]?.stats || entry.levelStats?.[maxRank]?.stats || [];
    const effectLines = [...new Set(topStats.flatMap(stat => renderGameText(stat).split(/\n/)).map(line => line.trim()).filter(Boolean))];
    const statsLocalized = generated.stats?.localizationStatus === 'official-zh';
    const effect = statsLocalized && effectLines.length ? `满级效果：\n${effectLines.map(line => `- ${line}`).join('\n')}` : effectLines.length ? `满级效果：官方简中数据暂缺（英文证据已保存，禁止猜译）` : '满级效果：官方中文数据暂缺，等待审核';
    if (category === 'legacy' || generated.acquisition?.status === 'review-required') return `${header}\n\n${effect}\n\n${arcaneMethodDefinition?.legacyDescription || '当前不可获取，等待人工审核。'}`;
    return `${header}\n\n${effect}`;
  };
  const generatedAcquisitionMethods = entry => {
    const rawWikiMethods = entry?.modAcquisition?.generated?.wiki?.methods || [];
    const individualFactions = new Set(rawWikiMethods.filter(method => method.type === 'syndicate-exchange').map(method => method.factionId));
    const rawOfficialDrops = entry?.modAcquisition?.generated?.officialDrops || [];
    const hasOfficialChance = method => ['mission-reward', 'circuit-reward'].includes(method.type) && Number.isFinite(method.chance) && rawOfficialDrops.some(drop => Number.isFinite(drop.chance) && Math.abs(drop.chance - method.chance) < 1e-8 && /\//.test(drop.sourceCanonical || ''));
    const wikiMethods = rawWikiMethods.filter(method => (method.type !== 'syndicate-exchange-group' || !(method.factionIds || []).every(id => individualFactions.has(id))) && !hasOfficialChance(method));
    const hasSyndicateRoute = wikiMethods.some(method => method.type === 'syndicate-exchange' || method.type === 'syndicate-exchange-group');
    const sourceKey = value => normalize(value).replace(/archwing/g, '').replace(/[^a-z0-9\u3400-\u9fff]/g, '');
    const wikiSourceKeys = new Set(wikiMethods.filter(method => method.sourceCanonical).map(method => `${method.type}:${sourceKey(method.sourceCanonical)}`));
    const officialDrops = rawOfficialDrops.filter(method => {
      if (hasSyndicateRoute && /^(?:Arbiters of Hexis|Red Veil|Steel Meridian|Cephalon Suda|New Loka|The Perrin Sequence),/i.test(method.sourceCanonical || '')) return false;
      const source = sourceKey(method.sourceCanonical);
      if (!source) return true;
      return !wikiSourceKeys.has(`${method.type}:${source}`) && !wikiSourceKeys.has(`official-drop:${source}`) && !wikiSourceKeys.has(`enemy-drop:${source}`);
    });
    return [...wikiMethods, ...officialDrops];
  };
  const manualAcquisitionMethods = entry => entry?.modAcquisition?.manual?.methods || [];
  const mergeStructuredMethods = entry => {
    const methods = [...manualAcquisitionMethods(entry)];
    const identities = new Set(methods.map(method => JSON.stringify({ type: method.type, sourceEntityId: method.sourceEntityId, sourceCanonical: method.sourceCanonical, factionId: method.factionId, rotation: method.rotation, chance: method.chance })));
    for (const method of generatedAcquisitionMethods(entry)) {
      const key = JSON.stringify({ type: method.type, sourceEntityId: method.sourceEntityId, sourceCanonical: method.sourceCanonical, factionId: method.factionId, rotation: method.rotation, chance: method.chance });
      if (!identities.has(key)) { methods.push(method); identities.add(key); }
    }
    return methods;
  };
  const enrichOfficialDrop = method => {
    if (method.type !== 'official-drop') return method;
    const raw = String(method.sourceCanonical || '');
    const requiemRelic = raw.match(/^Requiem\s+([IVX]+)\s+Relic(?:\s+\([^)]+\))?$/i);
    if (requiemRelic) return { ...method, type: 'reward-or-drop', sourceDisplayName: `安魂遗物 ${requiemRelic[1].toUpperCase()}`, sourceKind: 'relic-reward' };
    const source = data.arcaneSources.get(raw);
    if (source && source.localization?.status !== 'canonical-fallback') return { ...method, type: source.kind === 'enemy-drop' ? 'enemy-drop' : 'reward-or-drop', sourceEntityId: source.id, sourceDisplayName: displayEntityName(source), sourceKind: source.kind };
    const mission = raw.match(/^([^/]+)\/([^,(]+?)(?:\s*\(([^)]+)\))?(?:,\s*Rotation\s*([A-Z]))?$/i);
    if (mission) {
      const location = data.locations.get(mission[1]);
      const missionType = data.missionTypes.get(mission[3]);
      return { ...method, type: missionType ? 'mission-reward' : 'reward-or-drop', locationId: location?.id || null, locationDisplayName: location ? displayEntityName(location) : null, nodeCanonical: mission[2], missionTypeId: missionType?.id || null, missionTypeDisplayName: missionType ? displayEntityName(missionType) : null, rotation: mission[4] || method.rotation || null };
    }
    const enemy = data.enemies.get(raw.replace(/\s*\(Level\s*\d+\s*-\s*\d+\)\s*$/i, ''));
    return enemy ? enrichModMethod({ ...method, type: 'enemy-drop', sourceEntityId: enemy.id }) : { ...method, type: 'unresolved-source', sourceDisplayName: null };
  };
  const enrichModMethod = method => {
    if (method.type === 'mission-reward' && method.missionTypeCanonical) {
      const missionType = data.missionTypes.get(method.missionTypeCanonical);
      return { ...method, missionTypeId: missionType?.id || null, missionTypeDisplayName: missionType ? displayEntityName(missionType) : method.missionTypeCanonical };
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
      const npc = method.sourceEntityId ? data.npcs.get(method.sourceEntityId) : null;
      const location = data.locations.get(method.locationId || npc?.locationId);
      const excerpt = String(method.provenance?.excerpt || '');
      const standingMatch = excerpt.match(/(?:for\s+)?([\d,]+)\s+Standing/i);
      const rankMatch = excerpt.match(/Rank\s+(\d+)\s*-\s*([A-Za-z ]+?)(?:\s+with\s+|\s+in\s+|[.,]|$)/i);
      const officialRankNames = { Doer: '实践者', Associate: '同伴', Friend: '朋友', Trusted: '信赖' };
      const inferredStanding = standingMatch ? Number(standingMatch[1].replace(/,/g, '')) : null;
      const inferredRank = rankMatch ? Number(rankMatch[1]) : null;
      const inferredRankCanonical = rankMatch ? rankMatch[2].trim() : null;
      const requirements = normalizeRequirements(method.requirements?.type && method.requirements.type !== 'none' ? { ...method.requirements, rank: method.requirements.rank ?? inferredRank, rankName: method.requirements.rankName || officialRankNames[inferredRankCanonical] || null, amount: method.requirements.amount ?? method.standing ?? inferredStanding } : method.currency?.length ? { type: 'currency', usage: 'exchange', npcId: method.sourceEntityId, locationId: method.locationId || npc?.locationId, currency: method.currency, isBuffUseless: true } : method.standing || method.rank != null || inferredStanding || inferredRank != null ? { type: 'standing', npcId: method.sourceEntityId, locationId: method.locationId || npc?.locationId, rank: method.rank ?? inferredRank, rankName: method.rankName || officialRankNames[inferredRankCanonical] || null, amount: method.standing ?? inferredStanding } : null);
      return { ...method, requirements, ...(npc ? { sourceDisplayName: displayEntityName(npc) } : {}), ...(location ? { locationId: location.id, locationDisplayName: displayEntityName(location) } : {}) };
    }
    if (method.type !== 'enemy-drop' || !method.sourceEntityId) return method;
    const enemy = data.enemies.get(method.sourceEntityId);
    const location = enemy?.locationId ? data.locations.get(enemy.locationId) : null;
    const parent = location?.parentId ? data.locations.get(location.parentId) : null;
    const missionType = enemy?.missionTypeId ? data.missionTypes.get(enemy.missionTypeId) : null;
    return {
      ...method,
      ...(enemy ? { sourceDisplayName: (() => { const name = displayEntityName(enemy); const faction = enemy.factionId ? data.factions.get(enemy.factionId) : null; return faction ? name.replace(new RegExp(`^${faction.canonical}\\s*`, 'i'), displayEntityName(faction)) : name; })(), ...(enemy.bossLocation ? { bossLocation: enemy.bossLocation } : {}) } : {}),
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
      const evidence = [
        ...(resolved.item.drops || []).map(drop => createAcquisitionEvidence({ type: 'drop', source: drop.location || 'Warframe Public Export', chance: drop.chance ?? null })),
        ...(!resolved.recipeVariant?.pendingWikiEvidence ? (resolved.item.recipes || []).map(recipe => createAcquisitionEvidence({ type: 'recipe', source: resolved.item.sourceFile || recipe.provenance?.source || 'Warframe Public Export', sourceId: recipe.id, quantity: recipe.outputQuantity })) : [])
      ];
      const notes = resolved.recipeVariant?.pendingWikiEvidence ? [resolved.recipeVariant.note] : [];
      return createAcquisitionResult({ query, item: resolved.item, evidence, recipeVariants: resolved.recipeVariant ? [resolved.recipeVariant] : resolved.item.recipeVariants, notes });
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
    const raw = String(query || '').trim();
    if (!raw) return null;
    const weaponGap = getWeaponGap(raw);
    if (weaponGap) return { query: raw, resolution: { canonical: weaponGap.canonical, exact: true }, entry: null, description: `${weaponGap.displayName}已在 DE 官方简体中文语言数据中出现，但当前 ExportWeapons 尚未提供完整 uniqueName、属性、倾向和来源结构，因此保持待审，禁止猜造获取路径。`, categories: [], methods: [], sourceOptions: [], structuredMethods: [], weaponGap, alternatives: [] };
    const consumableEntry = getConsumable(raw);
    if (consumableEntry) {
      const structuredMethods = routesToMethods(consumableEntry.consumableAcquisition?.generated?.routes || [], data)
        .filter(method => method.reviewStatus === 'approved' && method.type !== 'recipe');
      const acquisitionText = renderAcquisition(structuredMethods, { displayName: consumableEntry.subject.displayName, registries: data, showProbabilities: false });
      const officialDescription = consumableEntry.description?.display || '';
      const tips = consumableEntry.consumableAcquisition?.manual?.tips || [];
      const description = [officialDescription, acquisitionText, tips.length ? `小技巧：\n${tips.map(tip => `- ${tip}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
      return { query: raw, resolution: { canonical: consumableEntry.subject.canonical, exact: true }, entry: consumableEntry, description, categories: consumableEntry.subject.categoryRefs || [], methods: [], sourceOptions: [], structuredMethods, recipes: consumableEntry.recipes || [], alternatives: [] };
    }
    const weaponEntry = getWeapon(raw);
    if (weaponEntry) {
      const allStructuredMethods = routesToMethods(weaponEntry.acquisition?.routes || [], data).filter(method => method.reviewStatus !== 'review-required' || method.category !== 'unresolved');
      const prime = weaponEntry.acquisition?.prime;
      const structuredMethods = prime?.kind === 'prime-relic'
        ? (prime.status === '已入库' ? [] : allStructuredMethods.filter(method => method.type === 'relic-reward' && prime.methods.some(selected => selected.relicCanonical === method.relicCanonical)))
        : allStructuredMethods.filter(method => method.type !== 'relic-reward');
      const primeStatusText = prime?.kind === 'prime-relic' ? (prime.status === '已入库' ? `${weaponEntry.subject.displayName}当前已入库，官方当前掉落表中没有可刷取遗物。` : `Prime 状态：${prime.status}`) : null;
      const primeRelicText = prime?.kind === 'prime-relic' && prime.status !== '已入库' ? (() => { const { renderPrimePartGroups } = require('./prime-acquisition'); const componentNames = (weaponEntry.acquisition?.routes || []).filter(route => route.scope === 'component').map(route => route.variables?.partName).filter(Boolean); return `${weaponEntry.subject.displayName}当前可刷遗物：\n${renderPrimePartGroups(structuredMethods, { componentNames }).join('\n')}` })() : null;
      const acquisitionText = [primeStatusText, primeRelicText || renderAcquisition(structuredMethods, { displayName: weaponEntry.subject.displayName, registries: data, showProbabilities: false })].filter(Boolean).join('\n');
      const officialDescription = weaponEntry.description?.localizationStatus === 'official-zh' ? weaponEntry.description.display : '';
      // 待审 route 属于维护报告，不是用户文案。运行时只发布已经结构化、批准并本地化的来源；
      // 禁止将“缺哪个部件来源”这类内部质量门结果泄漏到群聊。
      const description = [officialDescription, acquisitionText].filter(Boolean).join('\n\n');
      const sourceOptions = structuredMethods.some(method => /Sanctuary(?:\/|\s|.*\()|Sanctuary Onslaught/i.test(String(method.sourceCanonical || method.missionTypeCanonical || method.sourceDisplayName || '')))
        ? [{ id: 'gameplay.sanctuary-onslaught', title: '\u5723\u6bbf\u7a81\u88ad', query: '\u5723\u6bbf\u7a81\u88ad' }]
        : [];
      return { query: raw, resolution: { canonical: weaponEntry.subject.canonical, exact: true }, entry: weaponEntry, description, categories: weaponEntry.subject.categoryRefs || [], methods: [], sourceOptions, structuredMethods, recipes: weaponEntry.recipes || [], disposition: weaponEntry.weaponIdentity?.omegaAttenuation ?? null, alternatives: [] };
    }
    const arcaneEntry = getArcane(raw);
    if (arcaneEntry) {
      const generated = arcaneEntry.arcaneAcquisition?.generated || {};
      const category = generated.classification?.category || 'legacy';
      const maxRank = Number(arcaneEntry.maxRank ?? generated.stats?.maxRank ?? 0);
      const structuredMethods = mergeArcaneMethods(arcaneEntry).map(enrichArcaneMethod);
      const methodRequirements = structuredMethods.map(method => normalizeRequirements(method.requirements)).filter(requirement => requirement.type !== 'none');
      // 多来源赋能的条件属于各自 method，不能再提升到结果顶层重复渲染。
      const requirements = { type: 'none' };
      const requirementLines = [];
      const wikiEvidence = generated.wiki?.evidence || [];
      return {
        query: raw,
        resolution: { canonical: arcaneEntry.subject.canonical, exact: true },
        entry: arcaneEntry,
        description: [renderArcaneAcquisition(arcaneEntry), renderAcquisition(structuredMethods, { displayName: arcaneEntry.subject?.displayName || arcaneEntry.title, registries: data, showProbabilities: false })].filter(Boolean).join('\n\n'),
        categories: [{ id: category, displayName: arcaneMethodDefinition?.categoryLabels?.[category] || category }],
        methods: [],
        sourceOptions: [],
        requirements,
        requirementLines,
        structuredMethods: structuredMethods.map(method => {
          const entity = method.sourceEntityId ? data.arcaneSources.get(method.sourceEntityId) : null;
          const location = method.locationId ? data.locations.get(method.locationId) : null;
          const missionType = method.missionTypeId ? data.missionTypes.get(method.missionTypeId) : null;
          const methodRequirements = normalizeRequirements(method.requirements);
          return {
            ...method,
            requirements: methodRequirements,
            requirementLines: renderRequirements(methodRequirements, data),
            ...(entity ? { sourceDisplayName: displayEntityName(entity), sourceKind: entity.kind } : {}),
            ...(method.sourceEntityId && data.npcs.get(method.sourceEntityId) ? { sourceDisplayName: displayEntityName(data.npcs.get(method.sourceEntityId)) } : {}),
            ...(location ? { locationDisplayName: displayEntityName(location) } : {}),
            ...(missionType ? { missionTypeDisplayName: displayEntityName(missionType) } : {})
          };
        }),
        wikiEvidence,
        arcane: { category, maxRank, requiredCopies: arcaneRequiredCopies(maxRank), availability: category === 'legacy' ? 'unavailable-review-required' : 'available' },
        alternatives: []
      };
    }
    const officialMod = getOfficialMod(raw);
    const collection = getAcquisitionCollection(raw);
    if (collection) return collection;
    const resourceResult = resourceAcquisition.getResourceAcquisition(raw);
    if (resourceResult) return {
      query: raw, resolution: { canonical: resourceResult.entry.subject.canonical, exact: true }, entry: resourceResult.entry,
      description: resourceResult.text, resourceRoute: { text: resourceResult.routeText, tips: resourceResult.tips, source: 'resource-method' },
      categories: [], methods: [], sourceOptions: [], structuredMethods: resourceResult.structuredMethods, alternatives: []
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
    const hasSpyMethods = rawStructuredMethods.some(method => method.type === 'mission-reward' && /^Spy$/i.test(String(method.missionTypeCanonical || '')));
    const sourceOptions = [...inheritedSourceOptions];
    if (hasSyndicateMethods && !sourceOptions.some(source => source.id === 'gameplay.syndicate-offerings')) sourceOptions.push({ id: 'gameplay.syndicate-offerings', title: '\u96c6\u56e2\u4f9b\u54c1', query: '\u96c6\u56e2' });
    if (hasSpyMethods && !sourceOptions.some(source => source.id === 'gameplay.spy-missions')) sourceOptions.push({ id: 'gameplay.spy-missions', title: '\u95f4\u8c0d\u4efb\u52a1', query: '\u95f4\u8c0d' });
    const requirements = normalizeRequirements(entry.modAcquisition?.manual?.requirements);
    const requirementLines = renderRequirements(requirements, data);
    const isFrame = entry.subject?.category === 'frame';
    const frameRoute = isFrame ? frameAcquisition.renderRoutedAcquisition(canonical) : null;
    if (isFrame && !entry.frameAcquisition?.generated?.isPrime && !frameRoute) {
      throw new Error(`战甲 ${canonical} 的分类路由未能从 method 或人工条目渲染，禁止回退到旧硬编码文案`);
    }
    const frameStructuredMethods = isFrame && frameRoute ? compileStructuredMethods([
      { type: 'route', scope: 'components', category: entry.frameAcquisition?.generated?.routing?.componentCategory || entry.subject?.categoryRefs?.[0], variables: { text: frameRoute.componentLine || frameRoute.lines?.[0] || '' }, requirements: entry.frameAcquisition?.generated?.routing?.requirements || { type: 'none' }, provenance: { source: 'frame-route', entryId: entry.id } },
      ...(frameRoute.blueprintLine ? [{ type: 'route', scope: 'blueprint', category: entry.frameAcquisition?.generated?.routing?.blueprintCategory || 'blueprint', variables: { text: frameRoute.blueprintLine }, requirements: { type: 'none' }, provenance: { source: 'frame-route', entryId: entry.id } }] : []),
      ...(entry.frameAcquisition?.generated?.routing?.methods || [])
    ], data) : [];
    const structuredMethods = compileStructuredMethods([
      ...rawStructuredMethods.map(enrichModMethod).map(method => Number.isFinite(method.chance) && method.chance > 1 ? { ...method, chance: method.chance / 100 } : method).filter(method => method.type !== 'unresolved-source'),
      ...structuredGameplayMethods(entry),
      ...frameStructuredMethods
    ], data);
    for (const gameplay of gameplayEntries) {
      const sourceEntityIds = new Set(gameplay.sourceEntityIds || []);
      const missionTypeIds = new Set(gameplay.missionTypeIds || []);
      const matches = structuredMethods.some(method => sourceEntityIds.has(method.sourceEntityId) || missionTypeIds.has(method.missionTypeId));
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
    const exchangeMethods = structuredMethods.filter(method => method.type === 'vendor-or-syndicate-exchange' || method.type === 'vendor-exchange');
    const hasStructuredExchange = exchangeMethods.length > 0;
    const frameExchangeSupplement = isFrame && hasStructuredExchange && !/兑换/.test(defaultDescription || '')
      ? renderAcquisition(exchangeMethods, { registries: data }) : null;
    const preferStructuredDescription = !defaultDescription || /尚未收录/.test(defaultDescription) || hasApprovedDailyTribute || (entry.subject?.category === 'weapon' && Boolean(structuredDescription)) || (entry.subject?.category === 'mod' && structuredMethods.some(method => ['mission-reward', 'circuit-reward', 'enemy-drop'].includes(method.type)) && Boolean(structuredDescription));
    return {
      query: raw,
      resolution,
      entry,
      officialMod: resolvedOfficialMod,
      description: frameExchangeSupplement ? [defaultDescription, frameExchangeSupplement].filter(Boolean).join('\n') : preferStructuredDescription && structuredDescription ? [syndicateHeader, structuredDescription].filter(Boolean).join('\n\n') : defaultDescription,
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
  const getAcquisitionCard = query => {
    const frameComponent = frameComponents.get(normalize(query));
    let result = frameComponent ? null : getAcquisition(query);
    if (frameComponent) {
      result = getAcquisition(frameComponent.frame.subject.canonical);
      const sections = acquisitionCardSections(result?.structuredMethods || [], { registries: data });
      return {
        query: String(query),
        kind: 'frame-component',
        identity: {
          canonical: frameComponent.canonical,
          displayName: frameComponent.displayName,
          uniqueName: frameComponent.component.officialUniqueName
        },
        variants: [],
        sections: {
          exchange: sections.exchange.map(item => item.text),
          enemy: sections.enemy.map(item => item.text),
          other: sections.other.map(item => item.text)
        },
        materials: [],
        detailOptions: [],
        credits: null,
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
      const sections = acquisitionCardSections(methods, { registries: data });
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
          other: sections.other.map(item => item.text)
        },
        materials: [],
        detailOptions: [],
        credits: null,
        wikiUrl: component.weapon.sources?.find(source => /wiki\.warframe\.com\/w\//i.test(source.url || ''))?.url || null
      };
    }
    const entry = result?.entry;
    const kind = entry?.subject?.category;
    if (!result || !['mod', 'arcane', 'weapon'].includes(kind)) return null;
    const uniqueName = entry.officialUniqueName || entry.subject?.officialUniqueName;
    const family = acquisitionVariantFamilyByMember.get(uniqueName);
    const variants = (family?.members || []).map(member => acquisitionIdentityByUniqueName.get(member)).filter(Boolean).map(variant => ({
      canonical: variant.subject?.canonical,
      displayName: variant.subject?.displayName || variant.title,
      uniqueName: variant.officialUniqueName || variant.subject?.officialUniqueName,
      current: (variant.officialUniqueName || variant.subject?.officialUniqueName) === uniqueName
    }));
    const sections = acquisitionCardSections(result.structuredMethods || [], { registries: data });
    const recipe = kind === 'weapon' ? (result.recipes || entry.recipes || [])[0] : null;
    return {
      query: String(query), kind,
      identity: { canonical: entry.subject?.canonical, displayName: entry.subject?.displayName || entry.title, uniqueName },
      variants: variants.length > 1 ? variants : [],
      sections: {
        exchange: sections.exchange.map(item => item.text),
        enemy: sections.enemy.map(item => item.text),
        other: sections.other.map(item => item.text)
      },
      materials: (recipe?.ingredients || []).map(item => ({ uniqueName: item.uniqueName, canonical: item.canonical, displayName: item.displayName || item.canonical, count: item.quantity })),
      detailOptions: (result.sourceOptions || []).map(source => ({ id: source.id, title: source.title, query: source.query })).filter(source => source.query),
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
  const wikiKnowledgeBody = entry => {
    const direct = [entry.content, entry.summary].find(value => typeof value === 'string' && value.trim());
    if (direct) return direct.trim();
    if (entry.module !== 'acquisition') return null;
    const effectLines = (entry.effectDetails || []).filter(value => typeof value === 'string' && value.trim());
    const acquisition = getAcquisition(entry.subject?.canonical || entry.title);
    const parts = [
      effectLines.length ? `效果：${effectLines.join('；')}` : null,
      acquisition?.description ? `获取方式：${acquisition.description}` : null,
      ...(entry.tips || []).filter(value => typeof value === 'string' && value.trim())
    ].filter(Boolean);
    return parts.length ? parts.join('\n') : null;
  };
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
    getAcquisitionCollection,
    getResourceAcquisition: resourceAcquisition.getResourceAcquisition,
    listResources: resourceAcquisition.listResources,
    resolveItem,
    getWeapon,
    getWeaponGap,
    resolveWeapon,
    getConsumable,
    resolveConsumable,
    consumables: data.consumables || [],
    getWeaponCrafting: query => { const entry = getWeapon(query); return entry ? { entry, text: renderCrafting(entry, weaponCraftingGraph), recipes: weaponCraftingGraph.recipesFor(entry.subject.officialUniqueName), craftTo: weaponCraftingGraph.craftTo(entry.subject.officialUniqueName) } : null; },
    weaponCraftingGraph,
    searchOfficialItems,
    getOfficialItem,
    getArcane,
    resolveArcane,
    getItemAcquisition,
    getOfficialMod,
    getModTips,
    getModTipKeywords,
    searchOfficialMods,
    listOfficialCategories,
    listReviewRequiredOfficialMods,
    listMissingOfficialMods,
    listStubOfficialMods,
    listMissingOfficialCategories,
    buildWikiContext,
    getLocation: data.locations.get,
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
    listAbilities,
    resolveAbility,
    getWarframeKnowledge: frameAcquisition.getWarframeKnowledge,
    getWarframeMaintenanceReport: frameAcquisition.getWarframeMaintenanceReport,
    frameAcquisition,
    resourceAcquisition
  };
}

module.exports = { createKnowledgeCore, searchEntries, frameAcquisition, resourceAcquisition };
