import { useMemo, useSyncExternalStore } from 'react';
import { getBrowserLocationStore, parseLocationKey } from './locationStore.mjs';
import { parseSiteRoute } from './siteRoutes.mjs';

/**
 * One stable primitive location snapshot shared across all React consumers.
 * The store owns browser event subscriptions; this hook only parses the route.
 */
export function useSiteRoute() {
  const store = getBrowserLocationStore();
  const locationKey = useSyncExternalStore(
    store.subscribe, store.getSnapshot, store.getServerSnapshot
  );
  return useMemo(
    () => parseSiteRoute(parseLocationKey(locationKey)),
    [locationKey]
  );
}
