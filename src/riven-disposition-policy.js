'use strict';
const policy = require('../knowledge/facts/riven-disposition-policy.json');
const previousDispositions = require('../knowledge/facts/riven-disposition-previous.json').entries;
function previousRivenDisposition(uniqueName) { return previousDispositions[uniqueName] || null; }
function effectiveRivenDisposition(value) { return policy.mode === 'uniform' ? policy.value : value; }
function applyRivenDispositionPolicy(entry) {
  const result = { ...entry };
  if ('disposition' in result) result.disposition = effectiveRivenDisposition(result.disposition);
  if ('omegaAttenuation' in result && result.omegaAttenuation != null) result.omegaAttenuation = effectiveRivenDisposition(result.omegaAttenuation);
  if (result.dispositions || result.group === 'kitgun' || result.modularFamily === 'kitgun') result.dispositions = Object.fromEntries(['primary','secondary'].map(form => [form, effectiveRivenDisposition(result.dispositions?.[form])]));
  return result;
}
module.exports = { policy, effectiveRivenDisposition, applyRivenDispositionPolicy, previousRivenDisposition };
