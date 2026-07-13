'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'));
const CORE_ROOT = path.resolve(__dirname, '..');
const WARFRAMES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Warframes.json'));
const RELICS = require(path.join(ITEMS_ROOT, 'data', 'json', 'Relics.json'));
const I18N = require(path.join(ITEMS_ROOT, 'data', 'json', 'i18n.json'));
const ALIASES = require(path.join(CORE_ROOT, 'facts', 'aliases.json'));

const RECIPES_URL = 'https://browse.wf/warframe-public-export-plus/ExportRecipes.json';
const REWARDS_URL = 'https://browse.wf/warframe-public-export-plus/ExportRewards.json';
const DEFAULT_CACHE = path.join(process.env.WF_EXPORT_CACHE_DIR || path.join(CORE_ROOT, 'cache'), 'warframe-export-recipes.json');
const DEFAULT_REWARDS_CACHE = path.join(process.env.WF_EXPORT_CACHE_DIR || path.join(CORE_ROOT, 'cache'), 'warframe-export-rewards.json');
const PARTS = ['Blueprint', 'Neuroptics', 'Chassis', 'Systems'];
const PART_ZH = { Blueprint: '总图', Neuroptics: '头', Chassis: '机体', Systems: '系统' };
const STABLE_LOCATION_ZH = {
  Earth: '地球', Venus: '金星', Mercury: '水星', Mars: '火星', Phobos: '火卫一',
  Ceres: '谷神星', Jupiter: '木星', Europa: '欧罗巴', Saturn: '土星', Uranus: '天王星',
  Neptune: '海王星', Pluto: '冥王星', Sedna: '赛德娜', Eris: '阋神星', Lua: '月球', Deimos: '火卫二',
  Assassination: '刺杀', Defense: '防御', Survival: '生存', Capture: '捕获', Rescue: '救援',
  Spy: '间谍', Disruption: '中断', Exterminate: '歼灭', Interception: '拦截', Excavation: '挖掘',
  'Cephalon Simaris': '中枢 Simaris', 'The New Strange': '新疑谜团', Junction: '接合点', Complete: '完成',
  Cetus: '希图斯', 'Orb Vallis': '奥布山谷'
};

const CALIBAN_PRIME = Object.freeze({
  name: 'Caliban Prime', zhName: 'Caliban Prime', uniqueName: '/Lotus/Powersuits/Sentient/CalibanPrime',
  isPrime: true, auditedPrime: true, productCategory: 'Suits', type: 'Warframe',
  components: PARTS.map(part => ({ part, name: part, drops: [] })),
  relics: {
    Blueprint: [
      { name: 'Lith V11', chance: 11 }, { name: 'Meso V13', chance: 11 }, { name: 'Meso V15', chance: 11 }
    ],
    Neuroptics: [{ name: 'Neo C7', chance: 2 }],
    Chassis: [
      { name: 'Axi P10', chance: 25.33 }, { name: 'Lith K12', chance: 25.33 }, { name: 'Meso V15', chance: 25.33 }
    ],
    Systems: [{ name: 'Neo C8', chance: 2 }]
  },
  materials: {
    available: true,
    resources: [
      { name: 'Orokin 电池', count: 5 }, { name: '神经元', count: 4 }, { name: '电路', count: 1750 },
      { name: '塑胶块', count: 450 }, { name: '纳米孢子', count: 4750 }, { name: '泥炭萃取物', count: 2 },
      { name: '控制模块', count: 10 }, { name: '红化结晶', count: 1600 }, { name: '回收金属', count: 7800 },
      { name: '氩结晶', count: 2 }, { name: '神经传感器', count: 5 }, { name: '聚合物束', count: 1775 },
      { name: '铁氧体', count: 4000 }
    ],
    manufacturedParts: [], credits: { name: '现金', count: 70000 }
  }
});

const FRAME_SOURCE_OVERRIDES = Object.freeze({
  Volt: {
    all: '在氏族道场的 Tenno 实验室完成研究后复制蓝图'
  },
  Banshee: {
    all: '在氏族道场的 Tenno 实验室完成研究后复制蓝图'
  },
  Nezha: {
    all: '在氏族道场的 Tenno 实验室完成研究后复制蓝图'
  },
  Wukong: {
    all: '在氏族道场的 Tenno 实验室完成研究后复制蓝图'
  },
  Zephyr: {
    all: '在氏族道场的 Tenno 实验室完成研究后复制蓝图'
  },
  Caliban: {
    Blueprint: '商店购买（50000 现金）',
    Neuroptics: '合一众赏金（当前奖励预览出现头部蓝图时刷）',
    Chassis: '合一众赏金（当前奖励预览出现机体蓝图时刷）',
    Systems: '合一众赏金（当前奖励预览出现系统蓝图时刷）'
  },
  Vauban: {
    Blueprint: '商店购买（35000 现金）；或在轮换到该战甲时通过普通回廊第 10 阶获得',
    Neuroptics: '午夜电波贡品兑换（25 午夜电波货币）；或在轮换到该战甲时通过普通回廊第 2 阶获得',
    Chassis: '午夜电波贡品兑换（25 午夜电波货币）；或在轮换到该战甲时通过普通回廊第 5 阶获得',
    Systems: '午夜电波贡品兑换（25 午夜电波货币）；或在轮换到该战甲时通过普通回廊第 8 阶获得'
  },
  Dagath: {
    all: "在氏族道场建造 Dagath 的空阁后获取蓝图（无需研究）；三个部件共需 102 浮华荆棘"
  },
  Grendel: {
    Blueprint: '商店购买（35000 现金）',
    Neuroptics: '在任意中继站的仲裁阁下处用 25 生息精华购买对应定位器，完成欧罗巴 Archaeo-freighter 生存任务后获得',
    Chassis: '在任意中继站的仲裁阁下处用 25 生息精华购买对应定位器，完成欧罗巴 Icefields of Riddah 防御任务后获得',
    Systems: '在任意中继站的仲裁阁下处用 25 生息精华购买对应定位器，完成欧罗巴 Mines of Karishh 挖掘任务后获得'
  },
  Kullervo: {
    Blueprint: "在言录使处用 15 Kullervo 的灾刃兑换",
    Neuroptics: "在言录使处用 9 Kullervo 的灾刃兑换",
    Chassis: "在言录使处用 9 Kullervo 的灾刃兑换",
    Systems: "在言录使处用 9 Kullervo 的灾刃兑换"
  }
});

const QUEST_SOURCE_ZH = Object.freeze({
  "Saya's Vigil": '沙娅的守望',
  'Vox Solaris (Quest)': '索拉里斯之声',
  'Vox Solaris': '索拉里斯之声',
  'Mask of the Revenant': 'Revenant 的面具',
  'Heart of Deimos': '惊惧之心'
});

const FRAME_ACQUISITION_NOTES = Object.freeze({
  Caliban: '合一众赏金在完成《新纪之战》后开放，每 150 分钟更换一批奖励，部件按“系统 → 机体 → 头 → 重复”轮换。希图斯白天找孔祝接取；希图斯夜晚则去福尔图娜找尤迪科。接任务前先看奖励预览，出现缺少的部件再刷。'
});

const SIRIUS_ORION = Object.freeze({
  name: 'Sirius & Orion', zhName: 'Sirius & Orion', isPrime: false, override: true,
  materials: { available: false, reason: '制造材料数据暂不可用' },
  acquisition: {
    quest: '完成《Jade Shadows: Constellations》获得总图',
    drops: "天王星比邻星 The Kuva Wytch 或 Scoria's Angel，A轮，四张蓝图各 14.29%",
    vendor: '边界之塔向 Hunhow 兑换（翡翠天赋或绯红天赋）：总图 275；头/机体/系统各 90；总计 545'
  },
  components: PARTS.map(part => ({
    part,
    drops: [{ chance: 14.29, location: `Uranus Proxima/The Kuva Wytch or Scoria's Angel (Rotation A)`, type: `Sirius & Orion ${part} Blueprint` }]
  }))
});

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

const ALL_WARFRAMES = [...WARFRAMES, CALIBAN_PRIME];
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
  for (const alias of names || []) addFrameAlias(alias, corrected);
}
for (const base of WARFRAMES.filter(frame => !frame.isPrime)) {
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
  for (const [english, chinese] of Object.entries(STABLE_LOCATION_ZH)) output = output.replace(new RegExp(`\\b${english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), chinese);
  output = output
    .replace(/\s*\(Level\s*(\d+)\s*-\s*(\d+)\s*(?:希图斯|奥布山谷)\s*Bounty\)/gi, '（$1-$2 级赏金）')
    .replace(/,?\s*Rotation\s*([A-Z])/gi, '，$1轮');
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
  if (simaris) return `在中枢 Simaris 处购买；首次完成《${QUEST_SOURCE_ZH[simaris[1]] || translateLocation(simaris[1])}》获得`;
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
  const expected = new Map(PARTS.map(part => [part, `${frame.name}${part === 'Blueprint' ? '' : ` ${part}`} Blueprint`]));
  const all = [];
  for (const relic of RELICS.filter(item => / Intact$/i.test(item.name))) {
    for (const reward of relic.rewards || []) for (const [part, itemName] of expected) {
      if (reward.item?.name === itemName) all.push({ part, name: relicBaseName(relic.name), uniqueName: relic.uniqueName, vaulted: Boolean(relic.vaulted), chance: reward.chance, rarity: reward.rarity });
    }
  }
  const activePaths = activeRelicPaths(missionRewards);
  const current = all.filter(relic => activePaths.has(normalizeRelicPath(relic.uniqueName)));
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
  const abilityFrame = frame.isPrime ? (WARFRAMES.find(item => item.name === frame.name.replace(/ Prime$/, '')) || frame) : frame;
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
  const abilityFrame = alias.frame.isPrime ? (WARFRAMES.find(frame => frame.name === alias.frame.name.replace(/ Prime$/, '')) || alias.frame) : alias.frame;
  const abilities = getFrameAbilities(alias.frame);
  let selected = null;
  const number = rest.match(/^([1-4])(?:\s+|$)/);
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
function componentSourceText(frame, part, drops) {
  const override = FRAME_SOURCE_OVERRIDES[frame.name];
  const audited = override?.[part] || override?.all;
  if (audited) return audited;
  if (drops?.length) return formatDropSources(drops);
  // 官方物品数据的 bpCost 表示普通战甲总图可直接在商店用现金购买。
  if (part === 'Blueprint' && Number(frame.bpCost) > 0) return `商店购买（${Number(frame.bpCost)} 现金）`;
  return '官方结构化数据缺少该蓝图的获取来源';
}

function renderAcquisition(data) {
  const frame = data.frame || data;
  const drops = data.drops || getComponentDrops(frame);
  const prime = data.prime || null;
  const lines = [];
  if (prime) lines.push(`状态：${prime.status}`);
  for (const part of PARTS) {
    let text;
    if (prime) {
      const relics = prime.byPart?.[part] || [];
      text = relics.length ? relics.map(relic => `${localizeRelicName(relic.name)} ${formatChance(relic.chance)}`).join('；') : (prime.status === '已入库' ? '当前无可新获取遗物，可交易获得部件' : '当前状态无可获得遗物');
    } else {
      const entries = drops.find(entry => entry.part === part)?.drops || [];
      text = componentSourceText(frame, part, entries);
    }
    lines.push(`${PART_ZH[part]}：${text}`);
  }
  if (prime && !prime.rotationAvailable) lines.push('当前遗物轮换数据暂不可用');
  if (prime && !prime.realtimeAvailable && prime.status !== '当前出库') lines.push('Prime 重生实时状态暂不可用');
  if (frame.override) lines.push(`补充：${frame.acquisition.quest}；${frame.acquisition.vendor}`);
  if (FRAME_ACQUISITION_NOTES[frame.name]) lines.push(`说明：${FRAME_ACQUISITION_NOTES[frame.name]}`);
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
  RECIPES_URL, REWARDS_URL, PARTS, FRAME_SOURCE_OVERRIDES, FRAME_ACQUISITION_NOTES, CALIBAN_PRIME, SIRIUS_ORION, resolveWarframe, resolveWarframeMention, getFrameAbilities, resolveWarframeAbilityQuery,
  getComponentDrops, indexRecipes, aggregateMaterials, normalizeChance, formatChance,
  normalizeRelicPath, normalizeVarziaManifest, activeRelicPaths, getPrimeRelics, loadRecipes, loadMissionRewards, renderAcquisition, componentSourceText, translateLocation, formatDropSource, formatDropSources, localizeRelicName
};
