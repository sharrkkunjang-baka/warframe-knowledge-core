'use strict';
const fs = require('fs');
const path = require('path');
const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
function familyName(canonical) { return normalize(canonical).replace(/^(?:mk1[- ]|prisma |kuva |tenet |coda |dual coda |dex |mara |sancti |secura |synoid |telos |vaykor |rakta |carmine )/i, '').replace(/ (?:prime|vandal|wraith|prisma|dex|mara|mk1)$/i, '').trim(); }
/**
 * 解析集团卡/点播卡关系命令（不含命令前缀；前缀剥离由 Bot 路由负责）。
 * 关键词（集团卡/集团·强化 Mod/电波卡/点播卡）必须伴随实体查询词或显式“帮助”，
 * 否则视为普通输入返回 null。
 * @param {string} text 去掉命令前缀后的查询文本
 * @returns {{intent: 'syndicate'|'nightwave', query: string, help: boolean}|null}
 */
function parseRelationCommand(text) {
  const compact = String(text || '').trim();
  const match = compact.match(/^(.*?)(集团卡|集团·强化\s*Mod|电波卡|点播卡)(.*?)$/i);
  if (!match) return null;
  const intent = /集团/.test(match[2]) ? 'syndicate' : 'nightwave';
  const query = `${match[1]}${match[3]}`.trim();
  const help = /^(?:帮助|help)$/i.test(query);
  if (!query) return null;
  return { intent, query, help };
}
function createModRelationQueries({ root, resolveWeapon, resolveName, getWeapon, getFrame }) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'generated', 'mod-relations.json'), 'utf8'));
  const candidates = list => list.map(x => ({ canonical: x.canonical, displayName: x.displayName, type: x.target.type, targetCanonical: x.target.canonical }));
  function resolveTarget(query, types) {
    const resolution = resolveName(query, { categories: types, minScore: 70, minLead: 8 });
    if (!resolution) return { status: 'not-found', query };
    if (resolution.ambiguous) return { status: 'ambiguous', query, candidates: (resolution.candidates || []).map(x => ({ canonical: x.canonical, category: x.category })) };
    if (resolution.match !== 'exact' && Number(resolution.score) < 250) return { status: 'not-found', query, nearest: [{ canonical: resolution.canonical, category: resolution.category }] };
    return { status: 'ok', query, resolution };
  }
  function matchesTarget(row, resolution) {
    if (row.target.type !== resolution.category) return false;
    if (normalize(row.target.canonical) === normalize(resolution.canonical)) return true;
    if (row.target.type === 'frame') return familyName(row.target.canonical) === familyName(resolution.canonical);
    const queriedKind = /(?: prime|vandal|wraith|prisma|dex|mara|mk1)$/i.test(resolution.canonical) || /^(?:mk1|prisma|kuva|tenet|coda|dual coda|dex|mara|sancti|secura|synoid|telos|vaykor|rakta|carmine) /i.test(resolution.canonical);
    return !queriedKind && familyName(row.target.canonical) === familyName(resolution.canonical);
  }
  function query(text) {
    const parsed = parseRelationCommand(text);
    if (!parsed) return null;
    if (parsed.help) return { parsed, status: 'help', text: parsed.intent === 'syndicate' ? '用法：武器名集团卡 / 集团卡武器名' : '用法：实体名电波卡 / 点播卡实体名（支持武器和战甲）' };
    if (!parsed.query) return { parsed, status: 'help', text: parsed.intent === 'syndicate' ? '用法：武器名集团卡 / 集团卡武器名' : '用法：实体名电波卡 / 点播卡实体名（支持武器和战甲）' };
    const target = resolveTarget(parsed.query, parsed.intent === 'syndicate' ? ['weapon'] : ['frame', 'weapon']);
    if (target.status !== 'ok') return { parsed, ...target };
    const source = parsed.intent === 'syndicate' ? data.syndicateWeaponAugments : data.nightwaveTargetMods;
    const mods = source.filter(row => matchesTarget(row, target.resolution));
    const type = target.resolution.category;
    if (!mods.length) return { parsed, status: 'empty', type, resolution: target.resolution, mods: [], text: parsed.intent === 'syndicate' ? '这把武器没有集团·强化 Mod。' : type === 'frame' ? '这个战甲没有点播卡。' : '这把武器没有点播卡。' };
    const lines = mods.map(row => {
      const availability = parsed.intent === 'nightwave' ? (row.specialProgram === 'cred-offerings' ? '午夜电波奖赏币供品轮换（不代表当前周在售）' : '午夜电波等级奖励；当前仅按历史/未来轮换处理') : '';
      const compatibility = parsed.intent === 'syndicate' && normalize(row.target.canonical) !== normalize(target.resolution.canonical) ? `仅限${row.target.displayName}` : '';
      const notes = [compatibility, availability].filter(Boolean).join('；');
      return `${row.displayName}${row.displayName !== row.canonical ? `（${row.canonical}）` : ''}${notes ? ` — ${notes}` : ''}`;
    });
    return { parsed, status: 'ok', type, resolution: target.resolution, mods, text: lines.join('\n') };
  }
  return { data, parseRelationCommand, query, candidates };
}
module.exports = { parseRelationCommand, createModRelationQueries };
