'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const coreModule = require('..')
const sync = require('../scripts/sync-resource-knowledge')

const ROOT = path.resolve(__dirname, '..')
const RESOURCE_ROOT = path.join(ROOT, 'knowledge', 'acquisition', 'resource')

test('资源知识自动编译并区分自动层与人工技巧层', () => {
  const entry = sync.buildPlan().entries.find(item => item.subject.canonical === 'Argon Crystal')
  assert.equal(entry.resourceAcquisition.generated.routing.category, 'resource-location')
  assert.ok(entry.resourceAcquisition.manual.tips.includes('击杀敌人、破坏容器并寻找氩结晶矿脉；氩结晶会随现实时间衰减，最好在准备制造对应物品时再刷取。'))
  assert.ok(entry.resourceAcquisition.manual.tipKeywords.includes('衰减'))
})

test('同步资源时保留人工技巧、关键词和路由覆盖', () => {
  const official = require('../knowledge/generated/official-items.json').items.find(item => item.canonical === 'Argon Crystal')
  const old = {
    updatedAt: '2026-07-14', prerequisites: [], methodRefs: [],
    resourceAcquisition: { manual: { tips: ['携带资源探测类 Mod，优先寻找氩结晶岩柱。'], tipKeywords: ['探测', '岩柱'], routingOverride: { category: 'resource-location', variables: { resourceName: '氩结晶', locationIds: ['planet.void'] }, status: 'compiled' }, reviewedBy: ['manual-review'] } }
  }
  const next = sync.buildEntry(official, old)
  assert.deepEqual(next.resourceAcquisition.manual, old.resourceAcquisition.manual)
  assert.equal(next.reviewStatus, 'approved')
})

test('刷资源读取 method JSON 并只发布已结构化资源', () => {
  const core = coreModule.createKnowledgeCore()
  assert.equal(core.getResourceAcquisition('氩结晶').routeText, '推荐前往虚空收集氩结晶')
  assert.match(core.getResourceAcquisition('氩结晶').text, /小技巧：/)
  assert.equal(core.getAcquisition('氩结晶').resourceRoute.source, 'resource-method')
  const unresolved = core.listResources().find(item => item.reviewStatus === 'draft')
  assert.ok(unresolved)
  assert.equal(core.getResourceAcquisition(unresolved.canonical), null)
})

test('所有已批准资源都能通过 method 模板渲染且不含原始英文地点', () => {
  const core = coreModule.createKnowledgeCore()
  for (const item of core.listResources().filter(resource => resource.reviewStatus === 'approved')) {
    const result = core.getResourceAcquisition(item.canonical)
    assert.ok(result?.routeText, item.canonical)
    assert.doesNotMatch(result.routeText, /\b(?:Earth|Venus|Mars|Ceres|Saturn|Void|Deimos|Eris|Lua)\b/, item.canonical)
  }
})

test('生息精华仲裁来源不泄漏游戏富文本图标',()=>{const core=coreModule.createKnowledgeCore({approvedOnly:false}),text=core.getAcquisition('生息精华').description;assert.match(text,/完成仲裁任务的轮次奖励/);assert.doesNotMatch(text,/<DT_|[⚡🔥☠❄]/)});
test('资源 method 目录覆盖索引中的全部分类', () => {
  const index = JSON.parse(fs.readFileSync(path.join(RESOURCE_ROOT, 'categories.json'), 'utf8'))
  const methods = coreModule.resourceAcquisition.METHODS
  for (const item of index.resources) assert.ok(methods[item.category], item.category)
})

test('刷 碲使用官方简中获取文案且不会落入希图斯赏金模板', () => {
  const core = coreModule.createKnowledgeCore({ approvedOnly: false })
  assert.deepEqual(core.parseAcquisitionCommand('刷 碲'), { intent: 'acquisition', query: '碲' })
  const candidates = core.searchOfficialItems('碲', { limit: 20 })
  assert.deepEqual(candidates.map(item => item.canonical), ['Tellurium'])
  assert.equal(core.resolveItem('碲').item.canonical, 'Tellurium')

  const result = core.getAcquisition('碲')
  assert.equal(result.entry.id, 'knowledge.acquisition.resource.tellurium')
  assert.equal(result.entry.resourceAcquisition.generated.routing.category, 'resource-activity')
  assert.match(result.description, /获取地点：天王星上的曲翼任务/)
  assert.doesNotMatch(result.description, /希图斯赏金/)
  assert.deepEqual(result.entry.methodRefs, [])
  assert.deepEqual(result.requirements, { type: 'none' })
  assert.deepEqual(result.requirementLines, [])
  assert.deepEqual(result.structuredMethods.map(method => ({
    type: method.type,
    category: method.category,
    locationId: method.locationId,
    locationDisplayName: method.locationDisplayName,
    requirements: method.requirements,
    requirementLines: method.requirementLines
  })), [{
    type: 'route',
    category: 'resource-activity',
    locationId: 'planet.uranus',
    locationDisplayName: '天王星',
    requirements: { type: 'none' },
    requirementLines: []
  }])
})

test('刷 纳米孢子使用官方稳定身份和具体星球结构化来源', () => {
  const core = coreModule.createKnowledgeCore({ approvedOnly: false })
  assert.deepEqual(core.parseAcquisitionCommand('刷 纳米孢子'), { intent: 'acquisition', query: '纳米孢子' })
  const result = core.getAcquisition('纳米孢子')
  assert.equal(result.entry.subject.displayName, '纳米孢子')
  assert.equal(result.entry.subject.canonical, 'Nano Spores')
  assert.equal(result.entry.subject.officialUniqueName, '/Lotus/Types/Items/MiscItems/Nanospores')
  assert.equal(result.entry.subject.category, 'resource')
  assert.equal(result.structuredMethods.length, 1)
  assert.equal(result.structuredMethods[0].category, 'resource-location')
  assert.deepEqual(result.structuredMethods[0].variables.locationIds, ['planet.saturn', 'planet.neptune', 'planet.eris'])
  assert.match(result.description, /土星、海王星、阋神星/)
})

test('Toroid 家族完整解析为五个官方资源身份、图片和结构化来源', () => {
  const core = coreModule.createKnowledgeCore({ approvedOnly: false })
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'generated', 'resource-asset-catalog.json'), 'utf8'))
  const expected = [
    ['/Lotus/Types/Gameplay/Venus/Resources/ArachnoidHungerItem', 'Calda Toroid', '告达环型装置'],
    ['/Lotus/Types/Gameplay/Venus/Resources/ArachnoidCamperItem', 'Crisma Toroid', '圣油环型装置'],
    ['/Lotus/Types/Gameplay/Venus/Resources/ArachnoidCamperTerraItem', 'Lazulite Toroid', '天蓝环型装置'],
    ['/Lotus/Types/Gameplay/Venus/Resources/ArachnoidWraithItem', 'Sola Toroid', '索拉环型装置'],
    ['/Lotus/Types/Gameplay/Venus/Resources/ArachnoidMicroidItem', 'Vega Toroid', '维加环型装置']
  ]
  const collection = core.getResourceCollection('环形装置')
  assert.equal(collection.candidates.length, expected.length)
  assert.equal(core.getAcquisition('环形装置').resolution.ambiguous.length, expected.length)
  for (const [uniqueName, canonical, displayName] of expected) {
    const item = core.getOfficialItem(uniqueName)
    assert.equal(item.canonical, canonical)
    assert.equal(item.displayName, displayName)
    assert.equal(item.sourceCategory, 'Resources')
    assert.ok(item.semanticKinds.includes('resource'))
    assert.equal(item.semanticKinds.includes('consumable'), false)
    const entry = core.getResourceAcquisition(displayName.replace('环型', '环形'))
    assert.equal(entry.entry.subject.officialUniqueName, uniqueName)
    assert.deepEqual(entry.entry.subject.roleTags, ['resource', 'exchange-token', 'standing-turn-in'])
    assert.ok(entry.structuredMethods.length > 0)
    assert.ok(entry.structuredMethods.every(method => method.requirements && Array.isArray(method.requirementLines)))
    const asset = catalog.entries.find(candidate => candidate.stableIdentity.uniqueName === uniqueName)
    assert.equal(asset.catalogStatus, 'ready')
    assert.ok(asset.expectedMediaFilename)
  }
})

test('奥布山谷全量已发布资源按族结构化且仅保留两项证据不足待审', () => {
  const core = coreModule.createKnowledgeCore({ approvedOnly: false })
  const entries = coreModule.resourceAcquisition.ENTRIES.filter(entry => /^\/Lotus\/(?:Types\/Gameplay\/Venus|Types\/Items\/Solaris|Types\/Items\/Gems\/Solaris|Types\/Items\/Fish\/Solaris)/.test(entry.subject.officialUniqueName))
  const unresolved = entries.filter(entry => entry.subject.categoryRefs.includes('resource-unresolved'))
  assert.deepEqual(unresolved.map(entry => entry.subject.canonical).sort(), ['Frostcap', 'Orokin Monitor'])
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'generated', 'resource-asset-catalog.json'), 'utf8'))
  for (const entry of entries.filter(item => !unresolved.includes(item))) {
    const result = core.getResourceAcquisition(entry.subject.canonical)
    assert.ok(result?.structuredMethods.length, entry.subject.canonical)
    assert.ok(result.structuredMethods.every(method => method.requirements && Array.isArray(method.requirementLines)), entry.subject.canonical)
    const asset = catalog.entries.find(item => item.stableIdentity.uniqueName === entry.subject.officialUniqueName)
    assert.ok(asset, `${entry.subject.canonical} 缺图片身份`)
    assert.ok(asset.expectedMediaFilename, `${entry.subject.canonical} 缺预期图片文件名`)
  }
  for (const canonical of ['Training Debt-Bond', 'Shelter Debt-Bond', 'Medical Debt-Bond', 'Advances Debt-Bond', 'Familial Debt-Bond', 'Gyromag Systems', 'Atmo Systems', 'Repeller Systems', 'Thermal Sludge', 'Gorgaricus Spore']) {
    const entry = entries.find(item => item.subject.canonical === canonical)
    const asset = catalog.entries.find(item => item.stableIdentity.uniqueName === entry.subject.officialUniqueName)
    assert.ok(['ready', 'review-required'].includes(asset.catalogStatus), `${canonical} 图片目录无效`)
    assert.equal(fs.existsSync(path.resolve(ROOT, '..', 'warframe-content', 'resource-images', asset.expectedMediaFilename)), true, `${canonical} 图片文件缺失`)
  }
  for (const canonical of ['Training Debt-Bond', 'Shelter Debt-Bond', 'Medical Debt-Bond', 'Advances Debt-Bond', 'Familial Debt-Bond']) {
    const methods = core.getResourceAcquisition(canonical).structuredMethods
    assert.ok(methods.some(method => method.type === 'bounty-reward' && method.npcId === 'npc.eudico'), canonical)
    assert.ok(methods.some(method => method.type === 'vendor-purchase' && method.npcId === 'npc.ticker'), canonical)
  }
  for (const canonical of ['Gyromag Systems', 'Atmo Systems', 'Repeller Systems']) {
    const methods = core.getResourceAcquisition(canonical).structuredMethods
    assert.equal(methods.filter(method => method.type === 'heist-reward').length, 4, canonical)
    assert.ok(methods.some(method => method.type === 'syndicate-exchange' && method.npcId === 'npc.little-duck'), canonical)
  }
  assert.ok(core.getResourceAcquisition('Thermal Sludge').structuredMethods.some(method => method.type === 'open-world-gathering'))
  assert.ok(core.getResourceAcquisition('Gorgaricus Spore').structuredMethods.some(method => method.type === 'bounty-reward'))
  assert.ok(core.getResourceAcquisition('Scrap').structuredMethods.some(method => method.type === 'resource-processing'))
})

test('开放世界兑换型资源目录不会因用途被归入消耗品', () => {
  const official = require('../knowledge/generated/official-items.json').items
  const openWorldTokens = official.filter(item => /\/(?:Venus|Solaris|Eidolon|Ostron|Deimos|Entrati)\//.test(item.uniqueName) && item.semanticKinds.some(kind => ['resource', 'currency', 'currency-token', 'currency-token-material'].includes(kind)))
  assert.ok(openWorldTokens.length > 0)
  assert.ok(openWorldTokens.every(item => !item.semanticKinds.includes('consumable')))
})

test('钢铁精华与堕落全息密钥使用结构化审核来源', () => {
  const core = coreModule.createKnowledgeCore({ approvedOnly: false })
  const steel = core.getResourceAcquisition('钢铁精华')
  assert.ok(steel)
  assert.equal(steel.structuredMethods.find(method => method.sourceDisplayName?.startsWith('追随者')).quantity, 2)
  assert.equal(steel.structuredMethods.find(method => method.sourceDisplayName === '钢铁之路虚空裂缝').quantity, 1)
  assert.equal(steel.structuredMethods.find(method => method.sourceDisplayName === '钢铁无尽回廊第 9 阶段').quantity, 25)
  assert.match(steel.text, /追随者.*2个/)
  assert.match(steel.text, /开启 1 个虚空遗物.*1个/)
  assert.doesNotMatch(steel.text, /^[- ]*(?:\||\d+(?:\.\d+)?|100%（100%）)[- ]*$/m)

  const holokey = core.getResourceAcquisition('堕落全息密钥')
  assert.ok(holokey)
  const veil = holokey.structuredMethods.filter(method => method.sourceDisplayName === '面纱比邻星域虚空风暴')
  assert.deepEqual(veil.map(method => [method.variables.rewardKind, method.quantity, method.chance]), [['任务完成保底', 2, 1], ['任务结算额外奖励', 10, 0.375]])
  assert.match(holokey.text, /佩兰数列房间找 Ergo Glast；无需加入佩兰数列/)
  assert.match(holokey.text, /消耗40个堕落全息密钥兑换一把轮换的信条近战武器/)
  assert.match(holokey.text, /保底：.*面纱.*2个.*帕尔沃斯的姐妹最终对决（C系玄骸决战）.*每位队员获得1个/)
  assert.match(holokey.text, /概率：.*面纱\/土星\/地球.*约1\/3.*10\/5\/3个.*37\.5%\/35\.71%\/37\.5%/)
  assert.match(holokey.text, /无尽任务的轮次结算不会重复发放保底密钥，生存最终撤离仍可结算/)
  assert.match(holokey.text, /不建议专门从 Corpus（C 系）九重天虚空风暴刷取/)
  assert.doesNotMatch(holokey.text, /效果：A|的Mod|Strongly desired|corrupted decryption key|概率：.*(?<!约)1\/3/)
})

test('全量已发布资源最终文本无原始字段和混合 lore 泄漏', () => {
  const core = coreModule.createKnowledgeCore({ approvedOnly: false })
  const published = core.listResources().filter(resource => resource.reviewStatus === 'approved')
  const failures = []
  for (const resource of published) {
    const result = core.getResourceAcquisition(resource.canonical)
    if (!result?.structuredMethods.length) failures.push(`${resource.canonical}: missing structuredMethods`)
    if (!result?.structuredMethods.every(method => method.requirements && Array.isArray(method.requirementLines))) failures.push(`${resource.canonical}: invalid requirements`)
    const lines = String(result?.text || '').split(/\r?\n/).map(line => line.trim())
    if (lines.some(line => /^(?:-|•)?\s*(?:\||\d+(?:\.\d+)?|100%\s*[（(]100%[）)])\s*$/.test(line))) failures.push(`${resource.canonical}: raw table cell`)
    if (/效果：A\b|的Mod\b|Strongly desired|corrupted decryption key/i.test(result?.text || '')) failures.push(`${resource.canonical}: lore/mod leakage`)
  }
  assert.deepEqual(failures, [])
})

test('Stela 只发布实体化赏金来源并把数量概率保持在同一行', () => {
  const core = coreModule.createKnowledgeCore({ approvedOnly: false })
  const result = core.getAcquisition('虚空石块')
  assert.equal(result.entry.reviewStatus, 'approved')
  assert.equal(result.entry.subject.canonical, 'Stela')
  assert.deepEqual(result.structuredMethods.map(method => [method.type, method.sourceDisplayName, method.quantity, method.chance]), [
    ['mission-reward', '阿尔布雷希特的实验室 115-120 级赏金 C轮', 15, 0.084],
    ['mission-reward', '阿尔布雷希特的实验室 95-100 级赏金 C轮', 15, 0.0877]
  ])
  assert.match(result.description, /115-120 级赏金 C轮奖励中获得 15个，概率8\.4%/)
  assert.match(result.description, /95-100 级赏金 C轮奖励中获得 15个，概率8\.77%/)
  assert.doesNotMatch(result.description, /\(Bounty\)|8\.4% \(8\.4%\)|^15$|^1\.26$|^1\.3155$/m)
})

test('全量获取质量门不允许已发布条目泄漏空来源或原始数值行', () => {
  const report = require('../scripts/audit-acquisition-quality').audit()
  assert.equal(report.publishedIssues.some(issue => issue.canonical === 'Stela'), false)
  assert.equal(report.totals.publishedIssueCount, report.publishedIssues.length)
  assert.ok(report.totals.publishedIssueCount > 0)
  assert.ok(report.totals.unresolvedOrReviewRequiredEntries > 0)
  assert.ok(report.reviewRequired.length > 0)
})

test('资源证据区分百分百商店项与真实希图斯赏金', () => {
  const plan = sync.buildPlan()
    const approvedManual = plan.entries.filter(entry => entry.resourceAcquisition?.manual?.routingOverride)
  for (const entry of approvedManual) {
    assert.deepEqual(entry.resourceAcquisition.generated.routing, entry.resourceAcquisition.manual.routingOverride, entry.subject.canonical)
  }

  const vendorEvidence = plan.entries.flatMap(entry => entry.resourceAcquisition.generated.evidence)
    .filter(source => sync.isVendorOffer({ location: source.canonical, chance: source.chance }))
  assert.ok(vendorEvidence.length > 0)
  assert.ok(vendorEvidence.every(source => source.type === 'raw-official-vendor-offer'))

  const cetusWisp = plan.entries.find(entry => entry.subject.canonical === 'Cetus Wisp')
  const bountyEvidence = cetusWisp.resourceAcquisition.generated.evidence
    .filter(source => /Cetus Bounty/.test(source.canonical))
  assert.ok(bountyEvidence.length > 0)
  assert.ok(bountyEvidence.every(source => source.type === 'raw-official-drop' && source.chance < 1))
})
