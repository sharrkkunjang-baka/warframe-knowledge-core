'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createKnowledgeCore } = require('../src')
const { buildPlan } = require('../scripts/sync-npcs')

const root = path.resolve(__dirname, '..')

test('NPC categories 索引覆盖 Wiki Characters 全量角色页', () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'npc', 'categories.json'), 'utf8'))
  const plan = buildPlan()
  assert.equal(index.count, plan.records.length)
  assert.equal(new Set(index.npcs.map(item => item.id)).size, index.count)
  assert.ok(index.npcs.some(item => item.canonical === 'Lotus' && item.file === 'lotus.json'))
  assert.ok(index.npcs.some(item => item.canonical === 'Konzu' && item.file === 'cetus/konzu.json'))
  assert.ok(index.npcs.some(item => item.canonical === 'Fibonacci' && item.file === 'sanctum-anatomica/fibonacci.json'))
})

test('未审核 NPC 中文为空，查询上下文保留英文且禁止猜译', () => {
  const core = createKnowledgeCore({ root })
  const npc = core.getNpc('Fibonacci')
  assert.equal(npc.displayName, '')
  const context = core.buildWikiContext('Fibonacci')
  assert.equal(context.entityVariables[0].displayName, 'Fibonacci')
  assert.equal(context.entityVariables[0].localized, false)
  assert.match(context.text, /禁止自行翻译、音译或补中文/)
})

test('地点与阵营均可作为按需实体变量查询', () => {
  const core = createKnowledgeCore({ root })
  assert.equal(core.getLocation('Sanctum Anatomica').displayName, '解剖圣所')
  assert.equal(core.getFaction('Narmer').displayName, '合一众')
  assert.ok(core.resolveEntityVariables('Narmer').some(item => item.id === 'faction.narmer'))
})
