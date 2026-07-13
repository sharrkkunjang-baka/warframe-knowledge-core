# 贡献指南

- 一个 JSON 文件可以包含同主题的多个词条，但每个 `id` 必须全仓库唯一。
- 基础事实必须提供可靠来源；优先官方 Wiki、官方语言文件和 Digital Extremes 公告。
- 社区经验必须明确写成经验或建议，不能伪装成官方规则。
- 不得提交 API 密钥、QQ/游戏账号绑定、用户日志、代理、运行缓存或实时价格快照。
- 新增知识默认使用 `reviewStatus: "approved"` 并进入生产构建；只有来源或结论尚不能确认时才使用 `review`。
- 修改别名时需补充回归测试，歧义别名宁可返回多个候选，不强行命中。

## 维护官方 Mod 快照

`categories/official.json` 是生成产物，不接受手工修改。它的数据来源和 `warframe-items` 版本由 `package-lock.json` 固定；需要更新时：

1. 更新依赖并检查上游变更。
2. 执行 `npm run sync:official` 重新生成快照。
3. 查看新增、删除、变更 Mod 以及覆盖数量。
4. 执行 `npm run check:official && npm run validate && npm test && npm run build`。

普通 `categories/*.json` 继续保存本地语义分类。官方快照中的 `officialCategories` 表示上游可归纳的类型、适用对象和特征；`localCategories` 只是生成时记录的关联结果，不能替代普通分类文件。

未来维护 Skill 只能通过 `listMissingOfficialMods()` 和 `listMissingOfficialCategories()` 读取待办，并在普通目录创建默认批准的内容。Skill 不得修改生成快照、删除现有人工内容或伪造官方中文名；遇到缺失来源、名称冲突或无法确认的结论时必须改用 `review`。

## 提交刷取攻略

刷取攻略属于 `knowledge`，并设置 `module: "acquisition"`。除通用字段外必须包含：

- `subject.canonical`：供统一名称解析和跨端关联使用的规范名称。
- `subject.displayName`：中文展示名。
- `subject.category`：基础类型，只能是 `frame`、`weapon`、`mod`、`resource`、`companion` 或 `other`。
- `subject.categoryRefs`：可选的细分类 ID 数组，引用 `categories/<id>.json`；必须列出对象实际属于的全部分类，不只列目录对应的主分类。比如提供精准度的堕落 Mod 同时引用 `4kmod`、`accuracy4kmod`、`accuracymod`。细分类可继续引用另一个细分类作为 `parent`。
- Mod 对象必须提供 `maxRank` 和结构化 `effects`；每个效果包含稳定 `stat`、中文 `displayName`、带正负号语义的数值 `value` 和 `unit`。
- `summary`：适合聊天端直接展示的结论。若同一主分类下的对象使用完全相同的话术，可省略 `summary` 和 `content`，由 `subject.categoryRefs` 第一项所指分类的 `modDescription` 模板生成；模板必须包含 `{name}`。
- `prerequisites`：前置任务、节点、氏族设施或装备要求；没有时使用空数组。
- `methodRefs`：至少一个 `gameplay.*` 玩法 ID。刷取对象不重复保存步骤。

可复用细分类一个文件一个对象，放入 `categories/`。字段至少包含 `id`、官方英文 `canonical`、中文 `displayName`、独立的 `aliases`、上层 `parent`、`description`、英文 Wiki `sources` 和 `updatedAt`。来源/系列限定分类与通用效果分类必须分开：例如 `accuracy4kmod` 的父类是 `4kmod`，表示“精准 4k Mod”；`accuracymod` 的父类是 `mod`，表示不限定来源的“精准 Mod”。社区习惯 ID 可以使用稳定短名，例如堕落 Mod 使用 `4kmod`，但 `canonical` 必须采用官方英文名称 `Corrupted Mods`。分类 `aliases` 只属于分类查询命名空间，不得注入物品名称索引。

每个刷取对象必须独占一个文件，并先按基础类别放入 `knowledge/acquisition/frame|weapon|mod|resource|companion|other/`，再按主要来源或系列建立子目录；例如全部堕落 Mod 放入 `knowledge/acquisition/mod/4kmod/`。目录只用于维护归档，不代表唯一分类，也不能替代 `subject.categoryRefs`。文件名使用规范英文名的小写短横线形式。刷取对象禁止定义 `aliases`：正式名、官方中文名和社区叫法统一由 `/买` 已使用的名称索引维护，刷取条目只用 `subject.canonical` 关联。

## 提交玩法

玩法放入 `knowledge/gameplay/`，一个玩法一个文件，设置 `module: "gameplay"`，并包含：

- `summary`：玩法用途概述。
- `steps`：有顺序的完整执行步骤。
- `notes`：效率、组队、随机奖励和常见误区；没有时使用空数组。
- `aliases`：稳定的玩法名称与常见错拼，例如 `火卫二orikon宝库`。

玩法 ID 使用 `gameplay.<slug>`。删除或改名玩法前必须修改所有 `methodRefs`；校验器会拒绝不存在的引用。

命令表达不写进知识别名。`怎么刷`、`/刷`和`/玩法`由调用端统一解析。玩法不属于物品名称体系，因此玩法文件继续独立维护自己的 `aliases`；这些别名不会混入 `/买` 的物品索引。
