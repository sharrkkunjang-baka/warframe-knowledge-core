'use strict';
const path = require('node:path');
const { loadData } = require('../src/loader');

function audit(root = path.resolve(__dirname, '..')) {
  const data = loadData(root, { approvedOnly: false });
  const entries = [...data.knowledge, ...(data.weapons || []), ...(data.arcanes || [])];
  const byId = new Map(entries.map(entry => [entry.officialUniqueName || entry.subject?.officialUniqueName, entry]).filter(([id]) => id));
  const failures = [], memberships = new Map();
  for (const family of data.acquisitionVariantFamilies?.families || []) {
    if (!family.id || !['mod', 'arcane', 'weapon'].includes(family.kind) || !Array.isArray(family.members) || family.members.length < 2) failures.push(`${family.id || 'unknown'}: 家族结构无效`);
    for (const member of family.members || []) {
      const entry = byId.get(member);
      if (!entry) failures.push(`${family.id}: 成员不存在 ${member}`);
      else if (entry.subject?.category !== family.kind) failures.push(`${family.id}: ${member} 类别为 ${entry.subject?.category}`);
      if (/SPSubMod/i.test(member)) failures.push(`${family.id}: 内部 SubMod 不得展示 ${member}`);
      const previous = memberships.get(member);
      if (previous && previous !== family.id) failures.push(`${member}: 同时属于 ${previous} / ${family.id}`);
      memberships.set(member, family.id);
    }
  }
  return { families: data.acquisitionVariantFamilies?.families?.length || 0, members: memberships.size, failures };
}
if (require.main === module) { const result = audit(); if (result.failures.length) { console.error(result.failures.join('\n')); process.exit(1); } console.log(`变种家族审计通过：${result.families} 个家族，${result.members} 个成员`); }
module.exports = { audit };
