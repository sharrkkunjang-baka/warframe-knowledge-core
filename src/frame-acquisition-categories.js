'use strict'

const CATEGORY_DEFINITIONS = Object.freeze([
  { id: 'frame-prime-relic', canonical: 'Prime Relic Warframes', displayName: 'Prime 遗物战甲', aliases: ['Prime战甲', '遗物战甲'], description: '主要通过虚空遗物获取蓝图与部件的 Prime 战甲。' },
  { id: 'frame-assassination', canonical: 'Assassination Warframes', displayName: '刺杀获取战甲', aliases: ['刺杀战甲', 'Boss战甲'], description: '主要部件由刺杀任务首领掉落的战甲。' },
  { id: 'frame-quest', canonical: 'Quest Warframes', displayName: '系列任务战甲', aliases: ['任务战甲', '系列任务'], description: '至少一个核心蓝图或获取入口来自系列任务、主线任务或任务首通。' },
  { id: 'frame-mixed-missions', canonical: 'Standard and Mixed Mission Warframes', displayName: '常规与混合任务战甲', aliases: ['混合任务', '常规任务战甲'], description: '蓝图散布在多个常规节点、轮次或不同常规任务来源中。' },
  { id: 'frame-specific-mission', canonical: 'Specific Mission Warframes', displayName: '特定任务战甲', aliases: ['特殊任务战甲', '特定任务'], description: '通过指定节点、特殊模式、双衍王境、航道星舰或专属任务获取，不包含刺杀和赏金。' },
  { id: 'frame-bounty', canonical: 'Bounty Warframes', displayName: '赏金获取战甲', aliases: ['赏金战甲', '赏金任务战甲'], description: '主要蓝图或部件来自开放世界、扎里曼号等地区的赏金任务奖励。' },
  { id: 'frame-dojo', canonical: 'Dojo Warframes', displayName: '道场复制战甲', aliases: ['道场战甲', '氏族战甲'], description: '可在氏族道场研究设施或专属房间中复制蓝图。' },
  { id: 'frame-vendor', canonical: 'Vendor Warframes', displayName: '商店兑换战甲', aliases: ['兑换战甲', '商店战甲'], description: '主要通过声望、凭证或专属商人的固定商品兑换蓝图。' }
])

const CATEGORY_IDS = new Set(CATEGORY_DEFINITIONS.map(item => item.id))
const MANUAL_OVERRIDES = Object.freeze({
  'Cyte-09': ['frame-bounty'],
  'Excalibur Umbra': ['frame-quest'],
  Gara: ['frame-bounty'],
  Garuda: ['frame-bounty'],
  Jade: ['frame-specific-mission'],
  Lavos: ['frame-specific-mission'],
  Nokko: ['frame-specific-mission'],
  Octavia: ['frame-mixed-missions'],
  Volt: ['frame-dojo'],
  Xaku: ['frame-bounty']
})
const QUEST_SIGNAL = /\bquest\b|during Awakening/i
const DOJO_SIGNAL = /Clan Dojo|Tenno Lab|Dagath's Hollow|Ventkids Bash Lab|dojo research/i
const ASSASSINATION_SIGNAL = /\bAssassination\b|component blueprints (?:can be |are )?obtained from defeating/i
const SPECIFIC_SIGNAL = /Kullervo's Hold|Kullervo's Bane|Orowyrm|Empyrean|Railjack|Sanctuary Onslaught|Granum Void|Mirror Defense|Conjunction Survival|Tyana Pass|Isolation Vault|Albrecht'?s Laboratories|Ascension|Abyssal Zone|Shrine Defense|Scoria's Angel|The Kuva Wytch|Follie's Hunt|Void Cascade|Void Flood|Armageddon/i
const BOUNTY_SIGNAL = /\bBount(?:y|ies)\b/i
const STANDARD_MISSION_SIGNAL = /\b(?:Spy|Defense|Survival|Disruption|Excavation|Exterminate|Capture|Rescue|Sabotage|Interception|Defection|Infested Salvage)\b/i
const VENDOR_SIGNAL = /purchased from|offerings|Standing|Nightwave Cred|Little Duck|Entrati Syndicate/i

function unique(values) { return [...new Set(values)] }
function componentDrops(frame) {
  return (frame.components || []).flatMap(component => (component.drops || []).map(drop => String(drop.location || ''))).filter(Boolean)
}
function classifyFrameAcquisition(frame, page) {
  if (frame.isPrime || / Prime$/i.test(frame.name || '')) return ['frame-prime-relic']
  if (MANUAL_OVERRIDES[frame.name]) return [...MANUAL_OVERRIDES[frame.name]]
  const text = (page?.sections || []).filter(section => /^(?:Acquisition|Blueprints)$/i.test(String(section.title || '').trim())).map(section => section.text).join('\n')
  const drops = componentDrops(frame)
  const joinedDrops = drops.join('\n')
  const evidence = `${text}\n${joinedDrops}`
  const nonAssassinationDrops = drops.filter(source => !/\bAssassination\b/i.test(source))
  const standardTypes = unique(nonAssassinationDrops.flatMap(source => [...source.matchAll(/\((Spy|Defense|Survival|Disruption|Excavation|Exterminate|Capture|Rescue|Sabotage|Interception|Defection|Infested Salvage)\)/gi)].map(match => match[1].toLowerCase())))
  const standardNodes = unique(nonAssassinationDrops.map(source => source.replace(/,?\s*Rotation\s+[A-Z].*$/i, '').trim()))
  const isMixedMission = (STANDARD_MISSION_SIGNAL.test(`${text}\n${nonAssassinationDrops.join('\n')}`) && !SPECIFIC_SIGNAL.test(`${text}\n${nonAssassinationDrops.join('\n')}`)) || standardTypes.length > 1 || standardNodes.length > 2

  // 只选择主要获取方式；顺序即确定性优先级，禁止交叉分类。
  if (DOJO_SIGNAL.test(text)) return ['frame-dojo']
  if (BOUNTY_SIGNAL.test(evidence)) return ['frame-bounty']
  if (ASSASSINATION_SIGNAL.test(evidence)) return ['frame-assassination']
  if (SPECIFIC_SIGNAL.test(evidence)) return ['frame-specific-mission']
  if (isMixedMission) return ['frame-mixed-missions']
  if (QUEST_SIGNAL.test(text)) return ['frame-quest']
  if (VENDOR_SIGNAL.test(text)) return ['frame-vendor']
  return []
}

module.exports = { CATEGORY_DEFINITIONS, CATEGORY_IDS, MANUAL_OVERRIDES, classifyFrameAcquisition, componentDrops }
