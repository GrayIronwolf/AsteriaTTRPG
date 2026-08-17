/* =========================
   Asteria v1.7.2.3 Firebase Account + Data Sync Foundation
   Clean account login + separate account creation page.
   Login uses Username + Password. Account creation captures First Name, Last Name, Email, Username, Password.
   ========================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, onSnapshot, query, where, runTransaction, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';
import { SESSION_LIMIT_MS, applyCharacteristicPoints, characterKnowsIdentify, firstFreeStorageSlot, nextSkillProgress, normalizeCharacterStorages, normalizeDashboardPreferences, normalizeLiveItem, parseResourceCost, slug as liveSlug, stackableStorageItem, structuredCloneSafe, talentRankCost, talentTierUnlocked, timestampMs, unidentifiedItemName } from '../src/state/liveWorkspaceModel.mjs';

const firebaseConfig = {
  apiKey: 'AIzaSyBCFapadl9W4WCouRsKuMPWOZPHQuNjea0',
  authDomain: 'asteria-ttrpg.firebaseapp.com',
  projectId: 'asteria-ttrpg',
  storageBucket: 'asteria-ttrpg.firebasestorage.app',
  messagingSenderId: '549905451812',
  appId: '1:549905451812:web:5e2a9c170984c175e8c1b1',
  measurementId: 'G-FVD0YYJ0HP'
};

const reactDevFixture = ['127.0.0.1', 'localhost'].includes(window.location.hostname) &&
  new URLSearchParams(window.location.search).get('reactFixture') === '1';

let app, auth, db, storage, currentUser = null, currentProfile = null;
try {
  if(reactDevFixture) throw new Error('React development fixture active.');
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(err => console.warn('Firebase persistence setup failed.', err));
  db = getFirestore(app);
  storage = getStorage(app);
} catch (err) {
  if(!reactDevFixture) console.warn('Firebase failed to initialise. Account login requires Firebase setup.', err);
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
function linkedCampaignIdsFromOwnedCharacters(uid){
  const ids = new Set();
  Object.values(window.chars || {}).forEach(character=>{
    if(!character || character.ownerUid && character.ownerUid !== uid) return;
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
  const linkedCharacter = campaignCharacterSnapshot(Object.assign({}, character, { id:characterId }), campaignId, character.ownerUid || uid);
  const merged = await runTransaction(db, async transaction=>{
    const campaignRef = doc(db, 'campaigns', campaignId);
    const campaignSnap = await transaction.get(campaignRef);
    if(!campaignSnap.exists()) return null;
    const campaign = Object.assign({}, campaignSnap.data(), { id:campaignId });
    const roles = Object.assign({}, campaign.roles || {});
    const isMember = campaign.ownerUid === uid || roles[uid] === 'gm' || roles[uid] === 'player' || (campaign.playerUids || []).includes(uid) || (campaign.gmUids || []).includes(uid);
    if(!isMember) throw new Error('campaign-membership-required');

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
    transaction.set(doc(db, 'users', uid, 'campaigns', campaignId), Object.assign({}, result, { updatedAt:serverTimestamp() }), { merge:true });
    return result;
  });
  return merged ? { campaign:merged, character:linkedCharacter } : null;
}
async function syncCharacterToCampaigns(characterId, character){
  if(!db || !currentUser || !characterId || !character) return;
  const campaignIds = await linkedCampaignIdsForCharacter(characterId, character);
  if(!campaignIds.length) return;
  const snapshotBase = Object.assign({}, character, { id:characterId, linkedCampaignIds:campaignIds });
  for(const campaignId of campaignIds){
    let linked = null;
    try{
      linked = await upsertSharedCampaignCharacter(campaignId, characterId, snapshotBase);
    }catch(err){ console.warn(`Could not sync ${characterId} into shared campaign ${campaignId}.`, err); }
    if(!linked) continue;
    try{
      await setDoc(doc(db, 'campaigns', campaignId, 'characters', characterId), Object.assign({}, linked.character, { updatedAt:serverTimestamp() }), { merge:true });
    }catch(err){ console.warn(`Campaign ${campaignId} accepted ${characterId}, but its optional full-sheet snapshot could not be updated.`, err); }
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

async function lookupUsername(username){
  const key = usernameKey(username);
  if(!key) return null;
  const localRecord = localUsernameMap()[key] || null;
  if(localRecord?.email) return localRecord;
  if(!db) return localRecord;
  try{
    const snap = await getDoc(doc(db, 'usernames', key));
    return snap.exists() ? snap.data() : localRecord;
  }catch(err){
    console.warn('Username lookup failed. Using local username cache if available.', err);
    return localRecord;
  }
}
async function resolveLoginToEmail(usernameOrEmail){
  const input = String(usernameOrEmail||'').trim();
  if(!input) return { error:'No User' };
  if(input.includes('@')) return { email:input, username:input };
  const record = await lookupUsername(input);
  if(!record?.email) return { error:'No User' };
  return { email:record.email, username:record.username || input, uid:record.uid };
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
    const snap = await getDocs(collection(db, 'users', user.uid, 'characters'));
    const chars = [];
    snap.forEach(d=>chars.push(Object.assign({ id:d.id }, d.data())));
    if(chars.length) window.AsteriaAuthBridge?.importCharacters(user.uid, chars);
  }catch(err){ console.warn('Character load skipped. Check Firestore rules if needed.', err); }
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
    <div id="firebaseAuthHint" class="auth-hint">Enter your username and password.</div>
    <label>Username<input id="loginUsername" placeholder="Username" autocomplete="username"></label>
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

  showCreateHint('Checking username...', 'info');
  try{
    if(db){
      try{
        const existing = await getDoc(doc(db, 'usernames', key));
        if(existing.exists()){
          const msg='Username already exists. Please choose another username.';
          showCreateHint(msg, 'warn'); return notice(msg);
        }
      }catch(err){
        console.warn('Could not check username in Firestore. Continuing with Firebase Auth and local cache.', err);
        showCreateHint('Firestore is offline or blocked. Creating account with local profile fallback.', 'warn');
      }
    }
    const localExisting = localUsernameMap()[key];
    if(localExisting?.email && localExisting.email !== email){
      const msg='Username already exists on this device. Please choose another username.';
      showCreateHint(msg, 'warn'); return notice(msg);
    }
    showCreateHint('Creating account...', 'info');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const displayName = username;
    try{ await updateProfile(cred.user, { displayName }); }catch(e){ console.warn(e); }
    const profile = { uid:cred.user.uid, email, username, usernameLower:key, firstName, lastName, role:'account', characters:[], createdAt:serverTimestamp() };
    try{
      if(db){
        await setDoc(doc(db, 'users', cred.user.uid), profile, { merge:true });
        await setDoc(doc(db, 'usernames', key), { uid:cred.user.uid, email, username, usernameLower:key, createdAt:serverTimestamp() });
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
    if(resolved.error){ showAuthHint('No User. If Firestore is offline, try logging in with your email address instead of username.', 'error'); return notice('No User'); }
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
    const msg = 'Enter your email or username first, then press Reset password.';
    showAuthHint(msg, 'warn'); return notice(msg);
  }
  try{
    const resolved = await resolveLoginToEmail(username);
    if(resolved.error){ showAuthHint('No User', 'error'); return notice('No User'); }
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
  currentUser = null; currentProfile = null;
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
function liveCharacterRefs(campaignId,characterId){
  return {
    campaign:doc(db,'campaigns',campaignId,'characters',characterId),
    private:doc(db,'users',currentUser.uid,'characters',characterId)
  };
}
function ownedCharacterSourceId(characterId,character={}){
  return String(character.sourceCharacterId || character.id || characterId || '');
}
function campaignLinksCurrentUser(campaign={},characterId=''){
  const uid=currentUser?.uid || '';
  if(!uid) return false;
  if(String(campaign.playerCharacterLinks?.[characterId] || '')===uid) return true;
  if((campaign.players?.[uid]?.characterIds || []).map(String).includes(String(characterId))) return true;
  return String(campaign.characters?.[characterId]?.ownerUid || '')===uid;
}
async function verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs={}){
  if(!currentUser) throw new Error('Sign in to use this character.');
  const sourceId=ownedCharacterSourceId(characterId,character);
  const privateRef=doc(db,'users',currentUser.uid,'characters',sourceId || characterId);
  refs.private=privateRef;
  if(String(character.ownerUid || '')===currentUser.uid){ refs.verifiedOwner=true; return {privateRef,privateSnapshot:null}; }
  const [privateSnapshot,campaignSnapshot]=await Promise.all([
    transaction.get(privateRef),
    transaction.get(doc(db,'campaigns',campaignId))
  ]);
  if(!privateSnapshot.exists() && !campaignLinksCurrentUser(campaignSnapshot.exists()?campaignSnapshot.data():{},characterId)){
    throw new Error('This character is not linked to your account.');
  }
  refs.verifiedOwner=true;
  return {privateRef,privateSnapshot};
}
async function verifyOwnedLiveCharacterRead(campaignId,characterId,character){
  if(!currentUser) return {ok:false,error:'Sign in to use this character.'};
  const sourceId=ownedCharacterSourceId(characterId,character);
  const privateRef=doc(db,'users',currentUser.uid,'characters',sourceId || characterId);
  if(String(character.ownerUid || '')===currentUser.uid) return {ok:true,privateRef,privateSnapshot:await getDoc(privateRef)};
  const [privateSnapshot,campaignSnapshot]=await Promise.all([getDoc(privateRef),getDoc(doc(db,'campaigns',campaignId))]);
  if(!privateSnapshot.exists() && !campaignLinksCurrentUser(campaignSnapshot.exists()?campaignSnapshot.data():{},characterId)){
    return {ok:false,error:'This character is not linked to your account.'};
  }
  return {ok:true,privateRef,privateSnapshot};
}
function writeLiveCharacter(transaction,refs,character){
  const clean=structuredCloneSafe(character);
  transaction.set(refs.campaign,Object.assign({},clean,{updatedAt:serverTimestamp()}),{merge:true});
  if(character.ownerUid === currentUser.uid || refs.verifiedOwner) transaction.set(refs.private,Object.assign({},clean,{id:ownedCharacterSourceId(character.id,character),ownerUid:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
}
function characterInventory(character){
  return (Array.isArray(character.inventory) ? character.inventory : []).map((item,index)=>normalizeLiveItem(
    typeof item === 'string' ? {id:liveSlug(item)||`item-${index}`,name:item,qty:1} : Object.assign({qty:Number(item.qty ?? item.quantity ?? 1)},item),
    index,
    character
  ));
}
const LIVE_CURRENCY=[['royal_platinum',10000000000],['royal_crown',100000000],['platinum_crown',1000000],['gold',10000],['silver',100],['copper',1]];
function currencyTotal(character){
  const coins=character.coins || character.coinPouch || {};
  return LIVE_CURRENCY.reduce((sum,[key,value])=>sum+Number(coins[key] ?? coins[key.replaceAll('_',' ')] ?? coins[key.split('_').map(part=>part[0]?.toUpperCase()+part.slice(1)).join(' ')] ?? 0)*value,0);
}
function setCurrencyTotal(character,total){
  let remainder=Math.max(0,Math.floor(Number(total||0)));
  character.coins=Object.assign({},character.coins || {});
  LIVE_CURRENCY.forEach(([key,value])=>{character.coins[key]=Math.floor(remainder/value);remainder%=value;});
}
function liveItemId(item,index=0){return String(item?.id || item?.instanceId || item?.catalogId || liveSlug(item?.name || item?.title) || `item-${index}`);}
function appendActivity(character,entry){
  const rows=Array.isArray(character.actionLog) ? character.actionLog : [];
  character.actionLog=[Object.assign({id:`action-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,at:new Date().toISOString()},entry),...rows].slice(0,100);
}

const firebasePublicApi = {
  isReady:()=>Boolean(db && currentUser),
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
    const source=options.mode === 'character'
      ? query(collection(db, 'campaigns', campaignId, 'events'), where('targetOwnerUid', '==', options.targetOwnerUid || currentUser.uid))
      : collection(db, 'campaigns', campaignId, 'events');
    return onSnapshot(source, snapshot=>{
      const events=[];
      snapshot.forEach(item=>{
        const event=Object.assign({ id:item.id }, item.data());
        if(options.characterId && event.targetCharacterId && event.targetCharacterId !== options.characterId) return;
        events.push(event);
      });
      onChange(events);
    }, error=>reportSyncError('campaign-events-listener', error, { campaignId, mode:options.mode || 'gm' }));
  },
  subscribeCampaignEncounter: function(campaignId, onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(
      doc(db, 'campaigns', campaignId, 'systems', 'encounter'),
      snapshot=>onChange(snapshot.exists() ? Object.assign({ status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] }, snapshot.data()) : { status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] }),
      error=>reportSyncError('campaign-encounter-listener', error, { campaignId })
    );
  },
  subscribePartyWorkspace: function(campaignId,onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(doc(db,'campaigns',campaignId,'systems','party-workspace'),snapshot=>onChange(snapshot.exists() ? snapshot.data() : {sharedNotes:'',questLog:[]}),error=>reportSyncError('party-workspace-listener',error,{campaignId}));
  },
  subscribePartyChat: function(campaignId,onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(collection(db,'campaigns',campaignId,'partyChat'),snapshot=>{
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
        if(character.ownerUid && character.ownerUid!==currentUser.uid) throw new Error('You can only edit your own dashboard.');
        character.dashboardPreferences=normalizeDashboardPreferences({dashboardPreferences:Object.assign({},character.dashboardPreferences||{},structuredCloneSafe(preferences))});
        writeLiveCharacter(transaction,refs,character);
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  createPartyOrganization: async function(campaignId,characterId,details={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const workspaceRef=doc(db,'campaigns',campaignId,'systems','party-workspace');
    const characterRef=doc(db,'campaigns',campaignId,'characters',characterId);
    try{
      const organization=await runTransaction(db,async transaction=>{
        const session=await requireLiveSession(transaction,campaignId);
        const [workspaceSnapshot,characterSnapshot]=await Promise.all([transaction.get(workspaceRef),transaction.get(characterRef)]);
        if(!characterSnapshot.exists()) throw new Error('Character not found.');
        const character=characterSnapshot.data();
        if(character.ownerUid && character.ownerUid!==currentUser.uid) throw new Error('You can only create an organization for your own character.');
        const workspace=structuredCloneSafe(workspaceSnapshot.exists()?workspaceSnapshot.data():{});
        const name=String(details.name||'').trim().slice(0,120);
        if(!name) throw new Error('Enter an organization name.');
        const row={id:`organization-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,type:String(details.type||'Adventure Party').slice(0,80),ownerCharacterId:characterId,memberCharacterIds:[characterId],createdBy:currentUser.uid,createdAt:new Date().toISOString()};
        workspace.organizations=[...(Array.isArray(workspace.organizations)?workspace.organizations:[]),row];
        transaction.set(workspaceRef,Object.assign({},workspace,{sessionId:session.id,updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return row;
      });
      return {ok:true,organization};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  uploadCharacterGalleryImage: async function(campaignId,characterId,file){
    if(!db || !storage || !currentUser || !campaignId || !characterId || !(file instanceof File)) return {ok:false,error:'Choose an image file.'};
    if(!String(file.type||'').startsWith('image/')) return {ok:false,error:'Gallery uploads must be images.'};
    if(Number(file.size||0)>8*1024*1024) return {ok:false,error:'Images must be 8 MB or smaller.'};
    const refs=liveCharacterRefs(campaignId,characterId);
    const snapshot=await getDoc(refs.campaign);
    if(!snapshot.exists()) return {ok:false,error:'Character not found.'};
    const verified=await verifyOwnedLiveCharacterRead(campaignId,characterId,Object.assign({id:characterId},snapshot.data()));
    if(!verified.ok) return verified;
    refs.private=verified.privateRef;
    const id=`gallery-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const extension=String(file.name||'image').split('.').pop().replace(/[^a-z0-9]/gi,'').slice(0,8)||'image';
    const path=`users/${currentUser.uid}/characters/${characterId}/gallery/${id}.${extension}`;
    const reference=storageRef(storage,path);
    try{
      await uploadBytes(reference,file,{contentType:file.type,customMetadata:{campaignId,characterId}});
      const url=await getDownloadURL(reference);
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
      return {ok:false,error:error.message||String(error)};
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
        const privateData=verification.privateSnapshot?.exists() ? verification.privateSnapshot.data() : {};
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
  grantCharacterStorageSlots: async function(campaignId,characterIds,amount=1){
    if(!db || !currentUser || !campaignId) return {ok:false};
    const ids=[...new Set((Array.isArray(characterIds)?characterIds:[characterIds]).filter(Boolean))];
    const count=Math.max(1,Math.min(10,Number(amount||1)));
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
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
  spendCharacteristicPoints: async function(campaignId,characterId,key,amount=1){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const current=Object.assign({id:characterId},snapshot.data());
        const applied=applyCharacteristicPoints(current,key,amount);
        appendActivity(applied.character,{type:'cp-spent',message:`Spent ${applied.applied} CP on ${key}.`});
        writeLiveCharacter(transaction,refs,applied.character);
        return applied;
      });
      return {ok:true,applied:result.applied};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  purchaseTalentRank: async function(campaignId,characterId,talent={}){
    if(!db || !currentUser || !campaignId || !characterId || !talent.name) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        const tier=Math.max(1,Math.min(5,Number(talent.tier||1)));
        if(!talentTierUnlocked(character.level,tier)) throw new Error(`Tier ${tier} unlocks at Level ${[0,1,10,20,30,40][tier]}.`);
        character.talents=Array.isArray(character.talents) ? Object.fromEntries(character.talents.map(value=>[value.name||value.title||value,{rank:Number(value.rank||1)}])) : Object.assign({},character.talents||{});
        const existing=character.talents[talent.name]||{};
        const rank=Math.max(0,Number(existing.rank||0));
        const maximum=Math.max(1,Number(talent.maxRank||talent.max||talent.ranks||5));
        if(rank>=maximum) throw new Error('Talent is already at maximum rank.');
        const cost=talentRankCost(rank+1);
        if(Number(character.tp||0)<cost) throw new Error(`Rank ${rank+1} costs ${cost} TP.`);
        character.tp=Number(character.tp||0)-cost;
        character.talents[talent.name]=Object.assign({},existing,structuredCloneSafe(talent),{name:talent.name,rank:rank+1,tier,maxRank:maximum,unlocked:true});
        character.unlockedTalents=Object.values(character.talents).filter(value=>Number(value.rank||0)>0);
        appendActivity(character,{type:'talent-rank',message:`Unlocked ${talent.name} Rank ${rank+1} for ${cost} TP.`});
        writeLiveCharacter(transaction,refs,character);
        return {rank:rank+1,cost};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  recordSkillSuccess: async function(campaignId,characterId,skill={}){
    if(!db || !currentUser || !campaignId || !characterId || !skill.name) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const progress=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        const key=liveSlug(skill.name);
        character.skillProgress=Object.assign({},character.skillProgress||{});
        const existing=character.skillProgress[key]||{name:skill.name,rank:skill.rank||skill.rankName||1,successes:0};
        const next=nextSkillProgress(existing);
        character.skillProgress[key]=next;
        if(Array.isArray(character.skills)) character.skills=character.skills.map(value=>liveSlug(value?.name||value?.title||value)===key ? Object.assign(typeof value==='object'?value:{name:value},{rank:next.rank,rankName:next.rankName}) : value);
        appendActivity(character,{type:'skill-success',message:`${skill.name}: successful check${next.rankedUp?` - advanced to ${next.rankName}`:''}.`});
        writeLiveCharacter(transaction,refs,character);
        return next;
      });
      return {ok:true,progress};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  castCharacterSpell: async function(campaignId,characterId,spell={},costs={}){
    if(!db || !currentUser || !campaignId || !characterId || !spell.name) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        const paid={};
        Object.entries(costs||{}).forEach(([resource,raw])=>{
          if(!['hp','sp','mp','bp'].includes(resource)) return;
          const amount=Math.max(0,Number(raw||0));
          if(!amount) return;
          const pair=Array.isArray(character[resource])?character[resource]:[0,0];
          if(Number(pair[0]||0)<amount) throw new Error(`Not enough ${resource.toUpperCase()} to cast ${spell.name}.`);
          character[resource]=[Number(pair[0])-amount,Number(pair[1]||0)];
          paid[resource]=amount;
        });
        appendActivity(character,{type:'spell-cast',message:`Cast ${spell.name}.`,costs:paid});
        writeLiveCharacter(transaction,refs,character);
        return paid;
      });
      return {ok:true,paid:result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  updateCharacterInventory: async function(campaignId,characterId,operation={}){
    if(!db || !currentUser || !campaignId || !characterId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        const inventory=characterInventory(character);
        character.storageLimit=Math.max(3,Number(character.storageLimit||3));
        character.storages=normalizeCharacterStorages(character);
        if(operation.type==='create-storage'){
          if(character.storages.length>=character.storageLimit) throw new Error('The GM must unlock another storage slot first.');
          const name=String(operation.name||'').trim().slice(0,80);
          if(!name) throw new Error('Enter a storage name.');
          const rows=Math.max(1,Math.min(20,Math.floor(Number(operation.rows||4))));
          const cols=Math.max(1,Math.min(20,Math.floor(Number(operation.cols||4))));
          const storage={id:`storage-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,order:character.storages.length,rows,cols,maxSlots:rows*cols};
          character.storages.push(storage);
          const knownStorageIds=new Set(character.storages.map(value=>String(value.id)));
          let nextSlot=0;
          inventory.filter(item=>!item.equipped&&!knownStorageIds.has(String(item.storageId||''))).forEach(item=>{
            if(nextSlot>=storage.maxSlots) return;
            item.storageId=storage.id;item.storageSlot=nextSlot;item.location='inventory';nextSlot+=1;
          });
          character.inventory=inventory;
          writeLiveCharacter(transaction,refs,character);
          return;
        }
        if(operation.type==='reorder-storages'){
          const order=Array.isArray(operation.storageIds)?operation.storageIds:[];
          character.storages.sort((left,right)=>order.indexOf(left.id)-order.indexOf(right.id)).forEach((storage,index)=>{storage.order=index;});
          character.inventory=inventory;
          writeLiveCharacter(transaction,refs,character);
          return;
        }
        if(operation.type==='add-item'){
          const source=structuredCloneSafe(operation.item||{});
          if(!source.name&&!source.title) throw new Error('Item data is incomplete.');
          const storageId=String(operation.storageId||character.storages[0]?.id||'storage-1');
          const storage=character.storages.find(value=>value.id===storageId);
          if(!storage) throw new Error('Create a bag or storage container before adding items.');
          const stacked=stackableStorageItem(inventory,source,storageId);
          if(stacked){
            stacked.qty=Math.max(1,Number(stacked.qty||1))+Math.max(1,Number(source.qty||1));
            character.inventory=inventory;
            appendActivity(character,{type:'item-stacked',message:`Stacked ${source.name||source.title} in ${storage.name}.`});
            writeLiveCharacter(transaction,refs,character);
            return;
          }
          const storageSlot=firstFreeStorageSlot(inventory,storage);
          if(storageSlot<0) throw new Error(`${storage.name} is full.`);
          const added=normalizeLiveItem(Object.assign({},source,{id:`${liveSlug(source.name||source.title)||'item'}-${Date.now()}`,instanceId:`item-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,qty:Math.max(1,Number(source.qty||1)),storageId,storageSlot,location:'inventory',equipped:false}),inventory.length,character);
          character.inventory=[...inventory,added];
          appendActivity(character,{type:'custom-item-added',message:`Added custom item ${added.name} to inventory.`});
          writeLiveCharacter(transaction,refs,character);
          return;
        }
        const item=inventory.find((value,index)=>liveItemId(value,index)===String(operation.itemId||''));
        if(!item) throw new Error('Inventory item not found.');
        if(operation.type==='equip'){
          const slot=String(operation.slot||item.slot||item.allowedSlots?.[0]||'').trim();
          if(!slot) throw new Error('Choose an equipment slot.');
          inventory.forEach(value=>{if(value.equippedSlot===slot){value.equipped=false;value.equippedSlot='';value.location='inventory';}});
          item.equipped=true;item.equippedSlot=slot;item.slot=slot;item.location='equipment';
          character.equipment=Object.assign({},character.equipment||{},{[slot]:item});
          appendActivity(character,{type:'item-equipped',message:`Equipped ${item.name} in ${slot}.`});
        }else if(operation.type==='unequip'){
          const slot=item.equippedSlot||item.slot;
          item.equipped=false;item.equippedSlot='';item.location='inventory';
          if(slot&&character.equipment) delete character.equipment[slot];
          appendActivity(character,{type:'item-unequipped',message:`Unequipped ${item.name}.`});
        }else if(operation.type==='quick'){
          const index=Math.max(0,Math.min(3,Number(operation.index||0)));
          character.quickSlots=Array.isArray(character.quickSlots)?character.quickSlots.slice(0,4):[];
          while(character.quickSlots.length<4) character.quickSlots.push(null);
          character.quickSlots[index]=item;
          appendActivity(character,{type:'quick-slot',message:`Assigned ${item.name} to Quick Slot ${index+1}.`});
        }else if(operation.type==='use'){
          const effect=item.effect||item.effects||{};
          const parsed=effect.resource ? {[String(effect.resource).toLowerCase()]:Number(effect.amount||0)} : parseResourceCost(effect);
          const changes=Object.entries(parsed).filter(([resource,amount])=>['hp','sp','mp','bp'].includes(resource)&&Number(amount)>0);
          if(!changes.length) throw new Error('This item does not have a usable resource effect.');
          changes.forEach(([resource,amount])=>{const pair=Array.isArray(character[resource])?character[resource]:[0,0];character[resource]=[Math.min(Number(pair[1]||0),Number(pair[0]||0)+Number(amount)),Number(pair[1]||0)];});
          item.qty=Math.max(0,Number(item.qty||1)-1);
          appendActivity(character,{type:'item-used',message:`Used ${item.name}: ${changes.map(([resource,amount])=>`+${amount} ${resource.toUpperCase()}`).join(', ')}.`});
        }else if(operation.type==='move-storage'){
          const storage=character.storages.find(value=>value.id===String(operation.storageId||''));
          if(!storage) throw new Error('Storage not found.');
          const requested=Number(operation.storageSlot);
          const capacity=Number(storage.maxSlots||storage.rows*storage.cols||16);
          const storageSlot=Number.isInteger(requested)&&requested>=0&&requested<capacity?requested:firstFreeStorageSlot(inventory,storage,item.id);
          if(storageSlot<0) throw new Error(`${storage.name} is full.`);
          const occupied=inventory.find(value=>!value.equipped&&String(value.id)!==String(item.id)&&value.storageId===storage.id&&Number(value.storageSlot)===storageSlot);
          if(occupied) throw new Error(`Slot ${storageSlot+1} is already occupied.`);
          item.storageId=storage.id;item.storageSlot=storageSlot;item.location='inventory';
          appendActivity(character,{type:'item-stored',message:`Moved ${item.name} to ${storage.name}.`});
        }else if(operation.type==='identify'){
          if(item.identified!==false) throw new Error('This item is already identified.');
          if(!characterKnowsIdentify(character)) throw new Error('This character does not know the Identify spell.');
          item.identified=true;item.name=item.trueName||item.name;item.identifiedAt=new Date().toISOString();item.identifiedBy=characterId;
          appendActivity(character,{type:'item-identified',message:`Identified ${item.name}.`});
        }else if(operation.type==='read-spellbook'){
          if(item.identified===false) throw new Error('Identify this spellbook before reading it.');
          if(!item.isSpellbook&&!item.spell) throw new Error('This item is not a spellbook.');
          const spell=structuredCloneSafe(item.spell||item.spellData||{});
          spell.name=spell.name||item.spellName||item.trueName||item.name;
          if(!spell.name) throw new Error('This spellbook has no linked spell.');
          const known=Array.isArray(character.spells)?character.spells:[];
          if(known.some(value=>liveSlug(value?.name||value?.title||value)===liveSlug(spell.name))) throw new Error(`${spell.name} is already known.`);
          character.spells=[...known,spell];
          item.qty=Math.max(0,Number(item.qty||1)-1);
          appendActivity(character,{type:'spell-learned',message:`Learned ${spell.name} from a spellbook.`});
        }else throw new Error('Unsupported inventory action.');
        character.inventory=inventory.filter(value=>Number(value.qty??1)>0);
        writeLiveCharacter(transaction,refs,character);
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  buyLiveShopItem: async function(campaignId,characterId,shopId,stockIndex,quantity=1){
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(refs.campaign);
        const ecosystemSnapshot=await transaction.get(ecosystemRef);
        if(!characterSnapshot.exists()||!ecosystemSnapshot.exists()) throw new Error('Shop data is not available.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const shop=(ecosystem.shops||[]).find(value=>String(value.id)===String(shopId));
        const stock=shop?.stock?.[Number(stockIndex)];
        if(!shop||!stock||shop.status!=='open') throw new Error('This shop is not open.');
        if(Array.isArray(shop.visitorCharacterIds)&&shop.visitorCharacterIds.length&&!shop.visitorCharacterIds.includes(characterId)) throw new Error('This character is not visiting the shop.');
        const qty=Math.max(1,Math.min(Number(quantity||1),Number(stock.qty||0)));
        if(!qty) throw new Error('This item is out of stock.');
        const item=Object.assign({},structuredCloneSafe(stock.item||{}),{id:`${liveSlug(stock.item?.name||'item')}-${Date.now()}`,qty,location:'inventory',equipped:false});
        item.name=item.name||item.title||'Shop Item';
        const cost=Math.max(0,Number(stock.priceCopper||item.value||0))*qty;
        const total=currencyTotal(character);
        if(total<cost) throw new Error('Not enough currency.');
        setCurrencyTotal(character,total-cost);
        character.inventory=[...characterInventory(character),item];
        stock.qty=Number(stock.qty||0)-qty;
        shop.currencyCopper=Number(shop.currencyCopper||0)+cost;
        appendActivity(character,{type:'shop-purchase',message:`Purchased ${qty} x ${item.name} for ${cost} copper.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return {item,cost};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  sellLiveShopItem: async function(campaignId,characterId,shopId,itemId){
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(refs.campaign);
        const ecosystemSnapshot=await transaction.get(ecosystemRef);
        if(!characterSnapshot.exists()||!ecosystemSnapshot.exists()) throw new Error('Shop data is not available.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const shop=(ecosystem.shops||[]).find(value=>String(value.id)===String(shopId));
        const inventory=characterInventory(character);
        const item=inventory.find((value,index)=>liveItemId(value,index)===String(itemId));
        if(!shop||shop.status!=='open'||!item) throw new Error('The shop or item is unavailable.');
        if(item.equipped||item.locked||item.bound||item.questItem) throw new Error('This item cannot be sold.');
        const value=Math.max(0,Math.floor(Number(item.value||0)*Number(shop.sellModifier??0.5)*Math.max(0.1,Number(item.condition??100)/100)));
        if(Number(shop.currencyCopper??Infinity)<value) throw new Error('The merchant cannot afford this item.');
        item.qty=Math.max(0,Number(item.qty||1)-1);
        character.inventory=inventory.filter(record=>Number(record.qty??1)>0);
        setCurrencyTotal(character,currencyTotal(character)+value);
        shop.currencyCopper=Number(shop.currencyCopper||0)-value;
        shop.stock=Array.isArray(shop.stock)?shop.stock:[];
        const existing=shop.stock.find(row=>liveSlug(row.item?.name)===liveSlug(item.name));
        if(existing) existing.qty=Number(existing.qty||0)+1;
        else shop.stock.push({item:Object.assign({},structuredCloneSafe(item),{qty:1,equipped:false,equippedSlot:'',location:'shop'}),qty:1,priceCopper:Math.max(value,Number(item.value||value))});
        appendActivity(character,{type:'shop-sale',message:`Sold ${item.name} for ${value} copper.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return {value};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  createLiveTrade: async function(campaignId,characterId,recipientId,itemId,quantity=1,note=''){
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      const result=await runTransaction(db,async transaction=>{
        const session=await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(refs.campaign);
        const ecosystemSnapshot=await transaction.get(ecosystemRef);
        if(!characterSnapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.exists()?ecosystemSnapshot.data():{});
        const inventory=characterInventory(character);
        const item=inventory.find((value,index)=>liveItemId(value,index)===String(itemId));
        const qty=Math.max(1,Math.min(Number(quantity||1),Number(item?.qty||0)));
        if(!item||item.equipped||item.locked||item.bound||item.questItem||!qty) throw new Error('This item cannot be traded.');
        const snapshot=Object.assign({},structuredCloneSafe(item),{qty,equipped:false,equippedSlot:'',location:'trade-escrow'});
        item.qty=Number(item.qty||1)-qty;
        character.inventory=inventory.filter(value=>Number(value.qty??1)>0);
        ecosystem.directTrades=Array.isArray(ecosystem.directTrades)?ecosystem.directTrades:[];
        const trade={id:`trade-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,sessionId:session.id,fromCharacterId:characterId,toCharacterId:recipientId,item:snapshot,quantity:qty,note:String(note||'').slice(0,1000),status:'pending',createdAt:new Date().toISOString(),createdBy:currentUser.uid};
        ecosystem.directTrades.push(trade);
        appendActivity(character,{type:'trade-sent',message:`Offered ${qty} x ${item.name} in trade.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return trade;
      });
      return {ok:true,trade:result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  respondLiveTrade: async function(campaignId,characterId,tradeId,accepted){
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(refs.campaign);
        const ecosystemSnapshot=await transaction.get(ecosystemRef);
        if(!characterSnapshot.exists()||!ecosystemSnapshot.exists()) throw new Error('Trade data is unavailable.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const trade=(ecosystem.directTrades||[]).find(value=>String(value.id)===String(tradeId));
        if(!trade||trade.status!=='pending'||trade.toCharacterId!==characterId) throw new Error('This trade is no longer pending for this character.');
        trade.status=accepted?'accepted':'declined';trade.resolvedAt=new Date().toISOString();trade.resolvedBy=currentUser.uid;
        if(accepted){
          const item=Object.assign({},structuredCloneSafe(trade.item),{id:`${liveSlug(trade.item?.name||'item')}-${Date.now()}`,location:'inventory',equipped:false});
          character.inventory=[...characterInventory(character),item];
          appendActivity(character,{type:'trade-accepted',message:`Accepted ${item.name} from a party member.`});
          writeLiveCharacter(transaction,refs,character);
        }
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  createLiveItemOffer: async function(campaignId,characterId,recipientId,itemId,mode='give',details={}){
    if(!db||!currentUser||!campaignId||!characterId||!recipientId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    try{
      const offer=await runTransaction(db,async transaction=>{
        const session=await requireLiveSession(transaction,campaignId);
        const [characterSnapshot,ecosystemSnapshot]=await Promise.all([transaction.get(refs.campaign),transaction.get(ecosystemRef)]);
        if(!characterSnapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},characterSnapshot.data());
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,character,refs);
        const inventory=characterInventory(character);
        const item=inventory.find((value,index)=>liveItemId(value,index)===String(itemId));
        const quantity=Math.max(1,Math.min(Number(details.quantity||1),Number(item?.qty||0)));
        if(!item||item.equipped||item.locked||item.bound||item.questItem||!quantity) throw new Error('This item cannot be offered.');
        const offerMode=['trade','sell','give','identify'].includes(mode)?mode:'give';
        const snapshot=Object.assign({},structuredCloneSafe(item),{qty:quantity,equipped:false,equippedSlot:'',location:offerMode==='identify'?'inventory':'offer-escrow'});
        if(offerMode!=='identify') item.qty=Number(item.qty||1)-quantity;
        character.inventory=inventory.filter(value=>Number(value.qty??1)>0);
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.exists()?ecosystemSnapshot.data():{});
        ecosystem.directTrades=Array.isArray(ecosystem.directTrades)?ecosystem.directTrades:[];
        const row={id:`offer-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,sessionId:session.id,mode:offerMode,fromCharacterId:characterId,toCharacterId:recipientId,item:snapshot,quantity,note:String(details.note||'').slice(0,1000),priceCopper:Math.max(0,Math.floor(Number(details.priceCopper||0))),status:'pending',createdAt:new Date().toISOString(),createdBy:currentUser.uid};
        ecosystem.directTrades.push(row);
        appendActivity(character,{type:`item-${offerMode}-offered`,message:`Sent a ${offerMode} request for ${snapshot.name}.`});
        writeLiveCharacter(transaction,refs,character);
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return row;
      });
      return {ok:true,offer};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  respondLiveItemOffer: async function(campaignId,characterId,offerId,accepted,details={}){
    if(!db||!currentUser||!campaignId||!characterId||!offerId) return {ok:false};
    const ecosystemRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
    const recipientRef=doc(db,'campaigns',campaignId,'characters',characterId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const ecosystemSnapshot=await transaction.get(ecosystemRef);
        if(!ecosystemSnapshot.exists()) throw new Error('Offer data is unavailable.');
        const ecosystem=structuredCloneSafe(ecosystemSnapshot.data());
        const offer=(ecosystem.directTrades||[]).find(value=>String(value.id)===String(offerId));
        if(!offer||offer.status!=='pending'||offer.toCharacterId!==characterId) throw new Error('This offer is no longer pending for this character.');
        const senderRef=doc(db,'campaigns',campaignId,'characters',offer.fromCharacterId);
        const [recipientSnapshot,senderSnapshot]=await Promise.all([transaction.get(recipientRef),transaction.get(senderRef)]);
        if(!recipientSnapshot.exists()||!senderSnapshot.exists()) throw new Error('One of the linked characters is unavailable.');
        const recipient=Object.assign({id:characterId},recipientSnapshot.data());
        const sender=Object.assign({id:offer.fromCharacterId},senderSnapshot.data());
        const recipientRefs={campaign:recipientRef,private:doc(db,'users',currentUser.uid,'characters',characterId)};
        await verifyOwnedLiveCharacter(transaction,campaignId,characterId,recipient,recipientRefs);
        let revealedItem=null;
        if(accepted&&offer.mode==='identify'){
          if(!characterKnowsIdentify(recipient)) throw new Error('This character does not know the Identify spell.');
          const senderInventory=characterInventory(sender);
          const original=senderInventory.find(value=>liveItemId(value)===liveItemId(offer.item));
          if(!original) throw new Error('The item is no longer available to identify.');
          original.identified=true;original.name=original.trueName||original.name;original.identifiedAt=new Date().toISOString();original.identifiedBy=characterId;
          sender.inventory=senderInventory;
          revealedItem=structuredCloneSafe(original);
          appendActivity(sender,{type:'item-identified',message:`${recipient.name||'A party member'} identified ${original.name}.`});
        }else if(accepted){
          const received=Object.assign({},structuredCloneSafe(offer.item),{id:`${liveSlug(offer.item?.trueName||offer.item?.name||'item')}-${Date.now()}`,instanceId:`item-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,location:'inventory',equipped:false,equippedSlot:''});
          recipient.storageLimit=Math.max(3,Number(recipient.storageLimit||3));recipient.storages=normalizeCharacterStorages(recipient);received.storageId=String(details.storageId||recipient.storages[0]?.id||'');
          const recipientStorage=recipient.storages.find(value=>value.id===received.storageId)||recipient.storages[0];
          if(!recipientStorage) throw new Error('Create a bag or storage container before accepting items.');
          received.storageId=recipientStorage.id;received.storageSlot=firstFreeStorageSlot(characterInventory(recipient),recipientStorage);
          if(received.storageSlot<0) throw new Error(`${recipientStorage.name} is full.`);
          if(offer.mode==='sell'){
            const price=Math.max(0,Number(offer.priceCopper||0));
            if(currencyTotal(recipient)<price) throw new Error('Not enough currency for this purchase.');
            setCurrencyTotal(recipient,currencyTotal(recipient)-price);setCurrencyTotal(sender,currencyTotal(sender)+price);
          }
          if(offer.mode==='trade'){
            const recipientInventory=characterInventory(recipient);
            const exchange=recipientInventory.find((value,index)=>liveItemId(value,index)===String(details.exchangeItemId||''));
            if(!exchange||exchange.equipped||exchange.locked||exchange.bound||exchange.questItem) throw new Error('Choose an available item to trade.');
            exchange.qty=Math.max(0,Number(exchange.qty||1)-1);
            recipient.inventory=recipientInventory.filter(value=>Number(value.qty??1)>0);
            const sentBack=Object.assign({},structuredCloneSafe(exchange),{id:`${liveSlug(exchange.trueName||exchange.name||'item')}-${Date.now()+1}`,qty:1,location:'inventory',equipped:false,equippedSlot:''});
            sender.storageLimit=Math.max(3,Number(sender.storageLimit||3));sender.storages=normalizeCharacterStorages(sender);
            if(!sender.storages[0]) throw new Error('The sending character needs a storage container for the exchanged item.');
            sentBack.storageId=sender.storages[0].id;sentBack.storageSlot=firstFreeStorageSlot(characterInventory(sender),sender.storages[0]);
            if(sentBack.storageSlot<0) throw new Error(`${sender.storages[0].name} is full.`);
            sender.inventory=[...characterInventory(sender),sentBack];
          }
          recipient.inventory=[...characterInventory(recipient),received];
          appendActivity(recipient,{type:`item-${offer.mode}-accepted`,message:`Accepted ${received.name} from ${sender.name||'a party member'}.`});
        }else if(offer.mode!=='identify'){
          const returned=Object.assign({},structuredCloneSafe(offer.item),{location:'inventory',equipped:false,equippedSlot:''});
          sender.storageLimit=Math.max(3,Number(sender.storageLimit||3));sender.storages=normalizeCharacterStorages(sender);
          returned.storageId=sender.storages[0]?.id||'';returned.storageSlot=firstFreeStorageSlot(characterInventory(sender),sender.storages[0]||{});
          if(sender.storages[0]&&returned.storageSlot<0) throw new Error(`${sender.storages[0].name} is full.`);
          sender.inventory=[...characterInventory(sender),returned];
        }
        offer.status=accepted?'accepted':'declined';offer.resolvedAt=new Date().toISOString();offer.resolvedBy=currentUser.uid;
        transaction.set(senderRef,Object.assign({},structuredCloneSafe(sender),{updatedAt:serverTimestamp()}),{merge:true});
        transaction.set(recipientRef,Object.assign({},structuredCloneSafe(recipient),{updatedAt:serverTimestamp()}),{merge:true});
        if(recipientRefs.verifiedOwner) transaction.set(recipientRefs.private,Object.assign({},structuredCloneSafe(recipient),{id:ownedCharacterSourceId(characterId,recipient),ownerUid:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        transaction.set(ecosystemRef,Object.assign({},ecosystem,{updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
        return {revealedItem};
      });
      return {ok:true,...result};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  updateCharacterQuest: async function(campaignId,characterId,questId,status){
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
        const quests=Array.isArray(character.quests||character.questLog)?(character.quests||character.questLog):[];
        character.quests=quests.map((quest,index)=>String(quest.id||quest.slug||index)===String(questId)?Object.assign(typeof quest==='object'?quest:{name:quest},{status}):quest);
        writeLiveCharacter(transaction,refs,character);
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  addJournalEntry: async function(campaignId,characterId,entry={}){
    const refs=liveCharacterRefs(campaignId,characterId);
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(refs.campaign);
        if(!snapshot.exists()) throw new Error('Character not found.');
        const character=Object.assign({id:characterId},snapshot.data());
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
        transaction.set(encounterRef,Object.assign({},cleanData(encounter),{campaignId,updatedBy:currentUser.uid,updatedAt:serverTimestamp()}),{merge:true});
      });
      return { ok:true };
    }catch(error){
      reportSyncError('campaign-encounter-save', error, { campaignId });
      return { ok:false, error:error.message || String(error) };
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
    const characterRef=doc(db, 'campaigns', campaignId, 'characters', characterId);
    const eventRef=doc(collection(db, 'campaigns', campaignId, 'events'));
    try{
      const result=await runTransaction(db, async transaction=>{
        const live=await requireLiveSession(transaction,campaignId);
        const characterSnapshot=await transaction.get(characterRef);
        if(!characterSnapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({ id:characterId }, characterSnapshot.data());
        const before={ level:Number(character.level || 0), xp:Number(character.xp || 0) };
        const progression=window.AsteriaProgression?.grantXP?.(character, delta) || { leveled:false, fromLevel:before.level, toLevel:before.level, messages:[] };
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
        const characterSnapshot=await transaction.get(characterRef);
        if(!characterSnapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({ id:characterId }, characterSnapshot.data());
        const sourceItem=structuredCloneSafe(item);
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
        const characterSnapshot=await transaction.get(characterRef);
        if(!characterSnapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({ id:characterId }, characterSnapshot.data());
        const existing=[
          ...(Array.isArray(character.magicTypes) ? character.magicTypes : []),
          ...(Array.isArray(character.gmGrantedMagicTypes) ? character.gmGrantedMagicTypes : []),
          ...(Array.isArray(character.character?.magic?.types) ? character.character.magic.types : []),
          ...(Array.isArray(character.character?.magic?.gmGrantedTypes) ? character.character.magic.gmGrantedTypes : [])
        ].map(value=>String(value).toLowerCase());
        if(existing.includes(String(magicType).toLowerCase())) throw new Error(`${magicType} is already available to ${character.name || characterId}.`);
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
  respondMagicElementReward: async function(campaignId, characterId, eventId, accepted){
    if(!db || !currentUser || !campaignId || !characterId || !eventId) return { ok:false };
    const characterRef=doc(db, 'campaigns', campaignId, 'characters', characterId);
    const privateCharacterRef=doc(db, 'users', currentUser.uid, 'characters', characterId);
    const eventRef=doc(db, 'campaigns', campaignId, 'events', eventId);
    try{
      const result=await runTransaction(db, async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const eventSnapshot=await transaction.get(eventRef);
        const characterSnapshot=await transaction.get(characterRef);
        if(!eventSnapshot.exists() || !characterSnapshot.exists()) throw new Error('The magic reward is no longer available.');
        const reward=eventSnapshot.data();
        const character=Object.assign({ id:characterId }, characterSnapshot.data());
        if(reward.type !== 'magic-element-reward' || reward.targetCharacterId !== characterId || reward.targetOwnerUid !== currentUser.uid) throw new Error('This magic reward is not assigned to this character.');
        if(reward.resolvedAt || ['accepted','declined','resolved'].includes(String(reward.status || '').toLowerCase())) return { applied:false, character };
        const magicType=String(reward.payload?.magicType || '').trim();
        const grants=Array.from(new Set([...(Array.isArray(character.gmGrantedMagicTypes) ? character.gmGrantedMagicTypes : []), ...(accepted && magicType ? [magicType] : [])]));
        const nestedMagic=Object.assign({}, character.character?.magic || {}, { gmGrantedTypes:grants.slice() });
        const patch={ gmGrantedMagicTypes:grants, character:Object.assign({}, character.character || {}, { magic:nestedMagic }), updatedAt:serverTimestamp() };
        if(accepted){
          transaction.set(characterRef, patch, { merge:true });
          transaction.set(privateCharacterRef, Object.assign({}, patch, { ownerUid:currentUser.uid, id:characterId }), { merge:true });
        }
        transaction.set(eventRef, {
          status:accepted ? 'accepted' : 'declined',
          deliveryStatus:'acknowledged',
          acknowledged:true,
          acknowledgedBy:currentUser.uid,
          acknowledgedAt:serverTimestamp(),
          resolvedAt:serverTimestamp(),
          updatedAt:serverTimestamp()
        }, { merge:true });
        return { applied:true, character:Object.assign({}, character, accepted ? patch : {}) };
      });
      return { ok:true, applied:result.applied, character:result.character };
    }catch(error){
      reportSyncError('campaign-magic-reward-response', error, { campaignId, characterId, eventId });
      return { ok:false, applied:false, error:error.message || String(error) };
    }
  },
  identifyLootReward: async function(campaignId,characterId,eventId){
    if(!db || !currentUser || !campaignId || !characterId || !eventId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const eventRef=doc(db,'campaigns',campaignId,'events',eventId);
    try{
      await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const [eventSnapshot,characterSnapshot]=await Promise.all([transaction.get(eventRef),transaction.get(refs.campaign)]);
        if(!eventSnapshot.exists()||!characterSnapshot.exists()) throw new Error('This reward is no longer available.');
        const event=structuredCloneSafe(eventSnapshot.data());
        const character=Object.assign({id:characterId},characterSnapshot.data());
        if(event.targetCharacterId!==characterId||event.targetOwnerUid!==currentUser.uid) throw new Error('This reward is not assigned to this character.');
        if(!characterKnowsIdentify(character)) throw new Error('Learn the Identify spell before identifying loot.');
        const item=Object.assign({},event.payload?.item||{});
        item.identified=true;item.name=item.trueName||item.name;item.identifiedAt=new Date().toISOString();item.identifiedBy=characterId;
        event.payload=Object.assign({},event.payload||{},{item});
        character.pendingItemRewards=(character.pendingItemRewards||[]).map(value=>String(value.id)===String(eventId)?Object.assign({},value,{item}):value);
        writeLiveCharacter(transaction,refs,character);
        transaction.set(eventRef,{payload:event.payload,updatedAt:serverTimestamp()},{merge:true});
      });
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  resolveLootReward: async function(campaignId,characterId,eventId,action='inventory',destination=''){
    if(!db || !currentUser || !campaignId || !characterId || !eventId) return {ok:false};
    const refs=liveCharacterRefs(campaignId,characterId);
    const eventRef=doc(db,'campaigns',campaignId,'events',eventId);
    try{
      const result=await runTransaction(db,async transaction=>{
        await requireLiveSession(transaction,campaignId);
        const eventSnapshot=await transaction.get(eventRef);
        const characterSnapshot=await transaction.get(refs.campaign);
        if(!eventSnapshot.exists() || !characterSnapshot.exists()) throw new Error('This loot reward is no longer available.');
        const event=eventSnapshot.data();
        const character=Object.assign({id:characterId},characterSnapshot.data());
        if(event.type!=='loot-reward'||event.targetCharacterId!==characterId||event.targetOwnerUid!==currentUser.uid) throw new Error('This reward is not assigned to this character.');
        if(event.resolvedAt||['accepted','equipped','declined','resolved'].includes(String(event.status||'').toLowerCase())) return {applied:false};
        const pending=Array.isArray(character.pendingItemRewards)?character.pendingItemRewards:[];
        character.pendingItemRewards=pending.filter(value=>String(value?.id||'')!==String(eventId));
        if(action!=='declined'){
          const item=Object.assign({},structuredCloneSafe(event.payload?.item||{}));
          item.id=item.id||item.instanceId||`${liveSlug(item.name||item.title)||'item'}-${Date.now()}`;
          item.instanceId=item.instanceId||item.id;
          item.name=item.name||item.title||'Reward Item';
          item.qty=Math.max(1,Number(item.qty||item.quantity||1));
          item.location=action==='equip'?'equipment':'inventory';
          item.equipped=action==='equip';
          character.storageLimit=Math.max(3,Number(character.storageLimit||3));
          character.storages=normalizeCharacterStorages(character);
          item.storageId=action==='equip' ? String(item.storageId||character.storages[0]?.id||'') : String(destination||item.storageId||character.storages[0]?.id||'');
          if(action!=='equip'){
            const storage=character.storages.find(value=>value.id===item.storageId);
            if(!storage) throw new Error('Create a bag or storage container before accepting this reward.');
            item.storageSlot=firstFreeStorageSlot(characterInventory(character),storage);
            if(item.storageSlot<0) throw new Error(`${storage.name} is full.`);
          }
          if(action==='equip'){
            item.equippedSlot=destination||item.slot||item.allowedSlots?.[0]||'';
            item.slot=item.equippedSlot;
            character.equipment=Object.assign({},character.equipment||{});
            if(item.equippedSlot) character.equipment[item.equippedSlot]=item;
          }
          character.inventory=[...characterInventory(character),item];
          appendActivity(character,{type:'loot-received',message:`Received ${item.name}${action==='equip'?' and equipped it':''}.`});
        }
        writeLiveCharacter(transaction,refs,character);
        transaction.set(eventRef,{status:action==='declined'?'declined':action==='equip'?'equipped':'accepted',deliveryStatus:'acknowledged',acknowledged:true,acknowledgedBy:currentUser.uid,acknowledgedAt:serverTimestamp(),resolvedAt:serverTimestamp(),updatedAt:serverTimestamp()},{merge:true});
        return {applied:true};
      });
      return {ok:true,applied:result.applied};
    }catch(error){return {ok:false,applied:false,error:error.message||String(error)};}
  },
  updateCampaignCharacterResource: async function(campaignId, characterId, key, amount, metadata={}){
    if(!db || !currentUser || !campaignId || !characterId) return { ok:false };
    const resource=String(key || '').toLowerCase();
    if(!['hp','sp','mp','bp'].includes(resource)) throw new Error('Unsupported character resource.');
    const characterRef=doc(db, 'campaigns', campaignId, 'characters', characterId);
    const eventRef=doc(collection(db, 'campaigns', campaignId, 'events'));
    try{
      const result=await runTransaction(db, async transaction=>{
        const live=await requireLiveSession(transaction,campaignId);
        const snapshot=await transaction.get(characterRef);
        if(!snapshot.exists()) throw new Error('The linked campaign character was not found.');
        const character=Object.assign({ id:characterId }, snapshot.data());
        const pair=Array.isArray(character[resource]) ? character[resource] : [0,resource === 'bp' ? 20 : 0];
        const maximum=Math.max(0,Number(pair[1] || 0));
        const current=Math.max(0,Math.min(maximum,Number(pair[0] || 0) + Number(amount || 0)));
        const next=[current,maximum];
        transaction.set(characterRef, { [resource]:next, updatedAt:serverTimestamp() }, { merge:true });
        transaction.set(eventRef, {
          id:eventRef.id, campaignId, sessionId:live.id || '', targetCharacterId:characterId, targetOwnerUid:character.ownerUid || '',
          type:'resource-update', payload:{ resource, value:next, delta:Number(amount || 0), source:metadata.source || 'Dashboard' },
          status:'delivered', deliveryStatus:'delivered', acknowledged:false, createdBy:currentUser.uid,
          createdAt:serverTimestamp(), resolvedAt:serverTimestamp()
        });
        return next;
      });
      return { ok:true, applied:true, value:result };
    }catch(error){
      reportSyncError('campaign-resource-transaction', error, { campaignId, characterId, resource });
      return { ok:false, applied:false, error:error.message || String(error) };
    }
  },
  saveCharacter: async function(id, character){
    if(!db || !currentUser || !id || !character) return false;
    try{
      const clean = JSON.parse(JSON.stringify(character));
      await setDoc(doc(db, 'users', currentUser.uid, 'characters', id), Object.assign({}, clean, { id, ownerUid: currentUser.uid, updatedAt: serverTimestamp() }), { merge:true });
      const profileRef = doc(db, 'users', currentUser.uid);
      const chars = Array.from(new Set([...(currentProfile?.characters || []), id]));
      currentProfile = Object.assign({}, currentProfile || {}, { characters: chars });
      await setDoc(profileRef, { characters: chars, updatedAt: serverTimestamp() }, { merge:true });
      saveLocalProfile(currentUser.uid, Object.assign({}, currentProfile, { characters: chars }));
      await syncCharacterToCampaigns(id, clean);
      return true;
    }catch(err){ console.warn('Could not save character to Firestore.', err); return false; }
  },
  saveCharacters: async function(characterMap){
    if(!db || !currentUser || !characterMap) return false;
    const ids = Object.keys(characterMap);
    for(const id of ids){ await this.saveCharacter(id, characterMap[id]); }
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
    }catch(err){ console.warn('Could not load app state from Firestore.', err); }
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
    if(!db || !currentUser) throw new Error('firebase-auth-required');
    const ucn = campaignCode(codeValue);
    if(ucn.length !== 12) return null;
    const inviteSnap = await getDoc(doc(db, 'campaignInvites', ucn));
    if(!inviteSnap.exists() || inviteSnap.data()?.status !== 'active') return null;
    const campaignId = String(inviteSnap.data()?.campaignId || '');
    if(!campaignId) return null;
    const campaignSnap = await getDoc(doc(db, 'campaigns', campaignId));
    if(!campaignSnap.exists()) return null;
    return Object.assign({}, campaignSnap.data(), { id:campaignId, ucn });
  },
  joinCampaignByUCN: async function(codeValue){
    if(!db || !currentUser) throw new Error('firebase-auth-required');
    const ucn = campaignCode(codeValue);
    if(ucn.length !== 12) return null;
    const uid = currentUser.uid;
    return runTransaction(db, async transaction => {
      const inviteRef = doc(db, 'campaignInvites', ucn);
      const inviteSnap = await transaction.get(inviteRef);
      if(!inviteSnap.exists() || inviteSnap.data()?.status !== 'active') return null;
      const campaignId = String(inviteSnap.data()?.campaignId || '');
      if(!campaignId) return null;
      const campaignRef = doc(db, 'campaigns', campaignId);
      const campaignSnap = await transaction.get(campaignRef);
      if(!campaignSnap.exists()) return null;

      const campaign = Object.assign({}, campaignSnap.data(), { id:campaignId, ucn });
      const ownerUid = campaign.ownerUid || inviteSnap.data()?.ownerUid || '';
      const isOwner = ownerUid === uid;
      const roles = Object.assign({}, campaign.roles || {});
      const players = Object.assign({}, campaign.players || {});
      const playerUids = Array.from(new Set([...(campaign.playerUids || []), ...(isOwner ? [] : [uid])]));
      const previousPlayer = players[uid] || {};
      const role = isOwner || roles[uid] === 'gm' ? 'gm' : 'player';
      roles[uid] = role;
      players[uid] = Object.assign({
        uid,
        displayName:campaignDisplayName(),
        role,
        status:'active',
        characterIds:[],
        joinedAt:new Date().toISOString()
      }, previousPlayer, { uid, role, status:'active' });
      players[uid].characterIds = Array.isArray(players[uid].characterIds) ? players[uid].characterIds : [];
      const activity = Array.isArray(campaign.activity) ? campaign.activity.slice() : [];
      if(!isOwner && !campaign.playerUids?.includes(uid)) activity.push(`${campaignDisplayName()} joined with UCN.`);
      const merged = Object.assign({}, campaign, { ownerUid, playerUids, roles, players, activity });

      transaction.update(campaignRef, { playerUids, roles, players, activity, updatedAt:serverTimestamp() });
      transaction.set(doc(db, 'users', uid, 'campaigns', campaignId), Object.assign({}, merged, { updatedAt:serverTimestamp() }), { merge:true });
      return merged;
    });
  },
  linkCharacterToCampaign: async function(campaignId, character){
    if(!db || !currentUser || !campaignId || !character?.id) return null;
    const uid = currentUser.uid;
    const characterId = String(character.id);
    const linked = await upsertSharedCampaignCharacter(campaignId, characterId, character);
    if(!linked) return null;
    await setDoc(doc(db, 'users', uid, 'characters', characterId), Object.assign({}, linked.character, { updatedAt:serverTimestamp() }), { merge:true });
    try{
      await setDoc(doc(db, 'campaigns', campaignId, 'characters', characterId), Object.assign({}, linked.character, { updatedAt:serverTimestamp() }), { merge:true });
    }catch(err){
      console.warn('Campaign membership and party stats were linked, but the optional full-sheet snapshot needs the latest Firestore rules.', err);
    }
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
          return;
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
      return [];
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
      snapshot=>{
        if(snapshot.exists()) onChange(Object.assign({}, snapshot.data(), { id:snapshot.id }));
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
        if(snapshot.exists()) onChange(snapshot.data());
      },
      err=>reportSyncError('item-ecosystem-listener', err, { campaignId })
    );
  },
  subscribeCustomItems: function(onChange){
    if(!db || !currentUser || typeof onChange!=='function') return ()=>{};
    return onSnapshot(collection(db,'customItems'),snapshot=>{
      const rows=[];
      snapshot.forEach(item=>rows.push(Object.assign({id:item.id},item.data())));
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
      const record=Object.assign({},structuredCloneSafe(item),{
        id,slug:id,name,title:name,type:String(item.type||'Item'),itemClass:String(item.itemClass||item.rarity||'Common'),rarity:String(item.itemClass||item.rarity||'Common'),description:String(item.description||'').slice(0,10000),custom:true,visibility:'public',createdBy:currentUser.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      await setDoc(doc(db,'customItems',id),record);
      return {ok:true,item:Object.assign({},record,{createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})};
    }catch(error){return {ok:false,error:error.message||String(error)};}
  },
  subscribeCampaignCharacters: function(campaignId, onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(
      collection(db, 'campaigns', campaignId, 'characters'),
      snapshot=>{
        const characters={};
        snapshot.forEach(characterDoc=>{
          characters[characterDoc.id]=Object.assign({ id:characterDoc.id }, characterDoc.data());
        });
        onChange(characters);
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
    if(character.ownerUid && character.ownerUid !== currentUser.uid) return false;
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
    if(character.ownerUid && character.ownerUid !== currentUser.uid) return false;
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
      await setDoc(
        doc(db, 'campaigns', campaignId, 'characters', characterId),
        progressionPayload,
        { merge:true }
      );
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
    const characterRef=doc(db, 'campaigns', campaignId, 'characters', characterId);
    const eventRef=doc(db, 'campaigns', campaignId, 'events', rewardId);
    try{
      const result=await runTransaction(db, async transaction=>{
        const snapshot=await transaction.get(characterRef);
        const eventSnapshot=await transaction.get(eventRef);
        if(!snapshot.exists()) throw new Error('The linked campaign character no longer exists.');
        const canonical=Object.assign({ id:characterId }, snapshot.data());
        const canonicalRewards=Array.isArray(canonical.pendingItemRewards) ? canonical.pendingItemRewards : [];
        const canonicalReward=canonicalRewards.find(reward=>String(reward?.id || '') === String(rewardId));
        if(!canonicalReward) throw new Error('The item reward no longer exists.');
        if(canonicalReward.status === 'accepted' || canonicalReward.status === 'declined'){
          if(eventSnapshot.exists() && !eventSnapshot.data().resolvedAt){
            transaction.set(eventRef, {
              status:canonicalReward.resolution === 'equip' ? 'equipped' : canonicalReward.status,
              deliveryStatus:'acknowledged',
              acknowledged:true,
              acknowledgedBy:currentUser.uid,
              acknowledgedAt:serverTimestamp(),
              resolvedAt:serverTimestamp(),
              updatedAt:serverTimestamp()
            }, { merge:true });
          }
          return { applied:false, character:canonical };
        }

        const submitted=campaignCharacterSnapshot(
          Object.assign({}, canonical, cleanData(character), { id:characterId }),
          campaignId,
          canonical.ownerUid || currentUser.uid
        );
        const submittedRewards=Array.isArray(submitted.pendingItemRewards) ? submitted.pendingItemRewards : [];
        const submittedReward=submittedRewards.find(reward=>String(reward?.id || '') === String(rewardId));
        if(!submittedReward || !['accepted','declined'].includes(submittedReward.status)){
          throw new Error('The item reward must have a final resolution before it can be saved.');
        }
        submitted.resolvedItemRewardIds=uniqueValues(
          canonical.resolvedItemRewardIds,
          submitted.resolvedItemRewardIds,
          [rewardId]
        );
        transaction.set(
          characterRef,
          Object.assign({}, submitted, { updatedAt:serverTimestamp() }),
          { merge:true }
        );
        if(eventSnapshot.exists()){
          transaction.set(eventRef, {
            status:submittedReward.resolution === 'equip' ? 'equipped' : submittedReward.status,
            deliveryStatus:'acknowledged',
            acknowledged:true,
            acknowledgedBy:currentUser.uid,
            acknowledgedAt:serverTimestamp(),
            resolvedAt:serverTimestamp(),
            updatedAt:serverTimestamp()
          }, { merge:true });
        }
        return { applied:true, character:submitted };
      });

      const resolvedCharacter=result?.character;
      if(resolvedCharacter?.ownerUid === currentUser.uid){
        await setDoc(
          doc(db, 'users', currentUser.uid, 'characters', characterId),
          Object.assign({}, cleanData(resolvedCharacter), {
            id:characterId,
            ownerUid:currentUser.uid,
            updatedAt:serverTimestamp()
          }),
          { merge:true }
        );
      }
      return { ok:true, applied:Boolean(result?.applied), character:resolvedCharacter || null };
    }catch(error){
      reportSyncError('campaign-item-reward-resolution', error, { campaignId, characterId, rewardId });
      return { ok:false, applied:false, character:null };
    }
  },
  saveCampaignCharacter: async function(campaignId, characterId, character){
    if(!db || !currentUser || !campaignId || !characterId || !character) return false;
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
      await setDoc(doc(db, 'campaigns', campaignId, 'characters', characterId), Object.assign({}, snapshot, { updatedAt:serverTimestamp() }), { merge:true });
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
  const title = document.querySelector('title'); if(title) title.textContent = 'ASTERIA REACT MIGRATION - MILESTONE 1';
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
      currentUser = null;
      currentProfile = null;
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
