import React,{useMemo,useState} from 'react';
import {gmPartyRoster} from '../state/gmPartyControlModel.mjs';

/** Live character roster, navigational only. Existing workspaces own writes. */
export function GMPartyControl({campaign={},characters={},selectedId='',onSelect,onNavigate,onOpenCharacter}){
  const [query,setQuery]=useState('');
  const roster=useMemo(()=>gmPartyRoster({campaign,characters,query}),[campaign,characters,query]);
  const selectAndOpen=(row,tab)=>{
    onSelect(row.id);
    onNavigate({tab});
  };
  return <section className="react-gm-party-control" aria-label="GM Party Management">
    <div className="react-gm-party-heading">
      <div><h2>Party Management</h2>
        <p>Select a linked character, then open its existing GM controls, inventory or character dashboard.</p></div>
      <span>{roster.count} {roster.count===1?'character':'characters'} linked</span>
    </div>
    <div className="react-gm-party-utilities">
      <label htmlFor="gmPartySearch">Find party member
        <input id="gmPartySearch" type="search" value={query}
          onChange={event=>setQuery(event.target.value)}
          placeholder="Search name or class" autoComplete="off"/>
      </label>
      <button type="button" onClick={()=>onNavigate({tab:'tools'})}>Campaign Manager &amp; GM Tools</button>
      <button type="button" onClick={()=>onNavigate({tab:'quests'})}>Party Quests</button>
    </div>
    <p role="status" aria-live="polite" className="react-gm-party-count">
      {roster.rows.length} of {roster.count} linked characters shown
    </p>
    <div className="react-gm-party-roster">
      {roster.rows.map(row=><article className="react-gm-party-member" key={row.id}
        data-selected={selectedId===row.id?'true':'false'}>
        <div className="react-gm-party-member-head">
          <strong>{row.name}</strong>
          <span>{row.characterClass}{row.level!==null?' · Level '+row.level:''}</span>
        </div>
        <div className="react-gm-party-member-actions">
          <button type="button" aria-pressed={selectedId===row.id}
            onClick={()=>onSelect(row.id)}>{selectedId===row.id?'Selected':'Select'}</button>
          <button type="button" onClick={()=>selectAndOpen(row,'tools')}
            aria-label={'GM tools for '+row.name}>GM Tools</button>
          <button type="button" onClick={()=>selectAndOpen(row,'inventory')}
            aria-label={'Inventory for '+row.name}>Inventory</button>
          <button type="button" onClick={()=>onOpenCharacter(row.character)}
            aria-label={'Open '+row.name+' character dashboard'}>Character</button>
        </div>
      </article>)}
    </div>
    {!roster.count?<p className="react-gm-party-empty">No linked characters. Use the existing Campaign Manager to invite or link players.</p>:null}
    {roster.count>0&&!roster.rows.length?<p className="react-gm-party-empty">No characters match your search.</p>:null}
    <p className="react-gm-party-note">Resource bars and party presence remain in the GM sidebar. All actions open the existing campaign tools; this overview does not alter player data.</p>
  </section>;
}
