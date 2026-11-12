import {parseResourceCost} from './liveWorkspaceModel.mjs';

// Presentation-only rules. The Firebase transaction remains authoritative for
// item ownership, equipment, resource recovery and trade eligibility.
export const INVENTORY_CATEGORIES=Object.freeze([
  {id:'all',label:'All Items'},
  {id:'weapons',label:'Weapons'},
  {id:'armour',label:'Armour'},
  {id:'consumables',label:'Consumables'},
  {id:'materials',label:'Materials'},
  {id:'other',label:'Other'}
]);

export function inventoryCategory(item={}){
  if(item.identified===false)return 'other';
  const type=String(item.type||item.raw?.type||item.raw?.category||'').toLowerCase();
  const name=String(item.name||'').toLowerCase();
  if(/weapon|sword|axe|dagger|bow|arrow|bolt|staff|wand|spear|ammunition|quiver/.test(type+' '+name))return 'weapons';
  if(/armour|armor|helmet|helm|shield|gauntlet|greave|chestplate/.test(type+' '+name))return 'armour';
  if(/consum|potion|elixir|food|ration|draught|poison/.test(type+' '+name))return 'consumables';
  if(/material|ore|ingot|crystal|ingredient|herb|wood|reagent/.test(type+' '+name))return 'materials';
  return 'other';
}

export function matchesInventoryFilter(item={},query='',category='all'){
  if(category!=='all'&&inventoryCategory(item)!==category)return false;
  const search=String(query||'').trim().toLowerCase();
  if(!search)return true;
  const source=item.identified===false?[item.name,'unidentified']:
    [item.name,item.trueName,item.type,item.rarity,item.raw?.material,item.raw?.quality];
  return source.some(text=>String(text||'').toLowerCase().includes(search));
}

export function canTransferInventoryItem(item={}){
  return Boolean(item.id&&Number(item.qty)>0&&!item.equipped&&!item.locked&&!item.bound&&!item.questItem);
}

export function itemRecoveryEffect(item={}){
  // This is the effect that the existing server-side 'use' operation supports.
  const effect=item.raw?.effect??item.raw?.effects??item.effect??item.effects;
  if(!effect)return {};
  const amounts=effect?.resource?
    {[String(effect.resource).toLowerCase()]:Number(effect.amount||0)}:
    parseResourceCost(effect);
  return Object.fromEntries(Object.entries(amounts||{}).filter(([,value])=>Number.isFinite(Number(value))&&Number(value)>0));
}

export function availableInventoryEquipmentSlots(item={}){
  const input=item.allowedSlots||item.raw?.allowedSlots||item.raw?.equipmentSlots;
  const aliases={'main weapon':'Main Hand','main hand':'Main Hand',
    'secondary weapon':'Ranged Weapon','off-hand':'Off Hand','off weapon':'Off Hand',
    'quiver':'Ammunition','chest':'Torso','chest armor':'Torso'};
  const original=(Array.isArray(input)?input:input?[input]:[])
    .map(value=>String(value||'').trim()).filter(Boolean)
    .map(value=>aliases[value.toLowerCase()]||value);
  if(original.length)return [...new Set(original)];
  const type=String(item.type||item.raw?.type||'').toLowerCase();
  const name=String(item.name||'').toLowerCase();
  const combined=type+' '+name;
  if(/bow|crossbow|ranged/.test(combined))return ['Ranged Weapon'];
  if(/quiver|ammunition|arrow|bolt/.test(combined))return ['Ammunition'];
  if(/shield/.test(combined))return ['Off Hand'];
  if(/sword|axe|dagger|mace|weapon|staff|wand|spear/.test(combined))return ['Main Hand','Off Hand'];
  return [];
}

export function inventoryQuickActionAvailability(item,{editable=false,busy=false,hasStorage=false,hasParty=false,hasMerchant=false}={}){
  const ready=Boolean(item?.id&&Number(item.qty)>0);
  const writeable=Boolean(ready&&editable&&!busy);
  const transferable=writeable&&canTransferInventoryItem(item);
  return {
    inspect:Boolean(item?.id),
    use:writeable&&Object.keys(itemRecoveryEffect(item)).length>0,
    equip:writeable&&!item.equipped&&availableInventoryEquipmentSlots(item).length>0,
    unequip:writeable&&Boolean(item.equipped),
    store:writeable&&!item.equipped&&hasStorage,
    give:transferable&&hasParty,
    trade:transferable&&hasParty,
    sell:transferable&&(hasMerchant||hasParty)
  };
}
