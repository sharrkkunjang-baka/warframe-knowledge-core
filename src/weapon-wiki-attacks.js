'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WIKI_ATTACKS_PATH = path.join(ROOT, 'knowledge', 'generated', 'weapon-wiki-attacks.json');
const EXPORT_WEAPONS_PATH = path.join(ROOT, 'cache', 'warframe-export-weapons.json');
const INCARNON_FORMS_PATH = path.join(ROOT, 'knowledge', 'supplemental', 'weapon-incarnon-forms.json');
const ATTACK_OVERRIDES_PATH = path.join(ROOT, 'knowledge', 'supplemental', 'weapon-attack-overrides.json');

const TRIGGER_ZH = Object.freeze({
  'Semi-Auto': '半自动',
  'Auto': '全自动',
  'Burst': '半自动',
  'Held': '按住',
  'Auto / Semi': '全自动 / 半自动',
  'Charge': '蓄力',
  'Active': '激活'
});

const ATTACK_NAME_ZH = Object.freeze({
  'Charged Shot': '蓄力',
  'Charged Attack': '蓄力',
  'Charged Shot Explosion': '爆炸',
  'Alternate Fire': '次要射击',
  'Auto': '全自动',
  'Charge': '蓄力',
  'Throw': '投掷',
  'Charged Throw': '蓄力投掷',
  'Slam Attack': '震地',
  'Heavy Slam Attack': '重型震地',
  'Incarnon Form': '灵化形态',
  'Glaive Radial Attack': '范围攻击',
  'Poison Cloud': '范围攻击',
  'Radial Attack': '范围攻击',
  'Explosion': '引爆',
  'Detonate': '重击时引爆',
  'Heavy Attack Explosion': '重击时引爆',
  'Alt-Fire Glaive': '副模式',
  'Grenade Impact': '榴弹撞击',
  'Charged Shot Laser': '充能开火'
});

function panelDamageTotal(panel) {
  return (panel?.damage || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function diffPanelStats(stats = [], baseStats = []) {
  return stats.filter(stat => !baseStats.some(base => (
    base.kind === stat.kind && base.label === stat.label && base.value === stat.value
  )));
}

function compactWeaponPanels(panels, maximum = 6) {
  // The wiki export can contain multiple records for the same rendered mode.
  // Keep the strongest radial record and never render the same mode twice.
  const groupedChildren = new Set();
  const parentPanels = new Map(panels.map(panel => [Number(panel.attackIndex), panel]));
  for (const child of panels) {
    const parentIndex = Number(child.parentAttackIndex);
    const parent = Number.isFinite(parentIndex) ? parentPanels.get(parentIndex) : null;
    if (!parent) continue;
    parent.rows ||= [];
    if (!parent._hasDirectRow) {
      parent.rows.unshift({ title: '直接命中', damage: parent.damage, stats: [], attackName: parent.attackName });
      parent.damage = [];
      parent._hasDirectRow = true;
    }
    parent.rows.push({
      title: child.shotType === 'AoE' ? '范围伤害' : '直接命中',
      damage: child.damage,
      stats: diffPanelStats(child.stats, parent.stats),
      attackName: child.attackName
    });
    groupedChildren.add(child);
  }
  const sourcePanels = panels.filter(panel => !groupedChildren.has(panel));
  const radial = sourcePanels
    .filter(panel => panel.shotType === 'AoE' && !/Slam Attack/i.test(panel.attackName || ''))
    .sort((left, right) => panelDamageTotal(right) - panelDamageTotal(left));
  const primary = sourcePanels.find(panel => panel.attackName === 'Normal Attack') || sourcePanels[0];
  const signature = panel => JSON.stringify([...(panel.damage || [])].sort((left, right) => String(left.canonical).localeCompare(String(right.canonical))));
  const radialKeep = radial.find(panel => signature(panel) !== signature(primary)) || null;
  const normalized = sourcePanels.filter(panel => panel === radialKeep || panel.shotType !== 'AoE' || /Slam Attack/i.test(panel.attackName || ''));
  for (const panel of normalized) delete panel._hasDirectRow;
  const normal = normalized.find(panel => panel.attackName === 'Normal Attack') || null;
  const slam = normalized.filter(panel => /Slam Attack/i.test(panel.attackName || ''));
  const commonStats = panels => panels.length ? panels[0].stats.filter(stat => panels.every(panel => panel.stats.some(candidate => candidate.kind === stat.kind && candidate.label === stat.label && candidate.value === stat.value))) : [];
  const diffStats = (panel, common) => panel.stats.filter(stat => !common.some(item => item.kind === stat.kind && item.label === stat.label && item.value === stat.value));
  if (normal && slam.length) {
    const normalGroup = { ...normal, id: 'attack-normal-group', title: '普通攻击', rows: [] };
    normalGroup.title = '平A';
    const slamCommon = commonStats(slam);
    const slamGroup = { ...slam[0], id: 'attack-slam-group', title: '震地', stats: slamCommon, rows: slam.slice(1).map(panel => ({ title: '重型震地', damage: panel.damage, stats: diffStats(panel, slamCommon), attackName: panel.attackName })) };
    const heavy = normalized.find(panel => /^Heavy Attack$/i.test(panel.attackName || ''));
    if (heavy) normalGroup.rows.push({ title: '重击', damage: heavy.damage, stats: diffStats(heavy, commonStats([normal, heavy])), attackName: heavy.attackName });
    if (heavy) {
      normalGroup.rows.at(-1).totalDamage = heavy.totalDamage;
      normalized.splice(normalized.indexOf(heavy), 1);
    }
    const normalIndex = normalized.indexOf(normal);
    normalized.splice(normalIndex, 1, normalGroup);
    const slamIndex = normalized.findIndex(panel => panel === slam[0]);
    if (slamIndex >= 0) normalized.splice(slamIndex, slam.length, slamGroup);
  }
  if (normalized.length <= maximum) return normalized;
  const direct = normalized.filter(panel => panel.shotType !== 'AoE' && !/Slam Attack/i.test(panel.attackName || ''));
  const selected = [...direct.slice(0, 3), ...(radialKeep ? [radialKeep] : []), ...slam.slice(0, 1)];
  return selected.slice(0, maximum);
}

const DAMAGE_TYPE_ZH = Object.freeze({
  Impact: '冲击',
  Puncture: '穿刺',
  Slash: '切割',
  Heat: '火焰',
  Cold: '冰冻',
  Electricity: '电击',
  Toxin: '毒素',
  Blast: '爆炸',
  Radiation: '辐射',
  Magnetic: '磁力',
  Gas: '毒气',
  Corrosive: '腐蚀',
  Viral: '病毒',
  Void: '虚空'
});

const DAMAGE_TYPE_ALIASES = Object.freeze({
  Impact: 'Impact',
  Puncture: 'Puncture',
  Slash: 'Slash',
  Heat: 'Heat',
  Cold: 'Cold',
  Electricity: 'Electricity',
  Toxin: 'Toxin',
  Blast: 'Blast',
  Radiation: 'Radiation',
  Magnetic: 'Magnetic',
  Gas: 'Gas',
  Corrosive: 'Corrosive',
  Viral: 'Viral',
  Void: 'Void',
  Explosion: 'Blast',
  DT_IMPACT: 'Impact',
  DT_PUNCTURE: 'Puncture',
  DT_SLASH: 'Slash',
  DT_FIRE: 'Heat',
  DT_HEAT: 'Heat',
  DT_FREEZE: 'Cold',
  DT_COLD: 'Cold',
  DT_ELECTRICITY: 'Electricity',
  DT_POISON: 'Toxin',
  DT_TOXIN: 'Toxin',
  DT_EXPLOSION: 'Blast',
  DT_RADIATION: 'Radiation',
  DT_MAGNETIC: 'Magnetic',
  DT_GAS: 'Gas',
  DT_CORROSIVE: 'Corrosive',
  DT_VIRAL: 'Viral',
  DT_VOID: 'Void'
});

let wikiAttacksCache = null;
let exportWeaponsCache = null;
let incarnonFormsCache = null;
let attackOverridesCache = null;

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadWikiAttacks() {
  if (wikiAttacksCache) return wikiAttacksCache;
  const data = readJson(WIKI_ATTACKS_PATH);
  wikiAttacksCache = data?.entries || {};
  return wikiAttacksCache;
}

function loadExportWeapons() {
  if (exportWeaponsCache) return exportWeaponsCache;
  exportWeaponsCache = readJson(EXPORT_WEAPONS_PATH) || {};
  return exportWeaponsCache;
}

function loadIncarnonForms() {
  if (incarnonFormsCache) return incarnonFormsCache;
  incarnonFormsCache = readJson(INCARNON_FORMS_PATH)?.entries || {};
  return incarnonFormsCache;
}

function loadAttackOverrides() {
  if (attackOverridesCache) return attackOverridesCache;
  attackOverridesCache = readJson(ATTACK_OVERRIDES_PATH)?.entries || {};
  return attackOverridesCache;
}

function getIncarnonFormPanel(entry = {}) {
  const uniqueName = entry.officialUniqueName || entry.subject?.officialUniqueName || null;
  const canonical = entry.subject?.canonical || entry.canonical || null;
  const sources = Object.values(loadIncarnonForms());
  const source = (uniqueName ? loadIncarnonForms()[uniqueName] : null)
    || sources.find(candidate => (candidate.weaponUniqueNames || []).includes(uniqueName))
    || sources.find(candidate => (candidate.weaponCanonicals || []).includes(canonical))
    || null;
  if (!source || source.reviewStatus !== 'approved') return null;
  return {
    id: `incarnon-${source.familyCanonical || uniqueName}`,
    title: source.title || '灵化形态',
    activation: source.activation || null,
    durationSeconds: Number.isFinite(Number(source.durationSeconds)) ? Number(source.durationSeconds) : null,
    damage: [],
    stats: (source.stats || []).map(stat => ({
      kind: stat.kind || 'incarnon-effect',
      label: String(stat.label || '').trim(),
      value: String(stat.value || '').trim()
    })).filter(stat => stat.label && stat.value),
    source: 'wiki.warframe.com',
    provenance: source.provenance || null
  };
}

function normalizeDamageKey(key) {
  return DAMAGE_TYPE_ALIASES[key] || DAMAGE_TYPE_ALIASES[String(key || '').replace(/^DT_/, 'DT_')] || null;
}

function extractDamageRows(source = {}) {
  const rows = [];
  for (const [key, rawValue] of Object.entries(source)) {
    if (key === 'procChance') continue;
    const canonical = normalizeDamageKey(key);
    const amount = Number(rawValue);
    if (!canonical || !Number.isFinite(amount) || amount <= 0) continue;
    rows.push({ canonical, displayName: DAMAGE_TYPE_ZH[canonical] || canonical, amount });
  }
  rows.sort((left, right) => right.amount - left.amount);
  return rows;
}

function formatPercent(value, digits = 0) {
  const percent = Number(value) * 100;
  if (!Number.isFinite(percent)) return null;
  return `${Number(percent.toFixed(digits))}%`;
}

function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(digits)).toLocaleString('zh-CN');
}

function localizeTrigger(trigger) {
  const text = String(trigger || '').trim();
  if (!text) return null;
  return TRIGGER_ZH[text] || text;
}

function resolvePanelTitle(attack, weaponMeta = {}) {
  const attackName = String(attack?.AttackName || '').trim();
  const isPrimary = Number(attack?.AttackIndex) === 1 || attackName === 'Normal Attack';
  if (/^Uncharged/i.test(attackName)) return '非蓄力（次要射击）';
  const isCharged = Number(attack?.ChargeTime) > 0 || /^(Charge|Auto Charge)$/i.test(String(attack?.Trigger || '').trim()) || /charged|charge/i.test(attackName)
    || (weaponMeta.hasAutoPrimary === true && /grenade/i.test(attackName) && Number(attack?.AttackIndex) > 1);
  const isExplicitSecondary = /alternate|alt[- ]?fire|secondary|laser/i.test(attackName)
    || (Array.isArray(weaponMeta.secondaryAttackIndices) && weaponMeta.secondaryAttackIndices.includes(Number(attack?.AttackIndex)))
    || (weaponMeta.hasAutoPrimary === true && /grenade/i.test(attackName) && Number(attack?.AttackIndex) > 1);
  if (isCharged) return isExplicitSecondary ? '充能开火（次要射击）' : (ATTACK_NAME_ZH[attackName] || '蓄力');
  if (/^Burst$/i.test(String(attack?.Trigger || '').trim()) || (attack?.BurstCount && Number(attack.BurstCount) > 1)) return '半自动';
  if (isPrimary && /^(Auto|Auto \/ Burst)$/i.test(String(attack?.Trigger || weaponMeta?.Trigger || ''))) return '全自动';
  if (isPrimary && weaponMeta?.Trigger) return localizeTrigger(weaponMeta.Trigger);
  if (attackName === 'Normal Attack') {
    const isMelee = String(weaponMeta?.Slot || '').toLowerCase() === 'melee' || Number.isFinite(Number(weaponMeta?.MeleeRange));
    if (isMelee) return '平A';
    return localizeTrigger(attack?.Trigger || weaponMeta?.Trigger) || '普通攻击';
  }
  if (ATTACK_NAME_ZH[attackName]) return ATTACK_NAME_ZH[attackName];
  if (attack?.ShotType === 'AoE' && !/slam/i.test(attackName)) return '范围攻击';
  return attackName || '攻击模式';
}

function buildPanelStats(attack, weaponMeta = {}) {
  const stats = [];
  const push = (kind, label, value) => {
    if (value == null || value === '' || value === '—') return;
    stats.push({ kind, label, value: String(value) });
  };
  const isPrimary = Number(attack?.AttackIndex) === 1 || attack?.AttackName === 'Normal Attack';
  push('crit-chance', '暴击几率', formatPercent(attack?.CritChance, Number(attack?.CritChance) < 0.1 ? 2 : 0));
  push('crit-multiplier', '暴击倍率', Number.isFinite(Number(attack?.CritMultiplier)) ? `${formatNumber(attack.CritMultiplier, 1)}x` : null);
  push('status-chance', '触发几率', formatPercent(attack?.StatusChance, Number(attack?.StatusChance) < 0.1 ? 2 : 0));
  if (Array.isArray(attack?.ForcedProcs) && attack.ForcedProcs.length) push('forced-procs', '必定触发', attack.ForcedProcs.map(proc => DAMAGE_TYPE_ZH[proc] || proc).join('、'));
  if (Number(attack?.BurstCount) > 1) push('burst-count', '连发数', formatNumber(attack.BurstCount, 0));
  const isSlam = /slam attack/i.test(String(attack?.AttackName || ''));
  const isMelee = String(weaponMeta?.Slot || '').toLowerCase() === 'melee' || Number.isFinite(Number(weaponMeta?.MeleeRange));
  push('fire-rate', isMelee || isSlam ? '攻速' : '射速', Number.isFinite(Number(attack?.FireRate)) ? formatNumber(attack.FireRate, 2) : null);
  if (Number(attack?.Multishot) > 1) push('multishot', '多重射击', formatNumber(attack.Multishot, 1));
  if (isPrimary && Number.isFinite(Number(weaponMeta?.Magazine))) push('magazine', '弹匣容量', formatNumber(weaponMeta.Magazine, 0));
  if (isPrimary && Number.isFinite(Number(weaponMeta?.Reload))) push('reload', '装填速度', `${formatNumber(weaponMeta.Reload, 2)} 秒`);
  if (Number.isFinite(Number(attack?.Accuracy))) push('accuracy', '精准度', `${formatNumber(attack.Accuracy, 0)}%`);
  else if (isPrimary && Number.isFinite(Number(weaponMeta?.Accuracy))) push('accuracy', '精准度', `${formatNumber(weaponMeta.Accuracy, 1)}°`);
  else if (Number.isFinite(Number(attack?.MinSpread)) && Number.isFinite(Number(attack?.MaxSpread))) {
    push('accuracy', '精准度', `${formatNumber(attack.MinSpread, 0)}° 至 ${formatNumber(attack.MaxSpread, 0)}°`);
  }
  if (Number.isFinite(Number(attack?.ShotSpeed))) push('shot-speed', '投射物速度', `${formatNumber(attack.ShotSpeed, 0)} 米/秒`);
  if (Number.isFinite(Number(attack?.PunchThrough)) && Number(attack.PunchThrough) > 0) {
    push('punch-through', '穿透', `${formatNumber(attack.PunchThrough, 1)} 米`);
  }
  if (Number.isFinite(Number(attack?.Range))) push('range', isMelee || isSlam ? '范围' : '射程', `${formatNumber(attack.Range, 1)} 米`);
  else if (isMelee && Number.isFinite(Number(weaponMeta?.MeleeRange))) push('range', '范围', `${formatNumber(weaponMeta.MeleeRange, 1)} 米`);
  if (isPrimary && Number.isFinite(Number(weaponMeta?.AmmoMax))) push('ammo-max', '弹药上限', formatNumber(weaponMeta.AmmoMax, 0));
  const falloff = attack?.Falloff;
  if (falloff && Number.isFinite(Number(falloff.StartRange)) && Number.isFinite(Number(falloff.EndRange))) {
    const reduction = Number.isFinite(Number(falloff.Reduction)) ? formatPercent(falloff.Reduction, 0) : null;
    push('falloff', '伤害衰减', reduction
      ? `${formatNumber(falloff.StartRange, 0)} 米 至 ${formatNumber(falloff.EndRange, 0)} 米（${reduction}）`
      : `${formatNumber(falloff.StartRange, 0)} 米 至 ${formatNumber(falloff.EndRange, 0)} 米`);
  }
  return stats;
}

function buildPanelFromWikiAttack(attack, weaponMeta = {}) {
  return {
    id: `attack-${attack.AttackIndex || attack.AttackName || 'unknown'}`,
    attackIndex: Number(attack.AttackIndex),
    parentAttackIndex: Number(attack.AttackParentIndex),
    title: resolvePanelTitle(attack, weaponMeta),
    attackName: attack.AttackName || null,
    shotType: attack.ShotType || null,
    damage: extractDamageRows(attack?.Damage || {}),
    stats: buildPanelStats(attack, weaponMeta),
    source: 'wiki.warframe.com'
  };
}

function buildHeavyAttackPanel(weaponMeta = {}) {
  if (!Number.isFinite(Number(weaponMeta?.HeavyAttack))) return null;
  return { id: 'attack-heavy', title: '重击', attackName: 'Heavy Attack', shotType: null, damage: [], totalDamage: formatNumber(weaponMeta.HeavyAttack, 0), stats: [], source: 'wiki.warframe.com' };
}

function buildSupplementalPanels(attacks = []) {
  return attacks.map(attack => ({
    id: `attack-${attack.AttackIndex || attack.AttackName || 'supplemental'}`,
    title: resolvePanelTitle(attack),
    attackName: attack.AttackName || null,
    shotType: attack.ShotType || null,
    damage: extractDamageRows(attack.Damage || {}),
    stats: buildPanelStats(attack),
    source: attack.source || 'DE ExportWeapons'
  })).filter(panel => panel.damage.length);
}

function buildSupplementalPanelsFromExport(weapon = {}) {
  return buildSupplementalPanels((weapon.behaviours || []).map((behaviour, index) => ({
    AttackIndex: `export-impact-${index + 1}`,
    AttackName: 'Radial Attack',
    ShotType: 'AoE',
    StatusChance: behaviour?.impact?.procChance,
    Damage: behaviour?.impact || {},
    source: 'DE ExportWeapons'
  })));
}

function damageSignature(panel) {
  return JSON.stringify([...(panel?.damage || [])]
    .map(row => [row.canonical, Number(row.amount)])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
}

function buildFallbackPanelFromExport(weapon) {
  const TYPE_ORDER = ['Impact', 'Puncture', 'Slash', 'Heat', 'Cold', 'Electricity', 'Toxin', 'Blast', 'Radiation', 'Gas', 'Magnetic', 'Corrosive', 'Viral', 'Void'];
  const damageObject = {};
  for (let index = 0; index < (weapon.damagePerShot || []).length; index += 1) {
    const amount = Number(weapon.damagePerShot[index]);
    const canonical = TYPE_ORDER[index];
    if (canonical && Number.isFinite(amount) && amount > 0) damageObject[canonical] = amount;
  }
  const damage = extractDamageRows(damageObject);
  const trigger = String(weapon.trigger || '')
    .replace(/^SEMI$/i, 'Semi-Auto')
    .replace(/^AUTO$/i, 'Auto')
    .replace(/^BURST$/i, 'Burst')
    .replace(/^HELD$/i, 'Held')
    .replace(/_/g, '-');
  return {
    id: 'attack-export-primary',
    title: localizeTrigger(trigger) || '普通攻击',
    attackName: 'Normal Attack',
    shotType: null,
    damage,
    stats: buildPanelStats({
      CritChance: weapon.criticalChance,
      CritMultiplier: weapon.criticalMultiplier,
      StatusChance: weapon.procChance,
      FireRate: weapon.fireRate,
      Range: weapon.range,
      Damage: Object.fromEntries(damage.map(row => [row.canonical, row.amount]))
    }),
    source: 'DE ExportWeapons'
  };
}

function buildWeaponAttackPanels(entry = {}) {
  const uniqueName = entry.officialUniqueName || entry.subject?.officialUniqueName || null;
  const canonical = entry.subject?.canonical || entry.title || null;
  const wikiEntry = uniqueName
    ? loadWikiAttacks()[uniqueName]
    : (canonical ? Object.values(loadWikiAttacks()).find(item => item.canonical === canonical) : null);
  const attackOverride = uniqueName ? loadAttackOverrides()[uniqueName] : null;
  const wikiPayload = wikiEntry?.payload || attackOverride?.payload || null;
  const resolvedUniqueName = uniqueName || wikiEntry?.uniqueName || null;
  const exportWeapon = resolvedUniqueName ? loadExportWeapons()[resolvedUniqueName] : null;
  if (wikiPayload?.Attacks?.length) {
    const hasAutoPrimary = wikiPayload.Attacks.some(attack => Number(attack.AttackIndex) === 1 && /^auto$/i.test(String(attack.AttackName || '')));
    const secondaryAttackIndices = wikiPayload.Attacks
      .filter(attack => /alternate|alt[- ]?fire|secondary|laser/i.test(String(attack?.AttackName || '')))
      .flatMap(attack => [Number(attack.AttackIndex), ...wikiPayload.Attacks.filter(child => Number(child.AttackParentIndex) === Number(attack.AttackIndex)).map(child => Number(child.AttackIndex))])
      .concat(hasAutoPrimary ? wikiPayload.Attacks.filter(attack => /grenade/i.test(String(attack.AttackName || ''))).map(attack => Number(attack.AttackIndex)) : [])
      .filter(Number.isFinite);
    const weaponMeta = { ...wikiPayload, secondaryAttackIndices, hasAutoPrimary };
    const wikiPanels = wikiPayload.Attacks.map(attack => buildPanelFromWikiAttack(attack, weaponMeta));
    const secondaryPanels = wikiPanels.filter(panel => secondaryAttackIndices.includes(panel.attackIndex) && !Number.isFinite(panel.parentAttackIndex));
    if (secondaryPanels.length > 1) for (const child of secondaryPanels.slice(1)) child.parentAttackIndex = secondaryPanels[0].attackIndex;
    const wikiDamage = new Set(wikiPanels.map(damageSignature));
    const persistedSupplemental = buildSupplementalPanels(wikiEntry?.supplementalAttacks || [])
      .filter(panel => !wikiDamage.has(damageSignature(panel)));
    const supplementalFallback = buildSupplementalPanelsFromExport(exportWeapon)
      .filter(panel => !wikiDamage.has(damageSignature(panel)));
    const supplemental = persistedSupplemental.length
      ? persistedSupplemental
      : (wikiEntry?.supplementalAttacks?.length ? [] : supplementalFallback);
    const panels = [
      ...wikiPanels,
      ...(buildHeavyAttackPanel(wikiPayload) ? [buildHeavyAttackPanel(wikiPayload)] : []),
      ...supplemental
    ];
    return compactWeaponPanels(panels);
  }
  if (exportWeapon) return [buildFallbackPanelFromExport(exportWeapon)];
  return [];
}

function buildWeaponInfo(entry = {}) {
  const weaponIdentity = entry.weaponIdentity || {};
  const uniqueName = entry.officialUniqueName || entry.subject?.officialUniqueName || null;
  const wikiEntry = uniqueName ? loadWikiAttacks()[uniqueName] : null;
  const attackOverride = uniqueName ? loadAttackOverrides()[uniqueName] : null;
  const wikiPayload = wikiEntry?.payload || attackOverride?.payload || null;
  const exportWeapon = uniqueName ? loadExportWeapons()[uniqueName] : null;
  return {
    panels: buildWeaponAttackPanels(entry),
    incarnonPanel: getIncarnonFormPanel(entry),
    disposition: weaponIdentity.disposition ?? weaponIdentity.omegaAttenuation ?? wikiPayload?.Disposition ?? exportWeapon?.omegaAttenuation ?? null,
    masteryReq: weaponIdentity.masteryReq ?? wikiPayload?.Mastery ?? exportWeapon?.masteryReq ?? null,
    equipmentType: weaponIdentity.equipmentType || entry.subject?.categoryRefs?.find(ref => /^weapon\./.test(ref))?.replace(/^weapon\./, '') || null
  };
}

function parseWikiWeaponRender(body) {
  const text = String(body || '').trim();
  const candidates = [];
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth !== 0) continue;
        try {
          const parsed = JSON.parse(text.slice(start, index + 1));
          if (Array.isArray(parsed?.Attacks) && parsed.Attacks.length) return parsed;
          candidates.push(parsed);
        } catch {}
        break;
      }
    }
  }
  return candidates.find(candidate => Array.isArray(candidate?.Attacks) && candidate.Attacks.length) || null;
}

module.exports = {
  ATTACK_NAME_ZH,
  TRIGGER_ZH,
  DAMAGE_TYPE_ALIASES,
  DAMAGE_TYPE_ZH,
  WIKI_ATTACKS_PATH,
  INCARNON_FORMS_PATH,
  buildWeaponAttackPanels,
  getIncarnonFormPanel,
  buildWeaponInfo,
  buildPanelFromWikiAttack,
  buildSupplementalPanels,
  buildSupplementalPanelsFromExport,
  extractDamageRows,
  parseWikiWeaponRender,
  resolvePanelTitle,
  compactWeaponPanels
};
