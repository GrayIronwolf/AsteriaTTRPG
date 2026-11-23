import React,{useRef,useState} from 'react';
import {
 ASTERIA_MONTHS,ASTERIA_WEEKDAYS,ASTERIA_SEASONS,ASTERIA_ERAS,
 validateCalendarDefinition,calendarYearSummary
} from '../state/asteriaCalendarModel.mjs';

/**
 * Local draft editing only. Saving and permission checks remain in the
 * existing trusted manageAsteriaCalendar transaction.
 */
export const blankCalendarDefinition=()=>({
 months:ASTERIA_MONTHS.map(name=>({name,days:'',season:''})),
 weekdays:[...ASTERIA_WEEKDAYS],seasons:[...ASTERIA_SEASONS],
 eras:ASTERIA_ERAS.map(row=>({...row})),leapDays:[],moons:[],cycles:[],
 hoursPerDay:24,minutesPerHour:60,weekdayAnchor:0,weekdayOverflow:true
});
export const screenshotCalendarDraft=()=>({
 months:[
  ['Helios',33],['Inpharnos',31],['Ernos',33],['Boreos',31],
  ['Fandath',34],['Janos',29],['Fiends Hallow',6],['Aquolis',32],
  ['Duscaris',31],['Atheril',30],['Solcoris',32],['Odedith',30],['Incarnos',31]
 ].map(([name,days])=>({name,days,season:''})),
 weekdays:['Mystday','Embarday','Wynday','Thunday','Faeday','Lunisday','Solisday','Elisday'],
 seasons:['Summer','Autumn','Winter','Spring'],
 eras:[
  {id:'AOP',name:'Age of Primordials'},
  {id:'TBG',name:'Time Before Gods'},
  {id:'ABE',name:'Astria Birth Era'},
  {id:'EOLG',name:'Era of Lost Gods'}
 ],
 leapDays:[],moons:[],cycles:[],hoursPerDay:24,minutesPerHour:60,
 weekdayAnchor:0,weekdayOverflow:true
});
export function cleanCalendarDraft(value){
 const c={...value,
  months:value.months.map(row=>({name:String(row.name||''),days:Number(row.days),season:row.season||''})),
  weekdays:[...value.weekdays],seasons:[...value.seasons],
  eras:value.eras.map(row=>({...row})),
  hoursPerDay:Number(value.hoursPerDay),minutesPerHour:Number(value.minutesPerHour),
  weekdayAnchor:Number(value.weekdayAnchor),
  leapDays:value.leapDays.map(row=>({...row,afterMonth:Number(row.afterMonth),every:Number(row.every),
   offset:Number(row.offset||0),skipWeekday:Boolean(row.skipWeekday)})),
  moons:value.moons.map(row=>({...row,period:Number(row.period),offset:Number(row.offset||0)})),
  cycles:value.cycles.map(row=>({...row,period:Number(row.period),offset:Number(row.offset||0)}))
 };
 return validateCalendarDefinition(c);
}
const changeAt=(items,index,key,value)=>items.map((row,i)=>i===index?
 (key===null?value:{...row,[key]:value}):row);
const swap=(items,index,by)=>{
 const target=index+by;
 if(target<0||target>=items.length)return items;
 const next=[...items];[next[index],next[target]]=[next[target],next[index]];return next;
};
const safeFileName=value=>String(value).replace(/[^a-z0-9_-]+/gi,'-').slice(0,40);
const screenshotDays=screenshotCalendarDraft().months.reduce((sum,row)=>sum+row.days,0);

export function CalendarDefinitionEditor({value,onChange,busy=false,configured=false,entryCount=0}){
 const [feedback,setFeedback]=useState(''),fileRef=useRef(null);
 const update=(key,content)=>onChange(old=>({...old,[key]:content}));
 const rows=(key)=>value[key]||[];
 const setRow=(key,index,property,next)=>update(key,changeAt(rows(key),index,property,next));
 const removeRow=(key,index)=>update(key,rows(key).filter((_,i)=>i!==index));
 const moveRow=(key,index,by)=>update(key,swap(rows(key),index,by));
 const reset=()=>{if(window.confirm('Discard unsaved calendar changes and use the original Astria labels?')){
  onChange(blankCalendarDefinition());setFeedback('Original Astria labels loaded. Month lengths still need confirmation.');
 }};
 const loadScreenshot=()=>{
  if(!window.confirm('Load the 13-month screenshot as an UNSAVED draft? This does not change the official Astria calendar.'))return;
  onChange(screenshotCalendarDraft());
  setFeedback('Reference only: screenshot month lengths total '+screenshotDays+' days; the screenshot season settings mention 378 days. Review before saving.');
 };
 const exportDraft=()=>{
  let json;try{json=JSON.stringify({format:'asteria-calendar-definition-v2',definition:cleanCalendarDraft(value)},null,2);}
  catch(error){setFeedback(error.message);return;}
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;
  link.download=safeFileName('asteria-calendar')+'.json';link.click();URL.revokeObjectURL(url);
  setFeedback('Draft exported locally. No campaign changes were made.');
 };
 const importDraft=async file=>{
  if(!file)return;
  try{
   if(file.size>200000)throw Error('Calendar JSON file is too large.');
   const payload=JSON.parse(await file.text());
   const clean=validateCalendarDefinition(payload.definition||payload);
   onChange(clean);setFeedback('Validated calendar draft imported. Click Save calendar rules to apply it.');
  }catch(error){setFeedback('Import failed: '+error.message);}
  finally{if(fileRef.current)fileRef.current.value='';}
 };
 let summary,invalid='';
 try{summary=calendarYearSummary(cleanCalendarDraft(value));}
 catch(error){invalid=error.message;}
 const rowActions=(key,index)=> <span className="asteria-calendar-row-actions">
  <button type="button" disabled={busy||index===0} aria-label={'Move '+key+' up'} onClick={()=>moveRow(key,index,-1)}>↑</button>
  <button type="button" disabled={busy||index===rows(key).length-1} aria-label={'Move '+key+' down'} onClick={()=>moveRow(key,index,1)}>↓</button>
  <button type="button" disabled={busy} aria-label={'Remove '+key+' row'} onClick={()=>removeRow(key,index)}>×</button>
 </span>;
 return <details className="asteria-calendar-editor" open={!configured}>
  <summary>Calendar creator &amp; settings {configured?'· existing campaign':'· configuration required'}</summary>
  <p className="react-help">Edit a local draft, then use Save calendar rules. Existing saved calendar records are not altered by these inputs until the GM saves.</p>
  {entryCount>0?<p className="asteria-calendar-notice">Calendar rules cannot be changed while dated campaign events exist. Archive those events first; their history is preserved.</p>:null}
  <div className="asteria-calendar-actions">
   <button type="button" disabled={busy} onClick={loadScreenshot}>Load 13-month screenshot draft</button>
   <button type="button" disabled={busy} onClick={reset}>Restore Astria labels</button>
   <button type="button" disabled={busy} onClick={exportDraft}>Export JSON</button>
   <label className="asteria-calendar-import">Import JSON<input ref={fileRef} type="file" accept=".json,application/json"
    disabled={busy} onChange={e=>importDraft(e.target.files?.[0])}/></label>
  </div>
  {feedback?<p role="status" className="asteria-calendar-notice">{feedback}</p>:null}
  {summary?<p className="asteria-calendar-summary">Year {summary.year}: <strong>{summary.days} days</strong> · {summary.months} months · {summary.weekdays} weekdays</p>:
   <p className="asteria-calendar-notice" role="status">{invalid}</p>}
  <details open>
   <summary>Months ({rows('months').length})</summary>
   <div className="asteria-calendar-months">
    {rows('months').map((row,index)=><div className="asteria-calendar-month" key={index}>
     <span className="asteria-calendar-row-heading"><strong>Month {index+1}</strong>{rowActions('months',index)}</span>
     <label>Name<input aria-label={'Month '+(index+1)+' name'} maxLength={50} value={row.name??ASTERIA_MONTHS[index]??''}
      disabled={busy} onChange={e=>setRow('months',index,'name',e.target.value)}/></label>
     <label>Days<input type="number" min="1" max="100" step="1" value={row.days??''}
      disabled={busy} onChange={e=>setRow('months',index,'days',e.target.value)}/></label>
     <label>Season<select value={row.season||''} disabled={busy}
      onChange={e=>setRow('months',index,'season',e.target.value)}>
      <option value="">Not assigned</option>{rows('seasons').map(name=><option key={name} value={name}>{name}</option>)}
     </select></label>
    </div>)}
   </div>
   <button type="button" disabled={busy||rows('months').length>=24} onClick={()=>
    update('months',[...rows('months'),{name:'New Month',days:30,season:''}])}>+ Add month</button>
  </details>
  <details>
   <summary>Weekdays ({rows('weekdays').length})</summary>
   <div className="asteria-calendar-editor-list">
    {rows('weekdays').map((name,index)=><div className="asteria-calendar-row" key={index}>
     <label>Day {index+1}<input maxLength={40} value={name} disabled={busy}
      onChange={e=>setRow('weekdays',index,null,e.target.value)}/></label>{rowActions('weekdays',index)}
    </div>)}
   </div>
   <button type="button" disabled={busy||rows('weekdays').length>=14} onClick={()=>
    update('weekdays',[...rows('weekdays'),'Newday'])}>+ Add weekday</button>
   <label>First weekday<select disabled={busy} value={Math.min(Number(value.weekdayAnchor)||0,Math.max(0,rows('weekdays').length-1))}
    onChange={e=>update('weekdayAnchor',Number(e.target.value))}>
    {rows('weekdays').map((name,index)=><option key={index} value={index}>{name}</option>)}
   </select></label>
   <label className="asteria-calendar-check"><input type="checkbox" checked={value.weekdayOverflow!==false}
    disabled={busy} onChange={e=>update('weekdayOverflow',e.target.checked)}/> Continue weekday order across months</label>
  </details>
  <details>
   <summary>Seasons ({rows('seasons').length})</summary>
   {rows('seasons').map((name,index)=><div className="asteria-calendar-row" key={index}>
    <label>Season {index+1}<input maxLength={50} value={name} disabled={busy}
     onChange={e=>setRow('seasons',index,null,e.target.value)}/></label>{rowActions('seasons',index)}
   </div>)}
   <button type="button" disabled={busy||rows('seasons').length>=12} onClick={()=>
    update('seasons',[...rows('seasons'),'New Season'])}>+ Add season</button>
   <p className="react-help">If you rename a season, also update months assigned to that season.</p>
  </details>
  <details>
   <summary>Historical eras ({rows('eras').length})</summary>
   {rows('eras').map((row,index)=><div className="asteria-calendar-row" key={index}>
    <label>Code<input maxLength={20} disabled={busy} value={row.id}
     onChange={e=>setRow('eras',index,'id',e.target.value)}/></label>
    <label>Era name<input maxLength={80} disabled={busy} value={row.name}
     onChange={e=>setRow('eras',index,'name',e.target.value)}/></label>{rowActions('eras',index)}
   </div>)}
   <button type="button" disabled={busy||rows('eras').length>=20} onClick={()=>
    update('eras',[...rows('eras'),{id:'NEW',name:'New Era'}])}>+ Add era</button>
  </details>
  <details>
   <summary>Leap days ({rows('leapDays').length})</summary>
   <p className="react-help">Leap days are appended after the regular days of a selected month in years matching the interval. Optionally exclude a leap day from the weekday cycle.</p>
   {rows('leapDays').map((row,index)=><div className="asteria-calendar-row" key={index}>
    <label>Leap day<input value={row.name} maxLength={50} disabled={busy}
     onChange={e=>setRow('leapDays',index,'name',e.target.value)}/></label>
    <label>After month<select value={row.afterMonth} disabled={busy}
     onChange={e=>setRow('leapDays',index,'afterMonth',e.target.value)}>
     {rows('months').map((m,i)=><option key={i} value={i+1}>{m.name}</option>)}
    </select></label>
    <label>Every N years<input type="number" min="2" max="1000" value={row.every} disabled={busy}
     onChange={e=>setRow('leapDays',index,'every',e.target.value)}/></label>
    <label>Offset<input type="number" min="0" value={row.offset} disabled={busy}
     onChange={e=>setRow('leapDays',index,'offset',e.target.value)}/></label>
    <label className="asteria-calendar-check"><input type="checkbox" checked={Boolean(row.skipWeekday)}
     disabled={busy} onChange={e=>setRow('leapDays',index,'skipWeekday',e.target.checked)}/> Outside week</label>
    {rowActions('leapDays',index)}
   </div>)}
   <button type="button" disabled={busy||rows('leapDays').length>=12} onClick={()=>
    update('leapDays',[...rows('leapDays'),{name:'Leapday',afterMonth:1,every:4,offset:0,skipWeekday:false}])}>+ Add leap rule</button>
  </details>
  {['moons','cycles'].map(key=><details key={key}>
   <summary>{key==='moons'?'Moons':'Custom cycles'} ({rows(key).length})</summary>
   {rows(key).map((row,index)=><div className="asteria-calendar-row" key={index}>
    <label>Name<input disabled={busy} maxLength={50} value={row.name}
     onChange={e=>setRow(key,index,'name',e.target.value)}/></label>
    <label>Period (days)<input type="number" min="2" max="100000" disabled={busy} value={row.period}
     onChange={e=>setRow(key,index,'period',e.target.value)}/></label>
    <label>Offset<input type="number" min="0" max="99999" disabled={busy} value={row.offset}
     onChange={e=>setRow(key,index,'offset',e.target.value)}/></label>{rowActions(key,index)}
   </div>)}
   <button type="button" disabled={busy||rows(key).length>=(key==='moons'?12:20)} onClick={()=>
    update(key,[...rows(key),{name:key==='moons'?'New Moon':'New Cycle',period:28,offset:0}])}>+ Add {key==='moons'?'moon':'cycle'}</button>
  </details>)}
  <details>
   <summary>Clock</summary>
   <div className="asteria-calendar-grid">
    <label>Hours per day<input type="number" min="1" max="48" disabled={busy} value={value.hoursPerDay}
     onChange={e=>update('hoursPerDay',e.target.value)}/></label>
    <label>Minutes per hour<input type="number" min="1" max="120" disabled={busy} value={value.minutesPerHour}
     onChange={e=>update('minutesPerHour',e.target.value)}/></label>
   </div>
  </details>
 </details>;
}
