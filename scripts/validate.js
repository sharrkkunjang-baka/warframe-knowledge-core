'use strict';

const fs = require('fs');
const path = require('path');
const { readEntryDirectory, readCategoryDirectory } = require('../src/loader');
const { buildOfficialCatalog, serialize } = require('./sync-official-mods');

const root = path.join(__dirname, '..');
const knowledgeRoot = path.join(root, 'knowledge');
const entries = readEntryDirectory(knowledgeRoot).filter(entry => entry.kind === 'fact' || entry.kind === 'knowledge');
const categories = readCategoryDirectory(path.join(knowledgeRoot, 'categories'));
const officialPath = path.join(knowledgeRoot, 'categories', 'official.json');
const officialCatalog = fs.existsSync(officialPath) ? JSON.parse(fs.readFileSync(officialPath, 'utf8')) : null;
const officialItemsPath = path.join(knowledgeRoot, 'generated', 'official-items.json');
const officialItemSourcesPath = path.join(root, 'generated', 'official-item-sources.json');
const officialWarframesPath = path.join(knowledgeRoot, 'generated', 'official-warframes.json');
const officialWarframes = fs.existsSync(officialWarframesPath) ? JSON.parse(fs.readFileSync(officialWarframesPath, 'utf8')) : null;
const officialItems = fs.existsSync(officialItemsPath) ? JSON.parse(fs.readFileSync(officialItemsPath, 'utf8')) : null;
const { readIndexedEntries } = require('../src/entities');
const entityDirectories = { locations: 'locations', currencies: 'curreicies', quests: 'quests', factions: 'factions', enemies: 'enemies', missionTypes: 'mission-types' };
const entities = Object.fromEntries(Object.entries(entityDirectories).map(([name, directory]) => [name, readIndexedEntries(root, directory)]));
const npcCategoriesPath = path.join(knowledgeRoot, 'npc', 'categories.json');
const npcCategories = fs.existsSync(npcCategoriesPath) ? JSON.parse(fs.readFileSync(npcCategoriesPath, 'utf8')) : null;
const required = ['id', 'title', 'sources', 'gameVersion', 'updatedAt', 'reviewStatus', 'reviewedBy'];
const ids = new Set();
const errors = [];
const secretPatterns = [/sk-[A-Za-z0-9_-]{16,}/, /Bearer\s+[A-Za-z0-9._-]{16,}/i, /warframe_whisper_secret/i, /master_qq/i, /127\.0\.0\.1:1080[89]/];
const baseCategoryIds = new Set(['frame', 'weapon', 'mod', 'resource', 'companion', 'arcane', 'other']);
const categoryIds = new Set();
const categoryNames = new Map();
const gameplayAcquisitionQueries = new Map();
const acquisitionUniqueNames = new Map();
const invalidUserTextPattern = /<[^>]+>|\\n/;
const frameRoot = path.join(knowledgeRoot, 'acquisition', 'warframe');
const resourceRoot = path.join(knowledgeRoot, 'acquisition', 'resource');
const resourceIndexPath = path.join(resourceRoot, 'categories.json');
const resourceIndex = fs.existsSync(resourceIndexPath) ? JSON.parse(fs.readFileSync(resourceIndexPath, 'utf8')) : null;
const resourceMethods = fs.existsSync(path.join(resourceRoot, 'method')) ? require('../src/loader').readObjectDirectory(path.join(resourceRoot, 'method')).filter(item => item.kind === 'resource-acquisition-method') : [];
const modMethods = require('../src/loader').readObjectDirectory(path.join(knowledgeRoot, 'acquisition', 'mod', 'method')).filter(item => item.kind === 'mod-acquisition-method');
const frameIndexPath = path.join(frameRoot, 'categories.json');
const frameIndex = fs.existsSync(frameIndexPath) ? JSON.parse(fs.readFileSync(frameIndexPath, 'utf8')) : null;
const frameMethods = fs.existsSync(path.join(frameRoot, 'method')) ? require('../src/loader').readObjectDirectory(path.join(frameRoot, 'method')).filter(item => item.kind === 'frame-acquisition-method') : [];
const BLUEPRINT_CATEGORIES_FOR_VALIDATION = new Set(['market', 'quest', 'dojo', 'bounty', 'vendor', 'relic', 'specific-mission', 'mixed-missions', 'assassination']);

for (const [name, directory] of Object.entries(entityDirectories)) {
  const indexPath = path.join(knowledgeRoot, directory, 'categories.json');
  if (!fs.existsSync(indexPath)) { errors.push(`${directory}/categories.json: 实体分类索引不存在`); continue; }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const variables = index.variables || [];
  if (index.count !== variables.length || index.count !== entities[name].length) errors.push(`${directory}/categories.json: count 与变量数量不一致`);
  if (new Set(variables.map(item => item.id)).size !== variables.length) errors.push(`${directory}/categories.json: 变量 ID 重复`);
  for (const item of variables) {
    const file = path.join(knowledgeRoot, directory, ...String(item.file || '').split('/'));
    if (!fs.existsSync(file)) errors.push(`${item.id}: 实体文件不存在 ${directory}/${item.file}`);
    const entry = entities[name].find(value => value.id === item.id);
    if (!entry || entry.canonical !== item.canonical || entry.category !== item.category) errors.push(`${item.id}: 实体索引与文件不一致`);
  }
}

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
  if (category.id === 'syndicatemod' && (typeof category.displayTemplate !== 'string' || !category.displayTemplate.includes('{equipmentPositionText}') || !category.displayTemplate.includes('{modTypeText}') || typeof category.modTypeText !== 'string' || !category.modTypeText.trim())) errors.push('syndicatemod: 必须由装备位置和 Mod 类型变量生成显示文本');
  if (category.defaultMethodRefs !== undefined && (!Array.isArray(category.defaultMethodRefs) || !category.defaultMethodRefs.length || new Set(category.defaultMethodRefs).size !== category.defaultMethodRefs.length)) errors.push(`${category.id}: defaultMethodRefs 必须是非空唯一数组`);
  if (!Array.isArray(category.sources) || !category.sources.length) errors.push(`${category.id}: 分类至少需要一个来源`);
  for (const source of category.sources || []) {
    try { new URL(source.url); } catch (_) { errors.push(`${category.id}: 分类来源 URL 无效`); }
  }
}

if (!frameIndex || frameIndex.count !== 116 || frameIndex.frames?.length !== 116) errors.push('warframe/categories.json: 必须包含 116 个公开战甲');
const frameRoutes = new Map();
for (const route of frameIndex?.frames || []) {
  if (frameRoutes.has(route.officialUniqueName)) errors.push(`warframe/categories.json: 重复战甲 ${route.officialUniqueName}`); else frameRoutes.set(route.officialUniqueName, route);
  if (!route.file || !fs.existsSync(path.join(frameRoot, route.file))) errors.push(`warframe/categories.json: 文件不存在 ${route.file}`);
  if (!/^frame-/.test(route.componentCategory || '')) errors.push(`warframe/categories.json: 主分类无效 ${route.canonical}`);
  if (route.blueprintCategory === 'unresolved') errors.push(`warframe/categories.json: 总图分类未解析 ${route.canonical}`);
  const expectedDir = String(route.componentCategory || '').replace(/^frame-/, '');
  if (route.file && !route.file.startsWith(`${expectedDir}/`)) errors.push(`warframe/categories.json: 路径与主分类不一致 ${route.canonical}`);
}
const methodKeys = new Set();
for (const method of frameMethods) {
  const key = `${method.scope}:${method.category}`;
  if (methodKeys.has(key)) errors.push(`warframe/method: 重复方法 ${key}`); else methodKeys.add(key);
  if (method.schemaVersion !== 1 || typeof method.template !== 'string' || !method.template.trim()) errors.push(`warframe/method: ${key} 缺少有效 template`);
  if (method.scope === 'components' && !/^frame-/.test(method.category || '')) errors.push(`warframe/method: 部件分类格式错误 ${method.category}`);
  if (method.scope === 'blueprint' && !BLUEPRINT_CATEGORIES_FOR_VALIDATION.has(method.category)) errors.push(`warframe/method: 总图分类无效 ${method.category}`);
  for (const [name, value] of Object.entries(method)) {
    if ((name === 'template' || name.endsWith('Template')) && (typeof value !== 'string' || !value.trim())) errors.push(`warframe/method: ${key}.${name} 必须是非空字符串`);
  }
}
for (const route of frameIndex?.frames || []) {
  if (!methodKeys.has(`components:${route.componentCategory}`)) errors.push(`warframe/categories.json: 缺少部件 method ${route.componentCategory}`);
  if (route.blueprintCategory && !methodKeys.has(`blueprint:${route.blueprintCategory}`)) errors.push(`warframe/categories.json: 缺少总图 method ${route.blueprintCategory}`);
}

const resourceMethodKeys = new Set(resourceMethods.map(method => method.category));
if (!resourceIndex || resourceIndex.count !== resourceIndex.resources?.length) errors.push('resource/categories.json: count 与资源数量不一致');
for (const method of resourceMethods) {
  if (!/^resource-/.test(method.category || '') || typeof method.template !== 'string' || !method.template.trim()) errors.push(`resource/method: 无效方法 ${method.category}`);
  for (const [name, value] of Object.entries(method)) if ((name === 'template' || name.endsWith('Template')) && (typeof value !== 'string' || !value.trim())) errors.push(`resource/method: ${method.category}.${name} 必须是非空字符串`);
}
for (const method of modMethods) {
  if (method.schemaVersion !== 1 || !method.category || typeof method.headerTemplate !== 'string' || typeof method.sourceTemplate !== 'string' || typeof method.sourcesHeader !== 'string') errors.push(`mod/method: 无效方法 ${method.category || '<unknown>'}`);
}
const modMethodKeys = new Set(modMethods.map(method => method.category));
const factionIds = new Set(entities.factions.map(faction => faction.id));

for (const item of resourceIndex?.resources || []) {
  if (!resourceMethodKeys.has(item.category)) errors.push(`${item.canonical}: 缺少资源 method ${item.category}`);
  if (!fs.existsSync(path.join(resourceRoot, item.file))) errors.push(`${item.canonical}: 资源文件不存在 ${item.file}`);
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
    for (const method of entry.modAcquisition?.generated?.wiki?.methods || []) {
      if (method.type === 'syndicate-exchange') {
        if (!modMethodKeys.has(method.type)) errors.push(`${entry.id}: 缺少 Mod method ${method.type}`);
        if (!factionIds.has(method.factionId)) errors.push(`${entry.id}: 集团变量不存在 ${method.factionId}`);
      }
    }
    if (entry.kind !== 'knowledge') errors.push(`${entry.id}: acquisition 必须属于 knowledge`);
    if (!entry.subject?.canonical || !entry.subject?.displayName || !entry.subject?.category) errors.push(`${entry.id}: acquisition 缺少完整 subject`);
    if (entry.subject?.category && !baseCategoryIds.has(entry.subject.category)) errors.push(`${entry.id}: 基础分类无效 ${entry.subject.category}`);
    if (entry.subject?.categoryRefs !== undefined && (!Array.isArray(entry.subject.categoryRefs) || new Set(entry.subject.categoryRefs).size !== entry.subject.categoryRefs.length)) errors.push(`${entry.id}: subject.categoryRefs 必须是唯一数组`);
    const officialUniqueName = entry.officialUniqueName || entry.subject?.officialUniqueName;
    if (entry.subject?.category === 'frame' && entry.id?.startsWith('knowledge.acquisition.warframe.')) {
      if (!entry.frameAcquisition?.generated || !entry.frameAcquisition?.manual) errors.push(`${entry.id}: 战甲必须分离 frameAcquisition.generated/manual`);
      if (entry.subject?.categoryRefs?.length !== 1) errors.push(`${entry.id}: 战甲必须且只能有一个获取分类`);
      for (const key of ['sources', 'note', 'specialFrame', 'costs', 'dependencies']) if (entry.frameAcquisition?.[key] !== undefined) errors.push(`${entry.id}: 人工字段 ${key} 必须位于 frameAcquisition.manual`);
      if (entry.frameAcquisition?.generated?.officialUniqueName !== officialUniqueName) errors.push(`${entry.id}: generated.officialUniqueName 与 subject 不一致`);
      const route = frameRoutes.get(officialUniqueName);
      if (!route) errors.push(`${entry.id}: categories.json 缺少路由`);
      else {
        if (route.componentCategory !== entry.subject.categoryRefs[0]) errors.push(`${entry.id}: 主分类与 categories.json 不一致`);
        if (JSON.stringify(entry.frameAcquisition?.generated?.routing?.blueprintCategory ?? null) !== JSON.stringify(route.blueprintCategory ?? null)) errors.push(`${entry.id}: 总图分类与 categories.json 不一致`);
        if (route.componentCategory === 'frame-specific-mission' && !entry.frameAcquisition?.manual?.acquisitionText && !entry.frameAcquisition?.generated?.routing?.componentVariables?.missionNodeId && entry.frameAcquisition?.generated?.routing?.require?.type !== 'currency') errors.push(`${entry.id}: 特定任务战甲必须提供结构化任务节点、货币路由或独立获取文本`);
      }
      const routing = entry.frameAcquisition?.generated?.routing || {};
      const variables = routing.componentVariables || {};
      const requirement = routing.require;
      if (!requirement || !['none', 'standing', 'currency'].includes(requirement.type)) errors.push(`${entry.id}: require.type 必须是 none、standing 或 currency`);
      if (requirement?.type === 'currency' && typeof requirement.isBuffuseless !== 'boolean') errors.push(`${entry.id}: currency require.isBuffuseless 必须是布尔值`);
      if (requirement?.usage !== undefined && !['exchange', 'crafting'].includes(requirement.usage)) errors.push(`${entry.id}: currency require.usage 只能是 exchange 或 crafting`);
      if (requirement?.type === 'currency' && (!requirement.locationId || !entities.locations.some(item => item.id === requirement.locationId))) errors.push(`${entry.id}: currency require 必须提供有效 locationId`);
      if (requirement?.type === 'currency' && (!Array.isArray(requirement.currency) || !requirement.currency.length)) errors.push(`${entry.id}: currency require 必须提供 currency 子选项`);
      for (const currencyRequirement of requirement?.currency || []) {
        const currencyId = currencyRequirement?.currencyId;
        const currency = entities.currencies.find(item => item.id === currencyId);
        if (!currency) errors.push(`${entry.id}: currency require 引用不存在的货币 ${currencyId}`);
        else if (!currency.acquisitionDependency) errors.push(`${entry.id}: 货币缺少获取方式 ${currencyId}`);
        if (!Number.isFinite(currencyRequirement?.amount)) errors.push(`${entry.id}: currency require 缺少全套数量 ${currencyId}`);
      }
      if (requirement?.type !== 'currency' && Object.hasOwn(requirement || {}, 'isBuffuseless')) errors.push(`${entry.id}: isBuffuseless 只能作为 currency require 的子选项`);
      if (requirement?.type === 'standing' && (!requirement.npcId || !Number.isInteger(requirement.rank))) errors.push(`${entry.id}: standing require 必须提供 npcId 和整数 rank`);
      if (requirement?.npcId) {
        const npc = npcCategories?.npcs?.find(item => item.id === requirement.npcId);
        if (!npc) errors.push(`${entry.id}: require 引用不存在的 NPC ${requirement.npcId}`);
        else if (!npc.locationId || !entities.locations.some(item => item.id === npc.locationId)) errors.push(`${entry.id}: require NPC 缺少有效 locationId ${requirement.npcId}`);
      }
      const sourceTextForbidden = !entry.frameAcquisition?.generated?.isPrime && ['frame-mixed-missions', 'frame-specific-mission', 'frame-quest', 'frame-bounty', 'frame-assassination', 'frame-vendor'].includes(route?.componentCategory);
      if (entry.reviewStatus === 'approved' && sourceTextForbidden && (Object.hasOwn(variables, 'sourceText') || Object.hasOwn(routing.blueprintVariables || {}, 'sourceText'))) errors.push(`${entry.id}: approved 战甲路由不得以 sourceText 生成用户文案`);
      const variableSources = [...(variables.sources || []), routing.blueprintVariables || {}];
      for (const source of variableSources) {
        if (source.locationId && !entities.locations.some(item => item.id === source.locationId)) errors.push(`${entry.id}: 路由引用不存在的地点 ${source.locationId}`);
        if (source.missionNodeId && !entities.locations.some(item => item.id === source.missionNodeId)) errors.push(`${entry.id}: 路由引用不存在的任务节点 ${source.missionNodeId}`);
        if (source.sourceId && !entities.locations.some(item => item.id === source.sourceId)) errors.push(`${entry.id}: 路由引用不存在的特殊来源 ${source.sourceId}`);
        if (source.questId && !entities.quests.some(item => item.id === source.questId)) errors.push(`${entry.id}: 路由引用不存在的任务 ${source.questId}`);
      }
      const factionId = variables.factionId;
      if (factionId && !entities.factions.some(item => item.id === factionId)) errors.push(`${entry.id}: 路由引用不存在的阵营 ${factionId}`);
      if (variables.questId && !entities.quests.some(item => item.id === variables.questId)) errors.push(`${entry.id}: 路由引用不存在的任务 ${variables.questId}`);
      if (variables.enemyId && !entities.enemies.some(item => item.id === variables.enemyId)) errors.push(`${entry.id}: 路由引用不存在的敌人 ${variables.enemyId}`);
      if (variables.locationId && !entities.locations.some(item => item.id === variables.locationId)) errors.push(`${entry.id}: 路由引用不存在的地点 ${variables.locationId}`);
      if (variables.missionNodeId && !entities.locations.some(item => item.id === variables.missionNodeId)) errors.push(`${entry.id}: 路由引用不存在的任务节点 ${variables.missionNodeId}`);
      if (variables.exchange?.npcId && !npcCategories?.npcs?.some(item => item.id === variables.exchange.npcId)) errors.push(`${entry.id}: 路由引用不存在的 NPC ${variables.exchange.npcId}`);
      if (variables.exchange?.currencyId && !entities.currencies.some(item => item.id === variables.exchange.currencyId)) errors.push(`${entry.id}: 路由引用不存在的货币 ${variables.exchange.currencyId}`);
      if (variables.vendorId || JSON.stringify(variables).includes('vendor.')) errors.push(`${entry.id}: 禁止引用已删除 vendor 变量`);
      for (const dependency of entry.frameAcquisition?.manual?.dependencies || []) {
        if (dependency.currencyId) {
          const currency = entities.currencies.find(item => item.id === dependency.currencyId);
          if (!currency?.acquisitionDependency) errors.push(`${entry.id}: acquisition dependency 货币不存在或缺少刷法 ${dependency.currencyId}`);
        } else if (!dependency.canonical || !dependency.displayName || !dependency.acquisitionSummary || !Array.isArray(dependency.sourceRefs)) errors.push(`${entry.id}: acquisition dependency 字段不完整`);
      }
    }
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
    if (entry.subject?.category === 'arcane') {
      const generated = entry.arcaneAcquisition?.generated;
      const manual = entry.arcaneAcquisition?.manual;
      if (!generated || !manual) errors.push(`${entry.id}: 赋能必须分离 arcaneAcquisition.generated/manual`);
      if (!entry.officialUniqueName || entry.officialUniqueName !== entry.subject?.officialUniqueName || generated?.identity?.officialUniqueName !== entry.officialUniqueName) errors.push(`${entry.id}: 赋能 officialUniqueName 主键不一致`);
      if (!['warframe', 'primary', 'bow', 'shotgun', 'secondary', 'melee', 'operator', 'amp', 'kitgun', 'zaw', 'legacy'].includes(generated?.classification?.category)) errors.push(`${entry.id}: 赋能互斥分类无效`);
      if (!Array.isArray(entry.levelStats) || !Number.isInteger(entry.maxRank) || entry.maxRank !== Math.max(0, entry.levelStats.length - 1)) errors.push(`${entry.id}: 赋能等级数据或 maxRank 无效`);
      if (!Array.isArray(manual?.aliases) || !Array.isArray(manual?.methods) || !Array.isArray(manual?.methodRefs) || !Array.isArray(manual?.notes) || !manual?.overrides || !Array.isArray(manual?.reviewedBy)) errors.push(`${entry.id}: 赋能 manual 字段不完整`);
      for (const method of generated?.acquisition?.methods || []) if (method.type === 'vendor-or-syndicate-exchange' && (method.chancePercent !== undefined || method.probability !== undefined)) errors.push(`${entry.id}: 商店/集团兑换不得表示为概率掉落`);
    }
    if (entry.subject?.category === 'resource') {
      const generated = entry.resourceAcquisition?.generated;
      const manual = entry.resourceAcquisition?.manual;
      if (!generated || !manual) errors.push(`${entry.id}: 资源必须分离 resourceAcquisition.generated/manual`);
      if (!Array.isArray(manual?.tips) || !Array.isArray(manual?.tipKeywords) || !Array.isArray(manual?.reviewedBy)) errors.push(`${entry.id}: 资源人工层缺少 tips/tipKeywords/reviewedBy`);
      if (manual?.tips?.some(tip => typeof tip !== 'string' || !tip.trim()) || manual?.tipKeywords?.some(keyword => typeof keyword !== 'string' || !keyword.trim())) errors.push(`${entry.id}: 资源技巧必须是非空字符串`);
      if (entry.reviewStatus === 'approved' && generated?.routing?.category === 'resource-unresolved' && !manual?.routingOverride) errors.push(`${entry.id}: 未解析资源禁止 approved`);
      const category = manual?.routingOverride?.category || generated?.routing?.category;
      if (category && !resourceMethodKeys.has(category)) errors.push(`${entry.id}: 资源路由缺少 method ${category}`);
      for (const locationId of (manual?.routingOverride?.variables?.locationIds || generated?.routing?.variables?.locationIds || [])) if (!entities.locations.some(item => item.id === locationId)) errors.push(`${entry.id}: 资源路由引用不存在地点 ${locationId}`);
    }
    if (entry.subject?.category === 'mod') {
      const hasStructuredEffects = Array.isArray(entry.effects) && entry.effects.length > 0;
      const hasEffectDetails = Array.isArray(entry.effectDetails) && entry.effectDetails.length > 0;
      if (!Number.isInteger(entry.maxRank) || (!hasStructuredEffects && !hasEffectDetails)) errors.push(`${entry.id}: Mod 条目缺少 maxRank 或有效效果`);
      if (!entry.modAcquisition?.generated || !entry.modAcquisition?.manual) errors.push(`${entry.id}: Mod 必须分离 modAcquisition.generated/manual`);
      const manual = entry.modAcquisition?.manual;
      if (manual && (!Array.isArray(manual.methods) || !Array.isArray(manual.methodRefs) || !manual.overrides || !Array.isArray(manual.reviewedBy))) errors.push(`${entry.id}: modAcquisition.manual 字段不完整`);
      if (manual && JSON.stringify(manual.methodRefs || []) !== JSON.stringify(entry.methodRefs || [])) errors.push(`${entry.id}: manual.methodRefs 必须与兼容顶层 methodRefs 一致`);
      const wiki = entry.modAcquisition?.generated?.wiki;
      if (wiki && (!['complete', 'partial', 'unresolved'].includes(wiki.status) || !Array.isArray(wiki.methods) || !Array.isArray(wiki.evidence) || !wiki.mechanicsEvidence || !Array.isArray(wiki.unresolvedEntities))) errors.push(`${entry.id}: generated.wiki 字段不完整`);
      for (const method of wiki?.methods || []) {
        if (method.type === 'syndicate-exchange') {
          if (method.provenance?.source !== 'warframe-items' || !method.provenance?.canonical) errors.push(`${entry.id}: 集团 method 缺少官方 provenance`);
          continue;
        }
        if (!method.type || !method.provenance?.pageTitle || !method.provenance?.revisionId || !method.provenance?.section || !method.provenance?.excerpt) errors.push(`${entry.id}: Wiki method 缺少类型或 provenance`);
        if (method.reviewStatus !== 'draft') errors.push(`${entry.id}: 自动 Wiki method 禁止标记为非 draft`);
      }
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
    if (!Array.isArray(entry.prerequisites) || !Array.isArray(entry.methodRefs)) errors.push(`${entry.id}: acquisition 缺少 prerequisites/methodRefs 数组`);
    if (entry.subject?.category === 'mod' && (!Array.isArray(entry.tips) || entry.tips.some(tip => typeof tip !== 'string' || !tip.trim()))) errors.push(`${entry.id}: tips 必须是字符串数组，且每项不能为空`);
    if (entry.subject?.category === 'mod' && (!Array.isArray(entry.tipKeywords) || entry.tipKeywords.some(keyword => typeof keyword !== 'string' || !keyword.trim()))) errors.push(`${entry.id}: tipKeywords 必须是字符串数组，且每项不能为空`);
    if (entry.subject?.category === 'mod' && entry.tips?.some(tip => invalidUserTextPattern.test(tip))) errors.push(`${entry.id}: tips 含未清理的标记或换行转义`);
    if (entry.acquisitionStatus === 'stub' && (entry.reviewStatus !== 'draft' || entry.methodRefs?.length)) errors.push(`${entry.id}: stub 必须保持 draft 且刷法为空`);
    if (entry.subject?.category === 'mod' && entry.reviewStatus === 'approved' && entry.modAcquisition?.manual?.reviewStatus !== 'approved') errors.push(`${entry.id}: approved Mod 的 manual 层必须 approved`);
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
for (const category of categories) {
  for (const ref of category.defaultMethodRefs || []) if (!gameplayIds.has(ref)) errors.push(`${category.id}: 默认玩法不存在 ${ref}`);
}
for (const entry of entries.filter(entry => entry.module === 'acquisition')) {
  for (const ref of entry.methodRefs || []) if (!gameplayIds.has(ref)) errors.push(`${entry.id}: 引用了不存在的玩法 ${ref}`);
  const primaryCategory = categories.find(category => category.id === entry.subject?.categoryRefs?.[0]);
  if (entry.methodRefs?.length && primaryCategory?.modDescription?.includes('{acquisitionQuery}')) {
    const methods = (entry.methodRefs || []).map(ref => gameplayById.get(ref)).filter(Boolean);
    if (!entry.acquisitionQuery && !methods.some(method => method.acquisitionQuery || method.aliases?.length)) errors.push(`${entry.id}: 分类模板需要 acquisitionQuery，但条目及玩法均未提供`);
  }
}

if (!npcCategories) errors.push('knowledge/npc/categories.json: NPC 分类索引不存在');
else {
  const npcIds = new Set();
  if (npcCategories.count !== npcCategories.npcs?.length) errors.push('NPC categories.json: count 与 npcs 数量不一致');
  for (const npc of npcCategories.npcs || []) {
    if (!npc.id || npcIds.has(npc.id)) errors.push(`NPC categories.json: id 缺失或重复 ${npc.id}`); else npcIds.add(npc.id);
    const file = path.join(knowledgeRoot, 'npc', ...String(npc.file || '').split('/'));
    if (!fs.existsSync(file)) errors.push(`${npc.id}: NPC 文件不存在 ${npc.file}`);
    else {
      const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (entry.id !== npc.id || entry.canonical !== npc.canonical) errors.push(`${npc.id}: NPC 索引与文件不一致`);
      if (entry.localization?.status === 'unresolved' && entry.displayName !== '') errors.push(`${npc.id}: 未审核中文名必须为空字符串`);
      if (entry.locationId && !entities.locations.some(location => location.id === entry.locationId)) errors.push(`${npc.id}: locationId 不存在 ${entry.locationId}`);
      if (entry.factionId && !entities.factions.some(faction => faction.id === entry.factionId)) errors.push(`${npc.id}: factionId 不存在 ${entry.factionId}`);
    }
  }
}

if (!officialCatalog) {
  errors.push('knowledge/categories/official.json: 官方 Mod 快照不存在');
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
    if (!['covered', 'stub', 'missing'].includes(mod.status)) errors.push(`${mod.uniqueName}: Mod 覆盖状态无效`);
    if (mod.status === 'missing' && mod.localEntryIds?.length) errors.push(`${mod.uniqueName}: missing Mod 不应包含本地引用`);
    if (mod.status !== 'missing' && !mod.localEntryIds?.length) errors.push(`${mod.uniqueName}: 已收录 Mod 缺少本地引用`);
  }

  if (officialCatalog.counts?.coveredMods !== officialMods.filter(mod => mod.status === 'covered').length) errors.push('official.json: coveredMods 计数不一致');
  if (officialCatalog.counts?.stubMods !== officialMods.filter(mod => mod.status === 'stub').length) errors.push('official.json: stubMods 计数不一致');
  if (officialCatalog.counts?.missingMods !== officialMods.filter(mod => mod.status === 'missing').length) errors.push('official.json: missingMods 计数不一致');
  if (officialCatalog.counts?.coveredOfficialCategories !== officialCategories.filter(category => category.status === 'covered').length) errors.push('official.json: coveredOfficialCategories 计数不一致');
  if (officialCatalog.counts?.missingOfficialCategories !== officialCategories.filter(category => category.status === 'missing').length) errors.push('official.json: missingOfficialCategories 计数不一致');

  const regenerated = buildOfficialCatalog(officialCatalog.generatedAt);
  if (serialize(regenerated) !== serialize(officialCatalog)) errors.push('official.json: 与当前数据源或本地覆盖状态不一致，请运行 npm run sync:official');
}

if (!officialItems) errors.push('knowledge/generated/official-items.json: 统一物品目录不存在');
else {
  const uniqueNames = new Set();
  if (officialItems.schemaVersion !== 1 || officialItems.counts?.items !== officialItems.items?.length) errors.push('official-items.json: schemaVersion 或计数无效');
  if (officialItems.counts?.input !== officialItems.counts?.items + officialItems.counts?.excluded || !officialItems.counts?.excludedByReason) errors.push('official-items.json: 输入/纳入/排除计数无效');
  for (const item of officialItems.items || []) {
    if (!item.uniqueName?.startsWith('/Lotus/') || uniqueNames.has(item.uniqueName)) errors.push(`official-items.json: uniqueName 无效或重复 ${item.uniqueName}`);
    uniqueNames.add(item.uniqueName);
    if (!item.canonical || !item.displayName || !Array.isArray(item.semanticKinds) || !Array.isArray(item.drops) || !Array.isArray(item.recipes) || !Array.isArray(item.recipeVariants)) errors.push(`${item.uniqueName}: 统一物品字段不完整`);
  }
  const forbiddenCatalogObjects = [
    ['Captura/场景', item => item.semanticKinds?.includes('captura') || /Photobooth|PhotoBooth|\bScene\b/i.test(`${item.uniqueName} ${item.canonical}`)],
    ['显赫武器', item => /\/Powersuits\/.*(?:Weapon|Sword|Pistols|Claws|Melee|Bow)/i.test(item.uniqueName)],
    ['飞船或组件', item => /\/(?:Items\/Ships|Ship\/|Game\/CrewShip\/Ships)\//i.test(item.uniqueName)],
    ['Fusion/Reward Bundle', item => /FusionBundles?|RewardBundles?/i.test(`${item.uniqueName} ${item.canonical}`)],
    ['StoreItems 镜像', item => /\/StoreItems\//i.test(item.uniqueName)],
    ['内部占位名', item => /^(?:Arcane|Photoboothtile|Dangerroomtile|Shipfeatureitem|Plantitem|Dogtag|Tnwarchonitembase)$/i.test(item.canonical)]
  ];
  for (const [label, predicate] of forbiddenCatalogObjects) {
    const matches = officialItems.items.filter(predicate);
    if (matches.length) errors.push(`official-items.json: 不得包含${label}：${matches.slice(0, 3).map(item => item.uniqueName).join(', ')}`);
  }
  for (const canonical of ['Cipher', 'Elemental Vice', 'Amp Arcane Adapter', 'Melee Arcane Adapter', 'Orokin Reactor', 'Orokin Catalyst', 'Forma']) if (!officialItems.items.some(item => item.canonical === canonical)) errors.push(`official-items.json: 缺少目标道具 ${canonical}`);
  const cipher = officialItems.items.find(item => item.canonical === 'Cipher');
  const hundred = cipher?.recipeVariants?.find(variant => variant.id === 'cipher.100x');
  if (!hundred?.pendingWikiEvidence || hundred.recipeId !== null) errors.push('Cipher: 100x 变体必须保持待 Wiki 证据且不得伪造 recipeId');
  const { buildOfficialItems, serialize: serializeItems } = require('./sync-official-items');
  const sources = fs.existsSync(officialItemSourcesPath) ? JSON.parse(fs.readFileSync(officialItemSourcesPath, 'utf8')) : null;
  if (!sources?.policy?.semanticKindAllowlist || !sources?.counts?.excludedByReason || sources.counts.excluded !== officialItems.counts.excluded) errors.push('official-item-sources.json: 缺少 allowlist 或排除原因计数');
  const regenerated = buildOfficialItems(officialItems.generatedAt);
  if (serializeItems(regenerated.catalog) !== serializeItems(officialItems) || serializeItems(regenerated.sources) !== serializeItems(sources)) errors.push('官方物品目录与当前 warframe-items 不一致，请运行 npm run sync:items');
}

if (!officialWarframes) errors.push('knowledge/generated/official-warframes.json: 官方战甲快照不存在');
else {
  const excluded = new Set(['/Lotus/Powersuits/DemonFrame/DemonFrame']);
  const publicFrames = (officialWarframes.frames || []).filter(frame => !excluded.has(frame.uniqueName));
  const frameEntries = entries.filter(entry => entry.id?.startsWith('knowledge.acquisition.warframe.'));
  const covered = new Set(frameEntries.map(entry => entry.subject.officialUniqueName));
  for (const frame of publicFrames) if (!covered.has(frame.uniqueName)) errors.push(`公开战甲未覆盖：${frame.name} (${frame.uniqueName})`);
  for (const uniqueName of excluded) if (covered.has(uniqueName)) errors.push(`内部战甲不得公开：${uniqueName}`);
  if (frameEntries.some(entry => /Demon Frame|Inkblot/.test(entry.subject?.canonical || ''))) errors.push('内部占位名称进入公开知识');
  const follie = frameEntries.filter(entry => entry.subject?.officialUniqueName === '/Lotus/Powersuits/Inkblot/Inkblot');
  if (follie.length !== 1 || follie[0].subject.canonical !== 'Follie') errors.push('Inkblot 必须唯一映射为 Follie');
  const sirius = frameEntries.filter(entry => entry.subject?.officialUniqueName === '/Lotus/Powersuits/SiriusOrion/SiriusSuit');
  if (sirius.length !== 1 || sirius[0].subject.canonical !== 'Sirius & Orion') errors.push('Sirius Suit 必须唯一映射为 Sirius & Orion');
  if (sirius.length === 1) {
    const special = sirius[0].frameAcquisition?.manual?.specialFrame?.acquisition;
    for (const key of ['quest', 'drops', 'vendor']) if (typeof special?.[key] === 'string') errors.push(`Sirius & Orion 的 ${key} 不得使用整句硬编码`);
    if (!special?.questReward?.questId || !special?.dropReward?.locationIds?.length || !special?.vendorExchange?.npcId || !special?.vendorExchange?.currencyIds?.length) errors.push('Sirius & Orion 获取来源必须使用任务/地点/NPC/货币实体引用');
  }
}

const entityIds = new Set(Object.values(entities).flat().map(entity => entity.id));
for (const [name, values] of Object.entries(entities)) {
  const seen = new Set();
  for (const entity of values) {
    if (!entity.id || seen.has(entity.id) || !entity.canonical || typeof entity.displayName !== 'string' || !entity.kind || !Array.isArray(entity.aliases)) errors.push(`knowledge/${entityDirectories[name]}: 实体字段无效或 id 重复 ${entity.id}`);
    seen.add(entity.id);
    if (entity.parentId && !entityIds.has(entity.parentId)) errors.push(`${entity.id}: parentId 不存在 ${entity.parentId}`);
    if (entity.locationId && !entityIds.has(entity.locationId)) errors.push(`${entity.id}: locationId 不存在 ${entity.locationId}`);
    if (entity.missionTypeId && !entityIds.has(entity.missionTypeId)) errors.push(`${entity.id}: missionTypeId 不存在 ${entity.missionTypeId}`);
    if (entity.kind === 'mission-node' && (entity.missionTypeCanonical || entity.missionTypeDisplayName)) errors.push(`${entity.id}: 任务节点不得内嵌任务类型名称，必须使用 missionTypeId`);
  }
}
for (const currency of entities.currencies) {
  const dependency = currency.acquisitionDependency;
  if (dependency?.missionNodeId && !entities.locations.some(item => item.id === dependency.missionNodeId)) errors.push(`${currency.id}: 获取依赖引用不存在的节点 ${dependency.missionNodeId}`);
  if (dependency?.missionTypeId && !entities.missionTypes.some(item => item.id === dependency.missionTypeId)) errors.push(`${currency.id}: 获取依赖引用不存在的任务类型 ${dependency.missionTypeId}`);
}
if (entities.locations.find(item => item.canonical === 'Cetus')?.id === entities.locations.find(item => item.canonical === 'Plains of Eidolon')?.id) errors.push('地点实体必须区分 Cetus 与 Plains of Eidolon');
if (entities.locations.find(item => item.canonical === 'Fortuna')?.id === entities.locations.find(item => item.canonical === 'Orb Vallis')?.id) errors.push('地点实体必须区分 Fortuna 与 Orb Vallis');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`校验通过：${entries.length} 条词条，${ids.size} 个唯一 ID，${categories.length} 个细分类，${officialCatalog.mods.length} 个官方 Mod，${officialItems.items.length} 个统一物品`);
