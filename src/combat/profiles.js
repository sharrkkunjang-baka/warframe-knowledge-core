'use strict';

const WEAPONS = {
  torid: {
    canonical: 'Torid', displayName: '托里德', mode: 'incarnon', baseDamage: { toxin: 51 },
    fireRate: 8, criticalChance: 0.29, criticalMultiplier: 3.1, statusChance: 0.39,
    multishot: 1, trigger: 'held', beamRamp: { start: 0.2, duration: 0.6 }, incarnonAmmo: 170,
    evolutions: { finalFusillade: { baseDamageAdd: 51 }, survivorsEdge: { baseCriticalChanceAdd: 0.15, baseStatusChanceAdd: 0.15 } },
    gunCoEligibleBaseDamage: 51,
    sources: ['https://wiki.warframe.com/w/Torid', 'https://wiki.warframe.com/w/Torid_Incarnon_Genesis']
  }
};
const TARGETS = {
  gokstadOfficer: { canonical: 'Gokstad Officer', displayName: '高克斯塔军官', faction: 'grineer', baseLevel: 8, baseHealth: 1000, baseArmor: 1000, sources: ['https://wiki.warframe.com/w/Gokstad_Officer'] }
};
module.exports = { WEAPONS, TARGETS };
