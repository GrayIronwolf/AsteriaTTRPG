export const GM_WORKSPACE_VERSION = 'asteria-react-gm-workspace-v1';

const array = value => Array.isArray(value) ? value : [];
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function defaultGMWorkspace(campaign = {}) {
  return {
    version: GM_WORKSPACE_VERSION,
    quests: [],
    notes: { privateNotes:'', sessionLogs:[] },
    economy: {
      status:'Stable', scarcity:'Normal', inflation:0, treasury:0,
      routes:[], modifiers:[]
    },
    crafting: { projects:[], recipes:[], enchantments:[] },
    gameplay: {
      encounterTemplates:[], lootTables:[], guildContracts:[],
      sharedNotes:'', professionAssignments:[]
    },
    world: {
      kingdomStatus:'Stable', settlementStatus:'Stable', economyStatus:'Stable', factionStatus:'Neutral',
      creatureActivity:'Moderate', magicalActivity:'Dormant', politicalTension:0, corruptionLevel:0,
      resourceAvailability:'Normal', weather:'Clear', gmNotes:'',
      regions:[], factions:[], events:[], settlements:[], merchants:[], timeline:[], npcs:[], changes:[], knowledge:[], discoveries:[]
    },
    campaign: {
      synopsis:String(campaign.description || campaign.synopsis || campaign.notes || ''),
      location:String(campaign.location || ''),
      playerLimit:Number(campaign.playerLimit || campaign.maxPlayers || 6),
      sessionTitle:''
    }
  };
}

export function normalizeGMWorkspace(value = {}, campaign = {}) {
  const defaults = defaultGMWorkspace(campaign);
  const source = object(value);
  const notes = object(source.notes);
  const economy = object(source.economy);
  const crafting = object(source.crafting);
  const gameplay = object(source.gameplay);
  const world = object(source.world);
  const campaignDetails = object(source.campaign);
  return {
    ...defaults,
    ...source,
    version:GM_WORKSPACE_VERSION,
    quests:array(source.quests),
    notes:{ ...defaults.notes, ...notes, sessionLogs:array(notes.sessionLogs) },
    economy:{ ...defaults.economy, ...economy, routes:array(economy.routes), modifiers:array(economy.modifiers) },
    crafting:{ ...defaults.crafting, ...crafting, projects:array(crafting.projects), recipes:array(crafting.recipes), enchantments:array(crafting.enchantments) },
    gameplay:{ ...defaults.gameplay, ...gameplay, encounterTemplates:array(gameplay.encounterTemplates), lootTables:array(gameplay.lootTables), guildContracts:array(gameplay.guildContracts), professionAssignments:array(gameplay.professionAssignments) },
    world:{ ...defaults.world, ...world, regions:array(world.regions), factions:array(world.factions), events:array(world.events), settlements:array(world.settlements), merchants:array(world.merchants), timeline:array(world.timeline), npcs:array(world.npcs), changes:array(world.changes), knowledge:array(world.knowledge), discoveries:array(world.discoveries) },
    campaign:{ ...defaults.campaign, ...campaignDetails }
  };
}

function values(value) {
  return Array.isArray(value) ? value : Object.values(object(value));
}

export function migrateLegacyGMWorkspace({ campaign = {}, gameplay = {}, world = {}, partyWorkspace = {}, itemEcosystem = {} } = {}) {
  const sourceGameplay = object(gameplay);
  const sourceWorld = object(world);
  const sourceParty = object(partyWorkspace);
  const sourceItems = object(itemEcosystem);
  const workspace = defaultGMWorkspace(campaign);
  const worldState = object(sourceWorld.world_state);

  workspace.quests = array(sourceParty.questLog).length
    ? array(sourceParty.questLog)
    : array(campaign.quests || campaign.questLog);
  workspace.notes.privateNotes = String(campaign.gmNotes || campaign.privateNotes || sourceWorld.gm?.gmNotes || '');
  workspace.notes.sessionLogs = array(campaign.sessionLogs || sourceGameplay.sessionLogs);
  workspace.economy = {
    ...workspace.economy,
    status:String(worldState.economy_status || sourceWorld.economy?.status || 'Stable'),
    scarcity:String(sourceWorld.economy?.scarcity || 'Normal'),
    routes:array(sourceWorld.economy?.routes || sourceWorld.routes),
    modifiers:array(sourceWorld.economy?.modifiers || sourceWorld.priceModifiers)
  };
  workspace.crafting = {
    projects:array(sourceGameplay.crafting?.projects || campaign.craftingProjects),
    recipes:array(sourceGameplay.crafting?.recipes || sourceGameplay.recipes),
    enchantments:array(sourceGameplay.crafting?.enchantments || sourceGameplay.enchantments)
  };
  workspace.gameplay = {
    ...workspace.gameplay,
    encounterTemplates:array(sourceGameplay.encounters?.saved || sourceGameplay.encounterTemplates),
    lootTables:array(sourceItems.lootTables || sourceGameplay.lootTables),
    guildContracts:array(sourceGameplay.guild?.contracts),
    sharedNotes:String(sourceGameplay.party?.sharedNotes || sourceParty.sharedNotes || ''),
    professionAssignments:values(sourceGameplay.professions)
  };
  workspace.world = {
    ...workspace.world,
    kingdomStatus:String(worldState.kingdom_status || 'Stable'),
    settlementStatus:String(worldState.settlement_status || 'Stable'),
    economyStatus:String(worldState.economy_status || 'Stable'),
    factionStatus:String(worldState.faction_status || 'Neutral'),
    creatureActivity:String(worldState.creature_activity || 'Moderate'),
    magicalActivity:String(worldState.magical_activity || 'Dormant'),
    politicalTension:Number(worldState.political_tension || 0),
    corruptionLevel:Number(worldState.corruption_level || 0),
    resourceAvailability:String(worldState.resource_availability || 'Normal'),
    weather:String(sourceWorld.gm?.weather || 'Clear'),
    gmNotes:String(sourceWorld.gm?.gmNotes || ''),
    regions:values(sourceWorld.regions),
    factions:values(sourceWorld.reputation || sourceWorld.factions),
    events:array(sourceWorld.events),
    settlements:values(sourceWorld.settlements),
    merchants:array(sourceWorld.merchants),
    timeline:array(sourceWorld.timeline),
    npcs:array(sourceWorld.npcs),
    changes:array(sourceWorld.persistence?.worldChanges),
    knowledge:values(sourceWorld.knowledge),
    discoveries:array(sourceWorld.map?.discoveries)
  };
  return normalizeGMWorkspace(workspace, campaign);
}
