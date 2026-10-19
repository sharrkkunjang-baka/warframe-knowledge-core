'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acquisition = require('../src/frame-acquisition');

test('frame crafting uses canonical Chinese names for Plastids and Polymer Bundle', () => {
  const recipes = JSON.parse(fs.readFileSync(path.join(__dirname, '../cache/warframe-export-recipes.json'), 'utf8'));
  const noisyCache = structuredClone(recipes);
  for (const recipe of Object.values(noisyCache)) for (const item of recipe.ingredients || []) {
    if (item.ItemType === '/Lotus/Types/Items/MiscItems/Plastids' || item.ItemType === '/Lotus/Types/Items/MiscItems/PolymerBundle') item.displayName = '塑料块';
  }
  const frameRecipes = acquisition.getCraftingRecipes('Narin', noisyCache);
  const ingredients = frameRecipes.flatMap(recipe => recipe.ingredients || []);
  assert.equal(ingredients.find(item => item.uniqueName === '/Lotus/Types/Items/MiscItems/Plastids')?.displayName, '生物质');
  assert.equal(ingredients.find(item => item.uniqueName === '/Lotus/Types/Items/MiscItems/PolymerBundle')?.displayName, '聚合物束');
  const aggregate = acquisition.aggregateMaterials('Narin', noisyCache);
  assert.equal(aggregate.resources.find(item => item.uniqueName === '/Lotus/Types/Items/MiscItems/Plastids')?.name, '生物质');
});
