'use strict';
const target="D:/Warframe/warframe-knowledge-core/scripts/sync-official-mods.js";
if(require.main===module){const result=require('node:child_process').spawnSync(process.execPath,[target,...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});process.exitCode=result.status??1;}else module.exports=require(target);
