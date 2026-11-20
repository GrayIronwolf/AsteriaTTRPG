import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GM_WORLD_COLLECTIONS,GM_WORLD_STATE_FIELDS,gmWorldStateDraft,gmWorldStateFingerprint,
  updateGMWorldState,upsertGMWorldEntry,removeGMWorldEntry,gmWorldCollectionDraft,
  gmWorldCollectionRows,GM_WORLD_MAX_ROWS
} from '../frontend/src/digitalGM/gmWorldSystemsModel.mjs';
import {worldMutation,GM_AREAS,gmToolkitProjection} from '../frontend/src/digitalGM/digitalGMModel.mjs';
import {
  defaultDashboardLayout,normalizeDashboardLayout
} from '../src/state/dashboardLayoutModel.mjs';
import {
  activateBuiltinGMFocus,leaveGMFocus,saveNamedGMFocus,gmFocusStatus
} from '../src/state/gmFocusModel.mjs';
import {
  createGMLayoutBackup,parseGMLayoutBackup,previewGMLayoutBackup
} from '../src/state/gmLayoutBackupModel.mjs';
import {
  audioFileError,audioUploadDetails,audioTrackPath
} from '../src/state/campaignAudioModel.mjs';
import {
  sessionPdfFileError,sessionPdfPath
} from '../src/state/sessionLibraryModel.mjs';
import {
  recordingMetadata,recordingFileError,validateRecordingAction,recordingPath
} from '../src/state/sessionRecordingModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Phase 3.5: all original World Systems categories except NPCs have live editors',()=>{
  assert.deepEqual(GM_WORLD_COLLECTIONS.map(x=>x.id),[
    'regions','factions','settlements','merchants','timeline','changes','knowledge','discoveries'
  ]);
  assert.equal(GM_WORLD_STATE_FIELDS.length,11);
  assert.equal(new Set(GM_WORLD_COLLECTIONS.map(x=>x.id)).size,8);
  assert.ok(GM_AREAS.includes('world'));
  assert.ok(GM_WORLD_MAX_ROWS>=100);
});
test('Phase 3.5: World State updates validate values and reject stale GM drafts',()=>{
  const world={kingdomStatus:'Stable',politicalTension:2,corruptionLevel:0};
  const before=gmWorldStateFingerprint(world);
  const draft=gmWorldStateDraft(world);
  draft.kingdomStatus='At War';draft.politicalTension='8';draft.corruptionLevel='1';
  const patch=updateGMWorldState(world,draft,before);
  assert.equal(patch.kingdomStatus,'At War');
  assert.equal(patch.politicalTension,8);
  assert.equal(patch.corruptionLevel,1);
  assert.equal(patch.npcs,undefined);
  assert.throws(()=>updateGMWorldState({...world,kingdomStatus:'Unrest'},draft,before),
    /changed in another GM tab/);
  assert.throws(()=>updateGMWorldState(world,{...draft,corruptionLevel:'-2'},before),
    /whole-number/);
  assert.throws(()=>updateGMWorldState(world,{...draft,gmNotes:'x'.repeat(12001)},before),
    /12000 characters/);
  assert.deepEqual(world,{kingdomStatus:'Stable',politicalTension:2,corruptionLevel:0});
});
test('Phase 3.5: world entry create, edit and delete are category scoped and CAS protected',()=>{
  const world={regions:[],npcs:[{id:'npc-existing',name:'Private NPC'}],
    factions:[{id:'old-faction',name:'Guild'}]};
  const draft=gmWorldCollectionDraft('regions');
  draft.name='Glacial Coast';draft.status='Contested';
  const result=upsertGMWorldEntry(world,'regions','world-new',draft,'');
  assert.equal(result.regions[0].name,'Glacial Coast');
  assert.equal(result.npcs,undefined);
  assert.equal(world.regions.length,0);
  assert.equal(gmWorldCollectionRows({...world,...result},'regions','Glacial').length,1);
  assert.equal(gmWorldCollectionRows({...world,...result},'regions','unmatched').length,0);
  const current={...world,...result};
  const edit={...draft,name:'Glacial Coast North'};
  assert.throws(()=>upsertGMWorldEntry(current,'regions','world-new',edit,''),
    /changed/);
  const next=upsertGMWorldEntry(current,'regions','world-new',edit,result.regions[0].updatedAt);
  assert.equal(next.regions.length,1);
  assert.equal(next.regions[0].name,'Glacial Coast North');
  assert.throws(()=>removeGMWorldEntry(current,'regions','world-new','wrong'),/changed/);
  assert.equal(removeGMWorldEntry(current,'regions','world-new',
    result.regions[0].updatedAt).regions.length,0);
  assert.equal(world.factions[0].name,'Guild');
});
test('Phase 3.5: world mutations use the existing protected workspace',()=>{
  const world={world:{regions:[],npcs:[{id:'npc-existing',name:'NPC'}]}};
  const entry={...gmWorldCollectionDraft('regions'),name:'Northern Ridge'};
  const patch=worldMutation(world.world,{type:'world-entry-save',category:'regions',
    id:'world-north',entry,expectedUpdatedAt:''});
  assert.equal(patch.regions[0].name,'Northern Ridge');
  assert.equal(patch.npcs,undefined);
  assert.throws(()=>worldMutation(world.world,{type:'world-entry-delete',
    category:'npcs',id:'npc-existing'}),/Invalid world record category/);
  const p=gmToolkitProjection({world:{...world.world,...patch}});
  assert.equal(p.world.regions[0].name,'Northern Ridge');
  assert.equal(p.world.npcs[0].name,'NPC');
});
test('Phase 3.5: GM Focus preserves original layout and can restore',()=>{
  const original=normalizeDashboardLayout(defaultDashboardLayout('gm'),'gm');
  const outcome=activateBuiltinGMFocus(original,'combat');
  assert.equal(outcome.ok,true);
  assert.equal(gmFocusStatus(outcome.layout).hasHome,true);
  const returned=leaveGMFocus(outcome.layout);
  assert.equal(returned.ok,true);
  assert.deepEqual(returned.layout.order,original.order);
  const stored=saveNamedGMFocus(original,'Live Combat','focus-test-a');
  assert.equal(stored.ok,true);
  assert.equal(stored.layout.focusModes[0].name,'Live Combat');
});
test('Phase 3.5: JSON GM backup includes layouts only, validates before restore',()=>{
  const original=defaultDashboardLayout('gm');
  const backup=createGMLayoutBackup(original,'2026-11-20T00:00:00.000Z');
  const parsed=parseGMLayoutBackup(backup);
  assert.equal(parsed.ok,true);
  assert.ok(previewGMLayoutBackup(parsed.layout).visiblePanels>0);
  assert.equal(backup.includes('password'),false);
  assert.equal(parseGMLayoutBackup('{not json').ok,false);
  assert.equal(parseGMLayoutBackup(JSON.stringify({
    ...JSON.parse(backup),role:'player'
  })).ok,false);
});
test('Phase 3.5: React dashboard routes living world and GM focus through secure services',()=>{
  const page=read('frontend/src/pages/GMDashboardPage.jsx');
  const ui=read('frontend/src/dashboard/GMWorldSystemsWorkspace.jsx');
  const manager=read('frontend/src/layout/DashboardLayoutManager.jsx');
  const focus=read('frontend/src/layout/GMSessionLayoutControls.jsx');
  const model=read('frontend/src/digitalGM/digitalGMModel.mjs');
  const service=read('frontend/src/digitalGM/firebaseDigitalGMService.mjs');
  assert.match(page,/<GMWorldSystemsWorkspace/);
  assert.match(page,/api=\{api\.digitalGM\}/);
  assert.doesNotMatch(page,/id:'world',label:'World Systems',area:'calendar'/);
  assert.match(ui,/watchGM\(campaignId,'world'/);
  assert.match(ui,/world-entry-save/);
  assert.match(ui,/world-state-save/);
  assert.match(manager,/<GMSessionLayoutControls/);
  assert.match(focus,/activateBuiltinGMFocus/);
  assert.match(focus,/createGMLayoutBackup/);
  assert.match(focus,/parseGMLayoutBackup/);
  assert.match(model,/updateGMWorldState/);
  assert.match(service,/worldMutation\(saved\.world\|\|\{\},operation\)/);
  assert.match(service,/gmCampaignAccess\(/);
  assert.doesNotMatch(page,/window\.AsteriaFirebase/);
  assert.doesNotMatch(ui,/firebaseService|window\.Asteria/);
});

test('Phase 3.5: private PDF uploads use existing library input and storage paths',()=>{
  const doc={name:'Session.pdf',size:4000,type:'application/pdf'};
  assert.equal(sessionPdfFileError(doc),'');
  assert.equal(sessionPdfPath('campaign-one','pdf-one'),
    'campaigns/campaign-one/sessionPdfs/pdf-one/document.pdf');
  assert.match(sessionPdfFileError({name:'bad.exe',type:'application/pdf',size:10}),/filename/);
  assert.match(sessionPdfFileError({name:'Session.pdf',type:'text/plain',size:10}),
    /Only PDF/);
  const digital=read('frontend/src/digitalGM/DigitalGMWorkspace.jsx');
  const adapter=read('frontend/src/digitalGM/firebaseDigitalGMService.mjs');
  assert.match(digital,/Upload Private PDF/);
  assert.match(digital,/type:'update-note'/);
  assert.match(digital,/type:'delete-note'/);
  assert.match(digital,/type:'archive-pdf'/);
  assert.match(adapter,/uploadSessionPdf/);
  assert.match(adapter,/fetchSessionPdf/);
  assert.match(adapter,/sessionPdfPath\(cid,id\)/);
});
test('Phase 3.5: audio uploads and broadcast controls only use approved media',()=>{
  const mp3={name:'Storm.mp3',type:'audio/mpeg',size:512};
  assert.equal(audioFileError(mp3),'');
  const details=audioUploadDetails({name:'Snowfall',description:'',
    category:'ambient',volume:65,loop:true,
    fileName:mp3.name,size:mp3.size,contentType:mp3.type});
  assert.equal(details.category,'ambient');
  assert.equal(audioTrackPath('campaign-one','audio-one','audio/mpeg'),
    'campaigns/campaign-one/audioTracks/audio-one/audio.mp3');
  assert.match(audioFileError({name:'Other.txt',type:'audio/mpeg',size:512}),
    /extension/);
  const view=read('frontend/src/digitalGM/DigitalGMWorkspace.jsx');
  assert.match(view,/Upload Private Audio/);
  for(const action of ['play-ambient','pause-ambient','resume-ambient',
    'stop-ambient','play-effect','stop-effect','archive-track','publish-track'])
    assert.ok(view.includes("'"+action+"'"),action);
  const service=read('frontend/src/digitalGM/firebaseDigitalGMService.mjs');
  assert.match(service,/audioUploadDetails/);
  assert.match(service,/uploadCampaignAudio/);
  assert.match(service,/fetchCampaignAudio/);
});
test('Phase 3.5: consent-gated recordings preserve server authority and local control',()=>{
  const view=read('frontend/src/digitalGM/DigitalGMWorkspace.jsx');
  const service=read('frontend/src/digitalGM/firebaseDigitalGMService.mjs');
  for(const command of ['request-consent','start-recording','stop-recording',
    'cancel-consent','publish-archive','unpublish-archive','archive-archive'])
    assert.ok(view.includes("'"+command+"'"),command);
  assert.match(view,/getUserMedia/);
  assert.match(view,/getDisplayMedia/);
  assert.match(view,/all active participant/i);
  assert.match(view,/Recording stopped because authoritative consent/);
  assert.match(view,/Save Private Cloud Archive/);
  assert.match(view,/download.*Local Recording|Download Local Recording/);
  assert.match(service,/recordingFileError/);
  assert.match(service,/uploadRecordingArchive/);
  assert.match(service,/fetchRecordingArchive/);
  const meta=recordingMetadata({title:'Session 12',summary:'',
    requestId:'rec-one',sessionId:'session-one',
    durationSeconds:100,size:25000,contentType:'audio/webm'});
  assert.equal(meta.durationSeconds,100);
  assert.equal(recordingPath('campaign-one','rec-one','audio/webm'),
    'campaigns/campaign-one/sessionRecordings/rec-one/recording.webm');
  assert.throws(()=>validateRecordingAction({type:'request-consent',
    requestId:'rec-one',sessionId:'session-one',mode:'microphone',
    expectedRevision:0,actorConsent:false}),/explicitly consent/);
  assert.match(recordingFileError({name:'capture.mp3',
    size:2500,type:'audio/webm'}),/extension/);
});
