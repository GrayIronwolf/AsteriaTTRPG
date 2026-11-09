import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendCampaignEmailInvitations,resendCampaignEmailInvitation}
  from '../functions/campaignEmailInvitations.mjs';
import {assertSecureInvitationEligible}
  from '../functions/campaignSecureInvitations.mjs';

const now=new Date('2026-11-09T09:00:00.000Z'),key='s'.repeat(48);
const env={
  ASTERIA_EMAIL_DELIVERY_ENABLED:'1',
  ASTERIA_EMAIL_FROM:'invites@mail.asteriattrpg.com',
  ASTERIA_EMAIL_SENDING_DOMAIN:'mail.asteriattrpg.com',
  ASTERIA_EMAIL_DOMAIN_VERIFIED:'1'
};
const apiKey='re_'+'f'.repeat(40);
const clone=x=>structuredClone(x);
function fixture(overrides={}){
  const store=new Map([['campaigns/c',{
    id:'c',ownerUid:'gm',name:'Frosthold',ownerName:'Tharrnak',
    membershipSchemaVersion:2,joinPolicy:{joinRequestsOpen:true},
    party:['existing'],...overrides
  }]]);
  const read=ref=>({exists:store.has(ref.path),data:()=>clone(store.get(ref.path))});
  const db={store,doc:path=>({path,get:async()=>read({path})}),
    async runTransaction(fn){
      const writes=[];
      const tx={
        get:async ref=>read(ref),
        create(ref,content){
          if(store.has(ref.path)||writes.some(row=>row[1]===ref.path))
            throw Error('Document already exists');
          writes.push(['create',ref.path,clone(content)]);
        },
        update(ref,content){
          if(!store.has(ref.path))throw Error('Document missing');
          writes.push(['update',ref.path,clone(content)]);
        },
        set(ref,content){writes.push(['set',ref.path,clone(content)]);}
      };
      const result=await fn(tx);
      for(const [op,path,data] of writes)
        store.set(path,op==='update'?{...store.get(path),...data}:data);
      return result;
    }
  };
  return db;
}
const params=(extra={})=>({
  campaignId:'c',requestId:'batch-email-000001',
  recipients:['ALICE@example.com','bob@example.com'],
  roleOffered:'player',expiresInHours:24,...extra
});
const opt=(extra={})=>({
  signingKey:key,apiKey,env,now,
  deliver:async()=>({status:'accepted',providerMessageId:'email_123'}),
  ...extra
});
const send=(db,p={},o={})=>sendCampaignEmailInvitations(db,'gm',params(p),opt(o));
const rows=db=>[...db.store.entries()].filter(([path])=>
  /^campaigns\/c\/invitations\/[0-9a-f]{64}$/.test(path))
  .map(([,value])=>value);
const invite=db=>rows(db)[0];

test('disabled delivery and unverified domain have no Firestore or network side effects',async()=>{
  const db=fixture();let requests=0;
  for(const configuration of [
    {...env,ASTERIA_EMAIL_DELIVERY_ENABLED:'0'},
    {...env,ASTERIA_EMAIL_DOMAIN_VERIFIED:'0'}
  ])await assert.rejects(send(db,{},{
    env:configuration,deliver:async()=>{requests++;throw Error('should not send');}
  }),/not enabled|not been verified/);
  assert.equal(db.store.size,1);
  assert.equal(requests,0);
});

test('owner-only, schema-v2 and closed-campaign security checks prevent send',async()=>{
  const db=fixture();
  await assert.rejects(sendCampaignEmailInvitations(db,'eve',params(),opt()),/Only the owner/);
  db.store.get('campaigns/c').membershipSchemaVersion=1;
  await assert.rejects(send(db),/Only the owner/);
  db.store.get('campaigns/c').membershipSchemaVersion=2;
  db.store.get('campaigns/c').joinPolicy.joinRequestsOpen=false;
  await assert.rejects(send(db),/closed/);
  assert.equal(rows(db).length,0);
});

test('bulk send issues unique private invites; provider accepted is not inbox delivered',async()=>{
  const db=fixture(),sent=[];
  const root=clone(db.store.get('campaigns/c'));
  const result=await send(db,{},{
    deliver:async data=>{
      sent.push(data);
      return {status:'accepted',providerMessageId:'email_'+sent.length};
    }
  });
  assert.equal(result.results.length,2);
  assert.equal(result.results.every(row=>row.status==='accepted'),true);
  assert.equal(result.results[0].recipientEmail,'alice@example.com');
  assert.equal(result.results[1].recipientEmail,'bob@example.com');
  assert.equal(sent.length,2);
  assert.notEqual(sent[0].invitationUrl,sent[1].invitationUrl);
  assert.equal(sent[0].campaignName,'Frosthold');
  assert.deepEqual(db.store.get('campaigns/c'),root);
  for(const invite of rows(db)){
    assert.equal(invite.deliveryStatus,'accepted');
    assert.equal(invite.maxUses,1);
    assert.equal(invite.type,'email');
    assert.equal(invite.usedCount,0);
    assert.equal(invite.requiresGMApproval,true);
    assert.equal(invite.token,undefined);
    assert.equal(db.store.has('campaigns/c/members/'+invite.recipientEmailNormalized),false);
  }
  assert.equal(db.store.get('campaignInvitationIssueThrottle/gm').issued,2);
  assert.equal(JSON.stringify([...db.store.values()]).includes(sent[0].invitationUrl),false);
  assert.equal(JSON.stringify(result).includes(sent[0].invitationUrl),false);
});

test('client retry with same request ID does not re-send or expose original token',async()=>{
  const db=fixture();let count=0;
  const sender=async()=>({status:'accepted',providerMessageId:'msg_'+(++count)});
  const first=await send(db,{}, {deliver:sender});
  const repeated=await send(db,{}, {deliver:sender});
  assert.equal(count,2);
  assert.equal(repeated.results[0].alreadyExists,true);
  assert.equal(repeated.results[0].status,'accepted');
  assert.equal(repeated.results[0].inviteId,first.results[0].inviteId);
  assert.equal(db.store.get('campaignInvitationIssueThrottle/gm').issued,2);
});

test('unknown provider failure cannot auto-retry bearer link and can rotate it',async()=>{
  const db=fixture(),sent=[];
  const first=await send(db,{recipients:['alice@example.com']},{
    deliver:async data=>{sent.push(data);throw Error('timeout '+data.invitationUrl);}
  });
  assert.equal(first.results[0].status,'unknown');
  const old=invite(db);
  assert.equal(old.deliveryStatus,'unknown');
  const again=await send(db,{recipients:['alice@example.com']},{
    deliver:async()=>{throw Error('duplicate send');}
  });
  assert.equal(again.results[0].status,'unknown');
  assert.equal(sent.length,1);
  const replacement=await resendCampaignEmailInvitation(db,'gm',{
    campaignId:'c',requestId:'resend-email-000001',
    sourceInviteId:old.inviteId,expectedRevision:old.revision
  },opt({deliver:async data=>{
    sent.push(data);return {status:'accepted',providerMessageId:'new_123'};
  }}));
  assert.equal(replacement.result.status,'accepted');
  assert.equal(rows(db).length,2);
  const prior=db.store.get('campaigns/c/invitations/'+old.inviteId);
  assert.equal(prior.status,'revoked');
  assert.equal(prior.revision,2);
  const newRow=rows(db).find(row=>row.inviteId!==old.inviteId);
  assert.equal(newRow.resendOfInviteId,old.inviteId);
  assert.equal(newRow.deliveryStatus,'accepted');
  assert.equal(sent.length,2);
  assert.notEqual(sent[0].invitationUrl,sent[1].invitationUrl);
  assert.throws(()=>assertSecureInvitationEligible(prior,{
    campaignId:'c',inviteId:prior.inviteId,
    token:sent[0].invitationUrl.split('.').at(-1),
    claimantUid:'alice',claimantEmail:'alice@example.com',
    emailVerified:true,now,signingKey:key
  }),/unavailable/);
});

test('resend requires a current revision, valid original and preserves failed attempt',async()=>{
  const db=fixture();
  const first=await send(db,{recipients:['alice@example.com']});
  await assert.rejects(resendCampaignEmailInvitation(db,'eve',{
    campaignId:'c',requestId:'resend-email-000002',
    sourceInviteId:first.results[0].inviteId,expectedRevision:1
  },opt()),/Only the owner/);
  await assert.rejects(resendCampaignEmailInvitation(db,'gm',{
    campaignId:'c',requestId:'resend-email-000002',
    sourceInviteId:first.results[0].inviteId,expectedRevision:2
  },opt()),/changed/);
  const current=invite(db);
  current.usedCount=1;
  await assert.rejects(resendCampaignEmailInvitation(db,'gm',{
    campaignId:'c',requestId:'resend-email-000002',
    sourceInviteId:first.results[0].inviteId,expectedRevision:1
  },opt()),/cannot be resent/);
  assert.equal(rows(db).length,1);
});

test('invalid batches, duplicate emails and excessive daily issuance fail safely',async()=>{
  for(const recipients of [[],Array(6).fill('a@example.com'),
    ['a@example.com','A@example.com'],['not-email']]){
    const db=fixture();
    await assert.rejects(send(db,{recipients}),/Choose between|Duplicate|valid recipient/);
    assert.equal(rows(db).length,0);
  }
  const db=fixture();
  for(let i=0;i<2;i++){
    const batch=await send(db,{
      requestId:'batch-email-00000'+i,
      recipients:['a'+i+'@example.com','b'+i+'@example.com',
        'c'+i+'@example.com','d'+i+'@example.com','e'+i+'@example.com']
    });
    assert.equal(batch.results.every(row=>row.status==='accepted'),true);
  }
  const extra=await send(db,{
    requestId:'batch-email-000003',recipients:['last@example.com']
  });
  assert.equal(extra.results[0].status,'failed');
  assert.equal(db.store.get('campaignInvitationIssueThrottle/gm').issued,10);
});

test('provider rejected delivery remains unknown; no token recovered or automatically resent',async()=>{
  const db=fixture();let calls=0;
  const result=await send(db,{recipients:['alice@example.com']},{
    deliver:async()=>{calls++;throw Error('provider credentials and token must not leak');}
  });
  assert.equal(result.results[0].status,'unknown');
  assert.equal(JSON.stringify(result).includes('credentials'),false);
  assert.equal(calls,1);
  assert.equal(rows(db).length,1);
  assert.equal(invite(db).deliveryAttemptCount,1);
});

test('resend idempotency returns existing status without another delivery',async()=>{
  const db=fixture();const first=await send(db,{recipients:['alice@example.com']});
  let calls=0;
  const args={campaignId:'c',requestId:'resend-email-000003',
    sourceInviteId:first.results[0].inviteId,expectedRevision:1};
  const response=await resendCampaignEmailInvitation(db,'gm',args,opt({
    deliver:async()=>{calls++;return {status:'accepted',providerMessageId:'new'};}
  }));
  assert.equal(response.result.status,'accepted');
  // The original was revoked: further same request must not resend.
  await assert.rejects(resendCampaignEmailInvitation(db,'gm',args,opt({
    deliver:async()=>{calls++;throw Error('must not resend');}
  })),/cannot be resent/);
  assert.equal(calls,1);
});
