/**
 * Asteria dashboard grid geometry and panel-specific size rules.
 * Pure module: no browser, Firebase or React dependencies.
 *
 * Coordinates are zero-based square cells on a 12-column grid.
 * The editor begins with 30 rows and grows to fit saved placements.
 */
export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_GRID_START_ROWS = 30;
export const DASHBOARD_GRID_MAX_ROWS = 600;

const rule=(minW,minH,defaultW,defaultH,maxW,maxH,options={})=>
  Object.freeze({minW,minH,defaultW,defaultH,maxW,maxH,...options});
const shortcut=rule(2,2,2,2,2,2,{fixed:true});
export const DASHBOARD_GRID_RULES=Object.freeze({
  player:Object.freeze({
    armour:rule(4,3,4,4,8,7,{portrait:{w:3,minH:6}}),
    weapons:rule(3,2,3,3,6,5),
    quick:rule(2,3,3,3,6,5),
    talents:rule(3,3,4,4,8,8),
    spells:rule(3,3,4,4,8,8),
    skills:rule(3,3,4,4,9,7),
    conditions:rule(2,2,3,2,6,4),
    effects:rule(2,2,3,2,6,5),
    specialDamage:rule(3,2,3,3,6,4),
    rest:rule(3,2,3,3,6,4),
    currency:rule(2,2,2,3,4,4),
    quests:rule(2,3,3,3,6,7),
    journal:rule(2,4,3,5,6,9),
    party:rule(2,3,3,3,6,6),
    shortcutInventory:shortcut,shortcutQuest:shortcut,shortcutCharacter:shortcut,
    shortcutSpells:shortcut,shortcutGallery:shortcut,shortcutSettings:shortcut,
    combatOverview:rule(3,3,4,4,8,7),explorationOverview:rule(3,3,4,4,8,7),
    questTracker:rule(3,3,4,4,8,8),inventoryOverview:rule(3,3,4,4,8,7)
  }),
  gm:Object.freeze({
    restRequests:rule(3,3,4,3,8,6),
    encounter:rule(5,4,6,5,12,10),
    xp:rule(4,3,4,4,8,7),
    specialDamage:rule(3,3,4,3,8,6),
    loot:rule(5,4,6,5,12,10),
    magicRewards:rule(4,3,5,4,9,7),
    acInspector:rule(4,4,5,5,9,8),
    playerManagement:rule(5,4,6,5,12,10),
    partySummary:rule(3,3,3,4,7,7),
    shortcutInventory:shortcut,shortcutQuests:shortcut,shortcutNotes:shortcut,
    shortcutEconomy:shortcut,shortcutCrafting:shortcut,shortcutTools:shortcut,
    shortcutWorld:shortcut,
    combatOverview:rule(3,3,4,4,8,7),explorationOverview:rule(3,3,4,4,8,7),
    questTracker:rule(3,3,4,4,8,8),inventoryOverview:rule(3,3,4,4,8,7)
  })
});
const integer=value=>Number.isFinite(Number(value))?Math.round(Number(value)):NaN;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
export function dashboardGridRule(role,id){
  const rules=DASHBOARD_GRID_RULES[role==='gm'?'gm':'player'];
  return Object.hasOwn(rules,id)?rules[id]:null;
}
export function defaultGridDimensions(role,id){
  const r=dashboardGridRule(role,id);
  return r?{w:r.defaultW,h:r.defaultH}:null;
}
export function clampGridDimensions(role,id,width,height){
  const r=dashboardGridRule(role,id);
  if(!r)return null;
  if(r.fixed)return {w:r.defaultW,h:r.defaultH};
  const proposedW=integer(width),proposedH=integer(height);
  const w=Number.isFinite(proposedW)?proposedW:r.defaultW;
  const h=Number.isFinite(proposedH)?proposedH:r.defaultH;
  if(r.portrait&&w===r.portrait.w&&h>=r.portrait.minH)
    return {w:r.portrait.w,h:clamp(h,r.portrait.minH,r.maxH)};
  return {w:clamp(w,r.minW,Math.min(DASHBOARD_GRID_COLUMNS,r.maxW)),h:clamp(h,r.minH,r.maxH)};
}
export function legacyGridDimensions(role,id,value){
  const map={compact:[3,3],standard:[3,3],wide:[6,3],long:[6,3],tall:[3,6],full:[9,3],
    '3x3':[3,3],'6x3':[6,3],'3x6':[3,6],'9x3':[9,3]};
  const pair=Object.hasOwn(map,value)?map[value]:null;
  return pair?clampGridDimensions(role,id,pair[0],pair[1]):defaultGridDimensions(role,id);
}
/** Resolve pointer movement from the *release* event, not a possibly stale
 * React preview. Shared by touch, mouse and trackpad gestures in the editor.
 * This is a proposal only: the layout reducer still rejects collisions/locks. */
export function dashboardPointerProposal(role,id,rect,kind,deltaX=0,deltaY=0){
  const current=validGridPlacement(role,id,rect);
  const rule=dashboardGridRule(role,id);
  if(!current||!rule||!['move','resize'].includes(kind))return null;
  const dx=Number.isFinite(Number(deltaX))?Math.round(Number(deltaX)):0;
  const dy=Number.isFinite(Number(deltaY))?Math.round(Number(deltaY)):0;
  if(kind==='move')return {
    ...current,
    x:clamp(current.x+dx,0,DASHBOARD_GRID_COLUMNS-current.w),
    y:clamp(current.y+dy,0,DASHBOARD_GRID_MAX_ROWS-current.h)
  };
  if(rule.fixed)return current;
  const dimensions=clampGridDimensions(role,id,current.w+dx,current.h+dy);
  return {...current,...dimensions,x:Math.min(current.x,DASHBOARD_GRID_COLUMNS-dimensions.w)};
}

export function gridRectanglesOverlap(a,b){
  return a.x<b.x+b.w && b.x<a.x+a.w && a.y<b.y+b.h && b.y<a.y+a.h;
}
export function validGridPlacement(role,id,value){
  const r=dashboardGridRule(role,id);
  if(!r||!value||typeof value!=='object'||Array.isArray(value))return null;
  const w=integer(value.w),h=integer(value.h),x=integer(value.x),y=integer(value.y);
  if(![w,h,x,y].every(Number.isInteger) || x<0 || x+w>DASHBOARD_GRID_COLUMNS ||
    y<0 || y+h>DASHBOARD_GRID_MAX_ROWS)return null;
  const expected=clampGridDimensions(role,id,w,h);
  if(!expected||expected.w!==w||expected.h!==h)return null;
  return {x,y,w,h};
}
export function gridPositionIsFree(candidate,positions,exceptId){
  return Object.entries(positions).every(([id,other])=>
    id===exceptId||!gridRectanglesOverlap(candidate,other));
}
function firstFreePosition(dim,occupied,startY=0){
  for(let y=Math.max(0,startY);y<=DASHBOARD_GRID_MAX_ROWS-dim.h;y++){
    for(let x=0;x<=DASHBOARD_GRID_COLUMNS-dim.w;x++){
      const candidate={x,y,...dim};
      if(gridPositionIsFree(candidate,occupied))return candidate;
    }
  }
  return null;
}
/** Sanitizes saved positions, resolving collisions without losing any visible panel. */
export function normalizeGridPlacements(role,order,hidden=[],rawPlacements={},legacySizes={}){
  const blocked=new Set(hidden);
  const ids=order.filter(id=>dashboardGridRule(role,id));
  const raw=rawPlacements&&typeof rawPlacements==='object'&&!Array.isArray(rawPlacements)?rawPlacements:{};
  const legacy=legacySizes&&typeof legacySizes==='object'&&!Array.isArray(legacySizes)?legacySizes:{};
  const occupied={};
  const positions={};
  for(const id of ids.filter(id=>!blocked.has(id))){
    const saved=validGridPlacement(role,id,raw[id]);
    const fallback=legacyGridDimensions(role,id,legacy[id]);
    const dim=saved?{w:saved.w,h:saved.h}:fallback;
    const candidate=saved&&gridPositionIsFree(saved,occupied)?saved:firstFreePosition(dim,occupied);
    if(candidate){positions[id]=candidate;occupied[id]=candidate;}
  }
  // Preserve valid hidden-panel geometry for later re-enabling, but do not occupy space.
  for(const id of ids.filter(id=>blocked.has(id))){
    positions[id]=validGridPlacement(role,id,raw[id])||
      {x:0,y:0,...legacyGridDimensions(role,id,legacy[id])};
  }
  return positions;
}
/** Compact unlocked panels around valid pinned panels. */
export function packGridPlacements(role,order,hidden=[],placements={},locked=[]){
  const visible=order.filter(id=>dashboardGridRule(role,id)&&!hidden.includes(id));
  const locks=new Set(locked);
  const occupied={};
  for(const id of visible){
    if(!locks.has(id))continue;
    const valid=validGridPlacement(role,id,placements[id]);
    if(valid&&gridPositionIsFree(valid,occupied))occupied[id]=valid;
  }
  const result={...placements};
  for(const id of visible){
    if(occupied[id]){result[id]=occupied[id];continue;}
    const saved=validGridPlacement(role,id,placements[id]);
    const dim=saved?{w:saved.w,h:saved.h}:defaultGridDimensions(role,id);
    const next=firstFreePosition(dim,occupied);
    if(next){result[id]=next;occupied[id]=next;}
  }
  return result;
}
export function gridRowCount(placements,visible){
  return Math.max(DASHBOARD_GRID_START_ROWS,...visible.map(id=>{
    const p=placements?.[id];
    return p&&Number.isFinite(p.y)&&Number.isFinite(p.h)?p.y+p.h:0;
  }));
}
