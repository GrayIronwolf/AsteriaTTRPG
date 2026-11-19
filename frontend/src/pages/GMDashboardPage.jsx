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
import styles from './GMDashboardPage.module.css';

function Resource({label,value}) {
  return <span className={styles.resource}>{label}: {Array.isArray(value)
    ? value[0]+' / '+value[1] : '—'}</span>;
}
function Party({party}) {
  return <div className={styles.party} data-testid="site-gm-party">
    {party.length===0?<BodyText muted>No linked characters in this campaign yet.</BodyText>:
    party.map(character=><article className={styles.person} key={character.id}>
      <h3>{character.name}</h3>
      <small>Level {character.level} {character.className}</small>
      <div className={styles.resources}>
        <Resource label="HP" value={character.hp}/>
        <Resource label="SP" value={character.sp}/>
        <Resource label="MP" value={character.mp}/>
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
    <div className={styles.head}>
      <div><Eyebrow>GM Dashboard · {snapshot.role}</Eyebrow>
        <Heading as="h2">{snapshot.campaign.name}</Heading>
        <BodyText muted>{snapshot.campaign.description||'Manage your campaign session and party.'}</BodyText>
      </div>
      <CrystalButton href="#/dashboard">All Campaigns</CrystalButton>
    </div>
    <div className={styles.summary}>
      <SurfacePanel className={styles.metric}><strong>{snapshot.party.length}</strong><span>Linked Characters</span></SurfacePanel>
      <SurfacePanel className={styles.metric}><strong>{snapshot.campaign.partySize}</strong><span>Party Capacity</span></SurfacePanel>
      <SurfacePanel className={styles.metric}><strong>{live.status}</strong><span>Session Status</span></SurfacePanel>
    </div>
    <nav aria-label="GM dashboard sections" className={styles.tabs}>
      {['overview','party','session',...(combatEnabled?['combat']:[]),...(progressionEnabled?['checks-progression']:[]),...(mediaEnabled?['battle-maps','presentation']:[])].map(item=><button key={item} type="button"
        className={tab===item?styles.selected:''} aria-current={tab===item?'page':undefined}
        onClick={()=>setTab(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}
    </nav>
    {error?<p role="alert" className={styles.notice}>{error}</p>:null}
    {message?<p role="status" className={styles.notice}>{message}</p>:null}
    {(tab==='overview'||tab==='session')?<LiveSession session={live} loading={loading} busy={busy} onRun={run}/>:null}
    {(tab==='overview'||tab==='party')?<SurfacePanel className={styles.panel} as="section">
      <h2>Party Overview</h2>
      <Party party={snapshot.party}/>
    </SurfacePanel>:null}
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
    {progressionEnabled&&tab==='checks-progression'?<GMChecksAndProgression
      key={uid+':'+campaignId} api={api.progression} campaignId={campaignId}/>:null}
    {mediaEnabled&&tab==='battle-maps'?<CampaignMapWorkspace key={uid+':'+campaignId}
      api={api.media} campaignId={campaignId} role="gm"/>:null}
    {mediaEnabled&&tab==='presentation'?<CampaignPresentationController
      key={uid+':'+campaignId} api={api.media} campaignId={campaignId}
      party={snapshot.party}/>:null}
    <SurfacePanel className={styles.panel} as="aside">
      <h2>GM Workspace</h2>
      <BodyText muted>Campaign settings and character-link approval stay in Campaign Forge.
        Inventory, trading, crafting and remaining Digital GM tools migrate in later phases. No legacy panels are mounted here.</BodyText>
      {snapshot.role==='owner'?<CrystalButton href="#/campaign-forge">Manage Campaign</CrystalButton>:
        <BodyText muted>Owner-only campaign settings are unavailable to Co-GMs.</BodyText>}
    </SurfacePanel>
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
    <Heading id="site-gm-title">GM Dashboard</Heading>
    {campaignId?<CampaignGM key={uid+':'+campaignId} uid={uid} campaignId={campaignId} api={api}/>:
      <CampaignPicker key={uid} api={api} uid={uid}/>}
  </PageLayout>;
}
