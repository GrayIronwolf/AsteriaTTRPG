import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {issueNewRegistrationAccountId} from '../functions/accountIdentityIssuance.mjs';
import {inspectLegacyAccountIdentity,backfillLegacyAccountIdentity}
  from '../functions/accountIdentityLegacy.mjs';

const projectId='demo-asteria';
const cutoff='2026-11-09T11:30:00.000Z';
const now=new Date('2026-11-09T12:00:00.000Z');
const canary=(email)=>({rolloutMode:'canary',
  canaryEmailSha256:createHash('sha256').update(email).digest('hex')});
let env,app,db;
const authUser=(uid,createdAt,username='Asteria')=>({
  uid,disabled:false,emailVerified:true,email:uid+'@example.test',displayName:username,
  metadata:{creationTime:createdAt}
});
const profile=(uid,name)=>({uid,username:name,usernameLower:name.toLowerCase(),
  email:uid+'@example.test',firstName:'Preserve',characters:[{id:'hero',xp:123}]});
before(async()=>{
  env=await initializeTestEnvironment({projectId,
    firestore:{rules:readFileSync('firestore.rules','utf8')}});
  app=initializeApp({projectId,name:'account-legacy-guard'});
  db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{await env.clearFirestore();});
test('legacy existing account cannot mint an ID despite a valid editable profile',async()=>{
  await db.doc('users/old').set(profile('old','Asteria'));
  await assert.rejects(issueNewRegistrationAccountId(db,
    authUser('old','2022-01-01T00:00:00.000Z'),'old',{
      notBefore:cutoff,now,nextNumber:()=> '00001',...canary('old@example.test')
    }),/new registration/);
  assert.equal((await db.collection('accountIdAssignments').get()).size,0);
  assert.equal((await db.collection('accountIdRegistry').get()).size,0);
  const browser=env.authenticatedContext('old').firestore();
  await assertFails(getDoc(doc(browser,'accountIdAssignments/old')));
});
test('post-cutoff registration succeeds while legacy account cannot impersonate it',async()=>{
  await db.doc('users/new').set(profile('new','Asteria'));
  await db.doc('users/old').set(profile('old','asteria'));
  await assert.rejects(issueNewRegistrationAccountId(db,
    authUser('old','2020-01-01T00:00:00.000Z','asteria'),'old',{
      notBefore:cutoff,now,nextNumber:()=> '00001',...canary('old@example.test')
    }),/new registration/);
  const result=await issueNewRegistrationAccountId(db,
    authUser('new','2026-11-09T11:59:00.000Z'),'new',{
      notBefore:cutoff,now,nextNumber:()=> '00001',...canary('new@example.test')
    });
  assert.equal(result.accountId,'Asteria#00001');
  assert.equal((await db.doc('accountIdRegistry/asteria#00001').get()).data().uid,'new');
  assert.equal((await db.doc('accountIdAssignments/old').get()).exists,false);
  assert.equal((await db.doc('users/new').get()).data().characters[0].xp,123);
});
test('legacy backfill still requires explicit operator confirmation',async()=>{
  await db.doc('users/old').set(profile('old','Asteria'));
  const auth={getUser:async uid=>authUser(uid,'2020-01-01T00:00:00.000Z')};
  assert.equal((await inspectLegacyAccountIdentity(db,auth,'old')).status,'eligible');
  await assert.rejects(backfillLegacyAccountIdentity(db,auth,'old',{
    enabled:true,confirmation:'not-approved',projectId
  }),/disabled/);
  const approved=await backfillLegacyAccountIdentity(db,auth,'old',{
    enabled:true,confirmation:'BACKFILL-ACCOUNT-ID:old',
    projectId,nextNumber:()=> '00002'
  });
  assert.equal(approved.accountId,'Asteria#00002');
});
