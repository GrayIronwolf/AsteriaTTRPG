/**
 * Canonical, presentation-only dashboard layout configuration.
 * IDs refer to existing components or safe shortcuts; never arbitrary React code.
 * There is deliberately no resource/header/GM sidebar entry in either registry.
 */
export const DASHBOARD_PANEL_REGISTRY = {
  player: [
    {id:'armour',label:'Equipment & Armour',category:'Character',size:'wide'},
    {id:'weapons',label:'Equipped Weapons',category:'Equipment',size:'standard'},
    {id:'quick',label:'Quick Items',category:'Equipment',size:'compact'},
    {id:'talents',label:'Class Talents',category:'Abilities',size:'standard'},
    {id:'spells',label:'Active Spells',category:'Abilities',size:'standard'},
    {id:'skills',label:'Skills',category:'Character',size:'standard'},
    {id:'conditions',label:'Conditions',category:'Combat',size:'compact'},
    {id:'effects',label:'Active Effects',category:'Combat',size:'standard'},
    {id:'specialDamage',label:'Special Damage',category:'Combat',size:'compact'},
    {id:'rest',label:'Rest & Recovery',category:'Character',size:'compact'},
    {id:'currency',label:'Currency',category:'Equipment',size:'compact'},
    {id:'quests',label:'Current Quests',category:'Adventures',size:'standard'},
    {id:'journal',label:'Recent Journal',category:'Adventures',size:'standard'},
    {id:'party',label:'Party',category:'Social',size:'standard'},
    {id:'shortcutInventory',label:'Inventory Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutQuest',label:'Quest Log Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutCharacter',label:'Character Sheet Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutSpells',label:'Spellbook Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutGallery',label:'Gallery Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutSettings',label:'Dashboard Settings Shortcut',category:'Shortcuts',size:'compact',optional:true}
  ],
  gm: [
    {id:'restRequests',label:'Rest Requests',category:'Session',size:'standard'},
    {id:'encounter',label:'Campaign Encounter',category:'Combat',size:'wide'},
    {id:'xp',label:'XP Distribution',category:'Rewards',size:'standard'},
    {id:'specialDamage',label:'Special Damage',category:'Combat',size:'standard'},
    {id:'loot',label:'Loot Rewards',category:'Rewards',size:'standard',optional:true},
    {id:'magicRewards',label:'Magic Element Rewards',category:'Rewards',size:'standard',optional:true},
    {id:'acInspector',label:'Armour Class Inspector',category:'Characters',size:'wide',optional:true},
    {id:'playerManagement',label:'Player Titles & Storage',category:'Characters',size:'wide',optional:true},
    {id:'partySummary',label:'Party Summary',category:'Characters',size:'standard',optional:true},
    {id:'shortcutInventory',label:'PC Inventory Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutQuests',label:'Quests Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutNotes',label:'GM Notes Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutEconomy',label:'Economy Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutCrafting',label:'Crafting Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutTools',label:'GM Tools Shortcut',category:'Shortcuts',size:'compact',optional:true},
    {id:'shortcutWorld',label:'World Systems Shortcut',category:'Shortcuts',size:'compact',optional:true}
  ]
};

export const DASHBOARD_SIZE_COLUMNS = Object.freeze({compact:3,standard:6,wide:9,full:12});
export const DASHBOARD_LAYOUT_VERSION = 1;
export const DASHBOARD_LAYOUT_PRESETS = {
  player:{
    default:[],
    combat:['armour','weapons','quick','spells','talents','skills','conditions','effects','specialDamage','rest'],
    exploration:['quests','journal','party','skills','currency','shortcutInventory','shortcutQuest','shortcutGallery'],
    roleplaying:['party','journal','quests','shortcutCharacter','shortcutQuest','shortcutGallery','skills']
  },
  gm:{
    default:[],
    combat:['encounter','restRequests','specialDamage','xp','loot','magicRewards','acInspector'],
    exploration:['partySummary','shortcutQuests','shortcutNotes','shortcutWorld','encounter','restRequests'],
    roleplaying:['partySummary','shortcutNotes','shortcutQuests','playerManagement','xp'],
    encounter:['encounter','restRequests','specialDamage','xp','loot','magicRewards','acInspector','partySummary']
  }
};

function registry(role='player') {
  return DASHBOARD_PANEL_REGISTRY[role==='gm'?'gm':'player'];
}
export function dashboardPanelIds(role='player') { return registry(role).map(row=>row.id); }
const safeArray=value=>Array.isArray(value)?value:[];
const unique=(rows)=>[...new Set(rows)];
const validPreset=(role,preset)=>Object.hasOwn(DASHBOARD_LAYOUT_PRESETS[role],preset);

export function defaultDashboardLayout(role='player') {
  const panels=registry(role);
  return {
    version:DASHBOARD_LAYOUT_VERSION,
    mode:'default',
    preset:'default',
    order:panels.map(p=>p.id),
    hidden:panels.filter(p=>p.optional).map(p=>p.id),
    sizes:Object.fromEntries(panels.map(p=>[p.id,p.size]))
  };
}
export function normalizeDashboardLayout(value,role='player') {
  const scope=role==='gm'?'gm':'player';
  const defaults=defaultDashboardLayout(scope);
  if(!value || typeof value!=='object' || Array.isArray(value))return defaults;
  const ids=dashboardPanelIds(scope);
  const known=new Set(ids);
  const ordered=unique(safeArray(value.order).filter(id=>typeof id==='string'&&known.has(id)));
  const hidden=new Set(safeArray(value.hidden).filter(id=>typeof id==='string'&&known.has(id)));
  // New optional panel types must stay opt-in for layouts saved before their introduction.
  for(const item of registry(scope))if(item.optional&&!ordered.includes(item.id))hidden.add(item.id);
  const sizes={};
  const rawSizes=value.sizes&&typeof value.sizes==='object'&&!Array.isArray(value.sizes)?value.sizes:{};
  for(const item of registry(scope)) sizes[item.id]=Object.hasOwn(DASHBOARD_SIZE_COLUMNS,rawSizes[item.id])?rawSizes[item.id]:item.size;
  return {
    version:DASHBOARD_LAYOUT_VERSION,
    mode:value.mode==='custom'?'custom':'default',
    preset:typeof value.preset==='string'&&(value.preset==='custom'||validPreset(scope,value.preset))?value.preset:'default',
    order:[...ordered,...ids.filter(id=>!ordered.includes(id))],
    hidden:ids.filter(id=>hidden.has(id)),
    sizes
  };
}
export function layoutFromPlayerPreferences(preferences={}) {
  const source=preferences?.dashboardPreferences||preferences||{};
  if(source.dashboardLayout)return normalizeDashboardLayout(source.dashboardLayout,'player');
  const layout=defaultDashboardLayout('player');
  const legacy=safeArray(source.hiddenPanels);
  const mapping={weapons:['armour','weapons','quick'],talents:['talents'],spells:['spells'],skills:['skills'],conditions:['conditions']};
  for(const group of legacy)for(const panel of mapping[group]||[]) layout.hidden.push(panel);
  return {...layout,hidden:unique(layout.hidden)};
}
export function visibleDashboardPanels(layout,role='player'){
  const normalized=normalizeDashboardLayout(layout,role);
  const hidden=new Set(normalized.hidden);
  return normalized.order.filter(id=>!hidden.has(id));
}
export function applyDashboardPreset(layout,role='player',preset='default'){
  const scope=role==='gm'?'gm':'player';
  if(!validPreset(scope,preset))return normalizeDashboardLayout(layout,scope);
  if(preset==='default')return defaultDashboardLayout(scope);
  const defaults=defaultDashboardLayout(scope);
  const previous=normalizeDashboardLayout(layout,scope);
  const requested=DASHBOARD_LAYOUT_PRESETS[scope][preset];
  const selected=new Set(requested);
  return {...previous,version:DASHBOARD_LAYOUT_VERSION,mode:'custom',preset,
    order:[...requested,...defaults.order.filter(id=>!selected.has(id))],
    hidden:defaults.order.filter(id=>!selected.has(id))};
}
export function moveDashboardPanel(layout,role='player',id,target){
  const previous=normalizeDashboardLayout(layout,role);
  if(id===target || !previous.order.includes(id) || !previous.order.includes(target))return previous;
  const order=previous.order.filter(x=>x!==id);
  order.splice(order.indexOf(target),0,id);
  return {...previous,mode:'custom',preset:'custom',order};
}
export function nudgeDashboardPanel(layout,role='player',id,direction){
  const previous=normalizeDashboardLayout(layout,role);
  const visible=visibleDashboardPanels(previous,role);
  const index=visible.indexOf(id),target=visible[index+direction];
  if(index<0||!target)return previous;
  const order=[...previous.order];
  const from=order.indexOf(id),to=order.indexOf(target);
  [order[from],order[to]]=[order[to],order[from]];
  return {...previous,mode:'custom',preset:'custom',order};
}
export function toggleDashboardPanel(layout,role='player',id,enabled){
  const previous=normalizeDashboardLayout(layout,role);
  if(!previous.order.includes(id))return previous;
  const hidden=new Set(previous.hidden);
  if(enabled)hidden.delete(id);else hidden.add(id);
  return {...previous,mode:'custom',preset:'custom',hidden:[...hidden]};
}
export function resizeDashboardPanel(layout,role='player',id,size){
  const previous=normalizeDashboardLayout(layout,role);
  if(!previous.order.includes(id)||!Object.hasOwn(DASHBOARD_SIZE_COLUMNS,size))return previous;
  return {...previous,mode:'custom',preset:'custom',sizes:{...previous.sizes,[id]:size}};
}
export function dashboardSizeForColumns(columns){
  if(columns>=11)return 'full';
  if(columns>=8)return 'wide';
  if(columns>=5)return 'standard';
  return 'compact';
}
