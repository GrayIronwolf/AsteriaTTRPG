import React,{useEffect,useMemo,useState} from 'react';
import {Panel} from '../components/WorkspaceUI.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {WEATHER_BIOMES,WEATHER_CONDITIONS,WEATHER_SEVERITIES,WEATHER_VOLATILITY,
 weatherLabel,orderWeatherReports,weatherDateLabel} from '../state/weatherEnvironmentModel.mjs';
import '../styles/weather-environment.css';
const emptyZone=()=>({name:'',region:'',biome:'temperate',volatility:'normal',magicWeather:false,gmNotes:''});
const activeZones=rows=>(rows||[]).filter(row=>row.status==='active');
const WeatherDays=({report,calendar})=><div className="asteria-weather-days">{(report.forecast||[]).map((day,index)=>
 <article key={index}><strong>{calendar?.definition?weatherDateLabel(day,calendar.definition):'Day '+(index+1)}</strong>
 <p><b>{weatherLabel(day.condition)}</b> · {weatherLabel(day.severity)}</p><p>{day.summary}</p>
 <small>Visibility: {day.visibility} · Travel: {day.travel}</small>
 {day.hazards?.length?<small>Hazards: {day.hazards.join(', ')}</small>:null}
 </article>)}</div>;
export function GMWeatherEnvironmentWorkspace({campaignId}){
 const [calendar,setCalendar]=useState(null),[zones,setZones]=useState([]),[reports,setReports]=useState([]);
 const [zoneId,setZoneId]=useState(''),[draft,setDraft]=useState(emptyZone);
 const [reportId,setReportId]=useState(''),[days,setDays]=useState(3);
 const [dayIndex,setDayIndex]=useState(0),[condition,setCondition]=useState('cloudy'),
  [severity,setSeverity]=useState('moderate'),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const selected=zones.find(row=>row.id===zoneId&&row.status==='active');
 const report=reports.find(row=>row.id===reportId&&row.status!=='archived');
 const ordered=useMemo(()=>orderWeatherReports(reports),[reports]);
 useEffect(()=>{
  setCalendar(null);setZones([]);setReports([]);setZoneId('');setReportId('');
  setDraft(emptyZone());setError('');setMessage('');
  if(!campaignId)return;
  const stops=[firebaseService.subscribeAsteriaCalendar(campaignId,setCalendar,'gm'),
   firebaseService.subscribeWeatherZones(campaignId,setZones),
   firebaseService.subscribeWeatherReports(campaignId,setReports,'gm')];
  return()=>stops.forEach(stop=>stop?.());
 },[campaignId]);
 const act=async(action,success)=>{
  if(busy)return null;
  setBusy(true);setError('');setMessage('');
  try{
   const value=await firebaseService.manageWeatherEnvironment(campaignId,'gm-scope',action);
   if(!value?.ok)throw Error(value?.error||'Weather action was not confirmed.');
   setMessage(success);return value;
  }catch(err){setError(err?.message||String(err));return null;}
  finally{setBusy(false);}
 };
 const selectZone=record=>{
  setZoneId(record?.id||'');
  setDraft(record?{name:record.name,region:record.region||'',biome:record.biome,
   volatility:record.volatility,magicWeather:record.magicWeather===true,
   gmNotes:record.gmNotes||''}:emptyZone());
 };
 const saveZone=async()=>{
  const result=await act({type:'saveZone',zoneId:selected?.id||crypto.randomUUID(),
   expectedRevision:selected?.revision||0,zone:draft},'Weather zone saved.');
  if(result)setZoneId(result.zoneId);
 };
 const generate=async()=>{
  if(!selected)return;
  const result=await act({type:'generate',zoneId:selected.id,expectedZoneRevision:selected.revision,
   days:Number(days)},'Private forecast generated. Review before publishing.');
  if(result)setReportId(result.reportId);
 };
 const changeReport=async(type,more={},success)=>{
  if(!report)return;
  const result=await act({type,reportId:report.id,expectedRevision:report.revision,...more},success);
  if(result?.status==='archived')setReportId('');
 };
 return <Panel title="Weather & Environmental Generator" eyebrow="Digital GM Toolkit · Phase 8.2">
  <div className="asteria-weather">
   <p>Biome and seasonal weather presets provide narrative suggestions, not official climate mechanics. Only GMs can generate, edit and publish conditions.</p>
   {!calendar?.definition||!calendar?.date?<p role="status">Configure your Asteria Calendar before generating weather.</p>:
    <p className="asteria-weather-clock">Campaign date: {weatherDateLabel({date:calendar.date,dayIndex:0},calendar.definition)}</p>}
   <section className="asteria-weather-box"><h3>1. Weather landscapes</h3>
    <label>Saved zone<select value={zoneId} disabled={busy} onChange={e=>selectZone(zones.find(x=>x.id===e.target.value))}>
     <option value="">Create a new zone</option>{activeZones(zones).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select></label>
    <div className="asteria-weather-grid">
     <label>Name<input maxLength={100} disabled={busy} value={draft.name}
      onChange={e=>setDraft(x=>({...x,name:e.target.value}))}/></label>
     <label>Region<input maxLength={100} disabled={busy} value={draft.region}
      onChange={e=>setDraft(x=>({...x,region:e.target.value}))}/></label>
     <label>Biome<select value={draft.biome} disabled={busy} onChange={e=>setDraft(x=>({...x,biome:e.target.value}))}>
      {WEATHER_BIOMES.map(x=><option key={x} value={x}>{weatherLabel(x)}</option>)}</select></label>
     <label>Variability<select value={draft.volatility} disabled={busy}
      onChange={e=>setDraft(x=>({...x,volatility:e.target.value}))}>
      {WEATHER_VOLATILITY.map(x=><option key={x} value={x}>{weatherLabel(x)}</option>)}</select></label>
    </div>
    <label className="asteria-weather-check"><input type="checkbox" disabled={busy} checked={draft.magicWeather}
     onChange={e=>setDraft(x=>({...x,magicWeather:e.target.checked}))}/> Allow magical weather outcomes</label>
    <label>Private GM notes<textarea maxLength={1500} rows="3" disabled={busy}
     value={draft.gmNotes} onChange={e=>setDraft(x=>({...x,gmNotes:e.target.value}))}/></label>
    <div className="asteria-weather-actions"><button className="primary" disabled={busy||!draft.name.trim()} onClick={saveZone}>Save weather zone</button>
     <button disabled={busy} onClick={()=>selectZone(null)}>New zone</button>
     {selected?<button disabled={busy} onClick={()=>window.confirm('Archive this weather zone?')&&act({
      type:'archiveZone',zoneId:selected.id,expectedRevision:selected.revision},'Zone archived.').then(result=>result&&selectZone(null))}>Archive zone</button>:null}
    </div>
   </section>
   <section className="asteria-weather-box"><h3>2. Generate a private forecast</h3>
    <label>Forecast days<select value={days} disabled={busy} onChange={e=>setDays(Number(e.target.value))}>
     {[1,2,3,4,5,6,7].map(x=><option key={x} value={x}>{x} {x===1?'day':'days'}</option>)}</select></label>
    <button className="primary" disabled={busy||!selected||!calendar?.definition||!calendar?.date} onClick={generate}>Generate preview for selected zone</button>
    <small>No automatic publication, calendar movement, combat effects or resource changes.</small>
   </section>
   <section className="asteria-weather-box"><h3>3. GM review and publication</h3>
    <label>Saved forecast<select value={reportId} disabled={busy} onChange={e=>{setReportId(e.target.value);setDayIndex(0);}}>
     <option value="">Choose a forecast</option>
     {ordered.map(x=><option key={x.id} value={x.id}>{x.zoneName} · {x.status} · {x.id.slice(-8)}</option>)}</select></label>
    {report?<div className="asteria-weather-report">
     <h4>{report.zoneName} — {report.status}</h4><WeatherDays report={report} calendar={calendar}/>
     <h4>Manual GM override</h4>
     <div className="asteria-weather-grid">
      <label>Day<select value={dayIndex} disabled={busy} onChange={e=>setDayIndex(Number(e.target.value))}>
       {report.forecast.map((row,index)=><option key={index} value={index}>Day {index+1} · {weatherLabel(row.condition)}</option>)}</select></label>
      <label>Condition<select disabled={busy} value={condition} onChange={e=>setCondition(e.target.value)}>
       {WEATHER_CONDITIONS.map(x=><option key={x} value={x}>{weatherLabel(x)}</option>)}</select></label>
      <label>Severity<select disabled={busy} value={severity} onChange={e=>setSeverity(e.target.value)}>
       {WEATHER_SEVERITIES.map(x=><option key={x} value={x}>{weatherLabel(x)}</option>)}</select></label>
      <label>Private reason<input maxLength={180} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label>
     </div>
     <div className="asteria-weather-actions">
      <button disabled={busy} onClick={()=>changeReport('override',{dayIndex:Number(dayIndex),condition,severity,reason},'Weather adjustment saved.')}>Save adjustment</button>
      {report.status==='draft'?<button className="primary" disabled={busy}
       onClick={()=>changeReport('publish',{},'Forecast published to players.')}>Approve & publish</button>:
       <button disabled={busy} onClick={()=>changeReport('unpublish',{},'Player visibility removed.')}>Withdraw publication</button>}
      <button disabled={busy} onClick={()=>window.confirm('Archive this forecast?')&&changeReport('archive',{},'Forecast archived.')}>Archive</button>
     </div>
     {report.gmNotes?<details><summary>Private GM notes</summary><p>{report.gmNotes}</p></details>:null}
    </div>:<p>Select a private forecast to review it.</p>}
   </section>
   {error?<p role="alert" className="asteria-weather-error">{error}</p>:null}
   {message?<p role="status">{message}</p>:null}
   <small>Hazards and travel guidance are descriptive. Any checks, penalties, damage, resistances or movement changes remain GM decisions under the existing rules.</small>
  </div>
 </Panel>;
}
export function PlayerWeatherEnvironment({campaignId}){
 const [calendar,setCalendar]=useState(null),[reports,setReports]=useState([]);
 useEffect(()=>{
  setCalendar(null);setReports([]);
  if(!campaignId)return;
  const stops=[firebaseService.subscribeAsteriaCalendar(campaignId,setCalendar,'player'),
   firebaseService.subscribeWeatherReports(campaignId,setReports,'player')];
  return()=>stops.forEach(stop=>stop?.());
 },[campaignId]);
 const ordered=useMemo(()=>orderWeatherReports(reports).filter(row=>row.status==='published'),[reports]);
 return <Panel title="Campaign Weather" eyebrow="GM-approved Environmental Conditions">
  <div className="asteria-weather">
   {ordered.length?ordered.map(report=><section className="asteria-weather-box" key={report.id}>
    <h3>{report.zoneName} {report.region?'· '+report.region:''}</h3>
    <WeatherDays report={report} calendar={calendar}/></section>):
    <p>The GM has not published a forecast for this campaign.</p>}
   <small>Published conditions are advisory, not automatic changes to characters or combat.</small>
  </div>
 </Panel>;
}
