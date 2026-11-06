import React, { lazy, Suspense, useEffect } from 'react';
import { AsteriaAppProvider, useAsteriaApp } from './AsteriaAppContext.jsx';
import { activateReactDashboard } from './legacyBridge.js';

const GMDashboard = lazy(() => import('../dashboards/GMDashboard.jsx').then(module => ({ default:module.GMDashboard })));
const CharacterDashboard = lazy(() => import('../dashboards/CharacterDashboard.jsx').then(module => ({ default:module.CharacterDashboard })));
const OwnedCharacterDashboard = lazy(() => import('../dashboards/CharacterDashboard.jsx').then(module => ({ default:module.OwnedCharacterDashboard })));

export class DashboardErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Asteria dashboard failed to load.', error);
  }

  render() {
    if(this.state.failed) return <div className="react-route-state" role="alert">
      <p>The dashboard could not load. Reload the page to try again.</p>
      <button type="button" onClick={() => window.location.reload()}>Reload dashboard</button>
    </div>;
    return this.props.children;
  }
}

function AsteriaRouteOutlet() {
  const { route, account } = useAsteriaApp();
  useEffect(() => {
    if(route) activateReactDashboard();
  }, [route]);

  if(!route) return null;
  // Changing Firebase accounts must discard the previous user's mounted
  // dashboard, subscriptions, modal drafts and pending navigation state.
  const accountScope=account?.user?.uid||'signed-out';
  return <DashboardErrorBoundary key={`${accountScope}/${route.type}/${route.campaignId}/${route.characterId || ''}`}><Suspense fallback={<div className="react-route-loading" role="status" aria-live="polite">Loading Asteria workspace...</div>}>
    {route.type === 'gm'
      ? <GMDashboard key={route.campaignId} campaignId={route.campaignId} />
      : route.type === 'owned-character' ? <OwnedCharacterDashboard key={route.characterId} characterId={route.characterId} />
      : <CharacterDashboard key={`${route.campaignId}/${route.characterId}`} campaignId={route.campaignId} characterId={route.characterId} />}
  </Suspense></DashboardErrorBoundary>;
}

export function AsteriaReactRoot() {
  return <AsteriaAppProvider><AsteriaRouteOutlet /></AsteriaAppProvider>;
}
