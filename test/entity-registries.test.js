'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createKnowledgeCore } = require('../src')
const { readIndexedEntries } = require('../src/entities')

const root = path.resolve(__dirname, '..')
const directories = ['curreicies', 'factions', 'quests', 'locations', 'enemies', 'mission-types']

test('分类实体目录由 categories.json 索引独立 JSON', () => {
  for (const directory of directories) {
    const index = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', directory, 'categories.json'), 'utf8'))
    const entries = readIndexedEntries(root, directory)
    assert.equal(index.count, entries.length, directory)
    assert.equal(new Set(index.variables.map(item => item.id)).size, index.count, directory)
    assert.ok(index.categories.length > 0, directory)
    assert.ok(index.variables.every(item => item.file.includes('/')), directory)
  }
})

test('任务、货币、敌人、地点和阵营都可作为变量查询', () => {
  const core = createKnowledgeCore({ root })
  assert.equal(core.getQuest('The Limbo Theorem').displayName, 'Limbo 定理')
  assert.equal(core.getCurrency('Credits').displayName, '现金')
  assert.equal(core.getEnemy('Mutalist Alad V').displayName, '异融 Alad V')
  assert.equal(core.getLocation('Zariman Ten Zero').displayName, '扎里曼号')
  assert.equal(core.getFaction('Narmer').displayName, '合一众')
  assert.equal(core.getMissionType('Disruption').displayName, '中断')
  assert.equal(core.getCurrency('Vessel Capillaries').displayName, '承载体毛细血管')
  assert.ok(core.resolveEntityVariables('Limbo 定理').some(item => item.id === 'quest.the-limbo-theorem'))
})

test('商人职责合并到 NPC，不再暴露 vendor 注册表', () => {
  const core = createKnowledgeCore({ root })
  assert.ok(core.getNpc('Konzu').roles.includes('bounty-provider'))
  assert.equal(core.getVendor, undefined)
  assert.equal(core.vendors, undefined)
})
