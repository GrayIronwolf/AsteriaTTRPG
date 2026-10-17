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

function ReactionApproval({character,value={},onChange}) {
  const change=(key,next)=>onChange({...value,[key]:next});
  const options=combatOptions(character,window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries||[]).filter(row=>['spell','talent','technique'].includes(row.kind));
  return <div className="react-form-grid" style={{gridColumn:'1 / -1'}}><label>Owned reaction source<select value={value.optionId||''} onChange={e=>change('optionId',e.target.value)}><option value="">Choose actual ability / rank</option>{options.map(option=><option key={option.id} value={option.id}>{option.name} · {option.rank||''}</option>)}</select></label><label>Casting method<select value={value.castingMethod||''} onChange={e=>change('castingMethod',e.target.value)}><option value="">Not a spell / choose method</option>{['mancer','wizard','occultist','sorcerer','summoner','warlock','witch-doctor','source-defined'].map(row=><option key={row}>{row}</option>)}</select></label><label>Elemental skill<input value={value.elementalSkill||''} onChange={e=>change('elementalSkill',e.target.value)}/></label><label>Element relationship<select value={value.elementRelation||''} onChange={e=>change('elementRelation',e.target.value)}><option value="">Choose approved relationship</option><option value="same">Same (−2)</option><option value="opposite">Opposite (0)</option></select></label><label>Source / cost / eligibility approval<input value={value.sourceReason||''} onChange={e=>change('sourceReason',e.target.value)}/></label><label className="combat-check"><input type="checkbox" checked={Boolean(value.feasible)} onChange={e=>onChange({...value,feasible:e.target.checked,rankEligible:e.target.checked,triggerConfirmed:e.target.checked})}/>Confirmed actual reaction permission, rank access, prerequisites and range</label></div>;
}
function GMActionReview({campaignId,encounter,characters,combatState,run,busy}) {
  const p=combatState?.pending;
  const [form,setForm]=useState({checkType:'none',skill:'',dc:'',opposedSkill:'',castingMethod:'',personalMP:'',sourceReason:'',feasible:false,rankEligible:false,sizeEligible:false}),[reason,setReason]=useState(''),[target,setTarget]=useState(''),[amount,setAmount]=useState(''),[healing,setHealing]=useState(false),[damageType,setDamageType]=useState(''),[sharedArea,setSharedArea]=useState(false),[outcome,setOutcome]=useState('manifested'),[reactors,setReactors]=useState({});
  useEffect(()=>{setForm({checkType:p?.kind==='spell'?'none':'fixed',skill:'',dc:'',opposedSkill:'',castingMethod:'',personalMP:'',sourceReason:'',feasible:false,rankEligible:false,sizeEligible:false});setReason('');setTarget(p?.targetIds?.[0]||'');setAmount('');setReactors({});},[p?.id]);
  if(!p)return null;
  const change=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  const send=input=>run(()=>firebaseService.combatCommand(campaignId,p.actorId,{...input,revision:encounter.combat?.revision||0}));
  const approve=()=>{const approval={...form};for(const key of ['dc','personalMP','channelDC','distance','modifier','apOverride'])if(approval[key]===''||approval[key]===undefined)delete approval[key];else approval[key]=Number(approval[key]);if(form.costText)approval.resourceCosts=form.costText;approval.consume=(form.consume||[]).filter(row=>row.itemId).map(row=>({...row,quantity:Number(row.quantity)}));return send({operation:'approve',approval});};
  const actorEntry=encounter.combatants.find(row=>row.id===p.actorId),character=characters[actorEntry?.characterId]||actorEntry||{};
  const source=combatOptions(character,window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries||[]).find(row=>row.id===p.optionId);
  return <section className="combat-gm-review"><h3>Pending action · {p.actorName}</h3><b>{p.name}</b><p>{p.note}</p><p>{p.ap} AP · {costsText(p.costs)} · {p.status.replaceAll('-',' ')}</p>{source?.fields?<p>{Object.entries(source.fields).filter(([key])=>['range','target','area','duration','castingTime','check','damage','healing'].includes(key)).map(([key,value])=>`${key}: ${value}`).join(' · ')}</p>:null}
    {p.status==='awaiting-approval'?<><div className="react-form-grid"><label>Check<select value={form.checkType} onChange={e=>change('checkType',e.target.value)}>{[['none','None / N/A'],['fixed','Fixed skill DC'],['opposed','Opposed skills'],['attack','Attack vs AC']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><label>Acting skill<input value={form.skill} onChange={e=>change('skill',e.target.value)}/></label><label>Numeric DC<ManualNumberInput value={form.dc} onChange={e=>change('dc',e.target.value)}/></label><label>Opposing skill<input value={form.opposedSkill} onChange={e=>change('opposedSkill',e.target.value)}/></label><label>Source / adjudication reason<textarea value={form.sourceReason} onChange={e=>change('sourceReason',e.target.value)}/></label></div>
      <div className="combat-checks">{[['feasible','Confirm capability, reach, hands, targets and actual action time'],['sizeEligible','Confirm size eligibility'],['rankEligible','Confirm exact spell rank / element access and World unlock if required'],['hpPayment','Approve this action’s SP/MP shortfall at 2 HP per point'],['nonlethal','Approve declared nonlethal intent'],['advantage','Advantage'],['disadvantage','Disadvantage'],['flanking','Qualifying melee flank (+2)'],['voluntaryLeavesReach','Voluntary movement leaves perceived enemy reach']].map(([key,label])=><label key={key} className="combat-check"><input type="checkbox" checked={Boolean(form[key])} onChange={e=>change(key,e.target.checked)}/>{label}</label>)}</div>
      {source?.kind==='spell'?<div className="react-form-grid"><label>Casting method<select value={form.castingMethod} onChange={e=>change('castingMethod',e.target.value)}><option value="">Choose actual method</option>{['mancer','wizard','occultist','sorcerer','summoner','warlock','witch-doctor','source-defined'].map(row=><option key={row}>{row}</option>)}</select></label><label>Actual personal MP<ManualNumberInput min="0" value={form.personalMP} onChange={e=>change('personalMP',e.target.value)} placeholder={String(source.baseMP)}/></label><label>Elemental skill (Counterspell contest)<input value={form.elementalSkill||''} onChange={e=>change('elementalSkill',e.target.value)}/></label>{form.castingMethod==='summoner'?<><label>Channel skill<input value={form.channelSkill||''} placeholder="Focus" onChange={e=>change('channelSkill',e.target.value)}/></label><label>Printed channel DC<ManualNumberInput value={form.channelDC||''} onChange={e=>change('channelDC',e.target.value)}/></label></>:null}</div>:null}
      <details><summary>Source-specific costs, components and equipment</summary><div className="react-form-grid"><label>AP override (explicit rule only)<ManualNumberInput min="0" max="3" value={form.apOverride??''} onChange={e=>change('apOverride',e.target.value)}/></label><label>Adjusted resource costs<input placeholder="10 SP + 2 BP" value={form.costText||''} onChange={e=>change('costText',e.target.value)}/></label><label>Cover<select value={form.cover||'none'} onChange={e=>change('cover',e.target.value)}>{['none','partial','substantial','full'].map(row=><option key={row}>{row}</option>)}</select></label><label>Movement distance allowance<ManualNumberInput value={form.distance??''} onChange={e=>change('distance',e.target.value)}/></label></div>
      <h4>Consume components / ammunition</h4>{(form.consume||[]).map((row,index)=><div className="react-form-grid" key={index}><label>Inventory item<select value={row.itemId} onChange={e=>change('consume',form.consume.map((item,i)=>i===index?{...item,itemId:e.target.value}:item))}><option value="">Choose exact component</option>{rows(character.inventory).map(item=><option key={item.id} value={item.id}>{item.name} ×{item.qty??1}</option>)}</select></label><label>Quantity<ManualNumberInput min="1" value={row.quantity} onChange={e=>change('consume',form.consume.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))}/></label><button onClick={()=>change('consume',form.consume.filter((_,i)=>i!==index))}>Remove</button></div>)}<button onClick={()=>change('consume',[...(form.consume||[]),{itemId:'',quantity:'1'}])}>Add component / ammunition</button><label className="combat-check"><input type="checkbox" checked={Boolean(form.recipeConfirmed)} onChange={e=>change('recipeConfirmed',e.target.checked)}/>Exact Sorcerer recipe confirmed</label></details>
      <div className="combat-buttons"><button disabled={busy} className="primary" onClick={approve}>Validate & begin</button><button disabled={busy} onClick={()=>send({operation:'reject'})}>{p.prepaidAP?'Reject resolution · keep AP spent':'Reject · no costs'}</button></div></>:null}
    {p.status==='reactions'?<><p>Confirm awareness, range and the actual trigger. Eligible reactors act in initiative order.</p>{!p.window?.length?<><div className="combat-reactor-list">{encounter.combatants.filter(row=>row.id!==p.actorId).map(row=><div key={row.id}><b>{row.name}</b><select value={reactors[row.id]?.choice||''} onChange={e=>setReactors(previous=>({...previous,[row.id]:{...previous[row.id],choice:e.target.value}}))}><option value="">No eligible reaction</option>{['dodge','block','parry','opportunity','prepared','counterspell','ability'].map(key=><option key={key}>{key}</option>)}</select><input placeholder="Trigger, awareness, range and suitability" value={reactors[row.id]?.reason||''} onChange={e=>setReactors(previous=>({...previous,[row.id]:{...previous[row.id],reason:e.target.value}}))}/>{['counterspell','ability'].includes(reactors[row.id]?.choice)?<ReactionApproval character={characters[row.characterId]||row} value={reactors[row.id]?.approval||{}} onChange={approval=>setReactors(previous=>({...previous,[row.id]:{...previous[row.id],approval}}))}/>:null}</div>)}</div><button disabled={busy} onClick={()=>send({operation:'window',reactors:Object.entries(reactors).filter(([,row])=>row.choice).map(([actorId,row])=>({actorId,choices:[row.choice],reason:row.reason,approval:row.approval||{},abilityIds:row.approval?.optionId?[row.approval.optionId]:[]}))})}>Open eligible reactions</button></>:null}{p.reaction?<button disabled={busy} onClick={()=>send({operation:'resolve-reaction',reason,success:true})}>{p.reaction.key==='counterspell'?'Roll elemental clash':'Resolve committed reaction'}</button>:<button disabled={busy} onClick={()=>send({operation:'close-window',reason})}>Close reaction window</button>}</>:null}
    {p.status==='awaiting-roll'?<button className="primary" disabled={busy} onClick={()=>send({operation:'roll'})}>Roll recorded check / confirm no check</button>:null}
    {p.result?<pre className="combat-result">{p.result.attack?`Attack ${p.result.attack.total} (d20: ${p.result.attack.die}) vs AC ${p.result.ac}. ${p.result.critical?'Critical: max base weapon dice + rolled base dice + modifiers once. ':''}${p.result.defence?`Defence ${p.result.defence.total}. `:''}${p.result.success?'Hit':'Miss / defended'}`:p.result.roll?`${p.result.roll.skill}: ${p.result.roll.total} (d20: ${p.result.roll.die}) ${p.result.opponent?`vs ${p.result.opponent.skill}: ${p.result.opponent.total}`:`vs DC ${p.result.dc}`} · ${p.result.success?'Success':'Failure'}`:p.result.success?'No check / success':'Failed or prevented'}</pre>:null}
    {['awaiting-roll','awaiting-resolution'].includes(p.status)?<><div className="react-form-grid"><label>Effect target<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">No numeric effect</option>{[...new Set([p.actorId,...p.targetIds])].map(id=><option key={id} value={id}>{encounter.combatants.find(row=>row.id===id)?.name}</option>)}</select></label><label>Resolved damage / healing amount<ManualNumberInput min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Damage type from source<input value={damageType} onChange={e=>setDamageType(e.target.value)} placeholder="e.g. fire, psychic, piercing"/></label><label>Outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}>{['manifested','failed-before-manifestation','feedback','countered'].map(row=><option key={row} value={row}>{row.replaceAll('-',' ')}</option>)}</select></label></div><label className="combat-check"><input type="checkbox" checked={healing} onChange={e=>setHealing(e.target.checked)}/>Healing rather than damage</label><label className="combat-check"><input type="checkbox" checked={sharedArea} onChange={e=>setSharedArea(e.target.checked)}/>One shared area damage roll; apply to each declared target once</label><p>Damage dice, location, areas and source-specific effects need GM adjudication. Recorded failures do not grant effects.</p><button disabled={busy||amount!==''&&!healing&&!damageType} className="primary" onClick={()=>send({operation:'resolve',reason,success:true,outcome,results:amount!==''&&target?(sharedArea?p.targetIds:[target]).map(targetId=>({targetId,...(healing?{healing:Number(amount)}:{damage:[{type:damageType.toLowerCase().trim(),amount:Number(amount)}]})})):[]})}>Apply result once</button></>:null}
    <label>GM result / correction / closure reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label>
  </section>;
}

function GMParticipant({campaignId,encounter,character,actorId,spends}) {
  const visibleEncounter=spends?{...encounter,combat:{...encounter.combat,participants:{...encounter.combat.participants,[actorId]:{...encounter.combat.participants[actorId],apSpends:spends}}}}:encounter;
  const combat=useCombatPanel(campaignId,character,visibleEncounter,true,actorId);
  return <CombatPanel combat={combat} standalone onOpen={kind=>{const option=combat.options.find(row=>row.kind===kind);if(option)combat.select(option);}}/>;
}
function GMOpeningAmbush({character,encounter,command,busy}) {
  const [targetId,setTargetId]=useState(''),[itemId,setItemId]=useState(''),[skill,setSkill]=useState(''),[reason,setReason]=useState('');
  return <details><summary>Opening ambush · one approved attack before initiative</summary><div className="react-form-grid"><label>Unaware target<select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">Choose target</option>{encounter.combatants.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Wielded weapon<select value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">Choose weapon</option>{rows(character.inventory).filter(item=>item.equipped).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Weapon skill<input value={skill} onChange={e=>setSkill(e.target.value)}/></label><label>GM approval: unnoticed attacker / feasibility<input value={reason} onChange={e=>setReason(e.target.value)}/></label></div><button disabled={busy||!targetId||!itemId||!skill||!reason} onClick={()=>command({operation:'ambush',optionId:'basic:attack',targetIds:[targetId],itemId,note:reason,approval:{checkType:'attack',skill,unnoticed:true,feasible:true,sourceReason:reason}})}>Begin approved ambush · 0 AP</button></details>;
}
function GMCombatConditions({character,encounter,command,busy}) {
  const [name,setName]=useState(''),[rank,setRank]=useState(''),[duration,setDuration]=useState(''),[unit,setUnit]=useState('until-removed'),[source,setSource]=useState('');
  return <details><summary>Conditions · exact source rank and duration</summary><div className="react-form-grid"><label>Name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Rank (when defined)<ManualNumberInput min="1" value={rank} onChange={e=>setRank(e.target.value)}/></label><label>Duration<select value={unit} onChange={e=>setUnit(e.target.value)}>{['until-removed','rounds','minutes','hours','days'].map(row=><option key={row}>{row}</option>)}</select></label>{unit!=='until-removed'?<label>Duration value<ManualNumberInput min="1" value={duration} onChange={e=>setDuration(e.target.value)}/></label>:null}<label>Source / restrictions<textarea value={source} onChange={e=>setSource(e.target.value)}/></label></div><p>Source-specific restrictions and ticks without authored effects remain GM-resolved.</p><button disabled={busy||!name||!source} onClick={()=>command({operation:'condition',condition:{name,source,description:source,...(rank?{rank:Number(rank)}:{}),duration:{unit,...(duration?{value:Number(duration)}:{})}}})}>Apply condition</button>{activeConditions(character,{encounter}).map(row=><button key={row.id} disabled={busy} onClick={()=>command({operation:'condition',condition:{action:'remove',id:row.id}})}>Remove {row.name}</button>)}</details>;
}
export function GMCombatPanel({campaignId,encounter,characters,combatState}) {
  const action=useAsyncAction();const [actorId,setActorId]=useState(''),[reason,setReason]=useState(''),[adjustment,setAdjustment]=useState('');
  const current=currentCombatant(encounter),selected=encounter.combatants?.find(row=>row.id===actorId)||current;
  if(encounter.status!=='active'||encounter.combat?.version!==1)return null;
  const character=selected?.characterId?characters[selected.characterId]:selected;
  const command=(input,id=selected?.id||'encounter')=>action.run(()=>firebaseService.combatCommand(campaignId,id,{...input,revision:encounter.combat.revision||0}));
  return <section className="combat-gm"><h3>Combat control</h3><div className="combat-roster">{(encounter.combatants||[]).map(row=>{const s=apState(encounter,row.id),c=row.characterId?characters[row.characterId]:row;return <button key={row.id} className={selected?.id===row.id?'active':''} onClick={()=>setActorId(row.id)}><b>{row.name}</b><small>{row.initiative} initiative · {s.ap} {current?.id===row.id&&!s.turnComplete?'AP':'held AP'} · bonus {s.bonus?'available':'used'}</small>{s.turnComplete?<span>Turn complete · ready for GM</span>:null}<Conditions character={c||{}} encounter={encounter}/></button>;})}</div>
    <div className="combat-gm-body"><div>{selected&&character?<><GMParticipant key={selected.id} campaignId={campaignId} encounter={encounter} character={character} actorId={selected.id} spends={combatState?.apSpends?.[selected.id]}/>{encounter.status==='ready'?<GMOpeningAmbush character={character} encounter={encounter} command={command} busy={action.busy}/>:null}<GMCombatConditions key={`conditions-${selected.id}`} character={character} encounter={encounter} command={command} busy={action.busy}/>{apState(encounter,selected.id).prepared?<><label>Qualifying prepared trigger<input value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={action.busy} onClick={()=>command({operation:'trigger-prepared',reason})}>Confirm prepared trigger</button></>:null}<details><summary>GM corrections · {selected.name}</summary><div className="react-form-grid"><label>Reason<input value={reason} onChange={e=>setReason(e.target.value)}/></label><label>HP amount<ManualNumberInput min="0" value={adjustment} onChange={e=>setAdjustment(e.target.value)}/></label></div><div className="combat-buttons"><button disabled={action.busy||!reason||adjustment===''} onClick={()=>command({operation:'correct',resource:'hp',amount:Number(adjustment),damage:true,reason})}>Apply damage</button><button disabled={action.busy||!reason||adjustment===''} onClick={()=>command({operation:'correct',resource:'hp',amount:Number(adjustment),damage:false,reason})}>Apply healing</button></div></details></>:null}
    </div><div><GMActionReview key={combatState?.pending?.id||'none'} campaignId={campaignId} encounter={encounter} characters={characters} combatState={combatState} {...action}/></div></div>
    <p role="status">{action.message}</p><details className="combat-log"><summary>Combat history</summary>{(encounter.combat.log||[]).map((row,index)=><p key={`${row.id}:${index}`}><time>{new Date(row.at).toLocaleTimeString()}</time> {row.message}</p>)}</details>
  </section>;
}
