'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.dirname(require.resolve('warframe-items'));
for (const filename of fs.readdirSync(path.join(root, 'data', 'json')).filter(name => name.endsWith('.json'))) {
  const value = require(path.join(root, 'data', 'json', filename));
  if (!Array.isArray(value)) continue;
  for (const item of value) {
    if (['Velox Prime', 'Okina Prime', 'Baza Prime', 'Aksomati Prime', 'Nautilus Prime', 'Protea Prime', 'Ivara Prime', 'Sevagoth Prime', 'Trumna Prime', 'Quassus Prime', 'Odonata Prime'].includes(item?.name)) {
      console.log(filename, JSON.stringify({ name: item.name, uniqueName: item.uniqueName, introduced: item.introduced, introducedAt: item.introducedAt, releaseDate: item.releaseDate, isPrime: item.isPrime }));
    }
  }
}
for (const filename of ['Warframes.json', 'Primary.json', 'Secondary.json', 'Melee.json', 'Archwing.json', 'Sentinels.json']) {
  const value = require(path.join(root, 'data', 'json', filename));
  for (const item of value) {
    const date = item.releaseDate || item.introduced?.date;
    if (date && (date.startsWith('2015-03') || date.startsWith('2024-11'))) console.log('DATE', filename, item.name, date, item.productCategory);
  }
}
