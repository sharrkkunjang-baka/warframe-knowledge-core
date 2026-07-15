'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'));
const DATA_ROOT = path.join(ITEMS_ROOT, 'data', 'json');
const ARCANE_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'arcane');
const CATALOG_PATH = path.join(ARCANE_ROOT, 'catalog.json');
const I18N = require(path.join(DATA_ROOT, 'i18n.json'));
const PACKAGE = require(path.join(ITEMS_ROOT, 'package.json'));
const CATEGORIES = Object.freeze(['warframe', 'primary', 'bow', 'shotgun', 'secondary', 'melee', 'operator', 'amp', 'kitgun', 'zaw', 'legacy']);
const PROTECTED_DIRECTORIES = Object.freeze(['method']);
const TYPE_CATEGORY = Object.freeze({
  'Warframe Arcane': 'warframe', Arcane: 'warframe', 'Primary Arcane': 'primary', 'Bow Arcane': 'bow',
  'Shotgun Arcane': 'shotgun', 'Secondary Arcane': 'secondary', 'Melee Arcane': 'melee',
  'Operator Arcane': 'operator', 'Amp Arcane': 'amp', 'Kitgun Arcane': 'kitgun', 'Zaw Arcane': 'zaw'
});
const CATEGORY_EQUIPMENT = Object.freeze({
  warframe: 'Warframe', primary: 'Primary', bow: 'Bow', shotgun: 'Shotgun', secondary: 'Secondary',
  melee: 'Melee', operator: 'Operator', amp: 'Amp', kitgun: 'Kitgun', zaw: 'Zaw', legacy: 'Legacy/Unknown'
});

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arcane'; }
function hashName(uniqueName) { return crypto.createHash('sha256').update(uniqueName).digest('hex').slice(0, 8); }
function fileName(item) { return `${slug(item.name)}-${hashName(item.uniqueName)}.json`; }
function isBasePlaceholder(item) { return item.name === 'Arcane'; }
function hasOfficialSource(item) { return Boolean(item.drops?.length || item.components?.length); }
function categoryFor(item) { return hasOfficialSource(item) ? (TYPE_CATEGORY[item.type] || 'legacy') : 'legacy'; }
function isExchangeLocation(location) { return /(?:The Holdfasts|Ostron|Operational Supply|The Quills|Vox Solaris|Solaris United)(?:\s*\(|,)/i.test(location); }

function structuredAcquisition(item) {
  const methods = [];
  for (const drop of item.drops || []) {
    const location = String(drop.location || '').trim();
    if (!location) continue;
    if (Number(drop.chance) === 1 && isExchangeLocation(location)) {
      methods.push({
        type: 'vendor-or-syndicate-exchange', sourceCanonical: location, availability: 'guaranteed-when-requirements-met',
        quantity: 1, rarity: drop.rarity || null,
        provenance: { source: 'warframe-items', input: 'Arcanes.json', officialUniqueName: item.uniqueName, rawChance: 1,
          note: '上游 chance=1 表示满足声望/商店条件后可确定兑换，不是 100% 随机掉落。' }
      });
    } else {
      const probability = Number.isFinite(Number(drop.chance)) ? Number(drop.chance) : null;
      methods.push({
        type: 'reward-or-drop', sourceCanonical: location, probability, chancePercent: probability === null ? null : probability * 100,
        quantity: 1, rarity: drop.rarity || null,
        provenance: { source: 'warframe-items', input: 'Arcanes.json', officialUniqueName: item.uniqueName }
      });
    }
  }
  if (item.components?.length) methods.push({
    type: 'crafting', outputQuantity: Number(item.buildQuantity || 1), credits: Number(item.buildPrice || 0),
    buildTimeSeconds: Number(item.buildTime || 0), ingredients: item.components.map(component => ({
      officialUniqueName: component.uniqueName || null, canonical: component.name || null, quantity: Number(component.itemCount || 0)
    })), provenance: { source: 'warframe-items', input: 'Arcanes.json', officialUniqueName: item.uniqueName }
  });
  return methods;
}

function existingEntries() {
  const byUniqueName = new Map();
  if (!fs.existsSync(ARCANE_ROOT)) return byUniqueName;
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory() && !PROTECTED_DIRECTORIES.includes(entry.name)) walk(target);
      else if (entry.isFile() && entry.name.endsWith('.json') && target !== CATALOG_PATH) {
        const value = JSON.parse(fs.readFileSync(target, 'utf8'));
        if (value.subject?.officialUniqueName) byUniqueName.set(value.subject.officialUniqueName, value);
      }
    }
  };
  walk(ARCANE_ROOT);
  return byUniqueName;
}

function buildEntry(item, previous) {
  const localized = I18N[item.uniqueName]?.zh || {};
  const category = categoryFor(item);
  const methods = structuredAcquisition(item);
  const status = category === 'legacy' ? 'review-required' : methods.length ? 'structured' : 'review-required';
  const manualPrevious = previous?.arcaneAcquisition?.manual || {};
  const manual = {
    aliases: Array.isArray(manualPrevious.aliases) ? manualPrevious.aliases : [],
    methods: Array.isArray(manualPrevious.methods) ? manualPrevious.methods : [],
    methodRefs: Array.isArray(manualPrevious.methodRefs) ? manualPrevious.methodRefs : (Array.isArray(previous?.methodRefs) ? previous.methodRefs : []),
    notes: Array.isArray(manualPrevious.notes) ? manualPrevious.notes : [],
    overrides: manualPrevious.overrides && typeof manualPrevious.overrides === 'object' ? manualPrevious.overrides : {},
    reviewStatus: manualPrevious.reviewStatus || 'draft', reviewedBy: Array.isArray(manualPrevious.reviewedBy) ? manualPrevious.reviewedBy : []
  };
  const generated = {
    identity: { officialUniqueName: item.uniqueName, canonical: item.name, displayName: localized.name || item.name,
      localizationStatus: localized.name && localized.name !== item.name ? 'official-zh' : 'fallback-en' },
    classification: { category, arcaneType: item.type, equipmentClass: CATEGORY_EQUIPMENT[category] },
    stats: { rarity: item.rarity || null, maxRank: Math.max(0, (item.levelStats?.length || 1) - 1), levelStats: item.levelStats || [] },
    acquisition: { status, methods }, tradable: Boolean(item.tradable), sourceFile: 'Arcanes.json',
    ...(previous?.arcaneAcquisition?.generated?.wiki ? { wiki: previous.arcaneAcquisition.generated.wiki } : {})
  };
  return {
    id: `knowledge.acquisition.arcane.${hashName(item.uniqueName)}`, kind: 'knowledge', module: 'acquisition',
    title: localized.name || item.name,
    subject: { canonical: item.name, displayName: localized.name || item.name, category: 'arcane', officialUniqueName: item.uniqueName },
    officialUniqueName: item.uniqueName, arcaneType: item.type, equipmentClass: CATEGORY_EQUIPMENT[category], rarity: item.rarity || null,
    maxRank: generated.stats.maxRank, levelStats: item.levelStats || [], tradable: Boolean(item.tradable), prerequisites: [], methodRefs: [],
    arcaneAcquisition: { generated, manual }, acquisitionStatus: status === 'structured' ? 'complete' : 'partial',
    summary: `${localized.name || item.name}的官方赋能身份与结构化获取来源。`,
    sources: [{ url: 'https://github.com/WFCD/warframe-items', label: 'warframe-items / Warframe Public Export' }],
    gameVersion: `warframe-items@${PACKAGE.version}`, updatedAt: previous?.updatedAt || new Date().toISOString().slice(0, 10),
    reviewStatus: previous?.reviewStatus || 'draft', reviewedBy: Array.isArray(previous?.reviewedBy) ? previous.reviewedBy : [],
    tags: ['acquisition', 'arcane', category, 'official-generated'], generator: { name: 'sync-arcanes', version: 1 }
  };
}

function buildPlan(generatedAt = new Date().toISOString()) {
  const raw = require(path.join(DATA_ROOT, 'Arcanes.json'));
  const previous = existingEntries();
  const placeholders = raw.filter(isBasePlaceholder);
  const real = raw.filter(item => !isBasePlaceholder(item));
  const entries = real.map(item => buildEntry(item, previous.get(item.uniqueName))).sort((a, b) => a.officialUniqueName.localeCompare(b.officialUniqueName));
  const routes = entries.map(entry => {
    const category = entry.arcaneAcquisition.generated.classification.category;
    return { officialUniqueName: entry.officialUniqueName, canonical: entry.subject.canonical, displayName: entry.subject.displayName,
      category, file: `${category}/${fileName({ name: entry.subject.canonical, uniqueName: entry.officialUniqueName })}`,
      acquisitionStatus: entry.arcaneAcquisition.generated.acquisition.status };
  });
  const byCategory = Object.fromEntries(CATEGORIES.map(category => [category, routes.filter(route => route.category === category).length]));
  const catalog = { schemaVersion: 1, generatedAt, primaryKey: 'officialUniqueName', hashAlgorithm: 'sha256-8',
    source: { package: PACKAGE.name, version: PACKAGE.version, repository: 'https://github.com/WFCD/warframe-items', input: 'Arcanes.json' },
    categories: CATEGORIES.map(category => ({ id: category, equipmentClass: CATEGORY_EQUIPMENT[category], count: byCategory[category], mutuallyExclusive: true })),
    counts: { input: raw.length, placeholdersExcluded: placeholders.length, arcanes: entries.length, structured: routes.filter(route => route.acquisitionStatus === 'structured').length,
      reviewRequired: routes.filter(route => route.acquisitionStatus === 'review-required').length, byCategory },
    excludedPlaceholders: placeholders.map(item => ({ officialUniqueName: item.uniqueName, canonical: item.name, reason: 'base-class-placeholder' })), arcanes: routes };
  return { entries, catalog };
}

function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const current = fs.existsSync(CATALOG_PATH) ? JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')) : null;
  const plan = buildPlan(check && current?.generatedAt ? current.generatedAt : new Date().toISOString());
  const expected = new Set([path.resolve(CATALOG_PATH).toLowerCase()]);
  const changes = [];
  const compare = (target, value) => { const next = serialize(value); const old = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null; if (old !== next) changes.push({ target, next }); expected.add(path.resolve(target).toLowerCase()); };
  compare(CATALOG_PATH, plan.catalog);
  for (const entry of plan.entries) {
    const category = entry.arcaneAcquisition.generated.classification.category;
    compare(path.join(ARCANE_ROOT, category, fileName({ name: entry.subject.canonical, uniqueName: entry.officialUniqueName })), entry);
  }
  if (fs.existsSync(ARCANE_ROOT)) {
    const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const target = path.join(dir, entry.name); if (entry.isDirectory() && !PROTECTED_DIRECTORIES.includes(entry.name)) walk(target); else if (entry.isFile() && entry.name.endsWith('.json') && !expected.has(path.resolve(target).toLowerCase())) changes.push({ target, remove: true }); } };
    walk(ARCANE_ROOT);
  }
  if (check) { if (changes.length) throw new Error(`赋能目录已漂移（${changes.length} 项）`); console.log(`赋能目录无漂移：${plan.catalog.counts.arcanes} 个真实赋能`); return plan; }
  for (const change of changes) { if (change.remove) fs.unlinkSync(change.target); else { fs.mkdirSync(path.dirname(change.target), { recursive: true }); fs.writeFileSync(change.target, change.next); } }
  console.log(`已同步 ${plan.catalog.counts.arcanes} 个真实赋能；排除 ${plan.catalog.counts.placeholdersExcluded} 个基类占位；${plan.catalog.counts.reviewRequired} 个进入 legacy/review-required`);
  return plan;
}

if (require.main === module) { try { run(); } catch (error) { console.error(error.stack || error); process.exit(1); } }
module.exports = { CATEGORIES, PROTECTED_DIRECTORIES, TYPE_CATEGORY, isBasePlaceholder, categoryFor, structuredAcquisition, buildEntry, buildPlan, run, hashName, fileName };
