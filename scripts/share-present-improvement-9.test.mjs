import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  screenShareConnectionId,screenShareVideoSdp,
  validateGMScreenShareAction,validateViewerScreenShareAction,
  screenShareDeadline,screenShareSignalCanRead
} from '../src/state/presentationScreenShareModel.mjs';
import {createPresentationScreenShareCommands}
  from '../functions/presentationScreenShareCommands.mjs';
import {respondPresentationScreenShare}
  from '../functions/presentationScreenShareResponse.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const offer='v=0\r\n'+'o=- 123456 2 IN IP4 0.0.0.0\r\n'+
  's=-\r\nt=0 0\r\na=group:BUNDLE 0\r\n'+
  'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n'+
  'c=IN IP4 0.0.0.0\r\na=mid:0\r\n'+
  'a=sendonly\r\na=rtpmap:96 VP8/90000\r\n'+
  'a=ice-ufrag:abc123\r\na=ice-pwd:abcdefghijk123456789\r\n';
const uid='remote9',campaign='campaign9',path='campaigns/'+campaign+'/';
const conn='session9abc1234567890';
const now=Date.now();
function harness(gmAllowed=true){
  const docs=new Map([
    [path,{ownerUid:'gm9'}],
    [path+'hybridSessionControl/current',{
      status:'open',epoch:'epoch9',revision:1,
      expiresAt:new Date(now+50*60000),screenShare:null
    }],
    [path+'hybridViewerGrants/'+uid,{
      uid,status:'active',epoch:'epoch9',
      expiresAt:new Date(now+40*60000),revision:2
    }]
  ]);
  const mutations=[];
  const doc=(_db,...parts)=>parts.join('/');
  const tx={
    get:async p=>({exists:()=>docs.has(p),data:()=>docs.get(p)}),
    set:(p,v)=>{mutations.push({op:'set',p});docs.set(p,v);},
    update:(p,v)=>{mutations.push({op:'update',p});
      docs.set(p,{...docs.get(p),...v});}
  };
  const db={
    doc:p=>p,runTransaction:async run=>run(tx)
  };
  const context={
    db,doc,runTransaction:async(_db,run)=>run(tx),
    currentUser:{uid:'gm9'},serverTimestamp:()=>new Date()
  };
  const action=createPresentationScreenShareCommands(context,{
    requireCampaignGM:async()=>{if(!gmAllowed)throw Error('Not a campaign GM.');}
  }).managePresentationScreenShare;
  return {
    docs,mutations,action:a=>action(campaign,'gm-scope',a),
    viewer:(who,a)=>respondPresentationScreenShare(db,who,{
      args:[campaign,'viewer-scope',a]
    },()=>new Date())
  };
}
const gmOffer=()=>({type:'offer',viewerUid:uid,
  connectionId:conn,sdp:offer});
test('Phase 9: SDP excludes audio, arbitrary fields and unbounded payload',()=>{
  assert.ok(screenShareVideoSdp(offer));
  assert.equal(screenShareConnectionId(conn),true);
  for(const s of [offer+'m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',
    'malformed SDP',offer+'x'.repeat(20000)])
    assert.throws(()=>screenShareVideoSdp(s));
  assert.throws(()=>validateGMScreenShareAction({...gmOffer(),extra:true}));
  assert.throws(()=>validateGMScreenShareAction({...gmOffer(),viewerUid:'../secret'}));
  assert.throws(()=>validateViewerScreenShareAction({
    type:'answer',connectionId:conn,sdp:offer,uid:'other'
  }));
});
test('Phase 9: GM offer checks accepted grant and enforces single viewer pointer',async()=>{
  const h=harness();
  const result=await h.action(gmOffer());
  assert.equal(result.ok,true,result.error);
  const session=h.docs.get(path+'hybridSessionControl/current');
  const record=h.docs.get(path+'presentationScreenShares/'+uid);
  assert.equal(session.screenShare.viewerUid,uid);
  assert.equal(session.screenShare.connectionId,conn);
  assert.equal(record.status,'offered');
  assert.equal(record.answerSdp,'');
  assert.equal(record.epoch,'epoch9');
  assert.ok(record.expiresAt.getTime()<=now+20*60000+2000);
  assert.equal(screenShareSignalCanRead(
    session,h.docs.get(path+'hybridViewerGrants/'+uid),record,uid),true);
  const duplicate=await h.action({...gmOffer(),connectionId:'anotherConn1234567890'});
  assert.equal(duplicate.ok,false);
  assert.equal(h.mutations.filter(x=>x.p.includes('presentationScreenShares')).length,1);
});
test('Phase 9: only exact viewer can answer once, stale answers rejected',async()=>{
  const h=harness();await h.action(gmOffer());
  await assert.rejects(h.viewer('outsider9',{type:'answer',
    connectionId:conn,sdp:offer}),/no longer active/);
  const result=await h.viewer(uid,{type:'answer',connectionId:conn,sdp:offer});
  assert.equal(result.ok,true);
  assert.equal(h.docs.get(path+'presentationScreenShares/'+uid).status,'answered');
  await assert.rejects(h.viewer(uid,{type:'answer',connectionId:conn,sdp:offer}),
    /already answered/);
  await assert.rejects(h.viewer(uid,{type:'answer',
    connectionId:'stale123456789012345',sdp:offer}),/no longer active/);
});
test('Phase 9: viewer departure and stale GM stop never clear newer connections',async()=>{
  const h=harness();await h.action(gmOffer());
  await h.viewer(uid,{type:'leave',connectionId:conn});
  assert.equal(h.docs.get(path+'hybridSessionControl/current').screenShare,null);
  assert.equal(h.docs.get(path+'presentationScreenShares/'+uid).status,'stopped');
  const stale=await h.action({type:'stop',viewerUid:uid,
    connectionId:'stale123456789012345'});
  assert.equal(stale.ok,true);
  assert.equal(stale.status,'already-stopped');
  assert.equal((await h.action({...gmOffer(),
    connectionId:'anotherConn1234567890'})).ok,true);
  await h.action({type:'stop',viewerUid:uid,connectionId:conn});
  assert.equal(h.docs.get(path+'hybridSessionControl/current').screenShare.connectionId,
    'anotherConn1234567890');
});
test('Phase 9: GM/revoked/expired session security fails closed',async()=>{
  const bad=harness(false);
  assert.equal((await bad.action(gmOffer())).ok,false);
  const h=harness();
  h.docs.set(path+'hybridViewerGrants/'+uid,{
    ...h.docs.get(path+'hybridViewerGrants/'+uid),status:'revoked'
  });
  assert.equal((await h.action(gmOffer())).ok,false);
  h.docs.set(path+'hybridViewerGrants/'+uid,{
    ...h.docs.get(path+'hybridViewerGrants/'+uid),status:'active'
  });
  await h.action(gmOffer());
  h.docs.set(path+'hybridSessionControl/current',{
    ...h.docs.get(path+'hybridSessionControl/current'),status:'closed'
  });
  await assert.rejects(h.viewer(uid,{type:'answer',connectionId:conn,sdp:offer}),
    /expired/);
});
test('Phase 9: bounded session and grant deadline, recipient mismatch',()=>{
  const session={status:'open',epoch:'epoch9',expiresAt:new Date(now+300000)};
  const grant={uid,status:'active',epoch:'epoch9',expiresAt:new Date(now+240000)};
  assert.equal(screenShareDeadline(session,grant,now),now+240000);
  const sig={status:'offered',connectionId:conn,viewerUid:uid,
    epoch:'epoch9',expiresAt:new Date(now+200000)};
  assert.equal(screenShareSignalCanRead(session,grant,sig,uid,now),true);
  assert.equal(screenShareSignalCanRead(session,grant,sig,'not-me',now),false);
  assert.equal(screenShareSignalCanRead(session,grant,{
    ...sig,epoch:'previous'
  },uid,now),false);
});
test('Phase 9: no public scene writes, audio or auto-capture',()=>{
  const server=read('functions/presentationScreenShareCommands.mjs');
  const viewer=read('functions/presentationScreenShareResponse.mjs');
  const rules=read('firestore.rules');
  const controller=read('frontend/src/dashboard/GMScreenCaptureControls.jsx');
  const gm=read('frontend/src/dashboard/GMScreenShareControls.jsx');
  const receiver=read('frontend/src/dashboard/ViewerScreenShareControls.jsx');
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  assert.match(rules,/match \/presentationScreenShares\/\{viewerUid\}/);
  assert.match(rules,/allow create, update, delete: if false/);
  assert.match(server,/requireCampaignGM\(tx,campaignId\)/);
  assert.match(viewer,/uid,data,serverTimestamp/);
  assert.match(gm,/getDisplayMedia\(\{video:true,audio:false\}\)/);
  assert.match(gm,/Share Selected Screen/);
  assert.match(receiver,/Join Live Screen/);
  assert.match(controller,/remoteStop\.current\?\.\(\)/);
  assert.match(controller,/emergencyStopPresentation\(campaignId\)/);
  assert.match(service,/watchViewerScreenShare/);
  assert.doesNotMatch(server,/presentationShared|presentationRestricted|presentationAssetAccess/);
  assert.doesNotMatch(gm,/getUserMedia\(|audio:true|MediaRecorder/);
});
