import { SESSION_LIMIT_MS, effectiveSession, timestampMs } from '../../../src/state/liveWorkspaceModel.mjs';
import {
  assertGMCampaignId, gmCampaignAccess, gmCampaignSummary,
  gmPartySummary, gmSessionState, gmSessionCommands
} from './gmDashboardModel.mjs';

/** Phase 6.1 uses the Auth/Firestore SDK already created by AuthBootstrap.
 * No legacy global API bridge, second Firebase app or browser-side role grants.
 */
export function createFirebaseGMDashboardService({
  auth, db, firestoreSdk, readCanonical, enabled = false
}) {
  if (!auth || !db || !firestoreSdk || typeof readCanonical !== 'function')
    throw new Error('An authenticated Asteria Firestore adapter is required.');
  const flags = Object.freeze({enabled:enabled === true});
  const same = uid => {
    if (auth.currentUser?.uid !== uid) throw new Error('Account changed during GM operation.');
  };
  const campaignRef = id => firestoreSdk.doc(db,'campaigns',id);
  const memberRef = (id,uid) => firestoreSdk.doc(db,'campaigns',id,'members',uid);
  const liveRef = id => firestoreSdk.doc(db,'campaigns',id,'liveSession','current');

  async function verified() {
    if (!flags.enabled) throw new Error('The migrated GM Dashboard is disabled.');
    const user = auth.currentUser;
    if (!user?.uid) throw new Error('Sign in to access the GM Dashboard.');
    const profile = await readCanonical(user);
    same(user.uid);
    if (!profile || profile.uid !== user.uid)
      throw new Error('Your saved account profile could not be verified.');
    return user.uid;
  }

  async function verifyCampaign(id) {
    assertGMCampaignId(id);
    const uid = await verified();
    const snapshot = await firestoreSdk.getDocFromServer(campaignRef(id));
    same(uid);
    if (!snapshot.exists()) throw new Error('Campaign unavailable.');
    const campaign = {...snapshot.data(),id:snapshot.id};
    const member = campaign.membershipSchemaVersion === 2 && campaign.ownerUid !== uid
      ? await firestoreSdk.getDocFromServer(memberRef(id,uid)) : null;
    same(uid);
    const access = gmCampaignAccess(campaign,member?.exists()?member.data():null,uid,id);
    if (!access.allowed) throw new Error('You do not have GM access to this campaign.');
    return {uid,campaign,access,member:member?.exists()?member.data():null};
  }

  async function list() {
    const uid = await verified();
    // Owner-only discovery. Co-GMs may use a campaign deep link; never run an
    // unrestricted campaign query or expose all member/campaign records.
    const query = firestoreSdk.query(firestoreSdk.collection(db,'campaigns'),
      firestoreSdk.where('ownerUid','==',uid));
    const snapshot = await firestoreSdk.getDocsFromServer(query);
    same(uid);
    return snapshot.docs.map(item => {
      const campaign = {...item.data(),id:item.id};
      const access = gmCampaignAccess(campaign,null,uid,item.id);
      return access.allowed ? gmCampaignSummary(campaign,access) : null;
    }).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  }

  function watch(id, onUpdate, onError) {
    let active = true;
    const unsubs = [];
    const close = () => { active = false; unsubs.splice(0).forEach(unsubscribe => {
      try { unsubscribe(); } catch { /* listener already closed */ }
    }); };
    const fail = error => {
      if (!active) return;
      close();
      onError(error instanceof Error ? error : new Error('GM data connection failed.'));
    };
    (async () => {
      try {
        const {uid,campaign,access,member} = await verifyCampaign(id);
        if (!active) return;
        let latestCampaign = campaign;
        let latestMember = member;
        let latestAccess = access;
        const state = {campaign:gmCampaignSummary(campaign,access),
          role:access.role,party:[],session:gmSessionState(null)};
        const confirmed = {campaign:true,member:!member,party:false,session:false};
        const publish = () => {
          if (!active) return;
          same(uid);
          if (Object.values(confirmed).every(Boolean))
            onUpdate(Object.freeze({...state,status:'ready'}));
        };
        const validate = () => {
          latestAccess = gmCampaignAccess(latestCampaign,latestMember,uid,id);
          if (!latestAccess.allowed) throw new Error('You do not have GM access to this campaign.');
          state.role = latestAccess.role;
          state.campaign = gmCampaignSummary(latestCampaign,latestAccess);
        };
        // Cache-only snapshots are not sufficient proof of server permission.
        unsubs.push(firestoreSdk.onSnapshot(campaignRef(id),
          {includeMetadataChanges:true},snapshot => {
            if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
            if (!snapshot.exists()) return fail(new Error('Campaign unavailable.'));
            latestCampaign = {...snapshot.data(),id:snapshot.id};
            try { validate(); confirmed.campaign = true; publish(); }
            catch (error) { fail(error); }
          },fail));
        if (campaign.membershipSchemaVersion === 2 && campaign.ownerUid !== uid) {
          confirmed.member = false;
          unsubs.push(firestoreSdk.onSnapshot(memberRef(id,uid),
            {includeMetadataChanges:true},snapshot => {
              if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
              latestMember = snapshot.exists()?snapshot.data():null;
              try { validate(); confirmed.member = true; publish(); }
              catch (error) { fail(error); }
            },fail));
        }
        unsubs.push(firestoreSdk.onSnapshot(
          firestoreSdk.collection(db,'campaigns',id,'characters'),
          {includeMetadataChanges:true}, snapshot => {
            if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
            try {
              same(uid);
              state.party = gmPartySummary(snapshot.docs.map(doc => ({...doc.data(),id:doc.id})));
              confirmed.party = true;
              publish();
            } catch(error) { fail(error); }
          },fail));
        unsubs.push(firestoreSdk.onSnapshot(liveRef(id),
          {includeMetadataChanges:true}, snapshot => {
            if (!active || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
            try {
              same(uid);
              state.session = gmSessionState(snapshot.exists()?snapshot.data():null);
              confirmed.session = true;
              publish();
            } catch(error) { fail(error); }
          },fail));
      } catch(error) { fail(error); }
    })();
    return close;
  }

  /** Preserve the old Firebase live-session transactions, paths and event
   * schema. Rules, not a UI flag, enforce GM writes on the server.
   */
  async function sessionCommand(id,action) {
    assertGMCampaignId(id);
    if (!['start','pause','end'].includes(action)) throw new Error('Unsupported session action.');
    const {uid} = await verifyCampaign(id);
    const result = await firestoreSdk.runTransaction(db,async transaction => {
      const campaignSnap = await transaction.get(campaignRef(id));
      same(uid);
      if (!campaignSnap.exists()) throw new Error('Campaign unavailable.');
      const campaign = {...campaignSnap.data(),id:campaignSnap.id};
      const membership = campaign.membershipSchemaVersion === 2 && campaign.ownerUid !== uid
        ? await transaction.get(memberRef(id,uid)) : null;
      same(uid);
      const access = gmCampaignAccess(campaign,membership?.exists()?membership.data():null,uid,id);
      if (!access.allowed) throw new Error('GM permission was changed. Reload this campaign.');
      const reference = liveRef(id);
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists()?snapshot.data():{};
      const session = effectiveSession(current);
      if (!gmSessionCommands(gmSessionState(current)).includes(action)) {
        if (action === 'start' && session.editable) return {unchanged:true};
        throw new Error('Session status changed. Refresh before trying again.');
      }
      let patch, sessionId, eventType, payload = {};
      if (action === 'start') {
        const resume = current.status === 'paused' && current.id && !session.expired;
        const now = Date.now();
        sessionId = resume ? current.id : 'session-' + now + '-' + uid.slice(0,6);
        const expiry = timestampMs(current.expiresAt);
        patch = {...current,id:sessionId,campaignId:id,status:'active',
          startedBy:current.startedBy || uid,startedAt:current.startedAt || firestoreSdk.serverTimestamp(),
          resumedAt:resume?firestoreSdk.serverTimestamp():null,
          expiresAt:resume && expiry > now ? current.expiresAt :
            firestoreSdk.Timestamp.fromMillis(now + SESSION_LIMIT_MS),
          maxDurationHours:10,updatedAt:firestoreSdk.serverTimestamp(),endedAt:null};
        eventType = 'session-started'; payload = {resumed:Boolean(resume)};
      } else {
        sessionId = current.id;
        if (!sessionId) throw new Error('Session identifier missing.');
        patch = action === 'pause'
          ? {status:'paused',pausedAt:firestoreSdk.serverTimestamp(),updatedAt:firestoreSdk.serverTimestamp()}
          : {status:'ended',endReason:'gm-ended',endedAt:firestoreSdk.serverTimestamp(),
              updatedAt:firestoreSdk.serverTimestamp()};
        eventType = action === 'pause'?'session-paused':'session-ended';
        if (action === 'end') payload = {reason:'gm-ended'};
      }
      const sessionRef = firestoreSdk.doc(db,'campaigns',id,'sessions',sessionId);
      const eventRef = firestoreSdk.doc(firestoreSdk.collection(db,'campaigns',id,'events'));
      transaction.set(reference,patch,{merge:true});
      transaction.set(sessionRef,patch,{merge:true});
      transaction.set(eventRef,{id:eventRef.id,campaignId:id,sessionId,
        targetCharacterId:'',targetOwnerUid:'',type:eventType,payload,
        status:'delivered',deliveryStatus:'delivered',acknowledged:false,
        createdBy:uid,createdAt:firestoreSdk.serverTimestamp(),
        resolvedAt:firestoreSdk.serverTimestamp()});
      return {status:patch.status};
    });
    same(uid);
    return {ok:true,...result};
  }

  return Object.freeze({availability:()=>flags,list,watch,sessionCommand});
}
