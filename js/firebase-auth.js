/* =========================
   Asteria v1.7.2.3 Firebase Account + Data Sync Foundation
   Clean account login + separate account creation page.
   Login uses Username + Password. Account creation captures First Name, Last Name, Email, Username, Password.
   ========================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, onSnapshot, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBCFapadl9W4WCouRsKuMPWOZPHQuNjea0',
  authDomain: 'asteria-ttrpg.firebaseapp.com',
  projectId: 'asteria-ttrpg',
  storageBucket: 'asteria-ttrpg.firebasestorage.app',
  messagingSenderId: '549905451812',
  appId: '1:549905451812:web:5e2a9c170984c175e8c1b1',
  measurementId: 'G-FVD0YYJ0HP'
};

let app, auth, db, currentUser = null, currentProfile = null;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(err => console.warn('Firebase persistence setup failed.', err));
  db = getFirestore(app);
} catch (err) {
  console.warn('Firebase failed to initialise. Account login requires Firebase setup.', err);
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
  return Object.assign({}, shared, local, {
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

window.AsteriaFirebase = {
  isReady:()=>Boolean(db && currentUser),
  getUser:()=>currentUser,
  getProfile:()=>currentProfile,
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
      const snap = await getDocs(collection(db, 'users', currentUser.uid, 'campaigns'));
      const campaigns = [];
      for(const item of snap.docs){
        const accountCampaign = Object.assign({}, item.data(), { id:item.id });
        let campaign = accountCampaign;
        try{
          const sharedSnap = await getDoc(doc(db, 'campaigns', item.id));
          if(sharedSnap.exists()) campaign = mergeSharedCampaign(accountCampaign, Object.assign({}, sharedSnap.data(), { id:item.id }));
        }catch(err){ console.warn(`Could not refresh shared campaign ${item.id}.`, err); }
        try{
          const ecosystemSnap = await getDoc(doc(db, 'campaigns', item.id, 'systems', 'itemEcosystem'));
          if(ecosystemSnap.exists()) campaign.itemEcosystem = ecosystemSnap.data();
        }catch(err){ console.warn(`Could not load the shared item ecosystem for ${item.id}.`, err); }
        const sharedCharacters = {};
        try{
          const characterSnap = await getDocs(collection(db, 'campaigns', item.id, 'characters'));
          characterSnap.forEach(characterDoc=>{ sharedCharacters[characterDoc.id] = Object.assign({ id:characterDoc.id }, characterDoc.data()); });
        }catch(err){ console.warn(`Could not load shared campaign characters for ${item.id}.`, err); }
        hydrateSharedCampaignCharacters(campaign, sharedCharacters);
        campaigns.push(campaign);
      }
      return campaigns;
    }catch(err){ console.warn('Could not load campaigns from Firestore.', err); return []; }
  },
  subscribeCampaign: function(campaignId, onChange){
    if(!db || !currentUser || !campaignId || typeof onChange !== 'function') return ()=>{};
    return onSnapshot(
      doc(db, 'campaigns', campaignId),
      snapshot=>{
        if(snapshot.exists()) onChange(Object.assign({}, snapshot.data(), { id:snapshot.id }));
      },
      err=>console.warn(`Could not watch shared campaign ${campaignId}.`, err)
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
      err=>console.warn(`Could not watch the shared item ecosystem for campaign ${campaignId}.`, err)
    );
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
      err=>console.warn(`Could not watch shared characters for campaign ${campaignId}.`, err)
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
  saveCampaignCharacterProgress: async function(campaignId, characterId, character){
    if(!db || !currentUser || !campaignId || !characterId || !character) return false;
    try{
      const ownerUid=character.ownerUid || '';
      const progressionPayload={
        id:characterId,
        sourceCharacterId:character.sourceCharacterId || characterId,
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
        updatedAt:serverTimestamp()
      };
      if(ownerUid) progressionPayload.ownerUid=ownerUid;
      await setDoc(
        doc(db, 'campaigns', campaignId, 'characters', characterId),
        progressionPayload,
        { merge:true }
      );
      return true;
    }catch(err){
      console.warn('Could not publish the campaign character progression.', err);
      return false;
    }
  },
  saveCampaignProgression: async function(campaignId, characterId, character){
    if(!db || !currentUser || !campaignId || !characterId || !character) return false;
    try{
      const progressionRef=doc(db, 'campaigns', campaignId, 'systems', 'progression');
      await runTransaction(db, async transaction=>{
        const progressionDoc=await transaction.get(progressionRef);
        const current=progressionDoc.exists() ? progressionDoc.data() : {};
        const characters=Object.assign({},current.characters || {});
        characters[characterId]={
          id:characterId,
          ownerUid:character.ownerUid || '',
          sourceCharacterId:character.sourceCharacterId || characterId,
          level:Number(character.level || 0),
          xp:Number(character.xp || 0),
          xpMax:Number(character.xpMax || 1000),
          cp:Number(character.cp || 0),
          tp:Number(character.tp || 0),
          pendingSkillChoices:Number(character.pendingSkillChoices || 0),
          dashboardNotifications:cleanData(character.dashboardNotifications || []),
          progressionSync:cleanData(character.progressionSync || {}),
          updatedAt:new Date().toISOString()
        };
        transaction.set(
          progressionRef,
          {
            version:'asteria-campaign-progression-v1',
            characters,
            updatedBy:currentUser.uid,
            updatedAt:serverTimestamp()
          },
          { merge:true }
        );
      });
      return true;
    }catch(err){
      console.warn('Could not publish the authoritative campaign progression.', err);
      return false;
    }
  },
  saveCampaignCharacter: async function(campaignId, characterId, character){
    if(!db || !currentUser || !campaignId || !characterId || !character) return false;
    try{
      const snapshot = campaignCharacterSnapshot(Object.assign({}, character, { id:characterId }), campaignId, character.ownerUid || currentUser.uid);
      await setDoc(doc(db, 'campaigns', campaignId, 'characters', characterId), Object.assign({}, snapshot, { updatedAt:serverTimestamp() }), { merge:true });
      return true;
    }catch(err){ console.warn('Could not save the shared campaign character.', err); return false; }
  },
  loadCharacters: async function(){
    if(currentUser) await loadCharacters(currentUser);
  }
};

document.addEventListener('DOMContentLoaded', ()=>{
  const panel = $('loginPanel');
  if(panel) panel.innerHTML = authPanelHtml();
  const title = document.querySelector('title'); if(title) title.textContent = 'ASTERIA AUTH + WORKSPACE DASHBOARD SYSTEM v1';
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

if(auth){
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
