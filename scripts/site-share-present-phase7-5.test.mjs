import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  hybridViewerCanRead,restrictedPresentationProjection,sessionTimestampMs
} from '../src/state/hybridPresentationSessionModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const now=Date.now(),uid='viewer-75';
const session={status:'open',epoch:'phase75',expiresAt:new Date(now+600000)};
const grant={uid,status:'active',epoch:'phase75',expiresAt:new Date(now+300000)};
test('7.5: restricted display grants fail closed after expiry, revocation and session rotation',()=>{
  assert.equal(hybridViewerCanRead(session,grant,uid,now),true);
  assert.equal(hybridViewerCanRead(session,grant,uid,now+300001),false);
  assert.equal(hybridViewerCanRead({...session,status:'closed'},grant,uid,now),false);
  assert.equal(hybridViewerCanRead(session,{...grant,status:'revoked'},uid,now),false);
  assert.equal(hybridViewerCanRead({...session,epoch:'rotated'},grant,uid,now),false);
  assert.equal(hybridViewerCanRead(session,{...grant,epoch:'old'},uid,now),false);
  assert.equal(hybridViewerCanRead(session,grant,'another-viewer',now),false);
  assert.ok(sessionTimestampMs(grant.expiresAt)>now);
});
test('7.5: refreshed display receives allowlisted scenes only',()=>{
  const projection=restrictedPresentationProjection({
    scene:'battle-map',mapId:'public-map',title:'secret',
    gmNotes:'Never show',storagePath:'campaigns/private',
    tokens:[{label:'Secret'}]
  },12);
  assert.deepEqual(projection,{version:1,revision:12,scene:'battle-map',
    title:'',subtitle:'',theme:'obsidian',mapId:'public-map'});
  assert.doesNotMatch(JSON.stringify(projection),/Never show|Secret|private/);
  assert.equal(restrictedPresentationProjection({scene:'party'},12).scene,'blank');
});
test('7.5: both display types hide mounted content while offline or backgrounded',()=>{
  const runtime=read('frontend/src/dashboard/usePresentationDisplayRuntime.js');
  const player=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const restricted=read('frontend/src/dashboard/HybridSessionManager.jsx');
  for(const term of ['offline','online','visibilitychange','pageshow',
    'requestFullscreen','exitFullscreen','fullscreenchange']){
    assert.ok(runtime.includes(term),'runtime missing '+term);
  }
  assert.match(runtime,/setGeneration\(value=>value\+1\)/);
  assert.match(player,/!runtime\.ready\?<p role="alert">/);
  assert.match(restricted,/!runtime\.ready\?<p role="alert">/);
  assert.match(player,/ActivePlayerPresentation key=/);
  assert.match(restricted,/ActiveRestrictedPresentation key=/);
  assert.match(player,/display\.scene==='party'/);
  assert.match(player,/display\.scene==='combat'/);
  assert.doesNotMatch(restricted,/getDownloadURL\(|watchParty\(|watchEncounter\(/);
});
test('7.5: session verification and storage-byte access remain server-authorised',()=>{
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const page=read('frontend/src/pages/PresentationPage.jsx');
  const rules=read('firestore.rules');
  const storage=read('storage.rules');
  assert.match(service,/getDocFromServer\(hybridGrantRef\(id,uid\)\)/);
  assert.match(service,/hybridViewerCanRead/);
  assert.match(service,/same\(uid\)/);
  assert.match(service,/snapshot\.metadata\?\.fromCache/);
  assert.match(page,/RestrictedPresentationDisplay key=/);
  assert.match(rules,/activeHybridViewer\(campaignId\)/);
  assert.match(storage,/activeRestrictedBattleMap/);
});
