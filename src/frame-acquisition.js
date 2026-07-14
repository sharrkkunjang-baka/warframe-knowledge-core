'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'));
const CORE_ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE_ROOT = path.join(CORE_ROOT, 'knowledge');
const GENERATED_KNOWLEDGE_ROOT = path.join(KNOWLEDGE_ROOT, 'generated');
const WARFRAMES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Warframes.json'));
const RELICS = require(path.join(ITEMS_ROOT, 'data', 'json', 'Relics.json'));
const I18N = require(path.join(ITEMS_ROOT, 'data', 'json', 'i18n.json'));
const ALIASES = require(path.join(KNOWLEDGE_ROOT, 'facts', 'aliases.json'));
const OFFICIAL_FRAMES = require(path.join(GENERATED_KNOWLEDGE_ROOT, 'official-warframes.json'));
const OFFICIAL_QUESTS = require(path.join(GENERATED_KNOWLEDGE_ROOT, 'official-quests.json'));
const OFFICIAL_PRIME_RELICS = require(path.join(GENERATED_KNOWLEDGE_ROOT, 'official-prime-relics.json'));
const OFFICIAL_FRAME_QUEST_SERIES = require(path.join(GENERATED_KNOWLEDGE_ROOT, 'official-frame-quest-series.json'));
const OFFICIAL_RAILJACK_NODES = require(path.join(GENERATED_KNOWLEDGE_ROOT, 'official-railjack-nodes.json'));
const { loadEntityRegistries } = require('./entities');
const ENTITY_REGISTRIES = loadEntityRegistries(CORE_ROOT);
const LOCATION_REGISTRY = ENTITY_REGISTRIES.locations;
const CURRENCY_REGISTRY = ENTITY_REGISTRIES.currencies;
const QUEST_REGISTRY = ENTITY_REGISTRIES.quests;
const FACTION_REGISTRY = ENTITY_REGISTRIES.factions;
const NPC_REGISTRY = ENTITY_REGISTRIES.npcs;
const ENEMY_REGISTRY = ENTITY_REGISTRIES.enemies;
const MISSION_TYPE_REGISTRY = ENTITY_REGISTRIES.missionTypes;

const RECIPES_URL = 'https://browse.wf/warframe-public-export-plus/ExportRecipes.json';
const REWARDS_URL = 'https://browse.wf/warframe-public-export-plus/ExportRewards.json';
const DEFAULT_CACHE = path.join(process.env.WF_EXPORT_CACHE_DIR || path.join(CORE_ROOT, 'cache'), 'warframe-export-recipes.json');
const DEFAULT_REWARDS_CACHE = path.join(process.env.WF_EXPORT_CACHE_DIR || path.join(CORE_ROOT, 'cache'), 'warframe-export-rewards.json');
const PARTS = ['Blueprint', 'Neuroptics', 'Chassis', 'Systems'];
const PART_ZH = { Blueprint: '总图', Neuroptics: '头', Chassis: '机体', Systems: '系统' };
const RAILJACK_NODE_ZH = Object.fromEntries(OFFICIAL_RAILJACK_NODES.nodes.flatMap(node => [[node.canonical, node.displayName], [node.regionCanonical, node.regionDisplayName]]));
const STABLE_LOCATION_ZH = {
  Earth: '地球', Venus: '金星', Mercury: '水星', Mars: '火星', Phobos: '火卫一',
  Ceres: '谷神星', Jupiter: '木星', Europa: '欧罗巴', Saturn: '土星', Uranus: '天王星',
  Neptune: '海王星', Pluto: '冥王星', Sedna: '赛德娜', Eris: '阋神星', Lua: '月球', Deimos: '火卫二',
  Assassination: '刺杀', Defense: '防御', Survival: '生存', Capture: '捕获', Rescue: '救援',
  Spy: '间谍', Disruption: '中断', Exterminate: '歼灭', Interception: '拦截', Excavation: '挖掘',
  'Cephalon Simaris': '中枢 Simaris', 'The New Strange': '新疑谜团', Junction: '接合点', Complete: '完成', Caches: '任务缓存',
  ...RAILJACK_NODE_ZH,
  ...Object.fromEntries(LOCATION_REGISTRY.values.map(location => [location.canonical, location.displayName]))
};

const FRAME_KNOWLEDGE_DIR = path.join(CORE_ROOT, 'knowledge', 'acquisition', 'warframe');
const FRAME_ROUTING_PATH = path.join(FRAME_KNOWLEDGE_DIR, 'categories.json');
const FRAME_ROUTING = fs.existsSync(FRAME_ROUTING_PATH) ? require(FRAME_ROUTING_PATH) : { frames: [] };
const { METHOD_TEMPLATES, applyTemplate } = require('./frame-acquisition-routing');
function readFrameKnowledge(dir = FRAME_KNOWLEDGE_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'method' ? [] : readFrameKnowledge(target);
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'categories.json') return [];
    const parsed = require(target);
    return Array.isArray(parsed) ? parsed : [];
  });
}
const FRAME_KNOWLEDGE = readFrameKnowledge().filter(entry => entry.reviewStatus === 'approved');
const FRAME_KNOWLEDGE_INDEX = new Map(FRAME_KNOWLEDGE.map(entry => [entry.subject.canonical, entry]));
const manualOf = entry => entry?.frameAcquisition?.manual || {};
const FRAME_SOURCE_OVERRIDES = Object.freeze(Object.fromEntries(FRAME_KNOWLEDGE.filter(entry => manualOf(entry).sources).map(entry => [entry.subject.canonical, manualOf(entry).sources])));
const FRAME_ACQUISITION_NOTES = Object.freeze(Object.fromEntries(FRAME_KNOWLEDGE.filter(entry => manualOf(entry).note).map(entry => [entry.subject.canonical, manualOf(entry).note])));
const FRAME_DEPENDENCIES = Object.freeze(Object.fromEntries(FRAME_KNOWLEDGE.filter(entry => manualOf(entry).dependencies?.length).map(entry => [entry.subject.canonical, manualOf(entry).dependencies])));
const CALIBAN_PRIME_DATA = manualOf(FRAME_KNOWLEDGE_INDEX.get('Caliban Prime')).specialFrame;
const SIRIUS_ORION_DATA = manualOf(FRAME_KNOWLEDGE_INDEX.get('Sirius & Orion')).specialFrame;
const CALIBAN_PRIME = Object.freeze({ ...CALIBAN_PRIME_DATA, components: PARTS.map(part => ({ part, name: part, drops: [] })) });
const SIRIUS_ORION = Object.freeze({ ...SIRIUS_ORION_DATA, components: PARTS.map(part => ({ part, drops: [{ ...SIRIUS_ORION_DATA.drop, type: `Sirius & Orion ${part} Blueprint` }] })) });
const QUEST_SOURCE_ZH = Object.freeze(OFFICIAL_QUESTS.byEnglish || {});
function localizeQuestName(name) {
  const raw = String(name || '').trim();
  const withoutQualifier = raw.replace(/\s*\(Quest\)$/i, '');
  return QUEST_SOURCE_ZH[raw] || QUEST_SOURCE_ZH[withoutQualifier] || translateLocation(withoutQualifier);
}

function normalize(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s_\-·'’]+/g, '');
}
function zhName(uniqueName, fallback) {
  if (/^(credits?|\/lotus\/types\/items\/credits)$/i.test(String(fallback)) || /credits?$/i.test(String(uniqueName))) return '现金';
  return I18N[uniqueName]?.zh?.name || fallback || String(uniqueName).split('/').pop();
}
const COMPONENT_ZH = new Map();
for (const frame of WARFRAMES) {
  const frameName = I18N[frame.uniqueName]?.zh?.name || frame.name;
  for (const component of frame.components || []) {
    const part = component.name === 'Neuroptics' ? '头' : component.name === 'Chassis' ? '机体' : component.name === 'Systems' ? '系统' : null;
    if (part && component.uniqueName) COMPONENT_ZH.set(component.uniqueName, `${frameName}${part}`);
  }
}

const PACKAGE_FRAME_NAMES = new Set(WARFRAMES.map(frame => frame.name));
const PUBLIC_FRAME_BY_UNIQUE_NAME = new Map(FRAME_KNOWLEDGE.map(entry => [entry.subject.officialUniqueName, entry]));
const GENERATED_WARFRAMES = (OFFICIAL_FRAMES.frames || [])
  .filter(frame => PUBLIC_FRAME_BY_UNIQUE_NAME.has(frame.uniqueName) && !PACKAGE_FRAME_NAMES.has(frame.name) && frame.name !== CALIBAN_PRIME.name)
  .map(frame => {
    const knowledge = PUBLIC_FRAME_BY_UNIQUE_NAME.get(frame.uniqueName);
    return { ...frame, name: knowledge.subject.canonical, zhName: knowledge.subject.displayName, type: 'Warframe', components: (frame.components || []).map(component => ({ ...component, name: component.part, drops: [] })) };
  });
const ALL_WARFRAMES = [...WARFRAMES.filter(frame => frame.name !== CALIBAN_PRIME.name), CALIBAN_PRIME, ...GENERATED_WARFRAMES];
const FRAME_INDEX = new Map();
const FRAME_ALIASES = [];
function addFrameAlias(key, frame) {
  const normalized = normalize(key);
  if (!normalized || !frame) return;
  if (!FRAME_INDEX.has(normalized)) FRAME_INDEX.set(normalized, frame);
  FRAME_ALIASES.push({ text: String(key), normalized, frame });
}
for (const frame of ALL_WARFRAMES) {
  addFrameAlias(frame.name, frame);
  addFrameAlias(frame.zhName || I18N[frame.uniqueName]?.zh?.name, frame);
}
for (const [baseName, names] of Object.entries(ALIASES.frames || {})) {
  const corrected = baseName === 'Sirus & Orion' ? SIRIUS_ORION : ALL_WARFRAMES.find(frame => frame.name === baseName);
  if (!corrected) continue;
  for (const alias of names || []) addFrameAlias(alias, corrected);
}
for (const base of ALL_WARFRAMES.filter(frame => !frame.isPrime && !frame.override)) {
  const prime = ALL_WARFRAMES.find(frame => frame.name === `${base.name} Prime`);
  if (!prime) continue;
  const baseAliases = [...FRAME_ALIASES].filter(alias => alias.frame === base).map(alias => alias.text);
  for (const alias of baseAliases) {
    addFrameAlias(`${alias} Prime`, prime);
    addFrameAlias(`${alias} P`, prime);
    addFrameAlias(`${alias} P版`, prime);
  }
}
addFrameAlias('Sirius & Orion', SIRIUS_ORION);
addFrameAlias('Sirus & Orion', SIRIUS_ORION);
addFrameAlias('龙', WARFRAMES.find(frame => frame.name === 'Chroma'));
FRAME_INDEX.delete(normalize('色彩'));
for (let i = FRAME_ALIASES.length - 1; i >= 0; i--) if (normalize(FRAME_ALIASES[i].text) === normalize('色彩')) FRAME_ALIASES.splice(i, 1);
FRAME_ALIASES.sort((a, b) => b.text.length - a.text.length);

function resolveWarframe(input) { return FRAME_INDEX.get(normalize(input)) || null; }
function resolveWarframeMention(input) {
  const raw = String(input || '').normalize('NFKC').trim();
  if (!raw) return null;
  // 先剥离意图词，再做完整实体匹配；这些词只描述用户要问什么，不属于战甲名称。
  const entityText = raw
    .replace(/^\s*(?:刷|查|普通|原版|非\s*Prime|非P版)\s*/i, '')
    .replace(/\s*(?:要|该)?(?:怎么|怎样|如何)(?:刷|获得|获取|得到|取得|入手)(?:的|到)?(?:呢|啊|呀|吗)?\s*$/i, '')
    .replace(/\s*(?:在哪|哪里|哪儿|什么地方)(?:刷|获得|获取|掉落|出)(?:呢|啊|呀|吗)?\s*$/i, '')
    .trim();
  const exact = resolveWarframe(entityText);
  if (exact) return { frame: exact, matched: entityText, rest: raw.replace(entityText, '').trim(), match: 'intent-stripped-exact' };

  // 再扫描句中明确的规范名/稳定别名。单字符别名必须带“普通/原版/战甲/怎么刷”等战甲语境，避免误伤普通汉字。
  for (const alias of FRAME_ALIASES) {
    const text = alias.text;
    if (!text) continue;
    if (/^[A-Za-z0-9]/.test(text)) {
      const re = new RegExp(`(^|[^A-Za-z0-9])(${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^A-Za-z0-9])`, 'i');
      const hit = raw.match(re);
      if (hit) return { frame: alias.frame, matched: hit[2], rest: raw.replace(hit[2], ' ').replace(/\s+/g, ' ').trim(), match: 'mention' };
      continue;
    }
    const index = raw.toLowerCase().indexOf(text.toLowerCase());
    if (index < 0) continue;
    if (text.length === 1 && !/(?:普通|原版|战甲|怎么刷|如何刷|刷|Prime|P版)/i.test(raw)) continue;
    return { frame: alias.frame, matched: raw.slice(index, index + text.length), rest: `${raw.slice(0, index)} ${raw.slice(index + text.length)}`.replace(/\s+/g, ' ').trim(), match: 'mention' };
  }
  return null;
}
function componentPart(component) {
  if (component.name === 'Blueprint') return 'Blueprint';
  if (component.name === 'Neuroptics') return 'Neuroptics';
  if (component.name === 'Chassis') return 'Chassis';
  if (component.name === 'Systems') return 'Systems';
  return null;
}
function getComponentDrops(frameOrName) {
  const frame = typeof frameOrName === 'string' ? resolveWarframe(frameOrName) : frameOrName;
  if (!frame) return null;
  if (frame.override) return frame.components.map(component => ({ ...component, drops: component.drops.map(drop => ({ ...drop })) }));
  const found = new Map((frame.components || []).map(component => [componentPart(component), component]));
  return PARTS.map(part => ({ part, uniqueName: found.get(part)?.uniqueName || null, drops: (found.get(part)?.drops || []).map(drop => ({ ...drop })) }));
}
function normalizeChance(chance) {
  const number = Number(chance);
  if (!Number.isFinite(number)) return null;
  return number > 0 && number <= 1 ? number * 100 : number;
}
function formatChance(chance) {
  const value = normalizeChance(chance);
  return value == null ? '概率未知' : `${Number(value.toFixed(4))}%`;
}
function translateLocation(location) {
  let output = String(location || '未知来源');
  const railjackNode = OFFICIAL_RAILJACK_NODES.nodes.find(node => output.includes(node.canonical));
  if (railjackNode) output = output.replace(new RegExp('^' + railjackNode.regionCanonical.split(' ')[0] + '/', 'i'), railjackNode.regionDisplayName + '/');
  for (const [english, chinese] of Object.entries(STABLE_LOCATION_ZH)) output = output.replace(new RegExp(`\\b${english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), chinese);
  output = output
    .replace(/\s*\(Level\s*(\d+)\s*-\s*(\d+)\s*(?:希图斯|奥布山谷)\s*Bounty\)/gi, '（$1-$2 级赏金）')
    .replace(/,?\s*Rotation\s*([A-Z])/gi, '，$1轮')
    .replace(/\s*\(任务缓存\)/g, '任务中的白色储藏箱');
  return output.replace(/([\u4e00-\u9fff])\s+(接合点)/g, (_match, left, junction) => left + junction);
}

function bountySourceLabel(location) {
  const raw = String(location || '').trim();
  if (/^Earth\/Cetus \(Level\s*15\s*-\s*25\s+Plague Star\)/i.test(raw)) return '在“瘟疫之星”活动期间接取活动赏金';
  const match = raw.match(/^(?:Earth\/Cetus|Venus\/Orb Vallis|Deimos\/Cambion Drift|Zariman Ten Zero) \(Level\s*(\d+)\s*-\s*(\d+)\s+[^)]*Bounty\)/i);
  if (!match) return null;
  const levels = match[1] === '100' && match[2] === '100' ? '钢铁之路' : `${match[1]}-${match[2]} 级`;
  if (/^Earth\/Cetus/i.test(raw)) return `在希图斯找孔祝接取${levels}赏金`;
  if (/^Venus\/Orb Vallis/i.test(raw)) return `在福尔图娜找尤迪科接取${levels}赏金`;
  if (/^Deimos\/Cambion Drift/i.test(raw)) return `在魔胎之境找母亲接取${levels}赏金`;
  if (/^Zariman Ten Zero/i.test(raw)) return `在扎里曼号找奎因接取${levels}赏金`;
  return null;
}

function dropSourceLabel(drop) {
  const raw = String(drop?.location || '').trim();
  const bounty = bountySourceLabel(raw);
  if (bounty) return bounty;
  const simaris = raw.match(/^Cephalon Simaris,\s*Complete\s+(.+)$/i);
  if (simaris) return `首次完成《${localizeQuestName(simaris[1])}》获得该蓝图；之后可在中枢 Simaris 处回购`;
  return translateLocation(raw);
}
function formatDropSource(drop) {
  const source = dropSourceLabel(drop);
  const chance = normalizeChance(drop?.chance);
  return chance != null && chance < 100 ? `${source} ${formatChance(chance)}` : source;
}
function formatDropSources(drops) {
  const grouped = new Map();
  for (const drop of drops || []) {
    const source = dropSourceLabel(drop);
    if (!grouped.has(source)) grouped.set(source, []);
    const chance = bountySourceLabel(drop?.location) ? null : normalizeChance(drop?.chance);
    if (chance != null && chance < 100 && !grouped.get(source).includes(chance)) grouped.get(source).push(chance);
  }
  return [...grouped].map(([source, chances]) => chances.length ? `${source} ${chances.map(formatChance).join('/')}` : source).join('；');
}

function indexRecipes(recipes) {
  const byBlueprint = new Map();
  const byResult = new Map();
  for (const [blueprint, recipe] of Object.entries(recipes || {})) {
    if (!recipe || typeof recipe !== 'object') continue;
    const indexed = { ...recipe, blueprint };
    byBlueprint.set(blueprint, indexed);
    if (recipe.resultType) byResult.set(recipe.resultType, indexed);
  }
  return { byBlueprint, byResult };
}
function isManufacturedWarframePart(itemType) {
  return /\/WarframeRecipes\/.*(?:Helmet|Chassis|Systems)Component$/i.test(itemType);
}
function aggregateMaterials(frameOrName, recipes) {
  const frame = typeof frameOrName === 'string' ? resolveWarframe(frameOrName) : frameOrName;
  if (!frame) return null;
  if (frame.override || frame.materials?.available) return frame.materials;
  if (!recipes || typeof recipes !== 'object') return { available: false, reason: '配方数据暂时不可用' };
  const { byBlueprint, byResult } = indexRecipes(recipes);
  const drops = getComponentDrops(frame);
  const ownPartPaths = new Set(drops.filter(part => part.part !== 'Blueprint').map(part => part.uniqueName).filter(Boolean));
  const resources = new Map();
  const manufacturedParts = new Map();
  const missingRecipes = [];
  let credits = 0;
  const add = (target, itemType, count) => target.set(itemType, (target.get(itemType) || 0) + count);
  function expand(itemType, count, stack) {
    if (ownPartPaths.has(itemType)) return;
    if (isManufacturedWarframePart(itemType)) { add(manufacturedParts, itemType, count); return; }
    const nested = /\/Types\/Recipes\//i.test(itemType) ? (byBlueprint.get(itemType) || byResult.get(itemType)) : null;
    if (!nested || stack.has(nested.blueprint)) { add(resources, itemType, count); return; }
    const next = new Set(stack).add(nested.blueprint);
    credits += Number(nested.creditsCost ?? nested.buildPrice ?? 0) * count;
    for (const ingredient of nested.ingredients || []) expand(ingredient.ItemType, Number(ingredient.ItemCount || 0) * count, next);
  }
  const recipesToBuild = [];
  for (const part of drops) {
    if (part.part === 'Blueprint' || !part.uniqueName) continue;
    const recipe = byBlueprint.get(part.uniqueName) || byResult.get(part.uniqueName);
    if (recipe) recipesToBuild.push(recipe); else missingRecipes.push(part.part);
  }
  const totalBlueprint = drops.find(part => part.part === 'Blueprint')?.uniqueName;
  const frameRecipe = byResult.get(frame.uniqueName) || (totalBlueprint && byBlueprint.get(totalBlueprint));
  if (frameRecipe) recipesToBuild.push(frameRecipe); else missingRecipes.push('Assembly');
  for (const recipe of recipesToBuild) {
    credits += Number(recipe.creditsCost ?? recipe.buildPrice ?? 0);
    for (const ingredient of recipe.ingredients || []) expand(ingredient.ItemType, Number(ingredient.ItemCount || 0), new Set([recipe.blueprint]));
  }
  const renderItems = map => [...map].map(([uniqueName, count]) => ({ uniqueName, name: COMPONENT_ZH.get(uniqueName) || zhName(uniqueName), count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN') || a.uniqueName.localeCompare(b.uniqueName));
  return { available: missingRecipes.length === 0, resources: renderItems(resources), manufacturedParts: renderItems(manufacturedParts), credits: { name: '现金', count: credits }, missingRecipes };
}

function relicBaseName(name) { return String(name || '').replace(/\s+Relic$/i, '').replace(/\s+(Intact|Exceptional|Flawless|Radiant)$/i, '').trim(); }
const RELIC_ERA_ZH = Object.freeze({ Lith: '古纪', Meso: '前纪', Neo: '中纪', Axi: '后纪' });
function localizeRelicName(name) {
  return relicBaseName(name).replace(/^(Lith|Meso|Neo|Axi)\b/i, era => RELIC_ERA_ZH[era[0].toUpperCase() + era.slice(1).toLowerCase()] || era);
}
const RELIC_REWARD_TIER_ZH = Object.freeze({ Rare: '金', Uncommon: '银', Common: '铜' });
function relicRewardTier(relic) {
  if (RELIC_REWARD_TIER_ZH[relic?.rarity]) return RELIC_REWARD_TIER_ZH[relic.rarity];
  const chance = normalizeChance(relic?.chance);
  if (chance != null && chance <= 2) return '金';
  if (chance != null && chance <= 11) return '银';
  return '铜';
}
function normalizeRelicPath(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/Lotus/')) return '';
  return raw.replace(/^\/Lotus\/StoreItems\//i, '/Lotus/').toLowerCase();
}
const RELIC_PATH_INDEX = new Map();
for (const relic of RELICS.filter(item => / Intact$/i.test(item.name))) {
  const key = normalizeRelicPath(relic.uniqueName);
  if (key) RELIC_PATH_INDEX.set(key, relicBaseName(relic.name));
}
function normalizeVarziaManifest(manifest) {
  const names = new Set();
  function visit(value, key = '') {
    if (typeof value === 'string') {
      if (/itemtype/i.test(key)) {
        const relicName = RELIC_PATH_INDEX.get(normalizeRelicPath(value));
        if (relicName) names.add(normalize(relicName));
      }
      const displayed = value.match(/\b(?:Lith|Meso|Neo|Axi)\s+[A-Z]\d+(?:\s+Relic)?\b/i);
      if (displayed) names.add(normalize(relicBaseName(displayed[0])));
    } else if (Array.isArray(value)) value.forEach(item => visit(item, key));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
  }
  visit(manifest);
  return names;
}
function activeRelicPaths(rewards) {
  const paths = new Set();
  function visit(value) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      if (typeof value.type === 'string' && /VoidProjection/i.test(value.type)) paths.add(normalizeRelicPath(value.type));
      Object.values(value).forEach(visit);
    }
  }
  visit(rewards);
  return paths;
}
function getPrimeRelics(frameOrName, varziaManifest, missionRewards) {
  const frame = typeof frameOrName === 'string' ? resolveWarframe(frameOrName) : frameOrName;
  if (!frame || !frame.isPrime) return null;
  if (frame.auditedPrime) {
    const byPart = Object.fromEntries(PARTS.map(part => [part, (frame.relics[part] || []).map(relic => ({ ...relic, part }))]));
    return { status: '当前出库', relics: Object.values(byPart).flat(), byPart, realtimeAvailable: true, rotationAvailable: true };
  }
  const generatedByPart = OFFICIAL_PRIME_RELICS.frames?.[frame.name];
  let all;
  if (generatedByPart) {
    all = PARTS.flatMap(part => (generatedByPart[part] || []).map(relic => {
      const packaged = RELICS.find(item => normalizeRelicPath(item.uniqueName) === normalizeRelicPath(relic.uniqueName));
      return { ...relic, part, vaulted: Boolean(packaged?.vaulted) };
    }));
  } else {
    const expected = new Map(PARTS.map(part => [part, `${frame.name}${part === 'Blueprint' ? '' : ` ${part}`} Blueprint`]));
    all = [];
    for (const relic of RELICS.filter(item => / Intact$/i.test(item.name))) {
      for (const reward of relic.rewards || []) for (const [part, itemName] of expected) {
        if (reward.item?.name === itemName) all.push({ part, name: relicBaseName(relic.name), uniqueName: relic.uniqueName, vaulted: Boolean(relic.vaulted), chance: reward.chance, rarity: reward.rarity });
      }
    }
  }
  const activePaths = activeRelicPaths(missionRewards);
  const generatedHasActivity = generatedByPart && all.some(relic => typeof relic.active === 'boolean');
  const current = all.filter(relic => generatedHasActivity ? relic.active : activePaths.has(normalizeRelicPath(relic.uniqueName)));
  const manifest = normalizeVarziaManifest(varziaManifest);
  const resurgence = all.filter(relic => relic.vaulted && manifest.has(normalize(relic.name)));
  const status = current.length ? '当前出库' : resurgence.length ? 'Prime 重生' : '已入库';
  const selected = status === '当前出库' ? current : status === 'Prime 重生' ? resurgence : [];
  return {
    status, relics: selected,
    byPart: Object.fromEntries(PARTS.map(part => [part, selected.filter(relic => relic.part === part)])),
    realtimeAvailable: varziaManifest != null, rotationAvailable: missionRewards != null
  };
}

function getFrameAbilities(frameOrName) {
  const frame = typeof frameOrName === 'string' ? resolveWarframe(frameOrName) : frameOrName;
  if (!frame || frame.override) return [];
  const abilityFrame = frame.isPrime ? (ALL_WARFRAMES.find(item => item.name === frame.name.replace(/ Prime$/, '')) || frame) : frame;
  const localizedAbilities = I18N[abilityFrame.uniqueName]?.zh?.abilities || [];
  return (abilityFrame.abilities || []).map((ability, index) => {
    const localized = localizedAbilities.find(item => item.abilityUniqueName === ability.uniqueName) || localizedAbilities[index] || {};
    return { index: index + 1, name: ability.name, zhName: localized.abilityName || null, description: localized.description || ability.description || '', uniqueName: ability.uniqueName };
  });
}

function resolveWarframeAbilityQuery(input) {
  const raw = String(input || '').trim();
  const compact = normalize(raw);
  const alias = FRAME_ALIASES.find(item => compact.startsWith(item.normalized));
  if (!alias || alias.frame.override) return null;
  let rest = raw;
  const escaped = alias.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  rest = rest.replace(new RegExp(`^\\s*${escaped}\\s*`, 'i'), '').trim();
  const abilityFrame = alias.frame.isPrime ? (ALL_WARFRAMES.find(frame => frame.name === alias.frame.name.replace(/ Prime$/, '')) || alias.frame) : alias.frame;
  const abilities = getFrameAbilities(alias.frame);
  let selected = null;
  const number = rest.match(/^([1-4])(?:\s*技能)?(?:\s+|(?=[\u4e00-\u9fff])|$)/);
  if (number) { selected = abilities[Number(number[1]) - 1]; rest = rest.slice(number[0].length).trim(); }
  if (!selected) {
    selected = abilities.find(ability => [ability.zhName, ability.name].filter(Boolean).some(name => normalize(rest).startsWith(normalize(name))));
    if (selected) {
      const name = [selected.zhName, selected.name].filter(Boolean).sort((a, b) => b.length - a.length).find(value => normalize(rest).startsWith(normalize(value)));
      if (name) rest = rest.replace(new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '').trim();
    }
  }
  return { frame: alias.frame, abilityFrame, ability: selected, question: rest, abilities };
}

async function loadExport(options, fallbackUrl, fallbackCache, label) {
  const cachePath = options.cachePath || fallbackCache;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const maxAgeMs = Number(options.maxAgeMs ?? 6 * 60 * 60 * 1000);
  const readCache = () => JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  if (!options.forceRefresh) {
    try {
      const age = Date.now() - fs.statSync(cachePath).mtimeMs;
      if (age <= maxAgeMs) return readCache();
    } catch (_) {}
  }
  try {
    if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
    const response = await fetchImpl(options.url || fallbackUrl, { signal: AbortSignal.timeout(options.timeoutMs || 15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(data));
    return data;
  } catch (error) {
    try { return readCache(); }
    catch { throw new Error(`${label} 获取失败且无可用缓存：${error.message}`); }
  }
}
async function loadRecipes(options = {}) {
  if (options.recipes) return options.recipes;
  return loadExport(options, RECIPES_URL, DEFAULT_CACHE, 'ExportRecipes');
}
async function loadMissionRewards(options = {}) {
  if (options.rewards) return options.rewards;
  return loadExport(options, REWARDS_URL, DEFAULT_REWARDS_CACHE, 'ExportRewards');
}
function renderSeriesPartSource(frame, part) {
  const series = OFFICIAL_FRAME_QUEST_SERIES.frames?.[frame.name];
  const relation = series?.parts?.[part];
  if (!relation) return null;
  if (relation.type === 'quest-first-completion-simaris-repurchase') {
    return `首次完成《${localizeQuestName(relation.quest || series.quest)}》获得该蓝图；之后可在中枢 Simaris 处回购`;
  }
  if (relation.type === 'dojo-research' && relation.room === 'Ventkids Bash Lab') {
    return '在氏族道场的通风小子实验室完成研究后复制该部件蓝图';
  }
  return null;
}
function componentSourceText(frame, part, drops) {
  if (frame.override && frame.acquisition?.dropReward) {
    const drop = frame.acquisition.dropReward;
    const missions = (drop.locationIds || []).map(id => entityName(LOCATION_REGISTRY, id)).join('或');
    const dropText = `天王星比邻星域的${missions}，${drop.rotation}轮 ${formatChance(drop.chance)}`;
    if (part === 'Blueprint' && frame.acquisition.questReward) {
      const quest = entityName(QUEST_REGISTRY, frame.acquisition.questReward.questId);
      return `首次完成《${quest}》获得；或刷${dropText}`;
    }
    return dropText;
  }
  const override = FRAME_SOURCE_OVERRIDES[frame.name];
  const audited = override?.[part] || override?.all;
  if (audited) return audited;
  const seriesSource = renderSeriesPartSource(frame, part);
  if (seriesSource) return seriesSource;
  if (drops?.length) return formatDropSources(drops);
  // 官方物品数据的 bpCost 表示普通战甲总图可直接在商店用现金购买。
  if (part === 'Blueprint' && Number(frame.bpCost) > 0) return `商店购买（${Number(frame.bpCost)} 现金）`;
  return '官方结构化数据缺少该蓝图的获取来源';
}

function entityName(registry, id) { const entry = registry.get(id); return entry ? (entry.displayName || entry.canonical) : id; }
function renderAdditionalAcquisitionMethods(frame) {
  const acquisition = frame.acquisition || {};
  const lines = [];
  // questReward 与 dropReward 已由蓝图来源行表达，这里只渲染尚未展示的替代获取方式。
  if (acquisition.vendorExchange) {
    const vendor = entityName(NPC_REGISTRY, acquisition.vendorExchange.npcId);
    const location = entityName(LOCATION_REGISTRY, acquisition.vendorExchange.locationId);
    const currencies = (acquisition.vendorExchange.currencyIds || []).map(id => entityName(CURRENCY_REGISTRY, id)).join('或');
    const costs = Object.entries(acquisition.vendorExchange.costs || {}).map(([part, amount]) => `${PART_ZH[part] || part} ${amount}`).join('；');
    lines.push(`在${location}向 ${vendor} 使用${currencies}兑换：${costs}；总计 ${acquisition.vendorExchange.total}`);
  }
  return lines;
}

function acquisitionRuleKey(acquisition) {
  if (!acquisition || acquisition.type !== 'mission-completion') return null;
  return JSON.stringify({ type: acquisition.type, normalAmount: acquisition.normalAmount, steelPathAmount: acquisition.steelPathAmount, bonus: acquisition.bonus });
}
function renderAcquisitionDependencies(frame) {
  const dependencies = FRAME_DEPENDENCIES[frame.name] || [];
  const seen = new Set();
  const renderedRuleKeys = new Set();
  const lines = [];
  for (const reference of dependencies) {
    const entity = reference.currencyId ? CURRENCY_REGISTRY.get(reference.currencyId) : null;
    const dependency = entity?.acquisitionDependency ? { ...entity.acquisitionDependency, ...reference } : reference;
    const key = reference.currencyId || dependency.canonical || dependency.displayName;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const amount = dependency.amount == null ? '' : `（需要 ${dependency.amount}）`;
    const review = dependency.reviewStatus === 'pending' ? '【待人工审核】' : '';
    let summary = dependency.acquisitionSummary;
    const ruleKey = acquisitionRuleKey(dependency.acquisition);
    if (!summary && dependency.acquisition?.type === 'mission-completion') {
      const mission = entityName(LOCATION_REGISTRY, dependency.acquisition.locationId);
      if (ruleKey && renderedRuleKeys.has(ruleKey)) summary = `完成天王星比邻星域${mission}；数量与额外获取规则同上`;
      else {
        const normal = dependency.acquisition.normalAmount;
        const steel = dependency.acquisition.steelPathAmount;
        summary = `完成天王星比邻星域${mission}：普通难度结算 ${normal.min}-${normal.max} 个，钢铁之路 ${steel.min}-${steel.max} 个；${dependency.acquisition.bonus}`;
      }
    }
    if (ruleKey) renderedRuleKeys.add(ruleKey);
    lines.push(`${dependency.displayName || entity?.displayName || dependency.canonical}${amount}：${summary}${review}`);
  }
  return lines;
}
function listWarframes() {
  return FRAME_KNOWLEDGE.map(entry => ({ canonical: entry.subject.canonical, displayName: entry.subject.displayName, officialUniqueName: entry.subject.officialUniqueName, isPrime: Boolean(entry.frameAcquisition.generated?.isPrime) }));
}
function getWarframeKnowledge(query) {
  const frame = resolveWarframe(query);
  return frame ? FRAME_KNOWLEDGE_INDEX.get(frame.name) || null : null;
}
function renderAssassinationRoute(variables) {
  if (!variables?.locationId || !variables?.enemyId) return null;
  return `${entityName(LOCATION_REGISTRY, variables.locationId)}刺杀 ${entityName(ENEMY_REGISTRY, variables.enemyId)} 刷取部件`;
}
function renderQuestRoute(variables, itemLabel = '部件蓝图') {
  const npc = entityName(NPC_REGISTRY, variables?.npcId);
  const quest = entityName(QUEST_REGISTRY, variables?.questId);
  if (!npc || !quest) return null;
  return `首次完成《${quest}》获得${itemLabel}；之后可在 ${npc} 处回购`;
}
function renderBountyRoute(variables) {
  const faction = variables?.factionId ? entityName(FACTION_REGISTRY, variables.factionId) : '';
  const hubs = (variables?.hubs || []).map(hub => ({ location: entityName(LOCATION_REGISTRY, hub.locationId), npc: entityName(NPC_REGISTRY, hub.npcId) }));
  const locationText = hubs.map(hub => `在${hub.location}找${hub.npc}`).join('，或');
  if (!locationText) return null;
  return `${locationText}接取${faction}赏金刷取部件`;
}

function renderMissionSource(source) {
  if (source?.type === 'quest-repurchase') return renderQuestRoute(source);
  if (source?.type === 'acquisition-source') {
    const entry = LOCATION_REGISTRY.get(source.sourceId);
    return entry && entry.displayName ? entry.displayName : null;
  }
  if (source?.type !== 'mission-node') return null;
  const location = LOCATION_REGISTRY.get(source.locationId);
  const node = LOCATION_REGISTRY.get(source.missionNodeId);
  if (!location || !node) return null;
  const missionType = node.missionTypeId ? entityName(MISSION_TYPE_REGISTRY, node.missionTypeId) : '';
  const mission = missionType ? `（${missionType}）` : '';
  const rotation = source.rotation ? ` ${source.rotation} 轮` : '';
  return `${entityName(LOCATION_REGISTRY, source.locationId)}的${entityName(LOCATION_REGISTRY, source.missionNodeId)}${mission}${rotation}`;
}
function renderMissionNodeRoute(variables) {
  const sources = variables?.sources || (variables?.missionNodeId ? [{ type: 'mission-node', locationId: variables.locationId, missionNodeId: variables.missionNodeId, rotation: variables.rotations?.join('/') || null }] : []);
  const rendered = sources.map(renderMissionSource);
  if (!rendered.length || rendered.some(value => !value)) return null;
  const unique = [...new Set(rendered)];
  let line = sources.every(source => source.type === 'mission-node') ? `在${unique.join('；在')}刷取部件蓝图` : `${unique.join('；')}获取部件蓝图`;
  const exchange = variables?.exchange;
  if (exchange?.npcId && exchange?.currencyId) {
    const npc = entityName(NPC_REGISTRY, exchange.npcId);
    const currencyEntity = CURRENCY_REGISTRY.get(exchange.currencyId);
    const currency = entityName(CURRENCY_REGISTRY, exchange.currencyId);
    line += `\n也可在 ${npc} 处使用${currency}兑换：部件蓝图每张 ${exchange.componentCost}，总图 ${exchange.blueprintCost}，全套共 ${exchange.totalCost}`;
    const dependency = currencyEntity?.acquisitionDependency;
    if (dependency?.type === 'mission-enemy-drop') {
      const node = LOCATION_REGISTRY.get(dependency.missionNodeId);
      const missionType = MISSION_TYPE_REGISTRY.get(dependency.missionTypeId);
      const normal = dependency.normalAmount;
      const steel = dependency.steelPathAmount;
      line += `\n${currency}怎么刷：在${entityName(LOCATION_REGISTRY, node.parentId)}的${entityName(LOCATION_REGISTRY, node.id)}（${entityName(MISSION_TYPE_REGISTRY, missionType.id)}）击败爆破使，普通每只掉落 ${normal.min}-${normal.max}，钢铁之路每只 ${steel.min}-${steel.max}`;
    }
  }
  return line;
}
function renderSpecificMissionRoute(variables) {
  const location = entityName(LOCATION_REGISTRY, variables?.locationId);
  const node = LOCATION_REGISTRY.get(variables?.missionNodeId);
  if (!location || !node) return null;
  const missionType = node.missionTypeId ? entityName(MISSION_TYPE_REGISTRY, node.missionTypeId) : '';
  const mission = missionType ? `（${missionType}）` : '';
  const chance = Number.isFinite(Number(variables.dropChance)) ? `，部件蓝图掉率 ${Number(variables.dropChance)}%` : '';
  const lines = [`在${location}的${entityName(LOCATION_REGISTRY, variables.missionNodeId)}${mission}刷取${chance}`];
  const exchange = variables.exchange;
  if (exchange?.npcId && exchange?.currencyId) {
    const npc = entityName(NPC_REGISTRY, exchange.npcId);
    const currency = entityName(CURRENCY_REGISTRY, exchange.currencyId);
    lines.push(`也可在 ${npc} 处使用${currency}兑换：部件蓝图每张 ${exchange.componentCost}，总图 ${exchange.blueprintCost}`);
  }
  return lines;
}
function renderRoutedAcquisition(frameOrName) {
  const frame = typeof frameOrName === 'string' ? resolveWarframe(frameOrName) : frameOrName;
  if (!frame) return null;
  const route = FRAME_ROUTING.frames.find(item => item.canonical === frame.name);
  const knowledge = FRAME_KNOWLEDGE_INDEX.get(frame.name);
  if (!route || !knowledge) return null;
  const routing = knowledge.frameAcquisition?.manual?.routingOverride || knowledge.frameAcquisition?.generated?.routing;
  if (!routing) return null;
  if (route.componentCategory === 'frame-specific-mission') {
    const variables = routing.componentVariables || {};
    const structured = variables.exchange || variables.dropChance
      ? renderSpecificMissionRoute(variables)
      : variables.sources ? [renderMissionNodeRoute(variables)].filter(Boolean) : null;
    if (structured?.length) {
      const blueprint = route.blueprintCategory ? applyTemplate(METHOD_TEMPLATES.blueprints[route.blueprintCategory], routing.blueprintVariables || {}) : null;
      return { route, lines: [blueprint, ...structured].filter(Boolean), source: 'category-method' };
    }
    const text = knowledge.frameAcquisition?.manual?.acquisitionText;
    return text ? { route, lines: String(text).split('\n').filter(Boolean), source: 'frame-json' } : null;
  }
  const lines = [];
  if (route.blueprintCategory) {
    const blueprintLine = route.blueprintCategory === 'quest' && routing.blueprintVariables?.questId
      ? renderQuestRoute(routing.blueprintVariables || {}, '总图')
      : ['mixed-missions', 'specific-mission'].includes(route.blueprintCategory) && routing.blueprintVariables?.type === 'mission-node'
        ? `${renderMissionSource(routing.blueprintVariables)}获取总图`
        : applyTemplate(METHOD_TEMPLATES.blueprints[route.blueprintCategory], routing.blueprintVariables || {});
    if (blueprintLine) lines.push(blueprintLine);
    else {
      const fallback = componentSourceText(frame, 'Blueprint', getComponentDrops(frame)?.find(item => item.part === 'Blueprint')?.drops || []);
      if (fallback && !/缺少/.test(fallback)) lines.push(`总图：${fallback}`);
    }
  }
  const componentLine = route.componentCategory === 'frame-bounty'
    ? renderBountyRoute(routing.componentVariables || {})
    : route.componentCategory === 'frame-quest'
      ? renderQuestRoute(routing.componentVariables || {})
      : route.componentCategory === 'frame-assassination' && routing.componentVariables?.enemyId
        ? renderAssassinationRoute(routing.componentVariables || {})
        : route.componentCategory === 'frame-mixed-missions' && (routing.componentVariables?.sources || routing.componentVariables?.missionNodeId)
          ? renderMissionNodeRoute(routing.componentVariables || {})
          : applyTemplate(METHOD_TEMPLATES.components[route.componentCategory], routing.componentVariables || {});
  if (componentLine) lines.push(componentLine);
  else {
    const fallback = groupedPartSourceLines(getComponentDrops(frame).filter(item => item.part !== 'Blueprint').map(item => ({ part: item.part, text: componentSourceText(frame, item.part, item.drops) })));
    lines.push(...fallback);
  }
  return lines.length ? { route, lines, source: 'category-method' } : null;
}

function getWarframeMaintenanceReport() {
  const official = OFFICIAL_FRAMES.frames || [];
  const covered = new Set(FRAME_KNOWLEDGE.map(entry => entry.subject.officialUniqueName));
  return { officialCount: official.length, publicCount: FRAME_KNOWLEDGE.length, excluded: official.filter(frame => !covered.has(frame.uniqueName)).map(frame => ({ name: frame.name, officialUniqueName: frame.uniqueName })), pendingDependencies: FRAME_KNOWLEDGE.flatMap(entry => (manualOf(entry).dependencies || []).filter(item => item.reviewStatus === 'pending').map(item => ({ frame: entry.subject.canonical, dependency: item.canonical }))) };
}

function groupedPartSourceLines(partSources) {
  const groups = new Map();
  for (const { part, text } of partSources) {
    if (!groups.has(text)) groups.set(text, []);
    groups.get(text).push(part);
  }
  return [...groups].map(([text, parts]) => {
    const partSet = new Set(parts);
    let label;
    if (parts.length === PARTS.length) label = '全部蓝图';
    else if (parts.length === 3 && ['Neuroptics', 'Chassis', 'Systems'].every(part => partSet.has(part))) label = '部件蓝图';
    else label = parts.map(part => PART_ZH[part]).join('、');
    return `${label}：${text}`;
  });
}

function renderAcquisition(data) {
  const frame = data.frame || data;
  const drops = data.drops || getComponentDrops(frame);
  const prime = data.prime || null;
  const lines = [];
  if (prime) lines.push(`状态：${prime.status}`);
  const partSources = PARTS.map(part => {
    let text;
    if (prime) {
      const relics = prime.byPart?.[part] || [];
      text = relics.length ? relics.map(relic => `${localizeRelicName(relic.name)}（${relicRewardTier(relic)}）`).join('；') : (prime.status === '已入库' ? '当前无可新获取遗物，可交易获得部件' : '当前状态无可获得遗物');
    } else {
      const entries = drops.find(entry => entry.part === part)?.drops || [];
      text = componentSourceText(frame, part, entries);
    }
    return { part, text };
  });
  lines.push(...groupedPartSourceLines(partSources));
  if (prime && !prime.rotationAvailable) lines.push('当前遗物轮换数据暂不可用');
  if (prime && !prime.realtimeAvailable && prime.status !== '当前出库') lines.push('Prime 重生实时状态暂不可用');
  if (frame.override) { const additional = renderAdditionalAcquisitionMethods(frame); lines.push(...additional.map(text => `兑换：${text}`)); }
  if (FRAME_ACQUISITION_NOTES[frame.name]) lines.push(`说明：${FRAME_ACQUISITION_NOTES[frame.name]}`);
  const dependencyLines = renderAcquisitionDependencies(frame);
  if (dependencyLines.length) lines.push('兑换道具怎么刷：', ...dependencyLines);
  const materials = data.materials || frame.materials;
  lines.push('材料统计：');
  if (!materials?.available && !materials?.resources) lines.push(materials?.reason || '制造材料数据暂不可用');
  else {
    const entries = [...(materials.resources || []), ...(materials.manufacturedParts || []), materials.credits].filter(Boolean);
    for (const item of entries) lines.push(`x${item.count} ${item.name}`);
  }
  return lines.join('\n');
}

module.exports = {
  RECIPES_URL, REWARDS_URL, PARTS, FRAME_SOURCE_OVERRIDES, FRAME_ACQUISITION_NOTES, QUEST_SOURCE_ZH, CALIBAN_PRIME, SIRIUS_ORION, resolveWarframe, resolveWarframeMention, getFrameAbilities, resolveWarframeAbilityQuery,
  getComponentDrops, indexRecipes, aggregateMaterials, normalizeChance, formatChance,
  normalizeRelicPath, normalizeVarziaManifest, activeRelicPaths, getPrimeRelics, loadRecipes, loadMissionRewards, renderAcquisition, renderAcquisitionDependencies, acquisitionRuleKey, renderAdditionalAcquisitionMethods, groupedPartSourceLines, componentSourceText, renderSeriesPartSource, translateLocation, localizeQuestName, formatDropSource, formatDropSources, localizeRelicName, relicRewardTier,
  listWarframes, getWarframeKnowledge, renderAssassinationRoute, renderQuestRoute, renderBountyRoute, renderMissionSource, renderMissionNodeRoute, renderSpecificMissionRoute, renderRoutedAcquisition, getWarframeMaintenanceReport
};
