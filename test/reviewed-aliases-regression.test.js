'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const coreRoot = path.resolve(__dirname, '..');
const core = require(path.join(coreRoot, 'src')).createKnowledgeCore({ root: coreRoot, approvedOnly: false });

const weaponCases = {
  '努寇微波枪': 'Kuva Nukor', '赤毒·努寇微波枪': 'Kuva Nukor', '赤毒努寇微波枪': 'Kuva Nukor',
  '波波': 'Kuva Nukor', 'g波波': 'Kuva Nukor', '波波枪': 'Kuva Nukor', 'g波波枪': 'Kuva Nukor',
  '循环离子枪': 'Tenet Cycron', '信条·循环离子枪': 'Tenet Cycron', '信条循环离子枪': 'Tenet Cycron',
  'c波波': 'Tenet Cycron', 'c波波枪': 'Tenet Cycron', '循环': 'Tenet Cycron', '循环离子': 'Tenet Cycron',
  '玻之武杖': 'Bo', '波棍': 'Bo', '玻棍': 'Bo', '玻杖': 'Bo', '玻璃杖': 'Bo', '玻璃棍': 'Bo',
  '暗黑分合剑': 'Dark Split-Sword', '暗黑': 'Dark Split-Sword', '分合': 'Dark Split-Sword',
  '海波': 'Nami Solo', '皇拐': 'Kronen', '扫描锤': 'Heliocor', '集团扫描锤': 'Synoid Heliocor',
  '食人女魔': 'Kuva Ogris', '赤毒·食人女魔': 'Kuva Ogris', '赤毒食人女魔': 'Kuva Ogris', '女魔': 'Kuva Ogris',
  '喷火器': 'Ignis', '亡魂喷': 'Ignis Wraith', '伊格尼斯亡魂': 'Ignis Wraith', '亡魂喷火器': 'Ignis Wraith',
  '狗弓': 'Paris', '波斯顿': 'Burston', '波士顿': 'Burston',
  '典客': 'Tenet Envoy', '墙中人': 'Tenet Envoy', '信条典客': 'Tenet Envoy',
  '暗杀': 'Sicarus', '毒囊': 'Dual Toxocyst', '希瓦': 'Silva & Aegis', '席瓦': 'Silva & Aegis',
  '饭勺': 'Silva & Aegis', '马桶': 'Silva & Aegis', '封魔': 'Phenmor', '风殁': 'Phenmor', '凤殁': 'Phenmor',
  '钓鱼竿': 'Vulkar', '骨葬': 'Gotva Prime', '杀格': 'Sagek Prime', '葬鸣': 'Epitaph',
  '阿利乌': 'Akarius', '波动拳': 'Staticor', '波波拳': 'Staticor', '诗人': 'Nikana', '沙匕': 'Karyst',
  'i爪': 'Keratinos', '玻璃锤': 'Volnus', '双短': 'Dual Kamas', '天顶': 'Zenistar', '天穹': 'Zenith',
  '西格玛': 'Sigma & Octantis', '饿狼': 'Wolf Sledge', '恶狼': 'Wolf Sledge', '饿狼战锤': 'Wolf Sledge',
  '瓦斯提': 'Vastilok', '瓦斯托': 'Vastilok', '什长': 'Dual Decurion', '极速': 'Velocitus', '葛炮': 'Grattler',
  '布拉玛': 'Kuva Bramma', '怒雷': 'Kuva Ayanga', 'g鞭': 'Atterax', 'c鞭': 'Lecta', '钱鞭': 'Secura Lecta', '尿壶': 'Atomos',
  'c喷': 'Tenet Arca Plasmor', 'i喷': 'Coda Bassocyst'
};

const equipmentCases = {
  '照相机': 'Helios', '摄像头': 'Helios', '拍照': 'Helios',
  '隐身狗': 'Huras Kubrow', '阴影狗': 'Huras Kubrow', '隐匿狗': 'Huras Kubrow', '匿踪狗': 'Huras Kubrow',
  '铁甲狐': 'Panzer Vulpaphyla', '狐狸': 'Panzer Vulpaphyla',
  '猎杀狗': 'Sunika Kubrow', '护盾狗': 'Raksa Kubrow', '护盾型库狛': 'Raksa Kubrow', '盾狗': 'Raksa Kubrow',
  'i狗': 'Helminth Charger', '巡猎型库狛': 'Chesa Kubrow', '巡猎狗': 'Chesa Kubrow',
  '突击狗': 'Sahasa Kubrow', '挖掘狗': 'Sahasa Kubrow', '血猫': 'Vasca Kavat', '吸血猫': 'Vasca Kavat',
  '法老狗': 'Pharaoh Predasite', '毒狗': 'Pharaoh Predasite', '大蜘蛛狗': 'Pharaoh Predasite', '蜘蛛狗': 'Pharaoh Predasite',
  '黑翅': 'Itzal', '奶翅': 'Amesha', 'O翅': 'Odonata', '机甲': 'Voidrig'
};

test('reviewed weapon aliases resolve to the requested exact variant', () => {
  for (const [query, canonical] of Object.entries(weaponCases)) {
    const result = core.resolveWeapon(query);
    assert.equal(result?.canonical, canonical, query);
    const acquisition = core.resolveItem(query);
    assert.equal(
      acquisition?.item?.subject?.canonical || acquisition?.item?.canonical || acquisition?.subject?.canonical,
      canonical,
      `acquisition:${query}`
    );
    assert.equal(core.resolveRivenWeapon(query)?.canonical, canonical, `riven:${query}`);
  }
});

test('reviewed aliases override colliding official base names in acquisition and riven resolution', () => {
  for (const [query, canonical] of Object.entries({
    '努寇微波枪': 'Kuva Nukor',
    '循环离子枪': 'Tenet Cycron',
    '食人女魔': 'Kuva Ogris',
    '波棍': 'Bo',
    '布拉玛': 'Kuva Bramma',
    '怒雷': 'Kuva Ayanga',
    'c喷': 'Tenet Arca Plasmor',
    'i喷': 'Coda Bassocyst'
  })) {
    const acquisition = core.resolveItem(query);
    assert.equal(acquisition?.item?.subject?.canonical || acquisition?.item?.canonical || acquisition?.subject?.canonical, canonical, `acquisition:${query}`);
    assert.equal(core.resolveRivenWeapon(query)?.canonical, canonical, `riven:${query}`);
  }
});

test('别称的「倾向于 / prefer」把别名落到声明的变体身份，同时保留家族归属', () => {
  // 钱鞭 泛指整个 Lecta 家族（仍登记在 Lecta 下），实体级解析倾向保障勒克塔；c鞭 保持普通勒克塔。
  assert.equal(core.resolveWeapon('钱鞭')?.canonical, 'Secura Lecta');
  assert.equal(core.resolveWeapon('c鞭')?.canonical, 'Lecta');
  assert.deepEqual(core.aliasPreferences?.['钱鞭'], { section: 'weapons', from: 'Lecta', prefer: 'Secura Lecta' });
  const facts = core.normalizeAliasFacts({
    weapons: { A: ['x', 'y'] },
    aliasPreferences: { y: { section: 'weapons', prefer: 'B' } }
  });
  assert.deepEqual(facts.weapons, { A: ['x'], B: ['y'] });
  assert.deepEqual(facts.aliasPreferences.y, { section: 'weapons', from: 'A', prefer: 'B' });
  // 别称事实保持扁平数组结构，直接读取的旧消费方不会看到对象条目
  assert.ok(Array.isArray(facts.weapons.A));
  assert.ok(Array.isArray(facts.weapons.B));
});

test('companion and vehicle aliases preserve exact identity and do not shadow Shade', () => {
  for (const [query, canonical] of Object.entries(equipmentCases)) {
    assert.equal(core.resolveEquipmentIdentity(query)?.canonical, canonical, query);
  }
  assert.equal(core.resolveEquipmentIdentity('阴影狗')?.canonical, 'Huras Kubrow');
  assert.equal(core.resolveEquipmentIdentity('阴影')?.canonical, 'Shade');
});
