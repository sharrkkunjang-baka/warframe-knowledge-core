'use strict';
// Acquisition arcane JSON owns the only editable effect text: top-level levelStats.
function finalizeArcaneContent(entry, previous = null) {
  const upstream = entry.levelStats || entry.arcaneAcquisition?.generated?.stats?.levelStats;
  const maintained = previous?.levelStats || previous?.arcaneAcquisition?.generated?.stats?.levelStats;
  if (!Array.isArray(upstream)) throw new Error(`${entry.id}: 赋能缺少 levelStats`);
  if (maintained && maintained.length !== upstream.length) throw new Error(`${entry.id}: 赋能等级数量变化，请人工确认已有描述后再同步`);
  entry.levelStats = JSON.parse(JSON.stringify(maintained || upstream));
  if (entry.arcaneAcquisition?.generated?.stats) delete entry.arcaneAcquisition.generated.stats.levelStats;
  return entry;
}
module.exports = { finalizeArcaneContent };
