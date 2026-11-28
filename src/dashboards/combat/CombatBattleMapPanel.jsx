import React,{useMemo,useState} from 'react';
import {CampaignMapCanvas,useCampaignStream} from './CombatMapCanvas.jsx';
import {mapCell,mapCellKey,mapReachableRoutes,mapRoutePoints} from '../../state/battleMapRoutes.mjs';
const EMPTY_MEDIA_API=Object.freeze({});

/**
 * Read-only GM combat map view. All changes to maps, fog and movement remain
 * with the authenticated media editor or secured combat command service.
 * This component does not publish GM-only map data to players.
 */
export function CombatBattleMapPanel({mediaApi,campaignId,combat,pending,onCommand,busy=false,previewMapId=null}){
  const enabled=Boolean(mediaApi);
  const stream=useCampaignStream(mediaApi||EMPTY_MEDIA_API,'watchMaps',[campaignId,'gm'],enabled);
  const [preview,setPreview]=useState(false),[actor,setActor]=useState(''),[reason,setReason]=useState('');
  const [moveMode,setMoveMode]=useState('reposition'),[sourceId,setSourceId]=useState('');
  const [sourceKind,setSourceKind]=useState('spell'),[routeKind,setRouteKind]=useState('ground');
  const [approvedDistance,setApprovedDistance]=useState(''),[sourceResolved,setSourceResolved]=useState(false);
  const safe=useCampaignStream(mediaApi||EMPTY_MEDIA_API,'watchMaps',[campaignId,'player'],enabled&&preview);
  // Keep the authoritative live encounter map locked, but preview an unsaved
  // setup selection immediately rather than waiting for navigation/remount.
  const selectedId=combat?.battleMapId||(previewMapId===null?combat?.preparedMapId||'':previewMapId);
  const map=(preview?safe.data||[]:stream.data||[]).find(row=>row.id===selectedId)||null;
  const routeOverlay=useMemo(()=>{
    const requested=pending?.mapMove;
    if(preview||!map||requested?.mapId!==map.id)return [];
    const origin=map.tokens?.find(token=>token.combatantId===pending.actorId);
    const target=mapCell(requested.point,map.gridColumns,map.gridRows,map);
    if(!origin||!target)return [];
    const routes=mapReachableRoutes(map,origin,requested.distance,{
      occupied:map.tokens.filter(row=>row.id!==origin.id),revealedOnly:true,
      movementKind:requested.kind,diagonalParity:requested.diagonalParity
    });
    const route=routes.get(mapCellKey(target));
    return route?mapRoutePoints(route,map.gridColumns,map.gridRows,map):[];
  },[preview,map,pending]);
  const moveEnabled=!preview&&combat?.isActive&&!combat.paused&&combat.sessionEditable&&
    !busy&&!combat.pending&&Boolean(combat.battleMapId)&&typeof onCommand==='function';
  const forced=moveMode==='forced';
  const sourceValid=sourceId.trim().length>=2&&Number(approvedDistance)>0&&
    Number(approvedDistance)<=1000&&sourceResolved;
  const positioning=moveEnabled&&combat.combatants.some(row=>row.id===actor)&&
    reason.trim().length>=5&&(!forced||sourceValid);
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
      <label>Movement type<select value={moveMode} onChange={event=>setMoveMode(event.target.value)}>
        <option value="reposition">GM correction</option>
        <option value="forced">Resolved forced movement</option>
      </select></label>
      <label>Reason<input value={reason} maxLength={160} onChange={event=>setReason(event.target.value)}/></label>
      {forced?<div className="asteria-battle-form-row">
        <label>Source reference<input value={sourceId} maxLength={160}
          onChange={event=>setSourceId(event.target.value)} placeholder="Spell, talent or effect identifier"/></label>
        <label>Source type<select value={sourceKind} onChange={event=>setSourceKind(event.target.value)}>
          {['spell','talent','shove','creature','environment','ability','other'].map(kind=>
            <option key={kind} value={kind}>{kind}</option>)}
        </select></label>
        <label>Travel<select value={routeKind} onChange={event=>setRouteKind(event.target.value)}>
          <option value="ground">Ground path</option>
          <option value="fly">Airborne displacement</option>
          <option value="teleport">Teleportation</option>
        </select></label>
        <label>Approved distance (m)<input type="number" min="0.1" max="1000" step="0.1"
          value={approvedDistance} onChange={event=>setApprovedDistance(event.target.value)}/></label>
        <label><input type="checkbox" checked={sourceResolved}
          onChange={event=>setSourceResolved(event.target.checked)}/>
          Effect and any saving throw resolved by GM</label>
      </div>:null}
      {positioning?<p>Choose the destination on the map.</p>:null}
    </details>:null}
    {!preview&&map&&combat?.isActive&&map.id===combat.battleMapId&&
      map.tokens?.length?<details data-testid="gm-active-token-visibility">
      <summary>GM token visibility on live map</summary>
      <p>Control each token independently. Player-facing map projections still enforce
        fog and automatic vision. Visibility changes are GM-authorised and recorded.</p>
      {map.tokens.map(token=><label key={token.id}>
        {token.label}
        <select value={token.visibility==='gm'?'gm':'players'}
          disabled={busy||!combat.sessionEditable||combat.paused}
          onChange={event=>{
            if(event.target.value==='players'&&!window.confirm(
              'Reveal this token to players when their fog of war allows it?'))return;
            onCommand('encounter',{
            operation:'map-token-appearance',mapId:map.id,tokenId:token.id,
            appearance:{
              portrait:token.portrait||'',faction:token.faction||'',
              cells:token.cells??1,visibility:event.target.value
            }
          });}}>
          <option value="gm">GM only</option>
          <option value="players">Players when revealed</option>
        </select>
      </label>)}
    </details>:null}
    {map?<><p>{combat?.battleMapId?
      'Live combat map — combatant tokens are managed by the existing server.':
      'Prepared map preview — live combat tokens will be linked on Start Combat.'}</p>
      <CampaignMapCanvas key={campaignId+':'+map.id+':'+map.storagePath+':'+(preview?'player':'gm')} api={mediaApi} campaignId={campaignId} map={map}
        mode={preview?'player':'gm'} interactive={!positioning} editing={positioning}
        routeOverlay={routeOverlay}
        onPoint={point=>{if(positioning)onCommand('encounter',{operation:'map-move',mapId:map.id,
          combatantId:actor,mode:moveMode,reason:reason.trim(),point,
          ...(forced?{source:{id:sourceId.trim(),kind:sourceKind,routeKind,
            distance:Number(approvedDistance),resolved:sourceResolved}}:{})});}} showGrid/></>:null}
  </div>;
}
