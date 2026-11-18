/**
 * Phase 5.2: editable campaign presentation fields. Existing Firestore campaign
 * membership, invitations, gameplay, UCN and character records are NOT editable.
 */
export const DEFAULT_ACCESS=Object.freeze({
  dashboard:true,inventory:true,spells:true,journal:true,quests:true,notes:false
});
export const DEFAULT_SETTINGS=Object.freeze({
  partySize:4,visibility:'private',inviteRequired:true,
  allowPlayerCreateCharacter:true,allowPlayerLinkCharacter:true
});
export const ACCESS_FIELDS=Object.freeze(Object.keys(DEFAULT_ACCESS));
export const PLAYER_SETTINGS=Object.freeze([
  'allowPlayerCreateCharacter','allowPlayerLinkCharacter'
]);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
export const CAMPAIGN_ID=/^[A-Za-z0-9_-]{1,160}$/;
export const UCN=/^[0-9]{12}$/;
const bool=(value,fallback)=>typeof value==='boolean'?value:fallback;
const validRecord=value=>value&&typeof value==='object'&&!Array.isArray(value);
const numeric=(value,fallback)=>{
  const result=Number(value);
  return Number.isInteger(result)?result:fallback;
};
/** Conservative v1 defaults; no implicit change to join/visibility policy. */
export function newCampaignDraft(){
  return {name:'',description:'',partySize:4,
    settings:{...DEFAULT_SETTINGS},access:{...DEFAULT_ACCESS}};
}
export function editCampaignDraft(campaign){
  if(!validRecord(campaign)||!CAMPAIGN_ID.test(String(campaign.id||''))||
    typeof campaign.ownerUid!=='string')throw new Error('Verified campaign required.');
  const base=newCampaignDraft();
  const settings=validRecord(campaign.settings)?campaign.settings:{};
  const access=validRecord(campaign.access)?campaign.access:{};
  const partySize=own(campaign,'partySize')?campaign.partySize:
    own(settings,'partySize')?settings.partySize:base.partySize;
  return {
    name:String(campaign.name||'').slice(0,120),
    description:String(campaign.description||'').slice(0,4000),
    partySize:numeric(partySize,4),
    settings:{
      partySize:numeric(partySize,4),
      visibility:settings.visibility||base.settings.visibility,
      inviteRequired:bool(settings.inviteRequired,true),
      allowPlayerCreateCharacter:bool(settings.allowPlayerCreateCharacter,true),
      allowPlayerLinkCharacter:bool(settings.allowPlayerLinkCharacter,true)
    },
    access:Object.fromEntries(ACCESS_FIELDS.map(key=>[
      key,bool(access[key],DEFAULT_ACCESS[key])
    ]))
  };
}
export function validateCampaignDraft(draft){
  const errors=[];
  if(!validRecord(draft))return [{field:'campaign',message:'Campaign fields are missing.'}];
  if(typeof draft.name!=='string'||draft.name.trim().length<1||
     draft.name.trim().length>120)
    errors.push({field:'name',message:'Enter a campaign name of 1–120 characters.'});
  if(typeof draft.description!=='string'||draft.description.length>4000)
    errors.push({field:'description',message:'Campaign description must be at most 4,000 characters.'});
  if(!Number.isInteger(draft.partySize)||draft.partySize<1||draft.partySize>12)
    errors.push({field:'partySize',message:'Choose a party size between 1 and 12.'});
  for(const key of PLAYER_SETTINGS)
    if(typeof draft.settings?.[key]!=='boolean')
      errors.push({field:key,message:'Invalid campaign character permission.'});
  for(const key of ACCESS_FIELDS)
    if(typeof draft.access?.[key]!=='boolean')
      errors.push({field:key,message:'Invalid campaign access setting.'});
  // Phase 5.3 owns membership admission and invitation policy. Never make a
  // previously private campaign public through this editor.
  if(draft.settings?.visibility!=='private'||
     draft.settings?.inviteRequired!==true)
    errors.push({field:'visibility',message:'Only private, invitation-required campaigns can be configured here.'});
  return errors;
}
/** Only these fields may be sent to the owner's campaign document. */
export function campaignEditablePatch(draft,current){
  const errors=validateCampaignDraft(draft);
  if(errors.length)throw new Error(errors[0].message);
  if(!validRecord(current)||!CAMPAIGN_ID.test(String(current.id||''))||
     !UCN.test(String(current.ucn||'')))throw new Error('An existing server campaign identity is required.');
  const previousSettings=validRecord(current.settings)?current.settings:{};
  const previousAccess=validRecord(current.access)?current.access:{};
  return {
    name:draft.name.trim(),
    description:draft.description.trim(),
    partySize:draft.partySize,
    settings:{
      ...previousSettings,
      // Preserve any historical visibility values rather than silently
      // changing unrelated security policy during edits.
      partySize:draft.partySize,
      allowPlayerCreateCharacter:draft.settings.allowPlayerCreateCharacter,
      allowPlayerLinkCharacter:draft.settings.allowPlayerLinkCharacter,
      visibility:previousSettings.visibility||'private',
      inviteRequired:bool(previousSettings.inviteRequired,true)
    },
    access:{...previousAccess,...Object.fromEntries(ACCESS_FIELDS.map(k=>[k,draft.access[k]]))}
  };
}
export function campaignIdentity(identity,uid){
  if(!validRecord(identity)||!CAMPAIGN_ID.test(identity.id)||
     !UCN.test(identity.ucn)||typeof uid!=='string'||!uid)
    throw new Error('Server did not reserve a valid campaign identity.');
  if(identity.membershipSchemaVersion!=null && identity.membershipSchemaVersion!==2)
    throw new Error('Unexpected membership schema returned by campaign backend.');
  return Object.freeze({id:identity.id,ucn:identity.ucn,name:String(identity.name||''),
    ownerUid:uid,membershipSchemaVersion:identity.membershipSchemaVersion||1});
}
export function campaignSummary(campaign,uid){
  if(!validRecord(campaign)||!CAMPAIGN_ID.test(String(campaign.id||'')))
    throw new Error('Malformed saved campaign.');
  return Object.freeze({
    id:campaign.id,name:String(campaign.name||'Untitled Campaign').slice(0,120),
    description:String(campaign.description||'').slice(0,400),
    owner:campaign.ownerUid===uid,
    partySize:Number(campaign.partySize||campaign.settings?.partySize||4),
    ucn:campaign.ownerUid===uid && UCN.test(campaign.ucn)?campaign.ucn:'',
    membershipSchemaVersion:campaign.membershipSchemaVersion||1,
    image:typeof campaign.image==='string'&&campaign.image.startsWith('https://')?campaign.image:'',
    memberCount:Array.isArray(campaign.party)?campaign.party.length:0,
    updatedAt:campaign.updatedAt||null
  });
}
