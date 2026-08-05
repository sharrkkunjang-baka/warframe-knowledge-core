'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const indexPath = path.join(root, 'knowledge', 'mission-types', 'categories.json');
const dispositionPath = path.join(root, 'knowledge', 'gameplay', 'mission-type-dispositions.json');
const generatedPath = path.join(root, 'knowledge', 'gameplay-generated', 'mission-types.json');
const check = process.argv.includes('--check');

const COVERED = {
  'mission-type.arbitration': ['gameplay.arbitrations'],
  'mission-type.arbitrations': ['gameplay.arbitrations'],
  'mission-type.cambion-drift-bounty': ['gameplay.cambion-drift-set-mods'],
  'mission-type.cetus-bounty': ['gameplay.cetus-bounty-set-mods'],
  'mission-type.disruption': ['gameplay.jupiter-disruption-amalgam'],
  'mission-type.ghoul-bounty': ['gameplay.ghoul-bounty-set-mods'],
  'mission-type.mirror-defense': ['gameplay.mirror-defense'],
  'mission-type.narmer-bounty': ['gameplay.narmer-bounty'],
  'mission-type.nightmare-mode': ['gameplay.nightmare-mode'],
  'mission-type.orb-vallis-bounty': ['gameplay.orb-vallis-bounty-set-mods'],
  'mission-type.orokin-vault': ['gameplay.deimos-orokin-vault'],
  'mission-type.profit-taker-bounty': ['gameplay.profit-taker-heists'],
  'mission-type.sanctuary-onslaught': ['gameplay.sanctuary-onslaught'],
  'mission-type.solar-rail-junction': ['gameplay.junction-rewards'],
  'mission-type.spy': ['gameplay.spy-missions'],
  'mission-type.the-circuit': ['gameplay.duviri-endless'],
  'mission-type.the-descendia': ['gameplay.the-descendia'],
  'mission-type.zariman-bounty': ['gameplay.zariman-bounty']
};
const VARIANTS = {
  'mission-type.conjunction-survival': 'mission-type.survival',
  'mission-type.extended-granum-void': 'mission-type.granum-void',
  'mission-type.nightmare-granum-void': 'mission-type.granum-void',
  'mission-type.team-annihilation': 'mission-type.annihilation'
};
const SHELLS = new Set(['mission-type.bounty', 'mission-type.hard', 'mission-type.normal', 'mission-type.railjack']);
const MANUAL_REQUIRED = new Set(['mission-type.archimedea', 'mission-type.granum-void', 'mission-type.netracell', 'mission-type.void-storm']);
const REVIEW_REQUIRED = new Set(['mission-type.faceoff', 'mission-type.follie-s-hunt', 'mission-type.legacyte-harvest', 'mission-type.shrine-defense', 'mission-type.the-perita-rebellion']);
function dispositionFor(item) {
  if (COVERED[item.id]) return { disposition: 'covered', primaryGameplayIds: COVERED[item.id] };
  if (VARIANTS[item.id]) return { disposition: 'variant-of', variantOf: VARIANTS[item.id] };
  if (SHELLS.has(item.id)) return { disposition: 'non-queryable-shell' };
  if (MANUAL_REQUIRED.has(item.id)) return { disposition: 'manual-required' };
  if (REVIEW_REQUIRED.has(item.id)) return { disposition: 'review-required' };
  if (item.category === 'reward-source') return { disposition: 'reward-source-only' };
  if (item.category === 'event') return { disposition: 'event-lifecycle' };
  return { disposition: 'generated', generatedGameplayId: `gameplay.generated.${item.id.slice('mission-type.'.length)}` };
}

function build() {
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const entries = index.variables.map(item => ({ missionTypeId: item.id, canonical: item.canonical, displayName: item.displayName, category: item.category, ...dispositionFor(item) }));
  const counts = Object.fromEntries([...new Set(entries.map(item => item.disposition))].sort().map(key => [key, entries.filter(item => item.disposition === key).length]));
  const dispositions = {
    schemaVersion: 1,
    type: 'mission-type-gameplay-dispositions',
    universe: 'knowledge/mission-types/categories.json',
    count: entries.length,
    allowedDispositions: ['covered', 'generated', 'manual-required', 'variant-of', 'non-queryable-shell', 'reward-source-only', 'event-lifecycle', 'review-required'],
    counts,
    entries
  };
  const generated = entries.filter(item => item.disposition === 'generated').map(item => ({
    id: item.generatedGameplayId,
    kind: 'knowledge',
    module: 'gameplay',
    layer: 'generated',
    title: item.displayName || item.canonical,
    aliases: [...new Set([item.displayName, item.canonical].filter(Boolean))],
    summary: `${item.displayName || item.canonical}是任务类型目录中的官方身份；具体机制尚未经过当前 Wiki 或 DE 证据审核。`,
    steps: [],
    notes: ['可使用任务类型名称查询节点、奖励或后续人工审核的玩法说明。', '自动层不推断目标、轮次、失败条件或奖励机制。'],
    content: `${item.displayName || item.canonical}目前仅提供任务类型身份与通用查询入口，具体机制待审核。`,
    missionTypeIds: [item.missionTypeId],
    sources: [{ url: 'https://browse.wf/warframe-public-export-plus/ExportRegions.json', label: 'DE Public Export 衍生任务类型目录' }],
    gameVersion: 'current-export',
    updatedAt: '2026-07-31',
    reviewStatus: 'draft',
    qualityStatus: 'review-required',
    reviewedBy: [],
    tags: ['gameplay', 'generated', 'review-required']
  }));
  return { dispositions, generated };
}

function serialize(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function verifyOrWrite(file, value) {
  const expected = serialize(value);
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== expected) throw new Error(`generated drift: ${path.relative(root, file)}`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, expected);
  }
}

if (require.main === module) {
  const built = build();
  verifyOrWrite(dispositionPath, built.dispositions);
  verifyOrWrite(generatedPath, built.generated);
  console.log(`${check ? '检查' : '生成'}完成：${built.dispositions.count} 个任务类型，${built.generated.length} 个 draft gameplay`);
}

module.exports = { build, dispositionFor };
