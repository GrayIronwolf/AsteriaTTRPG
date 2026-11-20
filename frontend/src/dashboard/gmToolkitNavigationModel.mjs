import {filterGMToolkit,GM_TOOLKIT_TOOLS} from '../../../src/state/gmToolkitModel.mjs';

export {filterGMToolkit,GM_TOOLKIT_TOOLS};

export const GM_TOOL_ROUTE_OVERRIDES=Object.freeze({
  'gm-controls':'main', // Conditions, rest review and linked character tools.
  'rewards':'gameplay'   // GM XP awards and encounter/progression review.
});

const NEEDS=Object.freeze({
  main:'gm',toolkit:'gm',bestiary:'digitalGM',settings:'layout',
  inventory:'economy',information:'gm',quests:'gm',notes:'gm',
  'session-library':'digitalGM',soundboard:'digitalGM',
  'session-recordings':'digitalGM',presentation:'media',
  economy:'economy',crafting:'economy',tools:'gm',gameplay:'progression',
  world:'digitalGM','battle-maps':'media','advanced-dice':'dice',
  'random-tables':'digitalGM','encounter-rewards':'digitalGM',
  'asteria-calendar':'digitalGM','weather-environment':'digitalGM','world-atlas':'media'
});

/** Keep every directory tile hooked to an existing React/Vite route. Never
 * revive obsolete tab names, mount an old legacy script, or imply a tool works
 * when the requisite authenticated service has been disabled. */
export function gmToolkitDestination(tool,{tabs=[],enabled={}}={}){
  const tab=GM_TOOL_ROUTE_OVERRIDES[tool?.id]||tool?.tab||'';
  if(!tab||!tabs.includes(tab)||!Object.hasOwn(NEEDS,tab))
    return {tab:'',enabled:false,reason:'This GM workspace has not been restored.'};
  const capability=NEEDS[tab];
  if(enabled[capability]!==true)
    return {tab,enabled:false,reason:'This workspace is not enabled for the current campaign.'};
  return {tab,enabled:true,reason:''};
}
export function gmToolkitMetrics({session={},party=[],quests=[]}={}){
  const roster=Array.isArray(party)?party:[];
  const all=Array.isArray(quests)?quests:[];
  return Object.freeze({
    status:String(session.status||'idle'),
    characters:roster.length,
    openQuests:all.filter(row=>!['completed','failed','archived','cancelled','declined','expired']
      .includes(String(row?.status||'').toLowerCase())).length
  });
}
