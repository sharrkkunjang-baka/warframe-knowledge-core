'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createKnowledgeCore } = require('../src');

const REGION_ORDER = Object.freeze(['夜灵平野', '奥布山谷', '魔胎之境']);
const TYPE_ORDER = Object.freeze([
  ['ore', '矿物'],
  ['gem', '宝石']
]);

function formatRecipe(processed) {
  const recipe = processed?.recipe;
  if (!recipe) return '暂无加工配方';
  const ingredients = recipe.ingredients.map(item => `${item.displayName}×${item.quantity}`).join(' + ');
  return `${ingredients} → ${processed.displayName}×${recipe.outputQuantity}`;
}

function formatExtraSources(item) {
  return item.extraSources
    .map(source => `${source.displayName || source.canonical}（概率）`)
    .join('；');
}

function build(root = process.env.WARFRAME_CONTENT_ROOT || path.resolve(__dirname, '../../warframe-content')) {
  const core = createKnowledgeCore({ approvedOnly: false });
  const items = core.listMining();
  const lines = [
    '---',
    'title: 三系平原矿物与加工索引',
    'aliases: [挖矿, 矿物, 宝石, 炎晶合金, 矿物获取]',
    'domain: resources',
    'generatedFrom: warframe-knowledge-core/mining',
    '---',
    '',
    '# 三系平原矿物与加工索引',
    '',
    '本页供挖矿、矿物、宝石和合金获取问题检索。矿物行包含平原、矿脉颜色、额外来源和加工配方；回答具体合金时先确认其原矿。',
    ''
  ];

  for (const region of REGION_ORDER) {
    lines.push(`## ${region}`, '');
    for (const [type, typeName] of TYPE_ORDER) {
      lines.push(`### ${typeName}`, '');
      for (const item of items
        .filter(value => value.regionName === region && value.type === type)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN'))) {
        lines.push(
          `#### ${item.displayName}（${item.canonical}）`,
          `- 位置：${item.regionName}，${item.typeName}`,
          `- 稀有度：${item.rarity}`,
          `- 额外来源：${formatExtraSources(item) || '无'}`,
          `- 可加工为：${item.processed ? `${item.processed.displayName}（${item.processed.canonical}）；配方：${formatRecipe(item.processed)}` : '无'}`,
          ''
        );
      }
    }
  }

  const output = path.join(root, 'source', 'resources', 'open-world', 'mining.generated.md');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');
  return { output, items: items.length };
}

if (require.main === module) console.log(JSON.stringify(build(), null, 2));
module.exports = { build, formatRecipe };
