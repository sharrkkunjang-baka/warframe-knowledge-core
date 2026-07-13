'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const categoriesDirectory = path.join(root, 'categories');
const updatedAt = '2026-07-13';
const source = {
  url: 'https://wiki.warframe.com/w/Category:Mods',
  label: 'Warframe Wiki - Category: Mods'
};

const definitions = [
  ['primemod', 'Prime Mods', 'Prime Mod', ['Prime卡', 'Prime Mod', 'P卡'], 'Prime 版本的 Mod。'],
  ['flawedmod', 'Flawed Mods', '残缺 Mod', ['残缺卡', '残缺 Mod'], '属性与等级上限低于普通版本的残缺 Mod。'],
  ['standardmod', 'Standard Mods', '普通 Mod', ['普通卡', '普通 Mod'], '不属于 Prime 或残缺版本的常规 Mod。'],
  ['warframemod', 'Warframe Mod', '战甲 Mod', ['战甲卡', '战甲 Mod'], '安装于战甲配置的 Mod。'],
  ['primarymod', 'Primary Mod', '主武器 Mod', ['主武器卡', '主武器 Mod'], '安装于主武器配置的 Mod。'],
  ['shotgunmod', 'Shotgun Mod', '霰弹枪 Mod', ['霰弹枪卡', '喷子卡'], '安装于霰弹枪配置的 Mod。'],
  ['secondarymod', 'Secondary Mod', '副武器 Mod', ['副武器卡', '手枪卡'], '安装于副武器配置的 Mod。'],
  ['meleemod', 'Melee Mod', '近战 Mod', ['近战卡', '近战 Mod'], '安装于近战武器配置的 Mod。'],
  ['companionmod', 'Companion Mod', '同伴 Mod', ['同伴卡', '宠物卡'], '安装于同伴或同伴武器配置的 Mod。'],
  ['stancemod', 'Stance Mod', '架式 Mod', ['架式卡', '姿态卡'], '安装于近战武器架式槽的 Mod。'],
  ['plexusmod', 'Plexus Mod', '航道星舰 Mod', ['航道星舰卡', '航道星舰 Mod'], '安装于航道星舰配置的 Mod。'],
  ['parazonmod', 'Parazon Mod', '灭骸之刃 Mod', ['灭骸之刃卡', '灭骸之刃 Mod'], '安装于灭骸之刃配置的 Mod。'],
  ['necramechmod', 'Necramech Mod', '殁世机甲 Mod', ['殁世机甲卡', '机甲卡'], '安装于殁世机甲配置的 Mod。'],
  ['archwingmod', 'Archwing Mod', '曲翼 Mod', ['Archwing卡', '翅膀卡'], '安装于曲翼配置的 Mod。'],
  ['archgunmod', 'Arch-Gun Mod', '曲翼枪械 Mod', ['Archwing枪械卡', '空战枪械卡'], '安装于曲翼枪械配置的 Mod。'],
  ['archmeleemod', 'Arch-Melee Mod', '曲翼近战 Mod', ['Archwing近战卡', '空战近战卡'], '安装于曲翼近战武器配置的 Mod。'],
  ['railjackmod', 'Railjack Mod', '九重天 Mod', ['九重天卡', 'Railjack卡'], '用于九重天相关配置的 Mod。'],
  ['kdrivemod', 'K-Drive Mod', 'K式悬浮板 Mod', ['滑板卡', 'K式悬浮板卡'], '安装于 K式悬浮板配置的 Mod。'],
  ['posturemod', 'Posture Mod', '架势 Mod', ['架势卡', '姿势卡'], '决定特殊武器或形态动作的架势 Mod。'],
  ['rivenmod', 'Riven Mods', '裂罅 Mod', ['裂罅卡', '紫卡'], '属性由循环与揭示结果决定的裂罅 Mod。'],
  ['othermod', 'Other Mods', '其他 Mod', ['其他卡'], '暂未归入其他装备类型的 Mod。']
];

for (const [id, canonical, displayName, aliases, description] of definitions) {
  const category = {
    id,
    canonical,
    displayName,
    aliases,
    parent: 'mod',
    description,
    modDescription: '{name}的刷法尚未收录',
    sources: [source],
    updatedAt
  };
  if (id === 'primemod') {
    category.defaultMethodRefs = ['gameplay.baro-ki-teer'];
    category.modDescription = '{name} 通常由虚空商人的轮换库存出售\n输入“刷 奸商”可了解兑换准备与轮换规则';
  }
  fs.writeFileSync(path.join(categoriesDirectory, `${id}.json`), `${JSON.stringify(category, null, 2)}\n`);
}

console.log(`已同步 ${definitions.length} 个全量 Mod 分类。`);
