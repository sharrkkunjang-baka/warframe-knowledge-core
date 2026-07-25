'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseWikiWeaponRender } = require('../src/weapon-wiki-attacks');

const ROOT = path.resolve(__dirname, '..');
const CATALOG = path.join(ROOT, 'knowledge', 'generated', 'official-weapons.json');
const OUTPUT = path.join(ROOT, 'knowledge', 'generated', 'weapon-wiki-attacks.json');
const EXPORT_WEAPONS = path.join(ROOT, 'cache', 'warframe-export-weapons.json');
const WIKI_ROOT = 'https://wiki.warframe.com/w/';

function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function wikiTitle(canonical) {
  return String(canonical || '').trim().replace(/\s+/g, '_');
}

async function fetchWikiPayload(canonical) {
  const title = wikiTitle(canonical);
  const response = await fetch(`${WIKI_ROOT}${encodeURIComponent(wikiTitle(canonical))}?action=render`, {
    headers: { 'User-Agent': 'warframe-knowledge-core/1.0 (weapon-wiki-attacks sync)' }
  });
  if (!response.ok) throw new Error(`${canonical}: HTTP ${response.status}`);
  const body = await response.text();
  const payload = parseWikiWeaponRender(body);
  if (!payload?.Attacks?.length) throw new Error(`${canonical}: missing Attacks in wiki render payload`);
  return payload;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run(argv = process.argv.slice(2)) {
  const onlyArgIndex = argv.findIndex(arg => arg === '--only' || arg.startsWith('--only='));
  const only = onlyArgIndex >= 0
    ? (argv[onlyArgIndex].includes('=') ? argv[onlyArgIndex].slice('--only='.length) : argv.slice(onlyArgIndex + 1).join(' '))
    : null;
  const delayMs = Number(argv.find(arg => arg.startsWith('--delay='))?.slice('--delay='.length) || 150);
  const catalog = read(CATALOG);
  const exportWeapons = fs.existsSync(EXPORT_WEAPONS) ? read(EXPORT_WEAPONS) : {};
  const previous = fs.existsSync(OUTPUT) ? read(OUTPUT) : { schemaVersion: 1, entries: {} };
  const weapons = catalog.weapons.filter(item => item.uniqueName && item.canonical);
  const targets = only
    ? weapons.filter(item => item.canonical === only || item.displayName === only || item.uniqueName.includes(only))
    : weapons;
  if (!targets.length) throw new Error(`未找到武器：${only || '<empty>'}`);
  const entries = { ...previous.entries };
  let synced = 0;
  for (const weapon of targets) {
    try {
      const payload = await fetchWikiPayload(weapon.canonical);
      const supplementalAttacks = (exportWeapons[weapon.uniqueName]?.behaviours || [])
        .map((behaviour, index) => ({
          AttackIndex: `export-impact-${index + 1}`,
          AttackName: 'Radial Attack',
          ShotType: 'AoE',
          StatusChance: behaviour?.impact?.procChance,
          Damage: behaviour?.impact || null,
          source: 'DE ExportWeapons'
        }))
        .filter(attack => attack.Damage && Object.keys(attack.Damage).some(key => key !== 'procChance' && Number(attack.Damage[key]) > 0));
      entries[weapon.uniqueName] = {
        uniqueName: weapon.uniqueName,
        canonical: weapon.canonical,
        displayName: weapon.displayName,
        fetchedAt: new Date().toISOString(),
        sourceUrl: `${WIKI_ROOT}${wikiTitle(weapon.canonical)}?action=render`,
        payload,
        supplementalAttacks
      };
      synced += 1;
      console.log(`已同步 ${weapon.displayName || weapon.canonical}（${payload.Attacks.length} 面板）`);
    } catch (error) {
      console.error(`跳过 ${weapon.displayName || weapon.canonical}: ${error.message}`);
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  write(OUTPUT, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'wiki.warframe.com render JSON',
    count: Object.keys(entries).length,
    entries
  });
  console.log(`完成：新增/更新 ${synced} 项，总计 ${Object.keys(entries).length} 项`);
}

if (require.main === module) {
  run().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { run, fetchWikiPayload, wikiTitle };
