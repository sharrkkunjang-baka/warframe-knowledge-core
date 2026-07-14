'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE_ROOT = path.join(ROOT, 'knowledge');
const OFFICIAL_PATH = path.join(KNOWLEDGE_ROOT, 'generated', 'official-warframes.json');
const KNOWLEDGE_DIR = path.join(KNOWLEDGE_ROOT, 'acquisition', 'warframe');
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'));
const I18N = require(path.join(ITEMS_ROOT, 'data', 'json', 'i18n.json'));
const EXCLUDED = Object.freeze({
  '/Lotus/Powersuits/DemonFrame/DemonFrame': '明显内部占位（Demon Frame）'
});
const CANONICAL_OVERRIDES = Object.freeze({
  '/Lotus/Powersuits/SiriusOrion/SiriusSuit': 'Sirius & Orion',
  '/Lotus/Powersuits/Inkblot/Inkblot': 'Follie'
});

function slugify(value) {
  return String(value).normalize('NFKD').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function readEntries(directory = KNOWLEDGE_DIR) {
  const entries = [];
  if (!fs.existsSync(directory)) return entries;
  for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) { if (item.name !== 'method') entries.push(...readEntries(target)); continue; }
    if (!item.isFile() || !item.name.endsWith('.json') || item.name === 'categories.json') continue;
    const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
    for (const entry of Array.isArray(parsed) ? parsed : []) entries.push({ entry, file: path.relative(KNOWLEDGE_DIR, target) });
  }
  return entries;
}
function displayName(frame, canonical) {
  return I18N[frame.uniqueName]?.zh?.name || canonical;
}
function migrateManual(entry) {
  const acquisition = entry?.frameAcquisition || {};
  const manual = { ...(acquisition.manual || {}) };
  for (const key of ['sources', 'note', 'specialFrame', 'costs', 'dependencies']) {
    if (acquisition[key] !== undefined && manual[key] === undefined) manual[key] = acquisition[key];
  }
  return manual;
}
function generatedData(frame) {
  return {
    officialUniqueName: frame.uniqueName,
    canonical: CANONICAL_OVERRIDES[frame.uniqueName] || frame.name,
    displayName: displayName(frame, CANONICAL_OVERRIDES[frame.uniqueName] || frame.name),
    isPrime: Boolean(frame.isPrime),
    productCategory: frame.productCategory,
    introducedAt: frame.introducedAt,
    components: (frame.components || []).map(component => ({ part: component.part, officialUniqueName: component.uniqueName }))
  };
}
function buildEntry(frame, existing) {
  const canonical = CANONICAL_OVERRIDES[frame.uniqueName] || frame.name;
  const generated = { ...(existing?.frameAcquisition?.generated || {}), ...generatedData(frame) };
  const manual = migrateManual(existing);
  const old = existing || {};
  return {
    ...old,
    id: `knowledge.acquisition.warframe.${slugify(canonical)}`,
    kind: 'knowledge',
    module: 'acquisition',
    title: canonical,
    subject: { ...(old.subject || {}), canonical, displayName: generated.displayName, category: 'frame', officialUniqueName: frame.uniqueName },
    prerequisites: Array.isArray(old.prerequisites) ? old.prerequisites : [],
    methodRefs: Array.isArray(old.methodRefs) ? old.methodRefs : [],
    frameAcquisition: { generated, manual },
    sources: old.sources?.length ? old.sources : [{ url: 'https://browse.wf/warframe-public-export-plus/ExportWarframes.json', label: 'Warframe Public Export - Suits' }],
    gameVersion: old.gameVersion || 'current',
    updatedAt: old.updatedAt || new Date().toISOString().slice(0, 10),
    reviewStatus: old.reviewStatus || 'approved',
    reviewedBy: old.reviewedBy?.length ? old.reviewedBy : ['official-sync'],
    tags: [...new Set([...(old.tags || []), 'acquisition', 'warframe', 'official-generated'])],
    summary: old.summary || `${generated.displayName} 的官方战甲身份与部件数据。`
  };
}
function comparable(value) { return JSON.stringify(value, null, 2) + '\n'; }
function buildPlan() {
  const official = JSON.parse(fs.readFileSync(OFFICIAL_PATH, 'utf8'));
  const existing = readEntries();
  const byUnique = new Map();
  const byCanonical = new Map();
  for (const item of existing) {
    const unique = item.entry.subject?.officialUniqueName || item.entry.officialUniqueName || item.entry.frameAcquisition?.generated?.officialUniqueName;
    if (unique) byUnique.set(unique, item.entry);
    if (item.entry.subject?.canonical) byCanonical.set(item.entry.subject.canonical, item.entry);
  }
  const siriusLegacy = byCanonical.get('Sirius & Orion');
  const included = [];
  const excluded = [];
  for (const frame of official.frames || []) {
    if (EXCLUDED[frame.uniqueName]) { excluded.push({ ...frame, reason: EXCLUDED[frame.uniqueName] }); continue; }
    const canonical = CANONICAL_OVERRIDES[frame.uniqueName] || frame.name;
    const old = byUnique.get(frame.uniqueName) || byCanonical.get(canonical) || (frame.uniqueName === '/Lotus/Powersuits/SiriusOrion/SiriusSuit' ? siriusLegacy : null);
    included.push({ frame, entry: buildEntry(frame, old) });
  }
  return { official, included, excluded };
}
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const dryRun = argv.includes('--dry-run');
  const report = argv.includes('--report-unclassified');
  const plan = buildPlan();
  const indexPath = path.join(KNOWLEDGE_DIR, 'categories.json');
  const routingIndex = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : { frames: [] };
  const routes = new Map((routingIndex.frames || []).map(item => [item.officialUniqueName, item.file]));
  const expectedFiles = new Set();
  const changes = [];
  for (const { entry } of plan.included) {
    const file = routes.get(entry.subject.officialUniqueName) || `${slugify(entry.subject.canonical)}.json`;
    expectedFiles.add(path.normalize(file).toLowerCase());
    const target = path.join(KNOWLEDGE_DIR, file);
    const next = comparable([entry]);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (current !== next) changes.push({ type: current == null ? 'create' : 'update', file, target, next });
  }
  for (const item of readEntries()) {
    if (!expectedFiles.has(path.normalize(item.file).toLowerCase())) changes.push({ type: 'remove', file: item.file, target: path.join(KNOWLEDGE_DIR, item.file) });
  }
  if (report) {
    console.log(`公开：${plan.included.length}`);
    console.log(`隔离：${plan.excluded.map(item => `${item.name}（${item.reason}）`).join('、') || '无'}`);
    console.log('未分类：无');
  }
  if (check) {
    if (changes.length) throw new Error(`战甲知识已漂移（${changes.length} 个文件），请运行 npm run sync:frame-knowledge`);
    console.log(`战甲知识无漂移：${plan.included.length} 个公开条目，隔离 ${plan.excluded.length} 个内部对象`);
    return plan;
  }
  if (dryRun) {
    for (const change of changes) console.log(`${change.type}: ${change.file}`);
    console.log(`dry-run：${changes.length} 项变更，未写文件`);
    return plan;
  }
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  for (const change of changes) {
    if (change.type === 'remove') fs.unlinkSync(change.target);
    else { fs.mkdirSync(path.dirname(change.target), { recursive: true }); fs.writeFileSync(change.target, change.next); }
  }
  console.log(`已同步 ${plan.included.length} 个公开战甲知识条目；写入 ${changes.length} 项；隔离 ${plan.excluded.length} 个内部对象`);
  return plan;
}

if (require.main === module) {
  try { run(); } catch (error) { console.error(error.stack || error); process.exit(1); }
}
module.exports = { EXCLUDED, CANONICAL_OVERRIDES, slugify, migrateManual, generatedData, buildEntry, buildPlan, run };
