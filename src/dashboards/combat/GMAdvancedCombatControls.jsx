import React,{useEffect,useState} from 'react';
import {ManualNumberInput} from '../../components/ManualNumberInput.jsx';
import {useAsyncAction} from '../../components/useAsyncAction.js';
import {combatOptions,currentCombatant,rows} from '../../state/combatRules.mjs';
import {activeConditions} from '../../state/conditionModel.mjs';
const costsText=costs=>Object.entries(costs||{}).filter(([,n])=>n>0).map(([key,n])=>String(n)+' '+key.toUpperCase()).join(' · ')||'No resource cost';
function ReactionApproval({character,value={},onChange}) {
  const change=(key,next)=>onChange({...value,[key]:next});
  const options=combatOptions(character,window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries||[]).filter(row=>['spell','talent','technique'].includes(row.kind));
  return <div className="react-form-grid" style={{gridColumn:'1 / -1'}}><label>Owned reaction source<select value={value.optionId||''} onChange={e=>change('optionId',e.target.value)}><option value="">Choose actual ability / rank</option>{options.map(option=><option key={option.id} value={option.id}>{option.name} · {option.rank||''}</option>)}</select></label><label>Casting method<select value={value.castingMethod||''} onChange={e=>change('castingMethod',e.target.value)}><option value="">Not a spell / choose method</option>{['mancer','wizard','occultist','sorcerer','summoner','warlock','witch-doctor','source-defined'].map(row=><option key={row}>{row}</option>)}</select></label><label>Elemental skill<input value={value.elementalSkill||''} onChange={e=>change('elementalSkill',e.target.value)}/></label><label>Element relationship<select value={value.elementRelation||''} onChange={e=>change('elementRelation',e.target.value)}><option value="">Choose approved relationship</option><option value="same">Same (−2)</option><option value="opposite">Opposite (0)</option></select></label><label>Source / cost / eligibility approval<input value={value.sourceReason||''} onChange={e=>change('sourceReason',e.target.value)}/></label><label className="combat-check"><input type="checkbox" checked={Boolean(value.feasible)} onChange={e=>onChange({...value,feasible:e.target.checked,rankEligible:e.target.checked,triggerConfirmed:e.target.checked})}/>Confirmed actual reaction permission, rank access, prerequisites and range</label></div>;
}
function HybridPhysicalDiceEntry({busy,onSubmit,actionId}){
  const [primary,setPrimary]=useState(''),[defence,setDefence]=useState(''),
    [opposed,setOpposed]=useState(''),[error,setError]=useState('');
  useEffect(()=>{setPrimary('');setDefence('');setOpposed('');setError('');},[actionId]);
  const parse=value=>{
    const text=value.trim();
    if(!text)return null;
    if(!/^(?:[1-9]|1[0-9]|20)(?:\s*,\s*(?:[1-9]|1[0-9]|20))?$/.test(text))
      throw Error('Enter one or two d20 faces (1–20), separated by a comma.');
    return text.split(',').map(Number);
  };
  const submitPhysical=()=>{
    try{
      const dice={};
      for(const [key,value] of [['primary',primary],['defence',defence],['opposed',opposed]]){
        const faces=parse(value);
        if(faces)dice[key]=faces;
      }
      if(!dice.primary)throw Error('Enter the primary physical d20 result.');
      setError('');onSubmit({operation:'roll',physicalDice:dice});
    }catch(failure){setError(failure.message);}
  };
  return <div className="combat-react-form" data-testid="hybrid-physical-dice">
    <p>Choose automatic digital dice or record physical d20 faces. Use two faces
      for advantage/disadvantage. Unentered defence or opposed checks use digital dice.
      The GM still approves and resolves the outcome through the combat engine.</p>
    <div className="react-form-grid">
      <label>Physical primary d20<input value={primary} disabled={busy}
        placeholder="e.g. 14 or 14, 8" onChange={e=>setPrimary(e.target.value)}/></label>
      <label>Physical defence d20 (optional)<input value={defence} disabled={busy}
        placeholder="GM reaction roll" onChange={e=>setDefence(e.target.value)}/></label>
      <label>Physical opposed d20 (optional)<input value={opposed} disabled={busy}
        placeholder="Opposing check" onChange={e=>setOpposed(e.target.value)}/></label>
    </div>
    {error?<p role="alert">{error}</p>:null}
    <button type="button" className="primary" disabled={busy}
      onClick={()=>onSubmit({operation:'roll'})}>Roll digitally</button>
    <button type="button" disabled={busy||!primary.trim()}
      onClick={submitPhysical}>Record physical dice</button>
  </div>;
}
function GMActionReview({api,campaignId,encounter,characters,combatState,run,busy}) {
  const p=combatState?.pending;
  const [form,setForm]=useState({checkType:'none',skill:'',dc:'',opposedSkill:'',castingMethod:'',personalMP:'',sourceReason:'',feasible:false,rankEligible:false,sizeEligible:false}),[reason,setReason]=useState(''),[target,setTarget]=useState(''),[amount,setAmount]=useState(''),[healing,setHealing]=useState(false),[damageType,setDamageType]=useState(''),[sharedArea,setSharedArea]=useState(false),[outcome,setOutcome]=useState('manifested'),[reactors,setReactors]=useState({});
  useEffect(()=>{setForm({checkType:p?.kind==='spell'?'none':'fixed',skill:'',dc:'',opposedSkill:'',castingMethod:'',personalMP:'',sourceReason:'',feasible:false,rankEligible:false,sizeEligible:false});setReason('');setTarget(p?.targetIds?.[0]||'');setAmount('');setReactors({});},[p?.id]);
  if(!p)return null;
  const change=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  const send=input=>run(()=>api.commandGM(campaignId,p.actorId,{...input,revision:encounter.combat?.revision||0}));
  const approve=()=>{const approval={...form};for(const key of ['dc','personalMP','channelDC','distance','modifier','apOverride'])if(approval[key]===''||approval[key]===undefined)delete approval[key];else approval[key]=Number(approval[key]);if(form.costText)approval.resourceCosts=form.costText;approval.consume=(form.consume||[]).filter(row=>row.itemId).map(row=>({...row,quantity:Number(row.quantity)}));return send({operation:'approve',approval});};
  const actorEntry=encounter.combatants.find(row=>row.id===p.actorId),character=characters[actorEntry?.characterId]||actorEntry||{};
  const source=combatOptions(character,window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries||[]).find(row=>row.id===p.optionId);
  const mapTravel=encounter.battleMapId&&(source?.key==='jump'||['spell','talent'].includes(source?.kind));
  return <section className="combat-gm-review"><h3>Pending action · {p.actorName}</h3><b>{p.name}</b><p>{p.note}</p><p>{p.ap} AP · {costsText(p.costs)} · {p.status.replaceAll('-',' ')}</p>{source?.fields?<p>{Object.entries(source.fields).filter(([key])=>['range','target','area','duration','castingTime','check','damage','healing'].includes(key)).map(([key,value])=>`${key}: ${value}`).join(' · ')}</p>:null}
    {p.mapMove?<p>Confirmed route: {Number(p.mapMove.distance.toFixed(2))} m. Check the route on the combat map and confirm any applicable reactions.</p>:null}
    {p.status==='awaiting-approval'?<><div className="react-form-grid"><label>Check<select value={form.checkType} onChange={e=>change('checkType',e.target.value)}>{[['none','None / N/A'],['fixed','Fixed skill DC'],['opposed','Opposed skills'],['attack','Attack vs AC']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><label>Acting skill<input value={form.skill} onChange={e=>change('skill',e.target.value)}/></label><label>Numeric DC<ManualNumberInput value={form.dc} onChange={e=>change('dc',e.target.value)}/></label><label>Opposing skill<input value={form.opposedSkill} onChange={e=>change('opposedSkill',e.target.value)}/></label><label>Source / adjudication reason<textarea value={form.sourceReason} onChange={e=>change('sourceReason',e.target.value)}/></label></div>
      <div className="combat-checks">{[['feasible','Confirm capability, reach, hands, targets and actual action time'],['sizeEligible','Confirm size eligibility'],['rankEligible','Confirm exact spell rank / element access and World unlock if required'],['hpPayment','Approve this action’s SP/MP shortfall at 2 HP per point'],['nonlethal','Approve declared nonlethal intent'],['advantage','Advantage'],['disadvantage','Disadvantage'],['flanking','Qualifying melee flank (+2)'],['voluntaryLeavesReach','Voluntary movement leaves perceived enemy reach']].map(([key,label])=><label key={key} className="combat-check"><input type="checkbox" checked={Boolean(form[key])} onChange={e=>change(key,e.target.checked)}/>{label}</label>)}</div>
      {source?.kind==='spell'?<div className="react-form-grid"><label>Casting method<select value={form.castingMethod} onChange={e=>change('castingMethod',e.target.value)}><option value="">Choose actual method</option>{['mancer','wizard','occultist','sorcerer','summoner','warlock','witch-doctor','source-defined'].map(row=><option key={row}>{row}</option>)}</select></label><label>Actual personal MP<ManualNumberInput min="0" value={form.personalMP} onChange={e=>change('personalMP',e.target.value)} placeholder={String(source.baseMP)}/></label><label>Elemental skill (Counterspell contest)<input value={form.elementalSkill||''} onChange={e=>change('elementalSkill',e.target.value)}/></label>{form.castingMethod==='summoner'?<><label>Channel skill<input value={form.channelSkill||''} placeholder="Focus" onChange={e=>change('channelSkill',e.target.value)}/></label><label>Printed channel DC<ManualNumberInput value={form.channelDC||''} onChange={e=>change('channelDC',e.target.value)}/></label></>:null}</div>:null}
      <details><summary>Source-specific costs, components and equipment</summary><div className="react-form-grid"><label>AP override (explicit rule only)<ManualNumberInput min="0" max="3" value={form.apOverride??''} onChange={e=>change('apOverride',e.target.value)}/></label><label>Adjusted resource costs<input placeholder="10 SP + 2 BP" value={form.costText||''} onChange={e=>change('costText',e.target.value)}/></label><label>Cover<select value={form.cover||'none'} onChange={e=>change('cover',e.target.value)}>{['none','partial','substantial','full'].map(row=><option key={row}>{row}</option>)}</select></label><label>Movement distance allowance<ManualNumberInput value={form.distance??''} onChange={e=>change('distance',e.target.value)}/></label></div>
      <h4>Consume components / ammunition</h4>{(form.consume||[]).map((row,index)=><div className="react-form-grid" key={index}><label>Inventory item<select value={row.itemId} onChange={e=>change('consume',form.consume.map((item,i)=>i===index?{...item,itemId:e.target.value}:item))}><option value="">Choose exact component</option>{rows(character.inventory).map(item=><option key={item.id} value={item.id}>{item.name} ×{item.qty??1}</option>)}</select></label><label>Quantity<ManualNumberInput min="1" value={row.quantity} onChange={e=>change('consume',form.consume.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))}/></label><button onClick={()=>change('consume',form.consume.filter((_,i)=>i!==index))}>Remove</button></div>)}<button onClick={()=>change('consume',[...(form.consume||[]),{itemId:'',quantity:'1'}])}>Add component / ammunition</button><label className="combat-check"><input type="checkbox" checked={Boolean(form.recipeConfirmed)} onChange={e=>change('recipeConfirmed',e.target.checked)}/>Exact Sorcerer recipe confirmed</label></details>
      {mapTravel?<label>Map movement granted by the source<select value={form.mapTravel||''}
        onChange={event=>change('mapTravel',event.target.value)}>
        <option value="">No map movement</option><option value="jump">Jump to a landing cell</option>
        {source?.key!=='jump'?<><option value="ground">Additional ground movement</option>
          <option value="teleport">Teleport to a destination</option></>:null}
      </select></label>:null}
      <div className="combat-buttons"><button disabled={busy} className="primary" onClick={approve}>Validate & begin</button><button disabled={busy} onClick={()=>send({operation:'reject'})}>{p.prepaidAP?'Reject resolution · keep AP spent':'Reject · no costs'}</button></div></>:null}
    {p.status==='reactions'?<><p>Confirm awareness, range and the actual trigger. Eligible reactors act in initiative order.</p>{!p.window?.length?<><div className="combat-reactor-list">{encounter.combatants.filter(row=>row.id!==p.actorId).map(row=><div key={row.id}><b>{row.name}</b><select value={reactors[row.id]?.choice||''} onChange={e=>setReactors(previous=>({...previous,[row.id]:{...previous[row.id],choice:e.target.value}}))}><option value="">No eligible reaction</option>{['dodge','block','parry','opportunity','prepared','counterspell','ability'].map(key=><option key={key}>{key}</option>)}</select><input placeholder="Trigger, awareness, range and suitability" value={reactors[row.id]?.reason||''} onChange={e=>setReactors(previous=>({...previous,[row.id]:{...previous[row.id],reason:e.target.value}}))}/>{['counterspell','ability'].includes(reactors[row.id]?.choice)?<ReactionApproval character={characters[row.characterId]||row} value={reactors[row.id]?.approval||{}} onChange={approval=>setReactors(previous=>({...previous,[row.id]:{...previous[row.id],approval}}))}/>:null}</div>)}</div><button disabled={busy} onClick={()=>send({operation:'window',reactors:Object.entries(reactors).filter(([,row])=>row.choice).map(([actorId,row])=>({actorId,choices:[row.choice],reason:row.reason,approval:row.approval||{},abilityIds:row.approval?.optionId?[row.approval.optionId]:[]}))})}>Open eligible reactions</button></>:null}{p.reaction?<button disabled={busy} onClick={()=>send({operation:'resolve-reaction',reason,success:true})}>{p.reaction.key==='counterspell'?'Roll elemental clash':'Resolve committed reaction'}</button>:<button disabled={busy} onClick={()=>send({operation:'close-window',reason})}>Close reaction window</button>}</>:null}
    {p.status==='awaiting-roll'?<HybridPhysicalDiceEntry
      key={p.id} actionId={p.id} busy={busy} onSubmit={send}/>:null}
    {p.result?<pre className="combat-result">{p.result.attack?`Attack ${p.result.attack.total} (d20: ${p.result.attack.die}) vs AC ${p.result.ac}. ${p.result.critical?'Critical: max base weapon dice + rolled base dice + modifiers once. ':''}${p.result.defence?`Defence ${p.result.defence.total}. `:''}${p.result.success?'Hit':'Miss / defended'}`:p.result.roll?`${p.result.roll.skill}: ${p.result.roll.total} (d20: ${p.result.roll.die}) ${p.result.opponent?`vs ${p.result.opponent.skill}: ${p.result.opponent.total}`:`vs DC ${p.result.dc}`} · ${p.result.success?'Success':'Failure'}`:p.result.success?'No check / success':'Failed or prevented'}</pre>:null}
    {['awaiting-roll','awaiting-resolution'].includes(p.status)?<><div className="react-form-grid"><label>Effect target<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">No numeric effect</option>{[...new Set([p.actorId,...p.targetIds])].map(id=><option key={id} value={id}>{encounter.combatants.find(row=>row.id===id)?.name}</option>)}</select></label><label>Resolved damage / healing amount<ManualNumberInput min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Damage type from source<input value={damageType} onChange={e=>setDamageType(e.target.value)} placeholder="e.g. fire, psychic, piercing"/></label><label>Outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}>{['manifested','failed-before-manifestation','feedback','countered'].map(row=><option key={row} value={row}>{row.replaceAll('-',' ')}</option>)}</select></label></div><label className="combat-check"><input type="checkbox" checked={healing} onChange={e=>setHealing(e.target.checked)}/>Healing rather than damage</label><label className="combat-check"><input type="checkbox" checked={sharedArea} onChange={e=>setSharedArea(e.target.checked)}/>One shared area damage roll; apply to each declared target once</label><p>Damage dice, location, areas and source-specific effects need GM adjudication. Recorded failures do not grant effects.</p><button disabled={busy||amount!==''&&!healing&&!damageType} className="primary" onClick={()=>send({operation:'resolve',reason,success:true,outcome,results:amount!==''&&target?(sharedArea?p.targetIds:[target]).map(targetId=>({targetId,...(healing?{healing:Number(amount)}:{damage:[{type:damageType.toLowerCase().trim(),amount:Number(amount)}]})})):[]})}>Apply result once</button></>:null}
    <label>GM result / correction / closure reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000}/></label>
  </section>;
}


function GMOpeningAmbush({character,encounter,command,busy}) {
  const [targetId,setTargetId]=useState(''),[itemId,setItemId]=useState(''),[skill,setSkill]=useState(''),[reason,setReason]=useState('');
  return <details><summary>Opening ambush · one approved attack before initiative</summary><div className="react-form-grid"><label>Unaware target<select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">Choose target</option>{encounter.combatants.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Wielded weapon<select value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">Choose weapon</option>{rows(character.inventory).filter(item=>item.equipped).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Weapon skill<input value={skill} onChange={e=>setSkill(e.target.value)}/></label><label>GM approval: unnoticed attacker / feasibility<input value={reason} onChange={e=>setReason(e.target.value)}/></label></div><button disabled={busy||!targetId||!itemId||!skill||!reason} onClick={()=>command({operation:'ambush',optionId:'basic:attack',targetIds:[targetId],itemId,note:reason,approval:{checkType:'attack',skill,unnoticed:true,feasible:true,sourceReason:reason}})}>Begin approved ambush · 0 AP</button></details>;
}
function GMCombatConditions({character,encounter,command,busy}) {
  const [name,setName]=useState(''),[rank,setRank]=useState(''),[duration,setDuration]=useState(''),[unit,setUnit]=useState('until-removed'),[source,setSource]=useState('');
  return <details><summary>Conditions · exact source rank and duration</summary><div className="react-form-grid"><label>Name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Rank (when defined)<ManualNumberInput min="1" value={rank} onChange={e=>setRank(e.target.value)}/></label><label>Duration<select value={unit} onChange={e=>setUnit(e.target.value)}>{['until-removed','rounds','minutes','hours','days'].map(row=><option key={row}>{row}</option>)}</select></label>{unit!=='until-removed'?<label>Duration value<ManualNumberInput min="1" value={duration} onChange={e=>setDuration(e.target.value)}/></label>:null}<label>Source / restrictions<textarea value={source} onChange={e=>setSource(e.target.value)}/></label></div><p>Source-specific restrictions and ticks without authored effects remain GM-resolved.</p><button disabled={busy||!name||!source} onClick={()=>command({operation:'condition',condition:{name,source,description:source,...(rank?{rank:Number(rank)}:{}),duration:{unit,...(duration?{value:Number(duration)}:{})}}})}>Apply condition</button>{activeConditions(character,{encounter}).map(row=><button key={row.id} disabled={busy} onClick={()=>command({operation:'condition',condition:{action:'remove',id:row.id}})}>Remove {row.name}</button>)}</details>;
}

/** Advanced GM adjudication migrated from the previous GM combat panel.
 * Combat state and all writes still come from the ONE established server command.
 */
/** Single advanced GM action queue backed by the existing authenticated combat service. */
export function GMAdvancedActionQueue({api,campaignId,encounter={},characters={},combatState={}}){
  const action=useAsyncAction();
  return <section aria-label="GM Action Queue" data-testid="site-gm-live-pending">
    {combatState?.pending?<GMActionReview key={combatState.pending.id}
      api={api} campaignId={campaignId} encounter={encounter}
      characters={characters} combatState={combatState} {...action}/>:
      <p>No GM adjudication is waiting.</p>}
    {action.message?<p role="status">{action.message}</p>:null}
  </section>;
}
export function GMAdvancedCombatControls({api,campaignId,encounter={},characters={}}){
 const action=useAsyncAction();
 const [actorId,setActorId]=useState('');
 const current=currentCombatant(encounter);
 const selected=(encounter.combatants||[]).find(row=>row.id===actorId)||current;
 const character=selected?.characterId?characters[selected.characterId]:selected;
 const command=(input,id=selected?.id||'encounter')=>action.run(()=>
  api.commandGM(campaignId,id,{...input,revision:encounter.combat?.revision||0}));
 return <section aria-label="Advanced GM combat adjudication" data-testid="site-combat-gm-advanced">
  <details><summary>Advanced adjudication, reactions and conditions</summary>
   {selected?<label>Select combatant<select value={selected.id} onChange={e=>setActorId(e.target.value)}>
     {(encounter.combatants||[]).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
    </select></label>:null}
   
   {selected&&character?<GMCombatConditions character={character} encounter={encounter}
    command={command} busy={action.busy}/>:null}
   {encounter.status==='ready'&&selected&&character?
    <GMOpeningAmbush character={character} encounter={encounter}
     command={command} busy={action.busy}/>:null}
   {action.message?<p role="status">{action.message}</p>:null}
  </details>
 </section>;
}
