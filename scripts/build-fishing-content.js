'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createKnowledgeCore } = require('../src');
function build(root = process.env.WARFRAME_CONTENT_ROOT || path.resolve(__dirname, '../../warframe-content')) {
  const fish = createKnowledgeCore({ approvedOnly: false }).listFishing();
  const lines = ['---', 'title: 三系平原钓鱼与鱼类分解索引', 'aliases: [钓鱼, 鱼类, 捕鱼, 鱼油, 鱼材料]', 'domain: resources', 'generatedFrom: warframe-knowledge-core/fishing', '---', '', '# 三系平原钓鱼与鱼类分解索引', '', '本页供刷取查询和 Terra 内容检索使用。精确命令可输入“钓鱼 鱼名”或“钓鱼 材料名”。', ''];
  lines.push('## 获取与分解流程', '', '- 夜灵平野鱼：前往地球的希图斯，在夜灵平野钓鱼；回到希图斯找渔人海露（Fisher Hai-Luk），选择“切鱼”分解。鱼油、鱼肉、鱼鳞都由这里的鱼分解获得。', '- 鱼油：最省事是捕捉夜灵平野常见鱼，再到希图斯找渔人海露切鱼；不同鱼和大小给出的鱼油数量不同，具体见下表与“鱼材料反查”。', '- 奥布山谷伺服鱼：前往金星福尔图娜外的奥布山谷钓鱼，回福尔图娜找生意人（The Business）拆解。', '- 魔胎之境鱼：前往火卫二魔胎之境钓鱼，回殁世幽都找女儿（Daughter）分解。', '');
  for (const region of ['夜灵平野', '奥布山谷', '魔胎之境']) {
    lines.push(`## ${region}`, '', '| 鱼类 | 天气/时间/主宰期 | 刷新区域 | 鱼饵 | 有效鱼叉 | 分解产物（低/中/高品质） |', '|---|---|---|---|---|---|');
    for (const item of fish.filter(value => value.regionName === region)) {
      const bait = item.bait?.status === 'not-required' ? '无需' : item.bait?.displayName || item.bait?.canonical || '待补';
      const outputs = item.processingOutputs.map(output => `${output.displayName} ${output.quantities.map(row => `${row.quality}×${row.quantity}`).join('/')}`).join('；') || '待补';
      lines.push(`| ${item.displayName}（${item.canonical}） | ${item.activity} | ${item.biome} | ${bait} | ${item.effectiveSpears?.displayNames?.join('、') || '任意'} | ${outputs} |`);
    }
    lines.push('');
  }
  const materials = new Map();
  for (const item of fish) for (const output of item.processingOutputs) {
    const sources = materials.get(output.displayName) || [];
    sources.push(`${item.displayName}（${output.quantities.map(row => `${row.quality}×${row.quantity}`).join('/')}）`);
    materials.set(output.displayName, sources);
  }
  lines.push('## 鱼材料反查', '');
  for (const [material, sources] of [...materials].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))) lines.push(`### ${material}`, '', ...sources.map(source => `- ${source}`), '');
  const output = path.join(root, 'source', 'resources', 'open-world', 'fishing.generated.md');
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');
  return { output, fish: fish.length, materials: materials.size };
}
if (require.main === module) console.log(JSON.stringify(build(), null, 2));
module.exports = { build };
