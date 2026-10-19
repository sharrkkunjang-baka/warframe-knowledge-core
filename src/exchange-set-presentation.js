'use strict';

// Aggregate offers for one complete equipment set, retaining authoritative
// per-part prices in knowledge. Different prerequisites remain separate.
function collapseExchangeSets(methods, options, renderRequirements) {
  const exchangeTypes = new Set(['vendor-exchange', 'vendor-or-syndicate-exchange', 'syndicate-exchange']);
  const components = methods.filter(m => m.scope === 'component' && (m.partRefs || []).length);
  const required = new Set(components.flatMap(m => m.partRefs));
  const recipe = options.recipes?.[0];
  const ingredients = recipe?.ingredients || [];
  const quantity = ref => {
    const item = ingredients.find(i => [i.uniqueName, i.canonical, i.displayName].includes(ref));
    return item ? Number(item.quantity ?? item.count ?? 1) : 1;
  };
  const groups = new Map();
  for (const method of methods) {
    const req = method.requirements || {};
    if (!exchangeTypes.has(method.type) || !['blueprint', 'component'].includes(method.scope)
      || !['currency', 'standing'].includes(req.type) || req.chooseCount || req.blueprintRank != null
      || (req.type === 'currency' && (!(req.currency || []).length || req.currency.some(c => !(c.amount > 0) || c.amountRange)))
      || (req.type === 'standing' && !(req.amount > 0))) continue;
    const conditions = { ...req };
    delete conditions.amount;
    delete conditions.currency;
    delete conditions.currencyCanonical;
    delete conditions.currencyDisplayName;
    const key = JSON.stringify([conditions, method.npcId || req.npcId, method.locationId || req.locationId,
      method.prerequisiteQuestId, method.prerequisiteText, method.prerequisite, method.requiredLevel,
      method.requiredRankName, method.variables?.steelPathNote]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(method);
  }
  const replacements = new Map(), removed = new Set();
  for (const group of groups.values()) {
    const blueprints = group.filter(m => m.scope === 'blueprint');
    const parts = group.filter(m => m.scope === 'component');
    const covered = new Set(parts.flatMap(m => m.partRefs || []));
    if (blueprints.length !== 1 || !required.size || [...required].some(ref => !covered.has(ref))) continue;
    // A repeated ref represents alternative offers, not extra purchases.
    const refs = parts.flatMap(m => m.partRefs || []);
    if (new Set(refs).size !== refs.length || refs.some(ref => !(quantity(ref) > 0))) continue;
    if (options.canonical && ingredients.some(i => String(i.canonical || '').startsWith(options.canonical + ' ')
      && ![i.uniqueName, i.canonical, i.displayName].some(ref => covered.has(ref)))) continue;
    const first = blueprints[0];
    const req = { ...first.requirements };
    const multiplier = m => m.scope === 'blueprint' ? 1 : (m.partRefs || []).reduce((n, ref) => n + quantity(ref), 0);
    if (req.type === 'standing') req.amount = group.reduce((n, m) => n + m.requirements.amount * multiplier(m), 0);
    else {
      const costs = new Map();
      for (const m of group) for (const cost of m.requirements.currency) {
        const id = cost.currencyId || cost.currencyCanonical;
        if (!id) continue;
        const old = costs.get(id) || { ...cost, amount: 0 };
        old.amount += cost.amount * multiplier(m);
        costs.set(id, old);
      }
      req.currency = [...costs.values()];
    }
    const replacement = { ...first, requirements: req, partRefs: [...new Set(group.flatMap(m => m.partRefs || []))],
      variables: { ...first.variables, partName: undefined, presentationLabel: '全套' },
      requirementLines: renderRequirements(req, options.registries) };
    replacements.set(group[0], replacement);
    group.slice(1).forEach(m => removed.add(m));
  }
  return methods.filter(m => !removed.has(m)).map(m => replacements.get(m) || m);
}

module.exports = { collapseExchangeSets };
