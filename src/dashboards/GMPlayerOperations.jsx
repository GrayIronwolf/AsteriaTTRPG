import React,{useMemo,useRef,useState} from 'react';
import {Panel,ResourceBar,StatusPill} from '../components/WorkspaceUI.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {ConditionsPanel,ResourceRulesPanel} from './CharacterSystemsPanels.jsx';
import {GMContextCheckLauncher} from './GMContextCheckLauncher.jsx';
import {GMUniversalCheckManager} from './UniversalCheckWorkspace.jsx';
import {
  GM_PLAYER_ACTIVITY_KINDS,gmPlayerSnapshot,gmPlayerOperationsEnabled,
  gmPlayerResourceAdjustmentValid,gmPlayerActivityRows,gmPlayerCheckActionAllowed
} from '../state/gmPlayerOperationsModel.mjs';

const title=value=>String(value||'').replace(/[-_]/g,' ').replace(/^./,char=>char.toUpperCase());
const err=e=>e?.message||String(e||'The server rejected the request.');
const formatTime=ms=>ms?new Date(ms).toLocaleString():'Time unavailable';
const amountLabel=n=>Number(n)>0?'+'+n:String(n);
function EmptySelection(){return <p className="react-gm-player-notice" role="status">Choose a verified campaign character to view player tools and request interactions.</p>;}
function Field({label,value}){return <div><small>{label}</small><strong>{value??'—'}</strong></div>;}

export function GMPlayerTools({campaignId,selected=null,access={},session={},clock={},onOpenCharacter,onNavigate}){
  const [adjustKey,setAdjustKey]=useState('hp');
  const [delta,setDelta]=useState('');
  const [xp,setXP]=useState('');
  const [reason,setReason]=useState('Session reward');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const pending=useRef(false);
  const character=selected?.character||null;
  const snapshot=useMemo(()=>gmPlayerSnapshot(character||{},clock),[character,clock]);
  const allowed=gmPlayerOperationsEnabled({access,session,selected});
  const verified=Boolean(character?.id&&selected?.id===character.id);
  const adjustable=verified&&gmPlayerResourceAdjustmentValid({
    resource:adjustKey,delta,character,editable:allowed});
  const amount=Number(xp);
  const xpValid=allowed&&verified&&xp.trim()!==''&&Number.isSafeInteger(amount)&&amount>=1&&amount<=100000000;
  const execute=async(action,description)=>{
    if(pending.current||!allowed)return;
    pending.current=true;setBusy(true);setMessage('');
    try{
      const result=await action();
      if(result?.ok===false)throw Error(result.error||'Campaign action failed.');
      setMessage(description+' Server result received. Check the character history before repeating.');
    }catch(error){setMessage(err(error));}
    finally{pending.current=false;setBusy(false);}
  };
  const resourceChange=()=>{
    if(!adjustable||!window.confirm('Apply '+amountLabel(delta)+' '+adjustKey.toUpperCase()+
      ' to '+snapshot.name+'? This changes live campaign resources.'))return;
    execute(()=>firebaseService.updateResource(campaignId,character.id,adjustKey,Number(delta),{
      source:'GM Player Manager',expectedCoreRevision:Number(character.coreRevision||0)
    }),'Resource adjustment submitted.');
    setDelta('');
  };
  const grant=()=>{
    if(!xpValid||!reason.trim()||reason.trim().length>180)return;
    if(!window.confirm('Award '+amount+' XP to '+snapshot.name+'? This creates a player-visible event.'))return;
    execute(()=>firebaseService.grantXP(campaignId,character.id,amount,{
      source:'GM Player Manager',reason:reason.trim()
    }),'XP award submitted.');
    setXP('');
  };
  if(!verified)return <Panel title="Individual Player Tools" eyebrow="Character inspection"><EmptySelection/></Panel>;
  return <div className="react-gm-player-focus-grid" data-testid="gm-player-tools">
    <Panel title={snapshot.name} eyebrow={'Individual Player Tools · '+selected.accountName}>
      <div className="react-gm-player-detail-head">
        <div><strong>{snapshot.characterClass}</strong>
          <small>Level {snapshot.level??'—'} · {title(selected.role)} · {title(selected.status)}</small></div>
        <StatusPill tone={selected.online?'success':''}>{selected.online?'Online':'Presence not verified'}</StatusPill>
      </div>
      <div className="react-gm-player-details">
        <Field label="Experience" value={snapshot.xp!=null?
          snapshot.xp.toLocaleString()+(snapshot.xpMax!=null?' / '+snapshot.xpMax.toLocaleString():''):'Not recorded'}/>
        <Field label="Skills" value={snapshot.skillCount}/>
        <Field label="Inventory types" value={snapshot.inventoryTypes}/>
        <Field label="Item units" value={snapshot.inventoryUnits}/>
        <Field label="Active conditions" value={snapshot.conditions.length}/>
      </div>
      <div className="react-gm-player-resource-list">
        {Object.entries(snapshot.resources).map(([key,pair])=>
          <ResourceBar key={key} kind={key} label={key.toUpperCase()}
            value={pair.current} maximum={pair.maximum}/>)}
      </div>
      <div className="react-gm-player-actions">
        <button type="button" onClick={()=>onOpenCharacter?.(character)}>Open character sheet</button>
        <button type="button" onClick={()=>onNavigate?.({tab:'inventory'})}>Inventory &amp; trading</button>
        <button type="button" onClick={()=>onNavigate?.({tab:'quests'})}>Quest progress</button>
        <button type="button" onClick={()=>onNavigate?.({tab:'tools'})}>All GM character controls</button>
      </div>
      {snapshot.skillNames.length?<details className="react-gm-player-detail-expand"><summary>Known skills ({snapshot.skillCount})</summary>
        <p>{snapshot.skillNames.join(', ')}{snapshot.skillCount>snapshot.skillNames.length?' and others':''}</p></details>:null}
      {snapshot.conditions.length?<details className="react-gm-player-detail-expand"><summary>Active conditions ({snapshot.conditions.length})</summary>
        <ul>{snapshot.conditions.map((row,index)=><li key={row.id||index}>{row.name}</li>)}</ul></details>:null}
      <p className="react-gm-player-hint">Values reflect the verified campaign record. Opening a player sheet does not grant access to its private Forge original.</p>
    </Panel>
    <Panel title="GM Resources & Advancement" eyebrow="Explicit Confirmations / Existing Live Actions">
      {!allowed?<p role="status" className="react-gm-player-notice">Live changes require an active player membership and an editable campaign session. Read-only inspection remains available.</p>:null}
      <div className="react-gm-player-action-form">
        <h3>Adjust HP / SP / MP</h3>
        <div className="react-gm-player-action-fields">
          <label>Resource<select value={adjustKey} onChange={e=>setAdjustKey(e.target.value)}
            disabled={busy}>{['hp','sp','mp'].map(key=><option key={key} value={key}>{key.toUpperCase()}</option>)}</select></label>
          <label>Change (positive or negative)<input type="number" step="1" min="-100000" max="100000"
            value={delta} onChange={e=>setDelta(e.target.value)} disabled={busy||!allowed}
            placeholder="e.g. -5 or 10"/></label>
        </div>
        <button type="button" disabled={!adjustable||busy} onClick={resourceChange}>Confirm resource change</button>
      </div>
      <div className="react-gm-player-action-form">
        <h3>Grant XP</h3>
        <div className="react-gm-player-action-fields">
          <label>XP<input type="number" min="1" max="100000000" step="1" value={xp}
            onChange={e=>setXP(e.target.value)} disabled={busy||!allowed}/></label>
          <label>Reason<input value={reason} maxLength={180}
            onChange={e=>setReason(e.target.value)} disabled={busy||!allowed}/></label>
        </div>
        <button type="button" disabled={!xpValid||busy||!reason.trim()} onClick={grant}>Confirm XP award</button>
      </div>
      <div className="react-gm-player-actions">
        <button type="button" onClick={()=>onNavigate?.({tab:'tools'})}>Rewards, titles &amp; storage</button>
        <button type="button" onClick={()=>onNavigate?.({tab:'inventory'})}>Loot &amp; item exchanges</button>
      </div>
      <p className="react-gm-player-hint">Item rewards are reviewed and delivered through the existing GM Reward Tools. Currency credits and item claims use their existing player notifications and acknowledgement flow.</p>
      {message?<p role="status" className="react-gm-player-feedback">{message}</p>:null}
    </Panel>
    <div className="react-gm-player-focus-wide">
      <details className="react-gm-player-expand-section" open>
        <summary>Conditions and ongoing effects</summary>
        <ConditionsPanel key={character.id} campaignId={campaignId} character={character}
          editable={allowed} isGM clock={clock}/>
      </details>
      <details className="react-gm-player-expand-section">
        <summary>Resource rules and recovery configuration</summary>
        <ResourceRulesPanel key={character.id} campaignId={campaignId} character={character} editable={allowed}/>
      </details>
    </div>
  </div>;
}

export function GMPlayerLiveActions({campaignId,selected=null,characters={},access={},checks=[],session={},onNavigate}){
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const outstanding=useRef(null);
  const permitted=gmPlayerOperationsEnabled({access,session,selected});
  const character=selected?.character;
  const current=checks.filter(row=>row.characterId===selected?.id).slice(0,30);
  const action=async(row,operation)=>{
    if(!permitted||busy||!gmPlayerCheckActionAllowed(row,operation))return;
    if(operation==='cancel'&&!window.confirm('Cancel this pending player check request?'))return;
    const payload={campaignId,action:operation,requestId:row.id};
    const fingerprint=JSON.stringify(payload);
    if(outstanding.current?.fingerprint!==fingerprint)
      outstanding.current={fingerprint,operationId:window.crypto.randomUUID()};
    setBusy(row.id);setMessage('');
    try{
      const response=await firebaseService.universalCheckAction({...payload,
        operationId:outstanding.current.operationId});
      if(response?.ok===false)throw Error(response.error||'Check request failed.');
      outstanding.current=null;
      setMessage('Check action submitted. Its status will update through the live subscription.');
    }catch(error){setMessage(err(error));}
    finally{setBusy('');}
  };
  if(!character)return <Panel title="Live GM-to-Player Actions" eyebrow="Check requests and notifications"><EmptySelection/></Panel>;
  return <div className="react-gm-player-live" data-testid="gm-player-live-actions">
    <Panel title={'GM-to-Player Actions · '+(character.name||character.id)}
      eyebrow="Realtime Check Requests & Player Notifications">
      <p className="react-gm-player-hint">Request digital or physical dice rolls with the existing Universal Check System. Players choose their dice mode, and results are sent to the GM. Existing permissions and server-side modifiers apply.</p>
      {!permitted?<p role="status" className="react-gm-player-notice">This character is not active in an editable session. Sending new gameplay requests is unavailable.</p>:null}
      {permitted?<GMContextCheckLauncher key={campaignId+':'+character.id}
        campaignId={campaignId} characters={{[character.id]:character}}
        context={{kind:'gameplay',label:'GM Player Manager',detail:'Individual player check'}}
        initialCharacterId={character.id} title="Request a check for this player"/>:null}
      <div className="react-gm-player-actions">
        <button type="button" onClick={()=>onNavigate?.({tab:'tools'})}>Open GM checks &amp; reward delivery</button>
        <button type="button" onClick={()=>onNavigate?.({tab:'inventory'})}>Inventory, loot &amp; trades</button>
      </div>
      <p className="react-gm-player-hint">The check system handles notifications, player responses, GM acknowledgement, rerolls, group checks and opposed checks. A check does not automatically transfer items or XP.</p>
    </Panel>
    <Panel title="Recent Player Check Results" eyebrow="Live, Server-Controlled Status">
      <div className="react-gm-player-record-list">
        {current.map(row=><article key={row.id}>
          <div><h3>{row.skill||row.characteristic||title(row.type)}</h3>
            <small>{title(row.status)} · {row.type||'Check'} · Attempt {row.attempt||1}</small>
            <p>{row.result?.total!=null?'Total '+row.result.total:'Awaiting result'}
              {row.dc!=null?' · DC '+row.dc:''}
              {row.mode?' · '+title(row.mode)+' dice':''}</p></div>
          <div className="react-gm-player-actions">
            {['resend','cancel','acknowledge','reroll'].filter(cmd=>gmPlayerCheckActionAllowed(row,cmd)).map(cmd=>
              <button type="button" key={cmd} disabled={!!busy||!permitted}
                onClick={()=>action(row,cmd)}>{title(cmd)}</button>)}
          </div>
        </article>)}
      </div>
      {!current.length?<p className="react-gm-player-hint">No recent checks for this character.</p>:null}
      {message?<p role="status" className="react-gm-player-feedback">{message}</p>:null}
      <details className="react-gm-player-expand-section">
        <summary>Full group, opposed and custom check manager</summary>
        <GMUniversalCheckManager campaignId={campaignId} characters={characters}/>
      </details>
    </Panel>
  </div>;
}

export function GMPlayerActivity({events=[],checks=[],characters={},membershipEvents=[],membershipAvailable=false,selected=null}){
  const [kind,setKind]=useState('all');
  const [query,setQuery]=useState('');
  const [scope,setScope]=useState('all');
  const selectedId=scope==='focused'&&selected?.id?selected.id:'all';
  const chosenUid=scope==='focused'&&selected?.uid?selected.uid:'';
  const rows=useMemo(()=>gmPlayerActivityRows({
    events,checks,characters,membershipEvents,
    selectedCharacterId:selectedId,selectedUid:chosenUid,kind,query,limit:150
  }),[events,checks,characters,membershipEvents,selectedId,chosenUid,kind,query]);
  return <Panel title="GM Player & Campaign Activity" eyebrow="Live Read-Only Timeline · Priority 10"
    className="react-gm-player-activity" action={<span>{rows.length} records</span>}>
    <p className="react-gm-player-hint">Recent verified check outcomes, reward deliveries, inventory/trade changes and authorized membership decisions. This is a view of existing records, not a new audit database.</p>
    <div className="react-gm-player-filters">
      <label>Search history<input type="search" value={query} onChange={event=>setQuery(event.target.value)}
        placeholder="Player, check, reward, trade, status"/></label>
      <label>Activity type<select value={kind} onChange={event=>setKind(event.target.value)}>
        {GM_PLAYER_ACTIVITY_KINDS.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
      </select></label>
      <label>Scope<select value={scope} onChange={event=>setScope(event.target.value)}>
        <option value="all">Entire campaign</option>
        <option value="focused" disabled={!selected?.id}>{selected?.id?'Selected: '+(selected.characterName||selected.id):'Select a character first'}</option>
      </select></label>
    </div>
    {!membershipAvailable?<p className="react-gm-player-hint">Membership decisions are omitted until their separate, owner-approved server activity feed is enabled.</p>:null}
    <ol className="react-gm-player-events">
      {rows.map(row=><li key={row.id} data-activity-kind={row.category}>
        <strong>{row.title}</strong>
        <small>{formatTime(row.at)} · {row.characterId?
          characters[row.characterId]?.name||row.characterId:row.accountUid||'Campaign'} · {title(row.category)}</small>
        <p>{row.detail} · {row.status}</p>
      </li>)}
    </ol>
    {!rows.length?<p className="react-gm-player-notice" role="status">No matching recorded activity. This does not imply that no gameplay occurred outside the retained feeds.</p>:null}
    {rows.length>=150?<p className="react-gm-player-hint">Showing the newest 150 matching records. Older records remain in their existing source histories where available.</p>:null}
  </Panel>;
}
