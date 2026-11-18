import {
  EMULATOR_FIREBASE_CONFIG, PRODUCTION_FIREBASE_CONFIG,
  validateLoginInput, validateResetEmail, GENERIC_RESET_SUCCESS
} from './authPolicy.mjs';
import { createAuthObserver, ownedProfile } from './authSessionModel.mjs';
import { validateAccountRegistrationFields } from '../../../src/state/accountRegistrationRecovery.mjs';
import { finalizeRegisteredAccountId } from '../../../src/state/accountIdRegistration.mjs';
import { canSendVerificationEmail } from '../../../src/state/accountEmailVerification.mjs';
import { validatedEditableProfile, proposedAccountUsername, accountAvatarPath } from '../../../src/state/accountProfileEdit.mjs';
import { accountProfileProjection } from './accountProfileModel.mjs';
import { cropAccountAvatar } from './avatarProcessor.mjs';
import { createFirebaseFriendsService } from '../friends/firebaseFriendsService.mjs';
import { createFirebaseNotificationsService } from '../notifications/firebaseNotificationsService.mjs';
import { createFirebaseCharactersService } from '../forge/firebaseCharactersService.mjs';
import { createFirebaseCampaignsService } from '../campaigns/firebaseCampaignsService.mjs';
import { createFirebaseCampaignConnectionService } from '../campaigns/firebaseCampaignConnectionService.mjs';
import {
  readCloudAppearance as decodeCloudAppearance, cloudAppearancePatch, appearanceRevisionsMatch
} from './accountAppearanceBridge.mjs';

let singleton = null;

function validateExistingApp(app, projectId) {
  if (!app || app.options?.projectId !== projectId) {
    throw new Error('The active Firebase app does not match the selected Asteria project');
  }
  return app;
}

/**
 * Only one app, Auth, Firestore and Functions client in this isolated runtime.
 * SDK dependencies are loaded lazily when explicitly enabled by build config.
 */
export async function createFirebaseAuthAdapter(runtime) {
  if (runtime?.enabled !== true) throw new Error('React Auth must be explicitly enabled');
  const projectId = runtime.projectId;
  if (singleton) {
    if (singleton.projectId !== projectId) throw new Error('Firebase project switched without reload');
    return singleton.promise;
  }
  const promise = initializeClient(runtime);
  singleton = {projectId, promise};
  try { return await promise; }
  catch (error) { singleton = null; throw error; }
}

async function initializeClient(runtime) {
  const [appSdk, authSdk, firestoreSdk, functionsSdk, storageSdk] = await Promise.all([
    import('firebase/app'), import('firebase/auth'),
    import('firebase/firestore'), import('firebase/functions'), import('firebase/storage')
  ]);
  const config = runtime.mode === 'emulator' ? EMULATOR_FIREBASE_CONFIG
    : PRODUCTION_FIREBASE_CONFIG;
  const app = validateExistingApp(
    appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(config),
    runtime.projectId
  );
  const auth = authSdk.getAuth(app);
  const db = firestoreSdk.getFirestore(app);
  const functions = functionsSdk.getFunctions(app, 'us-central1');
  const storage = storageSdk.getStorage(app);
  if (runtime.mode === 'emulator') {
    authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
    firestoreSdk.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    functionsSdk.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    storageSdk.connectStorageEmulator(storage, '127.0.0.1', 9199);
  }
  await authSdk.setPersistence(auth, typeof window === 'undefined'
    ? authSdk.inMemoryPersistence : authSdk.browserLocalPersistence);

  const readCanonical = async user => {
    if (!user?.uid || auth.currentUser?.uid !== user.uid) return null;
    const snapshot = await firestoreSdk.getDocFromServer(
      firestoreSdk.doc(db, 'users', user.uid)
    );
    if (auth.currentUser?.uid !== user.uid || !snapshot.exists()) return null;
    const profile = snapshot.data();
    return ownedProfile(user, profile) ? profile : null;
  };
  const subscribe = publish => createAuthObserver({
    observe: (next, error) => authSdk.onAuthStateChanged(auth, next, error),
    readProfile: readCanonical,
    publish
  });

  async function createAccount(fields = {}) {
    const valid = validateAccountRegistrationFields(fields);
    if (!valid.ok) throw new Error(valid.message);
    // Firebase Auth creation is irreversible from this form. If a subsequent
    // Firestore step fails, do not create a second user or report a rollback.
    const email = fields.email.trim();
    const username = fields.username.trim();
    const userCredential = await authSdk.createUserWithEmailAndPassword(auth,email,fields.password);
    const user = userCredential.user;
    const warnings = [];
    try { await authSdk.updateProfile(user, {displayName:username}); }
    catch { warnings.push('The profile display name could not be confirmed.'); }

    const reference = firestoreSdk.doc(db, 'users', user.uid);
    let stored = false, accountId = null;
    try {
      await firestoreSdk.setDoc(reference, {
        uid:user.uid, email:user.email || email, username,
        usernameLower:username.toLowerCase(), firstName:fields.firstName.trim(),
        lastName:fields.lastName.trim(), role:'account', characters:[],
        createdAt:firestoreSdk.serverTimestamp()
      }, {merge:true});
      const profile = await readCanonical(user);
      stored = Boolean(profile && profile.username === username);
    } catch { /* Never use local profiles as proof of canonical registration. */ }
    if (!stored) {
      warnings.push('Firebase Auth account was created, but its saved profile is pending. Sign in again after connectivity is restored.');
    } else {
      try {
        // Same trusted, server-owned Account ID workflow as the live website.
        // Callable performs uniqueness and rollout checks; browser never writes
        // accountIdRegistry/accountIdAssignments or supplies a desired suffix.
        const result = await finalizeRegisteredAccountId({
          enabled:true,uid:user.uid,username,
          requestAssignment:request => functionsSdk.httpsCallable(functions,'asteriaAccountIdentity')(request),
          readProfile:() => readCanonical(user)
        });
        accountId = result?.accountId ?? null;
      } catch {
        warnings.push('Account ID assignment is pending. Your account exists; do not register again.');
      }
    }
    let verificationSent = false;
    if (canSendVerificationEmail(user)) {
      try {
        await authSdk.sendEmailVerification(user);
        verificationSent = true;
      } catch {
        warnings.push('Verification email could not be sent. Use Account Security to resend it later.');
      }
    }
    return Object.freeze({created:true,profileStored:stored,accountId,verificationSent,warnings});
  }

  
  // Phase 4.2: each operation is bound to the currently authenticated owner.
  // Private data is never read from a local cache or an arbitrary UID.
  function signedOwner() {
    const user = auth.currentUser;
    if (!user?.uid) throw new Error('Sign in before accessing account details.');
    return user;
  }
  function assertOwner(uid) {
    if (!auth.currentUser || auth.currentUser.uid !== uid)
      throw new Error('The signed-in account changed. Reload your account page.');
  }
  async function verifiedOwner() {
    const user = signedOwner();
    const profile = await readCanonical(user);
    assertOwner(user.uid);
    const projection = accountProfileProjection(user, profile);
    if (!projection) throw new Error('Your saved account profile could not be verified.');
    return {user,profile,projection};
  }
  async function readProfile() {
    return (await verifiedOwner()).projection;
  }
  async function saveProfile(input) {
    const clean = validatedEditableProfile(input);
    const {user} = await verifiedOwner();
    const reference = firestoreSdk.doc(db, 'users', user.uid);
    await firestoreSdk.runTransaction(db, async transaction => {
      const snapshot = await transaction.get(reference);
      assertOwner(user.uid);
      if (!snapshot.exists() || !accountProfileProjection(user,snapshot.data()))
        throw new Error('Your account profile needs verification.');
      transaction.update(reference,{...clean,updatedAt:firestoreSdk.serverTimestamp()});
    });
    assertOwner(user.uid);
    return readProfile();
  }
  async function usernameAvailable() {
    const {user,projection} = await verifiedOwner();
    if (projection.status !== 'assigned') return false;
    try {
      const response = await functionsSdk.httpsCallable(functions,'asteriaAccountUsername')({action:'status'});
      assertOwner(user.uid);
      return response.data?.available === true;
    } catch { return false; }
  }
  async function renameUsername(value) {
    const {user,projection} = await verifiedOwner();
    const candidate = proposedAccountUsername(value,projection.accountNumber);
    if (candidate.username === projection.username)
      return {unchanged:true,accountId:projection.accountId};
    const eligible = await usernameAvailable();
    assertOwner(user.uid);
    if (!eligible) throw new Error('Username changes are not currently enabled for this account.');
    const result = await functionsSdk.httpsCallable(functions,'asteriaAccountUsername')({
      username:candidate.username,expectedAccountId:projection.accountId
    });
    assertOwner(user.uid);
    const updated = await readProfile();
    if (updated.status !== 'assigned' || updated.accountId !== candidate.accountId ||
        updated.username !== candidate.username || updated.accountNumber !== projection.accountNumber ||
        result.data?.accountId !== candidate.accountId) {
      throw new Error('Username may have changed, but confirmation failed. Refresh your profile.');
    }
    return {username:updated.username,accountId:updated.accountId};
  }
  async function readAvatar() {
    const {user,projection} = await verifiedOwner();
    if (!projection.avatarVersion) return null;
    try {
      const url = await storageSdk.getDownloadURL(storageSdk.ref(storage,accountAvatarPath(user.uid)));
      assertOwner(user.uid);
      return typeof url === 'string' && url.startsWith('http') ? url : null;
    } catch (error) {
      assertOwner(user.uid);
      if (error?.code === 'storage/object-not-found') return null;
      throw error;
    }
  }
  async function uploadAvatar(file) {
    const {user} = await verifiedOwner();
    const blob = await cropAccountAvatar(file);
    assertOwner(user.uid);
    await storageSdk.uploadBytes(storageSdk.ref(storage,accountAvatarPath(user.uid)),blob,{
      contentType:'image/webp',cacheControl:'private,max-age=300'
    });
    assertOwner(user.uid);
    const reference = firestoreSdk.doc(db,'users',user.uid);
    await firestoreSdk.runTransaction(db,async transaction=>{
      const snapshot=await transaction.get(reference);
      assertOwner(user.uid);
      if(!snapshot.exists() || !accountProfileProjection(user,snapshot.data()))
        throw new Error('Your account profile needs verification.');
      transaction.update(reference,{
        avatarUpdatedAt:firestoreSdk.serverTimestamp(),updatedAt:firestoreSdk.serverTimestamp()
      });
    });
    assertOwner(user.uid);
    return readProfile();
  }
  async function removeAvatar() {
    const {user} = await verifiedOwner();
    const reference=firestoreSdk.doc(db,'users',user.uid);
    await firestoreSdk.runTransaction(db,async transaction=>{
      const snapshot=await transaction.get(reference);
      assertOwner(user.uid);
      if(!snapshot.exists() || !accountProfileProjection(user,snapshot.data()))
        throw new Error('Your account profile needs verification.');
      transaction.update(reference,{
        avatarUpdatedAt:null,updatedAt:firestoreSdk.serverTimestamp()
      });
    });
    assertOwner(user.uid);
    try { await storageSdk.deleteObject(storageSdk.ref(storage,accountAvatarPath(user.uid))); }
    catch(error) { if(error?.code !== 'storage/object-not-found') throw error; }
    assertOwner(user.uid);
    return readProfile();
  }
  async function sendOwnPasswordReset() {
    const user=signedOwner();
    if (!user.email) throw new Error('An account email is required.');
    await authSdk.sendPasswordResetEmail(auth,user.email);
    assertOwner(user.uid);
    return {requested:true};
  }
  async function checkVerification() {
    const user=signedOwner();
    await authSdk.reload(user);
    assertOwner(user.uid);
    return {verified:user.emailVerified === true};
  }
  async function readAppearancePreferences() {
    const user=signedOwner();
    const ref=firestoreSdk.doc(db,'users',user.uid,'settings','appearance');
    const snapshot=await firestoreSdk.getDocFromServer(ref);
    assertOwner(user.uid);
    // Revision metadata is owned, read directly from Firestore, never from storage.
    return decodeCloudAppearance(snapshot.exists()?snapshot.data():null);
  }
  async function saveAppearancePreferences(appearance,expected) {
    const user=signedOwner();
    const ref=firestoreSdk.doc(db,'users',user.uid,'settings','appearance');
    const result=await firestoreSdk.runTransaction(db,async transaction=>{
      const snap=await transaction.get(ref);
      assertOwner(user.uid);
      const current=snap.exists()?snap.data():{};
      if(!appearanceRevisionsMatch(current,expected))
        return {ok:false,conflict:true};
      const patch=cloudAppearancePatch(appearance,current),updated=firestoreSdk.serverTimestamp();
      transaction.set(ref,{
        theme:{...patch.theme,updatedAt:updated},
        typography:{...patch.typography,updatedAt:updated}
      },{merge:true});
      return {ok:true};
    });
    assertOwner(user.uid);
    if(!result.ok)return result;
    return {ok:true,cloud:await readAppearancePreferences()};
  }

  const friends = createFirebaseFriendsService({auth,functions,functionsSdk,
    flags:Object.freeze({enabled:import.meta.env.VITE_ASTERIA_FRIENDS_ENABLED==='true',
      lookup:import.meta.env.VITE_ASTERIA_FRIENDS_ENABLED==='true',
      requests:import.meta.env.VITE_ASTERIA_FRIENDS_ENABLED==='true'})});
  const notifications=createFirebaseNotificationsService({auth,functions,functionsSdk,
    flags:Object.freeze({
      social:import.meta.env.VITE_ASTERIA_SOCIAL_NOTIFICATIONS_ENABLED==='true',
      campaign:import.meta.env.VITE_ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED==='true'
    })});
  const characters=createFirebaseCharactersService({auth,db,firestoreSdk,readCanonical,
    enabled:import.meta.env.VITE_ASTERIA_CHARACTER_FORGE_ENABLED==='true'});
  const campaignConnections=createFirebaseCampaignConnectionService({
    auth,functions,functionsSdk,readCanonical,
    enabled:import.meta.env.VITE_ASTERIA_CAMPAIGN_CONNECTIONS_ENABLED==='true'
  });
  const campaigns=createFirebaseCampaignsService({
    auth,db,firestoreSdk,functions,functionsSdk,storage,storageSdk,readCanonical,
    enabled:import.meta.env.VITE_ASTERIA_CAMPAIGN_FORGE_ENABLED==='true' ||
      import.meta.env.VITE_ASTERIA_CAMPAIGN_CONNECTIONS_ENABLED==='true',
    connections:campaignConnections
  });
  return Object.freeze({
    friends,notifications,characters,campaigns,
    subscribe,
    readProfile,saveProfile,usernameAvailable,renameUsername,
    readAvatar,uploadAvatar,removeAvatar,sendOwnPasswordReset,checkVerification,
    readAppearancePreferences,saveAppearancePreferences,
    async refresh() {
      const user = auth.currentUser;
      if (!user) return safeGuest();
      return (await import('./authSessionModel.mjs')).safeAuthSession(user, await readCanonical(user));
    },
    async signIn(input) {
      const {email,password} = validateLoginInput(input);
      const result = await authSdk.signInWithEmailAndPassword(auth,email,password);
      return {signedIn:Boolean(result.user?.uid)};
    },
    createAccount,
    async signOut() {
      await authSdk.signOut(auth);
      return {signedOut:!auth.currentUser};
    },
    async resetPassword(input) {
      const email = validateResetEmail(input?.email);
      try { await authSdk.sendPasswordResetEmail(auth, email); }
      catch (error) {
        // Do not leak account enumeration from reset failures.
        if (!['auth/user-not-found','auth/invalid-email'].includes(error?.code)) throw error;
      }
      return {message:GENERIC_RESET_SUCCESS};
    },
    async resendVerification() {
      const user = auth.currentUser;
      if (!canSendVerificationEmail(user)) {
        throw new Error('Sign in to an unverified account to request another email.');
      }
      await authSdk.sendEmailVerification(user);
      return {sent:true};
    },
    currentUid() { return auth.currentUser?.uid ?? null; }
  });
}

function safeGuest() {
  return Object.freeze({status:'guest',user:null,identity:null});
}
