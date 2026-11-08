import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {issueSecureCampaignInvitation,assertSecureInvitationEligible,
  normalizedInviteEmail} from '../functions/campaignSecureInvitations.mjs';

const key='Q'.repeat(48),now=new Date('2026-11-09T04:00:00.000Z');
const sourceToken=randomBytes(32).toString('base64url');
const clone=x=>structuredClone(x);
function fixture(campaignOverrides={}){
  const store=new Map([['campaigns/c',{
    id:'c',ownerUid:'gm',membershipSchemaVersion:2,
    joinPolicy:{joinRequestsOpen:true},name:'Private Campaign',
    party:['existing'],characters:{existing:{ownerUid:'alice'}},
    ...campaignOverrides
  }]]);
  const read=ref=>({exists:store.has(ref.path),data:()=>clone(store.get(ref.path))});
  const db={store,doc:path=>({path}),
    async runTransaction(fn){
      const changes=[];
      const tx={
        async get(ref){return read(ref);},
        create(ref,data){
          if(store.has(ref.path)||changes.some(([,p])=>p===ref.path))
            throw Error('document already exists');
          changes.push(['create',ref.path,clone(data)]);
        },
        set(ref,data){changes.push(['set',ref.path,clone(data)]);}
      };
      const result=await fn(tx);
      for(const [,path,data] of changes)store.set(path,data);
      return result;
    }
  };
  return db;
}
const args=(overrides={})=>({
  campaignId:'c',requestId:'request-00000001',type:'share-link',
  roleOffered:'player',expiresInHours:24,maxUses:2,
  requiresGMApproval:true,...overrides
});
const issue=(db,input={},opts={})=>issueSecureCampaignInvitation(db,'gm',
  args(input),{now,signingKey:key,tokenFactory:()=>sourceToken,...opts});
const invitation=(db,id)=>db.store.get('campaigns/c/invitations/'+id);
const eligible=(record,id,params={})=>assertSecureInvitationEligible(record,{
  campaignId:'c',inviteId:id,token:sourceToken,claimantUid:'alice',
  now:new Date(now.getTime()+3600000),signingKey:key,...params
});

test('v2 owner can issue a 256-bit random bearer token once, never store plaintext',async()=>{
  const db=fixture();
  const before=clone(db.store.get('campaigns/c'));
  const response=await issue(db);
  assert.equal(response.status,'active');
  assert.equal(response.alreadyIssued,false);
  assert.equal(response.token,sourceToken);
  assert.equal(response.requiresGMApproval,true);
  assert.equal(response.maxUses,2);
  assert.equal(response.usedCount,0);
  assert.equal(response.expiresAt,'2026-11-10T04:00:00.000Z');
  const entry=invitation(db,response.inviteId);
  assert.ok(entry);
  assert.equal(entry.token,undefined);
  assert.equal(entry.tokenDigest.length,64);
  assert.notEqual(entry.tokenDigest,sourceToken);
  assert.equal(entry.recipientEmailNormalized,null);
  assert.equal(entry.roleOffered,'player');
  assert.equal(db.store.get('campaignInvitationTokenIndex/'+entry.tokenDigest).campaignId,'c');
  assert.equal(db.store.get('campaignInvitationIssueThrottle/gm').issued,1);
  assert.deepEqual(db.store.get('campaigns/c'),before);
  assert.equal([...db.store.keys()].some(x=>x.startsWith('campaigns/c/members/')),false);
  assert.equal([...db.store.keys()].some(x=>x.includes('/joinRequests/')),false);
  assert.ok(eligible(entry,response.inviteId));
  assert.equal(JSON.stringify([...db.store.values()]).includes(sourceToken),false);
});

test('same request ID returns only metadata and never reveals another raw token',async()=>{
  const db=fixture();
  const first=await issue(db);
  const priorSize=db.store.size;
  const retry=await issue(db,{},{tokenFactory:()=>randomBytes(32).toString('base64url')});
  assert.equal(retry.inviteId,first.inviteId);
  assert.equal(retry.token,null);
  assert.equal(retry.alreadyIssued,true);
  assert.equal(db.store.size,priorSize);
  assert.equal(db.store.get('campaignInvitationIssueThrottle/gm').issued,1);
  assert.equal(eligible(invitation(db,first.inviteId),first.inviteId).roleOffered,'player');
});

test('unauthorised, legacy and closed campaigns cannot issue tokens or change access',async()=>{
  const db=fixture();
  await assert.rejects(issueSecureCampaignInvitation(db,'eve',args(),{
    now,signingKey:key,tokenFactory:()=>sourceToken
  }),/Only the owner/);
  db.store.get('campaigns/c').membershipSchemaVersion=1;
  await assert.rejects(issue(db),/Only the owner/);
  db.store.get('campaigns/c').membershipSchemaVersion=2;
  db.store.get('campaigns/c').joinPolicy.joinRequestsOpen=false;
  await assert.rejects(issue(db),/not accepting/);
  assert.equal(db.store.size,1);
});

test('recipient-bound email is normalized and verified before matching',async()=>{
  const db=fixture();
  const response=await issue(db,{
    type:'email',recipientEmail:' Player@Example.COM ',recipientUid:'alice',
    maxUses:1
  });
  const entry=invitation(db,response.inviteId);
  assert.equal(entry.recipientEmailNormalized,'player@example.com');
  assert.ok(eligible(entry,response.inviteId,{
    claimantUid:'alice',claimantEmail:'PLAYER@example.com',emailVerified:true
  }));
  for(const overrides of [
    {claimantUid:'bob',claimantEmail:'player@example.com',emailVerified:true},
    {claimantUid:'alice',claimantEmail:'wrong@example.com',emailVerified:true},
    {claimantUid:'alice',claimantEmail:'player@example.com',emailVerified:false},
    {claimantUid:'alice',claimantEmail:null,emailVerified:true}
  ])assert.throws(()=>eligible(entry,response.inviteId,overrides),/unavailable/);
  assert.equal(normalizedInviteEmail(' Person@Test.COM '),'person@test.com');
  assert.throws(()=>normalizedInviteEmail('not-an-email'),/valid recipient email/);
});

test('expired, exhausted, revoked, mismatched and forged tokens fail closed',async()=>{
  const db=fixture();
  const response=await issue(db);
  const entry=invitation(db,response.inviteId);
  assert.throws(()=>eligible({...entry,status:'revoked'},response.inviteId),/unavailable/);
  assert.throws(()=>eligible({...entry,status:'expired'},response.inviteId),/unavailable/);
  assert.throws(()=>eligible({...entry,status:'exhausted'},response.inviteId),/unavailable/);
  assert.throws(()=>eligible({...entry,usedCount:2},response.inviteId),/unavailable/);
  assert.throws(()=>eligible({...entry,requiresGMApproval:false},response.inviteId),/unavailable/);
  assert.throws(()=>eligible(entry,response.inviteId,{
    now:new Date(now.getTime()+24*3600000)
  }),/unavailable/);
  assert.throws(()=>eligible(entry,response.inviteId,{
    token:randomBytes(32).toString('base64url')
  }),/unavailable/);
  assert.throws(()=>eligible(entry,'0'.repeat(64)),/unavailable/);
  assert.throws(()=>eligible(entry,response.inviteId,{campaignId:'other'}),/unavailable/);
});

test('role escalation requires owner issuance and never auto-approves membership',async()=>{
  const db=fixture();
  const response=await issue(db,{roleOffered:'co-gm',maxUses:1});
  assert.equal(eligible(invitation(db,response.inviteId),response.inviteId).roleOffered,'co-gm');
  assert.equal(db.store.has('campaigns/c/members/alice'),false);
  assert.equal(db.store.get('campaigns/c').roles,undefined);
});

test('validation rejects unbounded time, uses, non-approval and unsafe emails',async()=>{
  const invalidOptions=[
    {expiresInHours:0},{expiresInHours:721},
    {maxUses:0},{maxUses:26},{requiresGMApproval:false},
    {type:'email',recipientEmail:null},
    {type:'share-link',recipientEmail:'player@example.com'},
    {type:'email',recipientEmail:'player@example.com',maxUses:2},
    {recipientUid:'alice',maxUses:3}
  ];
  for(const input of invalidOptions){
    await assert.rejects(issue(fixture(),input),/Choose valid|Email invitations|Recipient-restricted/);
  }
  await assert.rejects(issue(fixture(),{},{
    signingKey:'weak'
  }),/signing key is not configured/);
});

test('ten invitation creations per rolling day, retries do not count again',async()=>{
  const db=fixture();
  for(let i=0;i<10;i++){
    await issue(db,{requestId:'request-'+String(i).padStart(10,'0')},{
      tokenFactory:()=>randomBytes(32).toString('base64url')
    });
  }
  assert.equal(db.store.get('campaignInvitationIssueThrottle/gm').issued,10);
  await assert.rejects(issue(db,{requestId:'request-overlimit'}),/Daily secure invitation limit/);
  assert.equal(db.store.get('campaignInvitationIssueThrottle/gm').issued,10);
  const existing=await issue(db,{requestId:'request-0000000000'});
  assert.equal(existing.alreadyIssued,true);
  assert.equal(existing.token,null);
});

test('tampered idempotency record fails reconciliation rather than reissue',async()=>{
  const db=fixture();
  const r=await issue(db);
  invitation(db,r.inviteId).createdByUid='mallory';
  await assert.rejects(issue(db),/reconciliation/);
});

test('token digests bind campaign ID and invitation ID, never the public UCN',async()=>{
  const db=fixture();
  const first=await issue(db);
  const second=await issue(db,{requestId:'request-00000002'},{
    tokenFactory:()=>sourceToken
  });
  assert.notEqual(first.inviteId,second.inviteId);
  assert.notEqual(invitation(db,first.inviteId).tokenDigest,
    invitation(db,second.inviteId).tokenDigest);
  assert.throws(()=>eligible(invitation(db,first.inviteId),second.inviteId),/unavailable/);
});
