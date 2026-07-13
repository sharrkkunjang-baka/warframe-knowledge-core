'use strict';

const fs = require('fs');
const path = require('path');
const { readEntryDirectory, readCategoryDirectory } = require('../src/loader');
const { buildOfficialCatalog, serialize } = require('./sync-official-mods');

const root = path.join(__dirname, '..');
const entries = [...readEntryDirectory(path.join(root, 'facts')), ...readEntryDirectory(path.join(root, 'knowledge'))];
const categories = readCategoryDirectory(path.join(root, 'categories'));
const officialPath = path.join(root, 'categories', 'official.json');
const officialCatalog = fs.existsSync(officialPath) ? JSON.parse(fs.readFileSync(officialPath, 'utf8')) : null;
const required = ['id', 'title', 'sources', 'gameVersion', 'updatedAt', 'reviewStatus', 'reviewedBy'];
const ids = new Set();
const errors = [];
const secretPatterns = [/sk-[A-Za-z0-9_-]{16,}/, /Bearer\s+[A-Za-z0-9._-]{16,}/i, /warframe_whisper_secret/i, /master_qq/i, /127\.0\.0\.1:1080[89]/];
const baseCategoryIds = new Set(['frame', 'weapon', 'mod', 'resource', 'companion', 'other']);
const categoryIds = new Set();
const categoryNames = new Map();
const gameplayAcquisitionQueries = new Map();
const acquisitionUniqueNames = new Map();
const invalidUserTextPattern = /<[^>]+>|\\n/;

for (const category of categories) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(category.id || '')) errors.push(`${category.id || '<unknown category>'}: 分类 id 格式错误`);
  if (baseCategoryIds.has(category.id) || categoryIds.has(category.id)) errors.push(`${category.id}: 分类 id 重复`); else categoryIds.add(category.id);
}
for (const category of categories) {
  for (const key of ['canonical', 'displayName', 'aliases', 'parent', 'description', 'sources', 'updatedAt']) if (!(key in category)) errors.push(`${category.id || '<unknown category>'}: 分类缺少 ${key}`);
  if (!Array.isArray(category.aliases) || new Set(category.aliases).size !== category.aliases.length) errors.push(`${category.id}: 分类 aliases 必须是唯一数组`);
  for (const name of [category.id, category.canonical, category.displayName, ...(category.aliases || [])]) {
    const key = String(name).normalize('NFKC').trim().toLowerCase();
    const owner = categoryNames.get(key);
    if (owner && owner !== category.id) errors.push(`分类名称冲突 ${name}: ${owner}, ${category.id}`); else categoryNames.set(key, category.id);
  }
  if (!baseCategoryIds.has(category.parent) && !categoryIds.has(category.parent)) errors.push(`${category.id}: 父分类不存在 ${category.parent}`);
  if (category.modDescription !== undefined && (typeof category.modDescription !== 'string' || !category.modDescription.includes('{name}'))) errors.push(`${category.id}: modDescription 必须是包含 {name} 的字符串`);
  if (!Array.isArray(category.sources) || !category.sources.length) errors.push(`${category.id}: 分类至少需要一个来源`);
  for (const source of category.sources || []) {
    try { new URL(source.url); } catch (_) { errors.push(`${category.id}: 分类来源 URL 无效`); }
  }
}

for (const entry of entries) {
  for (const key of required) if (!(key in entry)) errors.push(`${entry.id || entry.title || '<unknown>'}: 缺少 ${key}`);
  if (!/^[a-z0-9][a-z0-9._-]+$/.test(entry.id || '')) errors.push(`${entry.id}: id 格式错误`);
  if (ids.has(entry.id)) errors.push(`${entry.id}: id 重复`); else ids.add(entry.id);
  if (entry.module !== 'acquisition' && !Array.isArray(entry.aliases)) errors.push(`${entry.id}: 非刷取对象必须提供 aliases`);
  if (entry.module !== 'acquisition' && !entry.content) errors.push(`${entry.id}: 非刷取对象必须提供 content`);
  if (entry.aliases !== undefined && (!Array.isArray(entry.aliases) || new Set(entry.aliases).size !== entry.aliases.length)) errors.push(`${entry.id}: aliases 必须是唯一数组`);
  if (!Array.isArray(entry.sources) || !entry.sources.length) errors.push(`${entry.id}: 至少需要一个来源`);
  for (const source of entry.sources || []) {
    try { new URL(source.url); } catch (_) { errors.push(`${entry.id}: 来源 URL 无效`); }
  }
  if (entry.reviewStatus === 'approved' && (!Array.isArray(entry.reviewedBy) || !entry.reviewedBy.length)) errors.push(`${entry.id}: approved 条目必须有人审核`);
  if (entry.module === 'acquisition') {
    if (entry.kind !== 'knowledge') errors.push(`${entry.id}: acquisition 必须属于 knowledge`);
    if (!entry.subject?.canonical || !entry.subject?.displayName || !entry.subject?.category) errors.push(`${entry.id}: acquisition 缺少完整 subject`);
    if (entry.subject?.category && !baseCategoryIds.has(entry.subject.category)) errors.push(`${entry.id}: 基础分类无效 ${entry.subject.category}`);
    if (entry.subject?.categoryRefs !== undefined && (!Array.isArray(entry.subject.categoryRefs) || new Set(entry.subject.categoryRefs).size !== entry.subject.categoryRefs.length)) errors.push(`${entry.id}: subject.categoryRefs 必须是唯一数组`);
    const officialUniqueName = entry.officialUniqueName || entry.subject?.officialUniqueName;
    if (officialUniqueName) {
      const owner = acquisitionUniqueNames.get(officialUniqueName);
      if (owner && owner !== entry.id) errors.push(`官方 uniqueName 冲突 ${officialUniqueName}: ${owner}, ${entry.id}`); else acquisitionUniqueNames.set(officialUniqueName, entry.id);
    }
    const categoryReachesBase = ref => {
      const visited = new Set();
      let current = categories.find(item => item.id === ref);
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (current.parent === entry.subject.category) return true;
        current = categories.find(item => item.id === current.parent);
      }
      return false;
    };
    for (const ref of entry.subject?.categoryRefs || []) {
      if (!categoryIds.has(ref)) errors.push(`${entry.id}: 引用了不存在的细分类 ${ref}`);
      else if (!categoryReachesBase(ref)) errors.push(`${entry.id}: 细分类 ${ref} 的祖先链未归属基础分类 ${entry.subject.category}`);
    }
    if (entry.subject?.category === 'mod') {
      if (!Number.isInteger(entry.maxRank) || !Array.isArray(entry.effects) || !entry.effects.length) errors.push(`${entry.id}: Mod 条目缺少 maxRank/effects`);
      for (const effect of entry.effects || []) {
        if (!effect.stat || !effect.displayName || typeof effect.value !== 'number' || typeof effect.unit !== 'string') errors.push(`${entry.id}: effects 字段格式错误`);
        if (invalidUserTextPattern.test(effect.displayName || '')) errors.push(`${entry.id}: effects.displayName 含未清理的标记或换行转义`);
      }
      if (entry.effectDetails !== undefined && (!Array.isArray(entry.effectDetails) || entry.effectDetails.some(detail => typeof detail !== 'string' || !detail.trim()))) errors.push(`${entry.id}: effectDetails 必须是非空字符串数组`);
      if (entry.effectDetails?.some(detail => invalidUserTextPattern.test(detail))) errors.push(`${entry.id}: effectDetails 含未清理的标记或换行转义`);
    }
    if (entry.rewardTier !== undefined && !['A', 'B', 'C'].includes(entry.rewardTier)) errors.push(`${entry.id}: rewardTier 必须是 A、B 或 C`);
    if (entry.subject?.categoryRefs?.includes('nightmaremod') && !['A', 'B', 'C'].includes(entry.rewardTier)) errors.push(`${entry.id}: 噩梦 Mod 必须提供 rewardTier`);
    const primaryCategory = categories.find(category => category.id === entry.subject?.categoryRefs?.[0]);
    if (!entry.summary && !entry.content && !primaryCategory?.modDescription) errors.push(`${entry.id}: acquisition 缺少自身描述，主分类也没有 modDescription`);
    if (primaryCategory?.modDescription && !primaryCategory.modDescription.includes('{name}')) errors.push(`${primaryCategory.id}: modDescription 必须包含 {name} 变量`);
    if (!Array.isArray(entry.prerequisites) || !Array.isArray(entry.methodRefs) || !entry.methodRefs.length) errors.push(`${entry.id}: acquisition 缺少 prerequisites/methodRefs`);
  }
  if (entry.module === 'gameplay') {
    if (entry.kind !== 'knowledge') errors.push(`${entry.id}: gameplay 必须属于 knowledge`);
    if (!Array.isArray(entry.aliases) || !entry.aliases.length || !entry.summary || !Array.isArray(entry.steps) || !Array.isArray(entry.notes)) errors.push(`${entry.id}: gameplay 缺少 aliases/summary/steps/notes`);
    for (const [tier, group] of Object.entries(entry.rewardGroups || {})) {
      if (!['A', 'B', 'C'].includes(tier) || !Array.isArray(group.planets) || !group.planets.length) errors.push(`${entry.id}: rewardGroups.${tier} 缺少有效星球列表`);
    }
    if (entry.acquisitionQuery !== undefined) {
      const query = String(entry.acquisitionQuery).normalize('NFKC').trim().toLowerCase();
      if (!query) errors.push(`${entry.id}: acquisitionQuery 不能为空`);
      const owner = gameplayAcquisitionQueries.get(query);
      if (owner && owner !== entry.id) errors.push(`玩法刷取入口冲突 ${entry.acquisitionQuery}: ${owner}, ${entry.id}`); else gameplayAcquisitionQueries.set(query, entry.id);
      if (!(entry.aliases || []).some(alias => String(alias).normalize('NFKC').trim().toLowerCase() === query)) errors.push(`${entry.id}: acquisitionQuery 必须同时存在于 aliases`);
    }
  }
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

const gameplayIds = new Set(entries.filter(entry => entry.module === 'gameplay').map(entry => entry.id));
const gameplayById = new Map(entries.filter(entry => entry.module === 'gameplay').map(entry => [entry.id, entry]));
for (const entry of entries.filter(entry => entry.module === 'acquisition')) {
  for (const ref of entry.methodRefs || []) if (!gameplayIds.has(ref)) errors.push(`${entry.id}: 引用了不存在的玩法 ${ref}`);
  const primaryCategory = categories.find(category => category.id === entry.subject?.categoryRefs?.[0]);
  if (primaryCategory?.modDescription?.includes('{acquisitionQuery}')) {
    const methods = (entry.methodRefs || []).map(ref => gameplayById.get(ref)).filter(Boolean);
    if (!entry.acquisitionQuery && !methods.some(method => method.acquisitionQuery || method.aliases?.length)) errors.push(`${entry.id}: 分类模板需要 acquisitionQuery，但条目及玩法均未提供`);
  }
}

if (!officialCatalog) {
  errors.push('categories/official.json: 官方 Mod 快照不存在');
} else {
  const officialMods = officialCatalog.mods || [];
  const officialCategories = officialCatalog.officialCategories || [];
  const officialModKeys = new Set();
  const officialCategoryKeys = new Set();
  const acquisitionIds = new Set(entries.filter(entry => entry.module === 'acquisition').map(entry => entry.id));

  if (officialCatalog.schemaVersion !== 1) errors.push('official.json: schemaVersion 必须为 1');
  if (officialMods.length !== 1733) errors.push(`official.json: 应包含 1733 个 Mod，实际 ${officialMods.length}`);
  if (officialCatalog.counts?.mods !== officialMods.length) errors.push('official.json: counts.mods 不一致');
  if (officialCatalog.counts?.officialCategories !== officialCategories.length) errors.push('official.json: counts.officialCategories 不一致');
  if (!officialCatalog.source?.version || !officialCatalog.source?.repository || !officialCatalog.generatedAt) errors.push('official.json: 缺少来源版本、来源链接或生成时间');

  for (const category of officialCategories) {
    if (!category.id || officialCategoryKeys.has(category.id)) errors.push(`official.json: 官方分类 id 重复 ${category.id}`);
    officialCategoryKeys.add(category.id);
    if (!['type', 'compatibility', 'trait'].includes(category.dimension)) errors.push(`${category.id}: 官方分类维度无效`);
    if (!['covered', 'missing'].includes(category.status)) errors.push(`${category.id}: 官方分类覆盖状态无效`);
    for (const id of category.localCategoryIds || []) if (!categoryIds.has(id)) errors.push(`${category.id}: 本地分类引用不存在 ${id}`);
    if ((category.status === 'covered') !== Boolean(category.localCategoryIds?.length)) errors.push(`${category.id}: 官方分类覆盖状态与引用不一致`);
  }

  for (const mod of officialMods) {
    if (!mod.uniqueName || officialModKeys.has(mod.uniqueName)) errors.push(`official.json: uniqueName 重复 ${mod.uniqueName}`);
    officialModKeys.add(mod.uniqueName);
    if (!mod.canonical || !mod.displayName) errors.push(`${mod.uniqueName}: 缺少英文名或显示名`);
    if (!['official-zh', 'missing-zh'].includes(mod.localizationStatus)) errors.push(`${mod.uniqueName}: 中文名可用状态无效`);
    if (mod.localizationStatus === 'official-zh' && mod.displayName === mod.canonical) errors.push(`${mod.uniqueName}: 标记有官方中文名但仍使用英文名`);
    if (!Number.isInteger(mod.maxRank) || !Array.isArray(mod.maxRankEffects) || !Array.isArray(mod.maxRankEffectsZh)) errors.push(`${mod.uniqueName}: 最高等级或满级效果格式错误`);
    for (const id of mod.officialCategoryIds || []) if (!officialCategoryKeys.has(id)) errors.push(`${mod.uniqueName}: 官方分类引用不存在 ${id}`);
    for (const id of mod.localEntryIds || []) if (!acquisitionIds.has(id)) errors.push(`${mod.uniqueName}: 本地刷取引用不存在 ${id}`);
    if ((mod.status === 'covered') !== Boolean(mod.localEntryIds?.length)) errors.push(`${mod.uniqueName}: Mod 覆盖状态与引用不一致`);
  }

  if (officialCatalog.counts?.coveredMods !== officialMods.filter(mod => mod.status === 'covered').length) errors.push('official.json: coveredMods 计数不一致');
  if (officialCatalog.counts?.missingMods !== officialMods.filter(mod => mod.status === 'missing').length) errors.push('official.json: missingMods 计数不一致');
  if (officialCatalog.counts?.coveredOfficialCategories !== officialCategories.filter(category => category.status === 'covered').length) errors.push('official.json: coveredOfficialCategories 计数不一致');
  if (officialCatalog.counts?.missingOfficialCategories !== officialCategories.filter(category => category.status === 'missing').length) errors.push('official.json: missingOfficialCategories 计数不一致');

  const regenerated = buildOfficialCatalog(officialCatalog.generatedAt);
  if (serialize(regenerated) !== serialize(officialCatalog)) errors.push('official.json: 与当前数据源或本地覆盖状态不一致，请运行 npm run sync:official');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`校验通过：${entries.length} 条词条，${ids.size} 个唯一 ID，${categories.length} 个细分类，${officialCatalog.mods.length} 个官方 Mod`);
