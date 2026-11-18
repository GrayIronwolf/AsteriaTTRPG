import {
  normalizeDashboardLayout,dashboardLayoutForViewport,setDashboardViewportLayout
} from '../../../src/state/dashboardLayoutModel.mjs';

export const MAX_LAYOUT_UNDO=40;
export const layoutFingerprint=(layout,role)=>
  JSON.stringify(normalizeDashboardLayout(layout,role));

export function createLayoutHistory(layout,role='player'){
  return Object.freeze({past:[],present:normalizeDashboardLayout(layout,role),future:[]});
}
export function pushLayoutHistory(history,layout,role='player'){
  const next=normalizeDashboardLayout(layout,role);
  if(layoutFingerprint(next,role)===layoutFingerprint(history.present,role))return history;
  return Object.freeze({
    past:[...history.past.slice(1-MAX_LAYOUT_UNDO),history.present],
    present:next,future:[]
  });
}
export function undoLayoutHistory(history){
  if(!history.past.length)return history;
  return Object.freeze({
    past:history.past.slice(0,-1),
    present:history.past.at(-1),
    future:[history.present,...history.future].slice(0,MAX_LAYOUT_UNDO)
  });
}
export function redoLayoutHistory(history){
  if(!history.future.length)return history;
  return Object.freeze({
    past:[...history.past.slice(1-MAX_LAYOUT_UNDO),history.present],
    present:history.future[0],future:history.future.slice(1)
  });
}
export function updateViewportHistory(history,role,viewport,change){
  const current=dashboardLayoutForViewport(history.present,role,viewport);
  const next=change(current);
  return pushLayoutHistory(history,setDashboardViewportLayout(history.present,role,viewport,next),role);
}
