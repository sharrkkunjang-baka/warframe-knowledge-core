'use strict';

const crypto = require('node:crypto');
const { loadData } = require('./loader');

const FORBIDDEN_SOURCE_RE = /(?:^|\.)fandom\.com|(?:^|\.)wikia\.com/i;
const INTERNAL_KEYS = new Set(['html', 'raw', 'image', 'icon', 'thumbnail']);
const INVALID_UTF16_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function sanitizeUnicode(value) { return String(value ?? '').replace(INVALID_UTF16_RE, ''); }

function stableId(prefix, value) {
  return `wf:${prefix}:${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}

function scalar(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function compactValue(value, depth = 0) {
  if (value == null || depth > 4) return null;
  if (scalar(value)) return value;
  if (Array.isArray(value)) return value.slice(0, 80).map(item => compactValue(item, depth + 1)).filter(item => item != null);
  if (typeof value !== 'object') return null;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (INTERNAL_KEYS.has(key) || child == null) continue;
    const compacted = compactValue(child, depth + 1);
    if (compacted == null || (Array.isArray(compacted) && !compacted.length) || (typeof compacted === 'object' && !Array.isArray(compacted) && !Object.keys(compacted).length)) continue;
    out[key] = compacted;
  }
  return out;
}

function labels(entry) {
  const subject = entry?.subject || {};
  return [...new Set([
    subject.displayName,
    subject.canonical,
    entry.displayName,
    entry.canonical,
    entry.title,
    ...(entry.aliases || [])
  ].filter(Boolean).map(String))];
}

function documentText(title, category, value) {
  return [`名称：${title}`, `类别：${category}`, `结构化资料：${JSON.stringify(compactValue(value))}`].join('\n');
}

function coreDocument(prefix, key, category, title, value, metadata = {}) {
  const aliases = labels(value);
  return {
    id: stableId(prefix, key),
    document: sanitizeUnicode(documentText(title, category, value)),
    metadata: {
      sourceType: 'knowledge-core',
      sourceId: String(key),
      category: String(category),
      canonical: String(value?.subject?.canonical || value?.canonical || title || ''),
      displayName: String(value?.subject?.displayName || value?.displayName || title || ''),
      aliases: aliases.join(' | ').slice(0, 4000),
      localizationStatus: String(value?.localizationStatus || value?.description?.localizationStatus || ''),
      reviewStatus: String(value?.reviewStatus || 'generated'),
      ...metadata
    }
  };
}

function registryDocuments(registryName, registry) {
  return (registry?.values || []).map(entry => coreDocument(
    `entity-${registryName}`,
    entry.id || entry.canonical,
    registryName,
    entry.displayName || entry.canonical,
    entry,
    { entityId: String(entry.id || '') }
  ));
}

function buildCoreVectorDocuments(options = {}) {
  const data = options.data || loadData(options.root, { approvedOnly: options.approvedOnly !== false });
  const docs = [];
  for (const entry of data.knowledge || []) docs.push(coreDocument('knowledge', entry.id, entry.subject?.category || entry.module || 'knowledge', entry.subject?.displayName || entry.title, entry));
  for (const entry of data.facts || []) docs.push(coreDocument('fact', entry.id, 'fact', entry.title, entry));
  for (const entry of data.officialCatalog?.mods || []) docs.push(coreDocument('mod', entry.uniqueName || entry.canonical, 'mod', entry.displayName || entry.canonical, entry));
  for (const entry of data.officialItems?.items || []) docs.push(coreDocument('item', entry.uniqueName || entry.canonical, entry.kind || 'item', entry.displayName || entry.canonical, entry));
  for (const entry of data.officialWeapons?.weapons || []) docs.push(coreDocument('weapon', entry.uniqueName || entry.canonical, 'weapon', entry.displayName || entry.canonical, entry));
  for (const entry of data.officialAbilities?.abilities || []) docs.push(coreDocument('ability', entry.abilityId || entry.officialUniqueName || entry.canonical, 'ability', entry.displayName || entry.canonical, entry));
  for (const [name, registry] of Object.entries({ locations: data.locations, currencies: data.currencies, quests: data.quests, factions: data.factions, enemies: data.enemies, missionTypes: data.missionTypes, arcaneSources: data.arcaneSources, npcs: data.npcs })) docs.push(...registryDocuments(name, registry));
  const byId = new Map();
  for (const doc of docs) {
    if (FORBIDDEN_SOURCE_RE.test(doc.document) || FORBIDDEN_SOURCE_RE.test(JSON.stringify(doc.metadata))) throw new Error(`forbidden Fandom/Wikia provenance in ${doc.id}`);
    byId.set(doc.id, doc);
  }
  return [...byId.values()];
}

function wikiSectionDocuments(page, options = {}) {
  const maxChars = Math.max(800, Number(options.maxChars || 4200));
  const sectionChars = Math.max(80, Number(options.sectionChars || 360));
  const title = sanitizeUnicode(page.title || '');
  const sourceUrl = `https://wiki.warframe.com/w/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const aliases = [...new Set((page.aliases || []).filter(Boolean).map(sanitizeUnicode))];
  const categories = (page.categories || []).map(sanitizeUnicode);
  const sections = page.sections?.length ? page.sections : [{ title: 'Lead', ordinal: 0, text: page.text || '' }];
  const summaries = [];
  for (const section of sections) {
    const clean = sanitizeUnicode(section.text || '').replace(/https?:\/\/[^\s)]*(?:fandom|wikia)\.com[^\s)]*/gi, '').trim();
    if (!clean) continue;
    summaries.push(`【${section.title || '正文'}】${clean.slice(0, sectionChars)}`);
  }
  const body = summaries.join('\n').slice(0, maxChars);
  if (!body) return [];
  return [{
    id: stableId('wiki-page', String(page.pageId)),
    document: sanitizeUnicode(`页面：${title}\n别名：${aliases.join('、')}\n分类：${categories.join('、')}\n章节摘要：\n${body}`),
    metadata: {
      sourceType: 'wiki-warframe-com', sourceId: String(page.pageId), pageId: Number(page.pageId), revisionId: Number(page.revisionId || 0), title,
      categories: categories.join(' | ').slice(0, 4000), aliases: aliases.join(' | ').slice(0, 4000), sourceUrl,
      pageTimestamp: String(page.timestamp || ''), syncedAt: String(page.syncedAt || '')
    }
  }];
}

module.exports = { FORBIDDEN_SOURCE_RE, stableId, sanitizeUnicode, compactValue, buildCoreVectorDocuments, wikiSectionDocuments };
