'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const outputPath = path.join(root, 'generated', 'official-railjack-nodes.json');
const check = process.argv.includes('--check');
const sources = {
 regions: 'https://browse.wf/warframe-public-export-plus/ExportRegions.json',
 english: 'https://browse.wf/warframe-public-export-plus/dict.en.json',
 chinese: 'https://browse.wf/warframe-public-export-plus/dict.zh.json'
};
async function fetchJson(url) {
 const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
 if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
 return response.json();
}
(async () => {
 const [regions, english, chinese] = await Promise.all([fetchJson(sources.regions), fetchJson(sources.english), fetchJson(sources.chinese)]);
 const nodes = Object.entries(regions)
  .filter(([id, node]) => id.startsWith('CrewBattleNode') && !node.hidden && node.name)
  .map(([id, node]) => ({
   id,
   canonical: english[node.name] || node.name,
   displayName: chinese[node.name] || english[node.name] || node.name,
   localizationStatus: chinese[node.name] ? 'official-zh' : 'fallback-en',
   regionCanonical: english[node.systemName] || node.systemName || '',
   regionDisplayName: chinese[node.systemName] || english[node.systemName] || node.systemName || '',
   nameKey: node.name,
   regionKey: node.systemName || null
  }))
  .sort((a, b) => a.id.localeCompare(b.id, 'en'));
 const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sources,
  sha256: {
   regions: crypto.createHash('sha256').update(JSON.stringify(regions)).digest('hex'),
   english: crypto.createHash('sha256').update(JSON.stringify(english)).digest('hex'),
   chinese: crypto.createHash('sha256').update(JSON.stringify(chinese)).digest('hex')
  },
  count: nodes.length,
  nodes
 };
 if (check) {
  if (!fs.existsSync(outputPath)) throw new Error('generated/official-railjack-nodes.json 不存在，请运行 npm run sync:locations');
  const current = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const comparable = value => JSON.stringify({ ...value, generatedAt: '<ignored>' });
  if (comparable(current) !== comparable(output)) throw new Error('官方九重天节点目录已漂移，请运行 npm run sync:locations');
  console.log(`官方九重天节点无漂移：${nodes.length} 个节点`);
  return;
 }
 fs.mkdirSync(path.dirname(outputPath), { recursive: true });
 fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
 console.log(`已同步 ${nodes.length} 个官方九重天节点，其中 ${nodes.filter(node => node.localizationStatus === 'official-zh').length} 个有官方简中名`);
})().catch(error => { console.error(error.stack || error); process.exit(1); });