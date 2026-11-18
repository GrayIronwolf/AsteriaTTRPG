/**
 * The React/Vite app uses the SAME Asteria Firebase project as the live site.
 * Auth is opt-in during isolated development, never silently enabled by a
 * localhost URL, a cached username or injected query parameters.
 *
 * Firebase web config is public client configuration, not a service secret.
 */
export const PRODUCTION_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyBCFapadl9W4WCouRsKuMPWOZPHQuNjea0',
  authDomain: 'asteria-ttrpg.firebaseapp.com',
  projectId: 'asteria-ttrpg',
  storageBucket: 'asteria-ttrpg.firebasestorage.app',
  messagingSenderId: '549905451812',
  appId: '1:549905451812:web:5e2a9c170984c175e8c1b1',
  measurementId: 'G-FVD0YYJ0HP'
});

export const EMULATOR_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'demo-key',
  authDomain: 'demo-asteria.firebaseapp.com',
  projectId: 'demo-asteria',
  storageBucket: 'demo-asteria.appspot.com',
  appId: 'demo-app'
});

export function resolveAuthRuntime({ enabled = false, mode = '', hostname = '' } = {}) {
  if (enabled !== true) return Object.freeze({ enabled: false, mode: 'disabled' });
  if (mode !== 'production' && mode !== 'emulator') {
    throw new Error('Explicit production or emulator Firebase mode is required');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(String(hostname).toLowerCase());
  if (mode === 'emulator' && !local) {
    throw new Error('Firebase emulator mode is restricted to loopback browsers');
  }
  return Object.freeze({
    enabled: true,
    mode,
    projectId: mode === 'emulator' ? EMULATOR_FIREBASE_CONFIG.projectId
      : PRODUCTION_FIREBASE_CONFIG.projectId,
    config: mode === 'emulator' ? EMULATOR_FIREBASE_CONFIG : PRODUCTION_FIREBASE_CONFIG
  });
}

export function validateLoginInput({ email = '', password = '' } = {}) {
  const value = String(email).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) {
    throw new Error('Enter a valid email address.');
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Enter your password.');
  }
  return { email: value, password };
}

export function validateResetEmail(value) {
  const email = String(value ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

export function friendlyAuthError(error, action = 'login') {
  const code = String(error?.code || '');
  if (['auth/invalid-credential','auth/wrong-password','auth/user-not-found',
       'auth/invalid-login-credentials','auth/invalid-email'].includes(code) && action === 'login') {
    return 'Unable to sign in with those credentials.';
  }
  if (code === 'auth/email-already-in-use' && action === 'create') {
    return 'This email address cannot be registered. Try signing in or resetting your password.';
  }
  if (['auth/too-many-requests', 'auth/quota-exceeded'].includes(code)) {
    return 'Too many requests. Try again later.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Cannot reach Firebase. Check your connection and try again.';
  }
  if (code === 'auth/weak-password') {
    return 'Use a stronger password (at least six characters).';
  }
  if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
    return 'Email/password authentication is not available for this Firebase project.';
  }
  // Do not expose raw Firebase messages, account identifiers, email addresses,
  // backend URLs or profile ownership details from an exception.
  if (action === 'reset') return 'Password reset could not be requested at this time.';
  if (action === 'create') return 'Account setup could not be completed. Check your connection and try signing in.';
  if (action === 'logout') return 'Sign-out could not be completed. Please retry.';
  return 'Authentication is temporarily unavailable.';
}

export const GENERIC_RESET_SUCCESS =
  'If an account exists for that address, a password-reset email will be sent.';
