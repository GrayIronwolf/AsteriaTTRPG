import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds}
  from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc}
  from 'firebase/firestore';

const campaignId='hybrid-phase72',base='campaigns/'+campaignId;
const sessionPath=base+'/hybridSessionControl/current';
const restrictedPath=base+'/presentationRestricted/current';
const grantPath=uid=>base+'/hybridViewerGrants/'+uid;
const now=Date.now(),epoch='hybrid-emulator72';
const session={status:'open',revision:1,mode:'hybrid',epoch,
  grantCount:1,expiresAt:new Date(now+60*60*1000),startedAt:new Date(now)};
const grant={uid:'invitee',status:'active',epoch,revision:1,
  expiresAt:new Date(now+30*60*1000),grantedBy:'gm'};
const scene={scene:'title',version:1,revision:1,title:'Approved announcement',
  subtitle:'Welcome',theme:'obsidian',epoch};
let env;
const db=uid=>env.authenticatedContext(uid).firestore();
const ref=(database,path)=>doc(database,path);
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-asteria-hybrid-phase72',
    firestore:{rules:readFileSync('firestore.rules','utf8')}});
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const admin=context.firestore();
    await setDoc(ref(admin,base),{ownerUid:'gm',membershipSchemaVersion:2});
    await setDoc(ref(admin,base+'/members/member'),{
      uid:'member',campaignId,role:'player',status:'active'
    });
    await setDoc(ref(admin,sessionPath),session);
    await setDoc(ref(admin,grantPath('invitee')),grant);
    await setDoc(ref(admin,restrictedPath),scene);
    await setDoc(ref(admin,base+'/systems/gmWorkspace'),
      {notes:'secret GM session information'});
    await setDoc(ref(admin,base+'/battleMaps/private-map'),
      {name:'Hidden map',visibility:'gm'});
    await setDoc(ref(admin,base+'/presentationControl/current'),
      {scene:'announcement',privateNotes:'GM secret'});
  });
});
test('7.2: authenticated invited nonmember can read only own grant, session and safe scene',async()=>{
  const viewer=db('invitee');
  await assertSucceeds(getDoc(ref(viewer,grantPath('invitee'))));
  await assertSucceeds(getDoc(ref(viewer,sessionPath)));
  const snap=await assertSucceeds(getDoc(ref(viewer,restrictedPath)));
  if(snap.data().title!=='Approved announcement')
    throw Error('Viewer scene was not the approved safe document.');
  await assertFails(getDoc(ref(viewer,base)));
  await assertFails(getDoc(ref(viewer,base+'/presentationControl/current')));
  await assertFails(getDoc(ref(viewer,base+'/systems/gmWorkspace')));
  await assertFails(getDoc(ref(viewer,base+'/battleMaps/private-map')));
  await assertFails(getDoc(ref(viewer,grantPath('other'))));
  await assertFails(getDocs(collection(viewer,base+'/hybridViewerGrants')));
  await assertFails(getDocs(collection(viewer,base+'/presentationRestricted')));
  await assertFails(getDocs(collection(viewer,base+'/hybridSessionControl')));
});
test('7.2: random signed-in users, signed-out users and normal members without grants cannot read restricted scenes',async()=>{
  for(const uid of ['other','member']){
    await assertFails(getDoc(ref(db(uid),restrictedPath)));
    await assertFails(getDoc(ref(db(uid),sessionPath)));
  }
  await assertFails(getDoc(ref(env.unauthenticatedContext().firestore(),restrictedPath)));
});
test('7.2: all client writes are refused even for invited viewers and GMs',async()=>{
  for(const uid of ['gm','invitee','other']){
    const database=db(uid);
    await assertFails(setDoc(ref(database,restrictedPath),scene));
    await assertFails(updateDoc(ref(database,restrictedPath),{title:'Malicious'}));
    await assertFails(deleteDoc(ref(database,restrictedPath)));
    await assertFails(setDoc(ref(database,grantPath('invitee')),
      {...grant,status:'active'}));
    await assertFails(updateDoc(ref(database,sessionPath),{status:'open'}));
    await assertFails(deleteDoc(ref(database,sessionPath)));
  }
});
test('7.2: revocation, session closure, expiry and epoch mismatch fail closed',async()=>{
  const mutate=async(refPath,patch)=>env.withSecurityRulesDisabled(async context=>
    updateDoc(ref(context.firestore(),refPath),patch));
  const viewer=db('invitee');
  await mutate(grantPath('invitee'),{status:'revoked'});
  await assertFails(getDoc(ref(viewer,restrictedPath)));
  await mutate(grantPath('invitee'),{status:'active'});
  await mutate(sessionPath,{status:'closed'});
  await assertFails(getDoc(ref(viewer,restrictedPath)));
  await mutate(sessionPath,{status:'open'});
  await mutate(sessionPath,{epoch:'hybrid-new'});
  await assertFails(getDoc(ref(viewer,restrictedPath)));
  await mutate(sessionPath,{epoch});
  await mutate(grantPath('invitee'),{expiresAt:new Date(now-1000)});
  await assertFails(getDoc(ref(viewer,restrictedPath)));
  await mutate(grantPath('invitee'),{expiresAt:new Date(now+3600000)});
  await mutate(sessionPath,{expiresAt:new Date(now-1000)});
  await assertFails(getDoc(ref(viewer,restrictedPath)));
});
test('7.2: campaign GM can inspect session records while any signed-in outsider cannot list them',async()=>{
  const gm=db('gm');
  await assertSucceeds(getDoc(ref(gm,sessionPath)));
  await assertSucceeds(getDocs(collection(gm,base+'/hybridViewerGrants')));
  await assertSucceeds(getDoc(ref(gm,restrictedPath)));
});
