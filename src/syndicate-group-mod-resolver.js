'use strict';

const { normalize } = require('./resolver');

function abilityStem(uniqueName) {
  return String(uniqueName || '').split('/').pop().replace(/Ability$/i, '');
}

function augmentStem(uniqueName) {
  return String(uniqueName || '')
    .split('/')
    .pop()
    .replace(/PvPAugmentCard$/i, '')
    .replace(/AugmentCard$/i, '');
}

const SYNDICATE_SLOT_CHARS = '1-4一二三四壹贰叁肆';
const SYNDICATE_SLOT_PATTERN = `[${SYNDICATE_SLOT_CHARS}]`;
const SYNDICATE_NUMERAL_PATTERN = '[0-9一二三四五六七八九壹贰叁肆伍陆柒捌玖]';
const CHINESE_SLOT_MAP = Object.freeze({
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  壹: 1,
  贰: 2,
  叁: 3,
  肆: 4
});

function parseSyndicateSlot(token) {
  const raw = String(token || '').trim();
  if (/^[1-4]$/.test(raw)) return Number(raw);
  return CHINESE_SLOT_MAP[raw] || null;
}

function compactSyndicateQuery(query) {
  return String(query || '').normalize('NFKC').replace(/[\s·・‧•_-]+/g, '');
}

function normalizeStem(stem) {
  return String(stem || '').toLowerCase().replace(/armour/g, 'armor');
}

function isPvpAugment(mod) {
  const uniqueName = String(mod?.uniqueName || '');
  // Frame augment cards live under /Lotus/Powersuits/<Frame>/ even when DE internal names contain "PvP".
  if (/\/Lotus\/Powersuits\/[^/]+\/[^/]*AugmentCard$/i.test(uniqueName)) return false;
  return /\/PvPMods\//.test(uniqueName);
}

function createSyndicateGroupModResolver(options = {}) {
  const resolveWarframe = options.resolveWarframe;
  const resolveWarframeMention = options.resolveWarframeMention;
  const getOfficialMod = options.getOfficialMod;
  const officialMods = options.officialMods || [];

  function frameAugmentIndex(frame) {
    if (!frame?.abilities?.length) return [];
    const augments = officialMods.filter(mod =>
      mod.traits?.augment &&
      mod.compatName === frame.name &&
      !isPvpAugment(mod)
    );
    return frame.abilities.map((ability, index) => {
      const stem = normalizeStem(abilityStem(ability.uniqueName));
      const mod = augments.find(candidate => normalizeStem(augmentStem(candidate.uniqueName)) === stem);
      return mod ? { index: index + 1, ability, mod } : null;
    }).filter(Boolean);
  }

  function inspect(query) {
    const raw = String(query || '').trim();
    if (!raw) return { status: 'not-syndicate-query', query: raw };
    const compact = compactSyndicateQuery(raw);
    if (/集团卡|集团·强化/i.test(compact)) return { status: 'not-syndicate-query', query: raw };
    const match = compact.match(new RegExp(`^(.+?)集团(${SYNDICATE_NUMERAL_PATTERN})$`, 'i'));
    if (!match) return { status: 'not-syndicate-query', query: raw };
    const prefix = match[1];
    const slot = parseSyndicateSlot(match[2]);
    if (!slot) return { status: 'slot-out-of-range', query: raw, prefix, slotToken: match[2] };
    const frame = resolveWarframe?.(prefix) || resolveWarframeMention?.(prefix)?.frame;
    if (!frame) return { status: 'frame-not-found', query: raw, prefix, slot };
    const entry = frameAugmentIndex(frame).find(item => item.index === slot);
    if (!entry?.mod) return { status: 'augment-not-found', query: raw, prefix, slot, frame: { canonical: frame.name, displayName: frame.displayName || frame.name } };
    return {
      status: 'resolved',
      query: raw,
      prefix,
      slot,
      frame: { canonical: frame.name, displayName: frame.displayName || frame.name },
      mod: entry.mod,
      canonical: entry.mod.canonical,
      displayName: entry.mod.displayName || entry.mod.canonical
    };
  }

  function parse(query) {
    const inspected = inspect(query);
    return inspected.status === 'resolved' ? inspected : null;
  }

  function resolve(query) {
    const parsed = parse(query);
    if (!parsed) return null;
    const mod = getOfficialMod?.(parsed.canonical) || parsed.mod;
    return { ...parsed, mod, source: 'syndicate-group-index' };
  }

  return { inspect, parse, resolve, frameAugmentIndex };
}

function isSyndicateGroupModQuery(query) {
  const compact = compactSyndicateQuery(query);
  return !/集团卡|集团·强化/i.test(compact) && new RegExp(`^.+集团${SYNDICATE_NUMERAL_PATTERN}$`, 'i').test(compact);
}

module.exports = {
  createSyndicateGroupModResolver,
  abilityStem,
  augmentStem,
  normalizeStem,
  parseSyndicateSlot,
  compactSyndicateQuery,
  isSyndicateGroupModQuery
};
