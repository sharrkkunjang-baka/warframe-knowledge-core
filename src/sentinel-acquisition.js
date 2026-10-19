'use strict';

const { normalizeRequirements } = require('./acquisition-protocol');
const { TRADABLE_SENTINEL_PRIME_FAMILIES } = require('./companion-variant-family');

const COMPANION_SLOT_NOTE = '取得守护时会附带其默认武器，需额外占用一个同伴栏位。';
const PROVENANCE = Object.freeze({ source: 'wiki.warframe.com', section: 'Acquisition', reviewed: '2026-08-06' });

const MARKET_BLUEPRINT = Object.freeze({
  type: 'vendor-exchange',
  scope: 'blueprint',
  requirements: { type: 'none' },
  getText: name => `在商城购买${name}蓝图后在铸造厂制造；成品亦可直接在商城购买。`
});

const DOJO_RESEARCH = Object.freeze({
  type: 'vendor-exchange',
  scope: 'blueprint',
  locationId: 'hub.clan-dojo',
  requirements: { type: 'none' }
});

const PRIME_VAULTED = Object.freeze({
  type: 'prime-vaulted',
  scope: 'item',
  requirements: { type: 'none' }
});

/** @type {ReadonlyArray<{id:string,canonical:string,displayName:string,aliases?:string[],uniqueName?:string,imageQuery?:string,overview?:string,prime?:{kind:string,status:string},methods:object[]}>} */
const SENTINELS = Object.freeze([
  {
    id: 'sentinel.carrier',
    canonical: 'Carrier',
    displayName: '搬运者',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/CarrierPowerSuit',
    methods: [{ ...MARKET_BLUEPRINT, variables: { text: MARKET_BLUEPRINT.getText('搬运者') } }]
  },
  {
    id: 'sentinel.carrier-prime',
    canonical: 'Carrier Prime',
    displayName: '搬运者 Prime',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrimeCarrierPowerSuit',
    prime: { kind: 'prime-relic', status: '已入库' },
    methods: [{ ...PRIME_VAULTED, variables: { text: '集齐 Prime 部件后在铸造厂制造。' } }]
  },
  {
    id: 'sentinel.dethcube',
    canonical: 'Dethcube',
    displayName: '死亡魔方',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/DethCubePowerSuit',
    methods: [{ ...MARKET_BLUEPRINT, variables: { text: MARKET_BLUEPRINT.getText('死亡魔方') } }]
  },
  {
    id: 'sentinel.dethcube-prime',
    canonical: 'Dethcube Prime',
    displayName: '死亡魔方 Prime',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrimeDethCubePowerSuit',
    prime: { kind: 'prime-relic', status: '已入库' },
    methods: [{ ...PRIME_VAULTED, variables: { text: '集齐 Prime 部件后在铸造厂制造。' } }]
  },
  {
    id: 'sentinel.diriga',
    canonical: 'Diriga',
    displayName: '电气浮囊',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/DirigaPowerSuit',
    methods: [{ ...MARKET_BLUEPRINT, variables: { text: MARKET_BLUEPRINT.getText('电气浮囊') } }]
  },
  {
    id: 'sentinel.djinn',
    canonical: 'Djinn',
    displayName: '引灵',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/DjinnPowerSuit',
    methods: [{
      ...DOJO_RESEARCH,
      variables: { text: '在氏族道场生物研究室研究并复制蓝图后在铸造厂制造。' }
    }]
  },
  {
    id: 'sentinel.helios',
    canonical: 'Helios',
    displayName: '赫利俄斯',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/HeliosPowerSuit',
    methods: [{
      ...DOJO_RESEARCH,
      variables: { text: '在氏族道场能源研究室研究并复制蓝图后在铸造厂制造。' }
    }]
  },
  {
    id: 'sentinel.helios-prime',
    canonical: 'Helios Prime',
    displayName: '赫利俄斯 Prime',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrimeHeliosPowerSuit',
    prime: { kind: 'prime-relic', status: '已入库' },
    methods: [{ ...PRIME_VAULTED, variables: { text: '集齐 Prime 部件后在铸造厂制造。' } }]
  },
  {
    id: 'sentinel.nautilus',
    canonical: 'Nautilus',
    displayName: '鹦鹉螺',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/EmpyreanSentinelPowerSuit',
    methods: [{
      type: 'mission-reward',
      scope: 'blueprint-and-components',
      requirements: { type: 'none' },
      variables: { text: '总图与部件可在海王星比邻星域进入白色标记的废弃冰矿并破解终端后概率获得；也可在时空坐标任务的 B/C 轮奖励中获得。部件可玩家间交易。' }
    }]
  },
  {
    id: 'sentinel.nautilus-prime',
    canonical: 'Nautilus Prime',
    displayName: '鹦鹉螺 Prime',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/NautilusPrimeSentinelPowerSuit',
    prime: { kind: 'prime-relic', status: '已入库' },
    methods: [{ ...PRIME_VAULTED, variables: { text: '集齐 Prime 部件后在铸造厂制造。' } }]
  },
  {
    id: 'sentinel.oxylus',
    canonical: 'Oxylus',
    displayName: '奥克绪罗斯',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/OxylusPowerSuit',
    methods: [{
      type: 'vendor-exchange',
      scope: 'blueprint',
      npcId: 'npc.the-business',
      locationId: 'hub.fortuna',
      requirements: {
        type: 'standing',
        npcId: 'npc.the-business',
        locationId: 'hub.fortuna',
        rank: 5,
        rankName: '老朋友',
        amount: 20000
      },
      variables: { text: '在福尔图娜找 THE BUSINESS，达到索拉里斯联盟「老朋友」等级后，用 20000 声望购买蓝图。' }
    }]
  },
  {
    id: 'sentinel.prisma-shade',
    canonical: 'Prisma Shade',
    displayName: '棱晶 阴影',
    aliases: ['棱晶阴影'],
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrismaShadePowerSuit',
    methods: [{
      type: 'vendor-exchange',
      scope: 'item',
      npcId: 'npc.baro-ki-teer',
      locationId: 'hub.any-relay',
      requirements: {
        type: 'currency',
        usage: 'exchange',
        npcId: 'npc.baro-ki-teer',
        locationId: 'hub.any-relay',
        currency: [{ currencyId: 'currency.credits', amount: 300000 }, { currencyId: 'currency.ducats', amount: 500 }]
      },
      variables: { text: '在 Baro Ki\'Teer 处用 30 万现金与 500 杜卡特币兑换；库存随 Baro 到访轮换，未必每次出现。' }
    }]
  },
  {
    id: 'sentinel.shade',
    canonical: 'Shade',
    displayName: '阴影',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/ShadePowerSuit',
    methods: [{ ...MARKET_BLUEPRINT, variables: { text: MARKET_BLUEPRINT.getText('阴影') } }]
  },
  {
    id: 'sentinel.shade-prime',
    canonical: 'Shade Prime',
    displayName: '阴影 Prime',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrimeShadePowerSuit',
    prime: { kind: 'prime-relic', status: '已入库' },
    methods: [{ ...PRIME_VAULTED, variables: { text: '集齐 Prime 部件后在铸造厂制造。' } }]
  },
  {
    id: 'sentinel.taxon',
    canonical: 'Taxon',
    displayName: '塔克桑',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/TaxonPowerSuit',
    methods: [
      {
        type: 'quest-reward',
        scope: 'blueprint',
        requirements: { type: 'none' },
        variables: { text: '完成地球金星 Junction 第 3/4 项奖励蓝图；更新前已完成者可登录邮件领取。' }
      },
      {
        type: 'vendor-exchange',
        scope: 'blueprint',
        requirements: { type: 'none' },
        variables: { text: '蓝图亦可在商城用 5000 现金购买。' }
      }
    ]
  },
  {
    id: 'sentinel.wyrm',
    canonical: 'Wyrm',
    displayName: '蛟龙',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/WyrmPowerSuit',
    methods: [{ ...MARKET_BLUEPRINT, variables: { text: MARKET_BLUEPRINT.getText('蛟龙') } }]
  },
  {
    id: 'sentinel.wyrm-prime',
    canonical: 'Wyrm Prime',
    displayName: '蛟龙 Prime',
    uniqueName: '/Lotus/Types/Sentinels/SentinelPowersuits/PrimeWyrmPowerSuit',
    prime: { kind: 'prime-relic', status: '已入库' },
    methods: [{ ...PRIME_VAULTED, variables: { text: '集齐 Prime 部件后在铸造厂制造。' } }]
  }
]);

function familyAliases() {
  const extra = new Map();
  for (const family of TRADABLE_SENTINEL_PRIME_FAMILIES) {
    for (const member of [family.base, family.prime]) {
      const list = extra.get(member.canonical) || [];
      for (const alias of family.aliases) {
        const mentionsPrime = /prime/i.test(alias);
        const isPrime = /\sPrime$/i.test(member.canonical);
        if (isPrime === mentionsPrime && !list.includes(alias)) list.push(alias);
      }
      extra.set(member.canonical, list);
    }
  }
  return extra;
}

const FAMILY_ALIASES = familyAliases();

function normalize(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[\s·・_-]+/g, '');
}

function indexAliases(entry) {
  const aliases = new Set([
    entry.canonical,
    entry.displayName,
    ...(entry.aliases || []),
    ...(FAMILY_ALIASES.get(entry.canonical) || [])
  ]);
  return [...aliases].filter(Boolean);
}

const INDEX = new Map(SENTINELS.flatMap(entry => indexAliases(entry).map(alias => [normalize(alias), entry])));

function resolveSentinel(query) {
  return INDEX.get(normalize(query)) || null;
}

function buildDescription(entry, structuredMethods) {
  const lines = [];
  if (entry.prime?.kind === 'prime-relic' && entry.prime.status === '已入库') {
    lines.push(`${entry.displayName}当前已入库，官方当前掉落表中没有可刷取遗物。`);
  }
  lines.push(...structuredMethods.map(method => method.variables?.text).filter(Boolean));
  lines.push(COMPANION_SLOT_NOTE);
  return [...new Set(lines)].join('\n');
}

function getSentinelAcquisition(query) {
  const entry = resolveSentinel(query);
  if (!entry) return null;
  const structuredMethods = entry.methods.map(method => ({
    ...method,
    requirements: normalizeRequirements(method.requirements),
    requirementLines: method.variables?.text ? [method.variables.text] : [],
    reviewStatus: 'approved',
    provenance: PROVENANCE
  }));
  return {
    query: String(query || ''),
    resolution: { canonical: entry.canonical, exact: true },
    entry: {
      id: entry.id,
      kind: 'knowledge',
      module: 'acquisition',
      subject: {
        canonical: entry.canonical,
        displayName: entry.displayName,
        category: 'companion',
        officialUniqueName: entry.uniqueName,
        categoryRefs: ['companion.sentinel']
      },
      imageQuery: entry.imageQuery || entry.canonical
    },
    description: buildDescription(entry, structuredMethods),
    structuredMethods,
    prime: entry.prime || null,
    alternatives: []
  };
}

function auditSentinelAcquisition() {
  return {
    count: SENTINELS.length,
    missingMethods: SENTINELS.filter(item => !item.methods.length).map(item => item.canonical),
    indexedAliases: INDEX.size
  };
}

module.exports = {
  SENTINELS,
  resolveSentinel,
  getSentinelAcquisition,
  auditSentinelAcquisition
};
