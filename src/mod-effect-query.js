'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { resolveModContent } = require('./mod-content');
const { modEffectLines } = require('./mod-effect-template');
const indexes = new Map();
const normalize = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[\s·・‧•_\-]+/g, '');

function effectQuestionSubject(question) {
  const text = String(question || '').normalize('NFKC').trim()
    .replace(/^(?:请问|请教|帮我查一下|帮我查|告诉我)\s*/, '')
    .replace(/[?？。!！]+$/, '').trim();
  const match = text.match(/^(.+?)(?:的)?(?:效果|词条|属性|加成|作用|数值)(?:是什么|是啥|有哪些|有什么|怎么样|如何)?$/i)
    || text.match(/^(.+?)\s+(?:effects?|stats?|attributes?)(?:\s+please)?$/i);
  return match ? match[1].trim().replace(/的$/, '').trim() : null;
}

function statKey(file) {
  const stat = fs.statSync(file);
  return `${stat.size}:${stat.mtimeMs}`;
}

function loadIndex(root) {
  const catalogPath = path.join(root, 'knowledge/categories/official.json');
  const aliasesPath = path.join(root, 'knowledge/facts/aliases.json');
  const fingerprint = `${statKey(catalogPath)}:${statKey(aliasesPath)}`;
  const previous = indexes.get(root);
  if (previous?.fingerprint === fingerprint) return previous.names;
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const aliases = JSON.parse(fs.readFileSync(aliasesPath, 'utf8')).mods || {};
  const names = new Map();
  for (const mod of catalog.mods || []) {
    if (!mod.contentRef) continue;
    for (const name of [mod.displayName, mod.canonical, ...(mod.aliases || []), ...(aliases[mod.canonical] || [])]) {
      const key = normalize(name);
      if (!key) continue;
      if (!names.has(key)) names.set(key, new Map());
      names.get(key).set(mod.uniqueName, mod);
    }
  }
  indexes.set(root, { fingerprint, names });
  return names;
}

function queryMaintainedModEffect(question, options = {}) {
  const subject = effectQuestionSubject(question) || (options.allowBareName ? String(question || '').trim() : null);
  if (!subject) return null;
  const started = performance.now();
  const root = options.root || path.resolve(__dirname, '..');
  const matches = loadIndex(root).get(normalize(subject));
  if (matches?.size !== 1) return null;
  const mod = matches.values().next().value;
  // Always read the authoritative document: edits become visible immediately.
  const entry = resolveModContent(mod.contentRef, root);
  const effects = modEffectLines(entry).filter(Boolean);
  if (!effects.length) return null;
  const title = entry.subject.displayName || entry.title;
  return {
    kind: 'maintained-mod-effect', title, canonical: entry.subject.canonical,
    maxRank: entry.maxRank, effects, source: mod.contentRef,
    text: `${title}（满级）：\n${effects.join('\n')}`,
    durationMs: Number((performance.now() - started).toFixed(2))
  };
}

module.exports = { effectQuestionSubject, queryMaintainedModEffect };
