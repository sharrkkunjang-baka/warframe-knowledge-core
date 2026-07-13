# 贡献指南

> [!CAUTION]
> 更新 `warframe-items`、Mod 分类或生成空壳后必须执行 `npm run maintain`。普通改动至少执行 `npm run check:all`。不要手改 `categories/official.json`、`generated/*.json` 或 `dist/`。

字段和 API 的正式定义见 [REFERENCE.md](REFERENCE.md)，架构与来源优先级见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 目录与所有权

- `facts/`：带可靠来源的基础事实。
- `knowledge/acquisition/<基础类别>/<来源或系列>/`：一个刷取对象一个 JSON。
- `knowledge/gameplay/`：一个可复用玩法一个 JSON。
- `categories/`：一个人工语义分类一个 JSON；`official.json` 除外，它由脚本生成。
- `entities/locations.json`、`vendors.json`、`currencies.json`：稳定实体 registry。
- `generated/`：脚本生成的 ItemCatalog、来源、战甲、任务和遗物数据。
- `schema/`：数据约束；新增公共字段时同步更新 schema 与 REFERENCE。
- `src/`：公共运行时代码。
- `test/`：名称、引用、DTO 和降级行为回归。

不得提交 API 密钥、账号绑定、用户日志、代理凭据、运行缓存、实时价格或 Wiki SQLite 数据库。

## 通用条目规则

- `id` 必须全仓唯一；一个 JSON 可包含同主题多个条目，但 acquisition/gameplay 仍要求一个对象一个文件。
- 基础事实优先使用官方导出、官方 Wiki、官方语言文件和 Digital Extremes 公告。
- 社区经验必须明确标记为经验或建议。
- 新增确定内容使用 `reviewStatus: "approved"`；来源或结论无法确认时使用 `review`。
- 修改别名时增加回归测试；歧义宁可返回候选，不强行命中。
- 持久引用必须使用稳定 ID：物品用 `uniqueName`，实体用 registry `id`，玩法用 `gameplay.*`，分类用 category `id`。

## official-items 与实体

`generated/official-items.json` 由 `npm run sync:items` 从锁定版本 `warframe-items` 生成。不要手工添加 item、drop、recipe 或 ingredient。上游缺失数据应保留为空或待证据状态，不能按经验补写。

若确需新增配方变体适配，应同时满足：

1. 变体 ID 稳定，aliases 只描述对象名称/数量，不包含命令词。
2. `recipeId` 只引用同一 item 已存在 recipe；没有证据使用 null。
3. 明确 `evidenceStatus`；待 Wiki 核验时设置 `pendingWikiEvidence` 和 `note`。
4. 增加解析与 `getItemAcquisition()` 回归测试。

实体 registry 的 `canonical/displayName/aliases` 用于查找，`id` 才是外键。Location 的 `parentId`、Vendor 的 `locationId`、AcquisitionEvidence 的实体引用必须指向已有 ID。删除或改 ID 前要全仓检查引用。

## 提交刷取攻略

刷取攻略设置 `module: "acquisition"`，必须包含：

- `subject.canonical`：与统一名称索引关联的规范名。
- `subject.displayName`：中文展示名。
- `subject.category`：`frame|weapon|mod|resource|companion|other`。
- `subject.categoryRefs`：对象实际所属的所有细分类 ID；第一项作为主描述模板分类。
- `prerequisites`：无前置时为空数组。
- `methodRefs`：`gameplay.*` ID 数组；生成 stub 可以为空。
- `summary` 或 `content`；也可由第一主分类的 `modDescription` 模板生成。

刷取对象禁止定义物品 aliases；正式名、官方中文名和社区名由统一名称索引维护。目录只负责维护归档，不代表唯一分类。

Mod 完整条目应提供 `maxRank` 和结构化 `effects`，每项包含稳定 `stat`、中文 `displayName`、数值 `value` 和 `unit`。生成的未补刷法 Mod 保持 `draft` + `acquisitionStatus: stub`；补齐来源并审核后才能改为 complete/approved。

示例引用：

```json
{
  "module": "acquisition",
  "subject": {
    "canonical": "Narrow Minded",
    "displayName": "心智偏狭",
    "category": "mod",
    "categoryRefs": ["4kmod", "duration4kmod"]
  },
  "prerequisites": [],
  "methodRefs": ["gameplay.deimos-orokin-vault"]
}
```

## 提交玩法

玩法放入 `knowledge/gameplay/`，设置 `module: "gameplay"`，并提供 `aliases`、`summary`、`content`、`steps`、`notes`。ID 使用 `gameplay.<slug>`。可选 `acquisitionQuery` 允许明确的“刷 <值>”命令打开玩法。

`methodRefs` 展开时，条目显式引用优先；只有显式数组为空才继承分类 `defaultMethodRefs`。删除或改名玩法前必须更新全部引用，校验器会拒绝悬空 ID。

命令词不写入知识 aliases；`/刷`、`怎么刷`、`/玩法`、`/分类` 由调用端解析。

## 维护官方 Mod 与战甲生成数据

- `npm run sync:mods`：同步 acquisition Mod 空壳。
- `npm run sync:official`：重建 `categories/official.json`。
- `npm run sync:items`：重建 ItemCatalog 与来源元数据。
- `npm run sync:frames`：联网重建战甲、任务、Prime 遗物和导出缓存。
- 对应 `check:*` 只检查漂移；`sync:frames --check` 仍会访问上游。

不要把人工中文解释写进生成快照。战甲来源若上游确实无法表达，只能在 `frame-acquisition.js` 的显式审计覆盖中维护，并补测试和来源说明。

## 提交前检查

```powershell
npm run check:all
npm run validate
npm test
npm run build
```

文档改动至少检查：

```powershell
rg "当前完成度|[0-9]+/[0-9]+ 通过|全部 [0-9]+ 条|完整 [0-9]+ 个" *.md
```

结果应为空；不要在正式文档中固化会随生成数据变化的完成度数字。
