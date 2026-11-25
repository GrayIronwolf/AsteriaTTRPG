import React,{useState} from 'react';
import {
  ENCOUNTER_MAX_WAVES,ENCOUNTER_MAX_EVENTS,ENCOUNTER_MAX_WAVE_ENEMIES
} from '../../../src/state/encounterWaveModel.mjs';
import {normalizePreparedEnemy,comparePreparedEnemySource,refreshPreparedEnemyFields} from '../../../src/state/preparedEncounterModel.mjs';
import {CreatureProfileEditor} from '../CreatureProfileEditor.jsx';
import styles from './PreparedEncounterScheduleEditor.module.css';

const blankEnemy={name:'',hp:'20',type:'Creature'};
const randomId=prefix=>prefix+'-'+crypto.randomUUID();
const round=value=>Number.isSafeInteger(Number(value))?
  Math.max(1,Math.min(999,Number(value))):1;
export function PreparedEncounterScheduleEditor({
  waves=[],events=[],onChange,baseEnemies=[],sources=[],disabled=false
}){
  const [selectedEnemy,setSelectedEnemy]=useState('');
  const [enemyInput,setEnemyInput]=useState(blankEnemy);
  const [editingWave,setEditingWave]=useState('');
  const [editingEvent,setEditingEvent]=useState('');
  const [refreshId,setRefreshId]=useState('');
  const [selectedFields,setSelectedFields]=useState([]);
  const [editingEnemyId,setEditingEnemyId]=useState('');
  const candidateEnemies=[
    ...baseEnemies.map((enemy,index)=>({
      id:'base-'+index,label:'Opening roster: '+enemy.name,enemy
    })),
    ...sources.filter(row=>row.hp).map(row=>({
      id:'source-'+row.id,label:'Creature / NPC: '+row.name,
      enemy:{name:row.name,type:row.type||'Creature',hp:row.hp,sp:row.sp,
        mp:row.mp,ac:row.ac,initiative:row.initiative,xpReward:row.xpReward,
        sourceId:row.sourceId,sourceRef:row.sourceRef,sourceVersion:row.sourceVersion,
        sourceSnapshot:{...structuredClone(row)},
        attacks:row.attacks,spells:row.spells,abilities:row.abilities,
        equipment:row.equipment,portrait:row.portrait,nac:row.nac,
        characteristics:row.characteristics,resistances:row.resistances,
        immunities:row.immunities}
    }))
  ];
  const updateWave=(id,patch)=>onChange('waves',waves.map(row=>
    row.id===id?{...row,...patch}:row));
  const updateEvent=(id,patch)=>onChange('events',events.map(row=>
    row.id===id?{...row,...patch}:row));
  const addToWave=(id,value)=>{
    const clean=normalizePreparedEnemy({...structuredClone(value),preparedEnemyId:randomId('prepared-enemy')});
    if(!clean)return;
    onChange('waves',waves.map(row=>row.id===id&&
      row.enemies.length<ENCOUNTER_MAX_WAVE_ENEMIES?
      {...row,enemies:[...row.enemies,clean]}:row));
  };
  const updateWaveEnemy=(waveId,enemyId,index,transform)=>{
    onChange('waves',waves.map(wave=>wave.id===waveId?{
      ...wave,enemies:wave.enemies.map((row,i)=>
        (row.preparedEnemyId||'legacy-'+i)===enemyId&&i===index?
          transform(row):row)
    }:wave));
  };
  return <section className={styles.root} data-testid="site-prepared-wave-editor">
    <header><h4>Reinforcement Waves &amp; Events</h4>
      <p>These plans remain private to the GM. The round number is a reminder;
        the GM releases each wave or triggers each event manually during combat.</p>
    </header>
    <div className={styles.header}>
      <strong>Waves ({waves.length}/{ENCOUNTER_MAX_WAVES})</strong>
      <button type="button" disabled={disabled||waves.length>=ENCOUNTER_MAX_WAVES}
        onClick={()=>{
          const id=randomId('wave');
          onChange('waves',[...waves,{
            id,name:'New reinforcement wave',notes:'',round:2,enemies:[]
          }]);setEditingWave(id);
        }}>Add Wave</button>
    </div>
    {waves.map(wave=><section key={wave.id} className={styles.item}>
      <div className={styles.header}>
        <strong>{wave.name} · Round {wave.round} · {wave.enemies.length} enemies</strong>
        <div className={styles.buttons}>
          <button type="button" disabled={disabled}
            onClick={()=>setEditingWave(editingWave===wave.id?'':wave.id)}>
            {editingWave===wave.id?'Collapse':'Edit Wave'}</button>
          <button type="button" disabled={disabled}
            onClick={()=>onChange('waves',waves.filter(row=>row.id!==wave.id))}>
            Remove Wave</button>
        </div>
      </div>
      {editingWave===wave.id?<div className={styles.fields}>
        <label>Wave name<input maxLength={100} value={wave.name}
          onChange={e=>updateWave(wave.id,{name:e.target.value})}/></label>
        <label>GM notes<textarea maxLength={400} rows={2} value={wave.notes||''}
          onChange={e=>updateWave(wave.id,{notes:e.target.value})}/></label>
        <label>Round reminder<input type="number" min={1} max={999}
          value={wave.round} onChange={e=>updateWave(wave.id,{
            round:round(e.target.value)})}/></label>
        <strong>Wave enemies ({wave.enemies.length}/{ENCOUNTER_MAX_WAVE_ENEMIES})</strong>
        {wave.enemies.map((enemy,index)=>{
          const identity=wave.id+':'+(enemy.preparedEnemyId||'legacy-'+index);
          const source=enemy.sourceRef?sources.find(row=>row.id===enemy.sourceRef):null;
          const differences=source?comparePreparedEnemySource(enemy,source):null;
          const editing=editingEnemyId===identity,comparing=refreshId===identity;
          return <div className={styles.enemy} key={identity}>
            <span>{enemy.name} · HP {Array.isArray(enemy.hp)?enemy.hp[1]:enemy.hp}</span>
            <button type="button" disabled={disabled}
              onClick={()=>setEditingEnemyId(editing?'':identity)}>Customize</button>
            <button type="button" disabled={disabled||!source||!enemy.sourceSnapshot}
              onClick={()=>{
                setRefreshId(comparing?'':identity);
                setSelectedFields((differences||[]).filter(change=>!change.customized)
                  .map(change=>change.field));
              }}>Compare with Library</button>
            <button type="button" disabled={disabled} onClick={()=>updateWave(
              wave.id,{enemies:wave.enemies.filter((_,i)=>i!==index)})}>Remove</button>
            {editing?<div className={styles.fields}>
              <label>Name<input value={enemy.name} maxLength={120} disabled={disabled}
                onChange={e=>updateWaveEnemy(wave.id,enemy.preparedEnemyId||'legacy-'+index,index,
                  row=>({...row,name:e.target.value}))}/></label>
              {['hp','sp','mp'].map(key=><label key={key}>{key.toUpperCase()} maximum
                <input type="number" min={key==='hp'?1:0} max="1000000000"
                  value={Array.isArray(enemy[key])?enemy[key][1]:''} disabled={disabled}
                  onChange={e=>updateWaveEnemy(wave.id,enemy.preparedEnemyId||'legacy-'+index,index,
                    row=>({...row,[key]:[Math.min(row[key]?.[0]??Number(e.target.value),
                      Number(e.target.value)),Number(e.target.value)]}))}/>
              </label>)}
              <CreatureProfileEditor draft={enemy} disabled={disabled}
                setField={(field,value)=>updateWaveEnemy(wave.id,
                  enemy.preparedEnemyId||'legacy-'+index,index,
                  row=>({...row,[field]:value}))}/>
            </div>:null}
            {comparing&&differences?<div className={styles.fields}>
              <strong>Selective Library Refresh</strong>
              {differences.map(change=><label key={change.field}>
                <input type="checkbox" checked={selectedFields.includes(change.field)}
                  onChange={e=>setSelectedFields(values=>e.target.checked?
                    [...values,change.field]:values.filter(field=>field!==change.field))}/>
                {change.field}{change.customized?' (replaces encounter override)':''}
              </label>)}
              <button type="button" disabled={disabled||!selectedFields.length}
                onClick={()=>{
                  updateWaveEnemy(wave.id,enemy.preparedEnemyId,index,
                    row=>refreshPreparedEnemyFields(row,source,selectedFields));
                  setRefreshId('');setSelectedFields([]);
                }}>Apply Selected Fields to Draft</button>
              <button type="button" onClick={()=>setRefreshId('')}>Cancel Comparison</button>
            </div>:null}
          </div>;
        })}
        <label>Add existing enemy<select value={selectedEnemy}
          onChange={e=>setSelectedEnemy(e.target.value)}>
          <option value="">Choose existing enemy or creature</option>
          {candidateEnemies.map(candidate=><option key={candidate.id} value={candidate.id}>
            {candidate.label}</option>)}
        </select></label>
        <button type="button" disabled={disabled||!selectedEnemy||
          wave.enemies.length>=ENCOUNTER_MAX_WAVE_ENEMIES}
          onClick={()=>{
            const candidate=candidateEnemies.find(row=>row.id===selectedEnemy);
            if(candidate)addToWave(wave.id,candidate.enemy);
          }}>Add Selected Enemy to Wave</button>
        <label>Custom enemy name<input maxLength={120} value={enemyInput.name}
          onChange={e=>setEnemyInput(x=>({...x,name:e.target.value}))}/></label>
        <label>Custom enemy HP<input type="number" min={1} max={1000000000}
          value={enemyInput.hp} onChange={e=>setEnemyInput(x=>({...x,hp:e.target.value}))}/></label>
        <button type="button" disabled={disabled||!enemyInput.name.trim()||
          !Number.isSafeInteger(Number(enemyInput.hp))||Number(enemyInput.hp)<1||
          wave.enemies.length>=ENCOUNTER_MAX_WAVE_ENEMIES}
          onClick={()=>{
            addToWave(wave.id,{...enemyInput,hp:Number(enemyInput.hp)});
            setEnemyInput(blankEnemy);
          }}>Add Custom Enemy to Wave</button>
      </div>:null}
    </section>)}
    <div className={styles.header}>
      <strong>Encounter Events ({events.length}/{ENCOUNTER_MAX_EVENTS})</strong>
      <button type="button" disabled={disabled||events.length>=ENCOUNTER_MAX_EVENTS}
        onClick={()=>{
          const id=randomId('event');
          onChange('events',[...events,{id,name:'New encounter event',
            notes:'',type:'narrative',round:2,announce:false}]);
          setEditingEvent(id);
        }}>Add Event</button>
    </div>
    {events.map(event=><section className={styles.item} key={event.id}>
      <div className={styles.header}>
        <strong>{event.name} · Round {event.round}</strong>
        <div className={styles.buttons}>
          <button type="button" disabled={disabled}
            onClick={()=>setEditingEvent(editingEvent===event.id?'':event.id)}>
            {editingEvent===event.id?'Collapse':'Edit Event'}</button>
          <button type="button" disabled={disabled}
            onClick={()=>onChange('events',events.filter(row=>row.id!==event.id))}>
            Remove Event</button>
        </div>
      </div>
      {editingEvent===event.id?<div className={styles.fields}>
        <label>Event name<input maxLength={100} value={event.name}
          onChange={e=>updateEvent(event.id,{name:e.target.value})}/></label>
        <label>GM event description<textarea maxLength={600} rows={3}
          value={event.notes||''}
          onChange={e=>updateEvent(event.id,{notes:e.target.value})}/></label>
        <label>Event type<select value={event.type||'narrative'}
          onChange={e=>updateEvent(event.id,{type:e.target.value})}>
          <option value="narrative">Narrative</option>
          <option value="environment">Environment</option>
          <option value="objective">Objective</option>
        </select></label>
        <label>Round reminder<input type="number" min={1} max={999}
          value={event.round} onChange={e=>updateEvent(event.id,{
            round:round(e.target.value)})}/></label>
        <label><input type="checkbox" checked={event.announce===true}
          onChange={e=>updateEvent(event.id,{announce:e.target.checked})}/>
          Show event title to players when triggered</label>
      </div>:null}
    </section>)}
  </section>;
}
