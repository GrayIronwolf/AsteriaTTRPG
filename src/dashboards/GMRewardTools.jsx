import React,{useEffect,useMemo,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {ManualNumberInput} from '../components/ManualNumberInput.jsx';
import {Panel,StatusPill} from '../components/WorkspaceUI.jsx';
import {
  filterGMRewardEvents,GM_REWARD_CURRENCIES,MAX_GM_REWARD_BUNDLES,
  prepareGMRewardBundle,rewardEventLabel,rewardEventStatus,validateGMRewardPayload
} from '../state/gmRewardModel.mjs';

const empty=()=>({bundleName:'',currency:{key:'gold',amount:0},items:[],message:''});
function dateLabel(value){
  const n=typeof value?.toMillis==='function'?value.toMillis():value?.seconds?value.seconds*1000:Date.parse(value||'');
  return Number.isFinite(n)?new Date(n).toLocaleString():'Not recorded';
}
export function GMRewardTools({campaignId,characters={},events=[],workspace={},saveSection,customItems=[]}){
  const [recipient,setRecipient]=useState('');
  const [draft,setDraft]=useState(empty);
  const [amount,setAmount]=useState('');
  const [quantity,setQuantity]=useState('1');
  const [itemQuery,setItemQuery]=useState('');
  const [selectedItem,setSelectedItem]=useState(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [bundleId,setBundleId]=useState('');
  const [filter,setFilter]=useState({search:'',status:'',characterId:'',type:''});
  const [canonicalBundles,setCanonicalBundles]=useState([]);
  const [bundlesLoaded,setBundlesLoaded]=useState(false);
  useEffect(()=>{
    setBundlesLoaded(false);setCanonicalBundles([]);
    if(!campaignId)return;
    return firebaseService.subscribeGMRewardBundles(campaignId,records=>{
      setCanonicalBundles(records);setBundlesLoaded(true);
    });
  },[campaignId]);
  const bundles=bundlesLoaded?canonicalBundles:
    (Array.isArray(workspace?.gameplay?.rewardBundles)?workspace.gameplay.rewardBundles:[]);
  const catalog=useMemo(()=>window.AsteriaInventory?.catalogEntries?.(customItems)||[],[customItems]);
  const matchingItems=useMemo(()=>itemQuery?catalog.filter(item=>String(item.name||item.title||'').toLowerCase().includes(itemQuery.toLowerCase())).slice(0,8):[],[catalog,itemQuery]);
  const history=useMemo(()=>filterGMRewardEvents(events,filter,characters),[events,filter,characters]);
  useEffect(()=>{
    if(!characters[recipient])setRecipient(Object.keys(characters)[0]||'');
  },[characters,recipient]);
  const editCurrency=key=>setDraft(old=>({...old,currency:{...old.currency,...key}}));
  const addItem=()=>{
    const qty=Number(quantity);
    if(!selectedItem||!Number.isSafeInteger(qty)||qty<1||qty>1000000)
      return setMessage('Choose a compendium item and a whole quantity.');
    const snapshot=window.AsteriaInventory?.itemSnapshot?.(selectedItem,qty)||{...selectedItem,qty};
    setDraft(current=>({...current,items:[...current.items,snapshot]}));
    setSelectedItem(null);setItemQuery('');setQuantity('1');setMessage('');
  };
  const setBundle=draftBundle=>{
    setBundleId(draftBundle.id);
    setDraft({bundleName:draftBundle.name||'',currency:draftBundle.currency||{key:'gold',amount:0},
      items:draftBundle.items||[],message:draftBundle.message||''});
    setAmount(String(draftBundle.currency?.amount||''));
  };
  const scopeId=Object.keys(characters)[0]||'';
  const saveBundleAction=async(action)=>{
    if(!scopeId)throw Error('A linked campaign character is needed to manage reward templates.');
    const result=await firebaseService.manageGMRewardBundle(campaignId,scopeId,action);
    if(!result?.ok)throw Error(result?.error||'Could not update the reward template.');
    return result;
  };
  const saveBundle=async()=>{
    try{
      if(!bundleId&&bundles.length>=MAX_GM_REWARD_BUNDLES)throw Error('A campaign can have up to 20 saved reward bundles.');
      const id=bundleId||'gm-bundle-'+crypto.randomUUID();
      const current=bundles.find(value=>value.id===id);
      const next=prepareGMRewardBundle({...draft,name:draft.bundleName,currency:{...draft.currency,amount:Number(amount||0)},id},current||{});
      setBusy(true);
      await saveBundleAction({type:'save',id,bundle:next});
      setBundleId(id);
      setMessage('Reusable GM reward bundle saved.');
    }catch(error){setMessage(error?.message||String(error));}finally{setBusy(false);}
  };
  const removeBundle=async()=>{
    if(!bundleId)return;
    setBusy(true);
    try{
      await saveBundleAction({type:'delete',id:bundleId});
      setBundleId('');setDraft(empty());setAmount('');
      setMessage('Saved bundle removed. Previously awarded items were not affected.');
    }catch(error){setMessage(error?.message||String(error));}finally{setBusy(false);}
  };
  const send=async()=>{
    if(!characters[recipient])return setMessage('Choose a linked campaign character.');
    setBusy(true);
    try{
      const payload=validateGMRewardPayload({...draft,currency:{...draft.currency,amount:Number(amount||0)}});
      const result=await firebaseService.grantGMRewardBundle(campaignId,recipient,payload);
      if(!result?.ok)throw Error(result?.error||'The award could not be sent.');
      setMessage('Reward sent. Currency was credited; '+result.itemCount+' item type(s) await player claim.');
    }catch(error){setMessage(error?.message||String(error));}finally{setBusy(false);}
  };
  return <Panel title="GM Reward Tools" eyebrow="Quick awards, reusable bundles & reward history" className="react-gm-reward-tools">
    <p className="react-help">Currency is credited immediately. Items are offered to the player to store, equip or decline; the award stays pending until claimed.</p>
    <div className="react-form-grid">
      <label>Recipient<select value={recipient} onChange={event=>setRecipient(event.target.value)}>{Object.values(characters).map(row=><option key={row.id} value={row.id}>{row.name||row.id}</option>)}</select></label>
      <label>Saved bundle<select value={bundleId} onChange={event=>{const match=bundles.find(row=>row.id===event.target.value);if(match)setBundle(match);else{setBundleId('');setDraft(empty());setAmount('');}}}><option value="">New quick award</option>{bundles.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label>Bundle title<input value={draft.bundleName} maxLength={100} onChange={event=>setDraft(old=>({...old,bundleName:event.target.value}))} placeholder="e.g. Bandit cache"/></label>
      <label>Currency<select value={draft.currency.key} onChange={event=>editCurrency({key:event.target.value})}>{GM_REWARD_CURRENCIES.map(row=><option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
      <label>Amount<ManualNumberInput min="0" max="1000000000" value={amount} onChange={event=>setAmount(event.target.value)}/></label>
      <label>Reward note<input value={draft.message} maxLength={500} onChange={event=>setDraft(old=>({...old,message:event.target.value}))} placeholder="Optional in-world message"/></label>
      <label>Search item compendium<input type="search" value={itemQuery} onChange={event=>{setItemQuery(event.target.value);setSelectedItem(null);}} placeholder="Choose an item"/></label>
      <label>Quantity<ManualNumberInput min="1" max="1000000" value={quantity} onChange={event=>setQuantity(event.target.value)}/></label>
    </div>
    {itemQuery?<div className="react-search-results">{matchingItems.map(row=><button key={row.id||row.slug||row.name} type="button" className={selectedItem===row?'active':''} onClick={()=>setSelectedItem(row)}>{row.trueName||row.name||row.title}</button>)}</div>:null}
    <div className="react-action-row"><button type="button" disabled={busy||!selectedItem||draft.items.length>=8} onClick={addItem}>Add Selected Item</button><button type="button" disabled={busy} onClick={()=>{setBundleId('');setDraft(empty());setAmount('');setMessage('');}}>New Award</button></div>
    <div className="react-stock-list">{draft.items.map((item,index)=><article key={index}><div><b>{item.trueName||item.name||item.title||'Item'}</b><small>Quantity {item.qty||1}</small></div><button type="button" disabled={busy} onClick={()=>setDraft(old=>({...old,items:old.items.filter((_,i)=>index!==i)}))}>Remove</button></article>)}</div>
    <div className="react-action-row">
      <button className="primary" disabled={busy||!recipient} onClick={send}>Send Reward</button>
      <button disabled={busy||!draft.bundleName.trim()} onClick={saveBundle}>{bundleId?'Update Bundle':'Save Bundle'}</button>
      {bundleId?<button className="danger" disabled={busy} onClick={removeBundle}>Delete Bundle</button>:null}
    </div>
    <p role="status" className="react-action-message">{message}</p>
    <section className="react-gm-reward-history">
      <h3>Reward History</h3>
      <p className="react-help">Recent campaign awards and claim statuses. Search uses the currently loaded event history.</p>
      <div className="react-form-grid">
        <label>Search<input type="search" value={filter.search} onChange={event=>setFilter(old=>({...old,search:event.target.value}))} placeholder="Item, bundle or player"/></label>
        <label>Character<select value={filter.characterId} onChange={event=>setFilter(old=>({...old,characterId:event.target.value}))}><option value="">All characters</option>{Object.values(characters).map(row=><option key={row.id} value={row.id}>{row.name||row.id}</option>)}</select></label>
        <label>Status<select value={filter.status} onChange={event=>setFilter(old=>({...old,status:event.target.value}))}>{['','Pending','Claimed','Equipped','Declined','Credited','Delivered','Seen','Failed'].map(status=><option key={status} value={status}>{status||'All statuses'}</option>)}</select></label>
        <label>Type<select value={filter.type} onChange={event=>setFilter(old=>({...old,type:event.target.value}))}><option value="">All rewards</option><option value="loot-reward">Items</option><option value="currency-reward">Currency</option><option value="xp-reward">XP</option><option value="magic-element-reward">Magic</option><option value="quest-updated">Quest reward</option></select></label>
      </div>
      <div className="react-delivery-list">{history.slice(0,60).map(event=><div key={event.id}>
        <b>{rewardEventLabel(event)}</b>
        <span>{characters[event.targetCharacterId]?.name||event.targetCharacterId}</span>
        <small>{dateLabel(event.createdAt)}</small>
        <StatusPill tone={rewardEventStatus(event)==='Pending'?'pending':'success'}>{rewardEventStatus(event)}</StatusPill>
      </div>)}{!history.length?<p className="react-help">No matching awards in recent campaign history.</p>:null}</div>
    </section>
  </Panel>;
}
