'use strict';

const path = require('node:path');
const { normalize } = require('./resolver');
const { TRADABLE_SENTINEL_PRIME_FAMILIES } = require('./companion-variant-family');
const equipmentAcquisition = require('./equipment-acquisition');

const VEHICLES = Object.freeze([
  Object.freeze({
    canonical: 'Amesha',
    displayName: '圣使',
    aliases: Object.freeze(['Amesha', '圣使']),
    category: 'vehicle',
    stableId: 'vehicle:Amesha',
    loaderType: 'vehicle',
    domains: Object.freeze(['acquisition', 'vehicles'])
  }),
  Object.freeze({
    canonical: 'Itzal',
    displayName: '刺影',
    aliases: Object.freeze(['Itzal', '刺影']),
    category: 'vehicle',
    stableId: 'vehicle:Itzal',
    loaderType: 'vehicle',
    domains: Object.freeze(['acquisition', 'vehicles'])
  }),
  Object.freeze({
    canonical: 'Odonata',
    displayName: '陨艇',
    aliases: Object.freeze(['Odonata', '陨艇']),
    category: 'vehicle',
    stableId: 'vehicle:Odonata',
    loaderType: 'vehicle',
    domains: Object.freeze(['acquisition', 'vehicles'])
  }),
  Object.freeze({
    canonical: 'Railjack',
    displayName: '航道星舰',
    aliases: Object.freeze(['深控']),
    category: 'vehicle',
    stableId: 'vehicle:Railjack',
    loaderType: 'vehicle',
    domains: Object.freeze(['acquisition', 'vehicles'])
  })
]);

const DOG_TYPE_ALIASES = Object.freeze({
  kubrow: ['狗', '库伯', '狗子'],
  predasite: ['狗', '狗子']
});

function companionTypeAliases(canonical, displayName, reviewedAliases = []) {
  const name = String(displayName || '').trim();
  const kubrow = name.match(/^(.*?)(?:型)?库狛$/);
  if (kubrow?.[1]) {
    const stems = [...new Set([kubrow[1], name.replace(/库狛$/, '')])];
    return [...DOG_TYPE_ALIASES.kubrow, kubrow[1], `${kubrow[1]}库狛`, ...stems.flatMap(stem => DOG_TYPE_ALIASES.kubrow.map(type => `${stem}${type}`))];
  }
  const predasite = name.match(/^(.*?)扑猎达赛$/);
  if (predasite?.[1]) return [...DOG_TYPE_ALIASES.predasite, predasite[1], ...DOG_TYPE_ALIASES.predasite.map(type => `${predasite[1]}${type}`)];
  if (canonical === 'Helminth Charger') {
    return [...DOG_TYPE_ALIASES.kubrow, ...reviewedAliases.flatMap(prefix => DOG_TYPE_ALIASES.kubrow.map(type => `${prefix}${type}`))];
  }
  return [];
}

function sentinelFamilyByCanonical() {
  const map = new Map();
  for (const family of TRADABLE_SENTINEL_PRIME_FAMILIES) {
    for (const member of [family.base, family.prime]) {
      map.set(normalize(member.canonical), { family, member });
    }
  }
  return map;
}

function memberFamilyAliases(family, member) {
  if (!family?.aliases?.length) return [];
  const isPrime = /\sPrime$/i.test(member.canonical);
  return family.aliases.filter(alias => {
    const value = String(alias || '');
    const mentionsPrime = /prime/i.test(value);
    return isPrime ? mentionsPrime : !mentionsPrime;
  });
}

function loadWarframeItemsCompanions(options = {}) {
  const companionAliases = options.companionAliases || {};
  const companionMainlandNames = options.companionMainlandNames || {};
  const sentinelFamilies = sentinelFamilyByCanonical();
  const root = path.join(__dirname, '..', 'node_modules', 'warframe-items', 'data', 'json');
  let items = [];
  try {
    const i18n = require(path.join(root, 'i18n.json'));
    items = [...require(path.join(root, 'Sentinels.json')), ...require(path.join(root, 'Pets.json'))]
      .filter(item => item?.name && item?.uniqueName)
      .map(item => {
        const familyEntry = sentinelFamilies.get(normalize(item.name));
        const displayName = familyEntry?.member?.displayName || i18n[item.uniqueName]?.zh?.name || item.name;
        const stableId = familyEntry?.member?.stableId || null;
        const reviewedAliases = companionAliases[item.name] || [];
        const aliases = [...new Set([
          item.name,
          displayName,
          ...memberFamilyAliases(familyEntry?.family, familyEntry?.member || { canonical: item.name }),
          companionMainlandNames[item.name],
          ...reviewedAliases,
          ...companionTypeAliases(item.name, displayName, reviewedAliases)
        ].filter(Boolean))];
        const domains = ['acquisition', 'companions'];
        if (stableId?.startsWith('market.')) domains.push('market');
        return Object.freeze({
          stableId,
          canonical: item.name,
          displayName,
          uniqueName: item.uniqueName,
          category: 'companion',
          loaderType: 'companion',
          aliases: Object.freeze(aliases),
          domains: Object.freeze(domains),
          source: familyEntry ? 'companion-variant-family' : 'warframe-items'
        });
      });
  } catch {
    items = [];
  }
  return items;
}

function officialEquipmentIdentities(officialItems = []) {
  return officialItems.flatMap(item => {
    const category = item.semanticKinds?.some(kind => ['companion', 'sentinel'].includes(kind))
      ? 'companion'
      : item.semanticKinds?.some(kind => ['landing-craft', 'archwing', 'ship'].includes(kind))
        ? 'vehicle'
        : null;
    if (!category) return [];
    return [Object.freeze({
      stableId: item.uniqueName || null,
      canonical: item.canonical,
      displayName: item.displayName || item.canonical,
      uniqueName: item.uniqueName || null,
      category,
      loaderType: category,
      aliases: Object.freeze([item.canonical, item.displayName, ...(item.aliases || [])].filter(Boolean)),
      domains: Object.freeze(category === 'vehicle' ? ['acquisition', 'vehicles'] : ['acquisition', 'companions']),
      source: 'official-items'
    })];
  });
}

function catalogEquipmentIdentities() {
  return equipmentAcquisition.CATALOG.map(entry => Object.freeze({
    stableId: entry.id,
    canonical: entry.canonical,
    displayName: entry.displayName,
    uniqueName: null,
    category: entry.kind === 'vehicle' ? 'vehicle' : 'equipment',
    loaderType: entry.kind === 'vehicle' ? 'vehicle' : entry.kind,
    aliases: Object.freeze([entry.canonical, entry.displayName, ...(entry.aliases || [])].filter(Boolean)),
    domains: Object.freeze(['acquisition']),
    source: 'equipment-acquisition'
  }));
}

function mergeIdentityRecords(records) {
  const merged = new Map();
  const priority = { 'companion-variant-family': 4, 'equipment-acquisition': 3, 'official-items': 2, 'warframe-items': 1, 'vehicle-registry': 3 };
  for (const record of records) {
    const key = `${record.category}:${normalize(record.canonical)}`;
    const current = merged.get(key);
    if (!current || (priority[record.source] || 0) >= (priority[current.source] || 0)) {
      merged.set(key, {
        ...record,
        aliases: [...new Set([...(current?.aliases || []), ...(record.aliases || [])])],
        domains: [...new Set([...(current?.domains || []), ...(record.domains || [])])],
        stableId: record.stableId || current?.stableId || null,
        uniqueName: record.uniqueName || current?.uniqueName || null,
        displayName: (priority[record.source] || 0) >= (priority[current?.source] || 0) ? record.displayName : current.displayName
      });
    } else {
      merged.set(key, {
        ...current,
        aliases: [...new Set([...(current.aliases || []), ...(record.aliases || [])])],
        domains: [...new Set([...(current.domains || []), ...(record.domains || [])])],
        stableId: current.stableId || record.stableId || null,
        uniqueName: current.uniqueName || record.uniqueName || null
      });
    }
  }
  return [...merged.values()].map(record => Object.freeze({
    ...record,
    aliases: Object.freeze(record.aliases),
    domains: Object.freeze(record.domains)
  }));
}

// Reviewed companion families (for example modular companion categories) may
// have no finished-item row in warframe-items. Keep their identity and aliases
// in this shared registry without inventing an official uniqueName or acquisition.
function reviewedCompanionIdentities(options = {}) {
  return Object.entries(options.companionAliases || {}).map(([canonical, aliases]) => Object.freeze({
    stableId: 'companion:' + canonical,
    canonical,
    displayName: options.companionMainlandNames?.[canonical] || canonical,
    uniqueName: null,
    category: 'companion',
    loaderType: 'companion',
    aliases: Object.freeze([...new Set([canonical, options.companionMainlandNames?.[canonical], ...(Array.isArray(aliases) ? aliases : [])].filter(Boolean))]),
    domains: Object.freeze(['companions']),
    source: 'reviewed-companion'
  }));
}

function listEquipmentIdentities(options = {}) {
  const vehicleAliases = options.vehicleAliases || {};
  const companions = loadWarframeItemsCompanions(options);
  const knownCompanions = new Set(companions.map(identity => normalize(identity.canonical)));
  const records = mergeIdentityRecords([
    ...companions,
    ...reviewedCompanionIdentities(options).filter(identity => !knownCompanions.has(normalize(identity.canonical))),
    ...officialEquipmentIdentities(options.officialItems || []),
    ...catalogEquipmentIdentities(),
    ...VEHICLES
  ]);
  return Object.freeze(records.map(record => record.category === 'vehicle'
    ? Object.freeze({
      ...record,
      aliases: Object.freeze([...new Set([...(record.aliases || []), ...(vehicleAliases[record.canonical] || [])])])
    })
    : record));
}

function equipmentNameCandidates(identities) {
  return identities.flatMap(identity => identity.aliases.map(alias => ({
    alias,
    canonical: identity.canonical,
    category: identity.category === 'equipment' ? 'official-item' : identity.category,
    priority: identity.source === 'companion-variant-family' ? 38 : identity.category === 'companion' ? 36 : 32
  })));
}

function resolveEquipmentIdentity(query, options = {}) {
  const key = normalize(query);
  if (!key) return null;
  const identities = options.identities || listEquipmentIdentities(options);
  // Stable registry ids and official ids describe the same entity. Resolve
  // them before human aliases, without sending identifiers through fuzziness.
  const byId = identities.find(identity => [identity.stableId, identity.uniqueName].some(id => id && String(id) === String(query).trim()));
  if (byId) return byId;
  const exact = identities.filter(identity => identity.aliases.some(alias => normalize(alias) === key));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const canonicals = [...new Set(exact.map(item => item.canonical))];
    if (canonicals.length === 1) return exact[0];
    return { ambiguous: exact, category: exact[0].category };
  }
  const prefix = identities.filter(identity => identity.aliases.some(alias => {
    const aliasKey = normalize(alias);
    return key.startsWith(aliasKey);
  }));
  if (prefix.length === 1) return prefix[0];
  return null;
}

function knowledgeLoaderRowsFromIdentities(identities) {
  const rows = [];
  for (const identity of identities) {
    const base = {
      title: identity.displayName || identity.canonical,
      displayName: identity.displayName || identity.canonical,
      canonical: identity.canonical,
      stableId: identity.stableId || identity.uniqueName || null,
      aliases: [...identity.aliases],
      type: identity.loaderType || identity.category
    };
    for (const domain of identity.domains) rows.push({ ...base, domain });
  }
  return rows;
}

module.exports = {
  VEHICLES,
  listEquipmentIdentities,
  equipmentNameCandidates,
  resolveEquipmentIdentity,
  knowledgeLoaderRowsFromIdentities
};
