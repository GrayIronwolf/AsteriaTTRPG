import React,{useEffect,useMemo,useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {inventoryItems} from './characterWorkspaceData.js';
import {craftingInventoryPlan} from '../state/craftingRecipeModel.mjs';
import {stationAccessible} from '../state/craftingServicesModel.mjs';
import {EmptyState,Panel,StatusPill} from '../components/WorkspaceUI.jsx';

const empty=()=>({
  name:'',description:'',status:'draft',stationId:'',
  materials:[{name:'',itemCode:'',quantity:1}],
  output:{name:'',itemCode:'',type:'Item',quantity:1}
});
const rows=value=>Array.isArray(value)?value:[];
const whole=(s,min,max)=>{
  const n=Number(s);
  return String(s).trim()!==''&&Number.isSafeInteger(n)&&n>=min&&n<=max;
};
const showMaterial=material=>material.name+' ×'+material.quantity+
  (material.itemCode?' ('+material.itemCode+')':'');
function RecipeMaterials({recipe,plan}){
  return <div className="react-crafting-recipe-requirements">
    {rows(recipe.materials).map((material,index)=>{
      const check=plan?.requirements?.[index];
      return <div key={index}>
        <span>{showMaterial(material)}</span>
        {check?<small>{check.available}/{check.needed} in inventory
          {check.missing?' · Missing '+check.missing:' · Ready'}</small>:null}
      </div>;
    })}
  </div>;
}
export function GMCraftingRecipeManager({campaignId,characters={}}){
  const [recipes,setRecipes]=useState([]);
  const [stations,setStations]=useState([]);
  const [requests,setRequests]=useState([]);
  const [draft,setDraft]=useState(empty);
  const [editing,setEditing]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [tab,setTab]=useState('recipes');
  useEffect(()=>{
    if(!campaignId)return;
    const off0=firebaseService.subscribeCraftingStations(campaignId,setStations,true);
    const off1=firebaseService.subscribeCraftingRecipes(campaignId,setRecipes,true);
    const off2=firebaseService.subscribeCraftingRequests(campaignId,setRequests,true);
    return()=>{off0();off1();off2();};
  },[campaignId]);
  const save=async()=>{
    if(busy)return;
    if(!draft.name.trim()||!draft.output.name.trim())return setMessage('Enter a recipe and crafted item name.');
    if(!rows(draft.materials).length||rows(draft.materials).some(item=>
      !item.name.trim()||!whole(item.quantity,1,1000)))
      return setMessage('Add materials with whole quantities of 1–1,000.');
    if(!whole(draft.output.quantity,1,100))
      return setMessage('Output quantity must be 1–100.');
    setBusy(true);
    try{
      const recipe={
        ...draft,materials:draft.materials.map(item=>({...item,quantity:Number(item.quantity)})),
        output:{...draft.output,quantity:Number(draft.output.quantity)}
      };
      const result=await firebaseService.manageCraftingRecipe(campaignId,'gm-scope',
        {type:'save',...(editing?{recipeId:editing}:{}),recipe});
      setMessage(result?.ok?'Crafting recipe saved.':result?.error||'Could not save recipe.');
      if(result?.ok){setDraft(empty());setEditing('');}
    }catch(error){setMessage(error.message||'Could not save recipe.');}
    finally{setBusy(false);}
  };
  const remove=async id=>{
    if(busy||!window.confirm('Delete this crafting recipe? Pending requests cannot be completed after deletion.'))return;
    setBusy(true);
    try{
      const result=await firebaseService.manageCraftingRecipe(campaignId,'gm-scope',
        {type:'delete',recipeId:id});
      setMessage(result?.ok?'Recipe deleted.':result?.error||'Could not delete recipe.');
    }finally{setBusy(false);}
  };
  const review=async(request,decision)=>{
    if(busy)return;
    setBusy(true);
    try{
      const result=await firebaseService.reviewCraftingRequest(campaignId,
        'gm-scope',request.id,decision);
      setMessage(result?.ok?decision==='approve'?'Crafting completed and inventory updated.':
        'Crafting request declined.':result?.error||'Could not review request.');
    }catch(error){setMessage(error.message||'Could not review request.');}
    finally{setBusy(false);}
  };
  const updateMaterial=(index,patch)=>setDraft(prev=>({...prev,
    materials:prev.materials.map((row,i)=>i===index?{...row,...patch}:row)}));
  const pending=requests.filter(row=>row.status==='pending');
  return <Panel title="Crafting Recipes & Blueprints" eyebrow="Phase 11.1 — GM Crafting Catalogue"
    action={<div className="react-segmented-actions">
      {['recipes','requests'].map(value=><button key={value} className={tab===value?'active':''}
        onClick={()=>setTab(value)}>{value==='recipes'?'Recipes':'Requests ('+pending.length+')'}</button>)}
    </div>}>
    {tab==='recipes'?<div className="react-crafting-recipe-layout">
      <section className="react-crafting-recipe-editor">
        <h3>{editing?'Edit Recipe':'Create Recipe'}</h3>
        <label>Name<input maxLength={160} value={draft.name}
          onChange={event=>setDraft(prev=>({...prev,name:event.target.value}))}/></label>
        <label>Description<textarea rows={2} maxLength={1000} value={draft.description}
          onChange={event=>setDraft(prev=>({...prev,description:event.target.value}))}/></label>
        <label>Publication<select value={draft.status}
          onChange={event=>setDraft(prev=>({...prev,status:event.target.value}))}>
          <option value="draft">GM Draft (private)</option>
          <option value="published">Published (players can request)</option>
        </select></label>
        <label>Required Station (optional)<select value={draft.stationId||''}
          onChange={event=>setDraft(prev=>({...prev,stationId:event.target.value}))}>
          <option value="">No station required</option>
          {stations.map(s=><option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
        </select></label>
        <h4>Required Materials</h4>
        {draft.materials.map((row,index)=><div className="react-crafting-material-editor" key={index}>
          <label>Material Name<input maxLength={160} value={row.name}
            onChange={event=>updateMaterial(index,{name:event.target.value})}/></label>
          <label>Asteria Definition Code (optional)<input maxLength={128} value={row.itemCode}
            placeholder="Match exact definition ID when known"
            onChange={event=>updateMaterial(index,{itemCode:event.target.value})}/></label>
          <label>Quantity<input type="number" min={1} max={1000} step={1} value={row.quantity}
            onChange={event=>updateMaterial(index,{quantity:event.target.value})}/></label>
          <button type="button" disabled={draft.materials.length<=1}
            onClick={()=>setDraft(prev=>({...prev,
              materials:prev.materials.filter((_,i)=>i!==index)}))}>Remove</button>
        </div>)}
        <button type="button" disabled={draft.materials.length>=12}
          onClick={()=>setDraft(prev=>({...prev,
            materials:[...prev.materials,{name:'',itemCode:'',quantity:1}]}))}>Add Material</button>
        <h4>Crafted Output</h4>
        <label>Item Name<input maxLength={160} value={draft.output.name}
          onChange={event=>setDraft(prev=>({...prev,output:{...prev.output,name:event.target.value}}))}/></label>
        <label>Definition Code (optional)<input maxLength={128} value={draft.output.itemCode}
          onChange={event=>setDraft(prev=>({...prev,output:{...prev.output,itemCode:event.target.value}}))}/></label>
        <label>Item Type<input maxLength={100} value={draft.output.type}
          onChange={event=>setDraft(prev=>({...prev,output:{...prev.output,type:event.target.value}}))}/></label>
        <label>Output Quantity<input type="number" min={1} max={100} value={draft.output.quantity}
          onChange={event=>setDraft(prev=>({...prev,output:{...prev.output,quantity:event.target.value}}))}/></label>
        <div className="react-action-row">
          <button className="primary" disabled={busy} onClick={save}>{editing?'Save Changes':'Create Recipe'}</button>
          {editing?<button onClick={()=>{setEditing('');setDraft(empty());}}>Cancel Editing</button>:null}
        </div>
      </section>
      <section className="react-record-list">
        {recipes.map(recipe=><article key={recipe.id}>
          <h3>{recipe.name}</h3>
          <StatusPill tone={recipe.status==='published'?'success':''}>{recipe.status}</StatusPill>
          {recipe.description?<p>{recipe.description}</p>:null}
          {recipe.stationId?<p><b>Station:</b> {stations.find(s=>s.id===recipe.stationId)?.name||'Unavailable'}</p>:null}
          <RecipeMaterials recipe={recipe}/>
          <p><b>Produces:</b> {recipe.output?.name} ×{recipe.output?.quantity}</p>
          <div className="react-action-row">
            <button disabled={busy} onClick={()=>{setEditing(recipe.id);
              setDraft({...recipe,materials:recipe.materials.map(item=>({...item})),output:{...recipe.output}});}}>Edit</button>
            <button className="danger" disabled={busy} onClick={()=>remove(recipe.id)}>Delete</button>
          </div>
        </article>)}
        {!recipes.length?<EmptyState title="No crafting recipes yet"/>:null}
      </section>
    </div>:<div className="react-record-list">
      {requests.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(request=>
        <article key={request.id}>
          <h3>{request.recipeName}</h3>
          <p>{request.characterName||characters[request.characterId]?.name||'Character'}</p>
          <StatusPill tone={request.status==='approved'?'success':''}>{request.status}</StatusPill>
          <RecipeMaterials recipe={request.recipe}/>
          <p><b>Produces:</b> {request.recipe?.output?.name} ×{request.recipe?.output?.quantity}</p>
          {request.status==='pending'?<div className="react-action-row">
            <button disabled={busy} className="primary" onClick={()=>review(request,'approve')}>Approve & Craft</button>
            <button disabled={busy} onClick={()=>review(request,'reject')}>Reject</button>
          </div>:null}
        </article>)}
      {!requests.length?<EmptyState title="No crafting requests yet"/>:null}
    </div>}
    {message?<p role="status" className="react-action-message">{message}</p>:null}
  </Panel>;
}

export function PlayerCraftingRecipes({campaignId,character={},editable=false}){
  const [recipes,setRecipes]=useState([]);
  const [stations,setStations]=useState([]);
  const [requests,setRequests]=useState([]);
  const [search,setSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    if(!campaignId)return;
    const off0=firebaseService.subscribeCraftingStations(campaignId,setStations,false);
    const off1=firebaseService.subscribeCraftingRecipes(campaignId,setRecipes,false);
    const off2=firebaseService.subscribeCraftingRequests(campaignId,setRequests,false);
    return()=>{off0();off1();off2();};
  },[campaignId]);
  const inventory=useMemo(()=>inventoryItems(character),[character]);
  const visible=recipes.filter(recipe=>String(recipe.name||'').toLowerCase().includes(search.trim().toLowerCase()));
  const request=async recipe=>{
    if(busy||!editable)return;
    setBusy(true);
    try{
      const result=await firebaseService.requestCraftingRecipe(campaignId,character.id,recipe.id);
      setMessage(result?.ok?'Request submitted to the GM. No materials have been consumed yet.':
        result?.error||'Could not request crafting.');
    }catch(error){setMessage(error.message||'Could not request crafting.');}
    finally{setBusy(false);}
  };
  return <Panel title="Crafting Recipes & Blueprints" eyebrow="Campaign crafting">
    <p>Check your materials and request an item. The GM must approve the result.
      Materials are consumed only after approval.</p>
    <label>Search Recipes<input type="search" value={search}
      onChange={event=>setSearch(event.target.value)} placeholder="Search available recipes"/></label>
    <div className="react-crafting-recipe-list">
      {visible.map(recipe=>{
        const plan=craftingInventoryPlan(recipe,inventory);
        const station=recipe.stationId?stations.find(s=>s.id===recipe.stationId):null;
        const stationReady=!recipe.stationId||stationAccessible(station,character.id);
        const pending=requests.some(row=>row.recipeId===recipe.id&&
          row.characterId===character.id&&row.status==='pending');
        return <article key={recipe.id}>
          <div className="react-record-heading"><h3>{recipe.name}</h3>
            <StatusPill tone={plan.ready?'success':'warning'}>{plan.ready?'Materials Ready':'Materials Missing'}</StatusPill>
          </div>
          {recipe.description?<p>{recipe.description}</p>:null}
          {recipe.stationId?<p><b>Required Station:</b> {station?.name||'Unavailable'}
            {!stationReady?' (unavailable to this character)':''}</p>:null}
          <RecipeMaterials recipe={recipe} plan={plan}/>
          <p><b>Output:</b> {recipe.output?.name} ×{recipe.output?.quantity}</p>
          <button type="button" className="primary"
            disabled={!editable||busy||!plan.ready||!stationReady||pending} onClick={()=>request(recipe)}>
            {pending?'Awaiting GM Approval':'Request Crafting'}
          </button>
        </article>;
      })}
      {!visible.length?<EmptyState title="No matching published recipes"/>:null}
    </div>
    {requests.length?<details className="react-crafting-request-history">
      <summary>My Crafting Requests ({requests.length})</summary>
      {requests.slice().reverse().slice(0,20).map(row=><p key={row.id}>
        {row.recipeName}: <b>{row.status}</b>
      </p>)}
    </details>:null}
    {message?<p role="status" className="react-action-message">{message}</p>:null}
  </Panel>;
}
