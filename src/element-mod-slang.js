'use strict';

const ELEMENTS = {
  火: { id: 'heat', en: 'Heat', zh: '火焰伤害' },
  冰: { id: 'cold', en: 'Cold', zh: '冰冻伤害' },
  电: { id: 'electricity', en: 'Electricity', zh: '电击伤害' },
  毒: { id: 'toxin', en: 'Toxin', zh: '毒素伤害' }
};
const CATEGORIES = [
  { id: 'rifle', compat: 'Rifle', displayName: '步枪', aliases: ['主要武器', '步枪', '主手'], aliasScopeNote: '仅元素 Mod 意图内按审核默认指向 Rifle；不代表所有主要武器或主手都属于步枪。' },
  { id: 'shotgun', compat: 'Shotgun', displayName: '霰弹枪', aliases: ['霰弹枪', '霰弹', '散弹'] },
  { id: 'pistol', compat: 'Pistol', displayName: '手枪', aliases: ['次要武器', '手枪', '副手'] },
  { id: 'melee', compat: 'Melee', displayName: '近战', aliases: ['近战', '刀'] },
  { id: 'archgun', compat: 'Archgun', displayName: '空战枪械', aliases: ['archwing枪械', '空战枪械', 'archwing', '空战'] },
  { id: 'archmelee', compat: 'Archmelee', displayName: '空战近战', aliases: ['空战近战', 'archmelee'] }
];
const clean = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
const effectStat = text => {
  const match = String(text || '').trim().match(/^\+\d+(?:\.\d+)?%\s+(.+)$/);
  if (!match) return null;
  const label = match[1].trim();
  if (Object.values(ELEMENTS).some(element => element.en === label)) return Object.values(ELEMENTS).find(element => element.en === label).id;
  if (label === 'Status Chance') return 'status-chance';
  if (label === 'Heavy Attack Efficiency') return 'heavy-attack-efficiency';
  return null;
};
const structuredEffects = mod => (mod.maxRankEffects || []).map(text => ({ stat: effectStat(text), text })).filter(effect => effect.stat);
const relation = (mod, category, key, kind, effects, source) => ({
  alias: `${category.displayName}${kind}${key}`,
  categoryId: category.id,
  category: category.displayName,
  kind: kind === '金' ? 'dual-element-status' : kind === '银' ? 'single-element' : 'functional',
  element: ELEMENTS[key]?.id || null,
  displayName: mod.displayName,
  canonical: mod.canonical,
  uniqueName: mod.uniqueName,
  rarity: mod.rarity,
  effects,
  wikiUrl: mod.wiki?.url || null,
  source
});
function buildElementModSlangIndex(mods, reviewed = { aliases: [] }) {
  const automatic = [], audit = [];
  for (const category of CATEGORIES) for (const [key, element] of Object.entries(ELEMENTS)) {
    const compatible = mods.filter(mod => mod.compatName === category.compat && !mod.traits?.pvp && !/\/Beginner\//.test(mod.uniqueName || ''));
    const gold = compatible.filter(mod => {
      const stats = structuredEffects(mod).map(effect => effect.stat);
      return stats.length === 2 && stats.includes(element.id) && stats.includes('status-chance') && !mod.traits?.prime;
    });
    const single = compatible.filter(mod => {
      const effects = mod.maxRankEffects || [];
      const stats = structuredEffects(mod).map(effect => effect.stat);
      return effects.length === 1 && stats.length === 1 && stats[0] === element.id;
    });
    const primed = single.filter(mod => mod.traits?.prime || /^Primed\s/i.test(mod.canonical));
    const silver = primed.length ? primed : single.filter(mod => !mod.traits?.prime && !/^Primed\s/i.test(mod.canonical));
    for (const [kind, candidates] of [['金', gold], ['银', silver]]) {
      const status = candidates.length === 1 ? 'resolved' : candidates.length ? 'ambiguous' : 'missing';
      audit.push({ categoryId: category.id, category: category.displayName, element: element.id, elementName: key, kind: kind === '金' ? 'gold' : 'silver', status, candidates: candidates.map(mod => ({ displayName: mod.displayName, canonical: mod.canonical, uniqueName: mod.uniqueName })) });
      if (candidates.length === 1) automatic.push(relation(candidates[0], category, key, kind, structuredEffects(candidates[0]), 'automatic-official-catalog'));
    }
  }
  const manual = [];
  for (const item of reviewed.aliases || []) {
    const mod = mods.find(candidate => candidate.uniqueName === item.uniqueName);
    if (!mod) { manual.push({ ...item, status: 'missing-target' }); continue; }
    const effects = structuredEffects(mod);
    const wanted = [...(item.requiredEffects || [])].sort();
    const actual = effects.map(effect => effect.stat).sort();
    manual.push({ ...relation(mod, CATEGORIES.find(category => category.compat === mod.compatName) || { id: mod.compatName, displayName: mod.compatName }, '', '', effects, 'reviewed-alias'), aliases: item.aliases, status: JSON.stringify(wanted) === JSON.stringify(actual) ? 'resolved' : 'effect-mismatch', review: item.review });
  }
  return { schemaVersion: 1, catalogCount: mods.length, categories: CATEGORIES, elements: ELEMENTS, automatic, manual, audit, counts: { automatic: automatic.length, manualResolved: manual.filter(item => item.status === 'resolved').length, resolved: audit.filter(item => item.status === 'resolved').length, missing: audit.filter(item => item.status === 'missing').length, ambiguous: audit.filter(item => item.status === 'ambiguous').length } };
}
function createElementModSlangResolver(index) {
  const exact = new Map();
  const add = (alias, value) => { const key = clean(alias); const values = exact.get(key) || []; if (!values.some(item => item.uniqueName === value.uniqueName)) values.push(value); exact.set(key, values); };
  for (const item of index.manual || []) if (item.status === 'resolved') for (const alias of item.aliases || []) add(alias, item);
  for (const item of index.automatic || []) {
    const category = CATEGORIES.find(candidate => candidate.id === item.categoryId);
    const elementName = Object.entries(ELEMENTS).find(([, value]) => value.id === item.element)?.[0];
    const modifiers = item.kind === 'dual-element-status' ? ['金', '活动'] : ['银'];
    for (const modifier of modifiers) for (const categoryAlias of category.aliases) {
      const descriptor = `${modifier}${elementName}`;
      add(`${categoryAlias}${descriptor}`, item);
      add(`${descriptor}${categoryAlias}`, item);
    }
  }
  function resolve(query) {
    const values = exact.get(clean(query)) || [];
    if (!values.length) return { status: 'missing', query: String(query), candidates: [] };
    if (values.length > 1) return { status: 'ambiguous', query: String(query), candidates: values };
    return { status: 'resolved', query: String(query), relation: values[0], candidates: values };
  }
  function render(query) {
    const result = resolve(query);
    if (result.status === 'missing') return `没有找到元素 Mod 黑话“${String(query).trim()}”`;
    if (result.status === 'ambiguous') return `“${String(query).trim()}”有多个元素 Mod 候选：${result.candidates.map(item => item.displayName).join('、')}`;
    const item = result.relation;
    return `${item.displayName}（${item.canonical}）\n${item.effects.map(effect => effect.text).join('；')}`;
  }
  return { resolve, render };
}
module.exports = { ELEMENTS, CATEGORIES, structuredEffects, buildElementModSlangIndex, createElementModSlangResolver };
