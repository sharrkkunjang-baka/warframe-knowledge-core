'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveItemTradable}=require('../src/item-tradability');
test('stable market identity beats upstream false flag',()=>assert.equal(resolveItemTradable({uniqueName:'u',tradable:false},[{gameRef:'u'}]),true));
test('canonical exact market identity beats upstream false flag',()=>assert.equal(resolveItemTradable({name:'Known Mod',tradable:false},[{i18n:{en:{name:'Known Mod'}}}]),true));
test('missing data is not fabricated as false',()=>assert.equal(resolveItemTradable({},[]),undefined));
test('nonmarket false stays false',()=>assert.equal(resolveItemTradable({tradable:false},[]),false));
test('explicit negative market metadata stays false',()=>assert.equal(resolveItemTradable({uniqueName:'u',tradable:true},[{gameRef:'u',tradable:false}]),false));
