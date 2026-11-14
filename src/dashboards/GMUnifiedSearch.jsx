import React,{useEffect,useMemo,useRef,useState} from 'react';
import {firebaseService,waitForFirebase} from '../firebase/asteriaFirebaseService.js';
import {
  buildGMSearchIndex,searchGMIndex,searchResultDestination,categoryCounts,
  SEARCH_CATEGORIES,SEARCH_CATEGORY_LABELS,SEARCH_QUERY_MAX
} from '../state/gmUnifiedSearchModel.mjs';
import '../styles/gm-unified-search.css';

const emptySources=()=>({
 battleMaps:[],worldMaps:[],encounterPlans:[],randomTables:[],lootTables:[],
 sessionNotes:[],sessionPdfs:[]
});
const streams=Object.freeze([
 ['battleMaps',(id,set)=>firebaseService.subscribeBattleMaps(id,set,{gm:true})],
 ['worldMaps',(id,set)=>firebaseService.subscribeWorldAtlas(id,set,'gm')],
 ['encounterPlans',(id,set)=>firebaseService.subscribeEncounterPlans(id,set)],
 ['randomTables',(id,set)=>firebaseService.subscribeRandomTables(id,set)],
 ['lootTables',(id,set)=>firebaseService.subscribeLootTables(id,set)],
 ['sessionNotes',(id,set)=>firebaseService.subscribeSessionNotes(id,set)],
 ['sessionPdfs',(id,set)=>firebaseService.subscribeSessionPdfs(id,set,'gm')]
]);
function useGMSearchSources(campaignId,enabled){
 const [sources,setSources]=useState(emptySources);
 const [status,setStatus]=useState('idle');
 const [errors,setErrors]=useState([]);
 useEffect(()=>{
  setSources(emptySources());setErrors([]);
  setStatus(enabled?'connecting':'idle');
  if(!campaignId||!enabled)return undefined;
  let active=true;let subscriptions=[];
  waitForFirebase().then(()=>{
   if(!active)return;
   if(!firebaseService.currentUser()){setStatus('signed-out');return;}
   const issues=[];
   for(const [key,subscribe] of streams){
    try{
     const stop=subscribe(campaignId,items=>{
      if(!active)return;
      setSources(previous=>({...previous,[key]:Array.isArray(items)?items:[]}));
     });
     subscriptions.push(typeof stop==='function'?stop:()=>{});
    }catch(error){issues.push(key+': '+(error?.message||String(error)));}
   }
   setErrors(issues);
   setStatus(issues.length?'partial':'connected');
  }).catch(error=>{
   if(active){setErrors([error?.message||'Unable to connect to campaign search.']);setStatus('failed');}
  });
  return()=>{active=false;subscriptions.forEach(stop=>{try{stop();}catch{}});};
 },[campaignId,enabled]);
 return {sources,status,errors};
}
/** A compact GM-only, opt-in search dialog embedded above the dashboard tabs.
 * Search data stays in memory. No external requests or persisted shared index.
 */
export function GMUnifiedSearch({campaignId,workspace={},characters={},itemEcosystem={},onNavigate}){
 const [open,setOpen]=useState(false);
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('all');
 const [activeIndex,setActiveIndex]=useState(0);
 const input=useRef(null);
 const {sources,status,errors}=useGMSearchSources(campaignId,open);
 useEffect(()=>{setOpen(false);setQuery('');setCategory('all');},[campaignId]);
 useEffect(()=>{
  const shortcut=event=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault();setOpen(value=>!value);
   }
   if(event.key==='Escape'&&open){event.preventDefault();setOpen(false);}
  };
  window.addEventListener('keydown',shortcut);
  return()=>window.removeEventListener('keydown',shortcut);
 },[open]);
 useEffect(()=>{if(open)input.current?.focus();},[open]);
 const index=useMemo(()=>open?buildGMSearchIndex({
  workspace,characters,itemEcosystem,...sources
 }):[],[open,workspace,characters,itemEcosystem,sources]);
 const counts=useMemo(()=>categoryCounts(index),[index]);
 const matches=useMemo(()=>searchGMIndex(index,query,category),[index,query,category]);
 const normalized=String(query||'').trim();
 const suggestions=!normalized&&category==='all'?
  searchGMIndex(index,'','tool',8):matches;
 const openResult=record=>{
  const dest=searchResultDestination(record);
  if(!dest)return;
  if(typeof onNavigate==='function')onNavigate(dest);
  setOpen(false);
 };
 const onKeys=event=>{
  if(event.key==='ArrowDown'){event.preventDefault();setActiveIndex(i=>Math.min(suggestions.length-1,i+1));}
  if(event.key==='ArrowUp'){event.preventDefault();setActiveIndex(i=>Math.max(0,i-1));}
  if(event.key==='Enter'&&suggestions[activeIndex]){
   event.preventDefault();openResult(suggestions[activeIndex]);
  }
 };
 return <div className="asteria-gm-unified-search">
  <div className="asteria-gm-search-launch">
   <button type="button" className="asteria-gm-search-open" aria-expanded={open}
    aria-controls="asteria-gm-search-panel" onClick={()=>setOpen(v=>!v)}>
    {open?'Close Toolkit Search':'Search All GM Tools & Campaign Records'}
   </button>
   <small>Ctrl+K / ⌘K</small>
  </div>
  {open?<section id="asteria-gm-search-panel" className="asteria-gm-search-panel"
    aria-label="Unified GM toolkit search">
    <header>
     <div><h2>Unified GM Search</h2>
      <p>Search this campaign’s GM resources and open the matching workspace.</p></div>
     <button type="button" aria-label="Close search" onClick={()=>setOpen(false)}>Close</button>
    </header>
    <label htmlFor="asteria-gm-search-query">Search across tools, NPCs, creatures, merchants, maps, encounters and more</label>
    <input ref={input} id="asteria-gm-search-query" type="search" autoComplete="off"
      maxLength={SEARCH_QUERY_MAX} value={query}
      onChange={event=>{setQuery(event.target.value);setActiveIndex(0);}}
      onKeyDown={onKeys} aria-controls="asteria-gm-search-results"
      placeholder="Search a name, location, shop, quest, map or tool…"/>
    <div className="asteria-gm-search-categories" role="group" aria-label="Filter search results by type">
      {SEARCH_CATEGORIES.filter(c=>c==='all'||counts[c]>0).map(c=>
       <button key={c} type="button" aria-pressed={category===c}
         onClick={()=>{setCategory(c);setActiveIndex(0);}}>
        {SEARCH_CATEGORY_LABELS[c]} <span>{counts[c]||0}</span>
       </button>)}
    </div>
    <p role="status" aria-live="polite" className="asteria-gm-search-status">
     {status==='connecting'?'Loading campaign record types…':
      status==='failed'?'Campaign search is unavailable.':
      status==='signed-out'?'Sign in as the campaign GM to search.':
      normalized||category!=='all'
       ?suggestions.length+' matching records (up to 50 shown)'
       :'Quick access to GM workspaces'}
    </p>
    {errors.length?<p className="asteria-gm-search-error" role="alert">
      Some record sources could not be loaded: {errors.join(' | ')}</p>:null}
    <div id="asteria-gm-search-results" className="asteria-gm-search-results">
      {suggestions.map((record,i)=><button type="button" key={record.key}
        className={i===activeIndex?'active':''}
        onClick={()=>openResult(record)}
        onMouseEnter={()=>setActiveIndex(i)}>
        <span className="asteria-gm-search-result-type">{SEARCH_CATEGORY_LABELS[record.category]||'Record'}</span>
        <span className="asteria-gm-search-result-content">
          <strong>{record.title}</strong>
          {record.detail?<small>{record.detail}</small>:null}
        </span><span aria-hidden="true">Open</span>
      </button>)}
      {!suggestions.length?<p>{normalized?'No matching campaign records. Try a different name or category.':
       'There are no records in this category yet.'}</p>:null}
    </div>
    <footer>Results are sourced only from the active GM campaign. Private notes, raw record contents and NPC secrets are not copied into a shared search index.</footer>
  </section>:null}
 </div>;
}
