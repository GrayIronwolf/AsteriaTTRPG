import React from 'react';
import {CampaignMapCanvas,useCampaignStream} from '../dashboard/CampaignMapWorkspace.jsx';

/**
 * Read-only GM combat map view. All changes to maps, fog and movement remain
 * with the authenticated media editor or secured combat command service.
 * This component does not publish GM-only map data to players.
 */
export function CombatBattleMapPanel({mediaApi,campaignId,combat}){
  const enabled=Boolean(mediaApi);
  const stream=useCampaignStream(mediaApi||{},'watchMaps',[campaignId,'gm'],enabled);
  const selectedId=combat?.battleMapId||combat?.preparedMapId||'';
  const map=(stream.data||[]).find(row=>row.id===selectedId)||null;
  if(!enabled)return <p>Battle map media is unavailable in this campaign.</p>;
  return <div data-testid="site-combat-prepared-map">
    {stream.loading?<p role="status">Loading GM battle map…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {!selectedId?<p>Select a prepared map for this encounter to see its preview here.</p>:null}
    {selectedId&&!stream.loading&&!stream.error&&!map?
      <p role="alert">The selected encounter map is no longer accessible.</p>:null}
    {map?<><p>{combat?.battleMapId?
      'Live combat map — combatant tokens are managed by the existing server.':
      'Prepared map preview — live combat tokens will be linked on Start Combat.'}</p>
      <CampaignMapCanvas api={mediaApi} campaignId={campaignId} map={map}
        mode="gm" showGrid/></>:null}
  </div>;
}
