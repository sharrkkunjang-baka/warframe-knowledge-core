'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const { createRivenWeaponResolver, compactPinyin, compactPinyinInitials } = require('../src/riven-weapon-resolver');
const aliases = read(path.join(ROOT, 'knowledge', 'facts', 'aliases.json')).weapons;

function collisionRows(groups) {
  return [...groups.entries()].filter(([, identities]) => identities.size > 1).map(([query, identities]) => ({ query, identities: [...identities].sort() }));
}

function build() {
  const official = read(path.join(ROOT, 'knowledge', 'generated', 'official-weapons.json'));
  const market = read(path.join(ROOT, 'knowledge', 'supplemental', 'riven-market-weapons.json'));
  const officialByRef = new Map([...official.weapons, ...official.excludedWeapons].map(item => [item.uniqueName, item]));
  const rows = market.entries.map(item => {
    const identity = officialByRef.get(item.gameRef);
    return { ...item, status: identity ? 'resolved' : 'missing', displayName: identity?.displayName || null, localizationStatus: identity?.localizationStatus || null };
  });
  const groups = Object.fromEntries([...new Set(rows.map(item => item.group))].sort().map(group => {
    const scoped = rows.filter(item => item.group === group);
    return [group, { expected: scoped.length, resolved: scoped.filter(item => item.status === 'resolved').length, missing: scoped.filter(item => item.status === 'missing').map(item => item.canonical), ambiguous: [] }];
  }));
  const resolver = createRivenWeaponResolver(official, aliases, market);
  const fullGroups = new Map(), initialGroups = new Map();
  const pinyinRows = resolver.identities.map(identity => {
    const full = compactPinyin(identity.displayName), generatedInitials = compactPinyinInitials(identity.displayName), initials = generatedInitials.length >= 2 ? generatedInitials : '';
    for (const [map, key] of [[fullGroups, full], [initialGroups, initials]]) if (key) {
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(identity.officialUniqueName);
    }
    return { officialUniqueName: identity.officialUniqueName, canonical: identity.canonical, displayName: identity.displayName, full, initials };
  });
  for (const groups of [fullGroups, initialGroups]) for (const [query, identities] of groups) {
    const resolved = resolver.resolve(query);
    for (const candidate of resolved?.ambiguous || []) identities.add(candidate.officialUniqueName);
  }
  const fullCollisions = collisionRows(fullGroups), initialCollisions = collisionRows(initialGroups);
  const uniqueQueries = (rows, groups, field) => [...new Map(rows.filter(row => groups.get(row[field])?.size === 1).map(row => [row[field], row])).values()];
  const fullUnique = uniqueQueries(pinyinRows, fullGroups, 'full');
  const initialUnique = uniqueQueries(pinyinRows, initialGroups, 'initials');
  const fullUniqueResolved = fullUnique.filter(row => resolver.resolve(row.full)?.officialUniqueName === row.officialUniqueName).length;
  const initialUniqueResolved = initialUnique.filter(row => resolver.resolve(row.initials)?.officialUniqueName === row.officialUniqueName).length;
  const collisionIsAmbiguous = row => {
    const resolved = resolver.resolve(row.query);
    return resolved?.ambiguous?.length > 1 && row.identities.every(identity => resolved.ambiguous.some(candidate => candidate.officialUniqueName === identity));
  };
  const fullCollisionAmbiguous = fullCollisions.filter(collisionIsAmbiguous).length;
  const initialCollisionAmbiguous = initialCollisions.filter(collisionIsAmbiguous).length;
  const kitgunForms = rows.filter(item => item.group === 'kitgun').map(item => {
    const forms = item.dispositions || {};
    const availableForms = ['primary', 'secondary'].filter(form => Number.isFinite(Number(forms[form])));
    return {
      canonical: item.canonical,
      chamberIdentity: item.gameRef,
      availableForms,
      primary: Number.isFinite(Number(forms.primary)) ? Number(forms.primary) : null,
      secondary: Number.isFinite(Number(forms.secondary)) ? Number(forms.secondary) : null,
      differs: availableForms.length === 2 && Number(forms.primary) !== Number(forms.secondary),
      missingForms: ['primary', 'secondary'].filter(form => !availableForms.includes(form))
    };
  });
  const pinyinAudit = {
    total: pinyinRows.length,
    nonEmpty: pinyinRows.filter(row => row.full).length,
    empty: pinyinRows.filter(row => !row.full),
    full: { unique: fullUnique.length, uniqueResolved: fullUniqueResolved, collisions: fullCollisions, collisionsReturnedAmbiguous: fullCollisionAmbiguous },
    initials: { unique: initialUnique.length, uniqueResolved: initialUniqueResolved, collisions: initialCollisions, collisionsReturnedAmbiguous: initialCollisionAmbiguous }
  };
  return { expected: rows.length, resolved: rows.filter(item => item.status === 'resolved').length, missing: rows.filter(item => item.status === 'missing').map(item => item.canonical), ambiguous: [], groups, kitgunForms, pinyinAudit, rows };
}
function run() {
  const report = build();
  console.log(JSON.stringify(report, null, 2));
  const pinyinFailed = report.pinyinAudit.nonEmpty !== report.pinyinAudit.total
    || report.pinyinAudit.full.uniqueResolved !== report.pinyinAudit.full.unique
    || report.pinyinAudit.initials.uniqueResolved !== report.pinyinAudit.initials.unique
    || report.pinyinAudit.full.collisionsReturnedAmbiguous !== report.pinyinAudit.full.collisions.length
    || report.pinyinAudit.initials.collisionsReturnedAmbiguous !== report.pinyinAudit.initials.collisions.length;
  const kitgunFailed = report.kitgunForms.length !== 6
    || report.kitgunForms.some(item => !item.availableForms.length)
    || report.kitgunForms.some(item => item.availableForms.length === 2 && item.primary === item.secondary);
  if (report.groups.zaw?.missing.length || report.groups.kitgun?.missing.length || report.groups.zaw?.ambiguous.length || report.groups.kitgun?.ambiguous.length || kitgunFailed || pinyinFailed) process.exitCode = 1;
  return report;
}
if (require.main === module) run();
module.exports = { build, run };
