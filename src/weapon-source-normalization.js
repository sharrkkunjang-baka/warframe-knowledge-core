'use strict';
const {loadEntityRegistries}=require('./entities');
let registries;
function missionSource(method){return String(method.sourceCanonical||'').replace(/,?\s*Rotation\s*[ABC].*$/i,'').trim();}
function normalizeMissionMethod(method){
  if(method.type!=='mission-reward'||!method.sourceCanonical)return method;
  const base=missionSource(method);
  registries ||= loadEntityRegistries();
  const location=registries.locations.get(base);
  if(location?.kind!=='mission-node')return method;
  const genericSource=method.sourceEntityId&&registries.locations.get(method.sourceEntityId)?.kind==='acquisition-source';
  if(method.sourceCanonical===base&&method.locationId===location.id&&!genericSource)return method;
  const rotation=method.rotation||String(method.sourceCanonical).match(/\bRotation\s*([ABC])\b/i)?.[1]||null;
  const normalized={...method,sourceCanonical:base,locationId:location.id,sourceDisplayName:location.displayName,rotation,sourceLocalizationStatus:location.displayName?'official-zh':method.sourceLocalizationStatus};
  // A concrete node takes precedence over a legacy catch-all mission source.
  if(genericSource)delete normalized.sourceEntityId;
  return normalized;
}
function missionMethodKey(method){
  if(method.type!=='mission-reward'||!method.sourceCanonical)return null;
  const probability=value=>value==null?null:Math.round(Number(value)*1e8)/1e8;
  return JSON.stringify([method.scope,method.partRefs||[],missionSource(method).toLowerCase(),method.rotation||null,method.stage||null,probability(method.chance),probability(method.sourceDropChance),probability(method.conditionalChance),method.quantity??null,method.quantityRange??null]);
}
function normalizeExchangeMethod(method){
  if(!['vendor-exchange','vendor-or-syndicate-exchange','syndicate-exchange'].includes(method.type)||!['none',undefined].includes(method.requirements?.type)||!(Number(method.amount)>0)||!method.currencyCanonical)return method;
  registries ||= loadEntityRegistries();
  const currency=registries.currencies.get(method.currencyCanonical);
  if(!currency||!method.npcId||!method.locationId)return method;
  return {...method,requirements:{...(method.requirements||{}),type:'currency',usage:'exchange',npcId:method.npcId,locationId:method.locationId,currency:[{currencyId:currency.id,amount:Number(method.amount)}]}};
}
function normalizeWeaponMissionRoutes(routes){return routes.map(route=>{
  const methods=(route.methods||[]).map(normalizeMissionMethod).map(normalizeExchangeMethod);
  const officialKeys=new Set(methods.filter(method=>method.provenance?.source==='DE Official Drop Tables').map(missionMethodKey).filter(Boolean));
  return {...route,methods:methods.filter(method=>!(method.provenance?.source==='installed-warframe-items'&&officialKeys.has(missionMethodKey(method))))};
});}
module.exports={missionSource,normalizeMissionMethod,normalizeExchangeMethod,missionMethodKey,normalizeWeaponMissionRoutes};
