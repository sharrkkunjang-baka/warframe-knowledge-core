'use strict';

// 别称事实（knowledge/facts/aliases.json）的规范化，支持「倾向于 / prefer」。
//
// 事实文件本身保持扁平结构不变：
//
//   "weapons": { "Lecta": ["c鞭", "钱鞭"] },
//   "aliasPreferences": { "钱鞭": { "section": "weapons", "prefer": "Secura Lecta" } }
//
// `aliasPreferences`（同义写法：倾向于 / preferred / preferTo；值可以是身份字符串或
// `{ section, prefer }`）表示这个别称泛指整个变体家族——所以它仍登记在基础身份下
// （家族归属记录在规范化输出的 aliasPreferences 里，通用查询如配卡仍能看到家族），
// 但实体级解析（刷 / 获取 / 卡 / 市场）要落到声明的成员身份上。
//
// 为什么倾向声明放在平级区、而不是就地写成对象条目：事实文件会被很多地方直接读
// （运行时 knowledge-loader、riven-market-loader、Bot 的 riven_analysis 等），
// 就地改成对象形态会让它们把对象当别称数组展开而崩溃。规范化后解析链只看到单一映射：
// 倾向成员拿到该别称，基础身份不再持有它。
const PREFERENCE_SECTIONS = Object.freeze(['aliasPreferences', '倾向于', 'prefer', 'aliasPrefer']);
const PROFILE_KEYS = Object.freeze(['prefer', '倾向于', 'preferred', 'preferTo']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function preferenceEntry(value) {
  if (typeof value === 'string') return { section: null, prefer: value.trim() };
  if (!isPlainObject(value)) return null;
  let prefer = null;
  for (const key of PROFILE_KEYS) {
    if (typeof value[key] === 'string' && value[key].trim()) { prefer = value[key].trim(); break; }
  }
  if (!prefer && typeof value.canonical === 'string') prefer = value.canonical.trim();
  if (!prefer) return null;
  return { section: typeof value.section === 'string' && value.section.trim() ? value.section.trim() : null, prefer };
}

function findAliasOwner(sections, alias, preferredSection) {
  const order = preferredSection ? [preferredSection, ...Object.keys(sections)] : Object.keys(sections);
  for (const section of order) {
    const table = sections[section];
    if (!isPlainObject(table)) continue;
    for (const [canonical, aliases] of Object.entries(table)) {
      if (Array.isArray(aliases) && aliases.map(String).includes(alias)) return { section, canonical };
    }
  }
  return null;
}

function normalizeAliasFacts(raw) {
  const facts = isPlainObject(raw) ? raw : {};
  const output = {};
  const declared = {};
  for (const [section, value] of Object.entries(facts)) {
    if (PREFERENCE_SECTIONS.includes(section)) { declared[section] = isPlainObject(value) ? value : {}; continue; }
    output[section] = isPlainObject(value)
      ? Object.fromEntries(Object.entries(value).map(([canonical, aliases]) => [canonical, Array.isArray(aliases) ? aliases.map(String) : aliases]))
      : value;
  }
  const preferences = {};
  for (const table of Object.values(declared)) {
    for (const [alias, value] of Object.entries(table)) {
      const entry = preferenceEntry(value);
      if (!entry) continue;
      const owner = findAliasOwner(output, String(alias), entry.section);
      if (owner) {
        output[owner.section][owner.canonical] = output[owner.section][owner.canonical].filter(item => item !== String(alias));
        const target = output[owner.section][entry.prefer];
        if (!Array.isArray(target)) output[owner.section][entry.prefer] = [String(alias)];
        else if (!target.includes(String(alias))) output[owner.section][entry.prefer] = [...target, String(alias)];
      } else {
        const section = entry.section || 'weapons';
        if (!isPlainObject(output[section])) output[section] = {};
        const target = output[section][entry.prefer];
        output[section][entry.prefer] = Array.isArray(target) ? [...new Set([...target, String(alias)])] : [String(alias)];
      }
      preferences[String(alias)] = Object.freeze({ section: owner?.section || entry.section || null, from: owner?.canonical || null, prefer: entry.prefer });
    }
  }
  output.aliasPreferences = Object.freeze(preferences);
  return Object.freeze(output);
}

module.exports = { PREFERENCE_SECTIONS, PROFILE_KEYS, normalizeAliasFacts };
