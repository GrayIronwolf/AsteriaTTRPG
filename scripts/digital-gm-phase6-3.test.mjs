import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 activeMapEncounter,combatMapLinked,combatMapRoster,synchronizeCombatMapTokens,
 derivedCombatMapTokens,mergeCombatMapTokens,combatMapMovePlan,combatMapMovementAllowance
} from '../src/state/battleMapCombatModel.mjs';
const encounter={
 status:'active',combatId:'battle-123',round:2,turnIndex:0,
 combatants:[
  {id:'pc-a',name:'Ardent',kind:'player',characterId:'char-a',initiative:17},
  {id:'enemy-1',name:'Frost Wyrm',kind:'enemy',initiative:12}
 ],
 combat:{version:1,revision:14,participants:{
  'pc-a':{turnComplete:false,ap:1,movement:{kind:'walk',remaining:12,actionId:'movement-1'}},
  'enemy-1':{turnComplete:false,ap:3}
 }}
};
const map={
 id:'map-1',combatId:'battle-123',gridColumns:20,gridRows:20,
 metresPerCell:1,visibility:'players',tokens:[]
};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('combat activation uses authoritative encounter IDs, turn and initiative',()=>{
 assert.equal(activeMapEncounter(encounter),true);
 assert.equal(combatMapLinked(map,encounter),true);
 assert.deepEqual(combatMapRoster(encounter).map(row=>[row.id,row.isCurrent,row.initiative]),[
  ['pc-a',true,17],['enemy-1',false,12]
 ]);
 assert.equal(activeMapEncounter({...encounter,status:'ready'}),false);
 assert.equal(combatMapLinked({...map,combatId:'stale'},encounter),false);
});
test('GM linked player and enemy tokens inherit existing marker position and IDs',()=>{
 const original={...map,tokens:[
  {id:'token-player',kind:'character',refId:'char-a',label:'Ardent',x:35,y:45},
  {id:'camp-note',kind:'marker',label:'Tree',x:70,y:70}
 ]};
 let i=0;
 const tokens=synchronizeCombatMapTokens(original,encounter,()=>'new-'+(++i));
 assert.equal(tokens.length,3);
 assert.deepEqual(tokens.find(row=>row.combatantId==='pc-a'),{
  id:'token-player',kind:'character',refId:'char-a',label:'Ardent',combatantId:'pc-a',x:35,y:45
 });
 assert.equal(tokens.find(row=>row.combatantId==='enemy-1').kind,'creature');
 assert.equal(tokens.find(row=>row.id==='camp-note').combatantId,undefined);
 const after=synchronizeCombatMapTokens({...original,tokens},encounter,()=>'again-'+(++i));
 assert.deepEqual(after,tokens);
});
test('new encounter members spawn and departed members lose their map bindings',()=>{
 const initial=synchronizeCombatMapTokens(map,encounter,()=>'spawn-'+Math.random().toString(36).slice(2));
 const nextEncounter={...encounter,combatants:[encounter.combatants[0],{id:'enemy-2',name:'Ice Beast'}]};
 const final=synchronizeCombatMapTokens({...map,tokens:initial},nextEncounter,()=>'new-beast');
 assert.equal(final.some(row=>row.combatantId==='enemy-1'),false);
 assert.equal(final.some(row=>row.combatantId==='enemy-2'),true);
 assert.equal(final.some(row=>row.combatantId==='pc-a'),true);
});
test('approved movement is bounded to active combatant, snapped map square and available metres',()=>{
 const tokens=synchronizeCombatMapTokens(map,encounter,()=>'map-token-'+Math.random().toString(36).slice(2));
 const actual={...map,tokens};
 const hero=tokens.find(row=>row.combatantId==='pc-a');
 const target={x:hero.x+5,y:hero.y};
 const plan=combatMapMovePlan(actual,encounter,'pc-a',target);
 assert.equal(plan.distance.metres,1);
 assert.equal(plan.remaining,11);
 assert.deepEqual(plan.from,{x:hero.x,y:hero.y});
 assert.equal(combatMapMovementAllowance(encounter,'pc-a'),12);
 assert.throws(()=>combatMapMovePlan(actual,encounter,'enemy-1',target),/Only the current/);
 assert.throws(()=>combatMapMovePlan(actual,encounter,'pc-a',{x:100,y:100}),/exceeds the approved/);
 assert.throws(()=>combatMapMovePlan({...actual,combatId:'wrong'},encounter,'pc-a',target),/not linked/);
});
test('no free movement without approved combat action and GM-only correction requires audit reason',()=>{
 const tokens=synchronizeCombatMapTokens(map,encounter,()=>'one-'+Math.random().toString(36).slice(2));
 const actual={...map,tokens},hero=tokens.find(row=>row.combatantId==='pc-a');
 const target={x:hero.x+5,y:hero.y};
 const without={...encounter,combat:{...encounter.combat,participants:{'pc-a':{ap:3,movement:null}}}};
 assert.throws(()=>combatMapMovePlan(actual,without,'pc-a',target),/approve and resolve/);
 assert.throws(()=>combatMapMovePlan(actual,encounter,'enemy-1',{x:80,y:20},{mode:'reposition',reason:'x'}),/requires a reason/);
 const correction=combatMapMovePlan(actual,encounter,'enemy-1',{x:80,y:20},{
  mode:'reposition',reason:'Creature displaced by GM adjudication'
 });
 assert.equal(correction.remaining,null);
 assert.equal(correction.mode,'reposition');
});
test('combat token updates cannot overwrite manually authored unrelated markers',()=>{
 const stored=synchronizeCombatMapTokens(map,encounter,()=>'token-'+Math.random().toString(36).slice(2));
 const draft=[{id:'tree',label:'Oak tree',kind:'marker',x:45,y:35}];
 const merged=mergeCombatMapTokens(draft,stored);
 assert.equal(merged.length,3);
 assert.equal(merged.find(row=>row.id==='tree').kind,'marker');
 assert.equal(merged.filter(row=>row.combatantId).length,2);
});
test('map viewer, combat backend, and dashboard share the same authoritative encounter',()=>{
 const ui=read('src/dashboards/BattleMapWorkspace.jsx');
 const back=read('functions/combatCommands.mjs');
 const gm=read('src/dashboards/GMDashboard.jsx');
 const player=read('src/dashboards/CharacterDashboard.jsx');
 const rules=read('firestore.rules');
 assert.match(ui,/combatMapLinked/);
 assert.match(ui,/combatMapRoster/);
 assert.match(ui,/onCombatMove/);
 assert.match(ui,/Live Combat Integration/);
 assert.match(back,/input.operation==='map-link'/);
 assert.match(back,/input.operation==='map-move'/);
 assert.match(back,/combatMapMovePlan/);
 assert.match(back,/tx.update\(mapRef/);
 assert.match(gm,/GMBattleMapManager campaignId=\{campaignId\} characters=\{live.characters\} encounter=\{live.encounter\}/);
 assert.match(player,/PlayerBattleMapView campaignId=\{campaignId\} encounter=\{live.encounter\}/);
 assert.match(rules,/request.resource.data.tokens == resource.data.tokens/);
});
