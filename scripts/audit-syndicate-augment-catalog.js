'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(ROOT, 'generated', 'syndicate-augment-catalog.json');

function auditCatalog(catalog) {
  const diagnostics = [];
  const seenMods = new Map();
  const seenBindings = new Map();
  for (const entry of catalog.entries || []) {
    if (!entry.modId || !entry.modId.startsWith('/Lotus/')) diagnostics.push({ code: 'unstable-mod-id', modId: entry.modId || null });
    if (seenMods.has(entry.modId)) diagnostics.push({ code: 'duplicate-mod-id', modId: entry.modId });
    seenMods.set(entry.modId, entry);
    if (!entry.frame?.familyId) diagnostics.push({ code: 'unknown-family', modId: entry.modId });
    if (!entry.target?.id) diagnostics.push({ code: 'orphan-target', modId: entry.modId });
    const authoritativeEvidence = (entry.evidence || []).filter(item => item.source === 'local-wiki-sqlite' || item.kind === 'manual-review');
    if (!authoritativeEvidence.length) diagnostics.push({ code: 'missing-evidence', modId: entry.modId });
    if (entry.frame?.familyId && entry.target?.id) {
      const key = `${entry.frame.familyId}|${entry.target.id}`;
      const previous = seenBindings.get(key);
      if (previous) diagnostics.push({ code: 'duplicate-binding', binding: key, modIds: [previous.modId, entry.modId] });
      else seenBindings.set(key, entry);
    }
    const issueCodes = new Set(entry.issues || []);
    for (const code of ['unknown-family', 'orphan-target']) {
      const present = diagnostics.some(item => item.code === code && item.modId === entry.modId);
      if (present !== issueCodes.has(code)) diagnostics.push({ code: 'review-status-mismatch', modId: entry.modId, issue: code });
    }
    if (entry.status === 'review-required' && !issueCodes.size) diagnostics.push({ code: 'review-status-mismatch', modId: entry.modId, issue: 'empty-issues' });
    if (entry.status !== 'review-required' && issueCodes.size) diagnostics.push({ code: 'review-status-mismatch', modId: entry.modId, issue: 'unresolved-issues' });
  }
  return {
    counts: {
      entries: (catalog.entries || []).length,
      reviewRequired: (catalog.entries || []).filter(entry => entry.status === 'review-required').length,
      diagnostics: diagnostics.length
    },
    diagnostics
  };
}

function run(argv = process.argv.slice(2)) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const report = auditCatalog(catalog);
  const blocking = report.diagnostics.filter(item => ['unstable-mod-id', 'duplicate-mod-id', 'review-status-mismatch'].includes(item.code));
  console.log(JSON.stringify(report.counts));
  if (argv.includes('--strict') && blocking.length) throw new Error(`集团卡目录质量门失败：${JSON.stringify(blocking)}`);
  return report;
}

if (require.main === module) {
  try { run(); } catch (error) { console.error(error.stack || error); process.exit(1); }
}
module.exports = { CATALOG, auditCatalog, run };
