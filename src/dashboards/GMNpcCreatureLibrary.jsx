import React,{useMemo,useState} from 'react';
import {GMNpcGenerator} from './GMNpcGenerator.jsx';
import {
  gmNPCCreatureLibrary,libraryDraft,libraryEncounterReady,
  updateGMLibrary,removeGMLibraryRecord,
  GM_LIBRARY_MAX_RECORDS
} from '../state/gmNpcCreatureLibraryModel.mjs';

const textFields=[
  ['description','Description',800],
  ['species','Species / Creature Type',120],
  ['role','Role / Occupation',120],
  ['faction','Faction',120],
  ['location','Location / Habitat',120],
  ['personality','Personality',360],
  ['goals','Motivations / Goals',360],
  ['race','Official Race (optional)',120],
  ['fears','Fears',360],
  ['dialogueStyle','Dialogue Style',360],
  ['threatTier','Threat Tier',40],
  ['notes','Private GM Notes',1200]
];
const statFields=[
  ['hp','HP'],['sp','SP'],['mp','MP'],
  ['ac','Creature AC'],['initiative','Initiative'],['xpReward','XP Reward']
];
const filterOptions=[
  ['all','All'],['npc','Campaign NPCs'],['creature','Campaign Creatures'],['official','Official Bestiary']
];
const uid=kind=>{
  const token=globalThis.crypto?.randomUUID?.()||
    (Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12));
  return kind+'-'+token;
};

/** A single GM-only library, reusing the existing private world patch service. */
export function GMNpcCreatureLibrary({workspace={},saveSection,onOpenEncounter,onOpenWorld}){
  const world=workspace.world||{};
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('all');
  const [official,setOfficial]=useState(()=>window.AsteriaCodexCompendium?.creatureEntries?.()||[]);
  const [editing,setEditing]=useState(null);
  const [draft,setDraft]=useState(libraryDraft('npc'));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [showGenerator,setShowGenerator]=useState(false);
  const library=useMemo(()=>gmNPCCreatureLibrary(world,official,{query:search,kind:filter}),
    [world,official,search,filter]);
  const startNew=kind=>{
    setShowGenerator(false);
    setEditing({kind,id:null});setDraft(libraryDraft(kind));
    setDeleteTarget(null);setMessage('');
  };
  const startEdit=row=>{
    if(row.official)return;
    setShowGenerator(false);
    if(row.id.startsWith('legacy-')){
      setMessage('This older record has no stable ID. Edit it through World Systems.');
      return;
    }
    setEditing({kind:row.kind,id:row.id});
    setDraft(libraryDraft(row.kind,row));
    setDeleteTarget(null);setMessage('');
  };
  const cancel=()=>{setEditing(null);setDeleteTarget(null);setMessage('');};
  const acceptGeneratedNPC=concept=>{
    setDraft(libraryDraft('npc',concept));
    setEditing({kind:'npc',id:null});
    setShowGenerator(false);
    setDeleteTarget(null);
    setMessage('NPC concept copied to the editor. Review and save to keep it in this campaign.');
  };
  const save=async event=>{
    event.preventDefault();
    if(busy||!editing)return;
    const id=editing.id||uid(editing.kind);
    const result=updateGMLibrary(world,editing.kind,draft,id);
    if(!result.ok){setMessage(result.error);return;}
    setBusy(true);setMessage('Saving to the private campaign library...');
    try{
      const saved=await saveSection('world',result.patch);
      if(!saved?.ok){setMessage(saved?.error||'Could not save library entry.');return;}
      setEditing(null);setMessage('Saved '+result.record.name+' to the campaign library.');
    }catch(error){setMessage(error?.message||'Could not save library entry.');}
    finally{setBusy(false);}
  };
  const remove=async row=>{
    if(busy||row.official)return;
    const result=removeGMLibraryRecord(world,row.kind,row.id);
    if(!result.ok){setMessage(result.error);return;}
    setBusy(true);setMessage('Removing library entry...');
    try{
      const saved=await saveSection('world',result.patch);
      if(!saved?.ok){setMessage(saved?.error||'Could not delete library entry.');return;}
      setDeleteTarget(null);setEditing(null);
      setMessage('Removed '+row.name+' from the campaign library.');
    }catch(error){setMessage(error?.message||'Could not delete library entry.');}
    finally{setBusy(false);}
  };
  const setField=(key,value)=>setDraft(valueNow=>({...valueNow,[key]:value}));
  return <section className="react-gm-npc-library" aria-label="GM NPC and Creature Library">
    <header className="react-gm-library-header">
      <div>
        <p className="react-eyebrow">Digital GM Toolkit · Phases 3.1–3.2</p>
        <h2>NPC &amp; Creature Library</h2>
        <p>Browse existing campaign NPCs, manage custom creatures, and reference the official Asteria Creature Compendium.</p>
      </div>
      <div className="react-gm-library-counter">
        <span>Campaign NPCs <strong>{library.counts.npc}</strong></span>
        <span>Custom Creatures <strong>{library.counts.creature}</strong></span>
        <span>Official Creatures <strong>{library.counts.official}</strong></span>
      </div>
    </header>
    <div className="react-gm-library-tools">
      <label htmlFor="gmNpcLibrarySearch">Search library
        <input id="gmNpcLibrarySearch" type="search" placeholder="Name, species, faction, location, threat tier..."
          value={search} onChange={event=>setSearch(event.target.value)} autoComplete="off"/>
      </label>
      <button type="button" disabled={busy} onClick={()=>setOfficial(window.AsteriaCodexCompendium?.creatureEntries?.()||[])}>Refresh Compendium</button>
      <button type="button" disabled={busy} onClick={onOpenWorld}>World Systems</button>
      <button type="button" disabled={busy} onClick={onOpenEncounter}>Encounter Board</button>
    </div>
    <div className="react-gm-library-filters" role="group" aria-label="Filter NPC and creature library">
      {filterOptions.map(([value,label])=><button key={value} type="button" aria-pressed={filter===value}
        onClick={()=>setFilter(value)}>{label}</button>)}
    </div>
    <div className="react-gm-library-create">
      <button type="button" className="primary" disabled={busy||world.npcs?.length>=GM_LIBRARY_MAX_RECORDS}
        onClick={()=>startNew('npc')}>Add Campaign NPC</button>
      <button type="button" disabled={busy||world.npcs?.length>=GM_LIBRARY_MAX_RECORDS}
        onClick={()=>{setShowGenerator(value=>!value);setEditing(null);setDeleteTarget(null);setMessage('');}}>
        {showGenerator?'Close NPC Generator':'Generate NPC'}</button>
      <button type="button" className="primary" disabled={busy||world.creatures?.length>=GM_LIBRARY_MAX_RECORDS}
        onClick={()=>startNew('creature')}>Add Custom Creature</button>
      <small>Official compendium entries are read-only; your custom records are private to this campaign.</small>
    </div>
    {showGenerator?<GMNpcGenerator world={world} onUseDraft={acceptGeneratedNPC}
      disabled={busy} onCancel={()=>setShowGenerator(false)}/>:null}
    {editing?<form className="react-gm-library-editor" onSubmit={save}>
      <header><h3>{editing.id?'Edit':'Add'} {editing.kind==='npc'?'Campaign NPC':'Custom Creature'}</h3>
        <button type="button" disabled={busy} onClick={cancel}>Cancel</button></header>
      <div className="react-gm-library-fields">
        <label>Name <input required maxLength={120} value={draft.name} disabled={busy}
          onChange={event=>setField('name',event.target.value)} /></label>
        {textFields.map(([key,label,maxLength])=><label key={key}>{label}
          {key==='description'||key==='personality'||key==='goals'||key==='fears'||key==='dialogueStyle'||key==='notes'?
            <textarea rows={key==='notes'?3:2} maxLength={maxLength} value={draft[key]} disabled={busy}
              onChange={event=>setField(key,event.target.value)}/>:
            <input maxLength={maxLength} value={draft[key]} disabled={busy}
              onChange={event=>setField(key,event.target.value)}/>}
        </label>)}
      </div>
      <fieldset className="react-gm-library-stats">
        <legend>Optional encounter statistics</legend>
        <p>HP and XP are required only if you want the record available to the encounter search.</p>
        <div>
          {statFields.map(([key,label])=><label key={key}>{label}
            <input type="number" min={key==='hp'?1:0} max={1000000000} step="1"
              value={draft[key]} disabled={busy} onChange={event=>setField(key,event.target.value)}/>
          </label>)}
        </div>
      </fieldset>
      <div className="react-gm-library-editor-actions">
        <button type="submit" className="primary" disabled={busy||!draft.name.trim()}>
          {busy?'Saving...':'Save to Campaign Library'}</button>
        <button type="button" disabled={busy} onClick={cancel}>Discard Changes</button>
      </div>
    </form>:null}
    <p className="react-gm-library-result" role="status" aria-live="polite">
      {library.rows.length} results · {message}
    </p>
    <div className="react-gm-library-list">
      {library.rows.map(row=><article key={row.kind+':'+row.id} className="react-gm-library-entry">
        <div className="react-gm-library-entry-main">
          <div className="react-gm-library-title">
            <strong>{row.name}</strong>
            <span>{row.official?'Official Creature Compendium':row.kind==='npc'?'Campaign NPC':'Custom Creature'}</span>
          </div>
          <p>{[row.species,row.faction,row.location,row.threatTier].filter(Boolean).join(' · ')||
            (row.official?'Official creature reference':'Campaign record')}</p>
          {row.description?<p className="react-gm-library-description">{row.description}</p>:null}
          {row.kind==='npc'&&row.personality?<p><b>Personality:</b> {row.personality}</p>:null}
          {row.kind==='npc'&&row.goals?<p><b>Goals:</b> {row.goals}</p>:null}
          {!row.official&&row.notes?<p className="react-gm-library-private"><b>GM notes:</b> {row.notes}</p>:null}
          {!row.official?<p className="react-gm-library-encounter">
            {libraryEncounterReady(row)?
              'Encounter ready — searchable on the GM Main encounter board.':
              'Encounter stats incomplete — saved for world and story use.'}
          </p>:<p className="react-gm-library-encounter">Read-only official entry; see the Asteria Compendium for full details.</p>}
        </div>
        {!row.official?<div className="react-gm-library-entry-actions">
          <button type="button" disabled={busy} onClick={()=>startEdit(row)}>Edit</button>
          {deleteTarget===row.kind+':'+row.id?<div className="react-gm-library-confirm">
            <span>Delete this campaign record?</span>
            <button type="button" disabled={busy} onClick={()=>remove(row)}>Confirm Delete</button>
            <button type="button" disabled={busy} onClick={()=>setDeleteTarget(null)}>Cancel</button>
          </div>:<button type="button" className="danger" disabled={busy} onClick={()=>setDeleteTarget(row.kind+':'+row.id)}>Delete</button>}
        </div>:null}
      </article>)}
    </div>
    {!library.rows.length?<p className="react-gm-library-empty">
      No matching entries. Add a campaign NPC or creature, or adjust your search and filters.
    </p>:null}
    <p className="react-gm-library-note">Phase 3.2 generates editable NPC suggestions. Nothing is saved without your confirmation; custom character cards remain a later feature.</p>
  </section>;
}
