'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadData } = require('../src/loader');

require('./validate');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const data = loadData(root, { approvedOnly: true });
const coverageManifest = JSON.parse(fs.readFileSync(path.join(root, 'generated', 'official-coverage-manifest.json'), 'utf8'));
const outputs = {
  'facts.json': data.facts,
  'knowledge.json': data.knowledge,
  'categories.json': data.categories,
  'official.json': data.officialCatalog,
  'official-items.json': data.officialItems,
  'official-item-sources.json': data.officialItemSources,
  'official-coverage-manifest.json': coverageManifest,
  'locations.json': data.locations.values,
  'quests.json': data.quests.values,
  'enemies.json': data.enemies.values,
  'mission-types.json': data.missionTypes.values,
  'currencies.json': data.currencies.values,
  'factions.json': data.factions.values,
  'npcs.json': data.npcs.values,
  'aliases.json': data.aliases,
  'frame-categories.json': data.frameCategories,
  'frame-methods.json': data.frameMethods
};
const files = {};
for (const [name, value] of Object.entries(outputs)) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(path.join(dist, name), text);
  files[name] = { bytes: Buffer.byteLength(text), sha256: crypto.createHash('sha256').update(text).digest('hex') };
}
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  counts: {
    facts: data.facts.length,
    knowledge: data.knowledge.length,
    categories: data.categories.length,
    officialMods: data.officialCatalog.counts.mods,
    officialCategories: data.officialCatalog.counts.officialCategories,
    officialItems: data.officialItems.counts.items,
    locations: data.locations.values.length,
    quests: data.quests.values.length,
    enemies: data.enemies.values.length,
    missionTypes: data.missionTypes.values.length,
    currencies: data.currencies.values.length,
    factions: data.factions.values.length,
    npcs: data.npcs.values.length,
    frameCategories: data.frameCategories?.count || 0,
    frameMethods: data.frameMethods.length,
    stubOfficialMods: data.officialCatalog.counts.stubMods,
    missingOfficialMods: data.officialCatalog.counts.missingMods,
    missingOfficialCategories: data.officialCatalog.counts.missingOfficialCategories
  },
  officialSource: data.officialCatalog.source,
  officialItemSource: data.officialItems.source,
  officialCoverage: { generatedAt: coverageManifest.generatedAt, qualityGate: coverageManifest.qualityGate, domains: Object.fromEntries(Object.entries(coverageManifest.domains).map(([name, domain]) => [name, domain.counts])) },
  files
};
fs.writeFileSync(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`构建完成：${data.facts.length} 条事实，${data.knowledge.length} 条知识，${data.categories.length} 个细分类，${data.officialCatalog.counts.mods} 个官方 Mod`);
