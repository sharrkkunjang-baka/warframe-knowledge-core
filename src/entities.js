'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s_\-·'’/]+/g, '');
}

function createRegistry(entries) {
  const values = deepFreeze(entries.map(entry => ({ ...entry })));
  const index = new Map();
  for (const entry of values) {
    for (const key of [entry.id, entry.canonical, entry.displayName, ...(entry.aliases || [])]) {
      const normalized = normalize(key);
      if (normalized && !index.has(normalized)) index.set(normalized, entry);
    }
  }
  return Object.freeze({
    values,
    get(query) { return index.get(normalize(query)) || null; },
    search(query) {
      const q = normalize(query);
      if (!q) return [];
      return values.filter(entry => [entry.id, entry.canonical, entry.displayName, ...(entry.aliases || [])]
        .some(value => normalize(value).includes(q)));
    }
  });
}

function loadEntityRegistries(root = path.join(__dirname, '..')) {
  const load = name => createRegistry(readJson(path.join(root, 'entities', `${name}.json`)));
  return deepFreeze({ locations: load('locations'), vendors: load('vendors'), currencies: load('currencies'), quests: load('quests') });
}

module.exports = { normalizeEntityName: normalize, createRegistry, loadEntityRegistries };
