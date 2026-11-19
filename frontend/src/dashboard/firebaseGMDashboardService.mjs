import {normalizeDashboardLayout} from '../../../src/state/dashboardLayoutModel.mjs';
import { SESSION_LIMIT_MS, effectiveSession, timestampMs } from '../../../src/state/liveWorkspaceModel.mjs';
import {
  assertGMCampaignId, gmCampaignAccess, gmCampaignSummary,
  gmPartySummary, gmSessionState, gmSessionCommands
} from './gmDashboardModel.mjs';

/** Phase 6.1 uses the Auth/Firestore SDK already created by AuthBootstrap.
 * No legacy global API bridge, second Firebase app or browser-side role grants.
 */
export function createFirebaseGMDashboardService({
  auth, db, firestoreSdk, readCanonical, functions=null, functionsSdk=null,
  enabled = false, layoutEnabled = false
}) {
  if (!auth || !db || !firestoreSdk || typeof readCanonical !== 'function')
    throw new Error('An authenticated Asteria Firestore adapter is required.');
  const flags = Object.freeze({enabled:enabled === true,layoutEnabled:layoutEnabled === true});
  const same = uid => {
    if (auth.currentUser?.uid !== uid) throw new Error('Account changed during GM operation.');
  };
  const campaignRef = id => firestoreSdk.doc(db,'campaigns',id);
  const memberRef = (id,uid) => firestoreSdk.doc(db,'campaigns',id,'members',uid);
  const liveRef = id => firestoreSdk.doc(db,'campaigns',id,'liveSession','current');
  const layoutRef = (uid,id) => firestoreSdk.doc(db,'users',uid,'dashboardLayouts','gm-'+id);

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
    // Firestore intentionally denies campaign reads to unrelated accounts.
    // Do not expose SDK/rules internals or treat a denied read as public data.
    let snapshot;
    try { snapshot = await firestoreSdk.getDocFromServer(campaignRef(id)); }
    catch { throw new Error('You do not have GM access to this campaign.'); }
    same(uid);
    if (!snapshot.exists()) throw new Error('Campaign unavailable.');
    const campaign = {...snapshot.data(),id:snapshot.id};
    let member = null;
    if (campaign.membershipSchemaVersion === 2 && campaign.ownerUid !== uid) {
      try { member = await firestoreSdk.getDocFromServer(memberRef(id,uid)); }
      catch { throw new Error('You do not have GM access to this campaign.'); }
    }
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


  /** Private GM layout, using the same path and versioned schema as the
   * existing dashboard. All snapshots must be server-confirmed and role
   * revocation closes the listener. */
  function watchLayout(id,onUpdate,onError) {
    assertGMCampaignId(id);
    let active = true;
    const unsubs = [];
    const close = () => { active=false;unsubs.splice(0).forEach(stop=>{try{stop();}catch{}}); };
    const fail = error => {
      if(!active)return;
      close();onError(error instanceof Error?error:Error('GM layout could not be loaded.'));
    };
    (async()=>{
      try{
        if(!flags.layoutEnabled)throw Error('The migrated dashboard editor is disabled.');
        const {uid,campaign,member}=await verifyCampaign(id);
        if(!active)return;
        const data={campaign,member,layout:null};
        const v2=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid;
        const confirmed={campaign:false,member:!v2,layout:false};
        const publish=()=>{
          if(!active||!Object.values(confirmed).every(Boolean))return;
          try{
            same(uid);
            if(!gmCampaignAccess(data.campaign,data.member,uid,id).allowed)
              throw Error('GM layout permission has been revoked.');
            onUpdate(normalizeDashboardLayout(data.layout,'gm'));
          }catch(error){fail(error);}
        };
        const attach=(ref,key,decode)=>{
          const stop=firestoreSdk.onSnapshot(ref,{includeMetadataChanges:true},
            snap=>{
              if(!active||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
              try{
                same(uid);
                if(key!=='layout'&&!snap.exists())throw Error('GM campaign membership is unavailable.');
                data[key]=decode(snap);confirmed[key]=true;publish();
              }catch(error){fail(error);}
            },fail);
          if(active)unsubs.push(stop);else stop();
        };
        attach(campaignRef(id),'campaign',snap=>({...snap.data(),id:snap.id}));
        if(v2)attach(memberRef(id,uid),'member',snap=>({...snap.data()}));
        attach(layoutRef(uid,id),'layout',snap=>snap.exists()?snap.data().layout||null:null);
      }catch(error){fail(error);}
    })();
    return close;
  }

  /** Compare-and-swap prevents a stale tab from overwriting another tab's
   * layout. Only the GM's own dashboardLayouts/gm-{campaignId} changes. */
  async function saveLayout(id,layout,expected){
    assertGMCampaignId(id);
    if(!flags.layoutEnabled)throw Error('The migrated dashboard editor is disabled.');
    const {uid}=await verifyCampaign(id);
    const next=normalizeDashboardLayout(layout,'gm');
    const old=JSON.stringify(normalizeDashboardLayout(expected,'gm'));
    if(JSON.stringify(next).length>400*1024)throw Error('Dashboard layout is too large.');
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaignSnap=await tx.get(campaignRef(id));
      if(!campaignSnap.exists())throw Error('GM campaign no longer exists.');
      const campaign={...campaignSnap.data(),id:campaignSnap.id};
      const memberSnap=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid
        ?await tx.get(memberRef(id,uid)):null;
      const stored=await tx.get(layoutRef(uid,id));
      same(uid);
      const member=memberSnap?.exists()?memberSnap.data():null;
      if(!gmCampaignAccess(campaign,member,uid,id).allowed)
        throw Error('GM permissions changed. Reload this campaign.');
      const baseline=JSON.stringify(normalizeDashboardLayout(stored.exists()?stored.data().layout:null,'gm'));
      if(baseline!==old)throw Error('Dashboard layout changed in another session. Reload before saving.');
      tx.set(layoutRef(uid,id),{layout:next,updatedAt:firestoreSdk.serverTimestamp()},{merge:true});
    });
    same(uid);
    return {ok:true};
  }

  async function manageCondition(cid,characterId,input){
    assertGMCampaignId(cid);assertGMCampaignId(characterId);
    if(!input||typeof input!=='object'||Array.isArray(input)||
      !functions||!functionsSdk?.httpsCallable)
      throw Error('Condition management is unavailable.');
    const request=input.action==='remove'
      ?{action:'remove',id:String(input.id||'').slice(0,160)}
      :{name:String(input.name||'').trim().slice(0,100),
        description:String(input.description||'').slice(0,1000),
        duration:{unit:'until-removed'},source:'GM Dashboard'};
    if(request.action==='remove'&&!/^[a-zA-Z0-9_:.-]{1,160}$/.test(request.id)||
      !request.action&&!request.name)
      throw Error('Enter a valid condition name or identifier.');
    const {uid}=await verifyCampaign(cid);
    const linked=await firestoreSdk.getDocFromServer(
      firestoreSdk.doc(db,'campaigns',cid,'characters',characterId));
    same(uid);
    if(!linked.exists())throw Error('Linked character was not found.');
    const fn=functionsSdk.httpsCallable(functions,'asteriaAction');
    const result=await fn({action:'manageCharacterCondition',
      args:[cid,characterId,request],requestId:crypto.randomUUID()});
    same(uid);
    if(result.data?.ok!==true)throw Error(result.data?.error||'Condition action rejected.');
    return result.data;
  }

  async function reviewRest(cid,characterId,requestId,status){
    assertGMCampaignId(cid);assertGMCampaignId(characterId);
    if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(requestId)||
      !['approved','denied'].includes(status))
      throw Error('Invalid Long Rest review.');
    if(!functions||!functionsSdk?.httpsCallable)
      throw Error('GM rest review is unavailable.');
    const {uid}=await verifyCampaign(cid);
    const character=await firestoreSdk.getDocFromServer(
      firestoreSdk.doc(db,'campaigns',cid,'characters',characterId));
    same(uid);
    if(!character.exists()||character.data()?.restState?.request?.id!==requestId||
      character.data()?.restState?.request?.status!=='pending')
      throw Error('The pending Long Rest request has changed.');
    const callable=functionsSdk.httpsCallable(functions,'asteriaAction');
    const result=await callable({action:'reviewCharacterRest',
      args:[cid,characterId,{id:requestId,status}],
      requestId:crypto.randomUUID()});
    same(uid);
    if(result.data?.ok!==true)
      throw Error(result.data?.error||'Long Rest review was rejected.');
    return result.data;
  }

  return Object.freeze({availability:()=>flags,list,watch,sessionCommand,watchLayout,saveLayout,reviewRest,manageCondition});
}
