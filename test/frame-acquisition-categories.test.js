'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const { ReadonlyWikiDatabase } = require('../src/wiki-db')
const { CATEGORY_DEFINITIONS, classifyFrameAcquisition } = require('../src/frame-acquisition-categories')

const ITEMS_ROOT = path.dirname(require.resolve('warframe-items'))
const WARFRAMES = require(path.join(ITEMS_ROOT, 'data', 'json', 'Warframes.json'))
const DB_PATH = process.env.WF_WIKI_DB || path.join(__dirname, '..', '.cache', 'warframe-wiki.sqlite')
function frame(name) { const value = WARFRAMES.find(item => item.name === name); assert.ok(value, `缺少官方战甲 ${name}`); return value }

test('战甲获取分类定义完整且互不重复', () => {
  assert.equal(new Set(CATEGORY_DEFINITIONS.map(item => item.id)).size, 8)
  assert.deepEqual(CATEGORY_DEFINITIONS.map(item => item.id), ['frame-prime-relic', 'frame-assassination', 'frame-quest', 'frame-mixed-missions', 'frame-specific-mission', 'frame-bounty', 'frame-dojo', 'frame-vendor'])
})

test('根据官方掉落与 Wiki Acquisition 确定性分类', () => {
  const wiki = new ReadonlyWikiDatabase(DB_PATH)
  try {
    assert.deepEqual(classifyFrameAcquisition(frame('Rhino'), wiki.getPage('Rhino')), ['frame-assassination'])
    assert.deepEqual(classifyFrameAcquisition(frame('Ivara'), wiki.getPage('Ivara')), ['frame-mixed-missions'])
    assert.deepEqual(classifyFrameAcquisition(frame('Citrine'), wiki.getPage('Citrine')), ['frame-specific-mission'])
    assert.deepEqual(classifyFrameAcquisition(frame('Caliban'), wiki.getPage('Caliban')), ['frame-bounty'])
    assert.deepEqual(classifyFrameAcquisition(frame('Gyre'), wiki.getPage('Gyre')), ['frame-bounty'])
    assert.deepEqual(classifyFrameAcquisition(frame('Dagath'), wiki.getPage('Dagath')), ['frame-dojo'])
    assert.deepEqual(classifyFrameAcquisition(frame('Kullervo'), wiki.getPage('Kullervo')), ['frame-specific-mission'])
    assert.deepEqual(classifyFrameAcquisition(frame('Jade'), wiki.getPage('Jade')), ['frame-specific-mission'])
    assert.deepEqual(classifyFrameAcquisition(frame('Octavia'), wiki.getPage('Octavia')), ['frame-mixed-missions'])
    assert.deepEqual(classifyFrameAcquisition(frame('Volt'), wiki.getPage('Volt')), ['frame-dojo'])
    assert.deepEqual(classifyFrameAcquisition(frame('Xaku'), wiki.getPage('Xaku')), ['frame-bounty'])
    assert.deepEqual(classifyFrameAcquisition(frame('Ivara Prime'), null), ['frame-prime-relic'])
  } finally { wiki.close() }
})
