'use strict'

const RELIC_ERA_ZH=Object.freeze({Lith:'古纪',Meso:'前纪',Neo:'中纪',Axi:'后纪'})
const TIER_ZH=Object.freeze({Rare:'金',Uncommon:'银',Common:'铜'})
function localizeRelicName(name){return String(name||'').replace(/^(Lith|Meso|Neo|Axi)\b/i,era=>RELIC_ERA_ZH[era[0].toUpperCase()+era.slice(1).toLowerCase()]||era)}
function relicRewardTier(reward){if(TIER_ZH[reward?.rarity])return TIER_ZH[reward.rarity];const raw=Number(reward?.chance),chance=raw>1?raw/100:raw;return chance<=0.02?'金':chance<=0.11?'银':'铜'}
function classifyPrimeAcquisition({isPrime,relicMethods=[],nonRelicMethods=[]}={}){if(!isPrime)return{kind:'standard',status:null,methods:nonRelicMethods};if(nonRelicMethods.length)return{kind:'special-prime',status:'特殊来源',methods:nonRelicMethods};if(!relicMethods.length)return{kind:'prime-relic',status:'已入库',methods:[]};const current=relicMethods.filter(method=>method.active),resurgence=relicMethods.filter(method=>method.resurgence);if(current.length)return{kind:'prime-relic',status:'当前出库',methods:current};if(resurgence.length)return{kind:'prime-relic',status:'Prime 重生',methods:resurgence};return{kind:'prime-relic',status:'已入库',methods:[]}}
function renderPrimePartMethods(methods,partName){return(methods||[]).map(method=>`${partName}：开启${localizeRelicName(method.relicCanonical)}遗物（${relicRewardTier(method)}）获得`)}
module.exports={RELIC_ERA_ZH,TIER_ZH,localizeRelicName,relicRewardTier,classifyPrimeAcquisition,renderPrimePartMethods}
