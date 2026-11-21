import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {
  hybridViewerCanRead,restrictedPresentationProjection
} from '../src/state/hybridPresentationSessionModel.mjs';
import {
  publicCombatSnapshot,publicPresentationBattleMap
} from '../src/state/livePresentationProjectionModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const bytes=path=>statSync(new URL('../'+path,import.meta.url)).size;

test('7.7: privileged enemy and map information cannot enter player projection',()=>{
  const safe=publicCombatSnapshot({
    status:'active',round:2,combatId:'accept77',turnIndex:0,
    combatants:[{id:'enemy77',kind:'enemy',name:'Secret Archmage',
      hp:[100,100],hiddenAttack:'DO_NOT_EXPOSE'}],
    combat:{version:1,revision:1,participants:{}},
    privateNotes:'DO_NOT_EXPOSE',enemies:[{secret:'DO_NOT_EXPOSE'}]
  });
  assert.doesNotMatch(JSON.stringify(safe),/Secret Archmage|DO_NOT_EXPOSE/);
  assert.equal(safe.combatants[0].name,'Creature');
  const map=publicPresentationBattleMap({
    id:'map77',campaignId:'phase77',name:'Shared map',visibility:'players',
    kind:'image',contentType:'image/png',
    storagePath:'campaigns/phase77/battleMaps/map77/scene.png',
    width:1280,height:720,gridColumns:2,gridRows:2,
    gridVisible:true,fogEnabled:true,fogCells:'1111',
    tokens:[],gmNotes:'DO_NOT_EXPOSE'
  },'phase77','map77');
  assert.equal(map.storagePath,undefined);
  assert.doesNotMatch(JSON.stringify(map),/DO_NOT_EXPOSE/);
});

test('7.7: viewer identity, epoch, status and expiry remain mandatory',()=>{
  const now=Date.now();
  const session={status:'open',epoch:'epoch77',expiresAt:new Date(now+60000)};
  const grant={uid:'invitee',epoch:'epoch77',status:'active',
    expiresAt:new Date(now+20000)};
  assert.equal(hybridViewerCanRead(session,grant,'invitee',now),true);
  assert.equal(hybridViewerCanRead(session,grant,'outsider',now),false);
  assert.equal(hybridViewerCanRead({...session,epoch:'new'},grant,'invitee',now),false);
  assert.equal(hybridViewerCanRead(session,{...grant,status:'revoked'},'invitee',now),false);
  assert.equal(hybridViewerCanRead(session,grant,'invitee',now+20001),false);
  assert.equal(restrictedPresentationProjection({scene:'party'}).scene,'blank');
});

test('7.7: GM capture is local only; viewer cannot obtain a screen MediaStream',()=>{
  const local=read('frontend/src/dashboard/GMScreenCaptureControls.jsx');
  const guest=read('frontend/src/dashboard/HybridSessionManager.jsx');
  const page=read('frontend/src/pages/PresentationPage.jsx');
  assert.match(local,/getDisplayMedia/);
  assert.match(local,/audio:false/);
  assert.match(local,/getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
  assert.doesNotMatch(local,/RTCPeerConnection|WebSocket|MediaRecorder|uploadBytes/);
  assert.doesNotMatch(guest,/getDisplayMedia|GMScreenCaptureControls/);
  assert.doesNotMatch(page,/getDisplayMedia|GMScreenCaptureControls/);
});

test('7.7: reconnect re-verifies grants and blackout removes staged subscriptions',()=>{
  const lifecycle=read('frontend/src/dashboard/usePresentationDisplayRuntime.js');
  const local=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const guest=read('frontend/src/dashboard/HybridSessionManager.jsx');
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  for(const event of ['online','offline','visibilitychange','pageshow'])
    assert.ok(lifecycle.includes(event));
  assert.match(local,/!runtime\.ready/);
  assert.match(guest,/!runtime\.ready/);
  assert.match(local,/display\.scene==='party'/);
  assert.match(local,/display\.scene==='combat'/);
  assert.match(service,/getDocFromServer\(hybridGrantRef\(id,uid\)\)/);
  assert.match(service,/snapshot\.metadata\?\.fromCache/);
  assert.match(service,/hybridViewerCanRead/);
});

test('7.7: no extra remote transport or unbounded local media implementation',()=>{
  // Source footprint budget guards accidentally bundled vendor/recording/video
  // systems. Not a substitute for real browser latency or memory measurements.
  assert.ok(bytes('frontend/src/dashboard/GMScreenCaptureControls.jsx')<16000);
  assert.ok(bytes('frontend/src/dashboard/usePresentationDisplayRuntime.js')<7000);
  assert.ok(bytes('frontend/src/dashboard/HybridSessionManager.jsx')<22000);
  assert.ok(bytes('frontend/src/dashboard/CampaignPresentationWorkspace.jsx')<24000);
  const manifest=read('docs/PHASE-7-6-SCREEN-SHARING-FEASIBILITY.md');
  assert.match(manifest,/GM-private|local/i);
  assert.match(manifest,/TURN/);
});

test('7.7: all original owner-approval and integration prerequisites documented',()=>{
  const release=read('docs/PHASE-7-7-SHARE-PRESENT-ACCEPTANCE.md');
  for(const term of ['Codex','Phase 6','GM','linked player','invited viewer',
    'outsider','390','1920','privacy','Firestore','Storage',
    'revocation','performance','owner approval','No merge','screenshots']){
    assert.ok(release.toLowerCase().includes(term.toLowerCase()),
      'Acceptance checklist missing '+term);
  }
  const browser=read('scripts/site-media-phase6-4-browser.cjs');
  assert.match(browser,/site-gm-presentation/);
  assert.match(browser,/name:'Blackout',exact:true/);
  assert.match(browser,/site-player-presentation/);
});
