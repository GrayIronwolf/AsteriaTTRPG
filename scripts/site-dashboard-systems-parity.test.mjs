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

test('restored Player spellbook exposes guarded campaign casting and original details',()=>{
  const projected=playerCharacterProjection(character({spells:[
    {name:'Ice Lance',element:'Water',rank:'Minor',manaCost:55,summary:'Frost damage'},
    'Feather Fall'
  ]}),{owned:true});
  assert.equal(projected.spellDetails[0].name,'Ice Lance');
  assert.equal(projected.spellDetails[0].mpCost,55);
  assert.equal(projected.spellDetails[1].mpCost,null);
  const page=read('frontend/src/pages/PlayerDashboardPage.jsx');
  assert.match(page,/function Spellbook\(/);
  assert.match(page,/onAction\?\.\('castSpell',spell\.name\)/);
  assert.match(page,/disabled=\{!editable\|\|busy\}/);
  assert.match(page,/setResourceMessage\(/);
  const service=read('frontend/src/player/firebasePlayerDashboardService.mjs');
  assert.match(service,/async function castSpell\(/);
  assert.match(service,/relationship\.owned/);
});
test('four quick slots are resolved only from approved inventory items and can be assigned and used',async()=>{
  const {inventoryProjection}=await import('../frontend/src/economy/economyModel.mjs');
  const data=inventoryProjection({id:'hero-1',name:'Hero',inventory:[
    {id:'potion-1',name:'Healing Tonic',qty:2,effect:{resource:'hp',amount:5}},
    {id:'sealed-1',name:'Sealed Potion',identified:false,qty:1}
  ],quickSlots:[{id:'potion-1'},'missing-item',{id:'sealed-1'}]},false);
  assert.equal(data.quickSlots.length,4);
  assert.equal(data.quickSlots[0].name,'Healing Tonic');
  assert.equal(data.quickSlots[0].hasEffect,true);
  assert.equal(data.quickSlots[1],null);
  assert.equal(data.quickSlots[2].name,'Unidentified Item');
  assert.equal(data.quickSlots[2].hasEffect,false);
  assert.equal(data.quickSlots[3],null);
  const workspace=read('frontend/src/economy/EconomyWorkspace.jsx');
  assert.match(workspace,/site-player-quick-slots/);
  assert.match(workspace,/itemId:item\.id,index/);
  assert.match(workspace,/type:'use',itemId:assigned\.id/);
  assert.match(workspace,/if\(type==='quick'\)op\.index=Number\(quickSlot\)/);
});

test('original quick-item panel resolves item references from owned inventory without leaking unidentified names',()=>{
  const result=playerCharacterProjection(character({
    inventory:[{instanceId:'potion-1',name:'Restorative Vial',qty:2},
      {id:'hidden-1',name:'Forbidden Potion',identified:false}],
    quickSlots:['potion-1',{itemId:'hidden-1'}]
  }),{owned:true});
  assert.equal(result.quickSlots.length,4);
  assert.equal(result.quickSlots[0].id,'potion-1');
  assert.equal(result.quickSlots[0].name,'Restorative Vial');
  assert.equal(result.quickSlots[1].id,'hidden-1');
  assert.equal(result.quickSlots[1].name,'Unidentified Item');
  assert.equal(result.quickSlots[2],null);
  assert.equal(JSON.stringify(result.quickSlots).includes('Forbidden Potion'),false);
});

test('Phase 1.2: rank training preserves server-side progression and projects effective modifiers',async()=>{
  const {skillProjection}=await import('../frontend/src/progression/progressionModel.mjs');
  const character={skills:[{id:'acrobatics',name:'Acrobatics',rank:'Apprentice',
      category:'Agility',summary:'Agile movements',techniques:[{name:'Balance',description:'Stay upright'}]}],
    skillProgress:{acrobatics:{rank:'Apprentice',successes:2,target:5}}};
  const rows=skillProjection(character);
  assert.equal(rows.length,1);
  assert.equal(rows[0].name,'Acrobatics');
  assert.equal(rows[0].successes,2);
  assert.equal(rows[0].target,5);
  assert.equal(rows[0].techniques[0].name,'Balance');
  assert.equal(rows[0].techniques[0].detail,'Stay upright');
  assert.ok(Number.isFinite(rows[0].modifier));
  assert.equal(character.skillProgress.acrobatics.successes,2);
  const ui=read('frontend/src/progression/ProgressionWorkspace.jsx');
  assert.match(ui,/site-player-skills/);
  assert.match(ui,/site-player-skill-details/);
  assert.match(ui,/Record Skill Success/);
  assert.match(ui,/loadPublicEntry\('skill'/);
});
test('Phase 1.2: active talent effects can be ended through the owner-scoped callable',async()=>{
  const {activeTalentEffectProjection}=await import('../frontend/src/progression/progressionModel.mjs');
  const rows=activeTalentEffectProjection({talentEffects:[
    {id:'cleric:sacred-aegis',name:'Sacred Aegis',ac:2,description:'Shielded'},
    {id:'cleric:expired',name:'Expired',ended:true},
    {id:'danger',name:'Expired by time',expiresAt:1}
  ]});
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,'cleric:sacred-aegis');
  const ui=read('frontend/src/progression/ProgressionWorkspace.jsx');
  assert.match(ui,/api\.endTalentEffect\(campaignId,characterId,effect\.id\)/);
  assert.match(ui,/triggerConfirmed:trigger\[row\.id\]===true/);
  assert.match(ui,/Talent target/);
  assert.match(ui,/Known spell<select/);
  const service=read('frontend/src/progression/firebaseProgressionService.mjs');
  assert.match(service,/endCharacterTalentEffect/);
  assert.match(service,/authorize\(cid,'player',characterId\)/);
});

test('Phase 1.2: Character tab uses original authorised conditions, rest, damage and currency panels',()=>{
  const page=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const panels=read('frontend/src/player/PlayerOverviewPanels.jsx');
  assert.match(page,/site-player-character-systems/);
  for(const id of ["'conditions'","'effects'","'specialDamage'","'rest'","'currency'"])
    assert.ok(page.includes(id),'Missing character systems control '+id);
  assert.match(page,/onAction=\{onAction\}/);
  assert.match(panels,/Number\.isSafeInteger\(recoveryNumber\)/);
  assert.match(panels,/disabled=\{!editable\|\|busy\|\|pending\|\|!validRecovery\}/);
  assert.match(page,/api\.takeRest\(campaignId,characterId/);
  assert.match(page,/api\.removeCondition\(campaignId,characterId/);
});
