'use strict';

const WEAPON_FAMILIES = Object.freeze([
  { id: 'melee', compat: 'Melee', canonicalStem: 'Smite', displayStem: '毁灭', aliases: ['近战'] },
  { id: 'rifle', compat: 'Rifle', canonicalStem: 'Bane Of', displayStem: '灭亡', aliases: ['步枪'] },
  { id: 'shotgun', compat: 'Shotgun', canonicalStem: 'Cleanse', displayStem: '净化', aliases: ['霰弹'] },
  { id: 'pistol', compat: 'Pistol', canonicalStem: 'Expel', displayStem: '驱逐', aliases: ['手枪', '次要', '副手'] }
]);
const FACTIONS = Object.freeze({
  g: { id: 'grineer', canonical: 'Grineer', stableIdentity: 'Grineer' },
  c: { id: 'corpus', canonical: 'Corpus', stableIdentity: 'Corpus' },
  i: { id: 'infested', canonical: 'Infested', stableIdentity: 'Infested' },
  o: { id: 'orokin', canonical: 'Orokin', stableIdentity: 'Corrupted' }
});
const SUFFIXES = Object.freeze(['骑士', '歧视', '骑']);
const compact = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');

function buildFactionDamageModSlangIndex(mods) {
  const relations = [], audit = [];
  for (const family of WEAPON_FAMILIES) for (const [factionCode, faction] of Object.entries(FACTIONS)) {
    const canonical = `Primed ${family.canonicalStem} ${faction.canonical}`;
    const candidates = (mods || []).filter(mod => mod.compatName === family.compat
      && mod.traits?.prime === true
      && /\/Expert\//i.test(mod.uniqueName || '')
      && !/\/(?:Beginner|Flawed)\//i.test(mod.uniqueName || '')
      && compact(mod.canonical) === compact(canonical)
      && new RegExp(`${faction.stableIdentity}(?:Expert)?$`, 'i').test(mod.uniqueName || ''));
    const status = candidates.length === 1 ? 'resolved' : candidates.length ? 'ambiguous' : 'missing';
    audit.push({ family: family.id, category: family.aliases[0], faction: faction.id, factionCode, status, candidates: candidates.map(mod => ({ canonical: mod.canonical, displayName: mod.displayName, uniqueName: mod.uniqueName })) });
    if (status !== 'resolved') continue;
    const mod = candidates[0];
    relations.push({
      canonical: mod.canonical,
      displayName: mod.displayName,
      uniqueName: mod.uniqueName,
      category: family.aliases[0],
      categoryId: family.id,
      faction: faction.canonical,
      factionId: faction.id,
      factionCode,
      variant: 'prime',
      source: 'automatic-official-catalog'
    });
  }
  return {
    schemaVersion: 1,
    catalogCount: (mods || []).length,
    families: WEAPON_FAMILIES,
    factions: FACTIONS,
    relations,
    audit,
    counts: {
      resolved: audit.filter(item => item.status === 'resolved').length,
      missing: audit.filter(item => item.status === 'missing').length,
      ambiguous: audit.filter(item => item.status === 'ambiguous').length
    }
  };
}

function createFactionDamageModSlangResolver(mods) {
  const index = buildFactionDamageModSlangIndex(mods);
  const exact = new Map();
  for (const relation of index.relations) {
    const family = WEAPON_FAMILIES.find(item => item.id === relation.categoryId);
    for (const categoryAlias of family.aliases) for (const suffix of SUFFIXES) {
      exact.set(compact(`${categoryAlias}${relation.factionCode}${suffix}`), relation);
    }
  }
  function resolve(query) {
    const relation = exact.get(compact(query)) || null;
    return relation
      ? { status: 'resolved', query: String(query), relation, candidates: [relation] }
      : { status: 'missing', query: String(query), candidates: [] };
  }
  return { index, resolve };
}

module.exports = { WEAPON_FAMILIES, FACTIONS, SUFFIXES, buildFactionDamageModSlangIndex, createFactionDamageModSlangResolver };
