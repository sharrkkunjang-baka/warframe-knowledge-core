'use strict';

function isRailjackCacheSource(value) {
  const source = String(value || '');
  return /\(Caches\)/i.test(source)
    && /^(?:Venus|Neptune|Pluto|Veil(?: Proxima)?)\//i.test(source);
}

function railjackCacheObjective(value) {
  const source = String(value || '');
  if (/^Neptune\//i.test(source)) return '跟随白色标记进入废弃冰矿并破解终端';
  if (/^Venus\//i.test(source)) return '跟随白色标记进入废弃运联站并破解终端';
  return '跟随白色标记进入废弃遗迹并破解终端';
}

module.exports = { isRailjackCacheSource, railjackCacheObjective };
