import React,{useEffect,useMemo,useState} from 'react';
import {Panel} from '../components/WorkspaceUI.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {
 ASTERIA_MONTHS,ASTERIA_WEEKDAYS,ASTERIA_SEASONS,ASTERIA_ERAS,
 CALENDAR_ENTRY_KINDS,calendarSourceReferences,DEFAULT_CALENDAR_CATEGORIES,CALENDAR_CLOCK_RATES,
 sortedCalendarEntries,formatAsteriaDate,validateCalendarDefinition,effectiveCalendarDate,
 calendarOccurrencesOnDate,calendarMoonPhases,calendarCelestialEventsOnDate
} from '../state/asteriaCalendarModel.mjs';
import {CalendarDefinitionEditor,blankCalendarDefinition,cleanCalendarDraft} from './CalendarDefinitionEditor.jsx';
import {calendarMonthGrid,calendarMonthDays} from '../state/asteriaCalendarModel.mjs';
import {CALENDAR_GAMEPLAY_ACTIVITIES,previewGameplayTimeActivity} from '../state/calendarGameplayModel.mjs';
import '../styles/asteria-calendar.css';

const blankDefinition=blankCalendarDefinition;
const blankDate=()=>({era:'EOSR',year:1,month:1,day:1,hour:0,minute:0});
const blankEvent=()=>({title:'',description:'',kind:'event',categoryId:'event',recurrence:null,visibility:'gm',
 date:blankDate(),related:null});
const numericDate=date=>Object.fromEntries(Object.entries(date).map(([key,value])=>[
 key,key==='era'?value:Number(value)
]));
const cleanDefinition=cleanCalendarDraft;

export function AsteriaCalendarWorkspace({campaignId,workspace={}}){
 const [calendar,setCalendar]=useState(null),[entries,setEntries]=useState([]);
 const [definition,setDefinition]=useState(blankDefinition),[date,setDate]=useState(blankDate);
 const [entry,setEntry]=useState(blankEvent),[entryId,setEntryId]=useState('');
 const [unit,setUnit]=useState('day'),[amount,setAmount]=useState(1),[reason,setReason]=useState('');
 const [activityKind,setActivityKind]=useState('short-rest'),[activityMinutes,setActivityMinutes]=useState(240);
 const [activityLabel,setActivityLabel]=useState('');
 const [clockMode,setClockMode]=useState('manual'),[clockRate,setClockRate]=useState(1);
 const [clockNow,setClockNow]=useState(()=>Date.now());
 const [categories,setCategories]=useState(DEFAULT_CALENDAR_CATEGORIES.map(row=>({...row})));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const ready=Boolean(calendar?.definition&&calendar?.date);
 const selected=entries.find(row=>row.id===entryId);
 const config=calendar?.definition||null;
 const sources=useMemo(()=>calendarSourceReferences(workspace),[workspace]);
 const ordered=useMemo(()=>sortedCalendarEntries(entries,config),[entries,config]);
 useEffect(()=>{
  const tick=()=>setClockNow(Date.now());
  const timer=window.setInterval(tick,1000);
  return()=>window.clearInterval(timer);
 },[]);
 const displayDate=ready?effectiveCalendarDate(calendar,clockNow):null;
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
   setDefinition({...calendar.definition,weekdays:calendar.definition.weekdays||[...ASTERIA_WEEKDAYS],
    seasons:calendar.definition.seasons||[...ASTERIA_SEASONS],eras:calendar.definition.eras||ASTERIA_ERAS.map(x=>({...x})),
    leapDays:calendar.definition.leapDays||[],moons:calendar.definition.moons||[],cycles:calendar.definition.cycles||[]});
   setDate(calendar.date);
   setClockMode(calendar.clockMode||'manual');
   setClockRate(calendar.clockRate||1);
   setCategories((calendar.categories||DEFAULT_CALENDAR_CATEGORIES).map(row=>({...row})));
  }
 },[calendar?.revision]);
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
 const gameplayPreview=useMemo(()=>{
  if(!ready)return null;
  try{return previewGameplayTimeActivity(calendar,{kind:activityKind,
   durationMinutes:Number(activityMinutes),label:activityLabel},clockNow);}
  catch{return null;}
 },[calendar,ready,activityKind,activityMinutes,activityLabel,clockNow]);
 const approveActivity=()=>{
  if(!gameplayPreview||!window.confirm('Advance shared campaign chronology for '+
    gameplayPreview.label+' ('+gameplayPreview.durationMinutes+' game minutes)? This does NOT resolve rests, combat, quests or character resources.'))return;
  submit({type:'advanceActivity',expectedRevision:calendar.revision,
   activity:{kind:gameplayPreview.kind,durationMinutes:gameplayPreview.durationMinutes,
    label:gameplayPreview.label},reason},
    result=>'Campaign time advanced to '+formatAsteriaDate(result.date,config)+'.');
 };
 const advance=()=>submit({type:'advance',expectedRevision:calendar?.revision||0,
  unit,amount:Number(amount),reason},result=>'Calendar advanced to '+
  formatAsteriaDate(result.date,config)+'.');
 const editEvent=record=>{
  setEntryId(record?.id||'');
  setEntry(record?{title:record.title,description:record.description||'',kind:record.kind,
   categoryId:record.categoryId||record.kind,recurrence:record.recurrence||null,
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
 const saveClock=()=>submit({type:'setClock',expectedRevision:calendar?.revision||0,
  clockMode,clockRate:Number(clockRate),reason},
  result=>result.clockMode==='realtime'?'Campaign clock is now advancing automatically.':'Campaign clock paused.');
 const undoTime=()=>submit({type:'undoTime',expectedRevision:calendar?.revision||0,reason},
  ()=>'The most recent reversible clock change was undone.');
 const saveCategories=()=>submit({type:'setCategories',expectedRevision:calendar?.revision||0,
  categories},()=>'Calendar event categories saved and shared.');
 const updateCategory=(index,key,value)=>setCategories(old=>old.map((row,i)=>i===index?{...row,[key]:value}:row));
 const archiveEvent=()=>{
  if(!selected||!window.confirm('Archive this calendar event? Its public projection will be removed.'))return;
  submit({type:'archiveEntry',expectedRevision:calendar?.revision||0,
   entryId:selected.id,expectedEntryRevision:selected.revision},
   ()=> 'Event archived. Any player-facing entry has been removed.');
 };
 const dateInputs=(current,change,prefix)=> <div className="asteria-calendar-grid">
  <label>Era<select value={current.era} disabled={busy} onChange={e=>change('era',e.target.value)}>
   {(definition.eras||ASTERIA_ERAS).map(row=><option key={row.id} value={row.id}>{row.id} — {row.name}</option>)}
  </select></label>
  <label>Year<input aria-label={prefix+' year'} type="number" min="1" max="100000" step="1" value={current.year}
   disabled={busy} onChange={e=>change('year',e.target.value)}/></label>
  <label>Month<select value={current.month} disabled={busy} onChange={e=>change('month',Number(e.target.value))}>
   {(definition.months||[]).map((row,index)=><option key={index} value={index+1}>{index+1}. {row.name||ASTERIA_MONTHS[index]}</option>)}
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
   <p>Your campaign calendar can be customised without changing the official Astria calendar. Review month lengths and eras before saving.</p>
   <section className="asteria-calendar-card">
    <h3>World chronology</h3>
    {ready?<p className="asteria-calendar-current"><strong>{formatAsteriaDate(displayDate,config)}</strong>
      <small>Revision {calendar.revision}. Only the GM may change time. Players see the synchronized date.</small></p>:
     <p role="status">Not configured. Complete the calendar rules and save them before using in-world dates.</p>}
    <CalendarDefinitionEditor value={definition} onChange={setDefinition} busy={busy} configured={ready} entryCount={calendar?.entryCount||0}/>
    {dateInputs(date,updateDate,'World')}
    <label>GM change reason (optional)<input maxLength={180} value={reason} disabled={busy}
     onChange={e=>setReason(e.target.value)} placeholder="Session progression"/></label>
    <div className="asteria-calendar-actions">
     <button type="button" className="primary" disabled={busy} onClick={saveCalendar}>{ready?'Update calendar rules':'Configure calendar'}</button>
     <button type="button" disabled={busy||!ready} onClick={setWorldDate}>Set world date</button>
    </div>
    {ready?<div className="asteria-calendar-clock-controls">
      <h4>Campaign clock</h4>
      <p className="react-help">Manual changes remain GM-only. Automatic time uses one server-authorised anchor and advances locally on each viewer's screen without continual Firestore writes.</p>
      <div className="asteria-calendar-grid">
       <label>Clock mode<select disabled={busy} value={clockMode} onChange={e=>setClockMode(e.target.value)}>
        <option value="manual">Manual / paused</option><option value="realtime">Automatic advancement</option>
       </select></label>
       <label>Game minutes per real minute<select disabled={busy} value={clockRate}
        onChange={e=>setClockRate(Number(e.target.value))}>
        {CALENDAR_CLOCK_RATES.map(rate=><option value={rate} key={rate}>{rate}×</option>)}
       </select></label>
      </div>
      <div className="asteria-calendar-actions">
       <button type="button" disabled={busy} onClick={saveClock}>Apply clock controls</button>
       <button type="button" disabled={busy||!['advance','set','setClock'].includes(calendar.history?.[0]?.type)}
        onClick={undoTime}>Undo most recent clock change</button>
      </div>
     </div>:null}
    {ready?<div className="asteria-calendar-actions">
     <label>Advance by<select value={unit} disabled={busy} onChange={e=>setUnit(e.target.value)}>
      {['minute','hour','day','week','month','year'].map(x=><option key={x} value={x}>{x}</option>)}
     </select></label>
     <label>Amount<input type="number" min="1" max="365" value={amount} disabled={busy}
      onChange={e=>setAmount(e.target.value)}/></label>
     <button type="button" disabled={busy} onClick={advance}>Advance campaign time</button>
    </div>:null}
   </section>
   {ready?<section className="asteria-calendar-card asteria-calendar-gameplay">
    <h3>Gameplay time integration</h3>
    <p className="react-help">Approve time spent resting, travelling, in encounters or on downtime. This moves the single campaign calendar only. Rest recovery, movement, combat and quest outcomes remain controlled by their existing systems.</p>
    <div className="asteria-calendar-grid">
     <label>Activity<select value={activityKind} disabled={busy} onChange={e=>{
      const activity=CALENDAR_GAMEPLAY_ACTIVITIES.find(row=>row.id===e.target.value);
      setActivityKind(e.target.value);setActivityMinutes(activity?.minutes??60);
     }}>{CALENDAR_GAMEPLAY_ACTIVITIES.map(row=><option key={row.id} value={row.id}>
      {row.label} · {row.detail}</option>)}</select></label>
     <label>Elapsed game minutes<input type="number" step="1" min="1" max="10080"
      disabled={busy||CALENDAR_GAMEPLAY_ACTIVITIES.some(row=>row.id===activityKind&&row.minutes!==null)}
      value={activityMinutes} onChange={e=>setActivityMinutes(Number(e.target.value))}/></label>
     <label>Activity note<input maxLength={120} value={activityLabel}
      disabled={busy} onChange={e=>setActivityLabel(e.target.value)}
      placeholder="Optional journey, encounter or downtime note"/></label>
    </div>
    {gameplayPreview?<p className="asteria-calendar-current">
     <strong>{formatAsteriaDate(gameplayPreview.from,config)} → {formatAsteriaDate(gameplayPreview.to,config)}</strong>
     <small>{gameplayPreview.durationMinutes} minutes · GM approval required · chronology only</small>
    </p>:<p role="status">Choose a valid activity and duration to preview the change.</p>}
    <button type="button" className="primary" disabled={busy||!gameplayPreview} onClick={approveActivity}>
     Approve campaign time advancement</button>
   </section>:null}
   {ready?<CalendarBrowser calendar={calendar} entries={ordered} currentDate={displayDate}/>:null}
   {ready?<section className="asteria-calendar-card">
    <h3>Campaign calendar events</h3>
    <details><summary>Event categories</summary>
      <div className="asteria-calendar-editor-list">{categories.map((row,index)=><div className="asteria-calendar-row" key={index}>
       <label>Category ID<input value={row.id} maxLength={40} disabled={busy} onChange={e=>updateCategory(index,'id',e.target.value)}/></label>
       <label>Display name<input value={row.name} maxLength={40} disabled={busy} onChange={e=>updateCategory(index,'name',e.target.value)}/></label>
       <label>Colour<input type="color" value={row.color} disabled={busy} onChange={e=>updateCategory(index,'color',e.target.value)}/></label>
       <button type="button" disabled={busy||categories.length<=1} onClick={()=>setCategories(rows=>rows.filter((_,i)=>i!==index))}>Remove</button>
      </div>)}</div>
      <div className="asteria-calendar-actions"><button type="button" disabled={busy||categories.length>=24} onClick={()=>setCategories(rows=>[...rows,{id:'category-'+(rows.length+1),name:'New Category',color:'#8999AA'}])}>+ Category</button>
       <button type="button" disabled={busy} onClick={saveCategories}>Save categories</button></div>
    </details>
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
     <label>Category<select value={entry.categoryId||entry.kind} disabled={busy}
      onChange={e=>setEntry(old=>({...old,categoryId:e.target.value}))}>
      {categories.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
     </select></label>
     <label>Repeat<select disabled={busy} value={entry.recurrence?.unit||'none'} onChange={e=>setEntry(old=>({...old,
      recurrence:e.target.value==='none'?null:{unit:e.target.value,interval:1,untilYear:null}}))}>
       {['none','day','week','month','year'].map(unit=><option key={unit} value={unit}>{unit==='none'?'Do not repeat':'Every '+unit}</option>)}
     </select></label>
     {entry.recurrence?<label>Repeat interval<input type="number" min="1" max="365" disabled={busy}
      value={entry.recurrence.interval} onChange={e=>setEntry(old=>({...old,recurrence:{...old.recurrence,interval:Number(e.target.value)}}))}/></label>:null}
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
      {row.recurrence?<small>Repeats every {row.recurrence.interval} {row.recurrence.unit}(s)</small>:null}
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
   <p className="react-help">Only explicit GM time actions or the optional running clock advance campaign chronology. Gameplay resource effects are never inferred automatically.</p>
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
 const [clockNow,setClockNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=window.setInterval(()=>setClockNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
 const displayDate=config&&calendar?.date?effectiveCalendarDate(calendar,clockNow):null;
 const ordered=useMemo(()=>sortedCalendarEntries(entries,config),[entries,config]);
 return <Panel title="Asteria Calendar" eyebrow="Campaign Time & Events">
  <div className="asteria-calendar">
   {config&&calendar?.date?<p className="asteria-calendar-current">
    <strong>{formatAsteriaDate(displayDate,config)}</strong>
    <small>{calendar.clockMode==='realtime'?'Live campaign time (automatic)':'Campaign clock paused'} · managed by your GM.</small>
   </p>:<p>The GM has not configured the campaign calendar yet.</p>}
   {config&&calendar?.date?<CalendarBrowser calendar={calendar} entries={ordered} currentDate={displayDate}/>:null}
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

/** Shared read-only calendar browser for both GM and player views. */
export function CalendarBrowser({calendar,entries=[],currentDate=null}){
 const config=calendar?.definition;
 const [mode,setMode]=useState('month'),[offset,setOffset]=useState(0),[selection,setSelection]=useState(null);
 if(!config||!calendar?.date)return null;
 const c=validateCalendarDefinition(config),today=currentDate||calendar.date;
 const count=c.months.length;
 const abs=(today.year-1)*count+today.month-1+offset;
 const year=Math.max(1,Math.min(100000,Math.floor(abs/count)+1));
 const month=Math.max(1,Math.min(count,((abs%count)+count)%count+1));
 const grid=calendarMonthGrid(c,today.era,year,month);
 const chosen=Math.max(1,Math.min(calendarMonthDays(c,year,month),selection??today.day));
 const dayDate={...today,year,month,day:chosen};
 const matches=date=>calendarOccurrencesOnDate(entries,date,c);
 const celestial=date=>calendarCelestialEventsOnDate(date,c);
 const previous=()=>{setOffset(x=>Math.max(-(today.year-1)*count-today.month+1,x-(mode==='year'?count:1)));setSelection(null);};
 const next=()=>{setOffset(x=>Math.min((100000-today.year)*count+count-today.month,x+(mode==='year'?count:1)));setSelection(null);};
 return <section className="asteria-calendar-card asteria-calendar-browser">
  <header className="asteria-calendar-browser-head"><h3>{c.months[month-1].name} {year} {today.era}</h3>
   <nav className="asteria-calendar-actions" aria-label="Calendar display">
    {['day','month','year'].map(view=><button type="button" key={view} aria-pressed={mode===view}
     onClick={()=>{setMode(view);setSelection(null);}}>{view[0].toUpperCase()+view.slice(1)}</button>)}
   </nav>
  </header>
  <div className="asteria-calendar-actions">
   <button type="button" onClick={previous}>← Previous</button>
   <button type="button" onClick={()=>{setOffset(0);setSelection(null);}}>Today</button>
   <button type="button" onClick={next}>Next →</button>
  </div>
  {mode==='year'?<div className="asteria-calendar-year-grid">
   {c.months.map((row,index)=><button type="button" key={index} onClick={()=>{
    setOffset((year-today.year)*count+index-today.month+1);setSelection(null);setMode('month');
   }}><strong>{row.name}</strong><small>{calendarMonthDays(c,year,index+1)} days</small></button>)}
  </div>:mode==='month'?<div className="asteria-calendar-month-grid" style={{"--calendar-weekdays":c.weekdays.length}} role="grid" aria-label={c.months[month-1].name}>
   {c.weekdays.map((name,index)=><div key={index} className="asteria-calendar-weekday" role="columnheader">{name}</div>)}
   {grid.map((cell,index)=>cell?<button type="button" role="gridcell" key={index}
    className={'asteria-calendar-day'+(cell.intercalary?' is-intercalary':'')+
     (cell.date.year===today.year&&cell.date.month===today.month&&cell.date.day===today.day?' is-today':'')}
    aria-selected={selection===cell.date.day}
    onClick={()=>setSelection(cell.date.day)}><strong>{cell.date.day}</strong>
    {cell.intercalary?<small>{cell.intercalary}</small>:null}
    {matches(cell.date).slice(0,2).map(event=><small key={event.id} className="asteria-calendar-event-mark">{event.title}</small>)}
    {celestial(cell.date).slice(0,1).map(event=><small key={event.id} className="asteria-calendar-event-mark">{event.title}</small>)}
   </button>:<span key={index} aria-hidden="true"/>)}
  </div>:<div className="asteria-calendar-actions"><label>Select day<input type="number" min="1"
   max={calendarMonthDays(c,year,month)} value={chosen} onChange={e=>setSelection(Number(e.target.value)||1)}/></label></div>}
  {mode!=='year'?<div className="asteria-calendar-selected">
   <strong>{formatAsteriaDate(dayDate,c,{time:false})}</strong>
   {matches(dayDate).map(e=><p key={e.id}>{e.title}</p>)}
   {celestial(dayDate).map(e=><p key={e.id}>{e.title}</p>)}
   {calendarMoonPhases(dayDate,c).map(moon=><p key={moon.name}>{moon.name}: {moon.phase}</p>)}
  </div>:null}
 </section>;
}
