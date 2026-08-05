'use strict';

const fs = require('fs');
const path = require('path');
const { readObjectDirectory } = require('../src/loader');
const { build } = require('./sync-mission-type-gameplay');

const root = path.join(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'mission-types', 'categories.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'gameplay', 'mission-type-dispositions.json'), 'utf8'));
const manual = readObjectDirectory(path.join(root, 'knowledge', 'gameplay')).filter(item => item.module === 'gameplay');
const generated = readObjectDirectory(path.join(root, 'knowledge', 'gameplay-generated')).filter(item => item.module === 'gameplay');
const errors = [];
const allowed = new Set(['covered', 'generated', 'manual-required', 'variant-of', 'non-queryable-shell', 'reward-source-only', 'event-lifecycle', 'review-required']);
const missionIds = new Set(index.variables.map(item => item.id));
const gameplayById = new Map([...manual, ...generated].map(item => [item.id, item]));
const rowsById = new Map();

if (index.count !== 73 || index.variables.length !== 73) errors.push(`任务类型全集必须为 categories.json 的 73 项，实际 ${index.variables.length}`);
if (catalog.count !== catalog.entries?.length || catalog.count !== missionIds.size) errors.push('disposition count 与任务类型全集不一致');
for (const row of catalog.entries || []) {
  if (!missionIds.has(row.missionTypeId)) errors.push(`disposition 引用不存在任务类型 ${row.missionTypeId}`);
  if (rowsById.has(row.missionTypeId)) errors.push(`任务类型 disposition 重复 ${row.missionTypeId}`); else rowsById.set(row.missionTypeId, row);
  if (!allowed.has(row.disposition)) errors.push(`非法 disposition ${row.missionTypeId}: ${row.disposition}`);
  if (row.disposition === 'variant-of' && (!missionIds.has(row.variantOf) || row.variantOf === row.missionTypeId)) errors.push(`variant-of 目标无效 ${row.missionTypeId}`);
  if (row.disposition === 'covered') for (const id of row.primaryGameplayIds || []) if (!manual.some(item => item.id === id && item.missionTypeIds?.includes(row.missionTypeId))) errors.push(`${row.missionTypeId}: 主人工覆盖 ${id} 不存在或未反向绑定`);
  if (row.disposition === 'generated') {
    const entry = gameplayById.get(row.generatedGameplayId);
    if (!entry || entry.layer !== 'generated' || entry.reviewStatus !== 'draft' || entry.qualityStatus !== 'review-required') errors.push(`${row.missionTypeId}: generated 条目必须存在并保持 draft/review-required`);
  }
}
for (const id of missionIds) if (!rowsById.has(id)) errors.push(`任务类型漏项 ${id}`);
const primaryOwners = new Map();
for (const row of catalog.entries || []) for (const gameplayId of row.primaryGameplayIds || []) {
  const key = `${row.missionTypeId}:${gameplayId}`;
  if (primaryOwners.has(key)) errors.push(`重复主覆盖 ${key}`); else primaryOwners.set(key, true);
}
for (const entry of manual) {
  for (const id of entry.missionTypeIds || []) if (!missionIds.has(id)) errors.push(`${entry.id}: missionTypeIds 引用不存在 ${id}`);
  if (entry.missionTypeIds?.length && !entry.sources?.some(source => /^https:\/\/wiki\.warframe\.com\//.test(source.url) || /^https:\/\/.*warframe-public-export-plus\//.test(source.url))) errors.push(`${entry.id}: 任务玩法绑定缺少当前 Wiki 或 DE 证据`);
}
for (const entry of generated) {
  if (entry.reviewStatus === 'approved') errors.push(`${entry.id}: 自动生成条目不得直接 approved`);
  if (entry.steps?.length || entry.reviewedBy?.length) errors.push(`${entry.id}: 自动 draft 不得猜造机制或审核人`);
  if (!entry.sources?.every(source => !/fandom|wikia/i.test(source.url || ''))) errors.push(`${entry.id}: 禁止 Fandom/Wikia 来源`);
}
const approvedNameOwners = new Map();
for (const entry of manual.filter(item => item.reviewStatus === 'approved')) {
  for (const name of [entry.title, entry.acquisitionQuery, ...(entry.aliases || [])].filter(Boolean)) {
    const key = String(name).normalize('NFKC').trim().toLowerCase().replace(/[\s_\-·'’/]+/g, '');
    const owners = approvedNameOwners.get(key) || [];
    owners.push(entry.id);
    approvedNameOwners.set(key, owners);
  }
}
const nameCollisions = [...approvedNameOwners.entries()].filter(([, owners]) => new Set(owners).size > 1);
if (process.argv.includes('--strict-conflicts') && nameCollisions.length) for (const [name, owners] of nameCollisions) errors.push(`玩法名称冲突 ${name}: ${[...new Set(owners)].join(', ')}`);
if (JSON.stringify(build().dispositions) !== JSON.stringify(catalog)) errors.push('disposition/generated 规则漂移，请运行 npm run sync:mission-gameplay');
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ missionTypeCount: missionIds.size, manualCount: manual.length, generatedCount: generated.length, counts: catalog.counts, nameCollisions: nameCollisions.map(([name, owners]) => ({ name, gameplayIds: [...new Set(owners)] })), errors }, null, 2));
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
if (!process.argv.includes('--json')) console.log(`审计通过：${missionIds.size} 项零漏项；人工 ${manual.length}，自动 draft ${generated.length}；名称冲突报告 ${nameCollisions.length} 组；${Object.entries(catalog.counts).map(([k,v]) => `${k}=${v}`).join(', ')}`);
