import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PRESENTATION_ASSET_LIMIT,PRESENTATION_MEDIA_FORMATS,
  presentationAssetDetails,presentationAssetFileError,
  presentationAssetPath,publishedPresentationAsset,
  safePresentationAssetCard,validatePresentationAssetAction
} from '../src/state/presentationAssetModel.mjs';
import {
  PRESENTATION_SCENES,presentationDraft,publicPresentation
} from '../src/state/playerPresentationModel.mjs';
import {presentationForViewer} from '../frontend/src/dashboard/campaignMediaModel.mjs';
import {restrictedPresentationProjection} from '../src/state/hybridPresentationSessionModel.mjs';
import {classifyCampaignMediaRecord} from '../src/state/campaignMediaLibraryModel.mjs';
import {createPresentationAssetCommands} from '../functions/presentationAssetCommands.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const cid='campaign-presentation-73',mediaId='asset-73';
const details={name:'Dragon Above Palladium',description:'Opening cinematic',
  size:1024,contentType:'video/webm'};
const base='campaigns/'+cid+'/';
function transactionHarness(gm=true){
  const store=new Map(),writes=[];
  const tx={
    get:async path=>({exists:()=>store.has(path),data:()=>store.get(path)}),
    set:(path,data,options)=>{store.set(path,options?.merge?
      {...store.get(path),...data}:data);writes.push([path,'set']);},
    update:(path,data)=>{store.set(path,{...store.get(path),...data});writes.push([path,'update']);},
    delete:path=>{store.delete(path);writes.push([path,'delete']);}
  };
  const api=createPresentationAssetCommands({
    db:{},doc:(_db,...segments)=>segments.join('/'),
    currentUser:{uid:'gm-73'},serverTimestamp:()=>new Date(),
    runTransaction:async(_db,callback)=>callback(tx)
  },{requireCampaignGM:async()=>{
    if(!gm)throw Error('Only a campaign GM may edit presentation media.');
  }});
  return {store,writes,run:input=>api.managePresentationAsset(cid,'gm-scope',input)};
}
test('7.3: exact MIME, fixed path and size limits protect uploaded media',()=>{
  assert.equal(Object.keys(PRESENTATION_MEDIA_FORMATS).length,7);
  assert.equal(PRESENTATION_ASSET_LIMIT,60);
  assert.equal(presentationAssetPath(cid,mediaId),base+'presentationAssets/'+mediaId+'/content');
  assert.deepEqual(presentationAssetDetails(details),{
    ...details,kind:'cinematic'
  });
  assert.equal(presentationAssetFileError({name:'scene.webm',
    type:'video/webm',size:1024}),'');
  assert.match(presentationAssetFileError({name:'script.html',
    type:'text/html',size:20}),/Choose/);
  assert.match(presentationAssetFileError({name:'large.mp4',
    type:'video/mp4',size:49*1024*1024}),/size/);
  assert.throws(()=>presentationAssetPath('../invalid',mediaId),/Invalid/);
  assert.throws(()=>presentationAssetDetails({...details,name:'',size:1024}),/title/);
  assert.throws(()=>presentationAssetDetails({...details,storagePath:'custom'}),/fields/);
  assert.throws(()=>validatePresentationAssetAction({
    type:'publish',id:'../secret',expectedRevision:1}),/valid/);
});
test('7.3: existing presentation scenes remain valid; media requires approved ID',()=>{
  assert.deepEqual(PRESENTATION_SCENES.slice(-3),['image','cinematic','handout']);
  const original={scene:'title',title:'Asteria',subtitle:'Welcome',mapId:'',
    characterIds:[],showRound:false,showPartyHP:false,theme:'obsidian'};
  assert.deepEqual(presentationDraft(original),original);
  assert.throws(()=>presentationDraft({...original,scene:'cinematic'}),
    /published presentation/);
  const next=presentationDraft({...original,scene:'cinematic',
    assetId:mediaId});
  assert.equal(next.assetId,mediaId);
  assert.equal(publicPresentation(next,2).assetId,mediaId);
  assert.equal(presentationForViewer(publicPresentation(next,2)).assetId,mediaId);
  assert.equal(restrictedPresentationProjection(next,2).scene,'cinematic');
  assert.equal(restrictedPresentationProjection(next,2).assetId,mediaId);
  assert.equal(restrictedPresentationProjection({...next,scene:'combat'},3).scene,
    'combat');
});
test('7.3: GM reserve / finish / publish without implicit player visibility',async()=>{
  const h=transactionHarness();
  const reserved=await h.run({type:'reserve',id:mediaId,details});
  assert.equal(reserved.ok,true,reserved.error);
  const pending=h.store.get(base+'presentationAssets/'+mediaId);
  assert.equal(pending.visibility,'gm');
  assert.equal(pending.status,'uploading');
  assert.equal(h.store.get(base+'presentationAssetConfig/current').count,1);
  assert.equal((await h.run({type:'publish',id:mediaId,expectedRevision:1})).ok,false);
  assert.equal((await h.run({type:'finish',id:mediaId,expectedRevision:1})).ok,true);
  assert.equal(h.store.get(base+'presentationAssets/'+mediaId).visibility,'gm');
  assert.equal((await h.run({type:'publish',id:mediaId,expectedRevision:2})).ok,true);
  assert.equal(publishedPresentationAsset(h.store.get(base+'presentationAssets/'+mediaId),
    'cinematic'),true);
  assert.equal(publishedPresentationAsset(h.store.get(base+'presentationAssets/'+mediaId),
    'image'),false);
  assert.match((await h.run({type:'publish',id:mediaId,
    expectedRevision:2})).error,/changed/);
  const card=safePresentationAssetCard(h.store.get(base+'presentationAssets/'+mediaId),cid);
  assert.equal(card.visibility,'players');
  assert.equal(card.kind,'cinematic');
  assert.equal('storagePath' in card,false);
  assert.equal('createdBy' in card,false);
  const indexed=classifyCampaignMediaRecord(cid,'presentationAssets',
    h.store.get(base+'presentationAssets/'+mediaId));
  assert.equal(indexed.category,'video-cinematic');
});
test('7.3: unpublish a live scene atomically blacks out all projections and bytes',async()=>{
  const h=transactionHarness();
  await h.run({type:'reserve',id:mediaId,details});
  await h.run({type:'finish',id:mediaId,expectedRevision:1});
  await h.run({type:'publish',id:mediaId,expectedRevision:2});
  const scene={scene:'cinematic',assetId:mediaId,revision:4,
    theme:'obsidian',title:'Dawn',subtitle:'Rising'};
  h.store.set(base+'presentationControl/current',scene);
  h.store.set(base+'hybridSessionControl/current',{status:'open',epoch:'hybrid-1'});
  h.store.set(base+'presentationAssetAccess/current',{assetId:mediaId,
    scene:'cinematic',epoch:'hybrid-1',viewerExpiries:{
      invited:new Date(Date.now()+30000)
    }});
  const done=await h.run({type:'unpublish',id:mediaId,expectedRevision:3});
  assert.equal(done.ok,true,done.error);
  assert.equal(done.blackedOut,true);
  assert.equal(h.store.get(base+'presentationControl/current').scene,'blank');
  assert.equal(h.store.get(base+'presentationShared/current').scene,'blank');
  assert.equal(h.store.get(base+'presentationRestricted/current').scene,'blank');
  const manifest=h.store.get(base+'presentationAssetAccess/current');
  assert.equal(manifest.assetId,'');
  assert.deepEqual(manifest.viewerExpiries,{});
  assert.equal(h.store.get(base+'presentationAssets/'+mediaId).visibility,'gm');
});
test('7.3: archive abandoned upload safely and reject non-GM actions',async()=>{
  const h=transactionHarness();
  await h.run({type:'reserve',id:mediaId,details});
  const cancelled=await h.run({type:'archive',id:mediaId,expectedRevision:1});
  assert.equal(cancelled.ok,true,cancelled.error);
  assert.equal(h.store.get(base+'presentationAssetConfig/current').count,0);
  assert.equal(h.store.get(base+'presentationAssets/'+mediaId).status,'archived');
  const denied=transactionHarness(false);
  assert.match((await denied.run({type:'reserve',id:mediaId,details})).error,/GM/);
  assert.equal(denied.writes.length,0);
});
test('7.3: server and clients use canonical commands, Storage and private manifests',()=>{
  const commands=source('functions/commands.mjs');
  const dispatch=source('functions/handler.mjs');
  const rules=source('storage.rules');
  const firestore=source('firestore.rules');
  const renderer=source('frontend/src/dashboard/PresentationMediaFrame.jsx');
  const control=source('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const restricted=source('frontend/src/dashboard/HybridSessionManager.jsx');
  const assets=source('frontend/src/dashboard/GMPresentationAssets.jsx');
  const mediaService=source('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  assert.match(commands,/createPresentationAssetCommands/);
  assert.match(dispatch,/managePresentationAsset/);
  assert.match(rules,/presentationAssetAccess\/current/);
  assert.match(rules,/viewerExpiries/);
  assert.match(rules,/request\.resource\.size <= 48 \* 1024 \* 1024/);
  assert.match(firestore,/match \/presentationAssets\/\{assetId\}/);
  assert.match(firestore,/match \/presentationAssetAccess\/\{documentId\}/);
  assert.match(renderer,/URL.revokeObjectURL/);
  assert.match(renderer,/autoPlay/);
  assert.match(control,/<GMPresentationAssets/);
  assert.match(control,/<PresentationMediaFrame/);
  assert.match(restricted,/<PresentationMediaFrame/);
  assert.match(assets,/Publish/);
  assert.match(mediaService,/fetchPresentationAsset/);
  assert.match(mediaService,/getBlob/);
  assert.doesNotMatch(renderer,/getDownloadURL/);
});
