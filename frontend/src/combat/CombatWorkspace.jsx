import React,{useEffect,useState} from 'react';
import {COMBAT_AP_ACTIONS,customEnemy,libraryEnemy} from './combatModel.mjs';
import {CombatCommandCentre,CombatCommandPanel} from './CombatCommandCentre.jsx';
import {PreparedEncounterLibrary} from './PreparedEncounterLibrary.jsx';
import styles from './CombatWorkspace.module.css';
import {ForgedBadge} from '../components/ui/ForgedBadge.jsx';

const emptyEnemy={name:'',type:'Creature',hp:'20',sp:'',mp:'',xpReward:'0',ac:'',initiative:''};
function useCombatStream(api,method,args){
  const [state,setState]=useState({loading:true,data:null,error:''});
  useEffect(()=>{
    let alive=true,stop=()=>{};
    setState({loading:true,data:null,error:''});
    try{
      stop=api[method](...args,result=>{
        if(alive)setState({loading:false,data:result,error:''});
      },error=>{
        if(alive)setState({loading:false,data:null,error:error?.message||'Combat access denied.'});
      });
    }catch(error){setState({loading:false,data:null,error:error?.message||'Combat is unavailable.'});}
    return()=>{alive=false;stop?.();};
  },[api,method,...args]);
  return state;
}
const Resources=({row})=><span className={styles.resources}>
  {['hp','sp','mp'].map(key=><span key={key}>{key.toUpperCase()}: {row[key]
    ?row[key][0]+' / '+row[key][1]:'—'}</span>)}
</span>;
function CombatRoster({combat,onSelect,selected='',gm=false}){
  return <ol className={styles.roster} data-testid="site-combat-initiative">
    {combat.combatants.map(row=><li key={row.id} className={row.current?styles.current:''}>
      {gm?<button type="button" className={styles.actorButton}
        aria-pressed={selected===row.id} onClick={()=>onSelect(row.id)}>
        <strong>{row.name}</strong><span>Initiative {row.initiative??'Not set'}</span></button>:
        <div className={styles.actorLabel}><strong>{row.name}</strong>
          <span>Initiative {row.initiative??'Not set'}</span></div>}
      <span>{row.turnComplete?'Turn complete':row.current?'Current turn':row.defeated?'Defeated':''}</span>
      {row.ap!==undefined?<span>{row.ap} AP · Bonus {row.bonus?'available':'used'}</span>:null}
      {row.hp!==undefined?<Resources row={row}/>:null}
    </li>)}
  </ol>;
}
function CombatStatusBadges({combat,actor}){
  const [now,setNow]=useState(()=>Date.now());
  const timer=combat.turnTimer;
  useEffect(()=>{
    if(!timer?.enabled||!combat.isActive)return undefined;
    setNow(Date.now());
    const tick=window.setInterval(()=>setNow(Date.now()),1000);
    return ()=>window.clearInterval(tick);
  },[timer?.enabled,timer?.endsAt,combat.isActive]);
  const remaining=timer?.enabled&&combat.isActive
    ?Math.max(0,Math.ceil((timer.endsAt-now)/1000)):null;
  const order=combat.combatants.findIndex(row=>row.id===actor.id);
  return <div className={styles.badges} data-testid="site-combat-badges">
    <ForgedBadge kind="order" label="Turn Order" value={order<0?'—':order+1}/>
    <ForgedBadge kind="initiative" label="Initiative" value={actor.initiative??'—'}
      active={Boolean(actor.current&&combat.isActive)}/>
    <ForgedBadge kind="ap" label={actor.current?'Action Points':'Held AP'}
      value={actor.ap??'—'} active={Boolean(actor.current&&actor.ap>0&&combat.isActive)}/>
    <ForgedBadge kind="timer" label="Turn Timer" value={remaining===null?'Off':remaining+'s'}
      warning={remaining!==null&&remaining<=10}/>
  </div>;
}
function Actions({combat,actor,disabled,onCommand,mode}){
  const own=actor?.current&&combat.isActive&&!actor.turnComplete&&combat.sessionEditable;
  const [cost,setCost]=useState(1);
  return <div className={styles.controls}>
    {COMBAT_AP_ACTIONS.map(({ap,label})=><button key={ap} type="button"
      disabled={disabled||!own||actor.ap<ap||(ap===0&&!actor.bonus)}
      onClick={()=>onCommand(actor.id,{operation:'spend-ap',ap})}>{label}</button>)}
    <button disabled={disabled||!own||actor.pendingDeathSave} type="button"
      onClick={()=>onCommand(actor.id,{operation:'end-turn'})}>End Turn</button>
    {actor.pendingDeathSave?<button disabled={disabled||!own} type="button"
      onClick={()=>onCommand(actor.id,{operation:'death-save'})}>Roll Death Save</button>:null}
    {mode==='gm'?<label>AP quick selection<select value={cost} onChange={e=>setCost(Number(e.target.value))}>
      {[1,2,3].map(x=><option key={x} value={x}>{x} AP</option>)}
    </select><button type="button" disabled={disabled||!own||actor.ap<cost}
      onClick={()=>onCommand(actor.id,{operation:'spend-ap',ap:cost})}>Spend selected AP</button></label>:null}
  </div>;
}
export function GMCombatWorkspace({api,campaignId,uid='',mediaApi=null,onNavigate=null}){
  const stream=useCombatStream(api,'watchGM',[campaignId]);
  const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false),
    [notice,setNotice]=useState(''),[error,setError]=useState('');
  const [enemy,setEnemy]=useState(emptyEnemy),[library,setLibrary]=useState('');
  const [selectedBattleMap,setSelectedBattleMap]=useState('');
  const [revisionInitiative,setRevisionInitiative]=useState('');
  const [resource,setResource]=useState('hp'),[amount,setAmount]=useState(''),
    [maximum,setMaximum]=useState(''),[reason,setReason]=useState('');
  const combat=stream.data?.combat;
  const current=selected&&combat?.combatants.find(row=>row.id===selected)||
    combat?.current||combat?.combatants[0]||null;
  useEffect(()=>{setSelected('');setError('');setNotice('');setSelectedBattleMap('');},[campaignId]);
  const submit=async(actorId,input)=>{
    if(busy||!combat)return;
    setBusy(true);setNotice('');setError('');
    try{
      const result=await api.commandGM(campaignId,actorId,{...input,revision:combat.revision});
      setNotice(result.message||'Combat command confirmed by Firebase.');
    }catch(failure){setError(failure?.message||'Combat command failed.');}
    finally{setBusy(false);}
  };
  const roster=()=>combat.combatants.map(({id,characterId,name,kind,defeated,initiative,initiativeSet})=>({
    id,characterId,name,kind,defeated,initiative,initiativeSet
  }));
  const add=entries=>submit('encounter',{operation:'save',
    encounter:{combatants:[...roster(),...entries]}});
  const changeRoster=(id,patch)=>submit('encounter',{operation:'save',encounter:{
    combatants:roster().map(row=>row.id===id?{...row,...patch}:row)
  }});
  const remove=id=>submit('encounter',{operation:'save',encounter:{
    combatants:roster().filter(row=>row.id!==id)
  }});
  const addEnemy=()=>{
    try{
      const values={...enemy};
      for(const key of ['hp','sp','mp','xpReward','ac','initiative'])
        if(values[key]!=='')values[key]=Number(values[key]);
      const creature=customEnemy(values,'enemy-'+crypto.randomUUID());
      add([creature]);setEnemy(emptyEnemy);
    }catch(failure){setError(failure.message);}
  };
  const addLibrary=()=>{
    const candidate=stream.data.library.find(row=>row.id===library);
    if(!candidate)return;
    const creature=libraryEnemy({...candidate,id:candidate.sourceId},'enemy-'+crypto.randomUUID());
    add([creature]);
  };
  const canSetup=combat&&combat.status!=='active';
  return <section className={styles.workspace} data-testid="site-gm-combat">
    <h2>Combat, Initiative &amp; Encounters</h2>
    {stream.loading?<p role="status">Verifying live combat access…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {combat?<CombatCommandCentre key={uid+':'+campaignId} uid={uid} campaignId={campaignId}>
      <CombatCommandPanel id="controls">
      <p role="status">{combat.status.toUpperCase()} · Round {combat.round} · Revision {combat.revision}
        {' · '}Session {stream.data.session.status}</p>
      <div className={styles.controls}>
        <button type="button" disabled={busy||!combat.sessionEditable||!canSetup||
          !combat.combatants.length}
          onClick={()=>submit('encounter',{operation:'start'})}>Start Combat</button>
        <button type="button" disabled={busy||!combat.sessionEditable||!combat.isActive}
          onClick={()=>submit('encounter',{operation:'next'})}>Next Turn</button>
        <button type="button" disabled={busy||!combat.sessionEditable||!combat.isActive}
          onClick={()=>{if(window.confirm('End combat? Spent resources remain spent.'))
            submit('encounter',{operation:'end'});}}>End Combat</button>
        <button type="button" disabled={busy||!combat.sessionEditable||!canSetup}
          onClick={()=>{if(window.confirm('Clear the encounter roster?'))
            submit('encounter',{operation:'clear'});}}>Clear Encounter</button>
      </div>
      {stream.data.pending?<p role="status">GM action pending: {stream.data.pending.status}.
        Resolve advanced action decisions in the original combat panel until their migration.</p>:null}
      </CombatCommandPanel>
      <CombatCommandPanel id="initiative">
        <CombatRoster combat={combat} gm selected={current?.id} onSelect={setSelected}/>
      </CombatCommandPanel>
      <CombatCommandPanel id="actor">
      {current?<section className={styles.section}>
        <h3>{current.name} · Turn &amp; Resources</h3>
        <CombatStatusBadges combat={combat} actor={current}/>
        <Resources row={current}/>
        <Actions combat={combat} actor={current} disabled={busy||Boolean(stream.data.pending)}
          onCommand={submit} mode="gm"/>
        <details>
          <summary>GM correction (audited)</summary>
          <p>Apply a server-validated correction. This changes the canonical character or
            encounter resources, not a separate dashboard copy.</p>
          <div className={styles.fields}>
            <label>Resource<select value={resource} onChange={e=>setResource(e.target.value)}>
              {['hp','sp','mp'].map(k=><option key={k} value={k}>{k.toUpperCase()}</option>)}
              <option value="ap">Action Points</option>
            </select></label>
            <label>Current value<input type="number" min="0" value={amount}
              onChange={e=>setAmount(e.target.value)}/></label>
            {resource!=='ap'?<label>Maximum (optional)<input type="number" min="1"
              value={maximum} onChange={e=>setMaximum(e.target.value)}/></label>:null}
            <label>Reason<input value={reason} maxLength={160}
              onChange={e=>setReason(e.target.value)}/></label>
          </div>
          <button type="button" disabled={busy||!combat.sessionEditable||!reason.trim()||
            amount===''||!Number.isFinite(Number(amount))||
            Number(amount)<0||(resource==='ap'&&Number(amount)>3)}
            onClick={()=>submit(current.id,{operation:'correct',targetId:current.id,reason:reason.trim(),
              ...(resource==='ap'?{ap:Number(amount)}:{
                resource,current:Number(amount),
                ...(maximum!==''?{maximum:Number(maximum)}:{})
              })})}>Apply GM Correction</button>
        </details>
        {canSetup?<div className={styles.fields}>
          <label>Set initiative<input type="number" value={revisionInitiative}
            onChange={e=>setRevisionInitiative(e.target.value)}/></label>
          <button type="button" disabled={busy||!Number.isFinite(Number(revisionInitiative))||
            revisionInitiative===''||Number(revisionInitiative)<-100||
            Number(revisionInitiative)>1000}
            onClick={()=>changeRoster(current.id,{initiative:Number(revisionInitiative),initiativeSet:true})}>
            Save Initiative</button>
          <button type="button" disabled={busy} onClick={()=>remove(current.id)}>
            Remove Participant</button>
        </div>:null}
      </section>:<p>Select an encounter participant to view combatant controls.</p>}
      </CombatCommandPanel>
      <CombatCommandPanel id="setup">
      {canSetup?<section className={styles.section}>
        <h3>Encounter Setup</h3>
        <div className={styles.controls}>
          <button type="button" disabled={busy||!combat.sessionEditable||
            !stream.data.candidates.length}
            onClick={()=>add(stream.data.candidates)}>Add Linked Players</button>
          {stream.data.library.length?<label>Creature or NPC<select value={library}
            onChange={e=>setLibrary(e.target.value)}>
            <option value="">Select an existing GM source</option>
            {stream.data.library.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
          </select><button disabled={busy||!combat.sessionEditable||!library}
            onClick={addLibrary}>Add Source</button></label>:null}
        </div>
        <fieldset className={styles.fields}><legend>Custom Creature / NPC</legend>
          <label>Name<input value={enemy.name} maxLength={120}
            onChange={e=>setEnemy(x=>({...x,name:e.target.value}))}/></label>
          <label>Type<select value={enemy.type}
            onChange={e=>setEnemy(x=>({...x,type:e.target.value}))}>
            <option>Creature</option><option>NPC</option></select></label>
          {['hp','sp','mp','xpReward','ac','initiative'].map(k=><label key={k}>
            {k.toUpperCase()}<input type="number" min={k==='hp'?1:0}
              value={enemy[k]} onChange={e=>setEnemy(x=>({...x,[k]:e.target.value}))}/></label>)}
          <button disabled={busy||!combat.sessionEditable||!enemy.name.trim()||!enemy.hp}
            type="button" onClick={addEnemy}>Add Custom Creature</button>
        </fieldset>
      </section>:<p>Encounter setup is locked during active combat. End combat before changing the roster.</p>}
      </CombatCommandPanel>
      <CombatCommandPanel id="map">
        <section className={styles.section}>
          <h3>Battle Map &amp; Player Display</h3>
          <p>Prepare the encounter map using the existing GM Battle Map Manager. A selected prepared map links through the protected combat service when combat begins.</p>
          <p>Prepared map: {stream.data.maps?.find(map=>map.id===combat.preparedMapId)?.name||'Not selected'} · Live map: {stream.data.maps?.find(map=>map.id===combat.battleMapId)?.name||'Not linked'}</p>
          {canSetup?<label>Encounter battle map<select aria-label="Encounter battle map" value={selectedBattleMap||combat.preparedMapId||''}
            onChange={event=>setSelectedBattleMap(event.target.value)}>
            <option value="">No map</option>
            {(stream.data.maps||[]).map(map=><option key={map.id} value={map.id}>{map.name}</option>)}
          </select></label>:null}
          <div className={styles.controls}>
            {canSetup?<button type="button" disabled={busy||!combat.sessionEditable}
              onClick={()=>submit('encounter',{operation:'map-prepare',
                mapId:selectedBattleMap||combat.preparedMapId||''})}>
              Save Prepared Map</button>:null}
            {combat.isActive&&combat.preparedMapId&&!combat.battleMapId?
              <button type="button" disabled={busy||!combat.sessionEditable}
                onClick={()=>submit('encounter',{operation:'map-link',mapId:combat.preparedMapId})}>
                Link Prepared Map to Live Combat</button>:null}
            <button type="button" disabled={!onNavigate}
              onClick={()=>onNavigate?.('battle-maps')}>Open Battle Maps</button>
            <button type="button" disabled={!onNavigate}
              onClick={()=>onNavigate?.('presentation')}>Open Player Display</button>
          </div>
        </section>
      </CombatCommandPanel>
    </CombatCommandCentre>:null}
    {combat?<PreparedEncounterLibrary api={api} campaignId={campaignId}
      combat={combat} plans={stream.data.preparedEncounters||[]}
      maps={stream.data.maps||[]} mediaApi={mediaApi}
      library={stream.data.library||[]}/>:null}
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
export function PlayerCombatWorkspace({api,campaignId,characterId}){
  const stream=useCombatStream(api,'watchPlayer',[campaignId,characterId]);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),
    [error,setError]=useState('');
  const combat=stream.data?.combat,actor=combat?.ownActor;
  useEffect(()=>{setNotice('');setError('');},[campaignId,characterId]);
  const command=async(actorId,input)=>{
    if(busy||!combat)return;
    setBusy(true);setNotice('');setError('');
    try{
      const result=await api.commandPlayer(campaignId,characterId,actorId,{
        ...input,revision:combat.revision
      });
      setNotice(result.message||'Combat command confirmed by Firebase.');
    }catch(failure){setError(failure?.message||'Action rejected.');}
    finally{setBusy(false);}
  };
  return <section className={styles.workspace} data-testid="site-player-combat">
    <h2>Combat &amp; Initiative</h2>
    {stream.loading?<p role="status">Verifying your combat participant…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    {combat?<>
      <p role="status">{combat.status.toUpperCase()} · Round {combat.round}
        {' · '}Session {stream.data.session.status}</p>
      <CombatRoster combat={combat}/>
      {actor?<section className={styles.section}>
        <h3>Your Turn: {actor.name}</h3>
        <CombatStatusBadges combat={combat} actor={actor}/>
        <Resources row={actor}/>
        <p>{actor.current?'You are the active combatant.':'Wait for your turn.'}
          {' '}AP: {actor.ap??0} · Bonus action: {actor.bonus?'available':'used'}</p>
        <Actions actor={actor} combat={combat} disabled={busy||Boolean(combat.pending)}
          onCommand={command} mode="player"/>
      </section>:<p>Your linked character is not in the encounter.</p>}
      {combat.pending?<p role="status">An action is pending GM resolution.</p>:null}
    </>:null}
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
