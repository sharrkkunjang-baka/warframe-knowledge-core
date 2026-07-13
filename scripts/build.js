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
const outputs = { 'facts.json': data.facts, 'knowledge.json': data.knowledge, 'aliases.json': data.aliases };
const files = {};
for (const [name, value] of Object.entries(outputs)) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(path.join(dist, name), text);
  files[name] = { bytes: Buffer.byteLength(text), sha256: crypto.createHash('sha256').update(text).digest('hex') };
}
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  counts: { facts: data.facts.length, knowledge: data.knowledge.length },
  files
};
fs.writeFileSync(path.join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`构建完成：${data.facts.length} 条事实，${data.knowledge.length} 条知识`);
