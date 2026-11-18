import React from 'react';
import { SiteShell } from '../components/SiteShell.jsx';
import { HomePage } from '../pages/HomePage.jsx';
import { AppearanceSettingsPage } from '../pages/AppearanceSettingsPage.jsx';
import { CompendiumCataloguePage } from '../pages/CompendiumCataloguePage.jsx';
import { RoutePreviewPage } from '../pages/RoutePreviewPage.jsx';
import { useSiteRoute } from '../router/useSiteRoute.js';
import { useRouteEffects } from '../router/useRouteEffects.js';
import { canActivateRoute } from './featureRegistry.mjs';
import { useAppServices } from './AppServices.jsx';

// One route outlet. Feature availability is a separate, fail-closed boundary:
// a recognised URL never activates unmigrated GM/Player/account data.
// The optional identity is presentational data from a future verified Auth adapter.
// The deployed preview entry renders <App /> without a fabricated account.
export function App({ identity = null } = {}) {
  const route = useSiteRoute();
  const services = useAppServices();
  useRouteEffects(route);

  const showMigratedHome = route.id === 'home' && canActivateRoute(route.id, services);
  const showAppearance = route.id === 'appearance' && canActivateRoute(route.id, services);
  // Only a sanitized PUBLIC catalogue is migrated in Phase 3.1, not full entry pages.
  const showPublicCatalogue = ['handbook','lore','compendium'].includes(route.id);
  return (
    <SiteShell route={route} identity={identity}>
      {showMigratedHome ? <HomePage /> : showAppearance ? <AppearanceSettingsPage /> : showPublicCatalogue ? <CompendiumCataloguePage route={route} /> : <RoutePreviewPage route={route} />}
    </SiteShell>
  );
}
