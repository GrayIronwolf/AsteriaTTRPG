import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  STATION_TYPES,SERVICE_TYPES,normalizeCraftingStation,normalizeNPCService,
  stationAccessible,serviceSignature,repairTargetEligible,repairFingerprint,
  serviceInventoryPlan,applyApprovedRepair
} from '../src/state/craftingServicesModel.mjs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const station=(patch={})=>({name:'Western Forge',type:'Forge',status:'open',
  location:'Vaelgard',allowedCharacterIds:[],...patch});
const service=(patch={})=>({name:'Restore Blade',provider:'Mira the Smith',
  type:'repair',status:'published',stationId:'forge',feeCopper:250,restoreTo:100,
  materials:[{name:'Iron Ingot',quantity:2}],...patch});
const sword=(patch={})=>({id:'blade',instanceId:'blade',name:'Iron Sword',type:'Weapon',
  condition:40,durability:4,maxDurability:10,qty:1,identified:true,
  equipped:false,storageId:'bag',...patch});
const mat=(id,qty)=>({id,instanceId:id,name:'Iron Ingot',qty,identified:true,storageId:'bag'});
test('Phase 11.3: station access and private configuration validate',()=>{
  const forge=normalizeCraftingStation(station(),'forge');
  assert.equal(forge.type,'Forge');
  assert.equal(stationAccessible(forge,'player'),true);
  assert.equal(stationAccessible({...forge,status:'closed'},'player'),false);
  assert.equal(stationAccessible({...forge,allowedCharacterIds:['one']},'two'),false);
  assert.equal(stationAccessible({...forge,allowedCharacterIds:['one']},'one'),true);
  for(const bad of [station({name:''}),station({type:'Invalid'}),
    station({status:'published'}),station({allowedCharacterIds:['one','one']}),
    station({allowedCharacterIds:['a','/b']})])
    assert.throws(()=>normalizeCraftingStation(bad,'forge'));
  assert.ok(STATION_TYPES.includes('Enchanting Table'));
});
test('Phase 11.3: NPC services use explicit GM costs and repair targets',()=>{
  const row=normalizeNPCService(service(),'fix');
  assert.equal(row.feeCopper,250);
  assert.equal(row.restoreTo,100);
  assert.equal(row.materials[0].quantity,2);
  assert.ok(SERVICE_TYPES.includes('artisan'));
  for(const bad of [service({name:''}),service({provider:''}),
    service({feeCopper:-1}),service({feeCopper:1.5}),service({restoreTo:101}),
    service({restoreTo:0}),service({status:'open'}),
    service({materials:[{name:'Ore',quantity:0}]})])
    assert.throws(()=>normalizeNPCService(bad,'fix'));
  assert.equal(normalizeNPCService(service({type:'artisan'}),'custom').restoreTo,null);
  assert.notEqual(serviceSignature(row),serviceSignature({...row,feeCopper:251}));
});
test('Phase 11.3: repair selects only eligible damaged unstacked equipment',()=>{
  const fix=normalizeNPCService(service(),'fix');
  assert.equal(repairTargetEligible(sword(),fix),true);
  for(const patch of [{qty:2},{equipped:true},{locked:true},{bound:true},
    {questItem:true},{identified:false},{location:'trade-escrow'},
    {type:'Armour'},{condition:100,durability:10},
    {condition:'Damaged',durability:'Low',maxDurability:'High'}]){
    assert.equal(repairTargetEligible(sword(patch),{...fix,targetType:'Weapon'}),false);
  }
  assert.equal(repairTargetEligible(sword(),{...fix,targetType:'Weapon'}),true);
  assert.notEqual(repairFingerprint(sword()),repairFingerprint(sword({condition:41})));
  assert.notEqual(repairFingerprint(sword()),repairFingerprint(sword({instanceId:'fake'})));
});
test('Phase 11.3: repair restores only numeric condition and durability without item duplication',()=>{
  const fixed=applyApprovedRepair(sword(),normalizeNPCService(service(),'fix'));
  assert.equal(fixed.condition,100);
  assert.equal(fixed.durability,10);
  assert.equal(fixed.maxDurability,10);
  assert.equal(fixed.instanceId,'blade');
  assert.equal(fixed.qty,1);
  assert.equal(fixed.enchantments,undefined);
  assert.equal(sword().condition,40);
  const partial=normalizeNPCService(service({restoreTo:75}),'partial');
  assert.equal(applyApprovedRepair(sword(),partial).durability,8);
  assert.throws(()=>applyApprovedRepair(sword({condition:100,durability:10}),partial));
});
test('Phase 11.3: target may never double as material and material stacks may not double-spend',()=>{
  const fix=normalizeNPCService(service(),'fix');
  const inventory=[sword(),mat('ore1',1),mat('ore2',2)];
  const plan=serviceInventoryPlan(fix,inventory,0);
  assert.equal(plan.ready,true);
  assert.equal(plan.allocations.some(row=>row.index===0),false);
  assert.equal(plan.allocations.reduce((n,row)=>n+row.quantity,0),2);
  const scarce=serviceInventoryPlan({...fix,materials:[
    {name:'Iron Ingot',quantity:2},{name:'Iron Ingot',quantity:2}
  ]},inventory,0);
  assert.equal(scarce.ready,false);
  assert.equal(serviceInventoryPlan({...fix,materials:[]},[sword()],0).ready,true);
});
test('Phase 11.3: trusted Firebase, GM permissions and UI wiring exist',()=>{
  const backend=read('../functions/craftingServiceCommands.mjs');
  const commands=read('../functions/commands.mjs');
  const handler=read('../functions/handler.mjs');
  const permissions=read('../functions/characterPermissions.mjs');
  const rules=read('../firestore.rules');
  const client=read('../js/firebase-auth.js');
  const wrapper=read('../src/firebase/asteriaFirebaseService.js');
  const ui=read('../src/dashboards/CraftingServicesWorkspace.jsx');
  const gm=read('../src/dashboards/GMWorkspacePanels.jsx');
  const player=read('../src/dashboards/CharacterDashboard.jsx');
  for(const action of ['manageCraftingStation','manageNPCService','requestNPCRepair','reviewNPCRepair']){
    assert.match(backend,new RegExp(action+':async'));
    assert.match(handler,new RegExp(action+'|'+(action==='requestNPCRepair'?'requestNPCRepair':'manageNPCService')));
    assert.match(client,new RegExp(action));
    assert.match(wrapper,new RegExp(action));
  }
  assert.match(permissions,/reviewNPCRepair/);
  assert.match(commands,/createCraftingServiceCommands/);
  assert.match(backend,/requireLiveSession/);
  assert.match(backend,/requireCampaignGM/);
  assert.match(backend,/verifyOwnedLiveCharacter/);
  assert.match(backend,/writeLiveCharacter\(tx,refs,character\)/);
  assert.match(backend,/setCurrencyTotal\(character,total-service\.feeCopper\)/);
  assert.match(backend,/repairFingerprint\(inventory\[index\]\)/);
  assert.match(backend,/serviceSignature\(prior\)/);
  for(const name of ['craftingStations','npcCraftingServices','npcRepairRequests'])
    assert.match(rules,new RegExp('match /'+name+'/'));
  assert.match(ui,/Approve & Repair/);
  assert.match(ui,/Request Repair/);
  assert.match(gm,/GMCraftingServices/);
  assert.match(player,/PlayerCraftingServices/);
});
