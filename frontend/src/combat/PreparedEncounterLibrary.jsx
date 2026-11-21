import React,{useEffect,useState} from 'react';
import {customEnemy,libraryEnemy} from './combatModel.mjs';
import {
  validatePreparedEncounterInput,normalizePreparedEnemy,
  PREPARED_ENCOUNTER_MAX_ENEMIES,PREPARED_ENCOUNTER_MAX_PLANS
} from '../../../src/state/preparedEncounterModel.mjs';
import {
  queryPreparedEncounterLibrary,preparedEncounterFolders,duplicatePreparedEncounter
} from '../../../src/state/preparedEncounterLibraryModel.mjs';
import {previewPreparedEncounterLoad} from '../../../src/state/preparedEncounterLoadModel.mjs';
import {preparedBattleMapPreview,setPreparedEnemySpawn,clearPreparedEnemySpawns}
  from '../../../src/state/preparedBattleMapModel.mjs';
import {CampaignMapCanvas} from '../dashboard/CampaignMapWorkspace.jsx';
import {PreparedEncounterScheduleEditor} from './PreparedEncounterScheduleEditor.jsx';
import styles from './PreparedEncounterLibrary.module.css';

const blank={name:'',notes:'',mapId:'',enemies:[],waves:[],events:[],folder:'',tags:[],archived:false};
const enemyBlank={name:'',type:'Creature',hp:'20',sp:'',mp:'',xpReward:'0',ac:'',initiative:''};
const draftFrom=plan=>plan?{
  name:plan.name,notes:plan.notes||'',mapId:plan.mapId||'',
  folder:plan.folder||'',tags:[...(plan.tags||[])],archived:plan.archived===true,
  enemies:plan.enemies.map(row=>({...row, hp:Array.isArray(row.hp)?[...row.hp]:row.hp})),
  waves:structuredClone(plan.waves||[]),events:structuredClone(plan.events||[])
}:({...blank,enemies:[]});
const displayHP=row=>Array.isArray(row.hp)?row.hp[1]:row.hp||0;

/** GM-specific private template storage via the existing combat adapter. */
export function PreparedEncounterLibrary({
  api,campaignId,combat,plans=[],maps=[],mediaApi=null,library=[],onLoaded
}){
  const [editId,setEditId]=useState(''),[revision,setRevision]=useState(0);
  const [draft,setDraft]=useState(draftFrom(null)),[enemy,setEnemy]=useState(enemyBlank);
  const [sourceId,setSourceId]=useState(''),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [search,setSearch]=useState(''),[status,setStatus]=useState('active');
  const [folderFilter,setFolderFilter]=useState(''),[sort,setSort]=useState('recent');
  const [previewId,setPreviewId]=useState(''),[tagInput,setTagInput]=useState('');
  const [loadReview,setLoadReview]=useState(null);
  const [fullMaps,setFullMaps]=useState([]),[mapError,setMapError]=useState('');
  const [placingEnemy,setPlacingEnemy]=useState('');
  useEffect(()=>{
    if(!mediaApi){setFullMaps([]);return undefined;}
    setFullMaps([]);setMapError('');
    return mediaApi.watchMaps(campaignId,'gm',setFullMaps,
      error=>setMapError(error.message||'Map media is unavailable.'));
  },[mediaApi,campaignId]);
  const activeMap=fullMaps.find(map=>map.id===draft.mapId)||null;
  const mapPreview=activeMap?preparedBattleMapPreview(activeMap,draft.enemies):null;
  const reviewPlan=plans.find(row=>row.id===loadReview?.id);
  const currentReview=loadReview&&reviewPlan?
    previewPreparedEncounterLoad(reviewPlan,combat,maps):null;
  const reviewFresh=Boolean(currentReview?.eligible&&
    currentReview.templateRevision===loadReview.templateRevision&&
    currentReview.combatRevision===loadReview.combatRevision);
  const folders=preparedEncounterFolders(plans);
  const visiblePlans=queryPreparedEncounterLibrary(plans,{
    query:search,status,folder:folderFilter,sort
  });
  useEffect(()=>{
    setEditId('');setRevision(0);setDraft(draftFrom(null));
    setError('');setMessage('');setSearch('');setStatus('active');
    setFolderFilter('');setSort('recent');setPreviewId('');setTagInput('');
    setLoadReview(null);setPlacingEnemy('');
  },[campaignId]);
  const reset=()=>{
    setEditId('');setRevision(0);setDraft(draftFrom(null));setError('');setTagInput('');setPlacingEnemy('');
  };
  const loadEditor=plan=>{
    setEditId(plan.id);setRevision(plan.revision);setDraft(draftFrom(plan));setPlacingEnemy('');
    setTagInput((plan.tags||[]).join(', '));
    setError('');setMessage('');
  };
  const addEnemy=row=>{
    setDraft(previous=>({...previous,
      enemies:previous.enemies.length>=PREPARED_ENCOUNTER_MAX_ENEMIES?
        previous.enemies:[...previous.enemies,row]
    }));
  };
  const addCustom=()=>{
    try{
      const values={...enemy};
      for(const key of ['hp','sp','mp','xpReward','ac','initiative'])
        if(values[key]!=='')values[key]=Number(values[key]);
      const next=customEnemy(values,'enemy-draft');
      const clean=normalizePreparedEnemy(next);
      if(!clean)throw Error('Invalid enemy statistics.');
      addEnemy(clean);setEnemy(enemyBlank);setError('');
    }catch(failure){setError(failure.message);}
  };
  const addSource=()=>{
    try{
      const source=library.find(row=>row.id===sourceId);
      if(!source)throw Error('Choose a campaign creature or NPC.');
      const next=libraryEnemy({...source,id:source.sourceId},'enemy-source');
      const clean=normalizePreparedEnemy(next);
      if(!clean)throw Error('Source has no usable HP.');
      addEnemy(clean);setError('');
    }catch(failure){setError(failure.message);}
  };
  const reviewLoad=plan=>{
    setError('');setMessage('');
    setLoadReview({id:plan.id,templateRevision:plan.revision,
      combatRevision:combat?.revision});
  };
  const run=async(action,plan)=>{
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      if(action==='save'){
        const payload=validatePreparedEncounterInput({...draft,
          tags:tagInput.split(',').map(tag=>tag.trim()).filter(Boolean)});
        const id=editId||'prepared-'+crypto.randomUUID();
        await api.savePrepared(campaignId,{id,...payload},revision);
        reset();setMessage('Prepared encounter saved to this campaign.');
      }else if(action==='duplicate'){
        const payload=duplicatePreparedEncounter(plan);
        await api.savePrepared(campaignId,{
          id:'prepared-'+crypto.randomUUID(),...payload
        },0);
        setMessage('A separate copy was saved in the encounter library.');
      }else if(action==='archive'){
        const payload=validatePreparedEncounterInput({...plan,archived:!plan.archived});
        await api.savePrepared(campaignId,{id:plan.id,...payload},plan.revision);
        if(editId===plan.id)reset();
        setMessage(plan.archived?'Encounter restored.':'Encounter archived.');
      }else if(action==='delete'){
        if(!window.confirm('Delete this prepared encounter? This does not change live combat.'))return;
        await api.deletePrepared(campaignId,plan,plan.revision);
        if(editId===plan.id)reset();
        setMessage('Prepared encounter deleted.');
      }else if(action==='load'){
        if(!reviewFresh||!loadReview||!plan||plan.id!==loadReview.id)
          throw Error('The encounter or combat revision changed. Review the current encounter again.');
        await api.loadPrepared(campaignId,plan.id,loadReview.combatRevision,
          loadReview.templateRevision);
        setLoadReview(null);
        setMessage('Prepared encounter staged. Combat remains ready until the GM starts it.');
        onLoaded?.(plan);
      }
    }catch(failure){setError(failure?.message||'The encounter could not be updated.');}
    finally{setBusy(false);}
  };
  const canEdit=!combat?.isActive&&combat?.sessionEditable!==false;
  return <section className={styles.library} data-testid="site-prepared-encounter-library">
    <header className={styles.top}>
      <div><h3>Prepared Encounters</h3>
        <p>Build encounters before your session. Saved privately for the campaign GM.</p></div>
      <button type="button" disabled={busy} onClick={reset}>New Encounter</button>
    </header>
    <div className={styles.filters} role="group" aria-label="Filter prepared encounters">
      <label>Find encounter<input type="search" value={search} maxLength={120}
        placeholder="Search name, notes, tags or enemies"
        onChange={event=>setSearch(event.target.value)}/></label>
      <label>Collection<select value={status}
        onChange={event=>setStatus(event.target.value)}>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
        <option value="all">All encounters</option>
      </select></label>
      <label>Folder<select value={folderFilter}
        onChange={event=>setFolderFilter(event.target.value)}>
        <option value="">All folders</option>
        {folders.map(name=><option key={name} value={name}>{name}</option>)}
      </select></label>
      <label>Sort<select value={sort}
        onChange={event=>setSort(event.target.value)}>
        <option value="recent">Recently edited</option>
        <option value="oldest">Oldest first</option>
        <option value="name">Name</option>
        <option value="enemy-count">Enemy count</option>
      </select></label>
    </div>
    <div className={styles.saved} aria-label="Saved prepared encounters">
      <strong>Encounter Library ({visiblePlans.length} shown of {plans.length}/{PREPARED_ENCOUNTER_MAX_PLANS})</strong>
      {visiblePlans.length?visiblePlans.map(plan=><article key={plan.id}>
        <div className={styles.entryInfo}><strong>{plan.name}{plan.archived?' · Archived':''}</strong>
          <small>{plan.folder||'Unfiled'} · {plan.enemies.length} enemies ·
            {' '}{maps.find(m=>m.id===plan.mapId)?.name||'No map'}
            {' · '}Revision {plan.revision}</small>
          {(plan.tags||[]).length?<small>Tags: {plan.tags.join(', ')}</small>:null}
          {previewId===plan.id?<div className={styles.preview}>
            <p>{plan.notes||'No GM notes.'}</p>
            <ul>{plan.enemies.map((enemy,index)=><li key={index}>
              {enemy.name} · {enemy.type} · HP {displayHP(enemy)}
              {enemy.initiative!==undefined?' · Initiative '+enemy.initiative:''}
            </li>)}</ul>
            <p>Waves: {plan.waves?.length||0} · Events: {plan.events?.length||0}</p>
            <p>Map: {maps.find(map=>map.id===plan.mapId)?.name||
              (plan.mapId?'Map unavailable':'None selected')}</p>
          </div>:null}
        </div>
        <div className={styles.actions}>
          <button type="button" aria-expanded={previewId===plan.id}
            onClick={()=>setPreviewId(previewId===plan.id?'':plan.id)}>
            {previewId===plan.id?'Close Preview':'Preview'}</button>
          <button type="button" disabled={busy} onClick={()=>loadEditor(plan)}>Edit</button>
          <button type="button" disabled={busy||plans.length>=PREPARED_ENCOUNTER_MAX_PLANS}
            onClick={()=>run('duplicate',plan)}>Duplicate</button>
          <button type="button" disabled={busy}
            onClick={()=>run('archive',plan)}>{plan.archived?'Restore':'Archive'}</button>
          <button type="button" disabled={busy||!canEdit||plan.archived}
            onClick={()=>reviewLoad(plan)}>Review Load</button>
          <button type="button" disabled={busy}
            onClick={()=>run('delete',plan)}>Delete</button>
        </div>
      </article>):<p>No encounters match these filters.</p>}
    </div>
    {loadReview?<section className={styles.loadReview} role="group"
      aria-label="Confirm prepared encounter replacement" data-testid="site-prepared-load-review">
      <h4>Review Encounter Load</h4>
      {reviewPlan?<><strong>{reviewPlan.name} · Revision {reviewPlan.revision}</strong>
        <p>This operation replaces the current staged enemies. Linked player
          characters stay in the encounter. Combat will remain Ready; no
          initiative rolls or turns start automatically.</p>
        <dl>
          <div><dt>New enemies</dt><dd>{currentReview?.incomingEnemies??0}</dd></div>
          <div><dt>Staged enemies replaced</dt><dd>{currentReview?.stagedEnemies??0}</dd></div>
          <div><dt>Linked player characters retained</dt>
            <dd>{currentReview?.linkedPlayers??0}</dd></div>
          <div><dt>Prepared map</dt><dd>{currentReview?.mapName||'Unavailable'}</dd></div>
        </dl>
        <p>{reviewPlan.waves?.length||0} reinforcement waves and
          { ' '}{reviewPlan.events?.length||0} planned events remain private for GM activation.</p>
        <ul className={styles.loadEnemyList}>
          {reviewPlan.enemies.map((enemy,index)=><li key={index}>
            {enemy.name} · HP {displayHP(enemy)}
            {enemy.initiative!==undefined?' · Initiative '+enemy.initiative:''}
          </li>)}
        </ul>
      </>:<p>The selected encounter no longer exists.</p>}
      {currentReview?.issues.length?<ul className={styles.reviewIssues}>
        {currentReview.issues.map(issue=><li key={issue}>{issue}</li>)}
      </ul>:null}
      {!reviewFresh?<p role="alert">The preview is unavailable or outdated.
        Cancel and review the current saved encounter before loading.</p>:null}
      <div className={styles.actions}>
        <button type="button" disabled={busy||!reviewFresh}
          data-testid="site-prepared-load-confirm"
          onClick={()=>run('load',reviewPlan)}>Confirm Replace Staged Enemies</button>
        <button type="button" disabled={busy}
          onClick={()=>setLoadReview(null)}>Cancel</button>
      </div>
    </section>:null}
    <div className={styles.editor}>
      <h4>{editId?'Edit Prepared Encounter':'Create Prepared Encounter'}</h4>
      <label>Encounter Name<input value={draft.name} maxLength={100}
        onChange={event=>setDraft(row=>({...row,name:event.target.value}))}
        placeholder="e.g. The Frostbound Ambush"/></label>
      <label>GM Notes<textarea value={draft.notes} maxLength={1200} rows={3}
        onChange={event=>setDraft(row=>({...row,notes:event.target.value}))}
        placeholder="Location, tactics, objectives and reminders"/></label>
      <label>Folder<input type="text" maxLength={60} value={draft.folder}
        placeholder="e.g. Chapter 1 · Northern Pass"
        onChange={event=>setDraft(row=>({...row,folder:event.target.value}))}/></label>
      <label>Tags (comma-separated)<input type="text" maxLength={256}
        value={tagInput} placeholder="Ambush, Winter, Boss"
        onChange={event=>setTagInput(event.target.value)}/></label>
      <label><input type="checkbox" checked={draft.archived}
        onChange={event=>setDraft(row=>({...row,archived:event.target.checked}))}/>
        Archived — unavailable for combat loading</label>
      <label>Battle Map<select value={draft.mapId}
        onChange={event=>{
          const id=event.target.value;
          setDraft(row=>({...row,mapId:id,
            enemies:row.mapId===id?row.enemies:clearPreparedEnemySpawns(row.enemies)}));
          setPlacingEnemy('');
        }}>
        <option value="">No map selected</option>
        {maps.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}
      </select></label>
      <p>Set optional enemy starting positions on an existing map. Starting combat
        links the prepared map and its combatant tokens through a secured GM action.</p>
      {mapError?<p role="alert">{mapError}</p>:null}
      {draft.mapId&&mediaApi&&mapPreview?<div className={styles.mapPreparation}
        data-testid="site-prepared-map-placement">
        <h4>Enemy Starting Positions</h4>
        <label>Place enemy<select value={placingEnemy}
          onChange={event=>setPlacingEnemy(event.target.value)}>
          <option value="">Preview only</option>
          {draft.enemies.map((row,index)=><option value={String(index)} key={index}>
            {index+1}. {row.name}{row.spawn?' · Positioned':''}
          </option>)}
        </select></label>
        <CampaignMapCanvas api={mediaApi} campaignId={campaignId}
          map={mapPreview} mode="gm" editing={placingEnemy!==''}
          onPoint={point=>{
            try{
              setDraft(row=>({...row,enemies:setPreparedEnemySpawn(row.enemies,
                Number(placingEnemy),point,activeMap)}));
              setError('');
            }catch(error){setError(error.message);}
          }}/>
        <p>Select an enemy, then click the map to set its grid-snapped square.
          Positions are saved privately in the encounter, not on the shared map.</p>
        <button type="button" onClick={()=>setDraft(row=>({...row,
          enemies:clearPreparedEnemySpawns(row.enemies)}))}>Clear Enemy Positions</button>
      </div>:null}
      <div className={styles.entries}>
        <h4>Enemy Roster ({draft.enemies.length}/{PREPARED_ENCOUNTER_MAX_ENEMIES})</h4>
        {draft.enemies.map((row,index)=><div key={index}>
          <span>{index+1}. {row.name} · HP {displayHP(row)}{row.spawn?' · Positioned':' · Auto placement'}</span>
          <button type="button" disabled={busy} aria-label={'Remove '+row.name+' '+(index+1)}
            onClick={()=>setDraft(previous=>({...previous,
              enemies:previous.enemies.filter((_,i)=>i!==index)}))}>Remove</button>
        </div>)}
      </div>
      <div className={styles.source}>
        <label>Existing Creature or NPC<select value={sourceId}
          onChange={event=>setSourceId(event.target.value)}>
          <option value="">Select a saved campaign source</option>
          {library.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
        <button type="button" disabled={busy||!sourceId||
          draft.enemies.length>=PREPARED_ENCOUNTER_MAX_ENEMIES}
          onClick={addSource}>Add Source</button>
      </div>
      <fieldset className={styles.custom}>
        <legend>Custom Enemy</legend>
        <label>Name<input maxLength={120} value={enemy.name}
          onChange={event=>setEnemy(previous=>({...previous,name:event.target.value}))}/></label>
        <label>Type<select value={enemy.type}
          onChange={event=>setEnemy(previous=>({...previous,type:event.target.value}))}>
          <option>Creature</option><option>NPC</option>
        </select></label>
        {['hp','sp','mp','xpReward','ac','initiative'].map(key=><label key={key}>
          {key.toUpperCase()}<input type="number"
            value={enemy[key]} min={key==='hp'?1:0}
            onChange={event=>setEnemy(previous=>({...previous,[key]:event.target.value}))}/>
        </label>)}
        <button type="button" disabled={busy||!enemy.name.trim()||
          draft.enemies.length>=PREPARED_ENCOUNTER_MAX_ENEMIES}
          onClick={addCustom}>Add Custom Enemy</button>
      </fieldset>
      <PreparedEncounterScheduleEditor
        waves={draft.waves||[]} events={draft.events||[]}
        baseEnemies={draft.enemies} sources={library} disabled={busy}
        onChange={(key,value)=>setDraft(previous=>({...previous,[key]:value}))}/>
      <div className={styles.actions}>
        <button type="button" disabled={busy||!draft.name.trim()||!draft.enemies.length||
          (!editId&&plans.length>=PREPARED_ENCOUNTER_MAX_PLANS)}
          data-testid="site-prepared-encounter-save"
          onClick={()=>run('save')}>{busy?'Saving…':'Save Encounter'}</button>
        <button type="button" disabled={busy} onClick={reset}>Discard Draft</button>
      </div>
    </div>
    {message?<p role="status">{message}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
