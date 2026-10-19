'use strict';

/**
 * 生成/校验 knowledge/supplemental/official-weapons.json
 *
 * 背景：DE 的公开导出（browse.wf 的 warframe-public-export-plus）会滞后于游戏内容。
 * 每次新内容上线，武器身份就会缺失，导致 prime 族谱断链（市场侧只会回
 * 「没有 Prime 版本」）。历史做法是手工在多个地方补，容易漏、也无法对账。
 *
 * 本脚本把「增量身份」收敛成一条命令：
 *   - 权威基线 = DE 导出（cache/warframe-export-weapons.json）
 *   - 增量来源 = warframe.market 目录（自带 gameRef=uniqueName 与 zh-hans 名称）
 *   - 产物      = knowledge/supplemental/official-weapons.json（纯数组，按 uniqueName 排序）
 *
 * 用法：
 *   node scripts/sync-weapon-identity-supplements.js            # 写入/更新
 *   node scripts/sync-weapon-identity-supplements.js --check     # 漂移检查（有漂移则非零退出）
 *   node scripts/sync-weapon-identity-supplements.js --report    # 只打印，不写
 *   node scripts/sync-weapon-identity-supplements.js --wfm <path>
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DE_EXPORT = path.join(ROOT, 'cache', 'warframe-export-weapons.json');
const OUTPUT = path.join(ROOT, 'knowledge', 'supplemental', 'official-weapons.json');
const DEFAULT_WFM =
  process.env.WF_WFM_CATALOG ||
  'D:/Warframe/warframe-runtime/state/wfm-lkg.json';

const EQUIPMENT_TAGS = Object.freeze({
  melee: 'melee',
  primary: 'primary',
  secondary: 'secondary',
  archgun: 'arch-gun',
  arch_gun: 'arch-gun',
  archmelee: 'arch-melee',
  arch_melee: 'arch-melee',
  sentinelweapon: 'companion',
  companion: 'companion',
  robotic: 'companion'
});

const SET_SUFFIX = /\s+Set$/i;
const SET_ZH_SUFFIX = /\s*(?:一套|套装)$/u;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs(argv) {
  const out = { check: false, report: false, wfm: DEFAULT_WFM, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') out.check = true;
    else if (a === '--report') out.report = true;
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--wfm') out.wfm = argv[++i];
    else if (a.startsWith('--wfm=')) out.wfm = a.slice(6);
  }
  return out;
}

/** WFM 目录：{ version, entries: { 'items:catalog': { data: [...] } } } */
function loadWfmCatalog(file) {
  if (!fs.existsSync(file)) {
    const error = new Error(`找不到 warframe.market 目录快照：${file}`);
    error.code = 'WFM_CATALOG_MISSING';
    throw error;
  }
  const raw = readJson(file);
  const catalog = raw?.entries?.['items:catalog']?.data;
  if (!Array.isArray(catalog)) {
    const error = new Error(`warframe.market 目录结构不符合预期（缺少 entries['items:catalog'].data）：${file}`);
    error.code = 'WFM_CATALOG_SHAPE';
    throw error;
  }
  return catalog;
}

function equipmentTypeFromTags(tags) {
  for (const tag of tags || []) {
    const mapped = EQUIPMENT_TAGS[String(tag).toLowerCase()];
    if (mapped) return mapped;
  }
  return null;
}

function isWeaponEntry(entry) {
  const tags = (entry?.tags || []).map(t => String(t).toLowerCase());
  if (!tags.includes('weapon')) return false;
  if (tags.includes('mod') || tags.includes('arcane')) return false;
  if (!entry?.gameRef || !/^\/Lotus\/Weapons\//.test(String(entry.gameRef))) return false;
  return true;
}

function localName(entry, locale) {
  const raw = entry?.i18n?.[locale]?.name;
  return typeof raw === 'string' ? raw.trim() : '';
}

/** 由 WFM 条目推导武器身份（套装条目去掉 Set / 一套 后缀） */
function deriveIdentity(entry) {
  const tags = (entry.tags || []).map(t => String(t).toLowerCase());
  const isSet = tags.includes('set');
  const en = localName(entry, 'en');
  const zh = localName(entry, 'zh-hans');
  if (!en) return null;

  const canonical = isSet ? en.replace(SET_SUFFIX, '').trim() : en;
  const displayName = isSet ? (zh.replace(SET_ZH_SUFFIX, '').trim() || canonical) : (zh || canonical);
  const equipmentType = equipmentTypeFromTags(tags);
  if (!equipmentType) return null;

  const isPrime = tags.includes('prime');
  return {
    uniqueName: String(entry.gameRef),
    canonical,
    displayName,
    nameLanguageKey: null,
    descriptionLanguageKey: null,
    description: {
      canonical: '',
      display: '',
      localizationStatus: displayName === canonical ? 'official-zh-unavailable' : 'market-zh-hans'
    },
    localizationStatus: displayName === canonical ? 'official-zh-unavailable' : 'market-zh-hans',
    equipmentType,
    omegaAttenuation: null,
    disposition: null,
    masteryReq: null,
    productCategory: null,
    attackClassification: {
      modes: [],
      hitscan: 'unknown',
      projectile: 'unknown',
      aoe: 'unknown',
      punchThrough: 'unknown',
      lockOn: 'review-required',
      tracking: 'review-required',
      medium: 'review-required'
    },
    classification: {
      categoryRefs: [`weapon.${equipmentType}`, ...(isPrime ? [] : [])]
    },
    sourceFields: {
      identity: 'market-catalog-delta',
      localization: displayName === canonical ? 'missing' : 'warframe.market/zh-hans',
      stats: 'pending-DE-export'
    },
    status: 'review-required',
    reviewReason: 'de-export-lags-behind-release',
    supplement: {
      authority: 'warframe.market catalog (gameRef + i18n)',
      marketSlug: String(entry.slug || ''),
      prime: isPrime,
      setSlug: isSet ? String(entry.slug || '') : null,
      addedAt: new Date().toISOString().slice(0, 10),
      note: 'DE 公开导出尚未收录；待官方导出同步后本条目可删除。'
    }
  };
}

function build({ deExportFile, wfmFile }) {
  const deRaw = readJson(deExportFile);
  const deKeys = new Set(Object.keys(deRaw));
  const catalog = loadWfmCatalog(wfmFile);

  const derived = new Map();
  const skipped = [];
  for (const entry of catalog) {
    if (!isWeaponEntry(entry)) continue;
    if (deKeys.has(String(entry.gameRef))) continue; // 官方导出已覆盖，不需要补
    const identity = deriveIdentity(entry);
    if (!identity) {
      skipped.push({ slug: entry.slug, reason: '无法推导身份（缺 en 名称或装备类型）' });
      continue;
    }
    const existing = derived.get(identity.uniqueName);
    // 同一 uniqueName 可能既有 set 又有单件条目：单件优先保留（名称不带 Set）
    if (!existing || (existing.supplement.setSlug && !identity.supplement.setSlug)) {
      derived.set(identity.uniqueName, identity);
    }
  }

  // 保留既有文件中无法从 WFM 推导出来的条目（人工复核过的）
  const existingFile = fs.existsSync(OUTPUT) ? readJson(OUTPUT) : [];
  const keptManual = [];
  for (const item of Array.isArray(existingFile) ? existingFile : []) {
    if (!item || !item.uniqueName) continue;
    if (derived.has(item.uniqueName)) continue;
    if (item.sourceFields && item.sourceFields.identity === 'market-catalog-delta') continue; // 已不再需要
    keptManual.push(item);
  }

  const entries = [...derived.values(), ...keptManual]
    .sort((a, b) => String(a.uniqueName).localeCompare(String(b.uniqueName)));

  return { entries, stats: { deWeapons: deKeys.size, catalog: catalog.length, derived: derived.size, keptManual: keptManual.length, skipped } };
}

function serialize(entries) {
  return JSON.stringify(entries, null, 2) + '\n';
}

function summarize(entries) {
  return entries.map(e => `  ${e.canonical.padEnd(28)} ${e.displayName.padEnd(20)} ${e.equipmentType.padEnd(10)} ${e.uniqueName}`).join('\n');
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  let built;
  try {
    built = build({ deExportFile: DE_EXPORT, wfmFile: args.wfm });
  } catch (error) {
    if (error.code === 'WFM_CATALOG_MISSING' && args.check) {
      console.warn('[skip] ' + error.message);
      return 0;
    }
    throw error;
  }

  const next = serialize(built.entries);
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : null;

  if (!args.quiet) {
    console.log(`DE 导出武器=${built.stats.deWeapons}  WFM 目录=${built.stats.catalog}  增量身份=${built.stats.derived}  人工保留=${built.stats.keptManual}`);
    if (built.entries.length) console.log(summarize(built.entries));
    for (const s of built.stats.skipped.slice(0, 10)) console.log(`  [skip] ${s.slug}: ${s.reason}`);
  }

  if (args.check) {
    if (current !== next) {
      console.error('武器增量身份已漂移：请运行 npm run sync:weapon-identity-supplements');
      return 1;
    }
    console.log(`武器增量身份无漂移（${built.entries.length} 条）`);
    return 0;
  }

  if (args.report) return 0;

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, next);
  console.log(`已写入 ${path.relative(ROOT, OUTPUT).replace(/\\/g, '/')}（${built.entries.length} 条）`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}

module.exports = { build, deriveIdentity, isWeaponEntry, loadWfmCatalog, OUTPUT, DEFAULT_WFM };
