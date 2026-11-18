import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';
import { canActivateRoute } from '../frontend/src/app/featureRegistry.mjs';
import { assertGMCampaignId, gmCampaignAccess, gmCampaignSummary, gmPartySummary, gmSessionState, gmSessionCommands } from '../frontend/src/dashboard/gmDashboardModel.mjs';
import { createFirebaseGMDashboardService } from '../frontend/src/dashboard/firebaseGMDashboardService.mjs';

const id='campaign-alpha', owner='owner-1', gm='gm-2', player='player-3';
const v1={id,ownerUid:owner,membershipSchemaVersion:1,roles:{[gm]:'gm',[player]:'player'},gmUids:[gm],name:'Asteria Campaign'};
const v2={...v1,membershipSchemaVersion:2};
const coGM={uid:gm,campaignId:id,role:'co-gm',status:'active'};

test('GM route requires explicitly registered auth, campaign and gameplay services',()=>{
  const unavailable={has:()=>false,get:()=>null};
  const ready={has:key=>['auth','campaigns','gameplay'].includes(key),get:()=>null};
  assert.equal(canActivateRoute('dashboard',unavailable),false);
  assert.equal(canActivateRoute('gm-dashboard',unavailable),false);
  assert.equal(canActivateRoute('gm-dashboard',{has:key=>key!=='gameplay'}),false);
  assert.equal(canActivateRoute('dashboard',ready),true);
  assert.equal(parseSiteRoute({hash:'#/dashboard'}).id,'dashboard');
  assert.equal(parseSiteRoute({hash:'#/react/gm/'+id}).params.campaignId,id);
});
test('legacy v1 owner and appointed GM can access; members cannot',()=>{
  assert.deepEqual(gmCampaignAccess(v1,null,owner,id),{allowed:true,role:'owner'});
  assert.deepEqual(gmCampaignAccess(v1,null,gm,id),{allowed:true,role:'gm'});
  assert.equal(gmCampaignAccess(v1,null,player,id).allowed,false);
  assert.equal(gmCampaignAccess(v1,null,'stranger',id).allowed,false);
});
test('v2 requires an active canonical co-GM, never browser-supplied roles',()=>{
  assert.deepEqual(gmCampaignAccess(v2,coGM,gm,id),{allowed:true,role:'co-gm'});
  assert.equal(gmCampaignAccess(v2,null,owner,id).allowed,true);
  for(const changed of [
    {...coGM,status:'pending'}, {...coGM,status:'inactive'},
    {...coGM,role:'player'}, {...coGM,campaignId:'another'},
    {...coGM,uid:'forged'}
  ]) assert.equal(gmCampaignAccess(v2,changed,gm,id).allowed,false);
  assert.equal(gmCampaignAccess(v2,null,gm,id).allowed,false);
  assert.equal(gmCampaignAccess(v2,{...coGM,uid:player,role:'player'},player,id).allowed,false);
  assert.equal(gmCampaignAccess({...v2,id:'another'},coGM,gm,id).allowed,false);
  assert.equal(gmCampaignAccess({...v2,membershipSchemaVersion:3},null,owner,id).allowed,false);
  assert.throws(()=>gmCampaignSummary(v2,{allowed:false}),/permission/);
});
test('campaign identifiers and party summary are safe, constrained projections',()=>{
  for(const bad of ['', '../../users','campaign/a','?query']) assert.throws(()=>assertGMCampaignId(bad));
  const party=gmPartySummary([
    {id:'hero',name:'Seraph',level:4,className:'Paladin',hp:[12,20],sp:[9,9],mp:[0,7],privateBackstory:'secret',ownerUid:'hidden'},
    {id:'a/b',name:'Forged'},
    {id:'rogue',name:'Scout',level:'Infinity',hp:'tampered'}
  ]);
  assert.equal(party.length,2);
  assert.deepEqual(party[0].hp,[12,20]);
  assert.equal(party[1].level,0);
  assert.equal(party[1].hp,null);
  assert.equal('ownerUid' in party[0],false);
  assert.equal('privateBackstory' in party[0],false);
  assert.equal(gmPartySummary(Array.from({length:200},(_,i)=>({id:'hero'+i}))).length,128);
});
test('existing 10-hour session lifecycle has expected commands',()=>{
  const now=Date.now();
  assert.deepEqual(gmSessionCommands(gmSessionState(null)),['start']);
  assert.deepEqual(gmSessionCommands(gmSessionState({status:'active',id:'one',expiresAt:{toMillis:()=>now+60000}},now)),['pause','end']);
  assert.deepEqual(gmSessionCommands(gmSessionState({status:'paused',id:'one',expiresAt:{toMillis:()=>now+60000}},now)),['start','end']);
  assert.deepEqual(gmSessionCommands(gmSessionState({status:'active',id:'one',expiresAt:{toMillis:()=>now-1000}},now)),['end']);
  assert.deepEqual(gmSessionCommands(gmSessionState({status:'ended',id:'one'})),['start']);
});
test('disabled and non-GM service never attaches listeners or writes',async()=>{
  let observed=0,wrote=0;
  const sdk={
    doc:(_db,...parts)=>parts.join('/'),
    getDocFromServer:async ref=>({exists:()=>ref==='campaigns/'+id,data:()=>({...v2,roles:{[player]:'gm'}}),id:ref.split('/').pop()}),
    onSnapshot:()=>{observed++;return()=>{};},
    runTransaction:()=>{wrote++;throw Error('should not run');}
  };
  const auth={currentUser:{uid:player}};
  const service=enabled=>createFirebaseGMDashboardService({auth,db:{},firestoreSdk:sdk,readCanonical:async user=>({uid:user.uid}),enabled});
  await assert.rejects(()=>service(false).sessionCommand(id,'start'),/disabled/);
  await assert.rejects(()=>service(true).sessionCommand(id,'start'),/GM access/);
  await new Promise((resolve,reject)=>{
    service(true).watch(id,()=>reject(new Error('Unauthorized data delivered')),err=>{
      try{assert.match(err.message,/GM access/);resolve();}catch(e){reject(e);}
    });
  });
  assert.equal(observed,0);
  assert.equal(wrote,0);
});
test('isolated GM route does not re-import global or old React dashboard',()=>{
  for(const file of ['frontend/src/pages/GMDashboardPage.jsx','frontend/src/dashboard/firebaseGMDashboardService.mjs','frontend/src/app/App.jsx']){
    const content=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.doesNotMatch(content,/window\.AsteriaFirebase|window\.setView|legacyBridge|GMDashboard\.jsx/);
  }
  const adapter=readFileSync(new URL('../frontend/src/auth/firebaseAuthAdapter.mjs',import.meta.url),'utf8');
  assert.match(adapter,/VITE_ASTERIA_GM_DASHBOARD_ENABLED==='true'/);
  const outlet=readFileSync(new URL('../frontend/src/app/App.jsx',import.meta.url),'utf8');
  assert.match(outlet,/<GMDashboardPage route=\{route\}/);
});
