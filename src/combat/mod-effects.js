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
]);

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
  const knowledge = core.knowledge || [];
  function findEntry(query) {
    const q = normalize(query);
    return knowledge.find(entry => entry.subject?.category === 'mod' && [entry.title, entry.subject.canonical, entry.subject.displayName, ...(entry.aliases || [])].some(value => normalize(value) === q)) || null;
  }
  function resolve(query) {
    const curated = CURATED.get(normalize(query));
    if (curated) return { status: 'resolved', query, canonical: curated.canonical, displayName: curated.displayName, effects: curated.effects.map(effect => ({ ...effect, supported: true, sourceKind: 'curated' })), warnings: [], sources: [{ url: curated.source, label: `Warframe Wiki - ${curated.canonical}` }], sourceKind: 'curated' };
    const entry = findEntry(query);
    if (!entry) return { status: 'not-found', query, effects: [], warnings: ['知识库中未找到该 Mod；未猜测词条。'] };
    const effects = entry.effects?.length ? entry.effects.map(effect => ({ ...effect, supported: true, sourceKind: 'structured' })) : (entry.effectDetails || []).map(parseEffectDetail);
    const unsupported = effects.filter(effect => !effect.supported);
    return { status: effects.some(effect => effect.supported) ? (unsupported.length ? 'partial' : 'resolved') : 'unsupported', query, canonical: entry.subject.canonical, displayName: entry.subject.displayName, maxRank: entry.maxRank, effects, warnings: unsupported.map(effect => `无法结构化词条：${effect.raw}`), sources: entry.sources || [], sourceKind: entry.effects?.length ? 'structured' : 'strict-text-parser' };
  }
  return { resolve, resolveMany: queries => queries.map(resolve) };
}

module.exports = { createModEffectResolver, parseEffectDetail };
