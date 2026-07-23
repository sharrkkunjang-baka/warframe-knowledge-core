'use strict';

const REQUIEM_MOD_CANONICALS = Object.freeze([
  'Lohk', 'Xata', 'Jahu', 'Vome', 'Fass', 'Ris', 'Khra', 'Netra', 'Oull'
]);

const TECHROT_LICH_PASSWORD_MOD = Object.freeze({
  canonical: 'Worm Away',
  displayName: '蠕虫驱逐',
  playerAlias: '杀毒 Mod'
});

const USAGE = Object.freeze({
  requiemPassword: '可用于玄骸解密的密码',
  oullWildcard: '可视为任意密码',
  techrotPassword: '可用于科腐系玄骸解密的密码'
});

function isRequiemModEntry(entry) {
  return (entry?.subject?.categoryRefs || []).includes('requiemmod');
}

function isTechrotLichPasswordModEntry(entry) {
  return entry?.subject?.canonical === TECHROT_LICH_PASSWORD_MOD.canonical;
}

function getRequiemModUsageLines(canonical) {
  if (!REQUIEM_MOD_CANONICALS.includes(canonical)) return [];
  const lines = [USAGE.requiemPassword];
  if (canonical === 'Oull') lines.push(USAGE.oullWildcard);
  lines.push(`科腐系玄骸请使用${TECHROT_LICH_PASSWORD_MOD.playerAlias}（${TECHROT_LICH_PASSWORD_MOD.displayName}）`);
  return lines;
}

function getLichPasswordModUsageLines(entry) {
  if (isRequiemModEntry(entry)) return getRequiemModUsageLines(entry.subject?.canonical);
  if (isTechrotLichPasswordModEntry(entry)) return [USAGE.techrotPassword];
  return [];
}

module.exports = {
  REQUIEM_MOD_CANONICALS,
  TECHROT_LICH_PASSWORD_MOD,
  USAGE,
  isRequiemModEntry,
  isTechrotLichPasswordModEntry,
  getRequiemModUsageLines,
  getLichPasswordModUsageLines
};
