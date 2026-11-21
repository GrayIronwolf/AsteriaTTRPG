import React,{useEffect,useState} from 'react';
import {
  reviewPreparedEncounterForStudio,preparedEncounterPublicMapScene
} from '../../../src/state/preparedPresentationBridgeModel.mjs';
import {useCampaignStream} from './CampaignMapWorkspace.jsx';
import styles from './GMPreparedPresentationPanel.module.css';
const EMPTY_API=Object.freeze({});

/**
 * One GM-only view onto the existing Combat Command Centre's saved encounters.
 * No second encounter store, no combat-start shortcut, no direct Firestore writes.
 */
export function GMPreparedPresentationPanel({
  combatApi,campaignId,publishedMaps=[],publishedLoading=false,
  publishedError='',theme='obsidian',onStageScene,onPresentScene,onNavigate
}){
  const enabled=Boolean(combatApi);
  const stream=useCampaignStream(combatApi||EMPTY_API,'watchGM',[campaignId],enabled);
  const [selectedId,setSelectedId]=useState('');
  const [reviewed,setReviewed]=useState(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    setSelectedId('');setReviewed(null);setNotice('');setError('');
  },[campaignId]);
  const plans=stream.data?.preparedEncounters||[];
  const selected=plans.find(plan=>plan.id===selectedId)||null;
  const review=selected?reviewPreparedEncounterForStudio(selected,stream.data):null;
  const reviewFresh=review?.eligible===true&&reviewed?.preparedId===selectedId&&
    reviewed?.preparedRevision===selected?.revision&&
    reviewed?.combatRevision===stream.data?.combat?.revision;
  let publicMapScene=null,mapIssue='';
  if(selected&&selected.mapId&&!publishedLoading&&!publishedError){
    try{publicMapScene=preparedEncounterPublicMapScene(selected,publishedMaps,theme);}
    catch(problem){mapIssue=problem.message||'The selected map cannot be presented.';}
  }
  const inaccessible=!enabled||stream.loading||!!stream.error;
  const canUseMap=!busy&&!inaccessible&&!publishedLoading&&!publishedError&&!!publicMapScene;
  const select=id=>{
    setSelectedId(id);setReviewed(null);setNotice('');setError('');
  };
  const stageMap=()=>{
    if(!canUseMap)return;
    try{
      onStageScene(publicMapScene);
      setNotice('Only the player-safe map was staged locally. Nothing was presented.');
      setError('');
    }catch(problem){setError(problem.message||'Unable to stage the player map.');}
  };
  const presentMap=async()=>{
    if(!canUseMap)return;
    setBusy(true);setError('');setNotice('');
    try{
      await onPresentScene(publicMapScene);
      setNotice('Player-safe map presented using the existing authorized display.');
    }catch(problem){setError(problem.message||'The player display was not updated.');}
    finally{setBusy(false);}
  };
  const load=async()=>{
    if(busy||!reviewFresh||inaccessible)return;
    setBusy(true);setError('');setNotice('');
    try{
      await combatApi.loadPrepared(campaignId,selected.id,
        reviewed.combatRevision,reviewed.preparedRevision);
      setReviewed(null);
      setNotice('Encounter loaded into Ready combat. Player characters remain linked. Start Combat separately from the Combat Command Centre.');
    }catch(problem){setError(problem.message||'The encounter was not loaded. Review the current revisions again.');}
    finally{setBusy(false);}
  };
  return <section className={styles.root} data-testid="site-gm-prepared-presentation">
    <h3>Prepared Encounters</h3>
    <p>Choose an encounter from the existing GM Combat Command Centre.
      Enemy rosters, wave plans and GM notes stay private.</p>
    {!enabled?<p role="status">The secured Combat service is not enabled for this campaign.</p>:null}
    {enabled&&stream.loading?<p role="status">Verifying prepared encounter access…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {enabled&&!inaccessible?<label>Saved encounters
      <select aria-label="Saved prepared encounters" value={selectedId}
        disabled={busy} onChange={event=>select(event.target.value)}>
        <option value="">Select a prepared encounter</option>
        {plans.map(plan=><option key={plan.id} value={plan.id}>
          {plan.name}{plan.archived?' (archived)':''}</option>)}
      </select>
    </label>:null}
    {selected&&review?<div className={styles.details}>
      <h4>{selected.name}</h4>
      <p>{selected.archived?'Archived · ':''}Revision {selected.revision}
        {' · '}{selected.enemies.length} prepared enemies
        {' · '}{selected.waves?.length||0} waves
        {' · '}{selected.events?.length||0} events</p>
      <p>Map: {review.mapName||'No battle map'} · Combat:
        {' '}{stream.data?.combat?.status||'Unavailable'}</p>
      {selected.notes?<details><summary>GM-only encounter notes</summary>
        <p>{selected.notes}</p></details>:null}
      <div className={styles.actions}>
        <button type="button" disabled={busy||inaccessible}
          onClick={()=>{
            setReviewed({preparedId:selected.id,
              preparedRevision:selected.revision,
              combatRevision:stream.data?.combat?.revision});
            setNotice('');setError('');
          }}>Review Encounter Load</button>
        {onNavigate?<button type="button" onClick={()=>onNavigate('gameplay')}>
          Open Combat Command Centre</button>:null}
      </div>
      {reviewed?.preparedId===selectedId?<div className={styles.review}
        data-testid="site-gm-encounter-load-review">
        <strong>Review replacement before loading</strong>
        <p>Will replace {review.stagedEnemies} staged enemies with
          {' '}{review.incomingEnemies} prepared enemies and preserve
          {' '}{review.linkedPlayers} linked player characters.</p>
        <p>No combat starts, no player map is published, and no rewards are granted.</p>
        {review.issues.length?<ul>{review.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:null}
        {!reviewFresh?<p role="alert">The encounter or live combat has changed,
          or cannot be loaded. Review again after resolving the issues.</p>:null}
        <div className={styles.actions}>
          <button type="button" disabled={busy||!reviewFresh}
            onClick={()=>void load()} data-testid="site-gm-encounter-confirm-load">
            Confirm Replace Staged Enemies</button>
          <button type="button" disabled={busy}
            onClick={()=>setReviewed(null)}>Cancel Review</button>
        </div>
      </div>:null}
      <div className={styles.mapPanel}>
        <h4>Player Display Map</h4>
        <p>Map publication is a separate GM action. Preparing or loading combat
          never reveals the map or its enemies to players.</p>
        {publishedLoading?<p role="status">Verifying player-published maps…</p>:null}
        {publishedError?<p role="alert">{publishedError}</p>:null}
        {mapIssue?<p role="status">{mapIssue}</p>:null}
        {!selected.mapId?<p>This encounter has no associated map.</p>:null}
        {publicMapScene?<p>Approved map: {publicMapScene.title}</p>:null}
        <div className={styles.actions}>
          <button type="button" disabled={!canUseMap} onClick={stageMap}>
            Stage Player-Safe Map</button>
          <button type="button" disabled={!canUseMap} onClick={()=>void presentMap()}>
            Present Player-Safe Map</button>
        </div>
        <p>Fog overlays cannot protect secrets embedded in an original image.
          The shortcut blocks fog-enabled originals and requires published player-safe media.</p>
      </div>
    </div>:null}
    {enabled&&!stream.loading&&!stream.error&&!plans.length?
      <p>No prepared encounters saved. Create one in the Combat Command Centre.</p>:null}
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
