'use strict';

const metadata = require('../generated/frame-card-metadata.json');

const byFrameId = new Map(metadata.frames.map(frame => [frame.frameId, frame]));
const byCanonical = new Map(metadata.frames.map(frame => [frame.canonical.toLocaleLowerCase('en-US'), frame]));
const STAT_DEFINITIONS = Object.freeze([
  ['health', '生命'],
  ['shield', '护盾'],
  ['armor', '护甲'],
  ['energy', '能量'],
  ['sprintSpeed', '冲刺速度']
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getFrameCardMetadata(frameOrName) {
  if (frameOrName && typeof frameOrName === 'object') {
    const id = frameOrName.uniqueName || frameOrName.frameId || frameOrName.officialUniqueName;
    return id ? byFrameId.get(id) || null : null;
  }
  return byCanonical.get(String(frameOrName || '').trim().toLocaleLowerCase('en-US')) || null;
}

function buildFrameCardDTO(frameOrName, options = {}) {
  const frame = getFrameCardMetadata(frameOrName);
  if (!frame) {
    // 官方数值/技能尚未收录的新战甲（例如 Update 44 的 Narin）：仍返回仅含身份的
    // DTO，让获取卡片（含部件小卡片）可以渲染。渲染器对空 stats/abilities 会整段跳过，
    // 因此不会画出空白数值区。
    const fallbackName = typeof frameOrName === 'string'
      ? frameOrName
      : (frameOrName?.name || frameOrName?.displayName || frameOrName?.canonical || '');
    if (!fallbackName) return null;
    return {
      schemaVersion: 1,
      frameId: null,
      canonical: fallbackName,
      displayName: fallbackName,
      isPrime: false,
      variantType: null,
      statPolicy: clone(metadata.statPolicy),
      stats: [],
      abilities: [],
      helminth: null,
      provenance: clone(metadata.sources),
      metadataStatus: 'pending-official-stats'
    };
  }
  const imagePathForAbility = typeof options.imagePathForAbility === 'function'
    ? options.imagePathForAbility
    : () => '';
  return {
    schemaVersion: 1,
    frameId: frame.frameId,
    canonical: frame.canonical,
    displayName: frame.displayName,
    isPrime: frame.isPrime,
    variantType: frame.variantType,
    statPolicy: clone(metadata.statPolicy),
    stats: STAT_DEFINITIONS.map(([key, label]) => ({
      key,
      label,
      rank0: frame.stats.rank0[key],
      rank30: frame.stats.rank30[key],
      grows: frame.stats.rank0[key] !== frame.stats.rank30[key]
    })),
    abilities: frame.abilities.map(ability => ({
      ...clone(ability),
      imagePath: imagePathForAbility(ability)
    })),
    passiveName: frame.passiveName || 'Passive',

    passiveDescription: frame.passiveDescription || '',
    helminth: clone(frame.helminth),
    provenance: clone(metadata.sources)
  };
}

function auditFrameCardMetadata() {
  const frames = metadata.frames;
  const malformed = [];
  for (const frame of frames) {
    if (!frame.frameId || !frame.canonical || frame.abilities.length !== 4) malformed.push(frame.canonical);
    if (frame.helminth.matchedAbilityIds.some(id => !frame.abilities.some(ability => ability.abilityId === id))) malformed.push(`${frame.canonical}:helminth`);
  }
  return {
    expected: metadata.count,
    found: frames.length,
    uniqueAbilities: metadata.uniqueAbilityCount,
    helminthAbilityIdentities: metadata.helminthAbilityCount,
    malformed: [...new Set(malformed)]
  };
}

module.exports = {
  STAT_DEFINITIONS,
  getFrameCardMetadata,
  buildFrameCardDTO,
  auditFrameCardMetadata
};
