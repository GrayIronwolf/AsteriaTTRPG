/**
 * Digital GM Toolkit 2.1.
 * Read-only directory of GM workspaces that already exist in GMDashboard.
 * Targets are fixed UI anchors; no arbitrary route, Firestore path or user URL.
 * More tools may be registered in later phases once implemented.
 */
const defineGroup=({id,label,description,tools})=>Object.freeze({
  id,label,description,
  tools:Object.freeze(tools.map(tool=>Object.freeze(tool)))
});

export const GM_TOOLKIT_GROUPS=Object.freeze([
  defineGroup({
    id:'session',label:'Session & Combat',
    description:'Run encounters and manage the live session.',
    tools:[
      {id:'encounter',label:'GM Main & Encounter Board',tab:'main',description:'Initiative, encounters, rest requests, XP and special damage.',keywords:'combat initiative creature turn encounter'},
      {id:'encounter-rewards',label:'Encounter & Reward Generator',tab:'encounter-rewards',description:'Generate and approve TT-matched encounters and GM-private treasure drafts.',keywords:'encounter generator rewards creatures threat tier random loot preview'},
      {id:'random-tables',label:'Random Table Builder',tab:'random-tables',description:'GM-only weighted encounter, NPC, event, travel and custom tables with saved rolls.',keywords:'weighted random encounter npc events travel custom loot reference templates tables'},
      {id:'advanced-dice',label:'Advanced Dice Roller',tab:'advanced-dice',description:'Secure digital dice pools, modifiers, private roll history and saved presets.',keywords:'dice d4 d6 d8 d10 d12 d20 d100 roll random presets modifier'},
      {id:'battle-maps',label:'Battle Maps & Animated Scenes',tab:'battle-maps',description:'Upload images or looping video battle maps, configure grids, markers and player sharing.',keywords:'map video loop animated mp4 webm tokens grid tabletop'},
      {id:'gm-controls',label:'GM Character Tools',tab:'tools',description:'Conditions, resource controls, Armour Class and player titles.',keywords:'hp sp mp ac character'},
      {id:'notes',label:'GM Notes & Session Log',tab:'notes',description:'Private preparation notes and existing session records.',keywords:'session journal log preparation'},
      {id:'news',label:'News & Events',tab:'information',description:'Campaign information, announcements and events.',keywords:'information announcements'}
    ]
  }),
  defineGroup({
    id:'campaign',label:'Campaign & Party',
    description:'Keep track of players, progress and campaign administration.',
    tools:[
      {id:'quests',label:'Quest Manager',tab:'quests',description:'Manage campaign objectives, quest offers and progress.',keywords:'quest tasks objective'},
      {id:'party',label:'Party Inventory',tab:'inventory',description:'Review linked characters and their inventory.',keywords:'pc equipment player items'},
      {id:'campaign-manager',label:'Campaign Manager',tab:'tools',description:'Campaign details, linked accounts and party membership.',keywords:'players invitations management'},
      {id:'rewards',label:'Rewards & Advancement',tab:'tools',description:'Existing GM reward tools, magic rewards and character management.',keywords:'xp loot award titles magic'},
      {id:'gameplay',label:'Gameplay Systems',tab:'gameplay',description:'Manage existing gameplay records and system settings.',keywords:'systems templates encounter'},
      {id:'npc-library',label:'NPC & Creature Library',tab:'bestiary',description:'Find, generate and create custom character cards for campaign NPCs and creatures.',keywords:'npc generator character card portrait creature bestiary customise custom library'}
    ]
  }),
  defineGroup({
    id:'economy',label:'Trade, Loot & Crafting',
    description:'Access established campaign economy and inventory tools.',
    tools:[
      {id:'shops',label:'Merchant Shops',tab:'economy',targetId:'react-gm-shops',description:'Manage shop inventories, visitors, stock and merchant relationships.',keywords:'trading market merchants restock'},
      {id:'loot-tables',label:'GM Loot Tables',tab:'economy',targetId:'react-gm-loot-tables',description:'Weighted tables and GM-reviewed treasure previews.',keywords:'random tables treasure'},
      {id:'treasure',label:'Treasure & Party Stashes',tab:'inventory',targetId:'react-gm-party-loot',description:'Review hidden drops and existing party storage.',keywords:'party loot rewards stash'},
      {id:'trade-audit',label:'Inventory & Trade Audit',tab:'inventory',targetId:'react-gm-inventory-audit',description:'Read-only transaction history and export.',keywords:'history audit trading'},
      {id:'economy-controls',label:'World Economy',tab:'economy',description:'Existing regional economy, trade routes and pricing controls.',keywords:'market routes inflation'},
      {id:'crafting',label:'Crafting Workshop',tab:'crafting',description:'Campaign recipes, services, projects and enhancements.',keywords:'blacksmith enchantments materials'}
    ]
  }),
  defineGroup({
    id:'world',label:'World & Workspace',
    description:'Explore campaign records and configure the dashboard.',
    tools:[
      {id:'weather-environment',label:'Weather & Environmental Generator',tab:'weather-environment',description:'Generate private biome-based forecasts and approve player-safe environmental advisories.',keywords:'weather climate environment forecast storm rain snow terrain travel biome'},
      {id:'asteria-calendar',label:'Asteria Calendar & Time',tab:'asteria-calendar',description:'Manage canonical months, weekdays, eras, dates and shared campaign events.',keywords:'calendar date time month seasons year events festivals chronology'},
      {id:'world',label:'World Systems',tab:'world',description:'Existing settlements, factions, events and world state.',keywords:'locations npcs lore weather'},
      {id:'layout',label:'GM Dashboard Settings',tab:'settings',description:'Edit the existing dashboard layout and visible panels.',keywords:'customize customise panels grid'}
    ]
  })
]);

export const GM_TOOLKIT_TOOLS=Object.freeze(GM_TOOLKIT_GROUPS.flatMap(group=>group.tools));
export function gmToolkitTool(id){
  return GM_TOOLKIT_TOOLS.find(tool=>tool.id===id)||null;
}
export function filterGMToolkit({query='',group='all'}={}){
  const normalized=String(query??'').trim().toLocaleLowerCase().slice(0,120);
  return GM_TOOLKIT_GROUPS.filter(entry=>group==='all'||entry.id===group).map(entry=>({
    ...entry,
    tools:entry.tools.filter(tool=>
      !normalized||[tool.label,tool.description,tool.keywords,entry.label]
        .some(value=>String(value||'').toLocaleLowerCase().includes(normalized)))
  })).filter(entry=>entry.tools.length>0);
}
const records=value=>Array.isArray(value)?value:[];
const map=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
export function gmToolkitOverview({session={},characters={},workspace={},itemEcosystem={},partyLoot={}}={}){
  const status=String(session?.status||'idle');
  const activeQuests=records(workspace?.quests).filter(quest=>
    !['completed','failed','declined','expired','cancelled','archived']
      .includes(String(quest?.status||'').toLowerCase())).length;
  const shops=records(itemEcosystem?.shops);
  const hiddenDrafts=records(partyLoot?.drafts).filter(drop=>
    drop?.visibility==='hidden'&&drop?.status==='available').length;
  return Object.freeze({
    sessionStatus:status,
    linkedCharacters:Object.values(map(characters)).filter(Boolean).length,
    openQuests:activeQuests,
    shops:shops.length,
    hiddenDrafts
  });
}
