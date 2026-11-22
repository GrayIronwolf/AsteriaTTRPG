import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AsteriaIcon} from './AsteriaIcons.jsx';
import {dashboardCategoryForPage,dashboardMenu} from '../state/dashboardMenuModel.mjs';
import styles from './DashboardNavigation.module.css';

const pinKey=(role,scope)=>'asteria:dashboard-pins:v1:'+role+':'+(scope||'guest');
function readPins(key){
  try{
    const value=JSON.parse(localStorage.getItem(key)||'[]');
    return Array.isArray(value)?value.filter(id=>typeof id==='string').slice(0,8):[];
  }catch{return [];}
}

/** Replacement for the former 21/25 horizontal dashboard tabs.
 * The category buttons open header-style card menus; existing pages keep their IDs.
 * The original Tabs component remains available for subnavigation inside pages.
 */
export function DashboardNavigation({tabs=[],active,onChange,ariaLabel='Dashboard menu',
  role='player',storageScope=''}) {
  const root=useRef(null);
  const [opened,setOpened]=useState('');
  const [query,setQuery]=useState('');
  const key=pinKey(role,storageScope);
  const [pinned,setPinned]=useState(()=>readPins(key));
  const allowed=tabs.map(item=>item.id);
  const categories=useMemo(()=>dashboardMenu(role,allowed),[role,allowed.join('|')]);
  const available=categories.flatMap(group=>group.items.map(item=>({
    ...item,category:group.label,icon:group.icon
  })));
  const activeGroup=dashboardCategoryForPage(role,active);
  const choose=id=>{
    if(!available.some(item=>item.id===id))return;
    onChange(id);setOpened('');setQuery('');
  };
  const toggle=id=>{
    const group=categories.find(item=>item.id===id);
    if(group?.items.length===1&&(id==='main'||id==='dashboard'||id==='settings')){
      choose(group.items[0].id);return;
    }
    setOpened(previous=>previous===id?'':id);setQuery('');
  };
  const setPin=id=>{
    const next=pinned.includes(id)?pinned.filter(item=>item!==id):
      [...pinned,id].slice(-8);
    setPinned(next);
    try{localStorage.setItem(key,JSON.stringify(next));}catch{/* no persistence */ }
  };
  useEffect(()=>{
    setPinned(readPins(key));setOpened('');setQuery('');
  },[key]);
  useEffect(()=>{
    const dismiss=event=>{
      if(!root.current?.contains(event.target)){setOpened('');setQuery('');}
    };
    const escape=event=>{
      if(event.key==='Escape'){setOpened('');setQuery('');}
    };
    document.addEventListener('pointerdown',dismiss);
    document.addEventListener('keydown',escape);
    return()=>{
      document.removeEventListener('pointerdown',dismiss);
      document.removeEventListener('keydown',escape);
    };
  },[]);
  const selected=categories.find(item=>item.id===opened);
  const searchable=opened==='search'?available:
    selected?.items.map(item=>({...item,category:selected.label,icon:selected.icon}))||[];
  const entries=searchable.filter(item=>{
    const needle=query.trim().toLowerCase();
    return !needle||[item.label,item.description,item.section,item.category].some(value=>
      String(value||'').toLowerCase().includes(needle));
  });
  const favorites=pinned.map(id=>available.find(item=>item.id===id)).filter(Boolean);
  return <nav className={styles.root} ref={root} aria-label={ariaLabel}
    data-testid={'asteria-'+role+'-hybrid-menu'}>
    <div className={styles.bar} role="group" aria-label="Dashboard main categories">
      {categories.map(group=>{
        const direct=group.items.length===1&&['main','dashboard','settings'].includes(group.id);
        const current=activeGroup===group.id;
        return <button type="button" key={group.id}
          className={'asteria-menu-button '+styles.category+(current?' active':'')}
          data-asteria-button-size="standard"
          aria-current={direct&&current?'page':undefined}
          aria-haspopup={direct?undefined:'true'}
          aria-expanded={direct?undefined:opened===group.id}
          onClick={()=>toggle(group.id)}>
          <AsteriaIcon name={group.icon}/><span>{group.label}</span>
          {!direct?<span aria-hidden="true" className={styles.chevron}>▾</span>:null}
        </button>;
      })}
      <button type="button" className={'asteria-menu-button '+styles.searchButton}
        data-asteria-button-size="standard"
        aria-label="Find dashboard page" aria-expanded={opened==='search'}
        onClick={()=>{setOpened(value=>value==='search'?'':'search');setQuery('');}}>
        <AsteriaIcon name="search"/><span className={styles.searchText}>Find</span>
      </button>
    </div>
    {favorites.length?<div className={styles.favourites} aria-label="Pinned dashboard pages">
      <strong>Favourites</strong>
      {favorites.map(item=><button key={item.id} type="button"
        onClick={()=>choose(item.id)} aria-label={'Open favourite '+item.label}>
        <span aria-hidden="true">★</span> {item.label}</button>)}
    </div>:null}
    {opened?<section className={styles.dropdown}
      aria-label={opened==='search'?'Find dashboard pages':selected?.label+' pages'}
      data-testid="asteria-dashboard-card-dropdown">
      <header className={styles.dropdownHeader}>
        <div><h2>{opened==='search'?'Find a dashboard page':selected?.label}</h2>
          <p>Select a card to open its existing workspace.</p></div>
        <label className={styles.queryLabel}><span>Search pages</span>
          <input type="search" value={query} onChange={event=>setQuery(event.target.value)}
            placeholder="Find a page…" autoComplete="off"/></label>
        <button type="button" aria-label="Close dashboard menu" className={styles.close}
          onClick={()=>{setOpened('');setQuery('');}}>×</button>
      </header>
      <div className={styles.grid}>
        {entries.map(item=><div className={styles.cardHost} key={item.id}>
          <button type="button" className={styles.card}
            aria-label={'Open '+item.label}
            aria-current={active===item.id?'page':undefined}
            onClick={()=>choose(item.id)}>
            <span className={styles.art} aria-hidden="true">
              <AsteriaIcon name={item.icon}/>
            </span>
            {item.section?<small className={styles.section}>{item.section}</small>:null}
            <span className={styles.cardLabel}>{item.label}</span>
            <span className={styles.summary}>{item.description}</span>
          </button>
          <button type="button" className={styles.pin}
            aria-label={(pinned.includes(item.id)?'Unpin ':'Pin ')+item.label}
            aria-pressed={pinned.includes(item.id)}
            onClick={()=>setPin(item.id)} title="Add or remove from favourites">
            {pinned.includes(item.id)?'★':'☆'}
          </button>
        </div>)}
        {!entries.length?<p className={styles.empty}>No matching dashboard pages.</p>:null}
      </div>
    </section>:null}
  </nav>;
}
