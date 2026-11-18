import React, { useEffect, useRef } from 'react';
import { SiteShell } from '../components/SiteShell.jsx';
import { HomePage } from '../pages/HomePage.jsx';
import { RoutePreviewPage } from '../pages/RoutePreviewPage.jsx';
import { useSiteRoute } from '../router/useSiteRoute.js';

// One route subscriber, one page outlet and one shell. The old HTML, hash
// router and legacy view wrappers are never imported into this preview.
export function App() {
  const route = useSiteRoute();
  const lastRoute = useRef(null);

  useEffect(() => {
    document.title = route.id === 'home'
      ? 'Asteria TTRPG — React Navigation Preview'
      : route.title + ' — Asteria TTRPG';

    // Focus the new view when navigating, but not on initial bookmark load.
    if (lastRoute.current !== null && lastRoute.current !== route.hash) {
      document.getElementById('site-main')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    lastRoute.current = route.hash;
  }, [route.id, route.hash, route.title]);

  return (
    <SiteShell route={route}>
      {route.id === 'home' ? <HomePage /> : <RoutePreviewPage route={route} />}
    </SiteShell>
  );
}
