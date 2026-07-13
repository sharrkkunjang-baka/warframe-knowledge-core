'use strict';

const path = require('path');
const { loadData } = require('./loader');
const { createResolver, normalize } = require('./resolver');

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
  const resolveName = createResolver(data.aliases);
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
    const entries = searchGameplay(raw, { limit: 8 });
    return entries.length ? { query: raw, entry: entries[0], alternatives: entries.slice(1) } : null;
  };
  const searchCategories = query => {
    const q = normalize(query);
    if (!q) return [];
    return data.categories.filter(category => [category.id, category.canonical, category.displayName, ...(category.aliases || [])].some(name => normalize(name) === q));
  };
  const officialMods = data.officialCatalog?.mods || [];
  const officialCategories = data.officialCatalog?.officialCategories || [];
  const getOfficialMod = query => {
    const q = normalize(query);
    if (!q) return null;
    return officialMods.find(mod => [mod.uniqueName, mod.canonical, mod.displayName].some(value => normalize(value) === q)) || null;
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
  const getAcquisitionDescription = entry => {
    if (entry.summary || entry.content) return entry.summary || entry.content;
    const primaryCategory = getCategory(entry.subject?.categoryRefs?.[0]);
    return primaryCategory?.modDescription
      ? renderTemplate(primaryCategory.modDescription, { name: entry.subject?.displayName || entry.title })
      : null;
  };
  const expandMethodRefs = entry => (entry.methodRefs || []).map(id => data.knowledge.find(item => item.module === 'gameplay' && item.id === id)).filter(Boolean);
  const getAcquisition = (query, searchOptions = {}) => {
    const raw = String(query || '').trim();
    if (!raw) return null;
    const resolution = resolveName(raw, searchOptions.resolveOptions || {});
    if (resolution?.ambiguous) return { query: raw, resolution, entry: null, methods: [], alternatives: [] };
    const canonical = resolution?.canonical || raw;
    const entry = data.knowledge.find(item => item.module === 'acquisition' && normalize(item.subject?.canonical) === normalize(canonical));
    return entry ? { query: raw, resolution, entry, description: getAcquisitionDescription(entry), categories: (entry.subject.categoryRefs || []).map(getCategory).filter(Boolean), methods: expandMethodRefs(entry), alternatives: [] } : null;
  };
  const buildWikiContext = query => {
    const resolution = resolveName(query);
    const facts = searchFacts(query);
    const knowledge = searchKnowledge(query);
    if (!facts.length && !knowledge.length && !resolution) return null;
    const sections = [];
    if (resolution && !resolution.ambiguous) sections.push(`名称解析：${query} → ${resolution.canonical}`);
    if (facts.length) sections.push(`基础事实：\n${facts.map(item => `【${item.title}】\n${item.content}\n来源：${item.sources.map(source => `${source.label} ${source.url}`).join('、')}`).join('\n\n')}`);
    if (knowledge.length) sections.push(`加工知识：\n${knowledge.map(item => `【${item.title}】\n${item.content}`).join('\n\n')}`);
    return { query, resolution, facts, knowledge, text: sections.join('\n\n') };
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
    getOfficialMod,
    searchOfficialMods,
    listOfficialCategories,
    listMissingOfficialMods,
    listMissingOfficialCategories,
    buildWikiContext
  };
}

module.exports = { createKnowledgeCore, searchEntries };
