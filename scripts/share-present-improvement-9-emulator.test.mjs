import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds}
  from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc}
  from 'firebase/firestore';

const campaign='webrtc-improvement9',base='campaigns/'+campaign;
const session=base+'/hybridSessionControl/current';
const grant=uid=>base+'/hybridViewerGrants/'+uid;
const signal=uid=>base+'/presentationScreenShares/'+uid;
const epoch='rtc-epoch9',id='connectionABC9876543210';
const now=Date.now();
let env;
const db=uid=>uid?env.authenticatedContext(uid).firestore():
  env.unauthenticatedContext().firestore();
const patch=(path,value)=>env.withSecurityRulesDisabled(async ctx=>
  updateDoc(doc(ctx.firestore(),path),value));
before(async()=>{
  env=await initializeTestEnvironment({
    projectId:'demo-asteria-webrtc9',
    firestore:{rules:readFileSync('firestore.rules','utf8')}
  });
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,base),{
      ownerUid:'gm9',membershipSchemaVersion:2
    });
    await setDoc(doc(admin,session),{
      status:'open',epoch,revision:1,
      screenShare:{viewerUid:'invitee9',connectionId:id},
      expiresAt:new Date(now+600000)
    });
    for(const uid of ['invitee9','other9','pending9']){
      await setDoc(doc(admin,grant(uid)),{
        uid,epoch,status:uid==='pending9'?'pending':'active',
        expiresAt:new Date(now+500000)
      });
    }
    await setDoc(doc(admin,signal('invitee9')),{
      version:1,status:'offered',viewerUid:'invitee9',
      connectionId:id,epoch,expiresAt:new Date(now+300000),
      offerSdp:'PRIVATE_SIGNALLING_ONLY',answerSdp:''
    });
  });
});
test('Phase 9: selected invitee reads only matching signal',async()=>{
  await assertSucceeds(getDoc(doc(db('gm9'),signal('invitee9'))));
  await assertSucceeds(getDoc(doc(db('invitee9'),signal('invitee9'))));
  for(const who of ['other9','pending9','outsider9',null]){
    await assertFails(getDoc(doc(db(who),signal('invitee9'))));
  }
  await assertFails(getDocs(collection(db('invitee9'),
    base+'/presentationScreenShares')));
});
test('Phase 9: revoked, expired or rotated session hides even previous SDP',async()=>{
  await patch(grant('invitee9'),{status:'revoked'});
  await assertFails(getDoc(doc(db('invitee9'),signal('invitee9'))));
  await patch(grant('invitee9'),{status:'active'});
  await patch(session,{epoch:'rotated'});
  await assertFails(getDoc(doc(db('invitee9'),signal('invitee9'))));
  await patch(session,{epoch,screenShare:null});
  await assertFails(getDoc(doc(db('invitee9'),signal('invitee9'))));
  await patch(session,{screenShare:{viewerUid:'invitee9',connectionId:id},
    expiresAt:new Date(now-1000)});
  await assertFails(getDoc(doc(db('invitee9'),signal('invitee9'))));
});
test('Phase 9: all clients, including GM, are forbidden to write SDP',async()=>{
  for(const who of ['gm9','invitee9','other9',null]){
    const client=db(who);
    await assertFails(updateDoc(doc(client,signal('invitee9')),{status:'answered'}));
    await assertFails(setDoc(doc(client,signal('fake9')),{status:'offered'}));
    await assertFails(deleteDoc(doc(client,signal('invitee9'))));
  }
});
