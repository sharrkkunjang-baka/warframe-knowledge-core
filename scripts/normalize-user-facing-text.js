const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const acquisitionDir = path.join(root, 'knowledge', 'acquisition')

const replacements = new Map([
  ['Atlas', '阿特拉斯'],
  ['Nezha', '哪吒'],
  ['Mirage', '幻影'],
  ['Carnis', '肉碾虫'],
  ['Jugulus', '喉骨刃者'],
  ['Saxum', '重岩者'],
  ['Hunter', '猎人'],
  ['Vigilante', '私法'],
  ['Augur', '预言'],
  ['Gladiator', '角斗士'],
  ['Tek', '技法'],
  ['Synth', '合成'],
  ['Mecha', '机甲'],
  ['Strain', '菌株'],
  ['Amar', '欺谋狼主'],
  ['Boreal', '诡文枭主'],
  ['Nira', '混沌蛇主'],
  ['Aero', '空飞'],
  ['Motus', '跃动'],
  ['Proton', '质子'],
  ['Sacrificial', '牺牲'],
  ['Umbral', '暗影'],
  ['Tau', '始源星系'],
  ['Sentient', '灵煞'],
  ['Corpus', '科普斯'],
  ['Infested', '感染者'],
  ['Helminth', '大嘴'],
  ['Skittergirl', '扎里曼小女孩'],
  ['Mesa', '梅萨']
])

function listJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? listJsonFiles(fullPath) : entry.name.endsWith('.json') ? [fullPath] : []
  })
}

function normalizeText(value) {
  let result = String(value || '')
    .replace(/\\n/g, '；')
    .replace(/\r?\n/g, '；')
    .replace(/<[^>]+>/g, '')

  for (const [english, chinese] of replacements) {
    result = result.replace(new RegExp(`\\b${english}\\b`, 'g'), chinese)
  }

  return result
    .replace(/\s+/g, ' ')
    .replace(/\s*；\s*/g, '；')
    .replace(/；{2,}/g, '；')
    .trim()
}

let changedFiles = 0
let changedEntries = 0

for (const filePath of listJsonFiles(acquisitionDir)) {
  const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  let changed = false

  for (const entry of entries) {
    if (Array.isArray(entry.effectDetails)) {
      const normalized = entry.effectDetails.map(normalizeText).filter(Boolean)
      if (JSON.stringify(normalized) !== JSON.stringify(entry.effectDetails)) {
        entry.effectDetails = normalized
        changed = true
      }
    }

    if (Array.isArray(entry.effects)) {
      for (const effect of entry.effects) {
        const normalized = normalizeText(effect.displayName)
        if (normalized !== effect.displayName) {
          effect.displayName = normalized
          changed = true
        }
      }
    }

    if (entry.subject?.categoryRefs?.includes('setmod') && Object.hasOwn(entry, 'summary')) {
      delete entry.summary
      changed = true
    }

    if (changed) changedEntries += 1
  }

  if (changed) {
    fs.writeFileSync(filePath, `${JSON.stringify(entries, null, 2)}\n`)
    changedFiles += 1
  }
}

console.log(`Normalized ${changedEntries} entries in ${changedFiles} files.`)
