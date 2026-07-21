'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createKnowledgeCore } = require('../src');
const { buildPlan } = require('../scripts/sync-current-wiki-supplements');

const DB = path.join(__dirname, '..', '.cache', 'warframe-wiki.sqlite');
const ANTIQUE_PREFIX = '/Lotus/Upgrades/Mods/Antiques/';

test('当前 Wiki 目录将全部 Antique Mod 作为真实物品而非架势名', () => {
  const plan = buildPlan({ db: DB, skipHash: true });
  const antiqueMods = plan.entries.filter(item => item.domain === 'mods' && item.officialUniqueName?.startsWith(ANTIQUE_PREFIX));
  assert.equal(antiqueMods.length, 20);
  assert.equal(plan.exclusions.some(item => item.canonical === 'Omn-Evi'), false);
  assert.equal(new Set(antiqueMods.map(item => item.officialUniqueName)).size, 20);
  assert.ok(antiqueMods.every(item => item.displayName && item.page?.revisionId));
});

test('奥维精确解析为 Omn-Evi 并保留官方唯一名与结构化来源', () => {
  const core = createKnowledgeCore({ approvedOnly: false });
  for (const query of ['奥维', 'Omn-Evi', 'omn-evi']) {
    const card = core.getAcquisitionCard(query);
    assert.equal(card?.kind, 'mod', query);
    assert.deepEqual(card.identity, {
      canonical: 'Omn-Evi',
      displayName: '奥维',
      uniqueName: '/Lotus/Upgrades/Mods/Antiques/CritChanceSchool'
    }, query);
    assert.ok(card.sections.other.length, query);
  }
});
