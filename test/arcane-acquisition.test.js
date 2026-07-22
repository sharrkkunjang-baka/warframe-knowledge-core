'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { arcaneFusionMetadata, createKnowledgeCore } = require('..');
const { PROTECTED_DIRECTORIES, structuredAcquisition } = require('../scripts/sync-arcanes');

const core = createKnowledgeCore({ approvedOnly: false });

test('sync protects the authoritative arcane method directory', () => {
  assert.ok(PROTECTED_DIRECTORIES.includes('method'));
  assert.ok(core.arcaneMethods.some(method => method.id === 'arcane.method.authoritative'));
});

test('Arcane Energize exposes display DTO and rank-5 copy count', () => {
  const result = core.getAcquisition('赋能·充沛');
  assert.match(result.description, /战甲赋能/);
  assert.match(result.description, /满级共需 21 个/);
  assert.equal(result.arcane.maxRank, 5);
  assert.equal(result.arcane.requiredCopies, 21);
  assert.ok(result.structuredMethods.length > 0);
  assert.ok(Array.isArray(result.wikiEvidence));
});

test('Primary Merciless merges official methods before Wiki evidence', () => {
  const result = core.getAcquisition('主要·无情');
  assert.equal(result.categories[0].id, 'primary');
  assert.equal(result.structuredMethods[0].provenance.source, 'warframe-items');
  assert.ok(result.wikiEvidence.length > 0);
});

test('Cavia近战赋能显示低语掉落和鸟三声望兑换', () => {
  for (const name of ['近战·憎恶', '近战·暴露']) {
    const result = core.getAcquisition(name);
    assert.match(result.description, /击败嘲讽低语概率获得/);
    assert.match(result.description, /击败严酷低语概率获得/);
    assert.match(result.description, /击败碎裂者·君主概率获得/);
    assert.match(result.description, /在解剖圣所的鸟三处达到4级（学者）声望后消耗7,500声望兑换/);
    assert.match(result.description, /4级（学者）/);
    assert.match(result.description, /7,500声望/);
    assert.ok(result.structuredMethods.some(method => method.sourceCanonical === 'Mocking Whisper'));
    assert.ok(result.structuredMethods.some(method => method.type === 'vendor-or-syndicate-exchange' && method.sourceEntityId === 'npc.bird-3'));
  }
});

test('Shotgun Vendetta accepts the common full category alias', () => {
  const result = core.getAcquisition('霰弹枪·仇杀');
  assert.equal(result.entry.subject.displayName, '霰弹·仇杀');
  assert.equal(result.categories[0].displayName, '霰弹枪赋能');
  assert.ok(result.structuredMethods.length > 0);
});

test('刷赋能简称沿用统一字面与拼音加权解析并限定赋能类别', () => {
  const resolved = core.resolveArcane('赋能升腾');
  assert.equal(resolved.canonical, 'Molt Augmented');
  assert.equal(resolved.category, 'arcane');
  const augmented = core.getAcquisition(resolved.canonical);
  assert.equal(augmented.entry.subject.displayName, '蜕化·升腾');
  const exchange = augmented.structuredMethods.find(method => method.type === 'vendor-or-syndicate-exchange');
  assert.equal(exchange.sourceDisplayName, '坚守者（卡瓦莱罗），大天使');
  assert.deepEqual(exchange.requirementLines, ['在扎里曼号的卡瓦莱罗处达到5级（大天使）声望后消耗10,000声望兑换']);
  assert.doesNotMatch(`${exchange.sourceDisplayName}\n${exchange.requirementLines.join('\n')}`, /Cavalero|Angel/);

  const velocityCommand = core.resolveAcquisitionCommand('刷 赋能迅速');
  assert.equal(velocityCommand.domain, 'arcane');
  assert.equal(velocityCommand.query, '赋能迅速');
  assert.equal(velocityCommand.resolution.canonical, 'Arcane Velocity');
  assert.equal(core.getAcquisition(velocityCommand.resolution.canonical).entry.subject.displayName, '赋能·迅速');

  const unknownArcane = core.resolveAcquisitionCommand('刷 赋能面纱前哨站');
  assert.equal(unknownArcane.domain, 'arcane');
  assert.equal(unknownArcane.resolution?.canonical, undefined);
  assert.equal(core.resolveArcane('赋能精确之外的相似错词')?.canonical, undefined);

  const exact = core.resolveArcane('赋能·充沛');
  assert.equal(exact.canonical, 'Arcane Energize');
  assert.equal(exact.match, 'exact');
});

test('旧日和平九种新赋能完整收录且精湛不误匹配精确', () => {
  const expected = ['赋能·专注','赋能·规避','赋能·精湛','赋能·坚韧','主要·堡垒','主要·衰弱','主要·过载','次要·照射','近战·疾驰'];
  for (const name of expected) assert.ok(core.getArcane(name), name);
  const command = core.resolveAcquisitionCommand('刷 赋能精湛');
  assert.equal(command.resolution.canonical, 'Arcane Expertise');
  const result = core.getAcquisition(command.resolution.canonical);
  assert.equal(result.entry.subject.displayName, '赋能·精湛');
  assert.ok(result.structuredMethods.some(method => method.type === 'reward-or-drop' && /Descendia/.test(method.sourceCanonical)));
  assert.ok(result.structuredMethods.some(method => method.type === 'vendor-or-syndicate-exchange' && /Roathe/.test(method.sourceCanonical)));
  assert.doesNotMatch(result.description, /赋能·精确|Arcane Precision/);
});

test('赋能卡片元数据统一提供真实等级、描述、交易税与市场身份', () => {
  const circumvent = core.getAcquisitionCard('赋能规避');
  assert.equal(circumvent.identity.uniqueName, '/Lotus/Upgrades/CosmeticEnhancers/Defensive/StealDefensiveStatsOnRoll');
  assert.equal(circumvent.arcaneInfo.marketSlug, 'arcane_circumvent');
  assert.equal(circumvent.arcaneInfo.maxRank, 5);
  assert.equal(circumvent.arcaneInfo.requiredCopies, 21);
  assert.equal(circumvent.arcaneInfo.rankFusion.protocol, 'standard-triangular');
  assert.equal(circumvent.arcaneInfo.tradingTax, 8000);
  assert.match(circumvent.arcaneInfo.descriptionLines.join('\n'), /50%.*防御/);

  const rankThree = core.arcanes.map(entry => core.getArcaneMetadata(entry.subject.canonical))
    .find(metadata => metadata.maxRank === 3 && Number.isInteger(metadata.tradingTax));
  assert.ok(rankThree);
  assert.equal(rankThree.maxRank, 3);
  assert.equal(rankThree.requiredCopies, 10);

  const legacy = core.getArcaneMetadata('赋能·求生');
  assert.equal(legacy.tradingTax, null);
  assert.equal(legacy.tradingTaxStatus, 'unavailable-legacy');
  assert.equal(legacy.tradable, false);
});

test('173 项赋能的等级与审核描述全覆盖，当前市场项均有实际交易税', () => {
  const metadata = core.arcanes.map(entry => core.getArcaneMetadata(entry.subject.canonical));
  assert.equal(metadata.length, 173);
  assert.ok(metadata.every(entry => Number.isInteger(entry.maxRank)));
  assert.ok(metadata.every(entry => entry.descriptionLines.length > 0));
  assert.equal(metadata.filter(entry => Number.isInteger(entry.tradingTax)).length, 166);
  assert.equal(metadata.filter(entry => entry.tradingTaxStatus === 'unavailable-legacy').length, 7);
  assert.ok(metadata.every(entry => entry.rankFusion.protocol === 'standard-triangular'));
  assert.ok(metadata.every(entry => entry.requiredCopies === ((entry.maxRank + 1) * (entry.maxRank + 2)) / 2));
});

test('赋能源任务类型由 ExportRegions 节点覆盖掉落表泛化标题', () => {
  const velocity = core.getAcquisition('赋能·迅速');
  const erato = velocity.structuredMethods.find(method => /Erato/.test(method.sourceCanonical));
  const khufu = velocity.structuredMethods.find(method => /Khufu Envoy/.test(method.sourceCanonical));
  assert.equal(erato.sourceDisplayName, '面纱比邻星域/深情之域（奥影），轮次 C');
  assert.equal(khufu.sourceDisplayName, '冥王星比邻星域/胡夫之遣（奥影），轮次 C');
  assert.doesNotMatch(`${erato.sourceDisplayName}\n${khufu.sourceDisplayName}`, /前哨战|Skirmish/);
});

test('syndicate chance=1 is represented as exchange, never a 100% drop', () => {
  const [method] = structuredAcquisition({
    uniqueName: '/Test/Arcane',
    drops: [{ location: 'The Holdfasts (Rank 5)', chance: 1, rarity: 'Common' }]
  });
  assert.equal(method.type, 'vendor-or-syndicate-exchange');
  assert.equal(method.availability, 'guaranteed-when-requirements-met');
  assert.equal(method.chancePercent, undefined);
  assert.match(method.provenance.note, /不是 100% 随机掉落/);
});

test('legacy arcanes are explicitly unavailable and review-required', () => {
  const result = core.getAcquisition('赋能·求生');
  assert.equal(result.arcane.availability, 'unavailable-review-required');
  assert.match(result.description, /不可获取/);
  assert.match(result.description, /等待人工审核/);
});

test('赋能融合张数按最大等级动态计算并保护非标准协议', () => {
  const definition = core.arcaneMethods.find(method => method.category === 'authoritative');
  assert.equal(arcaneFusionMetadata(5, definition.rankCopyRule).requiredCopies, 21);
  assert.equal(arcaneFusionMetadata(3, definition.rankCopyRule).requiredCopies, 10);
  assert.equal(arcaneFusionMetadata(0, definition.rankCopyRule).requiredCopies, 1);
  assert.equal(definition.rankCopyRule.examples['0'], 1);
  assert.equal(definition.rankCopyRule.examples['3'], 10);
  assert.deepEqual(arcaneFusionMetadata(0, { protocol: 'not-upgradeable', upgradeable: false }), {
    protocol: 'not-upgradeable',
    baseRank: 0,
    maxRank: 0,
    requiredCopies: 1,
    upgradeable: false,
    status: 'entity-protocol',
    formula: null
  });
  assert.equal(arcaneFusionMetadata(4, { protocol: 'custom' }).requiredCopies, null);
});

test('赋能狂怒排除 Codex 隐藏旧对象并显示官方中文满级效果', () => {
  const result = core.getAcquisition('赋能·狂怒');
  assert.match(result.entry.officialUniqueName, /GolemArcaneMeleeDamageOnCrit$/);
  assert.match(result.description, /类型：战甲赋能/);
  assert.match(result.description, /满级效果/);
  assert.match(result.description, /60% 几率在近战武器上附加 \+180% 近战伤害/);
  assert.doesNotMatch(result.description, /Pistols|On Critical Hit|Melee Damage/);
});

test('全部发布赋能都有官方中文满级效果和实体化来源', () => {
  for (const entry of core.arcanes) {
    const result = core.getAcquisition(entry.officialUniqueName);
    assert.ok(result, entry.officialUniqueName);
    assert.match(result.description, /类型：/);
    assert.match(result.description, /满级效果：/);
    if (result.arcane.availability === 'available') {
      assert.ok(result.structuredMethods.length > 0, entry.subject.canonical);
      assert.ok(result.structuredMethods.every(method => method.type === 'crafting' || (method.sourceEntityId && method.sourceDisplayName) || (method.locationId && method.locationDisplayName && method.missionTypeId && method.missionTypeDisplayName)), entry.subject.canonical);
      assert.ok(result.structuredMethods.every(method => method.requirements && Array.isArray(method.requirementLines)), `${entry.subject.canonical} 缺少方法级统一 requirements`);
      for (const method of result.structuredMethods.filter(item => item.requirements?.npcId)) {
        const npc = core.npcs.get(method.requirements.npcId);
        assert.ok(npc?.displayName, `${entry.subject.canonical} 的 ${method.requirements.npcId} 缺少官方中文 NPC 名`);
        assert.doesNotMatch(method.requirements.rankName || '', /[A-Za-z]/, `${entry.subject.canonical} 声望等级泄漏英文`);
      }
    }
  }
});

test('官方包延迟时从 Wiki 官方分类补齐全部赋能且过滤都有理由', () => {
  const sculptor = core.getAcquisition('Arcane Sculptor');
  assert.equal(core.arcanes.length, core.arcaneCatalog.counts.arcanes);
  assert.equal(sculptor.entry.arcaneAcquisition.generated.identity.localizationStatus, 'official-zh');
  assert.equal(sculptor.entry.arcaneAcquisition.generated.stats.localizationStatus, 'official-zh');
  assert.match(sculptor.description, /类型：战甲赋能/);
  assert.match(sculptor.description, /通过技能创造物体时/);
  assert.ok(sculptor.structuredMethods.some(method => /天王星比邻星域任务/.test(method.sourceDisplayName)));
  assert.ok(sculptor.structuredMethods.some(method => /边界之塔/.test(method.sourceDisplayName)));
  assert.doesNotMatch(sculptor.description, /Ability Efficiency/);
});

test('工匠使文物赋能具有独立类型和结构化来源', () => {
  const result = core.getAcquisition('Zid-An Asheir');
  assert.match(result.description, /类型：工匠使文物赋能/);
  assert.ok(result.structuredMethods.some(method => /玛丽的轮换商店/.test(method.sourceDisplayName)));
});

test('赋能坚定与战甲共用 requirements 协议显示双水晶兑换', () => {
  const result = core.getAcquisition('赋能·坚定');
  const exchange = result.structuredMethods.find(method => method.requirements.type === 'currency');
  assert.ok(exchange);
  assert.deepEqual(exchange.requirements.currency, [
    { currencyId: 'currency.belric-crystal-fragment', amount: 60 },
    { currencyId: 'currency.rania-crystal-fragment', amount: 60 }
  ]);
  const text = exchange.requirementLines.join('\n');
  assert.match(text, /殁世幽都/);
  assert.match(text, /贝里克水晶碎片/);
  assert.match(text, /拉尼娅水晶碎片/);
  assert.match(text, /资源数量加成：贝里克水晶碎片、拉尼娅水晶碎片缺少明确证据，暂按未知处理/);
  assert.match(text, /兑换成本固定为60个贝里克水晶碎片、60个拉尼娅水晶碎片，不会因加成改变/);
});

test('多货币的相同任务奖励规则合并为一个依赖段落且最终文案不重复', () => {
  const result = core.getAcquisition('赋能雕塑');
  const exchange = result.structuredMethods.find(method => method.requirements.type === 'currency');
  const lines = exchange.requirementLines;
  assert.equal(lines.filter(line => /普通难度 12-16 个/.test(line)).length, 1);
  assert.match(lines.join('\n'), /翠绿天赋和猩红天赋（各需要10个）/);
  assert.match(lines.join('\n'), /翠绿天赋完成赤毒女巫号（前哨战）获得；猩红天赋完成火山石天使号（前哨战）获得/);
  assert.match(result.description, /完成天王星比邻星域任务概率获得/);
  assert.doesNotMatch(result.description, /击败天王星|该物品兑换条件/);
  assert.deepEqual(result.requirementLines, []);
  assert.equal((result.description.match(/消耗10个翠绿天赋、10个猩红天赋兑换/g) || []).length, 1);
  for (const line of lines.slice(1)) assert.equal(result.description.split(line).length - 1, 1, line);
});

test('充沛使用官方奥影任务类型，不把第三方 Erato Skirmish 字符串当来源', () => {
  const result = core.getAcquisition('赋能·充沛');
  const sources = result.structuredMethods.map(method => `${method.locationDisplayName || ''}${method.missionTypeDisplayName || ''}${method.sourceDisplayName || ''}`).join('\n');
  assert.match(sources, /面纱比邻星域奥影/);
  assert.match(sources, /夜灵水力使/);
  assert.doesNotMatch(sources, /Erato|Skirmish|前哨战|前哨站/);
  assert.ok(result.structuredMethods.some(method => method.missionTypeId === 'mission-type.orphix' && method.rotation === 'C' && method.chancePercent === 1.41));
});

test('游戏格式标记通过统一文本层渲染，不泄漏 DT 原文本', () => {
  const result = core.getAcquisition('联结·电压');
  assert.match(result.description, /电击异常状态/);
  assert.doesNotMatch(result.description, /⚡/);
  assert.doesNotMatch(result.description, /DT_[A-Z_]+/);
});

test('双衍王境和夜灵来源使用注册变量显示', () => {
  const result = core.getAcquisition('赋能·狂怒');
  assert.ok(result.structuredMethods.some(method => /普通无尽回廊第 1 阶段奖励/.test(method.sourceDisplayName)));
  assert.ok(result.structuredMethods.some(method => /夜灵水力使/.test(method.sourceDisplayName)));
  assert.doesNotMatch(result.structuredMethods.map(method => method.sourceDisplayName).join('\n'), /Duviri|Eidolon Hydrolyst/);
});
