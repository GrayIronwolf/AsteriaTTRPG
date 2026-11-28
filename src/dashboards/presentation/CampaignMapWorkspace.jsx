import {resizeTerrainCells,publicTerrainCells} from '../../state/battleMapTerrainModel.mjs';
import {BattleMapVisionControls} from './BattleMapVisionControls.jsx';
import {cellOutline} from '../../state/battleMapGrid.mjs';
import {GridLayer,CellFog,GeometryControls,TerrainControls,terrainAtPoint,firstTerrainBrush,RouteReading,AreaControls,AreaOverlay} from './BattleMapLayers.jsx';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {
  battleMapEditableSettings,battleMapFileError,BATTLE_MAP_MAX_RECORDS,
  timestampRevision
} from './campaignMediaModel.mjs';
import {mapFogStroke,resizeFogCells,createFogCells,hiddenFogRuns} from '../../state/battleMapFogModel.mjs';
import {battleMapCameraView,DEFAULT_BATTLE_MAP_CAMERA,encounterMapLink} from '../../state/battleMapCamera.mjs';
import {mapCell,mapCellCenter,mapCellKey,mapReachableRoutes,mapRoutePoints,measureMapRoute} from '../../state/battleMapRoutes.mjs';
import {MAP_MOVE_AP} from '../../state/battleMapMovement.mjs';
import {battleMapPoint} from '../../state/battleMapModel.mjs';
import {useBattleMapSession,useMapMedia,useMapSelection} from './useMapMedia.js';
import styles from './CampaignMapWorkspace.module.css';

const empty=()=>({
  name:'',description:'',visibility:'gm',gridColumns:20,gridRows:15,
  gridOpacity:40,gridVisible:true,fogEnabled:false,
  fogCells:createFogCells(20,15),metresPerCell:3,gridType:'hex',terrainCells:[],tokens:[]
});
const fileSize=async file=>{
  const url=URL.createObjectURL(file);
  try{
    return await new Promise((resolve,reject)=>{
      const video=file.type.startsWith('video/');
      const element=document.createElement(video?'video':'img');
      const timer=setTimeout(()=>reject(Error('Could not read map dimensions.')),12000);
      const completed=()=>{
        clearTimeout(timer);
        const width=video?element.videoWidth:element.naturalWidth;
        const height=video?element.videoHeight:element.naturalHeight;
        if(!width||!height)reject(Error('Map image/video has invalid dimensions.'));
        else resolve({width,height});
      };
      element.onload=completed;element.onloadedmetadata=completed;
      element.onerror=()=>{clearTimeout(timer);reject(Error('Map image/video cannot be decoded.'));};
      element.src=url;
    });
  }finally{URL.revokeObjectURL(url);}
};
export function useCampaignStream(api,method,args,enabled=true,session=null){
  const signature=JSON.stringify([method,enabled,args]);
  const scope=useMemo(()=>({}),[signature,api,session]);
  const [state,setState]=useState({data:null,error:'',loading:true,scope:''});
  useEffect(()=>{
    setState({data:null,error:'',loading:enabled,scope});
    if(!enabled)return undefined;
    let alive=true,stop=()=>{};
    try{
      stop=api[method](...args,value=>{
        if(alive)setState({data:value,error:'',loading:false,scope});
      },error=>{
        if(alive)setState({data:null,error:error?.message||'Access denied.',loading:false,scope});
      });
    }catch(error){setState({data:null,error:error?.message||'Unable to connect.',loading:false,scope});}
    return ()=>{alive=false;stop?.();};
  },[api,scope]);
  return state.scope===scope?state:{data:null,error:'',loading:enabled};
}
export function BattleMapToken({token,columns,rows,className,selected=false,current=false,defeated=false,onSelect}){
  const footprint=token.cells??1,offset=footprint%2===0?0.5:0;
  const style={left:(token.x+offset*100/columns)+'%',top:(token.y+offset*100/rows)+'%',
    ...(footprint>1?{width:footprint*100/columns+'%',height:'auto',aspectRatio:'1'}:{})};
  const label=[token.label,token.faction,current?'Current turn':'',defeated?'Defeated':'',
    token.visibility==='gm'?'GM only':''].filter(Boolean).join(' · ');
  const Element=onSelect?'button':'span';
  return <Element className={className+' asteria-map-marker'} style={style}
    data-token-id={token.id}
    data-faction={token.faction||(token.kind==='character'?'party':'neutral')}
    data-selected={selected||undefined} data-current={current||undefined}
    data-defeated={defeated||undefined} data-private={token.visibility==='gm'||undefined}
    aria-label={token.label} title={label}
    {...(onSelect?{type:'button','aria-pressed':selected,onClick:onSelect}:{})}>
    <span aria-hidden="true">{token.label.charAt(0).toUpperCase()||'•'}</span>
    {token.portrait?<img src={token.portrait} alt="" loading="lazy" decoding="async"
      referrerPolicy="no-referrer" onError={event=>{event.currentTarget.hidden=true;}}/>:null}
  </Element>;
}
export function CampaignMapCanvas({api,campaignId,map,mediaMap=map,mode='player',atlas=false,
  editing=false,onPoint,previewFog=false,showGrid=true,restricted=false,interactive=false,camera=null,
  movement=null,routeOverlay=[]}){
  const session=useBattleMapSession();
  const load=useCallback((id,record,options)=>{
    if(restricted)return api.fetchRestrictedMapMedia(id,record,options);
    if(atlas)return api.fetchAtlasMedia(id,record);
    return api.fetchMapMedia(id,record,mode,options);
  },[api,mode,atlas,restricted]);
  const media=useMapMedia(campaignId,mediaMap,session,load,{atlas,accessScope:restricted?'restricted':mode});
  const node=useRef(null),drag=useRef(null);
  const [localCamera,setLocalCamera]=useState(DEFAULT_BATTLE_MAP_CAMERA);
  const [tool,setTool]=useState('pan'),[selection,setSelection]=useState(''),[ruler,setRuler]=useState([]);
  const [area,setArea]=useState({shape:''});
  const [destination,setDestination]=useState(null),[moving,setMoving]=useState(false),[moveNotice,setMoveNotice]=useState('');
  const [moveQueued,setMoveQueued]=useState(false);
  const marker=map?.tokens?.find(row=>row.id===movement?.tokenId);
  const canMove=Boolean(marker&&movement?.distance>0&&!movement.disabled);
  const moveMode=tool==='move'&&canMove;
  const cols=map?.gridColumns||20,rows=map?.gridRows||15;
  const routes=useMemo(()=>tool==='move'&&canMove?mapReachableRoutes(map,marker,movement.distance,{
    occupied:map.tokens.filter(row=>row.id!==marker.id),diagonalParity:movement.diagonalParity,revealedOnly:true,
    movementKind:movement.routeKind||movement.approvedKind
  }):new Map(),[tool,canMove,map,marker,movement?.distance,movement?.diagonalParity,movement?.approvedKind,movement?.routeKind]);
  const route=destination?routes.get(destination):null;
  const routePoints=route?mapRoutePoints(route,cols,rows,map):[];
  useEffect(()=>{setDestination(null);setMoveNotice('');setMoveQueued(false);},[map?.id,marker?.x,marker?.y]);
  useEffect(()=>setDestination(null),[movement?.revision]);
  const commitMove=async target=>{
    if(!target||moving||!moveMode)return;
    setMoving(true);setMoveNotice('');
    try{
      const result=await movement.onMove(mapCellCenter(target,cols,rows,map));
      setDestination(null);setMoveQueued(result?.queued===true);
    }
    catch(error){setMoveNotice(error?.message||'The move could not be confirmed.');}
    finally{setMoving(false);}
  };
  useEffect(()=>{setLocalCamera(DEFAULT_BATTLE_MAP_CAMERA);
    setSelection('');setRuler([]);drag.current=null;},[campaignId,map?.id]);
  const view=battleMapCameraView(camera||localCamera,map||{});
  const changeZoom=delta=>setLocalCamera(previous=>({...previous,zoom:Math.max(1,Math.min(4,previous.zoom+delta))}));
  const pointerDown=event=>{
    if(!interactive||editing||tool!=='pan'||view.zoom===1||event.button!==0)return;
    if(event.target.closest('button'))return;
    event.stopPropagation();
    const viewport=event.currentTarget.getBoundingClientRect();
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,view,viewport};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove=event=>{
    const start=drag.current;
    if(!start||start.id!==event.pointerId)return;
    const margin=50/start.view.zoom;
    const move=(value,offset,size)=>Math.max(margin,Math.min(100-margin,value-offset*100/(size*start.view.zoom)));
    setLocalCamera(previous=>({...previous,x:move(start.view.x,event.clientX-start.x,start.viewport.width),
      y:move(start.view.y,event.clientY-start.y,start.viewport.height)}));
  };
  const fog=Boolean(map?.fogEnabled)&&(mode!=='gm'||previewFog);
  const hidden=fog?hiddenFogRuns(map.fogCells,cols,rows):[];
  const tokens=map?.tokens||[];
  const fogCells=map?.fogCells||'';
  const point=event=>{
    const bounds=node.current?.getBoundingClientRect();
    if(!bounds?.width||!bounds?.height)return;
    const raw=battleMapPoint(
      (event.clientX-bounds.left)*100/bounds.width,
      (event.clientY-bounds.top)*100/bounds.height,
      {...map,columns:cols,rows,snap:showGrid&&map.gridVisible});
    if(moveMode){
      const cell=mapCell(raw,cols,rows,map);
      if(!cell)return;
      const key=mapCellKey(cell);
      if(!routes.has(key)||(fog&&fogCells[cell.row*cols+cell.column]!=='1')){
        setMoveNotice('Choose a reachable, revealed destination.');setDestination(null);return;
      }
      setMoveNotice('');
      if(destination===key)commitMove(routes.get(key));
      else setDestination(key);
      return;
    }
    if(interactive&&!editing&&tool==='ruler')setRuler(previous=>previous.length===1?[previous[0],raw]:[raw]);
    else onPoint?.(raw);
  };
  const distance=useMemo(()=>map&&ruler.length===2?measureMapRoute(map,ruler[0],ruler[1],{revealedOnly:mode!=='gm'}):null,[map,ruler,mode]);
  if(!map)return <p>No map selected.</p>;
  return <section className={styles.viewer} aria-label={'Campaign map: '+map.name}
    data-testid="site-media-map-canvas">
    {map.kind==='video'?<div className={styles.controls}>
      <button type="button" onClick={media.togglePlayback} disabled={!media.url}>
        {media.playing?'Pause looping video':'Play looping video'}</button>
      <span>Looping video plays muted.</span>
    </div>:null}
    {interactive?<div className={styles.controls} aria-label="Map tools">
      <button type="button" onClick={()=>changeZoom(-0.25)} disabled={view.zoom===1} aria-label="Zoom out on map">−</button>
      <output aria-label="Map zoom">{Math.round(view.zoom*100)}%</output>
      <button type="button" onClick={()=>changeZoom(0.25)} disabled={view.zoom===4} aria-label="Zoom in on map">+</button>
      <button type="button" onClick={()=>setLocalCamera(DEFAULT_BATTLE_MAP_CAMERA)}>Reset view</button>
      <button type="button" aria-pressed={tool==='pan'} onClick={()=>setTool('pan')}>Pan</button>
      <button type="button" aria-pressed={tool==='ruler'} onClick={()=>{setTool('ruler');setRuler([]);}}>Ruler</button>
      {marker?<button type="button" aria-pressed={tool==='move'} disabled={!canMove}
        onClick={()=>{setTool('move');setSelection(marker.id);setDestination(null);}}>{movement.label||'Move my token'}</button>:null}
      {tool==='ruler'?<output>{distance?<RouteReading result={distance}/>:ruler.length?'Choose the end point':'Choose the start point'}</output>:null}
    </div>:null}
    {interactive&&tool==='ruler'&&!atlas?<AreaControls value={area} onChange={setArea}/>:null}
    {moveMode?<div className={styles.controls}>
      <output aria-live="polite">{movement.outOfTurn?'Out-of-turn move · ':''}
        {movement.kind==='approved'?({dash:'Paid Dash',fly:'Approved flight',swim:'Approved swim',
          climb:'Approved climb','climb-dash':'Paid climbing Dash',jump:'Approved jump',
          spell:'Spell movement',talent:'Talent movement'}[movement.approvedKind]||'Approved move'):'Move'} ·
        {movement.routeKind==='teleport'?' Teleport ·':''}
        {' '}{route?Number(route.cost.toFixed(2))+' m of ':''}{movement.distance} m ·
        {' '}{movement.kind==='approved'?0:MAP_MOVE_AP.walk} AP
      </output>
      <button type="button" disabled={!route||moving} onClick={()=>commitMove(route)}>Confirm Move</button>
    </div>:null}
    {moveNotice?<p role="alert">{moveNotice}</p>:null}
    {moveQueued&&movement?.disabled?<p role="status">Move awaiting GM reaction review.</p>:null}
    {media.loading?<p role="status">{media.url?'Preparing map media…':'Loading authenticated map media…'}</p>:null}
    {media.error?<div><p role="alert">{media.error}</p>
      <button type="button" onClick={media.retry}>Retry loading media</button></div>:null}
    <div className={styles.canvas} data-map-zoom={view.zoom}
      style={{aspectRatio:map.width+' / '+map.height,minHeight:0,
        ...(interactive&&tool==='pan'&&view.zoom>1?{touchAction:'none',cursor:'grab'}:{})}}
      onPointerDown={pointerDown} onPointerMove={pointerMove}
      onLostPointerCapture={()=>{drag.current=null;}}>
      <div ref={node} className={styles.cameraLayer} style={{
        transform:'translate('+(50-view.x*view.zoom)+'%, '+(50-view.y*view.zoom)+'%) scale('+view.zoom+')'
      }} onClick={editing||moveMode||interactive&&tool==='ruler'?point:undefined} role={editing?'button':undefined}
      tabIndex={editing?0:undefined}
      onKeyDown={editing?event=>{if(event.key==='Enter')onPoint?.({x:50,y:50});}:undefined}>
      {media.url&&(map.kind==='video'
        ?<video key={media.url} className={styles.image} src={media.url}
          autoPlay muted loop playsInline preload="auto" ref={media.videoRef}
          onPlay={media.updatePlayback} onPause={media.updatePlayback}
          onLoadedData={media.ready} onCanPlay={media.ready} onError={media.decodeFailed}
          aria-label={'Looping map: '+map.name}/>
        :<img key={media.url} className={styles.image} src={media.url} alt={map.name}
          onLoad={media.ready} onError={media.decodeFailed}/>)}
      {!atlas?<GridLayer map={mode==='gm'&&previewFog?{...map,terrainCells:publicTerrainCells(map,map.fogCells)}:map} visible={map.gridVisible&&showGrid}/>:null}
      {tool==='ruler'&&!atlas?<AreaOverlay map={map} area={area} points={ruler}/>:null}
      {moveMode?<svg className={styles.reachable} data-move-kind={movement.approvedKind||'walk'}
        aria-label="Reachable destinations" viewBox="0 0 100 100" preserveAspectRatio="none">
        {[...routes.values()].filter(cell=>!fog||fogCells[cell.row*cols+cell.column]==='1').map(cell=>
          <polygon key={mapCellKey(cell)} points={cellOutline(map,cell)}/>)}
        {routePoints.length?<polyline points={routePoints.map(p=>p.x+','+p.y).join(' ')}/>:null}
      </svg>:null}
      {mode==='gm'&&routeOverlay.length>1?<svg className={styles.reachable}
        aria-label="Confirmed movement route" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={routeOverlay.map(p=>p.x+','+p.y).join(' ')}/>
      </svg>:null}
      {!atlas&&tokens.filter(t=>{
        if(!fog)return true;
        const cell=mapCell(t,cols,rows,map);
        return cell&&fogCells[cell.row*cols+cell.column]==='1';
      }).map(t=><BattleMapToken key={t.id} token={t} columns={cols} rows={rows} className={styles.token}
        selected={selection===t.id} current={map.activeTokenId===t.id} defeated={t.defeated===true}
        onSelect={interactive&&!moveMode&&tool!=='ruler'?()=>{
          setSelection(t.id);
          if(t.id===movement?.tokenId&&canMove){setTool('move');setDestination(null);}
        }:undefined}/>)}
      {tool==='ruler'&&ruler.length>0?<svg className={styles.ruler} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {ruler.length===2?<line x1={ruler[0].x} y1={ruler[0].y} x2={ruler[1].x} y2={ruler[1].y}/>:null}
        {ruler.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r=".6"/>)}
      </svg>:null}
      {atlas&&(map.pins||[]).map(pin=><span key={pin.id} className={styles.token}
        style={{left:pin.x+'%',top:pin.y+'%'}} title={pin.name}>{pin.name}</span>)}
      {fog&&(map.exploredCells||map.gridType==='hex'||map.gridOffsetX||map.gridOffsetY)?<CellFog map={map} cells={fogCells} className={styles.fog}/>:fog?<svg className={styles.fog} viewBox="0 0 100 100"
        preserveAspectRatio="none" aria-label="Hidden fog of war">
        {hidden.map((r,i)=><rect key={i} x={r.x} y={r.y}
          width={r.width} height={r.height}/>)}
      </svg>:null}
      </div>
    </div>
    {map.description?<p>{map.description}</p>:null}
    {fog?<small>Fog is visual only. Published map files must not contain unrevealed secrets.</small>:null}
  </section>;
}
export function CampaignMapWorkspace({api,campaignId,role='player',selectedMapId='',camera=null,interactive=role!=='gm',encounter=null,movement=null }){
  const mode=role==='gm'?'gm':'player';
  const session=useBattleMapSession();
  const stream=useCampaignStream(api,'watchMaps',[campaignId,mode],Boolean(session),session);
  const maps=stream.data||[];
  const [selected,setSelected]=useMapSelection(campaignId,session?.uid,mode);
  const [draft,setDraft]=useState(empty);
  const [file,setFile]=useState(null),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [brush,setBrush]=useState(firstTerrainBrush),[source,setSource]=useState(null);
  const [fogMode,setFogMode]=useState('none'),[showGrid,setShowGrid]=useState(true);
  const [previewFog,setPreviewFog]=useState(false);
  const published=useCampaignStream(api,'watchMaps',[campaignId,'player'],Boolean(session)&&mode==='gm'&&previewFog&&!!draft.vision?.automatic,session);
  const liveRequired=mode==='player'&&encounter?.status==='active'&&!selectedMapId;
  const liveMapId=liveRequired?encounter.battleMapId||'':'';
  const requiredMapId=selectedMapId||liveMapId;
  const candidate=!requiredMapId&&selected==='__new__'?null:maps.find(item=>item.id===(requiredMapId||selected))||
    (!requiredMapId?maps[0]:null)||null;
  const map=liveRequired&&!encounterMapLink(encounter,candidate)?null:candidate;
  useEffect(()=>{
    setDraft(map?{
      name:map.name,description:map.description,visibility:map.visibility,
      gridColumns:map.gridColumns,gridRows:map.gridRows,gridOpacity:map.gridOpacity,
      gridVisible:map.gridVisible,fogEnabled:map.fogEnabled,
      fogCells:map.fogCells,metresPerCell:map.metresPerCell,tokens:map.tokens,
      ...(map.vision?{vision:map.vision}:{}),gridType:map.gridType||'square',gridOffsetX:map.gridOffsetX||0,gridOffsetY:map.gridOffsetY||0,terrainCells:map.terrainCells||[]
    }:empty());
    setError('');
  },[map?.id,map?.updatedAt]);
  const run=async(op,success)=>{
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{await op();setNotice(success);}
    catch(err){setError(err?.message||String(err));}
    finally{setBusy(false);}
  };
  const upload=()=>run(async()=>{
    if(!file)throw Error('Choose a map image or video.');
    const issue=battleMapFileError(file);if(issue)throw Error(issue);
    const size=await fileSize(file);
    const result=await api.uploadMap(campaignId,file,{...draft,visibility:'gm'},size);
    setSelected(result.id);setFile(null);
  },'Map uploaded as GM-only. Publish it separately when ready.');
  const save=()=>run(()=>api.saveMap(campaignId,map.id,
    battleMapEditableSettings(draft),timestampRevision(map.updatedAt)),
  'Map settings saved.');
  const remove=()=>{if(!window.confirm('Delete this map and its media?'))return;
    run(async()=>{await api.removeMap(campaignId,map.id);setSelected('');},'Map deleted.');};
  const resizeGrid=(field,count)=>setDraft(d=>{
    if(!Number.isInteger(count)||count<1||count>80)return d;
    const cols=field==='gridColumns'?count:d.gridColumns,rows=field==='gridRows'?count:d.gridRows;
    return {...d,[field]:count,terrainCells:resizeTerrainCells(d.terrainCells,d.gridColumns,d.gridRows,cols,rows),
      fogCells:resizeFogCells(d.fogCells,d.gridColumns,d.gridRows,cols,rows)};
  });
  const editFog=point=>{
    if(source&&fogMode==='source'){setDraft(d=>({...d,vision:{...d.vision,sources:[...(d.vision?.sources||[]),{...source,...point}]}}));setSource(null);setFogMode('none');return;}
    if(fogMode==='terrain'){setDraft(d=>({...d,terrainCells:terrainAtPoint(d,point,brush)}));return;}
    if(!['reveal','hide','auto'].includes(fogMode)||!map||!draft.fogEnabled)return;
    setDraft(current=>({...current,...mapFogStroke(current,point,point,fogMode,1)}));
  };
  const draftPreview=map?{...map,...(mode==='gm'?draft:{})}:null;
  const preview=mode==='gm'&&previewFog&&draft.vision?.automatic&&!source&&fogMode==='none'?
    (published.data||[]).find(row=>row.id===map?.id)||null:draftPreview;
  const fillFog=reveal=>setDraft(d=>{
    const cells=createFogCells(d.gridColumns,d.gridRows,reveal);
    return d.vision?.automatic?{...d,vision:{...d.vision,overrides:cells}}:{...d,fogCells:cells};
  });
  return <section className={styles.workspace} data-testid={'site-'+mode+'-campaign-maps'}>
    {stream.loading?<p role="status">Checking shared maps…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {interactive||mode==='gm'?<label>Battle map
      <select aria-label="Battle map" value={map?.id||''}
        disabled={Boolean(requiredMapId)||liveRequired} onChange={e=>{setSelected(e.target.value);setNotice('');}}>
        {!map?<option value="">{requiredMapId?'Synchronising battle map':'No maps available'}</option>:null}
        {maps.map(row=><option key={row.id} value={row.id}>
          {row.name}{row.kind==='video'?' · Looping video':''}
        </option>)}
      </select>
    </label>:null}
    {liveRequired&&!liveMapId&&!stream.loading?<p role="status">No battle map is shared for this encounter.</p>:null}
    {liveMapId&&!map&&!stream.loading?<p role="status">Synchronising the shared encounter map…</p>:null}
    {encounterMapLink(encounter,map)?<p role="status">
      {encounter.paused?'Combat paused':'Live combat'} · Round {encounter.round||1}
      {encounter.combatants?.[encounter.turnIndex]?.name?' · '+encounter.combatants[encounter.turnIndex].name:''}
    </p>:null}
    {role==='gm'&&stream.data?<div className={styles.settings}>
      <h3>GM Battle Map Manager</h3>
      <p>Upload PNG/JPG/WEBP/GIF (8 MB) or looping MP4/WebM (48 MB).
        New maps are GM-only. Publish only safe player-facing media.</p>
      <div className={styles.fields}>
        <label>Map name<input value={draft.name} maxLength={100}
          onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/></label>
        <label>Visibility<select value={draft.visibility}
          onChange={e=>setDraft(d=>({...d,visibility:e.target.value}))}>
          <option value="gm">GM only</option><option value="players">Published to players</option>
        </select></label>
        <GeometryControls map={draft} patch={values=>setDraft(d=>({...d,...values}))} locked={Boolean(map?.combatId)}/>
        <label>Metres per cell<input type="number" min=".1" max="100" step=".01" disabled={Boolean(map?.combatId)}
          value={draft.metresPerCell} onChange={e=>setDraft(d=>({...d,metresPerCell:Number(e.target.value)}))}/></label>
        <label>Grid columns<input type="number" min={1} max={80}
          disabled={Boolean(map?.combatId)} value={draft.gridColumns}
          onChange={e=>resizeGrid('gridColumns',Number(e.target.value))}/></label>
        <label>Grid rows<input type="number" min={1} max={80}
          disabled={Boolean(map?.combatId)} value={draft.gridRows}
          onChange={e=>resizeGrid('gridRows',Number(e.target.value))}/></label>
        <label>Grid opacity<input type="number" min={0} max={100}
          value={draft.gridOpacity} onChange={e=>setDraft(d=>({...d,gridOpacity:Number(e.target.value)}))}/></label>
      </div>
      <label>Description<textarea maxLength={300} value={draft.description}
        onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label>
      <div className={styles.controls}>
        <label><input type="checkbox" checked={draft.gridVisible}
          onChange={e=>setDraft(d=>({...d,gridVisible:e.target.checked}))}/>Show grid</label>
        <label><input type="checkbox" checked={draft.fogEnabled}
          onChange={e=>setDraft(d=>({...d,fogEnabled:e.target.checked}))}/>Fog of war</label>
        <label><input type="checkbox" checked={previewFog}
          onChange={e=>setPreviewFog(e.target.checked)}/>Preview player fog</label>
        {map?<label>Map brush<select value={fogMode}
          onChange={e=>setFogMode(e.target.value)}>
          <option value="none">None</option>{source?<option value="source">Place source</option>:null}
          {draft.vision?.automatic?<option value="auto">Restore automatic vision</option>:null}<option value="terrain">Terrain</option><option disabled={!draft.fogEnabled} value="reveal">Reveal</option>
          <option disabled={!draft.fogEnabled} value="hide">Hide</option></select></label>:null}
        <BattleMapVisionControls map={draft} patch={fields=>setDraft(d=>({...d,...fields}))} placing={source}
          onPlace={item=>{setSource(item);setFogMode(item?'source':'none');}}/>
        {fogMode==='terrain'?<TerrainControls brush={brush} onChange={setBrush}/>:null}
        {map&&draft.fogEnabled?<button type="button" onClick={()=>fillFog(true)}>Reveal all</button>:null}
        {map&&draft.fogEnabled?<button type="button" onClick={()=>fillFog(false)}>Hide all</button>:null}
      </div>
      {map&&Array.isArray(draft.tokens)&&draft.tokens.length?<fieldset data-testid="gm-map-token-visibility">
        <legend>Individual token visibility</legend>
        <p>Choose which markers may appear on published player maps. Unrevealed fog
          still hides tokens. Active encounter tokens must be changed in Combat Command Centre.</p>
        {draft.tokens.map(token=><label key={token.id}>
          {token.label}
          <select value={token.visibility==='gm'?'gm':'players'}
            disabled={busy||Boolean(map.combatId)}
            onChange={event=>setDraft(previous=>({...previous,
              tokens:previous.tokens.map(row=>row.id===token.id?
                {...row,...(event.target.value==='gm'?{visibility:'gm'}:{visibility:'players'})}:row)
            }))}>
            <option value="gm">GM only</option>
            <option value="players">Show to players</option>
          </select>
        </label>)}
      </fieldset>:null}
      {!map?<label>Upload map media<input type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
        onChange={e=>setFile(e.target.files?.[0]||null)}/></label>:null}
      <div className={styles.controls}>
        {!map?<button type="button" disabled={!file||busy||maps.length>=BATTLE_MAP_MAX_RECORDS}
          onClick={upload}>Upload GM Map</button>:<>
          <button type="button" disabled={busy} onClick={save}>Save Map Settings</button>
          <button type="button" disabled={busy||Boolean(map.combatId)} onClick={remove}>Delete Map</button>
          <button type="button" onClick={()=>{setSelected('__new__');setDraft(empty());}}>
            Create New Map</button>
        </>}
      </div>
      {map?.combatId?<p role="status">Linked combat is active. Grid, tokens and deletion stay locked.</p>:null}
    </div>:null}
    {preview?<CampaignMapCanvas key={campaignId+':'+map.id+':'+map.storagePath+':'+(previewFog?'preview':'normal')} api={api} campaignId={campaignId} map={preview} mediaMap={map} camera={camera} interactive={interactive} movement={movement}
      mode={mode} showGrid={showGrid} previewFog={previewFog}
      editing={mode==='gm'&&(fogMode==='terrain'||draft.fogEnabled&&fogMode!=='none')} onPoint={editFog}/>:null}
    {map?<label className={styles.compact}><input type="checkbox" checked={showGrid}
      onChange={e=>setShowGrid(e.target.checked)}/>Show grid overlay</label>:null}
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
export function CampaignAtlasWorkspace({api,campaignId,mapId}){
  const stream=useCampaignStream(api,'watchAtlas',[campaignId]);
  const maps=stream.data||[],[selected,setSelected]=useState('');
  const map=maps.find(x=>x.id===(mapId||selected))||(!mapId?maps[0]:null);
  return <section className={styles.workspace} data-testid="site-campaign-atlas">
    {stream.loading?<p role="status">Loading published world maps…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {!map?<p>No published world maps available.</p>:<>
      {!mapId?<label>World atlas<select value={map.id} onChange={e=>setSelected(e.target.value)}>
        {maps.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>:null}
      <CampaignMapCanvas api={api} campaignId={campaignId} map={map} atlas/>
    </>}
  </section>;
}
