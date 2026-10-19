'use strict';
// Reviewed DE announcements take precedence over cached and live upstream values.
const rules = require('../knowledge/reviewed/ducat-values.json').entries;
const key = value => String(value || '').normalize('NFKC').trim().toLowerCase();
const byId = new Map(rules.map(row => [key(row.uniqueName), row]));
const bySlug = new Map(rules.map(row => [key(row.marketSlug), row]));
const byName = new Map(rules.map(row => [key(row.canonical), row]));
function ducatOverride(identity) {
  if (!identity) return null;
  if (typeof identity === 'string') return byId.get(key(identity)) || bySlug.get(key(identity)) || byName.get(key(identity)) || null;
  const stable = identity.uniqueName || identity.gameRef || identity.officialUniqueName;
  if (stable && byId.has(key(stable))) return byId.get(key(stable));
  const slug = identity.marketSlug || identity.slug || identity.wfmSlug;
  if (slug && bySlug.has(key(slug))) return bySlug.get(key(slug));
  return byName.get(key(identity.canonical || identity.name || identity.i18n?.en?.name)) || null;
}
function resolveDucatValue(identity, fallback) {
  const reviewed = ducatOverride(identity);
  if (reviewed) return reviewed.ducats;
  return fallback != null && Number.isFinite(Number(fallback)) ? Number(fallback) : null;
}
// Apply to structured snapshots only. Unrelated numbers, prices and drop chances stay intact.
function applyDucatOverrides(value, identityKey) {
  if (!value || typeof value !== 'object') return value;
  if (!Array.isArray(value)) {
    const reviewed = ducatOverride(value) || ducatOverride(identityKey);
    if (reviewed) for (const field of ['ducats','primeSellingPrice','ducatValue']) {
      if (Object.hasOwn(value, field)) value[field] = reviewed.ducats;
    }
  }
  for (const [k, child] of Object.entries(value)) applyDucatOverrides(child, k);
  return value;
}
module.exports = {ducatOverride, resolveDucatValue, applyDucatOverrides};
