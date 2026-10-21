'use strict';

const EFFECTS_TOKEN = '{effects}';
const tokenPattern = /\{effects(?:\.(\d+)(?:\.(value|absValue|displayName|unit))?)?\}/g;

function formatModEffect(effect) {
  const name = String(effect?.displayName || '').trim();
  if (!name) throw new Error('Mod effect is missing displayName');
  // Complete owner-written sentences already contain their values.
  if (/[+\-\d%]/.test(name)) return name;
  const value = effect.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return name;
  const unit = String(effect.unit || '');
  if (unit === 'x' || unit === '×') return `${unit}${value} ${name}`;
  return `${value > 0 ? '+' : ''}${value}${unit} ${name}`;
}

function modEffectLines(entry) {
  const details = entry?.effectDetails;
  const source = () => (entry.effects || []).map(formatModEffect);
  if (!Array.isArray(details) || !details.length) return source();
  let lines;
  const effects = () => lines ||= source();
  return details.flatMap(detail => {
    if (detail === EFFECTS_TOKEN) {
      if (!effects().length) throw new Error(`${entry.id}: {effects} has no source`);
      return effects();
    }
    return String(detail).replace(tokenPattern, (_token, index, field) => {
      if (field) {
        const effect = entry.effects?.[Number(index)];
        if (!effect) throw new Error(`${entry.id}: invalid effects index ${index}`);
        const value = field === "absValue" ? Math.abs(effect.value) : effect[field];
        if (value === undefined || (typeof value === "number" && !Number.isFinite(value))) throw new Error(`${entry.id}: invalid effects field ${field}`);
        return String(value);
      }
      if (index === undefined) return effects().join('；');
      const value = effects()[Number(index)];
      if (value === undefined) throw new Error(`${entry.id}: invalid effects index ${index}`);
      return value;
    });
  });
}

function hydrateModEntry(entry) {
  if (entry?.subject?.category !== 'mod') return entry;
  if (!(entry.effectDetails || []).some(line => /\{effects(?:\.\d+(?:\.(?:value|absValue|displayName|unit))?)?\}/.test(line))) return entry;
  return { ...entry, effectDetails: modEffectLines(entry) };
}

module.exports = { EFFECTS_TOKEN, formatModEffect, modEffectLines, hydrateModEntry };
