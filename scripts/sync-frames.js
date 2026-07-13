'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'));
const WARFRAMES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Warframes.json'));

const root = path.join(__dirname, '..');
const generated = path.join(root, 'generated');
const cache = path.join(root, 'cache');
const check = process.argv.includes('--check');
const sources = {
  warframes: 'https://browse.wf/warframe-public-export-plus/ExportWarframes.json',
  recipes: 'https://browse.wf/warframe-public-export-plus/ExportRecipes.json',
  rewards: 'https://browse.wf/warframe-public-export-plus/ExportRewards.json'
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
(async () => {
  const [warframes, recipes, rewards] = await Promise.all(Object.values(sources).map(fetchJson));
  const packageByUniqueName = new Map(WARFRAMES.map(frame => [frame.uniqueName, frame]));
  const frames = Object.entries(warframes)
    .filter(([, frame]) => frame.productCategory === 'Suits')
    .map(([uniqueName, frame]) => ({
      uniqueName,
      name: packageByUniqueName.get(uniqueName)?.name || overrides[uniqueName] || inferName(uniqueName),
      isPrime: frame.variantType === 'VT_PRIME',
      productCategory: frame.productCategory,
      introducedAt: frame.introducedAt || null
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
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
  fs.writeFileSync(path.join(generated, 'official-frame-sources.json'), `${JSON.stringify({ schemaVersion: 1, generatedAt: output.generatedAt, sources, sha256: { warframes: crypto.createHash('sha256').update(JSON.stringify(warframes)).digest('hex'), recipes: crypto.createHash('sha256').update(JSON.stringify(recipes)).digest('hex'), rewards: crypto.createHash('sha256').update(JSON.stringify(rewards)).digest('hex') } }, null, 2)}\n`);
  console.log(`已同步 ${frames.length} 个官方战甲；第三方包缺少：${output.packageMissing.join('、') || '无'}`);
})().catch(error => { console.error(error.stack || error); process.exit(1); });
