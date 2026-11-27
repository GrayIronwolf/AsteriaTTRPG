import {campaignMembershipRole,isGameMasterRole} from '../../state/campaignMembershipAccess.mjs';
const CAMPAIGN_ID=/^[A-Za-z0-9_-]{1,160}$/;
import { effectiveSession } from '../../../src/state/liveWorkspaceModel.mjs';
import {hudImageSource as safeDashboardArtwork} from '../../../src/state/playerHudMedia.mjs';
import {activeConditions} from '../../../src/state/conditionModel.mjs';
import {soulDamageValue} from '../../../src/state/specialDamageModel.mjs';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;

export function assertGMCampaignId(id) {
  if (typeof id !== 'string' || !CAMPAIGN_ID.test(id)) throw new Error('Invalid campaign identifier.');
  return id;
}

/** Mirrors the authoritative v1/v2 GM definitions in firestore.rules.
 * The member argument MUST be the user's server-fetched /members/{uid} doc,
 * never a role supplied by URL, localStorage, or an account profile.
 */
export function gmCampaignAccess(campaign,member,uid,campaignId){
  const role=!uid || !CAMPAIGN_ID.test(String(campaignId || '')) || campaign?.id!==campaignId
    ? '' : campaignMembershipRole(campaign,uid,member,campaignId);
  return Object.freeze({allowed:isGameMasterRole(role),role:isGameMasterRole(role)?role:''});
}

export function gmCampaignSummary(campaign, access) {
  if (!access?.allowed) throw new Error('GM campaign permission is required.');
  return Object.freeze({
    id:campaign.id, name:text(campaign.name,'Campaign').slice(0,120),
    image:safeDashboardArtwork(campaign.image,campaign.art,campaign.banner,campaign.coverImage,campaign.cover,campaign.appearance?.image),
    description:text(campaign.description).slice(0,400),
    role:access.role,
    ucn:text(campaign.ucn).slice(0,20),
    location:text(campaign.location).slice(0,300),
    playerLimit:Math.max(1,Math.min(50,Number(campaign.playerLimit||campaign.partySize||6))),
    playerCount:record(campaign.players)?Object.values(campaign.players).filter(p=>p?.role!=='gm').length:0,
    gmCount:1+(Array.isArray(campaign.gmUids)?campaign.gmUids.length:0),
    membershipSchemaVersion:campaign.membershipSchemaVersion ?? 1,
    partySize:Number.isInteger(Number(campaign.partySize)) ? Number(campaign.partySize) : 4
  });
}

function resource(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const current = Number(value[0]), maximum = Number(value[1]);
  return Number.isFinite(current) && Number.isFinite(maximum) && maximum >= 0
    ? [Math.max(0,current),maximum] : null;
}

/** Only render the required overview fields, not private character payloads. */
export function gmPartySummary(documents) {
  if (!Array.isArray(documents)) throw new TypeError('Expected Firestore character documents.');
  return Object.freeze(documents.slice(0,128).filter(item => record(item) &&
    CAMPAIGN_ID.test(String(item.id || ''))).map(item => Object.freeze({
    id:item.id, name:text(item.name,'Unnamed Character').slice(0,100),
    image:safeDashboardArtwork(item.image,item.portrait,item.characterImage,item.appearance?.image),
    level:Number.isFinite(Number(item.level)) ? Math.max(0,Math.floor(Number(item.level))) : 0,
    className:text(item.className,typeof item.class === 'string' ? item.class :
      text(item.class?.name)).slice(0,80),
    hp:resource(item.hp), sp:resource(item.sp), mp:resource(item.mp),
    soulDamage:soulDamageValue(item),
    conditions:Object.freeze(activeConditions(item).slice(0,32).map(row=>Object.freeze({
      id:text(row.id).slice(0,160),name:text(row.name,'Condition').slice(0,100)
    }))),
    quests:Object.freeze((Array.isArray(item.quests)?item.quests:[]).slice(0,150).filter(q=>record(q)).map(q=>Object.freeze({
      id:text(q.id).slice(0,100),title:text(q.title).slice(0,160),
      status:text(q.status).slice(0,40),progress:record(q.progress)?Object.freeze({...q.progress}):Object.freeze({}),
      objectives:Array.isArray(q.objectives)?q.objectives.slice(0,20).map(o=>({
        id:text(o.id).slice(0,100),text:text(o.text).slice(0,500),target:Number(o.target)||1,optional:o.optional===true})):[],
      rewardClaimedAt:q.rewardClaimedAt||null,resolutionNote:text(q.resolutionNote).slice(0,1000)
    }))),
    restRequest:item.restState?.request?.status==='pending'&&
      typeof item.restState.request.id==='string'?
      Object.freeze({id:item.restState.request.id,status:'pending',
        soulRecovery:Math.max(0,Number(item.restState.request.soulRecovery)||0)}):null
  })));
}

export function gmSessionState(raw, now = Date.now()) {
  const value = effectiveSession(record(raw) ? raw : {status:'idle',id:''},now);
  return Object.freeze({
    id:text(value.id), status:['idle','active','paused','ended','expired'].includes(value.status)
      ? value.status : 'idle',
    expired:value.expired === true,
    editable:value.editable === true,
    expiresAtMs:value.expiresAtMs || 0
  });
}

export function gmSessionCommands(session) {
  if (session.status === 'active') return Object.freeze(['pause','end']);
  if (session.status === 'paused' && !session.expired) return Object.freeze(['start','end']);
  if (session.status === 'expired') return Object.freeze(['end']);
  if (session.status === 'ended' || session.status === 'idle') return Object.freeze(['start']);
  return Object.freeze([]);
}

const DASHBOARD_ID=CAMPAIGN_ID;
const obj=record;
const list=value=>Array.isArray(value)?value:[];
export function requireDashboardId(value){if(typeof value!=='string'||!DASHBOARD_ID.test(value))throw Error('Invalid character or campaign identifier.');return value;}
export function playerCampaignAccess(campaign,member,uid,campaignId){
  const role=!uid || !CAMPAIGN_ID.test(String(campaignId || '')) || campaign?.id!==campaignId
    ? '' : campaignMembershipRole(campaign,uid,member,campaignId);
  return Object.freeze({allowed:Boolean(role),isGM:isGameMasterRole(role)});
}
export function linkedCharacterAccess(campaign,character,uid,access){
  if(!access?.allowed||!obj(character)||!DASHBOARD_ID.test(String(character.id||''))||
    !DASHBOARD_ID.test(String(character.ownerUid||''))||
    character.sharedCampaignId&&character.sharedCampaignId!==campaign?.id ||
    character.status&&character.status!=='linked')return Object.freeze({allowed:false,owned:false});
  const id=character.id,ownerUid=character.ownerUid;
  const linkedOwner=campaign?.playerCharacterLinks?.[id];
  const summaryOwner=campaign?.characters?.[id]?.ownerUid;
  if(linkedOwner&&linkedOwner!==ownerUid||summaryOwner&&summaryOwner!==ownerUid)
    return Object.freeze({allowed:false,owned:false});
  const link=linkedOwner===ownerUid||summaryOwner===ownerUid||
    list(campaign?.players?.[ownerUid]?.characterIds).includes(id);
  const v=campaign?.membershipSchemaVersion??1;
  if(v===2&&!(linkedOwner===ownerUid&&summaryOwner===ownerUid&&
    list(campaign.party).includes(id)&&character.status==='linked'))
    return Object.freeze({allowed:false,owned:false});
  if(!link)return Object.freeze({allowed:false,owned:false});
  const owned=ownerUid===uid;
  return Object.freeze({allowed:Boolean(owned||access.isGM),owned});
}
/** Source linkage must be checked for the owner, not inferred from the shared record. */
export function matchesOwnedSource(source,shared,campaignId,uid,version){
  if(!obj(source)||source.ownerUid!==uid||!obj(shared)||shared.ownerUid!==uid||
    source.id!==(shared.sourceCharacterId||shared.id))return false;
  const expected=source.campaignCharacterIds?.[campaignId];
  if(expected&&expected!==shared.id)return false;
  const linked=list(source.linkedCampaignIds).includes(campaignId)||
    source.sharedCampaignId===campaignId||source.campaignId===campaignId;
  return linked&&(version!==2||expected===shared.id);
}
