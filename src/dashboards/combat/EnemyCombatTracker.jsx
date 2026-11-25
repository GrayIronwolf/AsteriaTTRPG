import React,{useState} from 'react';
import {enemyCombatOptions} from '../../../src/state/enemyProfileModel.mjs';
import styles from './EnemyCombatTracker.module.css';

const resources=[['hp','HP'],['sp','SP'],['mp','MP']];
const safeNumber=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
function ResourceBars({enemy}){
  return <div className={styles.resourceList} aria-label={enemy.name+' resources'}>
    {resources.map(([key,label])=>{
      const pair=enemy[key],current=Array.isArray(pair)?pair[0]:0;
      const maximum=Array.isArray(pair)?pair[1]:0;
      const width=maximum>0?Math.max(0,Math.min(100,current/maximum*100)):0;
      return <div key={key} className={styles.resourceRow}>
        <span>{label}</span>
        <div className={styles.resourceTrack} role="progressbar"
          aria-label={label} aria-valuenow={current} aria-valuemin={0}
          aria-valuemax={maximum} data-resource={key}>
          <div style={{width:width+'%'}}/>
        </div>
        <span>{maximum>0?current+' / '+maximum:'—'}</span>
      </div>;
    })}
  </div>;
}
function EnemyCard({enemy,combat,disabled,onCommand}){
  const [section,setSection]=useState(''),[actionId,setActionId]=useState(''),
    [target,setTarget]=useState(''),[resource,setResource]=useState('hp'),
    [current,setCurrent]=useState(''),[maximum,setMaximum]=useState(''),
    [reason,setReason]=useState(''),[conditionName,setConditionName]=useState('');
  const options=enemyCombatOptions(enemy);
  const option=options.find(row=>row.id===actionId);
  const targets=combat.combatants.filter(row=>row.id!==enemy.id&&!row.defeated);
  const canAct=!disabled&&combat.isActive&&combat.sessionEditable&&
    enemy.current&&!enemy.turnComplete&&!enemy.defeated&&
    !combat.pending;
  const toggle=name=>{setSection(current=>current===name?'':name);setActionId('');setTarget('');};
  const declaration=()=>{
    if(!option||!canAct)return;
    onCommand(enemy.id,{operation:'declare',optionId:option.id,
      targetIds:target?[target]:[]});
  };
  const adjust=event=>{
    event.preventDefault();
    const value=safeNumber(current);
    if(value===null||!reason.trim())return;
    onCommand(enemy.id,{operation:'correct',targetId:enemy.id,reason:reason.trim(),
      ...(resource==='ap'?{ap:value}:{resource,current:value,
        ...(maximum!==''?{maximum:Number(maximum)}:{})})});
    setReason('');
  };
  return <article className={styles.enemyCard} data-enemy-id={enemy.id}
    data-current={enemy.current?'true':'false'}
    data-testid="site-enemy-tracker-card">
    <header className={styles.enemyHeader}>
      <div className={styles.portrait} aria-hidden="true">
        {enemy.portrait?<img src={enemy.portrait} alt=""/>:<span>✦</span>}
      </div>
      <div className={styles.enemyIdentity}>
        <strong>{enemy.name}</strong>
        <small>{enemy.type||'Enemy'} · Initiative {enemy.initiative??'—'}</small>
        <small>AC {enemy.ac??'—'} · {enemy.current?'Current turn':
          enemy.defeated?'Defeated':enemy.turnComplete?'Turn complete':'Waiting'}</small>
      </div>
      <span className={styles.ap}>AP {enemy.ap??0}</span>
    </header>
    <ResourceBars enemy={enemy}/>
    {enemy.defeated?<p className={styles.hint}>Defeated</p>:null}
    {[
      {id:'attacks',name:'Attacks'},
      {id:'spells',name:'Spells'},
      {id:'abilities',name:'Abilities'},
      {id:'conditions',name:'Conditions & Effects'},
      {id:'resources',name:'Adjust Resources'}
    ].map(group=>{
      const active=section===group.id;
      const actions=options.filter(row=>row.group===group.id);
      return <section className={styles.section} key={group.id}>
        <button type="button" className={styles.sectionToggle} aria-expanded={active}
          onClick={()=>toggle(group.id)}>
          <span>{group.name}</span><span aria-hidden="true">{active?'▴':'▾'}</span>
        </button>
        {active&&['attacks','spells','abilities'].includes(group.id)?<div className={styles.sectionBody}>
          {actions.length===0?<p className={styles.hint}>No {group.name.toLowerCase()} defined in this creature's saved profile.</p>:null}
          {actions.map(action=><div className={styles.action} key={action.id}>
            <button type="button" aria-expanded={actionId===action.id}
              onClick={()=>{setActionId(actionId===action.id?'':action.id);setTarget('');}}>
              {action.name} · {action.ap} AP{action.costs.mp?' · '+action.costs.mp+' MP':''}
              {action.costs.sp?' · '+action.costs.sp+' SP':''}
            </button>
            {actionId===action.id?<div className={styles.actionDetails}>
              {action.description?<p>{action.description}</p>:null}
              {action.fields.damage?<p>Damage: {action.fields.damage}</p>:null}
              {action.fields.range?<p>Range: {action.fields.range}</p>:null}
              {action.fields.rank?<p>Spell rank: {action.fields.rank}</p>:null}
              {action.fields.requirement?<p>Requires: {action.fields.requirement}</p>:null}
              <label>Target
                <select value={target} onChange={event=>setTarget(event.target.value)}>
                  <option value="">{action.requiresTarget?'Choose target':'No target / area effect'}</option>
                  {targets.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </label>
              {action.blocked?<p role="alert">{action.blocked}</p>:null}
              <button type="button" disabled={!canAct||Boolean(action.blocked)||
                (action.requiresTarget&&!target)||(action.ap===0?!enemy.bonus:enemy.ap<action.ap)}
                onClick={declaration}>Confirm Declaration for GM Review</button>
              <small>Declaration does not spend resources. The existing GM action
                approval, reactions, dice and resolution process is authoritative.</small>
            </div>:null}
          </div>)}
        </div>:null}
        {active&&group.id==='conditions'?<div className={styles.sectionBody}>
          {(enemy.conditions||[]).length?
            enemy.conditions.map((condition,index)=><div className={styles.condition} key={condition.id||index}>
              <span>{condition.name||'Condition'}</span>
              <button type="button" disabled={disabled||!condition.id}
                onClick={()=>onCommand(enemy.id,{operation:'condition',targetId:enemy.id,
                  condition:{action:'remove',id:condition.id}})}>Remove</button>
            </div>):<p className={styles.hint}>No active conditions recorded.</p>}
          <label>New condition
            <input type="text" maxLength={100} value={conditionName}
              onChange={event=>setConditionName(event.target.value)}
              placeholder="Condition name"/>
          </label>
          <button type="button" disabled={disabled||!conditionName.trim()}
            onClick={()=>{onCommand(enemy.id,{operation:'condition',targetId:enemy.id,
              condition:{name:conditionName.trim(),source:'GM Enemy Tracker',
                duration:{unit:'until-removed'}}});setConditionName('');}}>
            Apply Condition</button>
        </div>:null}
        {active&&group.id==='resources'?<form className={styles.sectionBody} onSubmit={adjust}>
          <label>Resource
            <select value={resource} onChange={event=>{setResource(event.target.value);setCurrent('');setMaximum('');}}>
              {resources.map(([key,label])=><option value={key} key={key}>{label}</option>)}
              <option value="ap">Action Points</option>
            </select>
          </label>
          <label>Current value
            <input type="number" min="0" max={resource==='ap'?3:1000000000}
              value={current} onChange={event=>setCurrent(event.target.value)}/>
          </label>
          {resource!=='ap'?<label>New maximum (optional)
            <input type="number" min="1" max="1000000000" value={maximum}
              onChange={event=>setMaximum(event.target.value)}/>
          </label>:null}
          <label>Correction reason
            <input type="text" maxLength={160} value={reason}
              onChange={event=>setReason(event.target.value)}/>
          </label>
          <button type="submit" disabled={disabled||current===''||
            safeNumber(current)===null||(resource==='ap'&&Number(current)>3)||
            (resource!=='ap'&&maximum!==''&&(safeNumber(maximum)===null||Number(maximum)<1))||
            !reason.trim()}>Apply Audited Correction</button>
        </form>:null}
      </section>;
    })}
  </article>;
}
/** This window is GM-only; player combat projection never exposes creature profiles. */
export function EnemyCombatTracker({combat,onCommand,busy=false}){
  const enemies=(combat?.combatants||[]).filter(row=>row.kind==='enemy');
  return <div className={styles.tracker} data-testid="site-enemy-combat-tracker">
    <p className={styles.count}>{enemies.length} individual enemies</p>
    {!enemies.length?<p>No enemy combatants in this encounter. Add them through Encounter Setup or Prepared Encounters.</p>:null}
    {enemies.map(enemy=><EnemyCard key={enemy.id} enemy={enemy}
      combat={combat} onCommand={onCommand} disabled={busy}/>)}
    {combat?.pending?<p role="status" className={styles.hint}>
      An action awaits GM adjudication. Use the existing action queue before declaring another.</p>:null}
  </div>;
}
