'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'));
const WARFRAMES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Warframes.json'));
const QUESTS = require(path.join(ITEMS_ROOT, 'data', 'json', 'Quests.json'));
const I18N = require(path.join(ITEMS_ROOT, 'data', 'json', 'i18n.json'));

const root = path.join(__dirname, '..');
const generated = path.join(root, 'generated');
const cache = path.join(root, 'cache');
const check = process.argv.includes('--check');
const sources = {
  warframes: 'https://browse.wf/warframe-public-export-plus/ExportWarframes.json',
  recipes: 'https://browse.wf/warframe-public-export-plus/ExportRecipes.json',
  rewards: 'https://browse.wf/warframe-public-export-plus/ExportRewards.json',
  relics: 'https://browse.wf/warframe-public-export-plus/ExportRelics.json',
  quests: 'https://browse.wf/warframe-public-export-plus/ExportKeys.json',
  dropTables: 'https://www.warframe.com/droptables'
};
const overrides = { '/Lotus/Powersuits/Sentient/CalibanPrime': 'Caliban Prime' };
function inferName(uniqueName) {
  const leaf = uniqueName.split('/').pop().replace(/Prime$/, ' Prime');
  return leaf.replace(/([a-z])([A-Z])/g, '$1 $2');
}
async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}
async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}
(async () => {
  const [warframes, recipes, rewards, relics, officialQuests, dropTablesText] = await Promise.all([
    fetchJson(sources.warframes), fetchJson(sources.recipes), fetchJson(sources.rewards),
    fetchJson(sources.relics), fetchJson(sources.quests), fetchText(sources.dropTables)
  ]);
  const missionDropSection = dropTablesText.split(/(?:<h3[^>]*>|###\s*)Relics:/i)[0];
  const activeRelicNames = new Set([...missionDropSection.matchAll(/\b(Lith|Meso|Neo|Axi)\s+([A-Z]\d+)\s+Relic\b/gi)].map(match => `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2].toUpperCase()}`));
  const packageByUniqueName = new Map(WARFRAMES.map(frame => [frame.uniqueName, frame]));
  const frames = Object.entries(warframes)
    .filter(([, frame]) => frame.productCategory === 'Suits')
    .map(([uniqueName, frame]) => ({
      uniqueName,
      name: packageByUniqueName.get(uniqueName)?.name || overrides[uniqueName] || inferName(uniqueName),
      isPrime: frame.variantType === 'VT_PRIME',
      productCategory: frame.productCategory,
      introducedAt: frame.introducedAt || null,
      components: ['Blueprint', 'Neuroptics', 'Chassis', 'Systems'].map(part => ({
        part,
        uniqueName: `/Lotus/Types/Recipes/WarframeRecipes/${(packageByUniqueName.get(uniqueName)?.name || overrides[uniqueName] || inferName(uniqueName)).replace(/\s+/g, '')}${part === 'Blueprint' ? '' : part === 'Neuroptics' ? 'Helmet' : part}${part === 'Blueprint' ? 'Blueprint' : 'Component'}`
      }))
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const questCatalog = QUESTS.map(quest => ({
    uniqueName: quest.uniqueName,
    name: quest.name,
    zhName: I18N[quest.uniqueName]?.zh?.name || null,
    officialExportPresent: Object.prototype.hasOwnProperty.call(officialQuests, quest.uniqueName)
  })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const questByEnglish = Object.fromEntries(questCatalog.filter(quest => quest.zhName).map(quest => [quest.name, quest.zhName]));
  const frameQuestSeries = {};
  for (const frame of WARFRAMES.filter(frame => !frame.isPrime)) {
    for (const component of frame.components || []) {
      const part = component.name === 'Blueprint' ? 'Blueprint' : component.name === 'Neuroptics' ? 'Neuroptics' : component.name === 'Chassis' ? 'Chassis' : component.name === 'Systems' ? 'Systems' : null;
      if (!part) continue;
      const simaris = (component.drops || []).map(drop => String(drop.location || '').match(/^Cephalon Simaris,\s*Complete\s+(.+)$/i)).find(Boolean);
      if (!simaris) continue;
      frameQuestSeries[frame.name] ||= { quest: simaris[1], parts: {} };
      frameQuestSeries[frame.name].parts[part] = { type: 'quest-first-completion-simaris-repurchase', quest: simaris[1] };
    }
  }
  frameQuestSeries.Yareli = {
    quest: 'The Waverider',
    parts: {
      Blueprint: { type: 'quest-first-completion-simaris-repurchase', quest: 'The Waverider' },
      Neuroptics: { type: 'dojo-research', room: 'Ventkids Bash Lab' },
      Chassis: { type: 'dojo-research', room: 'Ventkids Bash Lab' },
      Systems: { type: 'dojo-research', room: 'Ventkids Bash Lab' }
    }
  };
  const primeRelics = {};
  const partBySuffix = { Blueprint: 'Blueprint', HelmetBlueprint: 'Neuroptics', ChassisBlueprint: 'Chassis', SystemsBlueprint: 'Systems' };
  for (const frame of frames.filter(frame => frame.isPrime)) {
    const compact = frame.name.replace(/\s+/g, '');
    const byPart = Object.fromEntries(Object.values(partBySuffix).map(part => [part, []]));
    for (const [relicPath, relic] of Object.entries(relics)) {
      if (!/VPQ_BRONZE$/.test(relic.quality || '')) continue;
      const rewardGroups = rewards[relic.rewardManifest] || [];
      for (const reward of rewardGroups.flat()) {
        const match = String(reward.type || '').match(new RegExp(`/WarframeRecipes/${compact}(Blueprint|HelmetBlueprint|ChassisBlueprint|SystemsBlueprint)$`, 'i'));
        if (!match) continue;
        byPart[partBySuffix[match[1]]].push({
          name: `${relic.era} ${relic.category}`,
          uniqueName: relicPath,
          rarity: String(reward.rarity || '').replace(/^./, char => char.toUpperCase()).toLowerCase().replace(/^./, char => char.toUpperCase()),
          active: activeRelicNames.has(`${relic.era} ${relic.category}`)
        });
      }
    }
    primeRelics[frame.name] = byPart;
  }

  const output = {
    schemaVersion: 1,
    source: sources.warframes,
    generatedAt: new Date().toISOString(),
    count: frames.length,
    packageMissing: frames.filter(frame => !packageByUniqueName.has(frame.uniqueName)).map(frame => frame.name),
    frames
  };
  const text = `${JSON.stringify(output, null, 2)}\n`;
  const target = path.join(generated, 'official-warframes.json');
  if (check) {
    if (!fs.existsSync(target)) throw new Error('generated/official-warframes.json 不存在，请运行 npm run sync:frames');
    const current = JSON.parse(fs.readFileSync(target, 'utf8'));
    const comparable = value => JSON.stringify({ ...value, generatedAt: '<ignored>' });
    if (comparable(current) !== comparable(output)) throw new Error('官方战甲目录已漂移，请运行 npm run sync:frames');
    console.log(`官方战甲目录无漂移：${frames.length} 个战甲`);
    return;
  }
  fs.mkdirSync(generated, { recursive: true });
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(target, text);
  fs.writeFileSync(path.join(cache, 'warframe-export-recipes.json'), JSON.stringify(recipes));
  fs.writeFileSync(path.join(cache, 'warframe-export-rewards.json'), JSON.stringify(rewards));
  fs.writeFileSync(path.join(generated, 'official-quests.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt: output.generatedAt, count: questCatalog.length, quests: questCatalog, byEnglish: questByEnglish }, null, 2)}\n`);
  fs.writeFileSync(path.join(generated, 'official-frame-quest-series.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt: output.generatedAt, frames: frameQuestSeries }, null, 2)}\n`);
  fs.writeFileSync(path.join(generated, 'official-prime-relics.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt: output.generatedAt, frames: primeRelics }, null, 2)}\n`);
  fs.writeFileSync(path.join(generated, 'official-frame-sources.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt: output.generatedAt, sources, sha256: { warframes: crypto.createHash('sha256').update(JSON.stringify(warframes)).digest('hex'), recipes: crypto.createHash('sha256').update(JSON.stringify(recipes)).digest('hex'), rewards: crypto.createHash('sha256').update(JSON.stringify(rewards)).digest('hex'), relics: crypto.createHash('sha256').update(JSON.stringify(relics)).digest('hex'), quests: crypto.createHash('sha256').update(JSON.stringify(officialQuests)).digest('hex'), dropTables: crypto.createHash('sha256').update(dropTablesText).digest('hex') } }, null, 2)}\n`);
  console.log(`已同步 ${frames.length} 个官方战甲、${activeRelicNames.size} 个当前遗物；第三方包缺少：${output.packageMissing.join('、') || '无'}`);
})().catch(error => { console.error(error.stack || error); process.exit(1); });
