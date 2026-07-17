# Warframe 统一获取体系：未完成工作与后续计划

更新时间：2026-07-17

## 目标

所有获取子系统（战甲、武器、Mod、赋能、资源、消耗品及 Bot 查询层）必须共用同一套实体变量与获取协议：

- 任务、地点、NPC、集团、货币、任务类型、敌人和特殊来源只保存注册实体 ID。
- 显示名称由实体注册表在运行时解析，不能在发布方法里另写一份相似名称。
- 非官方证据可以作为证据来源，但证据中的对象也必须先注册成变量并建立关系，不能直接发布硬编码文案。
- 自动生成层与人工层分离；重新编译不能覆盖人工 `tips`、`tipKeywords`、结构化效果、人工 `methodRefs` 等内容。
- 质量门必须阻止未注册 ID、缺少必要 ID、以及通过 `sourceDisplayName` 等字段绕过变量系统的发布数据。

## 已完成

### 消耗品统一变量接入

此前严格审计发现的 38 个消耗品变量缺口已经逐项处理过一次，并达到：

- 消耗品总数：136
- 完整：136
- 可发布：136
- 严格审计失败：0

已处理的主要内容：

- NPC 兑换改为 `npcId` / `locationId`。
- 任务奖励改为 `questId` 或已注册的特殊来源 ID。
- 敌人掉落改为 `sourceEntityId`。
- 集团魅影配方改为具体 `factionId`。
- 官方掉落表中的任务节点被纳入地点注册表。
- 注册利润收割者第 3 阶段、虚空商人每周任务、兽之腹活动商店、万圣之焰缓存、Clem 每周任务等特殊来源。
- `audit-consumable-coverage.js` 已增加严格实体引用检查。

注意：在此之后又开始移除消耗品中的“商店 / 道场”等通用硬编码，最后一次完整验证命令被中断，因此上面的 136/136 是中断前最近一次已确认结果；最新几处编辑仍需重新验证。

### 通用实体解析

已修改：

- `src/acquisition-core.js`
  - 支持从注册表补全 NPC、地点、任务、集团、任务类型和特殊来源显示名称。
- `src/acquisition-protocol.js`
  - 兑换文案优先使用实体解析后的 NPC 与地点名称。

### 新增全子系统审计器

新增：

- `scripts/audit-variable-references.js`
- 输出：`generated/variable-reference-audit.json`

该审计器会递归检查战甲、武器、Mod、赋能、资源和消耗品中的发布方法，并检查：

- 显示名称存在但没有任何实体 ID。
- `quest-reward` 没有任务 ID。
- 兑换方法没有 NPC、集团或特殊来源 ID。
- `enemy-drop` 没有敌人 ID。
- `mission-reward` 没有地点或来源 ID。
- ID 没有在实体注册表中注册。

首次全量基线结果：

- 总缺口：2074
- 战甲：0
- 武器：2016
- Mod：4
- 赋能：0
- 资源：0
- 消耗品：54

其中消耗品的 54 项主要是通用“商店 / 道场 / 午夜电波”等来源；已开始改造，但中断前尚未重新生成最终基线。

## 当前尚未完成

### 1. 验证最近编辑，恢复可靠基线

最后执行但被中断的命令是：

```powershell
node scripts/sync-frame-source-locations.js
node scripts/sync-consumable-knowledge.js
node scripts/audit-consumable-coverage.js --strict
node scripts/audit-variable-references.js
```

后续第一步必须重新执行这些命令，确认：

- `sync-consumable-knowledge.js` 无语法错误。
- 消耗品仍为 136/136 可发布。
- 新增地点 / 特殊来源变量索引无漂移。
- 全系统缺口基线已经刷新。

不要基于中断前的 `generated/variable-reference-audit.json` 直接宣称最新结果。

### 2. 消耗品剩余通用来源去硬编码

已开始注册：

- `interface.market`
- `interface.nightwave-offerings`
- `acquisition-source.invasion`
- `acquisition-source.daily-tribute`
- `acquisition-source.anniversary-alert`
- `acquisition-source.founder-package`
- `acquisition-source.kuva-lich-weapon`
- `acquisition-source.sister-weapon`
- `dojo.tenno-lab`
- `dojo.chem-lab`
- `dojo.energy-lab`
- `dojo.bio-lab`
- `dojo.orokin-lab`

已开始把消耗品中的商店和道场方法改成 `sourceEntityId`，但仍需：

- 检查 `nightwave-offering`、`adversary-reward` 等残余硬编码。
- 确保 `audit-consumable-coverage.js` 对这些方法同样要求已注册来源。
- 严格审计归零后再算完成。

### 3. 武器系统全面变量化（最大剩余工作）

武器是当前主要缺口，首次基线为 2016 条。主要来源：

- `compile-package-weapon-acquisition.js`
- `compile-weapon-wiki-acquisition.js`
- `sync-weapon-knowledge.js`
- 现有生成文件 `knowledge/acquisition/weapons/**`

高频硬编码类型包括：

- 商店：538
- 霍瓦尼亚任务：112
- Tenno 实验室：62
- 虚空商人：60
- 双衍王境无尽回廊第 6 阶段：敌人 / 任务来源共 118
- 入侵任务：56
- 六大集团商店：52
- 殁世幽都赏金：48
- 能源 / 生物 / 化学实验室：合计 108
- 赤毒玄骸 / Corpus 姐妹武器：64
- 以及任务奖励、敌人掉落、周年、每日献礼、创始人礼包等来源。

必须做编译器级修复，不能直接批量改 619 个生成 JSON：

1. 给所有通用来源建立稳定实体变量。
2. 给包数据来源映射建立 `factionId`、`npcId`、`locationId` 或 `sourceEntityId`。
3. Wiki 编译器解析到 NPC / 集团 / 地点 / 任务时，通过注册表解析 ID。
4. `questMethods` 和 `supportQuestMethods` 必须输出 `questId`，不再只输出 `questDisplayName`。
5. 官方掉落表中的 `locationId` / `missionTypeId` 必须指向已注册实体；修复以下未注册模式：
   - `mission-type.normal`
   - `location.duviri`
   - `mission-type.bounty`
   - `mission-type.narmer-bounty`
6. 武器审计 `audit-weapon-coverage.js` 要接入统一实体引用检查。
7. 重新编译 619 把武器，要求原有 619/619 完整与可发布不能回退，同时统一变量审计归零。

注意：市场、活动、道场、每日献礼等不是 NPC，应该使用特殊来源实体，不要为了通过审计伪造 NPC。

### 4. Mod 的 4 个变量问题

首次基线列出的 4 项：

- `npc.koumei-shrine` 未注册：`Amanata Pressure`
- `npc.arbitration-honors` 未注册：`Aerial Ace`
- `npc.arbitration-honors` 未注册：`Archgun Riven Mod`
- `Aegis Gale` 的 `syndicate-exchange-group` 没有来源 ID

需要先判断对象类型：

- 如果“神社 / 仲裁阁下的奖励商店”不是 NPC，应注册为特殊来源或界面变量，而不是继续使用伪 NPC ID。
- `syndicate-exchange-group` 应关联真实集团集合变量或明确的来源实体。
- 修复编译器或方法模板，不能只改 4 个生成 JSON。

### 5. 战甲、赋能、资源的深层审计

首次扫描显示三者为 0，不代表已经证明完全合规，原因包括：

- 审计器目前主要识别带显示字段的结构化方法。
- 某些模块使用不同字段名（例如 Mod 的 `nodeEntityId`、`missionTypeEntityId`）。
- 资源中大量 `raw-official-drop` 仍是 `pending` 证据，不属于“已批准发布方法”，因此没有被计入硬编码失败。
- 战甲主要通过方法引用 / 分类文件工作，需要验证引用目标，而不只是扫描内嵌方法。

后续应补充：

- 方法引用存在性检查。
- 所有方法类型的必需 ID 规则。
- 资源证据转正式路线时的实体绑定质量门。
- Arcane `sourceEntityId` 对应来源实体内部关系（NPC、地点、货币）完整性检查。
- 战甲方法模板引用的实体完整性检查。

### 6. Bot 查询层审计

尚未检查 `qq-bot` 查询与渲染代码是否：

- 自己维护另一套 NPC / 地点 / 任务名称映射。
- 在找不到实体时直接显示 `sourceDisplayName` 或英文 canonical。
- 对武器、Mod、赋能、资源、消耗品使用不同的相似渲染器。
- 绕过 `acquisition-core.js` / `acquisition-protocol.js`。

必须确保 Bot 只消费统一协议，不能在 Bot 层再造一份类似 JSON 或特殊分支。

### 7. 非官方证据对象正规化

尚未系统完成。规则：

1. 证据来源可以是 Wiki 等非官方数据。
2. 证据中出现的 NPC、地点、任务、商店、事件、货币等对象必须先进入相应注册表。
3. 注册实体必须保存证据来源与本地化状态。
4. 获取方法只引用 ID。
5. 无法可靠确认对象身份或官方中文名时标记待审，不能以硬编码中文通过发布门。

### 8. 全量回归、同步和部署

尚未执行：

- 全量 `check:all` / `validate` / 测试。
- 将核心同步到 `qq-bot` 内置副本。
- Git 提交。
- GitHub 推送。
- VPS 部署。
- Bot 重启。

本轮用户没有要求提交、推送或部署，因此不得自动执行这些外部操作。

## 需要特别复核的实现风险

### 全系统审计器仍是第一版

`scripts/audit-variable-references.js` 可能存在：

- 同一方法在 `prime.methods` 与 `routes.methods` 中重复计数。
- 对 `market-purchase` 等通用来源的规则需要进一步明确。
- `registryFor` 对 `arcane-source.*` 与地点注册表的选择需要验证。
- 方法识别可能漏掉只有 `requirements`、没有显示字段的结构。
- 不能只追求数字归零；必须确认每种方法类型所需实体关系正确。

建议后续把审计结果分为：

- 唯一方法缺口数。
- 受影响条目数。
- 生成副本重复计数。
- 未注册 ID。
- 缺少必需 ID。
- 发布方法硬编码。
- 仅证据层、尚未发布的数据。

### 实体目录命名

现有代码中货币目录为历史拼写 `knowledge/curreicies`，`src/entities.js` 也按该路径读取。不要在本任务中顺手重命名，除非做完整迁移并修复所有引用。

### 生成文件原则

以下目录大多由脚本生成，不应手工逐文件修补：

- `knowledge/acquisition/weapons/**`
- `knowledge/acquisition/consumables/**`
- `knowledge/acquisition/mod/**`
- `knowledge/acquisition/arcane/**`
- 实体 `categories.json`

应修改编译器 / 注册脚本，再重生成并审计。

## 建议的后续执行顺序

1. 重新运行最近被中断的消耗品与变量审计命令。
2. 修复消耗品剩余通用来源，使消耗品统一变量审计归零。
3. 修复 Mod 的 4 个明确缺口。
4. 为武器编译器建立统一来源解析函数，先处理市场、道场、六大集团、NPC 兑换和任务 ID。
5. 再处理武器任务来源、敌人来源、事件 / 入侵 / 每日献礼等特殊来源。
6. 将统一变量检查并入 `audit-weapon-coverage.js` 和项目 `check:all`。
7. 深审战甲、赋能、资源的方法引用和证据晋级路径。
8. 审计 Bot 查询与渲染层，移除重复映射和特殊分支。
9. 全量编译、严格审计、`validate`、测试。
10. 同步到 `qq-bot` 内置核心；只有用户再次明确要求时才提交、推送、部署和重启 Bot。

## 本轮涉及的主要文件

已编辑或新增的核心文件包括：

- `scripts/sync-consumable-knowledge.js`
- `scripts/audit-consumable-coverage.js`
- `scripts/sync-frame-source-locations.js`
- `scripts/audit-variable-references.js`（新增）
- `src/acquisition-core.js`
- `src/acquisition-protocol.js`
- `knowledge/locations/**`（脚本生成）
- `knowledge/acquisition/consumables/**`（脚本生成）
- `generated/consumable-coverage-audit.json`
- `generated/variable-reference-audit.json`
- `qq-bot/warframe-whisper-control.ps1`（此前默认绑定码已改为 `WF-OWN-1240-N8QZ`）

## 当前停止状态

工作已按用户要求停止。最后一个长命令被中断，没有继续运行测试、同步、提交、推送、部署或重启服务。
