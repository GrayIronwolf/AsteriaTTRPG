import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateFriendRequestAction} from '../functions/friendRequestActions.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('only four strict request actions are accepted, never a raw UID or pair ID',()=>{
  assert.deepEqual(validateFriendRequestAction({
    action:'send',targetAccountId:' Grayson#01448 '
  }),{action:'send',targetAccountId:'Grayson#01448'});
  for(const action of ['accept','decline','cancel'])
    assert.deepEqual(validateFriendRequestAction({
      action,targetAccountId:'Asteria#00009',expectedVersion:1
    }),{action,targetAccountId:'Asteria#00009',expectedVersion:1});
  for(const bad of [
    null,{},[],{action:'send',targetUid:'bob'},
    {action:'send',targetAccountId:'Asteria'},
    {action:'send',targetAccountId:'Asteria#00009',uid:'bob'},
    {action:'send',targetAccountId:'Asteria#00009',expectedVersion:1},
    {action:'accept',targetAccountId:'Asteria#00009'},
    {action:'accept',targetAccountId:'Asteria#00009',expectedVersion:0},
    {action:'decline',targetAccountId:'Asteria#00009',expectedVersion:1,email:'x'},
    {action:'block',targetAccountId:'Asteria#00009',expectedVersion:1}
  ]) assert.throws(()=>validateFriendRequestAction(bad));
});
test('request callable is authenticated and disabled until explicitly activated',()=>{
  const source=read('functions/index.mjs');
  const begin=source.indexOf('// Phase 2.2 Friends: authenticated request mutations');
  const end=source.indexOf('// Phase 1.2 Friends System:',begin);
  assert.ok(begin>=0&&end>begin);
  const block=source.slice(begin,end);
  assert.match(block,/export const asteriaFriendRequests=onCall/);
  assert.match(block,/request.auth\?\.uid/);
  assert.match(block,/ASTERIA_FRIEND_REQUESTS_ENABLED!=='1'/);
  assert.match(block,/changeFriendRequest\(getFirestore\(\),getAuth\(\),request.auth.uid,data\)/);
  assert.doesNotMatch(block,/ASTERIA_FRIEND_LOOKUP_ENABLED/);
  assert.doesNotMatch(block,/input\.uid|data\.uid|input\.targetUid|data\.targetUid/);
  assert.match(block,/Friend request unavailable/);
});
test('relationship changes never accept user-supplied UID and never return private identity data',()=>{
  const source=read('functions/friendRequestActions.mjs');
  assert.match(source,/findFriendByAccountId/);
  assert.match(source,/verifiedActiveIdentity/);
  assert.match(source,/authAdmin\.getUser\(actorUid\)/);
  assert.match(source,/authAdmin\.getUser\(targetUid\)/);
  assert.match(source,/tx\.create\(pairRef,next\)/);
  assert.match(source,/tx\.update\(pairRef,next\)/);
  assert.match(source,/tx\.set\(quotaRef,quota\)/);
  assert.match(source,/nextFriendRequestIssueQuota/);
  assert.match(source,/expectedVersion:input.expectedVersion/);
  assert.doesNotMatch(source,/return \{[^}]*uid:/);
  assert.doesNotMatch(source,/invite|campaignJoin|campaignMembership/);
  assert.doesNotMatch(read('index.html'),/friendRequestsEnabled:true/);
});
test('existing exact lookup release remains independently scoped',()=>{
  const source=read('scripts/friends-phase1-2-release-package.mjs');
  assert.match(source,/export function isolatedFriendSource/);
  assert.match(source,/endMarker='\/\/ Authenticated username edits/);
  // The new callable precedes the old package marker; it is never included.
  const all=read('functions/index.mjs');
  assert.ok(all.indexOf('// Phase 2.2 Friends:')<
    all.indexOf('// Phase 1.2 Friends System:'));
});
