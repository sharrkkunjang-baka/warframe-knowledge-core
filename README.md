# Warframe Knowledge Core

面向中文玩家和开发者的可审核 Warframe 共享知识核心。目标是“一套数据、一套解析、多端复用”：QQ Bot、网页、Discord Bot 和 Agent 均可消费同一构建产物。

## 数据分层

- `facts/`：官方译名、机制事实、必要摘录与来源链接。
- `knowledge/`：萌新答疑、社区黑话、攻略和二次加工结论。
- `knowledge/acquisition/<类别>/<对象>.json`：结构化刷取对象；一个对象一个文件。
- `knowledge/gameplay/<玩法>.json`：可被多个刷取对象复用的玩法步骤与注意事项；一个玩法一个文件。
- `categories/official.json`：由上游数据生成的完整官方 Mod 快照，不是普通分类文件，禁止手改。
- `dist/`：仅包含通过人工审核的发布数据，由 `npm run build` 生成。

动态价格、赏金、裂缝和世界状态不会固化进仓库，应由消费端实时请求 API。

## 使用

```js
const { createKnowledgeCore } = require('warframe-knowledge-core');
const core = createKnowledgeCore();
console.log(core.resolveName('心智狭'));
console.log(core.searchKnowledge('九重天'));
console.log(core.parseAcquisitionCommand('/刷 电妹'));
console.log(core.getAcquisition('电妹')); 
console.log(core.getOfficialMod('Narrow Minded'));
console.log(core.listMissingOfficialMods({ categoryId: 'trait.corrupted' }));
```

## 维护流程

1. 在 `facts/` 或 `knowledge/` 新建/修改 JSON 条目。
2. Agent 或人工均可提交草稿，但必须保留来源并设为 `draft` 或 `review`。
3. 人工确认准确后改为 `approved`，并填写 `reviewedBy`。
4. 上游 Mod 数据变化时执行 `npm run sync:official`，平时可用 `npm run check:official` 检查漂移。
5. 执行 `npm run validate && npm test && npm run build`。
6. 合并 PR 后发布构建产物。

## 官方 Mod 目录

`categories/official.json` 固定记录当前 `warframe-items` 版本的全部 1733 个 Mod。每条记录以 `uniqueName` 为稳定主键，包含官方英文名、官方简中名可用状态、类型、适用对象、稀有度、极性、最高等级、满级中英文效果、Wiki 链接、官方分类标签和本地覆盖状态。

官方分类由 `type`、`compatName`、官方布尔属性及系列字段生成；现有 `categories/<id>.json` 仍负责本地中文解释和检索。两者不会混进同一个加载数组。`npm run build` 会把快照单独发布为 `dist/official.json`，并在 manifest 中记录数量、缺失覆盖和 SHA-256。

覆盖状态完全由本地分类和 `knowledge/acquisition/` 自动计算：

- `covered`：已关联至少一个本地分类或刷取词条。
- `missing`：官方已有，但本地尚未建立对应内容。

维护工具或 Skill 应调用 `listMissingOfficialMods()`、`listMissingOfficialCategories()` 获取待处理项，再创建普通分类或 `review` 刷取草稿。不得直接编辑 `official.json`，不得自动批准内容，也不得把生成快照当成本地中文解释。

## 刷取模块

刷取模块只负责明确的命令句式，不进行开放式自然语言意图推断：

- `/刷` 或 `/刷 <名称>`
- `刷 <名称>`（`刷`后必须有空格）
- `怎么刷<名称>` 或 `怎么刷 <名称>`

`我想刷电妹`、`哪里刷电妹`、`如何刷电妹`、`刷电妹`不会触发。命令路由先调用 `parseAcquisitionCommand()`，再由 `getAcquisition()` 复用与 `/买` 相同的统一名称解析器；解析得到 canonical 后，仅按 `subject.canonical` 精确关联刷取文件。刷取文件不定义 `aliases`。

刷取词条需要额外提供 `module`、`subject`、`summary`、`prerequisites` 和 `methodRefs`。`subject.category` 保存基础类型，`subject.categoryRefs` 可引用多个 `categories/<id>.json` 细分类。目录只表达主要维护归档，例如所有堕落 Mod 放在 `knowledge/acquisition/mod/4kmod/`；目录不会限制分类。一张提供精准度的堕落 Mod 可同时引用 `4kmod`、`accuracy4kmod` 和通用 `accuracymod`，分别表达“堕落 Mod”“精准堕落 Mod”“精准 Mod”。这样 Exilus + Set Mod 等交叉分类也可同时表达，分类还可继续嵌套。Mod 刷取条目还必须用 `maxRank` 和 `effects` 保存官方满级效果，不能只写在描述文本中。`4kmod` 的官方依据为英文 Wiki 的 `Corrupted Mods`。分类可独立保存 `aliases`，供未来 `/分类 4k卡`、`/分类 精准卡` 等入口使用，但不会进入 `/买` 或 `/刷` 的物品名称索引。`methodRefs` 只保存 `gameplay.*` ID，调用 `getAcquisition()` 时自动展开对应玩法。

玩法可使用严格指令 `/玩法 <玩法名称>`；若玩法定义了 `acquisitionQuery`，还可通过明确刷取命令打开，例如 `刷 4k`。具体物品可省略重复的 `summary` 和 `content`，改由第一项主分类的 `modDescription` 模板统一生成描述；模板必须包含 `{name}`，共享核心会替换为物品展示名。具体物品回复只显示生成后的来源结论和结构化效果，不展开 `prerequisites`、玩法步骤、注意事项或来源链接。`getGameplay()` 返回与刷取引用相同的 `steps` 和 `notes`，确保详细流程只维护一份。

目录示例：

- `knowledge/acquisition/mod/4kmod/narrow-minded.json`
- `categories/4kmod.json`
- `categories/duration4kmod.json`
- `categories/durationmod.json`
- `knowledge/gameplay/deimos-orokin-vault.json`

详见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [REVIEWING.md](REVIEWING.md)。
