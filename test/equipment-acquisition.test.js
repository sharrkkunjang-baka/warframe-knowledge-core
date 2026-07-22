'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createKnowledgeCore}=require('../src');const core=createKnowledgeCore({approvedOnly:false});
test('载具和模块化装备通过统一获取协议解析',()=>{
 for(const [query,canonical,kind] of [['虚空锐将','Voidrig','vehicle'],['机甲','Voidrig','vehicle'],['滑板','K-Drive','modular-equipment'],['K式发射器','K-Drive Launcher','gear'],['增幅器','Amp','modular-equipment'],['Zaw','Zaw','modular-equipment'],['Kitgun','Kitgun','modular-equipment']]){const result=core.getAcquisition(query);assert.equal(result.entry.subject.canonical,canonical,query);assert.equal(result.entry.subject.category,kind,query);assert.ok(result.structuredMethods.length,query);assert.ok(result.structuredMethods.every(method=>method.requirements&&Array.isArray(method.requirementLines)),query)}
 assert.match(core.getAcquisition('滑板').description,/板身、反应堆、鼻锥和喷射器/);assert.match(core.getAcquisition('K式发射器').description,/索拉里斯之声/);assert.match(core.getAcquisition('增幅器').description,/棱镜、支架和曲柄/);assert.match(core.getAcquisition('增幅器').description,/夜羽.*索拉里斯之声/s)
});
test('载具目录全量审计没有空获取协议',()=>{const audit=core.auditEquipmentAcquisition();assert.equal(audit.count,6);assert.equal(audit.vehicle,1);assert.equal(audit.modular,4);assert.deepEqual(audit.missingMethods,[])})
