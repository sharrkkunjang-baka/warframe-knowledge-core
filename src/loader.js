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
  const facts = readEntryDirectory(path.join(root, 'facts')).filter(keep);
  const knowledge = readEntryDirectory(path.join(root, 'knowledge')).filter(keep);
  const categoriesDirectory = path.join(root, 'categories');
  const categories = readCategoryDirectory(categoriesDirectory);
  const officialPath = path.join(categoriesDirectory, 'official.json');
  const officialCatalog = fs.existsSync(officialPath) ? deepFreeze(readJson(officialPath)) : null;
  const aliasesPath = path.join(root, 'facts', 'aliases.json');
  const aliases = fs.existsSync(aliasesPath) ? readJson(aliasesPath) : { frames: {}, terms: {}, normalization: {} };
  return { facts, knowledge, categories, officialCatalog, aliases };
}

module.exports = { loadData, readEntryDirectory, readObjectDirectory, readCategoryDirectory };
