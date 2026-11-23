import React,{useEffect,useState} from 'react';
import {MAX_APPEARANCE_COLLECTIONS} from './diceAppearanceCatalogue.mjs';
import {normalizeDiceAppearanceLibrary} from './diceAppearanceCollections.mjs';
/** Private saved styles for the existing Phase 3.6 editor. */
export function DiceAppearanceCollections({library,ready,characters=[],characterId='',
 onCharacterChange,current,onLoad,onAction,busy=false}){
 const [selectedId,setSelectedId]=useState(''),[name,setName]=useState(''),[message,setMessage]=useState('');
 const data=normalizeDiceAppearanceLibrary(library||{});
 const selected=data.collections.find(x=>x.id===selectedId)||null;
 const full=data.collections.length>=MAX_APPEARANCE_COLLECTIONS,disabled=!ready||busy;
 useEffect(()=>{
  if(selectedId&&!data.collections.some(x=>x.id===selectedId)){setSelectedId('');setName('');}
 },[data.collections,selectedId]);
 const select=id=>{const row=data.collections.find(x=>x.id===id);setSelectedId(id);setName(row?.name||'');setMessage('');};
 const run=async(request,message)=>{
  setMessage('');
  if(await onAction(request,message)){setMessage(message);return true;}
  return false;
 };
 const save=async(asNew=false)=>{
  const label=name.trim().replace(/\s+/g,' ');
  if(!label||label.length>60){setMessage('Name the appearance collection (1-60 characters).');return;}
  const id=asNew||!selected?crypto.randomUUID():selected.id;
  if(await run({action:'appearance-save',collection:{id,name:label,
   dice:current.dice,tray:current.tray}},'Appearance collection saved.')){
   setSelectedId(id);setName(label);
  }
 };
 const duplicate=async()=>{
  if(!selected||full)return;
  const label=(selected.name.slice(0,42)+' copy '+(data.collections.length+1)).slice(0,60);
  const id=crypto.randomUUID();
  if(await run({action:'appearance-duplicate',collectionId:selected.id,newId:id,name:label},
   'Appearance collection duplicated.')){setSelectedId(id);setName(label);}
 };
 const remove=async()=>{
  if(!selected||!window.confirm('Delete '+selected.name+'? Assignments to this collection will be cleared.'))return;
  if(await run({action:'appearance-delete',collectionId:selected.id},'Appearance deleted.')){
   setSelectedId('');setName('');
  }
 };
 return <section className="asteria-dice-collections" aria-label="Saved appearance collections">
  <header className="asteria-dice-collections-heading">
   <div><h3>Saved appearance collections</h3>
    <p>Private dice and tray styles, synced across signed-in devices. Separate from gameplay presets.</p></div>
   <strong>{data.collections.length}/{MAX_APPEARANCE_COLLECTIONS}</strong>
  </header>
  {!ready?<p role="status">Connecting to your private appearance library…</p>:null}
  <div className="asteria-dice-collections-form">
   <label>Saved collection<select aria-label="Saved appearance collection" disabled={disabled}
    value={selectedId} onChange={event=>select(event.target.value)}>
    <option value="">New appearance collection</option>
    {data.collections.map(c=><option key={c.id} value={c.id}>
     {c.name}{data.defaultCollectionId===c.id?' (account default)':''}
    </option>)}
   </select></label>
   <label>Collection name<input maxLength={60} value={name} disabled={disabled}
    onChange={event=>setName(event.target.value)} placeholder="Name this style"/></label>
  </div>
  <div className="asteria-dice-collections-actions">
   <button type="button" disabled={disabled||!selected} onClick={()=>{
    onLoad(selected);setMessage('Saved appearance loaded.');}}>Load</button>
   <button type="button" disabled={disabled||!name.trim()||(!selected&&full)}
    onClick={()=>save(false)}>{selected?'Save changes':'Save collection'}</button>
   <button type="button" disabled={disabled||full||!name.trim()} onClick={()=>save(true)}>Save As</button>
   <button type="button" disabled={disabled||!selected||full} onClick={duplicate}>Duplicate</button>
   <button type="button" disabled={disabled||!selected} onClick={remove}>Delete</button>
   <button type="button" disabled={disabled||(!selected&&data.defaultCollectionId===null)}
    onClick={()=>run({action:'appearance-default',collectionId:selectedId||null},
    selectedId?'Account default saved.':'Account default cleared.')}>
    {selected?'Make Default':'Clear Default'}</button>
  </div>
  <section className="asteria-dice-collections-assign" aria-label="Character appearance assignments">
   <strong>Character assignment</strong>
   <label>My character<select aria-label="My character for dice appearance"
    value={characterId} disabled={disabled} onChange={event=>onCharacterChange(event.target.value)}>
    <option value="">Account default (no character)</option>
    {characters.map(c=><option key={c.id} value={c.id}>{c.name||c.id}</option>)}
   </select></label>
   <div className="asteria-dice-collections-actions">
    <button type="button" disabled={disabled||!selected||!characterId}
     onClick={()=>run({action:'appearance-assign',collectionId:selectedId,characterId},
     'Appearance assigned to character.')}>Assign selected collection</button>
    <button type="button" disabled={disabled||!characterId||!data.assignments[characterId]}
     onClick={()=>run({action:'appearance-unassign',characterId},
     'Character now uses account default.')}>Use account default</button>
   </div>
   {characterId?<small>Current assignment: {data.collections.find(c=>
    c.id===data.assignments[characterId])?.name||'Account default'}</small>:null}
  </section>
  <p className="asteria-advanced-dice-help">Unsaved studio edits remain local.
   Loading a collection replaces the current visual preview, not roll history.</p>
  {message?<p role="status" className="asteria-dice-collections-status">{message}</p>:null}
 </section>;
}
