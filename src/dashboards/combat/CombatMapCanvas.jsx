import React from 'react';
import {CampaignMapCanvas as SharedMapCanvas} from '../presentation/CampaignMapWorkspace.jsx';

export {useCampaignStream} from '../presentation/CampaignMapWorkspace.jsx';

export function CampaignMapCanvas(props){
  return <div data-testid="site-combat-map-canvas">
    <SharedMapCanvas {...props}/>
  </div>;
}
