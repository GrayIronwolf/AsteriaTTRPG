import React,{useMemo,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {GM_TOOLKIT_GROUPS} from '../../../src/state/gmToolkitModel.mjs';
import {filterGMToolkit,gmToolkitDestination,gmToolkitMetrics} from './gmToolkitNavigationModel.mjs';
import styles from './GMNpcToolkit.module.css';

const access=(tool,tabs,enabled)=>gmToolkitDestination(tool,{tabs,enabled});

export function GMToolkitWorkspace({session={},party=[],quests=[],tabs=[],enabled={},onNavigate}){
  const [query,setQuery]=useState(''),[group,setGroup]=useState('all');
  const sections=useMemo(()=>filterGMToolkit({query,group}),[query,group]);
  const metrics=gmToolkitMetrics({session,party,quests});
  const count=sections.reduce((total,section)=>total+section.tools.length,0);
  return <SurfacePanel as="section" className={styles.shell}
    data-testid="site-gm-toolkit-restored">
    <header className={styles.head}>
      <div><h2>GM Toolkit</h2>
        <BodyText muted>Search and open the current campaign's interactive GM workspaces.</BodyText></div>
      <strong>{count} matching tool{count===1?'':'s'}</strong>
    </header>
    <div className={styles.metrics} aria-label="Campaign overview">
      <div><small>Session</small><strong>{metrics.status}</strong></div>
      <div><small>Linked characters</small><strong>{metrics.characters}</strong></div>
      <div><small>Open quests</small><strong>{metrics.openQuests}</strong></div>
    </div>
    <label className={styles.field}>Find a GM tool
      <input type="search" value={query} maxLength={120}
        onChange={e=>setQuery(e.target.value)}
        placeholder="Search encounters, NPCs, shops, notes…"/></label>
    <div className={styles.actions} role="group" aria-label="Filter GM tools by category">
      {[{id:'all',label:'All Tools'},...GM_TOOLKIT_GROUPS].map(item=>
        <button type="button" key={item.id} aria-pressed={group===item.id}
          onClick={()=>setGroup(item.id)}>{item.label}</button>)}
    </div>
    <p role="status" className={styles.muted}>{count} matching GM tools.</p>
    {sections.map(section=><section className={styles.toolSection} key={section.id}
      aria-labelledby={'site-gm-toolkit-'+section.id}>
      <header><h3 id={'site-gm-toolkit-'+section.id}>{section.label}</h3>
        <p>{section.description}</p></header>
      <div className={styles.toolGrid}>{section.tools.map(tool=>{
        const route=access(tool,tabs,enabled);
        return <article className={styles.toolCard} key={tool.id}>
          <h4>{tool.label}</h4><p>{tool.description}</p>
          <button type="button" disabled={!route.enabled}
            title={route.reason||undefined}
            onClick={()=>onNavigate?.(route.tab)}>
            {route.enabled?'Open '+tool.label:'Unavailable'}</button>
          {!route.enabled?<small>{route.reason}</small>:null}
        </article>;
      })}</div>
    </section>)}
    {!sections.length?<div className={styles.empty}><BodyText muted>
      No GM tools match those filters.</BodyText>
      <button type="button" onClick={()=>{setQuery('');setGroup('all');}}>
        Show all tools</button></div>:null}
  </SurfacePanel>;
}
export function GMToolkitQuickAccess({onNavigate,enabled={},tabs=[]}){
  const quick=[
    {id:'encounter',label:'GM Main',tab:'main'},
    {id:'npc-library',label:'NPC & Creature Library',tab:'bestiary'},
    {id:'quests',label:'Quest Manager',tab:'quests'},
    {id:'notes',label:'Private GM Notes',tab:'notes'},
    {id:'world',label:'World Systems',tab:'world'}
  ];
  return <SurfacePanel as="section" className={styles.quick}
    data-testid="site-gm-toolkit-quick-access">
    <h2>GM Toolkit — Quick Access</h2>
    <div className={styles.actions}>{quick.map(tool=>{
      const route=access(tool,tabs,enabled);
      return <button type="button" key={tool.id} disabled={!route.enabled}
        title={route.reason||undefined} onClick={()=>onNavigate?.(route.tab)}>
        {tool.label}</button>;
    })}
      <button type="button" onClick={()=>onNavigate?.('toolkit')}>All GM Tools</button>
    </div>
  </SurfacePanel>;
}
