import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds}
  from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,getDocs,collection} from 'firebase/firestore';

const campaignId='improvement5-invite',base='campaigns/'+campaignId;
const session=base+'/hybridSessionControl/current';
const grant=base+'/hybridViewerGrants/invitee5';
const restricted=base+'/presentationRestricted/current';
const now=Date.now(),epoch='invite-epoch5';
let env;
const db=uid=>uid?env.authenticatedContext(uid).firestore():
  env.unauthenticatedContext().firestore();
const edit=async(path,patch)=>env.withSecurityRulesDisabled(async ctx=>
  updateDoc(doc(ctx.firestore(),path),patch));
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-asteria-invite5',
    firestore:{rules:readFileSync('firestore.rules','utf8')}});
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const admin=ctx.firestore();
    await setDoc(doc(admin,base),{ownerUid:'gm5',membershipSchemaVersion:2});
    await setDoc(doc(admin,session),{
      status:'open',epoch,revision:2,
      expiresAt:new Date(now+600000)
    });
    await setDoc(doc(admin,grant),{
      uid:'invitee5',status:'pending',revision:1,epoch,
      expiresAt:new Date(now+300000)
    });
    await setDoc(doc(admin,restricted),{
      version:1,revision:1,epoch,scene:'title',
      theme:'obsidian',title:'Approved only',subtitle:''
    });
  });
});
test('Phase 5: pending viewer can inspect own invitation but no private stage',async()=>{
  await assertSucceeds(getDoc(doc(db('invitee5'),grant)));
  await assertSucceeds(getDoc(doc(db('invitee5'),session)));
  await assertFails(getDoc(doc(db('invitee5'),restricted)));
  await assertFails(getDocs(collection(db('invitee5'),base+'/hybridViewerGrants')));
  await assertFails(getDoc(doc(db('other5'),grant)));
  await assertFails(getDoc(doc(db('other5'),restricted)));
});
test('Phase 5: only server-recognised acceptance grants stage read',async()=>{
  await edit(grant,{status:'active',acceptedAt:new Date()});
  await assertSucceeds(getDoc(doc(db('invitee5'),restricted)));
  await edit(grant,{status:'declined'});
  await assertFails(getDoc(doc(db('invitee5'),restricted)));
  await edit(grant,{status:'revoked'});
  await assertFails(getDoc(doc(db('invitee5'),restricted)));
  await edit(grant,{status:'pending'});
  await assertFails(getDoc(doc(db('invitee5'),restricted)));
});
test('Phase 5: neither recipients nor GM can browser-write invitation status',async()=>{
  for(const uid of ['gm5','invitee5','other5']){
    await assertFails(updateDoc(doc(db(uid),grant),{status:'active'}));
    await assertFails(setDoc(doc(db(uid),base+'/hybridViewerGrants/forged5'),{
      uid:'forged5',status:'active',epoch
    }));
  }
});
