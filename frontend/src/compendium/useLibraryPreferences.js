import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { createLibraryPreferenceStore, libraryPreferenceScope } from './libraryPreferences.mjs';

const store = createLibraryPreferenceStore(
  () => typeof window === 'undefined' ? null : window.localStorage,
  handleStorage => {
    window.addEventListener('storage',handleStorage);
    return () => window.removeEventListener('storage',handleStorage);
  }
);

export function useLibraryPreferences() {
  const {session} = useAuth();
  const scope = libraryPreferenceScope(session);
  const snapshot = useCallback(() => store.getSnapshot(scope),[scope]);
  const subscribe = useCallback(notify => store.subscribe(scope,notify),[scope]);
  const {favourites,recent} = useSyncExternalStore(subscribe,snapshot,snapshot);
  const isFavourite = useCallback(entry => favourites.includes(entry?.id),[favourites]);
  const toggleFavourite = useCallback(entry => store.toggleFavourite(scope,entry?.id),[scope]);
  const recordRecent = useCallback(entry => store.recordRecent(scope,entry?.id),[scope]);
  return {favourites,recent,isFavourite,toggleFavourite,recordRecent,preferencesReady:scope!==null};
}
