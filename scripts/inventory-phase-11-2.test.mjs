import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ENCHANTMENT_RANKS,normalizeEnhancementPlan,enchantmentRequirements,
  enchantmentPreview,enhancementTargetEligible,enhancementTargetFingerprint,
  enhancementInventoryPlan,applyApprovedEnhancement,enhancementPlanSignature
} from '../src/state/itemEnhancementModel.mjs';
const raw=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const base=()=>({name:'Flame Binding',description:'A runic binding',
  mode:'enchantment',status:'published',targetType:'Weapon',
  effectName:'Flame Edge',effectDescription:'GM rules determine damage.',
  spellRank:'Weak',spellName:'Flame',spellMana:20,
  allowStoneSubstitution:false,materials:[]});
const sword=()=>({id:'sword',instanceId:'sword',name:'Iron Sword',type:'Weapon',
  qty:1,storageId:'bag',storageSlot:0,enchantmentAffinity:'Extreme',
  identified:true,equipped:false});
const mat=(id,name,qty)=>({id,instanceId:id,name,qty,storageId:'bag',identified:true});
test('Phase 11.2: Asteria rank MP bounds, crystal measures, time and DC are explicit',()=>{
  assert.deepEqual(ENCHANTMENT_RANKS.map(r=>r.minutes),
    [10,20,40,80,160,320,640,1280]);
  assert.deepEqual(ENCHANTMENT_RANKS.map(r=>r.crystals),[1,1,2,2,3,3,6,6]);
  assert.deepEqual(ENCHANTMENT_RANKS.map(r=>r.dc),[10,12,14,16,18,20,22,25]);
  assert.deepEqual(ENCHANTMENT_RANKS.map(r=>r.mpMin),[1,50,150,300,600,1000,1500,2500]);
  assert.deepEqual(ENCHANTMENT_RANKS.map(r=>r.mpMax),[49,149,299,599,999,1499,2499,3999]);
});
test('Phase 11.2: normalized plans validate mana, spell ranks, quantities and output description',()=>{
  const good=normalizeEnhancementPlan(base(),'fire');
  assert.equal(good.manaCost,40);
  assert.equal(good.spellMana,20);
  assert.equal(good.spellRank,'Weak');
  const bads=[
    {...base(),name:''},{...base(),status:'auto'},
    {...base(),spellMana:50},{...base(),spellMana:0},
    {...base(),spellRank:'Unknown'},{...base(),spellName:''},
    {...base(),materials:[{name:'Dust',quantity:0}]},
    {...base(),materials:[{name:'Dust',quantity:1.5}]},
    {...base(),effectName:''},{...base(),allowStoneSubstitution:true}
  ];
  for(const x of bads)assert.throws(()=>normalizeEnhancementPlan(x,'fire'));
  const upgrade=normalizeEnhancementPlan({...base(),mode:'upgrade',
    spellRank:'',spellName:'',spellMana:0,manaCost:12,
    materials:[{name:'Iron Ingot',quantity:2}]},'iron');
  assert.equal(upgrade.manaCost,12);
  assert.equal(upgrade.spellName,'');
  assert.equal(upgrade.mode,'upgrade');
  assert.throws(()=>normalizeEnhancementPlan({...base(),mode:'upgrade',materials:[]},'iron'));
});
test('Phase 11.2: stone substitutions cost four lower stones and add +4 DC',()=>{
  const plan=normalizeEnhancementPlan({...base(),spellRank:'Minor',
    spellMana:75,allowStoneSubstitution:true},'minor');
  assert.deepEqual(enchantmentRequirements(plan).map(x=>[x.name,x.quantity]),[
    ['Powdered Crystal',1],['Weak Soul Stone',1]
  ]);
  assert.deepEqual(enchantmentRequirements(plan,'lower-stone').map(x=>[x.name,x.quantity]),[
    ['Powdered Crystal',1],['Poor Soul Stone',4]
  ]);
  assert.equal(enchantmentPreview(plan,'Extreme').dc,8);
  assert.equal(enchantmentPreview(plan,'Extreme','lower-stone').dc,12);
  assert.equal(enchantmentPreview(plan,'None').dc,20);
  assert.throws(()=>enchantmentPreview(
    normalizeEnhancementPlan({...base(),spellRank:'Greater',spellMana:200},'greater'),'None'));
  assert.equal(enchantmentPreview(plan,'Medium').dc,null,
    'Unknown affinity categories require GM review instead of guessed numbers.');
});
test('Phase 11.2: only individual unequipped eligible items may be enchanted',()=>{
  const plan=normalizeEnhancementPlan(base(),'fire');
  const item=sword();
  assert.equal(enhancementTargetEligible(item,plan),true);
  for(const patch of [{qty:2},{equipped:true},{bound:true},{locked:true},
    {questItem:true},{identified:false},{location:'trade-escrow'},
    {type:'Consumable'},{enchantments:[{planId:'fire'}]}]){
    assert.equal(enhancementTargetEligible({...item,...patch},plan),false);
  }
  const fingerprint=enhancementTargetFingerprint(item);
  assert.notEqual(fingerprint,enhancementTargetFingerprint({...item,enchantments:['Flame']}));
  const upgraded=applyApprovedEnhancement(item,plan);
  assert.equal(upgraded.instanceId,item.instanceId);
  assert.equal(upgraded.qty,1);
  assert.equal(upgraded.enchantments.length,1);
  assert.equal(upgraded.enchantments[0].planId,'fire');
  assert.equal(item.enchantments,undefined);
  assert.equal(enhancementTargetEligible(upgraded,plan),false);
  assert.notEqual(enhancementPlanSignature(plan),enhancementPlanSignature({...plan,spellMana:49}));
});
test('Phase 11.2: materials exclude target and prevent duplicate ingredient allocation',()=>{
  const plan=normalizeEnhancementPlan({...base(),
    materials:[{name:'Charcoal',quantity:2}]},'fire');
  const inv=[sword(),mat('crystal','Powdered Crystal',1),
    mat('soul','Poor Soul Stone',1),mat('coal','Charcoal',3)];
  const preview=enhancementInventoryPlan(plan,inv,0);
  assert.equal(preview.ready,true);
  assert.equal(preview.allocations.some(x=>x.index===0),false);
  assert.equal(preview.allocations.reduce((sum,x)=>sum+x.quantity,0),4);
  assert.equal(enhancementInventoryPlan(plan,inv.slice(0,3),0).ready,false);
  const duplicate=normalizeEnhancementPlan({...base(),
    materials:[{name:'Powdered Crystal',quantity:1}]},'fire');
  assert.equal(enhancementInventoryPlan(duplicate,inv,0).ready,false);
});
test('Phase 11.2: restricted and authorized paths are wired through existing Firebase and user views',()=>{
  const server=raw('../functions/enhancementCommands.mjs');
  const handler=raw('../functions/handler.mjs');
  const perms=raw('../functions/characterPermissions.mjs');
  const commands=raw('../functions/commands.mjs');
  const rules=raw('../firestore.rules');
  const gm=raw('../src/dashboards/GMWorkspacePanels.jsx');
  const player=raw('../src/dashboards/CharacterDashboard.jsx');
  const ui=raw('../src/dashboards/ItemEnhancementWorkspace.jsx');
  const firebase=raw('../js/firebase-auth.js');
  assert.match(server,/manageEnhancementPlan:async/);
  assert.match(server,/requestEnhancement:async/);
  assert.match(server,/reviewEnhancement:async/);
  assert.match(server,/await requireCampaignGM\(tx,campaignId\)/);
  assert.match(server,/await requireLiveSession\(tx,campaignId\)/);
  assert.match(server,/verifyOwnedLiveCharacter/);
  assert.match(server,/writeLiveCharacter\(tx,refs,character\)/);
  assert.match(server,/applyResourceChanges/);
  assert.match(handler,/manageEnhancementPlan/);
  assert.match(perms,/reviewEnhancement/);
  assert.match(commands,/createEnhancementCommands\(context/);
  assert.match(rules,/match \/enhancementPlans\/\{planId\}/);
  assert.match(rules,/match \/enhancementRequests\/\{enhancementRequestId\}/);
  assert.match(firebase,/subscribeEnhancementPlans: function/);
  assert.match(gm,/GMEnhancementWorkshop/);
  assert.match(player,/PlayerEnhancementWorkshop/);
  assert.match(ui,/Approve & Apply/);
  assert.match(ui,/Request Enhancement/);
});
