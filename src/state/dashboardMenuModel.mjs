/** The single source of truth for the React/Vite GM and Player dashboard menus.
 * Page IDs remain unchanged so restored tabs, shortcuts and permissions survive.
 * Top-level categories are presentation only; they never clone page content.
 */
const category=(id,label,icon,items)=>({id,label,icon,items});
const page=(id,label,description='',section='')=>({id,label,description,section});
export const GM_DASHBOARD_CATEGORIES=Object.freeze([
  category('main','GM Main','dashboard',[
    page('main','GM Main','Campaign overview and customisable dashboard')
  ]),
  category('combat','Combat','weapons',[
    page('combat','Combat Command Centre','Live initiative, turn controls and prepared encounters'),
    page('encounter-rewards','Encounter Generator','Create and review encounter proposals'),
    page('battle-maps','Battle Maps','Manage animated scenes, grids and tokens')
  ]),
  category('campaign','Campaign','party',[
    page('player-manager','Player Manager','Players, requests, linked characters, roles and access','Characters & Party'),
    page('bestiary','NPC & Creature Library','NPC records, generators and creature cards','Characters & Party'),
    page('inventory','PC Inventory','Character equipment and party loot','Characters & Party'),
    page('quests','Quests','Objectives, assignments and progress','Story & Notes'),
    page('notes','GM Notes','Private notes and session logs','Story & Notes'),
    page('information','News & Events','Campaign information and announcements','Story & Notes'),
    page('economy','Economy','Shops, prices and trade routes','Economy & Crafting'),
    page('crafting','Crafting','Recipes, projects and enchantments','Economy & Crafting')
  ]),
  category('world','World','gallery',[
    page('world','World Systems','Locations, settlements and factions'),
    page('world-atlas','World Atlas','World maps, markers and routes'),
    page('asteria-calendar','Asteria Calendar','Campaign chronology and events'),
    page('weather-environment','Weather Generator','Forecasts and environmental conditions')
  ]),
  category('session','Session','journal',[
    page('session-library','Session Library','Private records and shared handouts'),
    page('soundboard','Soundboard & Ambience','Audio and live ambience'),
    page('session-recordings','Session Recordings','Consent and session archives'),
    page('presentation','Player Display','Second-screen presentation')
  ]),
  category('tools','GM Tools','settings',[
    page('toolkit','GM Toolkit','Search and discover GM tools'),
    page('tools','GM Character Tools','Checks, conditions and resource controls'),
    page('gameplay','Gameplay Systems','Campaign mechanics and checks'),
    page('advanced-dice','Advanced Dice','Rolls and saved presets'),
    page('random-tables','Random Tables','Weighted random results')
  ]),
  category('settings','Settings','settings',[
    page('settings','Dashboard Settings','Layout and panel preferences')
  ])
]);
export const PLAYER_DASHBOARD_CATEGORIES=Object.freeze([
  category('dashboard','Dashboard','dashboard',[
    page('dashboard','Dashboard','Character and campaign overview')
  ]),
  category('character','Character','character',[
    page('character','Character Sheet','Characteristics and identity'),
    page('talents','Class/Talent Tree','Class paths and purchased talents'),
    page('skills','Skills','Training and skill progression'),
    page('spells','Spells','Known magic and spellbook'),
    page('gallery','Gallery','Character images')
  ]),
  category('inventory','Inventory','inventory',[
    page('inventory','Inventory & Equipment','Items, equipment and storage'),
    page('crafting','Crafting','Recipes, services and enhancements')
  ]),
  category('adventures','Adventures','quest',[
    page('quest','Quests','Objectives and rewards'),
    page('journal','Journal','Personal campaign journal'),
    page('party','Party','Party members, organisations and chat'),
    page('information','News / Events / History','Campaign announcements and history')
  ]),
  category('world','World','gallery',[
    page('battle-maps','Battle Maps','Shared encounter scenes'),
    page('world-atlas','World Map','Shared locations and routes'),
    page('asteria-calendar','Calendar','World time and events'),
    page('weather-environment','Weather','Environmental conditions')
  ]),
  category('session','Session','journal',[
    page('advanced-dice','Advanced Dice','Rolls, modifiers and presets'),
    page('session-library','Campaign Library','Shared notes and handouts'),
    page('soundboard','Campaign Audio','Ambience and sound effects'),
    page('session-recordings','Recording & Archives','Session recording and history')
  ]),
  category('settings','Settings','settings',[
    page('settings','Dashboard Settings','Personal layout and preferences')
  ])
]);
const source=role=>role==='gm'?GM_DASHBOARD_CATEGORIES:PLAYER_DASHBOARD_CATEGORIES;
/** Flattened legacy-compatible IDs used for direct navigation and restored state. */
export function dashboardTabs(role='player'){
  return source(role).flatMap(group=>group.items.map(item=>({...item,icon:group.icon})));
}
/** Remove unavailable campaign-only items without empty dropdown shells. */
export function dashboardMenu(role='player',availableIds=null){
  const allowed=Array.isArray(availableIds)?new Set(availableIds):null;
  return source(role).map(group=>({...group,items:group.items.filter(item=>
    !allowed||allowed.has(item.id)
  )})).filter(group=>group.items.length);
}
export function dashboardCategoryForPage(role,pageId){
  return source(role).find(group=>group.items.some(item=>item.id===pageId))?.id||'';
}
