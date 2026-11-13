import {
  DASHBOARD_LAYOUT_PRESETS,DASHBOARD_VIEWPORTS,GM_FOCUS_LIMIT,
  normalizeDashboardLayout,applyDashboardPreset,dashboardLayoutForViewport,
  setDashboardViewportLayout
} from './dashboardLayoutModel.mjs';

// All Focus data stays in the existing per-account, per-campaign GM layout.
// These are layout snapshots only; never campaign state or player information.
export const GM_FOCUS_BUILTINS=Object.freeze([
  Object.freeze({id:'combat',label:'Combat'}),
  Object.freeze({id:'exploration',label:'Exploration'}),
  Object.freeze({id:'roleplaying',label:'Roleplaying'}),
  Object.freeze({id:'encounter',label:'Encounter'})
]);

export function gmFocusSnapshot(layout){
  const normalized=normalizeDashboardLayout(layout,'gm');
  const {focusModes:ignoreModes,focusHome:ignoreHome,activeFocusId:ignoreId,...panels}=normalized;
  return panels;
}

function outcome(layout,error=''){
  return error?{ok:false,error}:{ok:true,layout:normalizeDashboardLayout(layout,'gm')};
}
const cleanName=name=>typeof name==='string'?
  name.replace(/[\x00-\x1f\x7f]/g,' ').trim().replace(/\s+/g,' '):'';

export function saveNamedGMFocus(layout,name,id){
  const current=normalizeDashboardLayout(layout,'gm');
  const label=cleanName(name);
  if(!label||label.length>48)return outcome(null,'Choose a Focus name of 1–48 characters.');
  if(!/^[a-zA-Z0-9_-]{1,72}$/.test(String(id||'')))
    return outcome(null,'Could not create a valid Focus identifier.');
  const saved=current.focusModes||[];
  if(saved.length>=GM_FOCUS_LIMIT)
    return outcome(null,'You have reached the limit of '+GM_FOCUS_LIMIT+' saved Focus modes.');
  if(saved.some(item=>item.name.toLocaleLowerCase()===label.toLocaleLowerCase()))
    return outcome(null,'A Focus with that name already exists.');
  if(saved.some(item=>item.id===id))return outcome(null,'That Focus identifier is already in use.');
  const snapshot=gmFocusSnapshot(current);
  return outcome({
    ...current,
    focusHome:current.focusHome||snapshot,
    focusModes:[...saved,{id,name:label,layout:snapshot}],
    activeFocusId:id
  });
}

export function updateNamedGMFocus(layout,id){
  const current=normalizeDashboardLayout(layout,'gm');
  if(!current.focusModes?.some(entry=>entry.id===id))
    return outcome(null,'Choose an existing saved Focus first.');
  const snapshot=gmFocusSnapshot(current);
  return outcome({
    ...current,
    focusModes:current.focusModes.map(entry=>entry.id===id?{...entry,layout:snapshot}:entry),
    activeFocusId:id
  });
}

export function deleteNamedGMFocus(layout,id){
  const current=normalizeDashboardLayout(layout,'gm');
  if(!current.focusModes?.some(entry=>entry.id===id))
    return outcome(null,'Saved Focus not found.');
  const next={...current,focusModes:current.focusModes.filter(entry=>entry.id!==id)};
  if(next.activeFocusId===id)delete next.activeFocusId;
  return outcome(next);
}

export function activateNamedGMFocus(layout,id){
  const current=normalizeDashboardLayout(layout,'gm');
  const entry=current.focusModes?.find(row=>row.id===id);
  if(!entry)return outcome(null,'Saved Focus not found.');
  const home=current.focusHome||gmFocusSnapshot(current);
  return outcome({
    ...gmFocusSnapshot(entry.layout),
    focusModes:current.focusModes,
    focusHome:home,
    activeFocusId:id
  });
}

export function activateBuiltinGMFocus(layout,preset){
  const current=normalizeDashboardLayout(layout,'gm');
  if(!GM_FOCUS_BUILTINS.some(item=>item.id===preset)||
     !Object.hasOwn(DASHBOARD_LAYOUT_PRESETS.gm,preset))
    return outcome(null,'Unknown built-in Focus.');
  const home=current.focusHome||gmFocusSnapshot(current);
  // One named Focus applies to the whole dashboard, including every saved
  // viewport. Updating the root only would leave tablet/mobile on old layouts.
  let updated=current;
  for(const viewport of DASHBOARD_VIEWPORTS){
    const before=dashboardLayoutForViewport(current,'gm',viewport);
    const next=applyDashboardPreset(before,'gm',preset);
    updated=setDashboardViewportLayout(updated,'gm',viewport,next);
  }
  const {activeFocusId:ignore,...withoutActive}=updated;
  return outcome({...withoutActive,focusHome:home});
}

export function leaveGMFocus(layout){
  const current=normalizeDashboardLayout(layout,'gm');
  if(!current.focusHome)return outcome(current);
  return outcome({
    ...gmFocusSnapshot(current.focusHome),
    ...(current.focusModes?.length?{focusModes:current.focusModes}:{})
  });
}

export function gmFocusStatus(layout){
  const current=normalizeDashboardLayout(layout,'gm');
  const saved=current.focusModes||[];
  const active=saved.find(item=>item.id===current.activeFocusId);
  const builtin=GM_FOCUS_BUILTINS.find(item=>item.id===current.preset&&!current.activeFocusId);
  return {
    activeId:active?.id||'',
    label:active?.name||builtin?.label||(current.focusHome?'Modified Focus':'Normal dashboard'),
    hasHome:Boolean(current.focusHome),
    changed:Boolean(active&&JSON.stringify(active.layout)!==JSON.stringify(gmFocusSnapshot(current))),
    saved
  };
}
