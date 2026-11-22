import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DashboardPanel, ResourceBar, StatusPill } from '../components/WorkspaceUI.jsx';
import { ManualNumberInput } from '../components/ManualNumberInput.jsx';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { useAsyncAction } from '../components/useAsyncAction.js';
import { activeConditions, conditionDurationLabel } from '../state/conditionModel.mjs';
import { resourceDefinitions, resourceSnapshot } from '../state/resourceEngine.mjs';
import { apState, combatActive, combatOptions, currentCombatant, optionProblem, participantFor, rows } from '../state/combatRules.mjs';
import '../styles/combat.css';

const costsText=costs=>Object.entries(costs||{}).filter(([,n])=>n>0).map(([key,n])=>`${n} ${key.toUpperCase()}`).join(' · ')||'No resource cost';
export function useCombatPanel(campaignId,character,encounter={},editable=true,actorOverride='') {
  const actorId=actorOverride||participantFor(encounter,character.id)?.id;
  const active=actorOverride?encounter.status==='active'&&encounter.combat?.version===1&&encounter.combatants?.some(row=>row.id===actorOverride):combatActive(encounter,character.id);
  const [selector,setSelector]=useState(''),[selected,setSelected]=useState(null),[selectedSpendId,setSelectedSpendId]=useState('');
  const action=useAsyncAction();
  const options=useMemo(()=>combatOptions(character,window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries||[]),[character]);
  useEffect(()=>{setSelector('');setSelected(null);setSelectedSpendId('');},[active,actorId,encounter.combatId]);
  useEffect(()=>{if(!selector&&!selected)return undefined;const close=e=>{if(e.key==='Escape'){setSelector('');setSelected(null);}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[selector,selected]);
  const select=(option,spendId='')=>{setSelected(option);setSelectedSpendId(spendId);setSelector('');};
  const command=(input,id=actorId)=>action.run(()=>firebaseService.combatCommand(campaignId,id,{...input,revision:Number(encounter.combat?.revision||0)}));
  const spend=async option=>{const result=await command({operation:'spend-ap',...(option.id?{optionId:option.id}:{ap:option.ap})});if(result?.ok){setSelected(null);setSelectedSpendId('');setSelector('');}return result;};
  return {spend,selectedSpendId,active,actorId,character,encounter,options,selector,setSelector,selected,setSelected,select,command,...action,editable};
}

// Delay pointer preview just long enough for a double-click to spend once.
// Keyboard activation opens the explicit, touch-friendly Spend AP control.
export function CombatActionButton({combat,option,children,className='',disabled=false,title}) {
  const preview=useRef(null);
  useEffect(()=>()=>window.clearTimeout(preview.current),[]);
  const reaction=combat.encounter.combat?.pending?.reactionWindow&&combat.encounter.combat.pending.reactorId===combat.actorId;
  const blocked=optionProblem(option,combat.character,combat.encounter,combat.actorId,{reaction});
  return <button type="button" className={className} disabled={disabled||combat.busy||!combat.editable||Boolean(blocked)||Boolean(combat.encounter.combat?.pending&&!reaction)} title={blocked||title||'Double-click to spend AP; select to review'} onClick={event=>{
    window.clearTimeout(preview.current);
    if(event.detail===0)combat.select(option);
    else if(event.detail===1)preview.current=window.setTimeout(()=>combat.select(option),350);
  }} onDoubleClick={()=>{window.clearTimeout(preview.current);if(reaction)combat.select(option);else combat.spend(option);}}>{children}</button>;
}

function CombatBadge({kind,label,value}) {
  const paths={order:'M12 4H76L88 18V58L76 72H12V54H4V43H12V32H4V21H12Z',initiative:'M24 4H66L88 38L66 72H24L2 38Z',ap:'M45 2L56 14L73 10L75 27L88 38L75 49L73 66L56 62L45 74L34 62L17 66L15 49L2 38L15 27L17 10L34 14Z',timer:'M4 9H86V23L69 38L86 53V67H4V53L21 38L4 23Z'};
  return <div className={`combat-badge combat-badge--${kind}`}><small>{label}</small><div><svg viewBox="0 0 90 76" aria-hidden="true"><path d={paths[kind]}/></svg><strong>{value}</strong></div></div>;
}
function Resources({character}) {
  return <div className="combat-resources">{resourceDefinitions(character).map(def=>{try{const r=resourceSnapshot(character,def.id);return <ResourceBar key={def.id} label={r.name} kind={def.id} value={r.current} maximum={r.maximum}/>;}catch{return null;}})}</div>;
}
function Conditions({character,encounter}) {
  const conditions=activeConditions(character,{encounter});
  return <div className="combat-conditions">{conditions.map(row=><span key={row.id} title={`${row.source||'Unknown source'} · ${row.description||''}`}><b>{row.name}{row.rank?` ${row.rank}`:''}</b><small>{row.throughOwnTurn?`Through own turn ${row.throughOwnTurn} · ${row.boundary}`:conditionDurationLabel(row,{encounter})}{row.pendingGMExpiry?' · GM timing required':''}</small></span>)}{character.downed?<span><b>{character.downed.dead?'Dead':'Downed'}</b><small>{character.downed.successes||0} successes · {character.downed.failures||0} failures</small></span>:null}</div>;
}
export function CombatPanel({combat,onOpen=combat.setSelector,standalone=false}) {
  const {active,actorId,character,encounter,options,selected,select,setSelected,command,spend,selectedSpendId,busy,message,editable}=combat;
  const [group,setGroup]=useState('1'),[targetIds,setTargetIds]=useState([]),[note,setNote]=useState(''),[prepare,setPrepare]=useState(false),[trigger,setTrigger]=useState(''),[response,setResponse]=useState(''),[choice,setChoice]=useState(''),[itemId,setItemId]=useState(''),[slot,setSlot]=useState(''),[swapItemId,setSwapItemId]=useState('');
  if(!active)return null;
  const state=apState(encounter,actorId),current=currentCombatant(encounter),ownTurn=current?.id===actorId&&!state.turnComplete,pending=encounter.combat?.pending;
  const reaction=pending?.reactionWindow&&pending.reactorId===actorId;
  const prepaid=(state.apSpends||[]).find(row=>row.id===selectedSpendId&&!row.linked);
  const blocked=selected?optionProblem(selected,character,encounter,actorId,{reaction,prepaid}):'';
  const visible=options.filter(row=>(standalone||row.kind==='basic'||['item','scroll'].includes(row.kind))&&(group==='reaction'?row.reaction:group==='0'?row.ap===0:row.ap===Number(group)));
  const commit=async()=>{const result=await command({operation:reaction?'react-ability':prepare?'prepare':'declare',optionId:selected.id,targetIds,note,trigger,response,choice,itemId,slot,swapItemId,...(prepaid?{spendId:prepaid.id}:{})});if(result?.ok){setSelected(null);setPrepare(false);}};
  const timer=encounter.turnTimer||encounter.timer;
  const remaining=timer?.enabled&&timer.endsAt?`${Math.max(0,Math.ceil((Number(timer.endsAt)-Date.now())/1000))}s`:'Off';
  return <DashboardPanel icon="weapons" title="Combat" className={`combat-panel ${ownTurn?'is-own-turn':''}`} action={<StatusPill tone={ownTurn?'success':'pending'}>{ownTurn?'YOUR TURN':state.turnComplete?'TURN COMPLETE · Waiting for GM':`Waiting · ${current?.name||'GM'}`}</StatusPill>}>
    <div className="combat-header"><CombatBadge kind="order" label="TURN ORDER" value={encounter.combatants.findIndex(row=>row.id===actorId)+1}/><CombatBadge kind="initiative" label="INITIATIVE" value={encounter.combatants.find(row=>row.id===actorId)?.initiative??'—'}/><CombatBadge kind="ap" label={ownTurn?'ACTION POINTS':'HELD AP'} value={state.ap}/><CombatBadge kind="timer" label="TURN TIMER" value={remaining}/></div>
    <div className="combat-turn-summary"><span>Round {encounter.round||1}</span><span>Bonus action: <b>{state.bonus?'Available':'Used / not refreshed'}</b></span>{!state.turns?<span>AP begins on your first turn.</span>:null}</div>
    {standalone?<Resources character={character}/>:null}<Conditions character={character} encounter={encounter}/>
    {state.pendingDeathSave?<button className="primary" disabled={busy||!editable} onClick={()=>command({operation:'death-save'})}>Roll turn-start death save · unmodified d20</button>:null}
    {state.prepared?<div className="combat-pending"><b>Prepared: {state.prepared.name}</b><p>{state.prepared.trigger}</p><small>{state.prepared.ap} held AP required · {state.ap} remaining · expires next own turn</small></div>:null}
    {pending?<div className="combat-pending" role="status"><b>{pending.actorName}: {pending.name}</b><p>{pending.status.replaceAll('-',' ')}{pending.reactorId?` · ${encounter.combatants.find(row=>row.id===pending.reactorId)?.name}'s reaction`:''}</p><small>{pending.ap} AP · {costsText(pending.costs)}</small>{pending.actorId===actorId&&pending.status==='awaiting-approval'?<button disabled={busy} onClick={()=>command({operation:'cancel'})}>{pending.apPaid?'Cancel resolution · keep AP spent':'Cancel unbegun action'}</button>:null}</div>:null}
    {reaction?<div className="combat-reactions"><b>Reaction window · before the roll</b><div>{(pending.reactionChoices||[]).filter(key=>['dodge','block','parry','opportunity','prepared'].includes(key)).map(key=><button key={key} disabled={busy||!editable||state.ap<1} onClick={()=>command({operation:'react',reaction:key})}>{key} · {key==='prepared'?`${state.prepared?.ap??'Normal'} AP`:`1 AP${key!=='opportunity'?' + 10 SP':''}`}</button>)}{pending.reactionChoices?.some(key=>['counterspell','ability'].includes(key))?<><button onClick={()=>onOpen('spell')}>Reaction spell</button><button onClick={()=>onOpen('talent')}>Reaction talent</button><button onClick={()=>onOpen('technique')}>Reaction technique</button></>:null}<button disabled={busy||!editable} onClick={()=>command({operation:'pass'})}>Pass reaction</button></div></div>:null}
    <div className="combat-action-tabs" aria-label="Action point costs">{[['0','BONUS / 0 AP'],['1','1 AP'],['2','2 AP'],['3','3 AP'],['reaction','REACTIONS / HELD AP']].map(([key,label])=><button key={key} aria-pressed={group===key} className={group===key?'active':''} onClick={()=>setGroup(key)} onDoubleClick={()=>{if(key!=='reaction'&&ownTurn&&!busy&&editable&&!pending)spend({ap:Number(key)});}}>{label}</button>)}</div>
    <div className="combat-source-buttons">{['spell','talent','skill','technique'].map(kind=><button key={kind} onClick={()=>onOpen(kind)} disabled={!editable||busy}>{kind==='technique'?'SKILL TECHNIQUE':kind.toUpperCase()}</button>)}</div>
    <p className="react-help">Double-click an action or AP cost to spend it. On touch or keyboard, select an action and use Spend AP.</p>
    <div className="combat-actions">{visible.map(option=>{const reason=optionProblem(option,character,encounter,actorId,{reaction:group==='reaction'});return <CombatActionButton key={option.id} combat={combat} option={option} title={reason||`${option.ap} AP · ${costsText(option.costs)} · Double-click to spend`}><b>{option.name}</b><small>{reason||`${option.ap} AP${option.bonus?' · Bonus':''} · ${costsText(option.costs)}`}</small></CombatActionButton>;})}{!visible.length?<p>{group==='reaction'?'Reactions require a permitted trigger and owned ability.':'No applicable actions in this group.'}</p>:null}</div>
    {selected?<div className="combat-preview"><div className="combat-preview-title"><h3>{selected.name}</h3><button onClick={()=>setSelected(null)} aria-label="Close action preview">Cancel</button></div><p>{selected.ap} AP{selected.bonus?' + shared bonus use':''} · {costsText(selected.costs)}</p><p>{selected.description}</p>{selected.fields?<dl className="combat-source-facts">{['range','target','area','duration','castingTime','check','damage','healing'].filter(key=>selected.fields[key]).map(key=><React.Fragment key={key}><dt>{key}</dt><dd>{String(selected.fields[key])}</dd></React.Fragment>)}</dl>:null}
      <div className="react-form-grid"><label>Targets<select multiple value={targetIds} onChange={e=>setTargetIds([...e.target.selectedOptions].map(row=>row.value))}>{encounter.combatants.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Declared approach / target conditions<textarea value={note} maxLength={1000} onChange={e=>setNote(e.target.value)} placeholder="Range, movement, source options or effect…"/></label>
      {selected.key==='shove'?<label>Shove outcome<select value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Choose before rolling</option><option value="push">Push up to 2 m</option><option value="prone">Knock prone</option></select></label>:null}
      {['attack','draw','stow','swap','retrieve','drop','disarm','hand','accessory','pickup'].includes(selected.key)?<><label>Item<select value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">Choose item</option>{rows(character.inventory).map(item=><option key={item.id} value={item.id}>{item.name} · {item.location||'inventory'}</option>)}</select></label><label>Equipment slot (if equipping)<input value={slot} onChange={e=>setSlot(e.target.value)} placeholder="Main Hand"/></label>{selected.key==='swap'?<label>Stow weapon<select value={swapItemId} onChange={e=>setSwapItemId(e.target.value)}><option value="">Choose wielded weapon</option>{rows(character.inventory).filter(item=>item.equipped).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>:null}</>:null}
      </div>{ownTurn&&!prepaid?<label className="combat-check"><input type="checkbox" checked={prepare} onChange={e=>setPrepare(e.target.checked)}/>Prepare this action; retain its full AP cost</label>:null}{prepare?<div className="react-form-grid"><label>Observable trigger<input value={trigger} onChange={e=>setTrigger(e.target.value)}/></label><label>Target / response conditions<input value={response} onChange={e=>setResponse(e.target.value)}/></label></div>:null}
      <p>{blocked||(prepaid?'AP already spent. Request resolution here if rolls or resource effects are needed.':'Spend AP immediately. Rolls, spell costs and target effects can be resolved separately.')}</p>
      {!prepaid&&!prepare&&!reaction?<button type="button" className="primary" disabled={busy||!editable||Boolean(blocked)||Boolean(pending)} onClick={()=>spend(selected)}>Spend {selected.ap} AP{selected.bonus?' · Bonus action':''}</button>:null}<button className="primary" disabled={busy||!editable||Boolean(blocked)||Boolean(pending&&!reaction)} onClick={commit}>{prepare?'Declare preparation · 0 AP':reaction?'Commit eligible reaction':prepaid?'Request resolution · AP already paid':'Request GM resolution'}</button>
    </div>:null}<p className="react-action-message" role="status">{message}</p>
    {state.apSpends?.length?<details className="combat-spend-history"><summary>AP spent this turn · {state.apSpends.length} actions</summary><ul>{state.apSpends.map(row=><li key={row.id}>{row.name} · {row.ap} AP{row.bonus?' · bonus':''}{row.optionId&&!row.linked&&ownTurn?<button type="button" disabled={busy||!editable||Boolean(pending)} onClick={()=>{const option=options.find(option=>option.id===row.optionId);if(option){setPrepare(false);select(option,row.id);}}}>Resolve action · AP paid</button>:null}</li>)}</ul></details>:null}
    {!standalone?<footer className="combat-end-turn"><button type="button" disabled={busy||!editable||!ownTurn||Boolean(pending)||state.pendingDeathSave} onClick={()=>command({operation:'end-turn'})}>{state.turnComplete?'Turn complete · waiting for GM':'END TURN'}</button><small>Unused AP stays available for reactions. The GM advances the turn.</small></footer>:null}
  </DashboardPanel>;
}

export function CombatDashboardLayout({combat,children}) {
  const [present,setPresent]=useState(combat.active),[drawerOpen,setDrawerOpen]=useState(false);
  const [mobile,setMobile]=useState(()=>window.matchMedia?.('(max-width: 900px)').matches||false);
  const lastCombat=useRef(combat),drawerButton=useRef(null),drawer=useRef(null),dashboard=useRef(null);
  if(combat.active)lastCombat.current=combat;
  useEffect(()=>{
    if(combat.selector)dashboard.current?.querySelector('.combat-selector-open')?.scrollIntoView({block:'nearest',behavior:'auto'});
  },[combat.selector]);
  useEffect(()=>{if(mobile&&combat.active&&combat.selected)setDrawerOpen(true);},[mobile,combat.active,combat.selected]);
  useEffect(()=>{
    const media=window.matchMedia?.('(max-width: 900px)');
    if(!media)return undefined;
    const update=()=>{setMobile(media.matches);setDrawerOpen(false);};
    media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[]);
  useEffect(()=>{
    if(combat.active){setPresent(true);return undefined;}
    setDrawerOpen(false);
    const timeout=window.setTimeout(()=>setPresent(false),300);
    return()=>window.clearTimeout(timeout);
  },[combat.active]);
  useEffect(()=>{
    if(!drawerOpen)return undefined;
    drawer.current?.querySelector('button')?.focus();
    const keydown=event=>{
      if(event.key==='Escape'){setDrawerOpen(false);drawerButton.current?.focus();}
      if(event.key==='Tab'&&mobile){
        const controls=[...drawer.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',keydown);
    return()=>window.removeEventListener('keydown',keydown);
  },[drawerOpen,mobile]);
  const closeDrawer=()=>{setDrawerOpen(false);drawerButton.current?.focus();};
  const openSelector=kind=>{closeDrawer();combat.setSelector(kind);};
  const shownCombat=combat.active?combat:{...lastCombat.current,editable:false,busy:true};
  return <div className={`combat-mode-layout ${combat.active?'is-combat-mode':''} ${drawerOpen?'combat-drawer-open':''}`}>
    {combat.active||present?<aside className="combat-sidebar-slot" aria-label="Combat controls" aria-hidden={!combat.active} {...(!combat.active?{inert:''}:{})}>
      <button ref={drawerButton} className="combat-mobile-tab" type="button" aria-expanded={drawerOpen} aria-controls="player-combat-sidebar" onClick={()=>setDrawerOpen(true)} disabled={!combat.active}>COMBAT</button>
      {drawerOpen?<button className="combat-drawer-backdrop" type="button" aria-label="Close combat controls" onClick={closeDrawer}/>:null}
      <div ref={drawer} id="player-combat-sidebar" className="combat-sidebar" role={mobile&&drawerOpen?'dialog':undefined} aria-modal={mobile&&drawerOpen?true:undefined} aria-label="Combat controls" {...(!combat.active||mobile&&!drawerOpen?{inert:''}:{})}>
        <button className="combat-drawer-close" type="button" onClick={closeDrawer}>Back to Dashboard</button>
        <CombatPanel combat={shownCombat} onOpen={openSelector}/>
      </div>
    </aside>:null}
    <div ref={dashboard} className="combat-dashboard-main">{children}</div>
  </div>;
}
