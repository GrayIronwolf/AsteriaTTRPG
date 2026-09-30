import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fitGraphCamera, graphBounds, graphEdgePath, talentGraph, TIER_LABELS, zoomGraphCamera } from '../state/talentGraph.mjs';
import { talentRank, prerequisiteProblem, rankDefined } from '../state/talentModel.mjs';
import { TALENT_TIER_LEVELS, talentTierUnlocked, talentRankCost } from '../state/liveWorkspaceModel.mjs';

const nodeStyle = node => ({left:node.x-node.radius,top:node.y-node.radius,width:node.radius*2,height:node.radius*2});
const midpoint = points => ({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2});
const distance = points => Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);

export function TalentGraph({catalog,character,query='',onSelect}) {
  const frame=useRef(null),pointers=useRef(new Map()),gesture=useRef(null),blockClick=useRef(false);
  const [viewport,setViewport]=useState({width:700,height:650}),[camera,setCamera]=useState({x:0,y:0,scale:1});
  const cameraRef=useRef(camera),[activeClass,setActiveClass]=useState(catalog[0]?.className || ''),[hoveredNode,setHovered]=useState(null);
  const compact=viewport.width<640,graph=useMemo(()=>talentGraph(catalog,compact),[catalog,compact]);
  const markerId=useId(),layoutKey=catalog.map(t=>t.id).join('|');
  const moveCamera=next=>{cameraRef.current=next;setCamera(next);};
  const focusClass=name=>{
    const node=graph.classNodes.find(n=>n.className===name);
    if(!node)return;
    setActiveClass(name);setHovered(null);
    if(compact) {
      const scale=Math.min(1,viewport.width/350);
      moveCamera({scale,x:(viewport.width-350*scale)/2,y:24-(node.y-node.radius)*scale});
    } else moveCamera(fitGraphCamera(node.bounds,viewport));
  };
  const focusTier=(tier,className=activeClass)=>{
    const node=graph.tierNodes.find(n=>n.className===className && n.tier===Number(tier));
    if(!node)return;
    setActiveClass(className);setHovered(node);
    if(compact) {
      const scale=Math.min(1,viewport.width/350);
      moveCamera({scale,x:(viewport.width-350*scale)/2,y:24-(node.y-node.radius)*scale});
    } else moveCamera(fitGraphCamera(node.bounds,viewport));
  };
  const focusTalent=node=>{
    setActiveClass(node.className);setHovered(node);
    moveCamera(fitGraphCamera(graphBounds([node,...node.ranks],24),viewport,1.25));
  };
  const fitAll=()=>{setHovered(null);moveCamera(fitGraphCamera({x:0,y:0,width:graph.width,height:graph.height},viewport));};
  const zoom=scale=>moveCamera(zoomGraphCamera(cameraRef.current,scale,{x:viewport.width/2,y:viewport.height/2}));
  useEffect(()=>{
    const observer=new ResizeObserver(entries=>setViewport({width:entries[0].contentRect.width,height:entries[0].contentRect.height}));
    observer.observe(frame.current);return()=>observer.disconnect();
  },[]);
  // Purchasing changes rank state without resetting the user's position.
  useEffect(()=>{focusClass(graph.classes.includes(activeClass)?activeClass:graph.classes[0]);},[layoutKey,compact,viewport.width,viewport.height,character.id]);
  useEffect(()=>{
    const element=frame.current;
    const wheel=event=>{
      if(!event.ctrlKey && !event.metaKey)return;
      event.preventDefault();
      const rect=element.getBoundingClientRect(),old=cameraRef.current;
      moveCamera(zoomGraphCamera(old,old.scale*Math.exp(-event.deltaY*.008),{x:event.clientX-rect.left,y:event.clientY-rect.top}));
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return()=>element.removeEventListener('wheel',wheel);
  },[]);
  const states=useMemo(()=>new Map(catalog.map(talent=>[talent.id,{learned:talentRank(character,talent,catalog),problem:prerequisiteProblem(character,talent,catalog)}])),[catalog,character]);
  // A character switch renders before the camera-reset effect. Do not read a
  // previous character's hovered talent from the new catalog during that render.
  const hovered=hoveredNode && graph.classes.includes(hoveredNode.className) && (!hoveredNode.talent || states.has(hoveredNode.talent.id))?hoveredNode:null;
  const rankState=(talent,rank)=>{
    const {learned,problem}=states.get(talent.id),cost=talentRankCost(rank,talent.tier);
    if(rank<=learned)return {state:'learned',label:'purchased',reason:`${cost} TP · Purchased`};
    const reason=!talentTierUnlocked(character.level,talent.tier)?`Unlocks at Level ${TALENT_TIER_LEVELS[talent.tier]}`:
      problem || (rank!==learned+1?'Learn the earlier ranks first':!rankDefined(talent,rank)?'This rank has not been written yet':Number(character.tp || 0)<cost?`Requires ${cost} TP`:'');
    return {state:reason?'locked':'available',label:reason?'locked':'available',reason:reason || `${cost} TP · Available to learn`};
  };
  const matches=graph.nodes.filter(n=>`${n.talent.name} ${n.className}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pointerPosition=event=>{const rect=frame.current.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};};
  const startGesture=()=>{
    const points=[...pointers.current.values()];
    gesture.current=points.length>1?{camera:cameraRef.current,center:midpoint(points),distance:distance(points)}:{camera:cameraRef.current,origin:points[0]};
  };
  const pointerDown=event=>{
    if(event.pointerType==='mouse' && event.button!==0)return;
    if(!pointers.current.size)blockClick.current=false;
    pointers.current.set(event.pointerId,pointerPosition(event));startGesture();
    if(pointers.current.size>1) {
      blockClick.current=true;
      for(const id of pointers.current.keys())event.currentTarget.setPointerCapture(id);
    }
  };
  const pointerMove=event=>{
    if(!pointers.current.has(event.pointerId))return;
    pointers.current.set(event.pointerId,pointerPosition(event));
    const points=[...pointers.current.values()],start=gesture.current;
    if(points.length>1 && start.distance) {
      const center=midpoint(points),next=zoomGraphCamera(start.camera,start.camera.scale*distance(points)/start.distance,start.center);
      moveCamera({...next,x:next.x+center.x-start.center.x,y:next.y+center.y-start.center.y});
    } else if(start.origin) {
      const dx=points[0].x-start.origin.x,dy=points[0].y-start.origin.y;
      if(Math.hypot(dx,dy)>5) {blockClick.current=true;event.currentTarget.setPointerCapture(event.pointerId);}
      if(blockClick.current)moveCamera({...start.camera,x:start.camera.x+dx,y:start.camera.y+dy});
    }
  };
  const pointerEnd=event=>{pointers.current.delete(event.pointerId);if(pointers.current.size)startGesture();else gesture.current=null;};
  const revealFocus=(event,node)=>{
    setHovered(node);
    if(!event.target.matches(':focus-visible'))return;
    const current=cameraRef.current,x=node.x*current.scale+current.x,y=node.y*current.scale+current.y;
    if(x<40 || y<40 || x>viewport.width-40 || y>viewport.height-40 || current.scale<.65) {
      const scale=Math.max(.85,current.scale);
      moveCamera({scale,x:viewport.width/2-node.x*scale,y:viewport.height/2-node.y*scale});
    }
  };
  const interactive=node=>({style:nodeStyle(node),'data-node-id':node.id,onPointerEnter:()=>setHovered(node),onFocus:event=>revealFocus(event,node)});
  const context=hovered?.talent?`${hovered.talent.name}${hovered.rank?` · Rank ${TIER_LABELS[hovered.rank-1]}`:''}`:hovered?.tier?`Tier ${TIER_LABELS[hovered.tier-1]}`:'Class constellation';
  return <>
    <div className="react-tree-controls" aria-label="Talent tree navigation">
      <div className="react-tree-zoom"><button type="button" onClick={()=>zoom(cameraRef.current.scale/1.25)} aria-label="Zoom out">−</button><output aria-label="Graph zoom">{Math.round(camera.scale*100)}%</output><button type="button" onClick={()=>zoom(cameraRef.current.scale*1.25)} aria-label="Zoom in">+</button></div>
      <button type="button" onClick={fitAll}>Fit to view</button><button type="button" onClick={()=>focusClass(activeClass)}>Reset view</button>
      <label>Class<select aria-label="Jump to class" value={activeClass} onChange={e=>focusClass(e.target.value)}>{graph.classes.map(name=><option key={name}>{name}</option>)}</select></label>
      <label>Tier<select aria-label="Jump to tier" value="" onChange={e=>focusTier(e.target.value)}><option value="">Choose tier</option>{graph.tiers.map(t=><option key={t.tier} value={t.tier}>Tier {t.label}</option>)}</select></label>
    </div>
    {query.trim()?<div className="react-tree-search-results" aria-label="Matching talents">{matches.map(n=><button type="button" key={n.id} onClick={()=>focusTalent(n)}>{n.talent.name}<small>{n.className} · Tier {TIER_LABELS[n.tier-1]}</small></button>)}{!matches.length?<p>No matching talents.</p>:null}</div>:null}
    <div className="react-tree-context"><div><small>{hovered?.className || activeClass}</small><strong>{context}</strong></div><span>{hovered?.rank?rankState(hovered.talent,hovered.rank).reason:hovered?.talent?`${states.get(hovered.talent.id).learned} / ${hovered.talent.maxRank} ranks learned`:'Class → Tier → Talent → Ranks'}</span></div>
    <div className={`react-unified-tree ${compact?'compact':''}`} ref={frame} tabIndex={0} role="region" aria-label="Character talent tree, all classes and tiers"
      onKeyDown={event=>{
        if(event.target!==event.currentTarget)return;
        const movement={ArrowDown:[0,-80],ArrowUp:[0,80],ArrowLeft:[80,0],ArrowRight:[-80,0]}[event.key];
        if(movement){event.preventDefault();const c=cameraRef.current;moveCamera({...c,x:c.x+movement[0],y:c.y+movement[1]});}
        else if(['+','=','-','Home'].includes(event.key)){event.preventDefault();if(event.key==='Home')focusClass(activeClass);else zoom(cameraRef.current.scale*(event.key==='-'?.8:1.25));}
      }}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
      onClickCapture={event=>{if(blockClick.current){event.preventDefault();event.stopPropagation();blockClick.current=false;}}}>
      <div className="react-unified-tree-canvas" style={{width:graph.width,height:graph.height,transform:`translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`}}>
        <svg className="react-tree-edges" width={graph.width} height={graph.height} aria-hidden="true">
          <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>
          {!compact?graph.classNodes.map(node=><g className="react-tree-orbits" key={node.id}><circle cx={node.x} cy={node.y} r="200"/><circle cx={node.x} cy={node.y} r="400"/><circle cx={node.x} cy={node.y} r="650"/></g>):null}
          {graph.edges.map(edge=>{
            const learned=edge.kind==='rank'?rankState(edge.talent,edge.to.rank).state:edge.kind==='prerequisite' && states.get(edge.from.talent.id).learned>=edge.rank?'learned':'';
            const related=hovered?.talent && (edge.from.talent?.id===hovered.talent.id || edge.to.talent?.id===hovered.talent.id);
            return <path key={`${edge.kind}:${edge.from.id}:${edge.to.id}`} className={`react-tree-edge ${edge.kind} state-${learned} ${related?'highlighted':''}`} d={graphEdgePath(edge)} markerEnd={edge.kind==='prerequisite'?`url(#${markerId})`:undefined}/>;
          })}
        </svg>
        {graph.classNodes.map(node=><button type="button" className="react-graph-node class-node" key={node.id} {...interactive(node)} aria-label={`${node.className} class, ${node.count} talents. Focus class`} onClick={()=>focusClass(node.className)}><span className="react-graph-sigil" aria-hidden="true">✧</span><small>CLASS</small><strong>{node.className}</strong><span>{node.count} talents · 5 tiers</span></button>)}
        {graph.tierNodes.map(node=><button type="button" className={`react-graph-node tier-node ${talentTierUnlocked(character.level,node.tier)?'state-unlocked':'state-locked'}`} key={node.id} {...interactive(node)} aria-label={`${node.className}, Tier ${node.tier}, ${node.count} talents. Focus tier`} onClick={()=>focusTier(node.tier,node.className)}><small>TIER</small><strong>{TIER_LABELS[node.tier-1]}</strong><span>{talentTierUnlocked(character.level,node.tier)?`${node.count} talents`:`Level ${TALENT_TIER_LEVELS[node.tier]}`}</span>{!node.count?<small>Not yet written</small>:null}</button>)}
        {graph.nodes.map(node=>{
          const {talent}=node,learned=states.get(talent.id).learned,dimmed=query.trim()&&!matches.includes(node);
          return <div className={`react-tree-talent-group ${dimmed?'dimmed':''}`} key={node.id}>
            <button type="button" className={`react-graph-node talent-node state-${learned?'learned':rankState(talent,1).state}`} {...interactive(node)} aria-label={`${talent.className}, ${talent.name}, ${learned} of ${talent.maxRank} ranks learned. Open talent`} onClick={()=>onSelect({talent,rank:Math.max(1,learned)})}><strong>{talent.name}</strong><small>{learned}/{talent.maxRank}</small></button>
            <div className="react-tree-ranks" role="group" aria-label={`${talent.className}, ${talent.name} ranks`}>{node.ranks.map(rankNode=>{
              const status=rankState(talent,rankNode.rank);
              return <button type="button" key={rankNode.id} className={`react-graph-node rank-node state-${status.state}`} {...interactive(rankNode)} title={`${talent.name} · Rank ${rankNode.rank} · ${status.reason}`} aria-label={`${talent.className}, ${talent.name}, Rank ${rankNode.rank}, ${status.label}`} onClick={()=>onSelect({talent,rank:rankNode.rank})}><span>{TIER_LABELS[rankNode.rank-1]}</span>{status.state==='learned'?<small aria-hidden="true">✓</small>:null}</button>;
            })}</div>
          </div>;
        })}
      </div>
    </div>
    <p className="react-help react-tree-help">Select a class or tier bubble to focus its branch. Select a talent or rank for details. Drag to pan; pinch, use + / −, or Ctrl + scroll to zoom. Keyboard: Tab to nodes, arrows to pan, Home to reset.</p>
  </>;
}
