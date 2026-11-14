import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Panel} from '../components/WorkspaceUI.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {
 atlasFileError,atlasMapSettings,atlasPointFromEvent,
 atlasPins,atlasRoutes,atlasRows,ATLAS_PIN_TYPES
} from '../state/worldAtlasModel.mjs';
import {formatAsteriaDate} from '../state/asteriaCalendarModel.mjs';
import '../styles/world-atlas.css';
const emptySettings=()=>({name:'',description:'',region:'',visibility:'gm'});
const emptyPin=()=>({id:'',name:'',description:'',kind:'landmark',x:50,y:50,
 visibility:'gm',linkedType:'',linkedId:''});
const emptyRoute=()=>({id:'',name:'',description:'',fromId:'',toId:'',visibility:'gm',travelDays:0});
const descriptions=['quest','event','timeline','route','location','weather'];
const pretty=value=>String(value||'').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
async function imageSize(file){
 const src=URL.createObjectURL(file);
 try{return await new Promise((resolve,reject)=>{
  const img=new Image();
  img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});
  img.onerror=()=>reject(Error('This image cannot be decoded in your browser.'));
  img.src=src;
 });}finally{URL.revokeObjectURL(src);}
}
function useAtlas(campaignId,mode){
 const [maps,setMaps]=useState([]);
 useEffect(()=>{
  setMaps([]);if(!campaignId)return;
  return firebaseService.subscribeWorldAtlas(campaignId,setMaps,mode);
 },[campaignId,mode]);
 return atlasRows(maps);
}
function useAtlasImage(campaignId,map){
 const [result,setResult]=useState({url:'',loading:false,error:''});
 useEffect(()=>{
  let alive=true,temporary='';
  setResult({url:'',loading:!!map,error:''});
  if(!map)return;
  firebaseService.fetchWorldAtlasMedia(campaignId,map).then(response=>{
   if(!alive)return;
   if(!response?.ok)throw Error(response?.error||'Map image unavailable.');
   temporary=URL.createObjectURL(response.blob);
   setResult({url:temporary,loading:false,error:''});
  }).catch(error=>{if(alive)setResult({url:'',loading:false,error:error?.message||String(error)});});
  return()=>{alive=false;if(temporary)URL.revokeObjectURL(temporary);};
 },[campaignId,map?.id,map?.storagePath]);
 return result;
}
function AtlasCanvas({campaignId,map,pins=[],routes=[],placing=false,onPlace,zoom=1,showRoutes=true,onSelectPin,player=false}){
 const viewer=useRef(null),media=useAtlasImage(campaignId,map);
 const visiblePins=player?pins.filter(pin=>pin.visibility==='players'):pins;
 const visibleIds=new Set(visiblePins.map(pin=>pin.id));
 const activeRoutes=showRoutes?routes.filter(route=>!player||(
  route.visibility==='players'&&visibleIds.has(route.fromId)&&visibleIds.has(route.toId))):[];
 const byId=new Map(visiblePins.map(pin=>[pin.id,pin]));
 const click=event=>{
  if(!placing||!onPlace)return;
  if(!viewer.current)return;
  try{onPlace(atlasPointFromEvent(event,viewer.current));}
  catch{/* Map is not yet loaded. */}
 };
 return <section className="asteria-atlas-view">
  {!map?<p>Select or upload a world map.</p>:<>
   {media.loading?<p role="status">Loading authenticated world map image…</p>:null}
   {media.error?<p role="alert">{media.error}</p>:null}
   {media.url?<div className="asteria-atlas-scroll">
    <div ref={viewer} className={'asteria-atlas-canvas'+(placing?' placing':'')}
     style={{width:(zoom*100)+'%',aspectRatio:map.width+' / '+map.height}}
     onClick={click} role={placing?'button':undefined}
     tabIndex={placing?0:undefined} aria-label={placing?'Click to place a location':'World map: '+map.name}
     onKeyDown={placing?event=>{if(event.key==='Enter')onPlace({x:50,y:50});}:undefined}>
     <img draggable="false" src={media.url} alt={map.name}/>
     <svg className="asteria-atlas-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {activeRoutes.map(route=>{
       const from=byId.get(route.fromId),to=byId.get(route.toId);
       return from&&to?<line key={route.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y}/>:null;
      })}
     </svg>
     {visiblePins.map(pin=><button type="button" key={pin.id}
      title={pin.name+' · '+pretty(pin.kind)}
      className={'asteria-atlas-pin '+(pin.visibility==='gm'?'private':'shared')}
      style={{left:pin.x+'%',top:pin.y+'%'}}
      onClick={event=>{event.stopPropagation();onSelectPin?.(pin);}}>
      <span aria-hidden="true">{pin.kind==='settlement'?'◆':pin.kind==='hazard'?'!':pin.kind==='quest'?'★':'●'}</span>
      <span>{pin.name}</span>
     </button>)}
    </div>
   </div>:null}
   <small>Map positions are relative to the image. Zoom and scroll for detail; routes are illustrative and do not automatically move characters.</small>
  </>}
 </section>;
}
function useAtlasContext(campaignId){
 const [calendar,setCalendar]=useState(null),[weather,setWeather]=useState([]);
 useEffect(()=>{
  setCalendar(null);setWeather([]);
  if(!campaignId)return;
  const stops=[firebaseService.subscribeAsteriaCalendar(campaignId,setCalendar,'player'),
   firebaseService.subscribeWeatherReports(campaignId,setWeather,'player')];
  return()=>stops.forEach(stop=>stop?.());
 },[campaignId]);
 return {calendar,weather};
}
function AtlasContext({context,region}){
 const {calendar,weather}=context;
 const reports=weather.filter(x=>x.status==='published'&&(
  !region||String(x.region||'').toLowerCase()===region.toLowerCase()));
 return <div className="asteria-atlas-context">
  {calendar?.date&&calendar?.definition?<p><strong>Campaign date:</strong> {formatAsteriaDate(calendar.date,calendar.definition)}</p>:null}
  {reports.length?<div><strong>Published weather · {region||'Campaign'}</strong>
   {reports.map(r=><p key={r.id}>{r.zoneName}: {r.forecast?.[0]?.condition||'Unknown'} · {r.forecast?.[0]?.severity||'Unknown'}</p>)}
  </div>:<p>No published weather for this region.</p>}
 </div>;
}
export function GMWorldAtlasWorkspace({campaignId,searchTarget=null}){
 const maps=useAtlas(campaignId,'gm'),context=useAtlasContext(campaignId);
 const [mapId,setMapId]=useState(''),[file,setFile]=useState(null),[settings,setSettings]=useState(emptySettings);
 const [pins,setPins]=useState([]),[routes,setRoutes]=useState([]);
 const [newPin,setNewPin]=useState(emptyPin),[newRoute,setNewRoute]=useState(emptyRoute);
 const [placing,setPlacing]=useState(false),[zoom,setZoom]=useState(1),[showRoutes,setShowRoutes]=useState(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const selected=maps.find(map=>map.id===mapId)||null;
 useEffect(()=>{if(searchTarget?.category==='world-map'&&maps.some(x=>x.id===searchTarget.id))
  setMapId(searchTarget.id);},[searchTarget,maps]);
 const pending=useMemo(()=>{try{
  atlasMapSettings({...settings,visibility:'gm'});atlasPins(pins);atlasRoutes(routes,pins);return false;
 }catch{return true;}},[settings,pins,routes]);
 useEffect(()=>{
  setMapId('');setFile(null);setSettings(emptySettings());setPins([]);setRoutes([]);
  setError('');setMessage('');
 },[campaignId]);
 useEffect(()=>{
  if(selected){
   setSettings({name:selected.name,description:selected.description||'',
    region:selected.region||'',visibility:'gm'});
   setPins(selected.pins||[]);setRoutes(selected.routes||[]);
  }else{
   setPins([]);setRoutes([]);
  }
  setPlacing(false);
 },[mapId,selected?.revision]);
 const call=async(callback,success)=>{
  if(busy)return null;
  setBusy(true);setMessage('');setError('');
  try{
   const result=await callback();
   if(result?.ok!==true)throw Error(result?.error||'World atlas action was not confirmed.');
   setMessage(success);return result;
  }catch(error){setError(error?.message||String(error));return null;}
  finally{setBusy(false);}
 };
 const upload=async()=>{
  if(!file)return;
  const issue=atlasFileError(file);
  if(issue){setError(issue);return;}
  const result=await call(async()=>{
   const dims=await imageSize(file);
   return firebaseService.uploadWorldAtlas(campaignId,file,{...settings,visibility:'gm'},dims);
  },'Private world map uploaded. Add markers before publishing.');
  if(result){setMapId(result.mapId);setFile(null);}
 };
 const persist=()=>call(()=>firebaseService.manageWorldAtlas(campaignId,'gm-scope',{
  type:'update',mapId:selected.id,expectedRevision:selected.revision,
  settings:{...settings,visibility:'gm'},pins,routes
 }),'Atlas locations, routes and settings saved.');
 const changeStatus=type=>{
  if(!selected)return;
  const notice=type==='publish'
   ?'Publish this entire map image and only its player-visible pins/routes? Never embed GM secrets in the image itself.'
   :type==='archive'?'Archive this world map and remove player access?'
   :'Remove this world map from player access?';
  if(!window.confirm(notice))return;
  call(()=>firebaseService.manageWorldAtlas(campaignId,'gm-scope',{
   type,mapId:selected.id,expectedRevision:selected.revision
  }),type==='publish'?'Published to campaign players.':
   type==='unpublish'?'Map withdrawn from player view.':'Atlas archived.').then(result=>{
   if(result?.status==='archived')setMapId('');
  });
 };
 const placePoint=point=>{
  setNewPin(old=>({...old,...point}));setPlacing(false);
  setMessage('Location position selected. Enter its name and add it, then save the map.');
 };
 const savePin=()=>{
  const pin={...newPin,id:newPin.id||crypto.randomUUID()};
  try{const clean=atlasPins([...pins.filter(x=>x.id!==pin.id),pin]);
   setPins(clean);setNewPin(emptyPin());setMessage('Location added locally. Save the map to publish changes.');
  }catch(err){setError(err.message);}
 };
 const saveRoute=()=>{
  const route={...newRoute,id:newRoute.id||crypto.randomUUID()};
  try{const clean=atlasRoutes([...routes.filter(x=>x.id!==route.id),route],pins);
   setRoutes(clean);setNewRoute(emptyRoute());setMessage('Route staged. Save the map to publish changes.');
  }catch(err){setError(err.message);}
 };
 return <Panel title="Interactive World Map" eyebrow="Digital GM Toolkit · Phase 8.3">
  <div className="asteria-atlas">
   <p>Upload a campaign world map, arrange discoverable and GM-private locations, mark routes and control what players see. Publishing grants access to the map image itself; keep unvisited secrets in private pins, not baked into the image.</p>
   <section className="asteria-atlas-box">
    <h3>World atlas library</h3>
    <label>Choose atlas<select value={mapId} disabled={busy} onChange={e=>setMapId(e.target.value)}>
     <option value="">New map</option>{maps.map(map=><option key={map.id} value={map.id}>{map.name} · {map.status}</option>)}
    </select></label>
    <div className="asteria-atlas-grid">
     <label>Name<input maxLength={100} value={settings.name} disabled={busy}
      onChange={e=>setSettings(x=>({...x,name:e.target.value}))}/></label>
     <label>Region<input maxLength={100} value={settings.region} disabled={busy}
      onChange={e=>setSettings(x=>({...x,region:e.target.value}))}/></label>
    </div>
    <label>Description<textarea rows="2" maxLength={500} value={settings.description} disabled={busy}
     onChange={e=>setSettings(x=>({...x,description:e.target.value}))}/></label>
    {!selected?<><label>World map image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
     disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
     <button className="primary" disabled={busy||!file||!settings.name.trim()} onClick={upload}>
      Upload private atlas image</button><small>PNG, JPG, WEBP or GIF, up to 8 MB. 24 active maps per campaign.</small>
    </>:<div className="asteria-atlas-actions">
     <button className="primary" disabled={busy||pending} onClick={persist}>Save map and markers</button>
     {selected.status==='draft'?<button disabled={busy||pending} onClick={()=>changeStatus('publish')}>Publish to players</button>:
      <button disabled={busy} onClick={()=>changeStatus('unpublish')}>Withdraw publication</button>}
     <button disabled={busy} onClick={()=>changeStatus('archive')}>Archive map</button>
    </div>}
   </section>
   {selected?<section className="asteria-atlas-box">
    <h3>Map canvas</h3>
    <div className="asteria-atlas-actions">
     <label>Zoom<select value={zoom} onChange={e=>setZoom(Number(e.target.value))}>
      {[.5,.75,1,1.5,2,3,4].map(x=><option key={x} value={x}>{Math.round(x*100)}%</option>)}
     </select></label>
     <label className="asteria-atlas-check"><input type="checkbox" checked={showRoutes}
      onChange={e=>setShowRoutes(e.target.checked)}/> Show routes</label>
     <button type="button" onClick={()=>setPlacing(x=>!x)} aria-pressed={placing}>
      {placing?'Cancel location placement':'Place location on map'}</button>
    </div>
    <AtlasCanvas campaignId={campaignId} map={selected} pins={pins} routes={routes}
     placing={placing} onPlace={placePoint} zoom={zoom} showRoutes={showRoutes}
     onSelectPin={pin=>setNewPin({...pin})}/>
    <AtlasContext context={context} region={selected.region||''}/>
   </section>:null}
   {selected?<section className="asteria-atlas-box">
    <h3>Location markers ({pins.length}/100)</h3>
    <div className="asteria-atlas-grid">
     <label>Name<input maxLength={90} disabled={busy} value={newPin.name}
      onChange={e=>setNewPin(x=>({...x,name:e.target.value}))}/></label>
     <label>Type<select disabled={busy} value={newPin.kind} onChange={e=>setNewPin(x=>({...x,kind:e.target.value}))}>
      {ATLAS_PIN_TYPES.map(x=><option value={x} key={x}>{pretty(x)}</option>)}</select></label>
     <label>Visibility<select disabled={busy} value={newPin.visibility}
      onChange={e=>setNewPin(x=>({...x,visibility:e.target.value}))}>
      <option value="gm">GM only</option><option value="players">Players</option></select></label>
     <label>Link type<select disabled={busy} value={newPin.linkedType}
      onChange={e=>setNewPin(x=>({...x,linkedType:e.target.value,linkedId:''}))}>
      <option value="">None</option>{descriptions.map(x=><option key={x} value={x}>{pretty(x)}</option>)}</select></label>
     {newPin.linkedType?<label>Record ID<input value={newPin.linkedId} maxLength={120}
      onChange={e=>setNewPin(x=>({...x,linkedId:e.target.value}))}/></label>:null}
     <label>X %<input type="number" min="0" max="100" step=".1" value={newPin.x}
      onChange={e=>setNewPin(x=>({...x,x:Number(e.target.value)}))}/></label>
     <label>Y %<input type="number" min="0" max="100" step=".1" value={newPin.y}
      onChange={e=>setNewPin(x=>({...x,y:Number(e.target.value)}))}/></label>
    </div>
    <label>Marker details<textarea rows="2" maxLength={450} value={newPin.description}
     onChange={e=>setNewPin(x=>({...x,description:e.target.value}))}/></label>
    <div className="asteria-atlas-actions"><button disabled={busy||!newPin.name.trim()} onClick={savePin}>
     {newPin.id?'Update staged marker':'Add marker'}</button>
     <button disabled={busy} onClick={()=>setNewPin(emptyPin())}>Clear marker</button></div>
    <div className="asteria-atlas-pin-list">{pins.map(pin=><div key={pin.id}>
     <span>{pin.name} · {pretty(pin.kind)} · {pin.visibility==='gm'?'GM only':'Players'}</span>
     <button onClick={()=>setNewPin({...pin})}>Edit</button>
     <button onClick={()=>{setPins(x=>x.filter(p=>p.id!==pin.id));setRoutes(x=>x.filter(r=>r.fromId!==pin.id&&r.toId!==pin.id));}}>Remove</button>
    </div>)}</div>
   </section>:null}
   {selected?<section className="asteria-atlas-box">
    <h3>Travel routes ({routes.length}/50)</h3>
    <div className="asteria-atlas-grid">
     <label>Name<input value={newRoute.name} maxLength={100}
      onChange={e=>setNewRoute(x=>({...x,name:e.target.value}))}/></label>
     <label>From<select value={newRoute.fromId} onChange={e=>setNewRoute(x=>({...x,fromId:e.target.value}))}>
      <option value="">Choose location</option>{pins.map(pin=><option key={pin.id} value={pin.id}>{pin.name}</option>)}</select></label>
     <label>To<select value={newRoute.toId} onChange={e=>setNewRoute(x=>({...x,toId:e.target.value}))}>
      <option value="">Choose location</option>{pins.map(pin=><option key={pin.id} value={pin.id}>{pin.name}</option>)}</select></label>
     <label>Visibility<select value={newRoute.visibility} onChange={e=>setNewRoute(x=>({...x,visibility:e.target.value}))}>
      <option value="gm">GM only</option><option value="players">Players</option></select></label>
     <label>Planned travel days<input type="number" min="0" max="365" value={newRoute.travelDays}
      onChange={e=>setNewRoute(x=>({...x,travelDays:Number(e.target.value)}))}/></label>
    </div>
    <label>Route notes<textarea rows="2" maxLength={450} value={newRoute.description}
     onChange={e=>setNewRoute(x=>({...x,description:e.target.value}))}/></label>
    <div className="asteria-atlas-actions">
     <button disabled={busy||!newRoute.name.trim()||!newRoute.fromId||!newRoute.toId} onClick={saveRoute}>
      {newRoute.id?'Update route':'Add route'}</button>
     <button onClick={()=>setNewRoute(emptyRoute())}>Clear route</button></div>
    <div className="asteria-atlas-pin-list">{routes.map(route=><div key={route.id}>
     <span>{route.name} · {route.travelDays} days · {route.visibility}</span>
     <button onClick={()=>setNewRoute({...route})}>Edit</button>
     <button onClick={()=>setRoutes(x=>x.filter(r=>r.id!==route.id))}>Remove</button>
    </div>)}</div>
    <small>Travel durations are GM-authored estimates, not an automatic time or stamina cost.</small>
   </section>:null}
   {error?<p role="alert" className="asteria-atlas-error">{error}</p>:null}
   {message?<p role="status">{message}</p>:null}
   <small>The full map image is visible to players once published. Keep unrevealed discoveries in private markers or a separately prepared player-safe image.</small>
  </div>
 </Panel>;
}
export function PlayerWorldAtlas({campaignId,mapId='',presentation=false}){
 const maps=useAtlas(campaignId,'player'),context=useAtlasContext(campaignId);
 const [id,setId]=useState(''),[zoom,setZoom]=useState(1),[pin,setPin]=useState(null);
 const map=mapId?maps.find(x=>x.id===mapId)||null:maps.find(x=>x.id===id)||maps[0]||null;
 useEffect(()=>{setId('');setPin(null);},[campaignId]);
 const content=<div className={presentation?"asteria-presentation-map":""}>
  <div className="asteria-atlas">
   {!presentation?<label>Published world map<select value={map?.id||''} onChange={e=>{setId(e.target.value);setPin(null);}}>
    {maps.length?maps.map(m=><option key={m.id} value={m.id}>{m.name}</option>):
     <option value="">No shared maps</option>}</select></label>:null}
   {map?<>{!presentation?<label>Zoom<select value={zoom} onChange={e=>setZoom(Number(e.target.value))}>
    {[.5,.75,1,1.5,2,3,4].map(x=><option key={x} value={x}>{Math.round(x*100)}%</option>)}
   </select></label>:null}
    <AtlasCanvas campaignId={campaignId} map={map} pins={map.pins||[]} routes={map.routes||[]}
     zoom={zoom} onSelectPin={setPin} player/>
    {pin?<section className="asteria-atlas-box"><h3>{pin.name}</h3>
     <p>{pretty(pin.kind)}</p>{pin.description?<p>{pin.description}</p>:null}</section>:null}
    <AtlasContext context={context} region={map.region||''}/>
   </>:<p>The GM has not published an atlas for this campaign.</p>}
   <small>Only GM-approved maps, discovered markers and visible travel routes appear here.</small>
  </div></div>;
 return presentation?content:<Panel title="World Map" eyebrow="Campaign Atlas & Discoveries">{content}</Panel>;
}
