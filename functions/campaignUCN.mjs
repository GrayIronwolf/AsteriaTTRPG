import { randomInt, randomUUID } from 'node:crypto';
import { ownerMembership } from './campaignMembership.mjs';

const UCN_PATTERN = /^\d{12}$/;
const CAMPAIGN_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const MAX_ALLOCATION_ATTEMPTS = 12;
const MAX_LOOKUPS_PER_WINDOW = 12;
const LOOKUP_WINDOW_MS = 60_000;
const MAX_CREATES_PER_WINDOW = 10;
const CREATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function campaignSummary(campaignId, campaign, ucn) {
  // The preview is public to authenticated accounts, not a campaign-data read.
  // V2 accounts can submit join requests only after Phase 3.2.
  const version=campaign.membershipSchemaVersion;
  const joinMode=version===2?'request':
    (version===undefined || version===null || version===1)?'legacy':'unavailable';
  return { id: campaignId, name: String(campaign.name || 'Campaign').slice(0, 120), ucn, joinMode };
}
function validCampaignId(id) { return typeof id === 'string' && CAMPAIGN_ID_PATTERN.test(id); }
export function validUCN(code) { return typeof code === 'string' && UCN_PATTERN.test(code); }
export function randomUCN() { return String(randomInt(0, 1_000_000_000_000)).padStart(12, '0'); }

/**
 * Allocate globally unique campaign identities. A CSPRNG-generated UCN is
 * reserved in the directory AND legacy invitation index in one transaction.
 * Existing campaign identities are not touched.
 *
 * The legacy invite mapping is temporary compatibility for existing players,
 * not the future campaign directory membership authority.
 */
export async function createCampaignIdentity(db, uid, rawName, options = {}) {
  if(typeof uid !== 'string' || !uid) throw new Error('Sign in to continue.');
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if(!name || name.length > 120) throw new Error('Enter a campaign name (1–120 characters).');
  const v2Test=options.v2Test===true;
  if(v2Test&&(!Number.isSafeInteger(options.partySize)||
      options.partySize<1||options.partySize>12))
    throw new Error('Choose a party size from 1 to 12.');
  const nextCode = options.nextCode || randomUCN;
  const nextId = options.nextId || (()=>`camp-${randomUUID()}`);
  for(let attempt=0;attempt<MAX_ALLOCATION_ATTEMPTS;attempt++) {
    const ucn = nextCode();
    const campaignId = nextId();
    if(!validUCN(ucn) || !validCampaignId(campaignId)) throw new Error('Could not allocate a campaign identity.');
    const campaignRef = db.doc(`campaigns/${campaignId}`);
    const directoryRef = db.doc(`campaignDirectory/${ucn}`);
    const legacyInviteRef = db.doc(`campaignInvites/${ucn}`);
    const creationLimitRef = db.doc(`campaignCreateThrottle/${uid}`);
    const ownerMemberRef = db.doc(`campaigns/${campaignId}/members/${uid}`);
    const result = await db.runTransaction(async transaction=>{
      const [campaign, directory, legacyInvite, throttle, ownerMember] = await Promise.all([
        transaction.get(campaignRef), transaction.get(directoryRef), transaction.get(legacyInviteRef), transaction.get(creationLimitRef), transaction.get(ownerMemberRef)
      ]);
      const rate = throttle.exists ? throttle.data() : {};
      const nowMs = Date.now();
      const windowStart = typeof rate.windowStartedAtMs === 'number' ? rate.windowStartedAtMs : 0;
      const withinWindow = nowMs >= windowStart && nowMs - windowStart < CREATE_WINDOW_MS;
      const created = withinWindow ? Number(rate.created || 0) : 0;
      if(created >= MAX_CREATES_PER_WINDOW) throw new Error('Campaign creation limit reached. Please try again later.');
      if(campaign.exists || directory.exists || legacyInvite.exists || ownerMember.exists) return null;
      const now = new Date().toISOString();
      transaction.create(campaignRef, {
        id:campaignId, name, ownerUid:uid, gmId:uid,
        gmUids:[uid], playerUids:[], roles:{[uid]:'gm'},
        players:{[uid]:{uid,role:'gm',status:'active',characterIds:[],joinedAt:now}},
        ucn, createdAt:now,
        ...(v2Test?{
          membershipSchemaVersion:2,membershipRevision:1,
          partySize:options.partySize,
          joinPolicy:{joinRequestsOpen:true,autoApprove:false},
          // The browser may save a descriptive campaign document afterward,
          // but v2 rules forbid adding these legacy invitation keys later.
          // Set their safe initial values inside this trusted transaction.
          inviteCode:ucn,uniqueCampaignCode:ucn,invites:[]
        }:{})
      });
      transaction.create(ownerMemberRef,ownerMembership(campaignId,uid,new Date(now)));
      transaction.create(directoryRef, {
        ucn,campaignId,ownerUid:uid,status:'active',createdAt:now,updatedAt:now
      });
      transaction.create(legacyInviteRef, {
        ucn,campaignId,campaignName:name,ownerUid:uid,status:'active',createdAt:now,updatedAt:now
      });
      transaction.set(creationLimitRef,{
        windowStartedAtMs:withinWindow?windowStart:nowMs,created:created+1,updatedAtMs:nowMs
      });
      return { id:campaignId, ucn, name, ...(v2Test?{membershipSchemaVersion:2}:{}) };
    });
    if(result) return result;
  }
  throw new Error('Could not reserve a unique campaign number. Please retry.');
}

/**
 * Authenticated, rate-bounded and intentionally minimal campaign preview.
 * Supports legacy campaigns while migration to the directory is pending.
 */
export async function previewCampaignUCN(db, uid, code, options = {}) {
  if(typeof uid !== 'string' || !uid) throw new Error('Sign in to continue.');
  if(!validUCN(code)) throw new Error('Enter a valid 12-digit UCN.');
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const throttleRef = db.doc(`campaignLookupThrottle/${uid}`);
  const directoryRef = db.doc(`campaignDirectory/${code}`);
  const inviteRef = db.doc(`campaignInvites/${code}`);
  return db.runTransaction(async transaction=>{
    const [throttle, directory, invite] = await Promise.all([
      transaction.get(throttleRef), transaction.get(directoryRef), transaction.get(inviteRef)
    ]);
    const previous = throttle.exists ? throttle.data() : {};
    const start = typeof previous.windowStartedAtMs === 'number' ? previous.windowStartedAtMs : 0;
    const insideWindow = now >= start && now - start < LOOKUP_WINDOW_MS;
    const count = insideWindow ? Number(previous.attempts || 0) : 0;
    if(count >= MAX_LOOKUPS_PER_WINDOW) throw new Error('Too many campaign lookups. Please try again shortly.');

    // Directory is authoritative for registered campaigns. A present but
    // closed or malformed directory entry must never fall back to legacy.
    const entry = directory.exists ? directory.data() : null;
    const legacy = !directory.exists && invite.exists ? invite.data() : null;
    const campaignId = entry
      ? (entry.status === 'active' ? entry.campaignId : null)
      : legacy?.status === 'active' ? legacy.campaignId : null;
    const campaignRef = validCampaignId(campaignId) ? db.doc(`campaigns/${campaignId}`) : null;
    const campaignSnap = campaignRef ? await transaction.get(campaignRef) : null;
    transaction.set(throttleRef,{windowStartedAtMs:insideWindow?start:now,attempts:count+1,updatedAtMs:now});
    if(!campaignSnap?.exists) return null;
    const campaign = campaignSnap.data();
    const linkedOwner = entry?.ownerUid || legacy?.ownerUid;
    if(!linkedOwner || campaign.ownerUid !== linkedOwner || campaign.ucn !== code) return null;
    return campaignSummary(campaignId,campaign,code);
  });
}
