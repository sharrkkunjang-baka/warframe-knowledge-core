'use strict';

const path = require('node:path');

const SLOT_LABELS = Object.freeze({ prism: '棱镜', scaffold: '支架', brace: '曲柄' });
const TABLE_ALIASES = Object.freeze(['增幅器', '增幅器组合', '增幅器表', '增幅器部件', '增幅器部件表']);

function loadAmpComponents(root = path.join(__dirname, '..')) {
  return require(path.join(root, 'knowledge', 'amp-components.json'));
}

function parseAmpCommand(text) {
  const value = String(text || '').normalize('NFKC').trim().replace(/^[\\/。.．]/, '');
  if (TABLE_ALIASES.includes(value)) return { kind: 'amp-table' };
  const forms = [
    value.match(/^(?:增幅器|增幅器组合)\s*(\d+)$/),
    value.match(/^(\d+)\s*增幅器$/),
    value.match(/^(\d+)\s*是什么$/),
    value.match(/^什么是\s*(\d+)$/)
  ];
  const matched = forms.find(Boolean);
  if (!matched) return null;
  const code = matched[1];
  if (!/^[1-7]{3}$/.test(code)) return { kind: 'amp-error', code, error: '增幅器组合编号必须是三位整数，且每一位只能是 1～7。' };
  return { kind: 'amp-combination', code };
}

function buildAmpComponentIndex(data) {
  return new Map(data.components.map(component => [`${component.slot}:${component.tier}`, component]));
}

function createAmpComponentQueries(data = loadAmpComponents()) {
  const index = buildAmpComponentIndex(data);
  const groups = Object.entries(data.syndicates).map(([id, syndicate]) => ({
    id,
    displayName: syndicate.displayName,
    officialSyndicate: syndicate.officialSyndicate || syndicate.displayName,
    watermark: syndicate.watermark || null,
    rows: syndicate.tiers.map(tier => ({
      tier,
      prism: index.get(`prism:${tier}`),
      scaffold: index.get(`scaffold:${tier}`),
      brace: index.get(`brace:${tier}`)
    }))
  }));
  const query = text => {
    const parsed = parseAmpCommand(text);
    if (!parsed) return null;
    if (parsed.kind === 'amp-error') return parsed;
    if (parsed.kind === 'amp-table') return {
      kind: 'amp-table',
      title: '增幅器部件表',
      slots: SLOT_LABELS,
      groups,
      footerLines: [
        '常说的“777”、“177”、“747”表示这张表格内从上到下的第几个部位。',
        '如 177 开头的 1 表示拉普拉克棱镜。'
      ]
    };
    const components = ['prism', 'scaffold', 'brace'].map((slot, position) => ({
      slot,
      slotLabel: SLOT_LABELS[slot],
      tier: Number(parsed.code[position]),
      component: index.get(`${slot}:${Number(parsed.code[position])}`)
    }));
    if (components.some(item => !item.component)) return null;
    return {
      kind: 'amp-combination',
      title: '增幅器组装',
      code: parsed.code,
      components,
      footerLines: ['部件找谁兑换可输“增幅器”查询。']
    };
  };
  return { data, groups, index, parseCommand: parseAmpCommand, query };
}

module.exports = { SLOT_LABELS, TABLE_ALIASES, buildAmpComponentIndex, createAmpComponentQueries, loadAmpComponents, parseAmpCommand };
