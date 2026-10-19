'use strict';

// 守护俗称走的是 knowledge/facts/aliases.json 的 companions 域（与战甲、武器共用同一张复核别名表）。
// 回归点：俗称必须能解析到守护家族，否则「照相机头」会掉进通用部件归一化（头→Neuroptics），
// 变成「照相机 Neuroptics Blueprint」并报"未识别可交易物品"。
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCompanionFamily, resolveCompanionVariantIntent } = require('../src/companion-variant-family');

test('守护俗称从共享复核别名表解析（照相机 = Helios）', () => {
  const family = resolveCompanionFamily('照相机');
  assert.ok(family, '照相机 应解析到守护家族');
  assert.equal(family.base.canonical, 'Helios');
  assert.equal(family.prime.canonical, 'Helios Prime');

  const variant = resolveCompanionVariantIntent('照相机');
  assert.equal(variant.identity.canonical, 'Helios');
  assert.equal(variant.family.prime.canonical, 'Helios Prime');
});

test('同一张表里的其他俗称与正式名同样生效', () => {
  for (const alias of ['摄像头', '拍照', '赫利俄斯', 'Helios', '死亡魔方', '搬运者']) {
    const family = resolveCompanionFamily(alias);
    assert.ok(family, `${alias} 应解析到守护家族`);
  }
});

test('未知名字仍然解析失败，不放过任意字符串', () => {
  assert.equal(resolveCompanionFamily('不存在的守护xyz'), null);
  assert.equal(resolveCompanionVariantIntent(''), null);
});
