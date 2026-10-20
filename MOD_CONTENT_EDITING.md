# Mod 文案的唯一编辑入口

每个 Mod 只有一份可编辑资料：`knowledge/acquisition/mod/**/*.json`。

- `effectDetails`：中文效果文案，每个数组元素是一段。
- `effectDetailsEn`：英文效果原文。
- `tips`：补充说明。
- `modAcquisition.manual`：人工维护的获取方式与覆盖项。
- `generated/mod-content-index.json`：按中文名、英文名或 uniqueName 找到源文件引用；这里不维护文案。

例如「纪律之功」只修改：

`knowledge/acquisition/mod/standardmod/melee/disciplines-merit-362bbc79.json`

不要修改 `official.json`、`dist` 或图片 manifest：这些文件只保存 `contentRef` / `modContentRef`，查询时在内存中解析源文件。制图程序直接读取同一个源文件，已生成的 PNG 仍需使用现有制图流程重新生成，不能靠修改 manifest 改图中文字。

修改文本后重载知识模块。Mod 同步会保留手工文案；官方分类导出、dist 构建及图片清单写出均不再复制效果文案。

旧 bot 的 `knowledge/acquisition/mod` 是此目录的 Junction，不是另一份资料。历史副本归档于 `D:/Warframe-archives/2026-10-20-mod-content`，不参与生产读取。

## 修改后更新卡面与说明

在知识库根目录执行：

node scripts/render-mod-source.js 纪律之功

此命令直接读取唯一源文件，复用现有中文卡片制图器及像素校验，更新图片缓存并重载知识与 Mod 图片。不会在 manifest 中另存一份文案。只改说明、不重画卡面时，也可只重载知识模块。
