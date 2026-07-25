'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DAMAGE_TYPE_ALIASES } = require('../src/weapon-wiki-attacks');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.resolve(ROOT, '..', '..', 'qq-bot', 'warframe-rich-icons');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');

const WIKI_FILES = Object.freeze({
  Impact: 'Impact(xWhite).png',
  Puncture: 'Puncture(xWhite).png',
  Slash: 'Slash(xWhite).png',
  Heat: 'Heat(xWhite).png',
  Cold: 'Cold(xWhite).png',
  Electricity: 'Electricity(xWhite).png',
  Toxin: 'Toxin(xWhite).png',
  Blast: 'Blast(xWhite).png',
  Radiation: 'Radiation(xWhite).png',
  Magnetic: 'Magnetic(xWhite).png',
  Gas: 'Gas(xWhite).png',
  Corrosive: 'Corrosive(xWhite).png',
  Viral: 'Viral(xWhite).png',
  Void: 'VoidOutline(xWhite).png'
});

const DISPLAY_ZH = Object.freeze({
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

function sanitizeFilename(name) {
  return String(name).replace(/[()]/g, match => (match === '(' ? '-' : '')).replace(/xWhite/g, 'xwhite').toLowerCase();
}

async function fetchImageUrl(fileTitle) {
  const url = `https://wiki.warframe.com/api.php?action=query&titles=${encodeURIComponent(`File:${fileTitle}`)}&prop=imageinfo&iiprop=url&format=json`;
  const response = await fetch(url, { headers: { 'User-Agent': 'warframe-knowledge-core/1.0 (damage icon harvest)' } });
  if (!response.ok) throw new Error(`${fileTitle}: HTTP ${response.status}`);
  const data = await response.json();
  const page = Object.values(data.query?.pages || {})[0];
  const imageUrl = page?.imageinfo?.[0]?.url;
  if (!imageUrl) throw new Error(`${fileTitle}: missing image URL`);
  return imageUrl;
}

async function run() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const icons = manifest.icons.filter(icon => !String(icon.id || '').startsWith('damage.'));
  for (const [canonical, sourceFile] of Object.entries(WIKI_FILES)) {
    const imageUrl = await fetchImageUrl(sourceFile);
    const imageName = sanitizeFilename(sourceFile);
    const imagePath = path.join(OUTPUT_DIR, imageName);
    const imageResponse = await fetch(imageUrl, { headers: { 'User-Agent': 'warframe-knowledge-core/1.0 (damage icon harvest)' } });
    if (!imageResponse.ok) throw new Error(`${sourceFile}: download HTTP ${imageResponse.status}`);
    fs.writeFileSync(imagePath, Buffer.from(await imageResponse.arrayBuffer()));
    icons.push({
      id: `damage.${canonical.toLowerCase()}`,
      canonical,
      displayName: DISPLAY_ZH[canonical] || canonical,
      aliases: [canonical, ...Object.entries(DAMAGE_TYPE_ALIASES).filter(([, value]) => value === canonical).map(([key]) => key)],
      imageName,
      sourceFile,
      sourceUrl: imageUrl
    });
    console.log(`已下载 ${canonical} -> ${imageName}`);
  }
  manifest.icons = icons;
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (require.main === module) {
  run().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { run, WIKI_FILES };
