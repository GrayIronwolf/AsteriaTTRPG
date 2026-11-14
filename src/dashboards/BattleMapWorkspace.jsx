import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {Panel} from '../components/WorkspaceUI.jsx';
import {
  battleMapFileError,battleMapEditableSettings,battleMapPoint,battleMapCanPreview,
  BATTLE_MAP_MAX_TOKENS
} from '../state/battleMapModel.mjs';
import {
  createFogCells,resizeFogCells,paintFogStroke,hiddenFogRuns,fogRevealFraction,
  measureGridDistance,battleMapPrivatePins
} from '../state/battleMapFogModel.mjs';
import {activeMapEncounter,combatMapLinked,combatMapRoster,derivedCombatMapTokens,combatMapMovementAllowance} from '../state/battleMapCombatModel.mjs';

const defaults=()=>({
  name:'',description:'',visibility:'gm',gridColumns:20,gridRows:15,
  gridOpacity:40,gridVisible:true,tokens:[],
  fogEnabled:false,fogCells:'',metresPerCell:1
});
const currentSettings=map=>({
  name:map.name,description:map.description||'',visibility:map.visibility,
  gridColumns:map.gridColumns,gridRows:map.gridRows,
  gridOpacity:map.gridOpacity,gridVisible:map.gridVisible,
  tokens:map.tokens||[],fogEnabled:map.fogEnabled===true,
  fogCells:map.fogCells||'',metresPerCell:map.metresPerCell??1
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
function useBattleMaps(campaignId,gm){
  const [maps,setMaps]=useState([]),[error,setError]=useState('');
  useEffect(()=>{
    setMaps([]);setError('');
    if(!campaignId)return undefined;
    try{return firebaseService.subscribeBattleMaps(campaignId,setMaps,{gm});}
    catch(err){setError(err.message);return undefined;}
  },[campaignId,gm]);
  return {maps,error};
}
function useMapMedia(campaignId,selected){
  const [state,setState]=useState({url:'',loading:false,error:''});
  const mapKey=selected?.id+'|'+selected?.storagePath;
  useEffect(()=>{
    let active=true,url='';
    setState({url:'',loading:Boolean(selected),error:''});
    if(!selected)return undefined;
    if(!battleMapCanPreview(selected,campaignId)){
      setState({url:'',loading:false,error:'This map has an invalid media reference.'});
      return undefined;
    }
    firebaseService.fetchBattleMapMedia(campaignId,selected).then(result=>{
      if(!active)return;
      if(!result.ok){setState({url:'',loading:false,error:result.error||'Map unavailable.'});return;}
      url=URL.createObjectURL(result.blob);
      setState({url,loading:false,error:''});
    }).catch(error=>{if(active)setState({url:'',loading:false,error:error.message});});
    return ()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[campaignId,mapKey]);
  return state;
}
function MapCanvas({campaignId,map,gm=false,onPlaceToken,selectedTokenId='',fogTool='token',
  onFogStroke,onFogBegin,onPrivatePin,privatePins=[],previewPlayerFog=false,onMeasure,measurePoints=[],
  encounter=null,selectedCombatantId='',onCombatMove,combatBusy=false}) {
  const media=useMapMedia(campaignId,map),canvas=useRef(null);
  const [playing,setPlaying]=useState(true),[showGrid,setShowGrid]=useState(true);
  const pointerLast=useRef(null);
  useEffect(()=>{setPlaying(true);setShowGrid(true);},[map?.id]);
  const playerFog=Boolean(map?.fogEnabled)&&(!gm||previewPlayerFog);
  const cols=Number(map?.gridColumns||20),rows=Number(map?.gridRows||15);
  const fogRectangles=playerFog?hiddenFogRuns(map?.fogCells,cols,rows):[];
  const isBrush=gm&&map&&['reveal','hide'].includes(fogTool)&&map.fogEnabled;
  const isPlacing=gm&&fogTool==='token'&&Boolean(selectedTokenId);
  const isCombatMove=gm&&fogTool==='combat'&&combatMapLinked(map,encounter)&&
    Boolean(selectedCombatantId)&&Boolean(onCombatMove)&&!combatBusy;
  const isAnnotating=gm&&fogTool==='pin'&&Boolean(onPrivatePin);
  const isMeasuring=gm&&fogTool==='measure'&&Boolean(onMeasure);
  const tokens=derivedCombatMapTokens(map,encounter);
  const combatants=combatMapRoster(encounter);
  const activeActor=combatants.find(row=>row.isCurrent)?.id||'';
  const grid=map?.gridVisible&&showGrid;
  const background=grid?{
    backgroundImage:'linear-gradient(to right,rgba(255,255,255,.6) 1px, transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.6) 1px, transparent 1px)',
    backgroundSize:(100/map.gridColumns)+'% '+(100/map.gridRows)+'%',
    opacity:Math.max(0,Math.min(100,Number(map.gridOpacity)))/100
  }:null;
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
    if(isCombatMove){const point=pointFromEvent(event);if(point)onCombatMove(selectedCombatantId,point);return;}
    if(!isPlacing||!onPlaceToken)return;
    const point=pointFromEvent(event);
    if(!point)return;
    const snapped=battleMapPoint(point.x,point.y,{columns:map.gridColumns,rows:map.gridRows,snap:grid});
    onPlaceToken(selectedTokenId,snapped);
  };
  if(!map)return <p>Select a battle map.</p>;
  return <section className="asteria-battle-viewer" aria-label={'Battle map: '+map.name}>
    <div className="asteria-battle-controls">
      <strong>{map.name}</strong>
      {map.kind==='video'?<button type="button" onClick={()=>setPlaying(value=>!value)}
        aria-label={playing?'Pause looping video':'Play looping video'}>{playing?'Pause animation':'Play animation'}</button>:null}
      {map.gridVisible?<button type="button" onClick={()=>setShowGrid(value=>!value)}>
        {showGrid?'Hide grid':'Show grid'}</button>:null}
    </div>
    <div ref={canvas} className={'asteria-battle-canvas'+((isPlacing||isBrush||isMeasuring||isAnnotating||isCombatMove)?' token-placement':'')+(isBrush?' fog-edit':'')}
      onClick={move} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={pointerUp} onLostPointerCapture={pointerUp}
      style={{aspectRatio:map.width+' / '+map.height}}>
      {media.loading?<p className="asteria-battle-loading" role="status">Loading private map media…</p>:null}
      {media.error?<p className="asteria-battle-loading" role="alert">{media.error}</p>:null}
      {media.url?(map.kind==='video'?<video key={media.url} src={media.url} className="asteria-battle-media"
        autoPlay={playing} loop muted playsInline preload="metadata" controls={false}
        ref={element=>{if(!element)return;if(playing)element.play().catch(()=>{});else element.pause();}}
        onError={()=>{}} aria-label={'Looping animated map: '+map.name}/>:
        <img src={media.url} alt={map.name} className="asteria-battle-media"/>):null}
      {grid?<div aria-hidden="true" className="asteria-battle-grid" style={background}/>:null}
      {tokens.filter(token=>{
        if(!playerFog)return true;
        const x=Math.min(cols-1,Math.floor(Math.min(99.999,token.x)*cols/100));
        const y=Math.min(rows-1,Math.floor(Math.min(99.999,token.y)*rows/100));
        const cells=map.fogCells||createFogCells(cols,rows);
        return cells[y*cols+x]==='1';
      }).map(token=><span key={token.id}
        className={'asteria-battle-token'+(token.id===selectedTokenId?' selected':'')+
          (token.combatantId===activeActor&&combatMapLinked(map,encounter)?' combat-active':'')+
          (token.combatantId&&combatants.find(row=>row.id===token.combatantId)?.defeated?' combat-defeated':'')}
        style={{left:token.x+'%',top:token.y+'%'}}
        title={token.label+(token.combatantId===activeActor?' · Current turn':'')} aria-label={token.label}>
        {token.kind==='character'?'P':token.kind==='creature'?'C':'•'}
      </span>)}
      {playerFog?<svg className="asteria-battle-fog" viewBox="0 0 100 100" preserveAspectRatio="none"
        aria-label="Fog of war hidden regions">
        {fogRectangles.map((rect,index)=><rect key={index}
          x={rect.x} y={rect.y} width={rect.width} height={rect.height}/>)}
      </svg>:null}
      {gm&&!previewPlayerFog&&privatePins.map(pin=><span key={pin.id}
        className="asteria-battle-secret-pin" style={{left:pin.x+'%',top:pin.y+'%'}}
        title={pin.label+' — '+pin.note} aria-label={'GM-only '+pin.kind+': '+pin.label}>
        {pin.kind==='hazard'?'!':pin.kind==='encounter'?'E':'N'}
      </span>)}
      {gm&&measurePoints.length>0?<svg className="asteria-battle-ruler" viewBox="0 0 100 100"
        preserveAspectRatio="none" aria-hidden="true">
        {measurePoints.length===2?<line x1={measurePoints[0].x} y1={measurePoints[0].y}
          x2={measurePoints[1].x} y2={measurePoints[1].y}/>:null}
        {measurePoints.map((point,index)=><circle key={index} cx={point.x} cy={point.y} r=".8"/>)}
      </svg>:null}
    </div>
    {map.description?<p className="react-help">{map.description}</p>:null}
    {isPlacing?<p className="react-help">Click the map to place the selected token. Grid snapping applies when the grid is visible.</p>:null}
    {isCombatMove?<p className="react-help">Click a destination square for the selected combatant. The server validates current turn and remaining approved movement.</p>:null}
    {isBrush?<p className="react-help">Drag on the map to paint fog. Changes are drafts until you save map settings.</p>:null}
    {map.kind==='video'?<small>Video loops silently. Playback begins automatically where the browser permits; use Play animation if autoplay is blocked.</small>:null}
  </section>;
}
function TokenEditor({tokens,onChange,characters={},selectedTokenId,onSelect}){
  const [label,setLabel]=useState(''),[kind,setKind]=useState('marker'),[refId,setRefId]=useState('');
  const roster=Object.values(characters).filter(record=>record?.id);
  const add=()=>{
    if(tokens.length>=BATTLE_MAP_MAX_TOKENS)return;
    const final=kind==='character'&&refId?roster.find(row=>row.id===refId)?.name||label:label;
    if(!final?.trim())return;
    const token={id:crypto.randomUUID(),label:final.trim().slice(0,48),kind,
      refId:kind==='character'?refId:'',x:50,y:50};
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
  </section>;
}
export function GMBattleMapManager({campaignId,characters={},encounter={}}){
  const {maps,error:listenerError}=useBattleMaps(campaignId,true);
  const [selectedId,setSelectedId]=useState(''),[draft,setDraft]=useState(defaults);
  const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [selectedTokenId,setSelectedTokenId]=useState('');
  const [fogTool,setFogTool]=useState('token'),[fogBrush,setFogBrush]=useState(1);
  const [previewPlayerFog,setPreviewPlayerFog]=useState(false);
  const [measurePoints,setMeasurePoints]=useState([]);
  const [privatePins,setPrivatePins]=useState([]),[privateNoteName,setPrivateNoteName]=useState('');
  const [privateNoteText,setPrivateNoteText]=useState(''),[privateNoteKind,setPrivateNoteKind]=useState('note');
  const [privateDirty,setPrivateDirty]=useState(false);
  const [selectedCombatantId,setSelectedCombatantId]=useState('');
  const [movementMode,setMovementMode]=useState('movement'),[repositionReason,setRepositionReason]=useState('');
  const undoFog=useRef([]);
  const selected=maps.find(row=>row.id===selectedId)||null;
  const combatLinked=combatMapLinked(selected,encounter);
  const combatants=combatMapRoster(encounter);
  const combatCurrent=combatants.find(row=>row.isCurrent);
  const combatMoveRemaining=selectedCombatantId?combatMapMovementAllowance(encounter,selectedCombatantId):null;
  useEffect(()=>{
    if(selectedId&&!maps.some(row=>row.id===selectedId))setSelectedId('');
  },[maps,selectedId]);
  useEffect(()=>{
    if(selected)setDraft(currentSettings(selected));
    else setDraft(defaults());
    setPreviewPlayerFog(selected?.fogEnabled===true);
    setSelectedTokenId('');setSelectedCombatantId('');setFogTool('token');
    setMeasurePoints([]);undoFog.current=[];setPrivateDirty(false);
  },[selectedId]);
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
        previous.gridColumns,previous.gridRows,nextCols,nextRows)};
    }catch{return {...previous,...values};}
  });
  const rememberFog=()=>{undoFog.current=[...undoFog.current.slice(-19),draft.fogCells||
    createFogCells(draft.gridColumns,draft.gridRows)];};
  const fogStroke=(start,end,tool)=>setDraft(previous=>({
    ...previous,fogCells:paintFogStroke(previous.fogCells,previous.gridColumns,
      previous.gridRows,start,end,tool,fogBrush)
  }));
  const setAllFog=revealed=>{
    rememberFog();
    patch({fogCells:createFogCells(draft.gridColumns,draft.gridRows,revealed)});
  };
  const undoFogStroke=()=>{
    if(!undoFog.current.length)return;
    const last=undoFog.current.pop();
    patch({fogCells:last});
  };
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
    try{measurement=measureGridDistance(measurePoints[0],measurePoints[1],
      draft.gridColumns,draft.gridRows,draft.metresPerCell);}catch{measurement=null;}
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
    await act(()=>firebaseService.combatCommand(campaignId,'encounter',{
      operation:'map-move',mapId:selected.id,combatantId,point,mode:movementMode,
      reason:movementMode==='reposition'?repositionReason:'',
      revision:Number(encounter.combat?.revision||0)
    }));
  };
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
  const viewMap=selected?{...selected,...draft,
    tokens:combatLinked?selected.tokens:draft.tokens}:null;
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
      <label>Metres per square<input type="number" min="0.1" max="100" step="0.1" disabled={combatLinked} value={draft.metresPerCell}
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
        <span>Revealed: {Math.round(fogRevealFraction(draft.fogCells,draft.gridColumns,draft.gridRows)*100)}%</span>
      </div>:<p className="react-help">Enable fog to reveal or hide areas. Existing maps remain unobscured until fog is enabled.</p>}
      {measurement?<p role="status">Ruler: {measurement.squares} squares · {measurement.metres} metres
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
            </select></label>
          </div>
          {movementMode==='reposition'?<label>GM correction reason<input maxLength={160}
            value={repositionReason} onChange={event=>setRepositionReason(event.target.value)}
            placeholder="Document the correction or forced movement"/></label>:
            <p>Remaining approved movement: {combatMoveRemaining===null?'No movement action approved':combatMoveRemaining+' m'}.
              A player must declare a movement action; the GM approves its distance through the existing combat panel.</p>}
          <ol className="asteria-battle-combat-roster">
            {combatants.map(row=><li key={row.id} className={row.isCurrent?'current':''}>
              <b>{row.name}</b> · Initiative {row.initiative??'—'}
              {row.isCurrent?' · Current turn':''}{row.turnComplete?' · Turn complete':''}
              {row.defeated?' · Defeated':''}
            </li>)}
          </ol>
          <p className="react-help">The existing combat engine remains authoritative for turns, AP, actions and movement allowance. Only the GM moves map tokens; movement and corrections are validated and recorded by the backend.</p>
        </>}
    </section>:null}
    {selected?<MapCanvas campaignId={campaignId} map={viewMap} gm encounter={encounter}
      selectedCombatantId={selectedCombatantId} onCombatMove={moveCombatToken} combatBusy={busy}
      selectedTokenId={selectedTokenId} onPlaceToken={moveToken}
      fogTool={fogTool} onFogBegin={rememberFog} onFogStroke={fogStroke}
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
export function PlayerBattleMapView({campaignId,encounter={},mapId='',presentation=false}){
  const {maps,error}=useBattleMaps(campaignId,false);
  const [selectedId,setSelectedId]=useState('');
  const selected=mapId?maps.find(row=>row.id===mapId)||null:maps.find(row=>row.id===selectedId)||maps[0]||null;
  if(!campaignId)return null;
  const content=<div className={presentation?"asteria-presentation-map":""}>
    {error?<p role="alert">{error}</p>:null}
    {!maps.length?<p>No battle maps have been shared with players.</p>:<>
      {!presentation?<label>Shared map<select value={selected?.id||''} onChange={event=>setSelectedId(event.target.value)}>
        {maps.map(row=><option key={row.id} value={row.id}>{row.name}{row.kind==='video'?' · Animated':''}</option>)}
      </select></label>:null}
      {selected&&combatMapLinked(selected,encounter)?<div className="asteria-battle-combat-status" role="status">
        <b>Combat active · Round {encounter.round||1}</b>
        <span>Current turn: {combatMapRoster(encounter).find(row=>row.isCurrent)?.name||'—'}</span>
      </div>:null}
      {selected?<MapCanvas key={selected.id} campaignId={campaignId} map={selected} encounter={encounter}/>:<p role="status">This published map is no longer available.</p>}
    </>}</div>;
  return presentation?content:<Panel title="Battle Maps" eyebrow="Shared Campaign Scenes">{content}</Panel>;
}
