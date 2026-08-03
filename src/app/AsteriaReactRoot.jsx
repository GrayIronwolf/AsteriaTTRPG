import React, { useEffect, useState } from 'react';
import { GMDashboard } from '../dashboards/GMDashboard.jsx';
import { CharacterDashboard } from '../dashboards/CharacterDashboard.jsx';

function parseRoute() {
  const match = window.location.hash.match(/^#\/react\/(gm|character)\/([^/]+)(?:\/([^/]+))?/);
  if(!match) return null;
  return { type: match[1], campaignId: decodeURIComponent(match[2]), characterId: decodeURIComponent(match[3] || '') };
}

export function AsteriaReactRoot() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const update = () => setRoute(parseRoute());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    if(route) window.setView?.('reactDashboard');
  }, [route]);

  if(!route) return null;
  if(route.type === 'gm') return <GMDashboard campaignId={route.campaignId} />;
  return <CharacterDashboard campaignId={route.campaignId} characterId={route.characterId} />;
}
