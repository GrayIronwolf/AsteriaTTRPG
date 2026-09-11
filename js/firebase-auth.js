import { mergeQuestAssignment } from '../src/state/questWorkflowModel.mjs';
import { validateOwnedRecord } from '../src/state/ownedCharacterRecords.mjs';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';
/* =========================
   Asteria v1.7.2.3 Firebase Account + Data Sync Foundation
   Clean account login + separate account creation page.
   Login uses Username + Password. Account creation captures First Name, Last Name, Email, Username, Password.
   ========================= */
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail, setPersistence, browserLocalPersistence, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator, orderBy, limit, doc, setDoc, getDoc, collection, getDocs, onSnapshot, query, where, runTransaction, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getStorage, connectStorageEmulator, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';
import { SESSION_LIMIT_MS, applyCharacteristicAllocations, applyCharacteristicPoints, characterKnowsIdentify, firstFreeStorageSlot, nextSkillProgress, normalizeCharacterStorages, normalizeDashboardPreferences, normalizeInventoryItems, normalizeLiveItem, parseResourceCost, slug as liveSlug, stableInventoryItemId, stackableStorageItem, structuredCloneSafe, talentRankCost, talentTierUnlocked, timestampMs, unidentifiedItemName } from '../src/state/liveWorkspaceModel.mjs';
import { applyRest, applySoulDamage, clampHpForSoulDamage, recoverSoulDamage, soulDamageValue } from '../src/state/specialDamageModel.mjs';
import { createAsteriaItem, getPlayerPurchasePriceCopper, getPlayerSaleValueCopper, marketPricingStatus, normalizeMarketPricing } from '../src/systems/items/marketPricing.mjs';
import { addGrantedMagicElement, incomingSnapshotIsStale, knownMagicElements, mergeLinkedCharacter, safeLinkedCharacterPatch, strictResourcePair } from '../src/state/characterIntegrityModel.mjs';
import { markQuestRewardClaimed, normalizeAssignedQuest, normalizeQuestReward, questRewardClaimed, questRewardSummary } from '../src/state/questRewardModel.mjs';
import { encounterResourcePair, preserveEncounterResources, setEncounterResource } from '../src/state/encounterResourceModel.mjs';

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
async function callTrustedAction(action, args) {
  if(!functionsClient || !currentUser) return {ok:false,error:'Sign in before making changes.'};
  // One ID per user gesture; never automatically replay an uncertain mutation.
  const requestId=crypto.randomUUID();
  try {
    const result=await httpsCallable(functionsClient, 'asteriaAction')({action,args:args.map(value=>value===undefined?null:value),requestId});
    if(result.data?.ok === false) reportSyncError('player-action', new Error(result.data.error || 'Action rejected.'), {campaignId:args[0]});
    return result.data;
  } catch(error) {
    reportSyncError('player-action',error,{campaignId:args[0]});
    return {ok:false,error:error.message || 'The change could not be confirmed. Refresh before retrying.'};
  }
}

function $(id){ return document.getElementById(id); }
function notice(msg){ if(window.toast) window.toast(msg); else alert(msg); }
function usernameKey(value){ return String(value||'').trim().toLowerCase().replace(/[^a-z0-9._-]/g,''); }
function validUsername(value){ return /^[a-z0-9._-]{3,24}$/i.test(String(value||'').trim()); }
function localUsernameMap(){ try{return JSON.parse(localStorage.getItem('asteriaFirebaseUsernameMap')||'{}')}catch(e){return {}} }
function saveLocalUsername(username, data){ try{ const map=localUsernameMap(); map[usernameKey(username)] = data; localStorage.setItem('asteriaFirebaseUsernameMap', JSON.stringify(map)); }catch(e){} }
function localProfileStore(){ try{return JSON.parse(localStorage.getItem('asteriaFirebaseProfiles')||'{}')}catch(e){return {}} }
function saveLocalProfile(uid, profile){ try{ const map=localProfileStore(); map[uid]=profile; localStorage.setItem('asteriaFirebaseProfiles', JSON.stringify(map)); }catch(e){} }
function getLocalProfile(uid){ return localProfileStore()[uid] || null; }
function setText(id, text){ const el=$(id); if(el) el.textContent=text; }
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
    gmUids:uniqueValues(local.gmUids, shared.gmUids),
    playerUids:uniqueValues(local.playerUids, shared.playerUids),
    party:uniqueValues(local.party, shared.party, playerCharacterIds, Object.keys(characters), Object.keys(playerCharacterLinks)),
    roles:Object.assign({}, local.roles || {}, shared.roles || {}),
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
      reportSyncError('campaign-read', error, { campaignId:id });
    }
  }
  let campaign = mergeSharedCampaign(accountCampaign, shared || { id });
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
      sharedCharacters[characterDoc.id] = Object.assign({ id:characterDoc.id }, characterDoc.data());
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
  uniqueValues(campaign.party, Object.keys(summaries), Object.keys(sharedCharacters)).forEach(id=>{
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
  const merged = await runTransaction(db, async transaction=>{
    const campaignRef = doc(db, 'campaigns', campaignId);
    const characterRef = doc(db, 'campaigns', campaignId, 'characters', characterId);
    const [campaignSnap, characterSnap] = await Promise.all([transaction.get(campaignRef), transaction.get(characterRef)]);
    if(!campaignSnap.exists()) return null;
    const campaign = Object.assign({}, campaignSnap.data(), { id:campaignId });
    const roles = Object.assign({}, campaign.roles || {});
    const isMember = campaign.ownerUid === uid || roles[uid] === 'gm' || roles[uid] === 'player' || (campaign.playerUids || []).includes(uid) || (campaign.gmUids || []).includes(uid);
    if(!isMember) throw new Error('campaign-membership-required');

    const submitted = campaignCharacterSnapshot(Object.assign({}, character, { id:characterId }), campaignId, character.ownerUid || uid);
    const existing = characterSnap.exists() ? Object.assign({ id:characterId }, characterSnap.data()) : null;
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
  window.AsteriaWorkspace?.openDashboard?.('dashboard');
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

  if(!firstName || !lastName || !email || !username || !password){
    const msg = 'Please complete First Name, Last Name, Email, Username, and Password.';
    showCreateHint(msg, 'warn'); return notice(msg);
  }
  if(!validUsername(username)){
    const msg = 'Username must be 3-24 characters and use letters, numbers, dots, underscores, or hyphens only.';
    showCreateHint(msg, 'warn'); return notice(msg);
  }
  if(password.length < 6){
    const msg = 'Password must be at least 6 characters.';
    showCreateHint(msg, 'warn'); return notice(msg);
  }

  try{
    showCreateHint('Creating account...', 'info');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const displayName = username;
    try{ await updateProfile(cred.user, { displayName }); }catch(e){ console.warn(e); }
    const profile = { uid:cred.user.uid, email, username, usernameLower:key, firstName, lastName, role:'account', characters:[], createdAt:serverTimestamp() };
    try{
      if(db){
        await setDoc(doc(db, 'users', cred.user.uid), profile, { merge:true });
      }
    }catch(err){
      console.warn('Account was created in Firebase Auth, but Firestore profile save failed. Saving local fallback profile.', err);
      showCreateHint('Account created. Firestore profile save failed, so a local profile cache was saved on this device.', 'warn');
    }
    saveLocalUsername(username, { uid:cred.user.uid, email, username, usernameLower:key });
    currentUser = cred.user;
    currentProfile = Object.assign({}, profile, { createdAt: Date.now() });
    saveLocalProfile(cred.user.uid, currentProfile);
    await loadCharacters(cred.user);
    showCreateHint('Account created. Opening your workspace dashboard.', 'success');
    notice('Account created.');
    openAccountHome(currentProfile, cred.user);
    window.dispatchEvent(new CustomEvent('asteria:firebase-ready', { detail:{ uid: cred.user.uid, source:'login' }}));
    window.dispatchEvent(new CustomEvent('asteria:firebase-ready', { detail:{ uid: cred.user.uid, source:'create' }}));
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
    showAuthHint('Logged in. Opening your workspace dashboard.', 'success');
    notice('Logged in.');
    openAccountHome(currentProfile, cred.user);
    ensureProfile(cred.user, { username:resolved.username, role:'account' })
      .then(profile => {
        currentProfile = profile;
        window.AsteriaAuthBridge?.setSession?.(currentProfile, cred.user);
        return loadCharacters(cred.user);
      })
      .then(() => {
        window.AsteriaWorkspace?.openDashboard?.('dashboard');
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

const firebasePublicApi = {
  isReady:()=>Boolean(db && currentUser && ownershipReadyUid === currentUser.uid),
  getUser:()=>currentUser,
  getProfile:()=>currentProfile,
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
  manageCampaignShop: async function(campaignId,action={}){
    if(!db || !currentUser || !campaignId) return {ok:false};
    try{
      const campaignRef=doc(db,'campaigns',campaignId);
      const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
      const saved=await runTransaction(db,async transaction=>{
        const campaignSnapshot=await transaction.get(campaignRef);
        const ecosystemSnapshot=await transaction.get(ecosystemRef);
        if(!campaignSnapshot.exists() || !currentUserIsCampaignGM(campaignSnapshot.data())) throw new Error('Only a campaign GM can manage shops.');
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.exists()?ecosystemSnapshot.data():{});
        const shops=Array.isArray(ecosystem.shops)?ecosystem.shops.slice():[];
        const shopId=String(action.shopId||action.shop?.id||'');
        const index=shops.findIndex(value=>String(value.id)===shopId);
        if(action.type==='delete'){
          if(index>=0) shops.splice(index,1);
        }else if(action.type==='stock'){
          if(index<0) throw new Error('Shop not found.');
          const item=normalizeMarketPricing(structuredCloneSafe(action.item||{}),{legacy:true,removeLegacy:true,migratedRecord:true});
          item.name=item.name||item.title||'Item';
          shops[index].stock=Array.isArray(shops[index].stock)?shops[index].stock:[];
          shops[index].stock.push({item,qty:Math.max(1,Number(action.quantity||1)),priceCopper:getPlayerPurchasePriceCopper(item,shops[index].buyModifier??1)});
        }else if(action.type==='remove-stock'){
          if(index<0) throw new Error('Shop not found.');
          shops[index].stock=(shops[index].stock||[]).filter((_value,stockIndex)=>stockIndex!==Number(action.stockIndex));
        }else{
          const source=Object.assign({},index>=0?shops[index]:{},structuredCloneSafe(action.shop||{}));
          const shop=Object.assign({
            id:source.id||`shop-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
            name:'Campaign Shop',type:'General Goods',status:'closed',buyModifier:1,sellModifier:1,
            currencyCopper:100000,visitorCharacterIds:[],stock:[]
          },source);
          shop.name=String(shop.name||'Campaign Shop').trim().slice(0,160);
          shop.visitorCharacterIds=Array.from(new Set((shop.visitorCharacterIds||[]).map(String)));
          if(index>=0) shops[index]=shop; else shops.push(shop);
        }
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{shops,version:ecosystem.version||'asteria-item-ecosystem-v1',updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return shops;
      });
      return {ok:true,shops:saved};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
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
  updateCharacterDashboardPreferences: async function(campaignId,characterId,preferences={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        character.dashboardPreferences=normalizeDashboardPreferences({dashboardPreferences:Object.assign({},character.dashboardPreferences||{},structuredCloneSafe(preferences))});
        writeLiveCharacter(transaction,refs,character);
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
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
  recordSkillSuccess: (...args) => callTrustedAction('recordSkillSuccess', args),
  castCharacterSpell: (...args) => callTrustedAction('castCharacterSpell', args),
  updateCharacterInventory: (...args) => callTrustedAction('updateCharacterInventory', args),
  buyLiveShopItem: (...args) => callTrustedAction('buyLiveShopItem', args),
  sellLiveShopItem: (...args) => callTrustedAction('sellLiveShopItem', args),
  createLiveTrade: async function(campaignId,characterId,recipientId,itemId,quantity=1,note=''){
    return firebasePublicApi.createLiveItemRequest(campaignId,characterId,recipientId,itemId,'trade',{quantity,note});
  },
  respondLiveTrade: async function(campaignId,characterId,requestId,accepted){
    return firebasePublicApi.respondLiveItemRequest(campaignId,characterId,requestId,accepted,{});
  },
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
  saveCampaignEncounter: async function(campaignId, encounter={}){
    if(!db || !currentUser || !campaignId) return { ok:false };
    try{
      const encounterRef=doc(db, 'campaigns', campaignId, 'systems', 'encounter');
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        await requireCampaignGM(transaction,campaignId);
        const snapshot=await transaction.get(encounterRef);
        const persisted=snapshot.exists()?snapshot.data():{};
        const next=structuredCloneSafe(encounter);
        next.combatants=preserveEncounterResources(next.combatants,persisted.combatants);
        next.enemies=preserveEncounterResources(next.enemies,persisted.enemies);
        transaction.set(encounterRef,Object.assign({},cleanData(next),{campaignId,updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
      });
      return { ok:true };
    }catch(error){
      reportSyncError('campaign-encounter-save', error, { campaignId });
      return { ok:false, error:error.message || String(error) };
    }
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
  takeCampaignCharacterRest: (...args) => callTrustedAction('takeCampaignCharacterRest', args),
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
  findCampaignByUCN: async function(codeValue){
    if(!functionsClient || !currentUser) throw new Error('Sign in to view this invitation.');
    return (await httpsCallable(functionsClient,'asteriaInvite')({code:campaignCode(codeValue),join:false})).data;
  },
  joinCampaignByUCN: async function(codeValue){
    if(!functionsClient || !currentUser) throw new Error('Sign in to join this campaign.');
    return (await httpsCallable(functionsClient,'asteriaInvite')({code:campaignCode(codeValue),join:true})).data;
  },
  linkCharacterToCampaign: async function(campaignId, character){
    if(!db || !currentUser || !campaignId || !character?.id) return null;
    const uid = currentUser.uid;
    const characterId = String(character.id);
    const linked = await upsertSharedCampaignCharacter(campaignId, characterId, character);
    if(!linked) return null;
    await setDoc(doc(db, 'users', uid, 'characters', linked.character.sourceCharacterId || characterId), Object.assign({}, linked.character, { id:linked.character.sourceCharacterId || characterId, updatedAt:serverTimestamp() }), { merge:true });
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
          reportSyncError('campaign-membership-query', result.reason, { uid });
          throw result.reason;
        }
        result.value.forEach(item=>{
          sharedCampaigns.set(item.id, Object.assign({}, item.data(), { id:item.id }));
        });
      });
      const campaignIds = new Set([
        ...accountCampaigns.keys(),
        ...sharedCampaigns.keys(),
        ...linkedCampaignIdsFromOwnedCharacters(uid)
      ]);
      const campaigns = [];
      for(const id of campaignIds){
        campaigns.push(await loadSharedCampaignDetails(
          id,
          accountCampaigns.get(id) || {},
          sharedCampaigns.get(id) || null
        ));
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
    const emit = ()=>{
      const account = sources.get('account') || new Map();
      const shared = new Map();
      ['owner','gm','player'].forEach(key=>{
        (sources.get(key) || new Map()).forEach((campaign,id)=>{
          shared.set(id, Object.assign({}, shared.get(id) || {}, campaign));
        });
      });
      const ids = new Set([
        ...account.keys(),
        ...shared.keys(),
        ...linkedCampaignIdsFromOwnedCharacters(uid)
      ]);
      onChange(Array.from(ids).map(id=>mergeSharedCampaign(
        account.get(id) || { id },
        shared.get(id) || { id }
      )));
    };
    const watch = (key, reference)=>{
      return onSnapshot(reference, snapshot=>{
        const records = new Map();
        snapshot.forEach(item=>{
          records.set(item.id, Object.assign({}, item.data(), { id:item.id }));
        });
        sources.set(key, records);
        emit();
      }, error=>reportSyncError('campaign-membership-listener', error, { uid, source:key }));
    };
    const unsubscribers = [
      watch('account', collection(db, 'users', uid, 'campaigns')),
      ...campaignMembershipQueries(uid).map((campaignQuery,index)=>watch(['owner','gm','player'][index], campaignQuery))
    ];
    return ()=>unsubscribers.forEach(unsubscribe=>{
      try{ unsubscribe?.(); }catch(error){}
    });
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
  subscribeCampaignItemEcosystem: function(campaignId, onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(
      doc(db, 'campaigns', campaignId, 'systems', 'itemEcosystem'),
      snapshot=>{
        onChange(snapshot.exists() ? snapshot.data() : null);
      },
      err=>reportSyncError('item-ecosystem-listener', err, { campaignId })
    );
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
  subscribeCampaignCharacters: function(campaignId, onChange){
    let previous={};
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(
      collection(db, 'campaigns', campaignId, 'characters'),
      {includeMetadataChanges:true},
      snapshot=>{
        const characters={};
        snapshot.forEach(characterDoc=>{
          const next=Object.assign({id:characterDoc.id},characterDoc.data());
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
    try{
      await setDoc(
        doc(db, 'users', currentUser.uid, 'characters', characterId),
        {
          id:characterId,
          ownerUid:currentUser.uid,
          level:Number(character.level || 0),
          xp:Number(character.xp || 0),
          xpMax:Number(character.xpMax || 1000),
          cp:Number(character.cp || 0),
          tp:Number(character.tp || 0),
          pendingSkillChoices:Number(character.pendingSkillChoices || 0),
          dashboardNotifications:cleanData(character.dashboardNotifications || []),
          progressionSync:cleanData(character.progressionSync || {}),
          updatedAt:serverTimestamp()
        },
        { merge:true }
      );
      return true;
    }catch(err){
      console.warn('Could not persist the received character progression.', err);
      return false;
    }
  },
  saveOwnedCharacterSnapshot: async function(characterId, character){
    if(!db || !currentUser || !characterId || !character) return false;
    if(character.ownerUid !== currentUser.uid) return false;
    try{
      const clean = cleanData(character);
      await setDoc(
        doc(db, 'users', currentUser.uid, 'characters', characterId),
        Object.assign({}, clean, {
          id:characterId,
          ownerUid:currentUser.uid,
          updatedAt:serverTimestamp()
        }),
        { merge:true }
      );
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
        if(snapshot.exists() && incomingSnapshotIsStale(snapshot.data(),character)) throw new Error('A newer live character update already exists. Refresh before saving progression.');
        transaction.set(reference,progressionPayload,{merge:true});
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
        if(current.exists() && incomingSnapshotIsStale(current.data(),character)) throw new Error('A newer live character update already exists. Refresh before saving this character.');
        transaction.set(reference,Object.assign({},snapshot,{updatedAt:serverTimestamp()}),{merge:true});
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
  window.logout = function(){ firebaseLogout(); if(!auth && oldLogout) oldLogout(); };
  window.requestPasswordReset = function(){ return window.firebaseResetPassword(); };

  $('firebaseLoginBtn')?.addEventListener('click', e=>{ e.preventDefault(); window.firebaseLogin(); });
  $('goCreateAccountBtn')?.addEventListener('click', e=>{ e.preventDefault(); window.openAccountCreate(); });
  $('testLoginBtn')?.addEventListener('click', e=>{ e.preventDefault(); window.asteriaTestLogin?.(); });
  $('resetPasswordBtn')?.addEventListener('click', e=>{ e.preventDefault(); window.firebaseResetPassword(); });
  ['loginUsername','loginPassword','loginPageUser','loginPagePass','forgotPasswordEmail'].forEach(id=>{
    const el=$(id);
    if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); id === 'forgotPasswordEmail' ? window.firebaseResetPassword() : window.firebaseLogin(); } });
  });
  ['createFirstName','createLastName','createEmail','createUsername','createPassword'].forEach(id=>{
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
      await loadCharacters(user);
      window.dispatchEvent(new CustomEvent('asteria:firebase-ready', { detail:{ uid: user.uid, source:'restore' }}));
    }catch(err){ console.warn('Auth state restore failed.', err); }
  });
}
