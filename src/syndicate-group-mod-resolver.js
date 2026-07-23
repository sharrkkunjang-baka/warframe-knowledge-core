'use strict';

const { normalize } = require('./resolver');

function abilityStem(uniqueName) {
  return String(uniqueName || '').split('/').pop().replace(/Ability$/i, '');
}

function augmentStem(uniqueName) {
  return String(uniqueName || '').split('/').pop().replace(/AugmentCard$/i, '');
}

function normalizeStem(stem) {
  return String(stem || '').toLowerCase().replace(/armour/g, 'armor');
}

function isPvpAugment(mod) {
  const uniqueName = String(mod?.uniqueName || '');
  return /PvP/i.test(uniqueName) || /\/PvPMods\//.test(uniqueName);
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

  function parse(query) {
    const raw = String(query || '').trim();
    if (!raw) return null;
    const compact = raw.normalize('NFKC').replace(/[\s·・‧•_-]+/g, '');
    if (/集团卡|集团·强化/i.test(compact)) return null;
    const match = compact.match(/^(.+?)集团([1-4])$/i);
    if (!match) return null;
    const prefix = match[1];
    const slot = Number(match[2]);
    if (!prefix || !slot) return null;
    const frame = resolveWarframe?.(prefix) || resolveWarframeMention?.(prefix)?.frame;
    if (!frame) return null;
    const entry = frameAugmentIndex(frame).find(item => item.index === slot);
    if (!entry?.mod) return null;
    return {
      query: raw,
      prefix,
      slot,
      frame: { canonical: frame.name, displayName: frame.displayName || frame.name },
      mod: entry.mod,
      canonical: entry.mod.canonical,
      displayName: entry.mod.displayName || entry.mod.canonical
    };
  }

  function resolve(query) {
    const parsed = parse(query);
    if (!parsed) return null;
    const mod = getOfficialMod?.(parsed.canonical) || parsed.mod;
    return { ...parsed, mod, source: 'syndicate-group-index' };
  }

  return { parse, resolve, frameAugmentIndex };
}

function isSyndicateGroupModQuery(query) {
  const compact = String(query || '').normalize('NFKC').replace(/[\s·・‧•_-]+/g, '');
  return !/集团卡|集团·强化/i.test(compact) && /^.+集团[1-4]$/i.test(compact);
}

module.exports = {
  createSyndicateGroupModResolver,
  abilityStem,
  augmentStem,
  normalizeStem,
  isSyndicateGroupModQuery
};
