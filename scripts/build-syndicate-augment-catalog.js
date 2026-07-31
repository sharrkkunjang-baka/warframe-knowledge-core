'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const OFFICIAL = path.join(ROOT, 'knowledge', 'categories', 'official.json');
const DEFAULT_DB = path.join(ROOT, '.cache', 'warframe-wiki.sqlite');
const OUTPUT = path.join(ROOT, 'generated', 'syndicate-augment-catalog.json');
const REVIEW = path.join(ROOT, 'knowledge', 'reviewed', 'syndicate-augment-bindings.json');

function slug(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function stableTargetId(kind, canonical) {
  if (kind === 'passive') return `passive.${slug(canonical)}`;
  const suffix = crypto.createHash('sha256').update(String(canonical)).digest('hex').slice(0, 8);
  return `ability:${slug(canonical)}-${suffix}`;
}

function frameFamilyId(canonical) {
  const base = String(canonical || '').replace(/ Prime$/i, '').trim();
  if (!base) return null;
  if (base === 'Excalibur Umbra') return 'frame.excalibur';
  if (base === 'Sirius & Orion' || base === 'Orion & Sirius') return 'frame.sirius-orion';
  const id = slug(base);
  return id ? `frame.${id}` : null;
}

function parseWikiBinding(text, frameCanonical) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const description = normalized.match(/Description\s+(.+?) Augment:/i)?.[1]?.trim();
  if (/^Passive$/i.test(description || '') || /\bPassive Augment\b/i.test(normalized.slice(0, 600))) {
    return { kind: 'passive', canonical: `${frameCanonical} Passive`, evidence: 'Description Passive Augment' };
  }
  const possessive = normalized.match(/Warframe Augment Mod for\s+.+?['’]s\s+(.+?)\s+that\b/i)?.[1]?.trim();
  const canonical = possessive || description;
  if (!canonical || canonical.length > 80 || /[|•]/.test(canonical)) return null;
  return { kind: 'ability', canonical, evidence: possessive ? 'Wiki lead sentence' : 'Description augment label' };
}

function loadReviewLayer(reviewPath = REVIEW) {
  if (!fs.existsSync(reviewPath)) return { schemaVersion: 1, bindings: {} };
  const value = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  if (!value || value.schemaVersion !== 1 || typeof value.bindings !== 'object' || Array.isArray(value.bindings)) {
    throw new Error('人工审核层必须是 schemaVersion=1 且包含 bindings 对象');
  }
  return value;
}

function buildCatalog({ officialPath = OFFICIAL, dbPath = DEFAULT_DB, reviewPath = REVIEW } = {}) {
  const official = JSON.parse(fs.readFileSync(officialPath, 'utf8'));
  const review = loadReviewLayer(reviewPath);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const byTitle = db.prepare('SELECT page_id pageId,title,revision_id revisionId,timestamp,text FROM pages WHERE title=? COLLATE NOCASE LIMIT 1');
  const mods = (official.mods || []).filter(mod => mod.type === 'Warframe Mod' && mod.traits?.augment && !mod.traits?.pvp);
  const entries = [];
  try {
    for (const mod of mods) {
      const offeredStoreItems = [...new Set((mod.acquisitionMethods || []).map(method => method.provenance?.storeItem).filter(Boolean))];
      const offeredModIds = offeredStoreItems.map(item => String(item).replace('/Lotus/StoreItems/', '/Lotus/'));
      const stableModId = String(mod.uniqueName || '').startsWith('/Lotus/') ? mod.uniqueName : (offeredModIds.length === 1 ? offeredModIds[0] : null);
      const page = byTitle.get(mod.canonical) || null;
      const reviewed = stableModId ? (review.bindings[stableModId] || null) : null;
      const generatedFrame = mod.compatName ? { canonical: mod.compatName, familyId: frameFamilyId(mod.compatName) } : null;
      const parsedTarget = page && generatedFrame ? parseWikiBinding(page.text, generatedFrame.canonical) : null;
      const generatedTarget = parsedTarget ? { kind: parsedTarget.kind, canonical: parsedTarget.canonical, id: stableTargetId(parsedTarget.kind, parsedTarget.canonical) } : null;
      const frame = reviewed?.frame || generatedFrame;
      const target = reviewed?.target || generatedTarget;
      const evidence = [
        { source: 'knowledge/categories/official.json', kind: stableModId === mod.uniqueName ? 'official-mod-identity' : 'official-syndicate-offer-identity', stableId: stableModId, sourceIdentity: mod.uniqueName, storeItems: offeredStoreItems },
        ...(page ? [{ source: 'local-wiki-sqlite', kind: 'wiki-page', pageId: page.pageId, revisionId: page.revisionId, timestamp: page.timestamp, bindingExcerpt: parsedTarget?.evidence || null }] : []),
        ...(reviewed ? [{ source: 'knowledge/reviewed/syndicate-augment-bindings.json', kind: 'manual-review', reviewedBy: reviewed.reviewedBy, reviewedAt: reviewed.reviewedAt }] : [])
      ];
      const issues = [];
      if (!stableModId) issues.push('unstable-mod-id');
      if (!frame?.familyId) issues.push('unknown-family');
      if (!target?.id) issues.push('orphan-target');
      if (!page && !reviewed) issues.push('missing-wiki-evidence');
      if (reviewed && (!reviewed.reviewedBy || !reviewed.reviewedAt || !reviewed.evidence?.length)) issues.push('incomplete-manual-review');
      entries.push({
        modId: stableModId || mod.uniqueName,
        canonical: mod.canonical,
        displayName: mod.displayName || mod.canonical,
        frame,
        target,
        status: issues.length ? 'review-required' : (reviewed ? 'approved-manual' : 'generated-evidence'),
        issues,
        evidence
      });
    }
  } finally {
    db.close();
  }
  const deduplicated = [];
  for (const entry of entries.sort((left, right) => left.modId.localeCompare(right.modId))) {
    const previous = deduplicated.at(-1);
    if (!previous || previous.modId !== entry.modId) { deduplicated.push(entry); continue; }
    const score = candidate => Number(Boolean(candidate.frame?.familyId)) + Number(Boolean(candidate.target?.id)) + Number(candidate.evidence.some(item => item.source === 'local-wiki-sqlite'));
    if (score(entry) > score(previous)) deduplicated[deduplicated.length - 1] = entry;
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: { official: 'knowledge/categories/official.json', wiki: path.relative(ROOT, dbPath).replace(/\\/g, '/'), manualReview: 'knowledge/reviewed/syndicate-augment-bindings.json' },
    count: deduplicated.length,
    reviewRequiredCount: deduplicated.filter(entry => entry.status === 'review-required').length,
    entries: deduplicated
  };
}

function comparable(value) {
  return JSON.stringify({ ...value, generatedAt: '<ignored>' });
}

function run(argv = process.argv.slice(2)) {
  const dbIndex = argv.indexOf('--db');
  const dbPath = dbIndex >= 0 ? path.resolve(argv[dbIndex + 1]) : DEFAULT_DB;
  const output = buildCatalog({ dbPath });
  if (argv.includes('--check')) {
    if (!fs.existsSync(OUTPUT)) throw new Error('generated/syndicate-augment-catalog.json 不存在');
    if (comparable(JSON.parse(fs.readFileSync(OUTPUT, 'utf8'))) !== comparable(output)) throw new Error('战甲集团卡目录已漂移');
    console.log(`syndicate-augment-catalog-in-sync count=${output.count} reviewRequired=${output.reviewRequiredCount}`);
    return output;
  }
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`syndicate-augment-catalog count=${output.count} reviewRequired=${output.reviewRequiredCount}`);
  return output;
}

if (require.main === module) {
  try { run(); } catch (error) { console.error(error.stack || error); process.exit(1); }
}

module.exports = { OFFICIAL, DEFAULT_DB, OUTPUT, REVIEW, slug, stableTargetId, frameFamilyId, parseWikiBinding, loadReviewLayer, buildCatalog, run };
