'use strict'

const crypto = require('node:crypto')

const EXACT_ZH = Object.freeze({
  'Deep Archimedea Arcane': '深层科研赋能奖励',
  'Deep Archimedea Gold Rewards': '深层科研金级奖励',
  'Deep Archimedea Silver Rewards': '深层科研银级奖励',
  'Temporal Archimedea Arcane Rewards': '时序科研赋能奖励',
  'Temporal Archimedea Gold Rewards': '时序科研金级奖励',
  'Temporal Archimedea Silver Rewards': '时序科研银级奖励',
  'Entrati Netracell Coffer': '英择谛合成兽保险库',
  'Operational Supply': '行动补给',
  'Ostron': '奥斯唐人',
  'Solaris United': '索拉里斯联盟',
  'The Holdfasts': '坚守者',
  'The Quills': '夜羽',
  'Vox Solaris': '索拉里斯之声',
  'Eidolon Teralyst': '夜灵兆力使',
  'Eidolon Gantulyst': '夜灵巨力使',
  'Eidolon Hydrolyst': '夜灵水力使',
  'Sister Of Parvos': '帕尔沃斯的姐妹',
  'Duviri': '双衍王境',
  'Endless': '无尽回廊',
  'Deimos': '火卫二',
  'Cambion Drift': '魔胎之境',
  'Lua': '月球',
  'Mars': '火星',
  'Neptune': '海王星比邻星域',
  'Pluto': '冥王星比邻星域',
  'Veil': '面纱比邻星域',
  'Venus': '金星比邻星域',
  'Circulus': 'Circulus',
  'Tyana Pass': 'Tyana Pass',
  "Mammon's Prospect": "Mammon's Prospect",
  'Khufu Envoy': 'Khufu Envoy',
  'Erato': 'Erato',
  'Vesper Strait': 'Vesper Strait',
  'Skirmish': '前哨战',
  'Survival': '生存',
  'Defense': '防御',
  'Ascension': '扬升',
  'Antivirus Bounty': '杀毒赏金',
  'Exterminate: Scaldra': '歼灭：炽蛇军',
  'Exterminate: Techrot': '歼灭：科腐者',
  'Caches': '资源缓存',
  'Arbitrations': '仲裁',
  'Arcana Isolation Vault': '奥秘隔离库',
  'Isolation Vault': '隔离库',
  'Capture': '捕获'
})

const ENEMY_ZH = Object.freeze({
  Angst: '苦闷', Malice: '怨恨', Mania: '躁狂', Misery: '悲痛', Torment: '折磨', Violence: '暴力',
  'Eidolon Teralyst': '夜灵兆力使', 'Eidolon Gantulyst': '夜灵巨力使', 'Eidolon Hydrolyst': '夜灵水力使',
  'H-09 Apex': 'H-09 顶点', 'H-09 Efervon Tank': 'H-09 埃弗隆坦克', 'Mocking Whisper': '嘲讽低语',
  'Ravenous Void Angel': '贪婪虚空天使', 'Scaldra Screamer': '炽蛇军尖啸者', 'Scathing Whisper': '严酷低语',
  'The Fragmented Suzerain': '碎裂者·君主', 'Thrax Centurion': '禁卫军百夫长', 'Thrax Legatus': '禁卫军使节', 'Void Angel': '虚空天使'
})

function sourceId(canonical) {
  return `arcane-source.${crypto.createHash('sha256').update(String(canonical)).digest('hex').slice(0, 12)}`
}
function replaceTerms(value) {
  let output = String(value)
  for (const [canonical, displayName] of Object.entries(EXACT_ZH).sort((a, b) => b[0].length - a[0].length)) output = output.split(canonical).join(displayName)
  return output
}
function sourceKind(canonical) {
  if (/Ostron|Solaris|Holdfasts|Quills|Vox Solaris|Operational Supply/i.test(canonical)) return 'exchange'
  if (/Bounty|Arbitrations|Archimedea|Rotation|Duviri\/Endless|Caches|Vault/i.test(canonical)) return 'mission-reward'
  return 'enemy-drop'
}
function displaySource(canonical) {
  const raw = String(canonical || '').trim()
  if (ENEMY_ZH[raw]) return ENEMY_ZH[raw]
  let match = raw.match(/^(.+?) \(Level \d+ - \d+\)$/)
  if (match) return ENEMY_ZH[match[1]] || replaceTerms(match[1])
  match = raw.match(/^Duviri\/Endless: (Repeated Rewards|Tier (\d+)) \((Hard|Normal)\)$/)
  if (match) return `${match[3] === 'Hard' ? '钢铁之路' : '普通'}无尽回廊${match[1] === 'Repeated Rewards' ? '重复奖励' : `第 ${match[2]} 阶段奖励`}`
  match = raw.match(/^(.+?) \((Capture)\)$/)
  if (match && ENEMY_ZH[match[1]]) return `${replaceTerms(match[2])}${ENEMY_ZH[match[1]]}`
  match = raw.match(/^(.+?), Rotation ([ABC])$/)
  if (match) return `${displaySource(match[1])}，轮次 ${match[2]}`
  match = raw.match(/^([^/]+)\/(.+?) \(([^)]+)\)$/)
  if (match) return `${replaceTerms(match[1])}/${replaceTerms(match[2])}（${replaceTerms(match[3])}）`
  match = raw.match(/^([^/]+)\/(.+)$/)
  if (match) return `${replaceTerms(match[1])}/${replaceTerms(match[2])}`
  match = raw.match(/^(.+?) \((.+?)\), (.+)$/)
  if (match) return `${replaceTerms(match[1])}（${replaceTerms(match[2])}），${replaceTerms(match[3])}`
  match = raw.match(/^(.+?), (.+)$/)
  if (match) return `${replaceTerms(match[1])}，${replaceTerms(match[2])}`
  return replaceTerms(raw)
}

module.exports = { EXACT_ZH, ENEMY_ZH, sourceId, sourceKind, displaySource }
