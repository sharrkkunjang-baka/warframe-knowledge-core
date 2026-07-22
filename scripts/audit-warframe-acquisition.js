'use strict';

const coreModule = require('../src');

function audit() {
  const core = coreModule.createKnowledgeCore({ approvedOnly: false });
  const issues = [];
  for (const frame of coreModule.frameAcquisition.listWarframes()) {
    const result = core.getAcquisition(frame.canonical);
    const text = String(result?.description || '');
    const methods = result?.structuredMethods || [];
    if (!result) { issues.push({ frame: frame.canonical, issue: 'missing-acquisition' }); continue; }
    if (/（未评|【待人工审核】|review-required|pending-review/i.test(text)) issues.push({ frame: frame.canonical, issue: 'review-status-leak' });
    if (!frame.isPrime && methods.some(method => method.type === 'relic-reward' || /\b(?:Lith|Meso|Neo|Axi)\b/i.test(String(method.relicCanonical || method.sourceCanonical || '')))) issues.push({ frame: frame.canonical, issue: 'normal-prime-relic-mix' });
    if (/；在[^\n]{240,}/.test(text) || (text.match(/mission-node\./g) || []).length > 3) issues.push({ frame: frame.canonical, issue: 'long-node-chain' });
    for (const method of methods.filter(method => method.variables?.sourceGroups)) {
      const groups = method.variables.sourceGroups;
      const parts = groups.map(group => group.part);
      if (new Set(parts).size !== parts.length || groups.some(group => !group.partName || (!group.summary && !Array.isArray(group.sources)))) issues.push({ frame: frame.canonical, issue: 'invalid-component-source-groups' });
      const flattened = groups.flatMap(group => group.sourceCanonical || []);
      if (flattened.some(source => /\bRelic\b/i.test(String(source)))) issues.push({ frame: frame.canonical, issue: 'component-pool-relic-contamination' });
    }
    const identities = methods.map(method => JSON.stringify([method.type, method.scope, method.sourceEntityId, method.locationId, method.rotation, method.variables, method.requirements]));
    if (new Set(identities).size !== identities.length) issues.push({ frame: frame.canonical, issue: 'duplicate-method' });
    if (methods.some(method => !method.requirements || !Array.isArray(method.requirementLines))) issues.push({ frame: frame.canonical, issue: 'invalid-requirement-protocol' });
    for (const method of methods.filter(method => method.npcId === 'npc.cephalon-simaris' || method.requirements?.npcId === 'npc.cephalon-simaris')) {
      if (!['blueprint', 'component', 'item'].includes(method.scope)) issues.push({ frame: frame.canonical, issue: 'simaris-role-mismatch', scope: method.scope });
      if (method.locationId !== 'hub.any-relay' || method.requirements?.locationId !== 'hub.any-relay') issues.push({ frame: frame.canonical, issue: 'simaris-location-missing', scope: method.scope });
      if (method.requirements?.type !== 'standing' || !Number.isFinite(method.requirements?.amount)) issues.push({ frame: frame.canonical, issue: 'simaris-standing-missing', scope: method.scope });
    }
    const visibleRoles = ['总图', '部件蓝图', '整套蓝图'];
    for (const role of visibleRoles) {
      const roleLines = text.split('\\n').filter(line => line.startsWith(`${role}：`));
      const normalized = roleLines.map(line => line.replace(/（[^）]*声望）|，需要[^；\n]+/g, '').replace(/之后可在[^；\n]+(?:回购|兑换)/g, '之后可回购').trim());
      if (new Set(normalized).size !== normalized.length) issues.push({ frame: frame.canonical, issue: 'duplicate-visible-role', role });
    }
  }
  return { frames: coreModule.frameAcquisition.listWarframes().length, issues };
}

if (require.main === module) {
  const report = audit();
  console.log(JSON.stringify(report, null, 2));
  if (report.issues.length) process.exitCode = 1;
}

module.exports = { audit };
