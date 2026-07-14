'use strict';

function mulberry32(seed) { return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function grineerHealth(level, baseLevel, baseHealth, steelPath) { const d = level - baseLevel; const multiplier = d > 80 ? 1 + 10.7332 * d ** 0.72 : 1 + 0.015 * d ** 2.12; return baseHealth * multiplier * (steelPath ? 2.5 : 1); }
function enemyArmor(level, baseLevel, baseArmor) { const d = level - baseLevel; const multiplier = d > 80 ? 1 + 0.4 * d ** 0.75 : 1 + 0.005 * d ** 1.75; return Math.min(2700, Math.max(200, baseArmor * multiplier)); }
function armorTaken(armor) { return 1 - 0.9 * Math.max(0, Math.min(2700, armor)) / 2700; }
function viralMultiplier(stacks) { return stacks ? 2 + 0.25 * (Math.min(stacks, 10) - 1) : 1; }
function corrosiveStrip(stacks) { return stacks ? Math.min(0.8, 0.2 + 0.06 * stacks) : 0; }
function heatStrip(elapsed) { if (elapsed < 0.5) return 0; if (elapsed < 1) return 0.15; if (elapsed < 1.5) return 0.3; if (elapsed < 2) return 0.4; return 0.5; }
function quantize(value, baseDamage) { const scale = baseDamage / 32; return Math.round(value / scale) * scale; }
function percentile(sorted, p) { return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]; }

function composeDamage(stats, composition) {
  const primary = stats.elements;
  const base = stats.baseDamage;
  const parts = composition.map(type => {
    if (type === 'viral') return { type, value: quantize(base * (1 + primary.cold + primary.toxin), base) };
    if (type === 'corrosive') return { type, value: quantize(base * (primary.electricity + primary.toxin), base) };
    if (type === 'blast') return { type, value: quantize(base * (primary.cold + primary.heat), base) };
    if (type === 'radiation') return { type, value: quantize(base * (primary.electricity + primary.heat), base) };
    if (type === 'magnetic') return { type, value: quantize(base * (primary.cold + primary.electricity), base) };
    if (type === 'gas') return { type, value: quantize(base * (primary.heat + primary.toxin), base) };
    if (['cold', 'heat', 'toxin', 'electricity'].includes(type)) return { type, value: quantize(base * primary[type], base) };
    throw new Error(`不支持的伤害组成：${type}`);
  });
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (total <= 0) throw new Error('元素组成没有产生伤害；请检查 Mod 顺序/伤害组成。');
  return parts.map(part => ({ ...part, weight: part.value / total }));
}

function simulateToridIncarnon({ stats, target, composition, trials = 10000, seed = 20260714, primaryFrostbite = false }) {
  const damageParts = composeDamage(stats, composition);
  const random = mulberry32(seed);
  const health = grineerHealth(target.level, 8, 1000, target.steelPath !== false);
  const initialArmor = enemyArmor(target.level, 8, 1000);
  const faction = stats.factionMultipliers.grineer ?? 1;
  const times = [], viral10Times = [], corrosive10Times = [], cold10Times = [], firstHeatTimes = [], frostbiteAtDeath = [];
  for (let trial = 0; trial < trials; trial++) {
    let hp = health, time = 0, viral = 0, corrosive = 0, cold = 0, frostbite = 0, firstHeat = null, nextHeatTick = null;
    const heatProcs = [];
    const tickDuration = 1 / stats.fireRate;
    while (hp > 0 && time < 120) {
      if (nextHeatTick !== null) while (nextHeatTick <= time + 1e-12 && hp > 0) {
        const strip = firstHeat === null ? 0 : heatStrip(nextHeatTick - firstHeat);
        const armor = initialArmor * (1 - corrosiveStrip(corrosive)) * (1 - strip);
        hp -= heatProcs.reduce((sum, proc) => sum + proc, 0) * viralMultiplier(viral) * armorTaken(armor) * faction;
        nextHeatTick += 1;
      }
      if (hp <= 0) break;
      const ramp = Math.min(1, 0.2 + 0.8 * time / 0.6);
      const frostbiteMultishot = primaryFrostbite ? 0.0225 * frostbite : 0;
      const expectedMultishot = stats.multishot + frostbiteMultishot;
      const projectiles = Math.floor(expectedMultishot) + (random() < expectedMultishot % 1 ? 1 : 0);
      const frostbiteCriticalDamage = primaryFrostbite ? 0.03 * frostbite : 0;
      const coldCriticalDamage = cold ? (cold >= 10 ? 1 : 0.1 + 0.05 * (cold - 1)) : 0;
      const criticalMultiplier = stats.criticalMultiplier + 3.1 * frostbiteCriticalDamage + coldCriticalDamage;
      const tier = Math.floor(stats.criticalChance) + (random() < stats.criticalChance % 1 ? 1 : 0);
      const crit = 1 + tier * (criticalMultiplier - 1);
      const uniqueStatuses = Number(viral > 0) + Number(corrosive > 0) + Number(cold > 0) + Number(firstHeat !== null);
      const gunCoBonus = stats.gunCo ? stats.gunCo.perUniqueStatus * stats.gunCo.eligibleFraction * uniqueStatuses : 0;
      const baseFactor = stats.baseDamageMultiplier + gunCoBonus;
      const armor = initialArmor * (1 - corrosiveStrip(corrosive)) * (1 - (firstHeat === null ? 0 : heatStrip(time - firstHeat)));
      let direct = 0;
      for (const part of damageParts) {
        const factionWeakness = part.type === 'corrosive' ? 1.5 : 1;
        direct += part.value * factionWeakness;
      }
      hp -= direct * baseFactor * projectiles * crit * ramp * faction * viralMultiplier(viral) * armorTaken(armor);
      if (hp <= 0) { time += tickDuration; break; }
      const expectedProcs = projectiles * stats.statusChance;
      const procCount = Math.floor(expectedProcs) + (random() < expectedProcs % 1 ? 1 : 0);
      for (let i = 0; i < procCount; i++) {
        let roll = random(), selected = damageParts.at(-1);
        for (const part of damageParts) { roll -= part.weight; if (roll <= 0) { selected = part; break; } }
        if (selected.type === 'viral' && viral < 10) { viral++; if (viral === 10) viral10Times.push(time); }
        if (selected.type === 'corrosive' && corrosive < 10) { corrosive++; if (corrosive === 10) corrosive10Times.push(time); }
        if (selected.type === 'cold' && cold < 10) { cold++; if (primaryFrostbite) frostbite = Math.min(40, frostbite + 1); if (cold === 10) cold10Times.push(time); }
        if (selected.type === 'heat') {
          if (firstHeat === null) { firstHeat = time; firstHeatTimes.push(time); nextHeatTick = time + 1; }
          heatProcs.push(0.5 * stats.baseDamage * baseFactor * projectiles * (1 + stats.elements.heat) * crit * ramp * faction);
        }
      }
      time += tickDuration;
    }
    times.push(time); frostbiteAtDeath.push(frostbite);
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
  const avg = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return { target: { ...target, health, armor: initialArmor }, trials, seed, composition: damageParts, ttk: { mean, median: percentile(times, 0.5), p10: percentile(times, 0.1), p90: percentile(times, 0.9) }, dps: health / mean, timeline: { viral10: avg(viral10Times), corrosive10: avg(corrosive10Times), cold10: avg(cold10Times), firstHeat: avg(firstHeatTimes), frostbiteAtDeath: avg(frostbiteAtDeath) }, assumptions: [...stats.assumptions, '状态在造成该次命中后施加，只影响后续伤害', '主要·霜冻从0层开始并随冰异常逐层建立'] };
}

module.exports = { simulateToridIncarnon, grineerHealth, enemyArmor, armorTaken, composeDamage };
