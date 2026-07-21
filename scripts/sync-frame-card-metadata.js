'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const frameAcquisition = require('../src/frame-acquisition');
const helminth = require('../knowledge/facts/helminth-subsumed-abilities.json');

const ROOT = path.join(__dirname, '..');
const TARGET = path.join(ROOT, 'generated', 'frame-card-metadata.json');
const SOURCES = Object.freeze({
  warframes: 'https://browse.wf/warframe-public-export-plus/ExportWarframes.json',
  english: 'https://browse.wf/warframe-public-export-plus/dict.en.json',
  chinese: 'https://browse.wf/warframe-public-export-plus/dict.zh.json',
  scaling: 'https://browse.wf/warframe-public-export-plus/supplementals/util.wasm'
});

function joaat(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash + char.charCodeAt(0)) >>> 0;
    hash = (hash + (hash << 10)) >>> 0;
    hash = (hash ^ (hash >>> 6)) >>> 0;
  }
  hash = (hash + (hash << 3)) >>> 0;
  hash = (hash ^ (hash >>> 11)) >>> 0;
  return (hash + (hash << 15)) >>> 0;
}

function slug(value) {
  return String(value || 'ability').normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'ability';
}

function abilityImageName(abilityId, canonical) {
  const hash = crypto.createHash('sha256').update(abilityId).digest('hex').slice(0, 10);
  return `${slug(canonical)}-${hash}.png`;
}

function baseFrameName(canonical) {
  return String(canonical).replace(/ Prime$/i, '');
}

function comparable(value) {
  return JSON.stringify({ ...value, generatedAt: '<ignored>' });
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(60000),
    headers: { 'User-Agent': 'sharrknyana-warframe-knowledge-core/1.0' }
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function sync(options = {}) {
  const [warframesBuffer, englishBuffer, chineseBuffer, wasmBuffer] = await Promise.all([
    fetchBuffer(SOURCES.warframes),
    fetchBuffer(SOURCES.english),
    fetchBuffer(SOURCES.chinese),
    fetchBuffer(SOURCES.scaling)
  ]);
  const warframes = JSON.parse(warframesBuffer);
  const english = JSON.parse(englishBuffer);
  const chinese = JSON.parse(chineseBuffer);
  const scaling = (await WebAssembly.instantiate(wasmBuffer, {})).instance.exports.get_powersuit_scaling_values;
  const queryable = frameAcquisition.listWarframes();
  const frames = [];
  const abilityIds = new Set();
  const unresolvedHelminth = [];

  for (const summary of queryable) {
    const source = warframes[summary.officialUniqueName];
    if (!source) throw new Error(`${summary.canonical}: Public Export 缺少精确战甲对象 ${summary.officialUniqueName}`);
    if (!Array.isArray(source.abilities) || source.abilities.length !== 4) {
      throw new Error(`${summary.canonical}: Public Export 主动技能数量不是 4`);
    }
    const additions = scaling(joaat(summary.officialUniqueName), 30);
    const special = helminth.specialCases?.[summary.canonical] || null;
    const mappedNames = special?.subsumable === false ? [] : (helminth.byBaseFrame[baseFrameName(summary.canonical)] || []);
    const abilities = source.abilities.map((ability, index) => {
      const canonical = english[ability.name] || ability.name;
      const displayName = chinese[ability.name] || canonical;
      const isHelminth = mappedNames.includes(canonical);
      if (isHelminth) abilityIds.add(ability.uniqueName);
      return {
        slot: index + 1,
        abilityId: ability.uniqueName,
        canonical,
        displayName,
        nameKey: ability.name,
        iconAssetPath: ability.icon,
        imageName: abilityImageName(ability.uniqueName, canonical),
        helminthSubsumable: isHelminth
      };
    });
    const matchedHelminth = abilities.filter(ability => ability.helminthSubsumable).map(ability => ability.canonical);
    const missingMapped = mappedNames.filter(name => !matchedHelminth.includes(name));
    if (missingMapped.length) unresolvedHelminth.push({ frame: summary.canonical, expected: mappedNames, missing: missingMapped });
    frames.push({
      frameId: summary.officialUniqueName,
      canonical: summary.canonical,
      displayName: chinese[source.name] || summary.displayName || summary.canonical,
      isPrime: Boolean(summary.isPrime),
      variantType: source.variantType || null,
      stats: {
        rank0: {
          health: source.health,
          shield: source.shield,
          armor: source.armor,
          energy: source.power,
          sprintSpeed: source.sprintSpeed
        },
        rank30: {
          health: source.health + additions[0],
          shield: source.shield + additions[1],
          armor: source.armor + additions[3],
          energy: source.power + additions[2],
          sprintSpeed: source.sprintSpeed
        }
      },
      abilities,
      helminth: {
        mappedAbilityNames: mappedNames,
        matchedAbilityIds: abilities.filter(ability => ability.helminthSubsumable).map(ability => ability.abilityId),
        specialCase: special
      }
    });
  }

  if (unresolvedHelminth.length) {
    throw new Error(`Helminth 映射无法匹配实际技能：${JSON.stringify(unresolvedHelminth)}`);
  }
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      statsAndAbilities: SOURCES.warframes,
      localization: [SOURCES.english, SOURCES.chinese],
      rankScaling: SOURCES.scaling,
      helminth: helminth.source
    },
    statPolicy: {
      loadout: 'unmodded',
      rank0: 'Public Export health/shield/armor/power/sprintSpeed',
      rank30: 'Public Export rank 0 values plus util.wasm get_powersuit_scaling_values at rank 30',
      unchanged: ['sprintSpeed'],
      variantIsolation: 'frameId exact match only; Prime and variants never fall back to the base frame'
    },
    count: frames.length,
    uniqueAbilityCount: new Set(frames.flatMap(frame => frame.abilities.map(ability => ability.abilityId))).size,
    helminthAbilityCount: abilityIds.size,
    frames
  };

  if (options.check) {
    if (!fs.existsSync(TARGET)) throw new Error('generated/frame-card-metadata.json 不存在');
    const current = JSON.parse(fs.readFileSync(TARGET, 'utf8'));
    if (comparable(current) !== comparable(output)) throw new Error('战甲信息卡元数据已漂移，请运行 npm run sync:frame-cards');
    return output;
  }
  fs.writeFileSync(TARGET, `${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (require.main === module) {
  sync({ check: process.argv.includes('--check') })
    .then(output => console.log(`战甲信息卡元数据：${output.count} 个战甲，${output.uniqueAbilityCount} 个唯一技能，${output.helminthAbilityCount} 个 Helminth 技能身份`))
    .catch(error => {
      console.error(error.stack || error);
      process.exitCode = 1;
    });
}

module.exports = { SOURCES, joaat, slug, abilityImageName, baseFrameName, sync };
