import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safePlayerLootItem,lootDestinationOptions,lootEquipmentComparison}
  from '../src/state/lootCollectionModel.mjs';
import {playerAvailableLoot} from '../src/state/partyLootViewModel.mjs';

const privateItem={
  id:'sword',name:'Doombringer',trueName:'Doombringer',basicName:'Mysterious Blade',
  identified:false,qty:2,type:'Sword',rarity:'Legendary',quality:'Superior',
  material:'Voidsteel',materialBaseAC:99,
  description:'Cursed prophecy',effects:[{name:'Death'}],
  hiddenProperties:['fatal'],gmNotes:'Doom',ownerUid:'gm',
  image:'https://example.com/secret.png',metadata:{internal:'secret'}
};
const loot={
  loot:[
    {id:'unknown',visibility:'revealed',status:'available',kind:'item',
      title:'Old Shrine',source:'Ruins',item:privateItem},
    {id:'known',visibility:'revealed',status:'available',kind:'item',
      title:'Treasure Chest',source:'Cave',item:{
        name:'Iron Sword',identified:true,qty:1,type:'Weapon',
        rarity:'Common',description:'A simple blade',allowedSlots:['Main Hand'],
        gmNotes:'Keep secret',ownerUid:'gm',effects:[{name:'Hidden'}],
        trueName:'Forbidden Sword',image:'secret-art.png'
      }},
    {id:'hidden',visibility:'hidden',status:'available',kind:'item',
      title:'Secret Loot',item:{name:'Hidden Sword'}},
    {id:'claimed',visibility:'revealed',status:'claimed',kind:'item',
      title:'Previous Loot',item:{name:'Old Sword'}}
  ],
  drafts:[{id:'gm-only',visibility:'hidden',status:'available',secretItem:privateItem}]
};

test('Phase 9.1: unidentified loot shows quantity only and never exposes private metadata',()=>{
  const projected=safePlayerLootItem(privateItem);
  assert.deepEqual(projected,{name:'Unidentified Item',qty:2,identified:false});
  const publicDrops=playerAvailableLoot(loot);
  assert.deepEqual(publicDrops.map(row=>row.id),['unknown','known']);
  assert.deepEqual(publicDrops[0].item,projected);
  for(const token of ['Doombringer','Voidsteel','Cursed prophecy','Doom','secret.png','fatal','Forbidden Sword','Hidden'])
    assert.equal(JSON.stringify(publicDrops).includes(token),false,token);
  assert.deepEqual(playerAvailableLoot(loot,{search:'doombringer'}),[]);
});

test('Phase 9.1: identified loot exposes only bounded public inspection fields',()=>{
  const item=playerAvailableLoot(loot)[1].item;
  assert.equal(item.name,'Iron Sword');
  assert.equal(item.type,'Weapon');
  assert.equal(item.description,'A simple blade');
  assert.equal(item.qty,1);
  assert.deepEqual(item.allowedSlots,['Main Hand']);
  assert.equal(item.trueName,undefined);
  assert.equal(item.effects,undefined);
  assert.equal(item.image,undefined);
  assert.equal(item.ownerUid,undefined);
  assert.equal(item.metadata,undefined);
  assert.equal(safePlayerLootItem({identified:true,description:'A'.repeat(5000)}).description.length,600);
});

test('Phase 9.1: storage preview shows each actual container without inventing available slots',()=>{
  const storages=[{id:'bag',name:'Backpack',rows:2,cols:2,maxSlots:4},{id:'chest',name:'Small Bag',rows:2,cols:2,maxSlots:4}];
  const items=[
    {id:'a',storageId:'bag',storageSlot:0},{id:'b',storageId:'bag',storageSlot:1},
    {id:'c',storageId:'bag',storageSlot:2},{id:'d',storageId:'bag',storageSlot:3},
    {id:'e',storageId:'bag',storageSlot:7},
    {id:'other',storageId:'chest',storageSlot:1},
    {id:'equipped',storageId:'chest',equipped:true,storageSlot:0}
  ];
  const options=lootDestinationOptions(storages,items);
  assert.equal(options.length,2);
  assert.deepEqual(options[0],{id:'bag',name:'Backpack',used:4,capacity:4,free:0,overflow:1,full:true});
  assert.equal(options[1].free,3);
  assert.equal(options[1].used,1);
  assert.deepEqual(lootDestinationOptions([],items),[]);
});

test('Phase 9.1: comparison never identifies unknown gear, invents armour values or automatically equips loot',()=>{
  const character={inventory:[],equipment:{}};
  assert.deepEqual(lootEquipmentComparison(privateItem,character),{
    available:false,reason:'Identify this item before comparing equipment.'
  });
  const known={identified:true,name:'Iron Sword',type:'Weapon',allowedSlots:['Main Hand']};
  const comparison=lootEquipmentComparison(known,character,[]);
  assert.equal(comparison.available,true);
  assert.equal(comparison.slot,'Main Hand');
  assert.equal(comparison.currentName,'Nothing equipped');
  assert.equal(comparison.acEstimate,null);
  assert.match(comparison.notice,/Collecting loot does not equip/);
  assert.equal(character.inventory.length,0);
  assert.equal(lootEquipmentComparison({identified:true,name:'Potion'},character).available,false);
  const armour=lootEquipmentComparison({identified:true,name:'Iron Helmet',armourPieceType:'helmet'},character);
  assert.equal(armour.acEstimate,null);
});

test('Phase 9.1: UI requires inspection and a destination before existing secure claims',()=>{
  const ui=readFileSync(new URL('../src/dashboards/PartyLootWorkspace.jsx',import.meta.url),'utf8');
  const model=readFileSync(new URL('../src/state/lootCollectionModel.mjs',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/asteria-react.css',import.meta.url),'utf8');
  const commands=readFileSync(new URL('../functions/partyLootCommands.mjs',import.meta.url),'utf8');
  assert.match(ui,/Inspect Item/);
  assert.match(ui,/Collect Item/);
  assert.match(ui,/lootEquipmentComparison/);
  assert.match(ui,/lootDestinationOptions/);
  assert.match(ui,/Claim to \{selectedLootStorage/);
  assert.match(ui,/firebaseService\.claimPartyLoot\(campaignId,character\.id,\{lootId,storageId\}\)/);
  assert.match(ui,/No character inventory containers available/);
  assert.match(ui,/Refresh party treasure before retrying/);
  assert.match(ui,/modal|Modal/);
  assert.match(commands,/verifyOwnedLiveCharacter/);
  assert.match(commands,/requireLiveSession/);
  assert.match(commands,/placeCharacterItem/);
  assert.match(commands,/tx\.update\(lootRef\(campaignId,lootId\)/);
  assert.match(css,/\.react-party-loot-collect-card/);
  assert.doesNotMatch(model,/firebaseService|setDoc|updateDoc|runTransaction|secretItem/);
});
