'use strict';

const fs = require('fs');
const path = require('path');
const { readEntryDirectory } = require('../src/loader');

const root = path.join(__dirname, '..');
const entries = [...readEntryDirectory(path.join(root, 'facts')), ...readEntryDirectory(path.join(root, 'knowledge'))];
const required = ['id', 'title', 'aliases', 'content', 'sources', 'gameVersion', 'updatedAt', 'reviewStatus', 'reviewedBy'];
const ids = new Set();
const errors = [];
const secretPatterns = [/sk-[A-Za-z0-9_-]{16,}/, /Bearer\s+[A-Za-z0-9._-]{16,}/i, /warframe_whisper_secret/i, /master_qq/i, /127\.0\.0\.1:1080[89]/];

for (const entry of entries) {
  for (const key of required) if (!(key in entry)) errors.push(`${entry.id || entry.title || '<unknown>'}: 缺少 ${key}`);
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(entry.id || '')) errors.push(`${entry.id}: id 格式错误`);
  if (ids.has(entry.id)) errors.push(`${entry.id}: id 重复`); else ids.add(entry.id);
  if (!Array.isArray(entry.aliases) || new Set(entry.aliases).size !== entry.aliases.length) errors.push(`${entry.id}: aliases 必须唯一`);
  if (!Array.isArray(entry.sources) || !entry.sources.length) errors.push(`${entry.id}: 至少需要一个来源`);
  for (const source of entry.sources || []) {
    try { new URL(source.url); } catch (_) { errors.push(`${entry.id}: 来源 URL 无效`); }
  }
  if (entry.reviewStatus === 'approved' && (!Array.isArray(entry.reviewedBy) || !entry.reviewedBy.length)) errors.push(`${entry.id}: approved 条目必须有人审核`);
  const serialized = JSON.stringify(entry);
  for (const pattern of secretPatterns) if (pattern.test(serialized)) errors.push(`${entry.id}: 疑似包含敏感信息 ${pattern}`);
}

const aliasOwners = new Map();
for (const entry of entries) for (const alias of [entry.title, ...(entry.aliases || [])]) {
  const key = alias.normalize('NFKC').trim().toLowerCase();
  const owners = aliasOwners.get(key) || new Set();
  owners.add(entry.id);
  aliasOwners.set(key, owners);
}
for (const [alias, owners] of aliasOwners) if (owners.size > 1) errors.push(`词条别名冲突 ${alias}: ${[...owners].join(', ')}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`校验通过：${entries.length} 条词条，${ids.size} 个唯一 ID`);
