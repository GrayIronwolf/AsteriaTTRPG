import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { buildReactRoute, parseReactRoute } from './asteriaRoutes.mjs';

const AsteriaAppContext = createContext(null);

function accountSnapshot() {
  const user = firebaseService.currentUser();
  const profile = firebaseService.currentProfile();
  return { user, profile, authenticated:Boolean(user) };
}

export function AsteriaAppProvider({ children }) {
  const [route, setRoute] = useState(() => parseReactRoute(window.location.hash));
  const [account, setAccount] = useState(accountSnapshot);

  useEffect(() => {
    const updateRoute = () => setRoute(parseReactRoute(window.location.hash));
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  useEffect(() => {
    const updateAccount = () => setAccount(accountSnapshot());
    window.addEventListener('asteria:firebase-ready', updateAccount);
    window.addEventListener('asteria:auth-changed', updateAccount);
    return () => {
      window.removeEventListener('asteria:firebase-ready', updateAccount);
      window.removeEventListener('asteria:auth-changed', updateAccount);
    };
  }, []);

  const navigate = useCallback(nextRoute => {
    const hash = buildReactRoute(nextRoute);
    window.location.hash = hash;
    return hash;
  }, []);

  const value = useMemo(() => ({ route, account, navigate }), [account, navigate, route]);
  return <AsteriaAppContext.Provider value={value}>{children}</AsteriaAppContext.Provider>;
}

export function useAsteriaApp() {
  const value = useContext(AsteriaAppContext);
  if(!value) throw new Error('useAsteriaApp must be used inside AsteriaAppProvider.');
  return value;
}

