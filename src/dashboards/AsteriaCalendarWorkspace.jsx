import React,{useEffect,useMemo,useState} from 'react';
import {Panel} from '../components/WorkspaceUI.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {
 ASTERIA_MONTHS,ASTERIA_WEEKDAYS,ASTERIA_SEASONS,ASTERIA_ERAS,
 CALENDAR_ENTRY_KINDS,calendarSourceReferences,
 sortedCalendarEntries,formatAsteriaDate,validateCalendarDefinition
} from '../state/asteriaCalendarModel.mjs';
import '../styles/asteria-calendar.css';

const blankDefinition=()=>({
 months:ASTERIA_MONTHS.map(()=>({days:'',season:''})),
 hoursPerDay:24,minutesPerHour:60,weekdayAnchor:0
});
const blankDate=()=>({era:'EOSR',year:1,month:1,day:1,hour:0,minute:0});
const blankEvent=()=>({title:'',description:'',kind:'event',visibility:'gm',
 date:blankDate(),related:null});
const clock=value=>value?.toDate?.()?.toLocaleString?.()||'';
const numericDate=date=>Object.fromEntries(Object.entries(date).map(([key,value])=>[
 key,key==='era'?value:Number(value)
]));
const cleanDefinition=value=>({
 months:value.months.map(row=>({days:Number(row.days),season:row.season})),
 hoursPerDay:Number(value.hoursPerDay),
 minutesPerHour:Number(value.minutesPerHour),
 weekdayAnchor:Number(value.weekdayAnchor)
});

export function AsteriaCalendarWorkspace({campaignId,workspace={}}){
 const [calendar,setCalendar]=useState(null),[entries,setEntries]=useState([]);
 const [definition,setDefinition]=useState(blankDefinition),[date,setDate]=useState(blankDate);
 const [entry,setEntry]=useState(blankEvent),[entryId,setEntryId]=useState('');
 const [unit,setUnit]=useState('day'),[amount,setAmount]=useState(1),[reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const ready=Boolean(calendar?.definition&&calendar?.date);
 const selected=entries.find(row=>row.id===entryId);
 const config=calendar?.definition||null;
 const sources=useMemo(()=>calendarSourceReferences(workspace),[workspace]);
 const ordered=useMemo(()=>sortedCalendarEntries(entries,config),[entries,config]);
 useEffect(()=>{
  setCalendar(null);setEntries([]);setDefinition(blankDefinition());setDate(blankDate());
  setEntryId('');setEntry(blankEvent());setMessage('');setError('');
  if(!campaignId)return;
  const stops=[
   firebaseService.subscribeAsteriaCalendar(campaignId,setCalendar,'gm'),
   firebaseService.subscribeAsteriaCalendarEntries(campaignId,setEntries,'gm')
  ];
  return()=>stops.forEach(stop=>stop?.());
 },[campaignId]);
 useEffect(()=>{
  if(calendar?.definition){
   setDefinition(calendar.definition);
   setDate(calendar.date);
  }
 },[calendar?.revision]);
 const updateMonth=(index,key,value)=>setDefinition(old=>({
  ...old,months:old.months.map((row,i)=>i===index?{...row,[key]:value}:row)
 }));
 const updateDate=(key,value)=>setDate(old=>({...old,[key]:value}));
 const updateEntryDate=(key,value)=>setEntry(old=>({...old,date:{...old.date,[key]:value}}));
 const submit=async(action,success)=>{
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   const result=await firebaseService.manageAsteriaCalendar(campaignId,'gm-scope',action);
   if(result?.ok!==true)throw Error(result?.error||'The server did not confirm this calendar change.');
   setMessage(success(result));
   if(action.type==='saveEntry'){
    setEntryId(result.entryId);
   }
  }catch(err){setError(err?.message||'Calendar update failed.');}
  finally{setBusy(false);}
 };
 const saveCalendar=()=>{
  try{
   const clean=cleanDefinition(definition);
   validateCalendarDefinition(clean);
   submit({type:'configure',expectedRevision:calendar?.revision||0,
    definition:clean,date:numericDate(date),reason},
    ()=>'Asteria calendar rules and world date saved.'); 
  }catch(err){setError(err.message);}
 };
 const setWorldDate=()=>submit({type:'set',expectedRevision:calendar?.revision||0,
  date:numericDate(date),reason},()=> 'World date updated and synchronized to players.');
 const advance=()=>submit({type:'advance',expectedRevision:calendar?.revision||0,
  unit,amount:Number(amount),reason},result=>'Calendar advanced to '+
  formatAsteriaDate(result.date,config)+'.');
 const editEvent=record=>{
  setEntryId(record?.id||'');
  setEntry(record?{title:record.title,description:record.description||'',kind:record.kind,
   visibility:record.visibility,date:{...record.date},
   related:record.related||null}:
   {...blankEvent(),date:calendar?.date?{...calendar.date}:blankDate()});
  setError('');setMessage('');
 };
 const saveEvent=()=>submit({type:'saveEntry',expectedRevision:calendar?.revision||0,
  entryId:entryId||crypto.randomUUID(),expectedEntryRevision:selected?.revision||0,
  entry:{...entry,date:numericDate(entry.date)}},
  result=>result.visibility==='party'?'Calendar event saved and shared with the party.':
    'Calendar event saved for GMs only.');
 const archiveEvent=()=>{
  if(!selected||!window.confirm('Archive this calendar event? Its public projection will be removed.'))return;
  submit({type:'archiveEntry',expectedRevision:calendar?.revision||0,
   entryId:selected.id,expectedEntryRevision:selected.revision},
   ()=> 'Event archived. Any player-facing entry has been removed.');
 };
 const dateInputs=(current,change,prefix)=> <div className="asteria-calendar-grid">
  <label>Era<select value={current.era} disabled={busy} onChange={e=>change('era',e.target.value)}>
   {ASTERIA_ERAS.map(row=><option key={row.id} value={row.id}>{row.id} — {row.name}</option>)}
  </select></label>
  <label>Year<input aria-label={prefix+' year'} type="number" min="1" max="100000" step="1" value={current.year}
   disabled={busy} onChange={e=>change('year',e.target.value)}/></label>
  <label>Month<select value={current.month} disabled={busy} onChange={e=>change('month',Number(e.target.value))}>
   {ASTERIA_MONTHS.map((name,index)=><option key={name} value={index+1}>{index+1}. {name}</option>)}
  </select></label>
  <label>Day<input aria-label={prefix+' day'} type="number" min="1" max={config?.months?.[Number(current.month)-1]?.days||100} step="1"
   value={current.day} disabled={busy} onChange={e=>change('day',e.target.value)}/></label>
  <label>Hour<input aria-label={prefix+' hour'} type="number" min="0" max={(config?.hoursPerDay||Number(definition.hoursPerDay)||24)-1} step="1"
   value={current.hour} disabled={busy} onChange={e=>change('hour',e.target.value)}/></label>
  <label>Minute<input aria-label={prefix+' minute'} type="number" min="0"
   max={(config?.minutesPerHour||Number(definition.minutesPerHour)||60)-1} step="1"
   value={current.minute} disabled={busy} onChange={e=>change('minute',e.target.value)}/></label>
 </div>;
 return <Panel title="Asteria Calendar" eyebrow="Digital GM Toolkit · Phase 8.1">
  <div className="asteria-calendar">
   <p>The calendar uses Asteria's established twelve months, eight weekdays, four seasons and five eras. Day counts, weekday alignment and hours per day require your configuration; they have not been invented.</p>
   <section className="asteria-calendar-card">
    <h3>World chronology</h3>
    {ready?<p className="asteria-calendar-current"><strong>{formatAsteriaDate(calendar.date,config)}</strong>
      <small>Revision {calendar.revision}. Only the GM may change time. Players see the synchronized date.</small></p>:
     <p role="status">Not configured. Complete all twelve month lengths before using in-world dates.</p>}
    <details open={!ready}>
     <summary>Calendar rules {ready?'(configured)':'(configuration required)'}</summary>
     <div className="asteria-calendar-months">
      {ASTERIA_MONTHS.map((name,index)=><div key={name} className="asteria-calendar-month">
       <strong>{index+1}. {name}</strong>
       <label>Days<input type="number" min="1" max="100" step="1" disabled={busy}
        value={definition.months?.[index]?.days??''} onChange={e=>updateMonth(index,'days',e.target.value)}/></label>
       <label>Season<select value={definition.months?.[index]?.season??''} disabled={busy}
        onChange={e=>updateMonth(index,'season',e.target.value)}>
        <option value="">Not specified</option>
        {ASTERIA_SEASONS.map(s=><option key={s}>{s}</option>)}
       </select></label>
      </div>)}
     </div>
     <div className="asteria-calendar-grid">
      <label>Hours per day<input type="number" min="1" max="48" step="1" value={definition.hoursPerDay}
       disabled={busy} onChange={e=>setDefinition(old=>({...old,hoursPerDay:e.target.value}))}/></label>
      <label>Minutes per hour<input type="number" min="1" max="120" step="1" value={definition.minutesPerHour}
       disabled={busy} onChange={e=>setDefinition(old=>({...old,minutesPerHour:e.target.value}))}/></label>
      <label>First weekday<select value={definition.weekdayAnchor} disabled={busy}
       onChange={e=>setDefinition(old=>({...old,weekdayAnchor:Number(e.target.value)}))}>
       {ASTERIA_WEEKDAYS.map((weekday,index)=><option key={weekday} value={index}>{weekday}</option>)}
      </select></label>
     </div>
     <p className="react-help">The first weekday is day 1 of Aork, year 1 of each era. Seasons may be assigned to months when canon is confirmed. Calendar rules cannot be replaced while active dated entries exist.</p>
    </details>
    {dateInputs(date,updateDate,'World')}
    <label>GM change reason (optional)<input maxLength={180} value={reason} disabled={busy}
     onChange={e=>setReason(e.target.value)} placeholder="Session progression"/></label>
    <div className="asteria-calendar-actions">
     <button type="button" className="primary" disabled={busy} onClick={saveCalendar}>{ready?'Update calendar rules':'Configure calendar'}</button>
     <button type="button" disabled={busy||!ready} onClick={setWorldDate}>Set world date</button>
    </div>
    {ready?<div className="asteria-calendar-actions">
     <label>Advance by<select value={unit} disabled={busy} onChange={e=>setUnit(e.target.value)}>
      {['minute','hour','day','week','month','year'].map(x=><option key={x} value={x}>{x}</option>)}
     </select></label>
     <label>Amount<input type="number" min="1" max="365" value={amount} disabled={busy}
      onChange={e=>setAmount(e.target.value)}/></label>
     <button type="button" disabled={busy} onClick={advance}>Advance campaign time</button>
    </div>:null}
   </section>
   {ready?<section className="asteria-calendar-card">
    <h3>Campaign calendar events</h3>
    <div className="asteria-calendar-actions">
     <button type="button" onClick={()=>editEvent(null)} disabled={busy}>New calendar event</button>
     <label>Existing entries<select value={entryId} disabled={busy}
      onChange={e=>editEvent(entries.find(row=>row.id===e.target.value)||null)}>
      <option value="">Create new</option>
      {ordered.map(row=><option key={row.id} value={row.id}>{row.title} ({row.visibility==='party'?'Shared':'GM only'})</option>)}
     </select></label>
    </div>
    <div className="asteria-calendar-grid">
     <label>Title<input maxLength={120} disabled={busy} value={entry.title}
      onChange={e=>setEntry(old=>({...old,title:e.target.value}))}/></label>
     <label>Type<select value={entry.kind} disabled={busy}
      onChange={e=>setEntry(old=>({...old,kind:e.target.value}))}>
      {CALENDAR_ENTRY_KINDS.map(kind=><option key={kind} value={kind}>{kind}</option>)}
     </select></label>
     <label>Visibility<select value={entry.visibility} disabled={busy}
      onChange={e=>setEntry(old=>({...old,visibility:e.target.value}))}>
      <option value="gm">GM only</option><option value="party">Share with players</option>
     </select></label>
     <label>Related campaign record (optional)<select value={entry.related?entry.related.type+':'+entry.related.id:''} disabled={busy}
      onChange={e=>{
       const found=sources.find(row=>row.type+':'+row.id===e.target.value);
       setEntry(old=>({...old,related:found?{type:found.type,id:found.id}:null}));
      }}>
      <option value="">No record linked</option>
      {sources.map(row=><option key={row.type+':'+row.id} value={row.type+':'+row.id}>{row.type}: {row.title}</option>)}
     </select></label>
    </div>
    <label>Description<textarea rows="3" maxLength={1000} disabled={busy}
     value={entry.description} onChange={e=>setEntry(old=>({...old,description:e.target.value}))}/></label>
    {dateInputs(entry.date,updateEntryDate,'Event')}
    <div className="asteria-calendar-actions">
     <button type="button" className="primary" disabled={busy||!entry.title.trim()} onClick={saveEvent}>Save event</button>
     <button type="button" disabled={busy||!selected||selected.status==='archived'} onClick={archiveEvent}>Archive event</button>
    </div>
    <h4>Upcoming and historical events ({ordered.length})</h4>
    <ol className="asteria-calendar-events">
     {ordered.map(row=><li key={row.id}>
      <strong>{row.title}</strong><small>{formatAsteriaDate(row.date,config)} · {row.kind} · {row.visibility==='party'?'Party-visible':'GM private'}</small>
      {row.description?<p>{row.description}</p>:null}
      {row.related?<small>Linked {row.related.type} record: {row.related.id}</small>:null}
      <button type="button" disabled={busy} onClick={()=>editEvent(row)}>Edit</button>
     </li>)}
    </ol>
    {!ordered.length?<p>No calendar events. Existing quests and campaign event records remain unchanged.</p>:null}
   </section>:null}
   {ready?<details className="asteria-calendar-card">
    <summary>Recent GM chronology changes</summary>
    <ol>{(calendar.history||[]).map(row=><li key={row.requestId}>
     {row.type} · {formatAsteriaDate(row.date,config)}{row.reason?' · '+row.reason:''}
    </li>)}</ol>
   </details>:null}
   {error?<p role="alert" className="asteria-calendar-error">{error}</p>:null}
   {message?<p role="status">{message}</p>:null}
   <p className="react-help">Time advances only when the GM uses these controls. It does not alter cooldowns, rest mechanics, combat rounds, weather, quests or economy state automatically.</p>
  </div>
 </Panel>;
}

export function PlayerAsteriaCalendar({campaignId}){
 const [calendar,setCalendar]=useState(null),[entries,setEntries]=useState([]);
 useEffect(()=>{
  setCalendar(null);setEntries([]);
  if(!campaignId)return;
  const stops=[
   firebaseService.subscribeAsteriaCalendar(campaignId,setCalendar,'player'),
   firebaseService.subscribeAsteriaCalendarEntries(campaignId,setEntries,'player')
  ];
  return()=>stops.forEach(stop=>stop?.());
 },[campaignId]);
 const config=calendar?.definition;
 const ordered=useMemo(()=>sortedCalendarEntries(entries,config),[entries,config]);
 return <Panel title="Asteria Calendar" eyebrow="Campaign Time & Events">
  <div className="asteria-calendar">
   {config&&calendar?.date?<p className="asteria-calendar-current">
    <strong>{formatAsteriaDate(calendar.date,config)}</strong>
    <small>Live campaign time, managed by your GM.</small>
   </p>:<p>The GM has not configured the campaign calendar yet.</p>}
   <h3>Shared calendar events</h3>
   {config&&ordered.length?<ol className="asteria-calendar-events">
    {ordered.map(row=><li key={row.id}><strong>{row.title}</strong>
     <small>{formatAsteriaDate(row.date,config)} · {row.kind}</small>
     {row.description?<p>{row.description}</p>:null}
    </li>)}
   </ol>:<p>No shared calendar events have been published.</p>}
   <p className="react-help">Private GM events and planning notes are never shown here.</p>
  </div>
 </Panel>;
}
