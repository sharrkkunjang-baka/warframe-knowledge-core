'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createKnowledgeCore } = require('..');
const { audit } = require('../scripts/audit-arcane-wiki-acquisition');
const { parseWikiStandingVendorFromExcerpt, structuredAcquisition } = require('../scripts/sync-arcanes');

const core = createKnowledgeCore({ approvedOnly: false });

test('Wiki 记载的 Hex / Bird3 声望兑换由 sync-arcanes 补全', () => {
  for (const canonical of ['Melee Doughty', 'Primary Crux', 'Secondary Enervate', 'Arcane Impetus']) {
    const previous = core.getArcane(canonical);
    const excerpt = previous?.arcaneAcquisition?.generated?.wiki?.evidence?.[0]?.provenance?.excerpt || '';
    const parsed = parseWikiStandingVendorFromExcerpt(excerpt, { provenance: { section: 'Acquisition' } });
    assert.ok(parsed, `${canonical} 应解析出 Wiki 声望兑换`);
    assert.equal(parsed.requirements.npcId, 'npc.eleanor');
    assert.equal(parsed.requirements.amount, 7500);

    const methods = structuredAcquisition({ uniqueName: previous.officialUniqueName, name: canonical, drops: [] }, undefined, previous);
    const exchange = methods.find(method => method.type === 'vendor-or-syndicate-exchange' && method.requirements?.type === 'standing');
    assert.ok(exchange, `${canonical} 生成链应补全 Eleanor 声望兑换`);
    assert.equal(exchange.requirements.npcId, 'npc.eleanor');
    assert.match(core.getAcquisition(canonical).description, /埃莉诺|霍瓦尼亚/);
  }
});

test('赋能 Wiki 审计不再报告 missing-standing-vendor-exchange', () => {
  const report = audit();
  assert.equal(report.totals.issueCounts['missing-standing-vendor-exchange'] || 0, 0);
  assert.ok(report.totals.mismatches <= 38);
});
