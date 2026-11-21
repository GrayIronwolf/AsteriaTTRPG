import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails}
  from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc}
  from 'firebase/firestore';

const campaign='audience-phase7',base='campaigns/'+campaign;
const scene=base+'/presentationShared/current';
const restricted=base+'/presentationRestricted/current';
const session=base+'/hybridSessionControl/current';
const grant=base+'/hybridViewerGrants/guest7';
const reveal=(scope,uid)=>base+'/presentationAudienceReveals/'+scope+'_'+uid;
const now=Date.now(),epoch='audience-epoch7';
let env;
const db=uid=>uid?env.authenticatedContext(uid).firestore():
  env.unauthenticatedContext().firestore();
const patch=(path,changes)=>env.withSecurityRulesDisabled(async ctx=>
  updateDoc(doc(ctx.firestore(),path),changes));
before(async()=>{
  env=await initializeTestEnvironment({
    projectId:'demo-asteria-audience7',
    firestore:{rules:readFileSync('firestore.rules','utf8')}
  });
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,base),{ownerUid:'gm7',membershipSchemaVersion:2});
    for(const uid of ['alice7','bob7']){
      await setDoc(doc(admin,base+'/members/'+uid),{
        uid,campaignId:campaign,role:'player',status:'active'
      });
    }
    await setDoc(doc(admin,scene),{version:1,revision:3,scene:'title',
      title:'Public scene',theme:'obsidian'});
    await setDoc(doc(admin,session),{revision:3,status:'open',epoch,
      expiresAt:new Date(now+600000)});
    await setDoc(doc(admin,grant),{uid:'guest7',revision:2,status:'active',
      epoch,expiresAt:new Date(now+500000)});
    await setDoc(doc(admin,restricted),{version:1,revision:3,scene:'title',
      title:'Approved view',theme:'obsidian',epoch});
    for(const uid of ['alice7','bob7']){
      await setDoc(doc(admin,reveal('member',uid)),{
        targetUid:uid,audience:'member',sceneRevision:3,
        title:'Personal clue',body:'Clue for '+uid
      });
    }
    await setDoc(doc(admin,reveal('restricted','guest7')),{
      targetUid:'guest7',audience:'restricted',sceneRevision:3,
      sessionEpoch:epoch,title:'Guest clue',body:'Visible to guest only'
    });
  });
});
test('Phase 7: each active campaign player gets only their own reveal',async()=>{
  const alice=db('alice7'),bob=db('bob7');
  await assertSucceeds(getDoc(doc(alice,reveal('member','alice7'))));
  await assertSucceeds(getDoc(doc(bob,reveal('member','bob7'))));
  await assertFails(getDoc(doc(alice,reveal('member','bob7'))));
  await assertFails(getDoc(doc(bob,reveal('member','alice7'))));
  await assertFails(getDoc(doc(alice,reveal('restricted','guest7'))));
  await assertFails(getDocs(collection(alice,base+'/presentationAudienceReveals')));
  await assertFails(getDoc(doc(db('outsider7'),reveal('member','alice7'))));
  await assertFails(getDoc(doc(db(null),reveal('member','alice7'))));
});
test('Phase 7: restricted invitee never reads player reveals or GM list',async()=>{
  const guest=db('guest7');
  await assertSucceeds(getDoc(doc(guest,reveal('restricted','guest7'))));
  await assertFails(getDoc(doc(guest,reveal('member','alice7'))));
  await assertFails(getDocs(collection(guest,base+'/presentationAudienceReveals')));
  await assertFails(getDoc(doc(db('outsider7'),reveal('restricted','guest7'))));
  await assertSucceeds(getDocs(collection(db('gm7'),base+'/presentationAudienceReveals')));
});
test('Phase 7: scene changes and blackout invalidate current reveal permissions',async()=>{
  await patch(scene,{revision:4,title:'Next scene'});
  await assertFails(getDoc(doc(db('alice7'),reveal('member','alice7'))));
  await patch(scene,{revision:3,scene:'blank'});
  await assertFails(getDoc(doc(db('alice7'),reveal('member','alice7'))));
  await patch(restricted,{revision:4});
  await assertFails(getDoc(doc(db('guest7'),reveal('restricted','guest7'))));
});
test('Phase 7: invitee revocation, epoch rotation and expiry invalidate reveal',async()=>{
  await patch(grant,{status:'revoked'});
  await assertFails(getDoc(doc(db('guest7'),reveal('restricted','guest7'))));
  await patch(grant,{status:'active'});
  await patch(session,{epoch:'new-epoch7'});
  await assertFails(getDoc(doc(db('guest7'),reveal('restricted','guest7'))));
  await patch(session,{epoch});
  await patch(grant,{expiresAt:new Date(now-1000)});
  await assertFails(getDoc(doc(db('guest7'),reveal('restricted','guest7'))));
});
test('Phase 7: member deactivation invalidates reveal and client writes always fail',async()=>{
  await patch(base+'/members/alice7',{status:'blocked'});
  await assertFails(getDoc(doc(db('alice7'),reveal('member','alice7'))));
  for(const uid of ['gm7','alice7','guest7','outsider7']){
    const client=db(uid);
    await assertFails(setDoc(doc(client,reveal('member','alice7')),{
      audience:'member',targetUid:'alice7',title:'Forged'
    }));
    await assertFails(updateDoc(doc(client,reveal('member','alice7')),{title:'Forged'}));
    await assertFails(deleteDoc(doc(client,reveal('restricted','guest7'))));
  }
});
