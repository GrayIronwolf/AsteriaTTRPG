/** Phase 6.1A: opt-in freeform geometry shared by Player, GM and Combat workspaces.
 * Values are bounded tenths of a percent of canvas width (1000 = 100%).
 * This module owns layout only; no gameplay state or Firebase permissions.
 */
export const FREEFORM_UNITS=1000;
export const FREEFORM_MAX_HEIGHT=5000;
export const FREEFORM_MIN_WIDTH=140;
export const FREEFORM_MIN_HEIGHT=120;
export const FREEFORM_SNAP_STEP=10;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clamp=(n,low,high)=>Math.min(high,Math.max(low,n));
const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const whole=(value,fallback)=>Math.round(finite(value,fallback));
const unique=rows=>[...new Set(Array.isArray(rows)?rows:[])];

export function gridToFreeformRect(grid={}){
  const x=whole(grid.x,0),y=whole(grid.y,0);
  const w=whole(grid.w,3),h=whole(grid.h,3);
  return normalizeFreeformRect({
    x:Math.round(x*FREEFORM_UNITS/12),y:Math.round(y*FREEFORM_UNITS/12),
    w:Math.round(w*FREEFORM_UNITS/12),h:Math.round(h*FREEFORM_UNITS/12)
  });
}
export function normalizeFreeformRect(value={},fallback={
  x:0,y:0,w:250,h:250
}){
  const source=record(value)?value:{};
  const width=clamp(whole(source.w,fallback.w),FREEFORM_MIN_WIDTH,FREEFORM_UNITS);
  const height=clamp(whole(source.h,fallback.h),FREEFORM_MIN_HEIGHT,FREEFORM_UNITS*2);
  return {
    x:clamp(whole(source.x,fallback.x),0,FREEFORM_UNITS-width),
    y:clamp(whole(source.y,fallback.y),0,FREEFORM_MAX_HEIGHT-height),
    w:width,h:height
  };
}
/** Unknown panel IDs and invalid stored geometry never enter the renderer. */
export function normalizeFreeformWorkspace(value,grid={},knownIds=[]){
  if(!record(value))return null;
  const allowed=unique(knownIds).filter(id=>typeof id==='string');
  const raw=record(value.positions)?value.positions:{};
  const positions={};
  for(const id of allowed){
    const fallback=gridToFreeformRect(grid[id]);
    positions[id]=normalizeFreeformRect(raw[id],fallback);
  }
  return {
    enabled:value.enabled===true,
    snap:value.snap!==false,
    allowOverlap:value.allowOverlap===true,
    positions
  };
}
export function freeformOverlaps(one,two){
  return one.x<two.x+two.w && one.x+one.w>two.x &&
    one.y<two.y+two.h && one.y+one.h>two.y;
}
/** Drag and resize are a single atomic proposal. Disallowed collisions have no effects. */
export function editFreeformWorkspace(state,id,operation,values={},options={}){
  if(!record(state)||state.enabled!==true||!record(state.positions)||!record(state.positions[id])||
    !['move','resize'].includes(operation)||
    (options.locked||[]).includes(id)||(options.hidden||[]).includes(id))return state;
  const before=state.positions[id],snap=state.snap===true;
  const step=value=>snap?Math.round(value/FREEFORM_SNAP_STEP)*FREEFORM_SNAP_STEP:value;
  const update=operation==='move'
    ?{...before,x:step(finite(values.x,before.x)),y:step(finite(values.y,before.y))}
    :{...before,w:step(finite(values.w,before.w)),h:step(finite(values.h,before.h))};
  const next=normalizeFreeformRect(update,before);
  if(JSON.stringify(before)===JSON.stringify(next))return state;
  if(!state.allowOverlap&&Object.entries(state.positions).some(([other,rect])=>
    other!==id&&!(options.hidden||[]).includes(other)&&freeformOverlaps(next,rect)))return state;
  return {...state,positions:{...state.positions,[id]:next}};
}
export function freeformCanvasHeight(state,visibleIds=[]){
  if(!record(state)||!record(state.positions))return 800;
  const bottom=unique(visibleIds).reduce((value,id)=>{
    const rect=state.positions[id];
    return rect?Math.max(value,rect.y+rect.h):value;
  },0);
  return clamp(bottom+70,700,FREEFORM_MAX_HEIGHT);
}
export function freeformPercent(value){return (value/FREEFORM_UNITS*100)+'%';}
