import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 audioId,audioFileError,audioMagicMatches,audioTrackPath,audioSettings,audioUploadDetails,
 audioPublicTrack,audioLibraryRows,validateAudioAction,ambientOffsetSeconds
} from '../src/state/campaignAudioModel.mjs';
import {createCampaignAudioCommands} from '../functions/campaignAudioCommands.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const settings={name:'Storm in Altarin',description:'Snow and wind',category:'ambient',volume:65,loop:true};
const details={...settings,fileName:'storm.mp3',size:1000,contentType:'audio/mpeg'};
const trackPath='campaigns/campaign-one/audioTracks/storm';
const sharedPath='campaigns/campaign-one/audioTracksShared/storm';
function harness(denied=false){
 const store=new Map(),reads=[],writes=[];
 const doc=(_db,...parts)=>({path:parts.join('/')});
 const tx={
  get:async ref=>{reads.push(ref.path);const value=store.get(ref.path);
   return {exists:()=>value!==undefined,data:()=>value};},
  set:(ref,value,opt)=>{writes.push(['set',ref.path]);
   store.set(ref.path,opt?.merge?{...(store.get(ref.path)||{}),...value}:value);},
  update:(ref,value)=>{writes.push(['update',ref.path]);store.set(ref.path,{...store.get(ref.path),...value});},
  delete:ref=>{writes.push(['delete',ref.path]);store.delete(ref.path);}
 };
 let timestamp=5000;
 const context={db:{},doc,currentUser:{uid:'gm'},serverTimestamp:()=>42,
  now:()=>timestamp,runTransaction:async(_db,work)=>work(tx)};
 const commands=createCampaignAudioCommands(context,{requireCampaignGM:async()=>{
  if(denied)throw Error('GM only');
 }});
 return {store,reads,writes,tick:ms=>{timestamp+=ms;},run:action=>commands.manageCampaignAudio('campaign-one','gm-scope',action)};
}
const reserve={type:'reserve-track',id:'storm',details};
test('Sound formats, extensions, size and signatures are bounded',()=>{
 assert.equal(audioId('track-one'),true);
 assert.equal(audioId('../outside'),false);
 assert.equal(audioFileError({type:'audio/mpeg',size:1000,name:'a.mp3'}),'');
 assert.match(audioFileError({type:'video/mp4',size:1000,name:'a.mp4'}),/MP3/);
 assert.match(audioFileError({type:'audio/mpeg',size:21000000,name:'a.mp3'}),/20 MB/);
 assert.match(audioFileError({type:'audio/mpeg',size:200,name:'a.exe'}),/extension/);
 assert.equal(audioMagicMatches('audio/mpeg',Uint8Array.from([73,68,51])),true);
 assert.equal(audioMagicMatches('audio/ogg',Uint8Array.from([79,103,103,83])),true);
 assert.equal(audioMagicMatches('audio/wav',Uint8Array.from([82,73,70,70,0,0,0,0,87,65,86,69])),true);
 assert.equal(audioMagicMatches('audio/webm',Uint8Array.from([26,69,223,163])),true);
 assert.equal(audioMagicMatches('audio/wav',Uint8Array.from([79,103,103,83])),false);
 assert.equal(audioTrackPath('campaign','sound','audio/mpeg'),'campaigns/campaign/audioTracks/sound/audio.mp3');
 assert.throws(()=>audioTrackPath('../campaign','sound','audio/mpeg'));
 assert.throws(()=>audioUploadDetails({...details,fileName:'../storm.mp3'}));
});
test('No server action allows injected fields or unknown audio categories',()=>{
 assert.deepEqual(audioSettings(settings),settings);
 assert.deepEqual(audioUploadDetails(details),details);
 assert.throws(()=>audioSettings({...settings,visibility:'players'}));
 assert.throws(()=>audioSettings({...settings,volume:101}));
 assert.throws(()=>validateAudioAction({...reserve,createdBy:'attacker'}));
 assert.throws(()=>validateAudioAction({type:'play-ambient',trackId:'../../secret',expectedLiveRevision:0}));
 assert.throws(()=>validateAudioAction({type:'pause-ambient',expectedLiveRevision:-1}));
 assert.equal(validateAudioAction({type:'play-effect',trackId:'effect',expectedLiveRevision:0}),'play-effect');
 assert.equal(ambientOffsetSeconds({status:'playing',positionMs:2000,startedAt:1000},5000),6);
 assert.equal(ambientOffsetSeconds({status:'paused',positionMs:2000,startedAt:1000},5000),2);
 assert.equal(audioLibraryRows([{status:'archived'},{id:'live',category:'ambient',name:'Altarin'}]).length,1);
});
test('Private upload staging, explicit publication, and strictly public projection',async()=>{
 const h=harness();
 const first=await h.run(reserve);
 assert.equal(first.ok,true,first.error);
 assert.equal(h.store.get(trackPath).status,'uploading');
 assert.equal(h.store.has(sharedPath),false);
 assert.equal((await h.run({type:'publish-track',id:'storm',expectedRevision:1})).ok,false);
 assert.equal((await h.run({type:'finish-track',id:'storm',expectedRevision:1})).ok,true);
 const published=await h.run({type:'publish-track',id:'storm',expectedRevision:2});
 assert.equal(published.ok,true,published.error);
 const publicRow=h.store.get(sharedPath);
 assert.equal(publicRow.visibility,'players');
 assert.equal(publicRow.createdBy,undefined);
 assert.equal(publicRow.fileName,undefined);
 assert.equal(JSON.stringify(publicRow).includes('gm'),false);
 assert.throws(()=>audioPublicTrack({...publicRow,status:'uploading'}));
 assert.equal((await h.run({type:'publish-track',id:'storm',expectedRevision:2})).ok,false);
 const edited=await h.run({type:'update-track',id:'storm',expectedRevision:3,settings:{...settings,volume:40}});
 assert.equal(edited.ok,true,edited.error);
 assert.equal(h.store.get(sharedPath).volume,40);
 const withdrawn=await h.run({type:'unpublish-track',id:'storm',expectedRevision:4});
 assert.equal(withdrawn.ok,true,withdrawn.error);
 assert.equal(h.store.has(sharedPath),false);
});
test('Live transport enforces published track type and optimistic revisions',async()=>{
 const h=harness();
 await h.run(reserve);
 await h.run({type:'finish-track',id:'storm',expectedRevision:1});
 await h.run({type:'publish-track',id:'storm',expectedRevision:2});
 const start=await h.run({type:'play-ambient',trackId:'storm',expectedLiveRevision:0});
 assert.equal(start.ok,true,start.error);
 assert.equal(h.store.get('campaigns/campaign-one/audioLive/current').ambient.trackId,'storm');
 assert.equal((await h.run({type:'play-ambient',trackId:'storm',expectedLiveRevision:0})).ok,false);
 h.tick(3500);
 assert.equal((await h.run({type:'pause-ambient',expectedLiveRevision:1})).ok,true);
 assert.equal(h.store.get('campaigns/campaign-one/audioLive/current').ambient.positionMs,3500);
 assert.equal((await h.run({type:'resume-ambient',expectedLiveRevision:2})).ok,true);
 assert.equal((await h.run({type:'stop-ambient',expectedLiveRevision:3})).ok,true);
 assert.equal(h.store.get('campaigns/campaign-one/audioLive/current').ambient,null);
 const effectDetails={...details,name:'Thunder',category:'effect',loop:false,fileName:'thunder.mp3'};
 assert.equal((await h.run({type:'reserve-track',id:'thunder',details:effectDetails})).ok,true);
 assert.equal((await h.run({type:'finish-track',id:'thunder',expectedRevision:1})).ok,true);
 assert.equal((await h.run({type:'publish-track',id:'thunder',expectedRevision:2})).ok,true);
 assert.equal((await h.run({type:'play-ambient',trackId:'thunder',expectedLiveRevision:4})).ok,false);
 assert.equal((await h.run({type:'play-effect',trackId:'thunder',expectedLiveRevision:4})).ok,true);
 assert.equal(h.store.get('campaigns/campaign-one/audioLive/current').effect.cueId,'5');
});
test('Withdrawal and archival remove public data and active cues immediately',async()=>{
 const h=harness();
 await h.run(reserve);
 await h.run({type:'finish-track',id:'storm',expectedRevision:1});
 await h.run({type:'publish-track',id:'storm',expectedRevision:2});
 await h.run({type:'play-ambient',trackId:'storm',expectedLiveRevision:0});
 const stop=await h.run({type:'unpublish-track',id:'storm',expectedRevision:3});
 assert.equal(stop.ok,true,stop.error);
 assert.equal(h.store.has(sharedPath),false);
 assert.equal(h.store.get('campaigns/campaign-one/audioLive/current').ambient,null);
 const retired=await h.run({type:'archive-track',id:'storm',expectedRevision:4});
 assert.equal(retired.ok,true,retired.error);
 assert.equal(h.store.get(trackPath).status,'archived');
 assert.equal(h.store.get('campaigns/campaign-one/audioConfig/current').activeTracks,0);
 assert.equal((await h.run({type:'play-ambient',trackId:'storm',expectedLiveRevision:2})).ok,false);
 assert.equal(h.writes.some(([_,path])=>path.includes('characters/')||path.includes('sessionPdfs/')),false);
});
test('Non-GM mutation attempts are denied before campaign-private reads',async()=>{
 const h=harness(true);
 const refused=await h.run(reserve);
 assert.equal(refused.ok,false);
 assert.match(refused.error,/GM only/);
 assert.equal(h.reads.length,0);
 assert.equal(h.writes.length,0);
});
test('GM and player dashboard, backend command and media permissions are connected',()=>{
 const source=['src/dashboards/GMDashboard.jsx','src/dashboards/CharacterDashboard.jsx',
  'src/dashboards/CampaignSoundboardWorkspace.jsx','src/state/gmToolkitModel.mjs',
  'functions/commands.mjs','functions/handler.mjs',
  'src/firebase/asteriaFirebaseService.js','js/firebase-auth.js',
  'firestore.rules','storage.rules'].map(read).join('\n');
 for(const expected of ['GMCampaignSoundboard','PlayerCampaignAmbience','manageCampaignAudio',
  'subscribeCampaignAudioLive','audioTracksShared','audioLive','audioTrackPath','getBlob'])
  assert.ok(source.includes(expected),'Missing '+expected);
 assert.match(read('src/dashboards/CampaignSoundboardWorkspace.jsx'),/Enable Audio On This Device/);
 assert.match(read('storage.rules'),/20 \* 1024 \* 1024/);
});
