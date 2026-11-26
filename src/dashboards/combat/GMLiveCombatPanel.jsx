import React,{useEffect,useState} from 'react';
import {
  gmMayAdvanceTurn,LIVE_COMBAT_TIMER_PRESETS
} from '../../../src/state/liveCombatCommandModel.mjs';
import styles from './GMLiveCombatPanel.module.css';

// Status, timer and log are independent views of one authoritative combat stream.
// Rich action approval is owned solely by GMAdvancedActionQueue.
export function GMLiveCombatPanel({combat,pending=null,log=[],busy,onCommand,view='all'}){
  const [seconds,setSeconds]=useState(60);
  const [autoStart,setAutoStart]=useState(true);
  const [turnReason,setTurnReason]=useState(''),[turnTarget,setTurnTarget]=useState('');
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{
    if((view!=='timer'&&view!=='all')||!combat?.turnTimer?.enabled)return undefined;
    const tick=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(tick);
  },[combat?.turnTimer?.enabled,combat?.turnTimer?.endsAt]);
  const timer=combat?.turnTimer||{};
  const active=combat?.status==='active',editable=combat?.sessionEditable===true&&!combat?.paused;
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
    {(view==='all'||view==='status')?<div className={styles.card}>
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
      {active?<details>
        <summary>Skip or override turn</summary>
        <label>Reason<input value={turnReason} maxLength={160}
          onChange={event=>setTurnReason(event.target.value)}/></label>
        <button type="button" disabled={busy||!advance.allowed||!turnReason.trim()}
          onClick={()=>onCommand('encounter',{operation:'skip-turn',reason:turnReason.trim()})}>
          Skip Current Turn
        </button>
        <label>Next participant<select value={turnTarget}
          onChange={event=>setTurnTarget(event.target.value)}>
          <option value="">Select a participant</option>
          {combat.combatants.filter(row=>row.id!==combat.current?.id&&!row.actedThisRound).map(row=>
            <option key={row.id} value={row.id}>{row.name}</option>)}
        </select></label>
        <button type="button" disabled={busy||!advance.allowed||!turnReason.trim()||!turnTarget}
          onClick={()=>onCommand('encounter',{operation:'override-turn',reason:turnReason.trim(),targetId:turnTarget})}>
          Override Next Turn
        </button>
      </details>:null}
      {!advance.allowed&&advance.reason?<p role="status">{advance.reason}</p>:null}
    </div>:null}
    {(view==='all'||view==='timer')?<div className={styles.card}>
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
    </div>:null}

    {(view==='all'||view==='log')?<section className={styles.card} data-testid="site-gm-live-history">
      <h4>Combat Event History</h4>
      {log.length?<ol className={styles.history}>
        {log.map((item,index)=><li key={item.id+'-'+index}>
          <span>{item.message}</span>
          {item.at?<time dateTime={new Date(item.at).toISOString()}>
            {new Date(item.at).toLocaleTimeString()}</time>:null}
        </li>)}
      </ol>:<p>No combat events recorded yet.</p>}
    </section>:null}
  </div>;
}
