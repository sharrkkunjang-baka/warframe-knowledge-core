# Warframe Knowledge Core

面向中文玩家和开发者的可审核 Warframe 共享知识核心。目标是“一套数据、一套解析、多端复用”：QQ Bot、网页、Discord Bot 和 Agent 均可消费同一构建产物。

## 数据分层

- `facts/`：官方译名、机制事实、必要摘录与来源链接。
- `knowledge/`：萌新答疑、社区黑话、攻略和二次加工结论。
- `dist/`：仅包含通过人工审核的发布数据，由 `npm run build` 生成。

动态价格、赏金、裂缝和世界状态不会固化进仓库，应由消费端实时请求 API。

## 使用

```js
const { createKnowledgeCore } = require('warframe-knowledge-core');
const core = createKnowledgeCore();
console.log(core.resolveName('心智狭'));
console.log(core.searchKnowledge('九重天'));
```

## 维护流程

1. 在 `facts/` 或 `knowledge/` 新建/修改 JSON 条目。
2. Agent 或人工均可提交草稿，但必须保留来源并设为 `draft` 或 `review`。
3. 人工确认准确后改为 `approved`，并填写 `reviewedBy`。
4. 执行 `npm run validate && npm test && npm run build`。
5. 合并 PR 后发布构建产物。

详见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [REVIEWING.md](REVIEWING.md)。
