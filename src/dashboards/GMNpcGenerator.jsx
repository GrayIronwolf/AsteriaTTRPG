import React,{useMemo,useState} from 'react';
import {
  NPC_GENERATOR_ROLES,NPC_GENERATOR_MOODS,
  generateNPCConcept,npcGeneratorDefaults,npcWorldOptions,officialNPCRaces
} from '../state/gmNpcGeneratorModel.mjs';

const editableFields=[
  ['name','Name',120],
  ['personality','Personality',360],
  ['goals','Goals',360],
  ['fears','Fears',360],
  ['dialogueStyle','Dialogue style',360],
  ['description','Story hook',800]
];
const newSeed=()=>globalThis.crypto?.getRandomValues?.(new Uint32Array(1))?.[0]??Date.now();

/** All draft generation is local. Saving requires an explicit NPC Editor action. */
export function GMNpcGenerator({world={},onUseDraft,onCancel,disabled=false}){
  const [options,setOptions]=useState(npcGeneratorDefaults);
  const [races,setRaces]=useState(()=>window.AsteriaRaceCompendium?.entries?.()||[]);
  const [seed,setSeed]=useState(newSeed);
  const [locks,setLocks]=useState([]);
  const [concept,setConcept]=useState(null);
  const [message,setMessage]=useState('');
  const choices=useMemo(()=>npcWorldOptions(world),[world]);
  const canonical=useMemo(()=>officialNPCRaces(races),[races]);
  const setOption=(key,value)=>{
    setOptions(old=>({...old,[key]:value}));
  };
  const generate=(keep=locks)=>{
    const nextSeed=newSeed();
    const next=generateNPCConcept({seed:nextSeed,options,world,races,previous:concept||{},locked:keep});
    setSeed(nextSeed);
    setConcept(next);
    setMessage('New NPC concept generated. Review and edit it before saving.');
  };
  const reroll=field=>{
    if(!concept||disabled)return;
    const nextSeed=newSeed();
    const all=editableFields.map(row=>row[0]);
    const next=generateNPCConcept({
      seed:nextSeed,options,world,races,previous:concept,
      locked:all.filter(key=>key!==field)
    });
    setSeed(nextSeed);
    setConcept({...concept,[field]:next[field]});
    setMessage('Re-rolled '+field+'.');
  };
  const use=()=>{
    if(!concept?.name?.trim())return setMessage('Enter an NPC name before continuing.');
    onUseDraft({...concept,libraryKind:'npc'});
  };
  return <section className="react-gm-npc-generator" aria-label="NPC Generator">
    <header className="react-gm-generator-header">
      <div>
        <h3>NPC Generator</h3>
        <p>Generate a roleplaying concept using approved Asteria races and your campaign factions and locations. Nothing is saved until you approve it in the NPC editor.</p>
      </div>
      <button type="button" onClick={onCancel} disabled={disabled}>Close Generator</button>
    </header>
    <div className="react-gm-generator-options">
      <label>Occupation
        <select value={options.role} disabled={disabled}
          onChange={event=>setOption('role',event.target.value)}>
          {NPC_GENERATOR_ROLES.map(role=><option key={role}>{role}</option>)}
        </select>
      </label>
      <label>Personality tone
        <select value={options.mood} disabled={disabled}
          onChange={event=>setOption('mood',event.target.value)}>
          {NPC_GENERATOR_MOODS.map(mood=><option key={mood}>{mood}</option>)}
        </select>
      </label>
      <label>Official Asteria race
        <select value={options.race} disabled={disabled}
          onChange={event=>setOption('race',event.target.value)}>
          <option value="">Unspecified</option>
          {canonical.map(name=><option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label>Campaign faction
        <select value={options.faction} disabled={disabled}
          onChange={event=>setOption('faction',event.target.value)}>
          <option value="">Unaffiliated</option>
          {choices.factions.map(name=><option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label>Campaign location
        <select value={options.location} disabled={disabled}
          onChange={event=>setOption('location',event.target.value)}>
          <option value="">Unspecified</option>
          {choices.locations.map(name=><option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    </div>
    <div className="react-gm-generator-actions">
      <button type="button" className="primary" disabled={disabled} onClick={()=>generate()}>
        {concept?'Generate Another':'Generate NPC'}</button>
      <button type="button" disabled={disabled}
        onClick={()=>{setRaces(window.AsteriaRaceCompendium?.entries?.()||[]);setMessage('Race options refreshed from the Compendium.');}}>
        Refresh Race List</button>
    </div>
    {concept?<div className="react-gm-generator-preview">
      <h4>Generated NPC — Editable Preview</h4>
      <p className="react-gm-generator-context">
        {[concept.race||'Race unspecified',concept.role,concept.faction||'No faction',concept.location||'No location'].join(' · ')}
      </p>
      <div className="react-gm-generator-fields">
        {editableFields.map(([field,label,maximum])=><div className="react-gm-generator-field" key={field}>
          <label htmlFor={'gmNpcGenerated'+field}>{label}
            {['personality','goals','fears','dialogueStyle','description'].includes(field)?
              <textarea id={'gmNpcGenerated'+field} rows={field==='description'?3:2}
                maxLength={maximum} value={concept[field]||''} disabled={disabled}
                onChange={event=>setConcept(prev=>({...prev,[field]:event.target.value}))}/>:
              <input id={'gmNpcGenerated'+field} maxLength={maximum}
                value={concept[field]||''} disabled={disabled}
                onChange={event=>setConcept(prev=>({...prev,[field]:event.target.value}))}/>}
          </label>
          <div className="react-gm-generator-field-actions">
            <label><input type="checkbox" checked={locks.includes(field)} disabled={disabled}
              onChange={event=>setLocks(old=>event.target.checked?[...old,field]:old.filter(key=>key!==field))}/> Keep on reroll</label>
            <button type="button" disabled={disabled||locks.includes(field)}
              aria-label={'Reroll '+label} onClick={()=>reroll(field)}>Reroll</button>
          </div>
        </div>)}
        <label>Private GM notes (optional)
          <textarea rows={3} maxLength={1200} value={concept.notes||''} disabled={disabled}
            onChange={event=>setConcept(old=>({...old,notes:event.target.value}))}/>
        </label>
      </div>
      <div className="react-gm-generator-actions">
        <button type="button" className="primary" disabled={disabled||!concept.name.trim()}
          onClick={use}>Use in NPC Editor</button>
        <button type="button" disabled={disabled} onClick={()=>setConcept(null)}>Discard Preview</button>
      </div>
    </div>:null}
    <p className="react-gm-generator-hint">Generated names and hooks are suggestions, not established Asteria canon. No combat statistics, lore or IDs are automatically invented.</p>
    <p className="react-gm-generator-feedback" role="status" aria-live="polite">{message}</p>
  </section>;
}
