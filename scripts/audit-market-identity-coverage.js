'use strict';

/**
 * 市场身份覆盖门禁
 *
 * 目的：新内容上线时，身份缺失过去只会表现为一句「没有 Prime 版本」，
 * 而且要在线上反复试才知道缺什么。本脚本把「市场可交易物 → 知识库身份」
 * 的覆盖关系变成一次可对账的审计：缺哪条、断在哪一环，直接列出来并非零退出。
 *
 * 检查项（对每个 WFM 可交易条目）：
 *   1. identity      知识库武器/战甲身份是否按 uniqueName 命中
 *   2. prime-family  Prime 条目的基础↔Prime 族谱是否连通（市场链路的关键前提）
 *   3. display-name  是否存在中文名（否则卡片会退化成英文）
 *
 * 用法：
 *   node scripts/audit-market-identity-coverage.js
 *   node scripts/audit-market-identity-coverage.js --json
 *   node scripts/audit-market-identity-coverage.js --wfm <path> [--strict]
 *   node scripts/audit-market-identity-coverage.js --limit 40
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_WFM =
  process.env.WF_WFM_CATALOG ||
  'D:/Warframe/warframe-runtime/state/wfm-lkg.json';

const SET_SUFFIX = /\s+Set$/i;
const HAS_CJK = /[\u3400-\u9fff]/u;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs(argv) {
  const out = { json: false, strict: false, wfm: DEFAULT_WFM, limit: 25 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--no-strict') out.strict = false;
    else if (a === '--wfm') out.wfm = argv[++i];
    else if (a.startsWith('--wfm=')) out.wfm = a.slice(6);
    else if (a === '--limit') out.limit = Number(argv[++i]) || 25;
    else if (a.startsWith('--limit=')) out.limit = Number(a.slice(8)) || 25;
  }
  return out;
}

function loadCatalog(file) {
  if (!fs.existsSync(file)) {
    const error = new Error(`找不到 warframe.market 目录快照：${file}`);
    error.code = 'WFM_CATALOG_MISSING';
    throw error;
  }
  const raw = readJson(file);
  const catalog = raw?.entries?.['items:catalog']?.data;
  if (!Array.isArray(catalog)) {
    const error = new Error(`warframe.market 目录结构不符合预期：${file}`);
    error.code = 'WFM_CATALOG_SHAPE';
    throw error;
  }
  return catalog;
}

function localName(entry, locale) {
  const raw = entry?.i18n?.[locale]?.name;
  return typeof raw === 'string' ? raw.trim() : '';
}

function auditWeapons(core, catalog) {
  const byUniqueName = new Map();
  const byCanonical = new Map();
  for (const weapon of core.officialWeapons?.weapons || []) {
    if (weapon?.uniqueName) byUniqueName.set(String(weapon.uniqueName), weapon);
    if (weapon?.canonical) byCanonical.set(String(weapon.canonical).toLowerCase(), weapon);
  }
  const findings = [];
  const seen = new Set();
  let checked = 0;

  for (const entry of catalog) {
    const tags = (entry?.tags || []).map(t => String(t).toLowerCase());
    if (!tags.includes('weapon') || tags.includes('mod') || tags.includes('arcane')) continue;
    if (entry?.tradable === false) continue;
    const gameRef = String(entry?.gameRef || '');
    if (!/^\/Lotus\/Weapons\//.test(gameRef)) continue;
    // 部件/蓝图走市场部件链路，不属于武器身份范畴
    const en = localName(entry, 'en');
    if (!en) continue;
    const isSet = tags.includes('set');
    const canonical = isSet ? en.replace(SET_SUFFIX, '').trim() : en;
    const isPrime = tags.includes('prime') || /\bPrime$/i.test(canonical);
    const dedupeKey = gameRef || canonical.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    checked++;

    const identity = byUniqueName.get(gameRef) || byCanonical.get(String(canonical).toLowerCase());
    if (!identity) {
      findings.push({ slug: entry.slug, canonical, gameRef, kind: 'identity-missing', detail: '武器目录里没有该身份（uniqueName 与 canonical 都未命中）' });
      continue;
    }
    if (canonical && identity.canonical !== canonical) {
      findings.push({ slug: entry.slug, canonical, gameRef, kind: 'canonical-mismatch', detail: `目录 canonical=${identity.canonical}` });
    }
    if (!HAS_CJK.test(String(identity.displayName || ''))) {
      findings.push({ slug: entry.slug, canonical, gameRef, kind: 'display-name-not-zh', detail: `displayName=${identity.displayName}` });
    }
    if (isPrime) {
      // 用知识库自己的名字解析与族谱判定，避免用字符串剥 " Prime" 猜基础名
      // （例如 Pangolin Prime 的基础武器实际是 Pangolin Sword）。
      let family = null;
      try { family = core.resolvePrimeVariantIntent ? core.resolvePrimeVariantIntent(identity.canonical) : null; } catch (_) { family = null; }
      if (!family?.prime) {
        findings.push({ slug: entry.slug, canonical, gameRef, kind: 'prime-family-broken', detail: `resolvePrimeVariantIntent('${identity.canonical}') 没有 prime 成员` });
      }
      const resolved = core.resolveName ? core.resolveName(canonical, { minScore: 70, minLead: 8 }) : null;
      if (!resolved || resolved.ambiguous || resolved.canonical !== canonical) {
        findings.push({ slug: entry.slug, canonical, gameRef, kind: 'prime-name-unresolved', detail: resolved ? `resolveName -> ${resolved.canonical}${resolved.ambiguous ? ' (ambiguous)' : ''}` : 'resolveName 无结果' });
      }
    }
  }
  return { checked, findings };
}

function auditFrames(core, catalog) {
  let frames = [];
  try { frames = core.listWarframes ? core.listWarframes() : []; } catch (_) { frames = []; }
  const byUniqueName = new Map(frames.filter(f => f?.officialUniqueName).map(f => [String(f.officialUniqueName), f]));
  const byCanonical = new Map(frames.filter(f => f?.canonical).map(f => [String(f.canonical).toLowerCase(), f]));
  const findings = [];
  let checked = 0;
  for (const entry of catalog) {
    const tags = (entry?.tags || []).map(t => String(t).toLowerCase());
    if (!tags.includes('warframe')) continue;
    // 战甲强化 Mod（Augment）也带 warframe 标签，但不是战甲身份
    if (tags.includes('mod') || tags.includes('arcane') || tags.includes('augment')) continue;
    if (entry?.tradable === false) continue;
    const gameRef = String(entry?.gameRef || '');
    if (!/^\/Lotus\/Powersuits\//.test(gameRef)) continue;
    const en = localName(entry, 'en');
    if (!en) continue;
    const canonical = en.replace(SET_SUFFIX, '').trim();
    checked++;
    if (byUniqueName.has(gameRef)) continue;
    if (byCanonical.has(canonical.toLowerCase())) continue;
    findings.push({ slug: entry.slug, canonical, gameRef, kind: 'frame-identity-missing', detail: '战甲目录里没有该身份' });
  }
  return { checked, findings };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  let catalog;
  try {
    catalog = loadCatalog(args.wfm);
  } catch (error) {
    if (error.code === 'WFM_CATALOG_MISSING' && !args.strict) {
      console.warn('[skip] ' + error.message + '（加 --strict 可让缺失导致失败）');
      return 0;
    }
    throw error;
  }

  const { createKnowledgeCore } = require(path.join(ROOT, 'src'));
  const core = createKnowledgeCore({ root: ROOT });

  const weapons = auditWeapons(core, catalog);
  const frames = auditFrames(core, catalog);
  const findings = [...weapons.findings, ...frames.findings];

  const grouped = findings.reduce((acc, f) => {
    (acc[f.kind] = acc[f.kind] || []).push(f);
    return acc;
  }, {});

  if (args.json) {
    console.log(JSON.stringify({ catalog: args.wfm, checked: { weapons: weapons.checked, frames: frames.checked }, total: findings.length, grouped }, null, 2));
  } else {
    console.log(`市场身份覆盖审计：武器条目=${weapons.checked}  战甲条目=${frames.checked}  问题=${findings.length}`);
    for (const [kind, rows] of Object.entries(grouped)) {
      console.log(`\n[${kind}] ${rows.length} 条`);
      for (const row of rows.slice(0, args.limit)) {
        console.log(`  ${String(row.slug).padEnd(34)} ${String(row.canonical).padEnd(26)} ${row.detail}`);
      }
      if (rows.length > args.limit) console.log(`  ... 其余 ${rows.length - args.limit} 条（--limit 调整）`);
    }
    if (!findings.length) console.log('✓ 市场可交易条目全部有可解析身份');
  }

  return findings.length ? 1 : 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}

module.exports = { auditWeapons, auditFrames, loadCatalog, DEFAULT_WFM };
