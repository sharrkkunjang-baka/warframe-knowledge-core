'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rivenWeaponIdentities, localizedRivenFamilyName } = require('../src/riven-weapon-resolver');
const officialWeapons = require('../knowledge/generated/official-weapons.json');
const rivenMarketWeapons = require('../knowledge/supplemental/riven-market-weapons.json');

test('官方简中基础名可连接英文单复数不同的紫卡变种家族', () => {
  const identities = rivenWeaponIdentities(officialWeapons, rivenMarketWeapons);
  const base = identities.find(item => item.canonical === 'Dual Decurion');
  const prisma = identities.find(item => item.canonical === 'Prisma Dual Decurions');
  assert.ok(base);
  assert.ok(prisma);
  assert.equal(prisma.displayName, '棱晶·什长双枪');
  assert.equal(prisma.omegaAttenuation, 1.25);
  assert.equal(prisma.marketSlug, base.marketSlug);
  assert.equal(prisma.sharedRivenFamily, true);
  assert.equal(localizedRivenFamilyName(base.displayName), localizedRivenFamilyName(prisma.displayName));
});

test('官方简中家族键只剥离审核变种词，不合并无关武器', () => {
  assert.equal(localizedRivenFamilyName('布莱顿 Prime'), localizedRivenFamilyName('布莱顿'));
  assert.equal(localizedRivenFamilyName('棱晶·奥比克斯'), localizedRivenFamilyName('奥比克斯'));
  assert.notEqual(localizedRivenFamilyName('双子小精灵'), localizedRivenFamilyName('什长双枪'));
});

test('Dex 武器保留独立家族键，但仍可复用对应市场端点', () => {
  const identities = rivenWeaponIdentities(officialWeapons, rivenMarketWeapons);
  const furis = identities.find(item => item.canonical === 'Furis');
  const afuris = identities.find(item => item.canonical === 'Afuris');
  const dexFuris = identities.find(item => item.canonical === 'Dex Furis');
  assert.ok(furis);
  assert.ok(afuris);
  assert.ok(dexFuris);
  assert.equal(dexFuris.marketSlug, afuris.marketSlug);
  assert.notEqual(dexFuris.familyKey, furis.familyKey);
  assert.equal(dexFuris.familyKey, 'dexfuris');
});
