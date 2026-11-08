import { randomInt, randomUUID } from 'node:crypto';

const UCN_PATTERN = /^\d{12}$/;
const CAMPAIGN_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const MAX_ALLOCATION_ATTEMPTS = 12;
const MAX_LOOKUPS_PER_WINDOW = 12;
const LOOKUP_WINDOW_MS = 60_000;

function campaignSummary(campaignId, campaign, ucn) {
  return { id: campaignId, name: String(campaign.name || 'Campaign').slice(0, 120), ucn };
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
  const nextCode = options.nextCode || randomUCN;
  const nextId = options.nextId || (()=>`camp-${randomUUID()}`);
  for(let attempt=0;attempt<MAX_ALLOCATION_ATTEMPTS;attempt++) {
    const ucn = nextCode();
    const campaignId = nextId();
    if(!validUCN(ucn) || !validCampaignId(campaignId)) throw new Error('Could not allocate a campaign identity.');
    const campaignRef = db.doc(`campaigns/${campaignId}`);
    const directoryRef = db.doc(`campaignDirectory/${ucn}`);
    const legacyInviteRef = db.doc(`campaignInvites/${ucn}`);
    const result = await db.runTransaction(async transaction=>{
      const [campaign, directory, legacyInvite] = await Promise.all([
        transaction.get(campaignRef), transaction.get(directoryRef), transaction.get(legacyInviteRef)
      ]);
      if(campaign.exists || directory.exists || legacyInvite.exists) return null;
      const now = new Date().toISOString();
      transaction.create(campaignRef, {
        id:campaignId, name, ownerUid:uid, gmId:uid,
        gmUids:[uid], playerUids:[], roles:{[uid]:'gm'},
        players:{[uid]:{uid,role:'gm',status:'active',characterIds:[],joinedAt:now}},
        ucn, createdAt:now
      });
      transaction.create(directoryRef, {
        ucn,campaignId,ownerUid:uid,status:'active',createdAt:now,updatedAt:now
      });
      transaction.create(legacyInviteRef, {
        ucn,campaignId,campaignName:name,ownerUid:uid,status:'active',createdAt:now,updatedAt:now
      });
      return { id:campaignId, ucn, name };
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
