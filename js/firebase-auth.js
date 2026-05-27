/* =========================
   Asteria v1.7.2.3 Firebase Account + Data Sync Foundation
   Clean account login + separate account creation page.
   Login uses Username + Password. Account creation captures First Name, Last Name, Email, Username, Password.
   ========================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

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
      const clean = JSON.parse(JSON.stringify(campaign));
      await setDoc(doc(db, 'users', currentUser.uid, 'campaigns', id), Object.assign({}, clean, { id, ownerUid: currentUser.uid, updatedAt: serverTimestamp() }), { merge:true });
      await setDoc(doc(db, 'campaigns', id), Object.assign({}, clean, { id, ownerUid: currentUser.uid, updatedAt: serverTimestamp() }), { merge:true });
      return true;
    }catch(err){ console.warn('Could not save campaign to Firestore.', err); return false; }
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
