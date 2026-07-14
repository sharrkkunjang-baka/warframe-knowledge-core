# 战甲获取分类详情报告

生成日期：2026-07-14  
统计范围：116 个公开战甲  
分类数：8  
未分类：0  
重复分类：0

> 分类采用互斥的“主要获取方式”：每个战甲必须且只能属于一个分类。校验器会拒绝零分类或多分类战甲。

## 统计概览

- Prime 遗物战甲：51
- 刺杀获取战甲：17
- 特定任务战甲：12
- 系列任务战甲：9
- 常规与混合任务战甲：9
- 赏金获取战甲：8
- 道场复制战甲：7
- 商店兑换战甲：3

合计：116。

## Prime 遗物战甲（51）

分类 ID：`frame-prime-relic`

Ash Prime、Atlas Prime、Banshee Prime、Baruuk Prime、Caliban Prime、Chroma Prime、Ember Prime、Equinox Prime、Excalibur Prime、Frost Prime、Gara Prime、Garuda Prime、Gauss Prime、Grendel Prime、Gyre Prime、Harrow Prime、Hildryn Prime、Hydroid Prime、Inaros Prime、Ivara Prime、Khora Prime、Lavos Prime、Limbo Prime、Loki Prime、Mag Prime、Mesa Prime、Mirage Prime、Nekros Prime、Nezha Prime、Nidus Prime、Nova Prime、Nyx Prime、Oberon Prime、Octavia Prime、Protea Prime、Revenant Prime、Rhino Prime、Saryn Prime、Sevagoth Prime、Styanax Prime、Titania Prime、Trinity Prime、Valkyr Prime、Vauban Prime、Volt Prime、Voruna Prime、Wisp Prime、Wukong Prime、Xaku Prime、Yareli Prime、Zephyr Prime。

## 刺杀获取战甲（17）

分类 ID：`frame-assassination`

Atlas、Ember、Equinox、Excalibur、Frost、Hydroid、Loki、Mag、Mesa、Nekros、Nova、Nyx、Rhino、Saryn、Trinity、Valkyr、Wisp。

> Excalibur 与 Mag 的部件来自刺杀首领，不属于道场复制；因此按官方主要来源保留在刺杀分类。

## 特定任务战甲（12）

分类 ID：`frame-specific-mission`

Citrine、Follie、Jade、Khora、Koumei、Kullervo、Lavos、Nokko、Oberon、Protea、Sirius & Orion、Voruna。

Jade 按扬升任务归入此类。

## 系列任务战甲（9）

分类 ID：`frame-quest`

Chroma、Excalibur Umbra、Inaros、Limbo、Mirage、Oraxia、Sevagoth、Styanax、Titania。

## 常规与混合任务战甲（9）

分类 ID：`frame-mixed-missions`

Ash、Dante、Gauss、Grendel、Harrow、Ivara、Nidus、Octavia、Temple。

Octavia 按多种常规任务与轮次来源归入此类。

## 赏金获取战甲（8）

分类 ID：`frame-bounty`

Caliban、Cyte-09、Gara、Garuda、Gyre、Qorvex、Revenant、Xaku。

## 道场复制战甲（7）

分类 ID：`frame-dojo`

Banshee、Dagath、Nezha、Volt、Wukong、Yareli、Zephyr。

Volt 按道场复制归入此类。

## 商店兑换战甲（3）

分类 ID：`frame-vendor`

Baruuk、Hildryn、Vauban。

## 分类优先级

自动分类在没有人工明确覆盖时，按以下顺序选择唯一的主要获取方式：

1. Prime 遗物
2. 道场复制
3. 赏金
4. 刺杀
5. 特定任务
6. 常规与混合任务
7. 系列任务
8. 商店兑换

明确的人工主分类覆盖自动优先级，例如 Cyte-09、Gara、Garuda、Jade、Octavia、Volt 和 Xaku。

## 数据来源与约束

- Warframe Public Export 官方战甲与部件掉落数据。
- 英文 Warframe Wiki 各战甲页面的 `Acquisition` 章节。
- 每个战甲只保存一个 `subject.categoryRefs` 成员。
- `scripts/validate.js` 强制每个公开战甲恰好有一个获取分类。
- 分类证据保存在 `frameAcquisition.generated.acquisitionCategories.source`。
- 通用无尽回廊备用来源不改变普通战甲的主要分类。
