import React,{useEffect,useState} from 'react';
import {COMBAT_AP_ACTIONS,COMBAT_BASIC_DECLARATIONS,customEnemy,libraryEnemy} from './combatModel.mjs';
import {CombatCommandCentre,CombatCommandPanel} from './CombatCommandCentre.jsx';
import {COMBAT_PANEL_IDS} from './combatWorkspaceLayoutModel.mjs';
import {prepareQuickEncounterTemplate} from '../../state/preparedEncounterModel.mjs';
import {PreparedEncounterLibrary} from './PreparedEncounterLibrary.jsx';
import {CombatBattleMapPanel} from './CombatBattleMapPanel.jsx';
import {EnemyCombatTracker} from './EnemyCombatTracker.jsx';
import {GMLiveCombatPanel} from './GMLiveCombatPanel.jsx';
import {GMEncounterWavesPanel} from './GMEncounterWavesPanel.jsx';
import {GMEncounterHistoryPanel} from './GMEncounterHistoryPanel.jsx';
import styles from './CombatWorkspace.module.css';
import {GMAdvancedCombatControls,GMAdvancedActionQueue} from './GMAdvancedCombatControls.jsx';
import {CombatInitiativeInput} from './CombatInitiativeInput.jsx';
import {PHYSICAL_DICE_FACES} from '../../state/hybridPhysicalDiceModel.mjs';
import {ForgedBadge} from './ForgedBadge.jsx';

const emptyEnemy={name:'',type:'Creature',hp:'20',sp:'',mp:'',xpReward:'0',ac:'',initiative:''};
function useCombatStream(api,method,args){
  const [generation,setGeneration]=useState(0);
  const [state,setState]=useState({loading:true,data:null,error:''});
  useEffect(()=>{
    let alive=true,stop=()=>{};
    setState({loading:true,data:null,error:''});
    if(!api||typeof api[method]!=='function'){
      setState({loading:false,data:null,error:'The authenticated combat service is unavailable.'});
      return ()=>{alive=false;};
    }
    try{
      stop=api[method](...args,result=>{
        if(alive)setState({loading:false,data:result,error:''});
      },error=>{
        if(alive)setState({loading:false,data:null,error:error?.message||'Combat access denied.'});
      });
    }catch(error){setState({loading:false,data:null,error:error?.message||'Combat is unavailable.'});}
    return()=>{alive=false;stop?.();};
  },[api,method,...args,generation]);
  // Reconnect always creates a fresh authenticated listener. The previous
  // listener is disposed and cached combat data is hidden until verified.
  return {...state,reconnect:()=>setGeneration(value=>value+1)};
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
  const own=actor?.current&&combat.isActive&&!combat.paused&&!actor.turnComplete&&combat.sessionEditable;
  const [cost,setCost]=useState(1);
  const [optionId,setOptionId]=useState('basic:command');
  const [targetId,setTargetId]=useState('');
  const [shoveChoice,setShoveChoice]=useState('push');
  const selectedOption=COMBAT_BASIC_DECLARATIONS.find(option=>option.id===optionId);
  const allowedTargets=combat.combatants.filter(row=>row.id!==actor?.id&&!row.defeated);
  const declare=()=>onCommand(actor.id,{
    operation:'declare',optionId,targetIds:selectedOption?.requiresTarget?[targetId]:[],
    ...(optionId==='basic:shove'?{choice:shoveChoice}:{})
  });
  return <div className={styles.controls}>
    {COMBAT_AP_ACTIONS.map(({ap,label})=><button key={ap} type="button"
      disabled={disabled||!own||actor.ap<ap||(ap===0&&!actor.bonus)}
      onClick={()=>onCommand(actor.id,{operation:'spend-ap',ap})}>{label}</button>)}
    <button disabled={disabled||!own||actor.pendingDeathSave} type="button"
      onClick={()=>onCommand(actor.id,{operation:'end-turn'})}>End Turn</button>
    {actor.pendingDeathSave?<button disabled={disabled||!own} type="button"
      onClick={()=>onCommand(actor.id,{operation:'death-save'})}>Roll Death Save</button>:null}
    <fieldset className={styles.actionDeclaration} data-testid="site-combat-declare-basic">
      <legend>Declare a basic action</legend>
      <label>Action<select value={optionId}
        onChange={event=>{setOptionId(event.target.value);setTargetId('');}}>
        {COMBAT_BASIC_DECLARATIONS.map(option=><option key={option.id} value={option.id}>
          {option.name}</option>)}
      </select></label>
      {selectedOption?.requiresTarget?<label>Target<select value={targetId}
        onChange={event=>setTargetId(event.target.value)}>
        <option value="">Select combatant</option>
        {allowedTargets.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}
      </select></label>:null}
      {optionId==='basic:shove'?<label>Shove result<select value={shoveChoice}
        onChange={event=>setShoveChoice(event.target.value)}>
        <option value="push">Push</option><option value="prone">Knock prone</option>
      </select></label>:null}
      <button type="button" disabled={disabled||!own||
        (selectedOption?.requiresTarget&&!targetId)}
        onClick={declare}>Declare Action for GM Review</button>
      <small>Declarations use the authoritative combat action and GM adjudication
        system. Do not record another AP spend for the same action.</small>
    </fieldset>
    {mode==='gm'?<label>AP quick selection<select value={cost} onChange={e=>setCost(Number(e.target.value))}>
      {[1,2,3].map(x=><option key={x} value={x}>{x} AP</option>)}
    </select><button type="button" disabled={disabled||!own||actor.ap<cost}
      onClick={()=>onCommand(actor.id,{operation:'spend-ap',ap:cost})}>Spend selected AP</button></label>:null}
  </div>;
}
function GMPhysicalDiceRecord({combat,busy,onCommand}){
  const [targetId,setTargetId]=useState(''),[faces,setFaces]=useState(20),
    [result,setResult]=useState(''),[purpose,setPurpose]=useState('');
  const participants=combat?.combatants||[];
  const chosen=participants.some(row=>row.id===targetId)?targetId:participants[0]?.id||'';
  const face=Number(result);
  const valid=Number.isSafeInteger(face)&&face>=1&&face<=faces&&
    purpose.trim().length>=3&&purpose.trim().length<=160&&Boolean(chosen);
  return <details className={styles.section} data-testid="site-hybrid-physical-dice">
    <summary>Hybrid gameplay · witnessed physical dice</summary>
    <p>Record a real-world die result in the encounter history. This never spends AP,
      deals damage, casts spells or replaces the normal GM action approval.</p>
    <div className={styles.fields}>
      <label>Participant<select value={chosen} onChange={e=>setTargetId(e.target.value)}>
        {participants.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <label>Die<select value={faces} onChange={e=>{setFaces(Number(e.target.value));setResult('');}}>
        {PHYSICAL_DICE_FACES.map(value=><option key={value} value={value}>d{value}</option>)}
      </select></label>
      <label>Observed result<input type="number" min="1" max={faces} step="1"
        value={result} onChange={e=>setResult(e.target.value)}/></label>
      <label>Reason / action<input maxLength={160} value={purpose}
        onChange={e=>setPurpose(e.target.value)} placeholder="e.g. Physical initiative roll"/></label>
      <button type="button" disabled={busy||!combat?.isActive||!combat?.sessionEditable||!valid}
        onClick={()=>{onCommand('encounter',{operation:'record-physical-roll',
          targetId:chosen,faces,result:face,reason:purpose.trim()});setResult('');}}>
        Record witnessed roll
      </button>
    </div>
  </details>;
}
function GMEncounterSnapshots({api,campaignId,combat,busy,onCommand}){
  const [entries,setEntries]=useState([]),[name,setName]=useState(''),[reason,setReason]=useState('');
  const [error,setError]=useState('');
  const activeId=combat.isActive?combat.combatId:'';
  useEffect(()=>{
    setEntries([]);setError('');setName('');setReason('');
    if(!activeId||!api?.watchEncounterSnapshots)return undefined;
    return api.watchEncounterSnapshots(campaignId,activeId,setEntries,
      failure=>{setEntries([]);
        setError(failure?.message||'Encounter snapshots could not load.');});
  },[api,campaignId,activeId]);
  if(!activeId||!api?.watchEncounterSnapshots)return null;
  const disabled=busy||!combat.sessionEditable;
  return <details className={styles.section}>
    <summary>GM encounter snapshots</summary>
    <p>Restore map positions, fog and initiative. Current resources, AP and turn progress are kept.</p>
    <div className={styles.fields}>
      <label>Snapshot name<input value={name} maxLength={80}
        onChange={event=>setName(event.target.value)}/></label>
      <button type="button" disabled={disabled||!name.trim()||entries.length>=8}
        onClick={()=>onCommand('encounter',{operation:'save-snapshot',name:name.trim()})}>Save Snapshot</button>
      <label>Restore reason<input value={reason} maxLength={160}
        onChange={event=>setReason(event.target.value)}/></label>
    </div>
    {entries.map(entry=><div className={styles.controls} key={entry.id}>
      <span>{entry.name} · {new Date(entry.at).toLocaleString()}</span>
      <button type="button" disabled={disabled||Boolean(combat.pending)||!reason.trim()}
        onClick={()=>onCommand('encounter',{operation:'restore-snapshot',snapshotId:entry.id,
          reason:reason.trim()})}>Restore</button>
      <button type="button" disabled={disabled}
        onClick={()=>{if(window.confirm('Remove this encounter snapshot?'))
          onCommand('encounter',{operation:'delete-snapshot',snapshotId:entry.id});}}>Remove</button>
    </div>)}
    {error?<p role="alert">{error}</p>:null}
  </details>;
}
export function GMCombatWorkspace({api,campaignId,uid='',mediaApi=null,onNavigate=null,legacyEncounter=null,legacyCharacters={},legacyCombatState=null,renderPartyResources=null}){
  const stream=useCombatStream(api,'watchGM',[campaignId]);
  const [selected,setSelected]=useState(''),[busy,setBusy]=useState(false),
    [notice,setNotice]=useState(''),[error,setError]=useState('');
  const [enemy,setEnemy]=useState(emptyEnemy),[library,setLibrary]=useState('');
  const [selectedBattleMap,setSelectedBattleMap]=useState(null);
  const [quickTemplateName,setQuickTemplateName]=useState(''),[reinforcementInitiative,setReinforcementInitiative]=useState('');

  const [resource,setResource]=useState('hp'),[amount,setAmount]=useState(''),
    [maximum,setMaximum]=useState(''),[reason,setReason]=useState('');
  const combat=stream.data?.combat;
  const current=selected&&combat?.combatants.find(row=>row.id===selected)||
    combat?.current||combat?.combatants[0]||null;
  useEffect(()=>{setSelected('');setError('');setNotice('');setSelectedBattleMap(null);setQuickTemplateName('');setReinforcementInitiative('');},[campaignId]);
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
  const manualReinforcement=combat?.isActive&&['manual','mixed'].includes(combat.initiativeMode);
  const validReinforcement=reinforcementInitiative!==''&&Number.isInteger(Number(reinforcementInitiative))&&
    Number(reinforcementInitiative)>=-100&&Number(reinforcementInitiative)<=1000;
  const withReinforcementInitiative=row=>({...row,initiativeSet:true,initiative:Number(reinforcementInitiative)});
  const addLibrary=()=>{
    const candidate=stream.data.library.find(row=>row.id===library);
    if(!candidate)return;
    const creature=libraryEnemy({...candidate,id:candidate.sourceId},'enemy-'+crypto.randomUUID());
    add([combat.initiativeMode==='manual'&&combat.isActive?withReinforcementInitiative(creature):creature]);
  };
  const saveQuickTemplate=async()=>{
    if(!combat?.sessionEditable||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const template=prepareQuickEncounterTemplate(quickTemplateName,combat);
      await api.savePrepared(campaignId,{id:'prepared-'+crypto.randomUUID(),...template},0);
      setQuickTemplateName('');
      setNotice('Quick encounter saved as a reusable template.');
    }catch(failure){setError(failure?.message||'Could not save the encounter template.');}
    finally{setBusy(false);}
  };
  const canSetup=combat&&combat.status!=='active';
  return <section className={styles.workspace} data-testid="site-gm-combat">
    <h2>Combat Command Centre</h2>
    {stream.loading?<p role="status">Verifying live combat access…</p>:null}
    {stream.error?<p role="alert">{stream.error}</p>:null}
    <button type="button" data-testid="site-gm-combat-reconnect"
      disabled={stream.loading||busy} onClick={stream.reconnect}>
      Reconnect live encounter
    </button>
    <CombatCommandCentre key={uid+':'+campaignId} uid={uid} campaignId={campaignId}>
    <CombatCommandPanel id="resources">
      {typeof renderPartyResources==='function'?
        ({order,onReorder})=>renderPartyResources({order,onReorder}):
        <p>GM Player Resources are available when the campaign roster is connected.</p>}
    </CombatCommandPanel>
    {combat?<React.Fragment>
      <CombatCommandPanel id="controls">
      <p role="status">{combat.paused?'PAUSED':combat.status.toUpperCase()} · Round {combat.round} · Revision {combat.revision}
        {' · '}Session {stream.data.session.status}</p>
      <div className={styles.controls}>
        <button type="button" disabled={busy||!combat.sessionEditable||!canSetup||
          !combat.combatants.length}
          onClick={()=>submit('encounter',{operation:'start'})}>Start Combat</button>
        <GMLiveCombatPanel combat={combat} pending={stream.data.pending}
          log={stream.data.combatLog||[]} busy={busy} onCommand={submit} view="status"/>
        {combat.isActive?<button type="button" disabled={busy||!combat.sessionEditable}
          onClick={()=>submit('encounter',{operation:combat.paused?'resume':'pause'})}>
          {combat.paused?'Resume Combat':'Pause Combat'}
        </button>:null}
        <button type="button" disabled={busy||!combat.sessionEditable||!combat.isActive}
          onClick={()=>{if(window.confirm('End combat and archive the final roster for GM reward review? Spent resources remain spent.'))
            submit('encounter',{operation:'end'});}}>End Combat</button>
        <button type="button" disabled={busy||!combat.sessionEditable||!canSetup}
          onClick={()=>{if(window.confirm('Clear the encounter roster?'))
            submit('encounter',{operation:'clear'});}}>Clear Encounter</button>
      </div>

      </CombatCommandPanel>
      <CombatCommandPanel id="history">
        <GMEncounterHistoryPanel api={api} campaignId={campaignId} busy={busy} combat={combat} onCommand={submit}/>
        <GMEncounterSnapshots api={api} campaignId={campaignId} combat={combat} busy={busy} onCommand={submit}/>
        <GMPhysicalDiceRecord combat={combat} busy={busy} onCommand={submit}/>
      </CombatCommandPanel>
      <CombatCommandPanel id="enemyTracker">
        <EnemyCombatTracker combat={combat} onCommand={submit}
          busy={busy||Boolean(stream.data.pending)}/>
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
              <option value="initiative">Initiative</option>
            </select></label>
            <label>Current value<input type="number" min={resource==='initiative'?-100:0} value={amount}
              onChange={e=>setAmount(e.target.value)}/></label>
            {!['ap','initiative'].includes(resource)?<label>Maximum (optional)<input type="number" min="1"
              value={maximum} onChange={e=>setMaximum(e.target.value)}/></label>:null}
            <label>Reason<input value={reason} maxLength={160}
              onChange={e=>setReason(e.target.value)}/></label>
          </div>
          <button type="button" disabled={busy||!combat.sessionEditable||!reason.trim()||
            amount===''||!Number.isFinite(Number(amount))||
            Number(amount)<(resource==='initiative'?-100:0)||
            (resource==='initiative'&&Number(amount)>1000)||(resource==='ap'&&Number(amount)>3)}
            onClick={()=>submit(current.id,{operation:'correct',targetId:current.id,reason:reason.trim(),
              ...(['ap','initiative'].includes(resource)?{[resource]:Number(amount)}:{
                resource,current:Number(amount),
                ...(maximum!==''?{maximum:Number(maximum)}:{})
              })})}>Apply GM Correction</button>
          {combat.isActive&&current.opportunityUsed?<button type="button"
            disabled={busy||!combat.sessionEditable||Boolean(combat.pending)||!reason.trim()}
            onClick={()=>submit(current.id,{operation:'correct',targetId:current.id,reason:reason.trim(),
              restoreOpportunity:true})}>Restore Round Opportunity</button>:null}
        </details>
        {canSetup?<div className={styles.fields}>
          <label>Set initiative
            <CombatInitiativeInput key={current.id} entry={current}
              disabled={busy||!combat.sessionEditable}
              onCommit={value=>changeRoster(current.id,{initiative:value,initiativeSet:true})}/>
          </label>
          <button type="button" disabled={busy} onClick={()=>remove(current.id)}>
            Remove Participant</button>
        </div>:combat.isActive&&!combat.paused?<button type="button"
          disabled={busy||!combat.sessionEditable||current.current||Boolean(combat.pending)}
          onClick={()=>remove(current.id)}>Remove Participant</button>:null}
      </section>:<p>Select an encounter participant to view combatant controls.</p>}
      </CombatCommandPanel>
      <CombatCommandPanel id="setup">
      {!combat.paused?<section className={styles.section}>
        <h3>Encounter Setup</h3>
        {Object.entries(stream.data.preparedDetails||{}).filter(([,value])=>value).map(([key,value])=>
          <p key={key}><strong>{({description:'Description',notes:'GM notes',environment:'Environment',
            rewardNotes:'Reward notes'})[key]}</strong> {value}</p>)}
        <label>Initiative mode
          <select aria-label="Encounter initiative mode"
            value={combat.initiativeMode||'automatic'}
            disabled={!canSetup||busy||!combat.sessionEditable}
            onChange={event=>submit('encounter',{operation:'save',encounter:{
              combatants:roster(),initiativeMode:event.target.value
            }})}>
            <option value="automatic">Automatic: roll any unset initiatives</option>
            <option value="manual">Manual: GM sets every initiative</option>
            <option value="mixed">Mixed: GM sets player initiatives; enemies roll automatically</option>
          </select>
        </label>
        {combat.initiativeMode==='manual'||combat.initiativeMode==='mixed'?<p>
          Set the required initiative scores in the initiative panel before starting combat.
        </p>:null}
        {manualReinforcement?<label>New participant initiative<input type="number" min="-100" max="1000"
          value={reinforcementInitiative} onChange={event=>setReinforcementInitiative(event.target.value)}/></label>:null}
        <div className={styles.controls}>
          <button type="button" disabled={busy||!combat.sessionEditable||manualReinforcement||
            !stream.data.candidates.length}
            onClick={()=>add(stream.data.candidates)}>Add Linked Players</button>
          {stream.data.candidates.length?<label>Add a character<select value=""
            disabled={busy||!combat.sessionEditable||Boolean(combat.pending)||(manualReinforcement&&!validReinforcement)}
            onChange={event=>{
              const row=stream.data.candidates.find(candidate=>candidate.id===event.target.value);
              if(row)add([manualReinforcement?withReinforcementInitiative(row):row]);
            }}>
            <option value="">Choose a linked character</option>
            {stream.data.candidates.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
          </select></label>:null}
          {stream.data.library.length?<label>Creature or NPC<select value={library}
            onChange={e=>setLibrary(e.target.value)}>
            <option value="">Select an existing GM source</option>
            {stream.data.library.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
          </select><button disabled={busy||!combat.sessionEditable||!library||(combat.isActive&&combat.initiativeMode==='manual'&&!validReinforcement)}
            onClick={addLibrary}>Add Source</button></label>:null}
        </div>
        <fieldset className={styles.fields}><legend>Custom Creature / NPC</legend>
          <label>Name<input value={enemy.name} maxLength={120}
            onChange={e=>setEnemy(x=>({...x,name:e.target.value}))}/></label>
          <label>Type<select value={enemy.type}
            onChange={e=>setEnemy(x=>({...x,type:e.target.value}))}>
            <option>Creature</option><option>NPC</option></select></label>
          {['hp','sp','mp','xpReward','ac','initiative'].map(k=><label key={k}>
            {k.toUpperCase()}<input type="number" min={k==='initiative'?-100:k==='hp'?1:0}
              value={enemy[k]} onChange={e=>setEnemy(x=>({...x,[k]:e.target.value}))}/></label>)}
          <button disabled={busy||!combat.sessionEditable||!enemy.name.trim()||!enemy.hp||
            (combat.isActive&&combat.initiativeMode==='manual'&&enemy.initiative==='')}
            type="button" onClick={addEnemy}>Add Custom Creature</button>
        </fieldset>
      </section>:<p>Resume combat to change the roster.</p>}
      {combat.combatants.some(row=>row.kind==='enemy')?<div className={styles.fields}>
        <label>Template name<input value={quickTemplateName} maxLength={100}
          onChange={event=>setQuickTemplateName(event.target.value)}/></label>
        <button type="button" disabled={busy||!combat.sessionEditable||!quickTemplateName.trim()}
          onClick={saveQuickTemplate}>Save Quick Encounter as Template</button>
      </div>:null}
      </CombatCommandPanel>
      <CombatCommandPanel id="map">
        <section className={styles.section}>
          <h3>Battle Map &amp; Player Display</h3>
          <p>Prepare the encounter map using the existing GM Battle Map Manager. A selected prepared map links through the protected combat service when combat begins.</p>
          <p>Prepared map: {stream.data.maps?.find(map=>map.id===combat.preparedMapId)?.name||'Not selected'} · Live map: {stream.data.maps?.find(map=>map.id===combat.battleMapId)?.name||'Not linked'}</p>
          {(canSetup||combat.isActive&&!combat.battleMapId)?<label>Encounter battle map<select aria-label="Encounter battle map" value={selectedBattleMap===null?combat.preparedMapId||'':selectedBattleMap}
            onChange={event=>setSelectedBattleMap(event.target.value)}>
            <option value="">No map</option>
            {(stream.data.maps||[]).map(map=><option key={map.id} value={map.id}>{map.name}</option>)}
          </select></label>:null}
          <CombatBattleMapPanel key={campaignId+':'+combat.combatId+':'+combat.battleMapId}
            mediaApi={mediaApi} campaignId={campaignId} combat={combat}
            previewMapId={selectedBattleMap} pending={legacyCombatState?.pending} onCommand={submit} busy={busy}/>
          <div className={styles.controls}>
            {canSetup?<button type="button" disabled={busy||!combat.sessionEditable}
              onClick={()=>submit('encounter',{operation:'map-prepare',
                mapId:selectedBattleMap===null?combat.preparedMapId||'':selectedBattleMap})}>
              Save Prepared Map</button>:null}
            {combat.isActive&&!combat.battleMapId?
              <button type="button" disabled={busy||!combat.sessionEditable||combat.paused||
                !(selectedBattleMap===null?combat.preparedMapId:selectedBattleMap)}
                onClick={()=>submit('encounter',{operation:'map-link',mapId:selectedBattleMap===null?
                  combat.preparedMapId:selectedBattleMap})}>
                Link Map to Live Combat</button>:null}
            <button type="button" disabled={!onNavigate}
              onClick={()=>onNavigate?.('battle-maps')}>Open Battle Maps</button>
            <button type="button" disabled={!onNavigate}
              onClick={()=>onNavigate?.('presentation')}>Open Player Display</button>
          </div>
        </section>
      </CombatCommandPanel>
      <CombatCommandPanel id="queue">
        {legacyEncounter?<GMAdvancedActionQueue api={api}
          campaignId={campaignId} encounter={legacyEncounter}
          characters={legacyCharacters} combatState={legacyCombatState||{pending:null}}/>:
          <p>Waiting for the authenticated encounter action queue.</p>}
      </CombatCommandPanel>
      <CombatCommandPanel id="timer">
        <GMLiveCombatPanel combat={combat} pending={stream.data.pending}
          log={stream.data.combatLog||[]} busy={busy} onCommand={submit} view="timer"/>
      </CombatCommandPanel>
      <CombatCommandPanel id="waves">
        <GMEncounterWavesPanel combat={combat} schedule={stream.data.encounterSchedule}
          pending={stream.data.pending} busy={busy} onCommand={submit} view="waves"/>
      </CombatCommandPanel>
      <CombatCommandPanel id="events">
        <GMEncounterWavesPanel combat={combat} schedule={stream.data.encounterSchedule}
          pending={stream.data.pending} busy={busy} onCommand={submit} view="events"/>
      </CombatCommandPanel>
      <CombatCommandPanel id="log">
        <GMLiveCombatPanel combat={combat} pending={stream.data.pending}
          log={stream.data.combatLog||[]} busy={busy} onCommand={submit} view="log"/>
      </CombatCommandPanel>
      <CombatCommandPanel id="advanced">
        {legacyEncounter?<GMAdvancedCombatControls api={api}
          campaignId={campaignId} encounter={legacyEncounter}
          characters={legacyCharacters}/>:
          <p>Advanced encounter state is unavailable.</p>}
      </CombatCommandPanel>
      <CombatCommandPanel id="prepared">
        <PreparedEncounterLibrary api={api} campaignId={campaignId}
          combat={combat} plans={stream.data.preparedEncounters||[]}
          staged={stream.data.stagedEncounters||[]} party={stream.data.party||[]}
          maps={stream.data.maps||[]} mediaApi={mediaApi}
          library={stream.data.library||[]}/>
      </CombatCommandPanel>
    </React.Fragment>:COMBAT_PANEL_IDS.filter(id=>id!=='resources').map(id=><CombatCommandPanel id={id} key={id}>
      <div className={styles.connectionPlaceholder}>
        <p>{stream.loading?'Connecting to the authenticated combat service…':
          stream.error?'This tool is unavailable until combat access is restored.':
          'Waiting for a verified campaign combat record.'}</p>
      </div>
    </CombatCommandPanel>)}
    </CombatCommandCentre>
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
    <button type="button" data-testid="site-player-combat-reconnect"
      disabled={stream.loading||busy} onClick={stream.reconnect}>
      Reconnect combat status
    </button>
    {combat?<>
      <p role="status">{combat.paused?'PAUSED':combat.status.toUpperCase()} · Round {combat.round}
        {' · '}Session {stream.data.session.status}</p>
      {combat.publicEvent?<p role="status" data-testid="site-player-encounter-event">
        Encounter event: {combat.publicEvent.name} · Round {combat.publicEvent.round}
      </p>:null}
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
