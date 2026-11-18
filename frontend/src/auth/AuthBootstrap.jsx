import React, { useEffect, useState } from 'react';
import { AppServicesProvider } from '../app/AppServices.jsx';
import { createAppServices, previewServices } from '../services/appServices.mjs';
import { AuthProvider } from './AuthProvider.jsx';
import { resolveAuthRuntime } from './authPolicy.mjs';

/**
 * The normal isolated Vite preview is offline/guest-only. An explicit build
 * option opts into the EXISTING Firebase project or local emulator, never both.
 */
export function AuthBootstrap({ children }) {
  const [adapter, setAdapter] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let runtime;
    try {
      runtime = resolveAuthRuntime({
        enabled: import.meta.env.VITE_ASTERIA_AUTH_ENABLED === 'true',
        mode: import.meta.env.VITE_FIREBASE_MODE || '',
        hostname: window.location.hostname
      });
    } catch { setError(true); return undefined; }
    if (!runtime.enabled) return undefined;
    let alive=true;
    import('./firebaseAuthAdapter.mjs')
      .then(module => module.createFirebaseAuthAdapter(runtime))
      .then(client => { if (alive) { setAdapter(client); setError(false); } })
      .catch(() => { if (alive) setError(true); });
    return () => { alive=false; };
  }, []);
  const services = adapter ? createAppServices({auth:adapter,...(adapter.friends?.availability().enabled ? {friends:adapter.friends} : {})}) : previewServices;
  return <AppServicesProvider services={services}>
    <AuthProvider adapter={adapter}>
      {error && <p role="alert" data-testid="site-auth-unavailable">
        Firebase Authentication could not start. Account features remain unavailable.
      </p>}
      {children}
    </AuthProvider>
  </AppServicesProvider>;
}
