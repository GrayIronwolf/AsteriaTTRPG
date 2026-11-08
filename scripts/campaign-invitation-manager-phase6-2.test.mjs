import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {issueSecureCampaignInvitation,assertSecureInvitationEligible}
  from '../functions/campaignSecureInvitations.mjs';
import {listSecureCampaignInvitations,changeSecureCampaignInvitation}
  from '../functions/campaignInvitationManager.mjs';

const signingKey='k'.repeat(48);
const t0=new Date('2026-11-09T08:00:00.000Z');
const clone=x=>structuredClone(x);
function fixture(overrides={}){
  const store=new Map([['campaigns/c',{
    id:'c',ownerUid:'gm',membershipSchemaVersion:2,name:'Campaign',
    party:['player-a'],players:{alice:{characterIds:['hero']}},
    joinPolicy:{joinRequestsOpen:true},...clone(overrides)
  }]]);
  function read(ref){
    if(ref.query){
      let docs=[...store.entries()].filter(([path])=>
        path.startsWith(ref.path+'/')&&
        !path.substring(ref.path.length+1).includes('/'))
        .map(([path,data])=>({id:path.substring(ref.path.length+1),
          data:()=>clone(data),ref:{path}}))
        .sort((a,b)=>{
          const x=store.get(a.ref.path),y=store.get(b.ref.path);
          const diff=new Date(y.createdAt).getTime()-new Date(x.createdAt).getTime();
          return diff||a.id.localeCompare(b.id);
        });
      if(ref.cursor){
        const index=docs.findIndex(row=>row.id===ref.cursor.id);
        docs=index>=0?docs.slice(index+1):[];
      }
      if(ref.size)docs=docs.slice(0,ref.size);
      return {docs,size:docs.length};
    }
    return {exists:store.has(ref.path),data:()=>clone(store.get(ref.path))};
  }
  const db={store,
    doc:path=>({path,get:async()=>read({path})}),
    collection:path=>({path,query:true,orderBy(){return this;},
      limit(n){return {...this,size:n};},
      startAfter(snap){return {...this,cursor:{id:snap.data().inviteId}};},
      async get(){return read(this);}
    }),
    async runTransaction(callback){
      const writes=[];
      const tx={
        get:async ref=>read(ref),
        create(ref,data){
          if(store.has(ref.path)||writes.some(row=>row[1]===ref.path))
            throw Error('Already exists');
          writes.push(['create',ref.path,clone(data)]);
        },
        set(ref,data){writes.push(['set',ref.path,clone(data)]);},
        update(ref,data){
          if(!store.has(ref.path))throw Error('Missing');
          writes.push(['update',ref.path,clone(data)]);
        }
      };
      const result=await callback(tx);
      for(const [action,path,data] of writes)
        store.set(path,action==='update'?{...store.get(path),...data}:data);
      return result;
    }
  };
  return db;
}
async function issue(db,requestId='secure-issue-000001',now=t0,options={}){
  return issueSecureCampaignInvitation(db,'gm',{
    campaignId:'c',requestId,expiresInHours:24,maxUses:1,
    requiresGMApproval:true,...options
  },{signingKey,now,tokenFactory:()=>randomBytes(32).toString('base64url')});
}
const change=(db,issued,action,expectedRevision=1,uid='gm')=>
  changeSecureCampaignInvitation(db,uid,{
    campaignId:'c',inviteId:issued.inviteId,action,expectedRevision
  },{now:new Date(t0.getTime()+5000)});

test('manager listing returns safe metadata without tokens, digests or campaign changes',async()=>{
  const db=fixture(),before=clone(db.store.get('campaigns/c'));
  const issued=await issue(db);
  const result=await listSecureCampaignInvitations(db,'gm',{campaignId:'c'},{now:t0});
  assert.equal(result.invitations.length,1);
  assert.equal(result.invitations[0].inviteId,issued.inviteId);
  assert.equal(result.invitations[0].status,'active');
  assert.equal(result.invitations[0].recipientEmail,null);
  assert.equal(result.nextCursor,null);
  assert.equal(JSON.stringify(result).includes(issued.token),false);
  assert.equal(JSON.stringify(result).includes(
    db.store.get('campaigns/c/invitations/'+issued.inviteId).tokenDigest),false);
  assert.deepEqual(db.store.get('campaigns/c'),before);
});

test('owner-only manager denies members and outsiders, including legacy-role GMs',async()=>{
  const db=fixture({gmUids:['gm','co'],roles:{co:'gm'}});
  await issue(db);
  for(const uid of ['alice','co','eve']){
    await assert.rejects(listSecureCampaignInvitations(db,uid,{campaignId:'c'}),/Only the owner/);
    const issued=(await listSecureCampaignInvitations(db,'gm',{campaignId:'c'})).invitations[0];
    await assert.rejects(change(db,issued,'revoke',1,uid),/Only the owner/);
  }
  db.store.get('campaigns/c').membershipSchemaVersion=1;
  await assert.rejects(listSecureCampaignInvitations(db,'gm',{campaignId:'c'}),/Only the owner/);
});

test('revocation immediately invalidates a previously copied token, without removing players',async()=>{
  const db=fixture(),issued=await issue(db),snapshot=clone(db.store.get('campaigns/c'));
  const doc=db.store.get('campaigns/c/invitations/'+issued.inviteId);
  const check=()=>assertSecureInvitationEligible(doc,{
    campaignId:'c',inviteId:issued.inviteId,token:issued.token,
    claimantUid:'alice',now:new Date(t0.getTime()+5000),signingKey
  });
  assert.equal(check().requiresGMApproval,true);
  const changed=await change(db,issued,'revoke');
  assert.equal(changed.status,'revoked');
  assert.equal(changed.revision,2);
  assert.equal(changed.alreadyApplied,false);
  assert.throws(check,/unavailable/);
  assert.deepEqual(db.store.get('campaigns/c'),snapshot);
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).token,undefined);
  assert.equal(db.store.get('campaigns/c/auditEvents/invite-management-'+issued.inviteId+'-r1').action,'revoke');
});

test('expiring invitation is terminal and replay by same owner is idempotent',async()=>{
  const db=fixture(),issued=await issue(db);
  const expired=await change(db,issued,'expire');
  assert.equal(expired.status,'expired');
  assert.equal((await change(db,issued,'expire')).alreadyApplied,true);
  assert.equal(db.store.get('campaigns/c/auditEvents/invite-management-'+issued.inviteId+'-r1').revision,2);
  await assert.rejects(change(db,issued,'revoke'),/no longer active/);
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).status,'expired');
});

test('stale revisions and forged invite ids cannot mutate records',async()=>{
  const db=fixture(),issued=await issue(db);
  await assert.rejects(change(db,issued,'revoke',2),/changed/);
  await assert.rejects(changeSecureCampaignInvitation(db,'gm',{
    campaignId:'c',inviteId:'0'.repeat(64),action:'revoke',expectedRevision:1
  }),/not found/);
  await change(db,issued,'revoke');
  await assert.rejects(change(db,issued,'expire',1),/no longer active/);
});

test('manager displays expiration and exhaustion without granting or renewing access',async()=>{
  const db=fixture(),issued=await issue(db);
  const now=new Date(t0.getTime()+86400000);
  const summary=await listSecureCampaignInvitations(db,'gm',{campaignId:'c'},{now});
  assert.equal(summary.invitations[0].status,'expired');
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).status,'active');
  db.store.get('campaigns/c/invitations/'+issued.inviteId).usedCount=1;
  const exhausted=await listSecureCampaignInvitations(db,'gm',{campaignId:'c'},{now:t0});
  assert.equal(exhausted.invitations[0].status,'exhausted');
  assert.equal(exhausted.invitations[0].usedCount,1);
});

test('pagination returns 25 records and a safe next-page cursor',async()=>{
  const db=fixture();
  for(let i=0;i<28;i++)await issue(db,
    'secure-issue-'+String(i).padStart(6,'0'),
    new Date(t0.getTime()+i*86400000));
  const first=await listSecureCampaignInvitations(db,'gm',{campaignId:'c'});
  assert.equal(first.invitations.length,25);
  assert.match(first.nextCursor,/^[0-9a-f]{64}$/);
  const second=await listSecureCampaignInvitations(db,'gm',{
    campaignId:'c',cursor:first.nextCursor
  });
  assert.equal(second.invitations.length,3);
  assert.equal(second.nextCursor,null);
  const distinct=new Set([...first.invitations,...second.invitations].map(x=>x.inviteId));
  assert.equal(distinct.size,28);
});

test('malformed records or tampered ownership fail closed',async()=>{
  const db=fixture(),issued=await issue(db);
  db.store.get('campaigns/c/invitations/'+issued.inviteId).createdByUid='mallory';
  await assert.rejects(listSecureCampaignInvitations(db,'gm',{campaignId:'c'}),/reconciliation/);
  await assert.rejects(change(db,issued,'revoke'),/reconciliation/);
});

test('email metadata is owner-only, no secret or token is returned',async()=>{
  const db=fixture(),issued=await issue(db,'secure-email-0000001',t0,{
    type:'email',recipientEmail:' Person@Example.COM ',maxUses:1
  });
  const rows=(await listSecureCampaignInvitations(db,'gm',{campaignId:'c'})).invitations;
  assert.equal(rows[0].recipientEmail,'person@example.com');
  assert.equal(rows[0].recipientUid,null);
  assert.equal(rows[0].inviteId,issued.inviteId);
  assert.equal(JSON.stringify(rows).includes(issued.token),false);
});
