# Mod 效果维护

4kmod、auramod 的效果以 effects 为唯一来源；effectDetails 只存变量引用：

    "effectDetails": ["{effects}"]

修改 effects 的 displayName/value/unit，会同步改变资料查询、聊天、DSH 和卡片生成时读取的效果。效果值与标签分开时自动组合，例如 +60% 弹匣；displayName 已是带数值的完整文案时原样使用，不再重复添加数值。

也支持在文本中引用单条效果，例如 {effects.0}。变量只解析已知 effects，不执行代码。

auramod 的 effects 不由此次迁移改写。英文 effectDetailsEn 是独立语言资料。其他尚未采用变量的文案保持原状。

完整描述必须保留触发条件、适用对象、持续时间和备注。仅当词条自身足以表达完整效果时才使用 `{effects}`。
例如成长之力：`武器触发后 小队 {effects.0} 持续 {effects.1.value}{effects.1.unit}`。
支持 `{effects.N}` 引用整条，以及 `.value`、`.absValue`、`.displayName`、`.unit` 引用字段；禁止将有触发条件的完整描述替换为裸数值列表。
