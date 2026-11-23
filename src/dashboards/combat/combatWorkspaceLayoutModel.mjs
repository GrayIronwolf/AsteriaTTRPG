import {
  freeformOverlaps
} from '../../../src/state/workspaceFreeformModel.mjs';

/** Layout-only state: never includes encounter data, permissions or combat commands. */
export const COMBAT_PANEL_IDS=Object.freeze([
  'resources','controls','initiative','actor','setup','map','history',
  'queue','timer','waves','events','log','advanced','prepared'
]);
/** Sidebar categories are launchers; they do not create duplicate combat state. */
export const COMBAT_TOOL_CATEGORIES=Object.freeze([
  {id:'overview',label:'Combat Overview',panels:['resources','controls','initiative']},
  {id:'builder',label:'Encounter Builder',panels:['setup']},
  {id:'prepared',label:'Prepared Encounters',panels:['prepared']},
  {id:'live',label:'Live Combat',panels:['actor','queue','timer','waves','events','log','advanced']},
  {id:'maps',label:'Battle Maps',panels:['map']},
  {id:'rewards',label:'Rewards & History',panels:['history']}
]);
const DEFAULT_HIDDEN=Object.freeze([]); // All tools on new GM canvases.
const MAX_CANVAS_COORD=250000;
const CANVAS_INTERACTION_VERSION=2;
const MIN_CANVAS_SIZE=140;
const MAX_CANVAS_SIZE=1800;
const bounded=(n,min,max)=>Math.min(max,Math.max(min,n));
const whole=(value,fallback)=>Number.isFinite(value)?Math.round(value):fallback;
/** Combat-only unbounded-plane coordinates (tenths of a viewport-width percent).
 * Preserves older 0..1000 panel placements without altering Player/GM geometry. */
export function normalizeCombatCanvasRect(value={},fallback={x:0,y:0,w:490,h:300}){
 const candidate=value&&typeof value==='object'?value:{};
 const w=bounded(whole(candidate.w,fallback.w),MIN_CANVAS_SIZE,MAX_CANVAS_SIZE);
 const h=bounded(whole(candidate.h,fallback.h),120,2000);
 return {x:bounded(whole(candidate.x,fallback.x),-MAX_CANVAS_COORD,MAX_CANVAS_COORD),
  y:bounded(whole(candidate.y,fallback.y),-MAX_CANVAS_COORD,MAX_CANVAS_COORD),w,h};
}
export const COMBAT_CANVAS_GRID_DOT_SPACING=26;
export const COMBAT_CANVAS_INITIAL_COLUMNS=100;
export const COMBAT_CANVAS_INITIAL_ROWS=60;
export const COMBAT_CANVAS_REFERENCE_VISIBLE_ROWS=40;
export const COMBAT_CANVAS_ZOOM_MIN=.04;
export const COMBAT_CANVAS_ZOOM_MAX=2.5;
export function normalizeCombatCamera(raw){
 const camera=raw&&typeof raw==='object'?raw:{};
 return {scale:bounded(Number.isFinite(camera.scale)?camera.scale:1,
   COMBAT_CANVAS_ZOOM_MIN,COMBAT_CANVAS_ZOOM_MAX),
   x:bounded(Number.isFinite(camera.x)?camera.x:12,-1000000,1000000),
   y:bounded(Number.isFinite(camera.y)?camera.y:12,-1000000,1000000)};
}
export function zoomCombatCamera(camera,scale,pivot={x:0,y:0}){
 const prev=normalizeCombatCamera(camera);
 const next=bounded(Number.isFinite(scale)?scale:prev.scale,
   COMBAT_CANVAS_ZOOM_MIN,COMBAT_CANVAS_ZOOM_MAX);
 return normalizeCombatCamera({scale:next,
   x:pivot.x-(pivot.x-prev.x)*next/prev.scale,
   y:pivot.y-(pivot.y-prev.y)*next/prev.scale});
}
/**
 * One repeated CSS texture provides an infinite dot grid, in the same world
 * coordinates as the windows. Level-of-detail avoids aliasing at small zoom.
 * The 100 x 60 initial guide is not a hard movement boundary.
 */
export function combatCanvasGridStyle(camera){
 const view=normalizeCombatCamera(camera);
 const stride=view.scale<.18?8:view.scale<.3?4:view.scale<.45?2:1;
 const spacing=Math.round(COMBAT_CANVAS_GRID_DOT_SPACING*view.scale*stride*100)/100;
 return {
  '--combat-grid-spacing':spacing+'px',
  '--combat-grid-x':view.x+'px',
  '--combat-grid-y':view.y+60+'px',
  '--combat-grid-opacity':view.scale<.3?'.17':'.22'
 };
}
export function combatCanvasDetailLevel(camera,mode='adaptive'){
 const scale=normalizeCombatCamera(camera).scale;
 if(mode!=='adaptive')return 'full';
 return scale<.26?'preview':scale<.5?'compact':'full';
}
/** Frame the first row at 50%; persisted cameras remain untouched. */
export const COMBAT_CANVAS_OPENING_ZOOM=.5;
export function openingCombatCamera(layout,visibleIds=[],viewportWidth=0){
 const width=Number(viewportWidth);
 if(!Number.isFinite(width)||width<=0)
   return normalizeCombatCamera({scale:COMBAT_CANVAS_OPENING_ZOOM});
 const rectangles=visibleIds.map(id=>layout?.freeform?.positions?.[id]).filter(Boolean);
 if(!rectangles.length)
   return normalizeCombatCamera({scale:COMBAT_CANVAS_OPENING_ZOOM,x:24,y:24});
 const sorted=[...rectangles].sort((a,b)=>a.y-b.y||a.x-b.x),first=sorted[0];
 const row=sorted.filter(rect=>Math.abs(rect.y-first.y)<=30);
 let left=Math.min(...row.map(rect=>rect.x));
 let right=Math.max(...row.map(rect=>rect.x+rect.w));
 if(right-left>1350){left=first.x;right=first.x+first.w;}
 const scale=COMBAT_CANVAS_OPENING_ZOOM;
 const unit=width/1000*scale;
 return normalizeCombatCamera({scale,
   x:width/2-(left+right)/2*unit,
   y:20-first.y*unit});
}
/** Fit and focus change only the camera; window geometry never changes. */
export function combatWindowBounds(layout,visibleIds){
 const rects=visibleIds.map(id=>layout.freeform.positions[id]).filter(Boolean);
 if(!rects.length)return null;
 return {left:Math.min(...rects.map(rect=>rect.x)),
  top:Math.min(...rects.map(rect=>rect.y)),
  right:Math.max(...rects.map(rect=>rect.x+rect.w)),
  bottom:Math.max(...rects.map(rect=>rect.y+rect.h))};
}
export function fitCombatCamera(layout,visibleIds,viewportWidth,viewportHeight){
 const bounds=combatWindowBounds(layout,visibleIds);
 if(!bounds||!viewportWidth||!viewportHeight)return normalizeCombatCamera({});
 const pixels=viewportWidth/1000;
 const scale=bounded(Math.min((viewportWidth-56)/((bounds.right-bounds.left)*pixels),
   (viewportHeight-56)/((bounds.bottom-bounds.top)*pixels)),
   COMBAT_CANVAS_ZOOM_MIN,COMBAT_CANVAS_ZOOM_MAX);
 return normalizeCombatCamera({scale,
   x:(viewportWidth-(bounds.left+bounds.right)*pixels*scale)/2,
   y:(viewportHeight-(bounds.top+bounds.bottom)*pixels*scale)/2});
}
export function focusCombatCamera(layout,id,viewportWidth,viewportHeight){
 const rect=layout.freeform.positions[id];
 if(!rect||!viewportWidth||!viewportHeight)return normalizeCombatCamera({});
 const pixels=viewportWidth/1000;
 const usableWidth=Math.max(100,viewportWidth-80),usableHeight=Math.max(100,viewportHeight-80);
 const scale=bounded(Math.min(1.45,usableWidth/(rect.w*pixels),usableHeight/(rect.h*pixels)),
   COMBAT_CANVAS_ZOOM_MIN,COMBAT_CANVAS_ZOOM_MAX);
 return normalizeCombatCamera({scale,
  x:viewportWidth/2-(rect.x+rect.w/2)*pixels*scale,
  y:viewportHeight/2-(rect.y+rect.h/2)*pixels*scale});
}
/** Free panning; Fit All remains the explicit recovery control. */
export function clampCombatCamera(camera){
 return normalizeCombatCamera(camera);
}
/** Party card order is presentation-only; keep current campaign roster authoritative. */
export function orderedCombatPartyIds(ids=[],saved=[]){
 const available=[...new Set(ids.filter(id=>typeof id==='string'&&id))];
 const preferred=Array.isArray(saved)?saved:[];
 return [...preferred.filter(id=>available.includes(id)),...available.filter(id=>!preferred.includes(id))];
}
export function moveCombatPartyCard(ids=[],from='',to=''){
 const ordered=[...ids];
 const originalIndex=ordered.indexOf(from),targetIndex=ordered.indexOf(to);
 if(from===to||originalIndex<0||targetIndex<0)return ordered;
 ordered.splice(originalIndex,1);
 ordered.splice(targetIndex,0,from);
 return ordered;
}

const MIGRATED_NEW_HIDDEN=Object.freeze(['advanced','waves','events','log']);
/** One-click views reuse the same panels and Firebase listeners; only visibility changes. */
export const COMBAT_WORKSPACE_MODES=Object.freeze([
  {id:'preparation',label:'Encounter Preparation',panels:Object.freeze([
    'controls','initiative','setup','map','prepared','waves','events'])},
  {id:'live',label:'Live Combat',panels:Object.freeze([
    'controls','initiative','actor','map','queue','timer','waves','events','log','advanced'])},
  {id:'completion',label:'Encounter Completion',panels:Object.freeze([
    'controls','initiative','actor','history','log','prepared'])}
]);

export const COMBAT_PANEL_LABELS=Object.freeze({
  resources:'GM Player Resources',
  controls:'Encounter Controls',
  initiative:'Initiative & Turn Order',
  actor:'Combatant Actions & Resources',
  setup:'Encounter Setup',
  map:'Battle Map & Player Display',
  history:'Encounter Completion & History',
  queue:'GM Action Queue',
  timer:'Turn Timer',
  waves:'Reinforcement Waves',
  events:'Planned Events',
  log:'Combat Event History',
  advanced:'Advanced Adjudication & Conditions',
  prepared:'Prepared Encounter Library & Builder'
});
export const COMBAT_WORKSPACE_PRESET_LIMIT=8;
const DEFAULT_POSITIONS=Object.freeze({
  resources:{x:0,y:0,w:490,h:670},
  controls:{x:510,y:0,w:490,h:180},
  initiative:{x:510,y:190,w:490,h:420},
  actor:{x:510,y:620,w:490,h:480},
  setup:{x:0,y:1250,w:490,h:430},
  map:{x:0,y:680,w:490,h:300},
  history:{x:510,y:3110,w:490,h:450},
  queue:{x:510,y:1110,w:490,h:430},
  timer:{x:0,y:990,w:490,h:250},
  waves:{x:510,y:2160,w:490,h:430},
  events:{x:0,y:1690,w:490,h:430},
  log:{x:0,y:2130,w:490,h:280},
  advanced:{x:510,y:2600,w:490,h:500},
  prepared:{x:510,y:1550,w:490,h:600}
});
const COMBAT_CANVAS_CONFIG=Object.freeze({
  ids:COMBAT_PANEL_IDS,defaultPositions:DEFAULT_POSITIONS,defaultHidden:DEFAULT_HIDDEN,
  kind:'combat'
});
const scopeOf=config=>Array.isArray(config?.ids)?config:COMBAT_CANVAS_CONFIG;
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const allowed=(id,config)=>scopeOf(config).ids.includes(id);
const unique=(values,config)=>[...new Set(Array.isArray(values)?
  values.filter(id=>allowed(id,config)):[])];
const nameOf=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,48):'';

function normaliseBase(raw,config=COMBAT_CANVAS_CONFIG){
  const scope=scopeOf(config);
  const source=isRecord(raw)?raw:{},input=isRecord(source.freeform)?source.freeform:{};
  const entries=isRecord(input.positions)?input.positions:{};
  // v1 stored collision protection and snapping as implicit defaults, even when
  // the GM had not selected them. Migrate those layouts to true freeform once.
  const configured=Number(input.interactionVersion)>=CANVAS_INTERACTION_VERSION;
  const isLegacy=scope.kind==='combat'&&Object.keys(entries).length>0&&
    !Object.hasOwn(entries,'queue');
  const priorBottom=isLegacy?Math.max(...Object.values(entries).map(
    rect=>Number(rect?.y||0)+Number(rect?.h||0)),0):0;
  const appended=Object.freeze({
    queue:{x:0,y:priorBottom+30,w:490,h:430},
    timer:{x:510,y:priorBottom+30,w:490,h:250},
    prepared:{x:510,y:priorBottom+290,w:490,h:600},
    advanced:{x:0,y:priorBottom+470,w:490,h:500},
    waves:{x:0,y:priorBottom+980,w:490,h:400},
    events:{x:510,y:priorBottom+900,w:490,h:400},
    log:{x:510,y:priorBottom+1310,w:490,h:280}
  });
  const positions=Object.fromEntries(scope.ids.map(id=>[
    id,normalizeCombatCanvasRect(entries[id],
      scope.kind==='combat'&&id==='resources'&&Object.keys(entries).length&&
        !Object.hasOwn(entries,'resources')?{x:1020,y:0,w:510,h:670}:
      isLegacy&&appended[id]?appended[id]:
      scope.defaultPositions?.[id]||{x:0,y:0,w:490,h:300})
  ]));
  const contentScale=Object.fromEntries(
    Object.entries(isRecord(source.contentScale)?source.contentScale:{})
      .filter(([id,value])=>allowed(id,scope)&&Number.isFinite(value))
      .map(([id,value])=>[id,bounded(Math.round(value*100)/100,.85,1.6)])
  );
  const groups=[];
  for(const group of Array.isArray(source.groups)?source.groups:[]){
    const ids=unique(group,scope).filter(id=>!groups.some(row=>row.includes(id)));
    if(ids.length>=2)groups.push(ids);
    if(groups.length===2)break;
  }
  return {
    freeform:{enabled:true,snap:configured&&input.snap===true,
      allowOverlap:configured?input.allowOverlap!==false:true,
      interactionVersion:CANVAS_INTERACTION_VERSION,positions},
    hidden:unique(source.hidden??scope.defaultHidden??DEFAULT_HIDDEN,scope).concat(
      isLegacy?MIGRATED_NEW_HIDDEN.filter(id=>!unique(source.hidden,scope).includes(id)):[]
    ),
    locked:unique(source.locked,scope),
    minimized:unique(source.minimized,scope),
    contentScale,
    partyCardOrder:[...new Set((Array.isArray(source.partyCardOrder)?source.partyCardOrder:[])
      .filter(id=>typeof id==='string'&&id.length>0&&id.length<=180))].slice(0,200),
    groups,
    gridVisible:source.gridVisible!==false,
    detailMode:source.detailMode==='proportional'?'proportional':'adaptive',
    canvasLocked:source.canvasLocked===true
  };
}
export function defaultCombatWorkspaceLayout(config=COMBAT_CANVAS_CONFIG){
  return {...normaliseBase({},config),savedWorkspaces:[]};
}
export function normalizeCombatWorkspace(raw,config=COMBAT_CANVAS_CONFIG){
  const source=isRecord(raw)?raw:{},base=normaliseBase(source,config);
  const seenIds=new Set(),seenNames=new Set(),savedWorkspaces=[];
  for(const item of Array.isArray(source.savedWorkspaces)?source.savedWorkspaces:[]){
    if(!isRecord(item)||typeof item.id!=='string'||!/^layout-[A-Za-z0-9_-]{1,90}$/.test(item.id))continue;
    const name=nameOf(item.name),key=name.toLowerCase();
    if(!name||seenIds.has(item.id)||seenNames.has(key))continue;
    seenIds.add(item.id);seenNames.add(key);
    savedWorkspaces.push({id:item.id,name,layout:normaliseBase(item.layout,config)});
    if(savedWorkspaces.length>=COMBAT_WORKSPACE_PRESET_LIMIT)break;
  }
  return {...base,savedWorkspaces};
}
export function combatWorkspaceStorageKey(uid,campaignId){
  const good=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(value);
  return good(uid)&&good(campaignId)
    ?'asteria:gm-combat-workspace:v1:'+uid+':'+campaignId:null;
}
/** Atomic freeform move/resize with bounds, optional snapping and collision safety.
 * Unlike the shared dashboard grid, x and y may extend beyond the visible viewport. */
export function editCombatWindow(layout,id,operation,values={},config=COMBAT_CANVAS_CONFIG){
 if(!allowed(id,config)||layout.canvasLocked||layout.locked.includes(id)||
    layout.hidden.includes(id)||!['move','resize'].includes(operation))return layout;
 const state=layout.freeform,before=state.positions[id];
 if(!before)return layout;
 const step=n=>state.snap===true?Math.round(n/10)*10:n;
 const group=operation==='move'?layout.groups.find(row=>row.includes(id)):null;
 const wanted=operation==='move'?
   {...before,x:step(Number.isFinite(values.x)?values.x:before.x),
     y:step(Number.isFinite(values.y)?values.y:before.y)}:
   {...before,...Object.fromEntries(['x','y','w','h']
     .filter(key=>Number.isFinite(values[key])).map(key=>[key,step(values[key])]))};
 const next=normalizeCombatCanvasRect(wanted,before);
 if(JSON.stringify(next)===JSON.stringify(before))return layout;
 const positions={...state.positions};
 if(group){
   const dx=next.x-before.x,dy=next.y-before.y;
   for(const member of group){
     if(layout.locked.includes(member)||layout.hidden.includes(member))return layout;
     const current=positions[member],candidate=normalizeCombatCanvasRect(
       {...current,x:current.x+dx,y:current.y+dy},current);
     if(candidate.x!==current.x+dx||candidate.y!==current.y+dy)return layout;
     positions[member]=candidate;
   }
 }else positions[id]=next;
 // Only compare moved rectangles with stationary visible windows.
 // Previously this scanned all pairs on every pointer update and needlessly
 // blocked movement when unrelated saved windows already intersected.
 if(!state.allowOverlap){
   const affected=group||[id];
   for(const panel of affected){
     if(layout.hidden.includes(panel))continue;
     for(const [other,rect] of Object.entries(positions)){
       if(affected.includes(other)||layout.hidden.includes(other))continue;
       if(freeformOverlaps(positions[panel],rect))return layout;
     }
   }
 }
 return {...layout,freeform:{...state,positions}};
}

export function dockCombatWindow(layout,id,edge,config=COMBAT_CANVAS_CONFIG){
  if(!allowed(id,config)||!['left','right'].includes(edge)||layout.canvasLocked||layout.locked.includes(id))return layout;
  const rect=layout.freeform.positions[id];
  const proposed={...rect,x:edge==='left'?0:1000-rect.w,y:0};
  const state=layout.freeform;
  if(!state.allowOverlap&&scopeOf(config).ids.some(other=>
    other!==id&&!layout.hidden.includes(other)&&
    freeformOverlaps(proposed,state.positions[other])))return layout;
  return {...layout,freeform:{...state,positions:{...state.positions,[id]:proposed}}};
}
export function setCombatGroup(layout,id,withId='',config=COMBAT_CANVAS_CONFIG){
  if(!allowed(id,config))return layout;
  const groups=layout.groups.filter(row=>!row.includes(id))
    .map(row=>row.filter(other=>other!==withId)).filter(row=>row.length>=2);
  if(allowed(withId,config)&&withId!==id&&!layout.hidden.includes(id)&&
    !layout.hidden.includes(withId)&&!layout.locked.includes(id)&&
    !layout.locked.includes(withId))groups.push([id,withId]);
  return {...layout,groups:groups.slice(0,2)};
}
export function saveCombatPreset(layout,name,id){
  const clean=nameOf(name);
  if(!clean||typeof id!=='string'||!/^layout-[A-Za-z0-9_-]{1,90}$/.test(id)||
    layout.savedWorkspaces.length>=COMBAT_WORKSPACE_PRESET_LIMIT||
    layout.savedWorkspaces.some(item=>item.name.toLowerCase()===clean.toLowerCase()||
      item.id===id))return layout;
  return {...layout,savedWorkspaces:[...layout.savedWorkspaces,{
    id,name:clean,layout:normaliseBase(layout)
  }]};
}
export function applyCombatPreset(layout,id){
  const found=layout.savedWorkspaces.find(item=>item.id===id);
  return found?{...normaliseBase(found.layout),savedWorkspaces:layout.savedWorkspaces}:layout;
}
export function removeCombatPreset(layout,id){
  return {...layout,savedWorkspaces:layout.savedWorkspaces.filter(item=>item.id!==id)};
}
export function arrangeCombatWorkspace(layout){
  return {...layout,freeform:{...layout.freeform,
    positions:Object.fromEntries(COMBAT_PANEL_IDS.map(id=>[id,{...DEFAULT_POSITIONS[id]}]))
  },hidden:layout.hidden,minimized:[],groups:[]};
}

/** Preserve named saved layouts while resetting only the active workspace view. */
export function resetCombatWorkspace(layout){
  return {...defaultCombatWorkspaceLayout(),savedWorkspaces:layout?.savedWorkspaces||[]};
}
/** Quick layouts are reversible layout-only changes, never combat commands. */
export function applyCombatWorkspaceMode(layout,modeId){
  const mode=COMBAT_WORKSPACE_MODES.find(row=>row.id===modeId);
  if(!mode)return layout;
  const arranged=arrangeCombatWorkspace(layout);
  return {...arranged,
    hidden:COMBAT_PANEL_IDS.filter(id=>!mode.panels.includes(id)),
    locked:[],minimized:[],groups:[]};
}
