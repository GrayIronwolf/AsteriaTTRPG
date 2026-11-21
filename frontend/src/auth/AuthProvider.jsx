import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { friendlyAuthError } from './authPolicy.mjs';

const GUEST = Object.freeze({status:'guest',user:null,identity:null});
const CHECKING = Object.freeze({status:'checking',user:null,identity:null});
const AuthContext = createContext(null);

/** Exactly one Firebase onAuthStateChanged subscription per enabled provider. */
export function AuthProvider({ adapter = null, initializing = false, children }) {
  const [snapshot, setSnapshot] = useState(() => ({adapter,session:adapter?CHECKING:GUEST}));
  const waiting = initializing || (adapter && snapshot.adapter !== adapter);
  const session = waiting ? CHECKING : adapter ? snapshot.session : GUEST;
  const setSession = useCallback(value => setSnapshot({adapter,session:value}),[adapter]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!adapter) return undefined;
    return adapter.subscribe(setSession);
  }, [adapter,setSession]);

  const run = useCallback(async (action, callback) => {
    if (!adapter) return {ok:false,error:'Authentication is unavailable in this preview.'};
    setBusy(true);
    try {
      const data = await callback();
      // Refresh canonical owner-scoped profile after registration and login;
      // stale Firebase auth callbacks never grant private feature access.
      if (['login','create','profile-save','username','avatar-upload','avatar-remove','verification-check'].includes(action))
        setSession(await adapter.refresh());
      else if (action === 'logout') setSession(GUEST);
      return {ok:true,data};
    } catch(error) {
      return {ok:false,error:friendlyAuthError(error,action)};
    } finally {
      setBusy(false);
    }
  }, [adapter,setSession]);

  const actions = useMemo(() => ({
    signIn: input => run('login', () => adapter.signIn(input)),
    createAccount: input => run('create', () => adapter.createAccount(input)),
    resetPassword: input => run('reset', () => adapter.resetPassword(input)),
    signOut: () => run('logout', () => adapter.signOut()),
    resendVerification: () => run('verification', () => adapter.resendVerification()),
    readProfile: () => adapter.readProfile(),
    saveProfile: data => run('profile-save', () => adapter.saveProfile(data)),
    usernameAvailable: () => adapter.usernameAvailable(),
    renameUsername: username => run('username', () => adapter.renameUsername(username)),
    readAvatar: () => adapter.readAvatar(),
    uploadAvatar: file => run('avatar-upload', () => adapter.uploadAvatar(file)),
    removeAvatar: () => run('avatar-remove', () => adapter.removeAvatar()),
    sendOwnPasswordReset: () => run('password-own', () => adapter.sendOwnPasswordReset()),
    checkVerification: () => run('verification-check', () => adapter.checkVerification()),
    readAppearancePreferences: () => adapter.readAppearancePreferences(),
    saveAppearancePreferences: (value,revisions) =>
      run('appearance-save', () => adapter.saveAppearancePreferences(value,revisions))
  }), [adapter,run]);

  return <AuthContext.Provider value={{ session, busy, available:Boolean(adapter), actions }}>
    {children}
  </AuthContext.Provider>;
}

/** Default guest state also supports isolated visual fixtures without Firebase. */
export function useAuth() {
  return useContext(AuthContext) ?? {session:GUEST,busy:false,available:false,actions:null};
}
