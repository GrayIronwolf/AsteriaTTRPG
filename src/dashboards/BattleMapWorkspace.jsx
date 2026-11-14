import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {Panel} from '../components/WorkspaceUI.jsx';
import {
  battleMapFileError,battleMapEditableSettings,battleMapPoint,battleMapCanPreview,
  BATTLE_MAP_MAX_TOKENS
} from '../state/battleMapModel.mjs';

const defaults=()=>({
  name:'',description:'',visibility:'gm',gridColumns:20,gridRows:15,
  gridOpacity:40,gridVisible:true,tokens:[]
});
const currentSettings=map=>({
  name:map.name,description:map.description||'',visibility:map.visibility,
  gridColumns:map.gridColumns,gridRows:map.gridRows,
  gridOpacity:map.gridOpacity,gridVisible:map.gridVisible,
  tokens:map.tokens||[]
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
function MapCanvas({campaignId,map,gm=false,onPlaceToken,selectedTokenId=''}) {
  const media=useMapMedia(campaignId,map),canvas=useRef(null);
  const [playing,setPlaying]=useState(true),[showGrid,setShowGrid]=useState(true);
  useEffect(()=>{setPlaying(true);setShowGrid(true);},[map?.id]);
  const tokens=map?.tokens||[];
  const grid=map?.gridVisible&&showGrid;
  const background=grid?{
    backgroundImage:'linear-gradient(to right,rgba(255,255,255,.6) 1px, transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.6) 1px, transparent 1px)',
    backgroundSize:(100/map.gridColumns)+'% '+(100/map.gridRows)+'%',
    opacity:Math.max(0,Math.min(100,Number(map.gridOpacity)))/100
  }:null;
  const move=event=>{
    if(!gm||!selectedTokenId||!onPlaceToken||!canvas.current)return;
    const bounds=canvas.current.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const x=(event.clientX-bounds.left)*100/bounds.width;
    const y=(event.clientY-bounds.top)*100/bounds.height;
    const point=battleMapPoint(x,y,{columns:map.gridColumns,rows:map.gridRows,snap:grid});
    onPlaceToken(selectedTokenId,point);
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
    <div ref={canvas} className={'asteria-battle-canvas'+(gm&&selectedTokenId?' token-placement':'')}
      onClick={move} style={{aspectRatio:map.width+' / '+map.height}}>
      {media.loading?<p className="asteria-battle-loading" role="status">Loading private map media…</p>:null}
      {media.error?<p className="asteria-battle-loading" role="alert">{media.error}</p>:null}
      {media.url?(map.kind==='video'?<video key={media.url} src={media.url} className="asteria-battle-media"
        autoPlay={playing} loop muted playsInline preload="metadata" controls={false}
        ref={element=>{if(!element)return;if(playing)element.play().catch(()=>{});else element.pause();}}
        onError={()=>{}} aria-label={'Looping animated map: '+map.name}/>:
        <img src={media.url} alt={map.name} className="asteria-battle-media"/>):null}
      {grid?<div aria-hidden="true" className="asteria-battle-grid" style={background}/>:null}
      {tokens.map(token=><span key={token.id} className={'asteria-battle-token'+(token.id===selectedTokenId?' selected':'')}
        style={{left:token.x+'%',top:token.y+'%'}}
        title={token.label} aria-label={token.label}>
        {token.kind==='character'?'P':token.kind==='creature'?'C':'•'}
      </span>)}
    </div>
    {map.description?<p className="react-help">{map.description}</p>:null}
    {gm&&selectedTokenId?<p className="react-help">Click anywhere on the map to position the selected token. Grid snapping applies when the grid is visible.</p>:null}
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
export function GMBattleMapManager({campaignId,characters={}}){
  const {maps,error:listenerError}=useBattleMaps(campaignId,true);
  const [selectedId,setSelectedId]=useState(''),[draft,setDraft]=useState(defaults);
  const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [selectedTokenId,setSelectedTokenId]=useState(''),[mode,setMode]=useState('manage');
  const selected=maps.find(row=>row.id===selectedId)||null;
  useEffect(()=>{
    if(selectedId&&!maps.some(row=>row.id===selectedId))setSelectedId('');
  },[maps,selectedId]);
  useEffect(()=>{
    if(selected)setDraft(currentSettings(selected));
    else setDraft(defaults());
    setSelectedTokenId('');
  },[selectedId]);
  const settings=useMemo(()=>{try{return battleMapEditableSettings(draft);}catch{return null;}},[draft]);
  const patch=values=>setDraft(previous=>({...previous,...values}));
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
    if(result.ok){setFile(null);setSelectedId(result.map.id);setMode('manage');}
  };
  const save=async()=>{if(settings&&selected)await act(()=>firebaseService.updateBattleMap(campaignId,selected.id,settings));};
  const remove=async()=>{
    if(!selected||!window.confirm('Permanently remove this battle map and its uploaded media?'))return;
    const result=await act(()=>firebaseService.removeBattleMap(campaignId,selected.id));
    if(result.ok)setSelectedId('');
  };
  const moveToken=useCallback((id,point)=>setDraft(previous=>({...previous,tokens:previous.tokens.map(t=>t.id===id?{...t,...point}:t)})),[]);
  const viewMap=selected?{...selected,...draft}:null;
  return <Panel title="Battle Maps & Animated Scenes" eyebrow="Digital GM Toolkit · Phase 6.1">
    <p className="react-help">Upload a static image or a looping MP4/WebM video. Maps start GM-only. Publish a map when players should see its scene and markers. Fog of war and combat turn movement follow in phases 6.2 and 6.3.</p>
    {listenerError?<p role="alert">{listenerError}</p>:null}
    <div className="asteria-battle-form-row">
      <label>Choose a map<select value={selectedId} onChange={event=>setSelectedId(event.target.value)}>
        <option value="">New map</option>
        {maps.map(map=><option key={map.id} value={map.id}>{map.name} · {map.kind==='video'?'Animated':'Image'} · {map.visibility==='players'?'Shared':'GM only'}</option>)}
      </select></label>
      <button type="button" disabled={busy} onClick={()=>{setSelectedId('');setMode('manage');setDraft(defaults());}}>New map</button>
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
      <label>Grid columns<input type="number" min="1" max="80" value={draft.gridColumns} onChange={event=>patch({gridColumns:Number(event.target.value)})}/></label>
      <label>Grid rows<input type="number" min="1" max="80" value={draft.gridRows} onChange={event=>patch({gridRows:Number(event.target.value)})}/></label>
      <label>Grid opacity %<input type="number" min="0" max="100" value={draft.gridOpacity} onChange={event=>patch({gridOpacity:Number(event.target.value)})}/></label>
      <label><input type="checkbox" checked={draft.gridVisible} onChange={event=>patch({gridVisible:event.target.checked})}/> Show grid</label>
    </div>
    <label>Map description<textarea value={draft.description} maxLength={300}
      onChange={event=>patch({description:event.target.value})}/></label>
    <TokenEditor tokens={draft.tokens||[]} onChange={tokens=>patch({tokens})}
      selectedTokenId={selectedTokenId} onSelect={setSelectedTokenId} characters={characters}/>
    {selected?<MapCanvas campaignId={campaignId} map={viewMap} gm
      selectedTokenId={selectedTokenId} onPlaceToken={moveToken}/>:null}
    <div className="react-action-row">
      {!selected?<button type="button" className="primary" disabled={busy||!file||!settings||maps.length>=40}
        onClick={upload}>{busy?'Uploading…':'Upload map'}</button>:
        <>
          <button type="button" className="primary" disabled={busy||!settings} onClick={save}>{busy?'Saving…':'Save map settings'}</button>
          <button type="button" disabled={busy} onClick={()=>{setDraft(currentSettings(selected));setSelectedTokenId('');}}>Discard edits</button>
          <button type="button" className="danger" disabled={busy} onClick={remove}>Delete map</button>
        </>}
    </div>
    {selected&&draft.visibility!==selected.visibility?<p role="status">Visibility change is not active until you save the map.</p>:null}
    {mode==='manage'?null:null}
    {message?<p role={message==='Map saved successfully.'?'status':'alert'}>{message}</p>:null}
  </Panel>;
}
export function PlayerBattleMapView({campaignId}){
  const {maps,error}=useBattleMaps(campaignId,false);
  const [selectedId,setSelectedId]=useState('');
  const selected=maps.find(row=>row.id===selectedId)||maps[0]||null;
  if(!campaignId)return null;
  return <Panel title="Battle Maps" eyebrow="Shared Campaign Scenes">
    {error?<p role="alert">{error}</p>:null}
    {!maps.length?<p>No battle maps have been shared with players.</p>:<>
      <label>Shared map<select value={selected?.id||''} onChange={event=>setSelectedId(event.target.value)}>
        {maps.map(row=><option key={row.id} value={row.id}>{row.name}{row.kind==='video'?' · Animated':''}</option>)}
      </select></label>
      <MapCanvas key={selected.id} campaignId={campaignId} map={selected}/>
    </>}
  </Panel>;
}
