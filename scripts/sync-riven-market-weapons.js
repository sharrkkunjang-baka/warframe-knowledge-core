'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'knowledge', 'supplemental', 'riven-market-weapons.json');
const SOURCE_URL = 'https://api.warframe.market/v2/riven/weapons';
const DE_EXPORT_URL = 'https://browse.wf/warframe-public-export-plus/ExportWeapons.json';

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function fetchJson(url) {
  return new Promise((resolve, reject) => https.get(url, { headers: { Accept: 'application/json', 'User-Agent': 'warframe-knowledge-core/1.0' } }, response => {
    if (response.statusCode !== 200) { response.resume(); reject(new Error(`WFM Riven catalog HTTP ${response.statusCode}`)); return; }
    let body = '';
    response.setEncoding('utf8');
    response.on('data', chunk => { body += chunk; });
    response.on('end', () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
  }).on('error', reject));
}
function normalize(payload, fetchedAt, deExport = {}) {
  const source = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.payload?.items) ? payload.payload.items : payload;
  if (!Array.isArray(source)) throw new Error('WFM Riven catalog payload shape changed');
  const entries = source.map(item => ({
    slug: item.slug,
    canonical: item.i18n?.en?.name,
    gameRef: item.gameRef,
    group: item.group,
    rivenType: item.rivenType,
    disposition: Number.isFinite(Number(item.disposition)) ? Number(item.disposition) : null,
    ...(item.group === 'kitgun' ? { dispositions: (() => {
      const official = deExport[item.gameRef] || {};
      const forms = {};
      if (Number.isFinite(Number(official.omegaAttenuation))) forms.secondary = Number(official.omegaAttenuation);
      if (Number.isFinite(Number(official.primeOmegaAttenuation))) forms.primary = Number(official.primeOmegaAttenuation);
      return forms;
    })() } : {})
  })).filter(item => item.slug && item.canonical && item.gameRef && item.group).sort((a, b) => a.slug.localeCompare(b.slug));
  if (new Set(entries.map(item => item.gameRef)).size !== entries.length) throw new Error('WFM Riven catalog contains duplicate gameRef identities');
  return { schemaVersion: 2, fetchedAt, sourceUrl: SOURCE_URL, dispositionSourceUrl: DE_EXPORT_URL, authority: 'warframe.market identity catalog + DE Public Export disposition fields', counts: Object.fromEntries([...new Set(entries.map(item => item.group))].sort().map(group => [group, entries.filter(item => item.group === group).length])), entries };
}
async function run(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const current = fs.existsSync(OUTPUT) ? JSON.parse(fs.readFileSync(OUTPUT, 'utf8')) : null;
  const [payload, deExport] = await Promise.all([fetchJson(SOURCE_URL), fetchJson(DE_EXPORT_URL)]);
  const built = normalize(payload, check && current?.fetchedAt ? current.fetchedAt : new Date().toISOString(), deExport);
  if (check) {
    if (serialize(current) !== serialize(built)) throw new Error('WFM Riven 武器目录已漂移');
    console.log(`WFM Riven 武器目录无漂移：${built.entries.length} 项`);
    return built;
  }
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, serialize(built));
  console.log(`已同步 WFM Riven 武器目录：${built.entries.length} 项`);
  return built;
}
if (require.main === module) run().catch(error => { console.error(error.stack || error); process.exit(1); });
module.exports = { SOURCE_URL, DE_EXPORT_URL, normalize, run };
