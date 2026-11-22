import React,{useEffect,useState} from 'react';
import {PRESENTATION_DEFAULT,PRESENTATION_SCENES,PRESENTATION_THEMES,
  safeCombatPresentation
} from '../../state/playerPresentationModel.mjs';
import {presentationDraft,partyForPresentation} from './campaignMediaModel.mjs';
import {HybridSessionManager} from './HybridSessionManager.jsx';
import {GMScreenCaptureControls} from './GMScreenCaptureControls.jsx';
import {GMPresentationAssets} from './GMPresentationAssets.jsx';
import {PresentationMediaFrame} from './PresentationMediaFrame.jsx';
import {PRESENTATION_MEDIA_SCENES} from '../../state/presentationAssetModel.mjs';
import {useCampaignStream,CampaignMapWorkspace,CampaignAtlasWorkspace} from './CampaignMapWorkspace.jsx';
import styles from './CampaignPresentationWorkspace.module.css';
import {usePresentationDisplayRuntime} from './usePresentationDisplayRuntime.js';

const names={'blank':'Blackout','title':'Title','announcement':'Announcement',
  'battle-map':'Battle Map','world-map':'World Atlas',combat:'Combat',party:'Party',
  image:'Image',cinematic:'Cinematic Video',handout:'PDF Handout'};
const fields=data=>({
  scene:data.scene,title:data.title,subtitle:data.subtitle,mapId:data.mapId,
  characterIds:[...(data.characterIds||[])],showRound:data.showRound,
  showPartyHP:data.showPartyHP,theme:data.theme,
  ...(data.assetId?{assetId:data.assetId}:{})
});
function Scene({api,campaignId,display,party=[],combat={}}){
  if(display.scene==='blank')return <p role="status">Display is blacked out.</p>;
  if(['title','announcement'].includes(display.scene))
    return <div className={styles.sceneTitle}><h2>{display.title}</h2><p>{display.subtitle}</p></div>;
  if(PRESENTATION_MEDIA_SCENES.includes(display.scene))
    return <PresentationMediaFrame api={api} campaignId={campaignId}
      scene={display.scene} assetId={display.assetId}
      title={display.title} subtitle={display.subtitle}/>;
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
    const members=partyForPresentation(party,display.characterIds,display.showPartyHP);
    return <div className={styles.cards}>{members.map(p=><article key={p.id}>
      <strong>{p.name}</strong><p>{p.className} · Level {p.level}</p>
      {display.showPartyHP&&p.hp!=null?<p>HP {p.hp} / {p.hpMax}</p>:null}
    </article>)}</div>;
  }
  return null;
}
function ActivePlayerPresentation({api,campaignId}){
  const presentation=useCampaignStream(api,'watchPresentation',[campaignId,'player']);
  const display=presentation.data||PRESENTATION_DEFAULT;
  // Only subscribe to the scene's data. A blackout drops all media, party and
  // combat listeners rather than retaining their last rendered frames.
  const party=useCampaignStream(api,'watchParty',[campaignId],
    display.scene==='party'||display.scene==='combat');
  const combat=useCampaignStream(api,'watchEncounter',[campaignId],display.scene==='combat');
  if(presentation.error)return <p role="alert">{presentation.error}</p>;
  if(presentation.loading)return <p role="status">Verifying campaign display access…</p>;
  if(['party','combat'].includes(display.scene)&&(party.loading||party.error))
    return <p role={party.error?'alert':'status'}>{party.error||'Synchronising party…'}</p>;
  if(display.scene==='combat'&&(combat.loading||combat.error))
    return <p role={combat.error?'alert':'status'}>{combat.error||'Synchronising combat…'}</p>;
  return <div data-theme={display.theme} className={styles.stage}>
    <Scene api={api} campaignId={campaignId} display={display}
      party={party.data||[]} combat={combat.data||{}}/>
  </div>;
}
export function CampaignPresentationDisplay({api,campaignId,fullscreen=false}){
  const runtime=usePresentationDisplayRuntime();
  return <section ref={runtime.root} className={styles.display}
    data-asteria-player-projector="" data-testid="site-player-presentation">
    <header className={styles.head}>
      <span>Asteria · Player Presentation</span>
      <div className={styles.actions}>
        <span role="status">{!runtime.online?'Offline · display paused':
          !runtime.visible?'Display paused': 'Live display'}</span>
        <button type="button" disabled={!runtime.ready}
          onClick={runtime.reconnect}>Reconnect</button>
        {fullscreen?<button type="button" onClick={runtime.toggleFullscreen}>
          {runtime.fullscreen?'Exit Fullscreen':'Fullscreen'}</button>:null}
      </div>
    </header>
    {!runtime.ready?<p role="alert">Connection or display interrupted.
      Approved content is hidden until the display reconnects.</p>:
      <ActivePlayerPresentation key={campaignId+':'+runtime.generation}
        api={api} campaignId={campaignId}/>}
    {runtime.error?<p role="alert">{runtime.error}</p>:null}
  </section>;
}
export function CampaignPresentationController({api,campaignId,party=[]}){
  const control=useCampaignStream(api,'watchPresentation',[campaignId,'gm']);
  const maps=useCampaignStream(api,'watchMaps',[campaignId,'player']);
  const atlas=useCampaignStream(api,'watchAtlas',[campaignId]);
  const presentationAssets=useCampaignStream(api,'watchPresentationAssets',[campaignId]);
  const [draft,setDraft]=useState(()=>fields(PRESENTATION_DEFAULT));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    if(control.data)setDraft(fields(control.data));
  },[control.data?.revision,campaignId]);
  const update=patch=>setDraft(current=>({...current,...patch}));
  const pickScene=scene=>update({scene,mapId:'',assetId:'',characterIds:[],
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
  const mediaOptions=(presentationAssets.data||[]).filter(item=>
    item.status==='ready'&&item.visibility==='players'&&item.kind===draft.scene);
  const link=window.location.origin+window.location.pathname+window.location.search+
    '#/react/presentation/'+encodeURIComponent(campaignId);
  return <section className={styles.controller} data-testid="site-gm-presentation">
    <h2>Player-Facing Presentation</h2>
    <p>Choose a scene for the second-screen display. Only approved shared content can be published.</p>
    {control.error?<p role="alert">{control.error}</p>:null}
    <div className={styles.fields}>
      <label>Scene<select value={draft.scene} disabled={busy||control.loading||Boolean(control.error)}
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
      {PRESENTATION_MEDIA_SCENES.includes(draft.scene)?<label>
        Published presentation media
        <select value={draft.assetId||''} disabled={busy||presentationAssets.loading}
          onChange={e=>update({assetId:e.target.value})}>
          <option value="">Select published media</option>
          {mediaOptions.map(item=><option key={item.id} value={item.id}>
            {item.name}</option>)}
        </select>
      </label>:null}
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
    <GMPresentationAssets api={api} campaignId={campaignId}/>
    <button type="button" disabled={busy||control.loading||Boolean(control.error)}
      onClick={async()=>{
        setBusy(true);setMessage('');
        try{
          const answer=await api.rebuildPresentationProjections(campaignId);
          setMessage('Safe battle map and combat feeds refreshed ('+
            answer.mapsChecked+' maps checked).');
        }catch(error){setMessage(error?.message||'Display refresh unavailable.');}
        finally{setBusy(false);}
      }}>
      Refresh Safe Combat &amp; Map Feeds
    </button>
    <HybridSessionManager api={api} campaignId={campaignId}/>
    <GMScreenCaptureControls api={api} campaignId={campaignId}
      controlRevision={control.data?.revision||0}/>
    {message?<p role="status">{message}</p>:null}
  </section>;
}
