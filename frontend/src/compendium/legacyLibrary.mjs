// The numbered library is a separate classification from domain/category paths.
const sections = [
  ['rules','Rules & Handbook','◇','The foundations of play.',[
    ['00','core','Core Standards'],['03','skills','Skills & Techniques'],['04','talents','Talents'],
    ['17','conditions','Conditions & Status Effects'],['handbook','handbook','Asteria Handbook']]],
  ['characters','Characters & Magic','✧','Discover who you can become.',[
    ['01','races','Races'],['02','classes','Classes'],['05','magic','Spells & Magic'],
    ['','origins','Origins & Backgrounds']]],
  ['equipment','Equipment & Resources','◈','Tools, treasures and materials.',[
    ['06','items','Items'],['07','resources','Resources & Materials'],['14','enchantments','Enchantments'],
    ['15','runestones','Runestones']]],
  ['crafting','Crafting & Building','⚒','From a pattern to a finished creation.',[
    ['08','schematics','Schematics'],['09','recipes','Recipes'],['10','blueprints','Blueprints'],
    ['11','patterns','Patterns'],['12','formulas','Formulas'],['13','designs','Designs'],
    ['18','structures','Structures'],['','professions','Professions']]],
  ['world','World & Lore','◎','Places, peoples and their stories.',[
    ['19','theology','Theology'],['20','worlds','Worlds, Realms & Planes'],['22','npcs','NPCs'],
    ['23','lore','Asteria Lore'],['24','languages','Languages'],['','factions','Factions']]],
  ['adventures','Adventures & GM','⚑','Encounters and stories to unfold.',[
    ['16','creatures','Creatures & Encounters'],['21','quests','Quests & Adventures'],['25','gm','Game Master']]]
];

export const LEGACY_LIBRARY_GROUPS = Object.freeze(sections.map(([id,title,symbol,description,rows]) => Object.freeze({
  id, title, symbol, description, categories:Object.freeze(rows.map(([code,category,title]) => Object.freeze({
    code, id:category, title, group:id
  })))
})));
export const LEGACY_LIBRARY_CATEGORIES = Object.freeze(LEGACY_LIBRARY_GROUPS.flatMap(group => group.categories));
const categories = new Map(LEGACY_LIBRARY_CATEGORIES.map(category => [category.id,category]));
const codes = new Map(LEGACY_LIBRARY_CATEGORIES.map(category => [category.code,category.id]));
const domainCategory = {
  race:'races', class:'classes', creature:'creatures', item:'items',
  spell:'magic', talent:'talents', profession:'professions', skill:'skills',
  origin:'origins', location:'worlds', religion:'theology', faction:'factions',
  lore:'lore', handbook:'handbook'
};
const keywords = {
  core:/core standards/, conditions:/conditions|status effects/,
  resources:/resources|materials|flora|minerals|plants|herbs|ores|ingots/,
  enchantments:/enchantments?/, runestones:/runestones?/, schematics:/schematics?/,
  recipes:/recipes?/, blueprints:/blueprints?/, patterns:/patterns?/, formulas:/formulas?/,
  designs:/designs|jewellery design/, structures:/structures|buildings/,
  npcs:/^npcs?$|non.player characters/, languages:/languages?/,
  quests:/quests?|adventures?/, gm:/game master|gm resources/
};

export function getLibraryCategory(id) {
  return categories.get(id);
}

export function legacyLibraryCategory(entry = {}) {
  if (categories.has(entry.libraryCategory)) return entry.libraryCategory;
  const meta = entry.metadata || {};
  const source = String(meta.sourceCategory || meta.obsidianCategory || '');
  const code = source.match(/^(\d{2})(?:\D|$)/)?.[1];
  if (codes.has(code)) return codes.get(code);
  const fallback = Object.hasOwn(domainCategory,entry.domain) ? domainCategory[entry.domain] : 'handbook';
  if (!['item','handbook','lore'].includes(entry.domain)) return fallback;
  const labels = [meta.type,meta.craftingCategory,...(entry.categoryPath || [])]
    .filter(Boolean).join(' ').toLowerCase();
  return Object.entries(keywords).find(([,pattern]) => pattern.test(labels))?.[0] || fallback;
}

export function getLibraryCounts(entries) {
  const groups = new Map(LEGACY_LIBRARY_GROUPS.map(group => [group.id,0]));
  const counts = new Map(LEGACY_LIBRARY_CATEGORIES.map(category => [category.id,0]));
  for (const entry of entries) {
    const id = legacyLibraryCategory(entry);
    const {group} = getLibraryCategory(id);
    counts.set(id,counts.get(id)+1);
    groups.set(group,groups.get(group)+1);
  }
  return {groups,categories:counts};
}

// Visibility is always public here. Internal source paths are never facet data.
export const LEGACY_LIBRARY_FILTERS = Object.freeze({
  race:['category','region','essenceAffinity','size','playable','language','loreStatus'],
  class:['category','role','magicType','difficulty','primaryStat','secondaryStat','availability'],
  creature:['category','threatTier','levelRange','size','biome','habitat','hostility','magical','boss','soulTier','encounterRole'],
  item:['category','collection','rarity','itemType','craftingCategory','materialType','affinity'],
  spell:['category','spellSchool','magicType','element','damageType','castingType','rank'],
  talent:['category','talentTier','role','primaryStat','className','rank'],
  profession:['category','professionType','toolType','craftingCategory','region','rank'],
  skill:['category','skillRank','primaryStat','trainingType'],
  origin:['category','region','faction','status'],
  location:['category','locationType','region','biome','climate','faction','settlementType'],
  religion:['category','pantheon','deity','divineDomain','alignment','region'],
  faction:['category','factionType','region','alignment','influence','status'],
  lore:['category','era','region','faction','loreStatus'],
  handbook:['category','status']
});

export function libraryFilterFields(domain) {
  return Object.hasOwn(LEGACY_LIBRARY_FILTERS,domain) ? LEGACY_LIBRARY_FILTERS[domain] : [];
}
