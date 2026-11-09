import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAsteriaInvitationEmail,
  resendIdempotencyKey,
  inspectAsteriaEmailConfig,
  deliverAsteriaInvitationEmail
} from '../functions/campaignEmailTransport.mjs';
import {asteriaResendApiKeySecret,deliverAsteriaInvitationFromCloudFunction}
  from '../functions/campaignEmailSecrets.mjs';

const campaignId='campaign01',inviteId='a'.repeat(64),token='B'.repeat(43);
const invitationUrl='https://asteriattrpg.com/#secure-campaign-invite='+
  campaignId+'.'+inviteId+'.'+token;
const base=Object.freeze({
  campaignId,inviteId,invitationUrl,recipientEmail:' Player@Example.com ',
  campaignName:'The Frost Throne',inviterName:'Asteria GM',
  roleOffered:'player',expiresAt:new Date('2026-12-01T16:00:00.000Z')
});
const verifiedConfig=Object.freeze({
  ASTERIA_EMAIL_DELIVERY_ENABLED:'1',
  ASTERIA_EMAIL_FROM:'invites@mail.asteriattrpg.com',
  ASTERIA_EMAIL_SENDING_DOMAIN:'mail.asteriattrpg.com',
  ASTERIA_EMAIL_DOMAIN_VERIFIED:'1'
});
const key='re_'+'k'.repeat(35);

test('branded email includes plain-text fallback, no external images, approval warning',()=>{
  const mail=buildAsteriaInvitationEmail(base);
  assert.equal(mail.to,'player@example.com');
  assert.match(mail.subject,/The Frost Throne/);
  for(const text of [mail.text,mail.html]){
    assert.match(text,/The Frost Throne/);
    assert.match(text,/Asteria TTRPG/i);
    assert.match(text,/GM approval/);
    assert.match(text,/secure-campaign-invite/);
    assert.match(text,/Co-GM privileges/);
  }
  assert.match(mail.html,/background:#101822/);
  assert.match(mail.html,/background:#d7bf87/);
  assert.match(mail.html,/lang="en"/);
  assert.doesNotMatch(mail.html,/<img|javascript:|<script|http:\/\/|tracking/i);
  assert.equal((mail.html.match(/href=/g)||[]).length,1);
  assert.match(mail.text,/2026/);
});

test('untrusted names are escaped, control characters and invalid emails fail',()=>{
  const mail=buildAsteriaInvitationEmail({
    ...base,campaignName:'Asteria <script>alert(1)</script>',
    inviterName:'GM "& Friends'
  });
  assert.doesNotMatch(mail.html,/<script>/);
  assert.match(mail.html,/&lt;script&gt;/);
  assert.match(mail.html,/&quot;&amp; Friends/);
  assert.match(mail.text,/<script>alert/);
  for(const input of [
    {...base,recipientEmail:'not-an-email'},
    {...base,campaignName:'\nHeader: injected'},
    {...base,inviterName:''},
    {...base,roleOffered:'owner'},
    {...base,expiresAt:'invalid-date'},
    {...base,invitationUrl:'https://evil.example/#secure-campaign-invite='+campaignId+'.'+inviteId+'.'+token},
    {...base,invitationUrl:'http://asteriattrpg.com/#secure-campaign-invite='+campaignId+'.'+inviteId+'.'+token},
    {...base,invitationUrl:'https://asteriattrpg.com/?redirect=evil#secure-campaign-invite='+campaignId+'.'+inviteId+'.'+token},
    {...base,invitationUrl:'https://asteriattrpg.com/#secure-campaign-invite='+campaignId+'.'+inviteId+'.'+token.slice(1)},
    {...base,invitationUrl:'https://asteriattrpg.com/#secure-campaign-invite=wrong.'+inviteId+'.'+token}
  ])assert.throws(()=>buildAsteriaInvitationEmail(input));
});

test('a co-GM email makes no claim of automatic role promotion',()=>{
  const mail=buildAsteriaInvitationEmail({...base,roleOffered:'co-gm'});
  assert.match(mail.html,/Co-GM \(subject to separate GM role assignment\)/);
  assert.match(mail.text,/request for GM approval/);
});

test('sender must match an explicit Asteria subdomain and verified gate',()=>{
  const actual=inspectAsteriaEmailConfig(verifiedConfig);
  assert.deepEqual(actual,{
    provider:'resend',enabled:true,domainConfigured:true,domainVerified:true
  });
  for(const from of [
    'attacker@example.com','support@other.asteria.com','support@asteriattrpg.com.evil.org',
    'spoof@mail.asteriattrpg.com.evil.org'
  ])assert.equal(inspectAsteriaEmailConfig({
    ...verifiedConfig,ASTERIA_EMAIL_FROM:from
  }).domainConfigured,false);
  assert.equal(inspectAsteriaEmailConfig({
    ...verifiedConfig,ASTERIA_EMAIL_SENDING_DOMAIN:'example.com',
    ASTERIA_EMAIL_FROM:'support@example.com'
  }).domainConfigured,false);
  assert.equal(inspectAsteriaEmailConfig({
    ...verifiedConfig,ASTERIA_EMAIL_DOMAIN_VERIFIED:'0'
  }).domainVerified,false);
  assert.equal(inspectAsteriaEmailConfig({}).enabled,false);
});

test('default-disabled gate never reads API credentials or performs fetch',async()=>{
  let calls=0;
  const result=await deliverAsteriaInvitationEmail(base,{
    env:{...verifiedConfig,ASTERIA_EMAIL_DELIVERY_ENABLED:'0'},
    fetchImpl:async()=>{calls++;throw Error('Unexpected request');}
  });
  assert.deepEqual(result,{status:'disabled',provider:'resend'});
  assert.equal(calls,0);
  assert.equal(typeof asteriaResendApiKeySecret.value,'function');
  const wrapper=await deliverAsteriaInvitationFromCloudFunction(base,{env:{}});
  assert.equal(wrapper.status,'disabled');
});

test('enabled but incomplete configuration fails closed before network',async()=>{
  let calls=0;
  const fake=async()=>{calls++;return {ok:true,json:async()=>({id:'test'})};};
  await assert.rejects(deliverAsteriaInvitationEmail(base,{
    env:{...verifiedConfig,ASTERIA_EMAIL_DOMAIN_VERIFIED:'0'},apiKey:key,fetchImpl:fake
  }),/not verified/);
  await assert.rejects(deliverAsteriaInvitationEmail(base,{
    env:verifiedConfig,apiKey:'invalid',fetchImpl:fake
  }),/credentials/);
  assert.equal(calls,0);
});

test('provider payload contains both templates; idempotency is stable and private',async()=>{
  const requests=[];
  const result=await deliverAsteriaInvitationEmail(base,{
    env:verifiedConfig,apiKey:key,
    fetchImpl:async(url,options)=>{
      requests.push({url,options});
      return {ok:true,status:200,json:async()=>({id:'email_123456'})};
    }
  });
  assert.deepEqual(result,{status:'accepted',provider:'resend',providerMessageId:'email_123456'});
  assert.equal(requests.length,1);
  const {url,options}=requests[0];
  assert.equal(url,'https://api.resend.com/emails');
  assert.equal(options.method,'POST');
  assert.equal(options.headers.Authorization,'Bearer '+key);
  assert.equal(options.headers['Content-Type'],'application/json');
  assert.equal(options.headers['Idempotency-Key'],
    resendIdempotencyKey(campaignId,inviteId,base.recipientEmail));
  assert.equal(options.headers['Idempotency-Key'].includes(token),false);
  assert.equal(options.headers['Idempotency-Key'].includes('player@example.com'),false);
  const body=JSON.parse(options.body);
  assert.equal(body.from,'Asteria TTRPG <invites@mail.asteriattrpg.com>');
  assert.deepEqual(body.to,['player@example.com']);
  assert.match(body.text,/Review invitation: https:\/\//);
  assert.match(body.html,/Review Invitation/);
  assert.equal(Object.hasOwn(body,'attachments'),false);
  assert.equal(resendIdempotencyKey(campaignId,inviteId,'player@example.com'),
    resendIdempotencyKey(campaignId,inviteId,'PLAYER@example.com'));
  assert.notEqual(resendIdempotencyKey(campaignId,inviteId,'x@example.com'),
    options.headers['Idempotency-Key']);
});

test('failed provider never leaks provider response, secret or invitation link',async()=>{
  for(const status of [400,401,429,500]){
    await assert.rejects(deliverAsteriaInvitationEmail(base,{
      env:verifiedConfig,apiKey:key,
      fetchImpl:async()=>({ok:false,status,json:async()=>({
        error:'SECRET '+key+' '+token
      })})
    }),e=>{
      assert.equal(e.message.includes(key),false);
      assert.equal(e.message.includes(token),false);
      return true;
    });
  }
  await assert.rejects(deliverAsteriaInvitationEmail(base,{
    env:verifiedConfig,apiKey:key,
    fetchImpl:async()=>{throw Error(key+' '+token);}
  }),e=>{
    assert.equal(e.message.includes(key),false);
    assert.equal(e.message.includes(token),false);
    return true;
  });
  await assert.rejects(deliverAsteriaInvitationEmail(base,{
    env:verifiedConfig,apiKey:key,
    fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw Error(token);}})
  }),/provider response was invalid/);
});
