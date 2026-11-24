import React,{useEffect,useMemo,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {
 effectiveCalendarDate,formatAsteriaDate,calendarMoonPhases
} from '../state/asteriaCalendarModel.mjs';
import {playerWorldContext} from '../state/calendarGameplayModel.mjs';
import {weatherLabel} from '../state/weatherEnvironmentModel.mjs';
import '../styles/calendar-world-context.css';

/** Both dashboards use the existing GM/player subscriptions. The player mode
 * never fetches private calendar entries, zones, forecasts, or atlas records. */
export function CalendarWeatherQuickPanel({campaignId,role='player',onNavigate,region=''}){
 const [calendar,setCalendar]=useState(null),[entries,setEntries]=useState([]),
  [reports,setReports]=useState([]),[error,setError]=useState(''),
  [now,setNow]=useState(()=>Date.now());
 const gm=role==='gm';
 useEffect(()=>{
  setCalendar(null);setEntries([]);setReports([]);setError('');
  if(!campaignId)return undefined;
  const subscriptions=[];
  try{
   subscriptions.push(firebaseService.subscribeAsteriaCalendar(campaignId,setCalendar,gm?'gm':'player'));
   subscriptions.push(firebaseService.subscribeAsteriaCalendarEntries(campaignId,setEntries,gm?'gm':'player'));
   subscriptions.push(firebaseService.subscribeWeatherReports(campaignId,setReports,gm?'gm':'player'));
  }catch(err){setError(err?.message||'World context is unavailable.');}
  return ()=>subscriptions.forEach(stop=>stop?.());
 },[campaignId,gm]);
 useEffect(()=>{
  const timer=window.setInterval(()=>setNow(Date.now()),30000);
  return()=>window.clearInterval(timer);
 },[]);
 const world=useMemo(()=>{
  try{
   if(!calendar?.definition)return null;
   const shared=gm?entries.filter(e=>e.visibility==='party'):entries;
   const published=reports.filter(r=>r.status==='published');
   return playerWorldContext(calendar,shared,published,now,region);
  }catch{return null;}
 },[calendar,entries,reports,now,gm,region]);
 const allMoonPhases=useMemo(()=>{
  try{
   const date=effectiveCalendarDate(calendar,now);
   return date?calendarMoonPhases(date,calendar.definition):[];
  }catch{return [];}
 },[calendar,now]);
 return <section className="asteria-world-quick" data-testid="asteria-world-context-panel"
  aria-label="Campaign calendar and weather">
  {world?<><p className="asteria-world-time"><strong>{formatAsteriaDate(world.date,calendar.definition)}</strong>
   <small>{world.clockMode==='realtime'?'Automatic campaign clock':'GM-controlled campaign clock'}</small></p>
   {world.weather?<div className="asteria-world-weather">
    <strong>{world.weather.report.zoneName}</strong>
    <span>{weatherLabel(world.weather.day.condition)} · {weatherLabel(world.weather.day.severity)}</span>
    {world.weather.day.metrics?<span>{world.weather.day.metrics.temperatureC}°C · Wind {world.weather.day.metrics.windKmh} km/h</span>:null}
   </div>:<p>No published weather for this date{region?' and location':''}.</p>}
   {allMoonPhases.length?<p className="asteria-world-moons">
    {allMoonPhases.map(moon=><span key={moon.name}>{moon.name}: {moon.phase}</span>)}
   </p>:null}
   {world.events.length?<ul>{world.events.map(row=><li key={row.id}>{row.title}</li>)}</ul>:
    <p className="react-help">No shared events today.</p>}
  </>:<p role="status">The GM has not configured a campaign calendar.</p>}
  <div className="asteria-world-shortcuts">
   <button type="button" onClick={()=>onNavigate?.('asteria-calendar')}>Calendar</button>
   <button type="button" onClick={()=>onNavigate?.('weather-environment')}>Weather</button>
   <button type="button" onClick={()=>onNavigate?.('world-atlas')}>World Atlas</button>
  </div>
  {error?<p role="alert">{error}</p>:null}
 </section>;
}
