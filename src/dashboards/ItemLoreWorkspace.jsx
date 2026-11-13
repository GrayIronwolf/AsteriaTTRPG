import React,{useEffect,useMemo,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {Panel,EmptyState} from '../components/WorkspaceUI.jsx';
import {itemLoreKey} from '../state/itemLoreModel.mjs';

const values=v=>Array.isArray(v)?v:[];
const inventory=character=>[...values(character?.inventory),...Object.values(character?.equipment||{}).filter(Boolean)]
  .filter((item,index,items)=>item?.id&&items.findIndex(v=>v.id===item.id)===index);

export function GMItemLoreWorkspace({campaignId,characters={}}){
  const roster=Object.values(characters).filter(v=>v?.id);
  const [characterId,setCharacterId]=useState('');
  const [itemId,setItemId]=useState('');
  const [records,setRecords]=useState([]);
  const [draft,setDraft]=useState({hiddenProperties:'',curse:'',gmNotes:'',discoveryClues:'',originalOwner:'',ownershipPublic:false});
  const [reveal,setReveal]=useState('');
  const [ownerLabel,setOwnerLabel]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const character=roster.find(v=>v.id===characterId)||roster[0];
  const items=inventory(character);
  const item=items.find(v=>v.id===itemId)||items[0];
  const key=character&&item?itemLoreKey(character.id,item.id):'';
  const record=records.find(v=>v.id===key);
  useEffect(()=>{if(!campaignId)return;return firebaseService.subscribeItemLore(campaignId,setRecords);},[campaignId]);
  useEffect(()=>{setDraft({
    hiddenProperties:record?.hiddenProperties||'',curse:record?.curse||'',gmNotes:record?.gmNotes||'',
    discoveryClues:record?.discoveryClues||'',originalOwner:record?.originalOwner||'',
    ownershipPublic:record?.ownershipPublic===true
  });setReveal('');setOwnerLabel('');},[key,record?.updatedAt]);
  const submit=async(type,extra={})=>{
    if(!character||!item||busy)return;
    setBusy(true);setMessage('');
    try{
      const result=await firebaseService.manageItemLore(campaignId,'gm-scope',{
        type,characterId:character.id,itemId:item.id,...extra
      });
      setMessage(result?.ok?(type==='reveal'?'New lore revealed to this character.':'Item lore saved.'):
        result?.error||'Item lore could not be saved.');
      if(result?.ok){if(type==='reveal')setReveal('');if(type==='owner')setOwnerLabel('');}
    }catch(error){setMessage(error.message||'Item lore could not be saved.');}
    finally{setBusy(false);}
  };
  return <Panel title="Item Lore & Discovery" eyebrow="GM-only secrets and character discoveries">
    <div className="react-form-grid">
      <label>Character<select value={character?.id||''} onChange={event=>{setCharacterId(event.target.value);setItemId('');}}>
        {roster.map(v=><option key={v.id} value={v.id}>{v.name||v.id}</option>)}
      </select></label>
      <label>Inventory item<select value={item?.id||''} onChange={event=>setItemId(event.target.value)}>
        {items.map(v=><option key={v.id} value={v.id}>{v.identified===false?'Unidentified item':v.name} ({v.id})</option>)}
      </select></label>
    </div>
    {!item?<EmptyState title="No available inventory item"/>:<>
      <p>Unrevealed information stays visible only to authorised GMs. Discoveries do not automatically identify the item.</p>
      <div className="react-form-grid">
        {[
          ['hiddenProperties','Hidden properties'],
          ['curse','Optional curse'],
          ['discoveryClues','GM discovery clues'],
          ['originalOwner','Original owner'],
          ['gmNotes','Secret GM notes']
        ].map(([field,label])=><label key={field}>{label}
          <textarea rows={field==='gmNotes'?3:2} value={draft[field]}
            onChange={event=>setDraft(v=>({...v,[field]:event.target.value}))}/>
        </label>)}
      </div>
      <label><input type="checkbox" checked={draft.ownershipPublic} onChange={event=>setDraft(v=>({...v,ownershipPublic:event.target.checked}))}/>
        Reveal ownership history to this character
      </label>
      <button type="button" disabled={busy} onClick={()=>submit('save',{lore:draft})}>Save Secret Lore</button>
      <h4>Reveal a discovery</h4>
      <p>Type only what the character has actually learned. Private notes and curses are not copied automatically.</p>
      <label>New discovery<input value={reveal} maxLength={1000} onChange={event=>setReveal(event.target.value)} placeholder="The blade bears an ancient maker's mark"/></label>
      <button type="button" disabled={busy||!reveal.trim()} onClick={()=>submit('reveal',{description:reveal})}>Reveal to Character</button>
      <h4>Ownership history</h4>
      <label>Owner or historical holder<input value={ownerLabel} maxLength={160} onChange={event=>setOwnerLabel(event.target.value)}/></label>
      <button type="button" disabled={busy||!ownerLabel.trim()} onClick={()=>submit('owner',{ownerLabel})}>Record Holder</button>
      {values(record?.ownershipHistory).map((row,index)=><p key={index}>{row.owner} · {row.at}</p>)}
      <h4>Recorded discoveries</h4>
      {values(record?.discoveryHistory).map((row,index)=><p key={index}>{row.description} · {row.at}</p>)}
    </>}
    {message?<p className="react-action-message" role="status">{message}</p>:null}
  </Panel>;
}

export function PlayerItemLoreWorkspace({campaignId,character}){
  const [records,setRecords]=useState([]);
  useEffect(()=>{
    if(!campaignId||!character)return;
    return firebaseService.subscribeItemDiscoveries(campaignId,setRecords,false);
  },[campaignId,character?.id]);
  const entries=useMemo(()=>{
    const ids=new Set(inventory(character).map(v=>v.id));
    return records.filter(v=>v.characterId===character?.id&&ids.has(v.itemId));
  },[records,character]);
  return <Panel title="Item Discoveries" eyebrow="Known lore and item provenance">
    {!entries.length?<EmptyState title="No item discoveries">As your GM reveals clues, they will be recorded here.</EmptyState>:null}
    {entries.map(v=><section key={v.id} className="react-merchant-deals">
      <h4>{inventory(character).find(item=>item.id===v.itemId)?.name||'Unidentified item'}</h4>
      {values(v.discoveryHistory).map((row,index)=><p key={index}>{row.description} <small>{row.at}</small></p>)}
      {values(v.ownershipHistory).length?<><h4>Known ownership</h4>
        {v.ownershipHistory.map((row,index)=><p key={index}>{row.owner} <small>{row.at}</small></p>)}</>:null}
    </section>)}
  </Panel>;
}
