import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeCraftingRecipe,craftingInventoryDefinition,craftingInventoryPlan,
  craftingMaterialMatches,craftingResultItem} from '../src/state/craftingRecipeModel.mjs';
const recipe=()=>({
  name:'Silver Blade',description:'Smithing',status:'published',
  materials:[{name:'Silver Ore',itemCode:'07-02-001-001',quantity:3},
    {name:'Charcoal',itemCode:'',quantity:2}],
  output:{name:'Silver Blade',itemCode:'07-06-002-001',type:'Weapon',quantity:1}
});
const item=(id,name,code,qty,more={})=>({id,name,definitionId:code,qty,...more});

test('Phase 11.1: recipe schema permits only complete GM-defined recipes',()=>{
  const good=normalizeCraftingRecipe(recipe(),'blade');
  assert.equal(good.id,'blade');
  assert.equal(good.materials[0].itemCode,'07-02-001-001');
  assert.deepEqual(craftingResultItem(good),{
    name:'Silver Blade',type:'Weapon',qty:1,definitionId:'07-06-002-001',
    'Asteria ID Index Code':'07-06-002-001',identified:true,equipped:false,
    equippedSlot:'',location:'inventory'
  });
  for(const bad of [
    {...recipe(),name:''},
    {...recipe(),status:'automatically-published'},
    {...recipe(),materials:[]},
    {...recipe(),materials:[{name:'Ore',quantity:0}]},
    {...recipe(),materials:[{name:'Ore',quantity:1.5}]},
    {...recipe(),output:{name:'Sword',quantity:101}},
    {...recipe(),output:{name:'',quantity:1}},
    {...recipe(),materials:Array.from({length:13},()=>({name:'Ore',quantity:1}))}
  ])assert.throws(()=>normalizeCraftingRecipe(bad,'blade'));
});
test('Phase 11.1: distinct material identifiers, quantities and exact names match character inventory',()=>{
  const source=[
    item('ore1','Silver Ore','07-02-001-001',2),
    item('ore2','Silver Ore','07-02-001-001',2),
    item('coal','Charcoal','',2),
    item('wrong','Silver Ore','07-02-001-002',20)
  ];
  assert.equal(craftingInventoryDefinition(source[0]),'07-02-001-001');
  assert.equal(craftingMaterialMatches(source[3],recipe().materials[0]),false);
  const plan=craftingInventoryPlan(recipe(),source);
  assert.equal(plan.ready,true);
  assert.equal(plan.allocations.reduce((sum,x)=>sum+x.quantity,0),5);
  assert.deepEqual(plan.requirements.map(x=>x.missing),[0,0]);
  assert.deepEqual(plan.allocations.map(x=>x.quantity),[2,1,2]);
  assert.equal(craftingInventoryPlan(recipe(),source.slice(0,1)).ready,false);
});
test('Phase 11.1: repeated requirements cannot spend the same stack twice',()=>{
  const dual={...recipe(),materials:[
    {name:'Charcoal',quantity:2},{name:'Charcoal',quantity:2}
  ]};
  const plan=craftingInventoryPlan(dual,[item('coal','Charcoal','',3)]);
  assert.equal(plan.ready,false);
  assert.equal(plan.requirements[1].missing,1);
});
test('Phase 11.1: equipped, hidden, bound, locked, quest and escrowed materials never qualify',()=>{
  const usable=item('ore','Silver Ore','07-02-001-001',3);
  for(const extra of [{equipped:true},{identified:false},{bound:true},{locked:true},
    {questItem:true},{location:'trade-escrow'},{qty:0}]){
    assert.equal(craftingMaterialMatches({...usable,...extra},recipe().materials[0]),false);
  }
  assert.equal(craftingMaterialMatches(usable,recipe().materials[0]),true);
});
test('Phase 11.1: trusted routes, rules and client interfaces are wired without changing existing GM notes',()=>{
  const load=p=>readFileSync(new URL(p,import.meta.url),'utf8');
  const cmd=load('../functions/craftingCommands.mjs');
  const server=load('../functions/itemStoreCommands.mjs');
  const handler=load('../functions/handler.mjs');
  const rules=load('../firestore.rules');
  const client=load('../js/firebase-auth.js');
  const ui=load('../src/dashboards/CraftingRecipeWorkspace.jsx');
  const gm=load('../src/dashboards/GMWorkspacePanels.jsx');
  const player=load('../src/dashboards/CharacterDashboard.jsx');
  assert.match(server,/manageCampaignCraftingRecipe:async/);
  assert.match(server,/await gm\(tx,campaignId\)/);
  assert.match(cmd,/requireLiveSession/);
  assert.match(cmd,/verifyOwnedLiveCharacter/);
  assert.match(cmd,/writeLiveCharacter\(tx,refs,character\)/);
  assert.match(cmd,/status:'approved'/);
  assert.match(cmd,/plan\.ready/);
  assert.match(handler,/reviewCraftingRequest/);
  assert.match(rules,/match \/craftingRecipes\/\{recipeId\}/);
  assert.match(rules,/match \/craftingRequests\/\{requestId\}/);
  assert.match(rules,/resource\.data\.status == 'published'/);
  assert.match(rules,/allow create, update, delete: if false/);
  assert.match(client,/subscribeCraftingRecipes: function/);
  assert.match(client,/subscribeCraftingRequests: function/);
  assert.match(ui,/Request Crafting/);
  assert.match(ui,/Approve & Craft/);
  assert.match(gm,/Legacy Projects, Notes & Enchantments/);
  assert.match(player,/PlayerCraftingRecipes/);
});
