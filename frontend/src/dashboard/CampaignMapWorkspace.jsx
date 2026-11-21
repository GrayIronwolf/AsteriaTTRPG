import React,{useEffect,useRef,useState} from 'react';
import {
  battleMapEditableSettings,battleMapFileError,BATTLE_MAP_MAX_RECORDS,
  timestampRevision
} from './campaignMediaModel.mjs';
import {paintFogStroke,createFogCells,hiddenFogRuns} from '../../../src/state/battleMapFogModel.mjs';
import {battleMapPoint} from '../../../src/state/battleMapModel.mjs';
import {
  createPresentationRevisionGate,createSmallProjectionGate,sameCampaignStreamScope
} from '../../../src/state/presentationRealtimeSyncModel.mjs';
import styles from './CampaignMapWorkspace.module.css';

const empty=()=>({
  name:'',description:'',visibility:'gm',gridColumns:20,gridRows:15,
  gridOpacity:40,gridVisible:true,fogEnabled:false,
  fogCells:createFogCells(20,15),metresPerCell:1,tokens:[]
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
  const [state,setState]=useState(()=>({
    scope:{api,method,args:[...args],enabled},
    data:null,error:'',loading:enabled
  }));
  useEffect(()=>{
    const scope={api,method,args:[...args],enabled};
    // Discard old data before mounting a different campaign, map or feed.
    setState({scope,data:null,error:'',loading:enabled});
    if(!enabled)return undefined;
    let alive=true,stop=()=>{};
    const revisionGate=['watchPresentation','watchRestrictedViewer'].includes(method)
      ?createPresentationRevisionGate({restricted:method==='watchRestrictedViewer'}):null;
    const duplicateGate=createSmallProjectionGate();
    const fail=error=>{
      if(!alive)return;
      alive=false;
      setState({scope,data:null,error:error?.message||'Access denied.',loading:false});
      try{stop?.();}catch{/* stop is best-effort */}
    };
    try{
      stop=api[method](...args,value=>{
        if(!alive)return;
        try{
          if(revisionGate&&!revisionGate.accept(value))return;
          if(!revisionGate&&!duplicateGate.accept(value))return;
          setState({scope,data:value,error:'',loading:false});
        }catch(error){fail(error);}
      },fail);
      if(!alive)try{stop?.();}catch{/* synchronous stream error cleanup */}
    }catch(error){fail(error);}
    return ()=>{
      alive=false;revisionGate?.reset();duplicateGate.reset();
      try{stop?.();}catch{/* cleanup must not retain content */}
    };
  // Scope comprises the authenticated service plus primitive campaign/map arguments.
  },[api,method,enabled,...args]);
  // Render-time fail closed: the old campaign's content must never be painted
  // while React is waiting to clean up its previous effect.
  if(!sameCampaignStreamScope(state.scope,api,method,args,enabled))
    return {data:null,error:'',loading:enabled};
  return {data:state.data,error:state.error,loading:state.loading};
}
function useAuthenticatedMapBlob(api,campaignId,map,mode,atlas=false,restricted=false){
  const [result,setResult]=useState({url:'',error:'',loading:false});
  useEffect(()=>{
    let alive=true,url='';
    setResult({url:'',error:'',loading:Boolean(map)});
    if(!map)return undefined;
    (restricted?api.fetchRestrictedMapMedia(campaignId,map):
      atlas?api.fetchAtlasMedia(campaignId,map):api.fetchMapMedia(campaignId,map,mode))
      .then(blob=>{
        if(!alive)return;
        url=URL.createObjectURL(blob);
        setResult({url,error:'',loading:false});
      }).catch(error=>{if(alive)setResult({url:'',error:error?.message||'Map cannot be loaded.',loading:false});});
    return ()=>{alive=false;if(url)URL.revokeObjectURL(url);};
  },[api,campaignId,map?.id,map?.storagePath,mode,atlas,restricted]);
  return result;
}
export function CampaignMapCanvas({api,campaignId,map,mode='player',atlas=false,
  editing=false,onPoint,previewFog=false,showGrid=true,restricted=false}){
  const media=useAuthenticatedMapBlob(api,campaignId,map,mode,atlas,restricted);
  const node=useRef(null),[playing,setPlaying]=useState(true);
  useEffect(()=>setPlaying(true),[map?.id]);
  const cols=map?.gridColumns||20,rows=map?.gridRows||15;
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
      {columns:cols,rows,snap:showGrid&&map.gridVisible});
    onPoint?.(raw);
  };
  if(!map)return <p>No map selected.</p>;
  return <section className={styles.viewer} aria-label={'Campaign map: '+map.name}
    data-testid="site-media-map-canvas">
    {map.kind==='video'?<div className={styles.controls}>
      <button type="button" onClick={()=>setPlaying(!playing)}>
        {playing?'Pause looping video':'Play looping video'}</button>
      <span>Looping video plays muted.</span>
    </div>:null}
    <div ref={node} className={styles.canvas}
      style={{aspectRatio:map.width+' / '+map.height}}
      onClick={editing?point:undefined} role={editing?'button':undefined}
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
      {!atlas&&map.gridVisible&&showGrid?<div className={styles.grid} aria-hidden="true"
        style={{backgroundSize:(100/cols)+'% '+(100/rows)+'%',
          opacity:map.gridOpacity/100}}/>:null}
      {!atlas&&tokens.filter(t=>{
        if(!fog)return true;
        const x=Math.min(cols-1,Math.floor(t.x*cols/100));
        const y=Math.min(rows-1,Math.floor(t.y*rows/100));
        return fogCells[y*cols+x]==='1';
      }).map(t=><span className={styles.token} key={t.id}
        style={{left:t.x+'%',top:t.y+'%'}} title={t.label}>{t.kind==='character'?'P':t.kind==='creature'?'C':'•'}</span>)}
      {atlas&&(map.pins||[]).map(pin=><span key={pin.id} className={styles.token}
        style={{left:pin.x+'%',top:pin.y+'%'}} title={pin.name}>{pin.name}</span>)}
      {fog?<svg className={styles.fog} viewBox="0 0 100 100"
        preserveAspectRatio="none" aria-label="Hidden fog of war">
        {hidden.map((r,i)=><rect key={i} x={r.x} y={r.y}
          width={r.width} height={r.height}/>)}
      </svg>:null}
    </div>
    {map.description?<p>{map.description}</p>:null}
    {fog?<small>Fog is visual only. Published map files must not contain unrevealed secrets.</small>:null}
  </section>;
}
export function CampaignMapWorkspace({api,campaignId,role='player',selectedMapId='' }){
  const mode=role==='gm'?'gm':'player';
  const stream=useCampaignStream(api,'watchMaps',[campaignId,mode]);
  const maps=stream.data||[];
  const [selected,setSelected]=useState(''),[draft,setDraft]=useState(empty);
  const [file,setFile]=useState(null),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [fogMode,setFogMode]=useState('none'),[showGrid,setShowGrid]=useState(true);
  const [previewFog,setPreviewFog]=useState(false);
  const map=selected==='__new__'?null:
    maps.find(item=>item.id===(selectedMapId||selected))||
    (!selectedMapId?maps[0]:null)||null;
  useEffect(()=>{
    setDraft(map?{
      name:map.name,description:map.description,visibility:map.visibility,
      gridColumns:map.gridColumns,gridRows:map.gridRows,gridOpacity:map.gridOpacity,
      gridVisible:map.gridVisible,fogEnabled:map.fogEnabled,
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
    <label>Battle map
      <select aria-label="Battle map" value={map?.id||''}
        disabled={Boolean(selectedMapId)} onChange={e=>{setSelected(e.target.value);setNotice('');}}>
        {!maps.length?<option value="">No maps available</option>:null}
        {maps.map(row=><option key={row.id} value={row.id}>
          {row.name}{row.kind==='video'?' · Looping video':''}
        </option>)}
      </select>
    </label>
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
    {preview?<CampaignMapCanvas api={api} campaignId={campaignId} map={preview}
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
