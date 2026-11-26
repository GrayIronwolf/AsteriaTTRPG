import React,{useMemo,useState} from 'react';
import {CampaignMapCanvas,useCampaignStream} from './CombatMapCanvas.jsx';
import {mapCell,mapCellKey,mapReachableRoutes,mapRoutePoints} from '../../state/battleMapRoutes.mjs';
const EMPTY_MEDIA_API=Object.freeze({});

/**
 * Read-only GM combat map view. All changes to maps, fog and movement remain
 * with the authenticated media editor or secured combat command service.
 * This component does not publish GM-only map data to players.
 */
export function CombatBattleMapPanel({mediaApi,campaignId,combat,pending,onCommand,busy=false}){
  const enabled=Boolean(mediaApi);
  const stream=useCampaignStream(mediaApi||EMPTY_MEDIA_API,'watchMaps',[campaignId,'gm'],enabled);
  const [preview,setPreview]=useState(false),[actor,setActor]=useState(''),[reason,setReason]=useState('');
  const safe=useCampaignStream(mediaApi||EMPTY_MEDIA_API,'watchMaps',[campaignId,'player'],enabled&&preview);
  const selectedId=combat?.battleMapId||combat?.preparedMapId||'';
  const map=(preview?safe.data||[]:stream.data||[]).find(row=>row.id===selectedId)||null;
  const routeOverlay=useMemo(()=>{
    const requested=pending?.mapMove;
    if(preview||!map||requested?.mapId!==map.id)return [];
    const origin=map.tokens?.find(token=>token.combatantId===pending.actorId);
    const target=mapCell(requested.point,map.gridColumns,map.gridRows);
    if(!origin||!target)return [];
    const routes=mapReachableRoutes(map,origin,requested.distance,{
      occupied:map.tokens.filter(row=>row.id!==origin.id),revealedOnly:true,
      movementKind:requested.kind,diagonalParity:requested.diagonalParity
    });
    const route=routes.get(mapCellKey(target));
    return route?mapRoutePoints(route,map.gridColumns,map.gridRows):[];
  },[preview,map,pending]);
  const moveEnabled=!preview&&combat?.isActive&&!combat.paused&&combat.sessionEditable&&
    !busy&&!combat.pending&&Boolean(combat.battleMapId)&&typeof onCommand==='function';
  const positioning=moveEnabled&&combat.combatants.some(row=>row.id===actor)&&reason.trim().length>=5;
  if(!enabled)return <p>Battle map media is unavailable in this campaign.</p>;
  return <div data-testid="site-combat-prepared-map">
    {selectedId?<button type="button" aria-pressed={preview}
      onClick={()=>setPreview(value=>!value)}>Preview Player View</button>:null}
    {preview&&safe.loading?<p role="status">Loading the shared player map…</p>:null}
    {preview&&safe.error?<p role="alert">{safe.error}</p>:null}
    {preview&&!safe.loading&&!map?<p role="status">The party cannot see this map.</p>:null}
    {stream.loading?<p role="status">Loading GM battle map…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {!selectedId?<p>Select a prepared map for this encounter to see its preview here.</p>:null}
    {selectedId&&!preview&&!stream.loading&&!stream.error&&!map?
      <p role="alert">The selected encounter map is no longer accessible.</p>:null}
    {moveEnabled&&map?<details>
      <summary>Reposition a combatant</summary>
      <label>Combatant<select value={actor} onChange={event=>setActor(event.target.value)}>
        <option value="">Select a combatant</option>
        {combat.combatants.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <label>Reason<input value={reason} maxLength={160} onChange={event=>setReason(event.target.value)}/></label>
      {positioning?<p>Choose the corrected position on the map.</p>:null}
    </details>:null}
    {map?<><p>{combat?.battleMapId?
      'Live combat map — combatant tokens are managed by the existing server.':
      'Prepared map preview — live combat tokens will be linked on Start Combat.'}</p>
      <CampaignMapCanvas api={mediaApi} campaignId={campaignId} map={map}
        mode={preview?'player':'gm'} interactive={!positioning} editing={positioning}
        routeOverlay={routeOverlay}
        onPoint={point=>{if(positioning)onCommand('encounter',{operation:'map-move',mapId:map.id,
          combatantId:actor,mode:'reposition',reason:reason.trim(),point});}} showGrid/></>:null}
  </div>;
}
