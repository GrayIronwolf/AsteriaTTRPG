import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '../auth/AuthProvider.jsx';
import {isVerifiedOwnedSession} from '../auth/accountSecurityPolicy.mjs';
import {useAppServices} from '../app/AppServices.jsx';
import {PageLayout} from '../components/ui/PageLayout.jsx';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import {Eyebrow,Heading,BodyText} from '../components/ui/Typography.jsx';
import {STATS} from '../forge/forgeModel.mjs';
import {DashboardLayoutManager} from '../layout/DashboardLayoutManager.jsx';
import {CampaignMapWorkspace,CampaignAtlasWorkspace} from '../dashboard/CampaignMapWorkspace.jsx';
import {PlayerCombatWorkspace} from '../combat/CombatWorkspace.jsx';
import {PlayerProgressionWorkspace,PlayerCheckRequests} from '../progression/ProgressionWorkspace.jsx';
import {PlayerEconomyWorkspace} from '../economy/EconomyWorkspace.jsx';
import {PlayerDigitalGMWorkspace} from '../digitalGM/DigitalGMWorkspace.jsx';
import styles from './PlayerDashboardPage.module.css';

const TABS=Object.freeze(['Overview','Character','Skills & Talents','Magic','Equipment','Quests','Journal']);
function StatPanel({record}){
  return <div className={styles.stats}>
    {STATS.map(key=><div className={styles.stat} key={key}>
      <small>{key.replace(/^\w/,s=>s.toUpperCase())}</small>
      <strong>{record.characteristics[key]??'—'}</strong>
    </div>)}
  </div>;
}
function Resources({character}){
  return <div className={styles.resources} data-testid="site-player-resources">
    {['hp','sp','mp'].map(key=>{
      const pair=character[key];
      return <div className={styles.resource} key={key}>
        <div><strong>{key.toUpperCase()}</strong><span>{pair?pair[0]+' / '+pair[1]:'Not recorded'}</span></div>
        <progress aria-label={key.toUpperCase()+' resources'} value={pair?Math.min(pair[0],pair[1]):0}
          max={pair?.[1]||1}/>
      </div>;
    })}
  </div>;
}
function ClassicPlayerHeader({character,campaign,owned}){
  const progress=character.xpMax>0?Math.min(100,Math.max(0,character.xp/character.xpMax*100)):0;
  return <section className={styles.classicHeader} aria-label="Character and campaign information">
    <div className={styles.portraitColumn}>
      {character.image?<img className={styles.heroImage} src={character.image} alt="" loading="eager"/>:
        <div className={styles.portraitFallback} aria-hidden="true">{character.name.charAt(0)}</div>}
      <div className={styles.portraitCaption}>
        <Heading as="h2">{character.name}</Heading>
        <Eyebrow>{owned?'Character Owner':'GM Read-only'}</Eyebrow>
        <p>{character.race} / {character.klass}</p>
        <p>Level {character.level}</p>
        <div className={styles.experience}><span>XP</span><span>{character.xp.toLocaleString()} / {character.xpMax?character.xpMax.toLocaleString():'—'}</span></div>
        <progress className={styles.xpBar} aria-label="Character experience" value={progress} max="100"/>
      </div>
    </div>
    <div className={styles.coreColumn}>
      <h3>Core Resources</h3>
      <Resources character={character}/>
      <h3>Characteristics</h3>
      <StatPanel record={character}/>
    </div>
    <div className={styles.campaignColumn} data-testid="site-player-campaign">
      {campaign?.image?<img className={styles.heroImage} src={campaign.image} alt="" loading="lazy"/>:
        <div className={styles.campaignFallback} aria-hidden="true">Asteria</div>}
      <div className={styles.campaignCaption}>
        <h3>{campaign?.name||'Private Character'}</h3>
        <p>{campaign?('Session: '+campaign.session.status):'No linked campaign'}</p>
        {campaign?.location?<p>Location: {campaign.location}</p>:null}
        {campaign?.inWorldDate?<p>Date: {campaign.inWorldDate}</p>:null}
        {campaign?.isGM?<CrystalButton size="compact" href={'#/react/gm/'+encodeURIComponent(campaign.id)}>GM Dashboard</CrystalButton>:null}
        {!campaign&&owned?<CrystalButton size="compact" href="#/campaign-invitation">Link to Campaign</CrystalButton>:null}
      </div>
    </div>
  </section>;
}
function Names({name,entries}){
  return <SurfacePanel className={styles.panel} as="section">
    <h3>{name}</h3>
    {entries.length?<ul className={styles.list}>{entries.map((value,i)=><li key={i}>{value}</li>)}</ul>:
      <BodyText muted>None recorded.</BodyText>}
  </SurfacePanel>;
}
function Sections({character,tab,owned}){
  if(tab==='Overview')return <>
    <div className={styles.overview}>
      <SurfacePanel className={styles.panel}><h3>Experience</h3>
        <p>Level {character.level} · XP {character.xp}{character.xpMax?' / '+character.xpMax:''}</p>
        <p>Talent Points: {character.tp} · Characteristic Points: {character.cp}</p>
      </SurfacePanel>
      <SurfacePanel className={styles.panel}><h3>Character</h3>
        <p>{character.race} · {character.klass}</p>
        <p>Natural Armour Class: {character.naturalAC??'Not recorded'}</p>
        <Names name="Active Conditions" entries={character.conditions}/>
      </SurfacePanel>
    </div>
  </>;
  if(tab==='Character')return <>
    <StatPanel record={character}/>
    <Names name="Racial Traits" entries={character.racialTraits}/>
    {owned&&character.backstory?<SurfacePanel className={styles.panel}>
      <h3>Personal History</h3><p className={styles.prose}>{character.backstory}</p>
    </SurfacePanel>:null}
  </>;
  if(tab==='Skills & Talents')return <div className={styles.overview}>
    <SurfacePanel className={styles.panel}><h3>Skills</h3>
      {character.skills.length?<ul className={styles.list}>{character.skills.map((s,i)=>
        <li key={i}>{s.name}{s.rank?' — '+s.rank:''}</li>)}</ul>:<BodyText muted>No skills recorded.</BodyText>}
    </SurfacePanel>
    <Names name="Class Talents" entries={character.talents}/>
  </div>;
  if(tab==='Magic')return <div className={styles.overview}>
    <Names name="Known Magic" entries={character.magic}/>
    <Names name="Known Spells" entries={character.spells}/>
  </div>;
  if(tab==='Equipment')return <div className={styles.overview}>
    {['inventory','equipment'].map(key=><SurfacePanel className={styles.panel} key={key}>
      <h3>{key==='inventory'?'Inventory':'Equipment'}</h3>
      {character[key].length?<ul className={styles.list}>{character[key].map((item,i)=>
        <li key={i}>{item.name}{item.quantity>1?' × '+item.quantity:''}</li>)}</ul>:
        <BodyText muted>No items recorded.</BodyText>}
    </SurfacePanel>)}
  </div>;
  if(tab==='Quests')return <SurfacePanel className={styles.panel}>
    <h3>Quest Log</h3>
    {character.quests.length?<ul className={styles.list}>{character.quests.map((quest,i)=>
      <li key={i}>{quest.name}</li>)}</ul>:<BodyText muted>No quests recorded on this character sheet.</BodyText>}
  </SurfacePanel>;
  if(tab==='Journal')return <SurfacePanel className={styles.panel}>
    <h3>Personal Journal</h3>
    {!owned?<BodyText muted>Only the character owner may read personal journal entries.</BodyText>:
      character.journal.length?<div className={styles.journal}>{character.journal.map((entry,i)=>
        <article key={i}><h4>{entry.title}</h4><p className={styles.prose}>{entry.content}</p></article>)}</div>:
        <BodyText muted>No journal entries recorded.</BodyText>}
  </SurfacePanel>;
  return null;
}
function Dashboard({api,media,combat,progression,economy,digitalGM,uid,campaignId='',characterId}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),
    [error,setError]=useState(''),[tab,setTab]=useState('Overview');
  const generation=useRef(0);
  useEffect(()=>{
    const token=++generation.current;
    setData(null);setLoading(true);setError('');setTab('Overview');
    const ok=value=>{if(generation.current!==token)return;setData(value);setLoading(false);};
    const fail=e=>{if(generation.current!==token)return;setData(null);
      setError(e?.message||'The character could not be connected.');setLoading(false);};
    let unsubscribe=()=>{};
    try{unsubscribe=campaignId?api.watchCampaign(campaignId,characterId,ok,fail):
      api.watchOwned(characterId,ok,fail);}
    catch(e){fail(e);}
    return ()=>{generation.current++;unsubscribe();};
  },[api,uid,campaignId,characterId]);
  if(loading)return <SurfacePanel className={styles.panel}>
    <BodyText>Verifying character ownership and connecting to Firebase…</BodyText>
  </SurfacePanel>;
  if(error||!data)return <SurfacePanel className={styles.panel}>
    <p role="alert" data-testid="site-player-error">{error||'Character is unavailable.'}</p>
    <CrystalButton href="#/character-forge">Back to Character Forge</CrystalButton>
  </SurfacePanel>;
  const ch=data.character,c=data.campaign;
  const combatEnabled=Boolean(c&&data.owner&&combat?.availability().enabled);
  const progressionEnabled=Boolean(c&&data.owner&&progression?.availability().enabled);
  const economyEnabled=Boolean(c&&data.owner&&economy?.availability().enabled);
  const digitalGMEnabled=Boolean(c&&digitalGM?.availability().enabled);
  return <>
    <ClassicPlayerHeader character={ch} campaign={c} owned={data.owner}/>
    <div className={styles.sessionStrip} role="status">
      {c?(c.session.editable?'Live editing enabled':'Session is not active. Gameplay actions are unavailable.'):'Unassigned character — link to a campaign to enable live gameplay.'}
      <CrystalButton href="#/character-forge" size="compact">Character Forge</CrystalButton>
    </div>
    <nav className={styles.tabs} aria-label="Character dashboard sections">
      {[...TABS.filter(x=>data.owner||x!=='Journal'),...(combatEnabled?['Combat']:[]),...(progressionEnabled?['Progression','Skills','Talents','Check History']:[]),...(economyEnabled?['Inventory & Trading']:[]),...(digitalGMEnabled?['Campaign World & Session']:[]),...(c&&media?.availability().enabled?['Battle Maps','World Atlas']:[])].map(value=><CrystalButton type="button" size="compact" key={value} active={tab===value}
        onClick={()=>setTab(value)}>{value}</CrystalButton>)}
    </nav>
    {digitalGMEnabled&&tab==='Campaign World & Session'?<PlayerDigitalGMWorkspace
      key={campaignId} api={digitalGM} campaignId={campaignId}/>:null}
    {economyEnabled&&tab==='Inventory & Trading'?<PlayerEconomyWorkspace
      key={campaignId+':'+characterId} api={economy} campaignId={campaignId} characterId={characterId}/>:null}
    {progressionEnabled&&tab==='Progression'?<PlayerProgressionWorkspace
      api={progression} campaignId={campaignId} characterId={characterId} section="progression"/>:null}
    {progressionEnabled&&tab==='Skills'?<PlayerProgressionWorkspace
      api={progression} campaignId={campaignId} characterId={characterId} section="skills"/>:null}
    {progressionEnabled&&tab==='Talents'?<PlayerProgressionWorkspace
      api={progression} campaignId={campaignId} characterId={characterId} section="talents"/>:null}
    {progressionEnabled?<PlayerCheckRequests key={campaignId+':'+characterId}
      api={progression} campaignId={campaignId} characterId={characterId}
      showHistory={tab==='Check History'}/>:null}
    {tab==='Combat'&&combatEnabled?<PlayerCombatWorkspace key={campaignId+':'+characterId}
      api={combat} campaignId={campaignId} characterId={characterId}/>:null}
    {tab==='Battle Maps'&&media?.availability().enabled?
      <CampaignMapWorkspace api={media} campaignId={campaignId} role="player"/>:null}
    {tab==='World Atlas'&&media?.availability().enabled?
      <CampaignAtlasWorkspace api={media} campaignId={campaignId}/>:null}
    {tab==='Overview'&&data.owner&&api.availability().layoutEnabled?
      <DashboardLayoutManager role="player" uid={uid} api={api}
        owner={data.owner} campaignId={campaignId} characterId={characterId}
        initialLayout={ch.dashboardLayout}
        renderPanel={id=>{
          if(id==='armour')return <p>Natural Armour Class: {ch.naturalAC??'Not recorded'}</p>;
          if(id==='skills')return <ul>{ch.skills.map((s,i)=><li key={i}>{s.name} {s.rank}</li>)}</ul>;
          if(id==='talents')return <ul>{ch.talents.map((s,i)=><li key={i}>{s}</li>)}</ul>;
          if(id==='spells')return <ul>{ch.spells.map((s,i)=><li key={i}>{s}</li>)}</ul>;
          if(id==='conditions')return <ul>{ch.conditions.map((s,i)=><li key={i}>{s}</li>)}</ul>;
          if(id==='quests')return <ul>{ch.quests.map((s,i)=><li key={i}>{s.name}</li>)}</ul>;
          if(id==='journal')return <ul>{ch.journal.map((s,i)=><li key={i}>{s.title}</li>)}</ul>;
          if(id==='party')return <ul>{(c?.party||[]).map(s=><li key={s.id}>{s.name}</li>)}</ul>;
          if(id==='weapons'||id==='quick')return <ul>{ch.equipment.map((s,i)=><li key={i}>{s.name}</li>)}</ul>;
          if(id==='shortcutCharacter')return <p>Open the Character tab to inspect your sheet.</p>;
          if(id==='shortcutInventory')return <p>Open the Equipment tab to inspect inventory.</p>;
          return null;
        }}/>
      :['Battle Maps','World Atlas','Combat','Progression','Skills','Talents','Check History','Inventory & Trading','Campaign World & Session'].includes(tab)?null:
        <Sections character={ch} owned={data.owner} tab={tab}/>}
    
  </>;
}
/** Character and Player dashboards share one authenticated React route owner. */
export function PlayerDashboardPage({route}){
  const {session}=useAuth(),services=useAppServices();
  const uid=isVerifiedOwnedSession(session)?session.user.uid:null;
  const api=services.get('characters')?.dashboard;
  const media=services.get('gameplay')?.media;
  const combat=services.get('gameplay')?.combat;
  const progression=services.get('gameplay')?.progression;
  const economy=services.get('gameplay')?.economy;
  const digitalGM=services.get('gameplay')?.digitalGM;
  const {campaignId='',characterId=''}=route.params||{};
  return <PageLayout as="section" width="wide" labelledBy="site-player-title"
    className={styles.page} data-testid="site-player-dashboard">
    <Heading id="site-player-title" className={styles.visuallyHidden}>Player &amp; Character Dashboard</Heading>
    {!uid||!api?<SurfacePanel className={styles.panel}>
      <BodyText>Sign in with a verified account to view a character dashboard.</BodyText>
      <CrystalButton href="#/account/login">Login</CrystalButton>
    </SurfacePanel>:<Dashboard key={uid+':'+campaignId+':'+characterId}
      uid={uid} api={api} media={media} combat={combat} progression={progression} economy={economy} digitalGM={digitalGM}
      campaignId={campaignId} characterId={characterId}/>}
  </PageLayout>;
}
