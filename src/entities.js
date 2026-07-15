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
function normalize(value) { return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s_\-·'’/]+/g, ''); }
function createRegistry(entries) {
  const values = deepFreeze(entries.map(entry => ({ ...entry })));
  const index = new Map();
  for (const entry of values) for (const key of [entry.id, entry.canonical, entry.displayName, ...(entry.aliases || [])]) {
    const normalized = normalize(key);
    if (normalized && !index.has(normalized)) index.set(normalized, entry);
  }
  return Object.freeze({
    values,
    get(query) { return index.get(normalize(query)) || null; },
    search(query) {
      const q = normalize(query);
      if (!q) return [];
      return values.filter(entry => [entry.id, entry.canonical, entry.displayName, ...(entry.aliases || [])].some(value => normalize(value).includes(q)));
    }
  });
}
function readIndexedEntries(root, directory) {
  const base = path.join(root, 'knowledge', directory);
  const indexPath = path.join(base, 'categories.json');
  if (!fs.existsSync(indexPath)) return [];
  const index = readJson(indexPath);
  return (index.variables || index.npcs || []).map(item => {
    const target = path.join(base, ...String(item.file || '').split('/'));
    if (!fs.existsSync(target)) throw new Error(`${directory}/${item.file}: 索引指向的实体文件不存在`);
    const entry = readJson(target);
    if (entry.id !== item.id || entry.canonical !== item.canonical) throw new Error(`${directory}/${item.file}: 索引与实体不一致`);
    return entry;
  });
}
function displayEntityName(entry) { return entry ? (typeof entry.displayName === 'string' && entry.displayName.trim() ? entry.displayName : entry.canonical) : ''; }
function loadEntityRegistries(root = path.join(__dirname, '..')) {
  const load = directory => createRegistry(readIndexedEntries(root, directory));
  return deepFreeze({
    locations: load('locations'),
    currencies: load('curreicies'),
    quests: load('quests'),
    factions: load('factions'),
    enemies: load('enemies'),
    missionTypes: load('mission-types'),
    arcaneSources: load('arcane-sources'),
    npcs: load('npc')
  });
}

module.exports = { normalizeEntityName: normalize, createRegistry, readIndexedEntries, loadEntityRegistries, displayEntityName };
