'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function withClient(run) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(__dirname, '..', 'src', 'mcp-server.js')], cwd: path.join(__dirname, '..'), stderr: 'pipe' });
  const client = new Client({ name: 'warframe-mcp-test', version: '1.0.0' });
  await client.connect(transport);
  try { await run(client); } finally { await transport.close(); }
}

test('MCP 可列出并调用 Mod 解析工具', async () => withClient(async client => {
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['calculate_torid_incarnon_stats', 'resolve_entity_variables', 'resolve_mod_effects', 'simulate_torid_incarnon']);
  const result = await client.callTool({ name: 'resolve_mod_effects', arguments: { mods: ['低温弹头 Prime', '卑劣加速'] } });
  const value = JSON.parse(result.content[0].text);
  assert.equal(value.mods[0].effects[0].value, 165);
  assert.equal(value.mods[1].effects.find(effect => effect.stat === 'fire-rate').value, 90);
}));

test('MCP 按需发布 NPC、地点与阵营变量并禁止猜译', async () => withClient(async client => {
  const result = await client.callTool({ name: 'resolve_entity_variables', arguments: { query: 'Fibonacci' } });
  const value = JSON.parse(result.content[0].text);
  assert.equal(value.variables[0].id, 'npc.fibonacci');
  assert.equal(value.variables[0].localized, false);
  assert.equal(value.variables[0].displayName, 'Fibonacci');
  assert.match(value.usageRule, /禁止猜译/);
}));

test('MCP 托里德工具自动应用知识库词条', async () => withClient(async client => {
  const riven = [{ stat: 'critical-chance', value: 181.1 }, { stat: 'critical-damage', value: 159.4 }, { stat: 'multishot', value: 107.4 }, { stat: 'faction-grineer', multiplier: 0.54 }];
  const mods = ['并合 膛线', '关键延迟', '弱点感应', '低温弹头 Prime', '致命火力', '高压电流', '卑劣加速'];
  const result = await client.callTool({ name: 'calculate_torid_incarnon_stats', arguments: { mods, riven, stacks: {} } });
  const value = JSON.parse(result.content[0].text);
  assert.equal(value.stats.fireRate, 13.6);
  assert.equal(value.stats.elements.cold, 1.65);
  assert.equal(value.stats.factionMultipliers.grineer, 0.54);
  assert.equal(value.stats.assumptions.some(text => text.includes('0层')), true);
  const simulated = await client.callTool({ name: 'simulate_torid_incarnon', arguments: { mods, riven, composition: ['corrosive', 'cold'], primaryFrostbite: true, target: { level: 200, steelPath: true }, trials: 500, seed: 7 } });
  const simulation = JSON.parse(simulated.content[0].text);
  assert.equal(simulation.status, 'ok');
  assert.ok(simulation.simulation.ttk.mean > 0);
  assert.ok(simulation.simulation.timeline.corrosive10 > 0);
  assert.ok(simulation.simulation.assumptions.some(text => text.includes('0层')));
}));
