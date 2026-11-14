import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 RECORDING_MAX_BYTES,RECORDING_MAX_SECONDS,RECORDING_CAMPAIGN_BUDGET_BYTES,
 recordingFileError,recordingMagicMatches,recordingMetadata,recordingSummary,
 recordingPath,recordingSupportedMime,recordingNoticeActive,publicRecordingArchive,
 recordingArchiveRows,validateRecordingAction,validateRecordingConsent
} from '../src/state/sessionRecordingModel.mjs';
import {createSessionRecordingCommands} from '../functions/sessionRecordingCommands.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const details={title:'Session One',summary:'Altarin recap',sessionId:'session-one',
 requestId:'consent-one',durationSeconds:15,size:5000,contentType:'audio/webm'};
const campaignId='camp-one',path='campaigns/'+campaignId+'/';
function harness(options={}){
 const store=new Map(),reads=[],writes=[];
 const doc=(_db,...parts)=>({path:parts.join('/')});
 const collection=(_db,...parts)=>({path:parts.join('/'),
  where:()=>({path:parts.join('/'),_query:true})});
 let now=100000;
 store.set(path+'liveSession/current',{id:'session-one',status:'active'});
 store.set(path,{id:campaignId,ownerUid:'gm',membershipSchemaVersion:2});
 store.set(path.slice(0,-1),{id:campaignId,ownerUid:'gm',membershipSchemaVersion:2});
 const users=options.users||['alice','bob'];
 for(const uid of users)store.set(path+'members/'+uid,{uid,campaignId,role:'player',status:'active'});
 const uid=options.uid||'gm',isGM=uid==='gm';
 const get=async ref=>{
  reads.push(ref.path);
  if(ref._query)return {docs:users.filter(u=>store.get(path+'members/'+u)?.status==='active').map(u=>({
   data:()=>store.get(path+'members/'+u)
  }))};
  const value=store.get(ref.path);
  return {exists:()=>value!==undefined,data:()=>value};
 };
 const tx={
  get,set:(ref,value,opts)=>{writes.push(['set',ref.path]);
   store.set(ref.path,opts?.merge?{...store.get(ref.path),...value}:value);},
  update:(ref,patch)=>{writes.push(['update',ref.path]);store.set(ref.path,{...store.get(ref.path),...patch});},
  delete:ref=>{writes.push(['delete',ref.path]);store.delete(ref.path);}
 };
 const context={db:{doc:p=>({path:p})},doc,collection,currentUser:{uid},
  runTransaction:async(_db,callback)=>callback(tx),serverTimestamp:()=>222,now:()=>now};
 const cmd=createSessionRecordingCommands(context,{requireCampaignGM:async(_tx,id)=>{
  if(!isGM)throw Error('GM only');
  return store.get(path);
 }});
 return {store,reads,writes,now:amount=>{now+=amount;},
  run:action=>cmd.manageSessionRecording(campaignId,'gm-scope',action),
  respond:action=>cmd.respondRecordingConsent(campaignId,'member-scope',action)};
}
const request={type:'request-consent',requestId:'consent-one',sessionId:'session-one',
 mode:'microphone',expectedRevision:0};
test('Audio formats, quota, names and duration limits reject dangerous input',()=>{
 assert.deepEqual(recordingMetadata(details),details);
 assert.deepEqual(recordingSummary({title:'Next',summary:'Text'}),{title:'Next',summary:'Text'});
 assert.equal(recordingFileError({type:'audio/webm',name:'a.webm',size:1000}),'');
 assert.match(recordingFileError({type:'audio/mp3',name:'a.mp3',size:1000}),/format/);
 assert.match(recordingFileError({type:'audio/webm',name:'a.webm',size:RECORDING_MAX_BYTES+1}),/40 MB/);
 assert.throws(()=>recordingMetadata({...details,durationSeconds:RECORDING_MAX_SECONDS+1}));
 assert.throws(()=>recordingMetadata({...details,size:0}));
 assert.throws(()=>recordingMetadata({...details,unexpected:'GM bypass'}));
 assert.throws(()=>recordingPath('../camp','rec','audio/webm'));
 assert.equal(recordingPath('camp','clip','audio/webm'),'campaigns/camp/sessionRecordings/clip/recording.webm');
 assert.equal(recordingMagicMatches('audio/webm',Uint8Array.from([26,69,223,163])),true);
 assert.equal(recordingMagicMatches('audio/ogg',Uint8Array.from([79,103,103,83])),true);
 assert.equal(recordingMagicMatches('audio/mp4',Uint8Array.from([0,0,0,0,102,116,121,112])),true);
 assert.equal(recordingMagicMatches('audio/webm',Uint8Array.from([0,0,0,0])),false);
 assert.equal(recordingSupportedMime({isTypeSupported:m=>m==='audio/webm;codecs=opus'}),'audio/webm;codecs=opus');
 assert.equal(recordingSupportedMime(null),'');
 assert.equal(recordingNoticeActive({status:'recording',expiresAt:5000},4000),true);
 assert.equal(recordingNoticeActive({status:'recording',expiresAt:5000},6000),false);
 assert.equal(RECORDING_CAMPAIGN_BUDGET_BYTES,250*1024*1024);
});
test('Unsupported client fields and forged consent are rejected',()=>{
 assert.equal(validateRecordingAction(request),'request-consent');
 assert.throws(()=>validateRecordingAction({...request,participants:['victim']}));
 assert.throws(()=>validateRecordingAction({type:'publish-archive',id:'a',expectedRevision:0}));
 assert.throws(()=>validateRecordingAction({type:'stop-recording',requestId:'x',expectedRevision:-1}));
 assert.throws(()=>validateRecordingConsent({requestId:'x',decision:'maybe'}));
 assert.throws(()=>validateRecordingConsent({requestId:'x',decision:'agree',forUid:'another'}));
});
test('Recording requires active session, new request ID and unexpired live status',async()=>{
 const h=harness();
 const created=await h.run(request);
 assert.equal(created.ok,true,created.error);
 const control=h.store.get(path+'recordingControl/current');
 assert.deepEqual(control.participants,['alice','bob']);
 assert.equal(h.store.get(path+'recordingNotice/current').status,'consent');
 assert.equal((await h.run({...request,expectedRevision:1})).ok,false);
 assert.equal((await h.run({type:'start-recording',requestId:'consent-one',expectedRevision:1})).ok,false);
 h.store.set(path+'liveSession/current',{id:'session-one',status:'idle'});
 assert.equal((await h.run({type:'start-recording',requestId:'consent-one',expectedRevision:1})).ok,false);
});
test('Changing membership invalidates unanimous consent; declining blocks capture',async()=>{
 const h=harness();
 await h.run(request);
 h.store.set(path+'recordingConsents/alice',{uid:'alice',requestId:'consent-one',decision:'agree'});
 h.store.set(path+'recordingConsents/bob',{uid:'bob',requestId:'consent-one',decision:'decline'});
 const denied=await h.run({type:'start-recording',requestId:'consent-one',expectedRevision:1});
 assert.equal(denied.ok,false);
 assert.match(denied.error,/explicitly agree/);
 h.store.set(path+'recordingConsents/bob',{uid:'bob',requestId:'consent-one',decision:'agree'});
 h.store.set(path+'members/bob',{...h.store.get(path+'members/bob'),status:'inactive'});
 assert.equal((await h.run({type:'start-recording',requestId:'consent-one',expectedRevision:1})).ok,false);
});
test('All participant consents allow start, stop and private archive only after completion',async()=>{
 const h=harness();
 assert.equal((await h.run(request)).ok,true);
 h.store.set(path+'recordingConsents/alice',{uid:'alice',requestId:'consent-one',decision:'agree'});
 h.store.set(path+'recordingConsents/bob',{uid:'bob',requestId:'consent-one',decision:'agree'});
 const begun=await h.run({type:'start-recording',requestId:'consent-one',expectedRevision:1});
 assert.equal(begun.ok,true,begun.error);
 assert.equal(h.store.get(path+'recordingNotice/current').status,'recording');
 assert.equal((await h.run({type:'reserve-archive',id:'clip-one',details})).ok,false);
 h.now(20000);
 const stopped=await h.run({type:'stop-recording',requestId:'consent-one',expectedRevision:2});
 assert.equal(stopped.ok,true,stopped.error);
 assert.equal(h.store.get(path+'recordingNotice/current').status,'idle');
 const reserved=await h.run({type:'reserve-archive',id:'clip-one',details});
 assert.equal(reserved.ok,true,reserved.error);
 assert.equal(h.store.get(path+'recordingArchives/clip-one').visibility,'gm');
 assert.equal((await h.run({type:'publish-archive',id:'clip-one',expectedRevision:1})).ok,false);
 assert.equal((await h.run({type:'finish-archive',id:'clip-one',expectedRevision:1})).ok,true);
 const published=await h.run({type:'publish-archive',id:'clip-one',expectedRevision:2});
 assert.equal(published.ok,true,published.error);
 const safe=h.store.get(path+'recordingArchivesShared/clip-one');
 assert.equal(safe.title,'Session One');
 assert.equal(JSON.stringify(safe).includes('createdBy'),false);
 assert.equal(JSON.stringify(safe).includes('actorUid'),false);
 assert.throws(()=>publicRecordingArchive({...safe,visibility:'gm'}));
 const edited=await h.run({type:'update-archive',id:'clip-one',expectedRevision:3,
  details:{title:'Edited',summary:'Published recap'}});
 assert.equal(edited.ok,true,edited.error);
 assert.equal(h.store.get(path+'recordingArchivesShared/clip-one').summary,'Published recap');
 assert.equal((await h.run({type:'update-archive',id:'clip-one',expectedRevision:3,
  details:{title:'Bad',summary:''}})).ok,false);
 assert.equal((await h.run({type:'unpublish-archive',id:'clip-one',expectedRevision:4})).ok,true);
 assert.equal(h.store.has(path+'recordingArchivesShared/clip-one'),false);
 assert.equal((await h.run({type:'archive-archive',id:'clip-one',expectedRevision:5})).ok,true);
 assert.equal(h.store.get(path+'recordingQuota/current').activeArchives,0);
 assert.equal(h.store.get(path+'recordingQuota/current').reservedBytes,0);
 assert.equal(recordingArchiveRows([{id:'archived',status:'archived'},safe]).length,1);
});
test('Member responses validate identity and active consent request',async()=>{
 const h=harness({uid:'alice'});
 const blocked=await h.respond({requestId:'nope',decision:'agree'});
 assert.equal(blocked.ok,false);
 assert.equal(h.writes.length,0);
 const gm=harness();
 await gm.run(request);
 const alice=harness({uid:'alice'});
 for(const suffix of ['recordingControl/current','recordingNotice/current']){
  alice.store.set(path+suffix,gm.store.get(path+suffix));
 }
 const yes=await alice.respond({requestId:'consent-one',decision:'agree'});
 assert.equal(yes.ok,true,yes.error);
 assert.equal(alice.store.get(path+'recordingConsents/alice').decision,'agree');
});
test('Non-GM cannot control recording or archive writes',async()=>{
 const h=harness({uid:'alice'});
 const answer=await h.run(request);
 assert.equal(answer.ok,false);
 assert.equal(h.writes.length,0);
});
test('Consent and archive UI are connected to both dashboards and secure callable',()=>{
 const code=['src/dashboards/GMDashboard.jsx','src/dashboards/CharacterDashboard.jsx',
  'src/dashboards/SessionRecordingWorkspace.jsx','src/firebase/asteriaFirebaseService.js',
  'js/firebase-auth.js','functions/commands.mjs','functions/handler.mjs',
  'firestore.rules','storage.rules'].map(read).join('\n');
 for(const token of ['GMSessionRecordingWorkspace','PlayerRecordingNotice','manageSessionRecording',
  'respondRecordingConsent','recordingArchivesShared','recordingNotice','recordingPath',
  'getDisplayMedia','getUserMedia','MediaRecorder'])assert.ok(code.includes(token),token);
 assert.match(read('src/dashboards/CharacterDashboard.jsx'),/PlayerRecordingNotice/);
});
