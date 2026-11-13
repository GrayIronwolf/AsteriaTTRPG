import React, {useMemo, useState} from 'react';
import {filterGMToolkit, GM_TOOLKIT_GROUPS, gmToolkitOverview, gmToolkitTool} from '../state/gmToolkitModel.mjs';

/** This hub is navigational only. Existing GM workspace components own all data. */
export function GMToolkitHub({session={},characters={},workspace={},itemEcosystem={},partyLoot={},onNavigate}){
  const [query,setQuery]=useState('');
  const [group,setGroup]=useState('all');
  const sections=useMemo(()=>filterGMToolkit({query,group}),[query,group]);
  const overview=gmToolkitOverview({session,characters,workspace,itemEcosystem,partyLoot});
  const count=sections.reduce((total,section)=>total+section.tools.length,0);
  const metrics=[
    {label:'Session',value:overview.sessionStatus.replace(/^./,char=>char.toUpperCase())},
    {label:'Linked characters',value:overview.linkedCharacters},
    {label:'Open quests',value:overview.openQuests},
    {label:'Merchant shops',value:overview.shops},
    {label:'Hidden treasure drafts',value:overview.hiddenDrafts}
  ];
  return <section className="react-gm-toolkit" aria-label="GM Toolkit">
    <header className="react-gm-toolkit-heading">
      <div>
        <p className="react-eyebrow">Campaign Control Centre</p>
        <h2>GM Toolkit</h2>
        <p>All current GM tools in one place. Open a workspace to use its existing live campaign controls.</p>
      </div>
      <span className="react-gm-toolkit-count">{count} {count===1?'tool':'tools'} available</span>
    </header>
    <div className="react-gm-toolkit-metrics" aria-label="Live campaign overview">
      {metrics.map(item=><div className="react-gm-toolkit-metric" key={item.label}>
        <span>{item.label}</span><strong>{item.value}</strong>
      </div>)}
    </div>
    <div className="react-gm-toolkit-filters">
      <label htmlFor="asteriaGMToolkitSearch">Find a GM tool
        <input id="asteriaGMToolkitSearch" type="search" value={query}
          onChange={event=>setQuery(event.target.value)} placeholder="Search encounters, shops, notes, quests..."
          autoComplete="off"/>
      </label>
      <div className="react-gm-toolkit-categories" role="group" aria-label="Filter GM tools by category">
        {[{id:'all',label:'All tools'},...GM_TOOLKIT_GROUPS].map(option=>
          <button key={option.id} type="button" aria-pressed={group===option.id}
            onClick={()=>setGroup(option.id)}>{option.label}</button>)}
      </div>
    </div>
    <p className="react-gm-toolkit-results" role="status" aria-live="polite">{count} matching {count===1?'tool':'tools'}</p>
    {sections.length?sections.map(section=><section className="react-gm-toolkit-section" key={section.id} aria-labelledby={'gm-toolkit-'+section.id}>
      <div className="react-gm-toolkit-section-heading">
        <h3 id={'gm-toolkit-'+section.id}>{section.label}</h3>
        <p>{section.description}</p>
      </div>
      <div className="react-gm-toolkit-grid">
        {section.tools.map(tool=><button type="button" key={tool.id}
          className="react-gm-toolkit-tile" onClick={()=>onNavigate(tool)}
          aria-label={'Open '+tool.label}>
          <strong>{tool.label}</strong>
          <span>{tool.description}</span>
          <small>Open workspace <span aria-hidden="true">→</span></small>
        </button>)}
      </div>
    </section>):<div className="react-gm-toolkit-empty">
      <p>No existing GM tools match those filters.</p>
      <button type="button" onClick={()=>{setQuery('');setGroup('all');}}>Show all tools</button>
    </div>}
    <p className="react-gm-toolkit-note">Tools use the campaign you are already managing. New generators, map tools, and additional session features will be added in later phases.</p>
  </section>;
}

const quickIds=['encounter','quests','npc-library','notes','shops','world'];
export function GMToolkitQuickAccess({onNavigate}){
  return <nav className="react-gm-toolkit-quick" aria-label="GM Toolkit quick access">
    <div><strong>GM Toolkit</strong><span>Quickly open an existing campaign tool.</span></div>
    <div className="react-gm-toolkit-quick-links">
      {quickIds.map(id=>{const tool=gmToolkitTool(id);return tool?
        <button type="button" key={id} onClick={()=>onNavigate(tool)}>{tool.label}</button>:null;})}
      <button type="button" className="react-gm-toolkit-open" onClick={()=>onNavigate({tab:'toolkit'})}>All GM Tools</button>
    </div>
  </nav>;
}
