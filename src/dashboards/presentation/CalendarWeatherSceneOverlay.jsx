import React,{useEffect,useState} from 'react';
import {firebaseService} from '../../firebase/asteriaFirebaseService.js';
import {playerWorldContext} from '../../state/calendarGameplayModel.mjs';
import {formatAsteriaDate} from '../../state/asteriaCalendarModel.mjs';
import {weatherLabel} from '../../state/weatherEnvironmentModel.mjs';

/** Only mounted while an approved, signed-in player display shows the world map.
 * Restricted hybrid viewers never subscribe to campaign calendar collections. */
export function CalendarWeatherSceneOverlay({campaignId}){
 const [calendar,setCalendar]=useState(null),[reports,setReports]=useState([]);
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{
  setCalendar(null);setReports([]);
  if(!campaignId)return;
  const stops=[
   firebaseService.subscribeAsteriaCalendar(campaignId,setCalendar,'player'),
   firebaseService.subscribeWeatherReports(campaignId,setReports,'player')
  ];
  return ()=>stops.forEach(stop=>stop?.());
 },[campaignId]);
 useEffect(()=>{
  const timer=window.setInterval(()=>setNow(Date.now()),30000);
  return ()=>window.clearInterval(timer);
 },[]);
 let date=null,weather=null;
 try{
  const context=playerWorldContext(calendar,[],reports.filter(r=>r.status==='published'),now);
  date=context?.date||null;weather=context?.weather||null;
 }catch{/* No shared calendar configuration. */}
 if(!date)return null;
 return <aside className="asteria-presentation-world-status" aria-label="Published campaign weather and time">
  <strong>{formatAsteriaDate(date,calendar.definition)}</strong>
  {weather?<span>{weather.report.zoneName}: {weatherLabel(weather.day.condition)}
   {weather.day.metrics?' · '+weather.day.metrics.temperatureC+'°C':''}</span>:
   <span>No GM-published weather for this date</span>}
 </aside>;
}
