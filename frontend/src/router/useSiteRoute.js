import { useEffect, useState } from 'react';
import { parseSiteRoute } from './siteRoutes.mjs';

function readCurrentRoute() {
  return parseSiteRoute({ hash: window.location.hash, search: window.location.search });
}

/**
 * New app's only location subscriber. Native anchors own history; both
 * browser traversal and direct hash navigation update the React outlet.
 * Listeners are cleaned up when StrictMode remounts this hook.
 */
export function useSiteRoute() {
  const [route, setRoute] = useState(readCurrentRoute);

  useEffect(() => {
    const sync = () => setRoute(readCurrentRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    sync();
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  return route;
}
