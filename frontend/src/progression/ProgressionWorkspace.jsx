import React,{useEffect,useMemo,useState} from 'react';
import {loadPublicForgeRules} from '../forge/publicForgeRules.mjs';
import {loadPublicEntry} from '../compendium/publicEntryLoader.mjs';
import {CHECK_TYPES,CHECK_STATS,CHECK_RANKS,publishedTalentCatalog,talentProjection} from './progressionModel.mjs';
import styles from './ProgressionWorkspace.module.css';

function useProgression(api,kind,args){
  const [state,setState]=useState({loading:true,error:'',data:null});
  useEffect(()=>{
    let alive=true,stop=()=>{};
    setState({loading:true,error:'',data:null});
    try{stop=api[kind](...args,data=>{if(alive)setState({loading:false,error:'',data});},
      error=>{if(alive)setState({loading:false,error:error?.message||'Access denied.',data:null});});}
    catch(error){setState({loading:false,error:error?.message||'Access denied.',data:null});}
    return()=>{alive=false;stop?.();};
  },[api,kind,...args]);
  return state;
}
function useCommand(){
  const [pending,setPending]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
  async function run(action,message='Saved to Firebase.'){
    if(pending)return null;
    setPending(true);setNotice('');setError('');
    try{const result=await action();setNotice(message);return result;}
    catch(err){setError(err?.message||'The update was rejected.');return null;}
    finally{setPending(false);}
  }
  return {pending,notice,error,run};
}
function Feedback({action}){
  return <>{action.notice?<p role="status">{action.notice}</p>:null}
    {action.error?<p role="alert">{action.error}</p>:null}</>;
}
function CheckResult({row}){
  const outcome=row.gmOutcome||row.result?.outcome;
  return <div className={styles.detail}>
    <strong>{row.type}: {row.skill||row.characteristic} — {row.status}</strong>
    <span>DC {row.dc??'Opposed'} · Modifier {row.modifierTotal>=0?'+':''}{row.modifierTotal}
      {' · '}Attempt {row.attempt}</span>
    {row.description?<p>{row.description}</p>:null}
    {row.npcName?<small>NPC: {row.npcName}</small>:null}
    {row.modifiers.length?<details><summary>Frozen modifiers</summary>
      <ul>{row.modifiers.map((x,i)=><li key={i}>{x.label}: {x.value>=0?'+':''}{x.value}</li>)}</ul>
    </details>:null}
    {outcome?<p role="status">Outcome: {outcome} · {row.result?.total??'self reported'}
      {row.dice?.die?' · d20 '+row.dice.die:''}</p>:null}
    {row.groupId?<p>Group: {row.groupOutcome?.outcome||'Awaiting other participants'}</p>:null}
    {row.history?.length?<details><summary>Earlier attempts ({row.history.length})</summary>
      <ul>{row.history.map((x,i)=><li key={i}>Attempt {x.attempt}: {x.result?.outcome||'Unknown'}</li>)}</ul>
    </details>:null}
  </div>;
}
export function GMChecksAndProgression({api,campaignId}){
  const stream=useProgression(api,'watchGM',[campaignId]);
  const action=useCommand();
  const [mode,setMode]=useState('skill'),[ids,setIds]=useState([]),
    [skill,setSkill]=useState(''),[stat,setStat]=useState(''),
    [rank,setRank]=useState(''),[dc,setDc]=useState('15'),
    [description,setDescription]=useState(''),[npc,setNpc]=useState(''),
    [modifier,setModifier]=useState('0'),[advantage,setAdvantage]=useState(false),
    [disadvantage,setDisadvantage]=useState(false),[threshold,setThreshold]=useState(''),
    [xp,setXp]=useState('100'),[xpReason,setXpReason]=useState(''),
    [awardTo,setAwardTo]=useState(''),[override,setOverride]=useState({});
  const data=stream.data,party=data?.party||[];
  const mult=['group','opposed'].includes(mode);
  const selected=ids.filter(id=>party.some(row=>row.id===id));
  const choose=(id,yes)=>setIds(current=>mult?
    yes?[...current.filter(x=>x!==id),id]:current.filter(x=>x!==id):[id]);
  const create=event=>{
    event.preventDefault();
    action.run(()=>api.checkGM(campaignId,{
      action:'create',type:mode,
      characterId:selected[0],
      ...(mult?{characterIds:selected}:{}),
      skill,characteristic:stat,rankOverride:rank,
      dc:mode==='opposed'?0:Number(dc),
      description,npcName:npc,
      modifiers:[{label:'Situational modifier',value:Number(modifier)}],
      advantage,disadvantage,
      requiredSuccesses:threshold===''?0:Number(threshold)
    }),'Check request sent.');
  };
  return <section className={styles.workspace} data-testid="site-gm-progression">
    <h2>Universal Check Requests &amp; Progression</h2>
    {stream.loading?<p>Verifying GM authority and loading checks…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {data?<>
      <fieldset className={styles.block} disabled={action.pending}>
        <legend>GM XP Award</legend>
        <p>XP and level-up rewards use the existing server progression engine.</p>
        <div className={styles.fields}>
          <label>Linked character<select value={awardTo} onChange={e=>setAwardTo(e.target.value)}>
            <option value="">Select character</option>
            {party.map(row=><option key={row.id} value={row.id}>{row.name} — Level {row.level}</option>)}
          </select></label>
          <label>XP amount<input type="number" min="1" max="1000000" value={xp} onChange={e=>setXp(e.target.value)}/></label>
          <label>Reason<input value={xpReason} maxLength={300} onChange={e=>setXpReason(e.target.value)}/></label>
        </div>
        <button disabled={!data.session.editable||!awardTo||!Number.isSafeInteger(Number(xp))||
          Number(xp)<1||Number(xp)>1000000||xpReason.trim().length<3}
          onClick={()=>action.run(()=>api.awardXP(campaignId,awardTo,Number(xp),xpReason),'XP awarded and progression synchronized.')}>
          Award XP
        </button>
      </fieldset>
      <form className={styles.block} onSubmit={create}>
        <h3>Send Check Request</h3>
        <div className={styles.fields}>
          <label>Type<select value={mode} onChange={e=>{setMode(e.target.value);setIds([]);}}>
            {CHECK_TYPES.map(type=><option key={type}>{type}</option>)}
          </select></label>
          <label>Skill or check<input required={!['saving','characteristic'].includes(mode)}
            value={skill} onChange={e=>setSkill(e.target.value)}/></label>
          <label>Governing characteristic<select required value={stat} onChange={e=>setStat(e.target.value)}>
            <option value="">Choose characteristic</option>
            {CHECK_STATS.map(name=><option key={name} value={name}>{name}</option>)}
          </select></label>
          <label>Legacy rank override<select value={rank} onChange={e=>setRank(e.target.value)}>
            <option value="">Character's named rank</option>{CHECK_RANKS.map(x=><option key={x}>{x}</option>)}
          </select></label>
          {mode!=='opposed'?<label>DC<input type="number" min="0" max="1000" value={dc}
            onChange={e=>setDc(e.target.value)} required/></label>:null}
          {mode==='group'?<label>Required successes (blank = majority)
            <input type="number" min="1" max={selected.length||10} value={threshold}
              onChange={e=>setThreshold(e.target.value)}/></label>:null}
          <label>Situational modifier<input type="number" min="-100" max="100" value={modifier}
            onChange={e=>setModifier(e.target.value)}/></label>
          <label>NPC (optional)<input value={npc} onChange={e=>setNpc(e.target.value)}/></label>
        </div>
        <fieldset className={styles.people}><legend>{mult?'Select participants':'Select player character'}</legend>
          {party.map(row=><label key={row.id}><input type={mult?'checkbox':'radio'}
            name="check-character" checked={selected.includes(row.id)}
            onChange={e=>choose(row.id,e.target.checked)}/>{row.name}</label>)}
        </fieldset>
        <label className={styles.check}><input type="checkbox" checked={advantage}
          onChange={e=>setAdvantage(e.target.checked)}/>GM advantage</label>
        <label className={styles.check}><input type="checkbox" checked={disadvantage}
          onChange={e=>setDisadvantage(e.target.checked)}/>GM disadvantage</label>
        <label>Instructions<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label>
        <button type="submit" disabled={action.pending||!stat||!data.session.editable||
          (mult?selected.length<2||mode==='opposed'&&selected.length!==2:selected.length!==1)}>
          Send Check Request
        </button>
      </form>
      <section className={styles.block}>
        <h3>GM Check History ({data.checks.length})</h3>
        {data.checks.map(row=><article key={row.id} className={styles.record}>
          <p>{row.characterName}</p><CheckResult row={row}/>
          <div className={styles.controls}>
            {row.status==='pending'?<>
              <button disabled={action.pending} onClick={()=>action.run(()=>api.checkGM(campaignId,{
                action:'resend',requestId:row.id}),'Notification resent.')}>Resend</button>
              <button disabled={action.pending} onClick={()=>action.run(()=>api.checkGM(campaignId,{
                action:'cancel',requestId:row.id}),'Request cancelled.')}>Cancel</button>
            </>:null}
            {row.status==='submitted'?<button disabled={action.pending}
              onClick={()=>action.run(()=>api.checkGM(campaignId,{
                action:'acknowledge',requestId:row.id}),'Result acknowledged.')}>Acknowledge</button>:null}
            {['submitted','acknowledged'].includes(row.status)?<>
              <button disabled={action.pending} onClick={()=>action.run(()=>api.checkGM(campaignId,{
                action:'reroll',requestId:row.id}),'New roll requested.')}>Request Reroll</button>
              <label>Override reason<input value={override[row.id]||''} onChange={e=>setOverride(x=>({
                ...x,[row.id]:e.target.value}))}/></label>
              {['success','failure'].map(outcome=><button key={outcome}
                disabled={action.pending||(override[row.id]||'').trim().length<3}
                onClick={()=>action.run(()=>api.checkGM(campaignId,{
                  action:'override',requestId:row.id,reason:override[row.id],outcome}),'Outcome overridden.')}>
                Override {outcome}</button>)}
            </>:null}
          </div>
        </article>)}
        {!data.checks.length?<p>No check requests in this campaign.</p>:null}
      </section>
      <Feedback action={action}/>
    </>:null}
  </section>;
}
function CharacterTalentPanel({api,campaignId,characterId,character,session}){
  const action=useCommand(),[catalog,setCatalog]=useState([]),[loading,setLoading]=useState(true),
    [error,setError]=useState(''),[choice,setChoice]=useState({}),[spell,setSpell]=useState({});
  useEffect(()=>{
    let alive=true;
    setCatalog([]);setLoading(true);setError('');
    (async()=>{
      try{
        const rules=await loadPublicForgeRules();
        const talents=rules.talent||[];
        const classes=[character.klass,character.className,
          typeof character.class==='string'?character.class:character.class?.title,
          ...(Array.isArray(character.classes)?character.classes:[])].filter(Boolean);
        const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
        const known=new Set(classes.map(normalize));
        const selected=talents.filter(t=>known.has(normalize(t.rules?.classSlug))||
          known.has(normalize(t.categoryPath?.[0]))).slice(0,250);
        const entries=await Promise.all(selected.map(async t=>{
          const e=await loadPublicEntry('talent',t.slug);
          return e.state==='ready'?e.entry:null;
        }));
        if(alive)setCatalog(publishedTalentCatalog(character,selected,entries.filter(Boolean)));
      }catch(err){if(alive)setError(err.message||'Talent rules are unavailable.');}
      finally{if(alive)setLoading(false);}
    })();
    return()=>{alive=false;};
  },[character.klass,character.className,character.class,character.classes]);
  const talents=useMemo(()=>talentProjection(character,catalog),[character,catalog]);
  return <section className={styles.block} data-testid="site-player-talents">
    <h3>Class Talents</h3>
    {loading?<p>Loading published talent ranks…</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {talents.length?<div className={styles.records}>{talents.map(row=><article className={styles.record} key={row.id}>
      <strong>{row.name}</strong><span>{row.className} · Tier {row.tier} · Rank {row.rank}/{row.maxRank}</span>
      <p>Next rank: {row.cost} TP</p>
      <div className={styles.controls}>
        <button disabled={action.pending||!session.editable||!row.canBuy}
          title={row.reason||''} onClick={()=>action.run(()=>api.purchaseTalent(campaignId,characterId,{
            id:row.id,expectedRank:row.rank,expectedCoreRevision:character.coreRevision||0}),
            'Talent rank purchased.')}>Buy Rank {row.rank+1}</button>
        {row.canUse?<button disabled={action.pending||!session.editable||
          row.requiresChoice&&!choice[row.id]||row.needsSpell&&!spell[row.id]}
          onClick={()=>action.run(()=>api.useTalent(campaignId,characterId,
            {id:row.id,expectedRank:row.rank,expectedCoreRevision:character.coreRevision||0},
            {choice:choice[row.id]||'',spell:spell[row.id]||''}),'Talent activated.')}>Use Talent</button>:null}
      </div>
      {row.requiresChoice?<label>Talent choice<select value={choice[row.id]||''}
        onChange={e=>setChoice(x=>({...x,[row.id]:e.target.value}))}>
        <option value="">Choose option</option>{row.choices.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
      </select></label>:null}
      {row.needsSpell?<label>Known spell<input value={spell[row.id]||''}
        onChange={e=>setSpell(x=>({...x,[row.id]:e.target.value}))}/></label>:null}
      {row.reason?<small>{row.reason}</small>:null}
      {row.activationBlocked?<small>{row.activationBlocked}</small>:null}
    </article>)}</div>:!loading?<p>No authored class talent ranks found in the published catalogue.</p>:null}
    <Feedback action={action}/>
  </section>;
}
export function PlayerProgressionWorkspace({api,campaignId,characterId,section='progression'}){
  const stream=useProgression(api,'watchPlayer',[campaignId,characterId]);
  const action=useCommand(),[allocations,setAllocations]=useState({});
  const data=stream.data,ch=data?.character,progress=data?.progression;
  const total=Object.values(allocations).reduce((a,b)=>a+Number(b||0),0);
  return <section className={styles.workspace} data-testid="site-player-progression">
    <h2>{section==='talents'?'Class Talents':section==='skills'?'Skills':'Character Progression'}</h2>
    {stream.loading?<p>Verifying character ownership and progression…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {data?<>
      {section==='progression'?<>
        <div className={styles.block}>
          <h3>Level {progress.level} · XP {progress.xp}/{progress.xpMax||'Cap'}</h3>
          <p>Characteristic Points: {progress.cp} · Talent Points: {progress.tp}</p>
          <p>Recorded feats: {progress.feats.join(', ')||'None'}</p>
          <p>Feat milestones reached: {progress.milestoneLevels.join(', ')||'None'}</p>
          <small>Feat selection has no authoritative server command yet. No automatic feat grants are applied.</small>
        </div>
        <section className={styles.block}>
          <h3>Characteristic Point Allocation</h3>
          <div className={styles.records}>
            {progress.stats.map(row=><div className={styles.record} key={row.key}>
              <strong>{row.label} · {row.value} / {row.cap}</strong>
              <label>Points to allocate<input type="number" min="0" max={Math.max(0,Math.min(progress.cp-total+(allocations[row.key]||0),row.cap-row.value))}
                value={allocations[row.key]||0} onChange={e=>{
                  const next=Math.max(0,Math.floor(Number(e.target.value)||0));
                  setAllocations(x=>({...x,[row.key]:next}));
                }}/></label>
            </div>)}
          </div>
          <p>{total} CP selected · {progress.cp} available</p>
          <button disabled={action.pending||!data.session.editable||total<1||total>progress.cp||
            progress.stats.some(row=>row.value+Number(allocations[row.key]||0)>row.cap)}
            onClick={async()=>{
              const result=await action.run(()=>api.spendCP(campaignId,characterId,
                Object.fromEntries(Object.entries(allocations).filter(([,n])=>Number(n)>0))),
                'Characteristic Points allocated.');
              if(result)setAllocations({});
            }}>Allocate CP</button>
        </section>
      </>:null}
      {section==='skills'?<section className={styles.block}>
        <h3>Skill Training</h3>
        {data.skills.length?<div className={styles.records}>
          {data.skills.map(row=><article className={styles.record} key={row.id}>
            <strong>{row.name}</strong><span>{row.rank}</span>
            <p>Successful checks: {row.successes}{row.target?' / '+row.target:''}</p>
            <button disabled={action.pending||!data.session.editable||!row.target}
              onClick={()=>action.run(()=>api.recordSkill(campaignId,characterId,{
                name:row.name,expectedCoreRevision:ch.coreRevision||0
              }),'Successful skill check recorded.')}>Record Skill Success</button>
          </article>)}</div>:<p>No trained skills recorded.</p>}
          <small>Only the existing server skill-training rules can award rank progression.</small>
        </section>:null}
      {section==='talents'?<CharacterTalentPanel api={api} campaignId={campaignId}
        characterId={characterId} character={ch} session={data.session}/>:null}
      <Feedback action={action}/>
    </>:null}
  </section>;
}
export function PlayerCheckRequests({api,campaignId,characterId,showHistory=false}){
  const stream=useProgression(api,'watchPlayer',[campaignId,characterId]);
  const action=useCommand(),[first,setFirst]=useState(''),[second,setSecond]=useState(''),
    [reported,setReported]=useState('success'),[hidden,setHidden]=useState([]);
  const rows=stream.data?.checks||[],pending=rows.filter(row=>row.status==='pending');
  const active=pending.find(row=>!hidden.includes(row.id+':'+row.attempt+':'+row.notificationRevision));
  const submit=async payload=>{
    if(!active)return;
    const result=await action.run(()=>api.checkPlayer(campaignId,characterId,{
      action:'submit',requestId:active.id,...payload}),'Check submitted to GM.');
    if(result){setFirst('');setSecond('');}
  };
  const double=active?.advantage||active?.disadvantage;
  return <section className={styles.checks} data-testid="site-player-checks" aria-label="Universal Check Requests">
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {pending.length?<button type="button" onClick={()=>setHidden([])}>
      Pending GM Check Requests: {pending.length}</button>:null}
    {showHistory?<section className={styles.block}>
      <h3>Check History</h3>
      {rows.map(row=><article className={styles.record} key={row.id}><CheckResult row={row}/></article>)}
      {!rows.length?<p>No checks requested.</p>:null}
    </section>:null}
    {active?<div role="dialog" aria-modal="true" aria-label="GM Check Request"
      className={styles.popup} data-testid="site-player-check-popup">
      <h3>GM Check Request</h3><CheckResult row={active}/>
      <div className={styles.controls}>
        <button disabled={action.pending} onClick={()=>submit({mode:'digital'})}>Roll Digital Dice</button>
      </div>
      <fieldset className={styles.fields}><legend>Physical dice</legend>
        <label>First d20<input type="number" min="1" max="20" value={first}
          onChange={e=>setFirst(e.target.value)}/></label>
        {double?<label>Second d20<input type="number" min="1" max="20" value={second}
          onChange={e=>setSecond(e.target.value)}/></label>:null}
        <button disabled={action.pending||!Number.isInteger(Number(first))||
          Number(first)<1||Number(first)>20||
          double&&(!Number.isInteger(Number(second))||Number(second)<1||Number(second)>20)}
          onClick={()=>submit({mode:'physical',die:Number(first),
            ...(double?{secondDie:Number(second)}:{})})}>Submit Physical Dice</button>
      </fieldset>
      {active.type!=='opposed'?<div className={styles.controls}>
        <label>Manual result<select value={reported} onChange={e=>setReported(e.target.value)}>
          <option value="success">Success</option><option value="failure">Failure</option>
        </select></label>
        <button disabled={action.pending}
          onClick={()=>submit({mode:'manual',reported})}>Self-Report Result</button>
      </div>:null}
      <button type="button" onClick={()=>setHidden(x=>[...x,
        active.id+':'+active.attempt+':'+active.notificationRevision])}>
        Dismiss (keep pending)
      </button>
      <Feedback action={action}/>
    </div>:null}
  </section>;
}
