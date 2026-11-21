import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds}
  from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc}
  from 'firebase/firestore';

const campaign='phase69-security';
const path='campaigns/'+campaign+'/encounterHistory/combat-saved';
const history={id:'combat-saved',status:'pending-review',revision:1,
  endedAt:1700000000000,endedBy:'gm',outcome:'unresolved',
  notes:'Private enemy and reward information',rewards:[],participants:[]};
let env;
const account=uid=>env.authenticatedContext(uid).firestore();
before(async()=>{env=await initializeTestEnvironment({
  projectId:'demo-asteria-combat-phase69',
  firestore:{rules:readFileSync('firestore.rules','utf8')}
});});
after(async()=>env?.cleanup());
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'campaigns/'+campaign),{
      ownerUid:'gm',membershipSchemaVersion:2
    });
    await setDoc(doc(db,'campaigns/'+campaign+'/members/co'),{
      uid:'co',campaignId:campaign,role:'co-gm',status:'active'
    });
    await setDoc(doc(db,'campaigns/'+campaign+'/members/alice'),{
      uid:'alice',campaignId:campaign,role:'player',status:'active'
    });
    await setDoc(doc(db,'campaigns/'+campaign+'/members/revoked'),{
      uid:'revoked',campaignId:campaign,role:'player',status:'inactive'
    });
    await setDoc(doc(db,path),history);
  });
});
test('6.9: verified GM and co-GM can read completed encounter history',async()=>{
  for(const uid of ['gm','co']){
    await assertSucceeds(getDoc(doc(account(uid),path)));
    await assertSucceeds(getDocs(collection(account(uid),
      'campaigns/'+campaign+'/encounterHistory')));
  }
});
test('6.9: player, revoked member, outsider and anonymous cannot read secrets',async()=>{
  for(const uid of ['alice','revoked','outsider']){
    await assertFails(getDoc(doc(account(uid),path)));
    await assertFails(getDocs(collection(account(uid),
      'campaigns/'+campaign+'/encounterHistory')));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path)));
});
test('6.9: no client, even GM, may forge, edit or remove completed encounters',async()=>{
  for(const uid of ['gm','co','alice','outsider']){
    const db=account(uid);
    await assertFails(setDoc(doc(db,path),{...history,status:'approved'}));
    await assertFails(updateDoc(doc(db,path),{revision:99}));
    await assertFails(deleteDoc(doc(db,path)));
    await assertFails(setDoc(doc(db,'campaigns/'+campaign+
      '/encounterHistory/forged'),history));
  }
});
