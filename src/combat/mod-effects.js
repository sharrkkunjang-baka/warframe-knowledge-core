'use strict';

const { normalize } = require('../resolver');

const STAT_ALIASES = new Map([
  ['伤害', 'damage'], ['基础伤害', 'damage'], ['暴击几率', 'critical-chance'], ['暴击率', 'critical-chance'],
  ['暴击伤害', 'critical-damage'], ['触发几率', 'status-chance'], ['触发率', 'status-chance'],
  ['多重射击', 'multishot'], ['射速', 'fire-rate'], ['冰冻伤害', 'cold'], ['火焰伤害', 'heat'],
  ['毒素伤害', 'toxin'], ['电击伤害', 'electricity'], ['冲击伤害', 'impact'], ['穿刺伤害', 'puncture'],
  ['切割伤害', 'slash'], ['冲刺速度', 'utility-sprint-speed'], ['对克隆尼的伤害', 'faction-grineer'], ['对 Grineer 的伤害', 'faction-grineer']
]);

const APTITUDE = { canonical: 'Galvanized Aptitude', displayName: '镀层 步枪才能', effects: [
  { stat: 'status-chance', value: 80, unit: '%', condition: 'always' },
  { stat: 'gun-condition-overload', value: 80, unit: '%/status', condition: 'on-kill-2-stacks', directOnly: true }
], source: 'https://wiki.warframe.com/w/Galvanized_Aptitude' };
const CHAMBER = { canonical: 'Galvanized Chamber', displayName: '镀层 分裂膛室', effects: [
  { stat: 'multishot', value: 80, unit: '%', condition: 'always' },
  { stat: 'multishot', value: 150, unit: '%', condition: 'on-kill-5-stacks' }
], source: 'https://wiki.warframe.com/w/Galvanized_Chamber' };
const CURATED = new Map([
  ['galvanized aptitude', APTITUDE], ['镀层步枪才能', APTITUDE], ['镀层 步枪才能', APTITUDE],
  ['galvanized chamber', CHAMBER], ['镀层分裂膛室', CHAMBER], ['镀层 分裂膛室', CHAMBER]
].map(([key, value]) => [normalize(key), value]));

function parseEffectDetail(detail) {
  const text = String(detail || '').trim();
  const match = text.match(/^([+-]?\d+(?:\.\d+)?)%\s+(.+?)(?:（.*）)?$/);
  if (!match) return { raw: text, supported: false, reason: 'unrecognized-effect-text' };
  const label = match[2].trim();
  const stat = STAT_ALIASES.get(label);
  if (!stat) return { raw: text, supported: false, reason: 'unsupported-stat-label' };
  return { stat, displayName: label, value: Number(match[1]), unit: '%', supported: true, sourceKind: 'strict-text-parser' };
}

function createModEffectResolver(core) {
  const knowledge = (core.knowledge || []).filter(entry => entry.subject?.category === 'mod');
  const exact = new Map();
  const add = (name, entry) => {
    const key = normalize(name);
    if (!key) return;
    const values = exact.get(key) || [];
    const identity = entry.subject?.officialUniqueName || entry.subject?.canonical || entry.title;
    if (!values.some(candidate => (candidate.subject?.officialUniqueName || candidate.subject?.canonical || candidate.title) === identity)) values.push(entry);
    exact.set(key, values);
  };
  for (const entry of knowledge) for (const name of [entry.subject?.officialUniqueName, entry.title, entry.subject?.canonical, entry.subject?.displayName, ...(entry.aliases || [])]) add(name, entry);
  const officialByUniqueName = new Map();
  for (const mod of core.officialCatalog?.mods || []) {
    const entry = knowledge.find(candidate => normalize(candidate.subject?.canonical) === normalize(mod.canonical));
    if (!entry || !mod.uniqueName) continue;
    officialByUniqueName.set(normalize(mod.uniqueName), mod);
    add(mod.uniqueName, entry);
  }

  function indexedEntry(query) {
    const values = exact.get(normalize(query)) || [];
    if (values.length === 1) return { status: 'resolved', entry: values[0] };
    if (values.length > 1) return { status: 'ambiguous', candidates: values };
    return { status: 'missing' };
  }
  function resolve(query, options = {}) {
    const curated = CURATED.get(normalize(query));
    if (curated) return { status: 'resolved', query, canonical: curated.canonical, displayName: curated.displayName, effects: curated.effects.map(effect => ({ ...effect, supported: true, sourceKind: 'curated' })), warnings: [], sources: [{ url: curated.source, label: `Warframe Wiki - ${curated.canonical}` }], sourceKind: 'curated', match: 'curated' };

    let lookup = indexedEntry(query);
    let slang = null;
    if (lookup.status === 'missing' && typeof core.resolveElementModSlang === 'function') {
      slang = core.resolveElementModSlang(query, { categoryId: options.categoryId });
      if (slang.status === 'resolved') lookup = indexedEntry(slang.relation.canonical);
      else if (slang.status === 'ambiguous') return { status: 'ambiguous', query, effects: [], warnings: ['元素 Mod 黑话存在多个合法候选，已拒绝猜测。'], candidates: slang.candidates };
    }
    if (lookup.status === 'missing' && typeof core.resolveName === 'function') {
      const resolution = core.resolveName(query, { categories: ['mod'], minScore: 70, minLead: 8 });
      if (resolution?.ambiguous) return { status: 'ambiguous', query, effects: [], warnings: ['Mod 名称存在多个候选，已拒绝猜测。'], candidates: resolution.ambiguous };
      if (resolution?.canonical) lookup = indexedEntry(resolution.canonical);
    }
    if (lookup.status === 'ambiguous') return { status: 'ambiguous', query, effects: [], warnings: ['Mod 名称对应多个稳定实体，已拒绝猜测。'], candidates: lookup.candidates.map(entry => entry.subject) };
    if (lookup.status !== 'resolved') return { status: 'not-found', query, effects: [], warnings: ['知识库中未找到该 Mod；未猜测词条。'] };

    const entry = lookup.entry;
    const officialIdentity = officialByUniqueName.get(normalize(query));
    const effects = entry.effects?.length ? entry.effects.map(effect => ({ ...effect, supported: true, sourceKind: 'structured' })) : (entry.effectDetails || []).map(parseEffectDetail);
    const unsupported = effects.filter(effect => !effect.supported);
    return { status: effects.some(effect => effect.supported) ? (unsupported.length ? 'partial' : 'resolved') : 'unsupported', query, canonical: entry.subject.canonical, displayName: entry.subject.displayName, uniqueName: slang?.relation?.uniqueName || officialIdentity?.uniqueName || entry.subject.officialUniqueName || null, effects, warnings: unsupported.map(effect => `无法结构化词条：${effect.raw}`), sources: entry.sources || [], sourceKind: entry.effects?.length ? 'structured' : 'strict-text-parser', match: slang?.match || 'exact-index' };
  }
  return { resolve, resolveMany: (queries, options = {}) => queries.map(query => resolve(query, options)), indexSize: exact.size };
}

module.exports = { createModEffectResolver, parseEffectDetail };
