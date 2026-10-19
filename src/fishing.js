'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeCambionCycleText } = require('./cambion-cycles');

const TABLE_ALIASES = Object.freeze(['钓鱼', '鱼类', '钓鱼表', '鱼类表', '捕鱼', '捕鱼表']);
const REGION_ORDER = Object.freeze(['plains-of-eidolon', 'orb-vallis', 'cambion-drift']);
const REGION_NAMES = Object.freeze({
  'plains-of-eidolon': '夜灵平野',
  'orb-vallis': '奥布山谷',
  'cambion-drift': '魔胎之境'
});
const REGION_ALIASES = Object.freeze({
  'plains-of-eidolon': ['希图斯', '地球', '地球平原', 'g', '夜灵平原', '夜灵平野'],
  'orb-vallis': ['福尔图娜', '金星', '金星平原', 'c', '奥布山谷'],
  'cambion-drift': ['火卫二', '魔胎之境', '殁世幽都']
});
const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[\s·・‧•_\-/]+/g, '');
function displayActivity(value) {
  const activity = normalizeCambionCycleText(value, { cambion: true }).trim();
  const compact = activity.replace(/\s+/gu, '').toLowerCase();
  if (['fass/vome', 'fass/vome主宰期'].includes(compact)) return '无限制';
  if (/^寒冷\/温暖(?:（偏好温暖）)?$/u.test(activity)) return '无限制';
  return activity || '任意';
}

function parseFishingCommand(text) {
  const raw = String(text || '').normalize('NFKC').trim().replace(/^[\\/。.．]\s*/u, '');
  if (TABLE_ALIASES.includes(raw)) return { kind: 'fishing-table', region: null };
  const alias = TABLE_ALIASES.find(value => raw === value || raw.startsWith(`${value} `));
  if (!alias) return null;
  let query = raw.slice(alias.length).trim();
  let region = null;
  for (const [id, aliases] of Object.entries(REGION_ALIASES)) {
    const matched = aliases.find(value => query === value || query.startsWith(`${value} `));
    if (matched) { region = id; query = query.slice(matched.length).trim(); break; }
  }
  return query ? { kind: 'fishing-query', query, region } : { kind: 'fishing-table', region };
}

function createFishingQueries(root = path.join(__dirname, '..')) {
  const items = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'supplemental', 'fish-items.json'), 'utf8'));
  const catalogFile = path.join(root, 'generated', 'resource-asset-catalog.json');
  const catalog = fs.existsSync(catalogFile) ? JSON.parse(fs.readFileSync(catalogFile, 'utf8')) : { entries: [] };
  const assets = new Map((catalog.entries || catalog.resources || []).map(entry => [entry.stableIdentity?.uniqueName, entry]));
  const fish = items.filter(item => item.kind === 'fish' && REGION_ORDER.includes(item.fishInfo?.openWorld?.value)).map(item => {
    const asset = assets.get(item.uniqueName) || {};
    return Object.freeze({
      stableId: item.uniqueName,
      canonical: item.canonical,
      displayName: item.displayName,
      aliases: item.aliases || [],
      region: item.fishInfo.openWorld.value,
      regionName: REGION_NAMES[item.fishInfo.openWorld.value],
      biome: item.fishInfo.biome?.displayName || item.fishInfo.biome?.value || '待补',
      activity: displayActivity(item.fishInfo.activity?.displayName || item.fishInfo.activity?.value),
      bait: item.fishInfo.bait ? { ...item.fishInfo.bait, displayName: normalizeCambionCycleText(item.fishInfo.bait.displayName, { cambion: item.fishInfo.openWorld.value === 'cambion-drift' }) } : null,
      baitImage: item.fishInfo.bait?.canonical ? (() => {
        const baitAsset = [...assets.values()].find(entry => normalize(entry.stableIdentity?.canonical) === normalize(item.fishInfo.bait.canonical));
        return { kind: 'resource', uniqueName: baitAsset?.stableIdentity?.uniqueName || null, canonical: item.fishInfo.bait.canonical, displayName: normalizeCambionCycleText(item.fishInfo.bait.displayName, { cambion: item.fishInfo.openWorld.value === 'cambion-drift' }), expectedMediaFilename: baitAsset?.expectedMediaFilename || null };
      })() : null,
      effectiveSpears: item.fishInfo.effectiveSpears || null,
      processingOutputs: item.fishInfo.processingOutputs || [],
      image: { kind: 'resource', uniqueName: item.uniqueName, canonical: item.canonical, displayName: item.displayName, expectedMediaFilename: asset.expectedMediaFilename || null }
    });
  });
  const materialIndex = new Map();
  for (const item of fish) for (const output of item.processingOutputs) {
    const key = normalize(output.displayName || output.canonical);
    const current = materialIndex.get(key) || { canonical: output.canonical, displayName: output.displayName, sources: [] };
    current.sources.push({ fish: item, quantities: output.quantities });
    materialIndex.set(key, current);
    materialIndex.set(normalize(output.canonical), current);
  }
  function table(regionId = null) {
    const regionIds = regionId ? [regionId] : REGION_ORDER;
    return {
      kind: 'fishing-table', title: regionId ? REGION_NAMES[regionId] : '鱼类表',
      regions: regionIds.map(id => ({ id, displayName: REGION_NAMES[id], groups: [...new Map(fish.filter(item => item.region === id).map(item => [item.activity, item.activity])).keys()].map(activity => ({ activity, displayName: activity, fish: fish.filter(item => item.region === id && item.activity === activity) })) })),
      footerLines: ['输入“钓鱼 鱼名”查看区域、时段、鱼饵与分解产物；输入“钓鱼 材料名”反查来源鱼。']
    };
  }
  function resolve(query) {
    const key = normalize(query);
    const exactFish = fish.find(item => [item.displayName, item.canonical, ...item.aliases].some(value => normalize(value) === key));
    if (exactFish) return { kind: 'fishing-fish-detail', title: exactFish.displayName, fish: exactFish };
    const material = materialIndex.get(key);
    if (material) {
      const asset = [...assets.values()].find(entry => normalize(entry.stableIdentity?.canonical) === normalize(material.canonical));
      return { kind: 'fishing-material-detail', title: material.displayName, material: { ...material, image: { kind: 'resource', uniqueName: asset?.stableIdentity?.uniqueName || null, canonical: material.canonical, displayName: material.displayName, expectedMediaFilename: asset?.expectedMediaFilename || null } } };
    }
    const fuzzyFish = fish.filter(item => [item.displayName, item.canonical, ...item.aliases].some(value => normalize(value).includes(key) || key.includes(normalize(value))));
    if (fuzzyFish.length === 1) return { kind: 'fishing-fish-detail', title: fuzzyFish[0].displayName, fish: fuzzyFish[0] };
    return { kind: 'fishing-not-found', title: '鱼类查询', query, suggestions: fuzzyFish.slice(0, 8).map(item => item.displayName) };
  }
  function query(text) {
    const parsed = parseFishingCommand(text);
    if (!parsed) return null;
    return parsed.kind === 'fishing-table' ? table(parsed.region) : resolve(parsed.query);
  }
  return Object.freeze({ fish, materialIndex, parseCommand: parseFishingCommand, table, resolve, query });
}

module.exports = { TABLE_ALIASES, REGION_ORDER, REGION_NAMES, REGION_ALIASES, parseFishingCommand, createFishingQueries };
