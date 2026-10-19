'use strict';

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function exactMatch(item, query) {
  const key = normalize(query);
  return key && [item?.canonical, item?.displayName].some(value => normalize(value) === key);
}

function nestedMethods(value, output = [], visited = new Set()) {
  if (!value || typeof value !== 'object' || visited.has(value)) return output;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) nestedMethods(item, output, visited);
    return output;
  }
  if (value.type === 'vendor-or-syndicate-exchange') output.push(value);
  for (const child of Object.values(value)) nestedMethods(child, output, visited);
  return output;
}

function compatibleVendorMod(query, options) {
  const aliases = options.accessoryAliases || {};
  const aliasTarget = aliases[normalize(query)] || query;
  const weapon = (options.weapons || []).find(item => exactMatch(item?.subject || item, aliasTarget));
  if (!weapon) return null;
  const subject = weapon.subject || weapon;
  const canonicalPrefix = `${normalize(subject.canonical)}`;
  const displayPrefix = `${normalize(subject.displayName)}`;
  return (options.knowledge || []).find(entry => {
    if (entry?.subject?.category !== 'mod') return false;
    const canonical = normalize(entry.subject.canonical);
    const display = normalize(entry.subject.displayName);
    const compatible = (canonicalPrefix && canonical.startsWith(canonicalPrefix) && canonical !== canonicalPrefix)
      || (displayPrefix && display.startsWith(displayPrefix) && display !== displayPrefix);
    return compatible && nestedMethods(entry).length > 0;
  }) || null;
}

function resolveAccessory(query, options = {}) {
  const key = normalize(query);
  if (!key) return null;

  const modular = (options.excludedOfficialWeapons || []).find(item =>
    exactMatch(item, query)
    && /\/Weapons\/(?:SolarisUnited\/Secondary\/.+\/Barrel|Infested\/Pistols\/InfKitGun\/Barrels)\/.+Part$/iu.test(String(item.uniqueName || ''))
  );
  if (modular) {
    const infested = /\/Weapons\/Infested\/Pistols\/InfKitGun\/Barrels\/.+Part$/iu.test(String(modular.uniqueName || ''));
    return Object.freeze({
      kind: 'vendor',
      identity: Object.freeze({ canonical: modular.canonical, displayName: modular.displayName || modular.canonical, uniqueName: modular.uniqueName }),
      npcId: infested ? 'npc.father' : 'npc.rude-zuud',
      locationId: infested ? 'hub.necralisk' : 'hub.fortuna',
      text: infested ? '殁世幽都的父亲' : '福尔图娜的 ZUUD'
    });
  }

  const vendorMod = compatibleVendorMod(query, options);
  if (vendorMod) {
    const method = nestedMethods(vendorMod)[0];
    return Object.freeze({
      kind: 'vendor',
      identity: Object.freeze({ canonical: vendorMod.subject.canonical, displayName: vendorMod.subject.displayName, uniqueName: vendorMod.officialUniqueName || null }),
      npcId: method.sourceEntityId || method.requirements?.npcId || null,
      locationId: method.locationId || method.requirements?.locationId || null,
      text: method.sourceEntityId === 'acquisition-source.koumei-shrine' ? '希图斯的 Koumei 神龛' : vendorMod.subject.displayName
    });
  }

  const frameComponent = options.frameComponents?.get(key);
  if (frameComponent) {
    const parent = frameComponent.frame?.subject || {};
    return Object.freeze({
      kind: /\bPrime$/iu.test(String(parent.canonical || '')) ? 'prime-part' : 'parent-acquisition',
      identity: Object.freeze({ canonical: frameComponent.canonical, displayName: frameComponent.displayName, uniqueName: frameComponent.component?.officialUniqueName || null }),
      parent: Object.freeze({ canonical: parent.canonical, displayName: parent.displayName || parent.canonical })
    });
  }

  const weaponComponent = options.weaponComponents?.get(key);
  if (weaponComponent) {
    const parent = weaponComponent.weapon?.subject || {};
    const ingredient = weaponComponent.ingredient || {};
    return Object.freeze({
      kind: /\bPrime$/iu.test(String(parent.canonical || '')) ? 'prime-part' : 'parent-acquisition',
      identity: Object.freeze({ canonical: ingredient.canonical, displayName: ingredient.displayName || ingredient.canonical, uniqueName: ingredient.uniqueName || null }),
      parent: Object.freeze({ canonical: parent.canonical, displayName: parent.displayName || parent.canonical })
    });
  }
  const weapon = (options.weapons || []).find(item => exactMatch(item?.subject || item, query));
  if (weapon) {
    const subject = weapon.subject || weapon;
    return Object.freeze({
      kind: 'parent-acquisition',
      identity: Object.freeze({ canonical: subject.canonical, displayName: subject.displayName || subject.canonical, uniqueName: subject.officialUniqueName || subject.uniqueName || null }),
      parent: Object.freeze({ canonical: subject.canonical, displayName: subject.displayName || subject.canonical })
    });
  }
  return null;
}

module.exports = { normalizeAccessory: normalize, resolveAccessory };
