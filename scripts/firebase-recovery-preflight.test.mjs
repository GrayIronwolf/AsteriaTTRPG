import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 inspectRecoveryPreflight,SYNTHETIC_PLAN,SYNTHETIC_FIXTURE
} from './firebase-recovery-preflight.mjs';
const copy=x=>structuredClone(x);
const inspect=(plan=SYNTHETIC_PLAN,fixture=SYNTHETIC_FIXTURE)=>
 inspectRecoveryPreflight(plan,fixture);
test('synthetic-only preflight passes without claiming a restore',()=>{
 const result=inspect();
 assert.equal(result.ready,true);
 assert.equal(result.decision,'PLAN-READY / RESTORE-NOT-VERIFIED');
 assert.equal(result.backupRestored,false);
 assert.equal(result.productionModified,false);
 assert.equal(result.cloudAccessPerformed,false);
 assert.equal(result.synthetic.accountIds,1);
 assert.equal(result.synthetic.memberships,1);
});
test('production and unsafe sandbox identifiers are rejected',()=>{
 for(const sandboxProject of ['asteria-ttrpg','demo-asteria','prod-clone','',null,
  'demo-asteria-recovery-!','demo-asteria-recovery-']){
  assert.equal(inspect({...SYNTHETIC_PLAN,sandboxProject}).ready,false);
 }
 assert.equal(inspect({...SYNTHETIC_PLAN,productionProject:'other'}).ready,false);
});
test('no cloud, production write, live data or restore permission is accepted',()=>{
 for(const patch of [
  {executionMode:'cloud-restore'},
  {firestoreTransfer:'managed-backup-direct-cross-project'},
  {productionWritesAllowed:true},
  {cloudCredentialsAllowed:true},
  {realUserDataAllowed:true},
  {restoreAuthorized:true},
  {dataSource:'production-data'},
  {firestoreRules:'skip'},
  {storageRules:'skip'}
 ])assert.equal(inspect({...SYNTHETIC_PLAN,...patch}).ready,false,
   JSON.stringify(patch));
});
test('a missing recovery domain fails closed',()=>{
 for(const field of ['users','characters','campaigns','memberships','storagePaths']){
  const fixture=copy(SYNTHETIC_FIXTURE);
  delete fixture[field];
  assert.equal(inspect(SYNTHETIC_PLAN,fixture).ready,false);
 }
});
test('duplicate or incomplete users and conflicting Account IDs fail closed',()=>{
 for(const change of [
  fixture=>fixture.users.push(copy(fixture.users[0])),
  fixture=>fixture.users[0].email='',
  fixture=>fixture.users[0].accountNumber='1416',
  fixture=>fixture.users[0].accountId='Asteria#99999',
  fixture=>fixture.users.push({uid:'bob',username:'Asteria',email:'bob@example.test',
    accountNumber:'01416',accountId:'Asteria#01416',accountIdKey:'asteria#01416'})
 ]){
  const fixture=copy(SYNTHETIC_FIXTURE);
  change(fixture);
  assert.equal(inspect(SYNTHETIC_PLAN,fixture).ready,false);
 }
});
test('missing character owners or campaigns fail the recovery integrity test',()=>{
 for(const change of [
  fixture=>fixture.characters[0].ownerUid='stranger',
  fixture=>fixture.memberships[0].uid='stranger',
  fixture=>fixture.memberships[0].characterId='missing',
  fixture=>fixture.memberships[0].campaignId='missing',
  fixture=>fixture.campaigns[0].ownerUid='stranger',
  fixture=>fixture.characters.push(copy(fixture.characters[0]))
 ]){
  const fixture=copy(SYNTHETIC_FIXTURE);change(fixture);
  assert.equal(inspect(SYNTHETIC_PLAN,fixture).ready,false);
 }
});
test('missing storage ownership and unsafe object paths fail',()=>{
 for(const change of [
  fixture=>fixture.storagePaths.push('users/bob/characters/hero/gallery/picture.webp'),
  fixture=>fixture.storagePaths.push('users/alice/characters/missing/gallery/picture.webp'),
  fixture=>fixture.storagePaths.push('campaigns/nope/artwork/banner.webp'),
  fixture=>fixture.storagePaths.push('../escape.json')
 ]){
  const fixture=copy(SYNTHETIC_FIXTURE);change(fixture);
  assert.equal(inspect(SYNTHETIC_PLAN,fixture).ready,false);
 }
});
test('preflight script never calls Firebase SDK or cloud write commands',()=>{
 const source=readFileSync(new URL('./firebase-recovery-preflight.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bexecFile|spawn\(|httpsCallable\(|getFirestore\(|initializeApp\(|firebase deploy/);
 assert.doesNotMatch(source,/\bgcloud\s+(?:firestore\s+)?(?:restore|import|export|delete|create)/);
 assert.match(source,/backupRestored:false,productionModified:false/);
 assert.match(source,/restoreAuthorized:false/);
});
