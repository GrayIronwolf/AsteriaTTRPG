import {
  editFreeformWorkspace,freeformOverlaps,normalizeFreeformRect
} from '../../../src/state/workspaceFreeformModel.mjs';

/** Layout-only state: never includes encounter data, permissions or combat commands. */
export const COMBAT_PANEL_IDS=Object.freeze(['controls','initiative','actor','setup','map','history']);
export const COMBAT_PANEL_LABELS=Object.freeze({
  controls:'Encounter Controls',
  initiative:'Initiative & Turn Order',
  actor:'Combatant Actions & Resources',
  setup:'Encounter Setup',
  map:'Battle Map & Player Display',
  history:'Encounter Completion & History'
});
export const COMBAT_WORKSPACE_PRESET_LIMIT=8;
const DEFAULT_POSITIONS=Object.freeze({
  controls:{x:0,y:0,w:490,h:160},
  initiative:{x:0,y:170,w:490,h:400},
  actor:{x:510,y:0,w:490,h:480},
  setup:{x:510,y:490,w:490,h:400},
  map:{x:0,y:580,w:490,h:260},
  history:{x:510,y:900,w:490,h:400}
});
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const allowed=id=>COMBAT_PANEL_IDS.includes(id);
const unique=values=>[...new Set(Array.isArray(values)?values.filter(allowed):[])];
const nameOf=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,48):'';

function normaliseBase(raw){
  const source=isRecord(raw)?raw:{},input=isRecord(source.freeform)?source.freeform:{};
  const entries=isRecord(input.positions)?input.positions:{};
  const positions=Object.fromEntries(COMBAT_PANEL_IDS.map(id=>[
    id,normalizeFreeformRect(entries[id],DEFAULT_POSITIONS[id])
  ]));
  const groups=[];
  for(const group of Array.isArray(source.groups)?source.groups:[]){
    const ids=unique(group).filter(id=>!groups.some(row=>row.includes(id)));
    if(ids.length>=2)groups.push(ids);
    if(groups.length===2)break;
  }
  return {
    freeform:{enabled:true,snap:input.snap!==false,allowOverlap:input.allowOverlap===true,positions},
    hidden:unique(source.hidden),
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
  },hidden:[],minimized:[],groups:[]};
}
