'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const KNOWLEDGE = path.join(ROOT, 'knowledge');
const OUTPUT = path.join(ROOT, 'generated', 'official-coverage-manifest.json');
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'));
const DATA_ROOT = path.join(ITEMS_ROOT, 'data', 'json');
const PACKAGE_INFO = require(path.join(ITEMS_ROOT, 'package.json'));
const PACKAGE_FRAMES = require(path.join(DATA_ROOT, 'Warframes.json'));
const PACKAGE_QUESTS = require(path.join(DATA_ROOT, 'Quests.json'));
const EXCLUDED_FRAMES = new Map([['/Lotus/Powersuits/DemonFrame/DemonFrame', 'internal-placeholder']]);
const STATUSES = Object.freeze(['included', 'excluded-policy', 'stub', 'covered', 'review-required', 'source-conflict']);

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function walkJson(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(item => {
    const target = path.join(directory, item.name);
    if (item.isDirectory()) return walkJson(target);
    if (!item.name.endsWith('.json') || item.name === 'categories.json') return [];
    const value = readJson(target);
    return Array.isArray(value) ? value : [value];
  });
}
function sorted(values) { return [...new Set(values.filter(Boolean))].sort(); }
function difference(left, right) { const other = new Set(right); return sorted(left.filter(value => !other.has(value))); }
function sourceDiff(publicIds, packageIds, wikiIds) {
  return {
    publicExportOnly: difference(publicIds, [...packageIds, ...wikiIds]),
    packageOnly: difference(packageIds, [...publicIds, ...wikiIds]),
    wikiOnly: difference(wikiIds, [...publicIds, ...packageIds]),
    publicExportMissingFromPackage: difference(publicIds, packageIds),
    packageMissingFromWiki: difference(packageIds, wikiIds)
  };
}
function frameHasAcquisition(entry) {
  const generated = entry?.frameAcquisition?.generated || {};
  const routing = generated.routing || {};
  const manual = entry?.frameAcquisition?.manual || {};
  const structured = [routing.componentVariables, routing.blueprintVariables].some(value => value && Object.keys(value).some(key => !['sourceCanonical'].includes(key)));
  const methods = Array.isArray(entry?.methodRefs) && entry.methodRefs.length > 0;
  const manualText = String(manual.acquisitionText || '').trim();
  const usefulManual = manualText && !/缺少.*获取来源|数据缺少|未解析/.test(manualText);
  const categorizedWiki = generated.acquisitionCategories?.status === 'classified' && generated.acquisitionCategories?.source?.type === 'wiki-page';
  return Boolean(structured || methods || usefulManual || categorizedWiki);
}
function disposition({ excluded, covered, stub, conflict, review }) {
  if (excluded) return 'excluded-policy';
  if (conflict) return 'source-conflict';
  if (review) return 'review-required';
  if (covered) return 'covered';
  if (stub) return 'stub';
  return 'included';
}
function statusCounts(entries) {
  return Object.fromEntries(STATUSES.map(status => [status, entries.filter(entry => entry.disposition === status).length]));
}
function domain(name, entries, identities) {
  return { name, counts: { identities: entries.length, ...statusCounts(entries) }, differences: sourceDiff(identities.publicExport, identities.package, identities.wiki), entries };
}
function buildManifest(generatedAt = new Date().toISOString()) {
  const officialFrames = readJson(path.join(KNOWLEDGE, 'generated', 'official-warframes.json')).frames || [];
  const frameEntries = walkJson(path.join(KNOWLEDGE, 'acquisition', 'warframe'));
  const frameById = new Map(frameEntries.map(entry => [entry.subject?.officialUniqueName, entry]));
  const packageFrameById = new Map(PACKAGE_FRAMES.filter(frame => frame.productCategory === 'Suits').map(frame => [frame.uniqueName, frame]));
  const frameIds = sorted([...officialFrames.map(frame => frame.uniqueName), ...packageFrameById.keys(), ...frameById.keys()]);
  const frames = frameIds.map(identity => {
    const official = officialFrames.find(frame => frame.uniqueName === identity);
    const packaged = packageFrameById.get(identity);
    const local = frameById.get(identity);
    const excludedReason = EXCLUDED_FRAMES.get(identity) || null;
    const conflict = Boolean(official && packaged && official.name !== packaged.name);
    const covered = Boolean(local && frameHasAcquisition(local));
    const ordinaryPackageGap = Boolean(official && !official.isPrime && !packaged && !excludedReason);
    return {
      identity, canonical: official?.name || packaged?.name || local?.subject?.canonical || identity,
      sourcePresence: { publicExport: Boolean(official), package: Boolean(packaged), wiki: local?.frameAcquisition?.generated?.acquisitionCategories?.source?.type === 'wiki-page' },
      localPresence: Boolean(local), packageCanonical: packaged?.name || null, publicExportCanonical: official?.name || null,
      disposition: disposition({ excluded: excludedReason, covered, stub: Boolean(local), conflict, review: ordinaryPackageGap && !covered }),
      excludedPolicy: excludedReason, sourceConflict: conflict, reviewRequired: ordinaryPackageGap && !covered,
      evidence: covered ? 'substantive-acquisition' : local ? 'identity-shell' : null
    };
  });

  const officialQuestCatalog = readJson(path.join(KNOWLEDGE, 'generated', 'official-quests.json')).quests || [];
  const localQuestEntries = walkJson(path.join(KNOWLEDGE, 'quests'));
  const localQuestById = new Map(localQuestEntries.filter(item => item.officialUniqueName).map(item => [item.officialUniqueName, item]));
  const packageQuestById = new Map(PACKAGE_QUESTS.map(quest => [quest.uniqueName, quest]));
  const publicQuestById = new Map(officialQuestCatalog.filter(quest => quest.officialExportPresent).map(quest => [quest.uniqueName, quest]));
  const questIds = sorted([...publicQuestById.keys(), ...packageQuestById.keys(), ...localQuestById.keys()]);
  const quests = questIds.map(identity => {
    const official = publicQuestById.get(identity), packaged = packageQuestById.get(identity), local = localQuestById.get(identity);
    const conflict = Boolean(official && packaged && official.name !== packaged.name);
    return { identity, canonical: official?.name || packaged?.name || local?.canonical || identity, sourcePresence: { publicExport: Boolean(official), package: Boolean(packaged), wiki: false }, localPresence: Boolean(local), disposition: disposition({ covered: Boolean(local), conflict, review: !local }), excludedPolicy: null, sourceConflict: conflict, reviewRequired: !local };
  });

  const officialMods = readJson(path.join(KNOWLEDGE, 'categories', 'official.json')).mods || [];
  const excludedMods = readJson(path.join(KNOWLEDGE, 'categories', 'official.json')).excludedMods || [];
  const mods = [
    ...officialMods.map(mod => ({
      identity: mod.uniqueName, canonical: mod.canonical,
      sourcePresence: { publicExport: true, package: true, wiki: Boolean(mod.wiki?.available) }, localPresence: Boolean(mod.localEntryIds?.length),
      disposition: mod.status === 'complete' ? 'covered' : 'review-required', excludedPolicy: null, sourceConflict: false, reviewRequired: mod.status !== 'complete'
    })),
    ...excludedMods.map(mod => ({
      identity: mod.uniqueName, canonical: mod.canonical,
      sourcePresence: { publicExport: true, package: true, wiki: false }, localPresence: false,
      disposition: 'excluded-policy', excludedPolicy: mod.exclusionReason, sourceConflict: false, reviewRequired: false
    }))
  ];

  const officialItems = readJson(path.join(KNOWLEDGE, 'generated', 'official-items.json')).items || [];
  const resourceIndex = readJson(path.join(KNOWLEDGE, 'acquisition', 'resource', 'categories.json')).resources || [];
  const resourceById = new Map(resourceIndex.map(item => [item.officialUniqueName, item]));
  const items = officialItems.map(item => ({ identity: item.uniqueName, canonical: item.canonical, sourcePresence: { publicExport: true, package: true, wiki: false }, localPresence: resourceById.has(item.uniqueName), disposition: resourceById.has(item.uniqueName) ? 'covered' : 'included', excludedPolicy: null, sourceConflict: false, reviewRequired: false }));
  const resources = officialItems.filter(item => resourceById.has(item.uniqueName) || (item.semanticKinds || []).some(kind => ['resource', 'material', 'material-or-usable', 'mineral', 'plant', 'fish-part', 'currency-token-material'].includes(kind))).map(item => {
    const local = resourceById.get(item.uniqueName);
    return { identity: item.uniqueName, canonical: item.canonical, sourcePresence: { publicExport: true, package: true, wiki: false }, localPresence: Boolean(local), disposition: local ? (local.reviewStatus === 'draft' ? 'review-required' : 'covered') : 'review-required', excludedPolicy: null, sourceConflict: false, reviewRequired: !local || local.reviewStatus === 'draft' };
  });

  const weaponCatalogPath = path.join(KNOWLEDGE, 'generated', 'official-weapons.json');
  const officialWeapons = fs.existsSync(weaponCatalogPath) ? readJson(weaponCatalogPath) : { weapons: [], excludedWeapons: [] };
  const weaponIndexPath = path.join(KNOWLEDGE, 'acquisition', 'weapons', 'categories.json');
  const weaponIndex = fs.existsSync(weaponIndexPath) ? readJson(weaponIndexPath) : { weapons: [] };
  const localWeaponById = new Map((weaponIndex.weapons || []).map(item => [item.officialUniqueName, item]));
  const weapons = [
    ...(officialWeapons.weapons || []).map(item => { const local = localWeaponById.get(item.uniqueName); return { identity: item.uniqueName, canonical: item.canonical, sourcePresence: { publicExport: true, package: false, wiki: false }, localPresence: Boolean(local), disposition: local?.status === 'complete' ? 'covered' : 'review-required', excludedPolicy: null, sourceConflict: false, reviewRequired: local?.status !== 'complete' }; }),
    ...(officialWeapons.excludedWeapons || []).map(item => ({ identity: item.uniqueName, canonical: item.canonical, sourcePresence: { publicExport: true, package: false, wiki: false }, localPresence: false, disposition: 'excluded-policy', excludedPolicy: item.exclusionReason, sourceConflict: false, reviewRequired: false }))
  ];

  const domains = {
    warframe: domain('warframe', frames, { publicExport: officialFrames.map(item => item.uniqueName), package: [...packageFrameById.keys()], wiki: frameEntries.filter(item => item.frameAcquisition?.generated?.acquisitionCategories?.source?.type === 'wiki-page').map(item => item.subject?.officialUniqueName) }),
    quest: domain('quest', quests, { publicExport: [...publicQuestById.keys()], package: [...packageQuestById.keys()], wiki: [] }),
    mod: domain('mod', mods, { publicExport: mods.map(item => item.identity), package: mods.map(item => item.identity), wiki: officialMods.filter(item => item.wiki?.available).map(item => item.uniqueName) }),
    'official-items': domain('official-items', items, { publicExport: officialItems.map(item => item.uniqueName), package: officialItems.map(item => item.uniqueName), wiki: [] }),
    resources: domain('resources', resources, { publicExport: resources.map(item => item.identity), package: resources.map(item => item.identity), wiki: [] }),
    weapons: domain('weapons', weapons, { publicExport: weapons.map(item => item.identity), package: [], wiki: [] })
  };
  const qualityFailures = frames.filter(item => item.sourcePresence.publicExport && !item.sourcePresence.package && !/ Prime$/i.test(item.canonical) && item.disposition !== 'excluded-policy' && item.evidence !== 'substantive-acquisition').map(item => ({ rule: 'public-export-package-gap-frame-must-not-be-shell', identity: item.identity, canonical: item.canonical }));
  return {
    schemaVersion: 1, generatedAt,
    sources: { publicExport: 'Warframe Public Export', package: { name: PACKAGE_INFO.name, version: PACKAGE_INFO.version }, wiki: 'Warframe Wiki evidence embedded in generated acquisition data' },
    allowedDispositions: STATUSES, domains,
    qualityGate: { passed: qualityFailures.length === 0, failures: qualityFailures }
  };
}
function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const current = fs.existsSync(OUTPUT) ? readJson(OUTPUT) : null;
  const manifest = buildManifest(check && current?.generatedAt ? current.generatedAt : new Date().toISOString());
  if (check) {
    if (serialize(current) !== serialize(manifest)) throw new Error('官方覆盖 manifest 已漂移，请运行 npm run sync:coverage');
    if (!manifest.qualityGate.passed) throw new Error(`官方覆盖质量门失败：${manifest.qualityGate.failures.map(item => item.canonical).join('、')}`);
    console.log(`官方覆盖 manifest 无漂移；${Object.keys(manifest.domains).length} 个领域，质量门通过`);
    return manifest;
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, serialize(manifest));
  console.log(`已生成官方覆盖 manifest；${Object.keys(manifest.domains).length} 个领域，质量门${manifest.qualityGate.passed ? '通过' : '失败'}`);
  return manifest;
}

if (require.main === module) { try { run(); } catch (error) { console.error(error.stack || error); process.exit(1); } }
module.exports = { STATUSES, EXCLUDED_FRAMES, frameHasAcquisition, sourceDiff, buildManifest, run, serialize };
