# Warframe Knowledge Core

> [!IMPORTANT]
> ## 上游 Mod 数据更新后必须执行
>
> ```powershell
> npm run maintain
> ```
>
> 该命令会依次同步全量 Mod 空壳、重建 `official.json`、校验、测试并构建。  
> 只想检查仓库是否遗漏同步时执行 `npm run check:all`。  
> **禁止只更新 `warframe-items` 后直接提交，否则 Mod 空壳和官方覆盖状态会过期。**

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
console.log(core.parseCategoryCommand('/分类 4k卡'));
console.log(core.getCategoryDetail('4k卡'));
console.log(core.getOfficialMod('Narrow Minded'));
console.log(core.listMissingOfficialMods({ categoryId: 'trait.corrupted' }));
```

## 维护流程

1. 在 `facts/` 或 `knowledge/` 新建/修改 JSON 条目。
2. 人工新增内容默认设为 `approved` 并直接进入生产构建，同时必须保留来源和维护者信息。
3. `npm run sync:mods` 生成的未补刷法 Mod 空壳固定为 `draft` + `acquisitionStatus: stub`，不会进入生产构建。
4. 上游 Mod 数据变化时先执行 `npm run sync:mods`，再执行 `npm run sync:official`；平时可分别用 `npm run check:mods` 和 `npm run check:official` 检查漂移。
5. 执行 `npm run validate && npm test && npm run build`。
6. 合并 PR 后发布构建产物。

## 官方 Mod 目录

`categories/official.json` 固定记录当前 `warframe-items` 版本的全部 1733 个 Mod。每条记录以 `uniqueName` 为稳定主键，包含官方英文名、官方简中名可用状态、类型、适用对象、稀有度、极性、最高等级、满级中英文效果、Wiki 链接、官方分类标签和本地覆盖状态。

官方分类由 `type`、`compatName`、官方布尔属性及系列字段生成；现有 `categories/<id>.json` 仍负责本地中文解释和检索。两者不会混进同一个加载数组。`npm run build` 会把快照单独发布为 `dist/official.json`，并在 manifest 中记录数量、缺失覆盖和 SHA-256。

覆盖状态完全由本地分类和 `knowledge/acquisition/` 自动计算：

- `covered`：已关联至少一个具有完整刷法的本地词条。
- `stub`：已有名称、效果和分类 JSON，但刷法尚未补完。
- `missing`：官方已有，但本地尚未建立对应内容。

维护工具或 Skill 应调用 `listMissingOfficialMods()`、`listMissingOfficialCategories()` 获取待处理项，再创建默认 `approved` 的普通分类或刷取内容。不得直接编辑 `official.json`，也不得把生成快照当成本地中文解释；无法确认的数据应显式降为 `review`。

## 刷取模块

刷取模块只负责明确的命令句式，不进行开放式自然语言意图推断：

- `/刷` 或 `/刷 <名称>`
- `刷 <名称>`（`刷`后必须有空格）
- `怎么刷<名称>` 或 `怎么刷 <名称>`

`我想刷电妹`、`哪里刷电妹`、`如何刷电妹`、`刷电妹`不会触发。命令路由先调用 `parseAcquisitionCommand()`，再由 `getAcquisition()` 复用与 `/买` 相同的统一名称解析器；解析得到 canonical 后，仅按 `subject.canonical` 精确关联刷取文件。刷取文件不定义 `aliases`。

`getAcquisition()` 优先返回精确匹配的单物品；单物品未命中时会尝试已定义的泛类集合（例如“跑酷mod”“跑酷卡”）。返回结果中的 `entry` 与 `collection` 二选一：单物品结果提供 `entry`，集合结果提供 `collection`、动态筛选出的 `entries`，以及按首次出现顺序去重聚合的 `methods` / `sourceOptions`。调用方也可直接使用 `getAcquisitionCollection()` 查询集合。集合标题、说明、成员名和来源均为中文玩家输出。

刷取词条需要额外提供 `module`、`subject`、`prerequisites` 和 `methodRefs`。`subject.category` 保存基础类型，`subject.categoryRefs` 可引用多个 `categories/<id>.json` 细分类。目录只表达主要维护归档，例如所有堕落 Mod 放在 `knowledge/acquisition/mod/4kmod/`；目录不会限制分类。一张提供精准度的堕落 Mod 可同时引用 `4kmod`、`accuracy4kmod` 和通用 `accuracymod`，分别表达“堕落 Mod”“精准堕落 Mod”“精准 Mod”。Mod 刷取条目必须用 `maxRank` 配合结构化 `effects` 或完整 `effectDetails` 保存官方满级效果。自动生成的普通、Prime 与残缺 Mod 空壳分别归档到 `standardmod/`、`primemod/` 与 `flawedmod/`，再按装备类型分层。空壳的 `methodRefs` 允许为空；补齐刷法并审核后才能改为完整状态。分类可独立保存 `aliases`，供 `/分类` 使用，但不会进入物品名称索引。完整词条的 `methodRefs` 只保存 `gameplay.*` ID，调用 `getAcquisition()` 时自动展开对应玩法。

玩法可使用严格指令 `/玩法 <玩法名称>`；若玩法定义了 `acquisitionQuery`，还可通过明确刷取命令打开，例如 `刷 4k`。具体物品可省略重复的 `summary` 和 `content`，改由第一项主分类的 `modDescription` 模板统一生成描述；模板必须包含 `{name}`，共享核心会替换为物品展示名。具体物品回复只显示生成后的来源结论和结构化效果，不展开 `prerequisites`、玩法步骤、注意事项或来源链接。`getGameplay()` 返回与刷取引用相同的 `steps` 和 `notes`，确保详细流程只维护一份。

分类命令支持 `/分类 <分类名称>` 和 `分类 <分类名称>`，不响应没有空格的 `分类xxx`。分类名称通过分类自身的 `id`、`canonical`、`displayName` 和 `aliases` 精确解析；`getCategoryDetail()` 会同时返回分类说明和所有直接引用该分类的已收录刷取对象。

目录示例：

- `knowledge/acquisition/mod/4kmod/narrow-minded.json`
- `categories/4kmod.json`
- `categories/duration4kmod.json`
- `categories/durationmod.json`
- `knowledge/gameplay/deimos-orokin-vault.json`

详见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [REVIEWING.md](REVIEWING.md)。
