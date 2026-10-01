import React, { useEffect, useMemo, useRef, useState } from 'react';
import { talentDiskAppearance, talentDiskLayout, DISK_TIERS } from '../state/talentDisk.mjs';
import { AsteriaIcon } from '../components/AsteriaIcons.jsx';
import { talentRank, prerequisiteProblem, rankDefined } from '../state/talentModel.mjs';
import { TALENT_TIER_LEVELS, talentTierUnlocked, talentRankCost } from '../state/liveWorkspaceModel.mjs';
import '../styles/talent-disk.css';

const position = node => ({left:node.x,top:node.y});

export function TalentDisk({className,catalog,character,selectedTier,onTierChange,orientation='bottom',onSelect,focusedTalentId}) {
  const frame=useRef(null),previousTier=useRef(selectedTier);
  const [width,setWidth]=useState(1000),[page,setPage]=useState(0),[selection,setSelection]=useState(null);
  const [turn,setTurn]=useState({angle:0,direction:1});
  const appearance=talentDiskAppearance(className,globalThis.window?.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries || []);
  const unlocked=talentTierUnlocked(character.level,selectedTier);
  const talents=useMemo(()=>catalog.filter(t=>t.className===className && t.tier===selectedTier),[catalog,className,selectedTier]);
  const layout=talentDiskLayout(talents,width,orientation,page);
  useEffect(()=>{
    const observer=new ResizeObserver(entries=>{const value=Math.round(entries[0].contentRect.width);if(value>0)setWidth(value);});
    observer.observe(frame.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const delta=selectedTier-previousTier.current;
    if(delta){setTurn(old=>({angle:old.angle+delta*72,direction:Math.sign(delta)}));setPage(0);setSelection(null);}
    previousTier.current=selectedTier;
  },[selectedTier]);
  useEffect(()=>{
    const index=talents.findIndex(t=>t.id===focusedTalentId);
    if(index>=0)setPage(Math.floor(index/layout.pageSize));
  },[focusedTalentId,talents,layout.pageSize]);
  const states=new Map(talents.map(talent=>[talent.id,{learned:talentRank(character,talent,catalog),problem:prerequisiteProblem(character,talent,catalog)}]));
  const rankState=(talent,rank)=>{
    const {learned,problem}=states.get(talent.id),cost=talentRankCost(rank,talent.tier);
    if(rank<=learned)return {state:'learned',label:'purchased',reason:`${cost} TP · Purchased`};
    const reason=problem || (rank!==learned+1?'Learn the earlier ranks first':!rankDefined(talent,rank)?'This rank has not been written yet':Number(character.tp || 0)<cost?`Requires ${cost} TP`:'');
    return {state:reason?'locked':'available',label:reason?'locked':'available',reason:reason || `${cost} TP · Available to learn`};
  };
  const select=(talent,rank)=>{setSelection({id:talent.id,rank});onSelect({talent,rank});};
  const controls=<nav className="react-disk-controls" aria-label={`${className} tier rotation`}>
    <button type="button" aria-label={`${className}: rotate backward`} disabled={selectedTier===1} onClick={()=>onTierChange(selectedTier-1)}><AsteriaIcon name="chevronLeft" size={22}/></button>
    {DISK_TIERS.map((label,i)=><button type="button" key={label} aria-label={`${className}: Tier ${label}`} aria-pressed={selectedTier===i+1} onClick={()=>onTierChange(i+1)}>{label}</button>)}
    <button type="button" aria-label={`${className}: rotate forward`} disabled={selectedTier===5} onClick={()=>onTierChange(selectedTier+1)}><AsteriaIcon name="chevronRight" size={22}/></button>
  </nav>;
  const direction=(orientation==='top'?-1:1)*turn.direction;
  return <section className={`react-talent-disk orientation-${orientation}`} aria-label={`${className} talent disk`} data-class={className} data-tier={selectedTier} style={{'--disk-class-colour':appearance.colour}}>
    {orientation==='top'?controls:null}
    <div ref={frame} className={`react-disk-stage ${unlocked?'tier-unlocked':'tier-fogged'}`} style={{height:layout.height,'--disk-height':`${layout.height}px`,'--disk-turn':`${turn.angle*(orientation==='top'?-1:1)}deg`,'--disk-entry':`${-direction*65}deg`}}>
      <div className="react-disk-rotor" aria-hidden="true">
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" className="react-disk-engraving">
          <g className="react-disk-inscriptions">
          <circle cx="500" cy="500" r="487"/><circle cx="500" cy="500" r="466"/>
          <circle cx="500" cy="500" r="430" className="disk-inscription"/>
          <circle cx="500" cy="500" r="310" className="disk-orbit"/><circle cx="500" cy="500" r="175" className="disk-orbit"/>
          {Array.from({length:20},(_,i)=><g key={i} transform={`rotate(${i*18} 500 500)`}>
            <path d="M500 20 505 32 500 44 495 32Z" className="disk-jewel"/>
            <path d="M500 51V64M493 56 500 64 507 56"/>
          </g>)}
          </g>
        </svg>
      </div>
      <div className="react-disk-rim" aria-hidden="true"/>
      {unlocked?<div className="react-disk-branches" key={`${selectedTier}-${layout.page}`}>
        <svg width={width} height={layout.height} aria-hidden="true" className="react-disk-lines">
          {layout.nodes.map(node=><g key={node.talent.id}>
            <line x1={node.root.x} y1={node.root.y} x2={node.x} y2={node.y}/>
            {node.ranks.map((rank,i)=>{const from=i?node.ranks[i-1]:node;return <line key={rank.rank} className={rank.rank<=states.get(node.talent.id).learned?'state-learned':''} x1={from.x} y1={from.y} x2={rank.x} y2={rank.y}/>;})}
          </g>)}
        </svg>
        {layout.nodes.map(node=>{
          const {talent}=node,learned=states.get(talent.id).learned;
          return <div key={talent.id} className="react-disk-branch">
            <button type="button" style={{...position(node),width:Math.min(layout.talentWidth,72)}} data-node-id={`talent:${talent.id}`} className={`react-disk-node disk-talent state-${learned?'learned':rankState(talent,1).state} ${selection?.id===talent.id?'is-selected':''}`} title={talent.name} aria-label={`${className}, ${talent.name}, ${learned} of ${talent.maxRank} ranks learned. Open talent`} onClick={()=>select(talent,Math.max(1,learned))}><strong>{talent.name}</strong><small>{learned}/{talent.maxRank}</small></button>
            <div className="react-tree-ranks" role="group" aria-label={`${className}, ${talent.name} ranks`}>{node.ranks.map(rank=>{
              const status=rankState(talent,rank.rank),selected=selection?.id===talent.id && selection.rank===rank.rank;
              return <button type="button" key={rank.rank} style={position(rank)} data-node-id={`rank:${talent.id}:${rank.rank}`} className={`react-disk-node disk-rank state-${status.state} ${selected?'is-selected':''}`} aria-pressed={selected} title={`${talent.name} · Rank ${rank.rank} · ${status.reason}`} aria-label={`${className}, ${talent.name}, Rank ${rank.rank}, ${status.label}`} onClick={()=>select(talent,rank.rank)}>{DISK_TIERS[rank.rank-1]}{status.state==='learned'?<small aria-hidden="true">✓</small>:null}</button>;
            })}</div>
          </div>;
        })}
        {!talents.length?<p className="react-disk-empty">No talents have been written for this tier yet.</p>:null}
      </div>:<svg width={width} height={layout.height} className="react-disk-echoes" aria-hidden="true">
        {layout.nodes.map((node,i)=><g key={i}>
          <path d={`M${node.root.x} ${node.root.y} L${node.x} ${node.y} ${node.ranks.map(rank=>`L${rank.x} ${rank.y}`).join(' ')}`}/>
          <circle cx={node.x} cy={node.y} r="36"/>
          {node.ranks.map(rank=><circle key={rank.rank} cx={rank.x} cy={rank.y} r="21"/>)}
        </g>)}
      </svg>}
      <div className="react-disk-fog" aria-hidden="true"/>
      {!unlocked?<div className="react-disk-lock" role="status"><span className="react-disk-lock-seal"><AsteriaIcon name="lock" size={23}/></span><strong>Tier {DISK_TIERS[selectedTier-1]} · Locked</strong><span>Unlocks at Level {TALENT_TIER_LEVELS[selectedTier]}</span></div>:null}
      <div className="react-disk-hub" data-node-id={`class:${className.toLowerCase().replace(/\s+/g,'-')}`}><small>Tier {DISK_TIERS[selectedTier-1]}</small><span className="react-disk-sigil" aria-hidden="true">{appearance.symbol}</span><strong>{className}</strong></div>
    </div>
    {orientation==='bottom'?controls:null}
    {unlocked && layout.pages>1?<nav className="react-disk-branch-controls" aria-label={`${className} talent branches`}><button type="button" disabled={!layout.page} onClick={()=>setPage(layout.page-1)} aria-label={`${className}: previous talent branches`}>←</button><span>Talents {layout.page*layout.pageSize+1}–{Math.min((layout.page+1)*layout.pageSize,talents.length)} of {talents.length}</span><button type="button" disabled={layout.page===layout.pages-1} onClick={()=>setPage(layout.page+1)} aria-label={`${className}: next talent branches`}>→</button></nav>:null}
  </section>;
}

export function TalentGraph({catalog,character,query='',onSelect}) {
  const canonical=useMemo(()=>[...new Map(catalog.map(t=>[t.id,t])).values()],[catalog]);
  const classes=[...new Set(canonical.map(t=>t.className))].slice(0,2);
  const [tiers,setTiers]=useState({}),[focus,setFocus]=useState({}),[swapped,setSwapped]=useState(false);
  const ordered=classes.length===2?(swapped?classes:[classes[1],classes[0]]):classes;
  const matches=canonical.filter(t=>classes.includes(t.className) && talentTierUnlocked(character.level,t.tier) && `${t.name} ${t.className}`.toLowerCase().includes(query.trim().toLowerCase()));
  const tierChange=(className,tier)=>{setTiers(old=>({...old,[className]:tier}));setFocus(old=>({...old,[className]:null}));};
  return <>
    {classes.length===2?<div className="react-disk-toolbar"><span>Top: {ordered[0]} · Bottom: {ordered[1]}</span><button type="button" onClick={()=>setSwapped(value=>!value)}>Swap Positions</button></div>:null}
    {query.trim()?<div className="react-tree-search-results" aria-label="Matching unlocked talents">{matches.map(talent=><button type="button" key={talent.id} onClick={()=>{setTiers(old=>({...old,[talent.className]:talent.tier}));setFocus(old=>({...old,[talent.className]:talent.id}));onSelect({talent,rank:Math.max(1,talentRank(character,talent,canonical))});}}>{talent.name}<small>{talent.className} · Tier {DISK_TIERS[talent.tier-1]}</small></button>)}{!matches.length?<p>No matching talents in unlocked tiers.</p>:null}</div>:null}
    <div className={`react-talent-disks ${classes.length===2?'is-multiclass':''}`}>
      {ordered.map((className,i)=><TalentDisk key={`${character.id}:${className}`} className={className} catalog={canonical} character={character} selectedTier={tiers[className] || 1} orientation={classes.length===2 && i===0?'top':'bottom'} onTierChange={tier=>tierChange(className,tier)} onSelect={onSelect} focusedTalentId={focus[className]}/>)}
    </div>
    <p className="react-help react-tree-help">Rotate each class independently with its arrows or tier buttons. Select a talent or rank for details and purchases. Fog conceals tiers until their required level.</p>
  </>;
}
