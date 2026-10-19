'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalize } = require('./resolver');

// 复核俗称以 knowledge/facts/aliases.json 为权威（与战甲、武器共用同一张表）。
// 俗称只登记数据，不在代码里逐个守护开特例：这里把 companions / companionMainlandNames
// 合并进别名索引，新增俗称不需要改代码。
const KNOWLEDGE_ROOT = path.resolve(__dirname, '..', 'knowledge');
const ALIAS_FACTS_PATH = path.join(KNOWLEDGE_ROOT, 'facts', 'aliases.json');
const ALIAS_FACTS = (() => {
  try { return JSON.parse(fs.readFileSync(ALIAS_FACTS_PATH, 'utf8')); } catch (_) { return {}; }
})();
function sharedCompanionAliases(canonical) {
  const list = ALIAS_FACTS?.companions?.[canonical];
  return Array.isArray(list) ? list : [];
}

const COMPANION_VARIANT_KIND = value => (/\sPrime$/i.test(String(value || '')) ? 'prime' : 'base');

const TRADABLE_SENTINEL_PRIME_FAMILIES = Object.freeze([
  {
    base: Object.freeze({ canonical: 'Helios', displayName: '赫利俄斯', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/HeliosPowerSuit', stableId: 'market.sentinel.helios' }),
    prime: Object.freeze({ canonical: 'Helios Prime', displayName: '赫利俄斯 Prime', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrimeHeliosPowerSuit', stableId: 'market.sentinel.helios-prime', marketSetSlug: 'helios_prime_set' }),
    aliases: Object.freeze(['赫利俄斯', 'Helios', '赫利俄斯Prime', 'Helios Prime'])
  },
  {
    base: Object.freeze({ canonical: 'Carrier', displayName: '搬运者', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/CarrierPowerSuit', stableId: 'market.sentinel.carrier' }),
    prime: Object.freeze({ canonical: 'Carrier Prime', displayName: '搬运者 Prime', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrimeCarrierPowerSuit', stableId: 'market.sentinel.carrier-prime', marketSetSlug: 'carrier_prime_set' }),
    aliases: Object.freeze(['搬运者', 'Carrier', '搬运者Prime', 'Carrier Prime'])
  },
  {
    base: Object.freeze({ canonical: 'Dethcube', displayName: '死亡魔方', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/DethCubePowerSuit', stableId: 'market.sentinel.dethcube' }),
    prime: Object.freeze({ canonical: 'Dethcube Prime', displayName: '死亡魔方 Prime', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrimeDethCubePowerSuit', stableId: 'market.sentinel.dethcube-prime', marketSetSlug: 'dethcube_prime_set' }),
    aliases: Object.freeze(['死亡魔方', 'Dethcube', '死亡魔方Prime', 'Dethcube Prime'])
  },
  {
    base: Object.freeze({ canonical: 'Wyrm', displayName: '蛟龙', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/WyrmPowerSuit', stableId: 'market.sentinel.wyrm' }),
    prime: Object.freeze({ canonical: 'Wyrm Prime', displayName: '蛟龙 Prime', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrimeWyrmPowerSuit', stableId: 'market.sentinel.wyrm-prime', marketSetSlug: 'wyrm_prime_set' }),
    aliases: Object.freeze(['蛟龙', 'Wyrm', '蛟龙Prime', 'Wyrm Prime'])
  },
  {
    base: Object.freeze({ canonical: 'Shade', displayName: '阴影', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/ShadePowerSuit', stableId: 'market.sentinel.shade' }),
    prime: Object.freeze({ canonical: 'Shade Prime', displayName: '阴影 Prime', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrimeShadePowerSuit', stableId: 'market.sentinel.shade-prime', marketSetSlug: 'shade_prime_set' }),
    aliases: Object.freeze(['阴影', 'Shade', '阴影Prime', 'Shade Prime'])
  },
  {
    base: Object.freeze({ canonical: 'Nautilus', displayName: '鹦鹉螺', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/EmpyreanSentinelPowerSuit', stableId: 'market.sentinel.nautilus' }),
    prime: Object.freeze({ canonical: 'Nautilus Prime', displayName: '鹦鹉螺 Prime', uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/NautilusPrimeSentinelPowerSuit', stableId: 'market.sentinel.nautilus-prime', marketSetSlug: 'nautilus_prime_set' }),
    aliases: Object.freeze(['鹦鹉螺', 'Nautilus', '鹦鹉螺Prime', '鹦鹉螺 Prime', 'Nautilus Prime'])
  }
]);

const aliasIndex = new Map();
for (const family of TRADABLE_SENTINEL_PRIME_FAMILIES) {
  for (const alias of family.aliases) aliasIndex.set(normalize(alias), family);
  aliasIndex.set(normalize(family.base.canonical), family);
  aliasIndex.set(normalize(family.prime.canonical), family);
  if (family.base.displayName) aliasIndex.set(normalize(family.base.displayName), family);
  if (family.prime.displayName) aliasIndex.set(normalize(family.prime.displayName), family);
  // 共享复核表里的俗称（如 Helios 的「照相机」「摄像头」「拍照」）与国服正式名。
  for (const key of [family.base.canonical, family.prime.canonical]) {
    for (const alias of sharedCompanionAliases(key)) aliasIndex.set(normalize(alias), family);
  }
  const mainlandName = ALIAS_FACTS?.companionMainlandNames?.[family.base.canonical];
  if (mainlandName) aliasIndex.set(normalize(mainlandName), family);
}

function companionFamilyKey(canonical) {
  return String(canonical || '').replace(/\sPrime$/i, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveCompanionFamily(query) {
  const raw = String(query || '').normalize('NFKC').trim().replace(/^普通/u, '').trim();
  if (!raw) return null;
  return aliasIndex.get(normalize(raw)) || null;
}

function buildCompanionVariantFamily(family) {
  if (!family) return null;
  return Object.freeze({
    identity: Object.freeze({ ...family.base, variantKind: 'base', category: 'companion' }),
    members: Object.freeze([
      Object.freeze({ ...family.base, variantKind: 'base', category: 'companion' }),
      Object.freeze({ ...family.prime, variantKind: 'prime', category: 'companion', marketSetSlug: family.prime.marketSetSlug })
    ]),
    prime: Object.freeze({ ...family.prime, variantKind: 'prime', category: 'companion', marketSetSlug: family.prime.marketSetSlug }),
    alternatives: Object.freeze([])
  });
}

function getCompanionVariantFamily(query) {
  return buildCompanionVariantFamily(resolveCompanionFamily(query));
}

function stripCompactPrimeSuffix(value) {
  const raw = String(value || '').normalize('NFKC').trim();
  const match = raw.match(/^(.*?)(?:\s+prime|prime|\s+p|p)$/iu);
  if (!match?.[1]?.trim()) return null;
  return Object.freeze({ raw, base: match[1].trim() });
}

function resolveCompanionVariantIntent(query) {
  const raw = String(query || '').normalize('NFKC').trim();
  if (!raw) return null;
  const primeInput = stripCompactPrimeSuffix(raw.replace(/^普通/u, '').trim());
  const family = resolveCompanionFamily(primeInput?.base || raw.replace(/^普通/u, '').trim());
  if (!family) return null;
  const variantFamily = buildCompanionVariantFamily(family);
  if (!variantFamily) return null;
  const primeIntent = Boolean(primeInput) || /\bPrime\b/i.test(raw);
  const target = primeIntent ? variantFamily.prime : variantFamily.identity;
  const matches = primeIntent ? [variantFamily.prime] : [variantFamily.identity];
  return Object.freeze({
    query: raw,
    family: variantFamily,
    constraints: primeIntent ? ['prime'] : [],
    matches,
    ambiguous: false,
    identity: target
  });
}

function resolveCompanionPrimeVariantIntent(query) {
  const variant = resolveCompanionVariantIntent(query);
  if (!variant?.family?.prime) return null;
  return Object.freeze({ ...variant.family, prime: variant.family.prime, alternatives: variant.family.alternatives || [] });
}

module.exports = {
  TRADABLE_SENTINEL_PRIME_FAMILIES,
  companionFamilyKey,
  resolveCompanionFamily,
  getCompanionVariantFamily,
  resolveCompanionVariantIntent,
  resolveCompanionPrimeVariantIntent
};
