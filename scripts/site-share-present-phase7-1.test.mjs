import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CAMPAIGN_MEDIA_LIBRARY_SOURCES,CAMPAIGN_MEDIA_LIBRARY_TYPES,
  buildCampaignMediaLibrary,classifyCampaignMediaRecord,
  campaignMediaLibraryReference,filterCampaignMediaLibrary,
  campaignMediaLibraryCounts,CAMPAIGN_MEDIA_LIBRARY_TABS
} from '../src/state/campaignMediaLibraryModel.mjs';
import {battleMapAssetPath} from '../src/state/battleMapModel.mjs';
import {atlasImagePath} from '../src/state/worldAtlasModel.mjs';
import {sessionPdfPath} from '../src/state/sessionLibraryModel.mjs';
import {audioTrackPath} from '../src/state/campaignAudioModel.mjs';
import {recordingPath} from '../src/state/sessionRecordingModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id='campaign-media-one';
const data={
  battleMaps:[
    {id:'map-1',name:'Sunken Hall',kind:'image',contentType:'image/png',
      storagePath:battleMapAssetPath(id,'map-1','image/png'),
      visibility:'gm',description:'GM map',updatedAt:{seconds:10}},
    {id:'map-2',name:'Storm Loop',kind:'video',contentType:'video/webm',
      storagePath:battleMapAssetPath(id,'map-2','video/webm'),
      visibility:'players',updatedAt:{seconds:30}}
  ],
  worldAtlas:[
    {id:'atlas-1',name:'Ancient Roads',contentType:'image/webp',
      storagePath:atlasImagePath(id,'atlas-1','image/webp'),
      status:'draft',visibility:'gm'}
  ],
  sessionPdfs:[
    {id:'pdf-1',title:'Quest Handout',contentType:'application/pdf',
      storagePath:sessionPdfPath(id,'pdf-1'),status:'ready',
      visibility:'players',updatedAt:{seconds:20}},
    {id:'pdf-2',title:'Uploading',contentType:'application/pdf',
      storagePath:sessionPdfPath(id,'pdf-2'),status:'uploading',
      visibility:'players'}
  ],
  audioTracks:[
    {id:'audio-1',name:'Dark Forest',contentType:'audio/mpeg',
      storagePath:audioTrackPath(id,'audio-1','audio/mpeg'),
      status:'ready',visibility:'gm'}
  ],
  recordingArchives:[
    {id:'recording-1',title:'Session 9',contentType:'audio/webm',
      storagePath:recordingPath(id,'recording-1','audio/webm'),status:'ready',
      visibility:'players',sessionId:'session-9'}
  ]
};

test('7.1: virtual index classifies every canonical campaign media source, no copies',()=>{
  const items=buildCampaignMediaLibrary(id,data),count=campaignMediaLibraryCounts(items);
  assert.equal(CAMPAIGN_MEDIA_LIBRARY_SOURCES.length,5);
  assert.ok(CAMPAIGN_MEDIA_LIBRARY_TYPES.includes('video-cinematic'));
  assert.equal(items.length,7);
  assert.deepEqual(count,{total:7,private:4,shared:3,pending:1});
  assert.deepEqual(items.map(item=>item.id).slice(0,3),[
    'battleMaps:map-2','sessionPdfs:pdf-1','battleMaps:map-1'
  ]);
  assert.equal(items.find(item=>item.source==='worldAtlas').category,'atlas-map');
  assert.equal(items.find(item=>item.source==='recordingArchives').sessionId,'session-9');
  for(const item of items){
    assert.equal(item.provenance,'existing-campaign-record');
    assert.equal('storagePath' in item,false);
    assert.equal('url' in item,false);
    assert.equal('gmNotes' in item,false);
    assert.ok(item.originalTab);
  }
});
test('7.1: library does not publish drafts, unpublished files or stale visibility',()=>{
  const items=buildCampaignMediaLibrary(id,data);
  const uploading=items.find(item=>item.sourceId==='pdf-2');
  assert.equal(uploading.shared,false);
  assert.equal(uploading.visibility,'gm');
  assert.equal(uploading.previewable,false);
  assert.equal(items.find(item=>item.sourceId==='atlas-1').shared,false);
  assert.equal(items.find(item=>item.sourceId==='map-2').mediaKind,'video');
  assert.equal(items.find(item=>item.sourceId==='map-2').shared,true);
});
test('7.1: canonical identifiers, paths, type and status are mandatory',()=>{
  const map=data.battleMaps[0];
  assert.equal(classifyCampaignMediaRecord(id,'battleMaps',{...map,
    storagePath:'campaigns/other/battleMaps/map-1/scene.png'}),null);
  assert.equal(classifyCampaignMediaRecord(id,'battleMaps',{...map,
    kind:'video'}),null);
  assert.equal(classifyCampaignMediaRecord(id,'battleMaps',{...map,
    id:'../other'}),null);
  assert.equal(classifyCampaignMediaRecord(id,'worldAtlas',{...data.worldAtlas[0],
    storagePath:'https://public.example.com/file'}),null);
  assert.equal(classifyCampaignMediaRecord(id,'audioTracks',{...data.audioTracks[0],
    contentType:'application/javascript'}),null);
  assert.equal(classifyCampaignMediaRecord(id,'sessionPdfs',{...data.sessionPdfs[0],
    status:'archived'}),null);
  assert.equal(classifyCampaignMediaRecord(id,'unknown',map),null);
  assert.throws(()=>buildCampaignMediaLibrary('../other',data),/campaign/);
  assert.deepEqual(campaignMediaLibraryReference({source:'worldAtlas',sourceId:'atlas-1'}),
    {source:'worldAtlas',sourceId:'atlas-1'});
  assert.throws(()=>campaignMediaLibraryReference({
    source:'sessionPdfs',sourceId:'../../../hidden'}),/valid original/);
  assert.throws(()=>campaignMediaLibraryReference({
    source:'secretNotes',sourceId:'note-1'}),/valid original/);
});
test('7.1: duplicate source IDs are deduped; same ID across sources stays distinct',()=>{
  const indexed=buildCampaignMediaLibrary(id,{
    ...data,battleMaps:[data.battleMaps[0],data.battleMaps[0]],
    audioTracks:[{...data.audioTracks[0],id:'map-1',
      storagePath:audioTrackPath(id,'map-1','audio/mpeg')}]
  });
  assert.equal(indexed.filter(item=>item.sourceId==='map-1').length,2);
  assert.equal(indexed.filter(item=>item.id==='battleMaps:map-1').length,1);
});
test('7.1: bounded search and visibility filters only change the GM local view',()=>{
  const indexed=buildCampaignMediaLibrary(id,data);
  const found=filterCampaignMediaLibrary(indexed,{
    category:'battle-map',visibility:'players',query:'storm'
  });
  assert.equal(found.length,1);
  assert.equal(found[0].sourceId,'map-2');
  assert.equal(filterCampaignMediaLibrary(indexed,{
    category:'audio',visibility:'gm'
  }).length,1);
  assert.equal(filterCampaignMediaLibrary(indexed,{
    query:'nonexistent-title'
  }).length,0);
  assert.equal(indexed.length,7);
  assert.equal(CAMPAIGN_MEDIA_LIBRARY_TABS.worldAtlas,'world-atlas');
});
test('7.1: GM view is read-only and uses existing Auth, Storage, React and original tabs',()=>{
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const view=read('frontend/src/dashboard/GMMediaLibrary.jsx');
  const dashboard=read('frontend/src/pages/GMDashboardPage.jsx');
  const rules=read('firestore.rules'),storage=read('storage.rules');
  assert.match(service,/function watchGMMediaLibrary/);
  assert.match(service,/check\(id,'gm'\)/);
  assert.match(service,/buildCampaignMediaLibrary\(id,values\)/);
  assert.match(service,/function fetchGMMediaLibraryPreview/);
  assert.match(service,/getDocFromServer/);
  assert.match(service,/classifyCampaignMediaRecord\(id,ref.source,raw\)/);
  assert.match(view,/site-gm-media-library/);
  assert.match(view,/Open original workspace/);
  assert.match(view,/URL.revokeObjectURL/);
  assert.match(view,/filterCampaignMediaLibrary/);
  assert.doesNotMatch(view,/setDoc\(|updateDoc\(|uploadBytes\(/);
  assert.match(dashboard,/GMMediaLibrary/);
  assert.match(dashboard,/id:'media-library'/);
  assert.match(rules,/match \/sessionPdfs\/\{pdfId\}/);
  assert.match(rules,/match \/audioTracks\/\{trackId\}/);
  assert.match(storage,/match \/campaigns\/\{campaignId\}\/battleMaps/);
});
