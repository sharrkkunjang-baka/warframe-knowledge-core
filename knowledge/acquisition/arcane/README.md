# 赋能描述维护

每个赋能 JSON 只在顶层 `levelStats` 保存一份效果描述 

- `levelStats[0].stats` 是0级，`levelStats[maxRank].stats` 是满级 
- 获取卡片和查价卡片的描述均读取顶层满级项 
- 修改某一级只影响该级，不会自动改写其他等级 
- 不要添加 `arcaneAcquisition.generated.stats.levelStats`，校验器会拒绝重复副本 
- `sync-arcanes.js` 为新赋能初始化描述；已有赋能的文案会保留，等级数量变化则要求人工确认 
- `generated.stats` 仅保留稀有度、最高等级和来源语言等元数据 
