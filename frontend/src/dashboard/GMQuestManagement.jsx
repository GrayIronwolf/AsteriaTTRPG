import React,{useMemo,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {QUEST_CURRENCIES,questRewardSummary} from '../../../src/state/questRewardModel.mjs';
import {QUEST_TYPES,questProgress} from '../../../src/state/questWorkflowModel.mjs';
import {blankGMQuest,editGMQuest,addGMQuestObjective,GM_QUEST_STATUSES,
  GM_QUEST_VISIBILITIES,gmQuestReviews} from './gmQuestManagementModel.mjs';
import styles from './GMQuestManagement.module.css';

export function GMQuestManagement({api,campaignId,workspace={},party=[],session={}}){
  const quests=Array.isArray(workspace.quests)?workspace.quests:[];
  const [draft,setDraft]=useState(blankGMQuest);
  const [recipients,setRecipients]=useState([]);
  const [query,setQuery]=useState('');
  const [archived,setArchived]=useState(false);
  const [objectiveText,setObjectiveText]=useState('');
  const [objectiveTarget,setObjectiveTarget]=useState('');
  const [objectiveOptional,setObjectiveOptional]=useState(false);
  const [itemName,setItemName]=useState('');
  const [itemQty,setItemQty]=useState('1');
  const [reviewNotes,setReviewNotes]=useState({});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const update=(key,value)=>setDraft(prev=>({...prev,[key]:value}));
  const reward=(key,value)=>setDraft(prev=>({...prev,
    reward:{...prev.reward,[key]:value}}));
  const reset=()=>{setDraft(blankGMQuest());setObjectiveText('');setObjectiveTarget('');
    setObjectiveOptional(false);setItemName('');setItemQty('1');};
  const run=async(operation,success,clear=false)=>{
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      await operation();
      setMessage(success);
      if(clear)reset();
    }catch(err){setError(err?.message||'The GM action could not be saved.');}
    finally{setBusy(false);}
  };
  const addObjective=()=>{
    try{
      setDraft(prev=>addGMQuestObjective(prev,{
        id:'objective-'+crypto.randomUUID(),text:objectiveText,
        target:objectiveTarget||'1',optional:objectiveOptional}));
      setObjectiveText('');setObjectiveTarget('');setObjectiveOptional(false);setError('');
    }catch(err){setError(err.message);}
  };
  const addItem=()=>{
    if(!itemName.trim()){setError('Enter a reward item name.');return;}
    if(!/^\d{1,7}$/.test(itemQty)||Number(itemQty)<1||Number(itemQty)>1000000){
      setError('Enter a whole item quantity from 1 to 1,000,000.');return;}
    if((draft.reward.items||[]).length>=20){setError('A quest can contain at most 20 reward items.');return;}
    reward('items',[...(draft.reward.items||[]),{name:itemName.trim().slice(0,160),qty:Number(itemQty)}]);
    setItemName('');setItemQty('1');setError('');
  };
  const filtered=useMemo(()=>quests.filter(row=>
    (archived||row.status!=='Archived')&&
    [row.title,row.questGiver,row.location,row.questType].join(' ').toLowerCase()
      .includes(query.toLowerCase())),[quests,archived,query]);
  const selectedRecipients=recipients.filter(id=>party.some(member=>member.id===id));
  const canReview=session.status==='active'&&session.editable===true;
  return <section className={styles.shell} data-testid="site-gm-quest-management">
    <SurfacePanel as="section" className={styles.panel}>
      <header className={styles.head}><div><h2>Quest Builder</h2>
        <BodyText muted>Create, revise, archive and assign quests using the original campaign ledger.</BodyText></div>
        <strong>{quests.length} saved</strong></header>
      {error?<p role="alert" className={styles.notice}>{error}</p>:null}
      {message?<p role="status" className={styles.notice}>{message}</p>:null}
      <div className={styles.fields}>
        <label>Quest Title<input maxLength={160} value={draft.title}
          onChange={e=>update('title',e.target.value)}/></label>
        <label>Status<select value={draft.status} onChange={e=>update('status',e.target.value)}>
          {GM_QUEST_STATUSES.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Visibility<select value={draft.visibility}
          onChange={e=>update('visibility',e.target.value)}>
          {GM_QUEST_VISIBILITIES.map(value=><option key={value}>{value}</option>)}</select></label>
      </div>
      <label>Objective<textarea rows={4} maxLength={12000} value={draft.objective}
        onChange={e=>update('objective',e.target.value)}/></label>
      <div className={styles.fields}>
        {([['questGiver','Quest Giver'],['location','Location'],
          ['deadline','In-world Deadline']]).map(([key,label])=>
          <label key={key}>{label}<input maxLength={key==='deadline'?500:160}
            value={draft[key]||''} onChange={e=>update(key,e.target.value)}/></label>)}
        <label>Quest Type<input list="site-gm-quest-types" maxLength={80}
          value={draft.questType||''} onChange={e=>update('questType',e.target.value)}/></label>
        <datalist id="site-gm-quest-types">{QUEST_TYPES.map(type=>
          <option key={type} value={type}/>)}</datalist>
      </div>
      <label className={styles.check}><input type="checkbox" checked={draft.offerRequired===true}
        onChange={e=>update('offerRequired',e.target.checked)}/>
        Offer to players for acceptance</label>
      <label>Success Outcome<textarea rows={2} maxLength={2000} value={draft.successOutcome||''}
        onChange={e=>update('successOutcome',e.target.value)}/></label>
      <label>Failure Consequences<textarea rows={2} maxLength={2000}
        value={draft.failureConsequences||''}
        onChange={e=>update('failureConsequences',e.target.value)}/></label>
      <label>Private GM Notes<textarea rows={2} maxLength={5000}
        value={draft.gmNotes||''} onChange={e=>update('gmNotes',e.target.value)}/></label>
      <fieldset className={styles.fieldset}><legend>Objective Checklist</legend>
        <div className={styles.fields}>
          <label>New Objective<input maxLength={500} value={objectiveText}
            onChange={e=>setObjectiveText(e.target.value)}/></label>
          <label>Target Count<input inputMode="numeric" value={objectiveTarget}
            placeholder="1" onChange={e=>setObjectiveTarget(e.target.value)}/></label>
        </div>
        <label className={styles.check}><input type="checkbox" checked={objectiveOptional}
          onChange={e=>setObjectiveOptional(e.target.checked)}/>Optional objective</label>
        <button type="button" disabled={busy||!objectiveText.trim()}
          onClick={addObjective}>Add Objective</button>
        <ol>{(draft.objectives||[]).map(row=><li key={row.id}>
          {row.text} · {row.target}{row.optional?' · Optional':''}
          <button type="button" disabled={busy} onClick={()=>update('objectives',
            draft.objectives.filter(item=>item.id!==row.id))}>Remove</button></li>)}</ol>
      </fieldset>
      <label className={styles.check}><input type="checkbox"
        checked={draft.requiresGMApproval===true}
        onChange={e=>update('requiresGMApproval',e.target.checked)}/>
        Require GM approval before completion and rewards</label>
      <fieldset className={styles.fieldset}><legend>Quest Rewards</legend>
        <div className={styles.fields}>
          <label>XP<input inputMode="numeric" value={draft.reward.xp}
            placeholder="0" onChange={e=>reward('xp',e.target.value)}/></label>
          <label>Currency<select value={draft.reward.currency.key}
            onChange={e=>reward('currency',{...draft.reward.currency,key:e.target.value})}>
            {QUEST_CURRENCIES.map(row=><option key={row.key} value={row.key}>
              {row.label}</option>)}</select></label>
          <label>Currency Amount<input inputMode="numeric" value={draft.reward.currency.amount}
            placeholder="0" onChange={e=>reward('currency',{
              ...draft.reward.currency,amount:e.target.value})}/></label>
        </div>
        <div className={styles.fields}>
          <label>Reward Item Name<input maxLength={160} value={itemName}
            onChange={e=>setItemName(e.target.value)}/></label>
          <label>Quantity<input inputMode="numeric" value={itemQty}
            onChange={e=>setItemQty(e.target.value)}/></label>
        </div>
        <button type="button" disabled={busy||!itemName.trim()} onClick={addItem}>
          Add Item Reward</button>
        <ul>{(draft.reward.items||[]).map((item,index)=><li key={index}>
          {item.name||item.title||'Item'} · {item.qty||1}
          <button type="button" disabled={busy} onClick={()=>reward('items',
            draft.reward.items.filter((_,i)=>i!==index))}>Remove</button></li>)}</ul>
        <label>Other Reward Notes<textarea rows={2} maxLength={2000}
          value={draft.reward.notes||''}
          onChange={e=>reward('notes',e.target.value)}/></label>
      </fieldset>
      <div className={styles.actions}>
        <button type="button" disabled={busy||!draft.title.trim()}
          onClick={()=>run(()=>api.saveQuest(campaignId,draft),
            draft.id?'Quest updated.':'Quest created.',true)}>
          {draft.id?'Update Quest':'Create Quest'}</button>
        {draft.id?<button type="button" disabled={busy}
          onClick={reset}>Cancel Edit</button>:null}
      </div>
    </SurfacePanel>
    <SurfacePanel as="section" className={styles.panel}>
      <header className={styles.head}><div><h2>Quest Ledger</h2>
        <BodyText muted>Player progress is preserved when an existing quest is resent.</BodyText></div>
      </header>
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={()=>setRecipients(party.map(p=>p.id))}>
          Select All Players</button>
        <button type="button" disabled={busy} onClick={()=>setRecipients([])}>Clear</button>
        <span>{selectedRecipients.length} recipients selected</span>
      </div>
      <div className={styles.recipients}>{party.map(member=><label key={member.id}
        className={styles.check}><input type="checkbox" checked={selectedRecipients.includes(member.id)}
        onChange={e=>setRecipients(prev=>e.target.checked?
          [...new Set([...prev,member.id])]:prev.filter(id=>id!==member.id))}/>
        {member.name}</label>)}</div>
      <div className={styles.fields}>
        <label>Search Quests<input type="search" value={query}
          onChange={e=>setQuery(e.target.value)}/></label>
        <label className={styles.check}><input type="checkbox" checked={archived}
          onChange={e=>setArchived(e.target.checked)}/>Show archived quests</label>
      </div>
      <div className={styles.ledger}>{filtered.map(quest=>{
        const assignments=gmQuestReviews(party,quest.id);
        return <article key={quest.id} className={styles.record}>
          <header className={styles.head}><h3>{quest.title}</h3>
            <small>{quest.status} · {quest.visibility}</small></header>
          <p>{quest.objective||'No objective recorded.'}</p>
          <p className={styles.metadata}>{[quest.questType,quest.questGiver,quest.location,
            quest.deadline].filter(Boolean).join(' · ')}</p>
          {(quest.objectives||[]).length?<ol>{quest.objectives.map(obj=><li key={obj.id}>
            {obj.text} ({obj.target}){obj.optional?' · Optional':''}</li>)}</ol>:null}
          {questRewardSummary(quest.reward)?<p>Reward: {questRewardSummary(quest.reward)}</p>:null}
          <div className={styles.actions}>
            <button type="button" disabled={busy||!selectedRecipients.length||
              quest.visibility==='GM Only'||['Archived','Completed','Failed'].includes(quest.status)}
              onClick={()=>run(()=>api.assignQuest(campaignId,quest.id,selectedRecipients,
                quest.updatedAt||''),'Quest sent to selected players.')}>
              Send to Selected Players</button>
            <button type="button" disabled={busy} onClick={()=>{setDraft(editGMQuest(quest));
              setError('');setMessage('Editing '+quest.title);}}>Edit</button>
            <button type="button" disabled={busy} onClick={()=>{
              setDraft({...editGMQuest(quest),id:'',title:quest.title+' (copy)',
                status:'Draft',updatedAt:''});setError('');}}>Duplicate</button>
            <button type="button" disabled={busy||quest.status==='Archived'}
              onClick={()=>{if(window.confirm('Archive '+quest.title+'? Player progress will remain.'))
                run(()=>api.archiveQuest(campaignId,quest.id,quest.updatedAt||''),
                  'Quest archived.');}}>Archive</button>
          </div>
          <h4>Player Assignments</h4>
          {!assignments.length?<BodyText muted>Not assigned to any linked characters.</BodyText>:null}
          {assignments.map(row=><div key={row.characterId} className={styles.assignment}>
            <strong>{row.characterName}</strong>
            <span>{row.status} · {questProgress(row).completed}/{questProgress(row).total} required objectives</span>
            {row.rewardClaimedAt?<span>Reward claimed</span>:null}
            {row.resolutionNote?<small>GM feedback: {row.resolutionNote}</small>:null}
            {row.status==='Awaiting Review'?<div className={styles.review}>
              <label>Review Notes<textarea rows={2} maxLength={1000}
                value={reviewNotes[row.characterId+'-'+quest.id]||''}
                onChange={e=>setReviewNotes(prev=>({...prev,
                  [row.characterId+'-'+quest.id]:e.target.value}))}/></label>
              <div className={styles.actions}>{[
                ['Completed','Approve & Award'],['Active','Return to Active'],
                ['Failed','Mark Failed']
              ].map(([status,label])=><button key={status} type="button"
                disabled={busy||!canReview}
                onClick={()=>run(()=>api.reviewQuest(campaignId,row.characterId,quest.id,
                  status,reviewNotes[row.characterId+'-'+quest.id]||''),label+' saved.')}>
                {label}</button>)}</div>
              {!canReview?<small>Start an active session to review player quests.</small>:null}
            </div>:null}
          </div>)}
        </article>;
      })}</div>
      {!quests.length?<BodyText muted>Create the first campaign quest above.</BodyText>:null}
      {quests.length&&!filtered.length?<BodyText muted>No quests match the current filters.</BodyText>:null}
    </SurfacePanel>
  </section>;
}
