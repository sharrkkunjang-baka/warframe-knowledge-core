# Warframe 共享知识核心架构

当前目标是“一套数据、一套解析、多端复用”。知识数据、公共接口和名称解析入口已经统一：QQ Bot 的 Market、Wiki、赏金与紫卡都通过共享核心的 `resolveName()` 解析名称；实时数据仍由各业务模块按需获取。

## 总体分层

```mermaid
flowchart LR
  Sources["来源与动态数据\n官方 Wiki / 语言文件 / Market / Worldstate"]
  Data["审核数据层\nfacts / knowledge / aliases"]
  Core["共享核心\n名称解析 / 术语归一化 / 知识检索"]
  API["稳定接口\nresolveName / searchFacts / searchKnowledge / getAcquisition / buildWikiContext"]
  Consumers["消费端\nQQ Bot / Web / Discord / Agent"]

  Sources -->|"结构化、翻译、人工加工"| Data
  Data -->|"仅加载 approved"| Core
  Core --> API
  API --> Consumers
  Sources -.->|"价格与轮换实时查询"| Consumers
```

核心边界：静态事实和二次知识进入 GitHub；挂单、价格、赏金、裂缝和轮换不固化到仓库，由消费端实时请求。

## QQ Bot 当前查询链路

```mermaid
flowchart TD
  User[用户消息]
  Router[命令与意图路由]
  Shared[共享知识核心]
  Direct[固定知识直接输出]
  LocalWiki[本地 Wiki SQLite / FTS]
  OnlineWiki[在线 Warframe Wiki]
  Context[有来源的回答上下文]
  LLM[LLM 基于资料回答]
  Legacy[旧固定资料兼容回退]

  User --> Router
  Router --> Shared
  Shared -->|精确词条| Direct
  Shared -->|共享核心不可用| Legacy
  Shared -->|未命中或需详细正文| LocalWiki
  LocalWiki -->|未命中| OnlineWiki
  LocalWiki -->|命中| Context
  OnlineWiki --> Context
  Context --> LLM
```

Bot 接入点位于 `qq-bot/bot.js` 的 `wfSharedCore` 与 `matchWarframeReference()`。共享核心加载失败时会回退旧资料，避免线上功能中断。

## 名称解析链路

```mermaid
flowchart TD
  Query[用户输入]
  Normalize[NFKC、大小写、空格与间隔符归一化]
  Exact[精确正式名与社区别名]
  Pinyin[加权拼音评分]
  Unique{最佳候选分差足够吗}
  Result[返回唯一 canonical 名称]
  Ambiguous[返回歧义候选]
  Miss[不命中]

  Query --> Normalize
  Normalize --> Exact
  Exact -->|命中| Result
  Exact -->|未命中| Pinyin
  Pinyin --> Unique
  Unique -->|是| Result
  Unique -->|否且有多个候选| Ambiguous
  Pinyin -->|低于阈值| Miss
```

本地完整版加权维度包括：最长公共子序列、查询覆盖率、候选覆盖率、开头连续匹配、最长连续片段、缺失音节惩罚和额外音节惩罚。

## 数据所有权

| 资产 | 内容 | 维护方式 | 性质 |
|---|---|---|---|
| `facts/` | 官方译名、机制事实、必要摘录 | GitHub PR + 人工审核 | 静态 |
| `knowledge/` | 萌新答疑、黑话、攻略、评级 | GitHub PR + 人工审核 | 静态 |
| `knowledge/acquisition/<类别>/<对象>.json` | 一个对象一文件，保存刷取前置与玩法引用 | GitHub PR + 人工审核 | 静态 |
| `knowledge/gameplay/<玩法>.json` | 一个玩法一文件，保存可复用步骤与注意事项 | GitHub PR + 人工审核 | 静态 |
| `facts/aliases.json` | 战甲别称、固定映射、术语修正 | 回归测试保护 | 静态 |
| Market / Worldstate | 挂单、价格、裂缝、赏金轮换 | 消费端实时 API | 动态 |
| Wiki SQLite | 页面和章节全文索引 | 同步器构建、Release 发布 | 派生 |
| Bot 配置与缓存 | 密钥、QQ 绑定、群号、运行状态 | 仅部署环境 | 私有 |

## 审核与发布流水线

```mermaid
flowchart LR
  Entry["新增内容\n默认 approved"]
  Validate["自动校验\nSchema / ID / 来源 / 敏感信息"]
  Review["疑问内容\n显式 review"]
  Human["人工复核"]
  Approved["approved 词条"]
  Build["构建 dist + manifest"]
  Release["GitHub Release / 固定版本"]
  Clients["Bot 与其他客户端"]

  Entry --> Validate
  Validate --> Approved
  Review --> Human --> Approved
  Approved --> Build
  Build --> Release
  Release --> Clients
```

CI 流程：`npm ci` → `npm run validate` → `npm test` → `npm run build`。

## 当前完成度

- 基础事实：3 条（已批准）。
- 加工知识：全部 35 条已批准，包含 26 条刷取对象和 3 条共享玩法。
- 本地回归测试：18/18 通过。
- QQ Bot：Market、Wiki、赏金和紫卡已统一接入 `resolveWarframeName()` → 共享核心 `resolveName()`。
- GitHub：公开仓库、Schema、CI 和 Release 工作流已建立。
- 动态 API：继续由 Bot 实时请求，没有写入知识库。
- 刷取模块：递归读取分类目录，一个对象一个文件；名称完全复用 `/买` 的统一索引，通过 `subject.canonical` 精确关联，并自动展开 `methodRefs`。
- 玩法模块：已增加严格的 `/玩法` 路由、`searchGameplay()` 和 `getGameplay()`；刷取与玩法命令共用同一份步骤和注意事项。

## 刷取命令链路

```mermaid
flowchart TD
  Message[用户消息]
  Command{是否严格匹配刷取命令}
  Usage[返回用法]
  Resolve[统一 resolveName]
  Acquisition[查询 acquisition 加工知识]
  Direct[结构化直出]
  Miss[提示尚未收录并引导 Wiki]
  Normal[继续普通聊天流程]

  Message --> Command
  Command -->|/刷 且无参数| Usage
  Command -->|/刷 名称、刷 空格 名称、怎么刷名称| Resolve
  Command -->|我想刷、哪里刷、如何刷等| Normal
  Resolve --> Acquisition
  Acquisition -->|命中 approved| Expand[按 methodRefs 展开 approved 玩法]
  Expand --> Direct
  Acquisition -->|未命中| Miss
```

这里是命令解析，不是开放式意图分类。刷取只接受 `/刷`、`/刷 xxx`、`刷 xxx`、`怎么刷xxx` 和 `怎么刷 xxx`；玩法只接受 `/玩法` 和 `/玩法 xxx`。普通对话不会被抢占。

## 刷取对象与玩法复用

```mermaid
flowchart LR
  ItemA[心智偏狭刷取\ncategory: mod\ncategoryRefs: 4kmod]
  ItemB[盲怒刷取\ncategory: mod\ncategoryRefs: 4kmod]
  Category[4kmod 分类\nCorrupted Mods\nparent: mod]
  SubCategory[duration4kmod\n持续 4k Mod\nparent: 4kmod]
  RefA[methodRefs]
  Gameplay[火卫二 Orokin 宝库玩法\nsteps + notes]
  GameplayCommand[/玩法 火卫二 Orokin 宝库]
  AcquisitionCommand[/刷 心智偏狭]

  ItemA --> Category
  ItemA --> SubCategory --> Category
  ItemB --> Category
  ItemA --> RefA --> Gameplay
  ItemB --> RefA
  GameplayCommand --> Gameplay
  AcquisitionCommand --> ItemA
```

刷取对象只说明“刷什么、基础类型和多个细分类、前置是什么、引用哪些玩法”；玩法独立说明“具体怎么做”。细分类也采用一个文件一个对象，并允许形成层级，例如 `duration4kmod → 4kmod → mod`。Mod 对象额外保存结构化 `maxRank` 与 `effects`，便于各端统一展示官方满级数值。多个对象可引用同一分类和同一玩法，校验器会阻止悬空引用。

别名所有权也严格分离：刷取对象不保存 `aliases`，由 `/买` 共用的官方词典与社区名称索引解析到 `subject.canonical`；分类自行维护仅供分类查询使用的 `aliases`（如 `4k卡`），玩法也自行维护玩法别名。分类和玩法别名均不会进入物品名称索引。

## 当前风险

### 1. 历史解析代码尚待物理清理

运行时名称解析已经收口到共享核心。`bot.js` 中仍保留一段不可达的旧 WFM 评分实现，作为本次迁移后的短期对照；它不会参与运行，待线上回归稳定后可以直接删除。翻译输出表与实时 API 适配属于业务展示和数据获取，不再承担名称消歧。

### 2. 本地与 GitHub 版本可能漂移

Bot 当前使用部署目录中的复制版本，而不是锁定 Git tag、Release 或 npm 版本。手动复制会造成“本地完整版、GitHub 版、VPS 版”出现差异。

### 3. 疑问内容需要显式降级

知识默认批准上线；来源缺失、译名冲突或结论无法确认时，维护者必须主动把条目改为 `review`，避免不确定内容混入生产输出。

### 4. 事实时效需要更精确

`gameVersion: current` 方便但不可审计。高风险机制应保存明确版本、上游页面 revision 和最后验证日期。

## 后续优先级

### P0：建立唯一发布版本

- GitHub 成为唯一可信源码。
- Bot 锁定 Git tag、Release 或包版本。
- 部署时校验 `manifest.json` 和 SHA-256。
- 禁止继续手动复制未经标记的核心目录。

### P1：清理迁移遗留并扩大回归集

- 删除 `bot.js` 中已经不可达的旧 WFM 评分实现。
- 继续把仅用于翻译展示的映射与名称解析数据明确分离。
- 将所有历史错误查询加入共享回归测试。

### P2：Wiki 大索引产品化

- 同步器在受控环境生成 SQLite/JSONL。
- 作为 GitHub Release 派生产物发布，不进入 Git 历史。
- 消费端按版本下载，并在同步失败时继续使用旧索引。

## 总评

方向正确：事实与加工知识分层、人工审核、动态 API 隔离和统一解析入口都已落地。刷取攻略作为加工知识的结构化子模块扩展，不另造名称体系；命令解析与知识内容也保持分离。当前名称解析已完成运行时收口；剩余重点是人工审核首批刷取样本、删除迁移遗留、扩大回归集，并让 Bot 锁定 GitHub Release 或包版本以消除部署副本漂移。
