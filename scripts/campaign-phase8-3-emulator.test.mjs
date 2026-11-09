import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds}
  from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {rehearseLegacyCampaignMigration}
  from '../functions/campaignMigrationRehearsal.mjs';
import {prepareCampaignCutover} from '../functions/campaignAccessCutover.mjs';
import {campaignJoinRequest} from '../functions/campaignJoinRequests.mjs';
import {reviewCampaignJoinRequest}
  from '../functions/campaignJoinApproval.mjs';
import {moderateCampaignMember}
  from '../functions/campaignMemberControls.mjs';
import {listCampaignNotifications}
  from '../functions/campaignNotifications.mjs';

const projectId='demo-asteria';
const sourceCharacter={
  id:'a',ownerUid:'alice',sourceCharacterId:'a',
  sharedCampaignId:'c',linkedCampaignIds:['c'],
  campaignCharacterIds:{c:'a'},name:'Local Fixture',level:7,xp:1234,
  inventory:[{id:'sword',qty:2}],hp:[19,20]
};
let env,app,db;
const auth=uid=>env.authenticatedContext(uid).firestore();

before(async()=>{
  assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',
    /^(localhost|127\.0\.0\.1|\[::1\]):\d{2,5}$/);
  env=await initializeTestEnvironment({projectId,
    firestore:{rules:readFileSync('firestore.rules','utf8')},
    storage:{rules:readFileSync('storage.rules','utf8')}});
  app=initializeApp({projectId},'phase8-3-release');
  db=getFirestore(app);
});
after(async()=>{await env?.cleanup();if(app)await deleteApp(app);});
beforeEach(async()=>{
  await env.clearFirestore();
  const batch=db.batch();
  batch.set(db.doc('campaigns/c'),{
    id:'c',name:'Migration Rehearsal',ownerUid:'gm',
    ucn:'123456789012',gmUids:['gm'],playerUids:['alice'],
    roles:{gm:'gm',alice:'player'},playerLimit:4,
    players:{alice:{uid:'alice',status:'active',characterIds:['a']}},
    party:['a'],playerCharacterLinks:{a:'alice'},
    characters:{a:{ownerUid:'alice',sourceCharacterId:'a',level:7}}
  });
  batch.set(db.doc('campaignInvites/123456789012'),{
    campaignId:'c',ownerUid:'gm',status:'active'
  });
  batch.set(db.doc('campaigns/c/characters/a'),structuredClone(sourceCharacter));
  batch.set(db.doc('users/alice/characters/a'),structuredClone(sourceCharacter));
  await batch.commit();
});
test('complete canary rehearsal preserves UCN and gameplay through cutover, approval and revocation',async()=>{
  const legacy=(await db.doc('campaigns/c').get()).data();
  const saved=(await db.doc('users/alice/characters/a').get()).data();
  const shared=(await db.doc('campaigns/c/characters/a').get()).data();
  const preview=await rehearseLegacyCampaignMigration(db,'gm','c');
  assert.equal(preview.readyToStage,true);
  assert.equal((await db.doc('campaigns/c/members/gm').get()).exists,false);

  const staged=await rehearseLegacyCampaignMigration(db,'gm','c',{stage:true});
  assert.deepEqual(staged.staged,{members:2,links:1,reservations:1,directory:1});
  assert.equal((await db.doc('campaigns/c').get()).data().membershipSchemaVersion,undefined);
  const plan=await prepareCampaignCutover(db,'gm','c');
  assert.equal(plan.ready,true);
  const cut=await prepareCampaignCutover(db,'gm','c',{activate:true});
  assert.equal(cut.activated,true);
  assert.equal((await db.doc('campaigns/c').get()).data().ucn,legacy.ucn);
  await assertSucceeds(getDoc(doc(auth('alice'),'campaigns/c')));
  await assertFails(getDoc(doc(auth('eve'),'campaigns/c')));
  await assertFails(setDoc(doc(auth('eve'),'campaigns/c/members/eve'),{
    uid:'eve',campaignId:'c',status:'active',role:'owner'
  }));

  const request=await campaignJoinRequest(db,'eve',{
    action:'submit',campaignId:'c',ucn:legacy.ucn
  },{notificationsEnabled:true});
  assert.equal(request.status,'pending');
  const gmNotices=await listCampaignNotifications(db,'gm');
  assert.equal(gmNotices.notifications.length,1);
  assert.equal(gmNotices.notifications[0].kind,'join-request');
  await assertFails(getDoc(doc(auth('eve'),'campaigns/c')));
  const reviewed=await reviewCampaignJoinRequest(db,'gm',{
    campaignId:'c',requestUid:'eve',decision:'approve',expectedRevision:1
  },{notificationsEnabled:true});
  assert.equal(reviewed.status,'approved');
  const eveNotices=await listCampaignNotifications(db,'eve');
  assert.equal(eveNotices.notifications.length,1);
  assert.equal(eveNotices.notifications[0].kind,'join-approved');
  await assertSucceeds(getDoc(doc(auth('eve'),'campaigns/c')));
  await assertFails(getDoc(doc(auth('alice'),'campaignMemberProjections/eve/campaigns/c')));

  const revoked=await moderateCampaignMember(db,'gm',{
    campaignId:'c',memberUid:'eve',action:'suspend',
    expectedRevision:1,expectedStatus:'active'
  });
  assert.equal(revoked.status,'suspended');
  const member=(await db.doc('campaigns/c/members/eve').get()).data();
  const projection=(await db.doc('campaignMemberProjections/eve/campaigns/c').get()).data();
  assert.equal(member.status,'suspended');
  assert.equal(projection.status,'suspended');
  await assertFails(getDoc(doc(auth('eve'),'campaigns/c')));
  await assertFails(getDoc(doc(auth('eve'),'campaigns/c/characters/a')));
  await assertSucceeds(getDoc(doc(auth('alice'),'campaigns/c/characters/a')));
  await assertFails(getDoc(doc(auth('eve'),'campaigns/c/characterLinks/a')));
  const blocked=await campaignJoinRequest(db,'eve',{
    action:'submit',campaignId:'c',ucn:legacy.ucn
  });
  assert.equal(blocked.status,'blocked');
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data(),shared);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data(),saved);
});
test('no unauthorised cutover or banned-user resurrection even with legacy UID arrays',async()=>{
  await rehearseLegacyCampaignMigration(db,'gm','c',{stage:true});
  await assert.rejects(prepareCampaignCutover(db,'alice','c',{activate:true}),/owner/);
  await db.doc('campaigns/c/members/alice').update({
    status:'banned',revision:2
  });
  const readiness=await prepareCampaignCutover(db,'gm','c');
  assert.equal(readiness.ready,false);
  await assert.rejects(prepareCampaignCutover(db,'gm','c',{activate:true}),
    /unresolved conflicts/);
  assert.equal((await db.doc('campaigns/c').get()).data().membershipSchemaVersion,undefined);
  assert.equal((await db.doc('campaigns/c/members/alice').get()).data().status,'banned');
});
