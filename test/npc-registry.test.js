'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createKnowledgeCore } = require('../src')
const { buildPlan } = require('../scripts/sync-npcs')

const root = path.resolve(__dirname, '..')
const wikiDb = path.join(root, '.cache', 'warframe-wiki.sqlite')

test('NPC categories 索引覆盖 Wiki Characters 全量角色页', () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'knowledge', 'npc', 'categories.json'), 'utf8'))
  const plan = buildPlan(wikiDb)
  assert.equal(index.count, plan.records.length)
  assert.equal(new Set(index.npcs.map(item => item.id)).size, index.count)
  assert.ok(index.npcs.some(item => item.canonical === 'Lotus' && item.file === 'lotus.json'))
  assert.ok(index.npcs.some(item => item.canonical === 'Konzu' && item.file === 'cetus/konzu.json'))
  assert.ok(index.npcs.some(item => item.canonical === 'Fibonacci' && item.file === 'sanctum-anatomica/fibonacci.json'))
})

test('NPC 使用离线官方语言精确匹配，未证实项仍禁止猜译', () => {
  const core = createKnowledgeCore({ root })
  const fibonacci = core.getNpc('Fibonacci')
  assert.equal(fibonacci.displayName, '斐波那契')
  assert.equal(fibonacci.localization.status, 'official-zh')
  assert.equal(fibonacci.localization.languageKey, '/Lotus/Language/Entrati/Fibonacci')
  const localizedContext = core.buildWikiContext('Fibonacci')
  assert.equal(localizedContext.entityVariables[0].displayName, '斐波那契')
  assert.equal(localizedContext.entityVariables[0].localized, true)

  const unresolved = core.getNpc('Cressa Tal')
  assert.equal(unresolved.displayName, '')
  const unresolvedContext = core.buildWikiContext('Cressa Tal')
  assert.equal(unresolvedContext.entityVariables[0].displayName, 'Cressa Tal')
  assert.equal(unresolvedContext.entityVariables[0].localized, false)
  assert.match(unresolvedContext.text, /禁止自行翻译、音译或补中文/)
})

test('地点、阵营、任务、货币与敌人均可作为按需实体变量查询', () => {
  const core = createKnowledgeCore({ root })
  assert.equal(core.getLocation('Sanctum Anatomica').displayName, '解剖圣所')
  assert.equal(core.getFaction('Narmer').displayName, '合一众')
  assert.ok(core.resolveEntityVariables('Narmer').some(item => item.id === 'faction.narmer'))
  assert.ok(core.resolveEntityVariables('The Limbo Theorem').some(item => item.id === 'quest.the-limbo-theorem'))
  assert.ok(core.resolveEntityVariables('Credits').some(item => item.id === 'currency.credits'))
  assert.ok(core.resolveEntityVariables('Mutalist Alad V').some(item => item.id === 'enemy.mutalist-alad-v'))
})
