# 新内容增量工作流

> 适用场景：游戏更新（新 Prime / 新武器 / 新战甲）上线后，让知识库与市场链路跟上。
> 目标：把过去散在 6 个地方的手工对齐，收敛成**一条命令 + 一次门禁**。

## 为什么需要这份文档

DE 的公开导出（`browse.wf` 的 `warframe-public-export-plus`）**滞后于游戏内容**。
2026-09-25 实测：`ExportWeapons.json` / `ExportRecipes.json` / `ExportWarframes.json`
中都不存在 `Corufell Prime` / `Steflos Prime` / `Citrine Prime`（文本级搜索全 0），
而 `warframe.market` 目录里已经有了。

因此新内容**必须**由已复核知识补差。历史上这些补差散落在：

| 位置 | 是否可自动对账 |
| --- | --- |
| `knowledge/generated/official-weapons.json`（DE 导出生成） | 导出没数据 → 补不进去 |
| `knowledge/facts/aliases.json`（别名） | 只写别名不生效 |
| `knowledge/supplemental/official-items.json`（物品补丁，**武器原先没有**） | 武器缺通道 |
| `warframe-content/images/market-images/manifest.json` | 上游 manifest |
| `state/wfm-lkg.json` / `wfm-set-bundles.json` | 市场缓存 |
| `market-loader.js` 里的硬编码身份 | 代码里写死，撞车制造幽灵候选 |

只改其中一处，其余纹丝不动，表现为一句「XX 没有 Prime 版本」——**静默的错误答案**。

## 现在的做法

### 1. 武器身份增量（一条命令）

```bash
npm run sync:weapon-identity-supplements          # 写入/更新 knowledge/supplemental/official-weapons.json
npm run check:weapon-identity-supplements         # 漂移闸门（非零退出）
node scripts/sync-weapon-identity-supplements.js --report   # 只看 delta，不落盘
```

数据流向：

```
DE 导出(cache/warframe-export-weapons.json)  ← 权威基线
        ↓ 差集
warframe.market 目录(state/wfm-lkg.json)     ← 增量来源（自带 gameRef=uniqueName 与 zh-hans 名称）
        ↓ 推导
knowledge/supplemental/official-weapons.json ← 产物（纯数组，按 uniqueName 排序，逐条带 provenance）
```

推导规则（见 `deriveIdentity`）：

- `uniqueName` = 市场条目 `gameRef`
- `canonical` = `i18n.en.name`（套装条目去掉 ` Set`）
- `displayName` = `i18n.zh-hans.name`（套装条目去掉 ` 一套` / ` 套装`）
- `equipmentType` = 由 tags 映射（`melee` / `primary` / `secondary` / `arch-gun` / `arch-melee` / `companion`）
- `status: review-required`，`sourceFields.identity: market-catalog-delta`
- 一旦 DE 导出收录该 uniqueName，本条目会被自动丢弃（差集语义）

### 2. 覆盖门禁（对账，而不是猜）

```bash
npm run audit:market-identity-coverage            # 线上/本机人工看报告
npm run check:market-identity-coverage            # 挂进 check 流程
node scripts/audit-market-identity-coverage.js --json --limit 50
```

对每个市场可交易条目检查：

1. **identity** —— 武器/战甲目录里是否有该 `uniqueName` 的身份
2. **prime-family** —— Prime 条目的族谱是否连通（用知识库自身名字解析判定，
   不做字符串剥 ` Prime`，避免 `Pangolin Prime` ↔ `Pangolin Sword` 这类误报）
3. **display-name** —— 是否带中文名（否则卡片会退化成英文）

缺失项分组打印并非零退出。实测反向验证：

```
$ 移走 knowledge/supplemental/official-weapons.json
市场身份覆盖审计：武器条目=207  战甲条目=51  问题=2
[identity-missing] 2 条
  steflos_prime_set    Steflos Prime    武器目录里没有该身份（uniqueName 与 canonical 都未命中）
  corufell_prime_set   Corufell Prime   武器目录里没有该身份（uniqueName 与 canonical 都未命中）
→ exit 1
```

这正是过去要靠线上反复试错才能定位的缺失清单。

### 3. 每次游戏更新后的完整顺序

```bash
# ① 刷新 DE 导出缓存（browse.wf 直连，node fetch 可用；注意走系统代理的 IWR/curl 会失败）
node -e "fetch('https://browse.wf/warframe-public-export-plus/ExportWeapons.json').then(r=>r.text()).then(t=>require('fs').writeFileSync('cache/warframe-export-weapons.json',t))"
node scripts/sync-official-weapons.js            # 重新生成 knowledge/generated/official-weapons.json
node scripts/sync-official-weapons.js --check    # 漂移闸门

# ② 市场目录同步（runtime 侧）：reloadMode=wfm-catalog 会经上游网关水合
#    缺失的 set bundle 可单独水合（见 warframe-runtime 侧 wfm-set-bundles）

# ③ 增量身份 + 对账
npm run sync:weapon-identity-supplements
npm run audit:market-identity-coverage
npm run check:all
```

## 已知限制 / 待办

- **导出刷新尚未自动化**：目前是手工触发（browse.wf 可直连，未接调度）。
- **上游网关域名 `wf-gw.sharrk-nyana.wiki` 当前 DNS 无法解析**，市场增量实际走 direct 直连。
- **战甲身份**走另一条链（`knowledge/acquisition/warframe/**` 复核条目），本工作流只做审计不生成；
  `audit-market-identity-coverage` 会报告缺失的战甲身份。
- 门禁默认在缺少市场快照时**跳过并告警**；CI/线上想要硬失败请加 `--strict`。
