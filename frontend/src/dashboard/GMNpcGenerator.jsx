import React,{useMemo,useState} from 'react';
import {
  NPC_GENERATOR_ROLES,NPC_GENERATOR_MOODS,npcGeneratorDefaults,npcWorldOptions,
  officialNPCRaces,generateNPCConcept
} from '../../../src/state/gmNpcGeneratorModel.mjs';
import styles from './GMNpcToolkit.module.css';

const choices=['name','personality','goals','fears','dialogueStyle','description'];
const seed=()=>crypto?.getRandomValues?.(new Uint32Array(1))?.[0]??Date.now();
export function GMNpcGenerator({world={},races=[],disabled=false,onUseDraft,onCancel}){
  const [config,setConfig]=useState(npcGeneratorDefaults);
  const [locked,setLocked]=useState([]);
  const [concept,setConcept]=useState(null);
  const [message,setMessage]=useState('');
  const campaign=useMemo(()=>npcWorldOptions(world),[world]);
  const official=useMemo(()=>officialNPCRaces(races),[races]);
  const set=(key,value)=>setConfig(old=>({...old,[key]:value}));
  const generate=keep=>{
    const item=generateNPCConcept({seed:seed(),options:config,world,races,
      previous:concept||{},locked:keep});
    setConcept(item);setMessage('New NPC concept prepared. Review it before saving.');
  };
  const reroll=field=>{
    if(!concept||disabled)return;
    const next=generateNPCConcept({seed:seed(),options:config,world,races,
      previous:concept,locked:choices.filter(x=>x!==field)});
    setConcept({...concept,[field]:next[field]});
    setMessage(field+' re-rolled. This is an unsaved draft.');
  };
  return <section className={styles.subpanel} data-testid="site-gm-npc-generator">
    <header className={styles.head}><div><h3>NPC Generator</h3>
      <p>Generate story concepts using official race names and your campaign locations/factions. No statistics or lore are invented.</p></div>
      <button type="button" disabled={disabled} onClick={onCancel}>Close Generator</button>
    </header>
    <div className={styles.fields}>
      <label>Occupation<select value={config.role} disabled={disabled}
        onChange={e=>set('role',e.target.value)}>
        {NPC_GENERATOR_ROLES.map(row=><option key={row}>{row}</option>)}</select></label>
      <label>Personality Tone<select value={config.mood} disabled={disabled}
        onChange={e=>set('mood',e.target.value)}>
        {NPC_GENERATOR_MOODS.map(row=><option key={row}>{row}</option>)}</select></label>
      <label>Official Race<select value={config.race} disabled={disabled}
        onChange={e=>set('race',e.target.value)}>
        <option value="">Unspecified</option>
        {official.map(name=><option key={name}>{name}</option>)}</select></label>
      <label>Campaign Faction<select value={config.faction} disabled={disabled}
        onChange={e=>set('faction',e.target.value)}>
        <option value="">Unaffiliated</option>
        {campaign.factions.map(name=><option key={name}>{name}</option>)}</select></label>
      <label>Campaign Location<select value={config.location} disabled={disabled}
        onChange={e=>set('location',e.target.value)}>
        <option value="">Unspecified</option>
        {campaign.locations.map(name=><option key={name}>{name}</option>)}</select></label>
    </div>
    <div className={styles.actions}>
      <button type="button" disabled={disabled} onClick={()=>generate(locked)}>
        {concept?'Regenerate NPC':'Generate NPC Concept'}</button>
      {concept?<button type="button" disabled={disabled} onClick={()=>{
        onUseDraft?.(concept);setMessage('Concept copied to campaign NPC editor.');}}>
        Use in NPC Editor</button>:null}
    </div>
    {concept?<div className={styles.records}><h4>{concept.name}</h4>
      <p>{[concept.race||concept.species,concept.role,concept.faction,concept.location]
        .filter(Boolean).join(' · ')}</p>
      {choices.map(field=><div className={styles.cardSetting} key={field}>
        <div><strong>{field}</strong><p>{concept[field]}</p></div>
        <div className={styles.actions}>
          <label className={styles.inline}>
            <input type="checkbox" checked={locked.includes(field)} disabled={disabled}
              onChange={e=>setLocked(current=>e.target.checked?
                [...current,field]:current.filter(x=>x!==field))}/>Lock</label>
          <button type="button" disabled={disabled} onClick={()=>reroll(field)}>Reroll</button>
        </div>
      </div>)}
    </div>:null}
    <p role="status">{message}</p>
  </section>;
}
