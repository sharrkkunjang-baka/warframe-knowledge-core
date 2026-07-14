# Warframe Knowledge Core

面向中文玩家和开发者的可审核 Warframe 共享知识核心。当前公共模型统一了 ItemCatalog、获取证据/结果、实体 registry、Mod 与战甲兼容查询，供 QQ Bot、网页、Discord Bot 和 Agent 复用。

> [!IMPORTANT]
> 更新 `warframe-items` 或上游数据后执行 `npm run maintain`；只检查漂移执行 `npm run check:all`。不要手改生成文件。

## 目录

- `knowledge/facts/`：基础事实、来源和名称映射。
- `knowledge/acquisition/`：结构化刷取对象，一个对象一个文件。
- `knowledge/gameplay/`：可被多个刷取对象引用的玩法。
- `knowledge/categories/`：人工语义分类；`official.json` 是生成的官方 Mod 快照。
- `knowledge/entities/`：locations、vendors、currencies、quests 稳定实体 registry。
- `knowledge/generated/`：统一 official-items、战甲、任务、遗物和节点等可查询生成数据。
- `generated/`：生成过程的来源元数据与维护报告，不作为查询文本数据。
- `schema/`：知识、实体和官方目录 schema。
- `src/`：加载、解析、获取 DTO、实体 registry 和战甲适配。
- `scripts/`：同步、校验和构建脚本。
- `dist/`：approved 发布数据及 manifest。
- `test/`：公共行为回归测试。

动态价格、赏金、裂缝和世界状态不固化进仓库，由消费端实时请求。QQ Bot 的 Wiki SQLite 是独立派生证据库，不包含在 npm 发布数据中。

## 使用

```js
const { createKnowledgeCore } = require('warframe-knowledge-core');
const core = createKnowledgeCore();

const resolved = core.resolveItem('破解器');
const acquisition = core.getItemAcquisition('破解器');
const location = core.getLocation('希图斯');

console.log(resolved?.kind, acquisition.status, location?.id);
```

兼容 Mod 与刷取知识：

```js
const mod = core.getOfficialMod('Narrow Minded');
const guide = core.getAcquisition('心智偏狭');
const missing = core.listMissingOfficialMods({ categoryId: 'trait.corrupted' });

console.log(mod?.uniqueName, guide?.methods, missing.length);
```

构造跨端稳定返回：

```js
const evidence = core.createAcquisitionEvidence({
  type: 'vendor',
  source: '商店',
  vendorId: 'vendor.market',
  currencyId: 'currency.credits'
});

const result = core.createAcquisitionResult({
  query: '示例物品',
  evidence: [evidence],
  status: 'resolved'
});

const rendered = core.createRenderResult({ text: '获取信息', acquisition: result });
```

`AcquisitionEvidence`、`AcquisitionResult` 和 `RenderResult` 会递归冻结。实体外键必须使用 registry ID；官方物品使用 `/Lotus/...` `uniqueName`；`methodRefs` 只引用 `gameplay.*` ID。

## 数据与降级

物品解析顺序为 ItemCatalog 精确匹配、官方 Mod、战甲、ItemCatalog 唯一模糊候选。详细获取数据缺失时保留明确状态或说明，不推测配方。战甲导出优先新鲜缓存和网络，网络失败后可回退旧缓存；Wiki 证据由 QQ Bot 的 SQLite/FTS 补充，不会静默覆盖核心结构化数据。

## Warframe 战斗模拟 MCP

MCP 使用 stdio，直接接入本知识库并自动解析中英文 Mod 满级词条：

```json
{
  "command": "node",
  "args": ["D:/Minecraft/warframe-knowledge-core/src/mcp-server.js"]
}
```

启动：

```powershell
npm run mcp
```

工具：

- `resolve_mod_effects`：解析 Mod 名称、结构化满级词条、来源与不支持警告。
- `calculate_torid_incarnon_stats`：计算托里德灵化面板和各乘区。
- `simulate_torid_incarnon`：从 0 层异常、0 层主要·霜冻和 20% 射线升温开始逐 Tick 模拟。

动态击杀层必须由调用方显式传入；无法完整解析的 Mod 会拒绝实战模拟，不会猜值。

## 维护

```powershell
npm run check:all
npm run validate
npm test
npm run build
```

完整上游同步：

```powershell
npm run maintain
```

生成的 Mod 空壳保持 `draft` + `acquisitionStatus: stub`，不会进入默认生产搜索。来源或结论无法确认时使用 `review`，不要伪造确定值。

## 文档

- [ARCHITECTURE.md](ARCHITECTURE.md)：数据流、统一模型、来源优先级和降级策略。
- [REFERENCE.md](REFERENCE.md)：所有公共字段、API、脚本、环境变量和 Wiki 爬虫契约。
- [CONTRIBUTING.md](CONTRIBUTING.md)：数据维护和提交约束。
- [REVIEWING.md](REVIEWING.md)：审核流程。
