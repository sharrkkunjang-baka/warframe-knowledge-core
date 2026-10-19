'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'knowledge', 'generated', 'prime-access-equipment.json');
const OFFICIAL_FRAMES = path.join(ROOT, 'knowledge', 'generated', 'official-warframes.json');
const OFFICIAL_WEAPONS = path.join(ROOT, 'knowledge', 'generated', 'official-weapons.json');
const EXPORT_WEAPONS = path.join(ROOT, 'cache', 'warframe-export-weapons.json');
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'));
const DATA_ROOT = path.join(ITEMS_ROOT, 'data', 'json');
const CHECK = process.argv.includes('--check');

function load(name) {
  return require(path.join(DATA_ROOT, name));
}

function releaseDate(item) {
  return item.releaseDate || item.introduced?.date || null;
}

function isPrimeName(item) {
  return / Prime$/i.test(String(item?.name || item?.canonical || ''));
}

function epochDate(value) {
  return Number.isFinite(Number(value)) ? new Date(Number(value) * 1000).toISOString().slice(0, 10) : null;
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function build(generatedAt = new Date().toISOString()) {
  const frames = JSON.parse(fs.readFileSync(OFFICIAL_FRAMES, 'utf8')).frames
    .filter(item => item.isPrime === true || isPrimeName(item))
    .map(item => ({ ...item, releaseDate: epochDate(item.introducedAt) }));
  const exportedWeapons = JSON.parse(fs.readFileSync(EXPORT_WEAPONS, 'utf8'));
  const officialWeapons = JSON.parse(fs.readFileSync(OFFICIAL_WEAPONS, 'utf8')).weapons;
  const equipment = [
    ...officialWeapons
      .filter(item => item.equipmentType !== 'companion')
      .map(item => ({
        name: item.canonical,
        uniqueName: item.uniqueName,
        kind: 'weapon',
        equipmentType: item.equipmentType,
        releaseDate: epochDate(exportedWeapons[item.uniqueName]?.introducedAt)
      })),
    ...load('Archwing.json').filter(item => item.productCategory === 'SpaceSuits').map(item => ({ ...item, kind: 'archwing', equipmentType: 'archwing' })),
    ...load('Sentinels.json').map(item => ({ ...item, kind: 'companion' }))
  ].filter(item => isPrimeName(item) && releaseDate(item));

  const byDate = new Map();
  for (const item of equipment) {
    const date = releaseDate(item);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({
      canonical: item.name,
      uniqueName: item.uniqueName,
      kind: item.kind,
      equipmentType: item.equipmentType || null
    });
  }

  return {
    schemaVersion: 1,
    generatedAt,
    associationRule: 'same-release-date-as-prime-warframe',
    source: 'DE Public Export introducedAt plus warframe-items companion release metadata',
    frames: Object.fromEntries(frames
      .filter(frame => releaseDate(frame))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))
      .map(frame => [frame.name, {
        uniqueName: frame.uniqueName,
        releaseDate: releaseDate(frame),
        equipment: (byDate.get(releaseDate(frame)) || [])
          .filter(item => item.uniqueName !== frame.uniqueName)
          .sort((a, b) => {
            const order = { primary: 0, secondary: 1, melee: 2, 'arch-gun': 3, 'arch-melee': 4, archwing: 5 };
            return (order[a.equipmentType] ?? 6) - (order[b.equipmentType] ?? 6);
          })
      }]))
  };
}

function run() {
  const current = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : null;
  const catalog = build(CHECK && current?.generatedAt ? current.generatedAt : undefined);
  if (CHECK) {
    if (serialize(current) !== serialize(catalog)) throw new Error('Prime Access equipment catalog drifted');
    console.log(`Prime Access equipment catalog unchanged: ${Object.keys(catalog.frames).length} frames`);
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, serialize(catalog));
  console.log(`Generated Prime Access equipment catalog: ${Object.keys(catalog.frames).length} frames`);
}

if (require.main === module) run();
module.exports = { build, run, releaseDate, isPrimeName };
