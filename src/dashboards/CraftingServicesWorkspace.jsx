import React,{useEffect,useMemo,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {inventoryItems} from './characterWorkspaceData.js';
import {craftingMaterialKey} from '../state/craftingRecipeModel.mjs';
import {pendingActionKeys,actionKey} from '../state/inventoryPresentationModel.mjs';
import {
  STATION_TYPES,SERVICE_TYPES,stationAccessible,repairTargetEligible,serviceInventoryPlan
} from '../state/craftingServicesModel.mjs';
import {EmptyState,Panel,StatusPill} from '../components/WorkspaceUI.jsx';

const emptyStation=()=>({name:'',type:'Forge',location:'',description:'',status:'draft',
  allowedCharacterIds:[]});
const emptyService=()=>({name:'',provider:'',type:'repair',status:'draft',
  description:'',stationId:'',targetType:'',feeCopper:0,materials:[],restoreTo:100});
const list=v=>Array.isArray(v)?v:[];
const numeric=(v,min,max)=>String(v).trim()!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max;
function Materials({service,availability}){
  return <div className="react-crafting-recipe-requirements">
    {list(service.materials).map((m,i)=><div key={craftingMaterialKey(m)+i}>
      <span>{m.name} ×{m.quantity}</span>
      {availability?<small>{availability.requirements[i]?.available||0}/{m.quantity} available</small>:null}
    </div>)}
  </div>;
}
export function GMCraftingServices({campaignId,characters={}}){
  const [stations,setStations]=useState([]),[services,setServices]=useState([]);
  const [requests,setRequests]=useState([]);
  const [mode,setMode]=useState('stations');
  const [station,setStation]=useState(emptyStation),[service,setService]=useState(emptyService);
  const [stationEdit,setStationEdit]=useState(''),[serviceEdit,setServiceEdit]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{
    if(!campaignId)return;
    const a=firebaseService.subscribeCraftingStations(campaignId,setStations,true);
    const b=firebaseService.subscribeNPCServices(campaignId,setServices,true);
    const c=firebaseService.subscribeNPCRepairRequests(campaignId,setRequests,true);
    return()=>{a();b();c();};
  },[campaignId]);
  const run=async action=>{
    if(busy)return;
    setBusy(true);
    try{
      const result=await action();
      setMessage(result?.ok?'Crafting services updated.':result?.error||'Update failed.');
      return result?.ok;
    }catch(e){setMessage(e.message||'Update failed.');return false;}
    finally{setBusy(false);}
  };
  const saveStation=async()=>{
    const success=await run(()=>firebaseService.manageCraftingStation(campaignId,'gm-scope',{
      type:'save',...(stationEdit?{stationId:stationEdit}:{}),station}));
    if(success){setStation(emptyStation());setStationEdit('');}
  };
  const saveService=async()=>{
    const success=await run(()=>firebaseService.manageNPCService(campaignId,'gm-scope',{
      type:'save',...(serviceEdit?{serviceId:serviceEdit}:{}),
      service:{...service,feeCopper:Number(service.feeCopper),restoreTo:Number(service.restoreTo),
        materials:service.materials.map(m=>({...m,quantity:Number(m.quantity)}))}}));
    if(success){setService(emptyService());setServiceEdit('');}
  };
  const remove=async(type,id)=>{
    if(!window.confirm('Delete this record? Pending requests referencing it can no longer be approved.'))return;
    await run(()=>type==='station'?
      firebaseService.manageCraftingStation(campaignId,'gm-scope',{type:'delete',stationId:id}):
      firebaseService.manageNPCService(campaignId,'gm-scope',{type:'delete',serviceId:id}));
  };
  const changeMaterial=(i,key,val)=>setService(old=>({...old,
    materials:old.materials.map((row,j)=>i===j?{...row,[key]:val}:row)}));
  return <Panel title="Crafting Stations & NPC Services" eyebrow="Phase 11.3 — GM-managed facilities and repair"
    action={<div className="react-segmented-actions">
      {['stations','services','requests'].map(name=><button key={name}
        className={mode===name?'active':''} onClick={()=>setMode(name)}>
        {name==='requests'?'Repairs ('+requests.filter(r=>r.status==='pending').length+')':name}
      </button>)}
    </div>}>
    {mode==='stations'?<div className="react-crafting-recipe-layout">
      <section className="react-crafting-recipe-editor">
        <h3>{stationEdit?'Edit':'Create'} Station</h3>
        <label>Name<input maxLength={160} value={station.name} onChange={e=>setStation(s=>({...s,name:e.target.value}))}/></label>
        <label>Type<select value={station.type} onChange={e=>setStation(s=>({...s,type:e.target.value}))}>
          {STATION_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
        <label>Location<input maxLength={160} value={station.location} onChange={e=>setStation(s=>({...s,location:e.target.value}))}/></label>
        <label>Description<textarea maxLength={1000} value={station.description} onChange={e=>setStation(s=>({...s,description:e.target.value}))}/></label>
        <label>Availability<select value={station.status} onChange={e=>setStation(s=>({...s,status:e.target.value}))}>
          <option value="draft">GM Draft</option><option value="open">Open to players</option>
          <option value="closed">Closed</option></select></label>
        <fieldset><legend>Optional allowed characters (none = all linked players)</legend>
          {Object.values(characters).map(c=><label key={c.id}><input type="checkbox"
            checked={station.allowedCharacterIds.includes(c.id)}
            onChange={e=>setStation(s=>({...s,allowedCharacterIds:e.target.checked?
              [...s.allowedCharacterIds,c.id]:s.allowedCharacterIds.filter(id=>id!==c.id)}))}/>
            {c.name||c.id}</label>)}
        </fieldset>
        <div className="react-action-row">
          <button className="primary" disabled={busy||!station.name.trim()} onClick={saveStation}>Save Station</button>
          {stationEdit?<button onClick={()=>{setStation(emptyStation());setStationEdit('');}}>Cancel</button>:null}
        </div>
      </section><section className="react-record-list">
        {stations.map(s=><article key={s.id}><h3>{s.name}</h3>
          <StatusPill tone={s.status==='open'?'success':''}>{s.status}</StatusPill>
          <p>{s.type} · {s.location||'Unspecified location'}</p><p>{s.description}</p>
          <div className="react-action-row">
            <button disabled={busy} onClick={()=>{setStation({...emptyStation(),...s});setStationEdit(s.id);}}>Edit</button>
            <button className="danger" disabled={busy} onClick={()=>remove('station',s.id)}>Delete</button>
          </div></article>)}
        {!stations.length?<EmptyState title="No crafting stations"/>:null}
      </section></div>:null}
    {mode==='services'?<div className="react-crafting-recipe-layout">
      <section className="react-crafting-recipe-editor">
        <h3>{serviceEdit?'Edit':'Create'} NPC Service</h3>
        <label>Service<input maxLength={160} value={service.name} onChange={e=>setService(s=>({...s,name:e.target.value}))}/></label>
        <label>NPC Provider<input maxLength={160} value={service.provider} onChange={e=>setService(s=>({...s,provider:e.target.value}))}/></label>
        <label>Service Type<select value={service.type} onChange={e=>setService(s=>({...s,type:e.target.value}))}>
          {SERVICE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
        <label>Description<textarea maxLength={1000} value={service.description} onChange={e=>setService(s=>({...s,description:e.target.value}))}/></label>
        <label>Station<select value={service.stationId} onChange={e=>setService(s=>({...s,stationId:e.target.value}))}>
          <option value="">No station required</option>
          {stations.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
        <label>Item Type (optional)<input maxLength={100} placeholder="Weapon, Armour…" value={service.targetType}
          onChange={e=>setService(s=>({...s,targetType:e.target.value}))}/></label>
        <label>Fee in Copper<input type="number" step={1} min={0} max={100000000}
          value={service.feeCopper} onChange={e=>setService(s=>({...s,feeCopper:e.target.value}))}/></label>
        {service.type==='repair'?<label>Restore Condition / Durability (%)
          <input type="number" step={1} min={1} max={100} value={service.restoreTo}
            onChange={e=>setService(s=>({...s,restoreTo:e.target.value}))}/></label>:null}
        <h4>Required Materials</h4>
        {service.materials.map((m,i)=><div key={i} className="react-crafting-material-editor">
          <label>Name<input maxLength={160} value={m.name} onChange={e=>changeMaterial(i,'name',e.target.value)}/></label>
          <label>Definition Code<input maxLength={128} value={m.itemCode} onChange={e=>changeMaterial(i,'itemCode',e.target.value)}/></label>
          <label>Quantity<input type="number" min={1} max={1000} step={1} value={m.quantity} onChange={e=>changeMaterial(i,'quantity',e.target.value)}/></label>
          <button onClick={()=>setService(s=>({...s,materials:s.materials.filter((_,j)=>j!==i)}))}>Remove</button>
        </div>)}
        <button disabled={service.materials.length>=12} onClick={()=>setService(s=>({...s,materials:[...s.materials,{name:'',itemCode:'',quantity:1}]}))}>Add Material</button>
        <label>Publication<select value={service.status} onChange={e=>setService(s=>({...s,status:e.target.value}))}>
          <option value="draft">GM Draft</option><option value="published">Published to players</option></select></label>
        <p>Repairs settle on GM approval. Other NPC service types are roleplay listings; they do not automatically create items or effects.</p>
        <div className="react-action-row">
          <button className="primary" disabled={busy||!service.name.trim()||!service.provider.trim()||
            !numeric(service.feeCopper,0,100000000)||service.type==='repair'&&!numeric(service.restoreTo,1,100)}
            onClick={saveService}>Save Service</button>
          {serviceEdit?<button onClick={()=>{setService(emptyService());setServiceEdit('');}}>Cancel</button>:null}
        </div>
      </section><section className="react-record-list">
        {services.map(s=><article key={s.id}><h3>{s.name}</h3>
          <StatusPill tone={s.status==='published'?'success':''}>{s.status}</StatusPill>
          <p>{s.provider} · {s.type} · {s.feeCopper} copper</p>
          <p>{s.description}</p><Materials service={s}/>
          <div className="react-action-row">
            <button disabled={busy} onClick={()=>{setService({...emptyService(),...s,materials:list(s.materials).map(x=>({...x}))});setServiceEdit(s.id);}}>Edit</button>
            <button className="danger" disabled={busy} onClick={()=>remove('service',s.id)}>Delete</button>
          </div></article>)}
        {!services.length?<EmptyState title="No NPC services"/>:null}
      </section></div>:null}
    {mode==='requests'?<div className="react-record-list">
      {requests.map(r=><article key={r.id}>
        <h3>{r.serviceName} — {r.itemName}</h3>
        <p>{r.characterName||characters[r.characterId]?.name||'Character'}</p>
        <StatusPill tone={r.status==='approved'?'success':''}>{r.status}</StatusPill>
        <p>Repair target: {r.service?.restoreTo}% · Fee: {r.service?.feeCopper} copper</p>
        <Materials service={r.service}/>
        {r.status==='pending'?<div className="react-action-row">
          <button className="primary" disabled={busy} onClick={()=>run(()=>firebaseService.reviewNPCRepair(campaignId,'gm-scope',r.id,'approve'))}>Approve & Repair</button>
          <button disabled={busy} onClick={()=>run(()=>firebaseService.reviewNPCRepair(campaignId,'gm-scope',r.id,'reject'))}>Reject</button>
        </div>:null}
      </article>)}
      {!requests.length?<EmptyState title="No repair requests"/>:null}
    </div>:null}
    {message?<p role="status" className="react-action-message">{message}</p>:null}
  </Panel>;
}
export function PlayerCraftingServices({campaignId,character={},editable=false}){
  const [stations,setStations]=useState([]),[services,setServices]=useState([]);
  const [requests,setRequests]=useState([]),[chosen,setChosen]=useState({});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const inventory=useMemo(()=>inventoryItems(character),[character]);
  const inventoryRaw=useMemo(()=>inventory.map(row=>row.raw||row),[inventory]);
  const stationsById=useMemo(()=>new Map(stations.map(station=>[station.id,station])),[stations]);
  const pendingRequests=useMemo(()=>pendingActionKeys(requests,'serviceId','itemId'),[requests]);
  useEffect(()=>{
    if(!campaignId)return;
    const a=firebaseService.subscribeCraftingStations(campaignId,setStations,false);
    const b=firebaseService.subscribeNPCServices(campaignId,setServices,false);
    const c=firebaseService.subscribeNPCRepairRequests(campaignId,setRequests,false);
    return()=>{a();b();c();};
  },[campaignId]);
  const request=async(service,item)=>{
    if(busy||!editable)return;
    setBusy(true);
    try{
      const result=await firebaseService.requestNPCRepair(campaignId,character.id,
        {serviceId:service.id,itemId:item.id});
      setMessage(result?.ok?'Repair requested. No materials or currency spent yet.':
        result?.error||'Repair request failed.');
    }catch(e){setMessage(e.message||'Repair request failed.');}
    finally{setBusy(false);}
  };
  return <Panel title="Crafting Stations & NPC Services" eyebrow="Campaign facilities and repairs">
    <p>Stations and NPC services are defined by the GM. Repair costs apply only after GM approval.</p>
    <div className="react-record-list">{stations.filter(s=>stationAccessible(s,character.id)).map(s=>
      <article key={s.id}><h3>{s.name}</h3><p>{s.type} · {s.location||'Location not specified'}</p>
        {s.description?<p>{s.description}</p>:null}</article>)}</div>
    <div className="react-crafting-recipe-list">{services.map(service=>{
      const station=service.stationId?stationsById.get(service.stationId):null;
      const open=!service.stationId||stationAccessible(station,character.id);
      const targets=service.type==='repair'?
        inventory.filter(i=>repairTargetEligible(i.raw||i,service)):[];
      const target=targets.find(i=>i.id===chosen[service.id])||targets[0];
      const index=target?inventory.findIndex(i=>i.id===target.id):-1;
      const materials=service.type==='repair'&&target
        ?serviceInventoryPlan(service,inventoryRaw,index):null;
      const pending=pendingRequests.has(actionKey(service.id,target?.id));
      return <article key={service.id}>
        <div className="react-record-heading"><h3>{service.name}</h3>
          <StatusPill tone={open?'success':'warning'}>{open?'Available':'Station unavailable'}</StatusPill></div>
        <p>{service.provider} · {service.type}</p>
        {service.description?<p>{service.description}</p>:null}
        <p><b>Fee:</b> {service.feeCopper} copper
          {service.type==='repair'?' · Repairs to '+service.restoreTo+'%':''}</p>
        {service.stationId?<p><b>Station:</b> {station?.name||'Unavailable'}</p>:null}
        <Materials service={service} availability={materials}/>
        {service.type==='repair'?<>
          <label>Damaged Item<select value={target?.id||''}
            onChange={e=>setChosen(s=>({...s,[service.id]:e.target.value}))}>
            {targets.length?targets.map(i=><option key={i.id} value={i.id}>{i.name}</option>):
              <option value="">No eligible damaged items</option>}</select></label>
          {!target?<small>No damaged, eligible individual items are available.</small>:null}
          <button className="primary" disabled={!editable||busy||!open||!target||!materials?.ready||pending}
            onClick={()=>request(service,target)}>
            {pending?'Awaiting GM Approval':'Request Repair'}</button>
        </>:<p>Discuss this service with your GM. No automatic item or currency changes.</p>}
      </article>;
    })}
    {!services.length?<EmptyState title="No published NPC services"/>:null}</div>
    {requests.length?<details className="react-crafting-request-history">
      <summary>My Repair Requests ({requests.length})</summary>
      {requests.slice().reverse().slice(0,20).map(r=><p key={r.id}>
        {r.serviceName} on {r.itemName}: <b>{r.status}</b></p>)}
    </details>:null}
    {message?<p role="status" className="react-action-message">{message}</p>:null}
  </Panel>;
}
