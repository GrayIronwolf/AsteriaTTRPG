import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth/AuthProvider.jsx';
import {isVerifiedOwnedSession} from '../auth/accountSecurityPolicy.mjs';
import {useAppServices} from '../app/AppServices.jsx';
import {PageLayout} from '../components/ui/PageLayout.jsx';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import {ForgedBadge} from '../components/ui/ForgedBadge.jsx';
import {Eyebrow,Heading,BodyText} from '../components/ui/Typography.jsx';
import {gmSessionCommands} from '../dashboard/gmDashboardModel.mjs';
import {DashboardLayoutManager} from '../layout/DashboardLayoutManager.jsx';
import {GMOverviewPanel} from '../dashboard/GMOverviewPanels.jsx';
import {GMPartyManagement} from '../dashboard/GMPartyManagement.jsx';
import {GMQuestManagement} from '../dashboard/GMQuestManagement.jsx';
import {GMCampaignManagement} from '../dashboard/GMCampaignManagement.jsx';
import {GMNotesManagement} from '../dashboard/GMNotesManagement.jsx';
import {GMInformationManagement} from '../dashboard/GMInformationManagement.jsx';
import {GMNpcCreatureWorkspace} from '../dashboard/GMNpcCreatureWorkspace.jsx';
import {GMWorldSystemsWorkspace} from '../dashboard/GMWorldSystemsWorkspace.jsx';
import {GMToolkitWorkspace,GMToolkitQuickAccess} from '../dashboard/GMToolkitWorkspace.jsx';
import {CampaignMapWorkspace,CampaignAtlasWorkspace} from '../dashboard/CampaignMapWorkspace.jsx';
import {CampaignPresentationController} from '../dashboard/CampaignPresentationWorkspace.jsx';
import {GMMediaLibrary} from '../dashboard/GMMediaLibrary.jsx';
import {GMCombatWorkspace} from '../combat/CombatWorkspace.jsx';
import {GMChecksAndProgression} from '../progression/ProgressionWorkspace.jsx';
import {GMEconomyWorkspace} from '../economy/EconomyWorkspace.jsx';
import {GMDigitalGMWorkspace} from '../digitalGM/DigitalGMWorkspace.jsx';
import {AdvancedDiceWorkspace} from '../dice/AdvancedDiceWorkspace.jsx';
import styles from './GMDashboardPage.module.css';

const GM_TABS=Object.freeze([
  {id:'main',label:'GM Main'},
  {id:'toolkit',label:'GM Toolkit'},
  {id:'bestiary',label:'NPC & Creature Library'},
  {id:'settings',label:'Dashboard Settings'},
  {id:'inventory',label:'PC Inventory'},
  {id:'information',label:'News & Events'},
  {id:'quests',label:'Quests'},
  {id:'notes',label:'GM Notes'},
  {id:'session-library',label:'Session Library',area:'archives'},
  {id:'soundboard',label:'Soundboard & Ambience',area:'audio'},
  {id:'session-recordings',label:'Session Recordings',area:'recordings'},
  {id:'presentation',label:'Player Display'},
  {id:'media-library',label:'Media Library'},
  {id:'economy',label:'Economy'},
  {id:'crafting',label:'Crafting'},
  {id:'tools',label:'GM Tools',area:'tables'},
  {id:'gameplay',label:'Gameplay Systems'},
  {id:'world',label:'World Systems'},
  {id:'battle-maps',label:'Battle Maps'},
  {id:'advanced-dice',label:'Advanced Dice'},
  {id:'random-tables',label:'Random Tables',area:'tables'},
  {id:'encounter-rewards',label:'Encounter Generator',area:'tables'},
  {id:'asteria-calendar',label:'Asteria Calendar',area:'calendar'},
  {id:'weather-environment',label:'Weather Generator',area:'weather'},
  {id:'world-atlas',label:'World Atlas'}
]);
const GM_TOOL_AREAS=Object.fromEntries(GM_TABS.filter(tab=>tab.area)
  .map(tab=>[tab.id,tab.area]));

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
        <div><h3>{character.name}</h3><small>{character.className}</small></div>
        <ForgedBadge kind="level" label="Level" value={character.level} compact/>
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
  const [busy,setBusy]=useState(false),[tab,setTab]=useState('main');
  const [management,setManagement]=useState(null),[managementError,setManagementError]=useState('');
  const mediaEnabled=api.media?.availability().enabled===true;
  const combatEnabled=api.combat?.availability().enabled===true;
  const progressionEnabled=api.progression?.availability().enabled===true;
  const economyEnabled=api.economy?.availability().enabled===true;
  const digitalGMEnabled=api.digitalGM?.availability().enabled===true;
  const toolkitCapabilities={
    gm:true,
    digitalGM:digitalGMEnabled,
    economy:economyEnabled,
    progression:progressionEnabled,
    media:mediaEnabled,
    dice:api.dice?.availability().enabled===true,
    layout:api.availability().layoutEnabled===true
  };
  const gmTabIds=GM_TABS.map(item=>item.id);
  const scope=useRef(0);
  useEffect(()=>{
    const token=++scope.current;
    setSnapshot(null);setLoading(true);setError('');setMessage('');setBusy(false);setTab('main');
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
  useEffect(()=>{
    let active=true;
    setManagement(null);setManagementError('');
    const close=api.watchManagement(campaignId,data=>{
      if(!active)return;
      setManagement(data);setManagementError('');
    },err=>{
      if(!active)return;
      setManagement(null);setManagementError(err?.message||'GM campaign systems could not be loaded.');
    });
    return ()=>{active=false;close();};
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
  const manageCondition=async(characterId,input)=>{
    if(busy||!snapshot)return;
    setBusy(true);setError('');setMessage('');
    const token=scope.current;
    try{
      await api.manageCondition(campaignId,characterId,input);
      if(scope.current===token)setMessage('Condition updated.');
      return true;
    }catch(e){
      if(scope.current===token)setError(e?.message||'Condition update failed.');
      return false;
    }finally{
      if(scope.current===token)setBusy(false);
    }
  };
  const reviewRest=async(characterId,requestId,status)=>{
    if(busy||!snapshot)return;
    setBusy(true);setError('');setMessage('');
    const token=scope.current;
    try{
      await api.reviewRest(campaignId,characterId,requestId,status);
      if(scope.current===token)setMessage('Long Rest '+status+'.');
      return true;
    }catch(e){
      if(scope.current===token)setError(e?.message||'Rest review failed.');
      return false;
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
    <div className={styles.gmHero} data-testid="site-gm-hero">
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
      <aside className={styles.partySidebar} data-testid="site-gm-party-sidebar" aria-label="Player resources">
        <h2>Player Resources</h2>
        <Party party={snapshot.party}/>
      </aside>
      <div className={styles.gmWorkspaceMain}>
    <nav aria-label="GM dashboard sections" className={styles.tabs}>
      {GM_TABS.map(item=><CrystalButton key={item.id} type="button" size="compact" active={tab===item.id}
        onClick={()=>setTab(item.id)}>{item.label}</CrystalButton>)}
    </nav>
    {error?<p role="alert" className={styles.notice}>{error}</p>:null}
    {message?<p role="status" className={styles.notice}>{message}</p>:null}
    {tab==='main'?<><LiveSession session={live} loading={loading} busy={busy} onRun={run}/>
      <GMPartyManagement party={snapshot.party} campaignId={campaignId} session={live}
        busy={busy} onNavigate={setTab} onCondition={manageCondition}
        onReviewRest={reviewRest}/>
      <GMToolkitQuickAccess onNavigate={setTab} enabled={toolkitCapabilities} tabs={gmTabIds}/></>:null}
    {api.availability().layoutEnabled&&['main','settings'].includes(tab)?
      <DashboardLayoutManager role="gm" api={api} uid={uid} campaignId={campaignId}
        renderPanel={id=><GMOverviewPanel id={id} party={snapshot.party}
          session={live} onNavigate={setTab} onReviewRest={reviewRest}
          onCondition={manageCondition} busy={busy}
          available={{combat:combatEnabled,
            progression:progressionEnabled,economy:economyEnabled,digitalGM:digitalGMEnabled}}/>}/>
      :null}
    {['quests','tools','notes','information','toolkit'].includes(tab)&&managementError?<p role="alert">{managementError}</p>:null}
    {['quests','tools','notes','information','toolkit'].includes(tab)&&!management&&!managementError?
      <BodyText>Connecting to the private GM campaign workspace…</BodyText>:null}
    {tab==='quests'&&management?<GMQuestManagement api={api} campaignId={campaignId}
      workspace={management} party={snapshot.party} session={live}/>:null}
    {tab==='tools'&&management?<GMCampaignManagement api={api} campaignId={campaignId}
      campaign={snapshot.campaign} workspace={management}
      party={snapshot.party} session={live}/>:null}
    {tab==='notes'&&management?<GMNotesManagement api={api} campaignId={campaignId}
      workspace={management} session={live}/>:null}
    {tab==='information'&&management?<GMInformationManagement api={api}
      campaignId={campaignId} campaign={snapshot.campaign}
      workspace={management} party={snapshot.party}/>:null}
    {tab==='toolkit'&&management?<GMToolkitWorkspace
      session={live} party={snapshot.party} quests={management.quests}
      tabs={gmTabIds} enabled={toolkitCapabilities} onNavigate={setTab}/>:null}
    {tab==='bestiary'&&digitalGMEnabled?<GMNpcCreatureWorkspace
      api={api} campaignId={campaignId} party={snapshot.party}
      onNavigate={setTab}/>:null}
    {tab==='bestiary'&&!digitalGMEnabled?<SurfacePanel className={styles.panel}>
      <h2>NPC &amp; Creature Library</h2>
      <BodyText muted>The authenticated Digital GM service is not enabled for this campaign.</BodyText>
    </SurfacePanel>:null}
    {tab==='world'&&digitalGMEnabled?<GMWorldSystemsWorkspace
      api={api.digitalGM} campaignId={campaignId} onNavigate={setTab}/>:null}
    {tab==='world'&&!digitalGMEnabled?<SurfacePanel className={styles.panel}>
      <h2>World Systems</h2>
      <BodyText muted>The authenticated World Systems service is not enabled for this campaign.</BodyText>
    </SurfacePanel>:null}
    {digitalGMEnabled&&GM_TOOL_AREAS[tab]?<GMDigitalGMWorkspace
      key={uid+':'+campaignId+':'+tab} api={api.digitalGM} campaignId={campaignId}
      initialArea={GM_TOOL_AREAS[tab]}/>:null}
    {economyEnabled&&['inventory','economy','crafting'].includes(tab)?<GMEconomyWorkspace
      key={uid+':'+campaignId+':'+tab} api={api.economy} campaignId={campaignId}
      initialTab={tab==='inventory'?'Inventory':tab==='crafting'?'Crafting':'Party Loot'}/>:null}
    {combatEnabled&&tab==='gameplay'?<GMCombatWorkspace
      key={uid+':'+campaignId} api={api.combat} campaignId={campaignId}
      uid={uid} mediaApi={mediaEnabled?api.media:null} onNavigate={setTab}/>:null}
    {progressionEnabled&&tab==='gameplay'?<GMChecksAndProgression
      key={uid+':'+campaignId} api={api.progression} campaignId={campaignId}/>:null}
    {mediaEnabled&&tab==='battle-maps'?<CampaignMapWorkspace key={uid+':'+campaignId}
      api={api.media} campaignId={campaignId} role="gm"/>:null}
    {mediaEnabled&&tab==='world-atlas'?<CampaignAtlasWorkspace key={uid+':'+campaignId}
      api={api.media} campaignId={campaignId}/>:null}
    {mediaEnabled&&tab==='media-library'?<GMMediaLibrary
      key={uid+':'+campaignId} api={api.media} campaignId={campaignId}
      onNavigate={setTab}/>:null}
    {mediaEnabled&&tab==='presentation'?<CampaignPresentationController
      key={uid+':'+campaignId} api={api.media} campaignId={campaignId}
      uid={uid} party={snapshot.party} combatApi={combatEnabled?api.combat:null}
      onNavigate={setTab}/>:null}
    {tab==='advanced-dice'&&api.dice?.availability().enabled?
      <AdvancedDiceWorkspace api={api.dice} role="gm"/>:null}
    {tab==='advanced-dice'&&!api.dice?.availability().enabled?
      <p role="status">Advanced Dice are unavailable for this account.</p>:null}
    {((GM_TOOL_AREAS[tab]&&!digitalGMEnabled)||
      (['inventory','economy','crafting'].includes(tab)&&!economyEnabled)||
      (tab==='gameplay'&&!combatEnabled&&!progressionEnabled)||
      (['battle-maps','world-atlas','presentation','media-library'].includes(tab)&&!mediaEnabled))?
      <SurfacePanel className={styles.panel}>
        <h2>{GM_TABS.find(item=>item.id===tab)?.label}</h2>
        <BodyText muted>This campaign feature is not enabled for the current account or campaign.</BodyText>
      </SurfacePanel>:null}
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
  return <PageLayout as="section" width="wide" variant="workspace" className={styles.page}
    labelledBy="site-gm-title" data-testid="site-gm-dashboard">
    <Heading id="site-gm-title" className={styles.visuallyHidden}>GM Dashboard</Heading>
    {campaignId?<CampaignGM key={uid+':'+campaignId} uid={uid} campaignId={campaignId} api={api}/>:
      <CampaignPicker key={uid} api={api} uid={uid}/>}
  </PageLayout>;
}
