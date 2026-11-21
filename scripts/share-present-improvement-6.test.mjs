import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DISPLAY_MODE_IDS,DISPLAY_MODE_PRESETS,DISPLAY_SCALE_MIN,DISPLAY_SCALE_MAX,
  defaultDisplayPreferences,validateDisplayPreferences,applyDisplayPreference,
  displayPreferencesKey,approvedSceneLabel
} from '../src/state/presentationDisplayModeModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Improvement 6: four fixed player-facing mode presets and bounded scaling',()=>{
  assert.deepEqual(DISPLAY_MODE_IDS,['tabletop-tv','projector','remote-desktop','mobile']);
  assert.equal(DISPLAY_SCALE_MIN,75);
  assert.equal(DISPLAY_SCALE_MAX,150);
  for(const id of DISPLAY_MODE_IDS){
    const preset=defaultDisplayPreferences(id);
    assert.equal(preset.preset,id);
    assert.deepEqual(validateDisplayPreferences(preset),preset);
    assert.equal(typeof DISPLAY_MODE_PRESETS[id].label,'string');
  }
});
test('Improvement 6: damaged or untrusted preferences reset safely',()=>{
  const original=defaultDisplayPreferences('mobile');
  for(const damaged of [
    null,[],{preset:'gm'}, {version:1,preset:'projector',scale:500},
    {version:1,preset:'mobile',scale:90,showOverlay:true,
      cleanFullscreen:false,privateScene:'secret'}
  ])assert.deepEqual(validateDisplayPreferences(damaged,'mobile'),original);
  assert.deepEqual(applyDisplayPreference(original,'scale',999),original);
  assert.deepEqual(applyDisplayPreference(original,'preset','hidden-gm'),original);
  assert.equal(applyDisplayPreference(original,'scale',125).scale,125);
  assert.equal(applyDisplayPreference(original,'showOverlay',false).showOverlay,false);
});
test('Improvement 6: saved preferences are per account, campaign and recipient mode',()=>{
  const member=displayPreferencesKey('account','campaign','member');
  const remote=displayPreferencesKey('account','campaign','restricted');
  assert.notEqual(member,remote);
  assert.notEqual(member,displayPreferencesKey('another','campaign','member'));
  assert.notEqual(member,displayPreferencesKey('account','another','member'));
  assert.equal(displayPreferencesKey('../account','campaign','member'),'');
  assert.equal(displayPreferencesKey('account','campaign','invalid'),'');
  assert.equal(approvedSceneLabel('combat'),'Combat');
  assert.equal(approvedSceneLabel('unapproved-secret'),'Presentation');
});
test('Improvement 6: controls never publish, change viewer grants or mutate the server',()=>{
  const controls=read('frontend/src/dashboard/PresentationDisplayModes.jsx');
  const player=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const guest=read('frontend/src/dashboard/HybridSessionManager.jsx');
  const page=read('frontend/src/pages/PresentationPage.jsx');
  const runtime=read('frontend/src/dashboard/usePresentationDisplayRuntime.js');
  assert.match(controls,/data-testid="site-presentation-display-mode-controls"/);
  assert.match(controls,/window\.localStorage\.setItem/);
  assert.doesNotMatch(controls,/httpsCallable|fetch\(|setDoc\(|updateDoc\(|getDownloadURL/);
  assert.match(player,/usePresentationDisplayPreferences\(uid,campaignId,'member'/);
  assert.match(guest,/usePresentationDisplayPreferences\(uid,campaignId,'restricted'/);
  assert.match(player,/ActivePlayerPresentation key=/);
  assert.match(guest,/ActiveRestrictedPresentation key=/);
  assert.match(page,/uid=\{uid\} fullscreen/);
  assert.match(page,/uid=\{uid\}\/>/);
  assert.match(player,/!runtime\.ready\?<p role="alert">/);
  assert.match(guest,/!runtime\.ready\?<p role="alert">/);
  assert.match(runtime,/setGeneration\(value=>value\+1\)/);
  assert.match(player,/Exit Fullscreen/);
  assert.match(guest,/Exit Fullscreen/);
});
test('Improvement 6: presentation privacy and emergency stop remain intact',()=>{
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const player=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const guest=read('frontend/src/dashboard/HybridSessionManager.jsx');
  assert.match(service,/hybridViewerCanRead/);
  assert.match(service,/snapshot\.metadata\?\.fromCache/);
  assert.match(service,/getDocFromServer\(hybridGrantRef\(id,uid\)\)/);
  assert.match(player,/<GMScreenCaptureControls/);
  assert.match(guest,/RestrictedInvitationGate key=/);
  assert.doesNotMatch(guest,/watchParty\(|watchEncounter\(/);
});
