import {
  editFreeformWorkspace,freeformOverlaps,normalizeFreeformWorkspace
} from './workspaceFreeformModel.mjs';

/** Improvement 2: layout metadata only. No media, secrets or presentation state. */
export const STUDIO_PANEL_IDS=Object.freeze(['scene','preview','output','media','viewers']);
export const STUDIO_PANEL_LABELS=Object.freeze({
  scene:'Scene Controls',preview:'Player Preview',output:'Display & Status',
  media:'Presentation Media Library',viewers:'Viewer Access'
});
const DEFAULT_RECTS=Object.freeze({
  scene:{x:0,y:0,w:570,h:650},
  preview:{x:590,y:0,w:410,h:380},
  output:{x:590,y:400,w:410,h:260},
  media:{x:0,y:680,w:570,h:560},
  viewers:{x:590,y:680,w:410,h:560}
});
const validObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validIds=rows=>Array.isArray(rows)?[...new Set(rows.filter(id=>STUDIO_PANEL_IDS.includes(id)))]:[];
export const studioStorageKey=(uid,campaignId)=>
  'asteria-gm-presentation-studio-v1:'+encodeURIComponent(uid)+':'+encodeURIComponent(campaignId);

export function defaultStudioLayout(){
  return {
    version:1,snap:true,hidden:[],locked:[],
    positions:Object.fromEntries(STUDIO_PANEL_IDS.map(id=>[id,{...DEFAULT_RECTS[id]}]))
  };
}
export function normalizeStudioLayout(value){
  if(!validObject(value)||value.version!==1)return defaultStudioLayout();
  const defaults=defaultStudioLayout();
  const stored=validObject(value.positions)?value.positions:{};
  const normalized=normalizeFreeformWorkspace({
    enabled:true,snap:value.snap!==false,allowOverlap:false,
    positions:{...defaults.positions,...stored}
  },{},STUDIO_PANEL_IDS);
  const hidden=validIds(value.hidden).filter(id=>id!=='scene');
  const locked=validIds(value.locked);
  // Treat damaged or overlapping layout records as a reset, never cover controls.
  for(let i=0;i<STUDIO_PANEL_IDS.length;i++){
    const id=STUDIO_PANEL_IDS[i],a=normalized.positions[id];
    for(let j=0;j<i;j++){
      if(freeformOverlaps(a,normalized.positions[STUDIO_PANEL_IDS[j]]))
        return defaults;
    }
  }
  return {version:1,snap:normalized.snap,hidden,locked,positions:normalized.positions};
}
export function editStudioLayout(layout,id,kind,values){
  const before=normalizeStudioLayout(layout);
  if(!STUDIO_PANEL_IDS.includes(id)||!['move','resize'].includes(kind))return before;
  const work={enabled:true,snap:before.snap,allowOverlap:false,positions:before.positions};
  const after=editFreeformWorkspace(work,id,kind,values,{
    locked:before.locked,hidden:before.hidden
  });
  return after===work?before:{...before,positions:after.positions};
}
export function lockStudioPanel(layout,id,lock){
  const before=normalizeStudioLayout(layout);
  if(!STUDIO_PANEL_IDS.includes(id))return before;
  const next=new Set(before.locked);
  if(lock)next.add(id);else next.delete(id);
  return {...before,locked:[...next]};
}
export function toggleStudioPanel(layout,id,show){
  const before=normalizeStudioLayout(layout);
  if(id==='scene'||!STUDIO_PANEL_IDS.includes(id))return before;
  const hidden=new Set(before.hidden);
  if(show){
    // A hidden panel may not be shown on top of a relocated visible panel.
    const target=before.positions[id];
    if(STUDIO_PANEL_IDS.some(other=>other!==id&&!hidden.has(other)&&
      freeformOverlaps(target,before.positions[other])))return before;
    hidden.delete(id);
  }else hidden.add(id);
  return {...before,hidden:[...hidden]};
}
export function setStudioSnap(layout,snap){
  const before=normalizeStudioLayout(layout);
  return {...before,snap:Boolean(snap)};
}
