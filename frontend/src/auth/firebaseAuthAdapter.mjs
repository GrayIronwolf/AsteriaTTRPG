import {
  EMULATOR_FIREBASE_CONFIG, PRODUCTION_FIREBASE_CONFIG,
  validateLoginInput, validateResetEmail, GENERIC_RESET_SUCCESS
} from './authPolicy.mjs';
import { createAuthObserver, ownedProfile } from './authSessionModel.mjs';
import { validateAccountRegistrationFields } from '../../../src/state/accountRegistrationRecovery.mjs';
import { finalizeRegisteredAccountId } from '../../../src/state/accountIdRegistration.mjs';
import { canSendVerificationEmail } from '../../../src/state/accountEmailVerification.mjs';

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
  const [appSdk, authSdk, firestoreSdk, functionsSdk] = await Promise.all([
    import('firebase/app'), import('firebase/auth'),
    import('firebase/firestore'), import('firebase/functions')
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
  if (runtime.mode === 'emulator') {
    authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
    firestoreSdk.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    functionsSdk.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
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

  return Object.freeze({
    subscribe,
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
