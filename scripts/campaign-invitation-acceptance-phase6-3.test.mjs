import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {issueSecureCampaignInvitation,assertSecureInvitationEligible}
  from '../functions/campaignSecureInvitations.mjs';
import {acceptSecureCampaignInvitation,previewSecureCampaignInvitation}
  from '../functions/campaignInvitationAcceptance.mjs';
import {changeSecureCampaignInvitation}
  from '../functions/campaignInvitationManager.mjs';
import {reviewCampaignJoinRequest} from '../functions/campaignJoinApproval.mjs';

const require=createRequire(import.meta.url);
const links=require('../js/secure-campaign-invite.js');
const key='S'.repeat(48),now=new Date('2026-11-09T08:00:00.000Z');
const clone=x=>structuredClone(x);
function fixture(overrides={}){
  const store=new Map([
    ['campaigns/c',{id:'c',ownerUid:'gm',name:'Asteria',ucn:'123456789012',
      membershipSchemaVersion:2,partySize:4,
      joinPolicy:{joinRequestsOpen:true,autoApprove:true},...clone(overrides)}]
  ]);
  const get=ref=>{
    if(ref.isQuery){
      const docs=[...store.entries()].filter(([path,data])=>
        path.startsWith(ref.path+'/')&&!path.substring(ref.path.length+1).includes('/')&&
        (!ref.filter||data[ref.filter[0]]===ref.filter[2]))
        .map(([path,data])=>({id:path.substring(ref.path.length+1),data:()=>clone(data)}));
      return {docs,size:docs.length};
    }
    return {exists:store.has(ref.path),data:()=>clone(store.get(ref.path))};
  };
  const db={store,doc:path=>({path,get:async()=>get({path})}),
    collection:path=>({path,isQuery:true,
      where(field,op,value){return {...this,filter:[field,op,value]};},
      async get(){return get(this);}}),
    async runTransaction(fn){
      const writes=[];
      const tx={
        async get(ref){return get(ref);},
        create(ref,data){
          if(store.has(ref.path)||writes.some(([,path])=>path===ref.path))
            throw Error('already exists');
          writes.push(['create',ref.path,clone(data)]);
        },
        update(ref,data){
          if(!store.has(ref.path))throw Error('missing');
          writes.push(['update',ref.path,clone(data)]);
        },
        set(ref,data){writes.push(['set',ref.path,clone(data)]);}
      };
      const result=await fn(tx);
      for(const [op,path,value] of writes)
        store.set(path,op==='update'?{...store.get(path),...value}:value);
      return result;
    }
  };
  return db;
}
const alice={uid:'alice',email:'Alice@example.com',emailVerified:true};
const bob={uid:'bob',email:'Bob@example.com',emailVerified:true};
async function issue(db,options={}){
  const input={
    campaignId:'c',requestId:options.requestId||'secure-invite-req-0001',
    type:options.type||'share-link',
    roleOffered:options.roleOffered||'player',
    recipientEmail:options.recipientEmail??null,
    recipientUid:options.recipientUid??null,
    expiresInHours:options.expiresInHours||24,
    maxUses:options.maxUses||1,requiresGMApproval:true
  };
  return issueSecureCampaignInvitation(db,'gm',input,{
    signingKey:key,now,
    tokenFactory:()=>randomBytes(32).toString('base64url')
  });
}
const args=issued=>({campaignId:'c',inviteId:issued.inviteId,token:issued.token});
const preview=(db,issued,who=alice,when=now)=>previewSecureCampaignInvitation(db,who,args(issued),{
  signingKey:key,now:when
});
const accept=(db,issued,who=alice,when=now)=>acceptSecureCampaignInvitation(db,who,args(issued),{
  signingKey:key,now:when
});

test('valid invitation previews campaign metadata without creating access',async()=>{
  const db=fixture(),issued=await issue(db);
  const original=clone(db.store.get('campaigns/c'));
  const output=await preview(db,issued);
  assert.equal(output.campaignName,'Asteria');
  assert.equal(output.roleOffered,'player');
  assert.equal(output.requiresGMApproval,true);
  assert.equal(output.status,'available');
  assert.deepEqual(db.store.get('campaigns/c'),original);
  assert.equal(db.store.has('campaigns/c/joinRequests/alice'),false);
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).usedCount,0);
});

test('acceptance creates ONLY pending join request and canonical per-user receipt',async()=>{
  const db=fixture(),issued=await issue(db);
  const root=clone(db.store.get('campaigns/c'));
  const result=await accept(db,issued);
  assert.equal(result.status,'pending');
  assert.equal(result.offeredRole,'player');
  assert.equal(result.alreadyExists,false);
  const req=db.store.get('campaigns/c/joinRequests/alice');
  assert.equal(req.uid,'alice');
  assert.equal(req.status,'pending');
  assert.equal(req.source,'secure-invite');
  assert.equal(req.inviteId,issued.inviteId);
  assert.equal(req.requestedCharacterId,null);
  assert.deepEqual(db.store.get('campaigns/c'),root);
  assert.equal(db.store.has('campaigns/c/members/alice'),false);
  assert.equal(db.store.has('campaignMemberProjections/alice/campaigns/c'),false);
  assert.equal(db.store.has('campaigns/c/characters/alice'),false);
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).usedCount,1);
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).status,'exhausted');
  assert.equal(db.store.get('campaignJoinRequestThrottle/alice').created,1);
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId+'/claims/alice').uid,'alice');
  assert.equal(db.store.get('campaigns/c/auditEvents/secure-invite-claim-'+issued.inviteId+'-alice').action,'claim');
  assert.equal(JSON.stringify([...db.store.values()]).includes(issued.token),false);
});

test('claim replays do not consume another use, even when invitation is exhausted',async()=>{
  const db=fixture(),issued=await issue(db);
  await accept(db,issued);
  const again=await accept(db,issued,alice,new Date(now.getTime()+86400000*3));
  assert.equal(again.alreadyExists,true);
  assert.equal(again.status,'pending');
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).usedCount,1);
  assert.equal(db.store.get('campaignJoinRequestThrottle/alice').created,1);
  const info=await preview(db,issued,alice,new Date(now.getTime()+86400000*3));
  assert.equal(info.alreadyExists,true);
  assert.equal(info.status,'pending');
});

test('one-time token cannot be claimed by a different account after use',async()=>{
  const db=fixture(),issued=await issue(db);
  await accept(db,issued);
  await assert.rejects(accept(db,issued,bob),/unavailable/);
  assert.equal(db.store.has('campaigns/c/joinRequests/bob'),false);
});

test('multi-use share-link accepts distinct members until exhausted',async()=>{
  const db=fixture(),issued=await issue(db,{maxUses:2});
  await accept(db,issued,alice);
  await accept(db,issued,bob);
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).usedCount,2);
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).status,'exhausted');
  await assert.rejects(accept(db,issued,{uid:'eve'}),/unavailable/);
});

test('revoked, expired and forged invitations cannot create new requests',async()=>{
  const db=fixture(),issued=await issue(db);
  await changeSecureCampaignInvitation(db,'gm',{
    campaignId:'c',inviteId:issued.inviteId,action:'revoke',expectedRevision:1
  },{now});
  await assert.rejects(preview(db,issued),/unavailable/);
  await assert.rejects(accept(db,issued),/unavailable/);
  const next=await issue(db,{requestId:'secure-invite-req-0002',expiresInHours:1});
  await assert.rejects(accept(db,next,alice,new Date(now.getTime()+3600000)),/unavailable/);
  await assert.rejects(acceptSecureCampaignInvitation(db,alice,{
    ...args(next),token:randomBytes(32).toString('base64url')
  },{signingKey:key,now}),/unavailable/);
  assert.equal(db.store.has('campaigns/c/joinRequests/alice'),false);
});

test('verified recipient email and account binding enforced, with no unverified acceptance',async()=>{
  const db=fixture(),issued=await issue(db,{
    type:'email',recipientEmail:'Alice@Example.com',recipientUid:'alice'
  });
  await assert.rejects(accept(db,issued,bob),/unavailable/);
  await assert.rejects(accept(db,issued,{...alice,emailVerified:false}),/unavailable/);
  await assert.rejects(accept(db,issued,{...alice,email:'other@example.com'}),/unavailable/);
  const result=await accept(db,issued);
  assert.equal(result.status,'pending');
});

test('existing UCN join request is never overwritten or double-charged',async()=>{
  const db=fixture(),issued=await issue(db);
  db.store.set('campaigns/c/joinRequests/alice',{
    uid:'alice',campaignId:'c',source:'ucn',
    status:'pending',revision:1,requestedCharacterId:'hero'
  });
  await assert.rejects(accept(db,issued),/existing campaign join request/);
  assert.equal(db.store.get('campaigns/c/joinRequests/alice').source,'ucn');
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).usedCount,0);
});

test('removed, suspended and banned accounts cannot use invitations to bypass restrictions',async()=>{
  for(const status of ['removed','suspended','banned']){
    const db=fixture(),issued=await issue(db);
    db.store.set('campaigns/c/members/alice',{uid:'alice',
      campaignId:'c',role:'player',status});
    await assert.rejects(accept(db,issued),/cannot request access/);
    assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).usedCount,0);
  }
});

test('closed join policy and v1 campaign reject claims without consuming quota',async()=>{
  const db=fixture(),issued=await issue(db);
  db.store.get('campaigns/c').joinPolicy.joinRequestsOpen=false;
  await assert.rejects(accept(db,issued),/unavailable/);
  db.store.get('campaigns/c').joinPolicy.joinRequestsOpen=true;
  db.store.get('campaigns/c').membershipSchemaVersion=1;
  await assert.rejects(accept(db,issued),/unavailable/);
  assert.equal(db.store.get('campaigns/c/invitations/'+issued.inviteId).usedCount,0);
});

test('co-GM invitation is only an offer; actual approved membership remains player',async()=>{
  const db=fixture(),issued=await issue(db,{roleOffered:'co-gm'});
  assert.equal((await accept(db,issued)).offeredRole,'co-gm');
  const approved=await reviewCampaignJoinRequest(db,'gm',{
    campaignId:'c',requestUid:'alice',decision:'approve',expectedRevision:1
  },{now});
  assert.equal(approved.status,'approved');
  assert.equal(db.store.get('campaigns/c/members/alice').role,'player');
  assert.equal(db.store.get('campaignMemberProjections/alice/campaigns/c').role,'player');
});

test('secure URL parser rejects malformed formats and never uses query strings',()=>{
  const inviteId='a'.repeat(64),token='A'.repeat(43);
  const url=links.link('https://asteria.example/index.html?x=1',
    'campaign_abc',inviteId,token);
  assert.equal(links.parse(new URL(url).hash).token,token);
  for(const value of [
    '#secure-campaign-invite=bad','#/compendium?token='+token,
    '#secure-campaign-invite=../../secret.'+inviteId+'.'+token,
    '#secure-campaign-invite=c.'+inviteId+'.'+token.slice(0,42),
    '#secure-campaign-invite=c.'+inviteId+'.'+token+'.extra'
  ])assert.equal(links.parse(value),null);
  assert.throws(()=>links.link('javascript:alert(1)','c',inviteId,token),/Invalid/);
  assert.equal(links.parse('#campaign-invite=123456789012'),null);
});
