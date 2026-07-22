'use strict';
const fs = require('fs');
const path = require('path');
const { createKnowledgeCore } = require('../src');
const root = path.join(__dirname, '..');
const output = path.join(root, 'generated', 'mod-relations.json');
const overlay = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'relations', 'mod-program-overrides.json'), 'utf8'));
const procCatalog = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'relations', 'syndicate-proc-effects.json'), 'utf8'));
const core = createKnowledgeCore({ approvedOnly: false });
const mods = core.officialCatalog?.mods || [];
const entries = new Map((core.knowledge || []).filter(x => x.subject?.category === 'mod').map(x => [x.subject.canonical, x]));
const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const frameEntries = (core.knowledge || []).filter(x => x.subject?.category === 'frame');
function targetFor(mod) {
  const compat = mod.compatName;
  if (!compat) return null;
  if (/^Warframe Mod$/i.test(mod.type || '')) {
    const frame = frameEntries.find(x => normalize(x.subject?.canonical) === normalize(compat));
    return frame ? { type: 'frame', canonical: frame.subject.canonical, displayName: frame.subject.displayName || frame.subject.canonical, stableId: frame.subject.officialUniqueName } : null;
  }
  const weaponEntry = core.getWeapon(compat);
  const weapon = weaponEntry?.subject;
  return weapon ? { type: 'weapon', canonical: weapon.canonical, displayName: weapon.displayName, stableId: weapon.officialUniqueName } : null;
}
function wikiEvidence(entry) {
  const wiki = entry?.modAcquisition?.generated?.wiki?.wiki;
  const methods = entry?.modAcquisition?.generated?.wiki?.methods || [];
  const evidence = entry?.modAcquisition?.generated?.wiki?.evidence || [];
  const texts = [...methods.map(x => x.provenance?.excerpt), ...evidence.map(x => x.provenance?.excerpt)].filter(Boolean);
  return { wiki, methods, texts };
}
function modDto(mod, entry, target) {
  return { stableId: mod.uniqueName, canonical: mod.canonical, displayName: mod.displayName, target, effects: mod.maxRankEffectsZh?.length ? mod.maxRankEffectsZh : mod.maxRankEffects || [], wikiUrl: mod.wiki?.url || entry?.sources?.find(x => /wiki\.warframe\.com/.test(x.url || ''))?.url || null };
}
const procByCanonical = new Map((procCatalog.effects || []).map(effect => [normalize(effect.canonical), effect]));
function syndicateProcFor(mod) {
  const effectLines = [...(mod.maxRankEffectsZh || []), ...(mod.maxRankEffects || [])];
  const matches = [...procByCanonical.entries()].filter(([key]) => effectLines.some(line => normalize(line).endsWith(key)));
  return matches.length === 1 ? matches[0][1] : null;
}
const syndicate = [], nightwave = [];
for (const mod of mods) {
  const entry = entries.get(mod.canonical), target = targetFor(mod);
  if (!entry || !target) continue;
  const generatedMethods = entry.modAcquisition?.generated?.wiki?.methods || [];
  const hasSyndicate = generatedMethods.some(x => /^syndicate-exchange/.test(x.type || '')) || entry.reviewedBy?.includes('official-sync:syndicate-exchange');
  if (target.type === 'weapon' && entry.reviewStatus === 'approved' && hasSyndicate && !mod.traits?.augment && !mod.traits?.pvp) {
    const factions = [...new Set(generatedMethods.flatMap(x => [x.factionId, ...(x.factionIds || [])]).filter(Boolean))];
    const proc = syndicateProcFor(mod);
    syndicate.push({ ...modDto(mod, entry, target), distribution: 'syndicate', factions, ...(proc ? { relationRefs: [{ type: 'triggers-syndicate-proc', targetId: proc.id }] } : {}), reviewStatus: 'approved', reviewedBy: entry.reviewedBy || [] });
  }
  const ev = wikiEvidence(entry);
  const offering = ev.texts.some(x => /Nightwave Cred Offering/i.test(x));
  const rankReward = ev.methods.some(x => /^legacy-nightwave-reward$/.test(x.type || '')) || ev.texts.some(x => /reaching Rank[^.]*Nightwave/i.test(x));
  if ((offering || rankReward) && (mod.traits?.augment || mod.traits?.pvp || /\/Nightwave\//.test(mod.uniqueName))) {
    nightwave.push({ ...modDto(mod, entry, target), distribution: 'nightwave', specialProgram: offering ? 'cred-offerings' : 'rank-reward', availability: offering ? 'rotating-or-returning' : 'legacy-or-future-rotation', reviewStatus: 'approved', reviewedBy: [overlay.reviewedBy], sourceEvidence: { pageTitle: ev.wiki?.pageTitle || mod.canonical, pageId: ev.wiki?.pageId || null, revisionId: ev.wiki?.revisionId || null, excerpts: ev.texts.filter(x => /Nightwave/i.test(x)) } });
  }
}
for (const override of overlay.overrides || []) {
  const list = override.relation === 'syndicate' ? syndicate : nightwave;
  const index = list.findIndex(x => x.stableId === override.stableId);
  if (override.exclude && index >= 0) list.splice(index, 1);
  else if (index >= 0) Object.assign(list[index], override.patch || {});
}
for (const list of [syndicate, nightwave]) list.sort((a,b) => a.displayName.localeCompare(b.displayName, 'zh-CN'));
const counts = { syndicate: { mods: syndicate.length, weapons: new Set(syndicate.map(x => x.target.stableId)).size, procRelations: syndicate.filter(x => x.relationRefs?.some(ref => ref.type === 'triggers-syndicate-proc')).length, procEntities: procCatalog.effects.length }, nightwave: { mods: nightwave.length, weapons: new Set(nightwave.filter(x => x.target.type === 'weapon').map(x => x.target.stableId)).size, frames: new Set(nightwave.filter(x => x.target.type === 'frame').map(x => x.target.stableId)).size } };
const data = { schemaVersion: 2, generatedAt: '2026-07-22', sources: ['knowledge/categories/official.json', 'knowledge/acquisition/mod/**', 'knowledge/relations/mod-program-overrides.json', 'knowledge/relations/syndicate-proc-effects.json'], counts, syndicateProcEffects: procCatalog, syndicateWeaponAugments: syndicate, nightwaveTargetMods: nightwave };
const text = JSON.stringify(data, null, 2) + '\n';
if (process.argv.includes('--check')) { const old = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : ''; if (old !== text) { console.error('mod-relations.json needs rebuild'); process.exit(1); } } else { fs.writeFileSync(output, text); console.log(JSON.stringify(counts)); }
