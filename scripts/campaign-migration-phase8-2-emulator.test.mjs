import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails}
  from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {rehearseLegacyCampaignMigration} from '../functions/campaignMigrationRehearsal.mjs';

const demo='demo-asteria';
let env,app,db;
const id=createHash('sha256').update('alice\0a').digest('hex');
before(async()=>{
  assert.equal(process.env.GCLOUD_PROJECT||demo,demo);
  assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(localhost|127\.0\.0\.1|\[::1\]):\d{2,5}$/);
  env=await initializeTestEnvironment({projectId:demo,
    firestore:{rules:readFileSync('firestore.rules','utf8')}});
  app=initializeApp({projectId:demo},'phase8-2-migration');
  db=getFirestore(app);
});
after(async()=>{
  await env?.cleanup();
  if(app)await deleteApp(app);
});
beforeEach(async()=>{
  await env.clearFirestore();
  const batch=db.batch();
  const root={
    id:'c',ownerUid:'gm',name:'Protected Campaign',ucn:'123456789012',
    gmUids:['gm'],playerUids:['alice'],roles:{gm:'gm',alice:'player'},
    players:{alice:{uid:'alice',status:'active',characterIds:['a']}},
    party:['a'],playerCharacterLinks:{a:'alice'},
    characters:{a:{ownerUid:'alice',sourceCharacterId:'a',level:7}}
  };
  batch.set(db.doc('campaigns/c'),root);
  batch.set(db.doc('campaignInvites/123456789012'),{
    campaignId:'c',ownerUid:'gm',status:'active'
  });
  batch.set(db.doc('campaigns/c/characters/a'),{
    id:'a',ownerUid:'alice',sourceCharacterId:'a',xp:1234,inventory:[{id:'sword'}]
  });
  batch.set(db.doc('users/alice/characters/a'),{
    id:'a',ownerUid:'alice',sourceCharacterId:'a',xp:1234,
    campaignCharacterIds:{c:'a'},inventory:[{id:'sword'}]
  });
  await batch.commit();
});
test('emulator rehearsal is preview-only by default and preserves all original gameplay',async()=>{
  const beforeCampaign=(await db.doc('campaigns/c').get()).data();
  const sheet=(await db.doc('users/alice/characters/a').get()).data();
  const result=await rehearseLegacyCampaignMigration(db,'gm','c');
  assert.equal(result.readyToStage,true);
  assert.equal(result.mode,'dry-run');
  assert.equal((await db.doc('campaigns/c/members/alice').get()).exists,false);
  assert.deepEqual((await db.doc('campaigns/c').get()).data(),beforeCampaign);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data(),sheet);
});
test('emulator-only staging never grants membership until separate cutover',async()=>{
  const beforeCampaign=(await db.doc('campaigns/c').get()).data();
  const shared=(await db.doc('campaigns/c/characters/a').get()).data();
  const ownerSheet=(await db.doc('users/alice/characters/a').get()).data();
  const staged=await rehearseLegacyCampaignMigration(db,'gm','c',{stage:true});
  assert.deepEqual(staged.staged,{members:2,links:1,reservations:1,directory:1});
  assert.equal((await db.doc('campaigns/c/members/alice').get()).data().role,'player');
  assert.equal((await db.doc('campaigns/c/characterLinks/'+id).get()).data().origin,'legacy-migration');
  assert.equal((await db.doc('campaigns/c/characterLinkKeys/'+id).get()).data().ownerUid,'alice');
  assert.equal((await db.doc('campaignDirectory/123456789012').get()).data().campaignId,'c');
  assert.deepEqual((await db.doc('campaigns/c').get()).data(),beforeCampaign);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data(),shared);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data(),ownerSheet);
  const other=env.authenticatedContext('eve').firestore();
  const alice=env.authenticatedContext('alice').firestore();
  await assertFails(getDoc(doc(other,'campaigns/c/members/alice')));
  await assertFails(setDoc(doc(other,'campaigns/c/members/alice'),{role:'owner'}));
  await assertFails(getDoc(doc(alice,'campaigns/c/characterLinks/'+id)));
  const again=await rehearseLegacyCampaignMigration(db,'gm','c',{stage:true});
  assert.deepEqual(again.staged,{members:0,links:0,reservations:0,directory:0});
});
test('conflicting staged member cannot be reactivated through the rehearsal',async()=>{
  await db.doc('campaigns/c/members/alice').set({
    uid:'alice',campaignId:'c',role:'player',status:'banned',revision:4
  });
  const old=(await db.doc('campaigns/c').get()).data();
  const report=await rehearseLegacyCampaignMigration(db,'gm','c');
  assert.equal(report.readyToStage,false);
  await assert.rejects(rehearseLegacyCampaignMigration(db,'gm','c',{stage:true}),/blocked/);
  assert.equal((await db.doc('campaigns/c/members/alice').get()).data().status,'banned');
  assert.deepEqual((await db.doc('campaigns/c').get()).data(),old);
  assert.equal((await db.doc('campaigns/c/characterLinks/'+id).get()).exists,false);
});
