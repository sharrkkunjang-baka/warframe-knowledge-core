'use strict';

// Reviewed terminology: the user requests English cycle names in game data
// displays, while translations keep the Chinese meaning of each cycle.
const CAMBION_CYCLE_TERMS = Object.freeze([
  Object.freeze({ uniqueName: 'cycle:cambion-drift:vome', canonical: 'Vome', displayName: '秩序', category: 'cycle', aliases: ['秩序期', 'Vome期'] }),
  Object.freeze({ uniqueName: 'cycle:cambion-drift:fass', canonical: 'Fass', displayName: '混沌', category: 'cycle', aliases: ['混沌期', '混乱', '混乱期', 'Fass期'] })
]);

function normalizeCambionCycleText(value, options = {}) {
  let text = String(value || '');
  const contextual = options.cambion === true || /魔胎之境|火卫二|蛟龙|残留物|\b(?:Vome|Fass)\b/i.test(text);
  for (const term of CAMBION_CYCLE_TERMS) {
    const chineseNames = [term.displayName, ...term.aliases.filter(name => !/[a-z]/i.test(name))];
    for (const name of [...new Set(chineseNames)].sort((a, b) => b.length - a.length)) {
      // Explicit phase names are unambiguous even in a shared acquisition line.
      if (name.endsWith('期')) text = text.split(name).join(term.canonical);
      else if (contextual) text = text.split(name).join(term.canonical);
    }
    text = text.replace(new RegExp(`[“”"「」『』]+(${term.canonical})[“”"「」『』]+`, 'g'), '$1');
    text = text.replace(new RegExp(`${term.canonical}\\s*[（(]${term.canonical}[）)]`, 'gi'), term.canonical);
  }
  return text;
}

module.exports = { CAMBION_CYCLE_TERMS, normalizeCambionCycleText };
