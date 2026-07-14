'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const acquisition = require('../src/frame-acquisition');

const recipe = (resultType, ingredients, creditsCost = 0) => ({ resultType, ingredients: ingredients.map(([ItemType, ItemCount]) => ({ ItemType, ItemCount })), creditsCost });
const chroma = acquisition.resolveWarframe('Chroma');
const chromaParts = acquisition.getComponentDrops(chroma);
const componentPath = part => chromaParts.find(item => item.part === part).uniqueName;
const liveRecipes = {
  [componentPath('Neuroptics')]: recipe('/Built/ChromaNeuroptics', [['/Lotus/Types/Recipes/WarframeRecipes/VoltHelmetComponent', 1], ['/Resource/NeuralSensors', 2]], 15000),
  [componentPath('Chassis')]: recipe('/Built/ChromaChassis', [['/Lotus/Types/Recipes/WarframeRecipes/FrostChassisComponent', 1], ['/Resource/Morphics', 2]], 15000),
  [componentPath('Systems')]: recipe('/Built/ChromaSystems', [['/Lotus/Types/Recipes/WarframeRecipes/EmberSystemsComponent', 1], ['/Lotus/Types/Recipes/WarframeRecipes/SarynSystemsComponent', 1]], 15000),
  '/ChromaAssemblyBlueprint': recipe(chroma.uniqueName, [[componentPath('Neuroptics'), 1], [componentPath('Chassis'), 1], [componentPath('Systems'), 1], ['/Lotus/Types/Items/MiscItems/OrokinCell', 1]], 25000)
};

test('resolves official names and audited aliases without guessing', () => {
  assert.equal(acquisition.resolveWarframe('Wisp').name, 'Wisp');
  assert.equal(acquisition.resolveWarframe('龙').name, 'Chroma');
  assert.equal(acquisition.resolveWarframe('色彩'), null);
  assert.equal(acquisition.resolveWarframe('不存在战甲'), null);
  assert.equal(acquisition.resolveWarframe('banshee prime').name, 'Banshee Prime');
  assert.equal(acquisition.resolveWarframe('音妈 P版').name, 'Banshee Prime');
  assert.equal(acquisition.resolveWarframe('卡利班 Prime').name, 'Caliban Prime');
  assert.equal(acquisition.resolveWarframe('卡利班p').name, 'Caliban Prime');
  assert.equal(acquisition.resolveWarframe('calibanp').name, 'Caliban Prime');
});

test('sentence-level resolver locks the frame before intent and related entries', () => {
  for (const query of ['Chroma 怎么刷', '刷 Chroma', '普通龙怎么刷', '龙战甲如何获得']) {
    const resolved = acquisition.resolveWarframeMention(query);
    assert.equal(resolved.frame.name, 'Chroma', query);
  }
  assert.equal(acquisition.resolveWarframeMention('幻彩之刃怎么刷'), null);
});

test('Wisp exposes four blueprint drops and decimal probabilities', () => {
  const drops = acquisition.getComponentDrops('Wisp');
  assert.deepEqual(drops.map(item => item.part), acquisition.PARTS);
  assert.equal(drops[0].drops[0].location, 'Jupiter/The Ropalolyst (Assassination)');
  assert.equal(acquisition.formatChance(drops[0].drops[0].chance), '22.56%');
  assert.equal(acquisition.formatChance(22.56), '22.56%');
});

test('Oberon summarizes audited Proxima outpost rewards without node or cache mistranslation', () => {
  const rendered = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe('Oberon'), materials: { available: false } });
  assert.match(rendered, /头：完成地球比邻星域任务中的前哨站额外目标：10%/);
  assert.match(rendered, /机体：完成土星比邻星域任务中的前哨站额外目标：10%/);
  assert.match(rendered, /系统：完成地球比邻星域任务中的前哨站额外目标：10%/);
  assert.doesNotMatch(rendered, /Bendar|Kasio|Iota Temple|Caches|白色储藏箱|虚空风暴/);
});
test('Caliban explains Narmer bounty rotation without backend letters or probabilities', () => {
  const rendered = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe('Caliban'), materials: { available: false } });
  assert.match(rendered, /当前奖励预览出现头部蓝图时刷/);
  assert.match(rendered, /每 150 分钟更换一批奖励/);
  assert.match(rendered, /系统 → 机体 → 头 → 重复/);
  assert.match(rendered, /希图斯白天找孔祝/);
  assert.match(rendered, /希图斯夜晚则去福尔图娜找尤迪科/);
  assert.doesNotMatch(rendered, /轮换 [ABC]|5\.45%|7\.5%|8\.11%/);
});

test('bounty frames show vendor and tier without stage probabilities or backend rotations', () => {
  const cases = [
    ['Gara', '在希图斯找孔祝接取20-40 级赏金'],
    ['Garuda', '在福尔图娜找尤迪科接取20-40 级赏金'],
    ['Xaku', '在魔胎之境找母亲接取15-25 级赏金'],
    ['Gyre', '在扎里曼号找奎因接取50-55 级赏金']
  ];
  for (const [name, expected] of cases) {
    const rendered = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe(name), materials: { available: false } });
    assert.match(rendered, new RegExp(expected));
    assert.doesNotMatch(rendered, /Rotation|轮换 [ABC]|\d+(?:\.\d+)?%/);
  }
});

test('Chroma sources split Simaris purchase from one-time quest rewards', () => {
  const rendered = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe('Chroma'), materials: { available: false } });
  assert.match(rendered, /总图：首次完成《新疑谜团》获得该蓝图；之后可在中枢 Simaris 处回购/);
  assert.match(rendered, /头：首次完成《天王星接合点》获得该蓝图；之后可在中枢 Simaris 处回购/);
  assert.match(rendered, /机体：首次完成《海王星接合点》获得该蓝图；之后可在中枢 Simaris 处回购/);
  assert.match(rendered, /系统：首次完成《冥王星接合点》获得该蓝图；之后可在中枢 Simaris 处回购/);
  assert.doesNotMatch(rendered, /100%|Complete|Junction/);
});

test('quest acquisition uses official Chinese names', () => {
  const gara = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe('Gara'), materials: { available: false } });
  assert.match(gara, /《萨娅的守夜》/);
  const nidus = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe('Nidus'), materials: { available: false } });
  assert.match(nidus, /《Glast 的千钧一策》/);
  assert.doesNotMatch(`${gara}\n${nidus}`, /Saya|Glast Gambit|沙娅|千篇一律/);
});

test('official-generated indexes resolve new Prime variants and quest series', () => {
  const prime = acquisition.resolveWarframe('水妹p');
  assert.equal(prime?.name, 'Yareli Prime');
  assert.equal(prime?.isPrime, true);
  assert.notEqual(prime, acquisition.resolveWarframe('水妹'));
  const renderedPrime = acquisition.renderAcquisition({
    frame: prime,
    prime: acquisition.getPrimeRelics(prime, null, {}),
    materials: { available: false }
  });
  assert.match(renderedPrime, /总图：.*前纪 D8（银）/);
  assert.match(renderedPrime, /系统：中纪 Y1（金）/);
  assert.doesNotMatch(renderedPrime, /系统：后纪 Y1/);

  const yareli = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe('水妹'), materials: { available: false } });
  assert.match(yareli, /总图：首次完成《驭浪者》获得该蓝图；之后可在中枢 Simaris 处回购/);
  assert.match(yareli, /头：在氏族道场的通风小子实验室完成研究后复制该部件蓝图/);
  assert.doesNotMatch(yareli, /The Waverider|官方结构化数据缺少/);
});

test('fixed-system frames never render empty drop placeholders', () => {
  const volt = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe('Volt'), materials: { available: false } });
  assert.match(volt, /Tenno 实验室完成研究后复制蓝图/);
  const vauban = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe('Vauban'), materials: { available: false } });
  assert.match(vauban, /商店购买（35000 现金）/);
  assert.match(vauban, /午夜电波贡品兑换（25 午夜电波货币）/);
  const grendel = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe('Grendel'), materials: { available: false } });
  assert.match(grendel, /仲裁阁下/);
  const kullervo = acquisition.renderAcquisition({ frame: acquisition.resolveWarframe('Kullervo'), materials: { available: false } });
  assert.match(kullervo, /言录使/);
  assert.match(kullervo, /Kullervo 的灾刃/);
  assert.doesNotMatch(kullervo, /Acrithis|Bane/);
  for (const rendered of [volt, vauban, grendel, kullervo]) assert.doesNotMatch(rendered, /暂无可靠掉落数据/);
});

test('Caliban Prime uses audited current relics when npm data lags', () => {
  const frame = acquisition.resolveWarframe('caliban prime');
  assert.equal(frame.name, 'Caliban Prime');
  const prime = acquisition.getPrimeRelics(frame, null, null);
  assert.equal(prime.status, '当前出库');
  assert.match(acquisition.renderAcquisition({ frame, prime, materials: frame.materials }), /总图：古纪 V11（银）；前纪 V13（银）；前纪 V15（银）/);
  const rendered = acquisition.renderAcquisition({ frame, prime, materials: frame.materials });
  assert.match(rendered, /头：中纪 C7（金）/);
  assert.doesNotMatch(rendered, /2%|11%|25\.33%/);
});

test('Prime state selects current, resurgence, or vaulted category only', () => {
  const vaulted = acquisition.getPrimeRelics('Volt Prime', null, {});
  assert.equal(vaulted.status, '已入库');
  assert.deepEqual(vaulted.relics, []);
  const axiL4 = require(require('node:path').join(require('node:path').dirname(require.resolve('warframe-items')), 'data', 'json', 'Relics.json')).find(relic => relic.name === 'Axi L4 Intact');
  const itemType = axiL4.uniqueName.replace('/Lotus/', '/Lotus/StoreItems/');
  const resurgence = acquisition.getPrimeRelics('Volt Prime', { Manifest: [{ ItemType: itemType }] }, {});
  assert.equal(resurgence.status, 'Prime 重生');
  assert.ok(resurgence.relics.length > 0);
  assert.ok(resurgence.relics.every(relic => relic.name === 'Axi L4'));
});

test('official drop table determines currently obtainable Prime relics', () => {
  const yareli = acquisition.getPrimeRelics('Yareli Prime', null, {});
  assert.equal(yareli.status, '当前出库');
  assert.deepEqual(yareli.byPart.Systems.map(relic => relic.name), ['Neo Y1']);
  assert.ok(yareli.relics.every(relic => relic.active));
});

test('Chroma materials keep other frame parts atomic and exclude own parts', () => {
  const materials = acquisition.aggregateMaterials('Chroma', liveRecipes);
  assert.equal(materials.available, true);
  const names = materials.manufacturedParts.map(item => item.name).join(' ');
  assert.match(names, /Volt/);
  assert.match(names, /Ember/);
  assert.match(names, /Frost/);
  assert.match(names, /Saryn/);
  assert.ok(!materials.resources.some(item => /Chroma/i.test(item.name)));
  assert.equal(materials.credits.name, '现金');
  assert.equal(materials.credits.count, 70000);
});

test('Caliban official recipes produce complete material totals', async () => {
  const recipes = await acquisition.loadRecipes();
  const materials = acquisition.aggregateMaterials('Caliban', recipes);
  assert.equal(materials.available, true);
  assert.deepEqual(Object.fromEntries(materials.resources.map(item => [item.name, item.count])), {
    '合一众塑讯块': 40, '六醇燃剂': 30, '摩图斯角': 20, '神经传感器': 10, '塔洛鱼眼': 20,
    '夜灵之息': 30, '异常碎片': 9, '长庚合金': 100, 'Orokin 电池': 12
  });
  assert.equal(materials.credits.count, 155000);
});

test('Sirius & Orion override is auditable and uses Chinese missing-data text', () => {
  const frame = acquisition.resolveWarframe('双子');
  assert.equal(frame.name, 'Sirius & Orion');
  assert.equal(frame.components.length, 4);
  assert.ok(frame.components.every(part => part.drops[0].chance === 14.29));
  const rendered = acquisition.renderAcquisition(frame);
  assert.match(rendered, /Hunhow/);
  assert.match(rendered, /总计 545/);
  assert.ok(rendered.includes('材料统计：\n制造材料数据暂不可用'));
  assert.doesNotMatch(rendered, /unavailable/i);
});

test('ability query resolves number, official Chinese ability and Prime base skills', () => {
  const fourth = acquisition.resolveWarframeAbilityQuery('龙 4 伤害怎么算');
  assert.equal(fourth.frame.name, 'Chroma');
  assert.equal(fourth.ability.index, 4);
  assert.equal(fourth.question, '伤害怎么算');
  const volt = acquisition.resolveWarframeAbilityQuery('Volt 电能释放 范围受什么影响');
  assert.equal(volt.ability.index, 4);
  assert.equal(volt.question, '范围受什么影响');
  const prime = acquisition.resolveWarframeAbilityQuery('Volt Prime 4 强度有什么用');
  assert.equal(prime.frame.name, 'Volt Prime');
  assert.equal(prime.ability.index, 4);
});

test('recipe loader caches network data and falls back on failure', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-acq-'));
  const cachePath = path.join(directory, 'recipes.json');
  const sample = { '/Blueprint': { resultType: '/Result', ingredients: [] } };
  const first = await acquisition.loadRecipes({ cachePath, fetchImpl: async () => ({ ok: true, json: async () => sample }) });
  assert.deepEqual(first, sample);
  const fallback = await acquisition.loadRecipes({ cachePath, fetchImpl: async () => { throw new Error('offline'); } });
  assert.deepEqual(fallback, sample);
});
