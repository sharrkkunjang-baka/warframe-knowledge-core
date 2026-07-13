'use strict';

function freezeDto(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDto(child);
  return value;
}

function createAcquisitionEvidence(input = {}) {
  if (!input.type || !input.source) throw new TypeError('AcquisitionEvidence requires type and source');
  return freezeDto({
    type: input.type,
    source: input.source,
    sourceId: input.sourceId || null,
    locationId: input.locationId || null,
    vendorId: input.vendorId || null,
    currencyId: input.currencyId || null,
    chance: input.chance ?? null,
    quantity: input.quantity ?? null,
    verified: input.verified !== false,
    note: input.note || null
  });
}

function createAcquisitionResult(input = {}) {
  return freezeDto({
    query: String(input.query || ''),
    item: input.item || null,
    evidence: (input.evidence || []).map(createAcquisitionEvidence),
    recipeVariants: input.recipeVariants || [],
    status: input.status || (input.item ? 'resolved' : 'not-found'),
    notes: input.notes || []
  });
}

function createRenderResult(input = {}) {
  return freezeDto({
    text: String(input.text || ''),
    acquisition: input.acquisition || null,
    sections: input.sections || [],
    warnings: input.warnings || []
  });
}

module.exports = { createAcquisitionEvidence, createAcquisitionResult, createRenderResult };
