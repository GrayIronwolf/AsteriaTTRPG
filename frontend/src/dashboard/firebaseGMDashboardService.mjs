import {gmNotesProjection,savePrivateGMNotes,appendGMSessionLog,deleteGMSessionLog,saveGMInformation as applyGMInformationChange,validateGMAnnouncement} from './gmStoryManagementModel.mjs';
import {updateGMQuestList,archiveGMQuestList,assignGMQuest,validateCampaignDetails} from './gmQuestManagementModel.mjs';
import {campaignArtworkFileError} from '../../../src/state/campaignArtwork.mjs';
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
  storage=null,storageSdk=null,enabled = false, layoutEnabled = false
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

  /** Phase 3.2: read GM-only templates from the original single workspace doc.
   * The campaign membership listener is mandatory even when the template
   * snapshot is loaded from the server. No player can subscribe to these notes.
   */
  function watchManagement(cid,onUpdate,onError){
    assertGMCampaignId(cid);
    let active=true,stop=()=>{};
    const close=()=>{active=false;try{stop();}catch{/* closed */}};
    (async()=>{
      try{
        const {uid}=await verifyCampaign(cid);
        if(!active)return;
        stop=firestoreSdk.onSnapshot(
          firestoreSdk.doc(db,'campaigns',cid,'systems','gmWorkspace'),
          {includeMetadataChanges:true},async snapshot=>{
            if(!active||snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
            try{
              await verifyCampaign(cid);same(uid);
              if(!active)return;
              const source=snapshot.exists()?snapshot.data():{};
              onUpdate({quests:Array.isArray(source.quests)?source.quests:[],
                campaign:source.campaign&&typeof source.campaign==='object'?source.campaign:{},
                notes:gmNotesProjection(source),
                world:{news:Array.isArray(source.world?.news)?source.world.news:[],
                  events:Array.isArray(source.world?.events)?source.world.events:[]}});
            }catch(error){if(active){close();onError(error);}}
          },error=>{if(active){close();onError(error);}});
      }catch(error){if(active){close();onError(error);}}
    })();
    return close;
  }

  /** Transactional writes preserve all other campaign systems. Expected
   * updatedAt prevents one GM's edits silently replacing another GM's draft. */
  async function saveQuest(cid,draft){
    assertGMCampaignId(cid);
    if(!draft||typeof draft!=='object'||Array.isArray(draft))throw Error('Invalid quest.');
    const {uid}=await verifyCampaign(cid);
    let saved;
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaign=await tx.get(campaignRef(cid));
      const membership=campaign.exists()&&campaign.data().membershipSchemaVersion===2&&
        campaign.data().ownerUid!==uid?await tx.get(memberRef(cid,uid)):null;
      const access=gmCampaignAccess(campaign.exists()?{...campaign.data(),id:cid}:null,
        membership?.exists()?membership.data():null,uid,cid);
      if(!access.allowed)throw Error('GM campaign access changed.');
      const ref=firestoreSdk.doc(db,'campaigns',cid,'systems','gmWorkspace');
      const snapshot=await tx.get(ref);same(uid);
      const quests=Array.isArray(snapshot.data()?.quests)?snapshot.data().quests:[];
      const result=updateGMQuestList(quests,draft,{
        expectedUpdatedAt:draft.updatedAt||'',newId:'quest-'+crypto.randomUUID(),
        now:new Date().toISOString()});
      saved=result.saved;
      tx.set(ref,{quests:result.quests,version:'asteria-react-gm-workspace-v1',
        updatedBy:uid,updatedAt:firestoreSdk.serverTimestamp()},{merge:true});
    });
    same(uid);return {ok:true,quest:saved};
  }
  async function archiveQuest(cid,questId,expectedUpdatedAt){
    assertGMCampaignId(cid);
    if(!/^[\w-]{1,100}$/.test(String(questId||'')))throw Error('Invalid quest ID.');
    const {uid}=await verifyCampaign(cid);
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaign=await tx.get(campaignRef(cid));
      const membership=campaign.exists()&&campaign.data().membershipSchemaVersion===2&&
        campaign.data().ownerUid!==uid?await tx.get(memberRef(cid,uid)):null;
      if(!gmCampaignAccess(campaign.exists()?{...campaign.data(),id:cid}:null,
        membership?.exists()?membership.data():null,uid,cid).allowed)
        throw Error('GM campaign access changed.');
      const ref=firestoreSdk.doc(db,'campaigns',cid,'systems','gmWorkspace');
      const snap=await tx.get(ref);same(uid);
      const current=Array.isArray(snap.data()?.quests)?snap.data().quests:[];
      const next=archiveGMQuestList(current,questId,expectedUpdatedAt);
      tx.set(ref,{quests:next,updatedBy:uid,updatedAt:firestoreSdk.serverTimestamp()},{merge:true});
    });
    same(uid);return {ok:true};
  }
  async function assignQuest(cid,questId,characterIds,expectedUpdatedAt){
    assertGMCampaignId(cid);
    if(!/^[\w-]{1,100}$/.test(String(questId||'')))throw Error('Invalid quest ID.');
    if(!Array.isArray(characterIds)||!characterIds.length||characterIds.length>50)
      throw Error('Select between 1 and 50 linked characters.');
    const ids=[...new Set(characterIds)];
    if(ids.length!==characterIds.length)throw Error('Duplicate character selected.');
    ids.forEach(assertGMCampaignId);
    const {uid}=await verifyCampaign(cid);
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaign=await tx.get(campaignRef(cid));
      const membership=campaign.exists()&&campaign.data().membershipSchemaVersion===2&&
        campaign.data().ownerUid!==uid?await tx.get(memberRef(cid,uid)):null;
      if(!gmCampaignAccess(campaign.exists()?{...campaign.data(),id:cid}:null,
        membership?.exists()?membership.data():null,uid,cid).allowed)
        throw Error('GM campaign access changed.');
      const workspace=await tx.get(firestoreSdk.doc(db,'campaigns',cid,'systems','gmWorkspace'));
      const quest=(Array.isArray(workspace.data()?.quests)?workspace.data().quests:[])
        .find(row=>row.id===questId);
      if(!quest)throw Error('Quest is not in the saved campaign ledger.');
      if(String(quest.updatedAt||'')!==String(expectedUpdatedAt||''))
        throw Error('Quest changed in another tab. Reload before assigning.');
      const refs=ids.map(id=>firestoreSdk.doc(db,'campaigns',cid,'characters',id));
      const snaps=[];
      for(const ref of refs)snaps.push(await tx.get(ref));
      same(uid);
      const assignedAt=new Date().toISOString();
      const events=ids.map(()=>firestoreSdk.doc(firestoreSdk.collection(db,'campaigns',cid,'events')));
      snaps.forEach((snapshot,index)=>{
        if(!snapshot.exists())throw Error('An assigned character is no longer linked.');
        const character=snapshot.data();
        if(!character.ownerUid)throw Error('Character ownership is unavailable.');
        const existing=Array.isArray(character.quests)?character.quests:[];
        const old=existing.find(row=>row?.id===questId);
        const next=assignGMQuest(quest,old,{assignedBy:uid,assignedAt});
        if(existing.length>=150&&!old)throw Error('Character quest limit reached.');
        const quests=old?existing.map(row=>row.id===questId?next:row):[...existing,next];
        tx.set(refs[index],{quests,updatedAt:firestoreSdk.serverTimestamp()},{merge:true});
        const event=events[index];
        tx.set(event,{
          id:event.id,campaignId:cid,targetCharacterId:ids[index],
          targetOwnerUid:character.ownerUid,type:old?'quest-updated':'quest-assigned',
          payload:{questId,title:next.title,objective:next.objective,
            reward:next.reward,questGiver:next.questGiver,deadline:next.deadline},
          status:'delivered',deliveryStatus:'delivered',acknowledged:false,
          createdBy:uid,createdAt:firestoreSdk.serverTimestamp(),resolvedAt:null
        });
      });
    });
    same(uid);return {ok:true,assigned:ids.length};
  }
  async function reviewQuest(cid,characterId,questId,status,note=''){
    assertGMCampaignId(cid);assertGMCampaignId(characterId);
    if(!/^[\w-]{1,100}$/.test(String(questId||''))||
      !['Completed','Failed','Active','On Hold'].includes(status)||
      String(note).length>1000)throw Error('Invalid quest review.');
    if(!functions||!functionsSdk?.httpsCallable)
      throw Error('Quest review requires the authenticated action service.');
    const {uid}=await verifyCampaign(cid);
    const snapshot=await firestoreSdk.getDocFromServer(
      firestoreSdk.doc(db,'campaigns',cid,'characters',characterId));
    same(uid);
    if(!snapshot.exists()||!Array.isArray(snapshot.data().quests)||
      !snapshot.data().quests.some(row=>row.id===questId&&row.status==='Awaiting Review'))
      throw Error('The player has no pending quest review.');
    const callable=functionsSdk.httpsCallable(functions,'asteriaAction');
    const result=await callable({action:'reviewCharacterQuest',
      args:[cid,characterId,questId,status,String(note).trim()],
      requestId:crypto.randomUUID()});
    same(uid);
    if(result.data?.ok!==true)throw Error(result.data?.error||'Quest review rejected.');
    return result.data;
  }
  async function updateCampaignDetails(cid,draft){
    assertGMCampaignId(cid);
    const fields=validateCampaignDetails(draft);
    const {uid}=await verifyCampaign(cid);
    await firestoreSdk.runTransaction(db,async tx=>{
      const ref=campaignRef(cid),snap=await tx.get(ref);
      const membership=snap.exists()&&snap.data().membershipSchemaVersion===2&&
        snap.data().ownerUid!==uid?await tx.get(memberRef(cid,uid)):null;
      if(!gmCampaignAccess(snap.exists()?{...snap.data(),id:cid}:null,
        membership?.exists()?membership.data():null,uid,cid).allowed)
        throw Error('GM campaign access changed.');
      const workspaceRef=firestoreSdk.doc(db,'campaigns',cid,'systems','gmWorkspace');
      const w=await tx.get(workspaceRef);same(uid);
      tx.update(ref,{...fields,updatedAt:firestoreSdk.serverTimestamp()});
      tx.set(workspaceRef,{campaign:{...(w.data()?.campaign||{}),
        synopsis:fields.description,location:fields.location,playerLimit:fields.playerLimit},
        updatedBy:uid,updatedAt:firestoreSdk.serverTimestamp()},{merge:true});
    });
    same(uid);return {ok:true};
  }
  async function uploadArtwork(cid,file){
    assertGMCampaignId(cid);
    const problem=campaignArtworkFileError(file);
    if(problem)throw Error(problem);
    if(!storage||!storageSdk)throw Error('Campaign artwork storage is unavailable.');
    const {uid}=await verifyCampaign(cid);
    const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[file.type];
    const path='campaigns/'+cid+'/artwork/'+crypto.randomUUID()+'.'+ext;
    const ref=storageSdk.ref(storage,path);
    let uploaded=false;
    try{
      await storageSdk.uploadBytes(ref,file,{contentType:file.type});
      uploaded=true;same(uid);
      const image=await storageSdk.getDownloadURL(ref);
      if(typeof image!=='string'||!image.startsWith('https://'))
        throw Error('Storage returned an invalid campaign artwork URL.');
      await firestoreSdk.runTransaction(db,async tx=>{
        const snap=await tx.get(campaignRef(cid));
        const member=snap.exists()&&snap.data().membershipSchemaVersion===2&&
          snap.data().ownerUid!==uid?await tx.get(memberRef(cid,uid)):null;
        same(uid);
        if(!gmCampaignAccess(snap.exists()?{...snap.data(),id:cid}:null,
          member?.exists()?member.data():null,uid,cid).allowed)
          throw Error('GM campaign access changed.');
        tx.update(campaignRef(cid),{image,imagePath:path,
          updatedAt:firestoreSdk.serverTimestamp()});
      });
      same(uid);return {ok:true,image,path};
    }catch(error){
      if(uploaded)await storageSdk.deleteObject(ref).catch(()=>{});
      throw error;
    }
  }
  async function removeArtwork(cid){
    assertGMCampaignId(cid);
    const {uid}=await verifyCampaign(cid);
    let prior='';
    await firestoreSdk.runTransaction(db,async tx=>{
      const snap=await tx.get(campaignRef(cid));
      const member=snap.exists()&&snap.data().membershipSchemaVersion===2&&
        snap.data().ownerUid!==uid?await tx.get(memberRef(cid,uid)):null;
      same(uid);
      if(!gmCampaignAccess(snap.exists()?{...snap.data(),id:cid}:null,
        member?.exists()?member.data():null,uid,cid).allowed)
        throw Error('GM campaign access changed.');
      prior=String(snap.data().imagePath||'');
      tx.update(campaignRef(cid),{image:'',imagePath:'',art:'',banner:'',
        coverImage:'',cover:'',updatedAt:firestoreSdk.serverTimestamp()});
    });
    if(prior.startsWith('campaigns/'+cid+'/artwork/')&&storage&&storageSdk)
      await storageSdk.deleteObject(storageSdk.ref(storage,prior)).catch(()=>{});
    same(uid);return {ok:true};
  }


  /** Phase 3.3 retains the canonical private gmWorkspace record. All writes
   * reread GM membership in the same transaction and preserve other sections.
   */
  async function mutateGMNotes(cid,transform){
    assertGMCampaignId(cid);
    const {uid}=await verifyCampaign(cid);
    const result=await firestoreSdk.runTransaction(db,async tx=>{
      const campaignSnap=await tx.get(campaignRef(cid));
      const memberSnap=campaignSnap.exists()&&
        campaignSnap.data().membershipSchemaVersion===2&&
        campaignSnap.data().ownerUid!==uid?await tx.get(memberRef(cid,uid)):null;
      const campaign=campaignSnap.exists()?{...campaignSnap.data(),id:cid}:null;
      if(!gmCampaignAccess(campaign,memberSnap?.exists()?memberSnap.data():null,uid,cid).allowed)
        throw Error('GM access changed. Reload the campaign.');
      const workspaceRef=firestoreSdk.doc(db,'campaigns',cid,'systems','gmWorkspace');
      const snapshot=await tx.get(workspaceRef);same(uid);
      const original=snapshot.exists()?snapshot.data():{};
      const notes=transform(original.notes||{});
      if(JSON.stringify(notes).length>850000)
        throw Error('Campaign notes are too large to save safely.');
      tx.set(workspaceRef,{notes,updatedBy:uid,
        updatedAt:firestoreSdk.serverTimestamp()},{merge:true});
      return {ok:true};
    });
    same(uid);return result;
  }
  async function saveGMNotes(cid,content,expected){
    return mutateGMNotes(cid,current=>savePrivateGMNotes(current,content,expected));
  }
  async function addGMSessionLog(cid,input){
    const id='session-log-'+crypto.randomUUID();
    return mutateGMNotes(cid,current=>appendGMSessionLog(current,input,{
      id,at:new Date().toISOString()}));
  }
  async function removeGMSessionLog(cid,id,createdAt){
    return mutateGMNotes(cid,current=>deleteGMSessionLog(current,id,createdAt));
  }
  /** News and events publish an allowlisted projection into the original
   * player-readable party-workspace. A GM draft never enters this mirror.
   */
  async function saveGMInformation(cid,kind,input){
    assertGMCampaignId(cid);
    if(!input||typeof input!=='object'||Array.isArray(input))
      throw Error('Invalid news/event entry.');
    const {uid}=await verifyCampaign(cid);
    let saved;
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaignSnap=await tx.get(campaignRef(cid));
      const memberSnap=campaignSnap.exists()&&
        campaignSnap.data().membershipSchemaVersion===2&&
        campaignSnap.data().ownerUid!==uid?await tx.get(memberRef(cid,uid)):null;
      const campaign=campaignSnap.exists()?{...campaignSnap.data(),id:cid}:null;
      if(!gmCampaignAccess(campaign,memberSnap?.exists()?memberSnap.data():null,uid,cid).allowed)
        throw Error('GM access changed. Reload the campaign.');
      const gmRef=firestoreSdk.doc(db,'campaigns',cid,'systems','gmWorkspace');
      const sharedRef=firestoreSdk.doc(db,'campaigns',cid,'systems','party-workspace');
      const gm=await tx.get(gmRef),party=await tx.get(sharedRef);same(uid);
      const changed=applyGMInformationChange({kind,input,campaign,
        world:gm.exists()?gm.data().world:{},
        sharedInformation:party.exists()?party.data().information:{},
        uid,at:new Date().toISOString()});
      saved=changed.saved;
      tx.set(gmRef,{world:changed.world,updatedBy:uid,
        updatedAt:firestoreSdk.serverTimestamp()},{merge:true});
      const sharedPatch={information:changed.information,updatedBy:uid,
        updatedAt:firestoreSdk.serverTimestamp()};
      // Replace the entire public information map when withdrawing a notice:
      // set(merge:true) would retain a previously published nested key.
      if(party.exists())tx.update(sharedRef,sharedPatch);
      else tx.set(sharedRef,sharedPatch);
    });
    same(uid);return {ok:true,entry:saved};
  }
  /** Use the existing trusted callable that checks the recipient's linked
   * character and GM membership. Never write an unscoped event in the browser.
   */
  async function sendGMNotification(cid,characterId,input){
    assertGMCampaignId(cid);assertGMCampaignId(characterId);
    const payload=validateGMAnnouncement({title:input?.title,message:input?.message,
      recipients:[characterId]});
    if(!functions||!functionsSdk?.httpsCallable)
      throw Error('Campaign notifications are unavailable.');
    const {uid}=await verifyCampaign(cid);
    const linked=await firestoreSdk.getDocFromServer(
      firestoreSdk.doc(db,'campaigns',cid,'characters',characterId));
    same(uid);
    if(!linked.exists()||!linked.data()?.ownerUid)
      throw Error('This character is no longer linked to the campaign.');
    const callable=functionsSdk.httpsCallable(functions,'asteriaAction');
    const response=await callable({action:'sendCharacterNotification',
      args:[cid,characterId,{title:payload.title,message:payload.message}],
      requestId:crypto.randomUUID()});
    same(uid);
    if(response.data?.ok!==true)
      throw Error(response.data?.error||'The notification was not delivered.');
    return response.data;
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

  return Object.freeze({availability:()=>flags,list,watch,sessionCommand,watchLayout,saveLayout,reviewRest,manageCondition,
    watchManagement,saveQuest,archiveQuest,assignQuest,reviewQuest,updateCampaignDetails,
    uploadArtwork,removeArtwork,saveGMNotes,addGMSessionLog,removeGMSessionLog,
    saveGMInformation,sendGMNotification});
}
