import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPlayerPresentationCommands} from '../functions/playerPresentationCommands.mjs';
import {
  PRESENTATION_PLAYLIST_LIMIT,PRESENTATION_PLAYLIST_STEP_LIMIT,
  presentationPlaylist,presentationPlaylistLibrary,applyPresentationPlaylistAction,
  playlistStepIndex
} from '../src/state/presentationPlaylistModel.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const scene={scene:'title',theme:'obsidian',title:'Opening',subtitle:'',
  mapId:'',characterIds:[],showRound:false,showPartyHP:false};
const playlist=(id='a',steps=1)=>({id,name:'Session Opening',
  steps:Array.from({length:steps},(_,i)=>({
    id:'step'+i,label:'Scene '+i,draft:scene
  }))});
const save=(item,revision=0)=>({type:'save',expectedRevision:revision,playlist:item});
test('Phase 3: strict IDs, bounded playlist count and scenes',()=>{
  assert.equal(presentationPlaylist(playlist()).steps.length,1);
  assert.throws(()=>presentationPlaylist(playlist('a',PRESENTATION_PLAYLIST_STEP_LIMIT+1)));
  assert.throws(()=>presentationPlaylist({...playlist(),secret:'private'}));
  assert.throws(()=>presentationPlaylist({...playlist(),steps:[{id:'x',label:'test',draft:{...scene,secret:'gm'}}]}));
  assert.throws(()=>presentationPlaylistLibrary({version:1,revision:0,
    playlists:Array.from({length:PRESENTATION_PLAYLIST_LIMIT+1},(_,i)=>playlist('p'+i))}));
});
test('Phase 3: optimistic concurrency and bounded saved library',()=>{
  let data=presentationPlaylistLibrary(null);
  data=applyPresentationPlaylistAction(data,save(playlist()));
  assert.equal(data.revision,1);
  assert.throws(()=>applyPresentationPlaylistAction(data,save(playlist('b'),0)),/changed/);
  assert.deepEqual(data.playlists.map(x=>x.id),['a']);
  data=applyPresentationPlaylistAction(data,{type:'delete',id:'a',expectedRevision:1});
  assert.equal(data.playlists.length,0);
  assert.throws(()=>applyPresentationPlaylistAction(data,{type:'delete',id:'a',expectedRevision:2}));
});
test('Phase 3: navigation does not wrap, autoplay or schedule timers',()=>{
  assert.equal(playlistStepIndex(['a','b','c'],1,1),2);
  assert.equal(playlistStepIndex(['a','b','c'],0,-1),-1);
  assert.equal(playlistStepIndex(['a','b','c'],2,1),-1);
  assert.equal(playlistStepIndex([],0,1),-1);
});
function harness(allow=true){
  const data=new Map();
  const writes=[];
  const doc=(_db,...parts)=>({path:parts.join('/')});
  const trans={
    get:async ref=>({exists:()=>data.has(ref.path),data:()=>data.get(ref.path)}),
    set:(ref,value)=>{data.set(ref.path,value);writes.push(ref.path);}
  };
  const action=createPlayerPresentationCommands({
    db:{},doc,runTransaction:async(_db,fn)=>fn(trans),
    currentUser:{uid:'gm'},serverTimestamp:()=>1
  },{requireCampaignGM:async()=>{
    if(!allow)throw Error('GM only.');
  }}).managePresentationPlaylist;
  return {data,writes,action};
}
test('Phase 3: only GM can store playlists and no player scene document is written',async()=>{
  const ok=harness();
  const result=await ok.action('campaign','gm-scope',save(playlist()));
  assert.equal(result.ok,true,result.error);
  assert.deepEqual(ok.writes,['campaigns/campaign/presentationPlaylists/current']);
  assert.equal(ok.data.get(ok.writes[0]).playlists.length,1);
  const bad=harness(false);
  assert.equal((await bad.action('campaign','gm-scope',save(playlist()))).ok,false);
  assert.deepEqual(bad.writes,[]);
});
test('Phase 3: React UI uses existing authorized publish and private listener',()=>{
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const controller=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const component=read('frontend/src/dashboard/GMPresentationPlaylists.jsx');
  const handler=read('functions/handler.mjs'),rules=read('firestore.rules');
  assert.match(handler,/'managePresentationPlaylist'/);
  assert.match(rules,/match \/presentationPlaylists\/\{documentId\} \{[\s\S]*?isCampaignGM\(campaignId\)/);
  assert.match(rules,/match \/presentationPlaylists\/\{documentId\} \{[\s\S]*?allow create, update, delete: if false/);
  assert.match(service,/function watchPresentationPlaylists/);
  assert.match(service,/action:'managePresentationPlaylist'/);
  assert.match(controller,/<GMScreenCaptureControls/);
  assert.match(controller,/<GMPresentationPlaylists/);
  assert.match(controller,/publishPlaylistScene=async scene=>/);
  assert.match(controller,/api\.managePresentation\(campaignId,action\)/);
  assert.match(component,/Add Current Draft as Scene/);
  assert.match(component,/Present Previous/);
  assert.match(component,/Present Next/);
  assert.doesNotMatch(component,/setInterval\(|setTimeout\(/);
});
