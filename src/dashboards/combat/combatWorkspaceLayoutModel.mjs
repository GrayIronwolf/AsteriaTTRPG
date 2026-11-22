import {
  editFreeformWorkspace,freeformOverlaps,normalizeFreeformRect
} from '../../../src/state/workspaceFreeformModel.mjs';

/** Layout-only state: never includes encounter data, permissions or combat commands. */
export const COMBAT_PANEL_IDS=Object.freeze([
  'controls','initiative','actor','setup','map','history',
  'queue','timer','waves','events','log','advanced','prepared'
]);
/** Sidebar categories are launchers; they do not create duplicate combat state. */
export const COMBAT_TOOL_CATEGORIES=Object.freeze([
  {id:'overview',label:'Combat Overview',panels:['controls','initiative']},
  {id:'builder',label:'Encounter Builder',panels:['setup']},
  {id:'prepared',label:'Prepared Encounters',panels:['prepared']},
  {id:'live',label:'Live Combat',panels:['actor','queue','timer','waves','events','log','advanced']},
  {id:'maps',label:'Battle Maps',panels:['map']},
  {id:'rewards',label:'Rewards & History',panels:['history']}
]);
const DEFAULT_HIDDEN=Object.freeze(['setup','history','advanced','waves','events','log']);
const MIGRATED_NEW_HIDDEN=Object.freeze(['advanced','waves','events','log']);
export const COMBAT_PANEL_LABELS=Object.freeze({
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
  controls:{x:0,y:0,w:490,h:180},
  initiative:{x:0,y:190,w:490,h:420},
  actor:{x:510,y:0,w:490,h:480},
  setup:{x:0,y:1540,w:490,h:430},
  map:{x:0,y:620,w:490,h:300},
  history:{x:510,y:2490,w:490,h:450},
  queue:{x:510,y:490,w:490,h:430},
  timer:{x:0,y:930,w:490,h:250},
  waves:{x:510,y:1540,w:490,h:430},
  events:{x:0,y:1980,w:490,h:430},
  log:{x:0,y:2420,w:490,h:280},
  advanced:{x:510,y:1980,w:490,h:500},
  prepared:{x:510,y:930,w:490,h:600}
});
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const allowed=id=>COMBAT_PANEL_IDS.includes(id);
const unique=values=>[...new Set(Array.isArray(values)?values.filter(allowed):[])];
const nameOf=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,48):'';

function normaliseBase(raw){
  const source=isRecord(raw)?raw:{},input=isRecord(source.freeform)?source.freeform:{};
  const entries=isRecord(input.positions)?input.positions:{};
  const isLegacy=Object.keys(entries).length>0&&!Object.hasOwn(entries,'queue');
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
  const positions=Object.fromEntries(COMBAT_PANEL_IDS.map(id=>[
    id,normalizeFreeformRect(entries[id],isLegacy&&appended[id]?
      appended[id]:DEFAULT_POSITIONS[id])
  ]));
  const groups=[];
  for(const group of Array.isArray(source.groups)?source.groups:[]){
    const ids=unique(group).filter(id=>!groups.some(row=>row.includes(id)));
    if(ids.length>=2)groups.push(ids);
    if(groups.length===2)break;
  }
  return {
    freeform:{enabled:true,snap:input.snap!==false,allowOverlap:input.allowOverlap===true,positions},
    hidden:unique(source.hidden??DEFAULT_HIDDEN).concat(
      isLegacy?MIGRATED_NEW_HIDDEN.filter(id=>!unique(source.hidden).includes(id)):[]
    ),
    locked:unique(source.locked),
    minimized:unique(source.minimized),
    groups
  };
}
export function defaultCombatWorkspaceLayout(){
  return {...normaliseBase({}),savedWorkspaces:[]};
}
export function normalizeCombatWorkspace(raw){
  const source=isRecord(raw)?raw:{},base=normaliseBase(source);
  const seenIds=new Set(),seenNames=new Set(),savedWorkspaces=[];
  for(const item of Array.isArray(source.savedWorkspaces)?source.savedWorkspaces:[]){
    if(!isRecord(item)||typeof item.id!=='string'||!/^layout-[A-Za-z0-9_-]{1,90}$/.test(item.id))continue;
    const name=nameOf(item.name),key=name.toLowerCase();
    if(!name||seenIds.has(item.id)||seenNames.has(key))continue;
    seenIds.add(item.id);seenNames.add(key);
    savedWorkspaces.push({id:item.id,name,layout:normaliseBase(item.layout)});
    if(savedWorkspaces.length>=COMBAT_WORKSPACE_PRESET_LIMIT)break;
  }
  return {...base,savedWorkspaces};
}
export function combatWorkspaceStorageKey(uid,campaignId){
  const good=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(value);
  return good(uid)&&good(campaignId)
    ?'asteria:gm-combat-workspace:v1:'+uid+':'+campaignId:null;
}
export function editCombatWindow(layout,id,operation,values){
  if(!allowed(id)||layout.locked.includes(id)||layout.hidden.includes(id))return layout;
  if(operation!=='move'&&operation!=='resize')return layout;
  const state=layout.freeform,before=state.positions[id];
  const group=operation==='move'?layout.groups.find(row=>row.includes(id)):null;
  if(!group){
    const freeform=editFreeformWorkspace(state,id,operation,values,{
      locked:layout.locked,hidden:layout.hidden
    });
    return freeform===state?layout:{...layout,freeform};
  }
  const tentative=editFreeformWorkspace({...state,allowOverlap:true},id,'move',values,{
    locked:layout.locked,hidden:layout.hidden
  });
  const next=tentative.positions[id],dx=next.x-before.x,dy=next.y-before.y;
  if(!dx&&!dy)return layout;
  const positions={...state.positions};
  for(const member of group){
    if(layout.locked.includes(member)||layout.hidden.includes(member))return layout;
    const rect=positions[member],wanted={...rect,x:rect.x+dx,y:rect.y+dy};
    const bounded=normalizeFreeformRect(wanted,rect);
    if(bounded.x!==wanted.x||bounded.y!==wanted.y)return layout;
    positions[member]=bounded;
  }
  if(!state.allowOverlap&&group.some(member=>COMBAT_PANEL_IDS.some(other=>
    !group.includes(other)&&!layout.hidden.includes(other)&&
    freeformOverlaps(positions[member],positions[other]))))return layout;
  return {...layout,freeform:{...state,positions}};
}
export function dockCombatWindow(layout,id,edge){
  if(!allowed(id)||!['left','right'].includes(edge)||layout.locked.includes(id))return layout;
  const rect=layout.freeform.positions[id];
  const proposed={...rect,x:edge==='left'?0:1000-rect.w,y:0};
  const state=layout.freeform;
  if(!state.allowOverlap&&COMBAT_PANEL_IDS.some(other=>
    other!==id&&!layout.hidden.includes(other)&&
    freeformOverlaps(proposed,state.positions[other])))return layout;
  return {...layout,freeform:{...state,positions:{...state.positions,[id]:proposed}}};
}
export function setCombatGroup(layout,id,withId=''){
  if(!allowed(id))return layout;
  const groups=layout.groups.filter(row=>!row.includes(id))
    .map(row=>row.filter(other=>other!==withId)).filter(row=>row.length>=2);
  if(allowed(withId)&&withId!==id&&!layout.hidden.includes(id)&&
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
