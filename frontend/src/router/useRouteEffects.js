import { useEffect, useRef } from 'react';

/**
 * The only app-wide route side-effects owner:
 * document title, main-content focus, and top-of-page restoration.
 * Initial bookmarks never force a Home redirect or alter browser history.
 */
export function useRouteEffects(route) {
  const previousHash = useRef(null);

  useEffect(() => {
    document.title = route.id === 'home'
      ? 'Asteria TTRPG — React Navigation Preview'
      : route.title + ' — Asteria TTRPG';

    if (previousHash.current !== null && previousHash.current !== route.hash) {
      document.getElementById('site-main')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
    previousHash.current = route.hash;
  }, [route.hash, route.id, route.title]);
}
