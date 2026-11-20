import React,{useEffect,useMemo,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {
  gmNPCCreatureLibrary,libraryDraft,libraryEncounterReady,
  GM_LIBRARY_MAX_RECORDS
} from '../../../src/state/gmNpcCreatureLibraryModel.mjs';
import {loadPublicDomain} from '../compendium/publicCatalogue.mjs';
import {createCompendiumHref} from '../compendium/compendiumModel.mjs';
import {GMNpcGenerator} from './GMNpcGenerator.jsx';
import {GMNpcCardPreview,GMNpcCardStudio} from './GMNpcCharacterCards.jsx';
import {GMNpcCheckComposer} from './GMNpcCheckComposer.jsx';
import styles from './GMNpcToolkit.module.css';

const textFields=[
  ['description','Description',800],['species','Species / Creature Type',120],
  ['role','Role / Occupation',120],['faction','Faction',120],
  ['location','Location / Habitat',120],['personality','Personality',360],
  ['goals','Motivations / Goals',360],['race','Official Race (optional)',120],
  ['fears','Fears',360],['dialogueStyle','Dialogue Style',360],
  ['threatTier','Threat Tier',40],['notes','Private GM Notes',1200]
];
const multiline=new Set(['description','personality','goals','fears','dialogueStyle','notes']);
const stats=[['hp','HP'],['sp','SP'],['mp','MP'],['ac','Creature AC'],
  ['initiative','Initiative'],['xpReward','XP Reward']];
const choices=[['all','All'],['npc','Campaign NPCs'],['creature','Campaign Creatures'],
  ['official','Official Bestiary']];
const ownId=(kind,id)=>kind+':'+id;

export function GMNpcCreatureWorkspace({api,campaignId,party=[],onNavigate}){
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState('');
  const [official,setOfficial]=useState([]),[races,setRaces]=useState([]);
  const [catalogueError,setCatalogueError]=useState(''),[catalogueLoading,setCatalogueLoading]=useState(true);
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('all');
  const [editor,setEditor]=useState(null),[draft,setDraft]=useState(libraryDraft('npc'));
  const [generator,setGenerator]=useState(false),[gallery,setGallery]=useState(false);
  const [cardTarget,setCardTarget]=useState(null),[checkTarget,setCheckTarget]=useState('');
  const [deleteTarget,setDeleteTarget]=useState(''),[busy,setBusy]=useState(false),
    [message,setMessage]=useState(''),[actionError,setActionError]=useState('');
  const progressionEnabled=api.progression?.availability().enabled===true;
  const digitalGMEnabled=api.digitalGM?.availability().enabled===true;
  const loadCatalogue=()=>{
    let active=true;
    setCatalogueLoading(true);setCatalogueError('');
    Promise.allSettled([loadPublicDomain('creature'),loadPublicDomain('race')])
      .then(([creatures,raceRows])=>{
        if(!active)return;
        if(creatures.status==='fulfilled')setOfficial(creatures.value);
        else {setOfficial([]);setCatalogueError('Official bestiary unavailable: '+creatures.reason?.message);}
        if(raceRows.status==='fulfilled')setRaces(raceRows.value);
        else setRaces([]);
      }).finally(()=>{if(active)setCatalogueLoading(false);});
    return ()=>{active=false;};
  };
  useEffect(()=>{
    let active=true;
    setSnapshot(null);setError('');setMessage('');setActionError('');
    if(!digitalGMEnabled){setError('The authenticated NPC Library is not enabled.');return undefined;}
    const close=api.digitalGM.watchGM(campaignId,'library',
      data=>{if(active){setSnapshot(data);setError('');}},
      err=>{if(active){setSnapshot(null);setError(err?.message||'NPC Library unavailable.');}});
    return ()=>{active=false;close();};
  },[api,campaignId,digitalGMEnabled]);
  useEffect(()=>loadCatalogue(),[campaignId]);
  const world=snapshot?.world||{};
  const library=useMemo(()=>gmNPCCreatureLibrary(world,official,{query,kind:filter}),
    [world,official,query,filter]);
  const complete=useMemo(()=>gmNPCCreatureLibrary(world,official),
    [world,official]);
  const lookup=(target)=>complete.rows.find(row=>ownId(row.kind,row.id)===target);
  const currentCard=cardTarget?lookup(cardTarget):null;
  const currentCheck=checkTarget?complete.rows.find(row=>row.kind==='npc'&&
    row.id===checkTarget&&!row.official&&!row.id.startsWith('legacy-')):null;
  const run=async(action,success,onSuccess)=>{
    if(busy)return;
    setBusy(true);setMessage('');setActionError('');
    try{const result=await action();onSuccess?.(result);setMessage(success);return result;}
    catch(err){setActionError(err?.message||'GM Library action failed.');}
    finally{setBusy(false);}
  };
  const newRecord=kind=>{
    setEditor({kind,id:'',expectedUpdatedAt:''});setDraft(libraryDraft(kind));
    setGenerator(false);setCardTarget(null);setDeleteTarget('');setCheckTarget('');
    setActionError('');setMessage('');
  };
  const editRecord=row=>{
    if(row.official)return;
    if(row.id.startsWith('legacy-')){
      setActionError('This legacy record has no stable ID; edit it through World Systems.');
      return;
    }
    setEditor({kind:row.kind,id:row.id,expectedUpdatedAt:row.updatedAt||''});
    setDraft(libraryDraft(row.kind,row));
    setGenerator(false);setCardTarget(null);setDeleteTarget('');setActionError('');
  };
  const save=event=>{
    event.preventDefault();
    if(!editor||busy)return;
    const kind=editor.kind;
    const id=editor.id||kind+'-'+crypto.randomUUID();
    run(()=>api.digitalGM.world(campaignId,{
      type:'library-save',kind,id,entry:draft,expectedUpdatedAt:editor.expectedUpdatedAt
    }),'Campaign '+kind+' saved.',()=>{
      setEditor(null);
    });
  };
  const remove=row=>run(()=>api.digitalGM.world(campaignId,{
    type:'library-delete',kind:row.kind,id:row.id,expectedUpdatedAt:row.updatedAt||''
  }),row.name+' removed from the private campaign library.',()=>{
    setDeleteTarget('');setEditor(null);setCardTarget(null);setCheckTarget('');
  });
  const cardSave=(row,settings)=>run(()=>api.digitalGM.world(campaignId,{
    type:'card-save',kind:row.kind,id:row.id,card:settings,
    expectedUpdatedAt:row.updatedAt||''
  }),row.name+' character card saved.');
  const useConcept=concept=>{
    setEditor({kind:'npc',id:'',expectedUpdatedAt:''});
    setDraft(libraryDraft('npc',concept));setGenerator(false);
    setCardTarget(null);setDeleteTarget('');
    setMessage('NPC draft copied to editor. Review and save it to retain the concept.');
  };
  const setField=(key,value)=>setDraft(current=>({...current,[key]:value}));
  return <SurfacePanel as="section" className={styles.shell}
    data-testid="site-gm-npc-creature-restored">
    <header className={styles.head}><div><h2>NPC &amp; Creature Library</h2>
      <BodyText muted>Search, generate and manage campaign NPCs and creatures. Official Asteria Compendium creatures are read-only.</BodyText>
    </div>
      <div className={styles.counts}><span>NPCs <strong>{library.counts.npc}</strong></span>
        <span>Creatures <strong>{library.counts.creature}</strong></span>
        <span>Official <strong>{library.counts.official}</strong></span></div>
    </header>
    {error?<p role="alert">{error}</p>:null}
    {actionError?<p role="alert">{actionError}</p>:null}
    {message?<p role="status">{message}</p>:null}
    {catalogueLoading?<p role="status">Loading published Asteria Compendium references…</p>:null}
    {catalogueError?<p role="status">{catalogueError}. Campaign entries remain available.</p>:null}
    {!snapshot&&!error?<BodyText muted>Verifying GM access and loading campaign records…</BodyText>:null}
    {snapshot?<div className={styles.form}>
      <div className={styles.toolbar}>
        <label className={styles.field}>Search Library<input type="search" maxLength={100}
          value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="Name, species, faction, habitat, threat tier…"/></label>
        <div className={styles.actions}>
          <button type="button" disabled={busy||!progressionEnabled}
            onClick={()=>onNavigate?.('gameplay')}>Encounter Board &amp; Checks</button>
          <button type="button" disabled={busy} onClick={()=>onNavigate?.('world')}>
            World Systems</button>
        </div>
      </div>
      <div className={styles.actions} role="group" aria-label="Library filters">
        {choices.map(([value,label])=><button key={value} type="button"
          aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={busy||world.npcs?.length>=GM_LIBRARY_MAX_RECORDS}
          onClick={()=>newRecord('npc')}>Add Campaign NPC</button>
        <button type="button" disabled={busy||world.npcs?.length>=GM_LIBRARY_MAX_RECORDS}
          onClick={()=>{setGenerator(v=>!v);setEditor(null);setCardTarget(null);}}>
          {generator?'Close NPC Generator':'Generate NPC'}</button>
        <button type="button" disabled={busy||world.creatures?.length>=GM_LIBRARY_MAX_RECORDS}
          onClick={()=>newRecord('creature')}>Add Custom Creature</button>
        <button type="button" aria-pressed={gallery} onClick={()=>setGallery(v=>!v)}>
          {gallery?'Show Details':'Show Character Cards'}</button>
      </div>
      {generator?<GMNpcGenerator world={world} races={races} disabled={busy}
        onUseDraft={useConcept} onCancel={()=>setGenerator(false)}/>:null}
      {editor?<form className={styles.subpanel} onSubmit={save}>
        <header className={styles.head}><h3>{editor.id?'Edit':'Add'} {editor.kind==='npc'?
          'Campaign NPC':'Custom Creature'}</h3>
          <button type="button" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button></header>
        <div className={styles.fields}>
          <label>Name<input required maxLength={120} value={draft.name} disabled={busy}
            onChange={e=>setField('name',e.target.value)}/></label>
          {textFields.map(([key,label,maxLength])=><label key={key}>{label}
            {multiline.has(key)?<textarea rows={key==='notes'?4:2} maxLength={maxLength}
              value={draft[key]} disabled={busy} onChange={e=>setField(key,e.target.value)}/>:
              <input maxLength={maxLength} value={draft[key]} disabled={busy}
                onChange={e=>setField(key,e.target.value)}/>}
          </label>)}
        </div>
        <fieldset className={styles.fieldset}><legend>Encounter Statistics (Optional)</legend>
          <p>HP and XP are required before a record can be added to the encounter search.</p>
          <div className={styles.fields}>{stats.map(([key,label])=>
            <label key={key}>{label}<input type="number" step={1}
              min={key==='hp'?1:0} max={1000000000} value={draft[key]} disabled={busy}
              onChange={e=>setField(key,e.target.value)}/></label>)}</div>
        </fieldset>
        <div className={styles.actions}>
          <button type="submit" disabled={busy||!draft.name.trim()}>
            Save to Campaign Library</button>
          <button type="button" disabled={busy} onClick={()=>setEditor(null)}>
            Discard Changes</button>
        </div>
      </form>:null}
      {currentCard?<GMNpcCardStudio key={cardTarget} record={currentCard}
        disabled={busy} onClose={()=>setCardTarget(null)}
        onSave={currentCard.official?undefined:settings=>cardSave(currentCard,settings)}/>:null}
      {currentCheck?<GMNpcCheckComposer key={currentCheck.id} api={api.progression}
        campaignId={campaignId} npc={currentCheck} party={party}
        onClose={()=>setCheckTarget('')}/>:null}
      <p role="status">{library.rows.length} matching entries</p>
      <div className={styles.records}>{library.rows.map(row=><article
        className={styles.record} key={ownId(row.kind,row.id)}>
        {gallery?<GMNpcCardPreview record={row} compact/>:<>
          <header className={styles.head}>
            <h3>{row.name}</h3><small>{row.official?'Official Compendium':
              row.kind==='npc'?'Campaign NPC':'Custom Creature'}</small>
          </header>
          <p>{[row.species,row.role,row.faction,row.location,row.threatTier]
            .filter(Boolean).join(' · ')||'Campaign record'}</p>
          {row.description?<p>{row.description}</p>:null}
          {row.personality?<p><strong>Personality:</strong> {row.personality}</p>:null}
          {row.goals?<p><strong>Goals:</strong> {row.goals}</p>:null}
          {!row.official&&row.notes?<p><strong>Private GM Notes:</strong> {row.notes}</p>:null}
          <small>{row.official?'Read-only published creature reference':
            libraryEncounterReady(row)?'Encounter Ready':'Requires HP and XP for encounters'}</small>
        </>}
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={()=>{
            setCardTarget(ownId(row.kind,row.id));setEditor(null);setGenerator(false);}}>
            {row.official?'View Card':'Customise Card'}</button>
          {row.official?<a href={createCompendiumHref({domain:'creature',query:row.name})}>
            View in Compendium</a>:<>
            <button type="button" disabled={busy||row.id.startsWith('legacy-')}
              onClick={()=>editRecord(row)}>Edit</button>
            {row.kind==='npc'?<button type="button"
              disabled={busy||row.id.startsWith('legacy-')||!progressionEnabled}
              onClick={()=>{setCheckTarget(row.id);setCardTarget(null);setEditor(null);}}>
              Request Interaction Check</button>:null}
            {deleteTarget===ownId(row.kind,row.id)?<>
              <strong>Delete this record?</strong>
              <button type="button" disabled={busy} onClick={()=>remove(row)}>Confirm Delete</button>
              <button type="button" disabled={busy} onClick={()=>setDeleteTarget('')}>Cancel</button>
            </>:<button type="button" disabled={busy||row.id.startsWith('legacy-')}
              onClick={()=>setDeleteTarget(ownId(row.kind,row.id))}>Delete</button>}
          </>}
        </div>
      </article>)}</div>
      {!library.rows.length?<p>No matching entries. Try another search, filter or add a campaign record.</p>:null}
      <p className={styles.muted}>Custom records and card settings remain private to the GM. Official creatures cannot be edited, deleted or copied into the campaign automatically.</p>
    </div>:null}
  </SurfacePanel>;
}
