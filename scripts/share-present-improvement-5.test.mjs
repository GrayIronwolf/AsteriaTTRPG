import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHybridPresentationSessionCommands}
  from '../functions/hybridPresentationSessionCommands.mjs';
import {respondHybridPresentationInvitation}
  from '../functions/hybridInvitationResponse.mjs';
import {hybridInvitationStatus,validateHybridInvitationResponse}
  from '../src/state/hybridInvitationModel.mjs';
import {hybridViewerCanRead}
  from '../src/state/hybridPresentationSessionModel.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const campaign='invite5',root='campaigns/'+campaign+'/';
function harness(){
  const store=new Map(),writes=[];
  const ref=(_db,...path)=>path.join('/');
  const get=async path=>({exists:store.has(path),data:()=>store.get(path)});
  const tx={
    get, set:(path,value)=>{writes.push(path);store.set(path,value);},
    update:(path,patch)=>{writes.push(path);store.set(path,{...store.get(path),...patch});}
  };
  const db={doc:path=>path,runTransaction:async callback=>callback(tx)};
  const context={db,doc:ref,runTransaction:(_db,cb)=>cb(tx),
    currentUser:{uid:'gm5'},requestId:'request5',serverTimestamp:()=>new Date()};
  const commands=createHybridPresentationSessionCommands(context,{
    requireCampaignGM:async()=>{}
  });
  const gm=action=>commands.manageHybridPresentationSession(campaign,'gm-scope',action);
  const respond=(uid,type,expectedGrantRevision=1)=>respondHybridPresentationInvitation(
    db,uid,{args:[campaign,'viewer-scope',{type,expectedGrantRevision}]},()=>new Date()
  );
  return {store,writes,gm,respond};
}
const get=(h,location)=>h.store.get(root+location);
async function open(h){const r=await h.gm({
  type:'open',expectedRevision:0,mode:'hybrid',durationMinutes:60
});assert.equal(r.ok,true,r.error);}
test('Phase 5: invites stay pending and cannot view the restricted presentation',async()=>{
  const h=harness();await open(h);
  const res=await h.gm({type:'invite',uid:'viewer5',expectedRevision:1,
    durationMinutes:30});
  assert.equal(res.ok,true,res.error);
  assert.equal(res.status,'pending');
  const session=get(h,'hybridSessionControl/current');
  const grant=get(h,'hybridViewerGrants/viewer5');
  const access=get(h,'presentationAssetAccess/current');
  assert.equal(grant.status,'pending');
  assert.equal(session.invitationCount,1);
  assert.equal(session.grantCount,0);
  assert.deepEqual(access.viewerExpiries,{});
  assert.equal(hybridViewerCanRead(session,grant,'viewer5'),false);
  assert.equal(hybridInvitationStatus(session,grant,'viewer5').status,'pending');
});
test('Phase 5: recipient acceptance updates only own grant and access atomically',async()=>{
  const h=harness();await open(h);
  await h.gm({type:'invite',uid:'viewer5',expectedRevision:1,durationMinutes:30});
  await assert.rejects(h.respond('other5','accept'),/unavailable/);
  const result=await h.respond('viewer5','accept');
  assert.equal(result.status,'accepted');
  const grant=get(h,'hybridViewerGrants/viewer5');
  const session=get(h,'hybridSessionControl/current');
  assert.equal(grant.status,'active');
  assert.equal(session.grantCount,1);
  assert.equal(session.invitationCount,1);
  assert.equal(hybridViewerCanRead(session,grant,'viewer5'),true);
  assert.equal(hybridInvitationStatus(session,grant,'viewer5').status,'accepted');
  assert.ok(get(h,'presentationAssetAccess/current').viewerExpiries.viewer5);
  await assert.rejects(h.respond('viewer5','accept'),/no longer pending/);
});
test('Phase 5: decline and GM revoke never activate recipient access',async()=>{
  const h=harness();await open(h);
  await h.gm({type:'invite',uid:'viewer5',expectedRevision:1,durationMinutes:30});
  const declined=await h.respond('viewer5','decline');
  assert.equal(declined.status,'declined');
  assert.equal(get(h,'hybridViewerGrants/viewer5').status,'declined');
  assert.equal(get(h,'presentationAssetAccess/current').viewerExpiries.viewer5,undefined);
  const renewal=await h.gm({type:'invite',uid:'viewer5',expectedRevision:3,durationMinutes:30});
  assert.equal(renewal.ok,true,renewal.error);
  const revocation=await h.gm({type:'revoke',uid:'viewer5',expectedRevision:4});
  assert.equal(revocation.ok,true,revocation.error);
  assert.equal(get(h,'hybridViewerGrants/viewer5').status,'revoked');
  assert.equal(get(h,'presentationAssetAccess/current').viewerExpiries.viewer5,undefined);
});
test('Phase 5: safe validation and invitation expiry are fail closed',()=>{
  assert.throws(()=>validateHybridInvitationResponse({type:'accept',expectedGrantRevision:0}));
  assert.throws(()=>validateHybridInvitationResponse({type:'accept',expectedGrantRevision:1,admin:true}));
  const now=Date.now(),session={status:'open',epoch:'epoch',expiresAt:new Date(now+60000)};
  const grant={uid:'viewer',status:'pending',epoch:'epoch',revision:1,
    expiresAt:new Date(now-100)};
  assert.equal(hybridInvitationStatus(session,grant,'viewer',now).status,'expired');
  assert.equal(hybridInvitationStatus(session,grant,'another',now).status,'unavailable');
});
test('Phase 5: pending UI and recipient callback never require campaign membership',()=>{
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const manager=read('frontend/src/dashboard/HybridSessionManager.jsx');
  const handler=read('functions/handler.mjs');
  const rules=read('firestore.rules');
  assert.match(service,/function watchOwnHybridInvitation/);
  assert.match(service,/getDocFromServer\(hybridGrantRef\(id,uid\)\)/);
  assert.match(service,/respondHybridInvitation/);
  assert.match(manager,/Create Pending Invitation/);
  assert.match(manager,/Accept Invitation/);
  assert.match(manager,/Decline Invitation/);
  assert.match(manager,/Copy Invitation Link/);
  assert.match(manager,/Close &amp; Revoke Session/);
  assert.match(handler,/if\(data.action==='respondHybridPresentationInvitation'\)/);
  assert.match(rules,/grant\.get\('status',''\) == 'active'/);
  assert.doesNotMatch(manager,/getDownloadURL\(|setDoc\(|updateDoc\(/);
});
