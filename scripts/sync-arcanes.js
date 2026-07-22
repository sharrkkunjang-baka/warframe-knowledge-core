'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'));
const DATA_ROOT = path.join(ITEMS_ROOT, 'data', 'json');
const ARCANE_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'arcane');
const CATALOG_PATH = path.join(ARCANE_ROOT, 'catalog.json');
const I18N = require(path.join(DATA_ROOT, 'i18n.json'));
const PACKAGE = require(path.join(ITEMS_ROOT, 'package.json'));
const SUPPLEMENTS_PATH = path.join(ROOT, 'generated', 'official-arcane-supplements.json');
const LANGUAGE_CACHE = path.join(ROOT, '.cache', 'official-localization');
const { sourceId, displaySource } = require('../src/arcane-source');
const { renderGameText } = require('../src/game-text');
const ARCANE_SOURCE_OVERRIDES = Object.freeze({
  '/Lotus/Upgrades/CosmeticEnhancers/Utility/NoCostCastChanceOnCast': [
    { type: 'mission-reward', locationId: 'planet.mars', missionNodeId: 'mission-node.tyana-pass', missionTypeId: 'mission-type.defense', rotation: 'C', probability: 0.057, chancePercent: 5.7, quantity: 1, sourceCanonical: 'Mars/Tyana Pass (Defense), Rotation C' },
    { type: 'vendor-or-syndicate-exchange', sourceEntityId: sourceId('Otak at Necralisk'), sourceCanonical: 'Otak at Necralisk', sourceDisplayName: displaySource('Otak at Necralisk'), quantity: 1, availability: 'guaranteed-when-requirements-met', requirements: { type: 'currency', usage: 'exchange', npcId: 'npc.otak', locationId: 'hub.necralisk', currency: [{ currencyId: 'currency.belric-crystal-fragment', amount: 60 }, { currencyId: 'currency.rania-crystal-fragment', amount: 60 }], isBuffUseless: true } }
  ],
  '/Lotus/Upgrades/CosmeticEnhancers/Utility/GolemArcaneRadialEnergyOnEnergyPickup': [
    { type: 'mission-reward', locationId: 'region.veil-proxima', locationDisplayName: '面纱比邻星域', missionTypeId: 'mission-type.orphix', missionTypeDisplayName: '奥影', rotation: 'C', probability: 0.0141, chancePercent: 1.41, quantity: 1, sourceCanonical: 'Veil Proxima Orphix, Rotation C' },
    { type: 'enemy-drop', sourceEntityId: sourceId('Eidolon Hydrolyst'), sourceCanonical: 'Eidolon Hydrolyst', probability: 0.05, chancePercent: 5, quantity: 1 }
  ]
});
const CATEGORIES = Object.freeze(['warframe', 'primary', 'bow', 'shotgun', 'secondary', 'melee', 'operator', 'amp', 'kitgun', 'zaw', 'tektolyst', 'legacy']);
const PROTECTED_DIRECTORIES = Object.freeze(['method']);
const TYPE_CATEGORY = Object.freeze({
  'Warframe Arcane': 'warframe', Arcane: 'warframe', 'Primary Arcane': 'primary', 'Bow Arcane': 'bow',
  'Shotgun Arcane': 'shotgun', 'Secondary Arcane': 'secondary', 'Melee Arcane': 'melee',
  'Operator Arcane': 'operator', 'Amp Arcane': 'amp', 'Kitgun Arcane': 'kitgun', 'Zaw Arcane': 'zaw'
});
const CATEGORY_EQUIPMENT = Object.freeze({
  warframe: 'Warframe', primary: 'Primary', bow: 'Bow', shotgun: 'Shotgun', secondary: 'Secondary',
  melee: 'Melee', operator: 'Operator', amp: 'Amp', kitgun: 'Kitgun', zaw: 'Zaw', tektolyst: 'Tektolyst Artifacts', legacy: 'Legacy/Unknown'
});

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function normalize(value) { return String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function loadLanguages() {
  return {
    en: JSON.parse(fs.readFileSync(path.join(LANGUAGE_CACHE, 'languages.en.json'), 'utf8')),
    zh: JSON.parse(fs.readFileSync(path.join(LANGUAGE_CACHE, 'languages.zh.json'), 'utf8'))
  };
}
function templateValues(englishTemplate, englishEffect) {
  const clean = value => String(value || '').replace(/<[^>]+>/g, '').replace(/\r?\n/g, ' ').replace(/\bseconds?\b/gi, 's').replace(/invisiblity/gi, 'invisibility').replace(/(?<=\d),(?=\d)/g, '').replace(/(?<=\d)\s+s\b/gi, 's').replace(/\s+/g, ' ').replace(/\s+([.,:;])/g, '$1').replace(/[.]$/, '').trim();
  const parts = clean(englishTemplate).split(/(\|[A-Z0-9_]+\|)/gi);
  const names = parts.filter(part => /^\|[A-Z0-9_]+\|$/i.test(part)).map(part => part.slice(1, -1));
  if (!names.length) return {};
  const pattern = parts.map((part, index) => {
    if (/^\|[A-Z0-9_]+\|$/i.test(part)) return part.toUpperCase() === '|CONDITION|' ? '(.+?)' : '([-+]?\\d+(?:\\.\\d+)?)';
    let literal = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (index === parts.length - 1) literal = literal.replace(/\\\.\s*$/, '\\.?').replace(/\\s\+$/, '\\s*');
    return literal;
  }).join('');
  const relaxedPattern = pattern.replace(/\\s\+s(?=[^a-z]|$)/gi, '\\s*s').replace(/\\\.$/g, '\\.?');
  let match = clean(englishEffect).match(new RegExp(relaxedPattern, 'i'));
  if (!match && englishTemplate.includes('|DURATION|s')) match = clean(englishEffect).match(new RegExp(relaxedPattern.replace(/\\s\+s\\?\.?/gi, 's'), 'i'));
  if (match) return Object.fromEntries(names.map((name, index) => [name, match[index + 1].replace(/^\+/, '')]));
  // 只有当模板全部为数值占位符，且证据中的数值数量恰好一致时才允许顺序回填。
  // 这覆盖 "12 seconds" 与 "|DURATION|s" 等纯格式差异，同时避免近战·同化
  // 那种触发条件还含额外数值时误配。
  const numbers = clean(englishEffect).match(/[-+]?\d+(?:\.\d+)?/g) || [];
  if (names.every(name => name !== 'CONDITION') && numbers.length === names.length) return Object.fromEntries(names.map((name, index) => [name, numbers[index].replace(/^\+/, '')]));
  return null;
}
function substituteOfficialTemplate(zhTemplate, englishTemplate, englishEffect) {
  const values = templateValues(englishTemplate, englishEffect);
  if (!values) return null;
  let output = String(zhTemplate || '');
  for (const [name, value] of Object.entries(values)) {
    const localizedValue = name === 'CONDITION' && /^On Operator and Tauron Strike Kill$/i.test(value) ? '指挥官或 Tauron 打击击杀时' : value;
    output = output.replaceAll(`|${name}|`, localizedValue);
  }
  return /\|[A-Z0-9_]+\|/i.test(output) ? null : renderGameText(output).trim();
}
function officialSupplementStats(item, languages) {
  const nameKey = item.languageKey || Object.entries(languages.en).find(([key, value]) => /Name$/i.test(key) && normalize(value) === normalize(item.canonical))?.[0];
  if (!nameKey) return null;
  const base = nameKey.replace(/Name$/i, '');
  const descKey = Object.keys(languages.en).find(key => key === `${base}Desc`) || (item.canonical === 'Melee Careen' ? '/Lotus/Language/Arcanes/FreezeEnemiesOnRollDesc' : null);
  const zhTemplate = descKey ? languages.zh[descKey] : null;
  const enTemplate = descKey ? languages.en[descKey] : null;
  const primary = zhTemplate && enTemplate ? substituteOfficialTemplate(zhTemplate, enTemplate, item.maxRankEffectCanonical) : null;
  if (!primary) return null;
  const extras = [];
  const extraTemplates = [
    ['/Lotus/Language/Upgrades/OperatorUltimateInitialChargeDesc', /([+-]?\d+(?:\.\d+)?)% Tauron Strike Initial Charge/i],
    ['/Lotus/Language/Upgrades/AmpAmmoEfficiency', /([+-]?\d+(?:\.\d+)?)% Amp Ammo Efficiency/i],
    ['/Lotus/Language/Upgrades/OperatorUltimateChargeRateDesc', /([+-]?\d+(?:\.\d+)?)% Tauron Strike Charge Rate/i]
  ];
  for (const [key, pattern] of extraTemplates) {
    const match = String(item.maxRankEffectCanonical || '').match(pattern);
    if (match && languages.zh[key]) extras.push(renderGameText(String(languages.zh[key]).replace('|val|', match[1])).trim());
  }
  return { levelStats: Array.from({ length: item.maxRank + 1 }, (_, rank) => ({ stats: rank === item.maxRank ? [primary, ...extras] : [] })), languageKey: descKey };
}
function slug(value) { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arcane'; }
function hashName(uniqueName) { return crypto.createHash('sha256').update(uniqueName).digest('hex').slice(0, 8); }
function fileName(item) { return `${slug(item.name)}-${hashName(item.uniqueName)}.json`; }
function isBasePlaceholder(item) { return item.name === 'Arcane' || Boolean(item.excludeFromCodex); }
function hasOfficialSource(item) { return Boolean(item.drops?.length || item.components?.length); }
function categoryFor(item) { return hasOfficialSource(item) ? (TYPE_CATEGORY[item.type] || 'legacy') : 'legacy'; }
function isExchangeLocation(location) { return /(?:The Holdfasts|Ostron|Operational Supply|The Quills|Vox Solaris|Solaris United)(?:\s*\(|,)/i.test(location); }

const STANDING_EXCHANGES = Object.freeze({
  'The Holdfasts': { npcId: 'npc.cavalero', locationId: 'hub.zariman', ranks: { Fallen: 1, Watcher: 2, Guardian: 3, Seraph: 4, Angel: 5 } },
  Ostron: { npcId: 'npc.hok', locationId: 'hub.cetus', ranks: { Kin: 5 } },
  'Operational Supply': { npcId: 'npc.nakak', locationId: 'hub.cetus', ranks: { Defender: 2 } },
  'The Quills': { npcId: 'npc.onkko', locationId: 'hub.cetus', ranks: { Mote: 0, Observer: 1, Adherent: 2, Instrument: 3, Architect: 4 } },
  'Vox Solaris': { npcId: 'npc.little-duck', locationId: 'hub.fortuna', ranks: { Agent: 2, Hand: 3, Instrument: 4, Shadow: 5 } },
  'Solaris United': { npcId: 'npc.rude-zuud', locationId: 'hub.fortuna', ranks: { 'Old Mate': 5 } }
});
const STANDING_RANK_LANGUAGE_KEYS = Object.freeze({
  'The Holdfasts': { Fallen: '/Lotus/Language/Syndicates/ZarimanTitle1', Watcher: '/Lotus/Language/Syndicates/ZarimanTitle2', Guardian: '/Lotus/Language/Syndicates/ZarimanTitle3', Seraph: '/Lotus/Language/Syndicates/ZarimanTitle4', Angel: '/Lotus/Language/Syndicates/ZarimanTitle5' },
  Ostron: { Kin: '/Lotus/Language/Syndicates/CetusTitle5' },
  'Operational Supply': { Defender: '/Lotus/Language/Syndicates/EventSyndicateTitle2' },
  'The Quills': { Mote: '/Lotus/Language/Syndicates/QuillsTitle1', Observer: '/Lotus/Language/Syndicates/QuillsTitle2', Adherent: '/Lotus/Language/Syndicates/QuillsTitle3', Instrument: '/Lotus/Language/Syndicates/QuillsTitle4', Architect: '/Lotus/Language/Syndicates/QuillsTitle5' },
  'Vox Solaris': { Agent: '/Lotus/Language/Syndicates/VoxSolTitle2', Hand: '/Lotus/Language/Syndicates/VoxSolTitle3', Instrument: '/Lotus/Language/Syndicates/VoxSolTitle4', Shadow: '/Lotus/Language/Syndicates/VoxSolTitle5' },
  'Solaris United': { 'Old Mate': '/Lotus/Language/Syndicates/SolarisTitle5' }
});
function officialRankName(syndicate, rankName, languages = loadLanguages()) {
  const languageKey = STANDING_RANK_LANGUAGE_KEYS[syndicate]?.[rankName]
  const displayName = languageKey ? String(languages.zh[languageKey] || '').trim() : ''
  if (!displayName) throw new Error(`${syndicate}/${rankName}: 官方声望等级缺少简中语言值`)
  return displayName
}
function exchangeRequirements(location, languages = loadLanguages()) {
  const match = String(location || '').match(/^(.+?)(?:\s*\([^)]+\))?,\s*(.+)$/);
  if (!match) return { type: 'none' };
  const definition = STANDING_EXCHANGES[match[1]];
  const rank = definition?.ranks?.[match[2]];
  return definition && rank != null ? { type: 'standing', npcId: definition.npcId, locationId: definition.locationId, rank, rankName: officialRankName(match[1], match[2], languages) } : { type: 'none' };
}
function supplementRequirements(sourceCanonical) {
  let match = String(sourceCanonical || '').match(/^Hunhow at Pontis Tower \((\d+) Emerald Talent \+ (\d+) Crimson Talent\)$/);
  if (match) return { type: 'currency', usage: 'exchange', npcId: 'npc.hunhow', locationId: 'hub.pontis-tower', currency: [{ currencyId: 'currency.emerald-talent', amount: Number(match[1]) }, { currencyId: 'currency.crimson-talent', amount: Number(match[2]) }], isBuffUseless: true };
  match = String(sourceCanonical || '').match(/^Roathe at La Cathédrale \((\d+) Maphica\)$/);
  if (match) return { type: 'currency', usage: 'exchange', npcId: 'npc.roathe', locationId: 'hub.sanctum-anatomica', currency: [{ currencyId: 'currency.maphica', amount: Number(match[1]) }], isBuffUseless: true };
  if (/^Marie rotating shop/.test(String(sourceCanonical || ''))) return { type: 'item', npcId: 'npc.marie', locationId: 'hub.sanctum-anatomica', itemGroupId: 'resource-group.perita', amountStatus: 'random' };
  return { type: 'none' };
}

function standingAmountFromWiki(method, previous) {
  if (method?.requirements?.type !== 'standing') return null
  const syndicate = String(method.sourceCanonical || '').split(',')[0].replace(/\s*\([^)]+\)\s*$/, '').trim()
  const rankCanonical = String(method.sourceCanonical || '').split(',')[1]?.trim()
  for (const evidence of previous?.arcaneAcquisition?.generated?.wiki?.evidence || []) {
    const excerpt = String(evidence.provenance?.excerpt || '')
    const amount = excerpt.match(/for\s+([\d,]+)\s+Standing/i)
    if (!amount || !new RegExp(`\\b${syndicate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(excerpt)) continue
    if (rankCanonical && !new RegExp(`\\b${rankCanonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(excerpt)) continue
    return Number(amount[1].replace(/,/g, ''))
  }
  return null
}

function structuredAcquisition(item, languages = loadLanguages(), previous = null) {
  if (ARCANE_SOURCE_OVERRIDES[item.uniqueName]) return ARCANE_SOURCE_OVERRIDES[item.uniqueName].map(method => ({ ...method, provenance: { source: 'de-official-drop-tables', officialUniqueName: item.uniqueName, note: '官方掉落表与任务类型结构覆盖上游第三方 location 字符串。' } }));
  const methods = [];
  for (const drop of item.drops || []) {
    const location = String(drop.location || '').trim();
    if (!location) continue;
    if (Number(drop.chance) === 1 && isExchangeLocation(location)) {
      methods.push({
        type: 'vendor-or-syndicate-exchange', sourceEntityId: sourceId(location), sourceCanonical: location, availability: 'guaranteed-when-requirements-met',
        quantity: 1, rarity: drop.rarity || null, requirements: exchangeRequirements(location, languages),
        provenance: { source: 'warframe-items', input: 'Arcanes.json', officialUniqueName: item.uniqueName, rawChance: 1,
          note: '上游 chance=1 表示满足声望/商店条件后可确定兑换，不是 100% 随机掉落。' }
      });
    } else {
      const probability = Number.isFinite(Number(drop.chance)) ? Number(drop.chance) : null;
      methods.push({
        type: 'reward-or-drop', sourceEntityId: sourceId(location), sourceCanonical: location, probability, chancePercent: probability === null ? null : probability * 100,
        quantity: 1, rarity: drop.rarity || null,
        provenance: { source: 'warframe-items', input: 'Arcanes.json', officialUniqueName: item.uniqueName }
      });
    }
  }
  if (item.components?.length) methods.push({
    type: 'crafting', outputQuantity: Number(item.buildQuantity || 1), credits: Number(item.buildPrice || 0),
    buildTimeSeconds: Number(item.buildTime || 0), ingredients: item.components.map(component => ({
      officialUniqueName: component.uniqueName || null, canonical: component.name || null, quantity: Number(component.itemCount || 0)
    })), provenance: { source: 'warframe-items', input: 'Arcanes.json', officialUniqueName: item.uniqueName }
  });
  return methods.map(method => {
    const amount = standingAmountFromWiki(method, previous)
    if (amount) return { ...method, requirements: { ...method.requirements, amount }, reviewStatus: 'approved', provenance: { ...method.provenance, standingAmountEvidence: 'current-wiki-acquisition-prose' } }
    if (method.type === 'vendor-or-syndicate-exchange' && method.requirements?.type === 'standing') return { ...method, reviewStatus: 'review-required' }
    return method
  });
}

function existingEntries() {
  const byUniqueName = new Map();
  if (!fs.existsSync(ARCANE_ROOT)) return byUniqueName;
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory() && !PROTECTED_DIRECTORIES.includes(entry.name)) walk(target);
      else if (entry.isFile() && entry.name.endsWith('.json') && target !== CATALOG_PATH) {
        const value = JSON.parse(fs.readFileSync(target, 'utf8'));
        if (value.subject?.officialUniqueName) byUniqueName.set(value.subject.officialUniqueName, value);
      }
    }
  };
  walk(ARCANE_ROOT);
  return byUniqueName;
}

function buildSupplementEntry(item, previous, languages = loadLanguages()) {
  const methods = (item.methods || []).map(method => ({ ...method, sourceEntityId: sourceId(method.sourceCanonical), sourceDisplayName: displaySource(method.sourceCanonical), requirements: method.requirements || supplementRequirements(method.sourceCanonical), provenance: { source: 'official-wiki-supplement', pageTitle: item.source.wiki.pageTitle, revisionId: item.source.wiki.revisionId, patchNotesUrl: item.source.patchNotesUrl } }))
  const manualPrevious = previous?.arcaneAcquisition?.manual || {}
  const manual = { aliases: Array.isArray(manualPrevious.aliases) ? manualPrevious.aliases : [], methods: Array.isArray(manualPrevious.methods) ? manualPrevious.methods : [], methodRefs: Array.isArray(manualPrevious.methodRefs) ? manualPrevious.methodRefs : [], notes: Array.isArray(manualPrevious.notes) ? manualPrevious.notes : [], overrides: manualPrevious.overrides && typeof manualPrevious.overrides === 'object' ? manualPrevious.overrides : {}, reviewStatus: manualPrevious.reviewStatus || 'draft', reviewedBy: Array.isArray(manualPrevious.reviewedBy) ? manualPrevious.reviewedBy : [] }
  const officialStats = officialSupplementStats(item, languages)
  const levelStats = officialStats?.levelStats || Array.from({ length: item.maxRank + 1 }, (_, rank) => ({ stats: rank === item.maxRank ? [item.maxRankEffectCanonical] : [] }))
  const displayName = item.displayName || item.canonical
  const generated = { identity: { officialUniqueName: item.officialUniqueName, canonical: item.canonical, displayName, localizationStatus: item.localizationStatus }, classification: { category: item.category, arcaneType: item.arcaneType, equipmentClass: item.equipmentClass }, stats: { rarity: item.rarity, maxRank: item.maxRank, levelStats, localizationStatus: officialStats ? 'official-zh' : 'official-zh-unavailable', ...(officialStats?.languageKey ? { languageKey: officialStats.languageKey } : {}) }, acquisition: { status: methods.length ? 'structured' : 'review-required', methods }, tradable: true, sourceFile: 'official-arcane-supplements.json', ...(previous?.arcaneAcquisition?.generated?.wiki ? { wiki: previous.arcaneAcquisition.generated.wiki } : {}) }
  return { id: `knowledge.acquisition.arcane.${hashName(item.officialUniqueName)}`, kind: 'knowledge', module: 'acquisition', title: displayName, subject: { canonical: item.canonical, displayName, category: 'arcane', officialUniqueName: item.officialUniqueName }, officialUniqueName: item.officialUniqueName, arcaneType: item.arcaneType, equipmentClass: item.equipmentClass, rarity: item.rarity, maxRank: item.maxRank, levelStats, tradable: true, prerequisites: [], methodRefs: [], arcaneAcquisition: { generated, manual }, acquisitionStatus: methods.length ? 'complete' : 'partial', summary: `${item.canonical} 的官方 Wiki 补充身份；官方简中名称和效果暂未进入 Public Export。`, sources: [{ url: `https://wiki.warframe.com/w/${item.canonical.replace(/ /g,'_')}`, label: 'Official Warframe Wiki' }, ...(item.source.patchNotesUrl ? [{ url: item.source.patchNotesUrl, label: 'Warframe official patch notes' }] : [])], gameVersion: `Wiki revision ${item.source.wiki.revisionId}`, updatedAt: previous?.updatedAt || new Date().toISOString().slice(0,10), reviewStatus: 'approved', reviewedBy: Array.isArray(previous?.reviewedBy) ? previous.reviewedBy : [], tags: ['acquisition','arcane',item.category,'official-wiki-supplement'], generator: { name: 'sync-arcanes', version: 2 } }
}

function buildEntry(item, previous, languages = loadLanguages()) {
  const localized = I18N[item.uniqueName]?.zh || {};
  const category = categoryFor(item);
  const methods = structuredAcquisition(item, languages, previous);
  const status = category === 'legacy' ? 'review-required' : methods.length ? 'structured' : 'review-required';
  const manualPrevious = previous?.arcaneAcquisition?.manual || {};
  const manual = {
    aliases: Array.isArray(manualPrevious.aliases) ? manualPrevious.aliases : [],
    methods: Array.isArray(manualPrevious.methods) ? manualPrevious.methods : [],
    methodRefs: Array.isArray(manualPrevious.methodRefs) ? manualPrevious.methodRefs : (Array.isArray(previous?.methodRefs) ? previous.methodRefs : []),
    notes: Array.isArray(manualPrevious.notes) ? manualPrevious.notes : [],
    overrides: manualPrevious.overrides && typeof manualPrevious.overrides === 'object' ? manualPrevious.overrides : {},
    reviewStatus: manualPrevious.reviewStatus || 'draft', reviewedBy: Array.isArray(manualPrevious.reviewedBy) ? manualPrevious.reviewedBy : []
  };
  const requirements = { type: 'none' };
  const generated = {
    identity: { officialUniqueName: item.uniqueName, canonical: item.name, displayName: localized.name || item.name,
      localizationStatus: localized.name && localized.name !== item.name ? 'official-zh' : 'fallback-en' },
    classification: { category, arcaneType: item.type, equipmentClass: CATEGORY_EQUIPMENT[category] },
    stats: { rarity: item.rarity || null, maxRank: Math.max(0, (item.levelStats?.length || 1) - 1), levelStats: (localized.levelStats || item.levelStats || []).map(level => ({ ...level, stats: (level.stats || []).map(renderGameText) })), localizationStatus: localized.levelStats ? 'official-zh' : 'fallback-en' },
    acquisition: { status, methods, requirements }, tradable: Boolean(item.tradable), sourceFile: 'Arcanes.json',
    ...(previous?.arcaneAcquisition?.generated?.wiki ? { wiki: previous.arcaneAcquisition.generated.wiki } : {})
  };
  return {
    id: `knowledge.acquisition.arcane.${hashName(item.uniqueName)}`, kind: 'knowledge', module: 'acquisition',
    title: localized.name || item.name,
    subject: { canonical: item.name, displayName: localized.name || item.name, category: 'arcane', officialUniqueName: item.uniqueName },
    officialUniqueName: item.uniqueName, arcaneType: item.type, equipmentClass: CATEGORY_EQUIPMENT[category], rarity: item.rarity || null,
    maxRank: generated.stats.maxRank, levelStats: generated.stats.levelStats, tradable: Boolean(item.tradable), prerequisites: [], methodRefs: [],
    arcaneAcquisition: { generated, manual }, acquisitionStatus: status === 'structured' ? 'complete' : 'partial',
    summary: `${localized.name || item.name}的官方赋能身份与结构化获取来源。`,
    sources: [{ url: 'https://github.com/WFCD/warframe-items', label: 'warframe-items / Warframe Public Export' }],
    gameVersion: `warframe-items@${PACKAGE.version}`, updatedAt: previous?.updatedAt || new Date().toISOString().slice(0, 10),
    reviewStatus: previous?.reviewStatus || 'draft', reviewedBy: Array.isArray(previous?.reviewedBy) ? previous.reviewedBy : [],
    tags: ['acquisition', 'arcane', category, 'official-generated'], generator: { name: 'sync-arcanes', version: 1 }
  };
}

function buildPlan(generatedAt = new Date().toISOString()) {
  const raw = require(path.join(DATA_ROOT, 'Arcanes.json'));
  const previous = existingEntries();
  const placeholders = raw.filter(isBasePlaceholder);
  const real = raw.filter(item => !isBasePlaceholder(item));
  const supplements = fs.existsSync(SUPPLEMENTS_PATH) ? JSON.parse(fs.readFileSync(SUPPLEMENTS_PATH, 'utf8')).entries || [] : [];
  const languages = loadLanguages();
  const entries = [...real.map(item => buildEntry(item, previous.get(item.uniqueName), languages)), ...supplements.map(item => buildSupplementEntry(item, previous.get(item.officialUniqueName), languages))].sort((a, b) => a.officialUniqueName.localeCompare(b.officialUniqueName));
  const routes = entries.map(entry => {
    const category = entry.arcaneAcquisition.generated.classification.category;
    return { officialUniqueName: entry.officialUniqueName, canonical: entry.subject.canonical, displayName: entry.subject.displayName,
      category, file: `${category}/${fileName({ name: entry.subject.canonical, uniqueName: entry.officialUniqueName })}`,
      acquisitionStatus: entry.arcaneAcquisition.generated.acquisition.status };
  });
  const byCategory = Object.fromEntries(CATEGORIES.map(category => [category, routes.filter(route => route.category === category).length]));
  const catalog = { schemaVersion: 1, generatedAt, primaryKey: 'officialUniqueName', hashAlgorithm: 'sha256-8',
    source: { package: PACKAGE.name, version: PACKAGE.version, repository: 'https://github.com/WFCD/warframe-items', input: 'Arcanes.json' },
    categories: CATEGORIES.map(category => ({ id: category, equipmentClass: CATEGORY_EQUIPMENT[category], count: byCategory[category], mutuallyExclusive: true })),
    counts: { input: raw.length, placeholdersExcluded: placeholders.length, supplementalArcanes: supplements.length, arcanes: entries.length, structured: routes.filter(route => route.acquisitionStatus === 'structured').length,
      reviewRequired: routes.filter(route => route.acquisitionStatus === 'review-required').length, byCategory },
    excludedPlaceholders: placeholders.map(item => ({ officialUniqueName: item.uniqueName, canonical: item.name, reason: 'base-class-placeholder' })), arcanes: routes };
  return { entries, catalog };
}

function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const current = fs.existsSync(CATALOG_PATH) ? JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')) : null;
  const plan = buildPlan(check && current?.generatedAt ? current.generatedAt : new Date().toISOString());
  const expected = new Set([path.resolve(CATALOG_PATH).toLowerCase()]);
  const changes = [];
  const compare = (target, value) => { const next = serialize(value); const old = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null; if (old !== next) changes.push({ target, next }); expected.add(path.resolve(target).toLowerCase()); };
  compare(CATALOG_PATH, plan.catalog);
  for (const entry of plan.entries) {
    const category = entry.arcaneAcquisition.generated.classification.category;
    compare(path.join(ARCANE_ROOT, category, fileName({ name: entry.subject.canonical, uniqueName: entry.officialUniqueName })), entry);
  }
  if (fs.existsSync(ARCANE_ROOT)) {
    const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const target = path.join(dir, entry.name); if (entry.isDirectory() && !PROTECTED_DIRECTORIES.includes(entry.name)) walk(target); else if (entry.isFile() && entry.name.endsWith('.json') && !expected.has(path.resolve(target).toLowerCase())) changes.push({ target, remove: true }); } };
    walk(ARCANE_ROOT);
  }
  if (check) { if (changes.length) throw new Error(`赋能目录已漂移（${changes.length} 项）`); console.log(`赋能目录无漂移：${plan.catalog.counts.arcanes} 个真实赋能`); return plan; }
  for (const change of changes) { if (change.remove) fs.unlinkSync(change.target); else { fs.mkdirSync(path.dirname(change.target), { recursive: true }); fs.writeFileSync(change.target, change.next); } }
  console.log(`已同步 ${plan.catalog.counts.arcanes} 个真实赋能；排除 ${plan.catalog.counts.placeholdersExcluded} 个基类占位；${plan.catalog.counts.reviewRequired} 个进入 legacy/review-required`);
  return plan;
}

if (require.main === module) { try { run(); } catch (error) { console.error(error.stack || error); process.exit(1); } }
module.exports = { CATEGORIES, PROTECTED_DIRECTORIES, TYPE_CATEGORY, ARCANE_SOURCE_OVERRIDES, STANDING_EXCHANGES, STANDING_RANK_LANGUAGE_KEYS, isBasePlaceholder, categoryFor, officialRankName, exchangeRequirements, supplementRequirements, structuredAcquisition, loadLanguages, templateValues, substituteOfficialTemplate, officialSupplementStats, buildSupplementEntry, buildEntry, buildPlan, run, hashName, fileName };
