import React,{useEffect,useState} from 'react';
import {RestRequestsPanel} from './CharacterSystemsPanels.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {previewPreparedEncounterLoad} from '../state/preparedEncounterLoadModel.mjs';
import {formatAsteriaDate,sortedCalendarEntries} from '../state/asteriaCalendarModel.mjs';
import {orderWeatherReports,weatherLabel} from '../state/weatherEnvironmentModel.mjs';
import {gmCampaignMemberSummary} from '../state/gmCampaignRosterModel.mjs';

/** Live, campaign-authorized summaries of existing systems; no second data store. */
export function GMQuickRequests({campaignId,characters={},editable=false,onNavigate}){
  const [checks,setChecks]=useState([]),[error,setError]=useState('');
  useEffect(()=>{
    setChecks([]);setError('');
    if(!campaignId)return undefined;
    try{
      return firebaseService.subscribeUniversalChecks(campaignId,setChecks,{gm:true});
    }catch(failure){setError(failure.message||'Check requests are unavailable.');}
    return undefined;
  },[campaignId]);
  const pending=checks.filter(row=>['pending','requested','submitted','awaiting-gm','awaiting-review']
    .includes(row.status));
  const restCount=Object.values(characters).filter(character=>
    character.restState?.request?.status==='pending').length;
  return <div className="react-gm-quick-panel">
    <p className="react-help">{pending.length} check request(s) awaiting action · {restCount} pending rest(s)</p>
    {pending.slice(0,5).map(row=><div className="react-gm-quick-row" key={row.id}>
      <strong>{row.characterName||characters[row.characterId]?.name||'Character'}</strong>
      <span>{row.skill||row.characteristic||row.type||'Check'} · {row.status}</span>
    </div>)}
    <button type="button" onClick={()=>onNavigate('tools')}>Open Check Requests</button>
    <RestRequestsPanel campaignId={campaignId} characters={characters} editable={editable}/>
    {error?<p role="alert">{error}</p>:null}
  </div>;
}

export function GMQuickPreparedEncounters({api,campaignId,onNavigate}){
  const [data,setData]=useState(null),[error,setError]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    setData(null);setError('');setMessage('');
    if(!api||!campaignId||typeof api.watchGM!=='function')return undefined;
    try{return api.watchGM(campaignId,setData,err=>setError(err?.message||'Prepared encounters unavailable.'));}
    catch(err){setError(err?.message||'Prepared encounters unavailable.');}
    return undefined;
  },[api,campaignId]);
  const plans=(data?.preparedEncounters||[]).filter(row=>!row.archived);
  const load=async plan=>{
    if(!api||!data?.combat||busy)return;
    const preview=previewPreparedEncounterLoad(plan,data.combat,data.maps||[],data.pending);
    if(!preview.eligible){
      setMessage(preview.issues.join(' '));return;
    }
    const description='Stage '+plan.name+'? This replaces staged enemies ('+
      preview.stagedEnemies+') with '+preview.incomingEnemies+
      ' prepared enemies. '+preview.linkedPlayers+' linked player(s) stay in the encounter.';
    if(!window.confirm(description))return;
    setBusy(true);setMessage('');
    try{
      await api.loadPrepared(campaignId,plan.id,preview.combatRevision,preview.templateRevision);
      setMessage('Prepared encounter staged. Start combat from the Combat Command Centre.');
    }catch(err){setMessage(err?.message||'Could not load this prepared encounter.');}
    finally{setBusy(false);}
  };
  return <div className="react-gm-quick-panel" data-testid="gm-quick-prepared">
    <p className="react-help">{plans.length} saved active encounter(s)</p>
    <div className="react-gm-quick-list">
      {plans.slice(0,8).map(plan=><div className="react-gm-quick-row" key={plan.id}>
        <div><strong>{plan.name}</strong>
          <small>{(plan.enemies||[]).length} enemies · {(plan.waves||[]).length} waves</small></div>
        <button type="button" disabled={busy||!data?.combat}
          onClick={()=>load(plan)}>Load</button>
      </div>)}
      {!plans.length?<p>{data?'No prepared encounters yet.':'Connecting to prepared encounters…'}</p>:null}
    </div>
    <button type="button" onClick={()=>onNavigate('combat')}>Open Encounter Builder</button>
    {error?<p role="alert">{error}</p>:null}
    {message?<p role="status">{message}</p>:null}
  </div>;
}

export function GMQuickNotes({workspace={},saveSection,onNavigate}){
  const notes=workspace.notes||{privateNotes:'',sessionLogs:[]};
  const [text,setText]=useState(notes.privateNotes||''),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>setText(notes.privateNotes||''),[notes.privateNotes]);
  const save=async()=>{
    if(busy)return;
    setBusy(true);setMessage('Saving private notes…');
    try{
      const result=await saveSection('notes',{...notes,privateNotes:text});
      setMessage(result?.ok?'GM notes saved.':result?.error||'Could not save GM notes.');
    }catch(err){setMessage(err?.message||'Could not save GM notes.');}
    finally{setBusy(false);}
  };
  return <div className="react-gm-quick-panel" data-testid="gm-quick-notes">
    <label>Private GM notes
      <textarea className="react-gm-quick-notepad" value={text}
        onChange={event=>setText(event.target.value)}
        placeholder="Session reminders, NPC motivations and preparations…"/>
    </label>
    <div className="react-action-row">
      <button type="button" className="primary" disabled={busy} onClick={save}>Save Notes</button>
      <button type="button" onClick={()=>onNavigate('notes')}>Full GM Notes</button>
    </div>
    {message?<p role="status">{message}</p>:null}
  </div>;
}

export function GMQuickCalendarWeather({campaignId,onNavigate}){
  const [calendar,setCalendar]=useState(null),[entries,setEntries]=useState([]);
  const [reports,setReports]=useState([]),[error,setError]=useState('');
  useEffect(()=>{
    setCalendar(null);setEntries([]);setReports([]);setError('');
    if(!campaignId)return undefined;
    const stops=[];
    try{
      stops.push(firebaseService.subscribeAsteriaCalendar(campaignId,setCalendar,'gm'));
      stops.push(firebaseService.subscribeAsteriaCalendarEntries(campaignId,setEntries,'gm'));
      stops.push(firebaseService.subscribeWeatherReports(campaignId,setReports,'gm'));
    }catch(err){setError(err?.message||'Calendar or weather is unavailable.');}
    return ()=>stops.forEach(stop=>stop?.());
  },[campaignId]);
  const ready=Boolean(calendar?.definition&&calendar?.date);
  const upcoming=ready?sortedCalendarEntries(entries,calendar.definition).slice(0,4):[];
  const reportsSorted=orderWeatherReports(reports);
  const latest=reportsSorted.find(report=>report.status==='published')||null;
  const weather=latest?.forecast?.[0]||null;
  return <div className="react-gm-quick-panel" data-testid="gm-quick-calendar-weather">
    <p><strong>Campaign date:</strong> {ready?
      formatAsteriaDate(calendar.date,calendar.definition):'Calendar not configured'}</p>
    <p><strong>Weather:</strong> {weather?
      weatherLabel(weather.condition)+' · '+weatherLabel(weather.severity):
      'No published forecast'}</p>
    {upcoming.length?<ol className="react-gm-quick-events">
      {upcoming.map(row=><li key={row.id}>
        <strong>{row.title}</strong><span>{formatAsteriaDate(row.date,calendar.definition)}</span>
      </li>)}
    </ol>:<p className="react-help">No calendar events to preview.</p>}
    <div className="react-action-row">
      <button type="button" onClick={()=>onNavigate('asteria-calendar')}>Open Calendar</button>
      <button type="button" onClick={()=>onNavigate('weather-environment')}>Open Weather</button>
    </div>
    {error?<p role="alert">{error}</p>:null}
  </div>;
}

export function GMQuickSession({session={},presence={},events=[],characters={},onNavigate}){
  const online=Object.values(presence).filter(record=>record.state==='online');
  const recent=(Array.isArray(events)?events:[]).slice(-4).reverse();
  return <div className="react-gm-quick-panel" data-testid="gm-quick-session">
    <div className="react-gm-quick-stats">
      <div><span>Session</span><strong>{session.status||'Idle'}</strong></div>
      <div><span>Players connected</span><strong>{online.length}</strong></div>
      <div><span>Party characters</span><strong>{Object.keys(characters).length}</strong></div>
    </div>
    <h3>Recent activity</h3>
    {recent.length?<ul className="react-gm-quick-events">
      {recent.map((event,i)=><li key={event.id||i}>
        {event.type||event.title||'Campaign activity'}
      </li>)}
    </ul>:<p className="react-help">No recent activity recorded.</p>}
    <button type="button" onClick={()=>onNavigate('session-library')}>Open Session Library</button>
  </div>;
}

export function GMQuickReference({title,description,onNavigate,target,extra=null}){
  return <div className="react-gm-quick-panel">
    {description?<p>{description}</p>:null}
    {extra}
    <button type="button" onClick={()=>onNavigate(target)}>Open {title}</button>
  </div>;
}

/** Permission-safe canvas entry point, no independent membership listener. */
export function GMQuickPlayerManager({campaign={},characters={},members=null,rosterError='',onNavigate}){
  const report=gmCampaignMemberSummary({campaign,characters,members,rosterError});
  const summary=report.summary;
  return <div className="react-gm-quick-panel" data-testid="gm-quick-player-manager">
    <p className="react-help">Open the full Player Manager for accounts, approvals, linked characters and GM actions.</p>
    {report.state==='ready'?<div className="react-gm-quick-stats">
      <div><span>Active players</span><strong>{summary.activePlayers}</strong></div>
      <div><span>Active GMs</span><strong>{summary.activeGMs}</strong></div>
      <div><span>Linked characters</span><strong>{summary.linkedCharacters}</strong></div>
    </div>:<p role="status">{report.message||'Verifying membership...'}</p>}
    {summary?.unverifiedCharacters?<p role="status" className="react-help">
      {summary.unverifiedCharacters} character link(s) require verification.</p>:null}
    <button type="button" onClick={()=>onNavigate('player-manager')}>Open Player Manager</button>
  </div>;
}
