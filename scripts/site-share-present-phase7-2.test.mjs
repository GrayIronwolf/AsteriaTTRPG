import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  HYBRID_SESSION_MAX_VIEWERS,validateHybridSessionAction,
  restrictedPresentationProjection,hybridViewerCanRead,sessionTimestampMs
} from '../src/state/hybridPresentationSessionModel.mjs';
import {createHybridPresentationSessionCommands}
  from '../functions/hybridPresentationSessionCommands.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const campaign='campaign-72',actor='gm-72';
const path='campaigns/'+campaign+'/';
function harness({gm=true}={}){
  const store=new Map(),writes=[];
  const doc=(_db,...segments)=>segments.join('/');
  const tx={
    get:async ref=>({exists:()=>store.has(ref),data:()=>store.get(ref)}),
    set:(ref,payload)=>{store.set(ref,payload);writes.push({ref,payload,kind:'set'});},
    update:(ref,patch)=>{
      store.set(ref,{...store.get(ref),...patch});
      writes.push({ref,patch,kind:'update'});
    }
  };
  const context={
    db:{},doc,requestId:'session-test-72',currentUser:{uid:actor},
    serverTimestamp:()=>new Date(),
    runTransaction:async(_db,callback)=>callback(tx)
  };
  const commands=createHybridPresentationSessionCommands(context,{
    requireCampaignGM:async()=>{if(!gm)throw Error('Only the campaign GM may change viewer grants.');}
  });
  return {store,writes,
    run:action=>commands.manageHybridPresentationSession(campaign,'gm-scope',action)};
}
test('7.2: strict GM session and viewer grant validation',()=>{
  assert.equal(validateHybridSessionAction({
    type:'open',mode:'hybrid',expectedRevision:0,durationMinutes:120
  }).mode,'hybrid');
  assert.equal(HYBRID_SESSION_MAX_VIEWERS,24);
  for(const action of [
    {type:'open',mode:'public',expectedRevision:0,durationMinutes:15},
    {type:'open',mode:'hybrid',expectedRevision:0,durationMinutes:11},
    {type:'open',mode:'hybrid',expectedRevision:0,durationMinutes:2000},
    {type:'grant',uid:'../player',expectedRevision:1,durationMinutes:30},
    {type:'grant',uid:'target',expectedRevision:-1,durationMinutes:30},
    {type:'revoke',uid:'target',expectedRevision:1,secret:true}
  ])assert.throws(()=>validateHybridSessionAction(action),/Invalid|Unsupported|Choose|duration/);
});
test('7.2: safe viewer projection never carries map or party/combat/private fields',()=>{
  const full={scene:'battle-map',title:'Hidden',mapId:'secret-map',
    characterIds:['player-1'],hp:[99,100],gmNotes:'SECRET',
    storagePath:'campaigns/hidden',combatants:[{name:'Wolf'}],theme:'slate'};
  const a=restrictedPresentationProjection(full,5);
  assert.deepEqual(a,{version:1,revision:5,scene:'blank',
    title:'',subtitle:'',theme:'slate'});
  const b=restrictedPresentationProjection({
    scene:'announcement',title:'The gates open',subtitle:'Beware',
    ownerUid:'private',theme:'parchment'
  },6);
  assert.deepEqual(b,{version:1,revision:6,scene:'title',
    title:'The gates open',subtitle:'Beware',theme:'parchment'});
  assert.equal('ownerUid' in b,false);
});
test('7.2: GM opens, grants, revokes and closes with distinct server transaction receipts',async()=>{
  const h=harness();const now=Date.now();
  const open=await h.run({type:'open',expectedRevision:0,
    mode:'hybrid',durationMinutes:120});
  assert.equal(open.ok,true,open.error);
  assert.equal(open.revision,1);
  assert.ok(h.store.get(path+'hybridSessionControl/current').epoch.startsWith('hybrid-'));
  assert.equal(h.store.get(path+'presentationRestricted/current').scene,'blank');
  const grant=await h.run({type:'grant',expectedRevision:1,uid:'player-72',durationMinutes:20});
  assert.equal(grant.ok,true,grant.error);
  assert.equal(grant.revision,2);
  assert.ok(grant.expiresAt>now);
  assert.ok(grant.expiresAt<=now+21*60*1000);
  const stored=h.store.get(path+'hybridViewerGrants/player-72');
  const session=h.store.get(path+'hybridSessionControl/current');
  assert.equal(hybridViewerCanRead(session,stored,'player-72',now),true);
  assert.equal(hybridViewerCanRead(session,stored,'other-72',now),false);
  assert.equal(hybridViewerCanRead(session,stored,'player-72',
    sessionTimestampMs(stored.expiresAt)+1),false);
  assert.match((await h.run({type:'grant',expectedRevision:1,
    uid:'another-72',durationMinutes:30})).error,/changed/);
  assert.match((await h.run({type:'open',expectedRevision:2,
    mode:'hybrid',durationMinutes:30})).error,/Close/);
  const revoke=await h.run({type:'revoke',expectedRevision:2,uid:'player-72'});
  assert.equal(revoke.ok,true,revoke.error);
  assert.equal(hybridViewerCanRead(h.store.get(path+'hybridSessionControl/current'),
    h.store.get(path+'hybridViewerGrants/player-72'),'player-72',Date.now()),false);
  const close=await h.run({type:'close',expectedRevision:3});
  assert.equal(close.ok,true,close.error);
  assert.equal(h.store.get(path+'hybridSessionControl/current').status,'closed');
  const reopened=await h.run({type:'open',expectedRevision:4,
    mode:'remote',durationMinutes:15});
  assert.equal(reopened.ok,true,reopened.error);
  assert.equal(h.store.get(path+'hybridSessionControl/current').grantCount,0);
  assert.notEqual(h.store.get(path+'hybridSessionControl/current').epoch,session.epoch);
});
test('7.2: non-GMs cannot grant access or open sessions',async()=>{
  const h=harness({gm:false});
  assert.match((await h.run({type:'open',expectedRevision:0,
    mode:'hybrid',durationMinutes:120})).error,/GM/);
  assert.equal(h.store.size,0);
  assert.equal(h.writes.length,0);
});
test('7.2: at most 24 invited recipients per session',async()=>{
  const h=harness();const open=await h.run({type:'open',
    expectedRevision:0,mode:'hybrid',durationMinutes:120});
  assert.equal(open.ok,true);
  for(let index=1;index<=24;index++){
    const response=await h.run({type:'grant',expectedRevision:index,
      uid:'viewer-'+index,durationMinutes:30});
    assert.equal(response.ok,true,'grant '+index+': '+response.error);
  }
  const denied=await h.run({type:'grant',expectedRevision:25,
    uid:'viewer-25',durationMinutes:30});
  assert.match(denied.error,/limit/);
  assert.equal(h.store.get(path+'hybridSessionControl/current').grantCount,24);
});
test('7.2: restricted viewer route never subscribes to campaign maps, players or combat',()=>{
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const page=read('frontend/src/pages/PresentationPage.jsx');
  const panel=read('frontend/src/dashboard/HybridSessionManager.jsx');
  const commands=read('functions/commands.mjs');
  const handler=read('functions/handler.mjs');
  const server=read('functions/playerPresentationCommands.mjs');
  const rules=read('firestore.rules');
  assert.match(service,/function watchRestrictedViewer/);
  assert.match(service,/hybridViewerCanRead/);
  assert.match(service,/getDocFromServer\(hybridGrantRef\(id,uid\)\)/);
  assert.match(page,/viewer.*restricted/);
  assert.match(panel,/RestrictedPresentationDisplay/);
  assert.match(panel,/Close &amp; Revoke Session/);
  assert.match(commands,/createHybridPresentationSessionCommands/);
  assert.match(handler,/manageHybridPresentationSession/);
  assert.match(server,/restrictedPresentationProjection/);
  assert.match(rules,/match \/presentationRestricted\/\{documentId\}/);
  assert.match(rules,/match \/hybridViewerGrants\/\{viewerUid\}/);
  assert.match(rules,/match \/hybridSessionControl\/\{documentId\}/);
  assert.doesNotMatch(panel,/fetchMapMedia\(|watchParty\(|watchEncounter\(/);
  assert.doesNotMatch(panel,/getDownloadURL\(|setDoc\(|updateDoc\(/);
});
