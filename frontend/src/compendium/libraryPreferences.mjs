import { isVerifiedOwnedSession } from '../auth/accountSecurityPolicy.mjs';

const LIMIT = 100;
const KINDS = ['favourites','recent'];
const EMPTY = Object.freeze({favourites:Object.freeze([]),recent:Object.freeze([])});
const keyFor = (kind,scope) => 'asteria.library.'+kind+'.'+scope;

export function libraryPreferenceScope(session) {
  if (session?.status === 'checking') return null;
  return isVerifiedOwnedSession(session) ? session.user.uid : 'guest';
}

function readIds(raw) {
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) {
      return [...new Set(value.filter(id => typeof id === 'string' && id.length > 0))].slice(0,LIMIT);
    }
  } catch { /* Treat corrupt data as empty. */ }
  return [];
}

export function createLibraryPreferenceStore(getStorage, connect = null) {
  const states = new Map();
  const subscribers = new Map();
  const unsaved = new Set();
  let disconnect;

  function replace(scope,kind,next) {
    const previous = states.get(scope) || EMPTY;
    if (previous[kind].length === next.length && previous[kind].every((id,index) => id === next[index])) return;
    states.set(scope,Object.freeze({...previous,[kind]:Object.freeze(next)}));
    subscribers.get(scope)?.forEach(notify => notify());
  }

  function refresh(scope,kind) {
    const key = keyFor(kind,scope);
    if (unsaved.has(key)) return;
    try {
      const storage = getStorage();
      if (storage) replace(scope,kind,readIds(storage.getItem(key)));
    } catch { /* Keep this tab's in-memory preferences while storage is unavailable. */ }
  }

  function getSnapshot(scope) {
    if (scope === null) return EMPTY;
    if (!states.has(scope)) {
      states.set(scope,EMPTY);
      for (const kind of KINDS) refresh(scope,kind);
    }
    return states.get(scope);
  }

  function update(scope,kind,id,transform) {
    if (scope === null || typeof id !== 'string' || !id) return;
    getSnapshot(scope);
    refresh(scope,kind);
    const present = getSnapshot(scope)[kind];
    const next = transform(present,id).slice(0,LIMIT);
    if (present.length === next.length && present.every((value,index) => value === next[index])) return;
    const key = keyFor(kind,scope);
    try {
      const storage = getStorage();
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(key,JSON.stringify(next));
      unsaved.delete(key);
    } catch {
      unsaved.add(key);
    }
    replace(scope,kind,next);
  }

  function handleStorage(event) {
    try {
      if (event.storageArea && event.storageArea !== getStorage()) return;
    } catch { return; }
    for (const scope of states.keys()) {
      for (const kind of KINDS) {
        const key = keyFor(kind,scope);
        if (event.key !== null && event.key !== key) continue;
        unsaved.delete(key);
        refresh(scope,kind);
      }
    }
  }

  function subscribe(scope,notify) {
    if (scope === null) return () => {};
    getSnapshot(scope);
    // Re-read after mounting even if this tab cached the scope while unsubscribed.
    for (const kind of KINDS) refresh(scope,kind);
    if (!subscribers.size && connect) disconnect = connect(handleStorage);
    const callbacks = subscribers.get(scope) || new Set();
    callbacks.add(notify);
    subscribers.set(scope,callbacks);
    return () => {
      callbacks.delete(notify);
      if (!callbacks.size) subscribers.delete(scope);
      if (!subscribers.size) {
        disconnect?.();
        disconnect = undefined;
      }
    };
  }

  return {
    getSnapshot, subscribe, handleStorage,
    toggleFavourite(scope,id) {
      update(scope,'favourites',id,(rows,key) =>
        rows.includes(key) ? rows.filter(value => value !== key) : [key,...rows]);
    },
    recordRecent(scope,id) {
      update(scope,'recent',id,(rows,key) => [key,...rows.filter(value => value !== key)]);
    }
  };
}
