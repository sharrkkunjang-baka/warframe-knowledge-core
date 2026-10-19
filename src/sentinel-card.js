'use strict';

// Sentinel identity and acquisition remain distinct from frames. The runtime
// adapts this DTO to the existing frame-style acquisition layout.
const path = require('node:path');
const itemRoot = path.join(__dirname, '..', 'node_modules', 'warframe-items', 'data', 'json');
const sentinels = require(path.join(itemRoot, 'Sentinels.json'));
const translations = require(path.join(itemRoot, 'i18n.json'));
const byId = new Map(sentinels.map(item => [item.uniqueName, item]));

function buildSentinelCard(acquisition) {
  const subject = acquisition?.entry?.subject;
  if (!subject?.categoryRefs?.includes('companion.sentinel')) return null;
  const identity = {
    canonical: subject.canonical,
    displayName: subject.displayName,
    uniqueName: subject.officialUniqueName
  };
  const item = byId.get(identity.uniqueName);
  const ingredients = (item?.components || [])
    .filter(component => component.name !== 'Blueprint')
    .map(component => ({
      uniqueName: component.uniqueName,
      canonical: component.name,
      displayName: translations[component.uniqueName]?.zh?.name || component.name,
      count: component.itemCount,
      quantity: component.itemCount
    }));
  const recipes = ingredients.length ? [{
    uniqueName: identity.uniqueName,
    canonical: identity.canonical,
    displayName: identity.displayName,
    credits: item.buildPrice,
    buildSeconds: item.buildTime,
    ingredients
  }] : [];
  const acquisitionText = acquisition.description || '';
  return {
    schemaVersion: 1,
    renderKind: 'sentinel-card',
    kind: 'companion',
    categoryRefs: [...subject.categoryRefs],
    identity,
    acquisitionText,
    sections: { acquisition: acquisitionText.split(/\r?\n/u).filter(Boolean) },
    recipes,
    provenance: { source: 'sentinel-acquisition / warframe-items' }
  };
}

module.exports = { buildSentinelCard };

