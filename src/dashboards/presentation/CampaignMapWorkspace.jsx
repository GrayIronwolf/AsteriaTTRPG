import React,{useEffect,useMemo,useRef,useState} from 'react';
import {
  battleMapEditableSettings,battleMapFileError,BATTLE_MAP_MAX_RECORDS,
  timestampRevision
} from './campaignMediaModel.mjs';
import {paintFogStroke,createFogCells,hiddenFogRuns,measureGridDistance} from '../../state/battleMapFogModel.mjs';
import {battleMapCameraView,DEFAULT_BATTLE_MAP_CAMERA,encounterMapLink} from '../../state/battleMapCamera.mjs';
import {mapCell,mapCellCenter,mapCellKey,mapReachableRoutes,mapRoutePoints,hexCellPoints} from '../../state/battleMapRoutes.mjs';
import {MAP_MOVE_AP} from '../../state/battleMapMovement.mjs';
import {battleMapPoint} from '../../state/battleMapModel.mjs';
import styles from './CampaignMapWorkspace.module.css';

const empty=()=>({
  name:'',description:'',visibility:'gm',gridColumns:20,gridRows:15,
  gridOpacity:40,gridVisible:true,fogEnabled:false,
  fogCells:createFogCells(20,15),metresPerCell:3,tokens:[],gridType:'square',terrainCells:[]
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
export function useCampaignStream(api,method,args,enabled=true){
  const scope=JSON.stringify([method,enabled,args]);
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
function useAuthenticatedMapBlob(api,campaignId,map,mode,atlas=false,restricted=false){
  const scope=JSON.stringify([campaignId,map?.id,map?.storagePath,map?.contentType,mode,atlas,restricted]);
  const [result,setResult]=useState({url:'',error:'',loading:false,scope:''});
  useEffect(()=>{
    let alive=true,url='';
    setResult({url:'',error:'',loading:Boolean(map),scope});
    if(!map)return undefined;
    Promise.resolve().then(()=>restricted?api.fetchRestrictedMapMedia(campaignId,map):
      atlas?api.fetchAtlasMedia(campaignId,map):api.fetchMapMedia(campaignId,map,mode))
      .then(blob=>{
        if(!alive)return;
        url=URL.createObjectURL(blob);
        setResult({url,error:'',loading:false,scope});
      }).catch(error=>{if(alive)setResult({url:'',error:error?.message||'Map cannot be loaded.',loading:false,scope});});
    return ()=>{alive=false;if(url)URL.revokeObjectURL(url);};
  },[api,scope]);
  return result.scope===scope?result:{url:'',error:'',loading:Boolean(map)};
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
export function CampaignMapCanvas({api,campaignId,map,mode='player',atlas=false,
  editing=false,onPoint,previewFog=false,showGrid=true,restricted=false,interactive=false,camera=null,
  movement=null,routeOverlay=[]}){
  const media=useAuthenticatedMapBlob(api,campaignId,map,mode,atlas,restricted);
  const node=useRef(null),drag=useRef(null),[playing,setPlaying]=useState(true);
  const [localCamera,setLocalCamera]=useState(DEFAULT_BATTLE_MAP_CAMERA);
  const [tool,setTool]=useState('pan'),[selection,setSelection]=useState(''),[ruler,setRuler]=useState([]);
  const [destination,setDestination]=useState(null),[moving,setMoving]=useState(false),[moveNotice,setMoveNotice]=useState('');
  const [moveQueued,setMoveQueued]=useState(false);
  const marker=map?.tokens?.find(row=>row.id===movement?.tokenId);
  const canMove=Boolean(marker&&movement?.distance>0&&!movement.disabled);
  const moveMode=tool==='move'&&canMove;
  const cols=map?.gridColumns||20,rows=map?.gridRows||15;
  const hex=map?.gridType==='hex';
  const hexShapes=useMemo(()=>hex?Array.from({length:rows*cols},(_,i)=>
    hexCellPoints({column:i%cols,row:Math.floor(i/cols)},cols,rows)
      .map(pair=>pair.join(',')).join(' ')):[],[hex,cols,rows]);
  const routes=useMemo(()=>tool==='move'&&canMove?mapReachableRoutes(map,marker,movement.distance,{
    occupied:map.tokens.filter(row=>row.id!==marker.id),diagonalParity:movement.diagonalParity,revealedOnly:true,
    movementKind:movement.routeKind||movement.approvedKind
  }):new Map(),[tool,canMove,map,marker,movement?.distance,movement?.diagonalParity,movement?.approvedKind,movement?.routeKind]);
  const route=destination?routes.get(destination):null;
  const routePoints=route?mapRoutePoints(route,cols,rows,map.gridType):[];
  useEffect(()=>{setDestination(null);setMoveNotice('');setMoveQueued(false);},[map?.id,marker?.x,marker?.y]);
  useEffect(()=>setDestination(null),[movement?.revision]);
  const commitMove=async target=>{
    if(!target||moving||!moveMode)return;
    setMoving(true);setMoveNotice('');
    try{
      const result=await movement.onMove(mapCellCenter(target,cols,rows,map.gridType));
      setDestination(null);setMoveQueued(result?.queued===true);
    }
    catch(error){setMoveNotice(error?.message||'The move could not be confirmed.');}
    finally{setMoving(false);}
  };
  useEffect(()=>{setPlaying(true);setLocalCamera(DEFAULT_BATTLE_MAP_CAMERA);
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
      {columns:cols,rows,snap:showGrid&&map.gridVisible,gridType:map.gridType});
    if(moveMode){
      const cell=mapCell(raw,cols,rows,map.gridType);
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
  if(!map)return <p>No map selected.</p>;
  const distance=ruler.length===2?measureGridDistance(ruler[0],ruler[1],cols,rows,map.metresPerCell,map.gridType):null;
  return <section className={styles.viewer} aria-label={'Campaign map: '+map.name}
    data-testid="site-media-map-canvas">
    {map.kind==='video'?<div className={styles.controls}>
      <button type="button" onClick={()=>setPlaying(!playing)}>
        {playing?'Pause looping video':'Play looping video'}</button>
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
        onClick={()=>{setTool('move');setSelection(marker.id);setDestination(null);}}>Move my token</button>:null}
      {tool==='ruler'?<output>{distance?distance.metres+' m':ruler.length?'Choose the end point':'Choose the start point'}</output>:null}
    </div>:null}
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
      {media.loading?<p role="status">Loading authenticated map media…</p>:null}
      {media.error?<p role="alert">{media.error}</p>:null}
      {media.url&&(map.kind==='video'
        ?<video key={media.url} className={styles.image} src={media.url}
          autoPlay={playing} muted loop playsInline preload="metadata"
          ref={el=>{if(!el)return;if(playing)el.play().catch(()=>{});else el.pause();}}
          aria-label={'Looping map: '+map.name}/>
        :<img className={styles.image} src={media.url} alt={map.name}/>)}
      {!atlas&&map.gridVisible&&showGrid?(hex?<svg aria-hidden="true"
        viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.reachable}
        style={{opacity:map.gridOpacity/100}}>
        {hexShapes.map((points,index)=><polygon key={index} points={points}
          fill="none" stroke="white" strokeWidth=".12"/>)}
      </svg>:<div className={styles.grid} aria-hidden="true"
        style={{backgroundSize:(100/cols)+'% '+(100/rows)+'%',
          opacity:map.gridOpacity/100}}/>):null}
      {!atlas&&Array.isArray(map.terrainCells)&&map.terrainCells.length>0?<svg
        aria-label="Map terrain overlay" viewBox="0 0 100 100" preserveAspectRatio="none"
        className={styles.reachable} style={{pointerEvents:'none'}}>
        {map.terrainCells.map(cell=>{
          const fill={wall:'#c74444',water:'#317ec4',difficult:'#a87a32',
            hazard:'#a8429c',cover:'#678663',stairs:'#989bb2'}[cell.kind]||'#94a1ae';
          return hex?<polygon key={mapCellKey(cell)} points={hexCellPoints(cell,cols,rows)
            .map(pair=>pair.join(',')).join(' ')} fill={fill} fillOpacity=".22"/>:
            <rect key={mapCellKey(cell)} x={cell.column*100/cols} y={cell.row*100/rows}
              width={100/cols} height={100/rows} fill={fill} fillOpacity=".22"/>;
        })}
      </svg>:null}
      {moveMode?<svg className={styles.reachable} data-move-kind={movement.approvedKind||'walk'}
        aria-label="Reachable destinations" viewBox="0 0 100 100" preserveAspectRatio="none">
        {[...routes.values()].filter(cell=>!fog||fogCells[cell.row*cols+cell.column]==='1').map(cell=>
          hex?<polygon key={mapCellKey(cell)} points={hexCellPoints(cell,cols,rows)
            .map(pair=>pair.join(',')).join(' ')}/>:
          <rect key={mapCellKey(cell)} x={cell.column*100/cols} y={cell.row*100/rows}
            width={100/cols} height={100/rows}/>)}
        {routePoints.length?<polyline points={routePoints.map(p=>p.x+','+p.y).join(' ')}/>:null}
      </svg>:null}
      {mode==='gm'&&routeOverlay.length>1?<svg className={styles.reachable}
        aria-label="Confirmed movement route" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline points={routeOverlay.map(p=>p.x+','+p.y).join(' ')}/>
      </svg>:null}
      {!atlas&&tokens.filter(t=>{
        if(!fog)return true;
        const x=Math.min(cols-1,Math.floor(t.x*cols/100));
        const y=Math.min(rows-1,Math.floor(t.y*rows/100));
        return fogCells[y*cols+x]==='1';
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
      {fog?<svg className={styles.fog} viewBox="0 0 100 100"
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
  const stream=useCampaignStream(api,'watchMaps',[campaignId,mode]);
  const maps=stream.data||[];
  const [selected,setSelected]=useState(''),[draft,setDraft]=useState(empty);
  const [file,setFile]=useState(null),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [fogMode,setFogMode]=useState('none'),[showGrid,setShowGrid]=useState(true);
  const [previewFog,setPreviewFog]=useState(false);
  const liveRequired=mode==='player'&&encounter?.status==='active'&&!selectedMapId;
  const liveMapId=liveRequired?encounter.battleMapId||'':'';
  const requiredMapId=selectedMapId||liveMapId;
  const candidate=selected==='__new__'?null:maps.find(item=>item.id===(requiredMapId||selected))||
    (!requiredMapId?maps[0]:null)||null;
  const map=liveRequired&&!encounterMapLink(encounter,candidate)?null:candidate;
  useEffect(()=>{
    setDraft(map?{
      name:map.name,description:map.description,visibility:map.visibility,
      gridColumns:map.gridColumns,gridRows:map.gridRows,gridOpacity:map.gridOpacity,
      gridVisible:map.gridVisible,fogEnabled:map.fogEnabled,
      gridType:map.gridType||'square',terrainCells:map.terrainCells||[],
      fogCells:map.fogCells,metresPerCell:map.metresPerCell,tokens:map.tokens
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
  const editFog=point=>{
    if(!['reveal','hide'].includes(fogMode)||!map||!draft.fogEnabled)return;
    setDraft(current=>({...current,fogCells:paintFogStroke(current.fogCells,
      current.gridColumns,current.gridRows,point,point,fogMode,1)}));
  };
  const preview=map?{...map,...(mode==='gm'?draft:{})}:null;
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
        <label>Grid columns<input type="number" min={1} max={80}
          disabled={Boolean(map?.combatId)} value={draft.gridColumns}
          onChange={e=>setDraft(d=>({...d,gridColumns:Number(e.target.value)}))}/></label>
        <label>Grid rows<input type="number" min={1} max={80}
          disabled={Boolean(map?.combatId)} value={draft.gridRows}
          onChange={e=>setDraft(d=>({...d,gridRows:Number(e.target.value)}))}/></label>
        <label>Grid opacity<input type="number" min={0} max={100}
          value={draft.gridOpacity} onChange={e=>setDraft(d=>({...d,gridOpacity:Number(e.target.value)}))}/></label>
      </div>
      <label>Grid geometry<select value={draft.gridType||'square'} disabled={Boolean(map?.combatId)}
        onChange={e=>setDraft(d=>({...d,gridType:e.target.value}))}>
        <option value="square">Square grid</option><option value="hex">Hexagonal grid</option>
      </select></label>
      <label>Description<textarea maxLength={300} value={draft.description}
        onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label>
      <div className={styles.controls}>
        <label><input type="checkbox" checked={draft.gridVisible}
          onChange={e=>setDraft(d=>({...d,gridVisible:e.target.checked}))}/>Show grid</label>
        <label><input type="checkbox" checked={draft.fogEnabled}
          onChange={e=>setDraft(d=>({...d,fogEnabled:e.target.checked}))}/>Fog of war</label>
        <label><input type="checkbox" checked={previewFog}
          onChange={e=>setPreviewFog(e.target.checked)}/>Preview player fog</label>
        {map&&draft.fogEnabled?<label>Fog tool<select value={fogMode}
          onChange={e=>setFogMode(e.target.value)}>
          <option value="none">None</option><option value="reveal">Reveal</option>
          <option value="hide">Hide</option></select></label>:null}
        {map&&draft.fogEnabled?<button type="button" onClick={()=>setDraft(d=>({...d,
          fogCells:createFogCells(d.gridColumns,d.gridRows,true)}))}>Reveal all</button>:null}
        {map&&draft.fogEnabled?<button type="button" onClick={()=>setDraft(d=>({...d,
          fogCells:createFogCells(d.gridColumns,d.gridRows,false)}))}>Hide all</button>:null}
      </div>
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
    {preview?<CampaignMapCanvas api={api} campaignId={campaignId} map={preview} camera={camera} interactive={interactive} movement={movement}
      mode={mode} showGrid={showGrid} previewFog={previewFog}
      editing={mode==='gm'&&draft.fogEnabled&&fogMode!=='none'} onPoint={editFog}/>:null}
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
