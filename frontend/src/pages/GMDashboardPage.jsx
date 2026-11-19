import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth/AuthProvider.jsx';
import {isVerifiedOwnedSession} from '../auth/accountSecurityPolicy.mjs';
import {useAppServices} from '../app/AppServices.jsx';
import {PageLayout} from '../components/ui/PageLayout.jsx';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import {Eyebrow,Heading,BodyText} from '../components/ui/Typography.jsx';
import {gmSessionCommands} from '../dashboard/gmDashboardModel.mjs';
import {DashboardLayoutManager} from '../layout/DashboardLayoutManager.jsx';
import {CampaignMapWorkspace} from '../dashboard/CampaignMapWorkspace.jsx';
import {CampaignPresentationController} from '../dashboard/CampaignPresentationWorkspace.jsx';
import {GMCombatWorkspace} from '../combat/CombatWorkspace.jsx';
import {GMChecksAndProgression} from '../progression/ProgressionWorkspace.jsx';
import {GMEconomyWorkspace} from '../economy/EconomyWorkspace.jsx';
import {GMDigitalGMWorkspace} from '../digitalGM/DigitalGMWorkspace.jsx';
import styles from './GMDashboardPage.module.css';

function ResourceMeter({label,value}) {
  const current=Array.isArray(value)?Number(value[0])||0:0;
  const maximum=Array.isArray(value)?Math.max(0,Number(value[1])||0):0;
  const percent=maximum?Math.min(100,Math.max(0,current/maximum*100)):0;
  return <div className={styles.resourceMeter} data-resource={label.toLowerCase()}>
    <div><span>{label}</span><strong>{maximum?current+' / '+maximum:'—'}</strong></div>
    <div className={styles.meter} role="progressbar" aria-label={label+' resources'}
      aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={Math.max(0,Math.min(current,maximum))}>
      <span className={styles.meterFill} style={{width:percent+'%'}}/>
    </div>
  </div>;
}
function Party({party}) {
  return <div className={styles.party} data-testid="site-gm-party">
    {party.length===0?<BodyText muted>No linked characters in this campaign yet.</BodyText>:
    party.map(character=><article className={styles.person} key={character.id}>
      <div className={styles.personIdentity}>
        {character.image?<img src={character.image} alt="" loading="lazy"/>:<div className={styles.personFallback} aria-hidden="true">{character.name.charAt(0)}</div>}
        <div><h3>{character.name}</h3><small>Level {character.level} {character.className}</small></div>
      </div>
      <div className={styles.resources}>
        <ResourceMeter label="HP" value={character.hp}/>
        <ResourceMeter label="SP" value={character.sp}/>
        <ResourceMeter label="MP" value={character.mp}/>
      </div>
    </article>)}
  </div>;
}

function CampaignPicker({api,uid}) {
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),
    [error,setError]=useState('');
  const seq=useRef(0);
  useEffect(()=>{
    const token=++seq.current;
    let active=true;
    setItems([]);setError('');setLoading(true);
    api.list().then(rows=>{if(active&&seq.current===token)setItems(rows);})
      .catch(err=>{if(active&&seq.current===token)setError(err.message||'Unable to load campaigns.');})
      .finally(()=>{if(active&&seq.current===token)setLoading(false);});
    return ()=>{active=false;++seq.current;};
  },[api,uid]);
  return <>
    <SurfacePanel className={styles.panel}>
      <h2>Your GM campaigns</h2>
      {loading?<BodyText>Checking server-owned campaigns…</BodyText>:null}
      {error?<p role="alert">{error}</p>:null}
      {!loading && !error && !items.length ? <BodyText muted>No owned campaigns found. Co-GMs may open an existing campaign link.</BodyText>:null}
      <div className={styles.cards}>
        {items.map(item=><article className={styles.person} key={item.id}>
          <h3>{item.name}</h3><small>{item.role} · {item.membershipSchemaVersion===2?'v2':'Legacy v1'}</small>
          <p>{item.description||'Campaign ready for your next session.'}</p>
          <CrystalButton href={'#/react/gm/'+encodeURIComponent(item.id)}
            data-testid="site-gm-open">Open GM Dashboard</CrystalButton>
        </article>)}
      </div>
    </SurfacePanel>
    <CrystalButton href="#/campaign-forge">Open Campaign Forge</CrystalButton>
  </>;
}

function LiveSession({session,loading,busy,onRun}) {
  const commands=gmSessionCommands(session);
  return <SurfacePanel className={styles.panel} as="section">
    <div className={styles.sectionHeader}>
      <h2>Live Session</h2>
      <strong data-testid="site-gm-session-status" className={styles.status}>{session.status.toUpperCase()}</strong>
    </div>
    <BodyText muted>{session.id?'Session: '+session.id:'No session is currently running.'}</BodyText>
    <div className={styles.actions}>
      {commands.includes('start')?<CrystalButton variant="primary" disabled={busy||loading}
        data-testid="site-gm-session-start" onClick={()=>onRun('start')}>
        {session.status==='paused'?'Resume Session':'Start Session'}
      </CrystalButton>:null}
      {commands.includes('pause')?<CrystalButton disabled={busy||loading}
        data-testid="site-gm-session-pause" onClick={()=>onRun('pause')}>Pause Session</CrystalButton>:null}
      {commands.includes('end')?<CrystalButton disabled={busy||loading}
        data-testid="site-gm-session-end" onClick={()=>onRun('end')}>End Session</CrystalButton>:null}
    </div>
  </SurfacePanel>;
}

function CampaignGM({api,uid,campaignId}) {
  const [snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false),[tab,setTab]=useState('overview');
  const mediaEnabled=api.media?.availability().enabled===true;
  const combatEnabled=api.combat?.availability().enabled===true;
  const progressionEnabled=api.progression?.availability().enabled===true;
  const economyEnabled=api.economy?.availability().enabled===true;
  const digitalGMEnabled=api.digitalGM?.availability().enabled===true;
  const scope=useRef(0);
  useEffect(()=>{
    const token=++scope.current;
    setSnapshot(null);setLoading(true);setError('');setMessage('');setBusy(false);setTab('overview');
    const close=api.watch(campaignId,data=>{
      if(scope.current!==token)return;
      setSnapshot(data);setLoading(false);
    },err=>{
      if(scope.current!==token)return;
      setSnapshot(null);setLoading(false);
      setError(err.message||'GM access could not be verified.');
    });
    return ()=>{++scope.current;close();};
  },[api,campaignId,uid]);
  const run=async action=>{
    if(busy||!snapshot||loading)return;
    if(action==='end'&&!window.confirm('End the current live session?'))return;
    const token=scope.current;
    setBusy(true);setMessage('');setError('');
    try{
      await api.sessionCommand(campaignId,action);
      if(scope.current===token)setMessage('Session action saved to Firebase.');
    }catch(err){
      if(scope.current===token)setError(err.message||'Session action failed.');
    }finally{
      if(scope.current===token)setBusy(false);
    }
  };
  if(loading)return <SurfacePanel className={styles.panel}>
    <BodyText>Verifying GM membership and connecting to campaign data…</BodyText>
  </SurfacePanel>;
  if(error&&!snapshot)return <SurfacePanel className={styles.panel}>
    <p role="alert" data-testid="site-gm-error">{error}</p>
    <CrystalButton href="#/dashboard">Back to campaigns</CrystalButton>
  </SurfacePanel>;
  if(!snapshot)return null;
  const live=snapshot.session;
  return <>
    <div className={styles.gmHero}>
      {snapshot.campaign.image?<img className={styles.gmHeroImage} src={snapshot.campaign.image} alt="" loading="lazy"/>:null}
      <div className={styles.head}>
      <div><Eyebrow>GM Dashboard · {snapshot.role}</Eyebrow>
        <Heading as="h2">{snapshot.campaign.name}</Heading>
        <BodyText muted>{snapshot.campaign.description||'Manage your campaign session and party.'}</BodyText>
      </div>
      <CrystalButton href="#/dashboard">All Campaigns</CrystalButton>
      </div>
    </div>
    <div className={styles.summary}>
      <SurfacePanel className={styles.metric}><strong>{snapshot.party.length}</strong><span>Linked Characters</span></SurfacePanel>
      <SurfacePanel className={styles.metric}><strong>{snapshot.campaign.partySize}</strong><span>Party Capacity</span></SurfacePanel>
      <SurfacePanel className={styles.metric}><strong>{live.status}</strong><span>Session Status</span></SurfacePanel>
    </div>
    <div className={styles.gmWorkspaceColumns}>
      <aside className={styles.partySidebar} aria-label="Player resources">
        <h2>Player Resources</h2>
        <Party party={snapshot.party}/>
      </aside>
      <div className={styles.gmWorkspaceMain}>
    <nav aria-label="GM dashboard sections" className={styles.tabs}>
      {['overview','party','session',...(combatEnabled?['combat']:[]),...(progressionEnabled?['checks-progression']:[]),...(economyEnabled?['inventory-loot-crafting']:[]),...(digitalGMEnabled?['digital-gm-toolkit']:[]),...(mediaEnabled?['battle-maps','presentation']:[])].map(item=><CrystalButton key={item} type="button" size="compact" active={tab===item}
        onClick={()=>setTab(item)}>{item[0].toUpperCase()+item.slice(1)}</CrystalButton>)}
    </nav>
    {error?<p role="alert" className={styles.notice}>{error}</p>:null}
    {message?<p role="status" className={styles.notice}>{message}</p>:null}
    {(tab==='overview'||tab==='session')?<LiveSession session={live} loading={loading} busy={busy} onRun={run}/>:null}
    {api.availability().layoutEnabled?
      <DashboardLayoutManager role="gm" api={api} uid={uid} campaignId={campaignId}
        renderPanel={id=>{
          if(id==='partySummary')return <Party party={snapshot.party}/>;
          if(id==='encounter')return combatEnabled?
            <button type="button" onClick={()=>setTab('combat')}>
              Open Combat · Session {live.status}
            </button>:
            <p>Session: {live.status}. Combat commands migrate in Phase 7.</p>;
          if(id==='restRequests')return <p>Rest requests migrate in Phase 7.</p>;
          if(id==='xp')return progressionEnabled?<button type="button" onClick={()=>setTab('checks-progression')}>
            Open XP &amp; Check Requests</button>:<p>XP distribution migrates in Phase 7.</p>;
          return null;
        }}/>
      :null}
    {combatEnabled&&tab==='combat'?<GMCombatWorkspace
      key={uid+':'+campaignId} api={api.combat} campaignId={campaignId}/>:null}
    {digitalGMEnabled&&tab==='digital-gm-toolkit'?<GMDigitalGMWorkspace
      key={uid+':'+campaignId} api={api.digitalGM} campaignId={campaignId}/>:null}
    {economyEnabled&&tab==='inventory-loot-crafting'?<GMEconomyWorkspace
      key={uid+':'+campaignId} api={api.economy} campaignId={campaignId}/>:null}
    {progressionEnabled&&tab==='checks-progression'?<GMChecksAndProgression
      key={uid+':'+campaignId} api={api.progression} campaignId={campaignId}/>:null}
    {mediaEnabled&&tab==='battle-maps'?<CampaignMapWorkspace key={uid+':'+campaignId}
      api={api.media} campaignId={campaignId} role="gm"/>:null}
    {mediaEnabled&&tab==='presentation'?<CampaignPresentationController
      key={uid+':'+campaignId} api={api.media} campaignId={campaignId}
      party={snapshot.party}/>:null}
    </div>
    </div>
  </>;
}

/** New React/Vite route owner for #/dashboard and #/react/gm/{campaignId}. */
export function GMDashboardPage({route}) {
  const {session}=useAuth(),services=useAppServices();
  const api=services.get('gameplay');
  const uid=isVerifiedOwnedSession(session)?session.user.uid:null;
  const campaignId=route.params?.campaignId||'';
  if(!uid||!api)return <PageLayout as="section" width="reading" labelledBy="site-gm-title">
    <Heading id="site-gm-title">GM Dashboard</Heading>
    <BodyText>Sign in with a verified account to open your GM workspace.</BodyText>
    <CrystalButton href="#/account/login">Login</CrystalButton>
  </PageLayout>;
  return <PageLayout as="section" width="wide" className={styles.page}
    labelledBy="site-gm-title" data-testid="site-gm-dashboard">
    <Heading id="site-gm-title" className={styles.visuallyHidden}>GM Dashboard</Heading>
    {campaignId?<CampaignGM key={uid+':'+campaignId} uid={uid} campaignId={campaignId} api={api}/>:
      <CampaignPicker key={uid} api={api} uid={uid}/>}
  </PageLayout>;
}
