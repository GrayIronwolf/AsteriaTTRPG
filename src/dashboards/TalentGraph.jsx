import React, { useEffect, useMemo, useRef, useState } from 'react';
import { talentGraph } from '../state/talentGraph.mjs';
import { talentRank, prerequisiteProblem, rankDefined } from '../state/talentModel.mjs';
import { TALENT_TIER_LEVELS, talentTierUnlocked, talentRankCost } from '../state/liveWorkspaceModel.mjs';

function zoomCamera(camera,scale,width) {
  const next=Math.min(2.5,Math.max(.08,scale)),ratio=next/camera.scale;
  return {x:width/2-(width/2-camera.x)*ratio,y:200-(200-camera.y)*ratio,scale:next};
}

export function TalentGraph({catalog,character,query,onSelect}) {
  const frame=useRef(null),drag=useRef(null),[width,setWidth]=useState(700),[camera,setCamera]=useState({x:0,y:0,scale:1});
  const graph=useMemo(()=>talentGraph(catalog,width<700),[catalog,width<700]);
  useEffect(()=>{const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));observer.observe(frame.current);return()=>observer.disconnect();},[]);
  useEffect(()=>setCamera({x:0,y:0,scale:Math.min(1,width/graph.width)}),[graph.width,width]);
  const zoom=scale=>setCamera(old=>zoomCamera(old,scale,width));
  useEffect(()=>{
    const element=frame.current;
    const wheel=event=>{if(event.ctrlKey || event.metaKey){event.preventDefault();setCamera(old=>zoomCamera(old,old.scale*(event.deltaY<0?1.12:.89),width));}};
    element.addEventListener('wheel',wheel,{passive:false});
    return()=>element.removeEventListener('wheel',wheel);
  },[width]);
  const jump=(x,y)=>setCamera({x:-x*Math.min(1,width/350),y:24-y*Math.min(1,width/350),scale:Math.min(1,width/350)});
  const matches=graph.nodes.filter(n=>n.talent.name.toLowerCase().includes(query.toLowerCase()));
  return <>
    <div className="react-tree-controls" aria-label="Talent tree navigation">
      <button type="button" onClick={()=>zoom(camera.scale/1.25)} aria-label="Zoom out">−</button><output>{Math.round(camera.scale*100)}%</output><button type="button" onClick={()=>zoom(camera.scale*1.25)} aria-label="Zoom in">+</button>
      <button type="button" onClick={()=>setCamera({x:0,y:0,scale:Math.min(width/graph.width,(frame.current?.clientHeight || 600)/graph.height)})}>Fit to view</button>
      <button type="button" onClick={()=>jump(0,0)}>Reset view</button>
      <label>Jump to tier<select value="" onChange={e=>jump(0,graph.tiers.find(t=>t.tier===Number(e.target.value)).y)}><option value="">Choose tier</option>{graph.tiers.map(t=><option key={t.tier} value={t.tier}>Tier {t.tier}</option>)}</select></label>
      <label>Jump to class<select value="" onChange={e=>{const h=graph.headings.find(h=>h.className===e.target.value);jump(h.x,h.y);}}><option value="">Choose class</option>{graph.classes.map(c=><option key={c}>{c}</option>)}</select></label>
    </div>
    {query?<div className="react-tree-search-results">{matches.map(n=><button key={n.talent.id} onClick={()=>jump(n.x,n.y)}>{n.talent.name} · {n.talent.className}</button>)}{!matches.length?<p>No matching talents.</p>:null}</div>:null}
    <p className="react-help">Drag the background to pan. Use zoom controls or Ctrl + scroll. Arrow keys move the view. Select a rank to inspect or purchase it.</p>
    <div className="react-unified-tree" ref={frame} tabIndex={0} role="region" aria-label="Character talent tree, all classes and tiers"
      onKeyDown={e=>{if(e.target!==e.currentTarget)return;const movement={ArrowDown:[0,-80],ArrowUp:[0,80],ArrowLeft:[80,0],ArrowRight:[-80,0]}[e.key];if(movement){e.preventDefault();setCamera(c=>({...c,x:c.x+movement[0],y:c.y+movement[1]}));}}}
      onPointerDown={e=>{if(e.target.closest('button,select'))return;drag.current={x:e.clientX,y:e.clientY,camera};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{if(drag.current)setCamera({...drag.current.camera,x:drag.current.camera.x+e.clientX-drag.current.x,y:drag.current.camera.y+e.clientY-drag.current.y});}}
      onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
      <div className="react-unified-tree-canvas" style={{width:graph.width,height:graph.height,transform:`translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`}}>
        <svg className="react-tree-edges" width={graph.width} height={graph.height} aria-hidden="true">{graph.edges.map(({from,to})=><path key={to.talent.id} d={`M ${from.x+from.width-8} ${from.y+from.height/2} C ${from.x+from.width+22} ${from.y+from.height/2}, ${to.x+to.width+22} ${to.y+to.height/2}, ${to.x+to.width-8} ${to.y+to.height/2}`}/>)}</svg>
        {graph.tiers.map(t=><h3 className="react-tree-tier" key={t.tier} style={{top:t.y,width:graph.width}}>Tier {t.tier} <small>{talentTierUnlocked(character.level,t.tier)?'Unlocked':`Level ${TALENT_TIER_LEVELS[t.tier]}`}</small></h3>)}
        {graph.headings.map(h=><h4 className="react-tree-class" key={`${h.className}-${h.tier}`} style={{left:h.x+14,top:h.y}}>{h.className}</h4>)}
        {graph.nodes.map(({talent,x,y,width:cardWidth})=>{const learned=talentRank(character,talent,catalog),problem=prerequisiteProblem(character,talent,catalog);return <article key={talent.id} className={`react-tree-talent ${query&&!talent.name.toLowerCase().includes(query.toLowerCase())?'dimmed':''}`} style={{left:x,top:y,width:cardWidth}}>
          <button type="button" className="react-tree-name" onClick={()=>onSelect({talent,rank:Math.max(1,learned)})}><b>{talent.name}</b><small>{talent.type} · {learned}/{talent.maxRank} ranks</small></button>
          <div className="react-tree-ranks">{Array.from({length:talent.maxRank},(_,i)=>i+1).map(rank=>{const available=rank===learned+1 && !problem && talentTierUnlocked(character.level,talent.tier) && rankDefined(talent,rank) && Number(character.tp || 0)>=talentRankCost(rank,talent.tier);return <button type="button" className={`react-talent-node ${rank<=learned?'learned':available?'available':'unlearned'}`} key={rank} title={problem || `${talentRankCost(rank,talent.tier)} TP`} aria-label={`${talent.className}, ${talent.name}, Rank ${rank}, ${rank<=learned?'purchased':available?'available':'locked'}`} onClick={()=>onSelect({talent,rank})}>{rank<=learned?'✓':rank}</button>;})}</div>
        </article>;})}
      </div>
    </div>
  </>;
}
