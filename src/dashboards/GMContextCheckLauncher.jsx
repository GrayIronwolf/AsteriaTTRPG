import React,{useEffect,useRef,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {UNIVERSAL_CHECK_RANKS,UNIVERSAL_CHARACTERISTICS,UNIVERSAL_CHECK_TYPES} from '../state/universalCheckModel.mjs';

const presets={
  npc:[
    ['persuasion','Persuasion','charisma'],['deception','Deception','charisma'],
    ['intimidation','Intimidation','charisma'],['insight','Insight','wisdom'],
    ['perception','Perception','wisdom'],['custom','Custom skill','']
  ],
  merchant:[
    ['haggling','Haggling','charisma'],['persuasion','Persuasion','charisma'],
    ['deception','Deception','charisma'],['insight','Insight','wisdom'],
    ['custom','Custom skill','']
  ],
  gameplay:[
    ['perception','Perception','wisdom'],['survival','Survival','wisdom'],
    ['athletics','Athletics','strength'],['investigation','Investigation','intelligence'],
    ['custom','Custom skill','']
  ]
};
export function contextualCheckStatus(row={}){
  const value=row.gmOutcome||row.result?.outcome||row.status||'pending';
  return {value,final:row.status==='acknowledged'||row.status==='cancelled',
    total:row.result?.total??null};
}
/** Embedded in existing GM workspaces; does not change merchant funds or standing. */
export function GMContextCheckLauncher({campaignId,characters={},context,title='Request player check',initialCharacterId=''}) {
  const [expanded,setExpanded]=useState(false);
  const [selected,setSelected]=useState(initialCharacterId);
  const [participantIds,setParticipantIds]=useState([]);
  const [type,setType]=useState(context?.kind==='merchant-deal'?'social':'skill');
  const [preset,setPreset]=useState(context?.kind==='merchant-deal'?'haggling':context?.kind==='gameplay'?'perception':'persuasion');
  const [customSkill,setCustomSkill]=useState('');
  const [stat,setStat]=useState(context?.kind==='merchant-deal'?'charisma':'charisma');
  const [rankOverride,setRankOverride]=useState('');
  const [dc,setDc]=useState('15');
  const [modifier,setModifier]=useState('0');
  const [advantage,setAdvantage]=useState(false);
  const [disadvantage,setDisadvantage]=useState(false);
  const [instructions,setInstructions]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [history,setHistory]=useState([]);
  const [includeHistory,setIncludeHistory]=useState(false);
  const operation=useRef(null);
  const contextKey=JSON.stringify(context||{});
  useEffect(()=>{
    setSelected(initialCharacterId||'');setParticipantIds([]);
    setType(context?.kind==='merchant-deal'?'social':'skill');
    setPreset(context?.kind==='merchant-deal'?'haggling':context?.kind==='gameplay'?'perception':'persuasion');
    setStat('charisma');setExpanded(false);setNotice('');setError('');
    operation.current=null;
  },[campaignId,contextKey,initialCharacterId,context?.kind]);
  useEffect(()=>{
    if(!campaignId||!context)return undefined;
    return firebaseService.subscribeUniversalChecks(campaignId,rows=>setHistory(rows.filter(row=>{
      const source=row.context;
      if(!source||source.kind!==context.kind)return false;
      if(context.kind==='npc')return source.npcId===context.npcId;
      if(context.kind==='merchant-deal')return source.dealId===context.dealId&&source.shopId===context.shopId;
      if(context.kind==='merchant')return source.shopId===context.shopId;
      return source.label===context.label;
    })),{gm:true});
  },[campaignId,contextKey]);
  if(!context||!campaignId)return null;
  const options=presets[context.kind==='npc'?'npc':context.kind==='gameplay'?'gameplay':'merchant'];
  const chosen=options.find(row=>row[0]===preset);
  const skill=preset==='custom'?customSkill:chosen?.[1]||'';
  const chosenStat=stat||chosen?.[2]||'';
  const multi=type==='group'||type==='opposed';
  const valid=Number.isInteger(Number(dc))&&dc.trim()!==''&&Number(dc)>=0&&Number(dc)<=1000&&
    Number.isInteger(Number(modifier))&&modifier.trim()!==''&&Math.abs(Number(modifier))<=100;
  const roster=Object.values(characters).filter(row=>row?.id&&row?.ownerUid);
  const send=async event=>{
    event.preventDefault();
    const ids=multi?participantIds:[selected];
    if(busy||!valid||(multi?ids.length<2||type==='opposed'&&ids.length!==2:!selected)||!chosenStat||!skill.trim())return;
    const payload={campaignId,action:'create',type,characterId:ids[0],
      ...(multi?{characterIds:ids}:{}),
      characteristic:chosenStat,skill:skill.trim(),dc:type==='opposed'?0:Number(dc),rankOverride,
      context,description:instructions.slice(0,500),
      modifiers:[{label:'Situational modifier',value:Number(modifier)}],
      advantage,disadvantage};
    const fingerprint=JSON.stringify(payload);
    if(operation.current?.fingerprint!==fingerprint)
      operation.current={fingerprint,id:crypto.randomUUID()};
    setBusy(true);setError('');setNotice('');
    try{
      const result=await firebaseService.universalCheckAction({...payload,operationId:operation.current.id});
      if(!result?.ok)throw Error(result?.error||'Check request failed.');
      operation.current=null;
      setNotice('Check sent. The selected player will see it in their campaign dashboard.');
      setInstructions('');setExpanded(false);
    }catch(err){setError(err?.message||'Unable to send check.');}
    finally{setBusy(false);}
  };
  return <section className="react-panel" aria-label={title}>
    <h4>{title}</h4>
    <p>{context.label}{context.detail?' · '+context.detail:''}</p>
    <button type="button" onClick={()=>setExpanded(!expanded)}>
      {expanded?'Close check composer':'Request player check'}
    </button>
    {expanded?<form onSubmit={send}>
      {context.kind!=='merchant-deal'?<label>Check type<select value={type} onChange={event=>{setType(event.target.value);setParticipantIds([]);}}>
        {UNIVERSAL_CHECK_TYPES.filter(value=>!['characteristic','saving'].includes(value)).map(value=><option key={value} value={value}>{value}</option>)}
      </select></label>:null}
      {multi?<fieldset><legend>Choose participants</legend>
        {roster.map(row=><label key={row.id}><input type="checkbox"
          checked={participantIds.includes(row.id)} onChange={event=>setParticipantIds(old=>event.target.checked?
            [...old,row.id]:old.filter(value=>value!==row.id))}/>{row.name||row.id}</label>)}
      </fieldset>:<label>Player character<select required value={selected}
        disabled={Boolean(initialCharacterId)} onChange={event=>setSelected(event.target.value)}>
        <option value="">Select a linked character</option>
        {roster.map(row=><option key={row.id} value={row.id}>{row.name||row.id}</option>)}
      </select></label>}
      <label>Suggested check<select value={preset} onChange={event=>{
        const value=event.target.value;
        setPreset(value);
        const selectedPreset=options.find(item=>item[0]===value);
        if(selectedPreset?.[2])setStat(selectedPreset[2]);
      }}>
        {options.map(item=><option key={item[0]} value={item[0]}>{item[1]}</option>)}
      </select></label>
      {preset==='custom'?<label>Skill name<input required maxLength={100} value={customSkill}
        onChange={event=>setCustomSkill(event.target.value)}/></label>:null}
      <label>Governing characteristic<select required value={chosenStat} onChange={event=>setStat(event.target.value)}>
        <option value="">Choose</option>
        {UNIVERSAL_CHARACTERISTICS.map(name=><option key={name} value={name}>{name}</option>)}
      </select></label>
      <label>Legacy rank conversion (if needed)<select value={rankOverride} onChange={event=>setRankOverride(event.target.value)}>
        <option value="">Use the character's named rank</option>
        {Object.keys(UNIVERSAL_CHECK_RANKS).map(name=><option key={name}>{name}</option>)}
      </select></label>
      {type!=='opposed'?<label>DC<input type="number" min="0" max="1000" required value={dc} onChange={event=>setDc(event.target.value)}/></label>:<p>Opposed checks compare participant results.</p>}
      <label>Situational modifier<input type="number" min="-100" max="100" required value={modifier}
        onChange={event=>setModifier(event.target.value)}/></label>
      <label><input type="checkbox" checked={advantage} onChange={event=>setAdvantage(event.target.checked)}/> Advantage</label>
      <label><input type="checkbox" checked={disadvantage} onChange={event=>setDisadvantage(event.target.checked)}/> Disadvantage</label>
      <label>GM instructions<textarea maxLength={500} value={instructions} onChange={event=>setInstructions(event.target.value)}/></label>
      <button type="submit" disabled={busy||!valid||(multi?participantIds.length<2||type==='opposed'&&participantIds.length!==2:!selected)||!chosenStat||!skill.trim()}>{busy?'Sending…':'Send to player'}</button>
    </form>:null}
    {error?<p role="alert">{error}</p>:null}
    {notice?<p role="status">{notice}</p>:null}
    <button type="button" onClick={()=>setIncludeHistory(!includeHistory)}>Related checks ({history.length})</button>
    {includeHistory?<div aria-label="Context check history">
      {history.length===0?<p>No checks recorded for this interaction.</p>:null}
      {history.slice(0,20).map(row=>{
        const status=contextualCheckStatus(row);
        return <article key={row.id}>
          <strong>{row.characterName}</strong> · {row.skill} · {status.value}
          {status.total!=null?' · '+status.total:''}
          {row.dc!=null?' / DC '+row.dc:''}
          {row.mode==='manual'||row.mode==='physical'?' · Player-reported':''}
        </article>;
      })}
    </div>:null}
    {context.kind==='merchant-deal'?<p>The roll informs the GM decision. The merchant offer is not approved or repriced automatically.</p>:null}
  </section>;
}
