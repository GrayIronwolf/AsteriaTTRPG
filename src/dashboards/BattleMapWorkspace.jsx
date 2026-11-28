import {createSiteCombatApi,createSiteCombatMediaApi} from './combat/siteCombatApi.js';
import {MAP_MOVE_AP,walkingAllowance} from '../state/battleMapMovement.mjs';
import {resizeTerrainCells,publicTerrainCells} from '../state/battleMapTerrainModel.mjs';
import {mapCell,measureMapRoute} from '../state/battleMapRoutes.mjs';
import {partyVisibility} from '../state/battleMapVision.mjs';
import {BattleMapVisionControls} from './presentation/BattleMapVisionControls.jsx';
import {GridLayer,CellFog,GeometryControls,TerrainControls,terrainAtPoint,firstTerrainBrush,RouteReading,AreaControls,AreaOverlay} from './presentation/BattleMapLayers.jsx';
import {BattleMapToken,CampaignMapWorkspace} from './presentation/CampaignMapWorkspace.jsx';
import {useBattleMapSession,useMapMedia,useMapSelection} from './presentation/useMapMedia.js';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {battleMapMediaError} from '../firebase/battleMapMedia.mjs';
import {Panel} from '../components/WorkspaceUI.jsx';
import {
  battleMapFileError,battleMapEditableSettings,battleMapPoint,battleMapTokenAppearance,
  BATTLE_MAP_MAX_TOKENS
} from '../state/battleMapModel.mjs';
import {
  createFogCells,resizeFogCells,mapFogStroke,hiddenFogRuns,fogRevealFraction,
  battleMapPrivatePins
} from '../state/battleMapFogModel.mjs';
import {activeMapEncounter,combatMapLinked,combatMapRoster,derivedCombatMapTokens,combatMapMovementAllowance} from '../state/battleMapCombatModel.mjs';
import {hudImageSource} from '../state/playerHudMedia.mjs';

const defaults=()=>({
  name:'',description:'',visibility:'gm',gridColumns:20,gridRows:15,
  gridOpacity:40,gridVisible:true,tokens:[],
  fogEnabled:false,fogCells:'',metresPerCell:3,gridType:'hex',terrainCells:[]
});
const currentSettings=map=>({
  name:map.name,description:map.description||'',visibility:map.visibility,
  gridColumns:map.gridColumns,gridRows:map.gridRows,
  gridOpacity:map.gridOpacity,gridVisible:map.gridVisible,
  tokens:map.tokens||[],fogEnabled:map.fogEnabled===true,
  fogCells:map.fogCells||'',metresPerCell:map.metresPerCell??1,
  gridType:map.gridType||'square',terrainCells:map.terrainCells||[],gridOffsetX:map.gridOffsetX||0,gridOffsetY:map.gridOffsetY||0,...(map.vision?{vision:map.vision}:{})
});
async function mediaDimensions(file){
  const url=URL.createObjectURL(file),isVideo=String(file.type).startsWith('video/');
  try{
    return await new Promise((resolve,reject)=>{
      const el=document.createElement(isVideo?'video':'img');
      const clear=()=>{el.onloadedmetadata=null;el.onload=null;el.onerror=null;clearTimeout(timeout);};
      const timeout=setTimeout(()=>{clear();reject(Error('Could not inspect this map file. Use a browser-compatible MP4/WebM or image.'));},12000);
      const ready=()=>{
        const width=isVideo?el.videoWidth:el.naturalWidth;
        const height=isVideo?el.videoHeight:el.naturalHeight;
        clear();
        if(!width||!height||width>8192||height>8192)reject(Error('Map dimensions must be between 1 and 8192 pixels.'));
        else resolve({width,height});
      };
      el.onerror=()=>{clear();reject(Error('This file cannot be decoded in your browser. Check its codec or format.'));};
      if(isVideo){el.preload='metadata';el.muted=true;el.onloadedmetadata=ready;}
      else el.onload=ready;
      el.src=url;
    });
  }finally{URL.revokeObjectURL(url);}
}
function useBattleMaps(campaignId,gm,session){
  const scope=useMemo(()=>({}),[campaignId,gm,session]);
  const [state,setState]=useState(null);
  useEffect(()=>{
    if(!campaignId||!session)return undefined;
    let active=true;
    const update=maps=>{if(active)setState({scope,maps,error:''});};
    const onError=error=>{if(active)setState({scope,maps:[],error:error.message});};
    try{
      const stop=firebaseService.subscribeBattleMaps(campaignId,update,{gm,onError});
      return ()=>{active=false;stop?.();};
    }catch(error){onError(error);return undefined;}
  },[scope]);
  return state?.scope===scope?{...state,ready:!state.error}:{maps:[],error:'',ready:false};
}
async function loadWorkspaceMap(campaignId,map,options){
  const result=await firebaseService.fetchBattleMapMedia(campaignId,map,options);
  if(!result?.ok)throw battleMapMediaError(result?.code,result?.error||'Map media is unavailable.');
  return result.blob;
}
function MapCanvas({campaignId,map,session,gm=false,onPlaceToken,selectedTokenId='',fogTool='token',
  onFogStroke,onFogBegin,onPrivatePin,privatePins=[],previewPlayerFog=false,onMeasure,measurePoints=[],
  encounter=null,selectedCombatantId='',onCombatMove,combatBusy=false,onTerrain,onSource,area={}}) {
  const media=useMapMedia(campaignId,map,session,loadWorkspaceMap),canvas=useRef(null);
  const [showGrid,setShowGrid]=useState(true);
  const pointerLast=useRef(null);
  useEffect(()=>setShowGrid(true),[map?.id]);
  const playerFog=Boolean(map?.fogEnabled)&&(!gm||previewPlayerFog);
  const cols=Number(map?.gridColumns||20),rows=Number(map?.gridRows||15);
  const fogRectangles=playerFog?hiddenFogRuns(map?.fogCells,cols,rows):[];
  const isBrush=gm&&map&&['reveal','hide','auto'].includes(fogTool)&&map.fogEnabled;
  const isPlacing=gm&&fogTool==='token'&&Boolean(selectedTokenId);
  const isCombatMove=gm&&fogTool==='combat'&&combatMapLinked(map,encounter)&&
    Boolean(selectedCombatantId)&&Boolean(onCombatMove)&&!combatBusy;
  const isAnnotating=gm&&fogTool==='pin'&&Boolean(onPrivatePin);
  const isMeasuring=gm&&fogTool==='measure'&&Boolean(onMeasure);
  const tokens=derivedCombatMapTokens(map,encounter);
  const combatants=combatMapRoster(encounter);
  const activeActor=combatants.find(row=>row.isCurrent)?.id||'';
  const grid=map?.gridVisible&&showGrid;
  const pointFromEvent=event=>{
    const bounds=canvas.current?.getBoundingClientRect();
    if(!bounds?.width||!bounds?.height)return null;
    return {
      x:Math.round(Math.max(0,Math.min(100,(event.clientX-bounds.left)*100/bounds.width))*100)/100,
      y:Math.round(Math.max(0,Math.min(100,(event.clientY-bounds.top)*100/bounds.height))*100)/100
    };
  };
  const pointerDown=event=>{
    if(!(isBrush||isMeasuring||isAnnotating))return;
    const point=pointFromEvent(event);
    if(!point)return;
    if(isBrush){
      event.preventDefault();
      pointerLast.current=point;
      onFogBegin?.();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onFogStroke(point,point,fogTool);
    }else if(isMeasuring)onMeasure(point);
    else if(isAnnotating)onPrivatePin(point);
  };
  const pointerMove=event=>{
    if(!isBrush||!pointerLast.current)return;
    const point=pointFromEvent(event);
    if(!point)return;
    event.preventDefault();
    onFogStroke(pointerLast.current,point,fogTool);
    pointerLast.current=point;
  };
  const pointerUp=()=>{pointerLast.current=null;};
  const move=event=>{
    if(gm&&fogTool==='source'){const point=pointFromEvent(event);if(point)onSource?.(point);return;}
    if(gm&&fogTool==='terrain'){const point=pointFromEvent(event);if(point)onTerrain?.(point);return;}
    if(isCombatMove){const point=pointFromEvent(event);if(point)onCombatMove(selectedCombatantId,point);return;}
    if(!isPlacing||!onPlaceToken)return;
    const point=pointFromEvent(event);
    if(!point)return;
    const snapped=battleMapPoint(point.x,point.y,{...map,columns:map.gridColumns,rows:map.gridRows,snap:grid});
    onPlaceToken(selectedTokenId,snapped);
  };
  if(!map)return <p>Select a battle map.</p>;
  return <section className="asteria-battle-viewer" aria-label={'Battle map: '+map.name}>
    <div className="asteria-battle-controls">
      <strong>{map.name}</strong>
      {map.kind==='video'?<button type="button" onClick={media.togglePlayback} disabled={!media.url}
        aria-label={media.playing?'Pause looping video':'Play looping video'}>{media.playing?'Pause animation':'Play animation'}</button>:null}
      {map.gridVisible?<button type="button" onClick={()=>setShowGrid(value=>!value)}>
        {showGrid?'Hide grid':'Show grid'}</button>:null}
    </div>
    {media.error?<div><p role="alert">{media.error}</p>
      <button type="button" onClick={media.retry}>Retry loading media</button></div>:null}
    <div ref={canvas} className={'asteria-battle-canvas'+((isPlacing||isBrush||isMeasuring||isAnnotating||isCombatMove)?' token-placement':'')+(isBrush?' fog-edit':'')}
      onClick={move} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}
      style={{aspectRatio:map.width+' / '+map.height}}>
      {media.url?(map.kind==='video'?<video key={media.url} src={media.url} className="asteria-battle-media"
        autoPlay loop muted playsInline preload="auto" controls={false} ref={media.videoRef}
        onPlay={media.updatePlayback} onPause={media.updatePlayback}
        onLoadedData={media.ready} onCanPlay={media.ready}
        onError={media.decodeFailed} aria-label={'Looping animated map: '+map.name}/>:
        <img key={media.url} src={media.url} alt={map.name} className="asteria-battle-media"
          onLoad={media.ready} onError={media.decodeFailed}/>):null}
      <GridLayer map={previewPlayerFog?{...map,terrainCells:publicTerrainCells(map,map.fogCells)}:map} visible={grid}/>
      {tokens.filter(token=>{
        if((!gm||previewPlayerFog)&&token.visibility==='gm')return false;
        if(!playerFog)return true;
        const cell=mapCell(token,cols,rows,map);
        return cell&&(map.tokenCells||map.fogCells)?.[cell.row*cols+cell.column]==='1';
      }).map(token=><BattleMapToken key={token.id} token={token} columns={cols} rows={rows}
        className="asteria-battle-token" selected={token.id===selectedTokenId}
        current={Boolean(token.combatantId&&token.combatantId===activeActor&&combatMapLinked(map,encounter))}
        defeated={Boolean(token.combatantId&&combatants.find(row=>row.id===token.combatantId)?.defeated)}/>)}
      {playerFog&&(map.exploredCells||map.gridType==='hex'||map.gridOffsetX||map.gridOffsetY)?<CellFog map={map} cells={map.fogCells} className="asteria-battle-fog"/>:playerFog?<svg className="asteria-battle-fog" viewBox="0 0 100 100" preserveAspectRatio="none"
        aria-label="Fog of war hidden regions">
        {fogRectangles.map((rect,index)=><rect key={index}
          x={rect.x} y={rect.y} width={rect.width} height={rect.height}/>)}
      </svg>:null}
      {gm&&!previewPlayerFog&&privatePins.map(pin=><span key={pin.id}
        className="asteria-battle-secret-pin" style={{left:pin.x+'%',top:pin.y+'%'}}
        title={pin.label+' — '+pin.note} aria-label={'GM-only '+pin.kind+': '+pin.label}>
        {pin.kind==='hazard'?'!':pin.kind==='encounter'?'E':'N'}
      </span>)}
      {gm&&fogTool==='measure'?<AreaOverlay map={map} points={measurePoints} area={area}/>:null}
      {gm&&measurePoints.length>0?<svg className="asteria-battle-ruler" viewBox="0 0 100 100"
        preserveAspectRatio="none" aria-hidden="true">
        {measurePoints.length===2?<line x1={measurePoints[0].x} y1={measurePoints[0].y}
          x2={measurePoints[1].x} y2={measurePoints[1].y}/>:null}
        {measurePoints.map((point,index)=><circle key={index} cx={point.x} cy={point.y} r=".8"/>)}
      </svg>:null}
      {media.loading?<p className="asteria-battle-loading" role="status">
        {media.url?'Preparing map media…':'Loading private map media…'}</p>:null}
    </div>
    {map.description?<p className="react-help">{map.description}</p>:null}
    {isPlacing?<p className="react-help">Click the map to place the selected token. Grid snapping applies when the grid is visible.</p>:null}
    {isCombatMove?<p className="react-help">Click a destination square for the selected combatant. The server validates current turn and remaining approved movement.</p>:null}
    {isBrush?<p className="react-help">Drag on the map to paint fog. Changes are drafts until you save map settings.</p>:null}
    {map.kind==='video'?<small>Video loops silently. Playback begins automatically where the browser permits; use Play animation if autoplay is blocked.</small>:null}
  </section>;
}
function TokenAppearanceFields({value,onChange}){
  return <div className="asteria-battle-form-row">
    <label>Portrait URL<input maxLength={600} value={value.portrait||''}
      placeholder="HTTPS or site-relative URL" onChange={event=>onChange({portrait:event.target.value})}/></label>
    <label>Faction<select value={value.faction||''} onChange={event=>onChange({faction:event.target.value})}>
      <option value="">Default</option><option value="party">Party</option>
      <option value="ally">Ally</option><option value="neutral">Neutral</option>
      <option value="hostile">Hostile</option>
    </select></label>
    <label>Footprint (cells per side)<input type="number" min="1" max="80" value={value.cells??1}
      onChange={event=>onChange({cells:event.target.value===''?'':Number(event.target.value)})}/></label>
    <label>Token visibility<select value={value.visibility||'players'}
      onChange={event=>onChange({visibility:event.target.value})}>
      <option value="players">Visible when revealed</option><option value="gm">GM only</option>
    </select></label>
  </div>;
}
function LiveTokenAppearance({token,busy,onSave}){
  const [appearance,setAppearance]=useState(token);
  return <details>
    <summary>Token appearance and visibility</summary>
    <TokenAppearanceFields value={appearance} onChange={change=>setAppearance(previous=>({...previous,...change}))}/>
    <button type="button" disabled={busy} onClick={()=>onSave(token.id,appearance)}>Save token appearance</button>
  </details>;
}
function TokenEditor({tokens,onChange,characters={},selectedTokenId,onSelect}){
  const [label,setLabel]=useState(''),[kind,setKind]=useState('marker'),[refId,setRefId]=useState('');
  const roster=Object.values(characters).filter(record=>record?.id);
  const selected=tokens.find(row=>row.id===selectedTokenId);
  const add=()=>{
    if(tokens.length>=BATTLE_MAP_MAX_TOKENS)return;
    const linked=kind==='character'&&refId?roster.find(row=>row.id===refId):null;
    const final=linked?.name||label;
    if(!final?.trim())return;
    const portrait=hudImageSource(linked?.image,linked?.portrait,linked?.characterImage,linked?.appearance?.image);
    const token={id:crypto.randomUUID(),label:final.trim().slice(0,48),kind,
      refId:kind==='character'?refId:'',x:50,y:50};
    try{Object.assign(token,battleMapTokenAppearance({portrait}));}
    catch{ /* Legacy character artwork may not have a shareable URL. */ }
    onChange([...tokens,token]);onSelect(token.id);setLabel('');
  };
  return <section aria-label="Battle map tokens" className="asteria-battle-token-editor">
    <h4>Map Tokens ({tokens.length}/{BATTLE_MAP_MAX_TOKENS})</h4>
    <div className="asteria-battle-form-row">
      <label>Token type<select value={kind} onChange={event=>setKind(event.target.value)}>
        <option value="marker">Marker</option>
        <option value="character">Player character</option>
        <option value="creature">Creature / NPC</option>
      </select></label>
      {kind==='character'?<label>Linked character<select value={refId} onChange={event=>{
        const id=event.target.value;setRefId(id);setLabel(roster.find(row=>row.id===id)?.name||'');
      }}>
        <option value="">Manual label</option>{roster.map(row=><option key={row.id} value={row.id}>{row.name||row.id}</option>)}
      </select></label>:null}
      <label>Token label<input maxLength={48} value={label} onChange={event=>setLabel(event.target.value)}/></label>
      <button type="button" disabled={!label.trim()||tokens.length>=BATTLE_MAP_MAX_TOKENS} onClick={add}>Add token</button>
    </div>
    <div className="asteria-battle-token-list">
      {tokens.map(token=><div key={token.id}>
        <button type="button" className={token.id===selectedTokenId?'active':''} onClick={()=>onSelect(token.id)}>
          {token.label} ({Math.round(token.x)}%, {Math.round(token.y)}%)
        </button>
        <button type="button" onClick={()=>onChange(tokens.filter(row=>row.id!==token.id))}>Remove</button>
      </div>)}
    </div>
    {selected?<details open>
      <summary>{selected.label} appearance and visibility</summary>
      <TokenAppearanceFields value={selected} onChange={change=>onChange(
        tokens.map(row=>row.id===selected.id?{...row,...change}:row)
      )}/>
    </details>:null}
  </section>;
}
export function GMBattleMapManager({campaignId,characters={},encounter={},searchTarget=null}){
  const session=useBattleMapSession();
  const {maps,ready:mapsReady,error:listenerError}=useBattleMaps(campaignId,true,session);
  const [selectedId,setSelectedId]=useMapSelection(campaignId,session?.uid,'editor');
  const [draft,setDraft]=useState(defaults);
  const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [selectedTokenId,setSelectedTokenId]=useState('');
  const [fogTool,setFogTool]=useState('token'),[fogBrush,setFogBrush]=useState(1);
  const [brush,setBrush]=useState(firstTerrainBrush),[area,setArea]=useState({shape:''});
  const [calibration,setCalibration]=useState(''),[source,setSource]=useState(null);
  const [previewPlayerFog,setPreviewPlayerFog]=useState(false);
  const [measurePoints,setMeasurePoints]=useState([]);
  const [privatePins,setPrivatePins]=useState([]),[privateNoteName,setPrivateNoteName]=useState('');
  const [privateNoteText,setPrivateNoteText]=useState(''),[privateNoteKind,setPrivateNoteKind]=useState('note');
  const [privateDirty,setPrivateDirty]=useState(false);
  const [selectedCombatantId,setSelectedCombatantId]=useState('');
  const [movementMode,setMovementMode]=useState('movement'),[repositionReason,setRepositionReason]=useState('');
  const [forcedSource,setForcedSource]=useState(''),[forcedKind,setForcedKind]=useState('spell');
  const [forcedRoute,setForcedRoute]=useState('ground'),[forcedDistance,setForcedDistance]=useState('');
  const [forcedResolved,setForcedResolved]=useState(false);
  const [delegateUid,setDelegateUid]=useState('');
  const undoFog=useRef([]);
  const selected=maps.find(row=>row.id===selectedId)||null;
  useEffect(()=>{if(searchTarget?.category==='battle-map'&&maps.some(x=>x.id===searchTarget.id))
    setSelectedId(searchTarget.id);},[searchTarget,maps]);
  const combatLinked=combatMapLinked(selected,encounter);
  const combatants=combatMapRoster(encounter);
  const combatCurrent=combatants.find(row=>row.isCurrent);
  const combatMoveRemaining=selectedCombatantId?combatMapMovementAllowance(encounter,selectedCombatantId):null;
  const selectedCombatToken=selectedCombatantId?selected?.tokens.find(row=>row.combatantId===selectedCombatantId):null;
  useEffect(()=>{
    if(mapsReady&&selectedId&&!maps.some(row=>row.id===selectedId))setSelectedId('');
  },[maps,selectedId,mapsReady]);
  useEffect(()=>{
    if(selected)setDraft(currentSettings(selected));
    else setDraft(defaults());
    setPreviewPlayerFog(selected?.fogEnabled===true);
    setSelectedTokenId('');setSelectedCombatantId('');setFogTool('token');setSource(null);
    setMeasurePoints([]);undoFog.current=[];setPrivateDirty(false);
  },[selected?.id,campaignId,session]);
  useEffect(()=>{
    setPrivatePins([]);setPrivateDirty(false);
    if(!campaignId||!selectedId)return undefined;
    try{return firebaseService.subscribeBattleMapPrivatePins(campaignId,selectedId,pins=>{
      setPrivatePins(pins);setPrivateDirty(false);
    });}catch(error){setMessage(error.message);return undefined;}
  },[campaignId,selectedId]);
  const settings=useMemo(()=>{try{return battleMapEditableSettings(draft);}catch{return null;}},[draft]);
  const patch=values=>setDraft(previous=>{
    if(values.gridColumns===undefined&&values.gridRows===undefined)return {...previous,...values};
    const nextCols=values.gridColumns??previous.gridColumns;
    const nextRows=values.gridRows??previous.gridRows;
    if(!Number.isInteger(nextCols)||!Number.isInteger(nextRows)||
      nextCols<1||nextCols>80||nextRows<1||nextRows>80)return previous;
    try{
      return {...previous,...values,fogCells:resizeFogCells(previous.fogCells,
        previous.gridColumns,previous.gridRows,nextCols,nextRows),
        terrainCells:resizeTerrainCells(previous.terrainCells||[],previous.gridColumns,
          previous.gridRows,nextCols,nextRows)};
    }catch{return {...previous,...values};}
  });
  const rememberFog=()=>{undoFog.current=[...undoFog.current.slice(-19),{
    fogCells:draft.fogCells||createFogCells(draft.gridColumns,draft.gridRows),
    ...(draft.vision?{vision:draft.vision}:{})
  }];};
  const fogStroke=(start,end,tool)=>setDraft(previous=>({...previous,...mapFogStroke(previous,start,end,tool,fogBrush)}));
  const setAllFog=revealed=>{
    rememberFog();
    const cells=createFogCells(draft.gridColumns,draft.gridRows,revealed);
    patch(draft.vision?.automatic?{vision:{...draft.vision,overrides:cells}}:{fogCells:cells});
  };
  const undoFogStroke=()=>{if(undoFog.current.length)patch(undoFog.current.pop());};
  const addPrivatePin=point=>{
    if(!privateNoteName.trim()){setMessage('Enter a GM-only pin name before placing it.');return;}
    try{
      const next=battleMapPrivatePins([...privatePins,{
        id:crypto.randomUUID(),label:privateNoteName,kind:privateNoteKind,note:privateNoteText,...point
      }]);
      setPrivatePins(next);setPrivateDirty(true);setPrivateNoteName('');setPrivateNoteText('');
      setMessage('Private pin placed. Save GM-only notes to persist.');
    }catch(error){setMessage(error.message);}
  };
  const placeMeasurePoint=point=>setMeasurePoints(previous=>previous.length===2?[point]:[...previous,point]);
  let measurement=null;
  if(measurePoints.length===2){
    try{measurement=measureMapRoute(draft,measurePoints[0],measurePoints[1]);}catch{measurement=null;}
  }
  const act=async callback=>{
    setBusy(true);setMessage('');
    try{
      const result=await callback();
      setMessage(result?.ok?'Map saved successfully.':result?.error||'Map operation failed.');
      return result;
    }catch(error){setMessage(error.message||'Map operation failed.');return {ok:false};}
    finally{setBusy(false);}
  };
  const upload=async()=>{
    if(!file||!settings)return;
    const validation=battleMapFileError(file);
    if(validation){setMessage(validation);return;}
    const result=await act(async()=>{
      const dims=await mediaDimensions(file);
      return firebaseService.uploadBattleMap(campaignId,file,settings,dims);
    });
    if(result.ok){setFile(null);setSelectedId(result.map.id);}
  };
  const save=async()=>{if(settings&&selected){const safeSettings=combatLinked?{...settings,tokens:selected.tokens}:settings;
    const result=await act(()=>firebaseService.updateBattleMap(campaignId,selected.id,safeSettings));if(result.ok)undoFog.current=[];}};
  const linkCombat=async()=>{
    if(!selected||!activeMapEncounter(encounter))return;
    const result=await act(()=>firebaseService.combatCommand(campaignId,'encounter',{
      operation:'map-link',mapId:selected.id,revision:Number(encounter.combat?.revision||0)
    }));
    if(result.ok){setSelectedCombatantId('');setFogTool('combat');}
  };
  const moveCombatToken=async(combatantId,point)=>{
    if(!combatLinked||busy)return;
    if(movementMode==='forced'&&(!forcedResolved||forcedSource.trim().length<2||
      !(Number(forcedDistance)>0&&Number(forcedDistance)<=1000)||repositionReason.trim().length<5)){
      setMessage('Confirm the resolved source, approved range and reason before moving.');
      return;
    }
    await act(()=>firebaseService.combatCommand(campaignId,'encounter',{
      operation:'map-move',mapId:selected.id,combatantId,point,mode:movementMode,
      reason:movementMode==='movement'?'':repositionReason,
      ...(movementMode==='forced'?{source:{id:forcedSource.trim(),kind:forcedKind,
        routeKind:forcedRoute,distance:Number(forcedDistance),resolved:forcedResolved}}:{}),
      revision:Number(encounter.combat?.revision||0)
    }));
  };
  const saveMapDelegate=async()=>{
    if(!selectedCombatantId||!combatLinked)return;
    await act(()=>firebaseService.combatCommand(campaignId,'encounter',{
      operation:'map-delegate',mapId:selected.id,combatantId:selectedCombatantId,
      delegateUid:delegateUid.trim(),revision:Number(encounter.combat?.revision||0)
    }));
  };
  const saveCombatToken=(tokenId,appearance)=>act(()=>firebaseService.combatCommand(campaignId,'encounter',{
    operation:'map-token-appearance',mapId:selected.id,tokenId,appearance,
    revision:Number(encounter.combat?.revision||0)
  }));
  const savePrivate=async()=>{
    if(!selected)return;
    const result=await act(()=>firebaseService.saveBattleMapPrivatePins(campaignId,selected.id,privatePins));
    if(result.ok)setPrivateDirty(false);
  };
  const remove=async()=>{
    if(!selected||!window.confirm('Permanently remove this battle map and its uploaded media?'))return;
    const result=await act(()=>firebaseService.removeBattleMap(campaignId,selected.id));
    if(result.ok)setSelectedId('');
  };
  const moveToken=useCallback((id,point)=>setDraft(previous=>({...previous,tokens:previous.tokens.map(t=>t.id===id?{...t,...point}:t)})),[]);
  const rawView=selected?{...selected,...draft,
    tokens:combatLinked?selected.tokens:draft.tokens}:null;
  const visibility=useMemo(()=>{
    if(!previewPlayerFog||!rawView?.fogEnabled||!rawView.vision?.automatic)return null;
    try{return partyVisibility(rawView,encounter,characters);}catch{return {fogCells:'0'.repeat(rawView.gridColumns*rawView.gridRows)};}
  },[previewPlayerFog,selected,draft,encounter,characters]);
  const viewMap=visibility?{...rawView,...visibility}:rawView;
  const placeSource=point=>{
    if(!source)return;
    patch({vision:{...draft.vision,sources:[...(draft.vision?.sources||[]),{...source,...point}]}});
    setSource(null);setFogTool('token');
  };
  return <Panel title="Battle Maps & Animated Scenes" eyebrow="Digital GM Toolkit · Phase 6.2">
    <p className="react-help">Upload a static image or a looping MP4/WebM video. Maps start GM-only. Publish a map when players should see its scene and markers. Phase 6.2 adds a visual fog overlay, scene ruler, and separate private GM annotations. Combat turn movement remains Phase 6.3.</p>
    {listenerError?<p role="alert">{listenerError}</p>:null}
    <div className="asteria-battle-form-row">
      <label>Choose a map<select value={selectedId} onChange={event=>setSelectedId(event.target.value)}>
        <option value="">New map</option>
        {maps.map(map=><option key={map.id} value={map.id}>{map.name} · {map.kind==='video'?'Animated':'Image'} · {map.visibility==='players'?'Shared':'GM only'}</option>)}
      </select></label>
      <button type="button" disabled={busy} onClick={()=>{setSelectedId('');setDraft(defaults());}}>New map</button>
    </div>
    {!selected?<div className="asteria-battle-upload">
      <h4>Upload battle map</h4>
      <label>Map image or looping video<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
        onChange={event=>{const picked=event.target.files?.[0]||null;setFile(picked);setMessage(picked?battleMapFileError(picked):'');}}/></label>
      <small>PNG/JPG/WEBP/GIF up to 8 MB; MP4/WebM up to 48 MB. Use browser-compatible H.264 MP4 or WebM encoding. Video is silent and automatically loops.</small>
    </div>:null}
    <div className="asteria-battle-form-row">
      <label>Map name<input maxLength={100} value={draft.name} onChange={event=>patch({name:event.target.value})}/></label>
      <label>Visibility<select value={draft.visibility} onChange={event=>patch({visibility:event.target.value})}>
        <option value="gm">GM only</option><option value="players">Share with players</option>
      </select></label>
      <label>Grid columns<input type="number" min="1" max="80" disabled={combatLinked} value={draft.gridColumns} onChange={event=>patch({gridColumns:Number(event.target.value)})}/></label>
      <label>Grid rows<input type="number" min="1" max="80" disabled={combatLinked} value={draft.gridRows} onChange={event=>patch({gridRows:Number(event.target.value)})}/></label>
      <label>Grid opacity %<input type="number" min="0" max="100" value={draft.gridOpacity} onChange={event=>patch({gridOpacity:Number(event.target.value)})}/></label>
      <label><input type="checkbox" checked={draft.gridVisible} onChange={event=>patch({gridVisible:event.target.checked})}/> Show grid</label>
      <GeometryControls map={draft} patch={patch} locked={combatLinked}/>
      <label>Metres per cell<input type="number" min="0.1" max="100" step="0.1" disabled={combatLinked} value={draft.metresPerCell}
        onChange={event=>patch({metresPerCell:Number(event.target.value)})}/></label>
      <label><input type="checkbox" checked={draft.fogEnabled} onChange={event=>{
        patch({fogEnabled:event.target.checked});setFogTool(event.target.checked?'reveal':'token');
        setPreviewPlayerFog(event.target.checked);
      }}/> Enable fog of war</label>
    </div>
    <label>Map description<textarea value={draft.description} maxLength={300}
      onChange={event=>patch({description:event.target.value})}/></label>
    {selected?<section className="asteria-battle-fog-editor" aria-label="Fog of war and map tools">
      <h4>Fog of War & Map Tools</h4>
      <div className="asteria-battle-form-row">
        <label>Map interaction tool<select value={fogTool} onChange={event=>setFogTool(event.target.value)}>
          <option value="token">Place selected token</option>
          {combatLinked?<option value="combat">Move combatant</option>:null}
          <option value="reveal" disabled={!draft.fogEnabled}>Reveal fog brush</option>
          <option value="hide" disabled={!draft.fogEnabled}>Hide fog brush</option>
          <option value="measure">Distance ruler</option>
          <option value="terrain">Paint terrain</option>
          {draft.vision?.automatic?<option value="auto">Restore automatic vision brush</option>:null}
          {source?<option value="source">Place light or effect</option>:null}
          <option value="pin">Place GM-only pin</option>
        </select></label>
        <label>Fog brush radius (squares)<input type="number" min="0" max="8" value={fogBrush}
          onChange={event=>setFogBrush(Math.max(0,Math.min(8,Number(event.target.value)||0)))}/></label>
        <label><input type="checkbox" checked={previewPlayerFog}
          onChange={event=>setPreviewPlayerFog(event.target.checked)}/> Preview visible player fog</label>
      </div>
      {draft.fogEnabled?<div className="react-action-row">
        <button type="button" onClick={()=>setAllFog(true)}>Reveal all</button>
        <button type="button" onClick={()=>setAllFog(false)}>Hide all</button>
        <button type="button" disabled={!undoFog.current.length} onClick={undoFogStroke}>Undo fog change</button>
        <span>Revealed: {Math.round(fogRevealFraction(viewMap?.fogCells||draft.fogCells,draft.gridColumns,draft.gridRows)*100)}%</span>
      </div>:<p className="react-help">Enable fog to reveal or hide areas. Existing maps remain unobscured until fog is enabled.</p>}
      <BattleMapVisionControls map={{...draft,tokens:rawView?.tokens||draft.tokens}} patch={patch} placing={source} onPlace={item=>{
        setSource(item);setFogTool(item?'source':'token');
      }}/>
      {fogTool==='terrain'?<TerrainControls brush={brush} onChange={setBrush}/>:null}
      {fogTool==='measure'?<AreaControls value={area} onChange={setArea}/>:null}
      {measurement&&!combatLinked&&fogTool==='measure'?<label>Known distance between ruler points (m)
        <input type="number" min=".01" step="any" value={calibration} onChange={e=>setCalibration(e.target.value)}/>
        <button type="button" disabled={!(Number(calibration)>0&&measurement.squares>0&&Number(calibration)/measurement.squares>=.1&&Number(calibration)/measurement.squares<=100)}
          onClick={()=>patch({metresPerCell:Math.round(Number(calibration)/measurement.squares*100)/100})}>Calibrate grid scale</button>
      </label>:null}
      {measurement?<p role="status"><RouteReading result={measurement}/>
        <button type="button" onClick={()=>setMeasurePoints([])}>Clear ruler</button></p>:
        <p className="react-help">Use Distance ruler and click two points to measure. A third click starts a new measurement.</p>}
      <p className="react-help">Fog hides content visually, but cannot prevent inspection of a map image/video already delivered to a player. Do not embed unrevealed secrets in published media.</p>
    </section>:null}
    {!combatLinked?<TokenEditor tokens={draft.tokens||[]} onChange={tokens=>patch({tokens})}
      selectedTokenId={selectedTokenId} onSelect={setSelectedTokenId} characters={characters}/>:null}
    {selected?<section className="asteria-battle-private-notes" aria-label="Private GM map annotations">
      <h4>GM-only Map Pins ({privatePins.length}/40)</h4>
      <p className="react-help">Stored in separate GM-only Firestore documents. Never included in player map data.</p>
      <div className="asteria-battle-form-row">
        <label>Pin name<input maxLength={70} value={privateNoteName}
          onChange={event=>setPrivateNoteName(event.target.value)}/></label>
        <label>Kind<select value={privateNoteKind} onChange={event=>setPrivateNoteKind(event.target.value)}>
          <option value="note">Note</option><option value="encounter">Encounter</option>
          <option value="hazard">Hazard</option>
        </select></label>
      </div>
      <label>Private GM note<textarea maxLength={400} value={privateNoteText}
        onChange={event=>setPrivateNoteText(event.target.value)}/></label>
      <p className="react-help">Select Place GM-only pin, enter a name, then click on the map.</p>
      <div className="asteria-battle-token-list">{privatePins.map(pin=><div key={pin.id}>
        <span title={pin.note}>{pin.label} ({pin.kind})</span>
        <button type="button" onClick={()=>{setPrivatePins(items=>items.filter(item=>item.id!==pin.id));setPrivateDirty(true);}}>Remove</button>
      </div>)}</div>
      <button type="button" disabled={busy||!privateDirty}
        onClick={savePrivate}>Save GM-only notes</button>
      {privateDirty?<p role="status">Private pin edits are not saved yet.</p>:null}
    </section>:null}
    {selected?<section className="asteria-battle-combat-editor" aria-label="Live Combat Integration">
      <h4>Live Combat Integration · Phase 6.3</h4>
      {!activeMapEncounter(encounter)?<p>Start an encounter from GM Main → Campaign Encounters before linking a combat map.</p>:
        !combatLinked?<div>
          <p>Round {encounter.round||1}: {combatants.length} participants. Link this map to display current initiative and synchronize player and creature positions.</p>
          <button type="button" disabled={busy||Boolean(encounter.battleMapId&&encounter.battleMapId!==selected.id)}
            onClick={linkCombat}>Link active combat to this map</button>
          {encounter.battleMapId&&encounter.battleMapId!==selected.id?<p>This encounter is already linked to another battle map. End that combat before linking a different map.</p>:null}
        </div>:<>
          <p role="status">Combat active · Round {encounter.round||1} · Current turn: {combatCurrent?.name||'—'}</p>
          <div className="asteria-battle-form-row">
            <label>Combatant<select value={selectedCombatantId}
              onChange={event=>{setSelectedCombatantId(event.target.value);setFogTool('combat');}}>
              <option value="">Choose participant</option>
              {combatants.map(row=><option key={row.id} value={row.id}>{row.name}{row.isCurrent?' · Current turn':''}{row.defeated?' · Defeated':''}</option>)}
            </select></label>
            <label>Movement method<select value={movementMode} onChange={event=>setMovementMode(event.target.value)}>
              <option value="movement">Approved movement action</option>
              <option value="reposition">GM correction / reposition</option>
              <option value="forced">Resolved forced movement</option>
            </select></label>
          </div>
          {movementMode!=='movement'?<>
            <label>GM adjudication reason<input maxLength={160}
              value={repositionReason} onChange={event=>setRepositionReason(event.target.value)}
              placeholder="Document the source, effect and movement"/></label>
            {movementMode==='forced'?<div className="asteria-battle-form-row">
              <label>Effect source ID<input maxLength={160} value={forcedSource}
                onChange={event=>setForcedSource(event.target.value)}/></label>
              <label>Source type<select value={forcedKind} onChange={event=>setForcedKind(event.target.value)}>
                {['spell','talent','shove','creature','environment','ability','other'].map(kind=>
                  <option key={kind} value={kind}>{kind}</option>)}
              </select></label>
              <label>Travel mode<select value={forcedRoute} onChange={event=>setForcedRoute(event.target.value)}>
                <option value="ground">Ground</option>
                <option value="fly">Airborne</option>
                <option value="teleport">Teleportation</option>
              </select></label>
              <label>Approved range (m)<input type="number" min="0.1" max="1000" step="0.1"
                value={forcedDistance} onChange={event=>setForcedDistance(event.target.value)}/></label>
              <label><input type="checkbox" checked={forcedResolved}
                onChange={event=>setForcedResolved(event.target.checked)}/>
                GM confirms source and saving throw resolved</label>
            </div>:null}
          </>:<p>Remaining approved movement: {combatMoveRemaining===null?'No movement action approved':combatMoveRemaining+' m'}.
              A player must declare a movement action; the GM approves its distance through the existing combat panel.</p>}
          {selectedCombatantId?<div className="asteria-battle-form-row">
            <label>Delegate map movement to a linked campaign player
              <select value={delegateUid} onChange={event=>setDelegateUid(event.target.value)}>
                <option value="">No delegate / revoke delegation</option>
                {[...new Map(Object.values(characters).filter(row=>row?.ownerUid).map(row=>
                  [row.ownerUid,{uid:row.ownerUid,label:row.name||row.ownerUid}])).values()]
                  .map(row=><option key={row.uid} value={row.uid}>{row.label}</option>)}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={saveMapDelegate}>
              {delegateUid.trim()?'Assign map-only control':'Revoke map delegation'}
            </button>
            <small>Only the verified campaign member may use delegated movement. Combat actions remain owner- or GM-controlled. Clear the field to revoke.</small>
          </div>:null}
          {selectedCombatToken?<LiveTokenAppearance key={selectedCombatToken.id} token={selectedCombatToken}
            busy={busy} onSave={saveCombatToken}/>:null}
          <ol className="asteria-battle-combat-roster">
            {combatants.map(row=><li key={row.id} className={row.isCurrent?'current':''}>
              <b>{row.name}</b> · Initiative {row.initiative??'—'}
              {row.isCurrent?' · Current turn':''}{row.turnComplete?' · Turn complete':''}
              {row.defeated?' · Defeated':''}
            </li>)}
          </ol>
          <p className="react-help">Players can move their assigned tokens when combat allows it. GM corrections record the original position, destination and reason.</p>
        </>}
    </section>:null}
    {selected?<MapCanvas key={campaignId+':'+selected.id+':'+selected.storagePath} campaignId={campaignId} map={viewMap} session={session} gm encounter={encounter}
      selectedCombatantId={selectedCombatantId} onCombatMove={moveCombatToken} combatBusy={busy}
      selectedTokenId={selectedTokenId} onPlaceToken={moveToken}
      fogTool={fogTool} onSource={placeSource} area={area} onTerrain={point=>setDraft(previous=>({...previous,terrainCells:terrainAtPoint(previous,point,brush)}))} onFogBegin={rememberFog} onFogStroke={fogStroke}
      onPrivatePin={addPrivatePin} privatePins={privatePins}
      previewPlayerFog={previewPlayerFog} onMeasure={placeMeasurePoint}

      measurePoints={measurePoints}/>:null}
    <div className="react-action-row">
      {!selected?<button type="button" className="primary" disabled={busy||!file||!settings||maps.length>=40}
        onClick={upload}>{busy?'Uploading…':'Upload map'}</button>:
        <>
          <button type="button" className="primary" disabled={busy||!settings} onClick={save}>{busy?'Saving…':'Save map settings'}</button>
          <button type="button" disabled={busy} onClick={()=>{setDraft(currentSettings(selected));setSelectedTokenId('');}}>Discard edits</button>
          <button type="button" className="danger" disabled={busy||combatLinked} onClick={remove}>Delete map</button>
        </>}
    </div>
    {selected&&draft.visibility!==selected.visibility?<p role="status">Visibility change is not active until you save the map.</p>:null}
    {message?<p role={message==='Map saved successfully.'?'status':'alert'}>{message}</p>:null}
  </Panel>;
}
function PlayerMapOpportunity({actor,targets,character,submit}){
  const [target,setTarget]=useState(''),[item,setItem]=useState(''),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const weapons=(Array.isArray(character.inventory)?character.inventory:[]).filter(row=>row.equipped&&!row.destroyed&&/weapon/i.test(row.type||''));
  if(!weapons.length||!targets.length)return null;
  return <details>
    <summary>Out-of-turn attack</summary>
    <p>Uses this round's opportunity. The GM resolves the attack through combat.</p>
    <label>Visible target<select value={target} onChange={event=>setTarget(event.target.value)}>
      <option value="">Choose a target</option>
      {targets.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
    <label>Wielded weapon<select value={item} onChange={event=>setItem(event.target.value)}>
      <option value="">Choose a weapon</option>
      {weapons.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>
    <button type="button" disabled={busy||!targets.some(row=>row.id===target)||!weapons.some(row=>row.id===item)}
      onClick={async()=>{
        setBusy(true);setMessage('');
        try{await submit(actor.id,{operation:'declare',optionId:'basic:attack',outOfTurn:true,
          targetIds:[target],itemId:item});setMessage('Attack sent to the GM for resolution.');}
        catch(error){setMessage(error?.message||'The attack was rejected.');}
        finally{setBusy(false);}
      }}>Declare Attack</button>
    {message?<p role="status">{message}</p>:null}
  </details>;
}
export function PlayerBattleMapView({campaignId,encounter={},character=null,mapId='',presentation=false}){
  const uid=useBattleMapSession()?.uid||'';
  const api=useMemo(()=>uid?createSiteCombatMediaApi():null,[uid]);
  const combatApi=useMemo(()=>uid&&character?createSiteCombatApi():null,[uid,Boolean(character)]);
  const ownedActor=(encounter.combatants||[]).find(row=>row.characterId===character?.id);
  const [selectedActorId,setSelectedActorId]=useState('');
  const delegatedActors=(encounter.combatants||[]).filter(row=>row.id!==ownedActor?.id&&
    encounter.combat?.participants?.[row.id]?.movementDelegated===true&&
    encounter.combat?.participants?.[row.id]?.mapTokenId);
  const actor=delegatedActors.find(row=>row.id===selectedActorId)||ownedActor;
  const delegated=Boolean(actor&&actor.id!==ownedActor?.id);
  const state=encounter.combat?.participants?.[actor?.id]||{};
  const offTurn=encounter.combatants?.[encounter.turnIndex]?.id!==actor?.id||state.turnComplete===true;
  const approved=!offTurn&&state.mapMovement?.remaining>0;
  const allowance=approved?state.mapMovement.remaining:delegated?null:
    character?walkingAllowance(character,{encounter}):null;
  const movement=!presentation&&actor&&state.mapTokenId&&encounter.battleMapId&&combatApi&&
    (!delegated||approved)?{
    tokenId:state.mapTokenId,distance:allowance,revision:encounter.combat.revision,
    disabled:encounter.paused||Boolean(encounter.combat.pending)||offTurn&&state.opportunityUsed||(!approved&&state.ap<MAP_MOVE_AP.walk),
    diagonalParity:approved?state.mapMovement.diagonalParity:0,
    kind:approved?'approved':'walk',approvedKind:approved?state.mapMovement.kind:'',
    routeKind:approved?state.mapMovement.routeKind:'',
    outOfTurn:offTurn,onMove:point=>combatApi.commandPlayer(campaignId,character.id,actor.id,{
      operation:'player-map-move',revision:encounter.combat.revision,mapId:encounter.battleMapId,
      moveKind:approved?'approved':'walk',point,outOfTurn:offTurn
    })
  }:null;
  if(!campaignId)return null;
  if(!api)return <p role="status">Sign in to view shared battle maps.</p>;
  const attackAvailable=movement&&offTurn&&!encounter.paused&&!state.opportunityUsed&&!encounter.combat?.pending&&state.ap>=1;
  const content=<><CampaignMapWorkspace key={uid+':'+campaignId} api={api}
    campaignId={campaignId} selectedMapId={mapId} encounter={encounter}
    interactive={!presentation} movement={movement}/>
    {!presentation&&delegatedActors.length?<label>Map token control<select
      value={delegated?actor.id:ownedActor?.id||''}
      onChange={event=>setSelectedActorId(event.target.value===ownedActor?.id?'':event.target.value)}>
      {ownedActor?<option value={ownedActor.id}>{ownedActor.name||'Your character'}</option>:null}
      {delegatedActors.map(row=><option key={row.id} value={row.id}>
        {row.name||'Combatant'} · GM-delegated map movement
      </option>)}
    </select></label>:null}
    {delegated&&!approved?<small>The GM must approve movement for this token before you can move it.</small>:null}
    {attackAvailable&&!delegated?<PlayerMapOpportunity actor={actor}
      targets={encounter.combatants.filter(row=>row.kind==='enemy'&&!row.defeated)}
      character={character}
      submit={(id,input)=>combatApi.commandPlayer(campaignId,character.id,id,{
        ...input,revision:encounter.combat.revision
      })}/>:null}
    {movement&&!approved&&!delegated?<small>Dash costs {MAP_MOVE_AP.dash} AP and uses the distance approved by your GM.</small>:null}
  </>;
  return presentation?content:<Panel title="Battle Maps" eyebrow="Shared Campaign Scenes">{content}</Panel>;
}
