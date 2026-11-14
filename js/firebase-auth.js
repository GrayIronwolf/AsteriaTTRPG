import { normalizeInformation, publicInformation } from '../src/state/campaignInformation.mjs';
import { campaignArtworkFileError } from '../src/state/campaignArtwork.mjs';
import {battleMapFileError,battleMapFileKind,battleMapAssetPath,battleMapEditableSettings,battleMapDimensions,BATTLE_MAP_MAX_RECORDS} from '../src/state/battleMapModel.mjs';
import {battleMapPrivatePins} from '../src/state/battleMapFogModel.mjs';
import {validatedEditableProfile,avatarUploadError,accountAvatarPath} from '../src/state/accountProfileEdit.mjs?v=account-username-20261111';
import { mergeQuestAssignment } from '../src/state/questWorkflowModel.mjs';
import { validateOwnedRecord } from '../src/state/ownedCharacterRecords.mjs';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
/* =========================
   Asteria v1.7.2.3 Firebase Account + Data Sync Foundation
   Clean account login + separate account creation page.
   Login uses Username + Password. Account creation captures First Name, Last Name, Email, Username, Password.
   ========================= */
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail, sendEmailVerification, reload, setPersistence, browserLocalPersistence, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator, orderBy, limit, startAfter, doc, setDoc, getDoc, getDocFromServer, collection, getDocs, deleteDoc, onSnapshot, query, where, runTransaction, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getStorage, connectStorageEmulator, ref as storageRef, uploadBytes, getDownloadURL, getBlob, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';
import {accountIdRegistrationEnabled,finalizeRegisteredAccountId} from '../src/state/accountIdRegistration.mjs';
import {canSendVerificationEmail,canCompleteNewAccountId,accountIdCompletionEnabled} from '../src/state/accountEmailVerification.mjs';
import {validateAccountRegistrationFields,recoverPendingRegistrationProfile} from '../src/state/accountRegistrationRecovery.mjs';
import { SESSION_LIMIT_MS, normalizeDashboardPreferences, slug as liveSlug, structuredCloneSafe, timestampMs, unidentifiedItemName } from '../src/state/liveWorkspaceModel.mjs';
import { applySoulDamage, recoverSoulDamage } from '../src/state/specialDamageModel.mjs';
import { createAsteriaItem, normalizeMarketPricing } from '../src/systems/items/marketPricing.mjs';
import { incomingSnapshotIsStale, knownMagicElements, mergeLinkedCharacter, ownedGameplayMirrorPatch, safeLinkedCharacterPatch, strictResourcePair } from '../src/state/characterIntegrityModel.mjs';
import { normalizeAssignedQuest } from '../src/state/questRewardModel.mjs';
import { normalizeMerchantTemplate } from '../src/state/merchantTemplateModel.mjs';
import { encounterResourcePair, setEncounterResource } from '../src/state/encounterResourceModel.mjs';

const productionFirebaseConfig = {
  apiKey: 'AIzaSyBCFapadl9W4WCouRsKuMPWOZPHQuNjea0',
  authDomain: 'asteria-ttrpg.firebaseapp.com',
  projectId: 'asteria-ttrpg',
  storageBucket: 'asteria-ttrpg.firebasestorage.app',
  messagingSenderId: '549905451812',
  appId: '1:549905451812:web:5e2a9c170984c175e8c1b1',
  measurementId: 'G-FVD0YYJ0HP'
};

const localHost = ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname);
const reactDevFixture = localHost && new URLSearchParams(window.location.search).get('reactFixture') === '1';
// Native browser modules have no import.meta.env; local static builds are safe too.
const firebaseEnv = import.meta.env || {};
const firebaseMode = firebaseEnv.VITE_FIREBASE_MODE || (localHost ? 'emulator' : 'production');
const firebaseConfig = firebaseMode === 'emulator' ? {
  apiKey:'demo-key', authDomain:'demo-asteria.firebaseapp.com', projectId:'demo-asteria',
  storageBucket:'demo-asteria.appspot.com', appId:'demo-app'
} : productionFirebaseConfig;
let app, auth, db, storage, functionsClient, currentUser = null, currentProfile = null;
let ownershipReadyUid = '';
try {
  if(reactDevFixture) throw new Error('React development fixture active.');
  if(!['emulator','production'].includes(firebaseMode) || (!localHost && firebaseMode === 'emulator')) throw new Error('Invalid Firebase environment.');
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  functionsClient = getFunctions(app, 'us-central1');
  if(firebaseMode === 'emulator') {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    connectFunctionsEmulator(functionsClient, '127.0.0.1', 5001);
  }
  setPersistence(auth, browserLocalPersistence).catch(err => reportSyncError('auth-persistence', err));
} catch (err) {
  if(!reactDevFixture) console.warn('Firebase failed to initialise. Account login requires Firebase setup.', err);
}
const trustedActionsInFlight=new Map();
function callTrustedAction(action,args) {
  if(!functionsClient || !currentUser) return Promise.resolve({ok:false,error:'Sign in before making changes.'});
  const key=JSON.stringify([currentUser.uid,action,args]);
  if(trustedActionsInFlight.has(key)) return trustedActionsInFlight.get(key);
  const requestId=crypto.randomUUID();
  const promise=Promise.resolve().then(()=>httpsCallable(functionsClient,'asteriaAction')({action,args:args.map(value=>value===undefined?null:value),requestId})).then(result=>{
    if(result.data?.ok===false) reportSyncError('player-action',new Error(result.data.error || 'Action rejected.'),{campaignId:args[0]});
    return result.data;
  }).catch(error=>{
    reportSyncError('player-action',error,{campaignId:args[0]});
    return {ok:false,error:error.message || 'The change could not be confirmed. Refresh before retrying.'};
  }).finally(()=>trustedActionsInFlight.delete(key));
  trustedActionsInFlight.set(key,promise);
  return promise;
}

function $(id){ return document.getElementById(id); }
function notice(msg){ if(window.toast) window.toast(msg); else alert(msg); }
function usernameKey(value){ return String(value||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,''); }
function localUsernameMap(){ try{return JSON.parse(localStorage.getItem('asteriaFirebaseUsernameMap')||'{}')}catch(e){return {}} }
function saveLocalUsername(username, data){ try{ const map=localUsernameMap(); map[usernameKey(username)] = data; localStorage.setItem('asteriaFirebaseUsernameMap', JSON.stringify(map)); }catch(e){} }
function localProfileStore(){ try{return JSON.parse(localStorage.getItem('asteriaFirebaseProfiles')||'{}')}catch(e){return {}} }
function saveLocalProfile(uid, profile){ try{ const map=localProfileStore(); map[uid]=profile; localStorage.setItem('asteriaFirebaseProfiles', JSON.stringify(map)); }catch(e){} }
function getLocalProfile(uid){ return localProfileStore()[uid] || null; }

// Pending registration records contain only form identity fields, NEVER passwords.
// Session scope avoids a permanent local account directory or cross-device claims.
const PENDING_ACCOUNT_KEY='asteriaPendingAccountSetupV1';
function pendingAccountDraft(){
  try{return JSON.parse(sessionStorage.getItem(PENDING_ACCOUNT_KEY)||'null');}
  catch{return null;}
}
function setPendingAccountDraft(value){
  try{
    if(value)sessionStorage.setItem(PENDING_ACCOUNT_KEY,JSON.stringify(value));
    else sessionStorage.removeItem(PENDING_ACCOUNT_KEY);
  }catch(err){console.warn('Account setup session cache unavailable.');}
}
function updatePendingAccountSetupNotice(){
  const row=$('pendingAccountSetupBox');
  if(!row)return;
  const draft=pendingAccountDraft();
  const show=Boolean(currentUser?.uid && draft?.uid===currentUser.uid);
  row.hidden=!show;
  row.style.display=show?'':'none';
}
async function retryPendingAccountSetup(){
  const user=currentUser;
  const draft=pendingAccountDraft();
  if(!user || !draft || draft.uid!==user.uid){
    notice('Sign in to the original account to finish its setup.');return;
  }
  const button=$('retryAccountSetupBtn');
  if(button)button.disabled=true;
  try{
    if(!db)throw Error('Account profile storage is currently unavailable.');
    const profile=await recoverPendingRegistrationProfile({
      uid:user.uid,authEmail:user.email,draft,
      transaction:callback=>runTransaction(db,async tx=>{
        const ref=doc(db,'users',user.uid);
        let snapshot=await tx.get(ref);
        return callback({
          read:()=>snapshot.exists()?snapshot.data():null,
          create: data=>tx.set(ref,{...data,createdAt:serverTimestamp()}),
          patch: data=>tx.update(ref,data)
        });
      }),
      readCanonical:async()=>{
        const snap=await getDocFromServer(doc(db,'users',user.uid));
        return snap.exists()?snap.data():null;
      }
    });
    let identity={};
    if(accountIdRegistrationEnabled(window.AsteriaFeatureFlags)){
      if(!functionsClient)throw Error('Account ID service is unavailable.');
      identity=await finalizeRegisteredAccountId({
        enabled:true,uid:user.uid,username:profile.username,
        requestAssignment:input=>httpsCallable(functionsClient,'asteriaAccountIdentity')(input),
        readProfile:async()=>{
          const snap=await getDocFromServer(doc(db,'users',user.uid));
          return snap.exists()?snap.data():null;
        }
      })||{};
    }
    if(currentUser?.uid!==user.uid)return; // Prevent cross-session completion.
    currentProfile={...currentProfile,...profile,...identity};
    saveLocalProfile(user.uid,currentProfile);
    window.AsteriaAuthBridge?.setSession?.(currentProfile,user);
    setPendingAccountDraft(null);
    updatePendingAccountSetupNotice();
    notice(identity.accountId?`Account setup complete: ${identity.accountId}`:'Account profile setup complete.');
  }catch(err){
    console.warn('Account setup retry was not completed.',err?.code || 'unknown');
    notice('Account setup is still pending. Your existing account was not replaced.');
  }finally{
    if(button)button.disabled=false;
  }
}
window.asteriaRetryPendingAccountSetup=retryPendingAccountSetup;

function cleanData(value){ return JSON.parse(JSON.stringify(value)); }
function campaignCode(value){ return String(value || '').replace(/\D/g, '').slice(0, 12); }
function campaignOwner(campaign){
  const clean = campaign || {};
  const uid = currentUser?.uid || '';
  const claimedOwner = clean.ownerUid || clean.gmId || '';
  const currentUserOwnsCampaign = !claimedOwner || claimedOwner === uid || clean.ownerAccount === uid || (clean.gmUids || []).includes(uid);
  return currentUserOwnsCampaign ? uid : claimedOwner;
}
function campaignDisplayName(){
  return currentProfile?.username || currentProfile?.displayName || currentUser?.displayName || currentUser?.email || 'Asteria Player';
}
function currentUserIsCampaignGM(campaign={}){
  const uid=currentUser?.uid || '';
  return Boolean(uid && (
    campaign.ownerUid===uid ||
    campaign.roles?.[uid]==='gm' ||
    (Array.isArray(campaign.gmUids) && campaign.gmUids.includes(uid))
  ));
}

function uniqueValues(...lists){
  return Array.from(new Set(lists.flatMap(value => Array.isArray(value) ? value : []).filter(Boolean)));
}
function mergeCampaignPlayers(localPlayers={}, sharedPlayers={}){
  const players = Object.assign({}, localPlayers || {});
  Object.entries(sharedPlayers || {}).forEach(([uid, player])=>{
    const localPlayer = players[uid] || {};
    players[uid] = Object.assign({}, localPlayer, player, {
      characterIds:uniqueValues(localPlayer.characterIds, player?.characterIds)
    });
  });
  return players;
}
function mergeSharedCampaign(localCampaign={}, sharedCampaign={}){
  const local = localCampaign || {};
  const shared = sharedCampaign || {};
  const players = mergeCampaignPlayers(local.players, shared.players);
  const characters = Object.assign({}, local.characters || {}, shared.characters || {});
  const playerCharacterLinks = Object.assign({}, local.playerCharacterLinks || {}, shared.playerCharacterLinks || {});
  const playerCharacterIds = Object.values(players).flatMap(player=>Array.isArray(player?.characterIds) ? player.characterIds : []);
  return Object.assign({}, local, shared, {
    id:shared.id || local.id,
    ownerUid:shared.ownerUid || local.ownerUid || '',
    gmUids:shared.gmUids || [],
    playerUids:shared.playerUids || [],
    party:uniqueValues(local.party, shared.party, playerCharacterIds, Object.keys(characters), Object.keys(playerCharacterLinks)),
    roles:shared.roles || {},
    players,
    characters,
    playerCharacterLinks,
    activity:uniqueValues(local.activity, shared.activity),
    lastLinkedCharacterId:shared.lastLinkedCharacterId || local.lastLinkedCharacterId || ''
  });
}
function reportSyncError(scope, error, detail={}){
  console.warn(`Asteria Firebase ${scope} failed.`, error);
  window.dispatchEvent(new CustomEvent('asteria:firebase-sync-error', {
    detail:Object.assign({
      scope,
      code:error?.code || '',
      message:error?.message || String(error || 'Unknown Firebase error')
    }, detail)
  }));
}
const GALLERY_IMAGE_TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif']);
function galleryUploadError(error){
  const code=String(error?.code||'');
  if(code.includes('unauthorized')) return 'Firebase Storage blocked this upload. Check that you are signed in as the character owner and deploy storage.rules.';
  if(code.includes('quota')) return 'Firebase Storage quota has been reached. Try again after checking the Firebase project quota.';
  if(code.includes('canceled')) return 'The image upload was cancelled.';
  if(code.includes('unknown')) return 'Firebase Storage could not complete the upload. Check the browser console and try again.';
  return error?.message||String(error||'The gallery image could not be uploaded.');
}
function linkedCampaignIdsFromOwnedCharacters(uid){
  const ids = new Set();
  Object.values(window.chars || {}).forEach(character=>{
    if(!character || character.ownerUid !== uid) return;
    uniqueValues(
      character.linkedCampaignIds,
      character.sharedCampaignId ? [character.sharedCampaignId] : []
    ).forEach(id=>ids.add(String(id)));
  });
  return Array.from(ids);
}
async function loadSharedCampaignDetails(id, accountCampaign={}, knownShared=null){
  let shared = knownShared;
  if(!shared){
    try{
      const sharedSnap = await getDoc(doc(db, 'campaigns', id));
      if(sharedSnap.exists()) shared = Object.assign({}, sharedSnap.data(), { id });
    }catch(error){
      // Account copies and character links can outlive membership or the campaign.
      // Discovery must not treat them as authorization to read its subcollections.
      if(!String(error?.code || '').includes('permission-denied')) reportSyncError('campaign-read', error, { campaignId:id });
      return null;
    }
  }
  if(!shared) return null;
  let campaign = mergeSharedCampaign(accountCampaign, shared);
  try{
    const ecosystemSnap = await getDoc(doc(db, 'campaigns', id, 'systems', 'itemEcosystem'));
    if(ecosystemSnap.exists()) campaign.itemEcosystem = ecosystemSnap.data();
  }catch(error){
    reportSyncError('item-ecosystem-read', error, { campaignId:id });
  }
  const sharedCharacters = {};
  try{
    const characterSnap = await getDocs(collection(db, 'campaigns', id, 'characters'));
    characterSnap.forEach(characterDoc=>{
      sharedCharacters[characterDoc.id] = Object.assign({}, characterDoc.data(), { id:characterDoc.id });
    });
  }catch(error){
    reportSyncError('campaign-characters-read', error, { campaignId:id });
  }
  hydrateSharedCampaignCharacters(campaign, sharedCharacters);
  return campaign;
}
function campaignMembershipQueries(uid){
  const campaignsCollection = collection(db, 'campaigns');
  return [
    query(campaignsCollection, where('ownerUid', '==', uid)),
    query(campaignsCollection, where('gmUids', 'array-contains', uid)),
    query(campaignsCollection, where('playerUids', 'array-contains', uid))
  ];
}
function campaignCharacterOwner(campaignId, characterId, character={}){
  if(character?.ownerUid) return String(character.ownerUid);
  const campaign=(window.campaigns || []).find(item=>String(item?.id || '') === String(campaignId || ''));
  const direct=campaign?.playerCharacterLinks?.[characterId]
    || campaign?.characters?.[characterId]?.ownerUid;
  if(direct) return String(direct);
  const player=Object.entries(campaign?.players || {}).find(([,record])=>
    Array.isArray(record?.characterIds) && record.characterIds.includes(characterId)
  );
  return player ? String(player[0]) : '';
}
function campaignCharacterSnapshot(character, campaignId, ownerUid=currentUser?.uid || ''){
  const clean = cleanData(character || {});
  const id = String(clean.id || '');
  return Object.assign({}, clean, {
    id,
    ownerUid:clean.ownerUid || ownerUid,
    sourceCharacterId:clean.sourceCharacterId || id,
    sharedCampaignId:campaignId,
    linkedCampaignIds:uniqueValues(clean.linkedCampaignIds, [campaignId]),
    status:'linked'
  });
}
function campaignCharacterSummary(character, campaignId, ownerUid=currentUser?.uid || ''){
  const snapshot = campaignCharacterSnapshot(character, campaignId, ownerUid);
  const summary = Object.assign({}, snapshot);
  delete summary.character;
  delete summary.dashboard;
  delete summary.racialFeaturesMarkdown;
  delete summary.racialTraitsMarkdown;
  return Object.assign(summary, {
    id:snapshot.id,
    sourceCharacterId:snapshot.sourceCharacterId,
    ownerUid:snapshot.ownerUid,
    name:snapshot.name || snapshot.id,
    initial:snapshot.initial || String(snapshot.name || snapshot.id).charAt(0).toUpperCase(),
    race:snapshot.race || '',
    klass:snapshot.klass || snapshot.class || '',
    level:Number(snapshot.level || 0),
    hp:Array.isArray(snapshot.hp) ? snapshot.hp : [10,10],
    sp:Array.isArray(snapshot.sp) ? snapshot.sp : [10,10],
    mp:Array.isArray(snapshot.mp) ? snapshot.mp : [10,10],
    bp:Array.isArray(snapshot.bp) ? snapshot.bp : null,
    xp:Number(snapshot.xp || 0),
    xpMax:Number(snapshot.xpMax || 1000),
    conditions:Array.isArray(snapshot.conditions) ? snapshot.conditions : [],
    status:'linked',
    sharedCampaignId:campaignId,
    linkedAt:snapshot.linkedAt || new Date().toISOString()
  });
}
function hydrateSharedCampaignCharacters(campaign, sharedCharacters={}){
  if(!campaign?.id) return;
  window.chars = window.chars || {};
  const summaries = campaign.characters || {};
  const activeIds=new Set(uniqueValues(campaign.party,Object.keys(summaries),Object.keys(sharedCharacters)));
  // Do not rehydrate detached campaign-scoped IDs from stale account caches.
  Object.keys(window.chars).forEach(id=>{
    const ch=window.chars[id];
    if(ch?.sharedCampaignId===campaign.id&&id.startsWith('linkchar-')&&
      !activeIds.has(id))delete window.chars[id];
  });
  activeIds.forEach(id=>{
    const summary = summaries[id] || {};
    const shared = sharedCharacters[id] || {};
    const existing = window.chars[id] || {};
    const record = Object.assign({
      id,
      name:id,
      initial:String(summary.name || shared.name || id).charAt(0).toUpperCase(),
      race:'Unselected',
      klass:'Class',
      level:0,
      hp:[10,10],
      sp:[10,10],
      mp:[10,10],
      xp:0,
      xpMax:1000,
      conditions:[],
      characteristics:{},
      resourceMods:{ hp:0, sp:0, mp:0 }
    }, existing, summary, shared, {
      id,
      sharedCampaignId:campaign.id,
      campaign:campaign.name || shared.campaign || summary.campaign || 'Linked Campaign'
    });
    record.initial = record.initial || String(record.name || id).charAt(0).toUpperCase();
    record.klass = record.klass || record.class || 'Class';
    record.hp = Array.isArray(record.hp) ? record.hp : [10,10];
    record.sp = Array.isArray(record.sp) ? record.sp : [10,10];
    record.mp = Array.isArray(record.mp) ? record.mp : [10,10];
    record.conditions = Array.isArray(record.conditions) ? record.conditions : [];
    record.linkedCampaignIds = uniqueValues(record.linkedCampaignIds, [campaign.id]);
    window.chars[id] = record;
  });
}
async function linkedCampaignIdsForCharacter(characterId, character){
  const linked = uniqueValues(character?.linkedCampaignIds, character?.sharedCampaignId ? [character.sharedCampaignId] : []);
  if(linked.length || !db || !currentUser) return linked;
  try{
    const campaignsSnap = await getDocs(collection(db, 'users', currentUser.uid, 'campaigns'));
    campaignsSnap.forEach(item=>{
      const campaign = item.data() || {};
      const player = campaign.players?.[currentUser.uid] || {};
      const matchesSavedName=character?.campaign && character.campaign !== 'Unassigned' && String(campaign.name||'').toLowerCase() === String(character.campaign).toLowerCase();
      if((player.characterIds || []).includes(characterId) || campaign.playerCharacterLinks?.[characterId] === currentUser.uid || matchesSavedName){
        linked.push(item.id);
      }
    });
  }catch(err){ console.warn('Could not discover linked campaigns for character sync.', err); }
  if(!linked.length){
    try{
      const stateSnap = await getDoc(doc(db, 'users', currentUser.uid, 'settings', 'appState'));
      const savedCampaigns = stateSnap.exists() && Array.isArray(stateSnap.data()?.campaigns) ? stateSnap.data().campaigns : [];
      savedCampaigns.forEach(campaign=>{
        const player = campaign?.players?.[currentUser.uid] || {};
        const matchesSavedName=character?.campaign && character.campaign !== 'Unassigned' && String(campaign?.name||'').toLowerCase() === String(character.campaign).toLowerCase();
        if((campaign?.party||[]).includes(characterId) || (player.characterIds||[]).includes(characterId) || campaign?.playerCharacterLinks?.[characterId] === currentUser.uid || matchesSavedName){
          if(campaign?.id) linked.push(campaign.id);
        }
      });
    }catch(err){ console.warn('Could not inspect the saved workspace for a legacy campaign link.', err); }
  }
  return uniqueValues(linked);
}
async function upsertSharedCampaignCharacter(campaignId, characterId, character){
  if(!db || !currentUser || !campaignId || !characterId || !character) return null;
  const uid = currentUser.uid;
  if(character.ownerUid !== uid) throw new Error('Only the character owner can link this character.');
  const merged = await runTransaction(db, async transaction=>{
    const campaignRef = doc(db, 'campaigns', campaignId);
    const characterRef = doc(db, 'campaigns', campaignId, 'characters', characterId);
    const privateId = character.sourceCharacterId || characterId;
    const privateRef = doc(db, 'users', uid, 'characters', privateId);
    const [campaignSnap, characterSnap, privateSnap] = await Promise.all([transaction.get(campaignRef), transaction.get(characterRef), transaction.get(privateRef)]);
    if(!campaignSnap.exists()) return null;
    const campaign = Object.assign({}, campaignSnap.data(), { id:campaignId });
    const roles = Object.assign({}, campaign.roles || {});
    if(campaign.membershipSchemaVersion === 2) {
      const membership = await transaction.get(doc(db,'campaigns',campaignId,'members',uid));
      const m = membership.exists() ? membership.data() : null;
      if(campaign.ownerUid !== uid && !(m?.uid === uid && m?.campaignId === campaignId && m?.status === 'active' && ['player','co-gm'].includes(m.role))) {
        throw new Error('campaign-membership-required');
      }
      // Full v2 character-link approval and capacity checks arrive in Phase 5.
      // Block legacy roster writes rather than re-create access through old maps.
      throw new Error('Character linking for upgraded campaigns requires GM approval.');
    }
    if(campaign.membershipSchemaVersion !== undefined && campaign.membershipSchemaVersion !== null && campaign.membershipSchemaVersion !== 1) throw new Error('campaign-membership-required');
    const isMember = campaign.ownerUid === uid || roles[uid] === 'gm' || roles[uid] === 'player' || (campaign.playerUids || []).includes(uid) || (campaign.gmUids || []).includes(uid);
    if(!isMember) throw new Error('campaign-membership-required');

    if(privateSnap.exists() && privateSnap.data().ownerUid !== uid) throw new Error('The saved character belongs to another account.');
    const source = privateSnap.exists() ? Object.assign({}, privateSnap.data(), safeLinkedCharacterPatch(character)) : character;
    const submitted = campaignCharacterSnapshot(Object.assign({}, source, { id:characterId }), campaignId, uid);
    const existing = characterSnap.exists() ? Object.assign({ id:characterId }, characterSnap.data()) : null;
    if(existing?.sourceCharacterId && existing.sourceCharacterId !== privateId) throw new Error('The campaign character points to a different saved character.');
    const ownerUid = existing?.ownerUid || submitted.ownerUid || uid;
    if(ownerUid !== uid || (campaign.playerCharacterLinks?.[characterId] && campaign.playerCharacterLinks[characterId] !== uid)) throw new Error('This character is already linked to another account.');
    const linkMetadata = {
      id:characterId,
      sourceCharacterId:existing?.sourceCharacterId || submitted.sourceCharacterId || characterId,
      ownerUid,
      sharedCampaignId:campaignId,
      linkedCampaignIds:uniqueValues(existing?.linkedCampaignIds, submitted.linkedCampaignIds, [campaignId]),
      status:'linked'
    };
    const linkedCharacter = mergeLinkedCharacter(existing, submitted, linkMetadata);

    const players = Object.assign({}, campaign.players || {});
    const previousPlayer = players[uid] || { uid, role:campaign.ownerUid === uid ? 'gm' : 'player', status:'active', characterIds:[], joinedAt:new Date().toISOString() };
    players[uid] = Object.assign({}, previousPlayer, {
      uid,
      displayName:previousPlayer.displayName || campaignDisplayName(),
      status:'active',
      characterIds:uniqueValues(previousPlayer.characterIds, [characterId])
    });
    const party = uniqueValues(campaign.party, [characterId]);
    const characters = Object.assign({}, campaign.characters || {}, {
      [characterId]:campaignCharacterSummary(Object.assign({}, linkedCharacter, { linkedAt:new Date().toISOString() }), campaignId, linkedCharacter.ownerUid || uid)
    });
    const playerCharacterLinks = Object.assign({}, campaign.playerCharacterLinks || {}, { [characterId]:uid });
    const activity = Array.isArray(campaign.activity) ? campaign.activity.slice() : [];
    if(!(campaign.party || []).includes(characterId)) activity.push(`${character.name || characterId} linked to campaign.`);
    const result = Object.assign({}, campaign, { party, players, characters, playerCharacterLinks, activity, lastLinkedCharacterId:characterId });
    transaction.update(campaignRef, {
      party,
      players,
      characters,
      playerCharacterLinks,
      activity,
      lastLinkedCharacterId:characterId,
      updatedAt:serverTimestamp()
    });
    transaction.set(
      characterRef,
      Object.assign({}, existing ? safeLinkedCharacterPatch(submitted) : cleanData(linkedCharacter), linkMetadata, { updatedAt:serverTimestamp() }),
      { merge:true }
    );
    // A Forge save can still be in flight. Create the private record and campaign
    // link together, and never replace an existing owner's gameplay snapshot.
    transaction.set(privateRef, Object.assign({}, privateSnap.exists() ? {} : cleanData(linkedCharacter), linkMetadata, {
      id:privateId, campaign:campaign.name || character.campaign || 'Linked Campaign', updatedAt:serverTimestamp()
    }), { merge:true });
    transaction.set(doc(db, 'users', uid, 'campaigns', campaignId), Object.assign({}, result, { updatedAt:serverTimestamp() }), { merge:true });
    return { campaign:result, character:linkedCharacter };
  });
  return merged || null;
}
async function syncCharacterToCampaigns(characterId, character){
  if(!db || !currentUser || !characterId || !character) return;
  const campaignIds = await linkedCampaignIdsForCharacter(characterId, character);
  if(!campaignIds.length) return;
  const snapshotBase = Object.assign({}, character, { id:characterId, linkedCampaignIds:campaignIds });
  for(const campaignId of campaignIds){
    // V2 characters are imported by an authenticated GM transaction. Legacy
    // client link upserts must never rewrite their reserved campaign IDs.
    if(character.campaignCharacterIds?.[campaignId])continue;
    try{
      await upsertSharedCampaignCharacter(campaignId, characterId, snapshotBase);
    }catch(err){ reportSyncError('character-link-write',err,{campaignId,characterId}); throw err; }
  }
}

function friendlyFirebaseError(err, context='login'){
  const code = err?.code || '';
  if(context === 'login'){
    if(code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'Password incorrect';
    if(code === 'auth/user-not-found') return 'No User';
  }
  const map = {
    'auth/email-already-in-use':'Email already has an account. Please log in or reset your password.',
    'auth/invalid-email':'Please enter a valid email address.',
    'auth/missing-password':'Please enter a password.',
    'auth/weak-password':'Password is too weak. Use at least 6 characters.',
    'auth/invalid-credential':'Username or password is incorrect.',
    'auth/user-not-found':'No User',
    'auth/wrong-password':'Password incorrect',
    'auth/configuration-not-found':'Firebase Authentication is not enabled yet. In Firebase Console, enable Authentication > Email/Password and add your website domain as an authorised domain.',
    'auth/network-request-failed':'Network error. Check your connection and try again.',
    'auth/too-many-requests':'Too many attempts. Wait a moment, then try again.'
  };
  return map[code] || (err?.message || 'Firebase account action failed.');
}
function showAuthHint(message, kind='info'){
  const box = $('firebaseAuthHint') || $('loginPageHint');
  if(!box) return notice(message);
  box.textContent = message;
  box.className = `auth-hint ${kind}`;
}
function showCreateHint(message, kind='info'){
  const box = $('createAccountHint');
  if(!box) return notice(message);
  box.textContent = message;
  box.className = `auth-hint ${kind}`;
}

async function resolveLoginToEmail(value){
  const email=String(value||'').trim();
  return email.includes('@') ? {email,username:email} : {error:'Please sign in with your email address.'};
}

async function ensureProfile(user, defaults={}){
  const fallback = {
    uid:user.uid,
    email:user.email || defaults.email || '',
    username:defaults.username || user.displayName || user.email || 'Asteria User',
    firstName:defaults.firstName || '',
    lastName:defaults.lastName || '',
    role:'account',
    characters:[]
  };
  const localProfile = getLocalProfile(user.uid);
  if(!db) return Object.assign({}, fallback, localProfile || {});
  try{
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if(snap.exists()){
      const profile = Object.assign({}, fallback, snap.data());
      saveLocalProfile(user.uid, profile);
      return profile;
    }
    await setDoc(ref, Object.assign({}, fallback, { createdAt:serverTimestamp() }), { merge:true });
    saveLocalProfile(user.uid, fallback);
    return fallback;
  }catch(err){
    console.warn('Firestore profile unavailable. Login will continue using local fallback profile.', err);
    showAuthHint('Logged in. Firestore profile storage is not available yet, so using local account mode for now.', 'warn');
    return Object.assign({}, fallback, localProfile || {});
  }
}
async function loadCharacters(user){
  if(!db || !user) return;
  try{
    const snap = await getDocs(query(collection(db, 'users', user.uid, 'characters'), where('ownerUid', '==', user.uid)));
    const chars = [], excluded = [];
    await Promise.all(snap.docs.map(async d => {
      const record = Object.assign({}, d.data(), { id:d.id });
      try {
        const valid = await validateOwnedRecord(record, user.uid, async (campaignId, characterId) => {
          const shared = await getDoc(doc(db, 'campaigns', campaignId, 'characters', characterId));
          return shared.exists() ? Object.assign({}, shared.data(), { id:shared.id }) : null;
        });
        if(valid) chars.push(record); else excluded.push(d.id);
      } catch(error) {
        // Unverifiable links are quarantined, never adopted as private characters.
        excluded.push(d.id);
        console.warn('Character ownership could not be verified.', d.id, error.code);
      }
    }));
    if(currentUser?.uid !== user.uid) return;
    const validIds = new Set(chars.map(character => character.id));
    // Remove stale private cache entries; campaign listeners separately hydrate GM-visible sheets.
    Object.entries(window.chars || {}).forEach(([id, character]) => {
      if(character.ownerUid === user.uid && !validIds.has(id)) delete window.chars[id];
    });
    ownershipReadyUid = user.uid;
    currentProfile = Object.assign({}, currentProfile || {}, { characters:[...validIds] });
    window.AsteriaAuthBridge?.importCharacters(user.uid, chars);
    window.dispatchEvent(new CustomEvent('asteria:owned-characters-loaded', { detail:{ uid:user.uid, excluded } }));
    if(excluded.length) console.warn('Excluded unverified private character copies; no cloud records were changed.', excluded);
  }catch(err){ reportSyncError('character-load',err); throw err; }
}
function openAccountHome(profile, user){
  if(!window.AsteriaAuthBridge){ throw new Error('Asteria account bridge is not loaded. Refresh the page and try again.'); }
  window.AsteriaAuthBridge.setSession(profile, user);
  $('loginPanel')?.classList.remove('open');
  // Preserve bookmarks and campaign invitations; an ordinary login opens Home.
  if(!window.location.hash.replace(/^#\/?$/, '')){
    if(window.asteriaHardHome) window.asteriaHardHome();
    else window.setView?.('home');
  }
}

function authPanelHtml(){
  return `
    <h3>Asteria Login</h3>
    <p class="muted smallnote">Login is account-based. Create characters and campaigns after logging in.</p>
    <div id="firebaseAuthHint" class="auth-hint">Enter your email address and password.</div>
    <label>Email address<input id="loginUsername" placeholder="Email address" autocomplete="username"></label>
    <label>Password<input id="loginPassword" type="password" placeholder="Password" autocomplete="current-password"></label>
    <div class="auth-actions auth-actions-split">
      <button id="firebaseLoginBtn" class="primary" type="button">Login</button>
      <button id="goCreateAccountBtn" class="outline" type="button">Create Account</button>
    </div>
    <button id="testLoginBtn" class="outline wide" type="button">Test Login</button>
    <button id="resetPasswordBtn" class="link-button" type="button">Reset password</button>
  `;
}

window.openAccountCreate = function(){
  $('loginPanel')?.classList.remove('open');
  window.setView?.('accountCreate');
};
window.backToLogin = function(){
  $('loginPanel')?.classList.remove('open');
  window.setView?.('loginPage');
};

window.firebaseCreateAccountPage = async function(){
  if(!auth) return notice('Firebase is not ready. Check internet connection or Firebase config.');
  const firstName = $('createFirstName')?.value?.trim() || '';
  const lastName = $('createLastName')?.value?.trim() || '';
  const email = $('createEmail')?.value?.trim() || '';
  const username = $('createUsername')?.value?.trim() || '';
  const password = $('createPassword')?.value || '';
  const key = usernameKey(username);

  const confirmPassword = $('createConfirmPassword')?.value || '';
  const validation=validateAccountRegistrationFields({
    firstName,lastName,email,username,password,confirmPassword
  });
  if(!validation.ok){
    showCreateHint(validation.message,'warn');
    return notice(validation.message);
  }

  try{
    showCreateHint('Creating account...', 'info');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // If Firestore fails after Auth succeeds, retry on this same UID.
    setPendingAccountDraft({uid:cred.user.uid,email,username,firstName,lastName});
    const displayName = username;
    try{ await updateProfile(cred.user, { displayName }); }catch(e){ console.warn(e); }
    const profile = { uid:cred.user.uid, email, username, usernameLower:key, firstName, lastName, role:'account', characters:[], createdAt:serverTimestamp() };
    let profileStored = false;
    try{
      if(db){
        await setDoc(doc(db, 'users', cred.user.uid), profile, { merge:true });
        profileStored = true;
      }
    }catch(err){
      console.warn('Account was created in Firebase Auth, but Firestore profile save failed. Saving local fallback profile.', err);
      showCreateHint('Account created. Firestore profile save failed, so a local profile cache was saved on this device.', 'warn');
    }
    // Phase 2.1: new registrations only. Website rollout stays OFF by default,
    // independent of the server-side ASTERIA_ACCOUNT_IDS_ENABLED gate.
    let accountIdentity = null;
    let accountIdWarning = '';
    if(accountIdRegistrationEnabled(window.AsteriaFeatureFlags)){
      if(!profileStored || !functionsClient){
        accountIdWarning = 'Account created. Your Account ID is pending; retry setup promptly. Older registrations may need account review.';
      }else{
        try{
          accountIdentity = await finalizeRegisteredAccountId({
            enabled:true,
            uid:cred.user.uid,
            username,
            requestAssignment: request => httpsCallable(functionsClient,'asteriaAccountIdentity')(request),
            readProfile: async()=>{
              const stored = await getDocFromServer(doc(db,'users',cred.user.uid));
              return stored.exists() ? stored.data() : null;
            }
          });
        }catch(err){
          // The Firebase Auth account exists already: never claim it was rolled back
          // or silently report a complete Account ID registration.
          console.warn('Account ID finalization pending.',err?.code || 'unknown');
          accountIdWarning = 'Account created, but your Account ID could not be confirmed. Retry promptly; older registrations may need account review.';
        }
      }
    }
    // Email verification is independent from permanent Account ID creation.
    // Request the verification email after the first ID attempt so delivery
    // failures cannot delay, prevent or replace an account's number.
    // Send a Firebase Authentication verification email for the new account.
    // Email send errors do not delete or replace an already-created account.
    let verificationNotice='';
    let verificationError=false;
    if(canSendVerificationEmail(cred.user)){
      try{
        await sendEmailVerification(cred.user);
        verificationNotice=' Check your inbox (including spam) and then use Account > Password & Security to confirm verification.';
      }catch(error){
        console.warn('Registration email verification could not be sent.',error?.code||'unavailable');
        verificationNotice=' The verification email could not be sent. Open Account > Password & Security to resend it.';
        verificationError=true;
      }
    }
    saveLocalUsername(username, { uid:cred.user.uid, email, username, usernameLower:key });
    currentUser = cred.user;
    currentProfile = Object.assign({}, profile, accountIdentity || {}, { createdAt: Date.now() });
    saveLocalProfile(cred.user.uid, currentProfile);
    await loadCharacters(cred.user);
    const successMessage = (accountIdWarning || (accountIdentity ?
      `Account created: ${accountIdentity.accountId}` : 'Account created.')) + verificationNotice;
    showCreateHint(successMessage, accountIdWarning || verificationError ? 'warn' : 'success');
    notice(successMessage);
    if(profileStored && !accountIdWarning)setPendingAccountDraft(null);
    openAccountHome(currentProfile, cred.user);
    updatePendingAccountSetupNotice();
    window.dispatchEvent(new CustomEvent('asteria:firebase-ready', { detail:{ uid: cred.user.uid, source:'login' }}));
  }catch(err){
    const msg = friendlyFirebaseError(err, 'create');
    showCreateHint(msg, 'error');
    notice(msg);
    console.error('Asteria account creation failed:', err);
  }
};

function loginCredentials(input = {}){
  return {
    username: String(input.username ?? $('loginUsername')?.value ?? $('loginPageUser')?.value ?? '').trim(),
    password: String(input.password ?? $('loginPassword')?.value ?? $('loginPagePass')?.value ?? '')
  };
}

window.firebaseLogin = async function(input = {}){
  if(!auth) return notice('Firebase is not ready. Check internet connection or Firebase config.');
  const { username, password } = loginCredentials(input);
  if(!username || !password){
    const msg='Enter username or email and password.';
    showAuthHint(msg, 'warn'); return notice(msg);
  }
  showAuthHint('Checking account...', 'info');
  try{
    const resolved = await resolveLoginToEmail(username);
    if(resolved.error){ showAuthHint(resolved.error, 'error'); return notice(resolved.error); }
    showAuthHint('Logging in...', 'info');
    const cred = await signInWithEmailAndPassword(auth, resolved.email, password);
    currentUser = cred.user;
    currentProfile = Object.assign({
      uid:cred.user.uid,
      email:cred.user.email || resolved.email,
      username:resolved.username || cred.user.displayName || cred.user.email,
      role:'account',
      characters:[]
    }, getLocalProfile(cred.user.uid) || {});
    showAuthHint('Logged in.', 'success');
    notice('Logged in.');
    openAccountHome(currentProfile, cred.user);
    updatePendingAccountSetupNotice();
    ensureProfile(cred.user, { username:resolved.username, role:'account' })
      .then(profile => {
        currentProfile = profile;
        window.AsteriaAuthBridge?.setSession?.(currentProfile, cred.user);
        return loadCharacters(cred.user);
      })
      .catch(err => console.warn('Post-login profile sync skipped.', err));
  }catch(err){
    const msg = friendlyFirebaseError(err, 'login');
    showAuthHint(msg, 'error');
    notice(msg);
    console.error('Asteria login failed:', err);
  }
};

window.firebaseLoginFromPage = function(){
  return window.firebaseLogin({
    username:$('loginPageUser')?.value || $('loginUsername')?.value || '',
    password:$('loginPagePass')?.value || $('loginPassword')?.value || ''
  });
};

window.firebaseResetPassword = async function(inputValue = ''){
  if(!auth) return notice('Firebase is not ready. Check internet connection or Firebase config.');
  const username = String(inputValue || $('forgotPasswordEmail')?.value || $('loginUsername')?.value || $('loginPageUser')?.value || '').trim();
  if(!username){
    const msg = 'Enter your email address first, then press Reset password.';
    showAuthHint(msg, 'warn'); return notice(msg);
  }
  try{
    const resolved = await resolveLoginToEmail(username);
    if(resolved.error){ showAuthHint(resolved.error, 'error'); return notice(resolved.error); }
    await sendPasswordResetEmail(auth, resolved.email);
    const msg = 'Password reset email sent. Check your inbox.';
    showAuthHint(msg, 'success'); notice(msg);
  }catch(err){
    const msg = friendlyFirebaseError(err, 'reset');
    showAuthHint(msg, 'error'); notice(msg);
  }
};

window.firebaseLogout = async function(){
  try{ if(auth) await signOut(auth); }catch(e){ console.warn(e); }
  currentUser = null; ownershipReadyUid = ''; currentProfile = null;
  window.AsteriaAuthBridge?.logoutLocal();
  notice('Logged out.');
};

function liveSessionState(value={}){
  const expiresAt=timestampMs(value.expiresAt);
  const expired=['active','paused'].includes(value.status) && Boolean(expiresAt) && Date.now() >= expiresAt;
  return Object.assign({},value,{ status:expired ? 'expired' : (value.status || 'idle'), expired, editable:value.status === 'active' && !expired });
}
function requireLiveSession(transaction,campaignId){
  const liveRef=doc(db,'campaigns',campaignId,'liveSession','current');
  return transaction.get(liveRef).then(snapshot=>{
    const session=liveSessionState(snapshot.exists() ? snapshot.data() : {});
    if(!session.editable) throw new Error(session.expired ? 'This session reached its 10-hour limit.' : 'The GM must start the session before this dashboard can be edited.');
    return session;
  });
}
async function requireCampaignGM(transaction,campaignId){
  const campaignRef=doc(db,'campaigns',campaignId);
  const snapshot=await transaction.get(campaignRef);
  if(!snapshot.exists()) throw new Error('Campaign not found.');
  const campaign=snapshot.data();
  const uid=currentUser?.uid || '';
  const allowed=campaign.ownerUid===uid || campaign.roles?.[uid]==='gm' || (campaign.gmUids||[]).includes(uid);
  if(!allowed) throw new Error('Only a GM for this campaign can make this change.');
  return campaign;
}
function liveCharacterRefs(campaignId,characterId){
  return {
    campaign:doc(db,'campaigns',campaignId,'characters',characterId),
    private:doc(db,'users',currentUser.uid,'characters',characterId)
  };
}
function ownedCharacterSourceId(characterId,character={}){
  return String(character.sourceCharacterId || character.id || characterId || '');
}
async function verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs={}){
  if(!currentUser || character.ownerUid!==currentUser.uid) throw new Error('This character is not owned by your account.');
  const privateRef=doc(db,'users',currentUser.uid,'characters',ownedCharacterSourceId(characterId,character));
  refs.private=privateRef;
  refs.verifiedOwner=true;
  return {privateRef,privateSnapshot:null};
}
async function verifyOwnedLiveCharacterRead(campaignId,characterId,character){
  if(!currentUser || character.ownerUid!==currentUser.uid) return {ok:false,error:'This character is not owned by your account.'};
  const privateRef=doc(db,'users',currentUser.uid,'characters',ownedCharacterSourceId(characterId,character));
  return {ok:true,privateRef,privateSnapshot:await getDoc(privateRef)};
}
function writeLiveCharacter(transaction,refs,character){
  const patch={};
  ['gallery','image','portrait','characterImage','dashboardPreferences','journal'].forEach(key=>{
    if(Object.hasOwn(character,key)) patch[key]=structuredCloneSafe(character[key]);
  });
  transaction.set(refs.campaign,{...patch,updatedAt:serverTimestamp()},{merge:true});
  transaction.set(refs.private,{...patch,updatedAt:serverTimestamp()},{merge:true});
}

function appendActivity(character,entry){
  const rows=Array.isArray(character.actionLog) ? character.actionLog : [];
  character.actionLog=[Object.assign({id:`action-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,at:new Date().toISOString()},entry),...rows].slice(0,100);
}

async function cropProfileAvatar(file){
  const image=await createImageBitmap(file);
  try{
    const canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=512;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Image editing is not available on this browser.');
    const size=Math.min(image.width,image.height);
    if(size<1)throw new Error('Invalid image dimensions.');
    ctx.drawImage(image,(image.width-size)/2,(image.height-size)/2,size,size,0,0,512,512);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));
    if(!blob||blob.size>2*1024*1024)throw new Error('Profile image could not be prepared.');
    return blob;
  } finally{image.close?.();}
}
const firebasePublicApi = {
  isReady:()=>Boolean(db && currentUser && ownershipReadyUid === currentUser.uid),
  getUser:()=>currentUser,
  getProfile:()=>currentProfile,
  // The My Profile view may display only a fresh server-read projection.
  // Never fall back to an offline cache or automatically allocate an ID.
  // Authenticated self-service password reset. Never accept an arbitrary
  // email from the menu or expose a user-selected password to browser code.
  // Verification is always bound to the *current* Firebase Auth account.
  // Built-in Firebase email templates provide the action link; no extra
  // provider, email address input, or client-side verification claim.
  sendAccountVerificationEmail: async function(){
    const user=currentUser,uid=user?.uid;
    if(!auth||!uid||auth.currentUser?.uid!==uid||!canSendVerificationEmail(user))
      throw new Error('Sign in to an unverified account to request its verification email.');
    await sendEmailVerification(user);
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid)
      throw new Error('Account changed during the verification request.');
    return {sent:true};
  },
  refreshAccountEmailVerification: async function(){
    const user=currentUser,uid=user?.uid;
    if(!auth||!uid||auth.currentUser?.uid!==uid)
      throw new Error('Sign in to check email verification.');
    await reload(user);
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid)
      throw new Error('Account changed while checking verification.');
    return {verified:user.emailVerified===true};
  },
  // User-initiated Account ID completion only. The client-side flag is not
  // authorisation: the deployed callable rechecks verified Firebase Auth email,
  // the private canary digest and immutable creation-time cutoff.
  completeNewAccountId: async function(){
    const user=currentUser,uid=user?.uid;
    if(!auth||!db||!functionsClient||!uid||auth.currentUser?.uid!==uid||
       !accountIdCompletionEnabled(window.AsteriaFeatureFlags))
      throw new Error('Account ID completion is not available.');
    await reload(user);
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid)
      throw new Error('Account changed during verification.');
    if(!canCompleteNewAccountId(user,window.AsteriaFeatureFlags))
      throw new Error('Verify your email promptly after registering. Older accounts require review.');
    const snapshot=await getDocFromServer(doc(db,'users',uid));
    const profile=snapshot.exists()?snapshot.data():null;
    if(!profile||profile.uid!==uid||typeof profile.username!=='string'||
       profile.email?.trim().toLowerCase()!==user.email?.trim().toLowerCase())
      throw new Error('Account profile needs review before ID assignment.');
    const identity=await finalizeRegisteredAccountId({
      enabled:true,uid,username:profile.username,
      requestAssignment:input=>httpsCallable(functionsClient,'asteriaAccountIdentity')(input),
      readProfile:async()=>{
        const fresh=await getDocFromServer(doc(db,'users',uid));
        return fresh.exists()?fresh.data():null;
      }
    });
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid)
      throw new Error('Account changed before ID confirmation.');
    currentProfile={...currentProfile,...profile,...identity};
    saveLocalProfile(uid,currentProfile);
    window.AsteriaAuthBridge?.setSession?.(currentProfile,user);
    window.dispatchEvent(new CustomEvent('asteria:account-id-assigned',{detail:{uid}}));
    return {accountId:identity.accountId,assigned:true};
  },
  sendAccountPasswordReset: async function(){
    const user=currentUser;
    if(!auth || !user?.uid || auth.currentUser?.uid!==user.uid || !user.email)
      throw new Error('Sign in to request password recovery.');
    await sendPasswordResetEmail(auth,user.email);
    if(currentUser?.uid!==user.uid)
      throw new Error('Account changed during the reset request.');
    return {ok:true};
  },
  readAccountProfileForDisplay: async function(){
    if(!db||!currentUser?.uid)throw new Error('Sign in before viewing your profile.');
    const user=currentUser,uid=user.uid;
    const snapshot=await getDocFromServer(doc(db,'users',uid));
    if(currentUser?.uid!==uid || auth?.currentUser?.uid!==uid)
      throw new Error('The authenticated account changed during profile verification.');
    return {uid,authEmail:user.email||'',profile:snapshot.exists()?snapshot.data():null};
  },
  saveEditableAccountProfile: async function(input){
    if(!db||!auth||!currentUser?.uid||currentUser.uid!==auth.currentUser?.uid)
      throw new Error('Sign in before editing your profile.');
    const clean=validatedEditableProfile(input);
    const uid=currentUser.uid,user=currentUser,reference=doc(db,'users',uid);
    await runTransaction(db,async tx=>{
      const snap=await tx.get(reference);
      if(!snap.exists()||snap.data().uid!==uid)
        throw new Error('Your account profile needs verification.');
      if(auth.currentUser?.uid!==uid||currentUser?.uid!==uid)
        throw new Error('The signed-in account changed.');
      tx.update(reference,{...clean,updatedAt:serverTimestamp()});
    });
    if(auth.currentUser?.uid!==uid||currentUser?.uid!==uid)
      throw new Error('The account changed after saving.');
    const verified=await getDocFromServer(reference);
    if(!verified.exists()||verified.data().uid!==uid)
      throw new Error('Saved profile could not be verified.');
    currentProfile={...currentProfile,...verified.data()};
    saveLocalProfile(uid,currentProfile);
    window.AsteriaAuthBridge?.setSession?.(currentProfile,user);
    window.dispatchEvent(new CustomEvent('asteria:account-profile-updated',{detail:{uid}}));
    return {ok:true};
  },
  canRenameAccountUsername: async function(){
    if(!functionsClient||!currentUser?.uid||auth?.currentUser?.uid!==currentUser.uid)
      return false;
    const uid=currentUser.uid;
    try{
      const result=await httpsCallable(functionsClient,'asteriaAccountUsername')({action:'status'});
      return currentUser?.uid===uid&&auth?.currentUser?.uid===uid&&result.data?.available===true;
    }catch{return false;}
  },
  renameAccountUsername: async function(rawUsername){
    if(!db||!functionsClient||!auth||!currentUser?.uid||
       auth.currentUser?.uid!==currentUser.uid)
      throw new Error('Sign in before changing your username.');
    const username=String(rawUsername||'').trim();
    if(!/^[A-Za-z0-9._-]{3,24}$/.test(username))
      throw new Error('Username must contain 3–24 letters, numbers, dots, underscores or hyphens.');
    const uid=currentUser.uid,server=await getDocFromServer(doc(db,'users',uid));
    if(!server.exists()||server.data().uid!==uid||
       !server.data().accountId||auth.currentUser?.uid!==uid)
      throw new Error('Your Account ID needs verification before changing your username.');
    const previous=server.data(),expectedAccountId=previous.accountId;
    if(!/^[0-9]{5}$/.test(previous.accountNumber||'')||
       previous.accountId!==previous.username+'#'+previous.accountNumber||
       previous.accountIdKey!==previous.username.toLowerCase()+'#'+previous.accountNumber)
      throw new Error('Account identity needs verification before changing your username.');
    if(username===previous.username)
      return {ok:true,unchanged:true,username,accountId:expectedAccountId};
    const response=await httpsCallable(functionsClient,'asteriaAccountUsername')({
      username,expectedAccountId
    });
    if(auth.currentUser?.uid!==uid||currentUser?.uid!==uid)
      throw new Error('The signed-in account changed during the username update.');
    const fresh=await getDocFromServer(doc(db,'users',uid));
    if(!fresh.exists()||fresh.data().uid!==uid||
       fresh.data().username!==username||
       fresh.data().accountNumber!==previous.accountNumber||
       fresh.data().accountId!==response.data?.accountId)
      throw new Error('Username updated on server but confirmation failed. Refresh Profile before trying again.');
    currentProfile={...currentProfile,...fresh.data()};
    saveLocalProfile(uid,currentProfile);
    window.AsteriaAuthBridge?.setSession?.(currentProfile,currentUser);
    window.dispatchEvent(new CustomEvent('asteria:account-profile-updated',{detail:{uid}}));
    return response.data;
  },
  readOwnAccountAvatar: async function(){
    const uid=currentUser?.uid;
    if(!storage||!db||!uid||auth?.currentUser?.uid!==uid)return null;
    const snap=await getDocFromServer(doc(db,'users',uid));
    if(currentUser?.uid!==uid||auth?.currentUser?.uid!==uid||
       !snap.exists()||snap.data().uid!==uid||!snap.data().avatarUpdatedAt)return null;
    try {
      const url=await getDownloadURL(storageRef(storage,accountAvatarPath(uid)));
      return currentUser?.uid===uid&&auth?.currentUser?.uid===uid?url:null;
    } catch{return null;}
  },
  saveOwnAccountAvatar: async function(file){
    if(!storage||!db||!currentUser?.uid||auth?.currentUser?.uid!==currentUser.uid)
      throw new Error('Sign in before changing your profile image.');
    const issue=avatarUploadError(file);
    if(issue)throw new Error(issue);
    const uid=currentUser.uid;
    const path=accountAvatarPath(uid);
    const blob=await cropProfileAvatar(file);
    if(currentUser?.uid!==uid||auth?.currentUser?.uid!==uid)
      throw new Error('The account changed during image preparation.');
    await uploadBytes(storageRef(storage,path),blob,{contentType:'image/webp',cacheControl:'private,max-age=300'});
    if(currentUser?.uid!==uid||auth?.currentUser?.uid!==uid)
      throw new Error('The account changed during the upload.');
    await runTransaction(db,async tx=>{
      const reference=doc(db,'users',uid),snap=await tx.get(reference);
      if(!snap.exists()||snap.data().uid!==uid)
        throw new Error('Account profile not verified.');
      tx.update(reference,{avatarUpdatedAt:serverTimestamp(),updatedAt:serverTimestamp()});
    });
    if(currentUser?.uid!==uid||auth?.currentUser?.uid!==uid)
      throw new Error('The account changed after the upload.');
    window.dispatchEvent(new CustomEvent('asteria:account-profile-updated',{detail:{uid}}));
    return {ok:true};
  },
  removeOwnAccountAvatar: async function(){
    if(!storage||!db||!currentUser?.uid||auth?.currentUser?.uid!==currentUser.uid)
      throw new Error('Sign in before removing your profile image.');
    const uid=currentUser.uid,reference=doc(db,'users',uid);
    await runTransaction(db,async tx=>{
      const snap=await tx.get(reference);
      if(!snap.exists()||snap.data().uid!==uid)
        throw new Error('Account profile not verified.');
      tx.update(reference,{avatarUpdatedAt:null,updatedAt:serverTimestamp()});
    });
    try{await deleteObject(storageRef(storage,accountAvatarPath(uid)));}catch(e){
      if(e?.code!=='storage/object-not-found')throw e;
    }
    if(currentUser?.uid===uid&&auth?.currentUser?.uid===uid)
      window.dispatchEvent(new CustomEvent('asteria:account-profile-updated',{detail:{uid}}));
    return {ok:true};
  },
  subscribeAppearancePreferences: function(onChange){
    if(!db || !currentUser || typeof onChange!=='function')return ()=>{};
    const uid=currentUser.uid;
    return onSnapshot(doc(db,'users',uid,'settings','appearance'),
      snapshot=>{
        if(currentUser?.uid!==uid)return;
        onChange(snapshot.exists()?snapshot.data():null);
      },
      error=>reportSyncError('appearance-listener',error));
  },
  saveAppearancePreference: async function(section,value,expectedRevision,overwrite=false){
    if(!db||!currentUser)return {ok:false,error:'Sign in before syncing appearance.'};
    if(!['theme','typography'].includes(section))return {ok:false,error:'Unknown appearance section.'};
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)return {ok:false,error:'Load cloud settings before saving.'};
    const uid=currentUser.uid;
    // Theme/typography contain cosmetic primitives only; never accept
    // character sheets, credentials, campaign state, or arbitrary fields.
    let clean;
    if(section==='typography'){
      clean={heading:String(value?.heading||'').slice(0,60),reading:String(value?.reading||'').slice(0,60),
        size:Math.max(90,Math.min(115,Number(value?.size)||100))};
    }else{
      const validColour=x=>/^#[0-9a-f]{6}$/i.test(String(x||''));
      const areaNames=['panelBorder','panelBackground','menuButton','topMenuButton','dashboardPrimary','dashboardTab','divider'];
      const areas=Object.fromEntries(areaNames.map(key=>[key,validColour(value?.areas?.[key])?value.areas[key]:'#1f7dff']));
      const number=(n,otherwise)=>Number.isFinite(Number(n))?Math.max(0,Math.min(1,Number(n))):otherwise;
      clean={background:['dark','light','gray','darkBlue','darkGreen'].includes(value?.background)?value.background:'dark',
        theme:String(value?.theme||'spellblade').slice(0,40),accent:validColour(value?.accent)?value.accent:'#1f7dff',
        text:validColour(value?.text)?value.text:'#f7ead1',areas,
        glow:number(value?.glow,.36),overlay:number(value?.overlay,.44),
        panel:Math.max(.62,Math.min(.92,number(value?.panel,.78))),
        motion:['both','pulse','wave','off'].includes(value?.motion)?value.motion:'both'};
    }
    try{
      const reference=doc(db,'users',uid,'settings','appearance');
      const result=await runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(reference);
        const data=snapshot.exists()?snapshot.data():{};
        const previous=data?.[section]||{};
        const revision=Number(previous.revision||0);
        if(!overwrite && revision!==expectedRevision)return {ok:false,conflict:true,revision,value:previous.value||null};
        const next=revision+1;
        transaction.set(reference,{[section]:{value:clean,revision:next,updatedAt:serverTimestamp()}},{merge:true});
        return {ok:true,revision:next};
      });
      if(currentUser?.uid!==uid)return {ok:false,error:'Account changed during save.'};
      return result;
    }catch(error){
      reportSyncError('appearance-save',error);
      return {ok:false,error:error?.message||String(error)};
    }
  },
  subscribeLiveSession: function(campaignId, onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(
      doc(db, 'campaigns', campaignId, 'liveSession', 'current'),
      snapshot=>onChange(liveSessionState(snapshot.exists() ? Object.assign({ id:'' }, snapshot.data()) : { id:'', status:'idle' })),
      error=>reportSyncError('live-session-listener', error, { campaignId })
    );
  },
  startLiveSession: async function(campaignId){
    if(!db || !currentUser || !campaignId) throw new Error('A signed-in campaign GM is required.');
    const liveRef=doc(db, 'campaigns', campaignId, 'liveSession', 'current');
    const result=await runTransaction(db, async transaction=>{
      const liveSnapshot=await transaction.get(liveRef);
      const current=liveSnapshot.exists() ? liveSnapshot.data() : {};
      const liveCurrent=liveSessionState(current);
      if(liveCurrent.editable) return current;
      const resume=current.status === 'paused' && current.id && !liveCurrent.expired;
      const sessionId=resume ? current.id : `session-${Date.now()}-${currentUser.uid.slice(0,6)}`;
      const now=Date.now();
      const originalExpiry=timestampMs(current.expiresAt);
      const expiresAt=resume && originalExpiry > now ? current.expiresAt : Timestamp.fromMillis(now + SESSION_LIMIT_MS);
      const sessionRef=doc(db, 'campaigns', campaignId, 'sessions', sessionId);
      const eventRef=doc(collection(db, 'campaigns', campaignId, 'events'));
      const next=Object.assign({}, current, {
        id:sessionId,
        campaignId,
        status:'active',
        startedBy:current.startedBy || currentUser.uid,
        startedAt:current.startedAt || serverTimestamp(),
        resumedAt:resume ? serverTimestamp() : null,
        expiresAt,
        maxDurationHours:10,
        updatedAt:serverTimestamp(),
        endedAt:null
      });
      transaction.set(liveRef, next, { merge:true });
      transaction.set(sessionRef, next, { merge:true });
      transaction.set(eventRef, {
        id:eventRef.id,
        campaignId,
        sessionId,
        targetCharacterId:'',
        targetOwnerUid:'',
        type:resume ? 'session-started' : 'session-started',
        payload:{ resumed:Boolean(resume) },
        status:'delivered',
        deliveryStatus:'delivered',
        acknowledged:false,
        createdBy:currentUser.uid,
        createdAt:serverTimestamp(),
        resolvedAt:serverTimestamp()
      });
      return Object.assign({}, next, { startedAt:current.startedAt || new Date().toISOString(), expiresAt });
    });
    return { ok:true, session:result };
  },
  pauseLiveSession: async function(campaignId){
    if(!db || !currentUser || !campaignId) throw new Error('A signed-in campaign GM is required.');
    const liveRef=doc(db, 'campaigns', campaignId, 'liveSession', 'current');
    const result=await runTransaction(db, async transaction=>{
      const snapshot=await transaction.get(liveRef);
      if(!snapshot.exists() || snapshot.data().status !== 'active') throw new Error('Only an active session can be paused.');
      const current=snapshot.data();
      const sessionRef=doc(db, 'campaigns', campaignId, 'sessions', current.id);
      const eventRef=doc(collection(db, 'campaigns', campaignId, 'events'));
      const patch={ status:'paused', pausedAt:serverTimestamp(), updatedAt:serverTimestamp() };
      transaction.set(liveRef, patch, { merge:true });
      transaction.set(sessionRef, patch, { merge:true });
      transaction.set(eventRef, {
        id:eventRef.id, campaignId, sessionId:current.id, targetCharacterId:'', targetOwnerUid:'',
        type:'session-paused', payload:{}, status:'delivered', deliveryStatus:'delivered', acknowledged:false,
        createdBy:currentUser.uid, createdAt:serverTimestamp(), resolvedAt:serverTimestamp()
      });
      return Object.assign({}, current, patch);
    });
    return { ok:true, session:result };
  },
  endLiveSession: async function(campaignId, reason='gm-ended'){
    if(!db || !currentUser || !campaignId) throw new Error('A signed-in campaign GM is required.');
    const liveRef=doc(db, 'campaigns', campaignId, 'liveSession', 'current');
    const result=await runTransaction(db, async transaction=>{
      const snapshot=await transaction.get(liveRef);
      if(!snapshot.exists() || !['active','paused','expired'].includes(liveSessionState(snapshot.data()).status)) throw new Error('Start a session before ending it.');
      const current=snapshot.data();
      const sessionRef=doc(db, 'campaigns', campaignId, 'sessions', current.id);
      const eventRef=doc(collection(db, 'campaigns', campaignId, 'events'));
      const patch={ status:'ended', endReason:reason, endedAt:serverTimestamp(), updatedAt:serverTimestamp() };
      transaction.set(liveRef, patch, { merge:true });
      transaction.set(sessionRef, patch, { merge:true });
      transaction.set(eventRef, {
        id:eventRef.id, campaignId, sessionId:current.id, targetCharacterId:'', targetOwnerUid:'',
        type:'session-ended', payload:{ reason }, status:'delivered', deliveryStatus:'delivered', acknowledged:false,
        createdBy:currentUser.uid, createdAt:serverTimestamp(), resolvedAt:serverTimestamp()
      });
      return Object.assign({}, current, patch);
    });
    return { ok:true, session:result };
  },
  expireLiveSession: async function(campaignId){
    if(!db || !currentUser || !campaignId) return {ok:false};
    const liveRef=doc(db,'campaigns',campaignId,'liveSession','current');
    const snapshot=await getDoc(liveRef);
    if(!snapshot.exists() || !liveSessionState(snapshot.data()).expired) return {ok:true,applied:false};
    return this.endLiveSession(campaignId,'time-limit');
  },
  setSessionPresence: async function(campaignId, sessionId, presence={}){
    if(!db || !currentUser || !campaignId || !sessionId) return false;
    await setDoc(doc(db, 'campaigns', campaignId, 'sessions', sessionId, 'presence', currentUser.uid), Object.assign({}, cleanData(presence), {
      uid:currentUser.uid,
      displayName:currentProfile?.username || currentUser.displayName || currentUser.email || 'Asteria User',
      updatedAt:serverTimestamp()
    }), { merge:true });
    return true;
  },
  subscribeSessionPresence: function(campaignId, sessionId, onChange){
    if(!db || !currentUser || !campaignId || !sessionId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(collection(db, 'campaigns', campaignId, 'sessions', sessionId, 'presence'), snapshot=>{
      const records={};
      snapshot.forEach(item=>{ records[item.id]=Object.assign({ uid:item.id }, item.data()); });
      onChange(records);
    }, error=>reportSyncError('session-presence-listener', error, { campaignId, sessionId }));
  },
  subscribeBattleMaps: function(campaignId,onChange,{gm=false}={}){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const ref=collection(db,'campaigns',campaignId,'battleMaps');
    const q=gm?query(ref,limit(BATTLE_MAP_MAX_RECORDS)):
      query(ref,where('visibility','==','players'),limit(BATTLE_MAP_MAX_RECORDS));
    return onSnapshot(q,snapshot=>{
      onChange(snapshot.docs.map(entry=>({id:entry.id,...entry.data()}))
        .sort((a,b)=>String(a.name).localeCompare(String(b.name))));
    },error=>{
      onChange([]);reportSyncError('battle-map-listener',error,{campaignId});
    });
  },
  subscribeBattleMapPrivatePins: function(campaignId,mapId,onChange){
    if(!db||!currentUser||!campaignId||!mapId||typeof onChange!=='function')return ()=>{};
    const reference=doc(db,'campaigns',campaignId,'battleMaps',mapId,'gmNotes','private');
    return onSnapshot(reference,snapshot=>{
      onChange(snapshot.exists()?snapshot.data().pins||[]:[]);
    },error=>{onChange([]);reportSyncError('battle-map-private-pins',error,{campaignId,mapId});});
  },
  saveBattleMapPrivatePins: async function(campaignId,mapId,pins){
    if(!db||!currentUser||!campaignId||!mapId)return {ok:false,error:'Sign in to edit private map notes.'};
    try{
      const safePins=battleMapPrivatePins(pins);
      await runTransaction(db,async transaction=>{
        const campaign=await transaction.get(doc(db,'campaigns',campaignId));
        if(!campaign.exists()||!currentUserIsCampaignGM(campaign.data()))
          throw Error('Only a campaign GM can edit private map notes.');
        const map=await transaction.get(doc(db,'campaigns',campaignId,'battleMaps',mapId));
        if(!map.exists())throw Error('The map no longer exists.');
        transaction.set(doc(db,'campaigns',campaignId,'battleMaps',mapId,'gmNotes','private'),{
          pins:safePins,updatedBy:currentUser.uid,updatedAt:serverTimestamp()
        });
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error?.message||'Unable to save private map notes.'};}
  },
  fetchBattleMapMedia: async function(campaignId,map){
    if(!storage||!currentUser||!map||!campaignId)return {ok:false,error:'Sign in to view this map.'};
    let path;
    try{
      path=battleMapAssetPath(campaignId,map.id,map.contentType);
      if(map.storagePath!==path||map.kind!==battleMapFileKind(map.contentType))
        throw Error('Invalid map media reference.');
      // Authenticated Storage read: no reusable public download token is generated.
      const blob=await getBlob(storageRef(storage,path));
      return {ok:true,blob};
    }catch(error){return {ok:false,error:error?.message||'Map media is unavailable.'};}
  },
  uploadBattleMap: async function(campaignId,file,settings={},dimensions={}){
    if(!db||!storage||!currentUser||!campaignId)return {ok:false,error:'Sign in to upload battle maps.'};
    const error=battleMapFileError(file);if(error)return {ok:false,error};
    let details,size;
    try{details=battleMapEditableSettings(settings);size=battleMapDimensions(dimensions.width,dimensions.height);}
    catch(error){return {ok:false,error:error.message};}
    const campaignRef=doc(db,'campaigns',campaignId);
    try{
      const snapshot=await getDoc(campaignRef);
      if(!snapshot.exists()||!currentUserIsCampaignGM(snapshot.data()))
        throw Error('Only an active campaign GM may upload battle maps.');
      const existing=await getDocs(query(collection(db,'campaigns',campaignId,'battleMaps'),limit(BATTLE_MAP_MAX_RECORDS)));
      if(existing.size>=BATTLE_MAP_MAX_RECORDS)throw Error('Campaign battle-map limit of 40 reached.');
    }catch(error){return {ok:false,error:error?.message||'Campaign access denied.'};}
    const mapId=crypto.randomUUID(),path=battleMapAssetPath(campaignId,mapId,file.type);
    const reference=storageRef(storage,path);
    let uploaded=false;
    try{
      await uploadBytes(reference,file,{contentType:String(file.type).toLowerCase(),cacheControl:'private,max-age=0,no-store'});
      uploaded=true;
      const result={id:mapId,campaignId,...details,...size,
        kind:battleMapFileKind(file.type),contentType:String(file.type).toLowerCase(),
        storagePath:path,createdBy:currentUser.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
      await setDoc(doc(db,'campaigns',campaignId,'battleMaps',mapId),result);
      return {ok:true,map:{...result,createdAt:new Date(),updatedAt:new Date()}};
    }catch(error){
      if(uploaded)await deleteObject(reference).catch(()=>{});
      return {ok:false,error:error?.message||'Battle-map upload failed.'};
    }
  },
  updateBattleMap: async function(campaignId,mapId,settings={}){
    if(!db||!currentUser||!campaignId||!mapId)return {ok:false,error:'Sign in to edit maps.'};
    try{
      const details=battleMapEditableSettings(settings);
      await runTransaction(db,async tx=>{
        const campaign=await tx.get(doc(db,'campaigns',campaignId));
        if(!campaign.exists()||!currentUserIsCampaignGM(campaign.data()))
          throw Error('Only the campaign GM can edit battle maps.');
        const ref=doc(db,'campaigns',campaignId,'battleMaps',mapId),snap=await tx.get(ref);
        if(!snap.exists())throw Error('This battle map no longer exists.');
        tx.update(ref,{...details,updatedAt:serverTimestamp()});
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error?.message||'Unable to update battle map.'};}
  },
  removeBattleMap: async function(campaignId,mapId){
    if(!db||!storage||!currentUser||!campaignId||!mapId)return {ok:false,error:'Sign in to delete maps.'};
    let storagePath='';
    try{
      await runTransaction(db,async tx=>{
        const campaign=await tx.get(doc(db,'campaigns',campaignId));
        if(!campaign.exists()||!currentUserIsCampaignGM(campaign.data()))
          throw Error('Only the campaign GM can delete battle maps.');
        const ref=doc(db,'campaigns',campaignId,'battleMaps',mapId),snap=await tx.get(ref);
        if(!snap.exists())throw Error('Battle map already removed.');
        const entry=snap.data();
        storagePath=battleMapAssetPath(campaignId,mapId,entry.contentType);
        if(entry.storagePath!==storagePath)throw Error('Invalid map storage reference.');
        tx.delete(ref);
        tx.delete(doc(db,'campaigns',campaignId,'battleMaps',mapId,'gmNotes','private'));
      });
      // Firestore is the visibility authority; deletion immediately revokes reads.
      // Storage cleanup is best-effort; the object is inaccessible after document deletion.
      await deleteObject(storageRef(storage,storagePath)).catch(()=>{});
      return {ok:true};
    }catch(error){return {ok:false,error:error?.message||'Unable to delete map.'};}
  },
  advancedDiceAction: async data=>{
    if(!functionsClient||!currentUser)return {ok:false,error:'Sign in to roll dice.'};
    try{return (await httpsCallable(functionsClient,'asteriaAdvancedDice')(data)).data;}
    catch(error){return {ok:false,error:error?.message||'Dice action failed.'};}
  },
  subscribeDiceWorkspace: function(onChange){
    if(!db||!currentUser||typeof onChange!=='function')return ()=>{};
    const uid=currentUser.uid;
    return onSnapshot(doc(db,'users',uid,'diceWorkspace','current'),snapshot=>{
      if(currentUser?.uid===uid)onChange(snapshot.exists()?snapshot.data():{version:1,presets:[],history:[]});
    },error=>reportSyncError('dice-workspace-listener',error,{uid}));
  },
  universalCheckAction: async data=>{
    if(!functionsClient||!currentUser)return {ok:false,error:'Sign in to continue.'};
    try{return (await httpsCallable(functionsClient,'asteriaUniversalCheck')(data)).data;}
    catch(error){return {ok:false,error:error.message||'Check action failed.'};}
  },
  subscribeUniversalChecks: function(campaignId,onChange,{gm=false}={}){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const ref=collection(db,'campaigns',campaignId,'checkRequests');
    const q=gm?query(ref,orderBy('createdAt','desc'),limit(100)):
      query(ref,where('ownerUid','==',currentUser.uid),limit(100));
    return onSnapshot(q,snapshot=>onChange(snapshot.docs.map(doc=>({id:doc.id,...doc.data()}))),
      error=>reportSyncError('universal-check-listener',error,{campaignId}));
  },
  subscribeCampaignEvents: function(campaignId, onChange, options={}){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    const eventsRef=collection(db,'campaigns',campaignId,'events');
    const ownerFilters=options.mode==='character'?[where('targetOwnerUid','==',options.targetOwnerUid||currentUser.uid)]:[];
    const latest=query(eventsRef,...ownerFilters,orderBy('createdAt','desc'),limit(200));
    const groups=new Map();
    const watch=(key,source)=>onSnapshot(source,snapshot=>{
      groups.set(key,snapshot.docs.map(item=>({id:item.id,...item.data()})));
      const merged=new Map([...groups.values()].flat().filter(event=>!options.characterId||!event.targetCharacterId||event.targetCharacterId===options.characterId).map(event=>[event.id,event]));
      onChange([...merged.values()]);
    },error=>reportSyncError('campaign-events-listener',error,{campaignId,mode:options.mode||'gm'}));
    const unsubscribers=[watch('latest',latest)];
    // Outstanding deliveries stay visible even when older than the recent history.
    if(options.mode==='character') unsubscribers.push(watch('pending',query(eventsRef,...ownerFilters,where('acknowledged','==',false))));
    return ()=>unsubscribers.forEach(unsubscribe=>unsubscribe());
  },
  fetchCampaignEventHistory: async function(campaignId,characterId,beforeId){
    if(!db || !currentUser || !campaignId)return {events:[],more:false};
    const constraints=[where('targetOwnerUid','==',currentUser.uid),orderBy('createdAt','desc')];
    if(beforeId){
      const before=await getDoc(doc(db,'campaigns',campaignId,'events',beforeId));
      if(!before.exists())return {events:[],more:false};
      constraints.push(startAfter(before));
    }
    const snapshot=await getDocs(query(collection(db,'campaigns',campaignId,'events'),...constraints,limit(200)));
    return {events:snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.targetCharacterId===characterId),cursor:snapshot.docs.at(-1)?.id || '',more:snapshot.size===200};
  },
  subscribeCampaignEncounter: function(campaignId, onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(
      doc(db, 'campaigns', campaignId, 'systems', 'encounter'),
      snapshot=>onChange(snapshot.exists() ? Object.assign({ status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] }, snapshot.data()) : { status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] }),
      error=>reportSyncError('campaign-encounter-listener', error, { campaignId })
    );
  },
  subscribeGMWorkspace: function(campaignId,onChange){
    if(!db || !currentUser || !campaignId || typeof onChange!=='function') return ()=>{};
    return onSnapshot(
      doc(db,'campaigns',campaignId,'systems','gmWorkspace'),
      snapshot=>onChange(snapshot.exists() ? snapshot.data() : null),
      error=>reportSyncError('gm-workspace-listener',error,{campaignId})
    );
  },
  saveGMWorkspace: async function(campaignId,patch={}){
    if(!db || !currentUser || !campaignId) return {ok:false};
    try{
      const campaignRef=doc(db,'campaigns',campaignId);
      const workspaceRef=doc(db,'campaigns',campaignId,'systems','gmWorkspace');
      await runTransaction(db,async transaction=>{
        const campaignSnapshot=await transaction.get(campaignRef);
        if(!campaignSnapshot.exists() || !currentUserIsCampaignGM(campaignSnapshot.data())) throw new Error('Only a campaign GM can update GM systems.');
        transaction.set(workspaceRef,Object.assign({},cleanData(patch),{
          version:'asteria-react-gm-workspace-v1',
          updatedBy:currentUser.uid,
          updatedAt:serverTimestamp()
        }),{merge:true});
      });
      return {ok:true};
    }catch(error){
      reportSyncError('gm-workspace-write',error,{campaignId});
      return {ok:false,error:error.message||String(error)};
    }
  },
  saveCampaignInformation: async function(campaignId,kind,input={}){
    if(!db || !currentUser || !campaignId)return {ok:false,error:'Sign in first.'};
    try {
      await runTransaction(db,async transaction=>{
        const campaign=await requireCampaignGM(transaction,campaignId);
        const gmRef=doc(db,'campaigns',campaignId,'systems','gmWorkspace'),partyRef=doc(db,'campaigns',campaignId,'systems','party-workspace');
        const [gmSnapshot,partySnapshot]=await Promise.all([transaction.get(gmRef),transaction.get(partyRef)]);
        const entry=normalizeInformation(input,kind,campaign);
        if(!/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id))throw new Error('Invalid information entry.');
        const world=gmSnapshot.exists()?gmSnapshot.data().world || {}:{};
        const records=Array.isArray(world[kind])?world[kind]:[],existing=records.find(row=>row.id===entry.id);
        if(existing && Number(existing.revision||0)!==Number(input.revision||0))throw new Error('This entry changed. Reopen it before saving.');
        const saved={...existing,...entry,revision:Number(existing?.revision||0)+1,updatedAt:new Date().toISOString(),updatedBy:currentUser.uid};
        const information={...(partySnapshot.exists()?partySnapshot.data().information:{})};
        const key=`${kind}-${entry.id}`;
        if(entry.published)information[key]=publicInformation(saved);else delete information[key];
        transaction.set(gmRef,{world:{[kind]:[...records.filter(row=>row.id!==entry.id),saved]},updatedAt:serverTimestamp()},{merge:true});
        const patch={information,updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
        if(partySnapshot.exists())transaction.update(partyRef,patch);else transaction.set(partyRef,patch);
      });return {ok:true};
    }catch(error){return {ok:false,error:error.message || String(error)};}
  },
  assignCampaignQuest: async function(campaignId,quest={},characterIds=[]){
    if(!db || !currentUser || !campaignId) return {ok:false};
    const ids=Array.from(new Set((characterIds||[]).map(String).filter(Boolean)));
    if(!ids.length) return {ok:false,error:'Choose at least one character.'};
    if(quest.visibility==='GM Only')return {ok:false,error:'Make the quest visible to players before assigning it.'};
    const questId=String(quest.id||quest.slug||`quest-${Date.now()}-${Math.random().toString(36).slice(2,7)}`);
    try{
      const campaignRef=doc(db,'campaigns',campaignId);
      const characterRefs=ids.map(id=>doc(db,'campaigns',campaignId,'characters',id));
      const eventRefs=ids.map(id=>doc(collection(db,'campaigns',campaignId,'events')));
      await runTransaction(db,async transaction=>{
        const campaignSnapshot=await transaction.get(campaignRef);
        if(!campaignSnapshot.exists() || !currentUserIsCampaignGM(campaignSnapshot.data())) throw new Error('Only a campaign GM can assign quests.');
        const characterSnapshots=[];
        for(const characterRef of characterRefs) characterSnapshots.push(await transaction.get(characterRef));
        characterSnapshots.forEach((snapshot,index)=>{
          if(!snapshot.exists()) throw new Error('An assigned character is no longer available.');
          const character=Object.assign({},snapshot.data());
          const quests=Array.isArray(character.quests||character.questLog) ? (character.quests||character.questLog).slice() : [];
          const nextQuest=normalizeAssignedQuest(quest,{id:questId,assignedAt:new Date().toISOString(),assignedBy:currentUser.uid});
          const existing=quests.findIndex(value=>String(value?.id||value?.slug||'')===questId);
          if(existing>=0) quests[existing]=mergeQuestAssignment(quests[existing],nextQuest);
          else quests.push(mergeQuestAssignment(null,nextQuest));
          transaction.set(characterRefs[index],{quests:cleanData(quests),updatedAt:serverTimestamp()},{merge:true});
          transaction.set(eventRefs[index],{
            id:eventRefs[index].id,campaignId,targetCharacterId:ids[index],targetOwnerUid:character.ownerUid||'',type:'quest-assigned',
            payload:{questId,title:nextQuest.title,objective:nextQuest.objective,reward:cleanData(nextQuest.reward),questGiver:nextQuest.questGiver,deadline:nextQuest.deadline},
            status:'delivered',deliveryStatus:'delivered',acknowledged:false,createdBy:currentUser.uid,createdAt:serverTimestamp(),resolvedAt:null
          },{merge:true});
        });
      });
      return {ok:true,assigned:ids.length};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  uploadCampaignArtwork: async function(campaignId,file) {
    if(!db || !storage || !currentUser || !campaignId) return {ok:false,error:'Sign in to upload campaign artwork.'};
    const error=campaignArtworkFileError(file);
    if(error) return {ok:false,error};
    const campaignRef=doc(db,'campaigns',campaignId);
    try {
      const snapshot=await getDoc(campaignRef);
      if(!snapshot.exists() || !currentUserIsCampaignGM(snapshot.data())) return {ok:false,error:'Only a campaign GM can change campaign artwork.'};
    }catch(error) {
      return {ok:false,error:error?.message||String(error)};
    }
    const extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[String(file.type).toLowerCase()];
    const path=`campaigns/${campaignId}/artwork/${Date.now()}-${Math.random().toString(36).slice(2,10)}.${extension}`;
    const reference=storageRef(storage,path);
    let uploaded=false;
    try {
      await uploadBytes(reference,file,{contentType:file.type});
      uploaded=true;
      const image=await getDownloadURL(reference);
      if(!/^https:\/\//i.test(String(image||''))) throw new Error('Firebase returned an invalid campaign image URL.');
      let previousPath='';
      await runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(campaignRef);
        if(!snapshot.exists() || !currentUserIsCampaignGM(snapshot.data())) throw new Error('Only a campaign GM can change campaign artwork.');
        previousPath=String(snapshot.data().imagePath||'');
        transaction.update(campaignRef,{image,imagePath:path,updatedAt:serverTimestamp()});
      });
      const local=(window.campaigns||[]).find(campaign=>campaign.id===campaignId);
      if(local){local.image=image;local.imagePath=path;}
      window.dispatchEvent(new CustomEvent('asteria:campaign-artwork-updated',{detail:{campaignId,image}}));
      if(previousPath.startsWith(`campaigns/${campaignId}/artwork/`) && previousPath!==path) {
        deleteObject(storageRef(storage,previousPath)).catch(()=>{});
      }
      return {ok:true,image,path};
    }catch(error) {
      if(uploaded) deleteObject(reference).catch(()=>{});
      reportSyncError('campaign-artwork-upload',error,{campaignId});
      return {ok:false,error:galleryUploadError(error).replace('character owner','campaign GM')};
    }
  },
  removeCampaignArtwork: async function(campaignId) {
    if(!db || !currentUser || !campaignId) return {ok:false,error:'Sign in to update campaign artwork.'};
    try {
      const campaignRef=doc(db,'campaigns',campaignId);
      let oldPath='';
      await runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(campaignRef);
        if(!snapshot.exists() || !currentUserIsCampaignGM(snapshot.data())) throw new Error('Only a campaign GM can change campaign artwork.');
        oldPath=String(snapshot.data().imagePath||'');
        transaction.update(campaignRef,{image:'',imagePath:'',art:'',banner:'',coverImage:'',cover:'',updatedAt:serverTimestamp()});
      });
      const local=(window.campaigns||[]).find(campaign=>campaign.id===campaignId);
      if(local){local.image='';local.imagePath='';local.art='';local.banner='';local.coverImage='';local.cover='';}
      window.dispatchEvent(new CustomEvent('asteria:campaign-artwork-updated',{detail:{campaignId,image:''}}));
      if(oldPath.startsWith(`campaigns/${campaignId}/artwork/`)) {
        deleteObject(storageRef(storage,oldPath)).catch(()=>{});
      }
      return {ok:true,image:''};
    }catch(error){return {ok:false,error:error?.message||String(error)};}
  },
  updateCampaignDetails: async function(campaignId,patch={}){
    if(!db || !currentUser || !campaignId) return {ok:false};
    try{
      const campaignRef=doc(db,'campaigns',campaignId);
      await runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(campaignRef);
        if(!snapshot.exists() || !currentUserIsCampaignGM(snapshot.data())) throw new Error('Only a campaign GM can update campaign details.');
        const clean={};
        if(patch.name!==undefined) clean.name=String(patch.name||'').trim().slice(0,160);
        if(patch.description!==undefined) clean.description=String(patch.description||'').slice(0,20000);
        if(patch.location!==undefined) clean.location=String(patch.location||'').slice(0,300);
        if(patch.playerLimit!==undefined) clean.playerLimit=Math.max(1,Math.min(50,Number(patch.playerLimit||6)));
        transaction.update(campaignRef,Object.assign(clean,{updatedAt:serverTimestamp()}));
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  manageCampaignShop: (...args) => callTrustedAction('manageCampaignShop',args),
  manageCampaignCraftingRecipe: (...args) => callTrustedAction('manageCampaignCraftingRecipe',args),
  manageEnhancementPlan: (...args) => callTrustedAction('manageEnhancementPlan',args),
  manageCraftingStation: (...args) => callTrustedAction('manageCraftingStation',args),
  manageNPCService: (...args) => callTrustedAction('manageNPCService',args),
  requestNPCRepair: (...args) => callTrustedAction('requestNPCRepair',args),
  reviewNPCRepair: (...args) => callTrustedAction('reviewNPCRepair',args),
  subscribeCraftingStations: function(campaignId,onChange,gmMode=false){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const root=collection(db,'campaigns',campaignId,'craftingStations');
    const source=gmMode?root:query(root,where('status','==','open'));
    return onSnapshot(source,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('crafting-stations-listener',error,{campaignId}));
  },
  subscribeNPCServices: function(campaignId,onChange,gmMode=false){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const root=collection(db,'campaigns',campaignId,'npcCraftingServices');
    const source=gmMode?root:query(root,where('status','==','published'));
    return onSnapshot(source,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('npc-services-listener',error,{campaignId}));
  },
  subscribeNPCRepairRequests: function(campaignId,onChange,gmMode=false){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const root=collection(db,'campaigns',campaignId,'npcRepairRequests');
    const source=gmMode?root:query(root,where('ownerUid','==',currentUser.uid));
    return onSnapshot(source,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('npc-repairs-listener',error,{campaignId}));
  },
  requestEnhancement: (...args) => callTrustedAction('requestEnhancement',args),
  reviewEnhancement: (...args) => callTrustedAction('reviewEnhancement',args),
  subscribeEnhancementPlans: function(campaignId,onChange,gmMode=false){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const root=collection(db,'campaigns',campaignId,'enhancementPlans');
    const source=gmMode?root:query(root,where('status','==','published'));
    return onSnapshot(source,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('enhancement-plans-listener',error,{campaignId}));
  },
  subscribeEnhancementRequests: function(campaignId,onChange,gmMode=false){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const root=collection(db,'campaigns',campaignId,'enhancementRequests');
    const source=gmMode?root:query(root,where('ownerUid','==',currentUser.uid));
    return onSnapshot(source,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('enhancement-requests-listener',error,{campaignId}));
  },
  requestCraftingRecipe: (...args) => callTrustedAction('requestCraftingRecipe',args),
  reviewCraftingRequest: (...args) => callTrustedAction('reviewCraftingRequest',args),
  subscribeCraftingRecipes: function(campaignId,onChange,gmMode=false){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const root=collection(db,'campaigns',campaignId,'craftingRecipes');
    const source=gmMode?root:query(root,where('status','==','published'));
    return onSnapshot(source,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('crafting-recipes-listener',error,{campaignId}));
  },
  subscribeCraftingRequests: function(campaignId,onChange,gmMode=false){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const root=collection(db,'campaigns',campaignId,'craftingRequests');
    const source=gmMode?root:query(root,where('ownerUid','==',currentUser.uid));
    return onSnapshot(source,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('crafting-requests-listener',error,{campaignId}));
  },
  manageMerchantRelationship: (...args) => callTrustedAction('manageMerchantRelationship',args),
  subscribePartyWorkspace: function(campaignId,onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(doc(db,'campaigns',campaignId,'systems','party-workspace'),snapshot=>onChange(snapshot.exists() ? snapshot.data() : {sharedNotes:'',questLog:[]}),error=>reportSyncError('party-workspace-listener',error,{campaignId}));
  },
  subscribePartyChat: function(campaignId,onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(query(collection(db,'campaigns',campaignId,'partyChat'),orderBy('createdAt','desc'),limit(100)),snapshot=>{
      const messages=[];
      snapshot.forEach(item=>messages.push(Object.assign({id:item.id},item.data())));
      messages.sort((left,right)=>timestampMs(left.createdAt)-timestampMs(right.createdAt));
      onChange(messages.slice(-100));
    },error=>reportSyncError('party-chat-listener',error,{campaignId}));
  },
  updatePartyNotes: async function(campaignId,sharedNotes){
    if(!db || !currentUser || !campaignId) return {ok:false};
    const workspaceRef=doc(db,'campaigns',campaignId,'systems','party-workspace');
    try{
      await runTransaction(db,async transaction=>{
        const session=await requireLiveSession(transaction,campaignId);
        transaction.set(workspaceRef,{sharedNotes:String(sharedNotes||'').slice(0,20000),sessionId:session.id,updatedBy:currentUser.uid,updatedAt:serverTimestamp()},{merge:true});
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  sendPartyMessage: async function(campaignId,characterId,text){
    if(!db || !currentUser || !campaignId || !String(text||'').trim()) return {ok:false};
    const characterRef=doc(db,'campaigns',campaignId,'characters',characterId);
    const messageRef=doc(collection(db,'campaigns',campaignId,'partyChat'));
    try{
      await runTransaction(db,async transaction=>{
        const session=await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(characterRef);
        if(!characterSnapshot.exists()) throw new Error('Character not found.');
        const character=characterSnapshot.data();
        if(character.ownerUid && character.ownerUid !== currentUser.uid) throw new Error('You can only chat as your own character.');
        transaction.set(messageRef,{id:messageRef.id,campaignId,sessionId:session.id,characterId,ownerUid:currentUser.uid,characterName:character.name||'Character',text:String(text).trim().slice(0,2000),createdAt:serverTimestamp()});
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  subscribeUserDashboardLayout: function(campaignId,role,onChange){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const allowed=role==='gm'?'gm':'player';
    return onSnapshot(doc(db,'users',currentUser.uid,'dashboardLayouts',allowed+'-'+campaignId),
      snapshot=>onChange(snapshot.exists()?snapshot.data().layout||null:null),
      error=>reportSyncError('dashboard-layout-listener',error,{campaignId,role:allowed}));
  },
  saveUserDashboardLayout: async function(campaignId,role,layout){
    if(!db||!currentUser||!campaignId||!['player','gm'].includes(role))return {ok:false,error:'Sign in to save a dashboard layout.'};
    // Never resolve a target account from mutable auth state after async work.
    const ownerUid=currentUser.uid;
    try {
      if(role==='gm'){
        const snapshot=await getDoc(doc(db,'campaigns',campaignId));
        if(currentUser?.uid!==ownerUid)return {ok:false,error:'Account changed before dashboard settings were saved.'};
        if(!snapshot.exists()||!currentUserIsCampaignGM(snapshot.data()))return {ok:false,error:'Only campaign GMs can customise the GM dashboard.'};
      }
      const {normalizeDashboardLayout}=await import('../src/state/dashboardLayoutModel.mjs');
      if(currentUser?.uid!==ownerUid)return {ok:false,error:'Account changed before dashboard settings were saved.'};
      await setDoc(doc(db,'users',ownerUid,'dashboardLayouts',role+'-'+campaignId),
        {layout:normalizeDashboardLayout(layout,role),updatedAt:serverTimestamp()},{merge:true});
      return {ok:true};
    } catch(error) {return {ok:false,error:error?.message||String(error)};}
  },
  updateCharacterDashboardPreferences: async function(campaignId,characterId,preferences={}){
    if(!db||!currentUser||!characterId)return {ok:false,error:'Sign in to update dashboard settings.'};
    try{
      if(!campaignId){
        const privateRef=doc(db,'users',currentUser.uid,'characters',characterId);
        const snap=await getDoc(privateRef);
        if(!snap.exists()||snap.data().ownerUid!==currentUser.uid)throw new Error('Only the character owner can update this layout.');
        const patch=normalizeDashboardPreferences({dashboardPreferences:{...(snap.data().dashboardPreferences||{}),...structuredCloneSafe(preferences)}});
        await setDoc(privateRef,{dashboardPreferences:patch,updatedAt:serverTimestamp()},{merge:true});
      } else {
        const refs=liveCharacterRefs(campaignId,characterId);
        await runTransaction(db,async transaction=>{
          const snapshot=await transaction.get(refs.campaign);
          if(!snapshot.exists())throw new Error('Character not found.');
          const character={id:characterId,...snapshot.data()};
          await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
          character.dashboardPreferences=normalizeDashboardPreferences({dashboardPreferences:{...(character.dashboardPreferences||{}),...structuredCloneSafe(preferences)}});
          writeLiveCharacter(transaction,refs,character);
        });
      }
      return {ok:true};
    }catch(error){return {ok:false,error:error?.message||String(error)};}
  },
  createPartyOrganization: (...args) => callTrustedAction('createPartyOrganization', args),
  uploadCharacterGalleryImage: async function(campaignId,characterId,file){
    if(!db || !storage || !currentUser || !campaignId || !characterId || !(file instanceof File)) return {ok:false,error:'Choose an image file.'};
    if(!GALLERY_IMAGE_TYPES.has(String(file.type||'').toLowerCase())) return {ok:false,error:'Choose a PNG, JPG, WEBP, or GIF image.'};
    if(Number(file.size||0)>8*1024*1024) return {ok:false,error:'Images must be 8 MB or smaller.'};
    const refs=liveCharacterRefs(campaignId,characterId);
    const snapshot=await getDoc(refs.campaign);
    if(!snapshot.exists()) return {ok:false,error:'Character not found.'};
    const verified=await verifyOwnedLiveCharacterRead(campaignId,characterId,Object.assign({id:characterId},snapshot.data()));
    if(!verified.ok) return verified;
    refs.private=verified.privateRef;
    const sourceCharacterId=ownedCharacterSourceId(characterId,snapshot.data());
    const id=`gallery-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const extension=({ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif' })[String(file.type).toLowerCase()];
    const path=`users/${currentUser.uid}/characters/${sourceCharacterId}/gallery/${id}.${extension}`;
    const reference=storageRef(storage,path);
    try{
      await uploadBytes(reference,file,{contentType:file.type,customMetadata:{campaignId,campaignCharacterId:characterId,sourceCharacterId}});
      const url=await getDownloadURL(reference);
      if(!/^https:\/\//i.test(String(url||''))) throw new Error('Firebase returned an invalid permanent image URL.');
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(refs.campaign);
        if(!characterSnapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const image={id,url,path,name:String(file.name||'Character image').slice(0,160),createdAt:new Date().toISOString()};
        character.gallery=[...(Array.isArray(character.gallery)?character.gallery:[]),image];
        if(!character.image&&!character.portrait) character.image=url;
        writeLiveCharacter(transaction,refs,character);
      });
      return {ok:true,image:{id,url,path,name:file.name}};
    }catch(error){
      deleteObject(reference).catch(()=>{});
      reportSyncError('gallery-upload',error,{campaignId,characterId});
      return {ok:false,error:galleryUploadError(error)};
    }
  },
  syncOwnedCharacterGalleryMedia: async function(campaignId,characterId){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const changed=await runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        const verification=await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const privateSnapshot=await transaction.get(verification.privateRef);
        const privateData=privateSnapshot.exists()?privateSnapshot.data():{};
        const privateGallery=Array.isArray(privateData.gallery)?privateData.gallery:Array.isArray(privateData.character?.gallery)?privateData.character.gallery:[];
        const currentGallery=Array.isArray(character.gallery)?character.gallery:[];
        const mergedGallery=[];
        const seen=new Set();
        [...currentGallery,...privateGallery].forEach((image,index)=>{
          const clean=typeof image==='string'?{url:image}:structuredCloneSafe(image);
          const key=String(clean.id || clean.path || clean.url || clean.downloadURL || index);
          if(!seen.has(key)){seen.add(key);mergedGallery.push(clean);}
        });
        const portrait=character.image || character.portrait || character.characterImage || privateData.image || privateData.portrait || privateData.characterImage || privateData.appearance?.image || privateData.appearance?.portrait || privateData.character?.image || '';
        const hasChange=mergedGallery.length!==currentGallery.length || (!character.image && Boolean(portrait));
        if(hasChange) transaction.set(refs.campaign,{
          gallery:mergedGallery,
          image:character.image || portrait,
          portrait:character.portrait || portrait,
          characterImage:character.characterImage || portrait,
          updatedAt:serverTimestamp()
        },{merge:true});
        return hasChange;
      });
      return {ok:true,changed};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  refreshCharacterGalleryImage: async function(campaignId,characterId,imageId){
    if(!db || !storage || !currentUser || !campaignId || !characterId || !imageId) return {ok:false,error:'Gallery image is unavailable.'};
    try{
      const snapshot=await getDoc(doc(db,'campaigns',campaignId,'characters',characterId));
      if(!snapshot.exists()) throw new Error('Character not found.');
      const image=(snapshot.data().gallery||[]).find(value=>String(value?.id||'')===String(imageId));
      if(!image) throw new Error('Gallery image not found.');
      if(image.path) return {ok:true,url:await getDownloadURL(storageRef(storage,image.path))};
      if(image.url) return {ok:true,url:image.url};
      throw new Error('This gallery record has no image source.');
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  setCharacterGalleryPortrait: async function(campaignId,characterId,imageId){
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const image=(character.gallery||[]).find(value=>String(value.id)===String(imageId));
        if(!image?.url) throw new Error('Gallery image not found.');
        character.image=image.url;character.portrait=image.url;character.characterImage=image.url;
        writeLiveCharacter(transaction,refs,character);
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  deleteCharacterGalleryImage: async function(campaignId,characterId,imageId){
    const refs=liveCharacterRefs(campaignId,characterId);
    let removed=null;
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        removed=(character.gallery||[]).find(value=>String(value.id)===String(imageId));
        character.gallery=(character.gallery||[]).filter(value=>String(value.id)!==String(imageId));
        if(removed?.url && [character.image,character.portrait,character.characterImage].includes(removed.url)){
          const next=character.gallery[0]?.url||'';character.image=next;character.portrait=next;character.characterImage=next;
        }
        writeLiveCharacter(transaction,refs,character);
      });
      if(removed?.path) deleteObject(storageRef(storage,removed.path)).catch(()=>{});
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  grantCharacterTitle: async function(campaignId,characterIds,title){
    if(!db || !currentUser || !campaignId) return {ok:false};
    const ids=[...new Set((Array.isArray(characterIds)?characterIds:[characterIds]).filter(Boolean))];
    const text=String(title||'').trim().slice(0,120);
    if(!ids.length||!text) return {ok:false,error:'Choose a character and enter a title.'};
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        const references=ids.map(characterId=>doc(db,'campaigns',campaignId,'characters',characterId));
        const snapshots=await Promise.all(references.map(reference=>transaction.get(reference)));
        for(let index=0;index<references.length;index++){
          const reference=references[index];
          const snapshot=snapshots[index];
          if(!snapshot.exists()) continue;
          const character=Object.assign({id:ids[index]},snapshot.data());
          const titles=Array.isArray(character.titles)?character.titles:[];
          if(!titles.some(value=>String(value.text||value).toLowerCase()===text.toLowerCase())) titles.push({id:`title-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,text,source:'GM',grantedBy:currentUser.uid,createdAt:new Date().toISOString()});
          transaction.set(reference,{titles,updatedAt:serverTimestamp()},{merge:true});
        }
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  manageCharacterTitle: async function(campaignId,characterId,titleId,details={}){
    if(!db||!currentUser||!campaignId||!characterId||!titleId) return {ok:false,error:'Choose a character and title.'};
    const reference=doc(db,'campaigns',campaignId,'characters',characterId);
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        const snapshot=await transaction.get(reference);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        const titles=(Array.isArray(character.titles)?character.titles:[]).map((value,index)=>typeof value==='string'?{id:`title-${index}`,text:value}:value);
        const index=titles.findIndex(value=>String(value.id)===String(titleId));
        if(index<0) throw new Error('Player title not found.');
        if(details.revoke){
          titles.splice(index,1);
          if(String(character.dashboardPreferences?.visibleTitleId||'')===String(titleId)) character.dashboardPreferences=Object.assign({},character.dashboardPreferences||{},{visibleTitleId:''});
        }else{
          const text=String(details.text||'').trim().slice(0,120);
          if(!text) throw new Error('Enter a title.');
          titles[index]=Object.assign({},titles[index],{text,updatedAt:new Date().toISOString(),updatedBy:currentUser.uid});
        }
        transaction.set(reference,{titles,dashboardPreferences:character.dashboardPreferences||{},updatedAt:serverTimestamp()},{merge:true});
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  grantCharacterStorageSlots: async function(campaignId,characterIds,amount=1){
    if(!db || !currentUser || !campaignId) return {ok:false};
    const ids=[...new Set((Array.isArray(characterIds)?characterIds:[characterIds]).filter(Boolean))];
    const count=Math.max(1,Math.min(10,Number(amount||1)));
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        const references=ids.map(characterId=>doc(db,'campaigns',campaignId,'characters',characterId));
        const snapshots=await Promise.all(references.map(reference=>transaction.get(reference)));
        for(let index=0;index<references.length;index++){
          const reference=references[index];
          const snapshot=snapshots[index];
          if(!snapshot.exists()) continue;
          const character=snapshot.data();
          transaction.set(reference,{storageLimit:Math.max(3,Number(character.storageLimit||3))+count,updatedAt:serverTimestamp()},{merge:true});
        }
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  spendCharacteristicPoints: (...args) => callTrustedAction('spendCharacteristicPoints', args),
  spendCharacteristicAllocations: (...args) => callTrustedAction('spendCharacteristicAllocations', args),
  purchaseTalentRank: (...args) => callTrustedAction('purchaseTalentRank', args),
  useCharacterTalent: (...args) => callTrustedAction('useCharacterTalent', args),
  endCharacterTalentEffect: (...args) => callTrustedAction('endCharacterTalentEffect', args),
  refreshCharacterSystems: (...args) => callTrustedAction('refreshCharacterSystems', args),
  manageCharacterCondition: (...args) => callTrustedAction('manageCharacterCondition', args),
  configureCharacterResource: (...args) => callTrustedAction('configureCharacterResource', args),
  reviewCharacterRest: (...args) => callTrustedAction('reviewCharacterRest', args),
  refreshCharacterTalents: (...args) => callTrustedAction('refreshCharacterTalents', args),
  recordSkillSuccess: (...args) => callTrustedAction('recordSkillSuccess', args),
  castCharacterSpell: (...args) => callTrustedAction('castCharacterSpell', args),
  markNotificationRead: (...args) => callTrustedAction('markNotificationRead', args),
  sendCharacterNotification: (...args) => callTrustedAction('sendCharacterNotification', args),
  updateCharacterInventory: (...args) => callTrustedAction('updateCharacterInventory', args),
  createCustomLootReward: (...args) => callTrustedAction('createCustomLootReward', args),
  subscribeMerchantTemplates: function(onChange){
    if(!db||!currentUser||typeof onChange!=='function')return ()=>{};
    const ownerUid=currentUser.uid;
    return onSnapshot(collection(db,'users',ownerUid,'merchantTemplates'),
      snapshot=>{if(currentUser?.uid===ownerUid)
        onChange(snapshot.docs.map(row=>({id:row.id,...row.data()})));},
      error=>reportSyncError('merchant-templates-listener',error));
  },
  saveMerchantTemplate: async function(input){
    if(!db||!currentUser)return {ok:false,error:'Sign in to save a merchant template.'};
    const ownerUid=currentUser.uid;
    try{
      const template=normalizeMerchantTemplate(input);
      if(!template.id.startsWith('template-'))
        throw Error('Only custom merchant templates can be saved.');
      if(currentUser?.uid!==ownerUid)throw Error('Account changed.');
      await setDoc(doc(db,'users',ownerUid,'merchantTemplates',template.id),
        {...template,updatedAt:serverTimestamp()});
      return {ok:true,template};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  deleteMerchantTemplate: async function(templateId){
    if(!db||!currentUser)return {ok:false,error:'Sign in first.'};
    const ownerUid=currentUser.uid;
    if(typeof templateId!=='string'||!/^template-[A-Za-z0-9_-]{4,150}$/.test(templateId))
      return {ok:false,error:'Invalid template identifier.'};
    try{
      if(currentUser?.uid!==ownerUid)throw Error('Account changed.');
      await deleteDoc(doc(db,'users',ownerUid,'merchantTemplates',templateId));
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  subscribeMerchantRelationships: function(campaignId,onChange,gmMode=false){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const collectionRef=collection(db,'campaigns',campaignId,'merchantRelationships');
    const source=gmMode?collectionRef:query(collectionRef,where('ownerUid','==',currentUser.uid));
    return onSnapshot(source,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('merchant-relationships-listener',error,{campaignId}));
  },
  subscribeMerchantDeals: function(campaignId,onChange,gmMode=false){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const q=gmMode?collection(db,'campaigns',campaignId,'merchantDeals'):
      query(collection(db,'campaigns',campaignId,'merchantDeals'),where('ownerUid','==',currentUser.uid));
    return onSnapshot(q,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('merchant-deals-listener',error,{campaignId}));
  },
  manageItemLore: (...args) => callTrustedAction('manageItemLore', args),
  subscribeItemLore: function(campaignId,onChange){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    return onSnapshot(collection(db,'campaigns',campaignId,'itemLore'),
      snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('item-lore-listener',error,{campaignId}));
  },
  subscribeItemDiscoveries: function(campaignId,onChange,gmMode=false){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const ref=collection(db,'campaigns',campaignId,'itemDiscoveries');
    const q=gmMode?ref:query(ref,where('ownerUid','==',currentUser.uid));
    return onSnapshot(q,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('item-discoveries-listener',error,{campaignId}));
  },
  createMerchantDeal: (...args) => callTrustedAction('createMerchantDeal', args),
  respondMerchantDeal: (...args) => callTrustedAction('respondMerchantDeal', args),
  cancelMerchantDeal: (...args) => callTrustedAction('cancelMerchantDeal', args),
  buyLiveShopItem: (...args) => callTrustedAction('buyLiveShopItem', args),
  sellLiveShopItem: (...args) => callTrustedAction('sellLiveShopItem', args),
  createLiveTrade: async function(campaignId,characterId,recipientId,itemId,quantity=1,note=''){
    return firebasePublicApi.createLiveItemRequest(campaignId,characterId,recipientId,itemId,'trade',{quantity,note});
  },
  respondLiveTrade: async function(campaignId,characterId,requestId,accepted){
    return firebasePublicApi.respondLiveItemRequest(campaignId,characterId,requestId,accepted,{});
  },
  syncCampaignItemPrivacy: (...args) => callTrustedAction('syncCampaignItemPrivacy', args),
  syncCampaignShopStores: (...args) => callTrustedAction('syncCampaignShopStores',args),
  syncGMRewardBundles: (...args) => callTrustedAction('syncGMRewardBundles',args),
  manageGMRewardBundle: (...args) => callTrustedAction('manageGMRewardBundle',args),
  createLiveItemRequest: (...args) => callTrustedAction('createLiveItemRequest', args),
  createLiveItemOffer: async function(campaignId,characterId,recipientId,itemId,mode='give',details={}){
    return firebasePublicApi.createLiveItemRequest(campaignId,characterId,recipientId,itemId,mode,details);
  },
  respondLiveItemRequest: (...args) => callTrustedAction('respondLiveItemRequest', args),
  finalizeLiveItemTrade: (...args) => callTrustedAction('finalizeLiveItemTrade', args),
  respondLiveItemOffer: async function(campaignId,characterId,requestId,accepted,details={}){
    return firebasePublicApi.respondLiveItemRequest(campaignId,characterId,requestId,accepted,details);
  },
  cancelLiveItemRequest: (...args) => callTrustedAction('cancelLiveItemRequest', args),
  acknowledgeLiveItemRequest: (...args) => callTrustedAction('acknowledgeLiveItemRequest', args),
  acknowledgeLiveItemRecipientUpdate: (...args) => callTrustedAction('acknowledgeLiveItemRecipientUpdate', args),
  updateCharacterQuest: (...args) => callTrustedAction('updateCharacterQuest', args),
  updateQuestProgress: (...args) => callTrustedAction('updateQuestProgress', args),
  reviewCharacterQuest: (...args) => callTrustedAction('reviewCharacterQuest', args),
  addJournalEntry: async function(campaignId,characterId,entry={}){
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const journal=Array.isArray(character.journal)?character.journal:[];
        character.journal=[{id:`journal-${Date.now()}`,title:String(entry.title||'Journal Entry').slice(0,120),body:String(entry.body||'').slice(0,20000),createdAt:new Date().toISOString()},...journal];
        writeLiveCharacter(transaction,refs,character);
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  repairCampaignCharacterLink: (...args) => callTrustedAction('repairCampaignCharacterLink', args),
  combatCommand: (...args) => callTrustedAction('combatCommand', args),
  saveCampaignEncounter: async function(campaignId, encounter={}){
    return callTrustedAction('combatCommand',[campaignId,'encounter',{operation:'save',encounter,revision:Number(encounter.combat?.revision||0)}]);
  },
  updateCampaignEncounterResource: async function(campaignId,combatantId,resource,current,maximum){
    if(!db || !currentUser || !campaignId || !combatantId) return {ok:false};
    const key=String(resource||'').toLowerCase();
    const encounterRef=doc(db,'campaigns',campaignId,'systems','encounter');
    try{
      const value=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        const snapshot=await transaction.get(encounterRef);
        if(!snapshot.exists()) throw new Error('The encounter is not available.');
        const encounter=structuredCloneSafe(snapshot.data());
        let found=false;
        let pair=null;
        const update=record=>{
          if(String(record?.id||'')!==String(combatantId)) return record;
          found=true;
          const next=setEncounterResource(record,key,current,maximum);
          pair=encounterResourcePair(next,key);
          return next;
        };
        encounter.combatants=(Array.isArray(encounter.combatants)?encounter.combatants:[]).map(update);
        encounter.enemies=(Array.isArray(encounter.enemies)?encounter.enemies:[]).map(update);
        if(!found) throw new Error('The encounter entry was not found.');
        transaction.set(encounterRef,Object.assign({},cleanData(encounter),{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return pair;
      });
      return {ok:true,value};
    }catch(error){
      reportSyncError('campaign-encounter-resource',error,{campaignId,combatantId,resource:key});
      return {ok:false,error:error.message||String(error)};
    }
  },
  acknowledgeCampaignEvent: async function(campaignId, eventId, resolution={}){
    if(!db || !currentUser || !campaignId || !eventId) return { ok:false, applied:false };
    const eventRef=doc(db, 'campaigns', campaignId, 'events', eventId);
    const applied=await runTransaction(db, async transaction=>{
      const snapshot=await transaction.get(eventRef);
      if(!snapshot.exists()) return false;
      const event=snapshot.data();
      if(event.acknowledged && !resolution.status) return false;
      transaction.set(eventRef, Object.assign({}, cleanData(resolution), {
        acknowledged:true,
        acknowledgedBy:currentUser.uid,
        acknowledgedAt:serverTimestamp(),
        deliveryStatus:'acknowledged',
        updatedAt:serverTimestamp()
      }), { merge:true });
      return true;
    });
    return { ok:true, applied };
  },
  grantCampaignXP: async function(campaignId, characterId, amount, metadata={}){
    if(!db || !currentUser || !campaignId || !characterId) return { ok:false };
    const delta=Math.floor(Number(amount || 0));
    if(delta <= 0) throw new Error('XP must be greater than zero.');
    const refs=liveCharacterRefs(campaignId,characterId);
    const characterRef=refs.campaign;
    const eventRef=doc(collection(db, 'campaigns', campaignId, 'events'));
    try{
      const result=await runTransaction(db, async transaction=>{
        const live=await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        const characterSnapshot=await transaction.get(characterRef);
        if(!characterSnapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({ id:characterId }, characterSnapshot.data());
        const before={ level:Number(character.level || 0), xp:Number(character.xp || 0) };
        if(!window.AsteriaProgression?.grantXP) throw new Error('The XP progression service is unavailable. No XP was awarded.');
        const progression=window.AsteriaProgression.grantXP(character, delta);
        const revision=`xp-${eventRef.id}`;
        character.progressionSync={ revision, source:'gm-live-reward', updatedAt:new Date().toISOString() };
        transaction.set(characterRef, Object.assign({}, cleanData(character), { updatedAt:serverTimestamp() }), { merge:true });
        const event={
          id:eventRef.id,
          campaignId,
          sessionId:live.id || '',
          targetCharacterId:characterId,
          targetOwnerUid:character.ownerUid || '',
          type:'xp-reward',
          payload:{
            amount:delta,
            reason:metadata.reason || 'Campaign reward',
            source:metadata.source || 'GM Dashboard',
            characterName:character.name || characterId,
            before,
            level:Number(character.level || 0),
            xp:Number(character.xp || 0),
            xpMax:Number(character.xpMax || 0),
            leveled:Boolean(progression.leveled),
            fromLevel:Number(progression.fromLevel ?? before.level),
            toLevel:Number(progression.toLevel ?? character.level ?? 0),
            messages:progression.messages || []
          },
          status:'delivered',
          deliveryStatus:'delivered',
          acknowledged:false,
          createdBy:currentUser.uid,
          createdAt:serverTimestamp(),
          resolvedAt:null
        };
        transaction.set(eventRef, event);
        return { character, event:Object.assign({}, event, { createdAt:new Date().toISOString() }) };
      });
      return { ok:true, applied:true, character:result.character, event:result.event };
    }catch(error){
      reportSyncError('campaign-xp-transaction', error, { campaignId, characterId, amount:delta });
      return { ok:false, applied:false, error:error.message || String(error) };
    }
  },
  createLootReward: async function(campaignId, characterId, item, metadata={}){
    if(!db || !currentUser || !campaignId || !characterId || !item) return { ok:false };
    const characterRef=doc(db, 'campaigns', campaignId, 'characters', characterId);
    const eventRef=doc(collection(db, 'campaigns', campaignId, 'events'));
    try{
      const result=await runTransaction(db, async transaction=>{
        const live=await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        const characterSnapshot=await transaction.get(characterRef);
        if(!characterSnapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({ id:characterId }, characterSnapshot.data());
        const sourceItem=normalizeMarketPricing(structuredCloneSafe(item),{legacy:true,removeLegacy:true,migratedRecord:true});
        const realName=String(sourceItem.trueName||sourceItem.name||sourceItem.title||'Unknown Item');
        const rewardItem=Object.assign({},sourceItem,{
          trueName:realName,
          basicName:String(sourceItem.basicName||unidentifiedItemName(Object.assign({},sourceItem,{identified:false}))),
          identified:metadata.identified===true,
          name:metadata.identified===true ? realName : String(sourceItem.basicName||unidentifiedItemName(Object.assign({},sourceItem,{identified:false})))
        });
        const reward={
          id:eventRef.id,
          campaignId,
          campaignName:metadata.campaignName || '',
          item:cleanData(rewardItem),
          message:metadata.message || 'The GM awarded an item.',
          status:'pending',
          createdAt:new Date().toISOString()
        };
        const pending=Array.isArray(character.pendingItemRewards) ? character.pendingItemRewards : [];
        if(!pending.some(value=>String(value?.id || '') === eventRef.id)) character.pendingItemRewards=[...pending,reward];
        transaction.set(characterRef, { pendingItemRewards:cleanData(character.pendingItemRewards), updatedAt:serverTimestamp() }, { merge:true });
        const event={
          id:eventRef.id,
          campaignId,
          sessionId:live.id || '',
          targetCharacterId:characterId,
          targetOwnerUid:character.ownerUid || '',
          type:'loot-reward',
          payload:{ item:cleanData(rewardItem), message:reward.message, campaignName:reward.campaignName },
          status:'pending',
          deliveryStatus:'delivered',
          acknowledged:false,
          createdBy:currentUser.uid,
          createdAt:serverTimestamp(),
          resolvedAt:null
        };
        transaction.set(eventRef, event);
        return event;
      });
      return { ok:true, applied:true, event:Object.assign({}, result, { createdAt:new Date().toISOString() }) };
    }catch(error){
      reportSyncError('campaign-loot-transaction', error, { campaignId, characterId });
      return { ok:false, applied:false, error:error.message || String(error) };
    }
  },
  createMagicElementReward: async function(campaignId, characterId, magicType, metadata={}){
    if(!db || !currentUser || !campaignId || !characterId || !magicType) return { ok:false };
    const characterRef=doc(db, 'campaigns', campaignId, 'characters', characterId);
    const eventRef=doc(collection(db, 'campaigns', campaignId, 'events'));
    try{
      const event=await runTransaction(db, async transaction=>{
        const live=await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        const characterSnapshot=await transaction.get(characterRef);
        if(!characterSnapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({ id:characterId }, characterSnapshot.data());
        const requested=String(magicType).replace(/\s+Magic$/i,'').toLowerCase();
        if(knownMagicElements(character).some(value=>value.toLowerCase()===requested)) throw new Error(`${magicType} is already available to ${character.name || characterId}.`);
        const value={
          id:eventRef.id,
          campaignId,
          sessionId:live.id || '',
          targetCharacterId:characterId,
          targetOwnerUid:character.ownerUid || '',
          type:'magic-element-reward',
          payload:{ magicType:String(magicType), message:metadata.message || 'The GM granted access to a new magical element.', characterName:character.name || characterId },
          status:'pending',
          deliveryStatus:'delivered',
          acknowledged:false,
          createdBy:currentUser.uid,
          createdAt:serverTimestamp(),
          resolvedAt:null
        };
        transaction.set(eventRef, value);
        return value;
      });
      return { ok:true, applied:true, event:Object.assign({}, event, { createdAt:new Date().toISOString() }) };
    }catch(error){
      reportSyncError('campaign-magic-reward', error, { campaignId, characterId, magicType });
      return { ok:false, applied:false, error:error.message || String(error) };
    }
  },
  grantGMRewardBundle: (...args) => callTrustedAction('grantGMRewardBundle', args),
  respondMagicElementReward: (...args) => callTrustedAction('respondMagicElementReward', args),
  identifyLootReward: (...args) => callTrustedAction('identifyLootReward', args),
  resolveLootReward: (...args) => callTrustedAction('resolveLootReward', args),
  updateCampaignCharacterResource: (...args) => callTrustedAction('updateCampaignCharacterResource', args),
  updateCampaignSpecialDamage: async function(campaignId,target={},amount,mode='apply',metadata={}){
    if(!db || !currentUser || !campaignId || !target?.id) return {ok:false};
    const delta=Math.max(0,Math.floor(Number(amount||0)));
    if(!delta) return {ok:false,error:'Soul Damage amount must be greater than zero.'};
    const operation=String(mode||'apply').toLowerCase();
    if(!['apply','recover'].includes(operation)) return {ok:false,error:'Unsupported Soul Damage action.'};
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        if(String(target.kind||'character')==='creature'){
          const encounterRef=doc(db,'campaigns',campaignId,'systems','encounter');
          const snapshot=await transaction.get(encounterRef);
          if(!snapshot.exists()) throw new Error('The encounter is not available.');
          const encounter=structuredCloneSafe(snapshot.data());
          let saved=null;
          const update=value=>{
            if(String(value.id)!==String(target.id)) return value;
            strictResourcePair(value.hp,'hp');
            const changed=operation==='recover'?recoverSoulDamage(value,delta,metadata.source||'GM Dashboard'):applySoulDamage(value,delta,metadata.source||'GM Dashboard');
            saved=changed;
            return changed.entity;
          };
          encounter.enemies=(Array.isArray(encounter.enemies)?encounter.enemies:[]).map(update);
          encounter.combatants=(Array.isArray(encounter.combatants)?encounter.combatants:[]).map(update);
          if(!saved) throw new Error('The encounter creature was not found.');
          transaction.set(encounterRef,Object.assign({},cleanData(encounter),{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
          return {applied:saved.applied||0,recovered:saved.recovered||0,soulDamage:saved.soulDamage,hp:saved.entity.hp};
        }
        const characterRef=doc(db,'campaigns',campaignId,'characters',target.id);
        const snapshot=await transaction.get(characterRef);
        if(!snapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({id:target.id},snapshot.data());
        strictResourcePair(character.hp,'hp');
        const changed=operation==='recover'?recoverSoulDamage(character,delta,metadata.source||'GM Dashboard'):applySoulDamage(character,delta,metadata.source||'GM Dashboard');
        appendActivity(changed.entity,{type:'soul-damage',message:operation==='recover'?`${changed.recovered} Soul Damage recovered naturally.`:`${changed.applied} Soul Damage taken.`});
        transaction.set(characterRef,Object.assign({},cleanData(changed.entity),{updatedAt:serverTimestamp()}),{merge:true});
        return {applied:changed.applied||0,recovered:changed.recovered||0,soulDamage:changed.soulDamage,hp:changed.entity.hp};
      });
      return {ok:true,...result};
    }catch(error){
      reportSyncError('campaign-special-damage',error,{campaignId,target,amount:delta,mode:operation});
      return {ok:false,error:error.message||String(error)};
    }
  },
  takeCampaignCharacterRest: (...args) => callTrustedAction('requestCharacterRest', args),
  updateCampaignCharacterCurrency: (...args) => callTrustedAction('updateCampaignCharacterCurrency', args),
  setCharacterACModifier: async function(campaignId,characterId,modifier={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const saved=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        const rows=(Array.isArray(character.acModifiers)?character.acModifiers:[]).filter(value=>value&&typeof value==='object');
        const id=String(modifier.id||`gm-ac-${Date.now()}-${Math.random().toString(36).slice(2,7)}`);
        let next;
        if(modifier.remove){
          next=rows.filter(value=>String(value.id)!==id);
        }else{
          const value=Number(modifier.value);
          if(!Number.isFinite(value) || value===0) throw new Error('Enter a non-zero AC modifier.');
          const minutes=Math.max(0,Math.min(10080,Number(modifier.durationMinutes||0)));
          const record={
            id,
            type:'AC_MODIFIER',
            sourceType:'gm',
            sourceId:currentUser.uid,
            name:String(modifier.name||'GM AC Modifier').trim().slice(0,100),
            value,
            active:true,
            temporary:minutes>0,
            expiresAt:minutes>0 ? new Date(Date.now()+minutes*60000).toISOString() : '',
            createdAt:new Date().toISOString(),
            createdBy:currentUser.uid
          };
          next=[record,...rows.filter(value=>String(value.id)!==id)];
        }
        character.acModifiers=next;
        appendActivity(character,{type:'ac-modifier',message:modifier.remove?'GM removed an AC modifier.':`GM applied ${modifier.name||'AC modifier'} (${Number(modifier.value)>0?'+':''}${Number(modifier.value)} AC).`});
        transaction.set(refs.campaign,{acModifiers:cleanData(next),actionLog:cleanData(character.actionLog),updatedAt:serverTimestamp()},{merge:true});
        return next;
      });
      return {ok:true,modifiers:saved};
    }catch(error){
      reportSyncError('campaign-ac-modifier',error,{campaignId,characterId});
      return {ok:false,error:error.message||String(error)};
    }
  },
  saveCharacter: async function(id, character){
    if(!db || !currentUser || !id || !character || character.ownerUid !== currentUser.uid) return false;
    const uid=currentUser.uid;
    try{
      const clean = JSON.parse(JSON.stringify(character));
      await setDoc(doc(db, 'users', uid, 'characters', id), Object.assign({}, clean, { id, ownerUid: uid, updatedAt: serverTimestamp() }), { merge:true });
      if(currentUser?.uid!==uid) return false;
      const profileRef = doc(db, 'users', uid);
      const chars = Array.from(new Set([...(currentProfile?.characters || []), id]));
      currentProfile = Object.assign({}, currentProfile || {}, { characters: chars });
      await setDoc(profileRef, { characters: chars, updatedAt: serverTimestamp() }, { merge:true });
      saveLocalProfile(uid, Object.assign({}, currentProfile, { characters: chars }));
      if(currentUser?.uid!==uid) return false;
      await syncCharacterToCampaigns(id, clean);
      return true;
    }catch(err){ console.warn('Could not save character to Firestore.', err); return false; }
  },
  saveCharacters: async function(characterMap){
    if(!db || !currentUser || !characterMap) return false;
    const ids = Object.keys(characterMap);
    for(const id of ids){ if(!await this.saveCharacter(id, characterMap[id])) return false; }
    return true;
  },
  saveState: async function(state){
    if(!db || !currentUser || !state) return false;
    try{
      const clean = JSON.parse(JSON.stringify(state));
      await setDoc(doc(db, 'users', currentUser.uid, 'settings', 'appState'), Object.assign({}, clean, { updatedAt: serverTimestamp() }), { merge:true });
      try{ localStorage.setItem('asteria-cloud-state-backup', JSON.stringify(Object.assign({}, clean, { localSavedAt: Date.now() }))); }catch(e){}
      return true;
    }catch(err){ console.warn('Could not save app state to Firestore.', err); return false; }
  },
  loadState: async function(){
    if(!db || !currentUser) return null;
    try{
      const snap = await getDoc(doc(db, 'users', currentUser.uid, 'settings', 'appState'));
      if(snap.exists()) return snap.data();
    }catch(err){ reportSyncError('account-state-load',err); throw err; }
    return null;
  },
  saveCampaign: async function(id, campaign){
    if(!db || !currentUser || !id || !campaign) return false;
    try{
      const clean = cleanData(campaign);
      const ownerUid = campaignOwner(clean);
      clean.playerCharacterLinks = clean.playerCharacterLinks || {};
      let savedCampaign = Object.assign({}, clean, { id, ownerUid });
      if(ownerUid === currentUser.uid){
        savedCampaign = await runTransaction(db, async transaction=>{
          const campaignRef = doc(db, 'campaigns', id);
          const campaignSnap = await transaction.get(campaignRef);
          const shared = campaignSnap.exists() ? Object.assign({}, campaignSnap.data(), { id }) : {};
          const merged = mergeSharedCampaign(savedCampaign, shared);
          transaction.set(campaignRef, Object.assign({}, merged, { updatedAt:serverTimestamp() }), { merge:true });
          return merged;
        });
        const ucn = campaignCode(savedCampaign.ucn || savedCampaign.uniqueCampaignCode || savedCampaign.inviteCode);
        if(ucn.length === 12){
          await setDoc(doc(db, 'campaignInvites', ucn), {
            ucn,
            campaignId:id,
            campaignName:savedCampaign.name || 'Untitled Campaign',
            ownerUid,
            status:'active',
            updatedAt:serverTimestamp()
          }, { merge:true });
        }
      }
      await setDoc(doc(db, 'users', currentUser.uid, 'campaigns', id), Object.assign({}, savedCampaign, { updatedAt:serverTimestamp() }), { merge:true });
      return true;
    }catch(err){ console.warn('Could not save campaign to Firestore.', err); return false; }
  },
  serverCampaignUCNEnabled: function(){
    // The new-campaign canary is opt-in and leaves legacy creation untouched.
    return window.AsteriaFeatureFlags?.serverCampaignUCN === true ||
      (window.AsteriaFeatureFlags?.campaignInAppCanary===true &&
       new URLSearchParams(window.location.search).get('campaign-inapp-canary')==='1');
  },
  createCampaignIdentity: async function(name,{v2Test=false,partySize=4}={}){
    if(!functionsClient || !currentUser) throw new Error('Sign in before creating a campaign.');
    if(!this.serverCampaignUCNEnabled()) throw new Error('Server campaign identity allocation is not enabled.');
    if(v2Test&&(
       window.AsteriaFeatureFlags?.campaignInAppCanary!==true ||
       new URLSearchParams(window.location.search).get('campaign-inapp-canary')!=='1'))
      throw new Error('New v2 campaign testing is not enabled.');
    return (await httpsCallable(functionsClient,'asteriaCampaignUCN')({
      action:'create',name,...(v2Test?{v2Test:true,partySize}:{})
    })).data;
  },
  previewCampaignByUCN: async function(codeValue){
    if(!functionsClient || !currentUser) throw new Error('Sign in to look up a campaign.');
    return (await httpsCallable(functionsClient,'asteriaCampaignUCN')({action:'preview',code:campaignCode(codeValue)})).data;
  },
  findCampaignByUCN: async function(codeValue){
    if(!functionsClient || !currentUser) throw new Error('Sign in to view this invitation.');
    return (await httpsCallable(functionsClient,'asteriaInvite')({code:campaignCode(codeValue),join:false})).data;
  },
  joinRequestStatus: async function(campaignId,codeValue){
    if(!functionsClient || !currentUser) throw new Error('Sign in to review the request.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinRequest')({
      action:'status',campaignId,ucn:campaignCode(codeValue)
    })).data;
  },
  submitCampaignJoinRequest: async function(campaignId,codeValue,characterId=null){
    if(!functionsClient || !currentUser) throw new Error('Sign in to request campaign access.');
    if(window.AsteriaFeatureFlags?.campaignJoinRequests!==true) throw new Error('Join requests are not enabled.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinRequest')({
      action:'submit',campaignId,ucn:campaignCode(codeValue),characterId:characterId || null
    })).data;
  },
  listCampaignPlayerRoster: async function(campaignId){
    if(!functionsClient || !currentUser) throw new Error('Sign in as a campaign GM.');
    if(window.AsteriaFeatureFlags?.campaignPlayerRoster!==true) throw new Error('Campaign roster is not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'roster',campaignId
    })).data;
  },
  changeCampaignMemberRole: async function(campaignId,memberUid,newRole,expectedRevision,expectedRole,expectedStatus){
    if(!functionsClient||!currentUser)throw new Error('Sign in as campaign owner.');
    if(window.AsteriaFeatureFlags?.campaignRolePermissions!==true)
      throw new Error('Role management is not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'role-change',campaignId,memberUid,newRole,expectedRevision,expectedRole,expectedStatus
    })).data;
  },
  setCampaignCoGmPermission: async function(campaignId,memberUid,capability,enabled,expectedRevision,expectedRole,expectedStatus){
    if(!functionsClient||!currentUser)throw new Error('Sign in as campaign owner.');
    if(window.AsteriaFeatureFlags?.campaignRolePermissions!==true)
      throw new Error('Role management is not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'permission-change',campaignId,memberUid,capability,enabled,
      expectedRevision,expectedRole,expectedStatus
    })).data;
  },
  listCampaignMembershipActivity: async function(campaignId){
    if(!functionsClient||!currentUser)throw new Error('Sign in as a GM.');
    if(window.AsteriaFeatureFlags?.campaignRolePermissions!==true)
      throw new Error('Activity history is not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'activity',campaignId
    })).data;
  },
  moderateCampaignMember: async function(campaignId,memberUid,action,expectedRevision,expectedStatus,reason){
    if(!functionsClient || !currentUser)throw new Error('Sign in as an authorised GM.');
    if(window.AsteriaFeatureFlags?.campaignMemberControls!==true)
      throw new Error('Member controls are not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'member-control',campaignId,memberUid,memberAction:action,
      expectedRevision,expectedStatus,reason
    })).data;
  },
  listCampaignJoinRequests: async function(campaignId){
    if(!functionsClient || !currentUser) throw new Error('Sign in as a campaign GM.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'list',campaignId
    })).data;
  },
  reviewCampaignJoinRequest: async function(campaignId,requestUid,decision,expectedRevision){
    if(!functionsClient || !currentUser) throw new Error('Sign in as a campaign GM.');
    if(window.AsteriaFeatureFlags?.campaignJoinReview!==true) throw new Error('GM review is not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'review',campaignId,requestUid,decision,expectedRevision
    })).data;
  },
  setCampaignJoinApprovalMode: async function(campaignId,mode){
    if(!functionsClient || !currentUser) throw new Error('Sign in as the campaign owner.');
    if(window.AsteriaFeatureFlags?.campaignJoinReview!==true) throw new Error('GM review is not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'mode',campaignId,mode
    })).data;
  },
  joinCampaignByUCN: async function(codeValue){
    if(!functionsClient || !currentUser) throw new Error('Sign in to join this campaign.');
    return (await httpsCallable(functionsClient,'asteriaInvite')({code:campaignCode(codeValue),join:true})).data;
  },
  requestCampaignCharacterLink: async function(campaignId,sourceCharacterId,sourceKind='owned'){
    if(!functionsClient||!currentUser)throw new Error('Sign in before requesting a character link.');
    if(window.AsteriaFeatureFlags?.campaignCharacterLinks!==true)
      throw new Error('Campaign character requests are not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'character-link-request',campaignId,sourceCharacterId,sourceKind
    })).data;
  },
  listCampaignCharacterLifecycle: async function(campaignId){
    if(!functionsClient||!currentUser)throw new Error('Sign in as a campaign GM.');
    if(window.AsteriaFeatureFlags?.campaignCharacterLifecycle!==true)
      throw new Error('Campaign character lifecycle is not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'character-lifecycle-list',campaignId
    })).data;
  },
  changeCampaignCharacterLifecycle: async function(campaignId,{linkId,sourceCharacterId,action,expectedRevision}){
    if(!functionsClient||!currentUser)throw new Error('Sign in to manage your campaign character.');
    if(window.AsteriaFeatureFlags?.campaignCharacterLifecycle!==true)
      throw new Error('Campaign character lifecycle is not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'character-lifecycle-change',campaignId,
      linkId,sourceCharacterId,lifecycleAction:action,expectedRevision
    })).data;
  },
  previewSecureCampaignInvitation: async function(campaignId,inviteId,token){
    if(!functionsClient||!currentUser)throw new Error('Sign in to review this invitation.');
    if(window.AsteriaFeatureFlags?.secureInvitationAcceptance!==true)
      throw new Error('Secure invitation acceptance is not activated.');
    return (await httpsCallable(functionsClient,'asteriaSecureInvitation')({
      action:'preview',campaignId,inviteId,token
    })).data;
  },
  acceptSecureCampaignInvitation: async function(campaignId,inviteId,token){
    if(!functionsClient||!currentUser)throw new Error('Sign in to accept an invitation.');
    if(window.AsteriaFeatureFlags?.secureInvitationAcceptance!==true)
      throw new Error('Secure invitation acceptance is not activated.');
    return (await httpsCallable(functionsClient,'asteriaSecureInvitation')({
      action:'accept',campaignId,inviteId,token
    })).data;
  },
  // Phase 1.3 — only the deployed, gated callable can search Account IDs.
  // Never query the private identity registry directly in the browser.
  findFriendByAccountId: async function(accountId){
    const uid=currentUser?.uid;
    if(!uid||!auth||auth.currentUser?.uid!==uid||ownershipReadyUid!==uid||
       !functionsClient||window.AsteriaFeatureFlags?.friendAccountLookup!==true)
      throw new Error('Player search is not active yet.');
    if(typeof accountId!=='string'||!/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/.test(accountId))
      throw new Error('Enter an exact Username#00000 Account ID.');
    const response=await httpsCallable(functionsClient,'asteriaFriendAccountLookup')({
      action:'find',accountId
    });
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid||ownershipReadyUid!==uid||
       window.AsteriaFeatureFlags?.friendAccountLookup!==true)
      throw new Error('Account changed during search. Try again.');
    const result=response.data;
    if(!result||typeof result!=='object'||Array.isArray(result)||
       (result.found!==true&&result.found!==false))
      throw new Error('Account search returned an invalid response.');
    if(result.found!==true)return {found:false};
    if(Object.keys(result).sort().join(',')!=='accountId,found,username'||
       typeof result.username!=='string'||typeof result.accountId!=='string'||
       !/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/.test(result.accountId)||
       !result.accountId.startsWith(result.username+'#'))
      throw new Error('Account search returned an invalid response.');
    return {found:true,username:result.username,accountId:result.accountId};
  },
  // Friends Phase 2.3: a separate authenticated callable; private pair and
  // identity documents are never read directly by the browser.
  manageFriendRequest: async function(action,targetAccountId,expectedVersion){
    const uid=currentUser?.uid;
    if(!uid||!auth||auth.currentUser?.uid!==uid||ownershipReadyUid!==uid||
       !functionsClient||window.AsteriaFeatureFlags?.friendRequestsEnabled!==true)
      throw new Error('Friend requests are not active yet.');
    if(!['send','accept','decline','cancel'].includes(action)||
       typeof targetAccountId!=='string'||
       !/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/.test(targetAccountId)||
       (action!=='send'&&(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)))
      throw new Error('Invalid friend request action.');
    const payload={action,targetAccountId,
      ...(action==='send'?{}:{expectedVersion})};
    const response=await httpsCallable(functionsClient,'asteriaFriendRequests')(payload);
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||window.AsteriaFeatureFlags?.friendRequestsEnabled!==true)
      throw new Error('Account changed during request.');
    const result=response.data;
    if(!result||Object.keys(result).sort().join(',')!=='expiresAtMs,ok,status,version'||
       result.ok!==true||!['pending','accepted','declined','cancelled'].includes(result.status)||
       !Number.isSafeInteger(result.version)||result.version<1||
       !(result.expiresAtMs===null||Number.isSafeInteger(result.expiresAtMs)))
      throw new Error('Friend request response invalid.');
    return {ok:true,status:result.status,version:result.version,
      expiresAtMs:result.expiresAtMs};
  },
  listFriendRequests: async function(direction,cursor=0){
    const uid=currentUser?.uid;
    if(!uid||!auth||auth.currentUser?.uid!==uid||ownershipReadyUid!==uid||
       !functionsClient||window.AsteriaFeatureFlags?.friendRequestsEnabled!==true)
      throw new Error('Friend requests are not active yet.');
    if(!['incoming','outgoing'].includes(direction)||
       !Number.isSafeInteger(cursor)||cursor<0||cursor>1000||cursor%20!==0)
      throw new Error('Invalid friend request page.');
    const response=await httpsCallable(functionsClient,'asteriaFriendRequests')({
      action:'list',direction,cursor
    });
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||window.AsteriaFeatureFlags?.friendRequestsEnabled!==true)
      throw new Error('Account changed during request.');
    const result=response.data;
    if(!result||!Array.isArray(result.items)||result.items.length>20||
       !(result.nextCursor===null||
         (Number.isSafeInteger(result.nextCursor)&&result.nextCursor>cursor&&
          result.nextCursor<=1000&&result.nextCursor%20===0)))
      throw new Error('Invalid friend request page.');
    const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
    return {items:result.items.map(item=>{
      if(!item||Object.keys(item).sort().join(',')!==
          'accountId,direction,expiresAtMs,requestedAtMs,status,username,version'||
          typeof item.username!=='string'||!HANDLE.test(item.accountId)||
          item.accountId!==item.username+'#'+item.accountId.slice(-5)||
          item.direction!==direction||item.status!=='pending'||
          !Number.isSafeInteger(item.version)||item.version<1||
          !Number.isSafeInteger(item.requestedAtMs)||
          !Number.isSafeInteger(item.expiresAtMs))
        throw new Error('Invalid friend request page.');
      return {username:item.username,accountId:item.accountId,direction,
        status:'pending',version:item.version,requestedAtMs:item.requestedAtMs,
        expiresAtMs:item.expiresAtMs};
    }),nextCursor:result.nextCursor};
  },
  // Phase 3.1: recipient-scoped accepted Friends List. No direct registry reads.
  listAcceptedFriends: async function(cursor=0){
    const uid=currentUser?.uid;
    if(!uid||!auth||auth.currentUser?.uid!==uid||ownershipReadyUid!==uid||
       !functionsClient||window.AsteriaFeatureFlags?.friendRequestsEnabled!==true)
      throw new Error('Friends List is not active yet.');
    if(!Number.isSafeInteger(cursor)||cursor<0||cursor>1000||cursor%20!==0)
      throw new Error('Invalid Friends List page.');
    const response=await httpsCallable(functionsClient,'asteriaFriendRequests')({
      action:'list-friends',cursor
    });
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||window.AsteriaFeatureFlags?.friendRequestsEnabled!==true)
      throw new Error('Account changed during Friends List.');
    const result=response.data;
    if(!result||Object.keys(result).sort().join(',')!=='items,nextCursor'||
       !Array.isArray(result.items)||result.items.length>20||
       !(result.nextCursor===null||
         (Number.isSafeInteger(result.nextCursor)&&result.nextCursor>cursor&&
          result.nextCursor<=1000&&result.nextCursor%20===0)))
      throw new Error('Invalid Friends List response.');
    const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
    return {items:result.items.map(item=>{
      if(!item||Object.keys(item).sort().join(',')!==
          'accountId,friendsSinceMs,username,version'||
          typeof item.username!=='string'||!HANDLE.test(item.accountId)||
          item.accountId!==item.username+'#'+item.accountId.slice(-5)||
          !Number.isSafeInteger(item.friendsSinceMs)||item.friendsSinceMs<0||
          !Number.isSafeInteger(item.version)||item.version<1)
        throw new Error('Invalid Friends List response.');
      return {username:item.username,accountId:item.accountId,
        friendsSinceMs:item.friendsSinceMs,version:item.version};
    }),nextCursor:result.nextCursor};
  },
  // Friends Phase 5.1: private, read-only owner campaign recipient selection.
  // No recipient UID or email is returned, cached, or accepted from browser code.
  selectCampaignFriendRecipients: async function(campaignId,{action,cursor=0,accountId}={}){
    const uid=currentUser?.uid;
    if(!uid||!auth||auth.currentUser?.uid!==uid||ownershipReadyUid!==uid||
       !functionsClient||window.AsteriaFeatureFlags?.campaignFriendRecipients!==true)
      throw new Error('Campaign friend selection is not active.');
    if(typeof campaignId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(campaignId)||
       !['list','resolve'].includes(action))
      throw new Error('Invalid campaign recipient selection.');
    const payload=action==='list'?
      {action,campaignId,cursor}:
      {action,campaignId,accountId};
    if(action==='list'&&(!Number.isSafeInteger(cursor)||cursor<0||
        cursor>1000||cursor%20!==0)||
       action==='resolve'&&
        (typeof accountId!=='string'||!/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/.test(accountId)))
      throw new Error('Invalid campaign recipient selection.');
    const response=await httpsCallable(functionsClient,'asteriaCampaignFriendRecipients')(payload);
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||
       window.AsteriaFeatureFlags?.campaignFriendRecipients!==true)
      throw new Error('Account changed during campaign recipient selection.');
    const result=response.data;
    const candidate=item=>item&&typeof item==='object'&&!Array.isArray(item)&&
      Object.keys(item).sort().join(',')==='accountId,username'&&
      typeof item.username==='string'&&
      typeof item.accountId==='string'&&
      /^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/.test(item.accountId)&&
      item.accountId===item.username+'#'+item.accountId.slice(-5);
    if(!result||typeof result!=='object'||Array.isArray(result))
      throw new Error('Invalid campaign recipient selection response.');
    if(action==='list'){
      if(Object.keys(result).sort().join(',')!=='items,nextCursor'||
         !Array.isArray(result.items)||result.items.length>20||
         !result.items.every(candidate)||
         !(result.nextCursor===null||
           Number.isSafeInteger(result.nextCursor)&&result.nextCursor>cursor&&
           result.nextCursor<=1000&&result.nextCursor%20===0))
        throw new Error('Invalid campaign recipient selection response.');
      return {items:result.items.map(item=>({username:item.username,accountId:item.accountId})),
        nextCursor:result.nextCursor};
    }
    if(result.available===false&&Object.keys(result).join(',')==='available')
      return {available:false};
    if(result.available!==true||
       Object.keys(result).sort().join(',')!=='available,recipient'||
       !candidate(result.recipient))
      throw new Error('Invalid campaign recipient selection response.');
    return {available:true,recipient:{username:result.recipient.username,
      accountId:result.recipient.accountId}};
  },
  // Friends Phase 5.2: owner-only single-use recipient-bound secure invite.
  // Never accept target UID/email from the UI and never persist bearer token.
  issueCampaignFriendInvitation: async function(campaignId,accountId,requestId,expiresInHours){
    const uid=currentUser?.uid;
    if(!uid||!auth||auth.currentUser?.uid!==uid||ownershipReadyUid!==uid||
       !functionsClient||window.AsteriaFeatureFlags?.campaignFriendInvitations!==true||
       window.AsteriaFeatureFlags?.campaignFriendRecipients!==true||
       window.AsteriaFeatureFlags?.secureInvitationManager!==true)
      throw new Error('Campaign friend invitations are not active.');
    if(typeof campaignId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(campaignId)||
       typeof accountId!=='string'||!/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/.test(accountId)||
       typeof requestId!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(requestId)||
       ![24,72,168,336,720].includes(expiresInHours))
      throw new Error('Invalid campaign friend invitation.');
    const response=await httpsCallable(functionsClient,'asteriaSecureInvitation')({
      action:'issue-friend',campaignId,accountId,requestId,expiresInHours
    });
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||
       window.AsteriaFeatureFlags?.campaignFriendInvitations!==true||
       window.AsteriaFeatureFlags?.campaignFriendRecipients!==true||
       window.AsteriaFeatureFlags?.secureInvitationManager!==true)
      throw new Error('Account changed during invitation creation.');
    const invite=response.data;
    if(!invite||typeof invite!=='object'||Array.isArray(invite)||
       invite.campaignId!==campaignId||typeof invite.inviteId!=='string'||
       !/^[a-f0-9]{64}$/.test(invite.inviteId)||
       invite.roleOffered!=='player'||invite.type!=='share-link'||
       invite.requiresGMApproval!==true||invite.maxUses!==1||
       ![0,1].includes(invite.usedCount)||
       typeof invite.alreadyIssued!=='boolean'||
       !(invite.alreadyIssued===true&&invite.token===null||
         invite.alreadyIssued===false&&typeof invite.token==='string'&&
         /^[A-Za-z0-9_-]{43}$/.test(invite.token)))
      throw new Error('Invalid campaign friend invitation response.');
    return {campaignId,inviteId:invite.inviteId,
      token:invite.token,alreadyIssued:invite.alreadyIssued,
      requiresGMApproval:true};
  },
  // Phase 3.2: relationship management has independent version checking.
  manageFriendRelationship: async function(action,targetAccountId,expectedVersion){
    const uid=currentUser?.uid;
    if(!uid||!auth||auth.currentUser?.uid!==uid||ownershipReadyUid!==uid||
       !functionsClient||window.AsteriaFeatureFlags?.friendRequestsEnabled!==true)
      throw new Error('Friends management unavailable.');
    if(!['remove','block','unblock'].includes(action)||
       typeof targetAccountId!=='string'||
       !/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/.test(targetAccountId)||
       !(action==='block'&&expectedVersion===undefined)&&
       (!Number.isSafeInteger(expectedVersion)||expectedVersion<1))
      throw new Error('Invalid friendship management action.');
    const response=await httpsCallable(functionsClient,'asteriaFriendRequests')({
      action,targetAccountId,
      ...(expectedVersion===undefined?{}:{expectedVersion})
    });
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||window.AsteriaFeatureFlags?.friendRequestsEnabled!==true)
      throw new Error('Account changed during friendship management.');
    const result=response.data;
    if(!result||Object.keys(result).sort().join(',')!=='expiresAtMs,ok,status,version'||
       result.ok!==true||!['removed','blocked'].includes(result.status)||
       !Number.isSafeInteger(result.version)||result.version<1||
       result.expiresAtMs!==null)
      throw new Error('Invalid friendship management response.');
    return {ok:true,status:result.status,version:result.version};
  },
  listBlockedFriends: async function(cursor=0){
    const uid=currentUser?.uid;
    if(!uid||!auth||auth.currentUser?.uid!==uid||ownershipReadyUid!==uid||
       !functionsClient||window.AsteriaFeatureFlags?.friendRequestsEnabled!==true)
      throw new Error('Blocked accounts unavailable.');
    if(!Number.isSafeInteger(cursor)||cursor<0||cursor>1000||cursor%20!==0)
      throw new Error('Invalid blocked accounts page.');
    const response=await httpsCallable(functionsClient,'asteriaFriendRequests')({
      action:'list-blocked',cursor
    });
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||window.AsteriaFeatureFlags?.friendRequestsEnabled!==true)
      throw new Error('Account changed during blocked accounts listing.');
    const result=response.data;
    if(!result||Object.keys(result).sort().join(',')!=='items,nextCursor'||
       !Array.isArray(result.items)||result.items.length>20||
       !(result.nextCursor===null||
         (Number.isSafeInteger(result.nextCursor)&&result.nextCursor>cursor&&
          result.nextCursor<=1000&&result.nextCursor%20===0)))
      throw new Error('Invalid blocked accounts response.');
    const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
    return {items:result.items.map(item=>{
      if(!item||Object.keys(item).sort().join(',')!==
          'accountId,blockedAtMs,username,version'||
          typeof item.username!=='string'||!HANDLE.test(item.accountId)||
          item.accountId!==item.username+'#'+item.accountId.slice(-5)||
          !Number.isSafeInteger(item.blockedAtMs)||item.blockedAtMs<0||
          !Number.isSafeInteger(item.version)||item.version<1)
        throw new Error('Invalid blocked accounts response.');
      return {username:item.username,accountId:item.accountId,
        blockedAtMs:item.blockedAtMs,version:item.version};
    }),nextCursor:result.nextCursor};
  },
  // Phase 4.2: the independent, recipient-private Friends notifications callable.
  // No Firestore browser reads, caller-provided UID, or account-local cache.
  listFriendNotifications: async function(cursor=null){
    const uid=currentUser?.uid;
    if(!functionsClient||!auth||!uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||
       window.AsteriaFeatureFlags?.friendNotificationsEnabled!==true)
      throw new Error('Friend notifications are not active.');
    if(cursor!==null&&(typeof cursor!=='string'||!/^[a-f0-9]{64}$/.test(cursor)))
      throw new Error('Invalid friend notification page.');
    const response=await httpsCallable(functionsClient,'asteriaFriendNotifications')({
      action:'list',cursor
    });
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||
       window.AsteriaFeatureFlags?.friendNotificationsEnabled!==true)
      throw new Error('Account changed during friend notifications.');
    const result=response.data;
    if(!result||typeof result!=='object'||Array.isArray(result)||
       Object.keys(result).sort().join(',')!=='nextCursor,notifications,unreadShown'||
       !Array.isArray(result.notifications)||result.notifications.length>25||
       !Number.isSafeInteger(result.unreadShown)||
       result.unreadShown<0||result.unreadShown>result.notifications.length||
       !(result.nextCursor===null||
         (typeof result.nextCursor==='string'&&/^[a-f0-9]{64}$/.test(result.nextCursor))))
      throw new Error('Invalid friend notification response.');
    const allowed=new Set(['incoming-request','request-accepted','request-declined',
      'request-cancelled','friend-removed','player-blocked','player-unblocked']);
    const seen=new Set();
    const notifications=result.notifications.map(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item)||
         Object.keys(item).sort().join(',')!==
           'body,createdAt,kind,notificationId,readAt,title'||
         typeof item.notificationId!=='string'||
         !/^[a-f0-9]{64}$/.test(item.notificationId)||
         seen.has(item.notificationId)||!allowed.has(item.kind)||
         typeof item.title!=='string'||item.title.length>150||
         typeof item.body!=='string'||item.body.length>500||
         typeof item.createdAt!=='string'||
         !Number.isFinite(Date.parse(item.createdAt))||
         !(item.readAt===null||
           (typeof item.readAt==='string'&&Number.isFinite(Date.parse(item.readAt)))))
        throw new Error('Invalid friend notification response.');
      seen.add(item.notificationId);
      return {notificationId:item.notificationId,kind:item.kind,
        title:item.title,body:item.body,createdAt:item.createdAt,readAt:item.readAt};
    });
    if(notifications.filter(item=>item.readAt===null).length!==result.unreadShown)
      throw new Error('Invalid friend notification response.');
    return {notifications,unreadShown:result.unreadShown,nextCursor:result.nextCursor};
  },
  markFriendNotificationRead: async function(notificationId){
    const uid=currentUser?.uid;
    if(!functionsClient||!auth||!uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||
       window.AsteriaFeatureFlags?.friendNotificationsEnabled!==true)
      throw new Error('Friend notifications are not active.');
    if(typeof notificationId!=='string'||!/^[a-f0-9]{64}$/.test(notificationId))
      throw new Error('Invalid friend notification.');
    const response=await httpsCallable(functionsClient,'asteriaFriendNotifications')({
      action:'mark-read',notificationId
    });
    if(currentUser?.uid!==uid||auth.currentUser?.uid!==uid||
       ownershipReadyUid!==uid||
       window.AsteriaFeatureFlags?.friendNotificationsEnabled!==true)
      throw new Error('Account changed during friend notification update.');
    const item=response.data;
    if(!item||typeof item!=='object'||Array.isArray(item)||
       Object.keys(item).sort().join(',')!=='alreadyRead,notificationId,readAt'||
       item.notificationId!==notificationId||
       typeof item.alreadyRead!=='boolean'||
       typeof item.readAt!=='string'||!Number.isFinite(Date.parse(item.readAt)))
      throw new Error('Invalid friend notification acknowledgement.');
    return {notificationId:item.notificationId,readAt:item.readAt,
      alreadyRead:item.alreadyRead};
  },
  listCampaignNotifications: async function(cursor=null){
    if(!functionsClient||!currentUser||ownershipReadyUid!==currentUser.uid)
      throw new Error('Sign in to view notifications.');
    if(window.AsteriaFeatureFlags?.campaignNotifications!==true)
      throw new Error('Campaign notifications are not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignNotifications')({
      action:'list',cursor
    })).data;
  },
  markCampaignNotificationRead: async function(notificationId){
    if(!functionsClient||!currentUser||ownershipReadyUid!==currentUser.uid)
      throw new Error('Sign in to manage notifications.');
    if(window.AsteriaFeatureFlags?.campaignNotifications!==true)
      throw new Error('Campaign notifications are not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignNotifications')({
      action:'mark-read',notificationId
    })).data;
  },
  // Recipient-bound invitations are delivered exclusively through the
  // private Asteria notification inbox; no email provider is involved.
  previewCampaignNotificationInvitation: async function(campaignId,inviteId){
    if(!functionsClient||!currentUser||ownershipReadyUid!==currentUser.uid)
      throw new Error('Sign in to view your campaign invitation.');
    if(window.AsteriaFeatureFlags?.campaignNotifications!==true||
       window.AsteriaFeatureFlags?.secureInvitationAcceptance!==true||
       window.AsteriaFeatureFlags?.campaignFriendInvitations!==true)
      throw new Error('In-app campaign invitations are not available.');
    return (await httpsCallable(functionsClient,'asteriaSecureInvitation')({
      action:'preview-notification',campaignId,inviteId
    })).data;
  },
  acceptCampaignNotificationInvitation: async function(campaignId,inviteId){
    if(!functionsClient||!currentUser||ownershipReadyUid!==currentUser.uid)
      throw new Error('Sign in to accept your campaign invitation.');
    if(window.AsteriaFeatureFlags?.campaignNotifications!==true||
       window.AsteriaFeatureFlags?.secureInvitationAcceptance!==true||
       window.AsteriaFeatureFlags?.campaignFriendInvitations!==true)
      throw new Error('In-app campaign invitations are not available.');
    return (await httpsCallable(functionsClient,'asteriaSecureInvitation')({
      action:'accept-notification',campaignId,inviteId
    })).data;
  },
  issueSecureCampaignInvitation: async function(request){
    if(!functionsClient||!currentUser)
      throw new Error('Sign in as the campaign owner.');
    if(window.AsteriaFeatureFlags?.secureInvitationManager!==true)
      throw new Error('Secure Invitation Manager is not activated.');
    return (await httpsCallable(functionsClient,'asteriaSecureInvitation')({
      action:'issue',...request,requiresGMApproval:true
    })).data;
  },
  listSecureCampaignInvitations: async function(campaignId,cursor=null){
    if(!functionsClient||!currentUser)
      throw new Error('Sign in as the campaign owner.');
    if(window.AsteriaFeatureFlags?.secureInvitationManager!==true)
      throw new Error('Secure Invitation Manager is not activated.');
    return (await httpsCallable(functionsClient,'asteriaSecureInvitation')({
      action:'list',campaignId,cursor
    })).data;
  },
  changeSecureCampaignInvitation: async function(campaignId,inviteId,managementAction,expectedRevision){
    if(!functionsClient||!currentUser)
      throw new Error('Sign in as the campaign owner.');
    if(window.AsteriaFeatureFlags?.secureInvitationManager!==true)
      throw new Error('Secure Invitation Manager is not activated.');
    return (await httpsCallable(functionsClient,'asteriaSecureInvitation')({
      action:'change',campaignId,inviteId,managementAction,expectedRevision
    })).data;
  },
  listPendingCampaignCharacterLinks: async function(campaignId){
    if(!functionsClient||!currentUser)throw new Error('Sign in as a campaign GM.');
    if(window.AsteriaFeatureFlags?.campaignCharacterApproval!==true)
      throw new Error('Character link approval is not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'character-link-list',campaignId
    })).data;
  },
  reviewCampaignCharacterLink: async function(campaignId,linkId,decision,expectedRevision){
    if(!functionsClient||!currentUser)throw new Error('Sign in as a campaign GM.');
    if(window.AsteriaFeatureFlags?.campaignCharacterApproval!==true)
      throw new Error('Character link approval is not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'character-link-review',campaignId,linkId,decision,expectedRevision
    })).data;
  },
  getCampaignCharacterLinkStatus: async function(campaignId,sourceCharacterId){
    if(!functionsClient||!currentUser)throw new Error('Sign in before viewing a character link.');
    if(window.AsteriaFeatureFlags?.campaignCharacterLinks!==true)
      throw new Error('Campaign character requests are not activated.');
    return (await httpsCallable(functionsClient,'asteriaCampaignJoinReview')({
      action:'character-link-status',campaignId,sourceCharacterId
    })).data;
  },
  linkCharacterToCampaign: async function(campaignId, character){
    if(!db || !currentUser || !campaignId || !character?.id) return null;
    const characterId = String(character.id);
    const linked = await upsertSharedCampaignCharacter(campaignId, characterId, character);
    if(!linked) return null;
    return linked.campaign;
  },
  loadCampaigns: async function(){
    if(!db || !currentUser) return [];
    try{
      const uid = currentUser.uid;
      const accountCampaigns = new Map();
      const sharedCampaigns = new Map();
      const accountSnap = await getDocs(collection(db, 'users', uid, 'campaigns'));
      accountSnap.forEach(item=>{
        accountCampaigns.set(item.id, Object.assign({}, item.data(), { id:item.id }));
      });
      const membershipResults = await Promise.allSettled(
        campaignMembershipQueries(uid).map(campaignQuery=>getDocs(campaignQuery))
      );
      membershipResults.forEach(result=>{
        if(result.status === 'rejected'){
          // Legacy array queries may be denied once v2 campaigns use canonical
          // membership; the verified per-account projection remains available.
          if(String(result.reason?.code || '').includes('permission-denied')) return;
          reportSyncError('campaign-membership-query', result.reason, { uid });
          throw result.reason;
        }
        result.value.forEach(item=>{
          sharedCampaigns.set(item.id, Object.assign({}, item.data(), { id:item.id }));
        });
      });
      let verifiedProjections=[];
      try {
        const projections=await getDocs(collection(db,'campaignMemberProjections',uid,'campaigns'));
        verifiedProjections=projections.docs.filter(row=>row.data()?.status==='active').map(row=>row.id);
      } catch(error) {
        if(!String(error?.code || '').includes('permission-denied')) reportSyncError('campaign-projections',error,{uid});
      }
      const campaignIds = new Set([
        ...verifiedProjections,
        ...accountCampaigns.keys(),
        ...sharedCampaigns.keys(),
        ...linkedCampaignIdsFromOwnedCharacters(uid)
      ]);
      const campaigns = [];
      for(const id of campaignIds){
        const campaign=await loadSharedCampaignDetails(
          id,
          accountCampaigns.get(id) || {},
          sharedCampaigns.get(id) || null
        );
        if(campaign) campaigns.push(campaign);
      }
      return campaigns;
    }catch(err){
      reportSyncError('campaign-load', err, { uid:currentUser?.uid || '' });
      throw err;
    }
  },
  subscribeAccountCampaigns: function(onChange){
    if(!db || !currentUser || typeof onChange !== 'function') return ()=>{};
    const uid = currentUser.uid;
    const sources = new Map();
    const linked = new Map(), linkSubscriptions = new Map();
    let active=true;
    const emit = ()=>{
      if(!active || currentUser?.uid!==uid) return;
      const account = sources.get('account') || new Map();
      const shared = new Map(linked);
      ['owner','gm','player'].forEach(key=>{
        (sources.get(key) || new Map()).forEach((campaign,id)=>{
          shared.set(id, Object.assign({}, shared.get(id) || {}, campaign));
        });
      });
      onChange(Array.from(shared.keys()).map(id=>mergeSharedCampaign(
        account.get(id) || { id },
        shared.get(id)
      )));
    };
    const watchLinkedCampaigns=()=>{
      const projections=sources.get('projections') || new Map();
      const candidates=new Set([
        ...[...projections].filter(([,item])=>item.status==='active').map(([id])=>id),
        ...(sources.get('account') || new Map()).keys(),
        ...linkedCampaignIdsFromOwnedCharacters(uid)
      ]);
      linkSubscriptions.forEach((unsubscribe,id)=>{
        if(candidates.has(id)) return;
        unsubscribe();linkSubscriptions.delete(id);linked.delete(id);
      });
      candidates.forEach(id=>{
        if(linkSubscriptions.has(id)) return;
        const unsubscribe=onSnapshot(doc(db,'campaigns',id),{includeMetadataChanges:true},snapshot=>{
          if(!active || currentUser?.uid!==uid || snapshot.metadata?.fromCache) return;
          if(snapshot.exists()) linked.set(id,Object.assign({},snapshot.data(),{id}));
          else linked.delete(id);
          emit();
        },error=>{
          if(!active || currentUser?.uid!==uid) return;
          linked.delete(id);emit();
          if(!String(error?.code || '').includes('permission-denied')) reportSyncError('campaign-discovery-link',error,{uid,campaignId:id});
        });
        linkSubscriptions.set(id,unsubscribe);
      });
    };
    const watch = (key, reference)=>{
      return onSnapshot(reference, {includeMetadataChanges:true}, snapshot=>{
        if(!active || currentUser?.uid!==uid || (key!=='account' && snapshot.metadata?.fromCache)) return;
        const records = new Map();
        snapshot.forEach(item=>{
          records.set(item.id, Object.assign({}, item.data(), { id:item.id }));
        });
        sources.set(key, records);
        if(key==='account' || key==='projections') watchLinkedCampaigns();
        emit();
      }, error=>{
        if(!active || currentUser?.uid!==uid) return;
        sources.delete(key);emit();
        if(key==='projections' && String(error?.code || '').includes('permission-denied')) return;
        reportSyncError('campaign-membership-listener', error, { uid, source:key });
      });
    };
    const unsubscribers = [
      watch('account', collection(db, 'users', uid, 'campaigns')),
      watch('projections', collection(db,'campaignMemberProjections',uid,'campaigns')),
      ...campaignMembershipQueries(uid).map((campaignQuery,index)=>watch(['owner','gm','player'][index], campaignQuery))
    ];
    watchLinkedCampaigns();
    return ()=>{
      active=false;
      [...unsubscribers,...linkSubscriptions.values()].forEach(unsubscribe=>{try{unsubscribe?.();}catch(error){}});
    };
  },
  subscribeCampaign: function(campaignId, onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(
      doc(db, 'campaigns', campaignId),
      {includeMetadataChanges:true},
      snapshot=>{
        onChange(snapshot.exists() ? Object.assign({}, snapshot.data(), { id:snapshot.id }) : null,snapshot.metadata);
      },
      err=>reportSyncError('campaign-listener', err, { campaignId })
    );
  },
  saveCampaignItemEcosystem: async function(campaignId, ecosystem){
    // Live campaign economy, shops, trades and rewards are server-owned.
    // Keep a fail-closed legacy API so old scripts cannot overwrite canonical state.
    if(window.AsteriaReactMigration?.available || window.AsteriaReactMigration?.liveStateAuthority==='react')return false;
    if(!db || !currentUser || !campaignId || !ecosystem) return false;
    try{
      const clean = cleanData(ecosystem);
      await setDoc(
        doc(db, 'campaigns', campaignId, 'systems', 'itemEcosystem'),
        Object.assign({}, clean, {
          version:clean.version || 'asteria-item-ecosystem-v1',
          updatedBy:currentUser.uid,
          updatedAt:serverTimestamp()
        })
      );
      return true;
    }catch(err){
      console.warn(`Could not save the shared item ecosystem for campaign ${campaignId}.`, err);
      return false;
    }
  },
  loadCampaignItemEcosystem: async function(campaignId){
    if(!db || !currentUser || !campaignId) return null;
    try{
      const snapshot = await getDoc(doc(db, 'campaigns', campaignId, 'systems', 'itemEcosystem'));
      return snapshot.exists() ? snapshot.data() : null;
    }catch(err){
      console.warn(`Could not load the shared item ecosystem for campaign ${campaignId}.`, err);
      return null;
    }
  },
  subscribeCampaignItemEcosystem: function(campaignId, onChange, mode='character'){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    const uid=currentUser.uid;
    const gmMode=mode==='gm';
    const state={public:null,legacy:null,shops:null,from:[],to:[],all:[]};
    const notify=()=>{
      const legacy=gmMode?state.legacy||{}:{};
      const shared=state.public || (gmMode?legacy:{});
      const seen=new Map();
      for(const row of [
        ...(gmMode?state.all:[...state.from,...state.to]),
        ...(gmMode?Array.isArray(legacy.playerItemRequests)?legacy.playerItemRequests:[]:[]),
        ...(gmMode?Array.isArray(legacy.directTrades)?legacy.directTrades:[]:[])
      ]) if(row?.id&&!seen.has(String(row.id))) seen.set(String(row.id),row);
      // During migration retain legacy shop rows unless superseded by a
      // canonical document. Tombstones hide deleted shops even on old clients.
      const shops=new Map();
      for(const row of Array.isArray(shared.shops)?shared.shops:[])
        if(row?.id)shops.set(String(row.id),row);
      for(const row of Array.isArray(state.shops)?state.shops:[])
        if(row?.id)shops.set(String(row.id),row);
      onChange({...shared,
        shops:[...shops.values()].filter(row=>!row.deleted&&row.status!=='deleted'),
        partyLoot:shared.partyLoot||[],sharedStorages:shared.sharedStorages||[],
        playerItemRequests:[...seen.values()],directTrades:[]});
    };
    const watch=(key,source)=>{
      return onSnapshot(source,snapshot=>{
        state[key]=key==='public'||key==='legacy'?(snapshot.exists()?snapshot.data():null):
          snapshot.docs.map(record=>({id:record.id,...record.data()}));
        notify();
      },err=>reportSyncError('item-ecosystem-listener',err,{campaignId}));
    };
    const requests=collection(db,'campaigns',campaignId,'itemRequests');
    const subscriptions=[
      watch('public',doc(db,'campaigns',campaignId,'systems','itemPublic')),
      watch('shops',collection(db,'campaigns',campaignId,'shops')),
      ...(gmMode?[
        watch('legacy',doc(db,'campaigns',campaignId,'systems','itemEcosystem')),
        watch('all',requests)
      ]:[
        watch('from',query(requests,where('fromOwnerUid','==',uid))),
        watch('to',query(requests,where('toOwnerUid','==',uid)))
      ])
    ];
    return ()=>subscriptions.forEach(unsubscribe=>unsubscribe?.());
  },
  managePartyStash: (...args) => callTrustedAction('managePartyStash',args),
  manageLootTable: (...args) => callTrustedAction('manageLootTable',args),
  manageRandomTable: (...args) => callTrustedAction('manageRandomTable',args),
  manageEncounterReward: (...args) => callTrustedAction('manageEncounterReward',args),
  manageAsteriaCalendar: (...args) => callTrustedAction('manageAsteriaCalendar',args),
  subscribeAsteriaCalendar: function(campaignId,onChange,mode='player'){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const name=mode==='gm'?'calendarState':'calendarPublic';
    return onSnapshot(doc(db,'campaigns',campaignId,name,'current'),
      snapshot=>onChange(snapshot.exists()?snapshot.data():null),
      error=>reportSyncError('asteria-calendar',error,{campaignId}));
  },
  subscribeAsteriaCalendarEntries: function(campaignId,onChange,mode='player'){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const name=mode==='gm'?'calendarEntries':'calendarSharedEntries';
    return onSnapshot(collection(db,'campaigns',campaignId,name),
      snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('asteria-calendar-entries',error,{campaignId}));
  },
  subscribeEncounterPlans: function(campaignId,onChange){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const q=query(collection(db,'campaigns',campaignId,'encounterPlans'),orderBy('createdAt','desc'),limit(30));
    return onSnapshot(q,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('encounter-plans',error,{campaignId}));
  },
  subscribeRandomTables: function(campaignId,onChange){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    return onSnapshot(collection(db,'campaigns',campaignId,'randomTables'),
      snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('random-tables',error,{campaignId}));
  },
  subscribeRandomTableHistory: function(campaignId,onChange){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const q=query(collection(db,'campaigns',campaignId,'randomTableRolls'),orderBy('createdAt','desc'),limit(80));
    return onSnapshot(q,snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('random-table-history',error,{campaignId}));
  },
  subscribeLootTables: function(campaignId,onChange){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    return onSnapshot(collection(db,'campaigns',campaignId,'lootTables'),
      snapshot=>onChange(snapshot.docs.map(row=>({id:row.id,...row.data()}))),
      error=>reportSyncError('loot-tables',error,{campaignId}));
  },
  managePartyLootDrop: (...args) => callTrustedAction('managePartyLootDrop',args),
  claimPartyLoot: (...args) => callTrustedAction('claimPartyLoot',args),
  votePartyLoot: (...args) => callTrustedAction('votePartyLoot',args),
  movePartyStashItem: (...args) => callTrustedAction('movePartyStashItem',args),
  splitPartyLootCurrency: (...args) => callTrustedAction('splitPartyLootCurrency',args),
  subscribePartyLoot: function(campaignId,onChange,mode='character'){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    const state={stashes:[],loot:[],drafts:[]},watchers=[];
    const publish=()=>onChange({...state});
    const watch=(key,collectionName)=>watchers.push(onSnapshot(
      collection(db,'campaigns',campaignId,collectionName),
      snapshot=>{state[key]=snapshot.docs.map(row=>({id:row.id,...row.data()}));publish();},
      error=>reportSyncError('party-loot-'+key,error,{campaignId})
    ));
    watch('stashes','partyStashes');
    watch('loot','partyLoot');
    if(mode==='gm')watch('drafts','partyLootDrafts');
    return ()=>watchers.forEach(stop=>stop?.());
  },
  subscribeGMRewardBundles: function(campaignId,onChange){
    if(!db||!currentUser||!campaignId||typeof onChange!=='function')return ()=>{};
    return onSnapshot(collection(db,'campaigns',campaignId,'rewardBundles'),snapshot=>{
      onChange(snapshot.docs.map(row=>({id:row.id,...row.data()})).filter(row=>!row.deleted));
    },error=>reportSyncError('gm-reward-bundle-listener',error,{campaignId}));
  },
  subscribeCustomItems: function(onChange){
    if(!db || !currentUser || typeof onChange!=='function') return ()=>{};
    return onSnapshot(collection(db,'customItems'),snapshot=>{
      const rows=[];
      snapshot.forEach(item=>rows.push(normalizeMarketPricing(Object.assign({id:item.id},item.data()),{legacy:true,removeLegacy:true,migratedRecord:true})));
      rows.sort((left,right)=>String(left.name||'').localeCompare(String(right.name||'')));
      window.ASTERIA_CUSTOM_ITEMS=rows;
      onChange(rows);
      window.dispatchEvent(new CustomEvent('asteria:custom-items-updated',{detail:{items:rows}}));
    },error=>reportSyncError('custom-item-listener',error,{}));
  },
  createCustomItem: async function(campaignId,item={}){
    if(!db || !currentUser) return {ok:false};
    const name=String(item.name||item.title||'').trim().slice(0,160);
    if(!name) return {ok:false,error:'Enter an item name.'};
    try{
      if(campaignId){
        const sessionSnapshot=await getDoc(doc(db,'campaigns',campaignId,'liveSession','current'));
        if(!sessionSnapshot.exists()||!liveSessionState(sessionSnapshot.data()).editable) throw new Error('Custom items can be created during an active session.');
      }
      const id=`custom-${liveSlug(name)||'item'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
      const priced=createAsteriaItem(item);
      const record=Object.assign({},structuredCloneSafe(priced),{
        id,slug:id,name,title:name,type:String(item.type||'Item'),itemClass:String(item.itemClass||item.rarity||'Common'),rarity:String(item.itemClass||item.rarity||'Common'),description:String(item.description||'').slice(0,10000),custom:true,visibility:'public',createdBy:currentUser.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      await setDoc(doc(db,'customItems',id),record);
      return {ok:true,item:Object.assign({},record,{createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  subscribeOwnedCharacter: function(characterId, onChange, onError){
    if(!db || !currentUser || !characterId) return ()=>{};
    const uid=currentUser.uid;
    let active=true,version=0;
    const unsubscribe=onSnapshot(doc(db,'users',uid,'characters',characterId),{includeMetadataChanges:true},async snapshot=>{
      const revision=++version;
      try {
        const record=snapshot.exists()?Object.assign({},snapshot.data(),{id:snapshot.id}):null;
        const valid=record && await validateOwnedRecord(record,uid,async (campaignId,id)=>{
          const linked=await getDoc(doc(db,'campaigns',campaignId,'characters',id));
          return linked.exists()?Object.assign({id:linked.id},linked.data()):null;
        });
        if(active && revision===version && currentUser?.uid===uid) onChange(valid?record:null,snapshot.metadata);
      } catch(error) { if(active && revision===version) onError?.(error); }
    },error=>{if(active)onError?.(error);});
    return()=>{active=false;unsubscribe();};
  },
  subscribeCampaignCharacters: function(campaignId, onChange){
    let previous={};
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(
      collection(db, 'campaigns', campaignId, 'characters'),
      {includeMetadataChanges:true},
      snapshot=>{
        const characters={};
        snapshot.forEach(characterDoc=>{
          const next=Object.assign({},characterDoc.data(),{id:characterDoc.id});
          characters[characterDoc.id]=JSON.stringify(previous[characterDoc.id])===JSON.stringify(next)?previous[characterDoc.id]:next;
        });
        previous=characters;
        onChange(characters,snapshot.metadata);
      },
      err=>reportSyncError('campaign-characters-listener', err, { campaignId })
    );
  },
  subscribeCampaignProgression: function(campaignId, onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(
      doc(db, 'campaigns', campaignId, 'systems', 'progression'),
      snapshot=>onChange(snapshot.exists() ? snapshot.data() : { characters:{} }),
      err=>console.warn(`Could not watch campaign progression for ${campaignId}.`, err)
    );
  },
  saveOwnedCharacterProgress: async function(characterId, character){
    if(!db || !currentUser || !characterId || !character) return false;
    if(character.ownerUid !== currentUser.uid) return false;
    return firebasePublicApi.saveOwnedCharacterSnapshot(characterId, character);
  },
  saveOwnedCharacterSnapshot: async function(characterId, character){
    if(!db || !currentUser || !characterId || !character) return false;
    if(character.ownerUid !== currentUser.uid) return false;
    try{
      const uid = currentUser.uid, campaignId = character.sharedCampaignId || character.campaignId;
      if(!campaignId) return true;
      const sharedId = character.campaignCharacterIds?.[campaignId] || character.id || characterId;
      await runTransaction(db, async transaction => {
        const privateRef = doc(db, 'users', uid, 'characters', characterId);
        const [privateSnapshot, sharedSnapshot] = await Promise.all([
          transaction.get(privateRef),
          transaction.get(doc(db, 'campaigns', campaignId, 'characters', sharedId))
        ]);
        if(!privateSnapshot.exists() || !sharedSnapshot.exists()) return;
        const patch = ownedGameplayMirrorPatch(privateSnapshot.data(), {id:sharedId, ...sharedSnapshot.data()}, uid, characterId);
        if(Object.keys(patch).length) transaction.update(privateRef, {...patch, updatedAt:serverTimestamp()});
      });
      return true;
    }catch(error){
      reportSyncError('owned-character-receive', error, { characterId });
      return false;
    }
  },
  saveCampaignCharacterProgress: async function(campaignId, characterId, character){
    if(!db || !currentUser || !campaignId || !characterId || !character) return false;
    if(window.AsteriaReactMigration?.isDashboardActive?.() || window.AsteriaReactMigration?.liveStateAuthority === 'react') return true;
    try{
      const ownerUid=campaignCharacterOwner(campaignId, characterId, character);
      if(!ownerUid){
        reportSyncError(
          'campaign-character-owner',
          new Error('The linked character owner could not be resolved.'),
          { campaignId, characterId }
        );
        return false;
      }
      const progressionPayload={
        id:characterId,
        sourceCharacterId:character.sourceCharacterId || characterId,
        ownerUid,
        sharedCampaignId:campaignId,
        status:'linked',
        level:Number(character.level || 0),
        xp:Number(character.xp || 0),
        xpMax:Number(character.xpMax || 1000),
        cp:Number(character.cp || 0),
        tp:Number(character.tp || 0),
        pendingSkillChoices:Number(character.pendingSkillChoices || 0),
        dashboardNotifications:cleanData(character.dashboardNotifications || []),
        progressionSync:cleanData(character.progressionSync || {}),
        hp:cleanData(Array.isArray(character.hp) ? character.hp : [10,10]),
        sp:cleanData(Array.isArray(character.sp) ? character.sp : [10,10]),
        mp:cleanData(Array.isArray(character.mp) ? character.mp : [10,10]),
        bp:cleanData(Array.isArray(character.bp) ? character.bp : null),
        updatedAt:serverTimestamp()
      };
      const reference=doc(db,'campaigns',campaignId,'characters',characterId);
      await runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(reference);
        if(!snapshot.exists()||snapshot.data().status!=='linked')
          throw new Error('This character is no longer active in the campaign.');
        if(incomingSnapshotIsStale(snapshot.data(),character))
          throw new Error('A newer live character update already exists. Refresh before saving progression.');
        transaction.update(reference,progressionPayload);
      });
      return true;
    }catch(err){
      reportSyncError('campaign-character-progress-write', err, { campaignId, characterId });
      return false;
    }
  },
  saveCampaignProgression: async function(campaignId, characterId, character){
    return this.saveCampaignCharacterProgress(campaignId, characterId, character);
  },
  resolveCampaignItemReward: async function(campaignId, characterId, rewardId, character){
    if(!db || !currentUser || !campaignId || !characterId || !rewardId || !character){
      return { ok:false, applied:false, character:null };
    }
    try{
      const submitted=(Array.isArray(character.pendingItemRewards)?character.pendingItemRewards:[]).find(reward=>String(reward?.id||'')===String(rewardId));
      if(!submitted || !['accepted','declined'].includes(String(submitted.status||'').toLowerCase())) throw new Error('The item reward must have a final resolution before it can be saved.');
      const action=String(submitted.status).toLowerCase()==='declined'?'declined':submitted.resolution==='equip'?'equip':'inventory';
      return await firebasePublicApi.resolveLootReward(campaignId,characterId,rewardId,action,submitted.destination||submitted.storageId||submitted.equippedSlot||'');
    }catch(error){
      reportSyncError('campaign-item-reward-resolution', error, { campaignId, characterId, rewardId });
      return { ok:false, applied:false, character:null, error:error.message||String(error) };
    }
  },
  saveCampaignCharacter: async function(campaignId, characterId, character){
    if(!db || !currentUser || !campaignId || !characterId || !character) return false;
    if(window.AsteriaReactMigration?.isDashboardActive?.() || window.AsteriaReactMigration?.liveStateAuthority === 'react') return true;
    try{
      const ownerUid=campaignCharacterOwner(campaignId, characterId, character);
      if(!ownerUid){
        reportSyncError(
          'campaign-character-owner',
          new Error('The linked character owner could not be resolved.'),
          { campaignId, characterId }
        );
        return false;
      }
      const snapshot = campaignCharacterSnapshot(
        Object.assign({}, character, { id:characterId, ownerUid }),
        campaignId,
        ownerUid
      );
      const reference=doc(db,'campaigns',campaignId,'characters',characterId);
      await runTransaction(db,async transaction=>{
        const current=await transaction.get(reference);
        if(!current.exists()||current.data().status!=='linked')
          throw new Error('This character is no longer active in the campaign.');
        if(incomingSnapshotIsStale(current.data(),character))
          throw new Error('A newer live character update already exists. Refresh before saving this character.');
        transaction.update(reference,Object.assign({},snapshot,{updatedAt:serverTimestamp()}));
      });
      return true;
    }catch(err){
      reportSyncError('campaign-character-write', err, { campaignId, characterId });
      return false;
    }
  },
  loadCharacters: async function(){
    if(currentUser) await loadCharacters(currentUser);
  }
};
if(!reactDevFixture) window.AsteriaFirebase = firebasePublicApi;

document.addEventListener('DOMContentLoaded', ()=>{
  const panel = $('loginPanel');
  if(panel) panel.innerHTML = authPanelHtml();
  const title = document.querySelector('title'); if(title) title.textContent = 'Asteria TTRPG';
  const oldLogout = window.logout;
  window.logout = function(){ window.firebaseLogout(); if(!auth && oldLogout) oldLogout(); };
  window.requestPasswordReset = function(){ return window.firebaseResetPassword(); };

  $('firebaseLoginBtn')?.addEventListener('click', e=>{ e.preventDefault(); window.firebaseLogin(); });
  $('goCreateAccountBtn')?.addEventListener('click', e=>{ e.preventDefault(); window.openAccountCreate(); });
  $('testLoginBtn')?.addEventListener('click', e=>{ e.preventDefault(); window.asteriaTestLogin?.(); });
  $('resetPasswordBtn')?.addEventListener('click', e=>{ e.preventDefault(); window.firebaseResetPassword(); });
  ['loginUsername','loginPassword','loginPageUser','loginPagePass','forgotPasswordEmail'].forEach(id=>{
    const el=$(id);
    if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); id === 'forgotPasswordEmail' ? window.firebaseResetPassword() : window.firebaseLogin(); } });
  });
  ['createFirstName','createLastName','createEmail','createUsername','createPassword','createConfirmPassword'].forEach(id=>{
    const el=$(id);
    if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); window.firebaseCreateAccountPage(); } });
  });
});

if(auth && !reactDevFixture){
  onAuthStateChanged(auth, async user=>{
    if(!user){
      const hadSession = Boolean(currentUser || window.AsteriaAuthBridge?.isLoggedIn?.());
      currentUser = null; ownershipReadyUid = '';
      currentProfile = null;
      updatePendingAccountSetupNotice();
      window.AsteriaDataSync?.stopWatching?.();
      window.dispatchEvent(new CustomEvent('asteria:firebase-signed-out'));
      if(hadSession) window.AsteriaAuthBridge?.logoutLocal?.();
      else window.AsteriaAuthBridge?.updateTopButtons?.();
      return;
    }
    try{
      currentUser = user;
      currentProfile = Object.assign({
        uid:user.uid,
        email:user.email || '',
        username:user.displayName || user.email || 'Asteria User',
        role:'account',
        characters:[]
      }, getLocalProfile(user.uid) || {});
      window.AsteriaAuthBridge?.setSession(currentProfile, user);
      currentProfile = await ensureProfile(user, {});
      window.AsteriaAuthBridge?.setSession(currentProfile, user);
      updatePendingAccountSetupNotice();
      await loadCharacters(user);
      window.dispatchEvent(new CustomEvent('asteria:firebase-ready', { detail:{ uid: user.uid, source:'restore' }}));
    }catch(err){ console.warn('Auth state restore failed.', err); }
  });
}
