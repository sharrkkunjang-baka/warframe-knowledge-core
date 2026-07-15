'use strict';

const path = require('path');
const { loadData } = require('./loader');
const { createResolver, normalize } = require('./resolver');
const frameAcquisition = require('./frame-acquisition');
const resourceAcquisition = require('./resource-acquisition');
const { createAcquisitionEvidence, createAcquisitionResult, createRenderResult } = require('./acquisition-dto');
const { displayEntityName } = require('./entities');

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
  const officialNameCandidates = [
    ...officialMods.flatMap(mod => [mod.canonical, mod.displayName].filter(Boolean).map(alias => ({ alias, canonical: mod.canonical, category: 'official' }))),
    ...(data.arcanes || []).flatMap(arcane => [arcane.subject?.canonical, arcane.subject?.displayName, ...(arcane.arcaneAcquisition?.manual?.aliases || [])]
      .filter(Boolean).map(alias => ({ alias, canonical: arcane.subject.canonical, category: 'arcane' })))
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
  const normalizeTerms = text => {
    let output = String(text || '');
    for (const key of Object.keys(data.aliases.normalization || {}).sort((a, b) => b.length - a.length)) output = output.split(key).join(data.aliases.normalization[key]);
    return output;
  };
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
  const parseGameplayCommand = text => {
    const raw = String(text || '').trim();
    const match = raw.match(/^\/玩法(?:\s+(.+))?$/i);
    return match ? { intent: 'gameplay', query: String(match[1] || '').trim() } : null;
  };
  const parseCategoryCommand = text => {
    const raw = String(text || '').trim();
    const match = raw.match(/^\/分类(?:\s+(.+))?$/i) || raw.match(/^分类\s+(.+)$/i);
    return match ? { intent: 'category', query: String(match[1] || '').trim() } : null;
  };
  const searchAcquisition = (query, searchOptions = {}) => searchEntries(query, data.knowledge.filter(entry => entry.module === 'acquisition'), searchOptions);
  const searchGameplay = (query, searchOptions = {}) => searchEntries(query, data.knowledge.filter(entry => entry.module === 'gameplay'), searchOptions);
  const getGameplay = query => {
    const raw = String(query || '').trim();
    if (!raw) return null;
    let entries = [];
    let rewardTier = null;
    const optionMatch = raw.match(/^(.+?)\s+(\S+)$/);
    if (optionMatch) {
      const baseEntries = searchGameplay(optionMatch[1], { limit: 8 });
      if (baseEntries[0]?.rewardGroups) {
        rewardTier = optionMatch[2].toUpperCase();
        if (!['A', 'B', 'C'].includes(rewardTier)) return null;
        entries = baseEntries;
      }
    }
    if (!entries.length) entries = searchGameplay(raw, { limit: 8 });
    if (!entries.length) return null;
    const entry = entries[0];
    const rewardGroup = rewardTier ? entry.rewardGroups?.[rewardTier] : null;
    if (rewardTier && !rewardGroup) return null;
    return { query: raw, entry, rewardTier, rewardGroup, alternatives: entries.slice(1) };
  };
  const searchCategories = query => {
    const q = normalize(query);
    if (!q) return [];
    return data.categories.filter(category => [category.id, category.canonical, category.displayName, ...(category.aliases || [])].some(name => normalize(name) === q));
  };
  const itemAliases = item => [item.uniqueName, item.canonical, item.displayName, ...(item.recipeVariants || []).flatMap(variant => variant.aliases || [])];
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
    return officialMods.find(mod => [mod.uniqueName, mod.canonical, mod.displayName].some(value => normalize(value) === q)) || null;
  };
  const normalizeArcaneName = value => normalize(value).replace(/^霰弹枪(?=仇杀)/, '霰弹');
  const getArcane = query => {
    const q = normalizeArcaneName(query);
    if (!q) return null;
    return (data.arcanes || []).find(entry => [entry.officialUniqueName, entry.subject?.canonical, entry.subject?.displayName, ...(entry.arcaneAcquisition?.manual?.aliases || [])].some(value => normalizeArcaneName(value) === q)) || null;
  };
  const resolveItem = query => {
    const arcane = getArcane(query);
    if (arcane) return { kind: 'arcane', item: arcane, recipeVariant: null };
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
  const listMissingOfficialMods = (filter = {}) => officialMods.filter(mod =>
    mod.status === 'missing'
    && (!filter.categoryId || mod.officialCategoryIds.includes(filter.categoryId))
    && (!filter.localizationStatus || mod.localizationStatus === filter.localizationStatus));
  const listStubOfficialMods = (filter = {}) => officialMods.filter(mod =>
    mod.status === 'stub'
    && (!filter.categoryId || mod.officialCategoryIds.includes(filter.categoryId))
    && (!filter.localizationStatus || mod.localizationStatus === filter.localizationStatus));
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
  const arcaneMethodIdentity = method => JSON.stringify({ type: method.type, sourceCanonical: method.sourceCanonical, probability: method.probability, quantity: method.quantity, outputQuantity: method.outputQuantity });
  const mergeArcaneMethods = entry => {
    const manual = entry?.arcaneAcquisition?.manual?.methods || [];
    const official = entry?.arcaneAcquisition?.generated?.acquisition?.methods || [];
    const wiki = entry?.arcaneAcquisition?.generated?.wiki?.methods || [];
    const methods = [];
    const seen = new Set();
    for (const method of [...manual, ...official, ...wiki]) {
      const key = arcaneMethodIdentity(method);
      if (!seen.has(key)) { seen.add(key); methods.push(method); }
    }
    return methods;
  };
  const renderArcaneAcquisition = entry => {
    const generated = entry.arcaneAcquisition?.generated || {};
    const category = generated.classification?.category || 'legacy';
    const maxRank = Number(entry.maxRank ?? generated.stats?.maxRank ?? 0);
    const label = arcaneMethodDefinition?.categoryLabels?.[category] || category;
    const header = renderTemplate(arcaneMethodDefinition?.headerTemplate || '【{displayName}】\n分类：{categoryLabel}\n最高等级：{maxRank}（满级共需 {requiredCopies} 个）', {
      displayName: entry.subject?.displayName || entry.title,
      categoryLabel: label,
      maxRank,
      requiredCopies: arcaneRequiredCopies(maxRank)
    });
    if (category === 'legacy' || generated.acquisition?.status === 'review-required') return `${header}\n\n${arcaneMethodDefinition?.legacyDescription || '当前不可获取，等待人工审核。'}`;
    return header;
  };
  const generatedAcquisitionMethods = entry => entry?.modAcquisition?.generated?.wiki?.methods || [];
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
    const inheritedRefs = explicitRefs.length
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
  const getAcquisitionDescription = entry => {
    if (entry.summary || entry.content) return entry.summary || entry.content;
    const primaryCategory = getCategory(entry.subject?.categoryRefs?.[0]);
    const methods = expandMethodRefs(entry);
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
        ...(!resolved.recipeVariant?.pendingWikiEvidence ? (resolved.item.recipes || []).map(recipe => createAcquisitionEvidence({ type: 'recipe', source: resolved.item.sourceFile, sourceId: recipe.id, quantity: recipe.outputQuantity })) : [])
      ];
      const notes = resolved.recipeVariant?.pendingWikiEvidence ? [resolved.recipeVariant.note] : [];
      return createAcquisitionResult({ query, item: resolved.item, evidence, recipeVariants: resolved.recipeVariant ? [resolved.recipeVariant] : resolved.item.recipeVariants, notes });
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
    return createAcquisitionResult({ query, item: resolved.item, evidence: [createAcquisitionEvidence({ type: 'warframe', source: resolved.item.uniqueName })], status: 'resolved' });
  };
  const getAcquisition = (query, searchOptions = {}) => {
    const raw = String(query || '').trim();
    if (!raw) return null;
    const arcaneEntry = getArcane(raw);
    if (arcaneEntry) {
      const generated = arcaneEntry.arcaneAcquisition?.generated || {};
      const category = generated.classification?.category || 'legacy';
      const maxRank = Number(arcaneEntry.maxRank ?? generated.stats?.maxRank ?? 0);
      const structuredMethods = mergeArcaneMethods(arcaneEntry);
      const wikiEvidence = generated.wiki?.evidence || [];
      return {
        query: raw,
        resolution: { canonical: arcaneEntry.subject.canonical, exact: true },
        entry: arcaneEntry,
        description: renderArcaneAcquisition(arcaneEntry),
        categories: [{ id: category, displayName: arcaneMethodDefinition?.categoryLabels?.[category] || category }],
        methods: [],
        sourceOptions: [],
        structuredMethods,
        wikiEvidence,
        arcane: { category, maxRank, requiredCopies: arcaneRequiredCopies(maxRank), availability: category === 'legacy' ? 'unavailable-review-required' : 'available' },
        alternatives: []
      };
    }
    const collection = getAcquisitionCollection(raw);
    if (collection) return collection;
    const resourceResult = resourceAcquisition.getResourceAcquisition(raw);
    if (resourceResult) return {
      query: raw, resolution: { canonical: resourceResult.entry.subject.canonical, exact: true }, entry: resourceResult.entry,
      description: resourceResult.text, resourceRoute: { text: resourceResult.routeText, tips: resourceResult.tips, source: 'resource-method' },
      categories: [], methods: [], sourceOptions: [], structuredMethods: [], alternatives: []
    };
    // 战甲规范名已经由命令层完成解析时必须精确锁定；通用别名解析可能把
    // "Wukong Prime" 之类的名称再次降级为普通 "Wukong"。
    const exactFrameEntry = allKnowledge.find(item => item.module === 'acquisition'
      && item.subject?.category === 'frame'
      && normalize(item.subject?.canonical) === normalize(raw));
    const resolution = exactFrameEntry ? { canonical: exactFrameEntry.subject.canonical, exact: true } : resolveName(raw, searchOptions.resolveOptions || {});
    if (resolution?.ambiguous) return { query: raw, resolution, entry: null, methods: [], sourceOptions: [], alternatives: [] };
    const canonical = exactFrameEntry?.subject?.canonical || resolution?.canonical || raw;
    const entry = exactFrameEntry || allKnowledge.find(item => item.module === 'acquisition' && normalize(item.subject?.canonical) === normalize(canonical));
    if (!entry) return getAcquisitionCollection(raw);
    const { methods, sourceOptions } = aggregateAcquisitionMethods([entry]);
    const isFrame = entry.subject?.category === 'frame';
    const frameRoute = isFrame ? frameAcquisition.renderRoutedAcquisition(canonical) : null;
    if (isFrame && !entry.frameAcquisition?.generated?.isPrime && !frameRoute) {
      throw new Error(`战甲 ${canonical} 的分类路由未能从 method 或人工条目渲染，禁止回退到旧硬编码文案`);
    }
    return {
      query: raw,
      resolution,
      entry,
      description: frameRoute?.lines?.join('\n') || renderModAcquisition(entry) || getAcquisitionDescription(entry),
      frameRoute,
      categories: (entry.subject.categoryRefs || []).map(getCategory).filter(Boolean),
      methods,
      sourceOptions,
      structuredMethods: mergeStructuredMethods(entry),
      wikiEvidence: entry.modAcquisition?.generated?.wiki?.evidence || [],
      mechanicsEvidence: entry.modAcquisition?.generated?.wiki?.mechanicsEvidence || null,
      alternatives: []
    };
  };
  const resolveEntityVariables = query => {
    const sources = [
      ['npc', data.npcs], ['location', data.locations], ['faction', data.factions],
      ['quest', data.quests], ['currency', data.currencies], ['enemy', data.enemies], ['mission-type', data.missionTypes]
    ];
    const seen = new Set();
    return sources.flatMap(([type, registry]) => registry.search(query).slice(0, 8).map(entry => ({
      type, id: entry.id, canonical: entry.canonical, displayName: displayEntityName(entry),
      localized: Boolean(entry.displayName && entry.displayName.trim()), locationId: entry.locationId || null,
      factionId: entry.factionId || null
    }))).filter(variable => !seen.has(variable.id) && seen.add(variable.id));
  };
  const buildWikiContext = query => {
    const resolution = resolveName(query);
    const facts = searchFacts(query);
    const knowledge = searchKnowledge(query);
    const entityVariables = resolveEntityVariables(query);
    if (!facts.length && !knowledge.length && !resolution && !entityVariables.length) return null;
    const sections = [];
    if (resolution && !resolution.ambiguous) sections.push(`名称解析：${query} → ${resolution.canonical}`);
    if (entityVariables.length) sections.push(`实体变量（NPC/地点/阵营/任务/货币/敌人/任务类型）：\n${entityVariables.map(item => `${item.id} = ${item.displayName} [canonical: ${item.canonical}]`).join('\n')}\n输出规则：需要提及这些实体时必须使用变量的 displayName；localized=false 表示没有已审核官方中文，只能保留 canonical 英文，禁止自行翻译、音译或补中文。不要输出未被当前问题需要的变量。`);
    if (facts.length) sections.push(`基础事实：\n${facts.map(item => `【${item.title}】\n${item.content}\n来源：${item.sources.map(source => `${source.label} ${source.url}`).join('、')}`).join('\n\n')}`);
    if (knowledge.length) sections.push(`加工知识：\n${knowledge.map(item => `【${item.title}】\n${item.content}`).join('\n\n')}`);
    return { query, resolution, facts, knowledge, entityVariables, text: sections.join('\n\n') };
  };
  return {
    ...data,
    resolveName,
    normalizeTerms,
    parseAcquisitionCommand,
    parseGameplayCommand,
    parseCategoryCommand,
    searchFacts,
    searchKnowledge,
    searchAcquisition,
    searchGameplay,
    searchCategories,
    getCategory,
    getCategoryDetail,
    getGameplay,
    getAcquisition,
    getAcquisitionCollection,
    getResourceAcquisition: resourceAcquisition.getResourceAcquisition,
    listResources: resourceAcquisition.listResources,
    resolveItem,
    searchOfficialItems,
    getOfficialItem,
    getArcane,
    getItemAcquisition,
    getOfficialMod,
    getModTips,
    getModTipKeywords,
    searchOfficialMods,
    listOfficialCategories,
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
    createAcquisitionEvidence,
    createAcquisitionResult,
    createRenderResult,
    listWarframes: frameAcquisition.listWarframes,
    getWarframeKnowledge: frameAcquisition.getWarframeKnowledge,
    getWarframeMaintenanceReport: frameAcquisition.getWarframeMaintenanceReport,
    frameAcquisition,
    resourceAcquisition
  };
}

module.exports = { createKnowledgeCore, searchEntries, frameAcquisition, resourceAcquisition };
