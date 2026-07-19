'use strict';

const fs = require('fs');
const path = require('path');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function readJsonDirectory(dir, acceptObject = false) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) return readJsonDirectory(target, acceptObject);
      if (!entry.isFile() || !entry.name.endsWith('.json')) return [];
      const value = readJson(target);
      if (Array.isArray(value)) return value;
      return acceptObject && value && typeof value === 'object' ? [value] : [];
    });
}

function readEntryDirectory(dir) {
  return readJsonDirectory(dir);
}

function readObjectDirectory(dir) {
  return readJsonDirectory(dir, true);
}

function readCategoryDirectory(dir) {
  return readObjectDirectory(dir).filter(entry => typeof entry.id === 'string');
}

function loadData(root = path.join(__dirname, '..'), options = {}) {
  const approvedOnly = options.approvedOnly !== false;
  const keep = entry => !approvedOnly || entry.reviewStatus === 'approved';
  const knowledgeDirectory = path.join(root, 'knowledge');
  const facts = readEntryDirectory(path.join(knowledgeDirectory, 'facts')).filter(entry => entry.kind === 'fact').filter(keep);
  const knowledge = readEntryDirectory(knowledgeDirectory).filter(entry => entry.kind === 'knowledge').filter(keep);
  const categoriesDirectory = path.join(knowledgeDirectory, 'categories');
  const categories = readCategoryDirectory(categoriesDirectory);
  const officialPath = path.join(categoriesDirectory, 'official.json');
  const officialCatalog = fs.existsSync(officialPath) ? deepFreeze(readJson(officialPath)) : null;
  const officialItemsPath = path.join(knowledgeDirectory, 'generated', 'official-items.json');
  const officialItemsSupplementPath = path.join(knowledgeDirectory, 'supplemental', 'official-items.json');
  const officialItemsBase = fs.existsSync(officialItemsPath) ? readJson(officialItemsPath) : null;
  const officialItemsSupplement = fs.existsSync(officialItemsSupplementPath) ? readJson(officialItemsSupplementPath) : [];
  const fishSupplementPath = path.join(knowledgeDirectory, 'supplemental', 'fish-items.json');
  const fishSupplement = fs.existsSync(fishSupplementPath) ? readJson(fishSupplementPath) : [];
  const officialItems = officialItemsBase ? deepFreeze({
    ...officialItemsBase,
    items: [...(officialItemsBase.items || []), ...officialItemsSupplement, ...fishSupplement],
    counts: { ...(officialItemsBase.counts || {}), supplemental: officialItemsSupplement.length, fishSupplemental: fishSupplement.length }
  }) : null;
  const officialWeaponsPath = path.join(knowledgeDirectory, 'generated', 'official-weapons.json');
  const officialWeapons = fs.existsSync(officialWeaponsPath) ? deepFreeze(readJson(officialWeaponsPath)) : null;
  const officialAbilitiesPath = path.join(knowledgeDirectory, 'generated', 'official-abilities.json');
  const officialAbilities = fs.existsSync(officialAbilitiesPath) ? deepFreeze(readJson(officialAbilitiesPath)) : { schemaVersion: 1, abilities: [] };
  const officialItemSourcesPath = path.join(root, 'generated', 'official-item-sources.json');
  const officialItemSources = fs.existsSync(officialItemSourcesPath) ? deepFreeze(readJson(officialItemSourcesPath)) : null;
  const aliasesPath = path.join(knowledgeDirectory, 'facts', 'aliases.json');
  const aliases = fs.existsSync(aliasesPath) ? readJson(aliasesPath) : { frames: {}, terms: {}, normalization: {} };
  const acquisitionVariantFamiliesPath = path.join(knowledgeDirectory, 'families', 'acquisition-variants.json');
  const acquisitionVariantFamilies = fs.existsSync(acquisitionVariantFamiliesPath) ? deepFreeze(readJson(acquisitionVariantFamiliesPath)) : { schemaVersion: 1, families: [] };
  const frameDirectory = path.join(knowledgeDirectory, 'acquisition', 'warframe');
  const frameCategoriesPath = path.join(frameDirectory, 'categories.json');
  const frameCategories = fs.existsSync(frameCategoriesPath) ? deepFreeze(readJson(frameCategoriesPath)) : null;
  const frameMethods = deepFreeze(readObjectDirectory(path.join(frameDirectory, 'method')).filter(item => item.kind === 'frame-acquisition-method'));
  const modMethods = deepFreeze(readObjectDirectory(path.join(knowledgeDirectory, 'acquisition', 'mod', 'method')).filter(item => item.kind === 'mod-acquisition-method'));
  const arcaneDirectory = path.join(knowledgeDirectory, 'acquisition', 'arcane');
  const arcaneCatalogPath = path.join(arcaneDirectory, 'catalog.json');
  const arcaneCatalog = fs.existsSync(arcaneCatalogPath) ? deepFreeze(readJson(arcaneCatalogPath)) : null;
  const arcaneMethods = deepFreeze(readObjectDirectory(path.join(arcaneDirectory, 'method')).filter(item => item.kind === 'arcane-acquisition-method'));
  const arcanes = deepFreeze(readObjectDirectory(arcaneDirectory).filter(item => item.kind === 'knowledge' && item.subject?.category === 'arcane').filter(keep));
  const weaponDirectory = path.join(knowledgeDirectory, 'acquisition', 'weapons');
  const weaponCategoriesPath = path.join(weaponDirectory, 'categories.json');
  const weaponCatalog = fs.existsSync(weaponCategoriesPath) ? deepFreeze(readJson(weaponCategoriesPath)) : null;
  const weapons = deepFreeze(readObjectDirectory(weaponDirectory).filter(item => item.kind === 'knowledge' && item.subject?.category === 'weapon'));
  const consumableDirectory = path.join(knowledgeDirectory, 'acquisition', 'consumables');
  const consumableCategoriesPath = path.join(consumableDirectory, 'categories.json');
  const consumableCatalog = fs.existsSync(consumableCategoriesPath) ? deepFreeze(readJson(consumableCategoriesPath)) : null;
  const consumables = deepFreeze(readObjectDirectory(consumableDirectory).filter(item => item.kind === 'knowledge' && item.subject?.category === 'consumable'));
  const { loadEntityRegistries } = require('./entities');
  const registries = loadEntityRegistries(root);
  return { facts, knowledge, categories, officialCatalog, officialItems, officialWeapons, officialAbilities, officialItemSources, aliases, acquisitionVariantFamilies, frameCategories, frameMethods, modMethods, arcaneCatalog, arcaneMethods, arcanes, weaponCatalog, weapons, consumableCatalog, consumables, ...registries };
}

module.exports = { loadData, readJson, deepFreeze, readEntryDirectory, readObjectDirectory, readCategoryDirectory };
