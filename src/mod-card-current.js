'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { queryMaintainedModEffect } = require('./mod-effect-query');
const { resolveModContent } = require('./mod-content');
const pending = new Map();
const manifestCache = new Map();
const root = path.resolve(__dirname, '..');
const images = 'D:/Warframe/warframe-content/images';
const renderer = 'D:/qq-bot/temp/auto-localize-mod-card.py';

function manifest(file) {
  const stat = fs.statSync(file), key = `${stat.size}:${stat.mtimeMs}`;
  const cached = manifestCache.get(file);
  if (cached?.key === key) return cached.entries;
  const entries = new Map(JSON.parse(fs.readFileSync(file, 'utf8')).items.map(item => [item.uniqueName, item]));
  manifestCache.set(file, { key, entries });
  return entries;
}

function runPython(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('D:/Python312/python.exe', args, {
      windowsHide: true, cwd: 'D:/qq-bot', env: { ...process.env, PYTHONUTF8: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const record = chunk => { output = (output + chunk.toString()).slice(-4000); };
    child.stdout.on('data', record); child.stderr.on('data', record);
    const timer = setTimeout(() => { child.kill(); reject(new Error('Mod card generation timed out')); }, 45000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(output || 'Mod card generation failed')); });
  });
}

async function ensureCurrentModCard(payload) {
  if (payload?.kind !== 'mod' || !payload.fullCard) return payload;
  const name = payload.identity?.canonical || payload.identity?.displayName;
  if (!name) return payload;
  const match = queryMaintainedModEffect(`${name}的效果是什么`, { root });
  if (!match) return payload;
  const [relative, id] = match.source.split('#');
  const raw = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const entry = (Array.isArray(raw) ? raw : [raw]).find(item => item.id === id);
  if (!(entry?.effectDetails || []).some(line => /\{effects(?:\.\d+(?:\.(?:value|absValue|displayName|unit))?)?\}/.test(line))) return payload;
  const uniqueName = entry.officialUniqueName || entry.subject.officialUniqueName;
  const originalDirectory = path.join(images, 'wiki-mod-card-images');
  const original = manifest(path.join(originalDirectory, 'manifest.json')).get(uniqueName);
  const reviewed = manifest(path.join(images, 'reviewed-mod-card-images/manifest.json')).get(uniqueName)
    || manifest(path.join(images, 'mod-card-images/manifest.json')).get(uniqueName);
  if (!original || !reviewed?.sourceSha256) throw new Error('Reviewed Mod card source is missing');
  const source = path.join(originalDirectory, original.imageName);
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  if (sourceHash !== reviewed.sourceSha256) throw new Error('Reviewed Mod card source hash differs');
  const hydrated = { ...resolveModContent(match.source, root), effectDetails: match.effects };
  const signature = crypto.createHash('sha256').update(JSON.stringify({
    title: hydrated.subject.displayName, effects: hydrated.effectDetails,
    setBonus: hydrated.setBonusDetails || [], sourceHash,
    renderer: fs.statSync(renderer).mtimeMs
  })).digest('hex');
  const work = path.join('D:/Temp/mod-effect-cards', signature);
  const stem = path.parse(source).name, output = path.join(work, stem + '-cn.png');
  const approved = path.join(work, 'verified.json');
  if (!fs.existsSync(approved) || !fs.existsSync(output)) {
    if (!pending.has(signature)) pending.set(signature, (async () => {
      fs.mkdirSync(work, { recursive: true });
      const snapshot = path.join(work, 'resolved-source.json');
      fs.writeFileSync(snapshot, JSON.stringify([hydrated], null, 2) + '\n');
      await runPython([renderer, '--source', source, '--knowledge', snapshot, '--out', work]);
      const report = JSON.parse(fs.readFileSync(path.join(work, stem + '-report.json'), 'utf8'));
      const { verifyDerivedCard } = require('D:/qq-bot/scripts/warframe-mod-card-derivation');
      const verification = await verifyDerivedCard({ sourcePath: source, localizedPath: output, sourceSha256: sourceHash, allowedRegions: report.allowedRegions });
      if (!verification.valid || report.outsideChangedPixels !== 0) throw new Error('Mod card derivation rejected: ' + verification.reason);
      fs.writeFileSync(approved, JSON.stringify({ signature, sourceHash, effects: report.effects }));
    })().finally(() => pending.delete(signature)));
    await pending.get(signature);
  }
  return { ...payload, imagePath: output };
}

module.exports = { ensureCurrentModCard };
