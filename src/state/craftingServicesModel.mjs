// Phase 11.3 — GM-defined workstations, NPC services and item repairs.
// No automatic skill checks, crafting odds, magic effects or item valuation.
import {craftingInventoryPlan} from './craftingRecipeModel.mjs';

export const STATION_TYPES=Object.freeze(['Forge','Enchanting Table','Alchemy Table','Workshop','Other']);
export const SERVICE_TYPES=Object.freeze(['repair','crafting','enchanting','artisan','other']);
const clean=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const list=v=>Array.isArray(v)?v:[];
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(v)&&
  !['__proto__','prototype','constructor'].includes(v);
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;

export function normalizeCraftingStation(source={},stationId='',previous={}){
  const key=stationId||source.id;
  if(!id(key))throw Error('Choose a valid station ID.');
  if(!clean(source.name)||String(source.name).length>160)throw Error('Enter a station name.');
  if(!STATION_TYPES.includes(source.type))throw Error('Choose a supported station type.');
  if(!['draft','open','closed'].includes(source.status))
    throw Error('Choose a station availability status.');
  if(source.location!==undefined&&(typeof source.location!=='string'||source.location.length>160))
    throw Error('Station location is too long.');
  if(source.description!==undefined&&(typeof source.description!=='string'||source.description.length>1000))
    throw Error('Station description is too long.');
  const allowed=list(source.allowedCharacterIds);
  if(allowed.length>50||allowed.some(value=>!id(value))||new Set(allowed).size!==allowed.length)
    throw Error('Select up to 50 distinct linked characters for station access.');
  return {id:key,name:clean(source.name),type:source.type,status:source.status,
    location:clean(source.location),description:clean(source.description,1000),
    allowedCharacterIds:allowed,createdAt:previous.createdAt||null};
}
export function stationAccessible(station,characterId=''){
  if(!station||station.status!=='open')return false;
  const allowed=list(station.allowedCharacterIds);
  return !allowed.length||Boolean(characterId&&allowed.includes(characterId));
}
export function normalizeNPCService(source={},serviceId='',previous={}){
  const key=serviceId||source.id;
  if(!id(key))throw Error('Choose a valid NPC service ID.');
  if(!clean(source.name)||String(source.name).length>160)
    throw Error('Enter a service name.');
  if(!clean(source.provider)||String(source.provider).length>160)
    throw Error('Enter the NPC provider name.');
  if(!SERVICE_TYPES.includes(source.type))throw Error('Choose a supported NPC service type.');
  if(!['draft','published'].includes(source.status))throw Error('Choose draft or published.');
  if(source.description!==undefined&&(typeof source.description!=='string'||source.description.length>1000))
    throw Error('Service description is too long.');
  if(source.stationId!==undefined&&source.stationId!==''&&!id(source.stationId))
    throw Error('Choose a valid station.');
  if(source.targetType!==undefined&&(typeof source.targetType!=='string'||source.targetType.length>100))
    throw Error('Target item type is too long.');
  if(!integer(source.feeCopper,0,100000000))
    throw Error('Service fee must be a whole copper amount from 0 to 100,000,000.');
  const input=list(source.materials);
  if(input.length>12)throw Error('A service can require at most 12 materials.');
  const materials=input.map(row=>{
    if(!row||!clean(row.name)||String(row.name).length>160||
      (row.itemCode!==undefined&&(typeof row.itemCode!=='string'||row.itemCode.length>128))||
      !integer(row.quantity,1,1000))
      throw Error('Each required material needs a name and quantity from 1 to 1,000.');
    return {name:clean(row.name),itemCode:clean(row.itemCode,128).toLowerCase(),
      quantity:row.quantity};
  });
  if(source.type==='repair'&&!integer(source.restoreTo,1,100))
    throw Error('Set a repair condition between 1% and 100%.');
  return {id:key,name:clean(source.name),provider:clean(source.provider),
    type:source.type,status:source.status,description:clean(source.description,1000),
    stationId:source.stationId||'',targetType:clean(source.targetType,100),
    feeCopper:source.feeCopper,materials,
    restoreTo:source.type==='repair'?source.restoreTo:null,
    createdAt:previous.createdAt||null};
}
export function serviceSignature(s){
  return JSON.stringify([s.type,s.status,s.provider,s.name,s.description,s.stationId,
    s.targetType,s.feeCopper,s.materials,s.restoreTo]);
}
export function repairTargetEligible(item={},service={}){
  if(service.type!=='repair'||!item||typeof item!=='object')return false;
  if(Number(item.qty??item.quantity??1)!==1||item.identified===false||
    item.equipped||item.locked||item.bound||item.questItem||
    ['trade-escrow','player-request-escrow','shop','merchant'].includes(item.location))return false;
  const type=clean(item.type||item.itemType||item.category,100).toLowerCase();
  if(service.targetType&&type!==service.targetType.toLowerCase())return false;
  const c=item.condition,d=item.durability,m=item.maxDurability;
  const numericCondition=typeof c==='number'&&Number.isFinite(c)&&c>=0&&c<=100;
  const numericDurability=typeof d==='number'&&typeof m==='number'&&
    Number.isFinite(d)&&Number.isFinite(m)&&m>0&&d>=0&&d<=m;
  const pct=service.restoreTo;
  if(!integer(pct,1,100))return false;
  return (numericCondition&&c<pct)||
    (numericDurability&&d<Math.ceil(m*pct/100));
}
export function repairFingerprint(item={}){
  return JSON.stringify([item.instanceId||item.id||'',item.definitionId||'',
    item.name||'',item.type||'',item.material||'',item.quality||'',
    item.qty??item.quantity??1,item.storageId||'',item.storageSlot??null,
    Boolean(item.equipped),Boolean(item.locked),Boolean(item.bound),
    Boolean(item.questItem),item.identified!==false,item.condition??null,
    item.durability??null,item.maxDurability??null,item.enchantments||[],
    item.upgrades||[]]);
}
export function serviceInventoryPlan(service,items=[],targetIndex=-1){
  const materialRows=list(items).map((item,index)=>index===targetIndex?{...item,qty:0}:item);
  if(!service.materials?.length)return {ready:true,requirements:[],allocations:[]};
  return craftingInventoryPlan({materials:service.materials},materialRows);
}
export function applyApprovedRepair(item={},service={}){
  if(!repairTargetEligible(item,service))throw Error('Item is not eligible for this repair.');
  const copy={...item};
  if(typeof copy.condition==='number'&&Number.isFinite(copy.condition))
    copy.condition=Math.max(copy.condition,service.restoreTo);
  if(typeof copy.durability==='number'&&typeof copy.maxDurability==='number'&&
    Number.isFinite(copy.durability)&&Number.isFinite(copy.maxDurability)&&copy.maxDurability>0)
    copy.durability=Math.max(copy.durability,Math.ceil(copy.maxDurability*service.restoreTo/100));
  return copy;
}
