import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  mapForViewer,publishedAtlas,presentationForViewer, timestampRevision,
  battleMapFileError,battleMapAssetPath
} from '../frontend/src/dashboard/campaignMediaModel.mjs';
import {createFirebaseCampaignMediaService} from '../frontend/src/dashboard/firebaseCampaignMediaService.mjs';
import {canActivateRoute} from '../frontend/src/app/featureRegistry.mjs';
import {createAppServices} from '../frontend/src/services/appServices.mjs';
const cid='campaign123',uid='owner123',player='player123';
const campaign={id:cid,ownerUid:uid,membershipSchemaVersion:2,name:'Camp'};
const member={uid:player,campaignId:cid,role:'player',status:'active'};
const image={
  id:'map123',campaignId:cid,name:'Test Map',kind:'video',contentType:'video/mp4',
  storagePath:battleMapAssetPath(cid,'map123','video/mp4'),
  visibility:'players',width:1200,height:800,gridColumns:20,gridRows:15,
  gridVisible:true,gridOpacity:40,metresPerCell:1,
  tokens:[{id:'token123',label:'Hero',kind:'character',x:30,y:40}],fogEnabled:false,
  fogCells:'',description:'Map',privateNotes:'NEVER SHARE',combatId:''
};
function harness(who=uid,store={}){
  const state=new Map(Object.entries({['campaigns/'+cid]:campaign,
    ['campaigns/'+cid+'/members/'+player]:member,...store}));
  let reads=0,uploads=0,downloads=0,transactions=0;
  const doc=(_db,...parts)=>parts.join('/');
  const snapshot=key=>({exists:()=>state.has(key),id:key.split('/').at(-1),
    data:()=>state.get(key)});
  const sdk={
    doc,collection:doc,query:(x)=>x,where:()=>null,limit:()=>null,
    getDocFromServer:async key=>{reads++;return snapshot(key);},
    getDocsFromServer:async()=>({size:0,docs:[]}),
    onSnapshot:()=>{reads++;return ()=>{};},
    serverTimestamp:()=>({seconds:5}),
    async runTransaction(_db,fn){
      transactions++;
      const updates=[];
      const tx={get:async key=>snapshot(key),
        update:(key,payload)=>updates.push([key,{...state.get(key),...payload}]),
        set:(key,payload)=>updates.push([key,payload]),
        delete:key=>updates.push([key,null])};
      const result=await fn(tx);
      updates.forEach(([key,value])=>value?state.set(key,value):state.delete(key));
      return result;
    }
  };
  const storageSdk={
    ref:(_storage,path)=>path,
    getBlob:async()=>{downloads++;return {size:10};},
    uploadBytes:async()=>{uploads++;},
    deleteObject:async()=>{uploads++;},
  };
  const current={currentUser:{uid:who}};
  const service=createFirebaseCampaignMediaService({
    auth:current,db:{},firestoreSdk:sdk,storage:{},storageSdk,
    functions:{},functionsSdk:{httpsCallable:()=>async()=>({data:{ok:true}})},
    readCanonical:async user=>({uid:user.uid}),enabled:true
  });
  return {service,state,current,get reads(){return reads;},
    get uploads(){return uploads;},get downloads(){return downloads;},
    get transactions(){return transactions;}};
}
test('media model validates published, muted MP4/WebM map records and projects no private fields',()=>{
  const map=mapForViewer(image,cid,'player');
  assert.equal(map.kind,'video');
  assert.equal(map.visibility,'players');
  assert.equal(Object.hasOwn(map,'privateNotes'),false);
  assert.equal(Object.hasOwn(map,'combatId'),false);
  assert.equal(mapForViewer({...image,visibility:'gm'},cid,'player'),null);
  assert.ok(mapForViewer({...image,visibility:'gm'},cid,'gm'));
  assert.equal(mapForViewer({...image,storagePath:'users/owner/photo'},cid,'gm'),null);
  assert.equal(battleMapFileError({type:'video/mp4',size:10}),'');
  assert.match(battleMapFileError({type:'video/mp4',size:55*1024*1024}),/48 MB/);
  assert.match(battleMapFileError({type:'video/quicktime',size:100}),/MP4/);
});
test('presentations expose only allowlisted fields and player atlas requires publication',()=>{
  const safe=presentationForViewer({
    scene:'announcement',title:'Welcome',subtitle:'Explore',theme:'obsidian',
    mapId:'',characterIds:[],showRound:false,showPartyHP:false,
    revision:2,secretGMNotes:'private'
  });
  assert.equal(safe.title,'Welcome');
  assert.equal(Object.hasOwn(safe,'secretGMNotes'),false);
  assert.throws(()=>presentationForViewer({...safe,revision:-1}),/revision/);
  const atlas={id:'world123',status:'published',visibility:'players',
    name:'World',description:'Map',region:'Earth',width:1000,height:1000,
    contentType:'image/png',storagePath:'campaigns/'+cid+'/worldAtlas/world123/atlas.png',
    pins:[],routes:[],revision:1};
  assert.ok(publishedAtlas(atlas,cid));
  assert.equal(publishedAtlas({...atlas,status:'draft'},cid),null);
  assert.equal(timestampRevision({seconds:10,nanoseconds:2000000}),10002);
});
test('media remains off without feature flag, and presentation route fails closed',async()=>{
  const h=harness();
  const disabled=createFirebaseCampaignMediaService({
    auth:h.current,db:{},firestoreSdk:{doc:()=>{}},storage:{},
    storageSdk:{},functions:{},functionsSdk:{},readCanonical:async()=>({uid}),enabled:false
  });
  await assert.rejects(disabled.fetchMapMedia(cid,image,'gm'),/disabled/);
  const off=createAppServices({auth:{},campaigns:{},gameplay:{media:disabled}});
  assert.equal(canActivateRoute('presentation',off),false);
  const on=createAppServices({auth:{},campaigns:{},gameplay:{media:h.service}});
  assert.equal(canActivateRoute('presentation',on),true);
});
test('player cannot fetch GM-only media or write maps',async()=>{
  const h=harness(player,{['campaigns/'+cid+'/battleMaps/map123']:{...image,visibility:'gm'}});
  await assert.rejects(h.service.fetchMapMedia(cid,image,'player'),/no longer shared/);
  assert.equal(h.downloads,0);
  await assert.rejects(h.service.uploadMap(cid,{type:'video/mp4',size:5},
    {name:'Video',visibility:'gm'}, {width:100,height:100}),/membership/);
  assert.equal(h.uploads,0);
});
test('GM update keeps the media path and combat record, rejects old revisions',async()=>{
  const saved={...image,visibility:'gm',updatedAt:{seconds:5,nanoseconds:0}};
  const h=harness(uid,{['campaigns/'+cid+'/battleMaps/map123']:saved});
  const input={name:'Renamed',description:'Safe',visibility:'players',
    gridColumns:20,gridRows:15,gridOpacity:50,gridVisible:true,
    tokens:saved.tokens,fogEnabled:false,fogCells:'',metresPerCell:1};
  await h.service.saveMap(cid,'map123',input,5000);
  const stored=h.state.get('campaigns/'+cid+'/battleMaps/map123');
  assert.equal(stored.name,'Renamed');
  assert.equal(stored.visibility,'players');
  assert.equal(stored.storagePath,saved.storagePath);
  assert.equal(stored.contentType,'video/mp4');
  await assert.rejects(h.service.saveMap(cid,'map123',input,0),/another session/);
  const linked=harness(uid,{['campaigns/'+cid+'/battleMaps/map123']:{...saved,combatId:'combat123'}});
  await assert.rejects(linked.service.removeMap(cid,'map123'),/linked encounter/);
});
test('react route and player/GM UI use one service without legacy bridge or global CSS',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const adapter=read('frontend/src/auth/firebaseAuthAdapter.mjs');
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  const playerPage=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const presentation=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const map=read('frontend/src/dashboard/CampaignMapWorkspace.jsx');
  const app=read('frontend/src/app/App.jsx');
  for(const item of [adapter,gm,playerPage,presentation,map,app])
    assert.doesNotMatch(item,/window\.AsteriaFirebase|legacyBridge/);
  assert.match(adapter,/VITE_ASTERIA_CAMPAIGN_MEDIA_ENABLED==='true'/);
  assert.match(app,/<PresentationPage route=\{route\}/);
  assert.match(gm,/<CampaignMapWorkspace/);
  assert.match(gm,/<CampaignPresentationController/);
  assert.match(playerPage,/<CampaignAtlasWorkspace/);
  assert.match(presentation,/<CampaignMapWorkspace/);
  assert.match(map,/muted loop playsInline/);
  assert.match(map,/URL\.revokeObjectURL/);
});
