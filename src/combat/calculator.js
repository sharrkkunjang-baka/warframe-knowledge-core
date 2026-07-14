'use strict';

const ELEMENT_STATS = new Set(['cold', 'heat', 'toxin', 'electricity']);
function effectValue(effects, stat, active) { return effects.filter(effect => effect.supported && effect.stat === stat && active(effect)).reduce((sum, effect) => sum + effect.value / 100, 0); }
function calculateToridIncarnon({ resolvedMods, riven = [], stacks = {}, evolutions = ['finalFusillade', 'survivorsEdge'] }) {
  const warnings = resolvedMods.filter(mod => mod.status !== 'resolved').flatMap(mod => mod.warnings || []);
  const effects = [...resolvedMods.flatMap(mod => mod.effects || []).filter(effect => effect.supported), ...riven.map(effect => ({ ...effect, supported: true, sourceKind: 'input-riven' }))];
  const baseDamage = 51 + (evolutions.includes('finalFusillade') ? 51 : 0);
  const baseCriticalChance = 0.29 + (evolutions.includes('survivorsEdge') ? 0.15 : 0);
  const baseStatusChance = 0.39 + (evolutions.includes('survivorsEdge') ? 0.15 : 0);
  const active = effect => effect.condition === 'always' || !effect.condition || stacks[effect.condition] === true;
  const damageBonus = effectValue(effects, 'damage', active);
  const criticalChanceBonus = effectValue(effects, 'critical-chance', active);
  const criticalDamageBonus = effectValue(effects, 'critical-damage', active);
  const statusChanceBonus = effectValue(effects, 'status-chance', active);
  const fireRateBonus = effectValue(effects, 'fire-rate', active);
  const multishotBonus = effectValue(effects, 'multishot', active);
  const elements = Object.fromEntries([...ELEMENT_STATS].map(stat => [stat, effectValue(effects, stat, active)]));
  const factionGrineer = effects.filter(e => e.stat === 'faction-grineer').reduce((product, e) => product * (e.multiplier ?? (1 + e.value / 100)), 1);
  const gunCo = effects.find(effect => effect.stat === 'gun-condition-overload' && active(effect));
  return { weapon: 'Torid', mode: 'incarnon', baseDamage, damageBonus, baseDamageMultiplier: 1 + damageBonus, criticalChance: baseCriticalChance * (1 + criticalChanceBonus), criticalMultiplier: 3.1 * (1 + criticalDamageBonus), statusChance: baseStatusChance * (1 + statusChanceBonus), fireRate: 8 * (1 + fireRateBonus), multishot: 1 + multishotBonus, elements, factionMultipliers: { grineer: factionGrineer }, gunCo: gunCo ? { perUniqueStatus: gunCo.value / 100, eligibleFraction: 51 / baseDamage, directOnly: true } : null, warnings, assumptions: ['连续射线从20%伤害在0.6秒升温至100%', '异常与赋能默认从0层开始', 'GunCO只读取托里德灵化原始51基础伤害，不读取二阶+51'] };
}
module.exports = { calculateToridIncarnon };
