import {
 CAMPAIGN_ID,SECURE_ID,SECURE_TOKEN,CAMPAIGN_UCN,normalizeUCN,
 safeJoinPreview,safeInvitationPreview,safeRequestState,
 validateMemberAction,validateRoleAction,validateDelegation
} from './campaignConnectionModel.mjs';

/** The existing Firebase Cloud Functions are the sole authority for campaign
 * joins, invitation tokens, roles, moderation and revocation.
 * This adapter never writes /members or /joinRequests directly.
 */
export function createFirebaseCampaignConnectionService({
 auth,functions,functionsSdk,readCanonical,enabled=false
}){
 if(!auth||!functions||!functionsSdk||typeof readCanonical!=='function')
  throw new Error('Existing Auth, Functions and canonical account profile required.');
 const availability=Object.freeze({enabled:enabled===true});
 const signedIn=async()=>{
  if(!availability.enabled)throw new Error('Campaign connections are not activated.');
  const user=auth.currentUser;
  if(!user?.uid)throw new Error('Sign in to use campaign connections.');
  const profile=await readCanonical(user);
  if(!profile||profile.uid!==user.uid||auth.currentUser?.uid!==user.uid)
   throw new Error('Your account ownership could not be verified.');
  return user.uid;
 };
 const same=uid=>{
  if(!auth.currentUser||auth.currentUser.uid!==uid)
   throw new Error('Account switched during campaign connection operation.');
 };
 const call=async(name,payload)=>{
  const uid=await signedIn();
  const response=await functionsSdk.httpsCallable(functions,name)(payload);
  same(uid);
  if(!response||!response.data||typeof response.data!=='object')
   throw new Error('Campaign server returned an invalid response.');
  return response.data;
 };
 const id=value=>{
  if(typeof value!=='string'||!CAMPAIGN_ID.test(value))
   throw new Error('Enter a valid campaign identifier.');
  return value;
 };
 const secure=(campaignId,inviteId,token)=>{
  id(campaignId);
  if(typeof inviteId!=='string'||!SECURE_ID.test(inviteId)||
     typeof token!=='string'||!SECURE_TOKEN.test(token))
   throw new Error('Secure invitation is invalid.');
  return {campaignId,inviteId,token};
 };
 async function lookupUCN(input){
  const code=normalizeUCN(input);
  if(!code)throw new Error('Enter the complete 12-digit campaign number.');
  const data=await call('asteriaCampaignUCN',{action:'preview',code});
  return safeJoinPreview(data);
 }
 async function requestStatus(campaignId,code){
  id(campaignId);
  const ucn=normalizeUCN(code);
  if(!ucn)throw new Error('Invalid UCN.');
  return safeRequestState(await call('asteriaCampaignJoinRequest',{
   action:'status',campaignId,ucn
  }),campaignId);
 }
 async function submitJoin(campaignId,code,characterId=null){
  id(campaignId);
  const ucn=normalizeUCN(code);
  if(!ucn)throw new Error('Invalid UCN.');
  if(characterId!==null&&(typeof characterId!=='string'||!CAMPAIGN_ID.test(characterId)))
   throw new Error('Choose an existing owned character.');
  return safeRequestState(await call('asteriaCampaignJoinRequest',{
   action:'submit',campaignId,ucn,characterId
  }),campaignId);
 }
 async function previewSecure(input){
  const args=secure(input?.campaignId,input?.inviteId,input?.token);
  return safeInvitationPreview(await call('asteriaSecureInvitation',{action:'preview',...args}));
 }
 async function acceptSecure(input){
  const args=secure(input?.campaignId,input?.inviteId,input?.token);
  const value=await call('asteriaSecureInvitation',{action:'accept',...args});
  return safeRequestState(value,args.campaignId);
 }
 async function issueInvite(campaignId,options={}){
  id(campaignId);
  const requestId=crypto.randomUUID();
  const roleOffered=options.roleOffered||'player';
  const expiresInHours=Number(options.expiresInHours??168);
  const maxUses=Number(options.maxUses??1);
  if(!['player','co-gm'].includes(roleOffered)||
     !Number.isInteger(expiresInHours)||expiresInHours<1||expiresInHours>720||
     !Number.isInteger(maxUses)||maxUses<1||maxUses>25)
   throw new Error('Choose a valid role, expiry and number of uses.');
  const result=await call('asteriaSecureInvitation',{
   action:'issue',campaignId,requestId,type:'share-link',
   roleOffered,expiresInHours,maxUses,recipientEmail:null,
   requiresGMApproval:true
  });
  if(result.campaignId!==campaignId||!SECURE_ID.test(result.inviteId)||
     result.alreadyIssued!==true&& !SECURE_TOKEN.test(result.token))
   throw new Error('Invitation response is missing its one-time credential.');
  return {campaignId,inviteId:result.inviteId,token:result.token||null,
   alreadyIssued:result.alreadyIssued===true,
   expiresAt:result.expiresAt||'',roleOffered:result.roleOffered};
 }
 async function invitations(campaignId,cursor=null){
  id(campaignId);
  if(cursor!==null&&!SECURE_ID.test(cursor))throw new Error('Invalid invitation cursor.');
  const r=await call('asteriaSecureInvitation',{action:'list',campaignId,cursor});
  if(r.campaignId!==campaignId||!Array.isArray(r.invitations))
   throw new Error('Invalid invitation list.');
  return {
   invitations:r.invitations.filter(item=>item.campaignId===campaignId&&
    SECURE_ID.test(item.inviteId)).map(item=>({
    inviteId:item.inviteId,type:item.type,roleOffered:item.roleOffered,
    status:item.status,revision:item.revision,
    expiresAt:item.expiresAt,usedCount:item.usedCount,maxUses:item.maxUses
   })),
   nextCursor:SECURE_ID.test(r.nextCursor)?r.nextCursor:null
  };
 }
 async function changeInvite(campaignId,record,managementAction){
  id(campaignId);
  if(!SECURE_ID.test(record?.inviteId)||!Number.isSafeInteger(record.revision)||
     !['revoke','expire'].includes(managementAction))
    throw new Error('Invalid invitation management action.');
  return call('asteriaSecureInvitation',{
   action:'change',campaignId,inviteId:record.inviteId,
   managementAction,expectedRevision:record.revision
  });
 }
 async function roster(campaignId){
  id(campaignId);
  const data=await call('asteriaCampaignJoinReview',{action:'roster',campaignId});
  if(data.campaignId!==campaignId||!['canonical','legacy'].includes(data.source)||
     !Array.isArray(data.active)||!Array.isArray(data.inactive))
   throw new Error('Campaign roster could not be verified.');
  return data;
 }
 async function joinQueue(campaignId){
  id(campaignId);
  const data=await call('asteriaCampaignJoinReview',{action:'list',campaignId});
  if(data.campaignId!==campaignId||!Array.isArray(data.requests))
   throw new Error('Campaign join queue could not be verified.');
  return data;
 }
 async function review(campaignId,row,decision){
  id(campaignId);
  if(!['approve','decline'].includes(decision)||
     !CAMPAIGN_ID.test(row?.uid)||!Number.isSafeInteger(row.revision))
   throw new Error('Invalid pending campaign request.');
  return call('asteriaCampaignJoinReview',{
   action:'review',campaignId,requestUid:row.uid,
   decision,expectedRevision:row.revision
  });
 }
 async function approvalMode(campaignId,mode){
  id(campaignId);
  if(!['manual','automatic'].includes(mode))throw new Error('Invalid approval mode.');
  return call('asteriaCampaignJoinReview',{action:'mode',campaignId,mode});
 }
 async function moderate(campaignId,row,action,reason=''){
  id(campaignId);
  return call('asteriaCampaignJoinReview',{action:'member-control',campaignId,
   ...validateMemberAction(row,action,reason)});
 }
 async function role(campaignId,row,nextRole){
  id(campaignId);
  return call('asteriaCampaignJoinReview',{action:'role-change',campaignId,
   ...validateRoleAction(row,nextRole)});
 }
 async function delegate(campaignId,row,capability,enabled){
  id(campaignId);
  return call('asteriaCampaignJoinReview',{action:'permission-change',campaignId,
   ...validateDelegation(row,capability,enabled)});
 }
 async function activity(campaignId){
  id(campaignId);
  const data=await call('asteriaCampaignJoinReview',{action:'activity',campaignId});
  if(data.campaignId!==campaignId||!Array.isArray(data.events))
   throw new Error('Invalid campaign membership audit trail.');
  return data;
 }
 return Object.freeze({
  availability:()=>availability,lookupUCN,requestStatus,submitJoin,
  previewSecure,acceptSecure,issueInvite,invitations,changeInvite,
  roster,joinQueue,review,approvalMode,moderate,role,delegate,activity
 });
}
