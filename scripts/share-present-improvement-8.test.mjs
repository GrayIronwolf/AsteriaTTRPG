import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createPresentationRevisionGate,createSmallProjectionGate,
  sameCampaignStreamScope
} from '../src/state/presentationRealtimeSyncModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const scene=(revision,extra={})=>({
  version:1,revision,scene:'title',title:'Approved title',
  subtitle:'',theme:'obsidian',...extra
});

test('Improvement 8: current revision accepted once; duplicate snapshots dropped',()=>{
  const gate=createPresentationRevisionGate();
  assert.equal(gate.accept(scene(1)),true);
  assert.equal(gate.accept(scene(1)),false);
  assert.equal(gate.accept(scene(2)),true);
  assert.equal(gate.accept(scene(2)),false);
  gate.reset();
  assert.equal(gate.accept(scene(1)),true);
});
test('Improvement 8: stale revisions and same-revision content tampering fail closed',()=>{
  const gate=createPresentationRevisionGate();
  gate.accept(scene(11));
  assert.throws(()=>gate.accept(scene(10)),/Older presentation revision/);
  assert.throws(()=>gate.accept(scene(11,{title:'Unexpected secret'})),/without a new revision/);
  assert.throws(()=>gate.accept({revision:'11',scene:'title'}));
  assert.throws(()=>gate.accept({revision:1000001,scene:'title'}));
  assert.throws(()=>gate.accept({revision:2,scene:null}));
});
test('Improvement 8: restricted reveal projection restarts only on a new verified epoch',()=>{
  const gate=createPresentationRevisionGate({restricted:true});
  assert.throws(()=>gate.accept(scene(3)),/session is unverified/);
  assert.equal(gate.accept(scene(5,{epoch:'sessionA'})),true);
  assert.equal(gate.accept(scene(5,{epoch:'sessionA'})),false);
  assert.throws(()=>gate.accept(scene(4,{epoch:'sessionA'})),/Older presentation revision/);
  assert.equal(gate.accept(scene(1,{epoch:'sessionB'})),true);
  assert.equal(gate.accept(scene(1,{epoch:'sessionB'})),false);
  assert.throws(()=>gate.accept(scene(0,{epoch:'sessionB'})));
});
test('Improvement 8: small projections are deduplicated without persisting media',()=>{
  const gate=createSmallProjectionGate(2048);
  assert.equal(gate.accept({hp:12,revision:1}),true);
  assert.equal(gate.accept({hp:12,revision:1}),false);
  assert.equal(gate.accept({hp:11,revision:1}),true);
  assert.equal(gate.accept(null),true);
  assert.equal(gate.accept(null),false);
  const large=Array.from({length:33},(_,i)=>({i}));
  assert.equal(gate.accept(large),true);
  assert.equal(gate.accept(large),true);
  gate.reset();
  assert.equal(gate.accept({hp:11,revision:1}),true);
});
test('Improvement 8: changed authentication, campaign, feed and map scope reset immediately',()=>{
  const api={};
  const current={api,method:'watchPresentation',args:['campaign1','player'],enabled:true};
  assert.equal(sameCampaignStreamScope(current,api,'watchPresentation',
    ['campaign1','player'],true),true);
  assert.equal(sameCampaignStreamScope(current,{},'watchPresentation',
    ['campaign1','player'],true),false);
  assert.equal(sameCampaignStreamScope(current,api,'watchPresentation',
    ['campaign2','player'],true),false);
  assert.equal(sameCampaignStreamScope(current,api,'watchRestrictedViewer',
    ['campaign1','player'],true),false);
  assert.equal(sameCampaignStreamScope(current,api,'watchPresentation',
    ['campaign1','player'],false),false);
});
test('Improvement 8: stage hook never paints previous campaign while scope changes',()=>{
  const hook=read('frontend/src/dashboard/CampaignMapWorkspace.jsx');
  assert.match(hook,/createPresentationRevisionGate/);
  assert.match(hook,/sameCampaignStreamScope\(state.scope,api,method,args,enabled\)/);
  assert.match(hook,/return \{data:null,error:'',loading:enabled\}/);
  assert.match(hook,/if\(!alive\)return;/);
  assert.match(hook,/createSmallProjectionGate\(\)/);
  assert.match(hook,/revisionGate\?\.reset\(\)/);
  assert.match(hook,/setState\(\{scope,data:null,error:error\?\.message/);
});
test('Improvement 8: reconnect and permission revocation remain fail closed',()=>{
  const svc=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const runtime=read('frontend/src/dashboard/usePresentationDisplayRuntime.js');
  const player=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const viewer=read('frontend/src/dashboard/HybridSessionManager.jsx');
  assert.match(svc,/snapshot\.metadata\?\.fromCache/);
  assert.match(svc,/GM presentation control disconnected/);
  assert.match(svc,/getDocFromServer\(hybridGrantRef\(id,uid\)\)/);
  assert.match(svc,/hybridViewerCanRead/);
  assert.match(runtime,/setGeneration\(value=>value\+1\)/);
  assert.match(player,/!runtime\.ready\?<p role="alert">/);
  assert.match(viewer,/!runtime\.ready\?<p role="alert">/);
  assert.match(player,/ActivePlayerPresentation key=/);
  assert.match(viewer,/ActiveRestrictedPresentation key=/);
});
