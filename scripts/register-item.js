#!/usr/bin/env node
'use strict';

// 新增道具/资源的**唯一入口**。
//
// 背景：一件物品要同时出现在 8 张互不派生的登记表里，任何一处漏掉都会表现成
// 「解析不到」「取不到图」「图标 token 不认」「翻译硬译」这类看起来毫不相关的故障。
// 官方导出/Wiki 里已有的物品由 sync-*.js / compile-*.js 生成；**手喂的新物品一律走这里**。
//
//   node scripts/register-item.js --spec <spec.json> [--verify] [--dry-run] [--report <path>]
//   node scripts/register-item.js --spec <spec.json> --remove        # 反向注销（用于回归/回滚）
//
// spec.json（UTF-8）字段见 README-ITEM-REGISTRATION 注释底部，最小示例：
//   {
//     "kind": "resource",
//     "canonical": "Riven Splicer",
//     "displayName": "裂罅熔融器",
//     "aliases": ["紫卡融合器", "词条融合器"],
//     "officialUniqueName": "/Lotus/Types/Items/MiscItems/RivenSplicer",
//     "category": "resource-current-wiki",
//     "source": { "mode": "text", "text": "完成冰封羁绊必定获得1个。" },
//     "image": {
//       "sourcePath": "D:/Temp/RivenSplicer.webp",
//       "assetKind": "current-wiki-item-icon",
//       "assetSource": "current-wiki-media",
//       "assetReviewStatus": "approved",
//       "pageUrl": "https://wiki.warframe.com/w/Riven_Splicer",
//       "provenance": "user-provided(RivenSplicer.webp)"
//     }
//   }
//
// 退出码：0 = 写入完成且自检全绿；1 = 有自检失败（报告里列出）。
// 幂等：重复执行只更新差异，不产生重复行；未改动文件不会留下 .bak。

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const KC_ROOT = path.resolve(__dirname, '..');
const CONTENT_ROOT = path.resolve(process.env.WF_CONTENT_ROOT || 'D:/Warframe/warframe-content');
const BOT_ROOT = path.resolve(process.env.WF_QQ_BOT_ROOT || 'D:/qq-bot');
const RUNTIME_ROOT = path.resolve(process.env.WF_RUNTIME_ROOT || 'D:/Warframe/warframe-runtime');

const RESOURCE_ROOT = path.join(KC_ROOT, 'knowledge', 'acquisition', 'resource');
const ENTRY_DIR = path.join(RESOURCE_ROOT, 'entries');
const INDEX_PATH = path.join(RESOURCE_ROOT, 'categories.json');
const ALIASES_PATH = path.join(KC_ROOT, 'knowledge', 'facts', 'aliases.json');
const REVIEWED_ASSETS_PATH = path.join(KC_ROOT, 'knowledge', 'assets', 'reviewed-resource-assets.json');
const ASSET_CATALOG_PATH = path.join(KC_ROOT, 'generated', 'resource-asset-catalog.json');
const CONTENT_IMAGE_DIR = path.join(CONTENT_ROOT, 'images', 'resource-images');
const CONTENT_IMAGE_MANIFEST = path.join(CONTENT_IMAGE_DIR, 'manifest.json');
const RICH_ICON_DIR = path.join(BOT_ROOT, 'warframe-rich-icons');
const RICH_ICON_MANIFEST = path.join(RICH_ICON_DIR, 'manifest.json');
const DICT_ZH_TO_EN = path.join(BOT_ROOT, 'wf_dict.json');
const DICT_EN_TO_ZH = path.join(BOT_ROOT, 'wf_en_cn_full.json');
const SLANG_RESOURCES = path.join(CONTENT_ROOT, 'source', 'slang', 'resources.md');

const DEFAULTS = Object.freeze({
  category: 'resource-current-wiki',
  reviewStatus: 'approved',
  assetKind: 'current-wiki-item-icon',
  assetSource: 'current-wiki-media',
  assetReviewStatus: 'approved',
  roles: ['item-display', 'inventory-resource-icon', 'currency-inline-icon'],
  availability: 'active-current'
});

// ── 通用工具 ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const options = { spec: null, verify: true, dryRun: false, remove: false, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--spec') options.spec = argv[++index];
    else if (token === '--report') options.report = argv[++index];
    else if (token === '--dry-run') options.dryRun = true;
    else if (token === '--no-verify') options.verify = false;
    else if (token === '--remove') options.remove = true;
    else if (token === '--help' || token === '-h') options.help = true;
    else throw new Error(`未知参数：${token}`);
  }
  return options;
}
function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== null) return fallback; throw error; }
}
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function slugify(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function stableStringify(value) { return `${JSON.stringify(value, null, 2)}\n`; }

class Writer {
  constructor(dryRun) { this.dryRun = dryRun; this.backups = []; this.changes = []; }
  writeText(file, text, label) {
    const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (previous === text) return false;
    if (!this.dryRun) {
      if (previous !== null) {
        const backup = `${file}.bak-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
        if (!fs.existsSync(backup)) fs.writeFileSync(backup, previous, 'utf8');
        this.backups.push(backup);
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text, 'utf8');
    }
    this.changes.push(label || path.basename(file));
    return true;
  }
  writeJson(file, value, label) { return this.writeText(file, stableStringify(value), label); }
}

// ── 图片处理 ────────────────────────────────────────────────────────────────
function loadSharp() {
  const candidates = [
    path.join(BOT_ROOT, 'node_modules', 'sharp'),
    path.join(RUNTIME_ROOT, 'node_modules', 'sharp'),
    'sharp'
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch (_) { /* 继续 */ }
  }
  throw new Error('找不到 sharp：图片转码需要 sharp（或直接在 spec.image.imageName 里给出已就位的 PNG）');
}

async function prepareImage(spec, writer) {
  const image = spec.image || null;
  if (!image) return null;
  if (!image.sourcePath) {
    if (!image.imageName) throw new Error('image 需要 sourcePath 或 imageName');
    const file = path.join(CONTENT_IMAGE_DIR, image.imageName);
    const buffer = fs.readFileSync(file);
    // 图片已就位（或由别的流程生成）：复用字节，元数据可由 spec.image.meta 补齐，
    // 这样重复注册不会因为重新编码 PNG 而改变文件名/哈希。
    return {
      imageName: image.imageName,
      sha256: sha256(buffer),
      bytes: buffer.length,
      reused: true,
      ...(image.meta || {})
    };
  }
  const sharp = loadSharp();
  const source = path.resolve(image.sourcePath);
  const raw = fs.readFileSync(source);
  const png = await sharp(raw).png({ compressionLevel: 9 }).toBuffer();
  const sourceSha256 = sha256(png);
  let derived = png;
  let derivationMethod = 'png-transcode-v1';
  try {
    const trimmed = await sharp(png).trim({ threshold: 12 }).png({ compressionLevel: 9 }).toBuffer();
    const meta = await sharp(trimmed).metadata();
    if (meta.width && meta.height && trimmed.length > 0) { derived = trimmed; derivationMethod = 'transparent-bounds-crop-v1'; }
  } catch (_) { /* 保持原图 */ }
  const meta = await sharp(derived).metadata();
  const imageName = image.imageName || `${slugify(spec.canonical)}-${sha256(derived).slice(0, 10)}.png`;
  writer.writeText(path.join(CONTENT_IMAGE_DIR, imageName), derived, `image:${imageName}`);
  if (!writer.dryRun) fs.copyFileSync(path.join(CONTENT_IMAGE_DIR, imageName), path.join(RICH_ICON_DIR, imageName));
  return {
    imageName, sha256: sha256(derived), sourceSha256, bytes: derived.length,
    width: meta.width, height: meta.height, hasAlpha: Boolean(meta.hasAlpha),
    derivationMethod, sourceFileName: path.basename(source)
  };
}

// ── 各登记表 upsert / remove ────────────────────────────────────────────────
function resourceEntryFile(spec) { return path.join(ENTRY_DIR, `${slugify(spec.canonical)}.json`); }

function buildResourceEntry(spec) {
  const aliases = spec.aliases || [];
  const sourceText = spec.source?.text || null;
  const methods = sourceText
    ? [{
      type: 'route',
      variables: { text: sourceText },
      requirements: { type: 'none' },
      reviewStatus: 'approved',
      provenance: spec.source?.provenance || { source: 'user-provided', fetchedAt: new Date().toISOString().slice(0, 10) }
    }]
    : (spec.source?.methods || []);
  return {
    id: `knowledge.acquisition.resource.${slugify(spec.canonical)}`,
    kind: 'knowledge',
    module: 'acquisition',
    title: spec.canonical,
    subject: {
      canonical: spec.canonical,
      displayName: spec.displayName,
      category: 'resource',
      officialUniqueName: spec.officialUniqueName || null,
      categoryRefs: [spec.category || DEFAULTS.category],
      roleTags: ['resource']
    },
    aliases,
    prerequisites: [],
    methodRefs: [],
    resourceAcquisition: {
      generated: {
        officialUniqueName: spec.officialUniqueName || null,
        canonical: spec.canonical,
        displayName: spec.displayName,
        localizationStatus: spec.localizationStatus || 'reviewed-zh',
        semanticKinds: spec.semanticKinds || ['resource', 'material-or-usable'],
        evidence: spec.source?.claim ? [{ type: 'reviewed-claim', reviewStatus: 'approved', provenance: spec.source.provenance || { source: 'user-provided' }, ...spec.source.claim }] : [],
        routing: {
          category: 'resource-unresolved',
          variables: { resourceName: spec.displayName },
          status: 'unresolved'
        }
      },
      manual: {
        tips: spec.tips || [],
        tipKeywords: [],
        presentationText: '',
        description: '',
        routingOverride: {
          category: spec.category || DEFAULTS.category,
          variables: { resourceName: spec.displayName },
          methods,
          status: 'compiled'
        },
        reviewedBy: [spec.reviewedBy || 'user-provided-source']
      }
    },
    sources: spec.sources || [{ url: spec.source?.pageUrl || 'https://wiki.warframe.com/', label: '待复核' }],
    gameVersion: 'current',
    updatedAt: new Date().toISOString().slice(0, 10),
    reviewStatus: spec.reviewStatus || DEFAULTS.reviewStatus,
    reviewedBy: [spec.reviewedBy || 'user-provided-source'],
    summary: spec.summary || `${spec.displayName}（${spec.canonical}）的资源身份与获取来源。`,
    tags: ['acquisition', 'resource', 'reviewed']
  };
}

function upsertResourceEntry(spec, writer) {
  const file = resourceEntryFile(spec);
  if (spec.remove) {
    if (!fs.existsSync(file)) return 'entry:absent';
    const backup = `${file}.bak-${Date.now()}`;
    if (!writer.dryRun) { fs.renameSync(file, backup); writer.backups.push(backup); }
    writer.changes.push('entry:removed');
    return 'entry:removed';
  }
  writer.writeJson(file, buildResourceEntry(spec), 'entry');
  return 'entry:written';
}

function upsertResourceIndexRow(spec, writer) {
  const doc = readJson(INDEX_PATH);
  const slug = slugify(spec.canonical);
  const rows = doc.resources || [];
  const at = rows.findIndex(row => row.canonical === spec.canonical || row.file === `entries/${slug}.json`);
  if (spec.remove) {
    if (at < 0) return 'index:absent';
    rows.splice(at, 1);
  } else {
    const row = {
      canonical: spec.canonical,
      displayName: spec.displayName,
      officialUniqueName: spec.officialUniqueName || null,
      file: `entries/${slug}.json`,
      category: spec.category || DEFAULTS.category,
      reviewStatus: spec.reviewStatus || DEFAULTS.reviewStatus
    };
    if (at < 0) {
      const insertAt = rows.findIndex(item => String(item.canonical).localeCompare(spec.canonical, 'en') > 0);
      if (insertAt < 0) rows.push(row); else rows.splice(insertAt, 0, row);
    } else rows[at] = row;
  }
  doc.resources = rows;
  doc.count = rows.length;
  doc.generatedAt = new Date().toISOString().slice(0, 10);
  writer.writeJson(INDEX_PATH, doc, 'index');
  return `index:${spec.remove ? 'removed' : 'written'}`;
}

function upsertReviewedAsset(spec, image, writer) {
  const doc = readJson(REVIEWED_ASSETS_PATH);
  const entries = doc.entries || [];
  const at = entries.findIndex(entry => entry.uniqueName === spec.officialUniqueName);
  if (spec.remove) {
    if (at < 0) return 'reviewedAsset:absent';
    entries.splice(at, 1);
  } else {
    const entry = {
      stableEntityId: `resource.${slugify(spec.canonical)}`,
      uniqueName: spec.officialUniqueName,
      canonical: spec.canonical,
      displayName: spec.displayName,
      semanticKinds: spec.semanticKinds || ['resource', 'material-or-usable'],
      assetRoles: spec.roles || DEFAULTS.roles,
      availability: spec.availability || DEFAULTS.availability,
      imageName: image?.imageName || null,
      evidence: {
        source: spec.image?.provenance || 'user-provided',
        provenanceType: 'user-provided-copy',
        pageUrl: spec.image?.pageUrl || null,
        mediaFilename: image?.sourceFileName || null,
        // 幂等：同一身份重复注册时保留首次登记时间，避免每次跑都改文件
        capturedAt: entries[at]?.evidence?.capturedAt || new Date().toISOString(),
        sha256: image?.sha256 || null,
        note: spec.image?.note || '用户提供的素材图；官方导出/Wiki 复核后升级证据链'
      },
      reviewStatus: spec.assetReviewStatus || DEFAULTS.assetReviewStatus
    };
    if (at < 0) entries.push(entry); else entries[at] = entry;
    entries.sort((left, right) => String(left.stableEntityId).localeCompare(String(right.stableEntityId)));
  }
  doc.entries = entries;
  writer.writeJson(REVIEWED_ASSETS_PATH, doc, 'reviewedAsset');
  return `reviewedAsset:${spec.remove ? 'removed' : 'written'}`;
}

function upsertAssetCatalogRow(spec, image, writer) {
  const doc = readJson(ASSET_CATALOG_PATH, null);
  if (!doc || !Array.isArray(doc.entries)) return 'assetCatalog:skipped';
  const at = doc.entries.findIndex(entry => entry?.stableIdentity?.uniqueName === spec.officialUniqueName);
  if (spec.remove) {
    if (at < 0) return 'assetCatalog:absent';
    doc.entries.splice(at, 1);
  } else {
    const template = doc.entries.find(entry => entry?.catalogStatus === 'ready' && String(entry?.category || '') !== 'token-or-currency')
      || doc.entries.find(entry => entry?.catalogStatus === 'ready')
      || doc.entries[0] || null;
    const entry = template ? JSON.parse(JSON.stringify(template)) : { stableIdentity: {} };
    entry.stableIdentity = { ...(entry.stableIdentity || {}), uniqueName: spec.officialUniqueName, canonical: spec.canonical, displayName: spec.displayName, officialUniqueName: spec.officialUniqueName };
    entry.imageName = image?.imageName || entry.imageName || null;
    if (entry.image) entry.image = { ...entry.image, name: image?.imageName || entry.image.name };
    entry.catalogStatus = 'ready';
    entry.source = spec.image?.provenance || 'user-provided';
    entry.reviewStatus = spec.assetReviewStatus || DEFAULTS.assetReviewStatus;
    if (at < 0) doc.entries.push(entry); else doc.entries[at] = entry;
  }
  doc.count = doc.entries.length;
  doc.generatedAt = new Date().toISOString();
  writer.writeJson(ASSET_CATALOG_PATH, doc, 'assetCatalog');
  return `assetCatalog:${spec.remove ? 'removed' : 'written'}`;
}

function upsertContentImageManifest(spec, image, writer) {
  const doc = readJson(CONTENT_IMAGE_MANIFEST);
  const rows = doc.resources || [];
  const at = rows.findIndex(row => row.uniqueName === spec.officialUniqueName);
  if (spec.remove) {
    if (at < 0) return 'imageManifest:absent';
    rows.splice(at, 1);
  } else {
    if (!image) return 'imageManifest:skipped(no-image)';
    const row = {
      id: `resource:${spec.officialUniqueName}`,
      kind: 'resource',
      category: 'resource',
      uniqueName: spec.officialUniqueName,
      officialUniqueName: spec.officialUniqueName,
      canonical: spec.canonical,
      displayName: spec.displayName,
      imageName: image.imageName,
      presentation: 'display',
      role: 'item-display',
      assetKind: spec.image?.assetKind || DEFAULTS.assetKind,
      source: spec.image?.assetSource || DEFAULTS.assetSource,
      sourceFileName: image.sourceFileName || null,
      sourceUrl: spec.image?.pageUrl || null,
      pageUrl: spec.image?.pageUrl || null,
      mime: 'image/png',
      width: image.width,
      height: image.height,
      hasAlpha: Boolean(image.hasAlpha),
      sourceSha256: image.sourceSha256 || null,
      derivationMethod: image.derivationMethod || null,
      sha256: image.sha256,
      assetStatus: 'resolved',
      reviewStatus: spec.image?.assetReviewStatus || DEFAULTS.assetReviewStatus,
      provenanceNote: spec.image?.note || '用户提供的素材图；等 current Wiki 复核后补 approved-current-wiki 证据链'
    };
    if (at < 0) {
      const insertAt = rows.findIndex(item => String(item.canonical).localeCompare(spec.canonical, 'en') > 0);
      if (insertAt < 0) rows.push(row); else rows.splice(insertAt, 0, row);
    } else rows[at] = row;
  }
  doc.resources = rows;
  doc.count = rows.length;
  doc.generatedAt = new Date().toISOString();
  writer.writeJson(CONTENT_IMAGE_MANIFEST, doc, 'imageManifest');
  return `imageManifest:${spec.remove ? 'removed' : 'written'}`;
}

function upsertRichIcon(spec, image, writer) {
  const doc = readJson(RICH_ICON_MANIFEST);
  const icons = doc.icons || [];
  const id = `resource.${slugify(spec.canonical)}`;
  const at = icons.findIndex(icon => icon.id === id);
  if (spec.remove) {
    if (at < 0) return 'richIcon:absent';
    icons.splice(at, 1);
  } else {
    if (!image) return 'richIcon:skipped(no-image)';
    const icon = {
      id,
      canonical: spec.canonical,
      displayName: spec.displayName,
      // 注册表自身会把 id/canonical/displayName 一起并入可匹配名，这里只放别称，避免重复
      aliases: spec.aliases || [],
      imageName: image.imageName,
      assetRole: 'inventory-resource-icon',
      presentation: 'icon',
      provenance: spec.image?.provenance || 'user-provided',
      sourceFile: image.sourceFileName || null,
      sourceUrl: spec.image?.pageUrl || null
    };
    if (at < 0) icons.push(icon); else icons[at] = icon;
    icons.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  }
  doc.icons = icons;
  writer.writeJson(RICH_ICON_MANIFEST, doc, 'richIcon');
  return `richIcon:${spec.remove ? 'removed' : 'written'}`;
}

function upsertDictionaries(spec, writer) {
  const zhToEn = readJson(DICT_ZH_TO_EN);
  const enToZh = readJson(DICT_EN_TO_ZH);
  const names = [spec.displayName, ...(spec.aliases || [])];
  if (spec.remove) {
    delete enToZh[spec.canonical];
    for (const name of names) delete zhToEn[name];
  } else {
    enToZh[spec.canonical] = spec.displayName;
    for (const name of names) zhToEn[name] = spec.canonical;
  }
  writer.writeJson(DICT_ZH_TO_EN, zhToEn, 'dict:zh→en');
  writer.writeJson(DICT_EN_TO_ZH, enToZh, 'dict:en→zh');
  return `dictionaries:${spec.remove ? 'removed' : 'written'}`;
}

function aliasSection(kind) {
  if (kind === 'resource') return 'resources';
  if (kind === 'weapon') return 'weapons';
  if (kind === 'mod') return 'mods';
  if (kind === 'companion') return 'companions';
  if (kind === 'consumable') return 'consumables';
  return 'terms';
}
function upsertAliases(spec, writer) {
  const doc = readJson(ALIASES_PATH);
  const section = aliasSection(spec.kind);
  if (section === 'terms') {
    // terms 是「中文 → 规范名」映射
    if (spec.remove) for (const name of [spec.displayName, ...(spec.aliases || [])]) delete doc.terms[name];
    else for (const name of [spec.displayName, ...(spec.aliases || [])]) doc.terms[name] = spec.canonical;
  } else {
    doc[section] = doc[section] && typeof doc[section] === 'object' ? doc[section] : {};
    if (spec.remove) delete doc[section][spec.canonical];
    else doc[section][spec.canonical] = [spec.displayName, ...(spec.aliases || []).filter(alias => alias !== spec.displayName)];
  }
  writer.writeJson(ALIASES_PATH, doc, `aliases:${section}`);
  return `aliases:${section}`;
}

function upsertSlang(spec, writer) {
  if (!fs.existsSync(SLANG_RESOURCES)) return 'slang:skipped(missing-file)';
  const text = fs.readFileSync(SLANG_RESOURCES, 'utf8');
  const block = `## ${spec.canonical}\n别名：${[spec.displayName, ...(spec.aliases || [])].join('、')}\n模式：追加`;
  const pattern = new RegExp(`##\\s*${spec.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n(?:[^\\n]*\\n)*?(?=\\n##|$)`, 'u');
  if (spec.remove) {
    if (!pattern.test(text)) return 'slang:absent';
    writer.writeText(SLANG_RESOURCES, text.replace(pattern, '').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n', 'slang');
    return 'slang:removed';
  }
  const next = pattern.test(text) ? text.replace(pattern, `${block}\n`) : `${text.trimEnd()}\n\n${block}\n`;
  writer.writeText(SLANG_RESOURCES, next, 'slang');
  return 'slang:written';
}

// ── 自检 ────────────────────────────────────────────────────────────────────
function selfChecks(spec, image) {
  const checks = [];
  const record = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: detail == null ? null : String(detail).slice(0, 200) });

  // 1) 知识库资源解析 + 获取文案
  try {
    const acquisition = require(path.join(KC_ROOT, 'src', 'resource-acquisition.js'));
    for (const name of [spec.displayName, spec.canonical, ...(spec.aliases || [])]) {
      const entry = acquisition.resolveResource(name);
      record(`kc.resolve:${name}`, entry?.subject?.canonical === spec.canonical, entry ? `${entry.subject?.displayName}` : '未解析');
    }
    const result = acquisition.getResourceAcquisition(spec.displayName);
    record('kc.acquisitionText', Boolean(result?.text), result?.text);
    if (spec.source?.text) record('kc.sourceWording', String(result?.text || '').includes(spec.source.text), spec.source.text);
    record('kc.listResources', acquisition.listResources().some(item => item.canonical === spec.canonical), null);
  } catch (error) { record('kc.resolve', false, error.message); }

  // 2) 索引行确实存在（漏了它解析就会回退到模糊匹配）
  try {
    const index = readJson(INDEX_PATH);
    const row = (index.resources || []).find(item => item.canonical === spec.canonical);
    record('kc.categoriesIndex', Boolean(row), row ? row.file : '缺索引行');
    record('kc.entryFile', fs.existsSync(resourceEntryFile(spec)), resourceEntryFile(spec));
  } catch (error) { record('kc.categoriesIndex', false, error.message); }

  // 3) 别名 / 词典
  try {
    const aliases = readJson(ALIASES_PATH);
    const section = aliasSection(spec.kind);
    const expected = section === 'terms' ? aliases.terms?.[spec.displayName] : aliases[section]?.[spec.canonical];
    record('aliases', Boolean(expected), JSON.stringify(expected).slice(0, 120));
  } catch (error) { record('aliases', false, error.message); }
  try {
    const { loadTranslationDictionaries } = require(path.join(RUNTIME_ROOT, 'packages', 'server', 'src', 'translation', 'dictionary-loader.js'));
    const dict = loadTranslationDictionaries({ botRoot: BOT_ROOT });
    record('dict.enToZh', dict.enCnLower[String(spec.canonical).toLowerCase()] === spec.displayName, dict.enCnLower[String(spec.canonical).toLowerCase()]);
    record('dict.zhToEn', dict.zhCnDict[spec.displayName] === spec.canonical, dict.zhCnDict[spec.displayName]);
    for (const alias of spec.aliases || []) record(`dict.alias:${alias}`, dict.zhCnDict[alias] === spec.canonical, dict.zhCnDict[alias]);
  } catch (error) { record('dict', false, error.message); }

  // 4) 图片：文件 + 策略 + 清单
  if (image) {
    const contentFile = path.join(CONTENT_IMAGE_DIR, image.imageName);
    record('image.contentFile', fs.existsSync(contentFile), image.imageName);
    record('image.richIconFile', fs.existsSync(path.join(RICH_ICON_DIR, image.imageName)), image.imageName);
    if (image.sha256 && fs.existsSync(contentFile)) record('image.sha256', sha256(fs.readFileSync(contentFile)) === image.sha256, image.sha256);
    try {
      const manifest = readJson(CONTENT_IMAGE_MANIFEST);
      const row = (manifest.resources || []).find(item => item.uniqueName === spec.officialUniqueName);
      record('image.manifestRow', Boolean(row), row ? row.imageName : '清单缺行');
      try {
        const { sourcePolicy, ResourceAssetPolicy } = require(path.join(RUNTIME_ROOT, 'packages', 'rendering', 'src', 'asset-resolver', 'resource-assets.js'));
        record('image.sourcePolicy', sourcePolicy(row).ok, JSON.stringify(sourcePolicy(row)));
        const validation = ResourceAssetPolicy.validateEntry({ ...row, kind: 'resource' });
        record('image.policyValidate', validation.ok, JSON.stringify(validation));
      } catch (error) { record('image.policyValidate', false, error.message); }
    } catch (error) { record('image.manifestRow', false, error.message); }
    try {
      const { createRichIconRegistry } = require(path.join(RUNTIME_ROOT, 'packages', 'rendering', 'src', 'rich-icon-registry.js'));
      const registry = createRichIconRegistry({ directory: RICH_ICON_DIR });
      for (const name of [spec.displayName, spec.canonical, ...(spec.aliases || [])]) {
        const resolved = registry.resolveExact(name);
        record(`richIcon.resolve:${name}`, resolved?.assetRef?.status === 'found', resolved ? `${resolved.role}/${resolved.assetRef?.status}` : '未解析');
      }
    } catch (error) { record('richIcon.resolve', false, error.message); }
  }
  return checks;
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.spec) {
    process.stdout.write('用法：node scripts/register-item.js --spec <spec.json> [--verify] [--dry-run] [--remove]\n');
    process.exit(options.spec ? 0 : 1);
  }
  const spec = { ...DEFAULTS, ...readJson(path.resolve(options.spec)) };
  spec.remove = options.remove;
  if (!spec.canonical || !spec.displayName) throw new Error('spec 必填：canonical / displayName');
  if (spec.kind === 'resource' && !spec.officialUniqueName) throw new Error('resource 需要 officialUniqueName（官方未上线时可先占位，但必须显式给出）');

  const writer = new Writer(options.dryRun);
  const report = { spec: path.resolve(options.spec), remove: options.remove, dryRun: options.dryRun, steps: [], changes: [], backups: [], checks: [], ok: true };

  const image = await prepareImage(spec, writer);
  report.image = image;
  report.steps.push(upsertResourceEntry(spec, writer));
  report.steps.push(upsertResourceIndexRow(spec, writer));
  report.steps.push(upsertAssetCatalogRow(spec, image, writer));
  report.steps.push(upsertReviewedAsset(spec, image, writer));
  report.steps.push(upsertContentImageManifest(spec, image, writer));
  report.steps.push(upsertRichIcon(spec, image, writer));
  report.steps.push(upsertDictionaries(spec, writer));
  report.steps.push(upsertAliases(spec, writer));
  report.steps.push(upsertSlang(spec, writer));

  report.changes = writer.changes;
  report.backups = writer.backups;
  if (options.verify && !options.dryRun) {
    report.checks = selfChecks(spec, image);
    report.ok = report.checks.every(check => check.ok);
  }
  if (!options.dryRun && options.verify && !options.remove) {
    const failed = report.checks.filter(check => !check.ok);
    report.summary = failed.length
      ? `❌ ${failed.length} 项自检失败：${failed.map(item => item.name).join(', ')}`
      : `✅ ${report.checks.length} 项自检全绿；改动 ${report.changes.length} 个文件`;
  } else {
    report.summary = `改动 ${report.changes.length} 个文件${options.dryRun ? '（dry-run）' : ''}`;
  }
  const text = stableStringify(report);
  if (options.report) fs.writeFileSync(path.resolve(options.report), text, 'utf8');
  process.stdout.write(`${text}\n`);
  process.exit(report.ok ? 0 : 1);
}

main().catch(error => {
  process.stderr.write(`${error && error.stack || error}\n`);
  process.exit(2);
});
