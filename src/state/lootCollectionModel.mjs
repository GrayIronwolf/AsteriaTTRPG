// Phase 9.1 — presentation-only inspection, storage and comparison selectors.
// The callable claimPartyLoot remains the only authority for collection.
import {storageSlotLayout} from './liveWorkspaceModel.mjs';
import {calculateArmourPieceAC,previewEquipmentChange} from '../systems/armour/armourSystem.mjs';
import {availableInventoryEquipmentSlots} from './inventoryQuickActions.mjs';

const list=value=>Array.isArray(value)?value:[];
const words=(value,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
const knownNumber=value=>Number.isFinite(Number(value))&&value!==null&&value!==''?Number(value):null;
const quantity=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):1;

// Never pass unstructured item or metadata objects into the player inspection UI.
// A GM's trueName, hidden effects, notes, ownership and discovery fields are not
// approved display properties, even if an old public record accidentally has them.
export function safePlayerLootItem(item={}){
  const qty=quantity(item?.qty??item?.quantity);
  if(item?.identified===false) return {name:'Unidentified Item',qty,identified:false};
  const allowedSlots=list(item?.allowedSlots).filter(v=>typeof v==='string')
    .map(v=>words(v,60)).filter(Boolean).slice(0,8);
  const materialBaseAC=knownNumber(item?.materialBaseAC);
  const armourPercentile=knownNumber(item?.armourPiecePercentile);
  const weight=knownNumber(item?.weight??item?.unitWeight);
  return {
    name:words(item?.name||item?.title,160)||'Item',
    qty,identified:true,
    type:words(item?.type||item?.itemType||item?.category,80),
    rarity:words(item?.rarity||item?.itemClass,60),
    description:words(item?.description||item?.summary,600),
    quality:words(item?.quality,60),
    material:words(item?.material,100),
    ...(weight!==null&&weight>=0?{weight}:{}),
    ...(allowedSlots.length?{allowedSlots}:{}),
    ...(words(item?.armourPieceType,80)?{armourPieceType:words(item.armourPieceType,80)}:{}),
    ...(words(item?.armourType,80)?{armourType:words(item.armourType,80)}:{}),
    ...(materialBaseAC!==null&&materialBaseAC>=0?{materialBaseAC}:{}),
    ...(armourPercentile!==null&&armourPercentile>=0&&armourPercentile<=1?{armourPiecePercentile:armourPercentile}:{})
  };
}

// A preview of inventory slots, not a reservation or a server-side capacity check.
// A full container can still accept an item if the trusted transaction merges stacks.
export function lootDestinationOptions(storages=[],items=[]){
  return list(storages).filter(storage=>storage?.id)
    .map(storage=>{
      const present=list(items).filter(item=>
        !item?.equipped&&String(item.storageId||'')===String(storage.id));
      const layout=storageSlotLayout(present,storage);
      return {
        id:String(storage.id),
        name:words(storage.name,120)||'Storage',
        used:layout.used,
        capacity:layout.capacity,
        free:Math.max(0,layout.capacity-layout.used),
        overflow:layout.overflow.length,
        full:layout.used>=layout.capacity
      };
    });
}

const slotKey=slot=>words(slot,80).toLowerCase().replace(/[\s_-]+/g,' ').trim()
  .replace(/^main weapon$/,'main hand').replace(/^secondary weapon$/,'ranged weapon')
  .replace(/^off hand$/,'off hand').replace(/^chest armor$/,'torso');
function previousEquipment(character={},items=[],slot=''){
  const wanted=slotKey(slot);
  const fromInventory=list(items).find(item=>item?.equipped&&
    slotKey(item.equippedSlot||item.slot||item?.raw?.equippedSlot)===wanted);
  if(fromInventory)return fromInventory;
  const entries=Object.entries(character?.equipment||{});
  const match=entries.find(([location])=>slotKey(location)===wanted);
  return match?.[1]&&typeof match[1]==='object'?match[1]:null;
}

// An estimate is only shown when the armour rules have full, consistent inputs.
// For weapons/other gear with no canonical damage comparison, show slot and
// current equipment only rather than inventing offensive statistics.
export function lootEquipmentComparison(item={},character={},items=[]){
  if(item?.identified===false)return {
    available:false,reason:'Identify this item before comparing equipment.'
  };
  const safe=safePlayerLootItem(item);
  const piece=calculateArmourPieceAC(safe);
  const slot=piece.piece?.location||availableInventoryEquipmentSlots(safe)[0]||'';
  if(!slot)return {available:false,reason:'No supported equipment slot is known for this item.'};
  const current=previousEquipment(character,items,slot);
  const currentName=current?.identified===false?'Unidentified Item':
    words(current?.name||current?.title,160)||'Nothing equipped';
  const result={
    available:true,slot,
    currentName,
    newName:safe.name,
    acEstimate:null,
    notice:'This comparison is informational. Collecting loot does not equip it.'
  };
  if(!piece.piece)return result;
  if(!piece.valid)return {...result,notice:'Armour comparison unavailable until item material and quality are configured.'};
  try{
    const preview=previewEquipmentChange(character,safe,slot);
    if(preview.before.naturalACConfigured&&
      preview.before.validation.valid&&preview.result.validation.valid){
      return {...result,acEstimate:{
        current:preview.before.finalAC,
        projected:preview.result.finalAC,
        delta:preview.delta.ac
      }};
    }
    return {...result,notice:'Exact armour comparison unavailable for the current character data.'};
  }catch{
    return {...result,notice:'Exact armour comparison unavailable for the current character data.'};
  }
}
