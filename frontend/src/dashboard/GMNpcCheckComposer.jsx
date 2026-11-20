import React,{useEffect,useMemo,useState} from 'react';
import {
 UNIVERSAL_CHECK_RANKS,UNIVERSAL_CHARACTERISTICS
} from '../../../src/state/universalCheckModel.mjs';
import styles from './GMNpcToolkit.module.css';

const presets=[
  {id:'persuasion',label:'Persuasion',stat:'charisma'},
  {id:'deception',label:'Deception',stat:'charisma'},
  {id:'intimidation',label:'Intimidation',stat:'charisma'},
  {id:'insight',label:'Insight',stat:'wisdom'},
  {id:'perception',label:'Perception',stat:'wisdom'},
  {id:'custom',label:'Custom Skill',stat:''}
];
const types=['social','skill','group','opposed'];
export function GMNpcCheckComposer({api,campaignId,npc,party=[],onClose}){
  const enabled=api?.availability?.().enabled===true;
  const [stream,setStream]=useState(null),[streamError,setStreamError]=useState('');
  const [type,setType]=useState('social'),[characterIds,setCharacterIds]=useState([]);
  const [preset,setPreset]=useState('persuasion'),[custom,setCustom]=useState('');
  const [stat,setStat]=useState('charisma'),[rank,setRank]=useState('');
  const [dc,setDc]=useState('15'),[modifier,setModifier]=useState('0');
  const [advantage,setAdvantage]=useState(false),[disadvantage,setDisadvantage]=useState(false);
  const [description,setDescription]=useState(''),[required,setRequired]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  useEffect(()=>{
    setStream(null);setStreamError('');setError('');setSuccess('');setCharacterIds([]);
    if(!enabled)return;
    let active=true;
    const close=api.watchGM(campaignId,data=>{if(active)setStream(data);},
      err=>{if(active){setStream(null);setStreamError(err?.message||'Check history unavailable.');}});
    return ()=>{active=false;close();};
  },[api,campaignId,enabled,npc.id]);
  const members=useMemo(()=>{
    const verified=stream?.party||[];
    const allowed=new Set(party.map(p=>p.id));
    return verified.filter(row=>allowed.has(row.id));
  },[party,stream]);
  const checkHistory=(stream?.checks||[]).filter(row=>
    row.contextNpcId?row.contextNpcId===npc.id:row.npcName===npc.name).slice(0,20);
  const mult=type==='group'||type==='opposed';
  const skill=preset==='custom'?custom.trim():preset;
  const choices=characterIds.filter(id=>members.some(row=>row.id===id));
  const choose=(id,value)=>{
    setCharacterIds(previous=>mult?
      (value?[...new Set([...previous,id])]:previous.filter(v=>v!==id)):[id]);
  };
  const validDc=/^\d{1,4}$/.test(dc)&&Number(dc)<=1000;
  const validModifier=/^-?\d{1,3}$/.test(modifier)&&Math.abs(Number(modifier))<=100;
  const validRequired=required===''||/^\d{1,2}$/.test(required)&&
    Number(required)>=1&&Number(required)<=choices.length;
  const validPeople=mult?choices.length>=2&&choices.length<=(type==='opposed'?2:10):choices.length===1;
  const canSend=enabled&&Boolean(stream?.session?.editable)&&!busy&&
    validPeople&&Boolean(stat)&&Boolean(skill)&&validModifier&&validDc&&
    (type!=='group'||validRequired);
  const submit=async event=>{
    event.preventDefault();
    if(!canSend)return;
    setBusy(true);setError('');setSuccess('');
    try{
      await api.checkGM(campaignId,{
        action:'create',type,characterId:choices[0],
        ...(mult?{characterIds:choices}:{}),
        skill,characteristic:stat,rankOverride:rank,
        dc:type==='opposed'?0:Number(dc),
        context:{kind:'npc',npcId:npc.id},
        description:description.trim().slice(0,500),
        modifiers:[{label:'Situational modifier',value:Number(modifier)}],
        advantage,disadvantage,requiredSuccesses:type==='group'&&required!==''?Number(required):0
      });
      setSuccess('NPC interaction check sent. The player can submit digital or physical dice.');
      setDescription('');
    }catch(err){setError(err?.message||'NPC check request was rejected.');}
    finally{setBusy(false);}
  };
  return <section className={styles.subpanel} data-testid="site-gm-npc-checks"
    aria-label={'NPC interaction checks for '+npc.name}>
    <header className={styles.head}><div><h3>Interaction Check · {npc.name}</h3>
      <p>Use the existing authenticated Universal Check Request system.</p></div>
      <button type="button" disabled={busy} onClick={onClose}>Close</button>
    </header>
    {!enabled?<p role="status">Universal checks are not enabled for this campaign.</p>:null}
    {streamError?<p role="alert">{streamError}</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {success?<p role="status">{success}</p>:null}
    {enabled&&!stream&&!streamError?<p>Verifying campaign checks and active session…</p>:null}
    {stream?<form className={styles.form} onSubmit={submit}>
      <div className={styles.fields}>
        <label>Check Type<select value={type} disabled={busy} onChange={e=>{
          setType(e.target.value);setCharacterIds([]);}}>
          {types.map(value=><option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>Suggested Check<select value={preset} disabled={busy} onChange={e=>{
          const next=e.target.value;setPreset(next);
          const template=presets.find(p=>p.id===next);
          if(template?.stat)setStat(template.stat);
        }}>{presets.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select>
        </label>
        {preset==='custom'?<label>Custom Skill<input required maxLength={100}
          value={custom} onChange={e=>setCustom(e.target.value)}/></label>:null}
        <label>Characteristic<select value={stat} disabled={busy}
          onChange={e=>setStat(e.target.value)}>
          <option value="">Select</option>
          {UNIVERSAL_CHARACTERISTICS.map(item=><option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Rank Override<select value={rank} disabled={busy}
          onChange={e=>setRank(e.target.value)}>
          <option value="">Use Character's Rank</option>
          {Object.keys(UNIVERSAL_CHECK_RANKS).map(value=><option key={value}>{value}</option>)}
        </select></label>
        {type!=='opposed'?<label>DC<input type="number" min={0} max={1000} value={dc}
          onChange={e=>setDc(e.target.value)}/></label>:null}
        <label>Situational Modifier<input type="number" min={-100} max={100}
          value={modifier} onChange={e=>setModifier(e.target.value)}/></label>
        {type==='group'?<label>Required Successes (blank = majority)
          <input type="number" min={1} max={choices.length||10} value={required}
            onChange={e=>setRequired(e.target.value)}/></label>:null}
      </div>
      <fieldset className={styles.fieldset}>
        <legend>{mult?'Select Participating Characters':'Select Player Character'}</legend>
        <div className={styles.choices}>{members.map(row=><label key={row.id}
          className={styles.inline}><input type={mult?'checkbox':'radio'}
            name={mult?undefined:'npc-check-character'} checked={choices.includes(row.id)}
            disabled={busy} onChange={e=>choose(row.id,e.target.checked)}/>{row.name}</label>)}</div>
      </fieldset>
      <div className={styles.choices}>
        <label className={styles.inline}><input type="checkbox" checked={advantage}
          disabled={busy} onChange={e=>setAdvantage(e.target.checked)}/>Advantage</label>
        <label className={styles.inline}><input type="checkbox" checked={disadvantage}
          disabled={busy} onChange={e=>setDisadvantage(e.target.checked)}/>Disadvantage</label>
      </div>
      <label>GM Instructions<textarea maxLength={500} rows={3} value={description}
        disabled={busy} onChange={e=>setDescription(e.target.value)}/></label>
      <button type="submit" disabled={!canSend}>Send to Player</button>
      {!stream.session.editable?<p>Start an active campaign session to request checks.</p>:null}
    </form>:null}
    <h4>Related Check History ({checkHistory.length})</h4>
    <div className={styles.records}>{checkHistory.map(row=><article key={row.id}
      className={styles.record}>
      <strong>{row.characterName||row.characterId}</strong>
      <span>{row.skill} · {row.status}{row.result?.total!=null?' · '+row.result.total:''}</span>
      {row.dc!=null?<small>DC {row.dc}</small>:null}
      {row.mode==='physical'||row.mode==='manual'?<small>Player-reported</small>:null}
    </article>)}</div>
    {!checkHistory.length?<p>No NPC interaction checks recorded.</p>:null}
  </section>;
}
