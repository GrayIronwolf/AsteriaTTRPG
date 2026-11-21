import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hybridViewerCanRead} from '../src/state/hybridPresentationSessionModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('7.6: capture starts only with explicit browser permission and no audio',()=>{
  const capture=read('frontend/src/dashboard/GMScreenCaptureControls.jsx');
  assert.match(capture,/onClick=\{start\}/);
  assert.match(capture,/navigator\.mediaDevices\.getDisplayMedia/);
  assert.match(capture,/video:true,audio:false/);
  assert.match(capture,/getVideoTracks\(\)/);
  assert.match(capture,/NotAllowedError/);
  assert.doesNotMatch(capture,/getUserMedia\(|MediaRecorder\(|uploadBytes\(|getDownloadURL\(|RTCPeerConnection\(/);
});
test('7.6: GM alone sees local preview and it is not a remote scene',()=>{
  const capture=read('frontend/src/dashboard/GMScreenCaptureControls.jsx');
  const controller=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const restricted=read('frontend/src/dashboard/HybridSessionManager.jsx');
  const page=read('frontend/src/pages/PresentationPage.jsx');
  assert.match(controller,/CampaignPresentationController/);
  assert.match(controller,/<GMScreenCaptureControls/);
  assert.match(capture,/srcObject=stream\.current/);
  assert.match(capture,/stream\.current=null/);
  assert.match(capture,/getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
  assert.doesNotMatch(restricted,/getDisplayMedia|GMScreenCaptureControls/);
  assert.doesNotMatch(page,/getDisplayMedia|GMScreenCaptureControls/);
  assert.doesNotMatch(capture,/fetch\(|WebSocket|BroadcastChannel|postMessage\(/);
});
test('7.6: capture is stopped on browser end, page hide, background or offline',()=>{
  const capture=read('frontend/src/dashboard/GMScreenCaptureControls.jsx');
  for(const token of ["'ended'","'visibilitychange'","'offline'","'pagehide'","mounted.current=false","generation.current+=1"]){
    assert.ok(capture.includes(token),'missing cleanup: '+token);
  }
  assert.match(capture,/return \(\)=>\{mounted\.current=false;stop\(\);\}/);
});
test('7.6: emergency command uses existing GM blackout and session close, never client writes',()=>{
  const capture=read('frontend/src/dashboard/GMScreenCaptureControls.jsx');
  assert.match(capture,/api\.managePresentation\(campaignId/);
  assert.match(capture,/type:'blackout',expectedRevision:controlRevision/);
  assert.match(capture,/api\.manageHybridSession\(campaignId/);
  assert.match(capture,/type:'close',expectedRevision:current\.revision\|\|0/);
  assert.doesNotMatch(capture,/setDoc\(|updateDoc\(|deleteDoc\(/);
  assert.match(capture,/Some remote controls were not confirmed/);
});
test('7.6: restricted viewers remain bounded by grant, epoch, identity, expiry',()=>{
  const now=Date.now();
  const session={status:'open',epoch:'capture-76',expiresAt:new Date(now+60000)};
  const grant={uid:'invitee',status:'active',epoch:'capture-76',expiresAt:new Date(now+30000)};
  assert.equal(hybridViewerCanRead(session,grant,'invitee',now),true);
  assert.equal(hybridViewerCanRead(session,grant,'stranger',now),false);
  assert.equal(hybridViewerCanRead({...session,status:'closed'},grant,'invitee',now),false);
  assert.equal(hybridViewerCanRead({...session,epoch:'rotated'},grant,'invitee',now),false);
});
