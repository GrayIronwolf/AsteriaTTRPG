import React, { lazy, Suspense, useEffect } from 'react';
import { AsteriaAppProvider, useAsteriaApp } from './AsteriaAppContext.jsx';
import { activateReactDashboard } from './legacyBridge.js';

const GMDashboard = lazy(() => import('../dashboards/GMDashboard.jsx').then(module => ({ default:module.GMDashboard })));
const CharacterDashboard = lazy(() => import('../dashboards/CharacterDashboard.jsx').then(module => ({ default:module.CharacterDashboard })));
const OwnedCharacterDashboard = lazy(() => import('../dashboards/CharacterDashboard.jsx').then(module => ({ default:module.OwnedCharacterDashboard })));

function AsteriaRouteOutlet() {
  const { route } = useAsteriaApp();
  useEffect(() => {
    if(route) activateReactDashboard();
  }, [route]);

  if(!route) return null;
  return <Suspense fallback={<div className="react-route-loading" role="status" aria-live="polite">Loading Asteria workspace...</div>}>
    {route.type === 'gm'
      ? <GMDashboard key={route.campaignId} campaignId={route.campaignId} />
      : route.type === 'owned-character' ? <OwnedCharacterDashboard key={route.characterId} characterId={route.characterId} />
      : <CharacterDashboard key={`${route.campaignId}/${route.characterId}`} campaignId={route.campaignId} characterId={route.characterId} />}
  </Suspense>;
}

export function AsteriaReactRoot() {
  return <AsteriaAppProvider><AsteriaRouteOutlet /></AsteriaAppProvider>;
}
