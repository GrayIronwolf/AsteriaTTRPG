import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {playerCharacterProjection} from '../frontend/src/player/playerDashboardModel.mjs';

const owned='owner-123',id='character-123';
function character(overrides={}) {
  return {id,ownerUid:owned,name:'Character',hp:[24,30],sp:[17,20],mp:[9,15],
    conditions:[{id:'concussion-1',name:'Concussion',description:'Dazed',source:'Combat',
      duration:{unit:'days',value:1},allowPlayerRemoval:false,
      effects:[{id:'concussion-skill',target:'skills',operation:'SUBTRACT',value:3}]}],
    coins:{Gold:25,Silver:16},specialDamage:{soul:{value:5}},
    restState:{request:{status:'pending',soulRecovery:2,note:'Await GM'}},...overrides};
}
test('original conditions, currency, soul damage, and rest are projected without mutating source',()=>{
  const source=character();
  const result=playerCharacterProjection(source,{owned:true});
  assert.equal(result.conditionDetails[0].name,'Concussion');
  assert.equal(result.conditionDetails[0].allowPlayerRemoval,false);
  assert.equal(result.conditionDetails[0].effects[0].value,3);
  assert.equal(result.skillCheck.value,-3);
  assert.equal(result.soulDamage,5);
  assert.equal(result.soulHealingCap,25);
  assert.equal(result.restRequest.status,'pending');
  assert.equal(result.currencies.find(c=>c.id==='gold').amount,25);
  assert.equal(result.currencies.find(c=>c.id==='silver').amount,16);
  assert.equal(source.conditions[0].effects[0].value,3);
});
test('no unexpected GM or owner-only fields leak through shared player projections',()=>{
  const projected=playerCharacterProjection(character({
    journal:[{title:'Private',content:'SECRET ENTRY'}],
    gmNotes:'SECRET GM',campaignSecrets:{hidden:'SECRET'},
    currency:{Gold:4},conditions:[]}),{owned:false});
  assert.deepEqual(projected.journal,[]);
  assert.equal(projected.backstory,'');
  assert.equal('gmNotes' in projected,false);
  assert.equal('campaignSecrets' in projected,false);
  assert.equal(JSON.stringify(projected).includes('SECRET'),false);
  assert.equal(projected.conditionDetails.length,0);
});
test('unsafe currency data and malformed requests do not leak to the dashboard',()=>{
  const projected=playerCharacterProjection(character({
    coins:{Gold:-12,Custom:Infinity,Other:'not-a-number'},
    restState:{request:{status:'not-a-real-status',note:'private'}}}),{owned:true});
  assert.equal(projected.currencies.find(c=>c.id==='gold').amount,0);
  assert.equal(projected.currencies.some(c=>c.label==='Custom'),false);
  assert.equal(projected.restRequest,null);
});

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('original Player gameplay panels are implemented, not replaced by migration placeholders',()=>{
  const panels=read('frontend/src/player/PlayerOverviewPanels.jsx');
  const page=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const service=read('frontend/src/player/firebasePlayerDashboardService.mjs');
  const bootstrap=read('frontend/src/auth/firebaseAuthAdapter.mjs');
  for(const panel of ['Conditions','Effects','Damage','Rest','Currency']){
    assert.ok(panels.includes('function '+panel+'('),panel+' component must exist');
  }
  for(const action of ['removeCondition','takeRest','adjustCurrency']){
    assert.ok(panels.includes("'"+action+"'"),action+' is missing in interactive panel');
    assert.ok(service.includes('async function '+action+'('),action+' requires secured Firebase adapter');
    assert.ok(page.includes('api.'+action+'('),action+' is not connected to dashboard');
  }
  assert.match(bootstrap,/functions,functionsSdk:safeFunctionsSdk/);
  assert.ok(service.includes('resolveCampaign(cid,id)'));
  assert.ok(service.includes('gmSessionState(snapshot.data())'));
});
test('rest requests and currency are projected from original character systems',()=>{
  const ch=playerCharacterProjection(character(),{owned:true});
  assert.equal(ch.restSequence,0);
  assert.ok(Array.isArray(ch.currencies));
  assert.equal(ch.conditionDetails[0].allowPlayerRemoval,false);
  assert.ok(ch.activeEffects.length>=1);
});

test('GM sees pending rest requests and can approve or deny only through server commands',async()=>{
  const {gmPartySummary}=await import('../frontend/src/dashboard/gmDashboardModel.mjs');
  const party=gmPartySummary([{id:'character-1',ownerUid:'user-a',name:'Character',
    restState:{request:{id:'rest-11',status:'pending',soulRecovery:3}}}]);
  assert.equal(party[0].restRequest.id,'rest-11');
  assert.equal(party[0].restRequest.soulRecovery,3);
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  const panel=read('frontend/src/dashboard/GMOverviewPanels.jsx');
  const service=read('frontend/src/dashboard/firebaseGMDashboardService.mjs');
  assert.ok(panel.includes("onReviewRest?.("));
  assert.ok(gm.includes('api.reviewRest('));
  assert.ok(service.includes("action:'reviewCharacterRest'"));
  assert.ok(service.includes('verifyCampaign(cid)'));
});

test('GM condition controls preserve the original secured source of truth',async()=>{
  const {gmPartySummary}=await import('../frontend/src/dashboard/gmDashboardModel.mjs');
  const summary=gmPartySummary([{id:'character-17',name:'Knight',
    conditions:[{id:'condition-7',name:'Exhausted',active:true}],
    specialDamage:{soul:{value:4}}}]);
  assert.equal(summary[0].conditions[0].name,'Exhausted');
  assert.equal(summary[0].soulDamage,4);
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  const panel=read('frontend/src/dashboard/GMOverviewPanels.jsx');
  const service=read('frontend/src/dashboard/firebaseGMDashboardService.mjs');
  assert.ok(panel.includes('function GMConditions('));
  assert.ok(panel.includes('onCondition?.('));
  assert.ok(gm.includes('api.manageCondition('));
  assert.ok(service.includes("action:'manageCharacterCondition'"));
  assert.ok(service.includes('verifyCampaign(cid)'));
});

test('Original Inventory and Crafting tabs route directly into active secured economy workspaces',()=>{
  const economy=read('frontend/src/economy/EconomyWorkspace.jsx');
  const player=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  assert.ok(economy.includes("initialTab='Inventory'"));
  assert.ok(economy.includes("initialTab='Party Loot'"));
  assert.ok(player.includes("initialTab={tab==='Crafting'?'Crafting':'Inventory'}"));
  assert.ok(gm.includes("tab==='inventory'?'Inventory':tab==='crafting'?'Crafting':'Party Loot'"));
  assert.ok(player.includes("api.castSpell("));
  assert.ok(player.includes("api.useQuickItem("));
});
