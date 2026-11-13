import {
  DASHBOARD_LAYOUT_VERSION,DASHBOARD_PANEL_REGISTRY,GM_FOCUS_LIMIT,
  normalizeDashboardLayout,visibleDashboardPanels
} from './dashboardLayoutModel.mjs';

export const GM_LAYOUT_BACKUP_FORMAT='asteria-gm-dashboard-layout';
export const GM_LAYOUT_BACKUP_VERSION=1;
export const GM_LAYOUT_BACKUP_MAX_BYTES=512*1024;
const knownPanels=new Set(DASHBOARD_PANEL_REGISTRY.gm.map(item=>item.id));
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

/**
 * Export only the existing GM panel configuration and saved Focus snapshots.
 * Character, campaign, credentials, permissions and other Firestore data are
 * not referenced. Portable between the current GM's own campaigns.
 */
export function createGMLayoutBackup(source,exportedAt=new Date().toISOString()){
  return JSON.stringify({
    format:GM_LAYOUT_BACKUP_FORMAT,
    formatVersion:GM_LAYOUT_BACKUP_VERSION,
    role:'gm',
    layoutVersion:DASHBOARD_LAYOUT_VERSION,
    exportedAt,
    layout:normalizeDashboardLayout(source,'gm')
  },null,2)+'\n';
}

export function previewGMLayoutBackup(source){
  const layout=normalizeDashboardLayout(source,'gm');
  return {
    visiblePanels:visibleDashboardPanels(layout,'gm').length,
    namedFocuses:layout.focusModes?.length||0,
    savedViewports:Object.keys(layout.viewportLayouts||{}).length,
    activePreset:layout.preset
  };
}

/** Never silently apply malformed, future-version or player layouts. */
export function parseGMLayoutBackup(content){
  if(typeof content!=='string'||new TextEncoder().encode(content).length>GM_LAYOUT_BACKUP_MAX_BYTES)
    return {ok:false,error:'The layout backup exceeds the 512 KB limit or is not text.'};
  let backup;
  try{backup=JSON.parse(content);}catch{
    return {ok:false,error:'The selected file is not valid JSON.'};
  }
  if(!isRecord(backup)||backup.format!==GM_LAYOUT_BACKUP_FORMAT||
     backup.formatVersion!==GM_LAYOUT_BACKUP_VERSION||backup.role!=='gm')
    return {ok:false,error:'This is not a supported Asteria GM dashboard layout backup.'};
  if(!Number.isInteger(backup.layoutVersion)||backup.layoutVersion<1||
     backup.layoutVersion>DASHBOARD_LAYOUT_VERSION)
    return {ok:false,error:'This layout was made with an unsupported dashboard version.'};
  const layout=backup.layout;
  if(!isRecord(layout)||layout.version>DASHBOARD_LAYOUT_VERSION||
    !Array.isArray(layout.order)||!layout.order.some(id=>knownPanels.has(id))||
    layout.order.some(id=>typeof id!=='string'||!knownPanels.has(id))||
    (layout.hidden!==undefined&&(!Array.isArray(layout.hidden)||
      layout.hidden.some(id=>!knownPanels.has(id))))||
    (layout.focusModes!==undefined&&(!Array.isArray(layout.focusModes)||
      layout.focusModes.length>GM_FOCUS_LIMIT)))
    return {ok:false,error:'The backup contains invalid or unsupported GM layout panels.'};
  // The normalizer also discards unknown fields and restricts positions, panel
  // styles, sizes, Focus identifiers, snapshots and viewport configurations.
  const normalized=normalizeDashboardLayout(layout,'gm');
  if(Array.isArray(layout.focusModes)&&normalized.focusModes?.length!==layout.focusModes.length)
    return {ok:false,error:'The backup contains invalid saved Focus entries.'};
  return {ok:true,layout:normalized,preview:previewGMLayoutBackup(normalized)};
}
