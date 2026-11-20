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
import {PlayerOverviewPanel} from '../player/PlayerOverviewPanels.jsx';
import {CampaignMapWorkspace,CampaignAtlasWorkspace} from '../dashboard/CampaignMapWorkspace.jsx';
import {PlayerCombatWorkspace} from '../combat/CombatWorkspace.jsx';
import {PlayerProgressionWorkspace,PlayerCheckRequests} from '../progression/ProgressionWorkspace.jsx';
import {PlayerEconomyWorkspace} from '../economy/EconomyWorkspace.jsx';
import {PlayerDigitalGMWorkspace} from '../digitalGM/DigitalGMWorkspace.jsx';
import {AdvancedDiceWorkspace} from '../dice/AdvancedDiceWorkspace.jsx';
import styles from './PlayerDashboardPage.module.css';

// Preserve the original navigation vocabulary and order. Some legacy modules
// require feature-by-feature porting; never present a placeholder as a working tool.
const TABS=Object.freeze([
  'Dashboard','Character','Class/Talent Tree','Skills','Spells','Inventory',
  'Crafting','Quests','News / Events / History','Journal','Party','Gallery',
  'Battle Maps','Advanced Dice','Calendar','Weather','World Map','Campaign Library',
  'Campaign Audio','Recording & Archives','Dashboard Settings'
]);
function StatPanel({record}){
  return <div className={styles.stats}>
    {STATS.map(key=><div className={styles.stat} key={key}>
      <small>{key.replace(/^\w/,s=>s.toUpperCase())}</small>
      <strong>{record.characteristics[key]??'—'}</strong>
    </div>)}
  </div>;
}
function Resources({character,editable=false,busy=false,onAdjust}){
  return <div className={styles.resources} data-testid="site-player-resources">
    {['hp','sp','mp'].map(key=>{
      const pair=character[key];
      const current=pair?Number(pair[0])||0:0;
      const maximum=pair?Math.max(0,Number(pair[1])||0):0;
      const percent=maximum?Math.min(100,Math.max(0,current/maximum*100)):0;
      return <div className={styles.resource} data-resource={key} key={key}>
        <div><strong>{key.toUpperCase()}</strong><span>{pair?current+' / '+maximum:'Not recorded'}</span></div>
        <div className={styles.meter} role="progressbar"
          aria-label={key.toUpperCase()+' resources'} aria-valuemin={0}
          aria-valuemax={maximum} aria-valuenow={Math.max(0,Math.min(maximum,current))}>
          <span className={styles.meterFill} style={{width:percent+'%'}}/>
        </div>
        <div className={styles.resourceActions}>
          <button type="button" aria-label={'Decrease '+key.toUpperCase()} disabled={!editable||busy||current<=0}
            onClick={()=>onAdjust(key,-1)}>−</button>
          <button type="button" aria-label={'Increase '+key.toUpperCase()} disabled={!editable||busy||current>=maximum}
            onClick={()=>onAdjust(key,1)}>+</button>
        </div>
      </div>;
    })}
  </div>;
}
function ClassicPlayerHeader({character,campaign,owned,editable,resourceBusy,onAdjust}){
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
      <Resources character={character} editable={editable} busy={resourceBusy} onAdjust={onAdjust}/>
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
function Spellbook({character,editable=false,busy=false,onAction}){
  const [query,setQuery]=useState(''),[element,setElement]=useState('All');
  const spells=character.spellDetails||[];
  const elements=[...new Set(spells.map(spell=>spell.element).filter(Boolean))];
  const visible=spells.filter(spell=>(element==='All'||spell.element===element)&&
    (spell.name+' '+spell.element+' '+spell.rank+' '+spell.summary).toLowerCase()
      .includes(query.trim().toLowerCase()));
  return <SurfacePanel as="section" className={styles.panel} data-testid="site-player-spellbook">
    <h3>Known Spells</h3>
    <div className={styles.spellFilters}>
      <label>Search spells<input type="search" value={query}
        onChange={event=>setQuery(event.target.value)} placeholder="Search your spellbook"/></label>
      <label>Element<select value={element} onChange={event=>setElement(event.target.value)}>
        <option value="All">All</option>
        {elements.map(name=><option key={name} value={name}>{name}</option>)}
      </select></label>
    </div>
    {visible.length?<div className={styles.spellGrid}>{visible.map((spell,index)=>
      <article className={styles.spellCard} key={spell.name+':'+index}>
        <h4>{spell.name}</h4>
        <p>{[spell.element,spell.rank].filter(Boolean).join(' · ')||'Known spell'}</p>
        {spell.summary?<p>{spell.summary}</p>:null}
        <p>{spell.mpCost===null?'MP cost verified by the server':
          'Recorded MP cost: '+spell.mpCost}</p>
        <button type="button" disabled={!editable||busy}
          onClick={()=>{
            if(window.confirm('Cast '+spell.name+'? The campaign server will verify the spell and its cost.'))
              onAction?.('castSpell',spell.name);
          }}>Cast Spell</button>
      </article>)}</div>:
      <BodyText muted>{spells.length?'No spells match the filters.':'No known spells recorded.'}</BodyText>}
    {!editable?<BodyText muted>Spell casting requires an active, editable campaign session and character ownership.</BodyText>:null}
    <Names name="Known Magic" entries={character.magic}/>
  </SurfacePanel>;
}
function Sections({character,tab,owned,editable=false,busy=false,onAction,campaign=null}){
  if(tab==='Dashboard')return <>
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
    <div className={styles.overview} data-testid="site-player-character-systems">
      {[
        ['conditions','Active Conditions'],['effects','Active Effects'],
        ['specialDamage','Soul Damage'],['rest','Rest & Recovery'],
        ['currency','Currency']
      ].map(([id,title])=><SurfacePanel className={styles.panel} key={id}>
        <h3>{title}</h3>
        <PlayerOverviewPanel id={id} character={character} campaign={campaign}
          editable={editable} busy={busy} onAction={onAction}/>
      </SurfacePanel>)}
    </div>
  </>;
  if(tab==='Class/Talent Tree')return <div className={styles.overview}>
    <SurfacePanel className={styles.panel}><h3>Skills</h3>
      {character.skills.length?<ul className={styles.list}>{character.skills.map((s,i)=>
        <li key={i}>{s.name}{s.rank?' — '+s.rank:''}</li>)}</ul>:<BodyText muted>No skills recorded.</BodyText>}
    </SurfacePanel>
    <Names name="Class Talents" entries={character.talents}/>
  </div>;
  if(tab==='Spells')return <Spellbook character={character} editable={editable}
    busy={busy} onAction={onAction}/>;
  if(tab==='Inventory')return <div className={styles.overview}>
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
  if(tab==='Skills')return <SurfacePanel className={styles.panel}>
    <h3>Skills</h3>
    {character.skills.length?<ul className={styles.list}>{character.skills.map((skill,i)=>
      <li key={i}>{skill.name}{skill.rank?' — '+skill.rank:''}</li>)}</ul>:
      <BodyText muted>No skills recorded.</BodyText>}
  </SurfacePanel>;
  if(tab==='News / Events / History')return <SurfacePanel className={styles.panel}>
    <h3>News / Events / History</h3>
    <BodyText muted>The original campaign news and history workspace has not yet been ported to this React route.</BodyText>
  </SurfacePanel>;
  if(['Crafting','Advanced Dice','Calendar','Weather','Campaign Library',
      'Campaign Audio','Recording & Archives'].includes(tab))
    return <SurfacePanel className={styles.panel}>
      <h3>{tab}</h3>
      <BodyText muted>This original dashboard feature is not yet connected to the new React route. Its existing implementation is retained in the repository, but is not active here.</BodyText>
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
function Dashboard({api,media,combat,progression,economy,digitalGM,dice,uid,campaignId='',characterId}){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),
    [error,setError]=useState(''),[tab,setTab]=useState('Dashboard'),
    [resourceBusy,setResourceBusy]=useState(''),[resourceError,setResourceError]=useState(''),
    [resourceMessage,setResourceMessage]=useState('');
  const generation=useRef(0);
  useEffect(()=>{
    const token=++generation.current;
    setData(null);setLoading(true);setError('');setTab('Dashboard');
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
  const resourceEditable=Boolean(c&&data.owner&&c.session.editable&&api.adjustResource);
  const adjustResource=async(key,amount)=>{
    if(!resourceEditable||resourceBusy)return;
    setResourceBusy(key);setResourceError('');
    try{await api.adjustResource(campaignId,characterId,key,amount);}
    catch(reason){setResourceError(reason?.message||'Resource update failed.');}
    finally{setResourceBusy('');}
  };
  const panelAction=async(type,details)=>{
    if(!resourceEditable||resourceBusy)return;
    setResourceBusy(type);setResourceError('');setResourceMessage('');
    try{
      if(type==='removeCondition')await api.removeCondition(campaignId,characterId,details);
      else if(type==='takeRest')await api.takeRest(campaignId,characterId,details.type,{
        soulRecovery:details.soulRecovery,expectedSequence:ch.restSequence});
      else if(type==='adjustCurrency')await api.adjustCurrency(campaignId,characterId,
        details.key,details.delta);
      else if(type==='useQuickItem')await api.useQuickItem(campaignId,characterId,
        details.itemId,details.revision);
      else if(type==='castSpell')await api.castSpell(campaignId,characterId,details);
      setResourceMessage(({castSpell:'Spell cast.',useQuickItem:'Quick item used.',
        removeCondition:'Condition removed.',takeRest:'Rest request submitted.',
        adjustCurrency:'Currency updated.'})[type]||'Character action completed.');
    }catch(e){setResourceError(e?.message||'Character action failed.');}
    finally{setResourceBusy('');}
  };
  return <>
    <ClassicPlayerHeader character={ch} campaign={c} owned={data.owner}
      editable={resourceEditable} resourceBusy={Boolean(resourceBusy)} onAdjust={adjustResource}/>
    {resourceError?<p role="alert">{resourceError}</p>:null}
    {resourceMessage?<p role="status">{resourceMessage}</p>:null}
    <div className={styles.sessionStrip} role="status">
      {c?(c.session.editable?'Live editing enabled':'Session is not active. Gameplay actions are unavailable.'):'Unassigned character — link to a campaign to enable live gameplay.'}
      <CrystalButton href="#/character-forge" size="compact">Character Forge</CrystalButton>
    </div>
    <nav className={styles.tabs} aria-label="Character dashboard sections">
      {[...TABS.filter(x=>data.owner||!['Journal','Gallery','Dashboard Settings'].includes(x)),...(combatEnabled?['Combat']:[]),...(progressionEnabled?['Progression','Check History']:[]),...(economyEnabled?['Inventory & Trading']:[]),...(digitalGMEnabled?['Campaign World & Session']:[])].map(value=><CrystalButton type="button" size="compact" key={value} active={tab===value}
        onClick={()=>setTab(value)}>{value}</CrystalButton>)}
    </nav>
    {digitalGMEnabled&&['Campaign World & Session','Calendar','Weather','Campaign Library',
      'Campaign Audio','Recording & Archives'].includes(tab)?<PlayerDigitalGMWorkspace
      key={campaignId+':'+tab} api={digitalGM} campaignId={campaignId}
      initialSection={{Calendar:'calendar',Weather:'weather','Campaign Library':'handouts',
        'Campaign Audio':'soundboard','Recording & Archives':'recording'}[tab]||'calendar'}/>:null}
    {economyEnabled&&['Inventory & Trading','Inventory','Crafting'].includes(tab)?<PlayerEconomyWorkspace
      key={campaignId+':'+characterId+':'+tab} api={economy}
      initialTab={tab==='Crafting'?'Crafting':'Inventory'}
      campaignId={campaignId} characterId={characterId}/>:null}
    {progressionEnabled&&tab==='Progression'?<PlayerProgressionWorkspace
      api={progression} campaignId={campaignId} characterId={characterId} section="progression"/>:null}
    {progressionEnabled&&tab==='Skills'?<PlayerProgressionWorkspace
      api={progression} campaignId={campaignId} characterId={characterId} section="skills"/>:null}
    {progressionEnabled&&tab==='Class/Talent Tree'?<PlayerProgressionWorkspace
      api={progression} campaignId={campaignId} characterId={characterId} section="talents"/>:null}
    {progressionEnabled?<PlayerCheckRequests key={campaignId+':'+characterId}
      api={progression} campaignId={campaignId} characterId={characterId}
      showHistory={tab==='Check History'}/>:null}
    {tab==='Combat'&&combatEnabled?<PlayerCombatWorkspace key={campaignId+':'+characterId}
      api={combat} campaignId={campaignId} characterId={characterId}/>:null}
    {tab==='Battle Maps'&&media?.availability().enabled?
      <CampaignMapWorkspace api={media} campaignId={campaignId} role="player"/>:null}
    {tab==='World Map'&&media?.availability().enabled?
      <CampaignAtlasWorkspace api={media} campaignId={campaignId}/>:null}
    {tab==='Advanced Dice'&&dice?.availability().enabled?
      <AdvancedDiceWorkspace api={dice} role="player"/>:null}
    {tab==='Party'?<SurfacePanel className={styles.panel}>
      <h3>Party</h3>
      {c?.party?.length?<ul className={styles.list}>{c.party.map(member=>
        <li key={member.id}>{member.name} · Level {member.level}</li>)}</ul>:
        <BodyText muted>No campaign party is linked to this character.</BodyText>}
    </SurfacePanel>:null}
    {tab==='Gallery'&&data.owner?<SurfacePanel className={styles.panel}>
      <h3>Gallery</h3>
      {ch.image?<img className={styles.galleryPortrait} src={ch.image} alt={ch.name+' portrait'}/>:
        <BodyText muted>No character portrait has been selected.</BodyText>}
      <BodyText muted>The full original gallery editor has not yet been migrated.</BodyText>
    </SurfacePanel>:null}
    {['Dashboard','Dashboard Settings'].includes(tab)&&data.owner&&api.availability().layoutEnabled?
      <DashboardLayoutManager role="player" uid={uid} api={api}
        owner={data.owner} campaignId={campaignId} characterId={characterId}
        initialLayout={ch.dashboardLayout}
        renderPanel={id=><PlayerOverviewPanel id={id} character={ch}
          campaign={c} onNavigate={setTab} editable={resourceEditable}
          busy={Boolean(resourceBusy)} onAction={panelAction}
          available={{combatEnabled,progressionEnabled,economyEnabled}}/>}/>
      :(economyEnabled&&['Inventory','Crafting'].includes(tab))||
        (digitalGMEnabled&&['Calendar','Weather','Campaign Library','Campaign Audio','Recording & Archives'].includes(tab))||
        (tab==='Advanced Dice'&&dice?.availability().enabled)||
        (['Dashboard Settings','Battle Maps','World Map','Combat','Progression','Skills','Class/Talent Tree','Check History','Inventory & Trading','Campaign World & Session'].includes(tab)&&((tab==='Skills'||tab==='Class/Talent Tree')?progressionEnabled:true))?null:
        <Sections character={ch} owned={data.owner} tab={tab} editable={resourceEditable}
          busy={Boolean(resourceBusy)} onAction={panelAction} campaign={c}/>}
    
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
  const dice=services.get('gameplay')?.dice;
  const {campaignId='',characterId=''}=route.params||{};
  return <PageLayout as="section" width="wide" labelledBy="site-player-title"
    className={styles.page} data-testid="site-player-dashboard">
    <Heading id="site-player-title" className={styles.visuallyHidden}>Player &amp; Character Dashboard</Heading>
    {!uid||!api?<SurfacePanel className={styles.panel}>
      <BodyText>Sign in with a verified account to view a character dashboard.</BodyText>
      <CrystalButton href="#/account/login">Login</CrystalButton>
    </SurfacePanel>:<Dashboard key={uid+':'+campaignId+':'+characterId}
      uid={uid} api={api} media={media} combat={combat} progression={progression} economy={economy} digitalGM={digitalGM} dice={dice}
      campaignId={campaignId} characterId={characterId}/>}
  </PageLayout>;
}
