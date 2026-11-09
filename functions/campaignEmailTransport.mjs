import {createHash} from 'node:crypto';
import {normalizedInviteEmail} from './campaignSecureInvitations.mjs';

// Phase 7.1: server-only, reusable email infrastructure. No Cloud Function
// sending entry point or browser API is exported until Phase 7.2.
const RESEND_ENDPOINT='https://api.resend.com/emails';
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const INVITE=/^[a-f0-9]{64}$/;
const MAILBOX=/^[a-z0-9][a-z0-9._%+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;
const DOMAIN=/^(?:[a-z0-9]+(?:-[a-z0-9]+)*\.)+[a-z]{2,}$/;
const LABEL_LIMIT=120;
const DATE_FMT=new Intl.DateTimeFormat('en-AU',{
  dateStyle:'long',timeStyle:'short',timeZone:'UTC'
});
const htmlEscape=value=>String(value)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function safeLabel(value,name){
  if(typeof value!=='string'||!value.trim()||value.length>LABEL_LIMIT)
    throw Error('Invalid '+name+'.');
  if([...value].some(character=>{
    const code=character.charCodeAt(0);
    return code<32||code===127;
  }))throw Error('Invalid '+name+'.');
  return value.trim();
}
function validateInvitationUrl(link,inviteId,campaignId){
  if(typeof link!=='string'||link.length>1000)throw Error('Invalid secure invitation URL.');
  let parsed;
  try{parsed=new URL(link);}catch{throw Error('Invalid secure invitation URL.');}
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||
    parsed.hostname.toLowerCase()!=='asteriattrpg.com'||
    !['/','/index.html'].includes(parsed.pathname)||parsed.search)
    throw Error('Invalid secure invitation URL.');
  const parts=parsed.hash.match(/^#secure-campaign-invite=([A-Za-z0-9_-]{1,160})\.([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/);
  if(!parts||parts[1]!==campaignId||parts[2]!==inviteId)
    throw Error('Invalid secure invitation URL.');
  return parsed.href;
}
function expiryDate(value){
  const date=value?.toDate?.()||value;
  const parsed=date instanceof Date?date:new Date(date);
  if(!Number.isFinite(parsed.getTime()))throw Error('Invalid invitation expiry.');
  return parsed;
}
function safeRole(role){
  if(role!=='player'&&role!=='co-gm')throw Error('Invalid invited role.');
  return role==='co-gm'?'Co-GM (subject to separate GM role assignment)':'Player';
}

/**
 * Only called on the server using the one-time token immediately after Phase
 * 6.1 issuance. Never cache this returned message, store its bearer URL in
 * Firestore, log it, or expose the email template as a browser API.
 */
export function buildAsteriaInvitationEmail({
  campaignId,inviteId,recipientEmail,campaignName,inviterName,
  roleOffered='player',invitationUrl,expiresAt
}={}){
  if(!ID.test(campaignId)||!INVITE.test(inviteId))
    throw Error('Invalid secure invitation identity.');
  const to=normalizedInviteEmail(recipientEmail);
  const campaign=safeLabel(campaignName,'campaign name');
  const inviter=safeLabel(inviterName,'inviter name');
  const role=safeRole(roleOffered);
  const expires=DATE_FMT.format(expiryDate(expiresAt))+' UTC';
  const link=validateInvitationUrl(invitationUrl,inviteId,campaignId);
  const subject='Invitation to '+campaign+' | Asteria TTRPG';
  const intro=inviter+' has invited you to join '+campaign+' in Asteria TTRPG.';
  const approval='Accepting this invitation submits a request for GM approval. It does not grant immediate campaign access or Co-GM privileges.';
  const text=[
    'ASTERIA TTRPG - CAMPAIGN INVITATION','',intro,'',
    'Offered role: '+role,'Expires: '+expires,'',
    'Review invitation: '+link,'',approval,'',
    'If you were not expecting this invitation, ignore this email.',
    'Do not forward this private invitation link.',
    'Asteria TTRPG'
  ].join('\n');
  const hCampaign=htmlEscape(campaign),hIntro=htmlEscape(intro),hRole=htmlEscape(role);
  const hExpiry=htmlEscape(expires),hUrl=htmlEscape(link),hApproval=htmlEscape(approval);
  const html=[
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width"></head>',
    '<body style="margin:0;background:#101822;color:#ecf1f4;font-family:Arial,Helvetica,sans-serif;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101822;padding:32px 12px;"><tr><td align="center">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1b2a38;border:1px solid #526476;">',
    '<tr><td style="padding:30px 32px 14px;text-align:center;">',
    '<div style="font-size:13px;letter-spacing:4px;color:#d7bf87;font-weight:bold;">ASTERIA TTRPG</div>',
    '<div style="height:1px;background:#526476;margin:20px 0;"></div>',
    '<h1 style="color:#f4f2e8;font-size:27px;font-family:Georgia,serif;margin:0 0 12px;">Campaign Invitation</h1>',
    '<p style="font-size:16px;line-height:1.6;color:#e5e9ee;">'+hIntro+'</p></td></tr>',
    '<tr><td style="padding:6px 32px 26px;">',
    '<div style="padding:20px;background:#14212d;border:1px solid #405366;">',
    '<p style="margin:0 0 8px;color:#d7bf87;font-size:12px;letter-spacing:1px;">CAMPAIGN</p>',
    '<p style="font-size:21px;font-family:Georgia,serif;color:#ffffff;margin:0 0 18px;">'+hCampaign+'</p>',
    '<p style="margin:0 0 8px;font-size:14px;color:#d9e2e9;">Role offered: '+hRole+'</p>',
    '<p style="margin:0;font-size:14px;color:#d9e2e9;">Expires: '+hExpiry+'</p></div>',
    '<p style="text-align:center;margin:28px 0;">',
    '<a href="'+hUrl+'" style="display:inline-block;background:#d7bf87;border:1px solid #d7bf87;color:#14202a;font-weight:bold;text-decoration:none;padding:14px 25px;">Review Invitation</a></p>',
    '<p style="font-size:13px;line-height:1.7;color:#c3ccd4;">'+hApproval+'</p>',
    '<p style="font-size:12px;line-height:1.7;color:#b0bac4;">Keep the link private. If you were not expecting this invitation, ignore this email.</p>',
    '</td></tr><tr><td style="border-top:1px solid #526476;padding:18px;text-align:center;font-size:12px;color:#acb9c5;">ASTERIA TTRPG</td></tr>',
    '</table></td></tr></table></body></html>'
  ].join('');
  return {to,subject,text,html};
}

export function resendIdempotencyKey(campaignId,inviteId,recipientEmail){
  if(!ID.test(campaignId)||!INVITE.test(inviteId))
    throw Error('Invalid secure invitation identity.');
  const address=normalizedInviteEmail(recipientEmail);
  const digest=createHash('sha256')
    .update('asteria-email-invitation-v1\0'+campaignId+'\0'+inviteId+'\0'+address)
    .digest('hex');
  return 'asteria-invite-'+digest;
}

export function inspectAsteriaEmailConfig(env=process.env){
  const enabled=env.ASTERIA_EMAIL_DELIVERY_ENABLED==='1';
  const domain=String(env.ASTERIA_EMAIL_SENDING_DOMAIN||'').toLowerCase().trim();
  const fromAddress=String(env.ASTERIA_EMAIL_FROM||'').toLowerCase().trim();
  const domainVerified=env.ASTERIA_EMAIL_DOMAIN_VERIFIED==='1';
  const allowed=DOMAIN.test(domain)&&
    (domain==='asteriattrpg.com'||domain.endsWith('.asteriattrpg.com'));
  const sender=MAILBOX.test(fromAddress)&&fromAddress.endsWith('@'+domain);
  // The flag is an operator attestation, not an automatic DNS lookup.
  return {provider:'resend',enabled,domainConfigured:allowed&&sender,
    domainVerified};
}

/**
 * Reusable provider adapter for a future *server-authorised* Phase 7.2 caller.
 * No public callable, Firestore trigger, email queue or automatic send is
 * created in Phase 7.1. Disabled means zero network requests.
 *
 * Only non-sensitive delivery status and provider ID are returned.
 * Never log request/response bodies, recipient address, token or API key.
 */
export async function deliverAsteriaInvitationEmail({
  campaignId,inviteId,recipientEmail,campaignName,inviterName,
  roleOffered,invitationUrl,expiresAt
}={}, {env=process.env,apiKey,fetchImpl=globalThis.fetch}={}){
  const config=inspectAsteriaEmailConfig(env);
  if(!config.enabled)return {status:'disabled',provider:'resend'};
  if(!config.domainConfigured||!config.domainVerified)
    throw Error('Email sending-domain configuration is not verified.');
  if(typeof apiKey!=='string'||apiKey.length<24||!apiKey.startsWith('re_'))
    throw Error('Email provider credentials are not configured.');
  if(typeof fetchImpl!=='function')throw Error('Email transport is unavailable.');
  const content=buildAsteriaInvitationEmail({
    campaignId,inviteId,recipientEmail,campaignName,inviterName,
    roleOffered,invitationUrl,expiresAt
  });
  const from='Asteria TTRPG <'+env.ASTERIA_EMAIL_FROM.toLowerCase().trim()+'>';
  const idempotency=resendIdempotencyKey(campaignId,inviteId,content.to);
  let response;
  try{
    response=await fetchImpl(RESEND_ENDPOINT,{
      method:'POST',
      headers:{
        Authorization:'Bearer '+apiKey,
        'Content-Type':'application/json',
        'Idempotency-Key':idempotency
      },
      body:JSON.stringify({
        from,to:[content.to],subject:content.subject,
        html:content.html,text:content.text
      }),
      signal:AbortSignal.timeout(8000)
    });
  }catch{
    throw Error('Email provider request failed; delivery status is unknown.');
  }
  if(!response?.ok){
    // Never expose provider raw error bodies or request content.
    if(response?.status===429||response?.status>=500)
      throw Error('Email provider is temporarily unavailable; retry with the same delivery ID.');
    throw Error('Email provider rejected the request; verify sender/domain configuration.');
  }
  let result;
  try{result=await response.json();}catch{
    throw Error('Email provider response was invalid; delivery status is unknown.');
  }
  if(typeof result?.id!=='string'||!result.id||result.id.length>200)
    throw Error('Email provider response was invalid; delivery status is unknown.');
  return {status:'accepted',provider:'resend',providerMessageId:result.id};
}
