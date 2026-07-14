# Warframe Knowledge Core 参考

本文只记录当前仓库可确认的公共数据和 API。类型使用 TypeScript 风格表示；“必填”指生成文件/schema 或构造器的实际要求，不代表输入对象必须显式传入所有带默认值字段。

## ID 与来源规则

- `OfficialItem.uniqueName` 是 ItemCatalog 主键，格式为 `/Lotus/...`。
- `Recipe.id` 由 `${item.uniqueName}#recipe-${outputQuantity}` 生成；`RecipeVariant.recipeId` 只引用同一 item 的 recipe ID。
- `Entity.id` 使用带命名空间的小写稳定 ID，如 `planet.earth`、`vendor.konzu`、`currency.credits`。
- `KnowledgeEntry.id` 全仓唯一；`methodRefs[]` 只引用 `module="gameplay"` 且 ID 为 `gameplay.*` 的条目。
- `subject.categoryRefs[]` 引用 `knowledge/categories/<id>.json` 的 `id`，不是目录名或展示名。
- 引用解析优先级：稳定 ID/uniqueName → canonical → displayName → aliases。持久化引用必须保存稳定 ID，不能保存别名。
- 事实来源优先级：官方导出/官方掉落表 → 官方本地化 → approved 本地知识/审计覆盖 → Wiki SQLite → 在线 Wiki → 旧缓存或消费端兼容资料。

## official-items

目录对象 `OfficialItemCatalog`：

- `schemaVersion: 1`，必填；生成脚本固定值。
- `generatedAt: string`，必填；ISO 时间，来自生成时刻；`--check` 会沿用现有时间以便比较。
- `source: object`，必填；生成来源。
  - `package: string`，必填；当前为 `warframe-items`。
  - `version: string`，必填；锁定依赖版本。
  - `repository: string`，必填；上游仓库 URL。
  - `inputs: string[]`，必填；`Resources.json/Gear.json/Misc.json/Arcanes.json`。
  - `localization: string`，必填；当前为 `i18n.json`。
- `counts: object`，必填；`input/items/excluded: number`、`byKind: Record<string,number>`、`excludedByReason: Record<string,number>`，均来自生成统计。
- `items: OfficialItem[]`，必填；按 `uniqueName` 排序。

### OfficialItem

- `uniqueName: string`，必填；上游 `/Lotus/...` 路径，稳定主键。例：`core.getOfficialItem('/Lotus/Types/...')`。
- `canonical: string`，必填；上游英文 `name`。例：`core.getOfficialItem('Cipher')`。
- `displayName: string`，必填；优先 `i18n[uniqueName].zh.name`，否则 canonical。
- `localizationStatus: 'official-zh'|'fallback-en'`，当前生成必有；说明 displayName 来源。
- `kind: 'resources'|'gear'|'misc'|'arcanes'`，必填；来自输入文件。
- `semanticKinds: string[]`，必填且非空；生成分类，可包含 `resource`、`gear`、`craftable`、`droppable`、`arcane` 等。
- `description: Description`，必填；上游和本地化描述。
- `tradable: boolean`，必填；上游 `tradable` 布尔化。
- `drops: Drop[]`，必填；上游 item drops，缺失为空数组。
- `recipes: Recipe[]`，必填；由上游 `components` 生成，缺失为空数组。
- `recipeVariants: RecipeVariant[]`，必填；显式变体，缺失为空数组。
- `buildQuantity: number`，必填且 >=1；上游值，缺失为 1。
- `sourceCategory: 'Resources'|'Gear'|'Misc'|'Arcanes'`，必填；输入分类。
- `sourceFile: 'Resources.json'|'Gear.json'|'Misc.json'|'Arcanes.json'`，必填；输入文件。

### Description

- `canonical: string`，必填；上游英文 description，缺失为空字符串。
- `display: string`，必填；官方简中 description，缺失时回退 canonical。

引用示例：`item.description.display || item.description.canonical`。

### Drop

Drop 直接保留上游结构，当前目录可确认字段为：

- `chance: number`，可选；上游概率，通常为 0..1 小数，消费前应使用适配函数归一化。
- `location: string`，可选；上游地点/轮次文本，不是 registry ID。
- `rarity: string`，可选；如 `Rare`、`Uncommon`。
- `type: string`，可选；掉落对象英文名。

引用示例：`item.drops.map(d => ({ source: d.location, chance: d.chance }))`。不要把 `location` 文本持久化为 `locationId`，除非已显式映射 registry。

### Recipe

- `id: string`，必填；生成的 item 内配方 ID。
- `outputQuantity: number`，必填；该次制造产量。
- `credits: number`，必填；上游 `buildPrice`，缺失为 0。
- `buildTimeSeconds: number`，必填；上游 `buildTime`，缺失为 0。
- `consumeOnBuild: boolean`，必填；除上游明确为 false 外均为 true。
- `ingredients: Ingredient[]`，必填；由 components 映射。

引用示例：`item.recipes.find(r => r.id === variant.recipeId)`。

### Ingredient

- `uniqueName: string|null`，必填；上游材料路径；可能不在 ItemCatalog。
- `canonical: string|null`，必填；上游材料英文名。
- `quantity: number`，必填；上游 `itemCount` 数值化。
- `drops: Drop[]`，必填；上游材料附带掉落，缺失为空数组。

引用示例：`core.getOfficialItem(ingredient.uniqueName) || ingredient`。

### RecipeVariant

当前实际生成的变体字段：

- `id: string`，必填；稳定变体 ID，如 `cipher.single`。
- `aliases: string[]`，必填；用于 `getOfficialItem/resolveItem` 精确解析。
- `outputQuantity: number`，必填；变体产量。
- `recipeId: string|null`，必填；同一 item 配方引用；无证据为 null。
- `evidenceStatus: 'upstream'|'missing'|'wiki-required'`，必填；证据状态。
- `pendingWikiEvidence: boolean`，可选；为 true 时核心不复用普通配方作为该变体证据。
- `note: string`，可选；缺失证据的用户说明。

引用示例：`core.resolveItem('100x Cipher').recipeVariant`。

## 实体 registry

Location、Vendor、Currency 均满足基础 `Entity`：

- `id: string`，必填；稳定引用 ID。
- `canonical: string`，必填；英文规范名。
- `displayName: string`，必填；中文展示名。
- `kind: string`，必填；实体子类型。
- `aliases: string[]`，必填；仅用于查询。

Location 额外字段：

- `parentId: string|null`，当前均显式提供；引用另一个 location ID。例：`landscape.plains-of-eidolon.parentId === 'hub.cetus'`。

Vendor 额外字段：

- `locationId: string|null`，当前均显式提供；引用 location ID。例：`core.getLocation(core.getVendor('孔祝').locationId)`。

Currency 当前无额外字段。registry 公共形态为 `{ values: readonly Entity[], get(query): Entity|null, search(query): Entity[] }`；`createKnowledgeCore` 将 get/search 包装为下文公共方法。

## Acquisition DTO

### AcquisitionEvidence

由 `createAcquisitionEvidence(input)` 创建；`type` 与 `source` 缺失时抛 `TypeError`。

- `type: string`，必填；证据类别，当前核心产生 `drop/recipe/knowledge/warframe`。
- `source: string`，必填；来源文本或来源 ID。
- `sourceId: string|null`，可选输入，默认 null；来源内部 ID，如 recipe ID。
- `locationId: string|null`，可选输入，默认 null；引用 location registry。
- `vendorId: string|null`，可选输入，默认 null；引用 vendor registry。
- `currencyId: string|null`，可选输入，默认 null；引用 currency registry。
- `chance: number|null`，可选输入，默认 null；概率；构造器不改变单位。
- `quantity: number|null`，可选输入，默认 null；产量/数量。
- `verified: boolean`，可选输入，默认 true；仅显式 false 时为 false。
- `note: string|null`，可选输入，默认 null。

示例：`core.createAcquisitionEvidence({ type:'vendor', source:'Nightwave', vendorId:'vendor.market', currencyId:'currency.credits' })`。

### AcquisitionResult

由 `createAcquisitionResult(input)` 创建。

- `query: string`，可选输入，默认空字符串。
- `item: OfficialItem|OfficialMod|Warframe|null`，可选输入，默认 null；兼容联合类型。
- `evidence: AcquisitionEvidence[]`，可选输入，默认空数组；每项再次经构造器规范化。
- `recipeVariants: RecipeVariant[]`，可选输入，默认空数组。
- `status: string`，可选输入；默认 item 存在为 `resolved`，否则 `not-found`；核心还产生 `ambiguous`。
- `notes: string[]`，可选输入，默认空数组。

示例：`const result = core.getItemAcquisition('破解器')`。

### RenderResult

由 `createRenderResult(input)` 创建。

- `text: string`，可选输入，默认空字符串。
- `acquisition: AcquisitionResult|null`，可选输入，默认 null。
- `sections: unknown[]`，可选输入，默认空数组；核心未限制 section 形态。
- `warnings: unknown[]`，可选输入，默认空数组；核心未限制 warning 形态。

示例：`core.createRenderResult({ text, acquisition, warnings: acquisition.status === 'not-found' ? ['未找到'] : [] })`。

## KnowledgeEntry 与 methodRefs

基础字段（schema）：

- `id: string`，必填；全仓唯一。
- `title: string`，必填；展示标题。
- `sources: {url:string,label:string}[]`，必填；来源，可为空数组。
- `gameVersion: string`，必填；游戏版本标识。
- `updatedAt: string`，必填；`YYYY-MM-DD`。
- `reviewStatus: 'draft'|'review'|'approved'|'rejected'`，必填。
- `reviewedBy: string[]`，必填。
- `kind: 'fact'|'knowledge'`，schema 可选，实际知识通常提供。
- `aliases: string[]`、`content: string`、`summary: string`、`tags: string[]`，按条目用途可选。

Acquisition entry：

- `module: 'acquisition'`，必填。
- `subject: object`，必填：`canonical/displayName/category` 必填；`category` 为 `frame|weapon|mod|resource|companion|other`；`categoryRefs[]`、`officialUniqueName`、`setFamily`、PvP 字段可选。
- `prerequisites: string[]`，必填。
- `methodRefs: string[]`，必填，可为空；每项引用 gameplay entry ID。
- `acquisitionStatus: 'stub'|'complete'`，可选。
- Mod 可提供 `maxRank`、`effectDetails[]`、`effects[]`；effect 包含 `stat/displayName/value/unit`。
- `rewardTier: 'A'|'B'|'C'`、`tradable`、`rarity`、`polarity`、`generator` 等按数据可选。

Gameplay entry：

- `module: 'gameplay'`、`aliases`、`summary`、`content`、`steps`、`notes` 必填。
- `acquisitionQuery: string` 可选；允许明确刷取命令打开该玩法。
- `rewardGroups: Record<'A'|'B'|'C',{planets:string[]}>` 可选。

引用示例：`core.getAcquisition('心志偏狭').methods`。展开规则是：entry 显式 `methodRefs` 非空时只用显式引用；为空时按 `subject.categoryRefs` 继承分类 `defaultMethodRefs`；只返回存在且 `module=gameplay` 的条目，并按首次出现去重。

## createKnowledgeCore

导入：`const { createKnowledgeCore, searchEntries, frameAcquisition } = require('warframe-knowledge-core')`。

### 构造参数

`createKnowledgeCore(options = {}) -> Core`

- `options.root?: string`：数据根目录，默认包根目录。
- `options.approvedOnly?: boolean`：默认 true；false 时公开 facts/knowledge 也包含非 approved 条目。

Core 同时包含 `loadData()` 的字段：`facts[]`、`knowledge[]`、`categories[]`、`officialCatalog`、`officialItems`、`officialItemSources`、`aliases`、`locations/vendors/currencies` registry，以及以下方法。

### 名称、命令与搜索

- `resolveName(query, options?) -> Resolution|null`：统一 alias/官方 Mod 名称解析；`options.candidates?` 可附加候选，其他选项透传 resolver。例：`core.resolveName('心智狭')`。
- `normalizeTerms(text) -> string`：按 `aliases.normalization` 从长到短替换术语。
- `parseAcquisitionCommand(text) -> {intent:'acquisition',query:string}|null`：解析 `/刷`、`刷 <名>`、`怎么刷<名>`。
- `parseGameplayCommand(text) -> {intent:'gameplay',query:string}|null`：只解析 `/玩法`。
- `parseCategoryCommand(text) -> {intent:'category',query:string}|null`：解析 `/分类`、`分类 <名>`。
- `searchFacts(query, {limit?}?) -> KnowledgeEntry[]`：标题/alias/tag/content 评分，默认 8。
- `searchKnowledge(query, {limit?}?) -> KnowledgeEntry[]`：同上。
- `searchAcquisition(query, {limit?}?) -> KnowledgeEntry[]`：只搜 acquisition。
- `searchGameplay(query, {limit?}?) -> KnowledgeEntry[]`：只搜 gameplay。
- `searchCategories(query) -> Category[]`：id/canonical/displayName/alias 归一化精确匹配。

顶层另导出 `searchEntries(query, entries, {limit?}?) -> Entry[]`，使用同一评分逻辑。

### 分类、玩法与知识刷取

- `getCategory(query) -> Category|null`。
- `getCategoryDetail(query) -> {query:string,category:Category,entries:KnowledgeEntry[]}|null`。
- `getGameplay(query) -> {query,entry,rewardTier,rewardGroup,alternatives}|null`；支持末尾 A/B/C。
- `getAcquisition(query, options?) -> AcquisitionKnowledgeResult|null`；`options.resolveOptions` 传给名称解析。单项结果含 `resolution/entry/description/categories/methods/sourceOptions/alternatives`；集合结果含 `collection/entries/methods/sourceOptions`。
- `getAcquisitionCollection(query) -> AcquisitionCollectionResult|null`；当前内置集合为跑酷 Mod。

### ItemCatalog 与兼容目录

- `resolveItem(query) -> {kind:'official-item'|'mod'|'warframe',item,recipeVariant}|{kind:'ambiguous',item:null,recipeVariant:null,candidates:OfficialItem[]}|null`。
- `searchOfficialItems(query,{limit?}?) -> OfficialItem[]`，默认最多 20。
- `getOfficialItem(query) -> OfficialItem|null`，精确匹配 item/variant alias。
- `getItemAcquisition(query, options?) -> AcquisitionResult`。
- `getOfficialMod(query) -> OfficialMod|null`。
- `getModTips(query) -> unknown[]`；返回未过滤知识中精确 Mod 条目的 tips，缺失为空数组。
- `getModTipKeywords(query) -> unknown[]`；同上读取 tipKeywords。
- `searchOfficialMods(query,{limit?}?) -> OfficialMod[]`。
- `listOfficialCategories(filter?) -> OfficialCategory[]`；filter 为 `{dimension?:string,status?:string}`。
- `listMissingOfficialMods(filter?) -> OfficialMod[]`；filter 为 `{categoryId?:string,localizationStatus?:string}`。
- `listStubOfficialMods(filter?) -> OfficialMod[]`；filter 同上。
- `listMissingOfficialCategories(filter?) -> OfficialCategory[]`；等价于 status=missing，并可带 dimension。

### Wiki 上下文、实体与 DTO

- `buildWikiContext(query) -> {query,resolution,facts,knowledge,text}|null`；拼接仓库 facts/knowledge，不查询 SQLite。
- `getLocation(query) -> Location|null`；`searchLocations(query) -> Location[]`。
- `getVendor(query) -> Vendor|null`；`searchVendors(query) -> Vendor[]`。
- `getCurrency(query) -> Currency|null`；`searchCurrencies(query) -> Currency[]`。
- `createAcquisitionEvidence(input) -> AcquisitionEvidence`。
- `createAcquisitionResult(input) -> AcquisitionResult`。
- `createRenderResult(input) -> RenderResult`。
- `frameAcquisition: object`：下节模块。

## frameAcquisition 公共 API

常量：

- `RECIPES_URL/REWARDS_URL: string`：Public Export Plus URL。
- `PARTS: ['Blueprint','Neuroptics','Chassis','Systems']`。
- `FRAME_SOURCE_OVERRIDES`、`FRAME_ACQUISITION_NOTES`、`QUEST_SOURCE_ZH`：冻结的审计覆盖/本地化映射。
- `CALIBAN_PRIME`、`SIRIUS_ORION`：显式兼容对象。

解析与展示：

- `resolveWarframe(input) -> Warframe|null`：精确 alias 解析。
- `resolveWarframeMention(input) -> {frame,matched,rest,match}|null`：从句子识别战甲提及。
- `getFrameAbilities(frameOrName) -> Ability[]`；Ability 为 `{index,name,zhName,description,uniqueName}`。
- `resolveWarframeAbilityQuery(input) -> {frame,abilityFrame,ability,question,abilities}|null`。
- `getComponentDrops(frameOrName) -> ComponentDrop[]|null`。
- `normalizeChance(chance) -> number|null`：0..1 转百分数，其余数值保持。
- `formatChance(chance) -> string`。
- `translateLocation(location) -> string`；`localizeQuestName(name) -> string`。
- `formatDropSource(drop) -> string`；`formatDropSources(drops) -> string`。
- `componentSourceText(frame,part,drops) -> string`。
- `renderSeriesPartSource(frame,part) -> string|null`。
- `renderAcquisition(data) -> string`。

配方与材料：

- `indexRecipes(recipes) -> {byBlueprint:Map,byResult:Map}`。
- `aggregateMaterials(frameOrName,recipes) -> Materials|null`；Materials 含 `available/resources/manufacturedParts/credits/missingRecipes`，或不可用原因。
- `loadRecipes(options?) -> Promise<object>`。
- `loadMissionRewards(options?) -> Promise<object>`。

两个加载方法 options 可含：`recipes`/`rewards` 直接值、`cachePath`、`fetchImpl`、`maxAgeMs`（默认 6 小时）、`forceRefresh`、`url`、`timeoutMs`（默认 15000）。读取顺序为直接值 → 新鲜缓存 → 网络 → 旧缓存 → 抛错。默认缓存目录可由 `WF_EXPORT_CACHE_DIR` 改写。

遗物：

- `normalizeRelicPath(value) -> string`。
- `normalizeVarziaManifest(manifest) -> Set<string>`。
- `activeRelicPaths(rewards) -> Set<string>`。
- `getPrimeRelics(frameOrName,varziaManifest,missionRewards) -> PrimeRelicResult|null`；结果含 `status/relics/byPart/realtimeAvailable/rotationAvailable`。
- `localizeRelicName(name) -> string`；`relicRewardTier(relic) -> '金'|'银'|'铜'`。

## 生成脚本与环境变量

package scripts：

- `npm run sync:mods` / `check:mods`：同步/检查 Mod acquisition 空壳；`--check` 不写入。
- `npm run sync:official` / `check:official`：生成/检查 `knowledge/categories/official.json`。
- `npm run sync:items` / `check:items`：生成/检查 `knowledge/generated/official-items.json` 与 `generated/` 下的来源元数据。
- `npm run sync:frames` / `check:frames`：联网生成/检查战甲、任务、Prime 遗物和来源文件；非 check 同时写 recipes/rewards cache。
- `npm run sync:pvp`：同步 PvP Mod 数据。
- `npm run normalize:text`：规范用户可见文本。
- `npm run validate`：运行结构和引用校验。
- `npm test`：Node test runner。
- `npm run build`：先校验，再生成 dist 和 manifest。
- `npm run maintain`：依次同步 mods、official、items、frames，校验、测试、构建。
- `npm run check:all`：检查 mods/official/items/frames，校验并测试。

本仓库核心可确认环境变量只有：

- `WF_EXPORT_CACHE_DIR: string`：`frame-acquisition` 默认 ExportRecipes/ExportRewards 缓存目录；未设时为 `<core>/cache`。

QQ Bot Wiki 爬虫已确认环境变量：

- `WF_WIKI_DB_KEY: string`：SQLCipher key，默认空字符串。
- `WF_WIKI_BUSY_TIMEOUT_MS: number`：SQLite busy timeout，默认 30000。
- `WF_CHROME_PATH: string`：Chrome 可执行文件。
- `WF_WIKI_CDP_PORT: number`：爬虫专用 CDP 端口，默认 9444。
- `WF_PROXY: string`：Chrome 代理，默认 `http://127.0.0.1:10808`；传 `proxy:null` 可禁用。
- `WF_WIKI_CHROME_PROFILE: string`：独立 Chrome profile 目录。
- `WF_WIKI_CDP_TIMEOUT_MS: number`：CDP 超时，默认 30000。
- `WF_WIKI_FETCH_TIMEOUT_MS: number`：页面内 API fetch 超时，默认 45000。
- `WF_WIKI_BROWSER_TIMEOUT_MS: number`：Chrome 启动超时，默认 30000。

## Wiki 爬虫契约（qq-bot）

命令：`node systems/warframe_wiki_sync.js [full|incremental] [--db FILE] [--limit N] [--delay MS] [--retries N] [--batch N]`。默认 mode=incremental、limit=0、delay=400、retries=4、batch=50（上限 50）。

`sync_state` 已确认 keys：

- `sync.status`：最近活动同步的状态。
- `sync.full`、`sync.incremental`：对应模式状态。
- `full.apcontinue`：全量分页 continuation 或 null。
- `full.cursor`：`{continuation,nextIndex,pageId,title}` 或 null。
- `full.last_run`：`{at,processed,complete,limited}`。
- `incremental.timestamp`：成功完成增量后的最新时间戳。
- `incremental.cursor`：`{from,continuation,nextIndex,newest}` 或 null。
- `incremental.last_run`：`{at,from,through,processed,complete,stats}`。

同步状态字段：

- `mode: 'full'|'incremental'`、`pid: number`、`startedAt: string`。
- `currentPage: {pageId:number|null,title:string|null,processed:number}|null`。
- `lastSuccess: string|null`。
- `lastError: {at:string,message:string,stack:string|null}|null`。
- `exitedAt: string|null`、`exitCode: number|null`。

`stats` 字段为 `{pages:number,sections:number,aliases:number,fts:number}`。状态均以 JSON 写入 `sync_state.value`，表的 `updated_at` 由 store 自动维护。

计划任务名：

- `WarframeWikiFullSync`：每周日 03:00 和开机延迟 10 分钟；full，delay 400。
- `WarframeWikiIncrementalSync`：每 45 分钟和开机延迟 2 分钟；incremental，delay 300。

默认数据库为 `D:\qq-bot\data\warframe-wiki\warframe-wiki.sqlite`。两种模式共享 `<db>.sync.lock`；已有活跃同步时进程以 `WF_SYNC_LOCKED` 错误并设置退出码 75。
