import React, { useState } from 'react';
import { Panel, StatusPill } from '../components/WorkspaceUI.jsx';
import { ManualNumberInput } from '../components/ManualNumberInput.jsx';
import { useAsyncAction } from '../components/useAsyncAction.js';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { activeConditions, conditionDurationLabel, CONDITION_TEMPLATES } from '../state/conditionModel.mjs';
import { characterCheck, collectCharacterEffects, effectIsActive } from '../state/effectsEngine.mjs';
import { resourceDefinitions, storedResource } from '../state/resourceEngine.mjs';
import { resourcePair } from '../state/resourceValues.mjs';

const effectText=effect=>`${effect.target}: ${effect.operation || 'ADD'} ${['ADVANTAGE','DISADVANTAGE'].includes(effect.operation)?'':effect.value}`;
export function ConditionsPanel({campaignId,character,isGM=false,editable=false,clock={},style}) {
  const action=useAsyncAction(),conditions=activeConditions(character,clock);
  return <Panel title="Conditions" className="react-core-conditions react-overview-conditions" style={style} action={<StatusPill>{conditions.length} active</StatusPill>}>
    {!conditions.length?<p className="react-quiet-state">No active conditions.</p>:conditions.map(condition=><details className="react-core-condition" key={condition.id}>
      <summary><b>{condition.name}</b><small>{conditionDurationLabel(condition,clock)}</small></summary>
      <p>{condition.description}</p><small>Source: {condition.source || 'Character sheet'}</small>
      <ul>{(condition.effects || []).map((effect,index)=><li key={effect.id || index}>{effectText(effect)}</li>)}</ul>
      <p>{condition.allowPlayerRemoval?'Owner may remove this condition.':'GM controls removal.'}</p>
      {editable && (isGM || condition.allowPlayerRemoval)?<button disabled={action.busy} onClick={()=>action.run(()=>firebaseService.manageCondition(campaignId,character.id,{action:'remove',id:condition.id}))}>Remove {condition.name}</button>:null}
    </details>)}
    <p role="status">{action.message}</p>
    {isGM?<GMConditionEditor key={character.id} campaignId={campaignId} character={character} editable={editable}/>:null}
  </Panel>;
}
function GMConditionEditor({campaignId,character,editable}) {
  const action=useAsyncAction();
  const blank={name:'',description:'',source:'',duration:{unit:'until-removed',value:''},effects:[],stacking:'refresh',allowPlayerRemoval:false};
  const [draft,setDraft]=useState(blank);
  const set=(key,value)=>setDraft(previous=>({...previous,[key]:value}));
  const submit=async event=>{event.preventDefault();const result=await action.run(()=>firebaseService.manageCondition(campaignId,character.id,{...draft,action:'apply'}));if(result?.ok)setDraft(blank);};
  return <details className="react-core-editor"><summary>Apply condition or effect</summary><form onSubmit={submit}>
    <fieldset disabled={!editable || action.busy} className="react-core-form">
      <label>Template<select defaultValue="" onChange={event=>setDraft({...blank,...(CONDITION_TEMPLATES[event.target.value] || blank)})}><option value="">Custom condition</option>{Object.entries(CONDITION_TEMPLATES).map(([id,row])=><option key={id} value={id}>{row.name}</option>)}</select></label>
      <label>Name<input required maxLength={100} value={draft.name} onChange={event=>set('name',event.target.value)}/></label>
      <label>Source<input value={draft.source} onChange={event=>set('source',event.target.value)} placeholder="Spell, talent, item, or GM"/></label>
      <label>Description<textarea value={draft.description} onChange={event=>set('description',event.target.value)}/></label>
      <label>Duration<select value={draft.duration.unit} onChange={event=>set('duration',{...draft.duration,unit:event.target.value})}>{['rounds','minutes','hours','days','short-rest','long-rest','until-removed','permanent'].map(unit=><option key={unit} value={unit}>{unit.replaceAll('-',' ')}</option>)}</select></label>
      {['rounds','minutes','hours','days'].includes(draft.duration.unit)?<label>Duration amount<ManualNumberInput required min="1" value={draft.duration.value} onChange={event=>set('duration',{...draft.duration,value:event.target.value})}/></label>:null}
      <label>Stacking<select value={draft.stacking} onChange={event=>set('stacking',event.target.value)}>{['refresh','replace','stack','strongest'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="react-core-checkbox"><input type="checkbox" checked={draft.allowPlayerRemoval} onChange={event=>set('allowPlayerRemoval',event.target.checked)}/>Owner may remove</label>
      {draft.effects.map((effect,index)=><div className="react-core-effect-row" key={index}>
        <label>Target<input required list="asteria-effect-targets" value={effect.target} onChange={event=>set('effects',draft.effects.map((row,i)=>i===index?{...row,target:event.target.value}:row))}/></label>
        <label>Operation<select value={effect.operation} onChange={event=>set('effects',draft.effects.map((row,i)=>i===index?{...row,operation:event.target.value}:row))}>{['ADD','SUBTRACT','MULTIPLY','SET','MIN','MAX','ADVANTAGE','DISADVANTAGE'].map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Value<ManualNumberInput required step="any" value={effect.value} onChange={event=>set('effects',draft.effects.map((row,i)=>i===index?{...row,value:event.target.value}:row))}/></label>
        <button type="button" onClick={()=>set('effects',draft.effects.filter((_,i)=>i!==index))}>Remove effect</button>
      </div>)}
      <datalist id="asteria-effect-targets">{['ac','STR','DEX','AGI','CON','END','INT','WIS','CHA','LUCK','hp.maximum','sp.maximum','mp.maximum','movement','initiative','skills','checks','damage','carrying-capacity'].map(value=><option key={value} value={value}/>)}</datalist>
      <small>ADD/SUBTRACT change a value; MULTIPLY uses a factor (0.8 is −20%). MIN sets a ceiling; MAX sets a floor. Conditional combat outcomes still require GM resolution.</small>
      <button type="button" disabled={draft.effects.length>=20} onClick={()=>set('effects',[...draft.effects,{target:'ac',operation:'ADD',value:''}])}>Add mechanical effect</button>
      <button className="primary" type="submit">Apply condition</button>
    </fieldset><p role="status">{action.message}</p>
  </form></details>;
}
export function EffectsSummary({character,clock={},style}) {
  const effects=collectCharacterEffects(character,clock).filter(effect=>effectIsActive(effect,clock) && (effect.value!==0 || ['SET','ADVANTAGE','DISADVANTAGE'].includes(effect.operation)) && !(effect.operation==='MULTIPLY'&&effect.value===1));
  const check=characterCheck(character,'skills',0,clock);
  return <Panel title="Character Effects" className="react-core-effects" style={style}>
    <p>Skill check modifier: {check.value>=0?'+':''}{check.value}{check.advantage?' · Advantage':check.disadvantage?' · Disadvantage':''}</p>
    {effects.length?<ul className="react-core-effect-list">{effects.map(effect=><li key={effect.id}><b>{effect.name}</b><span>{effectText(effect)}{effect.conditional?' · Conditional':''}</span></li>)}</ul>:<p>No mechanical modifiers are active.</p>}
  </Panel>;
}
const recoveryText=rule=>!rule || rule.mode==='none'?'No recovery':rule.mode==='full'?'Restore to maximum':rule.mode==='set'?`Reset to ${rule.value}`:rule.mode==='fraction'?`Restore ${rule.value*100}% of maximum`:rule.mode==='reduce-fraction'?`Reduce current by ${rule.value*100}%`:`Restore ${rule.value}`;
export function RestRules({character}) {
  return <div className="react-core-table"><table><caption>Resource recovery rules</caption><thead><tr><th>Resource</th><th>Short Rest</th><th>Long Rest</th></tr></thead><tbody>{resourceDefinitions(character).map(row=><tr key={row.id}><th>{row.name}</th><td>{recoveryText(row.recovery?.short)}</td><td>{recoveryText(row.recovery?.long)}</td></tr>)}</tbody></table>{character.talentRestBonus>0?<small>Mystic Recovery increases percentage recovery by {Math.round(character.talentRestBonus*100)}%.</small>:null}</div>;
}
export function RestRequestsPanel({campaignId,characters,editable}) {
  const action=useAsyncAction(),pending=Object.values(characters || {}).filter(character=>character.restState?.request?.status==='pending');
  return <Panel title="Long Rest Requests" className="react-core-rest-requests" action={<StatusPill>{pending.length} pending</StatusPill>}>
    {!pending.length?<p>No pending requests.</p>:pending.map(character=><RestRequest key={character.restState.request.id} character={character} campaignId={campaignId} editable={editable} action={action}/>)}<p role="status">{action.message}</p>
  </Panel>;
}
function RestRequest({character,campaignId,editable,action}) {
  const request=character.restState.request,[note,setNote]=useState(''),[soul,setSoul]=useState(String(request.soulRecovery || 0));
  const review=status=>action.run(()=>firebaseService.reviewRest(campaignId,character.id,{id:request.id,status,note,soulRecovery:Number(soul)}));
  return <article className="react-core-rest-request"><b>{character.name}</b><label>Review note<input value={note} onChange={event=>setNote(event.target.value)}/></label><label>Soul recovery approved<ManualNumberInput min="0" value={soul} onChange={event=>setSoul(event.target.value)}/></label><div className="react-rest-actions"><button className="primary" disabled={!editable||action.busy||soul===''} onClick={()=>review('approved')}>Approve Long Rest</button><button disabled={!editable||action.busy} onClick={()=>review('denied')}>Deny</button></div></article>;
}
export function ResourceRulesPanel({campaignId,character,editable}) {
  const action=useAsyncAction(),[draft,setDraft]=useState(null);
  const choose=id=>{
    const rule=resourceDefinitions(character).find(row=>row.id===id);
    setDraft(rule?{...rule,maximum:character.resourceState?.[id]?.baseMaximum ?? resourcePair(storedResource(character,id))[1]}:{id:'',name:'',minimum:0,maximum:'',recovery:{},reset:{},regeneration:null});
  };
  const set=(key,value)=>setDraft(previous=>({...previous,[key]:value}));
  const submit=async event=>{event.preventDefault();await action.run(()=>firebaseService.configureResource(campaignId,character.id,draft));};
  return <Panel title={`${character.name || 'Character'} Resource Rules`} className="react-core-resources">
    <RestRules character={character}/><label>Configure resource<select value={draft?.id || ''} onChange={event=>choose(event.target.value)}><option value="">New resource…</option>{resourceDefinitions(character).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button disabled={!editable||action.busy} onClick={()=>choose('')}>Add resource</button>
    {draft?<form onSubmit={submit}><fieldset className="react-core-form" disabled={!editable||action.busy}>
      <label>Resource ID<input required pattern="[a-z][a-z0-9-]{0,39}" value={draft.id} onChange={event=>set('id',event.target.value)}/></label><label>Name<input required value={draft.name} onChange={event=>set('name',event.target.value)}/></label>
      <label>Minimum<ManualNumberInput min="0" required value={draft.minimum} onChange={event=>set('minimum',event.target.value)}/></label><label>Base maximum<ManualNumberInput min="0" required value={draft.maximum} onChange={event=>set('maximum',event.target.value)}/></label>
      {['short','long'].map(type=><div key={type}><label>{type==='short'?'Short Rest':'Long Rest'}<select value={draft.recovery?.[type]?.mode || 'none'} onChange={event=>set('recovery',{...draft.recovery,[type]:{mode:event.target.value,value:0}})}>{['none','full','amount','fraction','reduce-fraction','set'].map(mode=><option key={mode}>{mode}</option>)}</select></label><label>Recovery amount or fraction<ManualNumberInput step="any" min="0" value={draft.recovery?.[type]?.value ?? ''} onChange={event=>set('recovery',{...draft.recovery,[type]:{mode:draft.recovery?.[type]?.mode || 'none',value:event.target.value}})}/></label></div>)}
      <label className="react-core-checkbox"><input type="checkbox" checked={Boolean(draft.allowOverflow)} onChange={event=>set('allowOverflow',event.target.checked)}/>Allow values above maximum (such as Blood Point burden)</label>
      <label className="react-core-checkbox"><input type="checkbox" checked={Boolean(draft.regeneration)} onChange={event=>set('regeneration',event.target.checked?{amount:'',intervalMs:'',inCombat:false}:null)}/>Regeneration</label>
      {draft.regeneration?<><label>Amount per interval<ManualNumberInput min="0" required value={draft.regeneration.amount} onChange={event=>set('regeneration',{...draft.regeneration,amount:event.target.value})}/></label><label>Interval in seconds<ManualNumberInput min="1" required value={draft.regeneration.intervalMs?Number(draft.regeneration.intervalMs)/1000:''} onChange={event=>set('regeneration',{...draft.regeneration,intervalMs:Number(event.target.value)*1000})}/></label><label className="react-core-checkbox"><input type="checkbox" checked={draft.regeneration.inCombat} onChange={event=>set('regeneration',{...draft.regeneration,inCombat:event.target.checked})}/>Regenerate during combat</label></>:null}
      {['combat-start','combat-end','unconscious'].map(trigger=><label key={trigger}>Reset on {trigger.replaceAll('-',' ')} (blank keeps current)<ManualNumberInput min="0" value={draft.reset?.[trigger] ?? ''} onChange={event=>{const reset={...draft.reset};if(event.target.value==='')delete reset[trigger];else reset[trigger]=Number(event.target.value);set('reset',reset);}}/></label>)}
      <button className="primary" type="submit">Save resource rules</button>
    </fieldset></form>:null}<p role="status">{action.message}</p>
  </Panel>;
}
