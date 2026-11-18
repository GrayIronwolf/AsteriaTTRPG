import { createDisposableScope } from '../runtime/disposableScope.mjs';

/**
 * A single event owner for all React route consumers.
 * The snapshot is a primitive so React.useSyncExternalStore never sees a new
 * object for an unchanged URL. Use a NUL delimiter (URLs encode literal NUL).
 */
export function readLocationKey(location) {
  const search = String(location?.search ?? '');
  const hash = String(location?.hash ?? '');
  return search + '\u0000' + hash;
}

export function parseLocationKey(key) {
  const split = key.indexOf('\u0000');
  if (split < 0) return { search: '', hash: '' };
  return { search: key.slice(0, split), hash: key.slice(split + 1) };
}

export function createLocationStore(source) {
  if (!source || !source.location ||
      typeof source.addEventListener !== 'function' ||
      typeof source.removeEventListener !== 'function') {
    throw new TypeError('A location event source is required');
  }

  const subscribers = new Set();
  let listenerScope = null;
  let lastPublished = readLocationKey(source.location);

  function changed() {
    const next = readLocationKey(source.location);
    if (next === lastPublished) return;
    lastPublished = next;
    for (const subscriber of [...subscribers]) subscriber();
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== 'function') throw new TypeError('Subscriber must be a function');

    // Only one hashchange/popstate pair, even when many React pages subscribe.
    if (subscribers.size === 0) {
      listenerScope = createDisposableScope();
      listenerScope.listen(source, 'hashchange', changed);
      listenerScope.listen(source, 'popstate', changed);
    }
    subscribers.add(subscriber);
    // Covers a location update between React render and subscription.
    changed();

    let connected = true;
    return () => {
      if (!connected) return;
      connected = false;
      subscribers.delete(subscriber);
      if (subscribers.size === 0 && listenerScope) {
        listenerScope.dispose();
        listenerScope = null;
        lastPublished = readLocationKey(source.location);
      }
    };
  }

  return Object.freeze({
    subscribe,
    getSnapshot: () => readLocationKey(source.location),
    getServerSnapshot: () => '\u0000',
    getSubscriberCount: () => subscribers.size
  });
}

let browserStore = null;
export function getBrowserLocationStore() {
  // No module-time window access or legacy global function replacement.
  if (browserStore === null) browserStore = createLocationStore(window);
  return browserStore;
}
