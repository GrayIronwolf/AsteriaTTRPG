/**
 * Milestone 4: GM-reviewed calendar time advancement.
 * A completed character rest, encounter, quest or journey is never inferred
 * from this clock; no resource, XP, cooldown or encounter records are written.
 * The existing campaign calendar is the single time authority.
 */
import {
 validateCalendarDefinition,validateCalendarDate,effectiveCalendarDate,
 calendarDateFromMinutes,calendarDateToMinutes,calendarOccurrencesOnDate,
 calendarMoonPhases
} from './asteriaCalendarModel.mjs';

export const CALENDAR_GAMEPLAY_ACTIVITIES=Object.freeze([
 {id:'light-rest',label:'Light rest',minutes:120,detail:'2 in-world hours'},
 {id:'short-rest',label:'Short rest',minutes:240,detail:'4 in-world hours'},
 {id:'long-rest',label:'Long rest',minutes:480,detail:'8 in-world hours'},
 {id:'travel',label:'Travel',minutes:null,detail:'GM-confirmed route duration'},
 {id:'encounter',label:'Encounter',minutes:null,detail:'GM-confirmed elapsed combat time'},
 {id:'downtime',label:'Downtime',minutes:null,detail:'GM-confirmed time spent'}
]);
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const safeText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const limits=Object.freeze({travel:10080,encounter:1440,downtime:10080});
const restMinutes=Object.freeze({'light-rest':120,'short-rest':240,'long-rest':480});
export function validateGameplayTimeActivity(input){
 if(!record(input)||Object.keys(input).some(key=>!['kind','durationMinutes','label'].includes(key)))
  throw Error('Invalid gameplay time activity.');
 const preset=CALENDAR_GAMEPLAY_ACTIVITIES.find(item=>item.id===input.kind);
 if(!preset)throw Error('Choose a supported campaign time activity.');
 if(!Number.isSafeInteger(input.durationMinutes)||input.durationMinutes<1)
  throw Error('Elapsed time must be whole, positive in-world minutes.');
 if(Object.hasOwn(restMinutes,input.kind)&&input.durationMinutes!==restMinutes[input.kind])
  throw Error('Rest chronology must use the established 2, 4 or 8 hour duration.');
 if(input.durationMinutes>(limits[input.kind]??480))
  throw Error('This action exceeds the maximum single time advancement.');
 if(input.label!==undefined&&
  (typeof input.label!=='string'||input.label.trim().length>120))
  throw Error('Activity notes must be at most 120 characters.');
 return {kind:input.kind,durationMinutes:input.durationMinutes,
  label:safeText(input.label||preset.label,120)};
}
export function previewGameplayTimeActivity(calendar,activity,nowMs=Date.now()){
 const normalized=validateGameplayTimeActivity(activity);
 if(!record(calendar)||!calendar.definition||!calendar.date)
  throw Error('Configure your campaign calendar first.');
 const definition=validateCalendarDefinition(calendar.definition);
 const from=validateCalendarDate(effectiveCalendarDate(calendar,nowMs),definition);
 const absolute=calendarDateToMinutes(from,definition)+normalized.durationMinutes;
 if(!Number.isSafeInteger(absolute))throw Error('Time advancement is outside the supported calendar.');
 const to=calendarDateFromMinutes(absolute,definition,from.era);
 return {...normalized,from,to};
}
/** Player-facing weather matching MUST use explicitly published reports. */
export function publishedWeatherForDate(reports=[],date=null,region=''){
 if(!date)return null;
 const normalizedRegion=safeText(region,100).toLocaleLowerCase('en');
 const candidates=(Array.isArray(reports)?reports:[]).filter(report=>{
  if(report?.status!=='published'||!Array.isArray(report.forecast))return false;
  if(!normalizedRegion)return true;
  const fields=[report.region,report.location?.continent,report.location?.kingdom,
   report.location?.settlement,report.zoneName].filter(Boolean);
  return fields.some(value=>String(value).toLocaleLowerCase('en')===normalizedRegion);
 });
 for(const report of candidates){
  const day=report.forecast.find(row=>row?.date?.era===date.era&&
   row.date.year===date.year&&row.date.month===date.month&&row.date.day===date.day);
  if(day)return {report,day};
 }
 return null;
}
export function playerWorldContext(calendar,entries=[],weather=[],nowMs=Date.now(),region=''){
 if(!calendar?.definition||!calendar?.date)return null;
 const date=effectiveCalendarDate(calendar,nowMs);
 const definition=validateCalendarDefinition(calendar.definition);
 return {
  date,
  events:calendarOccurrencesOnDate(entries.filter(row=>row?.visibility==='party'),date,definition).slice(0,5),
  moons:calendarMoonPhases(date,definition),
  weather:publishedWeatherForDate(weather,date,region),
  clockMode:calendar.clockMode||'manual'
 };
}
