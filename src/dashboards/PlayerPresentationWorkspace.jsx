import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Panel} from '../components/WorkspaceUI.jsx';
import {firebaseService,waitForFirebase} from '../firebase/asteriaFirebaseService.js';
import {PlayerBattleMapView} from './BattleMapWorkspace.jsx';
import {PlayerWorldAtlas} from './WorldAtlasWorkspace.jsx';
import {
  PRESENTATION_DEFAULT,PRESENTATION_SCENES,PRESENTATION_THEMES,
  PRESENTATION_PARTY_LIMIT,presentationDraft,
  safeCombatPresentation,safePartyPresentation
} from '../state/playerPresentationModel.mjs';
import '../styles/player-presentation.css';

const captions={
  blank:'Blackout',title:'Title Card',announcement:'Announcement',
  'battle-map':'Battle Map','world-map':'World Atlas',combat:'Combat Status',party:'Party Characters'
};
const dataDraft=source=>({
  scene:source?.scene||'blank',
  title:source?.title||'',subtitle:source?.subtitle||'',mapId:source?.mapId||'',
  characterIds:Array.isArray(source?.characterIds)?source.characterIds:[],
  showRound:source?.showRound===true,showPartyHP:source?.showPartyHP===true,
  theme:source?.theme||'obsidian'
});
const displayUrl=campaignId=>
  window.location.origin+window.location.pathname+window.location.search+
  '#/react/presentation/'+encodeURIComponent(campaignId);
function usePublishedPresentation(campaignId,mode='player'){
  const [state,setState]=useState(null);
  const [status,setStatus]=useState('loading');
  useEffect(()=>{
    let active=true,stop=()=>{};
    setState(null);setStatus('loading');
    if(!campaignId)return undefined;
    waitForFirebase().then(()=>{
      if(!active)return;
      if(!firebaseService.currentUser()){setStatus('signed-out');return;}
      const callback=record=>{if(active){setState(record);setStatus('connected');}};
      const failed=()=>{if(active){setState(null);setStatus('denied');}};
      stop=mode==='gm'
        ?firebaseService.subscribePresentationControl(campaignId,callback,failed)
        :firebaseService.subscribePresentationDisplay(campaignId,callback,failed);
    }).catch(()=>{if(active)setStatus('unavailable');});
    return()=>{active=false;stop?.();};
  },[campaignId,mode]);
  return {state,status};
}
function useCampaignPublishedMaps(campaignId){
  const [battleMaps,setBattleMaps]=useState([]);
  const [worldMaps,setWorldMaps]=useState([]);
  useEffect(()=>{
    setBattleMaps([]);setWorldMaps([]);
    if(!campaignId)return undefined;
    let live=true,off=[];
    waitForFirebase().then(()=>{
      if(!live)return;
      off=[
        firebaseService.subscribeBattleMaps(campaignId,rows=>setBattleMaps(rows),{gm:false}),
        firebaseService.subscribeWorldAtlas(campaignId,rows=>setWorldMaps(rows),'player')
      ];
    }).catch(()=>{});
    return()=>{live=false;off.forEach(stop=>stop?.());};
  },[campaignId]);
  return {battleMaps,worldMaps};
}
export function GMPlayerPresentationWorkspace({campaignId,characters={}}){
  const {state:control,status}=usePublishedPresentation(campaignId,'gm');
  const {battleMaps,worldMaps}=useCampaignPublishedMaps(campaignId);
  const [draft,setDraft]=useState(()=>dataDraft(PRESENTATION_DEFAULT));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    if(status==='connected')setDraft(dataDraft(control||PRESENTATION_DEFAULT));
  },[control?.revision,campaignId,status]);
  const scene=draft.scene;
  const mapList=scene==='world-map'?worldMaps:battleMaps;
  const characterOptions=useMemo(()=>Object.values(characters||{})
    .filter(record=>record?.id&&record.ownerUid&&typeof record.name==='string')
    .sort((a,b)=>a.name.localeCompare(b.name)),[characters]);
  const update=values=>setDraft(prev=>({...prev,...values}));
  const chooseScene=value=>update({scene:value,mapId:'',characterIds:[],showRound:value==='combat',
    showPartyHP:false});
  const submit=async(type='set-scene')=>{
    if(busy||status!=='connected')return;
    setBusy(true);setMessage('');
    try{
      const action=type==='blackout'
        ?{type:'blackout',expectedRevision:Number(control?.revision||0)}
        :{type:'set-scene',expectedRevision:Number(control?.revision||0),
          draft:presentationDraft(draft)};
      const response=await firebaseService.managePlayerPresentation(campaignId,'gm-scope',action);
      if(!response?.ok)throw Error(response?.error||'Presentation could not be updated.');
      setMessage(type==='blackout'?'Projector blacked out.':'Player presentation synchronized.');
    }catch(error){setMessage(error.message||String(error));}
    finally{setBusy(false);}
  };
  const openDisplay=()=>{
    const url=displayUrl(campaignId);
    const view=window.open(url,'_blank','noopener,noreferrer');
    if(!view)setMessage('Pop-up blocked. Allow pop-ups, then open the presentation link in another tab.');
  };
  return <section className="asteria-presentation-control" aria-label="GM Player-Facing Display">
    <header><h2>Player-Facing Display</h2>
      <p>Present a separate, readable screen on a TV, projector or second monitor.
        Only content explicitly selected by the GM will appear. The viewing browser must be signed in to this campaign.</p>
    </header>
    <div className="asteria-presentation-grid">
      <Panel title="Scene Selection" eyebrow="Choose what players see">
        <div className="asteria-presentation-form">
          <label>Display scene<select value={scene} onChange={event=>chooseScene(event.target.value)}>
            {PRESENTATION_SCENES.map(type=><option key={type} value={type}>{captions[type]}</option>)}
          </select></label>
          <label>Visual theme<select value={draft.theme} onChange={event=>update({theme:event.target.value})}>
            {PRESENTATION_THEMES.map(theme=><option value={theme} key={theme}>{theme[0].toUpperCase()+theme.slice(1)}</option>)}
          </select></label>
          {scene!=='blank'?<>
            <label>Display heading (optional for maps, combat and party)
              <input maxLength={120} value={draft.title} placeholder="The Battle of Vaelgard"
                onChange={event=>update({title:event.target.value})}/></label>
            <label>Caption / announcement text
              <textarea rows={3} maxLength={380} value={draft.subtitle}
                onChange={event=>update({subtitle:event.target.value})}/></label>
          </>:null}
          {['battle-map','world-map'].includes(scene)?<label>Published {scene==='battle-map'?'battle':'world'} map
            <select value={draft.mapId} onChange={event=>update({mapId:event.target.value})}>
              <option value="">Choose a map already shared with players</option>
              {mapList.map(map=><option key={map.id} value={map.id}>{map.name}</option>)}
            </select>
          </label>:null}
          {scene==='combat'?<label className="asteria-presentation-inline">
            <input type="checkbox" checked={draft.showRound} onChange={event=>update({showRound:event.target.checked})}/>
            Display the current combat round</label>:null}
          {scene==='party'?<>
            <label className="asteria-presentation-inline">
              <input type="checkbox" checked={draft.showPartyHP} onChange={event=>update({showPartyHP:event.target.checked})}/>
              Show party HP totals on the projector</label>
            <p>Select up to {PRESENTATION_PARTY_LIMIT} player characters:</p>
            <div className="asteria-presentation-character-picks">
              {characterOptions.map(character=><label className="asteria-presentation-inline" key={character.id}>
                <input type="checkbox" checked={draft.characterIds.includes(character.id)}
                  disabled={!draft.characterIds.includes(character.id)&&draft.characterIds.length>=PRESENTATION_PARTY_LIMIT}
                  onChange={event=>update({characterIds:event.target.checked
                    ?[...draft.characterIds,character.id]:draft.characterIds.filter(id=>id!==character.id)})}/>
                {character.name}</label>)}
              {!characterOptions.length?<p>No player characters are linked to this campaign.</p>:null}
            </div>
          </>:null}
          <div className="asteria-presentation-actions">
            <button className="primary" type="button" disabled={busy||status!=='connected'}
              onClick={()=>submit('set-scene')}>{busy?'Saving…':'Present Selected Scene'}</button>
            <button className="danger" type="button" disabled={busy||status!=='connected'}
              onClick={()=>submit('blackout')}>Blackout Display</button>
          </div>
          {status!=='connected'?<p role="status">Connecting to GM presentation control ({status}).</p>:null}
          {message?<p role="status" aria-live="polite">{message}</p>:null}
        </div>
      </Panel>
      <Panel title="Second Screen" eyebrow="External presentation window">
        <div className="asteria-presentation-form">
          <p><strong>Currently presented:</strong> {captions[control?.scene||'blank']}</p>
          <p>Revision {control?.revision||0}. A second browser tab updates automatically as the GM changes scenes.</p>
          <button type="button" onClick={openDisplay}>Open Player Display in New Tab</button>
          <label>Presentation link (requires campaign sign-in)
            <input readOnly value={displayUrl(campaignId)} onFocus={event=>event.target.select()}/>
          </label>
          <small>Move that tab to your second monitor or TV and select Fullscreen.
            Screens do not bypass campaign membership. The display never shows GM notes, unpublished maps or hidden NPC details.</small>
          <div className="asteria-presentation-safe-help">
            <strong>Before presenting</strong>
            <p>Publish any maps through their normal GM manager first. Review the title and caption for secrets.
              Only selected player characters appear on a party scene.</p>
          </div>
        </div>
      </Panel>
    </div>
  </section>;
}
function LiveCombatStatus({campaignId,display}){
  const [encounter,setEncounter]=useState({});
  const [characters,setCharacters]=useState({});
  useEffect(()=>{
    let active=true,off=[];
    waitForFirebase().then(()=>{
      if(!active)return;
      off=[
        firebaseService.subscribeEncounter(campaignId,setEncounter),
        firebaseService.subscribeCharacters(campaignId,setCharacters)
      ];
    }).catch(()=>{});
    return()=>{active=false;off.forEach(stop=>stop?.());};
  },[campaignId]);
  const current=safeCombatPresentation(encounter,characters);
  return <section className="asteria-presentation-combat" aria-label="Live combat information">
    <p className="asteria-presentation-kicker">{current.active?'Live Encounter':'Combat Status'}</p>
    {current.active&&display.showRound?<strong className="asteria-presentation-round">Round {current.round}</strong>:null}
    <p className="asteria-presentation-active-turn">{current.current}</p>
    <small>Enemy information and undiscovered combatants are not displayed.</small>
  </section>;
}
function PartyDisplay({campaignId,display}){
  const [characters,setCharacters]=useState({});
  useEffect(()=>{
    let active=true,stop=()=>{};
    waitForFirebase().then(()=>{
      if(active)stop=firebaseService.subscribeCharacters(campaignId,setCharacters);
    }).catch(()=>{});
    return()=>{active=false;stop?.();};
  },[campaignId]);
  const selected=safePartyPresentation(characters,display.characterIds,display.showPartyHP);
  return <section className="asteria-presentation-party" aria-label="Selected character information">
    {selected.map(person=><article key={person.id}>
      <b>{person.name}</b>
      <p>{person.className} · Level {person.level}</p>
      {person.hp!==undefined?<p>HP {person.hp} / {person.hpMax}</p>:null}
    </article>)}
    {!selected.length?<p>The GM has not selected any available characters.</p>:null}
  </section>;
}
function BattleMapDisplay({campaignId,display}){
  // The projector must not receive hidden encounter actors or NPC information.
  // The published map's player-visible scene, grid and fog remain authoritative.
  return <PlayerBattleMapView campaignId={campaignId} mapId={display.mapId} presentation/>;
}
export function PlayerPresentationDisplay({campaignId}){
  const {state:display,status}=usePublishedPresentation(campaignId);
  const [fullscreenMessage,setFullscreenMessage]=useState('');
  const screen=useRef(null);
  useEffect(()=>{
    document.documentElement.classList.add('asteria-presentation-mode');
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return()=>{document.documentElement.classList.remove('asteria-presentation-mode');
      document.body.style.overflow=previous;};
  },[]);
  const fullscreen=async()=>{
    setFullscreenMessage('');
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await screen.current?.requestFullscreen?.();
    }catch(error){setFullscreenMessage(error.message||'Fullscreen is unavailable in this browser.');}
  };
  if(status!=='connected')return <div className="asteria-presentation-screen" data-theme="obsidian">
    <div className="asteria-presentation-empty" role={status==='denied'?'alert':'status'}>
      <h1>{status==='signed-out'?'Sign in required':status==='denied'?'Campaign access denied':'Connecting player display…'}</h1>
      <p>{status==='denied'?'Only active campaign members may view this screen.':
        'Sign in to the Asteria campaign on this browser to use the presentation.'}</p>
    </div>
  </div>;
  const current=display||PRESENTATION_DEFAULT;
  const scene=PRESENTATION_SCENES.includes(current.scene)?current.scene:'blank';
  return <div ref={screen} className={'asteria-presentation-screen'+(scene==='blank'?' blackout':'')}
    data-theme={PRESENTATION_THEMES.includes(current.theme)?current.theme:'obsidian'}
    aria-label="Asteria player presentation screen">
    <div className="asteria-presentation-display-actions">
      <button type="button" onClick={fullscreen}>Toggle Fullscreen</button>
      <button type="button" onClick={()=>window.close()}>Close Display</button>
    </div>
    {scene==='blank'?<div className="asteria-presentation-empty" role="status">
      <span className="asteria-presentation-symbol">✦</span>
      <h1>Asteria</h1><p>Waiting for the GM to present a scene.</p>
    </div>:<>
      <header className="asteria-presentation-display-header">
        <small>Asteria · Player Display</small>
        {current.title?<h1>{current.title}</h1>:null}
        {current.subtitle?<p>{current.subtitle}</p>:null}
      </header>
      <main className={'asteria-presentation-display-main scene-'+scene}>
        {['title','announcement'].includes(scene)?
          <div className="asteria-presentation-title-card">
            <div className="asteria-presentation-decorative-line"/>
            <p>{scene==='announcement'?'Campaign Announcement':'Asteria'}</p>
            <h2>{current.title}</h2>
            {current.subtitle?<p>{current.subtitle}</p>:null}
          </div>:null}
        {scene==='battle-map'?<BattleMapDisplay campaignId={campaignId} display={current}/>:null}
        {scene==='world-map'?<PlayerWorldAtlas campaignId={campaignId} mapId={current.mapId} presentation/>:null}
        {scene==='combat'?<LiveCombatStatus campaignId={campaignId} display={current}/>:null}
        {scene==='party'?<PartyDisplay campaignId={campaignId} display={current}/>:null}
      </main>
    </>}
    {fullscreenMessage?<p role="alert" className="asteria-presentation-message">{fullscreenMessage}</p>:null}
  </div>;
}
