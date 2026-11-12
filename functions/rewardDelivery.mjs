import {
  firstFreeStorageSlot,
  normalizeCharacterStorages,
  normalizeInventoryItems,
  stableInventoryItemId,
  structuredCloneSafe
} from '../src/state/liveWorkspaceModel.mjs';
import {
  normalizeEquipmentLocation,
  resolveArmourPiece,
  validateEquipmentChange
} from '../src/systems/armour/armourSystem.mjs';

// Match the equipment destinations offered by AsteriaInventory.inferSlots.
// The server must repeat these checks because a client can forge a slot.
const EQUIPMENT_SLOTS=[
  'Head','Neck','Shoulders','Chest','Back','Hands','Waist','Legs','Feet',
  'Main Hand','Off Hand','Ranged Weapon','Ammunition','Ring 1','Ring 2',
  'Trinket','Relic','Tool 1','Tool 2','Mount Head','Mount Body','Mount Bags',
  'Pet Armour','Pet Charm','Potion / Poison 1','Potion / Poison 2',
  'Potion / Poison 3','Potion / Poison 4'
];
const SLOT_ALIASES={
  necklace:'Neck',torso:'Chest','main weapon':'Main Hand',
  'off weapon':'Off Hand','secondary weapon':'Ranged Weapon',
  quiver:'Ammunition',shield:'Off Hand',charm:'Relic'
};
function equipmentSlotKey(value=''){
  const raw=String(value||'').trim();
  const alias=SLOT_ALIASES[raw.toLowerCase()]||raw;
  return String(normalizeEquipmentLocation(alias)||alias).toLowerCase().replace(/[^a-z0-9]/g,'');
}
const KNOWN_SLOT_KEYS=new Set([
  ...EQUIPMENT_SLOTS,
  'Torso','Upper Arms','Elbows','Forearms','Waist / Hips',
  'Upper Legs','Rear / Hips','Knees','Lower Legs','Off-Hand','Accessories'
].map(equipmentSlotKey));

export function rewardEquipmentSlots(item={}){
  const declared=item.allowedSlots??item.equipmentSlots??item.metadata?.equipmentSlots;
  const explicit=(Array.isArray(declared)?declared:declared?[declared]:[])
    .map(value=>SLOT_ALIASES[String(value).toLowerCase()]||String(value))
    .filter(value=>KNOWN_SLOT_KEYS.has(equipmentSlotKey(value)));
  if(declared!==undefined && declared!==null) return [...new Set(explicit)];
  const piece=resolveArmourPiece(item);
  if(piece) return [piece.location];
  const text=String([item.name,item.type,item.category,item.subcategory].filter(Boolean).join(' ')).toLowerCase();
  if(/potion|poison|elixir|draught|vial/.test(text)) return EQUIPMENT_SLOTS.filter(slot=>slot.startsWith('Potion / Poison'));
  if(/quiver|ammunition|arrow|bolt/.test(text)) return ['Ammunition'];
  if(/shield/.test(text)) return ['Off Hand'];
  if(/bow|crossbow|rifle|ranged/.test(text)) return ['Ranged Weapon'];
  if(/weapon|sword|axe|dagger|mace|spear|staff|wand/.test(text)) return ['Main Hand','Off Hand'];
  if(/helmet|helm|hood|head/.test(text)) return ['Head'];
  if(/shoulder|pauldron/.test(text)) return ['Shoulders'];
  if(/breastplate|chest|torso|armour|armor|robe/.test(text)) return ['Chest'];
  if(/cloak|cape|back/.test(text)) return ['Back'];
  if(/belt|waist/.test(text)) return ['Waist'];
  if(/legging|trouser|greave|legs/.test(text)) return ['Legs'];
  if(/glove|gauntlet|hand/.test(text)) return ['Hands'];
  if(/boot|shoe|feet/.test(text)) return ['Feet'];
  if(/necklace|amulet/.test(text)) return ['Neck'];
  if(/ring/.test(text)) return ['Ring 1','Ring 2'];
  if(/trinket/.test(text)) return ['Trinket'];
  if(/relic|charm/.test(text)) return ['Relic'];
  if(/tool|kit/.test(text)) return ['Tool 1','Tool 2'];
  return [];
}

// Called by both normal inventory equipment changes and GM reward claims.
// Work on a fresh inventory and commit it only after all checks pass.
export function equipCharacterInventoryItem(character,itemId,slot,{reward=false}={}){
  const destination=String(slot||'').trim();
  if(!destination) throw new Error('Choose an equipment slot.');
  const inventory=normalizeInventoryItems(character.inventory,character);
  const sourceId=String(itemId||'');
  const item=inventory.find(row=>stableInventoryItemId(row)===sourceId);
  if(!item) throw new Error('Inventory item not found.');
  const targetKey=equipmentSlotKey(destination);
  if(!KNOWN_SLOT_KEYS.has(targetKey)) throw new Error('Choose a valid equipment slot.');
  if(reward && !rewardEquipmentSlots(item).some(value=>equipmentSlotKey(value)===targetKey))
    throw new Error('This reward cannot be equipped in that slot. Choose a compatible slot or add it to storage.');

  const displaced=inventory.filter(row=>row.equipped &&
    stableInventoryItemId(row)!==sourceId && equipmentSlotKey(row.equippedSlot||row.slot)===targetKey);
  const nextInventory=inventory.map(row=>{
    const self=stableInventoryItemId(row)===sourceId;
    const removed=displaced.some(old=>stableInventoryItemId(old)===stableInventoryItemId(row));
    if(self) return {...row,equipped:true,equippedSlot:destination,slot:destination,location:'equipment'};
    if(removed) return {...row,equipped:false,equippedSlot:'',location:'inventory'};
    return row;
  });
  const nextItem=nextInventory.find(row=>stableInventoryItemId(row)===sourceId);
  const nextEquipment=Object.fromEntries(Object.entries(character.equipment||{}).filter(([key,row])=>
    equipmentSlotKey(key)!==targetKey && stableInventoryItemId(row||{})!==sourceId
  ));
  const validation=validateEquipmentChange({...character,inventory:nextInventory,equipment:nextEquipment},nextItem,destination);
  if(!validation.ok) throw new Error(validation.error||'This equipment cannot be worn in the selected slot.');

  const storages=normalizeCharacterStorages(character);
  for(const previous of nextInventory.filter(row=>displaced.some(old=>stableInventoryItemId(old)===stableInventoryItemId(row)))){
    const preferred=storages.find(row=>String(row.id)===String(previous.storageId||''));
    const candidates=[preferred,...storages].filter((value,index,rows)=>
      value && rows.findIndex(other=>other&&String(other.id)===String(value.id))===index);
    let placed=false;
    for(const storage of candidates){
      const free=firstFreeStorageSlot(nextInventory,storage,previous.id);
      if(free<0) continue;
      previous.storageId=storage.id;previous.storageSlot=free;previous.location='inventory';
      placed=true;break;
    }
    if(!placed) throw new Error('Make room in a storage container before replacing equipped gear.');
  }
  nextEquipment[destination]=nextItem;
  character.inventory=nextInventory;
  character.equipment=nextEquipment;
  return nextItem;
}

// A player may equip a reward when every bag is full, as long as doing so
// does not displace another item without a storage slot. The character and
// event are written atomically by the caller, so failed equipping leaves the
// reward pending rather than creating an orphaned inventory item.
export function stageDirectEquipReward(character,item,eventId){
  const inventory=normalizeInventoryItems(character.inventory,character);
  const base='reward-'+String(eventId||'item').replace(/[^a-z0-9_-]/gi,'').slice(0,100);
  let id=base,index=1;
  const used=new Set(inventory.map(row=>stableInventoryItemId(row)));
  while(used.has(id)){index+=1;id=base+'-'+index;}
  const received={
    ...structuredCloneSafe(item),id,instanceId:id,
    equipped:false,equippedSlot:'',location:'inventory',
    storageId:'',storageSlot:null
  };
  character.inventory=[...inventory,received];
  return received;
}
