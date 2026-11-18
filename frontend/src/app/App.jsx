import React from 'react';
import { SiteShell } from '../components/SiteShell.jsx';
import { HomePage } from '../pages/HomePage.jsx';
import { AppearanceSettingsPage } from '../pages/AppearanceSettingsPage.jsx';
import { CompendiumCataloguePage } from '../pages/CompendiumCataloguePage.jsx';
import { CompendiumEntryPage } from '../pages/CompendiumEntryPage.jsx';
import { RoutePreviewPage } from '../pages/RoutePreviewPage.jsx';
import { AuthPage } from '../pages/AuthPage.jsx';
import { AccountPage } from '../pages/AccountPage.jsx';
import { FriendsPage } from '../pages/FriendsPage.jsx';
import { NotificationsPage } from '../pages/NotificationsPage.jsx';
import { CharacterForgePage } from '../pages/CharacterForgePage.jsx';
import { CampaignForgePage } from '../pages/CampaignForgePage.jsx';
import { CampaignInvitationPage } from '../pages/CampaignInvitationPage.jsx';
import { GMDashboardPage } from '../pages/GMDashboardPage.jsx';
import { PlayerDashboardPage } from '../pages/PlayerDashboardPage.jsx';
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
  // Only prefiltered public catalogue and public entry assets are migrated.
  const showPublicCatalogue = ['handbook','lore','compendium'].includes(route.id);
  const showPublicEntry = route.id === 'compendium-entry';
  const showAuth = ['login','account-create','forgot-password'].includes(route.id) && services.has('auth');
  const showAccount = ['account','profile','settings'].includes(route.id) && services.has('auth');
  const showFriends = route.id === 'friends' && canActivateRoute('friends',services);
  const showNotifications=route.id==='notifications'&&canActivateRoute('notifications',services);
  const showForge=route.id==='character-forge'&&canActivateRoute('character-forge',services);
  const showCampaignForge=route.id==='campaign-forge'&&canActivateRoute('campaign-forge',services);
  const showInvites=route.id==='invitation'&&canActivateRoute('invitation',services);
  const showGM=['dashboard','gm-dashboard'].includes(route.id)&&canActivateRoute(route.id,services);
  const showPlayer=route.id==='character-dashboard'&&canActivateRoute(route.id,services);
  return (
    <SiteShell route={route} identity={identity}>
      {showMigratedHome ? <HomePage /> : showAppearance ? <AppearanceSettingsPage /> : showPublicCatalogue ? <CompendiumCataloguePage route={route} /> : showPublicEntry ? <CompendiumEntryPage route={route} /> : showAuth ? <AuthPage key={route.id} route={route} /> : showAccount ? <AccountPage route={route} /> : showFriends ? <FriendsPage /> : showNotifications ? <NotificationsPage /> : showForge ? <CharacterForgePage /> : showCampaignForge ? <CampaignForgePage /> : showInvites ? <CampaignInvitationPage route={route}/> : showGM ? <GMDashboardPage route={route} /> : showPlayer ? <PlayerDashboardPage route={route}/> : <RoutePreviewPage route={route} />}
    </SiteShell>
  );
}
