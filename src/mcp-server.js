#!/usr/bin/env node
'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod/v4');
const { createKnowledgeCore } = require('./index');
const { createModEffectResolver } = require('./combat/mod-effects');
const { calculateToridIncarnon } = require('./combat/calculator');
const { simulateToridIncarnon } = require('./combat/simulator');

function jsonResult(value) { return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value }; }
function createWarframeMcpServer(options = {}) {
  const core = createKnowledgeCore({ root: options.root, approvedOnly: false });
  const mods = createModEffectResolver(core);
  const server = new McpServer({ name: 'warframe-combat-simulator', version: '0.1.0' });
  server.registerTool('resolve_entity_variables', {
    description: '按需解析 Warframe NPC、地点、阵营、任务、货币、敌人与任务类型变量。输出时必须使用 displayName；localized=false 时保留 canonical 英文，禁止自行翻译或音译。',
    inputSchema: { query: z.string().min(1) }
  }, async ({ query }) => jsonResult({ query, variables: core.resolveEntityVariables(query), usageRule: '仅在回答需要提及实体时使用；displayName 为空时保留 canonical 英文，禁止猜译。' }));
  server.registerTool('resolve_mod_effects', {
    description: '从 Warframe 知识库解析中英文 Mod 名称并提取满级词条；不识别的词条返回警告，不猜值。',
    inputSchema: { mods: z.array(z.string().min(1)).min(1) }
  }, async ({ mods: names }) => jsonResult({ mods: mods.resolveMany(names) }));
  server.registerTool('calculate_torid_incarnon_stats', {
    description: '使用知识库自动提取 Mod 词条并计算托里德灵化面板乘区。异常和赋能默认从0层；击杀层必须显式提供。',
    inputSchema: {
      mods: z.array(z.string().min(1)).min(1),
      riven: z.array(z.object({ stat: z.string(), value: z.number().optional(), multiplier: z.number().optional(), unit: z.string().optional() })).default([]),
      stacks: z.object({ 'on-kill-2-stacks': z.boolean().optional(), 'on-kill-5-stacks': z.boolean().optional() }).default({}),
      evolutions: z.array(z.enum(['finalFusillade', 'survivorsEdge'])).default(['finalFusillade', 'survivorsEdge'])
    }
  }, async input => {
    const resolvedMods = mods.resolveMany(input.mods);
    return jsonResult({ resolvedMods, stats: calculateToridIncarnon({ ...input, resolvedMods }) });
  });
  server.registerTool('simulate_torid_incarnon', {
    description: '从0层异常和0层主要·霜冻开始，逐Tick模拟托里德灵化攻击高克斯塔军官；输出击杀时间、DPS与异常建立时间。',
    inputSchema: {
      mods: z.array(z.string().min(1)).min(1),
      riven: z.array(z.object({ stat: z.string(), value: z.number().optional(), multiplier: z.number().optional(), unit: z.string().optional() })).default([]),
      stacks: z.object({ 'on-kill-2-stacks': z.boolean().optional(), 'on-kill-5-stacks': z.boolean().optional() }).default({}),
      composition: z.array(z.enum(['viral', 'corrosive', 'blast', 'radiation', 'magnetic', 'gas', 'cold', 'heat', 'toxin', 'electricity'])).min(1),
      target: z.object({ level: z.number().int().min(1).max(9999).default(200), steelPath: z.boolean().default(true) }).default({ level: 200, steelPath: true }),
      primaryFrostbite: z.boolean().default(false), trials: z.number().int().min(100).max(100000).default(10000), seed: z.number().int().default(20260714),
      evolutions: z.array(z.enum(['finalFusillade', 'survivorsEdge'])).default(['finalFusillade', 'survivorsEdge'])
    }
  }, async input => {
    const resolvedMods = mods.resolveMany(input.mods);
    const invalid = resolvedMods.filter(mod => !['resolved'].includes(mod.status));
    if (invalid.length) return jsonResult({ status: 'unsupported', invalidMods: invalid, message: '存在无法完整提取的 Mod 词条，已拒绝模拟。' });
    const stats = calculateToridIncarnon({ ...input, resolvedMods });
    const simulation = simulateToridIncarnon({ stats, target: input.target, composition: input.composition, trials: input.trials, seed: input.seed, primaryFrostbite: input.primaryFrostbite });
    return jsonResult({ status: 'ok', resolvedMods, stats, simulation });
  });
  return server;
}
async function main() { const server = createWarframeMcpServer(); await server.connect(new StdioServerTransport()); }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { createWarframeMcpServer };
