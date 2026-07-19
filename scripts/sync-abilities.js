'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const TARGET = path.join(ROOT, 'knowledge', 'generated', 'official-abilities.json');
const EXPORT_CACHE = path.join(ROOT, '.cache', 'abilities', 'ExportWarframes.json');
const LANG_EN = path.join(ROOT, '.cache', 'official-localization', 'languages.en.json');
const LANG_ZH = path.join(ROOT, '.cache', 'official-localization', 'languages.zh.json');
const SOURCE = 'https://browse.wf/warframe-public-export-plus/ExportWarframes.json';
const check = process.argv.includes('--check');
const refresh = process.argv.includes('--refresh');

function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
async function ensureExport() {
  if (!refresh && fs.existsSync(EXPORT_CACHE)) return;
  const response = await fetch(SOURCE, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`${SOURCE}: HTTP ${response.status}`);
  fs.mkdirSync(path.dirname(EXPORT_CACHE), { recursive: true });
  fs.writeFileSync(EXPORT_CACHE, Buffer.from(await response.arrayBuffer()));
}
function baseFrameName(framePath, english) {
  const frame = english[framePath.name] || path.basename(framePath.uniqueName);
  return String(frame).replace(/ Prime$/i, '');
}
function buildCatalog(exported, english, chinese) {
  const suits = Object.entries(exported)
    .filter(([uniqueName, value]) => (value.productCategory === 'Suits' || /\/SiriusOrion\/OrionSuit$/.test(uniqueName)) && Array.isArray(value.abilities) && value.abilities.length)
    .map(([uniqueName, value]) => ({ uniqueName, ...value }));
  const byUniqueName = new Map();
  for (const suit of suits) {
    const frameCanonical = baseFrameName(suit, english);
    const frameDisplayName = chinese[suit.name] || english[suit.name] || frameCanonical;
    const form = /SiriusSuit$/.test(suit.uniqueName) ? 'Sirius' : /OrionSuit$/.test(suit.uniqueName) ? 'Orion' : frameCanonical;
    suit.abilities.forEach((ability, index) => {
      const canonical = english[ability.name] || path.basename(ability.uniqueName).replace(/Ability$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
      const displayName = chinese[ability.name] || canonical;
      const key = ability.uniqueName;
      const owner = { frameCanonical, frameDisplayName, form, slot: index + 1 };
      if (byUniqueName.has(key)) {
        const existing = byUniqueName.get(key);
        if (!existing.owners.some(item => item.frameCanonical === owner.frameCanonical && item.form === owner.form && item.slot === owner.slot)) existing.owners.push(owner);
        return;
      }
      byUniqueName.set(key, {
        abilityId: `ability:${slug(canonical)}-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 8)}`,
        canonical,
        displayName,
        aliases: [...new Set([canonical, displayName])],
        owners: [owner],
        slot: index + 1,
        wikiPageName: canonical,
        sourceFileName: ability.icon ? `${path.basename(ability.icon)}.png`.replace(/\.png\.png$/i, '.png') : null,
        iconExportPath: ability.icon || null,
        officialUniqueName: key,
        nameLanguageKey: ability.name || null,
        descriptionLanguageKey: ability.description || null,
        sharedAbilityId: null,
        review: {
          status: chinese[ability.name] ? 'official-zh' : 'canonical-fallback',
          authority: chinese[ability.name] ? 'DE Languages.bin' : 'DE Public Export canonical',
          source: SOURCE
        }
      });
    });
  }
  const abilities = [...byUniqueName.values()].sort((a, b) => a.canonical.localeCompare(b.canonical, 'en'));
  for (const ability of abilities) if (ability.owners.length > 1) ability.sharedAbilityId = ability.abilityId;
  const baseFrames = new Set(suits.map(suit => baseFrameName(suit, english)).filter(name => !/ Prime$/i.test(name)));
  const coveredFrames = new Set(abilities.flatMap(item => item.owners.map(owner => owner.frameCanonical)));
  const recent = Object.fromEntries(['Temple','Uriel','Sirius','Orion'].map(name => [name, abilities.filter(item => item.owners.some(owner => owner.form === name || owner.frameCanonical === name)).length]));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provenance: { publicExport: SOURCE, localization: 'DE Languages.bin official localization snapshot' },
    counts: { abilities: abilities.length, officialZh: abilities.filter(item => item.review.status === 'official-zh').length, frames: coveredFrames.size, exportedBaseFrames: baseFrames.size },
    audit: { missingFrames: [...baseFrames].filter(name => !coveredFrames.has(name)), recent, siriusOrionUnique: abilities.filter(item => item.owners.some(owner => ['Sirius','Orion'].includes(owner.form))).length },
    abilities
  };
}
async function run() {
  await ensureExport();
  if (!fs.existsSync(LANG_EN) || !fs.existsSync(LANG_ZH)) throw new Error('缺少官方语言快照，请先运行 npm run sync:localization');
  const catalog = buildCatalog(JSON.parse(fs.readFileSync(EXPORT_CACHE)), JSON.parse(fs.readFileSync(LANG_EN)), JSON.parse(fs.readFileSync(LANG_ZH)));
  if (catalog.audit.missingFrames.length) throw new Error(`技能目录缺少战甲：${catalog.audit.missingFrames.join('、')}`);
  if (catalog.audit.recent.Temple !== 4 || catalog.audit.recent.Uriel !== 4 || catalog.audit.recent.Sirius !== 4 || catalog.audit.recent.Orion !== 4 || catalog.audit.siriusOrionUnique !== 7) throw new Error(`近期战甲技能完整性失败：${JSON.stringify(catalog.audit)}`);
  const text = serialize(catalog);
  if (check) {
    if (!fs.existsSync(TARGET)) throw new Error('技能目录不存在，请运行 npm run sync:abilities');
    const current = JSON.parse(fs.readFileSync(TARGET));
    const comparable = value => JSON.stringify({ ...value, generatedAt: '<ignored>' });
    if (comparable(current) !== comparable(catalog)) throw new Error('技能目录已漂移，请运行 npm run sync:abilities');
  } else {
    fs.mkdirSync(path.dirname(TARGET), { recursive: true });
    fs.writeFileSync(TARGET, text);
  }
  console.log(`主动技能目录：${catalog.counts.abilities} 个唯一技能，官方简中 ${catalog.counts.officialZh}，战甲/形态 ${catalog.counts.frames}；Sirius & Orion ${catalog.audit.siriusOrionUnique} 个唯一技能`);
  return catalog;
}
if (require.main === module) run().catch(error => { console.error(error.stack || error); process.exit(1); });
module.exports = { SOURCE, buildCatalog, run };
