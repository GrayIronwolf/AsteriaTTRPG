import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRESENTATION_DEFAULT,PRESENTATION_SCENES,presentationDraft,
  validatePresentationAction,publicPresentation,safeCombatPresentation}
  from '../src/state/playerPresentationModel.mjs';
import {presentationForViewer}
  from '../frontend/src/dashboard/campaignMediaModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const draft={scene:'title',title:'Asteria',subtitle:'Welcome',
  mapId:'',characterIds:[],showRound:false,showPartyHP:false,theme:'obsidian'};
test('Phase 7.0: existing presentation supports the original seven safe scenes',()=>{
  assert.deepEqual(PRESENTATION_SCENES,[
    'blank','title','announcement','battle-map','world-map','combat','party',
    'image','cinematic','handout'
  ]);
  assert.equal(PRESENTATION_DEFAULT.scene,'blank');
  assert.deepEqual(presentationDraft(draft),draft);
  assert.deepEqual(validatePresentationAction({type:'set-scene',draft,
    expectedRevision:1}),'set-scene');
  assert.throws(()=>presentationDraft({...draft,hiddenNotes:'GM SECRET'}),
    /fields/);
  assert.throws(()=>presentationDraft({...draft,scene:'unknown'}),
    /supported display scene/);
  assert.throws(()=>presentationDraft({...draft,scene:'battle-map'}),
    /published map/);
});
test('Phase 7.0: shared scene records strip arbitrary private fields',()=>{
  const safe=publicPresentation(draft,1);
  const untrusted={...safe,gmPrivateNotes:'secret',
    sessionTokens:['token'],ownerUid:'gm'};
  const result=presentationForViewer(untrusted);
  assert.equal(result.scene,'title');
  assert.equal(result.gmPrivateNotes,undefined);
  assert.equal(result.sessionTokens,undefined);
  assert.equal(result.ownerUid,undefined);
});
test('Phase 7.0: client projection is safe but cannot be confused with Firestore permissions',()=>{
  const record={status:'active',round:4,turnIndex:0,combatants:[{
    id:'enemy-1',kind:'enemy',name:'Invisible Stalker',
    hp:[40,40],gmOnlyAbilities:['Invisible']
  }]};
  const projection=safeCombatPresentation(record,{});
  assert.deepEqual(projection,{active:true,round:4,current:'GM turn'});
  assert.equal('combatants' in projection,false);
  const rules=read('firestore.rules');
  assert.match(rules,/match \/systems\/\{systemId\}/);
  // Current general system-read rule is wider than the safe React projection.
  assert.match(rules,/allow read: if canUseCampaignSystems\(campaignId\)/);
  assert.match(rules,/systemId == 'itemEcosystem' \|\| systemId == 'gmWorkspace'/);
});
test('Phase 7.0: existing authenticated, GM-only scene commands are authoritative',()=>{
  const commands=read('functions/playerPresentationCommands.mjs');
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const rules=read('firestore.rules');
  assert.match(commands,/requireCampaignGM\(transaction,campaignId\)/);
  assert.match(commands,/expectedRevision/);
  assert.match(commands,/transaction\.set\(sharedRef/);
  assert.match(service,/getDocFromServer\(cRef\(id\)\)/);
  assert.match(service,/watchPresentation/);
  assert.match(service,/getBlob/);
  assert.match(rules,/match \/presentationControl\/\{documentId\}/);
  assert.match(rules,/match \/presentationShared\/\{documentId\}/);
  assert.match(rules,/allow create, update, delete: if false;/);
});
test('Phase 7.0: media and viewer route preserve existing architecture without a second Firebase app',()=>{
  const routes=read('frontend/src/router/siteRoutes.mjs');
  const ui=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const page=read('frontend/src/pages/PresentationPage.jsx');
  const media=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const storage=read('storage.rules');
  assert.match(routes,/\/react\\\/presentation/);
  assert.match(page,/CampaignPresentationDisplay/);
  assert.match(ui,/CampaignPresentationController/);
  // Phase 7.5 moves shared fullscreen behaviour into the projector hook.
  const lifecycle=read('frontend/src/dashboard/usePresentationDisplayRuntime.js');
  assert.match(ui,/usePresentationDisplayRuntime/);
  assert.match(lifecycle,/requestFullscreen/);
  assert.match(ui,/Present Scene/);
  assert.match(ui,/Blackout/);
  assert.match(media,/createFirebaseCampaignMediaService/);
  assert.match(storage,/match \/campaigns\/\{campaignId\}\/battleMaps\/\{mapId\}/);
  assert.match(storage,/match \/campaigns\/\{campaignId\}\/sessionPdfs\/\{pdfId\}/);
  assert.match(storage,/match \/campaigns\/\{campaignId\}\/audioTracks\/\{trackId\}/);
});
test('Phase 7.0: integration stays non-destructive to existing phase 6',()=>{
  const combat=read('frontend/src/combat/CombatWorkspace.jsx');
  const prepared=read('frontend/src/combat/PreparedEncounterLibrary.jsx');
  const report=read('docs/PHASE-7-0-SHARE-PRESENT-ARCHITECTURE-AUDIT.md');
  assert.match(combat,/GMEncounterHistoryPanel/);
  assert.match(prepared,/PreparedEncounterLibrary/);
  for(const step of ['7.1','7.2','7.3','7.4','7.5','7.6','7.7'])
    assert.ok(report.includes('**'+step+'**'),'Document '+step);
  assert.match(report,/Codex/);
  assert.match(report,/raw shared combat record/i);
  assert.match(report,/no merge or deployment/i);
});
