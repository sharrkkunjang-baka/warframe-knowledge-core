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
  return { ...data, resolveName, normalizeTerms, searchFacts, searchKnowledge, buildWikiContext };
}

module.exports = { createKnowledgeCore, searchEntries };
