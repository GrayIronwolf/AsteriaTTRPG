import React,{useEffect,useState} from 'react';
import {PRESENTATION_DEFAULT,PRESENTATION_SCENES,PRESENTATION_THEMES,
  safeCombatPresentation,safePartyPresentation
} from '../../../src/state/playerPresentationModel.mjs';
import {presentationDraft} from './campaignMediaModel.mjs';
import {useCampaignStream,CampaignMapWorkspace,CampaignAtlasWorkspace} from './CampaignMapWorkspace.jsx';
import styles from './CampaignPresentationWorkspace.module.css';

const names={'blank':'Blackout','title':'Title','announcement':'Announcement',
  'battle-map':'Battle Map','world-map':'World Atlas',combat:'Combat',party:'Party'};
const fields=data=>({
  scene:data.scene,title:data.title,subtitle:data.subtitle,mapId:data.mapId,
  characterIds:[...(data.characterIds||[])],showRound:data.showRound,
  showPartyHP:data.showPartyHP,theme:data.theme
});
function Scene({api,campaignId,display,party=[],combat={}}){
  if(display.scene==='blank')return <p role="status">Display is blacked out.</p>;
  if(['title','announcement'].includes(display.scene))
    return <div className={styles.sceneTitle}><h2>{display.title}</h2><p>{display.subtitle}</p></div>;
  if(display.scene==='battle-map')
    return <CampaignMapWorkspace api={api} campaignId={campaignId}
      selectedMapId={display.mapId}/>;
  if(display.scene==='world-map')
    return <CampaignAtlasWorkspace api={api} campaignId={campaignId}
      mapId={display.mapId}/>;
  if(display.scene==='combat'){
    const safe=safeCombatPresentation(combat,Object.fromEntries(party.map(p=>[p.id,p])));
    return <div className={styles.sceneTitle}><h2>Combat status</h2>
      {safe.active&&display.showRound?<p>Round {safe.round}</p>:null}
      <p>{safe.current}</p></div>;
  }
  if(display.scene==='party'){
    const members=safePartyPresentation(Object.fromEntries(party.map(p=>[p.id,p])),
      display.characterIds,display.showPartyHP);
    return <div className={styles.cards}>{members.map(p=><article key={p.id}>
      <strong>{p.name}</strong><p>{p.className} · Level {p.level}</p>
      {display.showPartyHP&&p.hp!=null?<p>HP {p.hp} / {p.hpMax}</p>:null}
    </article>)}</div>;
  }
  return null;
}
export function CampaignPresentationDisplay({api,campaignId,fullscreen=false}){
  const presentation=useCampaignStream(api,'watchPresentation',[campaignId,'player']);
  const party=useCampaignStream(api,'watchParty',[campaignId]);
  const combat=useCampaignStream(api,'watchEncounter',[campaignId]);
  const display=presentation.data||PRESENTATION_DEFAULT;
  const [message,setMessage]=useState('');
  const makeFullscreen=async()=>{
    try{await document.querySelector('[data-asteria-player-projector]')?.requestFullscreen?.();}
    catch(error){setMessage(error?.message||'Fullscreen not available.');}
  };
  return <section className={styles.display} data-theme={display.theme}
    data-asteria-player-projector="" data-testid="site-player-presentation">
    <header className={styles.head}>
      <span>Asteria · Player Presentation</span>
      {fullscreen?<button type="button" onClick={makeFullscreen}>Fullscreen</button>:null}
    </header>
    {presentation.error?<p role="alert">{presentation.error}</p>:
      presentation.loading?<p role="status">Checking campaign presentation access…</p>:
        <Scene api={api} campaignId={campaignId} display={display}
          party={party.data||[]} combat={combat.data||{}}/>}
    {party.error&&display.scene==='party'?<p role="alert">Party data unavailable.</p>:null}
    {combat.error&&display.scene==='combat'?<p role="alert">Combat data unavailable.</p>:null}
    {message?<p role="alert">{message}</p>:null}
  </section>;
}
export function CampaignPresentationController({api,campaignId,party=[]}){
  const control=useCampaignStream(api,'watchPresentation',[campaignId,'gm']);
  const maps=useCampaignStream(api,'watchMaps',[campaignId,'player']);
  const atlas=useCampaignStream(api,'watchAtlas',[campaignId]);
  const [draft,setDraft]=useState(()=>fields(PRESENTATION_DEFAULT));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    if(control.data)setDraft(fields(control.data));
  },[control.data?.revision,campaignId]);
  const update=patch=>setDraft(current=>({...current,...patch}));
  const pickScene=scene=>update({scene,mapId:'',characterIds:[],
    showRound:scene==='combat',showPartyHP:false});
  const run=async(type)=>{
    setBusy(true);setMessage('');
    try{
      const action=type==='blackout'
        ?{type:'blackout',expectedRevision:control.data?.revision||0}
        :{type:'set-scene',expectedRevision:control.data?.revision||0,
          draft:presentationDraft(draft)};
      const result=await api.managePresentation(campaignId,action);
      if(result?.ok!==true)throw Error(result?.error||'Presentation update failed.');
      setMessage('Presentation updated.');
    }catch(error){setMessage(error.message||String(error));}
    finally{setBusy(false);}
  };
  const options=draft.scene==='battle-map'?maps.data||[]:atlas.data||[];
  const link=window.location.origin+window.location.pathname+window.location.search+
    '#/react/presentation/'+encodeURIComponent(campaignId);
  return <section className={styles.controller} data-testid="site-gm-presentation">
    <h2>Player-Facing Presentation</h2>
    <p>Choose a scene for the second-screen display. Only approved shared content can be published.</p>
    {control.error?<p role="alert">{control.error}</p>:null}
    <div className={styles.fields}>
      <label>Scene<select value={draft.scene} disabled={busy}
        onChange={e=>pickScene(e.target.value)}>
        {PRESENTATION_SCENES.map(x=><option key={x} value={x}>{names[x]}</option>)}
      </select></label>
      <label>Theme<select value={draft.theme}
        onChange={e=>update({theme:e.target.value})}>
        {PRESENTATION_THEMES.map(x=><option key={x} value={x}>{x}</option>)}
      </select></label>
      {draft.scene!=='blank'?<>
        <label>Title<input maxLength={120} value={draft.title}
          onChange={e=>update({title:e.target.value})}/></label>
        <label>Caption<textarea maxLength={380} rows={3} value={draft.subtitle}
          onChange={e=>update({subtitle:e.target.value})}/></label>
      </>:null}
      {['battle-map','world-map'].includes(draft.scene)?<label>Published map
        <select value={draft.mapId} onChange={e=>update({mapId:e.target.value})}>
          <option value="">Select published map</option>
          {options.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select></label>:null}
      {draft.scene==='combat'?<label><input type="checkbox" checked={draft.showRound}
        onChange={e=>update({showRound:e.target.checked})}/>Show combat round</label>:null}
      {draft.scene==='party'?<>
        <label><input type="checkbox" checked={draft.showPartyHP}
          onChange={e=>update({showPartyHP:e.target.checked})}/>Show party HP</label>
        <fieldset><legend>Characters to display</legend>
          {party.map(row=><label key={row.id}>
            <input type="checkbox" checked={draft.characterIds.includes(row.id)}
              disabled={!draft.characterIds.includes(row.id)&&draft.characterIds.length>=8}
              onChange={e=>update({characterIds:e.target.checked
                ?[...draft.characterIds,row.id]
                :draft.characterIds.filter(id=>id!==row.id)})}/>{row.name}
          </label>)}
        </fieldset>
      </>:null}
    </div>
    <div className={styles.actions}>
      <button type="button" disabled={busy||control.loading||Boolean(control.error)}
        data-testid="site-presentation-publish" onClick={()=>run('set-scene')}>Present Scene</button>
      <button type="button" disabled={busy||control.loading||Boolean(control.error)}
        onClick={()=>run('blackout')}>Blackout</button>
      <a href={link} target="_blank" rel="noopener noreferrer">Open Player Display</a>
    </div>
    <label>Signed-in second-screen URL<input readOnly value={link} onFocus={e=>e.target.select()}/></label>
    <p>Current: {names[control.data?.scene||'blank']} · Revision {control.data?.revision||0}</p>
    {message?<p role="status">{message}</p>:null}
  </section>;
}
