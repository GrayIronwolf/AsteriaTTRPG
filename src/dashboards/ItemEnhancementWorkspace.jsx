import React,{useEffect,useMemo,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {inventoryItems} from './characterWorkspaceData.js';
import {
  ENCHANTMENT_RANKS,enhancementTargetEligible,enhancementInventoryPlan,
  enchantmentPreview,enchantmentRequirements
} from '../state/itemEnhancementModel.mjs';
import {resourcePair} from '../state/resourceValues.mjs';
import {EmptyState,Panel,StatusPill} from '../components/WorkspaceUI.jsx';

const list=x=>Array.isArray(x)?x:[];
const empty=()=>({
  mode:'enchantment',status:'draft',name:'',description:'',targetType:'',
  effectName:'',effectDescription:'',spellRank:'Weak',spellName:'',spellMana:1,
  manaCost:0,allowStoneSubstitution:false,
  materials:[]
});
const normalNumber=(value,min,max)=>String(value).trim()!==''&&
  Number.isSafeInteger(Number(value))&&Number(value)>=min&&Number(value)<=max;
const change=(setter,key,value)=>setter(prev=>({...prev,[key]:value}));
function Materials({materials=[],planInfo}){
  return <div className="react-crafting-recipe-requirements">
    {materials.map((mat,i)=><div key={i}>
      <span>{mat.name} ×{mat.quantity}</span>
      {planInfo?.requirements?.[i]?<small>{planInfo.requirements[i].available}/
        {planInfo.requirements[i].needed} available
        {planInfo.requirements[i].missing?' · Missing '+planInfo.requirements[i].missing:''}</small>:null}
    </div>)}
  </div>;
}
function Preview({plan,affinity='None',stoneMode='standard'}){
  let data;
  try{data=enchantmentPreview(plan,affinity,stoneMode);}
  catch(error){return <p className="react-storage-warning">{error.message}</p>;}
  return <p>Mana: <b>{data.manaCost} MP</b>
    {data.minutes!==null?' · Time: '+data.minutes+' minutes':''}
    {data.baseDC!==undefined?' · Base DC: '+data.baseDC:''}
    {data.dc!==null&&data.dc!==undefined?' · Adjusted DC: '+data.dc:''}
    {data.notes?' · '+data.notes:''}
  </p>;
}
export function GMEnhancementWorkshop({campaignId,characters={}}){
  const [plans,setPlans]=useState([]);
  const [requests,setRequests]=useState([]);
  const [form,setForm]=useState(empty);
  const [editing,setEditing]=useState('');
  const [mode,setMode]=useState('plans');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    if(!campaignId)return;
    const a=firebaseService.subscribeEnhancementPlans(campaignId,setPlans,true);
    const b=firebaseService.subscribeEnhancementRequests(campaignId,setRequests,true);
    return()=>{a();b();};
  },[campaignId]);
  const setMaterial=(i,key,value)=>setForm(prev=>({
    ...prev,materials:prev.materials.map((r,index)=>index===i?{...r,[key]:value}:r)
  }));
  const save=async()=>{
    if(busy)return;
    setBusy(true);
    try{
      const payload={
        ...form,
        spellMana:Number(form.spellMana),
        manaCost:form.mode==='enchantment'?0:Number(form.manaCost),
        materials:form.materials.map(m=>({...m,quantity:Number(m.quantity)}))
      };
      const res=await firebaseService.manageEnhancementPlan(campaignId,'gm-scope',{
        type:'save',...(editing?{planId:editing}:{}),plan:payload
      });
      setMessage(res?.ok?'Enhancement plan saved.':res?.error||'Could not save plan.');
      if(res?.ok){setEditing('');setForm(empty());}
    }catch(error){setMessage(error.message||'Could not save plan.');}
    finally{setBusy(false);}
  };
  const remove=async id=>{
    if(busy||!window.confirm('Delete this plan? Pending requests can no longer be approved.'))return;
    setBusy(true);
    try{
      const res=await firebaseService.manageEnhancementPlan(campaignId,'gm-scope',
        {type:'delete',planId:id});
      setMessage(res?.ok?'Plan deleted.':res?.error||'Deletion failed.');
    }catch(error){setMessage(error.message);}
    finally{setBusy(false);}
  };
  const review=async(id,decision)=>{
    if(busy)return;
    setBusy(true);
    try{
      const res=await firebaseService.reviewEnhancement(campaignId,'gm-scope',id,decision);
      setMessage(res?.ok?decision==='approve'?
        'Enhancement applied, materials and MP deducted.':'Request rejected; no costs deducted.':
        res?.error||'Could not review enhancement.');
    }catch(error){setMessage(error.message||'Review failed.');}
    finally{setBusy(false);}
  };
  const selectedRank=ENCHANTMENT_RANKS.find(x=>x.name===form.spellRank)||ENCHANTMENT_RANKS[0];
  const displayPlan={...form,manaCost:form.mode==='enchantment'?Number(form.spellMana)*2:Number(form.manaCost)};
  const fullMaterials=()=>{
    try{return enchantmentRequirements(displayPlan);}catch{return [];}
  };
  return <Panel title="Enchantment & Item Upgrade Workshop"
    eyebrow="Phase 11.2 — GM-approved enchanting"
    action={<div className="react-segmented-actions">
      <button className={mode==='plans'?'active':''} onClick={()=>setMode('plans')}>Plans</button>
      <button className={mode==='requests'?'active':''} onClick={()=>setMode('requests')}>
        Requests ({requests.filter(r=>r.status==='pending').length})</button>
    </div>}>
    {mode==='plans'?<div className="react-crafting-recipe-layout">
      <section className="react-crafting-recipe-editor">
        <h3>{editing?'Edit Enhancement Plan':'Create Enhancement Plan'}</h3>
        <label>Mode<select value={form.mode} onChange={e=>change(setForm,'mode',e.target.value)}>
          <option value="enchantment">Spell Enchantment</option>
          <option value="upgrade">Item Upgrade</option>
        </select></label>
        <label>Plan Name<input maxLength={160} value={form.name}
          onChange={e=>change(setForm,'name',e.target.value)}/></label>
        <label>Description<textarea maxLength={1000} rows={2} value={form.description}
          onChange={e=>change(setForm,'description',e.target.value)}/></label>
        <label>Target Item Type (optional)<input maxLength={100} value={form.targetType}
          placeholder="e.g. Weapon, Armour"
          onChange={e=>change(setForm,'targetType',e.target.value)}/></label>
        <label>Effect or Upgrade Name<input maxLength={160} value={form.effectName}
          onChange={e=>change(setForm,'effectName',e.target.value)}/></label>
        <label>Effect Description<textarea rows={2} maxLength={1000} value={form.effectDescription}
          onChange={e=>change(setForm,'effectDescription',e.target.value)}/></label>
        {form.mode==='enchantment'?<>
          <label>Spell Rank<select value={form.spellRank}
            onChange={e=>change(setForm,'spellRank',e.target.value)}>
            {ENCHANTMENT_RANKS.map(r=><option key={r.name} value={r.name}>{r.name}</option>)}
          </select></label>
          <label>Known Spell Name<input maxLength={160} value={form.spellName}
            onChange={e=>change(setForm,'spellName',e.target.value)}/></label>
          <label>Base Spell MP ({selectedRank.mpMin}–{selectedRank.mpMax})
            <input type="number" step={1} min={selectedRank.mpMin} max={selectedRank.mpMax}
              value={form.spellMana} onChange={e=>change(setForm,'spellMana',e.target.value)}/>
          </label>
          <label><input type="checkbox" checked={form.allowStoneSubstitution}
            disabled={form.spellRank==='Weak'}
            onChange={e=>change(setForm,'allowStoneSubstitution',e.target.checked)}/>
            Allow four lower-tier soul stones (+4 DC)</label>
          <Preview plan={displayPlan} affinity="Extreme"/>
          <p className="react-help">Default soul-stone and crystal costs apply; the item target is retained.
            The GM determines item suitability, enchantment success and actual effect rules.</p>
        </>:<label>Upgrade MP Cost (GM-defined)
          <input type="number" step={1} min={0} max={100000} value={form.manaCost}
            onChange={e=>change(setForm,'manaCost',e.target.value)}/></label>}
        <h4>Extra Materials</h4>
        {form.materials.map((m,i)=><div className="react-crafting-material-editor" key={i}>
          <label>Material<input maxLength={160} value={m.name}
            onChange={e=>setMaterial(i,'name',e.target.value)}/></label>
          <label>Definition Code (optional)<input maxLength={128} value={m.itemCode}
            onChange={e=>setMaterial(i,'itemCode',e.target.value)}/></label>
          <label>Quantity<input type="number" step={1} min={1} max={1000} value={m.quantity}
            onChange={e=>setMaterial(i,'quantity',e.target.value)}/></label>
          <button onClick={()=>change(setForm,'materials',form.materials.filter((_,index)=>index!==i))}>Remove</button>
        </div>)}
        <button disabled={form.materials.length>=12}
          onClick={()=>change(setForm,'materials',
            [...form.materials,{name:'',itemCode:'',quantity:1}])}>Add Material</button>
        <label>Visibility<select value={form.status}
          onChange={e=>change(setForm,'status',e.target.value)}>
          <option value="draft">GM Draft</option><option value="published">Published</option>
        </select></label>
        <Materials materials={fullMaterials()}/>
        <div className="react-action-row">
          <button className="primary" disabled={busy} onClick={save}>
            {editing?'Save Changes':'Create Plan'}</button>
          {editing?<button onClick={()=>{setEditing('');setForm(empty());}}>Cancel</button>:null}
        </div>
      </section>
      <section className="react-record-list">
        {plans.map(p=><article key={p.id}>
          <h3>{p.name}</h3><StatusPill tone={p.status==='published'?'success':''}>{p.status}</StatusPill>
          <p>{p.mode}: {p.effectName}{p.spellRank?' · '+p.spellRank:''}</p>
          <p>{p.description}</p>
          <Preview plan={p} affinity="Extreme"/>
          <Materials materials={enchantmentRequirements(p)}/>
          <div className="react-action-row">
            <button disabled={busy} onClick={()=>{setEditing(p.id);setForm({
              ...empty(),...p,materials:list(p.materials).map(m=>({...m}))
            });}}>Edit</button>
            <button className="danger" disabled={busy} onClick={()=>remove(p.id)}>Delete</button>
          </div>
        </article>)}
        {!plans.length?<EmptyState title="No enchantment or upgrade plans"/>:null}
      </section>
    </div>:<div className="react-record-list">
      {requests.map(r=><article key={r.id}>
        <h3>{r.planName} · {r.itemName}</h3>
        <p>{r.characterName||characters[r.characterId]?.name||'Character'}</p>
        <StatusPill tone={r.status==='approved'?'success':''}>{r.status}</StatusPill>
        <p>Effect: {r.plan?.effectName}</p>
        <Preview plan={r.plan} affinity={r.preview?.affinity||'None'} stoneMode={r.stoneMode}/>
        <Materials materials={enchantmentRequirements(r.plan,r.stoneMode)}/>
        {r.status==='pending'?<div className="react-action-row">
          <button className="primary" disabled={busy} onClick={()=>review(r.id,'approve')}>
            Approve & Apply</button>
          <button disabled={busy} onClick={()=>review(r.id,'reject')}>Reject</button>
        </div>:null}
      </article>)}
      {!requests.length?<EmptyState title="No enhancement requests"/>:null}
    </div>}
    {message?<p role="status" className="react-action-message">{message}</p>:null}
  </Panel>;
}

export function PlayerEnhancementWorkshop({campaignId,character={},editable=false}){
  const [plans,setPlans]=useState([]),[requests,setRequests]=useState([]);
  const [selections,setSelections]=useState({});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const inventory=useMemo(()=>inventoryItems(character),[character]);
  const [currentMana,maxMana]=resourcePair(character.mp);
  useEffect(()=>{
    if(!campaignId)return;
    const a=firebaseService.subscribeEnhancementPlans(campaignId,setPlans,false);
    const b=firebaseService.subscribeEnhancementRequests(campaignId,setRequests,false);
    return()=>{a();b();};
  },[campaignId]);
  const update=(id,patch)=>setSelections(prev=>({...prev,
    [id]:{...prev[id],...patch}}));
  const send=async(plan,target,stoneMode)=>{
    if(busy)return;
    setBusy(true);
    try{
      const res=await firebaseService.requestEnhancement(campaignId,character.id,
        {planId:plan.id,itemId:target.id,stoneMode});
      setMessage(res?.ok?'Enhancement submitted to the GM; no costs consumed yet.':
        res?.error||'Could not request enhancement.');
    }catch(error){setMessage(error.message||'Could not request enhancement.');}
    finally{setBusy(false);}
  };
  return <Panel title="Enchanting & Item Upgrades" eyebrow="Campaign enhancement">
    <p>Select one inventory item and check its ingredients and Mana before requesting GM approval.
      Materials and Mana are only spent when the GM approves.</p>
    <p>Available Mana: <b>{currentMana}/{maxMana} MP</b></p>
    <div className="react-crafting-recipe-list">
      {plans.map(plan=>{
        const selection=selections[plan.id]||{};
        const targets=inventory.filter(item=>enhancementTargetEligible(item.raw||item,plan));
        const target=targets.find(item=>item.id===selection.itemId)||targets[0];
        const index=target?inventory.findIndex(item=>item.id===target.id):-1;
        const stoneMode=selection.stoneMode||'standard';
        let preview=null,requirements=[],materials=null,error='';
        if(target){
          try{
            const source=target.raw||target;
            const affinity=source.enchantmentAffinity||source.materialAffinity||'None';
            preview=enchantmentPreview(plan,affinity,stoneMode);
            requirements=enchantmentRequirements(plan,stoneMode);
            materials=enhancementInventoryPlan(plan,inventory.map(row=>row.raw||row),index,stoneMode);
          }catch(e){error=e.message;}
        }
        const pending=requests.some(r=>r.planId===plan.id&&r.itemId===target?.id&&r.status==='pending');
        const ready=Boolean(target&&materials?.ready&&currentMana>=plan.manaCost&&!error);
        return <article key={plan.id}>
          <h3>{plan.name}</h3>
          <p>{plan.effectName} · {plan.mode}{plan.spellRank?' · '+plan.spellRank:''}</p>
          {plan.description?<p>{plan.description}</p>:null}
          <label>Target Item<select value={target?.id||''}
            onChange={e=>update(plan.id,{itemId:e.target.value})}>
            {targets.length?targets.map(item=><option key={item.id} value={item.id}>
              {item.name}</option>):<option value="">No eligible items</option>}
          </select></label>
          {plan.mode==='enchantment'&&plan.allowStoneSubstitution?
            <label>Soul Stone Option<select value={stoneMode}
              onChange={e=>update(plan.id,{stoneMode:e.target.value})}>
              <option value="standard">Standard Soul Stone</option>
              <option value="lower-stone">Four lower-tier stones (+4 DC)</option>
            </select></label>:null}
          {target?<>
            <Preview plan={plan} affinity={preview?.affinity||'None'} stoneMode={stoneMode}/>
            <Materials materials={requirements} planInfo={materials}/>
            <StatusPill tone={ready?'success':'warning'}>{
              error||(!materials?.ready?'Missing ingredients':currentMana<plan.manaCost?'Insufficient Mana':
                'Ready for GM review')}</StatusPill>
          </>:<p>No eligible individual items in inventory.</p>}
          <button className="primary" disabled={!editable||busy||!ready||pending}
            onClick={()=>send(plan,target,stoneMode)}>
            {pending?'Awaiting GM Review':'Request Enhancement'}</button>
        </article>;
      })}
      {!plans.length?<EmptyState title="No published enchantment plans"/>:null}
    </div>
    {requests.length?<details className="react-crafting-request-history">
      <summary>My Enhancement Requests ({requests.length})</summary>
      {requests.slice().reverse().slice(0,20).map(r=><p key={r.id}>
        {r.planName} on {r.itemName}: <b>{r.status}</b>
      </p>)}
    </details>:null}
    {message?<p role="status" className="react-action-message">{message}</p>:null}
  </Panel>;
}
