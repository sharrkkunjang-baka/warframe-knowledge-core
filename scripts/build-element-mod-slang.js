'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { buildElementModSlangIndex } = require('../src/element-mod-slang');
const ROOT = path.resolve(__dirname, '..');
const catalog = require('../knowledge/categories/official.json');
const reviewed = require('../knowledge/relations/element-mod-slang-overrides.json');
const output = path.join(ROOT, 'generated', 'element-mod-slang.json');
const markdown = path.join(ROOT, 'generated', 'element-mod-slang-audit.md');
const index = buildElementModSlangIndex(catalog.mods, reviewed);
const json = `${JSON.stringify(index, null, 2)}\n`;
const rows = index.audit.map(item => `| ${item.category} | ${item.kind === 'gold' ? '金' : '银'}${item.elementName} | ${item.status} | ${item.candidates.map(candidate => `${candidate.displayName}（${candidate.canonical}）`).join('、') || '—'} |`).join('\n');
const functions = index.manual.map(item => `| ${item.aliases?.join('、') || '—'} | ${item.status} | ${item.displayName || '—'}（${item.canonical || '—'}） |`).join('\n');
const md = `# 元素 Mod 黑话全量审计\n\n目录：${index.catalogCount} 个官方 Mod。金卡=元素伤害+触发双属性；银卡=单元素伤害，并在同族已发布 Prime 时优先 Prime。\n\n| 类别 | 黑话 | 状态 | 官方简中（英文） |\n|---|---|---|---|\n${rows}\n\n## 功能型审核别名\n\n| 别名 | 状态 | 官方简中（英文） |\n|---|---|---|\n${functions}\n`;
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== json || !fs.existsSync(markdown) || fs.readFileSync(markdown, 'utf8') !== md) throw new Error('元素 Mod 黑话索引漂移，请运行 npm run sync:element-mod-slang');
  console.log(`元素 Mod 黑话索引无漂移：${index.counts.resolved} resolved / ${index.counts.missing} missing / ${index.counts.ambiguous} ambiguous`);
} else {
  fs.writeFileSync(output, json); fs.writeFileSync(markdown, md);
  console.log(`已生成元素 Mod 黑话索引：${index.counts.resolved} resolved / ${index.counts.missing} missing / ${index.counts.ambiguous} ambiguous`);
}
