import React,{useEffect,useState} from 'react';
import {
  HYBRID_SESSION_MODES,HYBRID_SESSION_MAX_VIEWERS,hybridViewerId,
  sessionTimestampMs
} from '../../state/hybridPresentationSessionModel.mjs';
import {useCampaignStream} from './CampaignMapWorkspace.jsx';
import {PresentationMediaFrame} from './PresentationMediaFrame.jsx';
import {CampaignMapCanvas} from './CampaignMapWorkspace.jsx';
import {PRESENTATION_MEDIA_SCENES} from '../../state/presentationAssetModel.mjs';
import styles from './HybridSessionManager.module.css';
import {usePresentationDisplayRuntime} from './usePresentationDisplayRuntime.js';

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
    <p className={styles.note}>Restricted viewers receive approved
      presentation text, selected media, published battle maps and a
      redacted combat status. Party details and GM-private combat data
      are never shared.</p>
  </section>;
}
function RestrictedCombatScene({api,campaignId,active}){
  const result=useCampaignStream(api,'watchRestrictedCombat',[campaignId],active);
  if(!active)return null;
  if(result.error)return <p role="alert">{result.error}</p>;
  if(result.loading)return <p role="status">Synchronising safe combat status…</p>;
  const status=result.data||{};
  return <section className={styles.textScene} data-testid="site-restricted-combat">
    <h2>Combat</h2>
    <p>{status.active?'Round '+status.round:'No active encounter'}</p>
    <p>{status.current||'GM turn'}</p>
    {status.event?.name?<p>{status.event.name}</p>:null}
  </section>;
}
function RestrictedBattleMapScene({api,campaignId,mapId,active,camera}){
  const result=useCampaignStream(api,'watchRestrictedMap',
    [campaignId,mapId||''],active&&Boolean(mapId));
  if(!active)return null;
  if(result.error)return <p role="alert">{result.error}</p>;
  if(result.loading)return <p role="status">Synchronising the published battle map…</p>;
  return result.data?<CampaignMapCanvas api={api} campaignId={campaignId}
    map={result.data} mode="player" restricted camera={camera}/>:
    <p role="status">The selected battle map is unavailable.</p>;
}

function ActiveRestrictedPresentation({api,campaignId}){
  const viewer=useCampaignStream(api,'watchRestrictedViewer',[campaignId]);
  const scene=viewer.data||{scene:'blank',theme:'obsidian',title:'',subtitle:''};
  if(viewer.error)return <p role="alert">{viewer.error}</p>;
  if(viewer.loading)return <p role="status">Verifying your private viewer invitation…</p>;
  return <div data-theme={scene.theme} className={styles.content}
    data-testid="site-restricted-stage">
    {scene.scene==='title'?<div className={styles.textScene}>
      <h2>{scene.title}</h2><p>{scene.subtitle}</p>
    </div>:scene.scene==='battle-map'?
      <RestrictedBattleMapScene api={api} campaignId={campaignId}
        mapId={scene.mapId} active camera={scene.mapCamera}/>:
    scene.scene==='combat'?
      <RestrictedCombatScene api={api} campaignId={campaignId} active/>:
    PRESENTATION_MEDIA_SCENES.includes(scene.scene)?
      <PresentationMediaFrame api={api} campaignId={campaignId} restricted
        scene={scene.scene} assetId={scene.assetId}
        title={scene.title} subtitle={scene.subtitle}/>:
      <p role="status">Display is blacked out.</p>}
  </div>;
}
export function RestrictedPresentationDisplay({api,campaignId}){
  const runtime=usePresentationDisplayRuntime();
  return <section ref={runtime.root} className={styles.display}
    data-asteria-restricted-presentation="" data-testid="site-restricted-presentation">
    <header><strong>Asteria · Restricted Presentation</strong>
      <div className={styles.controls}>
        <span role="status">{!runtime.online?'Offline · display paused':
          !runtime.visible?'Display paused':'Private live display'}</span>
        <button type="button" disabled={!runtime.ready}
          onClick={runtime.reconnect}>Reconnect</button>
        <button type="button" onClick={runtime.toggleFullscreen}>
          {runtime.fullscreen?'Exit Fullscreen':'Fullscreen'}</button>
      </div>
    </header>
    {!runtime.ready?<p role="alert">Connection or display interrupted.
      Private content is hidden until your invitation is verified again.</p>:
      <ActiveRestrictedPresentation key={campaignId+':'+runtime.generation}
        api={api} campaignId={campaignId}/>}
    {runtime.error?<p role="alert">{runtime.error}</p>:null}
  </section>;
}
