import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reviewPreparedEncounterForStudio,preparedEncounterPublicMapScene}
  from '../src/state/preparedPresentationBridgeModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const enemy={name:'Bandit',hp:[10,10],kind:'enemy'};
const plan={id:'prepared-enc1',name:'Ambush',notes:'GM secret',mapId:'map1',
  enemies:[enemy],waves:[],events:[],archived:false,revision:2};
const combat={status:'ready',revision:6,combatants:[
  {id:'pc-one',characterId:'char1'}, {id:'enemy-one',name:'Old foe'}
],battleMapId:'',sessionEditable:true};
const snapshot={combat,maps:[{id:'map1',name:'Valley'}],pending:null};
test('Improvement 4: reuse existing load preview; no silent combat start',()=>{
  const value=reviewPreparedEncounterForStudio(plan,snapshot);
  assert.equal(value.eligible,true,value.issues.join('; '));
  assert.equal(value.incomingEnemies,1);
  assert.equal(value.stagedEnemies,1);
  assert.equal(value.linkedPlayers,1);
  assert.equal(value.combatRevision,6);
  assert.equal(value.templateRevision,2);
  assert.equal(Object.hasOwn(value,'notes'),false);
});
test('Improvement 4: active combat, missing maps, archived plans, inactive sessions block loading',()=>{
  assert.equal(reviewPreparedEncounterForStudio(plan,{...snapshot,
    combat:{...combat,status:'active'}}).eligible,false);
  assert.equal(reviewPreparedEncounterForStudio(plan,{...snapshot,maps:[]}).eligible,false);
  assert.equal(reviewPreparedEncounterForStudio({...plan,archived:true},snapshot).eligible,false);
  assert.equal(reviewPreparedEncounterForStudio(plan,{...snapshot,
    combat:{...combat,sessionEditable:false}}).eligible,false);
});
test('Improvement 4: only published non-fogged maps generate safe player scene',()=>{
  const safe=preparedEncounterPublicMapScene(plan,
    [{id:'map1',name:'Safe Map',visibility:'players',fogEnabled:false}]);
  assert.deepEqual(safe,{
    scene:'battle-map',title:'Safe Map',subtitle:'',mapId:'map1',characterIds:[],
    showRound:false,showPartyHP:false,theme:'obsidian'
  });
  assert.doesNotMatch(JSON.stringify(safe),/Bandit|GM secret|waves|enemies/);
  assert.throws(()=>preparedEncounterPublicMapScene(plan,
    [{id:'map1',name:'Secret',visibility:'gm'}]),/GM-only/);
  assert.throws(()=>preparedEncounterPublicMapScene(plan,
    [{id:'map1',name:'Fogged',visibility:'players',fogEnabled:true}]),/Fogged/);
  assert.throws(()=>preparedEncounterPublicMapScene({...plan,mapId:''},[]));
});
test('Improvement 4: UI explicitly reviews replacement and never bypasses combat API',()=>{
  const component=read('frontend/src/dashboard/GMPreparedPresentationPanel.jsx');
  const controller=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const page=read('frontend/src/pages/GMDashboardPage.jsx');
  assert.match(component,/combatApi\.loadPrepared\(campaignId,selected\.id/);
  assert.match(component,/reviewed\.combatRevision,reviewed\.preparedRevision/);
  assert.match(component,/data-testid="site-gm-encounter-confirm-load"/);
  assert.match(component,/onPresentScene\(publicMapScene\)/);
  assert.match(component,/No combat starts, no player map is published/);
  assert.doesNotMatch(component,/operation:'start'|operation:'map-link'/);
  assert.doesNotMatch(component,/setDoc\(|updateDoc\(|httpsCallable\(/);
  assert.match(controller,/<GMPreparedPresentationPanel/);
  assert.match(controller,/publishPlaylistScene=async scene=>/);
  assert.match(page,/combatApi=\{combatEnabled\?api\.combat:null\}/);
});
