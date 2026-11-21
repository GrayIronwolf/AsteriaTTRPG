import React,{useEffect,useState} from 'react';
import {
  gmMayAdvanceTurn,LIVE_COMBAT_TIMER_PRESETS
} from '../../../src/state/liveCombatCommandModel.mjs';
import styles from './GMLiveCombatPanel.module.css';

const INITIAL_APPROVAL={
  checkType:'none',skill:'',opposedSkill:'',dc:'',feasible:false,
  sourceReason:'',sizeEligible:false,rankEligible:false
};
function PendingActionReview({pending,combat,busy,onCommand}){
  const [approval,setApproval]=useState(INITIAL_APPROVAL);
  const [reason,setReason]=useState('');
  const [outcome,setOutcome]=useState('manifested');
  const [success,setSuccess]=useState('not-set');
  const [source,setSource]=useState('');
  useEffect(()=>{
    setApproval(INITIAL_APPROVAL);setReason('');setOutcome('manifested');
    setSuccess('not-set');setSource('');
  },[pending?.id]);
  if(!pending)return <p>No GM adjudication is waiting.</p>;
  const isApproval=pending.status==='awaiting-approval';
  const needsRoll=pending.status==='awaiting-roll';
  const needsResolution=pending.status==='awaiting-resolution';
  const isReactions=pending.status==='reactions';
  const targetNames=pending.targetIds.map(id=>
    combat?.combatants?.find(row=>row.id===id)?.name||'Unknown participant');
  const canApprove=approval.checkType==='none'||(
    approval.skill.trim()&&(
      approval.checkType==='fixed'?approval.dc!==''&&Number.isFinite(Number(approval.dc)):
      approval.checkType==='opposed'?approval.opposedSkill.trim():true
    )
  );
  const approve=()=>{
    const submitted={
      checkType:approval.checkType,feasible:approval.feasible,
      ...(approval.skill.trim()?{skill:approval.skill.trim()}:{}),
      ...(approval.checkType==='fixed'?{dc:Number(approval.dc)}:{}),
      ...(approval.checkType==='opposed'?{opposedSkill:approval.opposedSkill.trim()}:{}),
      ...(approval.sourceReason.trim()?{sourceReason:approval.sourceReason.trim()}:{}),
      ...(approval.sizeEligible?{sizeEligible:true}:{}),
      ...(approval.rankEligible?{rankEligible:true}:{}),
    };
    onCommand(pending.actorId,{operation:'approve',approval:submitted});
  };
  return <section className={styles.pending} data-testid="site-gm-live-pending">
    <h4>GM Action Queue</h4>
    <p><strong>{pending.actorName||'Combatant'}</strong> —
      {' '}{pending.name||pending.key||'Declared action'}</p>
    <p>Status: <strong>{pending.status}</strong> · AP {pending.ap}
      {pending.bonus?' · bonus action':''}</p>
    {targetNames.length?<p>Declared targets: {targetNames.join(', ')}</p>:null}
    {isApproval?<fieldset className={styles.fields}>
      <legend>Review declared action</legend>
      <p>Confirm the actual skill, target eligibility, costs and source rules.
        The server remains authoritative; unavailable or incomplete approvals are rejected.</p>
      <label>Check type<select value={approval.checkType}
        onChange={event=>setApproval(value=>({...value,checkType:event.target.value}))}>
        <option value="none">No roll / source-defined</option>
        <option value="fixed">Skill vs DC</option>
        <option value="attack">Weapon attack vs AC</option>
        <option value="opposed">Opposed check</option>
      </select></label>
      {approval.checkType!=='none'?<label>Actual skill<input maxLength={100}
        value={approval.skill} onChange={event=>setApproval(value=>({...value,
          skill:event.target.value}))}/></label>:null}
      {approval.checkType==='fixed'?<label>Difficulty Class<input type="number"
        value={approval.dc} onChange={event=>setApproval(value=>({...value,
          dc:event.target.value}))}/></label>:null}
      {approval.checkType==='opposed'?<label>Defender skill<input maxLength={100}
        value={approval.opposedSkill}
        onChange={event=>setApproval(value=>({...value,
          opposedSkill:event.target.value}))}/></label>:null}
      <label><input type="checkbox" checked={approval.feasible}
        onChange={event=>setApproval(value=>({...value,feasible:event.target.checked}))}/>
        Confirm range, line of sight, equipment and feasibility</label>
      <label><input type="checkbox" checked={approval.sizeEligible}
        onChange={event=>setApproval(value=>({...value,sizeEligible:event.target.checked}))}/>
        Confirm size eligibility where required</label>
      <label><input type="checkbox" checked={approval.rankEligible}
        onChange={event=>setApproval(value=>({...value,rankEligible:event.target.checked}))}/>
        Confirm actual rank access where required</label>
      <label>Justification / source (for overrides)<input maxLength={160}
        value={approval.sourceReason} onChange={event=>setApproval(value=>({...value,
          sourceReason:event.target.value}))}/></label>
      <div className={styles.actions}>
        <button type="button" disabled={busy||!canApprove} onClick={approve}>
          Approve Action</button>
        <button type="button" disabled={busy}
          onClick={()=>onCommand(pending.actorId,{operation:'reject'})}>
          Reject Unbegun Action</button>
      </div>
    </fieldset>:null}
    {isReactions?<div className={styles.fields}>
      <p>Reaction window: {pending.reactionActorId?
        combat?.combatants.find(row=>row.id===pending.reactionActorId)?.name||
        'Next reactor':'No queued reactor'}.
        {' '}Possible choices: {pending.reactionChoices.join(', ')||'None'}</p>
      {pending.reactionCommitted?<p>A reaction is committed. Resolve it with the
        existing source-specific reaction controls before continuing.</p>:<>
        <label>Reason for closing remaining reactions<input maxLength={160}
          value={reason} onChange={event=>setReason(event.target.value)}/></label>
        <button type="button" disabled={busy}
          onClick={()=>onCommand('encounter',{
            operation:'close-window',reason:reason.trim()
          })}>Close Reaction Window</button>
      </>}
    </div>:null}
    {needsRoll?<button type="button" disabled={busy}
      onClick={()=>onCommand('encounter',{operation:'roll'})}>
      Roll Approved Check</button>:null}
    {needsResolution?<div className={styles.fields}>
      <p>Recorded outcome: {pending.rollSuccess===null?'Requires GM adjudication':
        pending.rollSuccess?'Success':'Failure'}
        {pending.hit!==null?' · Hit: '+(pending.hit?'Yes':'No'):''}</p>
      <label>Casting / action outcome<select value={outcome}
        onChange={event=>setOutcome(event.target.value)}>
        <option value="manifested">Manifested / ordinary result</option>
        <option value="failed-before-manifestation">Failed before manifestation</option>
        <option value="countered">Countered</option>
        <option value="feedback">Feedback</option>
      </select></label>
      <label>GM adjudication (only when no server result)<select
        value={success} onChange={event=>setSuccess(event.target.value)}>
        <option value="not-set">Use existing server roll</option>
        <option value="success">Success</option>
        <option value="failure">Failure</option>
      </select></label>
      <label>Reason / source<textarea rows={2} maxLength={400}
        value={source} onChange={event=>setSource(event.target.value)}/></label>
      <p>Only resolve when all target effects have been adjudicated.
        Damage, healing, reactions and complex spell effects must use their
        existing source-specific GM controls; this button does not invent effects.</p>
      <button type="button" disabled={busy||
        (pending.rollSuccess===null&&!source.trim())}
        onClick={()=>onCommand('encounter',{
          operation:'resolve',outcome,reason:source.trim(),
          ...(success==='not-set'?{}:{success:success==='success'})
        })}>Complete Adjudication (No Added Effects)</button>
    </div>:null}
  </section>;
}
export function GMLiveCombatPanel({combat,pending=null,log=[],busy,onCommand}){
  const [seconds,setSeconds]=useState(60);
  const [autoStart,setAutoStart]=useState(true);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    if(!combat?.turnTimer?.enabled)return undefined;
    const tick=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(tick);
  },[combat?.turnTimer?.enabled,combat?.turnTimer?.endsAt]);
  const timer=combat?.turnTimer||{};
  const active=combat?.status==='active',editable=combat?.sessionEditable===true;
  const advance=gmMayAdvanceTurn(combat,pending);
  const elapsed=timer.enabled?Math.max(0,Math.ceil((timer.endsAt-now)/1000)):
    timer.remainingSeconds||0;
  const setTimer=(mode,extra={})=>onCommand('encounter',{
    operation:'timer',mode,...extra
  });
  const next=()=>{
    if(!advance.allowed)return;
    if(advance.needsConfirmation&&!window.confirm(
      'This turn has not been marked complete. Advance and apply end-of-turn conditions?'
    ))return;
    onCommand('encounter',{operation:'next'});
  };
  return <div className={styles.live} data-testid="site-gm-live-combat">
    <div className={styles.card}>
      <h4>Live Combat Control</h4>
      <p>{active?'Round '+combat.round+' · '+(combat.current?.name||'Current combatant'):
        'Combat not active'}</p>
      <p>Current turn: {combat?.current?.turnComplete?'Complete':
        active?'Awaiting completion':'Not started'}.
        {' '}AP {combat?.current?.ap??'—'} ·
        Bonus {combat?.current?.bonus?'available':'used / unavailable'}</p>
      <div className={styles.actions}>
        <button type="button" disabled={busy||!advance.allowed}
          title={advance.reason||''} data-testid="site-gm-live-next-turn"
          onClick={next}>Advance Turn</button>
      </div>
      {!advance.allowed&&advance.reason?<p role="status">{advance.reason}</p>:null}
    </div>
    <div className={styles.card}>
      <h4>Turn Timer (GM controlled)</h4>
      <p aria-live="off">Remaining: <strong>{timer.configured?elapsed+' seconds':'Off'}</strong>
        {timer.paused?' · Paused':''}</p>
      <p>The timer is informational. Expiry never ends a turn or spends AP.</p>
      <div className={styles.actions}>
        <label>Turn length<select value={seconds}
          onChange={event=>setSeconds(Number(event.target.value))}>
          {LIVE_COMBAT_TIMER_PRESETS.map(value=><option value={value} key={value}>
            {value} seconds</option>)}
        </select></label>
        <label><input type="checkbox" checked={autoStart}
          onChange={event=>setAutoStart(event.target.checked)}/>
          Restart on each new turn</label>
        <button type="button" disabled={busy||!editable}
          onClick={()=>setTimer('configure',{seconds,autoStart})}>
          Set Timer</button>
        <button type="button" disabled={busy||!editable||!timer.enabled||!active}
          onClick={()=>setTimer('pause')}>Pause</button>
        <button type="button" disabled={busy||!editable||!timer.paused||!active}
          onClick={()=>setTimer('resume')}>Resume</button>
        <button type="button" disabled={busy||!editable||!timer.configured}
          onClick={()=>setTimer('disable')}>Disable</button>
      </div>
    </div>
    <PendingActionReview pending={pending} combat={combat}
      busy={busy||!editable} onCommand={onCommand}/>
    <section className={styles.card} data-testid="site-gm-live-history">
      <h4>Combat Event History</h4>
      {log.length?<ol className={styles.history}>
        {log.map((item,index)=><li key={item.id+'-'+index}>
          <span>{item.message}</span>
          {item.at?<time dateTime={new Date(item.at).toISOString()}>
            {new Date(item.at).toLocaleTimeString()}</time>:null}
        </li>)}
      </ol>:<p>No combat events recorded yet.</p>}
    </section>
  </div>;
}
