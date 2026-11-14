import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {threatTierNumber,validateEncounterPlanAction,encounterCreatureCandidate,drawEncounterCreatures,planEncounterCombatants} from '../src/state/encounterRewardModel.mjs';
import {createEncounterRewardCommands} from '../functions/encounterRewardCommands.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const official=JSON.parse(read('data/compendium-parts/creature-9449fc9d98a097d8.json')).entries.map(row=>encounterCreatureCandidate(row,'official')).filter(Boolean);
const input={type:'generate',threatTier:1,count:2,tolerance:0,source:'official',biome:'',lootTableId:'',lootRolls:0,randomTableId:''};
function fakeContext(denied=false){
 const store=new Map(),reads=[],writes=[];
 const doc=(_db,...parts)=>({path:parts.join('/')});
 const tx={
  get:async ref=>{reads.push(ref.path);const data=store.get(ref.path);return {exists:()=>data!==undefined,data:()=>data};},
  set:(ref,value)=>{writes.push(['set',ref.path]);store.set(ref.path,value);},
  update:(ref,value)=>{writes.push(['update',ref.path]);store.set(ref.path,{...store.get(ref.path),...value});}
 };
 const context={db:{},doc,currentUser:{uid:'gm'},requestId:'test-op',serverTimestamp:()=>1001,runTransaction:async(_db,fn)=>fn(tx)};
 const commands=createEncounterRewardCommands(context,{requireCampaignGM:async()=>{if(denied)throw Error('GM only');}});
 return {store,reads,writes,run:action=>commands.manageEncounterReward('campaign-one','gm-scope',action)};
}
test('Official Asteria creatures retain source stats, real tiers and unconfigured XP',()=>{
 assert.ok(official.length>=20);
 assert.equal(threatTierNumber('TT 1'),1);
 assert.equal(threatTierNumber('Tier 12'),12);
 assert.equal(threatTierNumber('Threat Tier: 20'),20);
 assert.equal(threatTierNumber('TT 21'),null);
 const imp=official.find(row=>row.name==='Ash Imp');
 assert.equal(imp.sourceId,'ash-imp');
 assert.deepEqual(imp.hp,[24,24]);
 assert.equal(imp.xpReward,null);
 assert.equal(encounterCreatureCandidate({id:'npc',name:'Test',hp:30,threatTier:'TT 2'},'campaign'),null);
 assert.equal(encounterCreatureCandidate({id:'npc',name:'Test',hp:30,threatTier:'TT 2',xpReward:55},'campaign').xpReward,55);
});
test('Strict input rejects arbitrary stats, invalid ranges and unsupported commands',()=>{
 assert.deepEqual(validateEncounterPlanAction(input),input);
 for(const invalid of [
  {...input,threatTier:21},{...input,threatTier:0},{...input,count:9},
  {...input,lootTableId:'loot-one',lootRolls:0},{...input,lootRolls:11},
  {...input,creatures:[{hp:10000}]},{...input,approved:true},
  {...input,source:'external'}, {...input,biome:'x'.repeat(81)}
 ])assert.throws(()=>validateEncounterPlanAction(invalid));
 assert.throws(()=>validateEncounterPlanAction({type:'approve',planId:'id',expectedRevision:0}));
});
test('Selection uses secure bounded draws, source filters and no XP guesses',()=>{
 const result=drawEncounterCreatures(official,input,()=>0);
 assert.equal(result.creatures.length,2);
 assert.equal(result.totalXP,null);
 assert.equal(result.xpUnconfigured,2);
 assert.ok(result.creatures.every(row=>row.threatTier===1));
 assert.throws(()=>drawEncounterCreatures(official,{...input,threatTier:20},()=>0));
 assert.throws(()=>drawEncounterCreatures(official,input,()=>-1));
 assert.throws(()=>drawEncounterCreatures(official,input,()=>999));
});
test('Approved plans prepare existing combat without duplicate participants',()=>{
 const {creatures}=drawEncounterCreatures(official,input,()=>0);
 const plan={id:'encounter-plan-abc',status:'approved',creatures};
 assert.throws(()=>planEncounterCombatants({...plan,status:'draft'},{status:'ready'}));
 assert.throws(()=>planEncounterCombatants(plan,{status:'active'}));
 const first=planEncounterCombatants(plan,{status:'ready',combatants:[],enemies:[]});
 assert.equal(first.added.length,2);
 assert.equal(first.encounter.combatants[0].kind,'enemy');
 assert.equal(first.encounter.combatants[0].xpReward,undefined);
 assert.equal(first.encounter.combatants[0].initiativeSet,false);
 const again=planEncounterCombatants(plan,{...first.encounter,status:'ready'});
 assert.equal(again.added.length,0);
 assert.equal(again.encounter.combatants.length,2);
});
test('Generated proposals stay GM-private until separate approval and never automatically award XP',async()=>{
 const f=fakeContext();
 const result=await f.run(input);
 assert.equal(result.ok,true,result.error);
 assert.equal(result.status,'draft');
 const key='campaigns/campaign-one/encounterPlans/encounter-plan-test-op';
 const plan=f.store.get(key);
 assert.equal(plan.creatures.length,2);
 assert.equal(plan.totalXP,null);
 assert.equal(f.writes.some(row=>/partyLoot|characters|events|systems\/encounter/.test(row[1])),false);
 const approved=await f.run({type:'approve',planId:plan.id,expectedRevision:1});
 assert.equal(approved.ok,true,approved.error);
 assert.equal(approved.stagedLoot,0);
 assert.equal(f.store.get(key).status,'approved');
 assert.equal((await f.run({type:'approve',planId:plan.id,expectedRevision:1})).ok,false);
});
test('Saved active loot tables roll into hidden drafts only on explicit approval',async()=>{
 const f=fakeContext();
 f.store.set('campaigns/campaign-one/lootTables/loot-one',{id:'loot-one',name:'Forest',status:'active',revision:4,
  entries:[{id:'coin',kind:'currency',weight:1,minCopper:7,maxCopper:7}]});
 const result=await f.run({...input,lootTableId:'loot-one',lootRolls:2});
 assert.equal(result.ok,true,result.error);
 const plan=f.store.get('campaigns/campaign-one/encounterPlans/encounter-plan-test-op');
 assert.equal(plan.reward.rolls.length,2);
 assert.equal(f.writes.some(row=>row[1].includes('partyLoot')),false);
 const approved=await f.run({type:'approve',planId:plan.id,expectedRevision:1});
 assert.equal(approved.ok,true,approved.error);
 assert.equal(approved.stagedLoot,2);
 const drops=f.writes.filter(row=>row[1].includes('/partyLootDrafts/'));
 assert.equal(drops.length,2);
 assert.equal(f.writes.some(row=>row[1].includes('/partyLoot/')),false);
 for(const [,path] of drops){
  const drop=f.store.get(path);
  assert.equal(drop.visibility,'hidden');
  assert.equal(drop.generatedFrom.encounterPlanId,plan.id);
  assert.equal(drop.currencyCopper,7);
 }
});
test('Permission gate precedes source reads, revisions prevent stale approvals, archive is terminal',async()=>{
 const f=fakeContext(true);
 assert.match((await f.run(input)).error,/GM only/);
 assert.equal(f.reads.length,0);
 assert.equal(f.writes.length,0);
 const ok=fakeContext();
 const result=await ok.run(input);
 assert.equal(result.ok,true,result.error);
 assert.equal((await ok.run({type:'approve',planId:result.planId,expectedRevision:2})).ok,false);
 assert.equal((await ok.run({type:'archive',planId:result.planId,expectedRevision:1})).ok,true);
 assert.equal((await ok.run({type:'approve',planId:result.planId,expectedRevision:2})).ok,false);
});
test('Website, action router and security rules are connected without replacing combat or loot systems',()=>{
 const gm=read('src/dashboards/GMDashboard.jsx'),ui=read('src/dashboards/GMEncounterRewardWorkspace.jsx'),
  router=read('functions/handler.mjs'),commands=read('functions/commands.mjs'),rules=read('firestore.rules'),
  auth=read('js/firebase-auth.js'),toolkit=read('src/state/gmToolkitModel.mjs');
 assert.match(gm,/GMEncounterRewardWorkspace/);
 assert.match(gm,/tab === 'encounter-rewards'/);
 assert.match(ui,/manageEncounterReward/);
 assert.match(ui,/saveEncounter/);
 assert.match(ui,/subscribeEncounterPlans/);
 assert.match(router,/'manageEncounterReward'/);
 assert.match(commands,/createEncounterRewardCommands/);
 assert.match(rules,/match \/encounterPlans\/\{planId\}/);
 assert.match(auth,/subscribeEncounterPlans: function/);
 assert.match(toolkit,/id:'encounter-rewards'/);
});
