import React,{useEffect,useState} from 'react';
import {
  HYBRID_SESSION_MODES,HYBRID_SESSION_MAX_VIEWERS,hybridViewerId,
  sessionTimestampMs
} from '../../../src/state/hybridPresentationSessionModel.mjs';
import {useCampaignStream} from './CampaignMapWorkspace.jsx';
import styles from './HybridSessionManager.module.css';

export function HybridSessionManager({api,campaignId}){
  const result=useCampaignStream(api,'watchGMHybridSession',[campaignId]);
  const state=result.data?.session||{revision:0,status:'closed'};
  const grants=(result.data?.grants||[]).filter(row=>row.epoch===state.epoch);
  const [mode,setMode]=useState('hybrid'),[duration,setDuration]=useState(120),
    [uid,setUid]=useState(''),[grantMinutes,setGrantMinutes]=useState(60),
    [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),
    [error,setError]=useState('');
  useEffect(()=>{setUid('');setError('');setNotice('');},[campaignId]);
  const run=async(type,extra={})=>{
    if(busy||result.loading||result.error)return;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await api.manageHybridSession(campaignId,{
        type,expectedRevision:state.revision||0,...extra
      });
      setNotice(type==='grant'?'Restricted access granted to the selected account.':
        type==='revoke'?'Viewer revoked.':
        type==='open'?'Hybrid viewer session opened.':
        'Hybrid viewer session closed.');
      if(response.ok!==true)throw Error(response.error||'Session update failed.');
      if(type==='grant')setUid('');
    }catch(e){setNotice('');setError(e?.message||'Session update failed.');}
    finally{setBusy(false);}
  };
  const link=window.location.origin+window.location.pathname+window.location.search+
    '#/react/presentation/'+encodeURIComponent(campaignId)+'?viewer=restricted';
  const open=state.status==='open'&&sessionTimestampMs(state.expiresAt)>Date.now();
  return <section className={styles.panel} data-testid="site-gm-hybrid-session">
    <h3>Hybrid Session &amp; Restricted Viewers</h3>
    <p>Invite an authenticated account to a temporary presentation-only screen.
      Invited viewers cannot access campaign dashboards, maps, combat, party records
      or media files through this permission.</p>
    {result.loading?<p role="status">Checking GM viewer permissions…</p>:null}
    {result.error?<p role="alert">{result.error}</p>:null}
    <p role="status">Status: {open?'Open':state.status||'Closed'} ·
      {open?' Expires '+new Date(sessionTimestampMs(state.expiresAt)).toLocaleString():''}
    </p>
    {!open?<div className={styles.fields}>
      <label>Session format<select value={mode} disabled={busy}
        onChange={e=>setMode(e.target.value)}>
        {HYBRID_SESSION_MODES.map(value=><option key={value} value={value}>
          {value}</option>)}
      </select></label>
      <label>Session duration (minutes)<input type="number" min="15" max="600"
        value={duration} disabled={busy} onChange={e=>setDuration(Number(e.target.value))}/>
      </label>
      <button type="button" disabled={busy||result.loading||!!result.error}
        onClick={()=>run('open',{mode,durationMinutes:duration})}>
        Open Hybrid Viewer Session</button>
    </div>:<div className={styles.fields}>
      <label>Authenticated viewer UID<input value={uid} maxLength={128}
        disabled={busy} onChange={e=>setUid(e.target.value.trim())}
        placeholder="Exact Firebase account UID"/></label>
      <label>Access duration (minutes)<input type="number" min="15" max="600"
        value={grantMinutes} disabled={busy}
        onChange={e=>setGrantMinutes(Number(e.target.value))}/></label>
      <button type="button" disabled={busy||!hybridViewerId(uid)||
        grants.length>=HYBRID_SESSION_MAX_VIEWERS||!!result.error}
        onClick={()=>run('grant',{uid,durationMinutes:grantMinutes})}>
        Grant Restricted Viewer Access</button>
      <button type="button" disabled={busy||!!result.error}
        onClick={()=>{
          if(window.confirm('Close this viewer session and revoke all its grants?'))
            run('close');
        }}>Close &amp; Revoke Session</button>
      <label>Restricted viewer link<input value={link} readOnly
        onFocus={e=>e.target.select()}/></label>
      <p>Sharing a link alone does not grant access. Each recipient must sign
        in using the exact UID approved above.</p>
    </div>}
    {grants.length?<div className={styles.grants}>
      <h4>Viewer grants ({grants.length} / {HYBRID_SESSION_MAX_VIEWERS})</h4>
      {grants.map(row=><div className={styles.grant} key={row.uid}>
        <span>{row.uid} · {row.status} ·
          {' '}Until {new Date(sessionTimestampMs(row.expiresAt)).toLocaleString()}</span>
        {open&&row.status==='active'?<button type="button" disabled={busy}
          onClick={()=>run('revoke',{uid:row.uid})}>Revoke</button>:null}
      </div>)}
    </div>:null}
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
    <p className={styles.note}>Phase 7.2 restricted viewers receive only
      approved title and announcement text; maps, media and combat scenes display
      a blackout until later phases establish secure viewer-specific delivery.</p>
  </section>;
}
export function RestrictedPresentationDisplay({api,campaignId}){
  const viewer=useCampaignStream(api,'watchRestrictedViewer',[campaignId]);
  const [message,setMessage]=useState('');
  const scene=viewer.data||{scene:'blank',theme:'obsidian',title:'',subtitle:''};
  const fullscreen=async()=>{
    try{await document.querySelector('[data-asteria-restricted-presentation]')
      ?.requestFullscreen?.();}
    catch(e){setMessage(e?.message||'Fullscreen unavailable.');}
  };
  return <section className={styles.display} data-theme={scene.theme}
    data-asteria-restricted-presentation="" data-testid="site-restricted-presentation">
    <header><strong>Asteria · Restricted Presentation</strong>
      <button type="button" onClick={fullscreen}>Fullscreen</button></header>
    {viewer.loading?<p role="status">Checking your private viewer invitation…</p>:null}
    {viewer.error?<p role="alert">{viewer.error}</p>:
      scene.scene==='title'?<div className={styles.textScene}>
        <h2>{scene.title}</h2><p>{scene.subtitle}</p>
      </div>:!viewer.loading?<p role="status">Display is blacked out.</p>:null}
    {message?<p role="alert">{message}</p>:null}
  </section>;
}
