import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {assertAccountIdRolloutEligible,issueNewRegistrationAccountId} from '../functions/accountIdentityIssuance.mjs';

const timestamp=new Date('2026-11-10T04:00:00.000Z');
const cutoff='2026-11-10T03:30:00.000Z';
const digest=email=>createHash('sha256').update(email).digest('hex');
const user=(uid='newuser',created='2026-11-10T03:59:00.000Z')=>({
  uid,email:uid+'@example.test',displayName:'NewPlayer',disabled:false,
  emailVerified:false,metadata:{creationTime:created}
});
function database(initial) {
  const records=new Map(Object.entries(initial));
  let queue=Promise.resolve();
  return {
    records,doc:path=>({path}),
    runTransaction(callback){
      const run=async()=>{
        const writes=[];
        const tx={
          get:async ref=>({exists:records.has(ref.path),
            data:()=>structuredClone(records.get(ref.path))}),
          create(ref,value){if(records.has(ref.path))throw Error('duplicate');writes.push({type:'create',path:ref.path,value:structuredClone(value)});},
          update(ref,value){if(!records.has(ref.path))throw Error('missing');writes.push({type:'update',path:ref.path,value:structuredClone(value)});}
        };
        const result=await callback(tx);
        for(const write of writes)records.set(write.path,write.type==='create'
          ?write.value:{...records.get(write.path),...write.value});
        return result;
      };
      const result=queue.then(run);queue=result.then(()=>{},()=>{});return result;
    }
  };
}
const profile=(uid='newuser')=>({uid,username:'NewPlayer',
  usernameLower:'newplayer',email:uid+'@example.test',characters:[{name:'Keep',xp:123}]});
const auto=(db,u,extras={})=>issueNewRegistrationAccountId(db,u,u.uid,{
  notBefore:cutoff,now:timestamp,rolloutMode:'auto-canary',
  canaryEmailSha256:digest('newuser@example.test'),
  nextNumber:()=> '01448',...extras
});

test('new unverified Auth user receives permanent Account ID without email verification',async()=>{
  const db=database({'users/newuser':profile()});
  const result=await auto(db,user());
  assert.equal(result.accountId,'NewPlayer#01448');
  assert.equal(db.records.get('accountIdRegistry/newplayer#01448').uid,'newuser');
  assert.equal(db.records.get('accountIdAssignments/newuser').accountId,'NewPlayer#01448');
  assert.deepEqual(db.records.get('users/newuser').characters,[{name:'Keep',xp:123}]);
});
test('repeated call never changes suffix or registry even if random source changes',async()=>{
  const db=database({'users/newuser':profile()});
  await auto(db,user());
  const before=structuredClone([...db.records]);
  const later=await auto(db,user(),{nextNumber:()=> '99999'});
  assert.equal(later.alreadyAssigned,true);
  assert.equal(later.accountId,'NewPlayer#01448');
  assert.deepEqual([...db.records],before);
});
test('unverified auto-canary requires exactly approved email, never client-supplied email',async()=>{
  const db=database({'users/newuser':profile()});
  await assert.rejects(auto(db,user(),{canaryEmailSha256:digest('wrong@example.test')}),/new registration/);
  assert.equal(db.records.size,1);
});
test('old accounts cannot obtain new ID by editing registration profile',async()=>{
  const db=database({'users/newuser':{...profile(),createdAt:timestamp.toISOString()}});
  await assert.rejects(auto(db,user('newuser','2025-01-01T00:00:00.000Z')),/new registration/);
  assert.equal(db.records.size,1);
});
test('general release requires separate server approval in addition to rollout mode',async()=>{
  const u=user();
  for(const generalReleaseApproved of [undefined,false,'0',true,'yes']){
    assert.throws(()=>assertAccountIdRolloutEligible(u,u.email,{
      rolloutMode:'general',generalReleaseApproved
    }),/new registration/);
  }
  assert.doesNotThrow(()=>assertAccountIdRolloutEligible(u,u.email,{
    rolloutMode:'general',generalReleaseApproved:'1'
  }));
  for(const mode of [undefined,'invalid','auto'])assert.throws(()=>
    assertAccountIdRolloutEligible(u,u.email,{rolloutMode:mode,generalReleaseApproved:'1'}),
    /new registration/);
});
test('original verified-email canary retains its verification requirement',()=>{
  const u=user();
  const canaryEmailSha256=digest(u.email);
  assert.throws(()=>assertAccountIdRolloutEligible(u,u.email,{
    rolloutMode:'canary',canaryEmailSha256
  }),/new registration/);
  assert.doesNotThrow(()=>assertAccountIdRolloutEligible({...u,emailVerified:true},u.email,{
    rolloutMode:'canary',canaryEmailSha256
  }));
});
test('signup assigns ID before optional verification email and public flag stays disabled',()=>{
  const src=readFileSync(new URL('../js/firebase-auth.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const start=src.indexOf('window.firebaseCreateAccountPage = async function()');
  const end=src.indexOf('window.firebaseLogin =',start);
  const signup=src.slice(start,end);
  assert.ok(signup.indexOf('accountIdentity = await finalizeRegisteredAccountId(')>=0);
  assert.ok(signup.indexOf('accountIdentity = await finalizeRegisteredAccountId(') <
    signup.indexOf('await sendEmailVerification(cred.user)'));
  assert.doesNotMatch(signup,/if\(!cred\.user\.emailVerified\)/);
  assert.match(html,/accountIds:false/);
  assert.match(src,/setPendingAccountDraft\(\{uid:cred\.user\.uid/);
  assert.match(src,/getDocFromServer\(doc\(db,'users',cred\.user\.uid\)\)/);
});
