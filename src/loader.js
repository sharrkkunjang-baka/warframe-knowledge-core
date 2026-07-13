'use strict';

const fs = require('fs');
const path = require('path');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readEntryDirectory(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .flatMap(name => {
      const value = readJson(path.join(dir, name));
      return Array.isArray(value) ? value : [];
    });
}

function loadData(root = path.join(__dirname, '..'), options = {}) {
  const approvedOnly = options.approvedOnly !== false;
  const keep = entry => !approvedOnly || entry.reviewStatus === 'approved';
  const facts = readEntryDirectory(path.join(root, 'facts')).filter(keep);
  const knowledge = readEntryDirectory(path.join(root, 'knowledge')).filter(keep);
  const aliasesPath = path.join(root, 'facts', 'aliases.json');
  const aliases = fs.existsSync(aliasesPath) ? readJson(aliasesPath) : { frames: {}, terms: {}, normalization: {} };
  return { facts, knowledge, aliases };
}

module.exports = { loadData, readEntryDirectory };
