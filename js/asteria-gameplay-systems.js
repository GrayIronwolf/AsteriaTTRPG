/* Asteria Phase 3A Character Forge.
   Frontend-safe gameplay foundations connected to the universal compendium database. */
(function(){
  'use strict';

  const VERSION = 'asteria-character-forge-final';
  const STORE_KEY = 'asteria.phase3.gameplay.v1';
  const ATTRIBUTE_KEYS = ['strength','dexterity','agility','constitution','endurance','intelligence','wisdom','charisma','luck'];
  const FORGE_TABS = ['Race','Class','Patron','Appearance','Origin','Characteristics','Magic','Skills','Affinity Rolls','Equipment','Review'];
  const FORGE_CHARACTERISTICS = ATTRIBUTE_KEYS;
  const FORGE_STAT_LABELS = { strength:'STR', dexterity:'DEX', agility:'AGI', constitution:'CON', endurance:'END', intelligence:'INT', wisdom:'WIS', charisma:'CHA', luck:'LCK' };
  const CHARACTERISTIC_TIER_RULES = [
    { label:'Tier 0', min:0, max:19, bonus:0 },
    { label:'Tier I', min:20, max:39, bonus:1 },
    { label:'Tier II', min:40, max:59, bonus:2 },
    { label:'Tier III', min:60, max:79, bonus:3 },
    { label:'Tier IV', min:80, max:99, bonus:4 },
    { label:'Tier V', min:100, max:100, bonus:5, openEnded:true }
  ];
  const CHARACTERISTIC_KEY_ALIASES = {
    str:'strength', strength:'strength',
    dex:'dexterity', dexterity:'dexterity',
    agi:'agility', agility:'agility',
    con:'constitution', constitution:'constitution',
    end:'endurance', endurance:'endurance',
    int:'intelligence', intelligence:'intelligence',
    wis:'wisdom', wisdom:'wisdom',
    cha:'charisma', charisma:'charisma',
    lck:'luck', luck:'luck'
  };
  const CARD_COLOUR_OPTIONS = ['#26d9ff','#9b5cff','#d94cff','#2fe68a','#d4a24a','#ef4444'];
  const MAX_CHARACTER_CLASSES = 2;
  const MAGIC_TYPE_GROUPS = [
    { label:'Basic Elements', types:['Air Magic','Earth Magic','Water Magic','Fire Magic','Life Magic','Death Magic','Light Magic','Dark Magic'] },
    { label:'Higher Elements', types:['Celestial Magic','Infernal Magic','Blood Magic','Chaos Magic','Eldritch Magic','Fae Magic','Fate Magic','Space Magic','Spirit Magic','Time Magic','Abyssal Magic'] }
  ];
  const CLASS_MAGIC_CATEGORY_SLOTS = {
    'rogue-classes':1,
    'religious-classes':2,
    'ranger-classes':1,
    'martial-classes':1,
    'magical-classes':4,
    'dark-classes':2
  };
  const CLASS_MAGIC_REQUIRED = {
    druid:['Earth Magic'],
    bloodhunter:['Blood Magic'],
    primal:['Chaos Magic'],
    reaper:['Death Magic']
  };
  const CLASS_MAGIC_NOTES = {
    cleric:'One magical element slot must be patron-linked.',
    creed:'One magical element slot must be patron-linked.',
    inquisitor:'One magical element slot must be patron-linked.',
    paladin:'One magical element slot must be patron-linked.',
    sentinel:'One magical element slot must be patron-linked.',
    mancer:'Choose one selected element for affinity advantage. Other selected elements are treated as disadvantage.',
    druid:'Druid requires Earth Magic.',
    bloodhunter:'Blood Magic is required.',
    primal:'Chaos Magic is required.',
    reaper:'Death Magic is required.'
  };
  function magicLibrary(){
    return window.ASTERIA_MAGIC_LIBRARY || null;
  }
  function magicGroups(){
    const library = magicLibrary();
    if(library?.groups?.length){
      return library.groups.map(group => ({
        label:group.label,
        elements:group.elements.map(element => ({ ...element, type:element.name }))
      }));
    }
    return MAGIC_TYPE_GROUPS.map(group => ({
      label:group.label,
      elements:group.types.map(type => ({
        type,
        name:type,
        label:type.replace(/\s+Magic$/i, ''),
        slug:slug(type),
        color:'var(--asteria-accent,#26d9ff)',
        desc:'Magic information coming soon.'
      }))
    }));
  }
  function magicInfoByName(name){
    const library = magicLibrary();
    const key = library?.slugFor?.(name);
    return (key && library.bySlug?.[key]) || magicGroups().flatMap(group => group.elements).find(element => element.name === name || element.type === name) || { name, label:String(name || '').replace(/\s+Magic$/i, ''), color:'#26d9ff', desc:'Magic information coming soon.' };
  }
  const CREATOR_STEPS = FORGE_TABS;
  const SYSTEMS = [
    { id:'characterCreator', label:'Character Forge', tag:'Player', tabs:FORGE_TABS },
    { id:'characterSheet', label:'Character Sheet', tag:'Character', tabs:['Sheet','Inventory','Notes'] },
    { id:'appearanceBuilder', label:'Appearance Builder', tag:'Character', tabs:['Preview','Controls','Profile'] },
    { id:'talentTree', label:'Talent Tree Viewer', tag:'Progression', tabs:['Class Tree','Locked Talents','Planner'] },
    { id:'encounterBuilder', label:'Encounter Builder', tag:'GM', tabs:['Build','Creatures','Rewards'] },
    { id:'lootGenerator', label:'Loot Generator', tag:'GM', tabs:['Random Loot','Manual Loot','History'] },
    { id:'craftingSystem', label:'Crafting System', tag:'System', tabs:['Recipes','Ingredients','Checks'] },
    { id:'professionSystem', label:'Profession System', tag:'Campaign', tabs:['Progress','Recipes','GM Assign'] },
    { id:'partySystem', label:'Party System', tag:'Campaign', tabs:['Members','Shared Notes','Guild Bank'] },
    { id:'adventureGuild', label:'Adventure Guild', tag:'Guild', tabs:['Contracts','Rank','Bank'] },
    { id:'gmDashboard', label:'GM Campaign Tools', tag:'GM', tabs:['Overview','Encounters','World State'] }
  ];
  const FALLBACK_BACKGROUNDS = [
    { slug:'wanderer', title:'Wanderer', tags:['travel','survival'], skills:['Foraging','Survival'] },
    { slug:'apprentice', title:'Guild Apprentice', tags:['craft','city'], skills:['Foraging'] },
    { slug:'outcast', title:'Outcast', tags:['street','shadow'], skills:['Stealth'] },
    { slug:'scholar', title:'Scholar', tags:['study','lore'], skills:['Arcana'] }
  ];
  const FALLBACK_SKILLS = [
    { slug:'archery', title:'Archery', category:'Combat', summary:'Use bows, ranged posture, and battlefield aim.' },
    { slug:'stealth', title:'Stealth', category:'Subterfuge', summary:'Move quietly, hide, and avoid notice.' },
    { slug:'survival', title:'Survival', category:'Wilderness', summary:'Track, forage, navigate, and endure harsh regions.' },
    { slug:'arcana', title:'Arcana', category:'Knowledge', summary:'Identify magical effects, rituals, and spell structures.' }
  ];
  const EQUIPMENT_PACKS = [
    {
      slug:'adventurer-pack',
      title:'Adventurer Pack',
      category:'General',
      summary:'A balanced kit for travel, ruins, and first expeditions.',
      items:['Iron Rations','Health Potion','Longsword','Wooden Shield']
    },
    {
      slug:'scholar-pack',
      title:'Scholar Pack',
      category:'Knowledge',
      summary:'A research-focused kit for lore, notes, and careful travel.',
      items:['Mana Potion','Health Potion']
    },
    {
      slug:'explorer-pack',
      title:'Explorer Pack',
      category:'Travel',
      summary:'Supplies for wilderness routes, scouting, and difficult terrain.',
      items:['Iron Rations','Stamina Potion','Longbow']
    },
    {
      slug:'soldier-pack',
      title:'Soldier Pack',
      category:'Martial',
      summary:'Simple frontline equipment for a new martial character.',
      items:['Longsword','Wooden Shield','Health Potion']
    },
    {
      slug:'hunter-pack',
      title:'Hunter Pack',
      category:'Ranged',
      summary:'A practical kit for tracking, archery, and field survival.',
      items:['Longbow','Stamina Potion','Iron Rations']
    }
  ];
  const SKILL_RANKS = ['Novice','Initiate','Apprentice','Journeyman','Adept','Master','Grandmaster'];
  const AFFINITY_RANKS = [
    { label:'Novice', min:1, max:9, range:'01-09', modifier:-2 },
    { label:'Initiate', min:10, max:24, range:'10-24', modifier:-1 },
    { label:'Apprentice', min:25, max:44, range:'25-44', modifier:0 },
    { label:'Journeyman', min:45, max:69, range:'45-69', modifier:1 },
    { label:'Adept', min:70, max:84, range:'70-84', modifier:2 },
    { label:'Master', min:85, max:97, range:'85-97', modifier:3 },
    { label:'Grandmaster', min:98, max:100, range:'98-100', modifier:4 }
  ];

  let state = loadState();
  let activeSystem = 'characterCreator';
  let activeTab = '';
  let forgeMode = 'hub';
  let forgeDetailEntry = null;
  let originalOpenDashboard = null;
  let originalWorkspaceEntries = null;

  function byId(id){ return document.getElementById(id); }
  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }
  function esc(value){ return String(value ?? '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char])); }
  function slug(value){ return String(value || '').trim().toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'entry'; }
  function array(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
  function titleCase(value){ return String(value || '').replace(/[-_]+/g,' ').replace(/\b\w/g, char => char.toUpperCase()).trim(); }
  function now(){ return new Date().toISOString(); }
  function currentUserKey(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return session.uid || session.account || session.email || 'local-player';
  }
  function isGMMode(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return document.body?.dataset?.role === 'gm' || session.role === 'gm' || byId('gm')?.classList.contains('show');
  }
  function currentAccountKeys(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    const keys = [session.uid, session.account, session.user, session.email].filter(Boolean);
    return Array.from(new Set(keys.length ? keys : ['local-player']));
  }
  function accountCharacterIds(){
    window.loadAccountState?.();
    const keys = currentAccountKeys();
    const ids = new Set();
    keys.forEach(key => array(window.accountUsers?.[key]?.characters).forEach(id => {
      if(window.chars?.[id]) ids.add(id);
    }));
    Object.entries(window.chars || {}).forEach(([id, character]) => {
      if(keys.includes(character?.ownerUid) || keys.includes(character?.accountId) || keys.includes(character?.uid)) ids.add(id);
    });
    if(window.session?.character && window.chars?.[window.session.character]) {
      const character = window.chars[window.session.character];
      if(ids.has(window.session.character) || keys.includes(character?.ownerUid) || keys.includes(character?.accountId) || keys.includes(character?.uid)) ids.add(window.session.character);
    }
    return Array.from(ids);
  }
  function activeCampaign(){
    const index = Number(window.activeCampaign || 0);
    return (window.campaigns || [])[index] || (window.campaigns || [])[0] || null;
  }
  function selectedCharacterId(){
    return window.session?.character || window.selected || Object.keys(window.chars || {})[0] || '';
  }
  function selectedCharacter(){
    const id = selectedCharacterId();
    return id ? Object.assign({ id }, window.chars?.[id] || {}) : null;
  }

  function defaultState(){
    return {
      version:VERSION,
      drafts:{
        characterCreator:{
          activeTab:'Race',
          editCharacterId:'',
          lockedClassSlug:'',
          raceSlug:'',
          classSlug:'',
          classMode:'single',
          extraClassSlugs:[],
          activePatronClassSlug:'',
          patronCategory:'',
          originSlug:'',
          backgroundSlug:'',
          equipmentPackSlug:'',
          cardColour:CARD_COLOUR_OPTIONS[0],
          attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 10])),
          characteristics:Object.fromEntries(FORGE_CHARACTERISTICS.map(key => [key, 10])),
          magicTypes:[],
          patronMagicType:'',
          classPatrons:{},
          mancerAdvantageMagicType:'',
          affinityRolls:{ magic:{}, skills:{} },
          forgeCategories:{ race:[], class:[] },
          forgeDrill:{ race:[], class:[] },
          forgeSearch:{ race:'', class:'', patron:'', skill:'' },
          skillCategory:'',
          skills:[],
          equipment:[],
          appearance:{},
          origin:{
            birthplace:'',
            history:'',
            backstory:'',
            personality:'',
            goals:'',
            ideals:'',
            flaws:'',
            notes:''
          },
          family_tree:{
            father:'',
            mother:'',
            siblings:'',
            partner:'',
            children:''
          },
          details:{ name:'', age:'', pronouns:'' }
        }
      },
      characters:{},
      parties:{},
      encounters:{
        active:{
          id:'encounter-local',
          name:'New Encounter',
          partySize:4,
          partyLevel:1,
          biome:'',
          threatTier:'',
          difficulty:'Standard',
          creatures:[],
          notes:'',
          xp:0,
          lootPreview:[]
        }
      },
      lootRolls:[],
      crafting:{
        recipes:[],
        activeRecipe:null
      },
      professions:{},
      guild:{
        rank:'Unregistered',
        reputation:0,
        contracts:[],
        bounties:[],
        notices:[],
        guildBank:{ coins:{ copper:0, silver:0, gold:0 }, items:[] }
      },
      worldState:{ loreUnlocks:[], npcNotes:[], sessionLogs:[], gmNotes:'' },
      party:{ sharedNotes:'', chat:[], sharedInventory:[], questLog:[], sessionHistory:[] }
    };
  }

  function loadState(){
    try {
      return Object.assign(defaultState(), JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
    } catch {
      return defaultState();
    }
  }

  function saveState(reason = 'phase3-save'){
    state.version = VERSION;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    window.saveAsteriaState?.();
    window.saveAccountState?.();
    window.AsteriaDataSync?.scheduleSave?.(reason);
    return state;
  }

  function databaseEntries(domain){
    const api = window.AsteriaUniversalCompendium;
    const list = typeof api?.entries === 'function' ? api.entries() : array(window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries);
    return list.filter(entry => entry.domain === domain || entry.type === domain).sort((a,b) => String(a.title || a.name).localeCompare(String(b.title || b.name)));
  }

  function metadataValue(entry, keys){
    const metadata = entry?.metadata || {};
    const filters = entry?.filters || {};
    for(const key of keys){
      if(metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== '') return metadata[key];
      if(filters[key] !== undefined && filters[key] !== null && filters[key] !== '') return filters[key];
    }
    return '';
  }

  function isPublicPlayerEntry(entry){
    const visibility = String(entry?.visibility || entry?.metadata?.visibility || '').toLowerCase();
    const status = String(entry?.metadata?.status || entry?.metadata?.availability || '').toLowerCase();
    return !entry?.gmOnly && !visibility.includes('gm') && !status.includes('gm') && !status.includes('hidden');
  }

  function isPlayableEntry(entry){
    const playable = metadataValue(entry, ['playable']);
    const availability = String(metadataValue(entry, ['availability']) || '').toLowerCase();
    return playable === true || String(playable).toLowerCase() === 'true' || availability === 'playable' || availability === 'true';
  }

  function normaliseForgeEntry(domain, entry){
    const title = entry?.title || entry?.name || 'Untitled';
    const path = array(entry?.categoryPath || entry?.path);
    const metadata = Object.assign({}, entry?.metadata || {}, entry || {});
    const filters = Object.assign({}, entry?.filters || {}, {
      category:entry?.category || path[path.length - 1] || titleCase(domain),
      primaryCategory:entry?.primaryCategory || path[0] || '',
      role:entry?.role || entry?.metadata?.role || '',
      difficulty:entry?.difficulty || entry?.metadata?.difficulty || '',
      size:entry?.size || entry?.metadata?.size || ''
    });
    return Object.assign({}, entry || {}, {
      domain,
      type:domain,
      title,
      name:title,
      slug:slug(entry?.slug || title),
      categoryPath:path,
      path,
      category:entry?.category || path[path.length - 1] || titleCase(domain),
      summary:entry?.summary || entry?.role || entry?.notes || entry?.metadata?.summary || 'Information coming soon.',
      metadata,
      filters,
      imagePath:entry?.imagePath || entry?.image || '',
      images:entry?.images || {},
      tags:array(entry?.tags || entry?.metadata?.tags)
    });
  }

  function characteristicKey(value){
    return CHARACTERISTIC_KEY_ALIASES[String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '')] || '';
  }

  function normalizeCharacteristicMap(source, fallback = 0){
    const out = Object.fromEntries(FORGE_CHARACTERISTICS.map(key => [key, fallback]));
    if(!source || typeof source !== 'object') return out;
    Object.entries(source).forEach(([key, value]) => {
      const normalized = characteristicKey(key);
      if(normalized) out[normalized] = Number(value || 0);
    });
    return out;
  }

  function tierInfoForValue(value){
    const numeric = Number(value || 0);
    return CHARACTERISTIC_TIER_RULES.find(rule => numeric >= rule.min && (rule.openEnded || numeric <= rule.max)) || CHARACTERISTIC_TIER_RULES[0];
  }

  function tierCapFromValue(value){
    if(value && typeof value === 'object'){
      const maxScore = Number(value.maxScore ?? value.max ?? value.score ?? 100);
      return { label:value.label || tierInfoForValue(maxScore).label, maxScore:Number.isFinite(maxScore) ? maxScore : 100 };
    }
    if(typeof value === 'number') return { label:tierInfoForValue(value).label, maxScore:value };
    const text = String(value || '').trim();
    const lowerText = text.toLowerCase();
    if(!text) return { label:'Tier V (100+)', maxScore:100 };
    const numeric = Number(text.match(/\d+/)?.[0]);
    if(Number.isFinite(numeric) && numeric > 5) return { label:tierInfoForValue(numeric).label, maxScore:numeric };
    if(lowerText.includes('tier v') || lowerText === 'v' || lowerText.includes('t5')) return { label:'Tier V (100+)', maxScore:100 };
    if(lowerText.includes('tier iv') || lowerText === 'iv' || lowerText.includes('t4')) return { label:'Tier IV (80-99)', maxScore:99 };
    if(lowerText.includes('tier iii') || lowerText === 'iii' || lowerText.includes('t3')) return { label:'Tier III (60-79)', maxScore:79 };
    if(lowerText.includes('tier ii') || lowerText === 'ii' || lowerText.includes('t2')) return { label:'Tier II (40-59)', maxScore:59 };
    if(lowerText.includes('tier i') || lowerText === 'i' || lowerText.includes('t1')) return { label:'Tier I (20-39)', maxScore:39 };
    if(lowerText.includes('tier 0') || lowerText.includes('t0')) return { label:'Tier 0 (0-19)', maxScore:19 };
    return { label:text, maxScore:100 };
  }

  function normalizeCharacteristicCaps(source){
    const out = Object.fromEntries(FORGE_CHARACTERISTICS.map(key => [key, tierCapFromValue('Tier V')]));
    if(!source || typeof source !== 'object') return out;
    Object.entries(source).forEach(([key, value]) => {
      const normalized = characteristicKey(key);
      if(normalized) out[normalized] = tierCapFromValue(value);
    });
    return out;
  }

  function normalizeCharacteristicTextMap(source){
    const out = Object.fromEntries(FORGE_CHARACTERISTICS.map(key => [key, 'Manual']));
    if(!source || typeof source !== 'object') return out;
    Object.entries(source).forEach(([key, value]) => {
      const normalized = characteristicKey(key);
      if(normalized) out[normalized] = String(value || 'Manual');
    });
    return out;
  }

  function raceCharacteristicRulesFor(entry){
    const metadata = entry?.metadata || {};
    const rollModifiers = metadata.rollModifiers || metadata.roll_modifiers || metadata.characteristicModifiers || metadata.characteristic_modifiers || entry?.rollModifiers || entry?.characteristicModifiers || {};
    const tierCaps = metadata.tierCaps || metadata.tier_caps || metadata.characteristicTierCaps || metadata.characteristic_tier_caps || entry?.tierCaps || entry?.characteristicTierCaps || {};
    const statRolls = metadata.statRolls || metadata.stat_rolls || metadata.characteristicStatRolls || metadata.characteristic_stat_rolls || entry?.statRolls || entry?.characteristicStatRolls || {};
    return {
      race:entry?.title || entry?.name || 'Unselected Race',
      rollFormula:metadata.characteristicRolls || metadata.characteristic_rolls || entry?.characteristicRolls || entry?.characteristic_rolls || 'Manual roll, then apply race +/- modifiers',
      modifiers:normalizeCharacteristicMap(rollModifiers, 0),
      statRolls:normalizeCharacteristicTextMap(statRolls),
      tierCaps:normalizeCharacteristicCaps(tierCaps)
    };
  }

  function raceInfoPayloadForEntry(entry){
    const metadata = entry?.metadata || {};
    const pick = (...keys) => {
      for(const key of keys){
        const value = metadata[key] ?? entry?.[key];
        if(value !== undefined && value !== null && value !== '') return value;
      }
      return '';
    };
    return {
      title:entry?.title || entry?.name || '',
      featuresMarkdown:pick('racialFeaturesMarkdown','racial_features_markdown'),
      traitsMarkdown:pick('racialTraitsMarkdown','racial_traits_markdown'),
      movementMarkdown:pick('racialMovementMarkdown','racial_movement_markdown'),
      bonusesMarkdown:pick('racialBonusesMarkdown','racial_bonuses_markdown','racialDrawbacksMarkdown','racial_drawbacks_markdown'),
      loreMarkdown:pick('loreMarkdown','lore_markdown'),
      overviewMarkdown:pick('overviewMarkdown','overview_markdown'),
      traits:array(pick('racialTraits','racial_traits')),
      characteristicRows:array(pick('characteristicRows','characteristic_rows')),
      statRolls:pick('statRolls','stat_rolls','characteristicStatRolls','characteristic_stat_rolls') || {},
      rollModifiers:pick('rollModifiers','roll_modifiers','characteristicModifiers','characteristic_modifiers') || {},
      tierCaps:pick('tierCaps','tier_caps','characteristicTierCaps','characteristic_tier_caps') || {},
      movement:pick('movement'),
      senses:pick('senses'),
      languages:pick('languages'),
      magicAffinity:pick('magicAffinity','magic_affinity')
    };
  }

  function finalForgeCharacteristics(d = draft()){
    const base = normalizedCharacteristics(d.characteristics);
    const rules = raceCharacteristicRulesFor(entryBySlug('race', d.raceSlug));
    return Object.fromEntries(FORGE_CHARACTERISTICS.map(key => {
      const cap = Number(rules.tierCaps[key]?.maxScore ?? 100);
      const modified = Number(base[key] || 0) + Number(rules.modifiers[key] || 0);
      return [key, Math.max(0, Math.min(cap, modified))];
    }));
  }

  function signed(value){
    const numeric = Number(value || 0);
    return numeric > 0 ? `+${numeric}` : String(numeric);
  }

  function compendiumEntriesForDomain(domain){
    if(domain === 'race'){
      const list = typeof window.AsteriaRaceCompendium?.entries === 'function' ? window.AsteriaRaceCompendium.entries() : [];
      return list.map(entry => normaliseForgeEntry('race', entry));
    }
    if(domain === 'class'){
      const list = typeof window.AsteriaCodexCompendium?.classEntries === 'function' ? window.AsteriaCodexCompendium.classEntries() : [];
      return list.map(entry => normaliseForgeEntry('class', entry));
    }
    return [];
  }

  function playableSlugSet(domain){
    return new Set(databaseEntries(domain)
      .filter(entry => isPublicPlayerEntry(entry) && isPlayableEntry(entry))
      .flatMap(entry => [entry.slug, slug(entry.title || entry.name)])
      .filter(Boolean));
  }

  function forgeDatabaseEntries(domain){
    const universal = databaseEntries(domain).map(entry => normaliseForgeEntry(domain, entry)).filter(isPublicPlayerEntry);
    if(domain === 'race'){
      let entries = compendiumEntriesForDomain('race').filter(isPublicPlayerEntry);
      if(!entries.length) entries = universal;
      return entries.map(entry => Object.assign({}, entry, { playable:true, availability:'playable' })).sort((a,b) => String(a.title).localeCompare(String(b.title)));
    }
    if(domain === 'class'){
      let entries = compendiumEntriesForDomain('class').filter(isPublicPlayerEntry);
      if(!entries.length) entries = universal;
      const playable = entries.filter(entry => entry.playable !== false && (isPlayableEntry(entry) || entry.playable === true || entry.playable === undefined));
      return (playable.length ? playable : entries).sort((a,b) => String(a.title).localeCompare(String(b.title)));
    }
    return universal;
  }

  function entryCategory(entry, fallback = ''){
    const path = array(entry?.categoryPath || entry?.path);
    return metadataValue(entry, ['raceCategory','race_category','classCategory','class_category','category']) || entry?.category || path[path.length - 1] || path[0] || fallback;
  }

  function entryImage(entry, kind = ''){
    if(!entry) return '';
    if(kind === 'class') return entry.images?.symbol || entry.imagePath || entry.image || entry.images?.image || '';
    return entry.imagePath || entry.image || entry.images?.female || entry.images?.male || entry.images?.image || entry.images?.portrait || entry.images?.artwork || entry.images?.symbol || '';
  }

  function renderMarkdown(markdown){
    const body = String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
    if(typeof window.mdToHtml === 'function') return window.mdToHtml(body);
    return body
      .split(/\r?\n{2,}/)
      .map(block => {
        const heading = block.match(/^(#{1,4})\s+(.+)$/);
        if(heading) return `<h${Math.min(6, heading[1].length + 1)}>${esc(heading[2])}</h${Math.min(6, heading[1].length + 1)}>`;
        if(/^[-*]\s+/m.test(block)) return `<ul>${block.split(/\r?\n/).filter(Boolean).map(line => `<li>${esc(line.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`;
        return `<p>${esc(block)}</p>`;
      })
      .join('');
  }

  function forgeTabsForDraft(d = state.drafts?.characterCreator || {}){
    return religiousClassSelections(d).length ? FORGE_TABS.slice() : FORGE_TABS.filter(tab => tab !== 'Patron');
  }

  function tabIndex(tab = activeTab, d = state.drafts?.characterCreator || {}){
    return Math.max(0, forgeTabsForDraft(d).indexOf(tab));
  }

  function firstEntry(domain){
    return (domain === 'race' || domain === 'class' ? forgeDatabaseEntries(domain) : databaseEntries(domain))[0] || null;
  }

  function entryBySlug(domain, slugValue){
    const key = slug(slugValue);
    const source = domain === 'race' || domain === 'class' ? forgeDatabaseEntries(domain) : databaseEntries(domain);
    return source.find(entry => entry.slug === key || slug(entry.title || entry.name) === key) || null;
  }

  function classEntryFromValue(value){
    const key = slug(value);
    if(!key) return null;
    return forgeDatabaseEntries('class').find(entry => entry.slug === key || slug(entry.title || entry.name) === key) || null;
  }

  function classSlugFromValue(value){
    return classEntryFromValue(value)?.slug || slug(value);
  }

  function classSlugsFromDraft(d){
    const primary = classSlugFromValue(d.classSlug || d.lockedClassSlug);
    const extra = d.classMode === 'multi' ? array(d.extraClassSlugs).map(classSlugFromValue).filter(Boolean).filter(value => value !== primary) : [];
    return Array.from(new Set([primary, ...extra].filter(Boolean))).slice(0, MAX_CHARACTER_CLASSES);
  }

  function classEntriesFromDraft(d){
    return classSlugsFromDraft(d).map(slugValue => entryBySlug('class', slugValue)).filter(Boolean);
  }

  function classDisplayNameFromDraft(d){
    const names = classEntriesFromDraft(d).map(entry => entry.title);
    return names.length ? names.join(' / ') : classNameFromDraft(d);
  }

  function safeCardColour(value){
    const colour = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(colour) ? colour.toLowerCase() : CARD_COLOUR_OPTIONS[0];
  }

  function classNameFromDraft(draft){
    return entryBySlug('class', draft.classSlug)?.title || draft.classSlug || '';
  }

  function classKeyFromEntry(entry, fallbackTitle = ''){
    const trees = window.asteriaClassTalentTrees || window.AsteriaProgressionUI?.asteriaClassTalentTrees || {};
    const raw = [entry?.slug, entry?.metadata?.slug, entry?.title, entry?.name, fallbackTitle].filter(Boolean);
    const candidates = [];
    raw.forEach(value => {
      const key = slug(value);
      if(key){
        candidates.push(key);
        candidates.push(key.replace(/-/g, ''));
      }
    });
    return candidates.find(key => trees[key]) || candidates[0] || '';
  }

  function classInfoFromEntry(entry, title = '', key = ''){
    return {
      slug:entry?.slug || slug(title),
      key,
      title:title || entry?.title || '',
      category:metadataValue(entry, ['classCategory','class_category','category']) || entry?.category || array(entry?.categoryPath)[0] || '',
      role:metadataValue(entry, ['role']) || '',
      primaryStat:metadataValue(entry, ['primaryStat','primary_stat']) || '',
      secondaryStat:metadataValue(entry, ['secondaryStat','secondary_stat']) || '',
      combatStyle:metadataValue(entry, ['combatStyle','combat_style']) || '',
      magicType:metadataValue(entry, ['magicType','magic_type']) || '',
      difficulty:metadataValue(entry, ['difficulty']) || ''
    };
  }

  function classMagicCategoryKey(entry){
    return slug(metadataValue(entry, ['classCategory','class_category','category']) || entry?.category || array(entry?.categoryPath)[0] || '');
  }

  function classMagicBaseSlots(entry){
    return CLASS_MAGIC_CATEGORY_SLOTS[classMagicCategoryKey(entry)] || 1;
  }

  function isReligiousClassEntry(entry){
    return classMagicCategoryKey(entry) === 'religious-classes';
  }

  function patronDatabaseEntries(){
    return databaseEntries('religion')
      .filter(entry => String(entry?.sourcePath || '').replace(/\\/g, '/').toLowerCase().startsWith('content/theology/'))
      .filter(isPublicPlayerEntry)
      .sort((a, b) => String(a.title || a.name).localeCompare(String(b.title || b.name)));
  }

  function patronCategory(entry){
    return metadataValue(entry, ['pantheon','court','category']) || entry?.category || 'Theology';
  }

  function patronCategories(){
    const preferred = ['Primordials','Pantheon of Elements','Aetherion Pantheon','The Outsiders','The Nethyros Pantheon','Dark Court','Light Court','Veilborn Court','The Shadow Court'];
    const available = new Set(patronDatabaseEntries().map(patronCategory).filter(Boolean));
    return preferred.filter(category => available.has(category)).concat([...available].filter(category => !preferred.includes(category)).sort());
  }

  function classPatronKey(entry){
    return classSlugFromValue(entry?.slug || entry?.title || entry?.name);
  }

  function religiousClassSelections(d = draft()){
    return classSlugsFromDraft(d)
      .map((slugValue, index) => {
        const entry = entryBySlug('class', slugValue);
        if(!entry || !isReligiousClassEntry(entry)) return null;
        return {
        entry,
        slug:classPatronKey(entry),
        title:entry.title || entry.name || 'Religious Class',
        role:index === 0 ? 'Primary' : 'Secondary'
        };
      })
      .filter(Boolean);
  }

  function syncReligiousClassPatrons(d = draft()){
    d.classPatrons = d.classPatrons && typeof d.classPatrons === 'object' && !Array.isArray(d.classPatrons) ? d.classPatrons : {};
    const allowed = new Set(religiousClassSelections(d).map(item => item.slug));
    Object.keys(d.classPatrons).forEach(key => {
      if(!allowed.has(key)) delete d.classPatrons[key];
    });
    return d.classPatrons;
  }

  function patronEntryBySlug(slugValue){
    const key = slug(slugValue);
    if(!key) return null;
    return patronDatabaseEntries().find(entry => entry.slug === key || slug(entry.title || entry.name) === key) || null;
  }

  function patronTitleLine(entry){
    if(!entry) return '';
    return metadataValue(entry, ['deityTitle','deity_title','divineDomain','divine_domain','domain']) || entry.category || '';
  }

  function classPatronRecordsForDraft(d = draft()){
    const patrons = syncReligiousClassPatrons(d);
    return religiousClassSelections(d).map(item => {
      const patronSlug = patrons[item.slug] || '';
      const patronEntry = patronEntryBySlug(patronSlug);
      return {
        classSlug:item.slug,
        className:item.title,
        classRole:item.role,
        patronSlug:patronEntry?.slug || patronSlug,
        patronName:patronEntry?.title || patronEntry?.name || patronSlug,
        patronDomain:patronTitleLine(patronEntry)
      };
    }).filter(record => record.patronSlug || record.patronName);
  }

  function classPatronMapFrom(value){
    if(value && typeof value === 'object' && !Array.isArray(value)) return Object.assign({}, value);
    if(Array.isArray(value)) {
      return Object.fromEntries(value
        .map(record => [record.classSlug || record.class || record.className, record.patronSlug || record.patron || record.patronName])
        .filter(([key, patron]) => key && patron)
        .map(([key, patron]) => [classSlugFromValue(key), slug(patron) || patron]));
    }
    return {};
  }

  function religiousPatronIssues(d = draft()){
    const religious = religiousClassSelections(d);
    if(!religious.length) return [];
    if(!patronDatabaseEntries().length) return ['Theology patrons are not loaded yet.'];
    const patrons = syncReligiousClassPatrons(d);
    return religious
      .filter(item => !patrons[item.slug])
      .map(item => `Choose a patron for ${item.title}.`);
  }

  function classMagicRulesForDraft(d = draft()){
    const entries = classEntriesFromDraft(d);
    const rules = {
      slots:0,
      required:[],
      notes:[],
      classes:[],
      hasPatronRequirement:false,
      hasMancer:false
    };
    entries.forEach((entry, index) => {
      const key = slug(entry?.title || entry?.name);
      const categoryKey = classMagicCategoryKey(entry);
      const baseSlots = classMagicBaseSlots(entry);
      const secondaryBonus = categoryKey === 'magical-classes' ? 2 : 1;
      const appliedSlots = index === 0 ? baseSlots : secondaryBonus;
      const required = array(CLASS_MAGIC_REQUIRED[key]);
      const note = CLASS_MAGIC_NOTES[key] || (categoryKey === 'religious-classes' ? 'One magical element slot must be patron-linked.' : '');
      if(categoryKey === 'religious-classes') rules.hasPatronRequirement = true;
      if(key === 'mancer') rules.hasMancer = true;
      rules.slots += appliedSlots;
      rules.required.push(...required);
      if(note) rules.notes.push(`${entry.title}: ${note}`);
      rules.classes.push({
        title:entry.title || entry.name || 'Class',
        category:entryCategory(entry, 'Class'),
        baseSlots,
        appliedSlots,
        role:index === 0 ? 'Primary' : 'Secondary',
        required,
        note
      });
    });
    rules.required = Array.from(new Set(rules.required));
    rules.notes = Array.from(new Set(rules.notes));
    return rules;
  }

  function enforceMagicRules(d = draft()){
    d.classMode = d.classMode === 'multi' ? 'multi' : 'single';
    if(d.classMode !== 'multi') d.extraClassSlugs = [];
    const rules = classMagicRulesForDraft(d);
    const requiredSlugs = new Set(rules.required.map(slug));
    let selected = Array.from(new Set(array(d.magicTypes).filter(Boolean)));
    if(rules.slots > 0) selected = selected.filter(name => String(name).toLowerCase() !== 'no magic');
    rules.required.forEach(name => {
      if(!selected.some(item => slug(item) === slug(name))) selected.unshift(name);
    });
    if(rules.slots > 0 && selected.length > rules.slots){
      const required = selected.filter(name => requiredSlugs.has(slug(name)));
      const optional = selected.filter(name => !requiredSlugs.has(slug(name)));
      selected = Array.from(new Set(required.concat(optional))).slice(0, Math.max(rules.slots, required.length));
    }
    d.magicTypes = selected;
    syncReligiousClassPatrons(d);
    if(!rules.hasPatronRequirement || !d.magicTypes.some(name => slug(name) === slug(d.patronMagicType))) d.patronMagicType = '';
    if(!rules.hasMancer || !d.magicTypes.some(name => slug(name) === slug(d.mancerAdvantageMagicType))) d.mancerAdvantageMagicType = '';
    return rules;
  }

  function magicSelectionIssues(d = draft()){
    const rules = classMagicRulesForDraft(d);
    const selected = array(d.magicTypes).filter(name => String(name).toLowerCase() !== 'no magic');
    const issues = [];
    if(!rules.classes.length) return ['Choose a class before selecting magic.'];
    if(selected.length < rules.slots) issues.push(`Choose ${rules.slots} magical element${rules.slots === 1 ? '' : 's'} for the selected class setup.`);
    if(selected.length > rules.slots) issues.push(`Too many magical elements selected. This class setup allows ${rules.slots}.`);
    rules.required.forEach(name => {
      if(!selected.some(item => slug(item) === slug(name))) issues.push(`${name} is required by class rules.`);
    });
    if(rules.hasPatronRequirement && !d.patronMagicType) issues.push('Choose which selected element is linked to the patron.');
    if(rules.hasMancer && !d.mancerAdvantageMagicType) issues.push('Choose the Mancer affinity advantage element.');
    return issues;
  }

  function magicTypeIsRequired(name, d = draft()){
    return classMagicRulesForDraft(d).required.some(required => slug(required) === slug(name));
  }

  function raceNameFromDraft(draft){
    return entryBySlug('race', draft.raceSlug)?.title || draft.raceSlug || '';
  }

  function canonicalMagicType(value){
    const cleaned = String(value || '').replace(/\s+\d+%.*$/i, '').trim();
    if(!cleaned) return '';
    return magicInfoByName(cleaned).name || cleaned;
  }

  function racialMagicTypesForEntry(entry){
    if(!entry) return [];
    const meta = entry.metadata || {};
    const title = String(entry.title || entry.name || '');
    const key = slug(`${title} ${entry.slug || ''}`);
    const explicit = array(
      meta.racialMagicTypes ||
      meta.racial_magic_types ||
      meta.innateMagicTypes ||
      meta.innate_magic_types
    );
    const granted = explicit.slice();
    if(key.includes('undien')) granted.push('Water Magic');
    if(key.includes('pixie')){
      const profile = meta.affinityProfile || meta.affinity_profile || {};
      const affinities = array(meta.magicAffinity || meta.magic_affinity);
      const perfectAffinity = affinities.find(value => /\b100\s*%/i.test(String(value)));
      const titleAffinity = title.match(/^(Air|Earth|Fire|Water|Life|Death|Light|Dark)\b/i)?.[1];
      granted.push(profile.primary || perfectAffinity || (titleAffinity ? `${titleAffinity} Magic` : ''));
    }
    return Array.from(new Set(granted.map(canonicalMagicType).filter(Boolean)));
  }

  function racialMagicTypesForDraft(d = draft()){
    return racialMagicTypesForEntry(entryBySlug('race', d.raceSlug));
  }

  function entriesForSelect(domain, fallback){
    const entries = databaseEntries(domain);
    return entries.length ? entries : fallback;
  }

  function appearanceOptionsForRace(raceEntry){
    const meta = raceEntry?.metadata || {};
    const text = [raceEntry?.title, raceEntry?.category, array(raceEntry?.categoryPath).join(' '), array(raceEntry?.tags).join(' '), JSON.stringify(meta)].join(' ').toLowerCase();
    const opts = {
      height_range: meta.heightRange || meta.height_range || 'Average for race',
      weight_range: meta.weightRange || meta.weight_range || 'Average for race',
      body_types: array(meta.bodyTypes || meta.body_types || ['Lean','Balanced','Broad']),
      skin_colours: array(meta.skinColours || meta.skin_colours || ['Pale','Tan','Brown','Ash','Umber']),
      fur_colours: [],
      scale_colours: [],
      feather_colours: [],
      hair_styles: array(meta.hairStyles || meta.hair_styles || ['Loose','Braided','Cropped','Shaved','Tied back']),
      hair_colours: array(meta.hairColours || meta.hair_colours || ['Black','Brown','Silver','White','Auburn']),
      eye_colours: array(meta.eyeColours || meta.eye_colours || ['Brown','Blue','Green','Gold','Grey']),
      facial_features: array(meta.facialFeatures || meta.facial_features || ['Soft','Sharp','Scarred','Weathered']),
      special_features:{
        horns:false,
        wings:false,
        tail:false,
        beak:false,
        claws:false,
        ears:true,
        decay:false,
        spectral:false
      }
    };
    if(/beast|wolf|fox|canine|feline|bear|hyena/.test(text)){
      opts.fur_colours = ['Black','Brown','Grey','White','Russet','Spotted'];
      Object.assign(opts.special_features, { tail:true, claws:true, ears:true });
    }
    if(/bird|avian|kenku|owlin|aarakocra/.test(text)){
      opts.feather_colours = ['Black','White','Brown','Grey','Iridescent','Gold-tipped'];
      Object.assign(opts.special_features, { wings:true, beak:true, claws:true });
    }
    if(/reptile|dragon|scale|lizard|serpent/.test(text)){
      opts.scale_colours = ['Emerald','Obsidian','Sand','Copper','Blue-black'];
      Object.assign(opts.special_features, { tail:true, claws:true, horns:true });
    }
    if(/demon|devil|infernal/.test(text)) Object.assign(opts.special_features, { horns:true, tail:true, claws:true });
    if(/undead|specter|wraith|ghoul|bone/.test(text)) Object.assign(opts.special_features, { decay:true, spectral:true });
    if(/fae|sprite|fairy/.test(text)) Object.assign(opts.special_features, { ears:true, wings:true });
    return opts;
  }

  function suggestedSkills(draft){
    const selectedRace = entryBySlug('race', draft.raceSlug);
    const selectedClass = entryBySlug('class', draft.classSlug);
    const background = FALLBACK_BACKGROUNDS.find(item => item.slug === draft.backgroundSlug);
    return Array.from(new Set([
      ...array(selectedRace?.metadata?.skills || selectedRace?.metadata?.bonusSkills || selectedRace?.metadata?.bonus_skills),
      ...array(selectedClass?.metadata?.skills || selectedClass?.metadata?.recommendedSkills || selectedClass?.metadata?.recommended_skills),
      ...array(background?.skills)
    ].filter(Boolean)));
  }

  function affinityRankForValue(value){
    const numeric = Number(value);
    if(!Number.isFinite(numeric) || numeric < 1) return { label:'Unrolled', range:'-', modifier:0 };
    const score = Math.max(1, Math.min(100, Math.round(numeric)));
    return AFFINITY_RANKS.find(rank => score >= rank.min && score <= rank.max) || AFFINITY_RANKS[0];
  }

  function cleanAffinityValue(value){
    if(value === '' || value === null || value === undefined) return '';
    const numeric = Math.round(Number(value));
    if(!Number.isFinite(numeric)) return '';
    return Math.max(1, Math.min(100, numeric));
  }

  function selectedAffinityItems(d){
    const skills = entriesForSelect('skill', FALLBACK_SKILLS);
    const magicItems = array(d?.magicTypes)
      .filter(name => name && String(name).toLowerCase() !== 'no magic')
      .map(name => {
        const info = magicInfoByName(name);
        const title = info.name || name;
        return {
          kind:'magic',
          key:slug(title),
          title,
          type:'Magic Element',
          colour:info.color || info.cssColor || '#26d9ff'
        };
      });
    const skillItems = array(d?.skills).map(name => {
      const entry = skills.find(skill => slug(skill.title || skill.name) === slug(name) || (skill.title || skill.name) === name);
      return {
        kind:'skills',
        key:slug(name),
        title:name,
        type:entry?.category || 'Skill',
        colour:'var(--asteria-accent,#26d9ff)'
      };
    });
    return magicItems.concat(skillItems);
  }

  function normaliseAffinityRecord(raw, item){
    const value = cleanAffinityValue(raw?.value ?? raw?.roll ?? '');
    const rank = affinityRankForValue(value);
    return {
      key:item.key,
      kind:item.kind,
      title:item.title,
      type:item.type,
      value,
      locked:Boolean(raw?.locked && value !== ''),
      rank:rank.label,
      affinityRange:rank.range,
      rankModifier:rank.modifier
    };
  }

  function normalizeAffinityRolls(raw = {}, d = draft()){
    const source = raw || {};
    const output = { magic:{}, skills:{} };
    selectedAffinityItems(d).forEach(item => {
      const bucket = source[item.kind] || {};
      const found = bucket[item.key] || bucket[slug(item.title)] || source[item.key] || {};
      output[item.kind][item.key] = normaliseAffinityRecord(found, item);
    });
    return output;
  }

  function finalAffinityRolls(d = draft()){
    return normalizeAffinityRolls(d.affinityRolls, d);
  }

  function affinityRollsComplete(d = draft()){
    const items = selectedAffinityItems(d);
    if(!items.length) return false;
    const rolls = normalizeAffinityRolls(d.affinityRolls, d);
    return items.every(item => {
      const record = rolls[item.kind]?.[item.key];
      return record && record.value !== '' && record.locked;
    });
  }

  function talentsForClass(classTitle){
    const title = String(classTitle || '').toLowerCase();
    return databaseEntries('talent').filter(entry => {
      const metadata = entry.metadata || {};
      const className = String(metadata.className || metadata.class_name || entry.filters?.className || '').toLowerCase();
      return !title || className === title || entry.searchTerms?.includes(title) || array(entry.categoryPath).join(' ').toLowerCase().includes(title);
    });
  }

  function startingTalentsForClass(classTitle){
    const talents = talentsForClass(classTitle);
    return talents.filter(entry => {
      const tier = String(entry.filters?.talentTier || entry.metadata?.talentTier || entry.metadata?.talent_tier || '').toLowerCase();
      const rank = Number(entry.metadata?.rank || entry.filters?.rank || 1);
      return tier.includes('1') || rank <= 1;
    }).slice(0, 4);
  }

  function workspaceView(){
    let view = byId('workspace');
    if(!view){
      view = document.createElement('section');
      view.id = 'workspace';
      view.className = 'view workspace-view';
      (document.querySelector('main.main') || document.querySelector('main') || document.body).appendChild(view);
    }
    qsa('main .view,.view').forEach(item => item.classList.toggle('show', item.id === 'workspace'));
    document.body.classList.add('workspace-active');
    return view;
  }

  function shell(){
    const view = workspaceView();
    let root = byId('phase3GameplayShell');
    if(root) return root;
    root = document.createElement('section');
    root.id = 'phase3GameplayShell';
    root.className = 'phase3-shell';
    view.replaceChildren(root);
    return root;
  }

  function systemConfig(id = activeSystem){
    return SYSTEMS.find(system => system.id === id) || SYSTEMS[0];
  }

  function render(){
    const system = systemConfig();
    if(!activeTab || !system.tabs.includes(activeTab)) activeTab = system.tabs[0];
    if(activeSystem === 'characterCreator' && forgeMode !== 'hub') draft().activeTab = activeTab;
    const root = shell();
    if(activeSystem === 'characterCreator'){
      const d = draft();
      const visibleTabs = forgeTabsForDraft(d);
      if(!visibleTabs.includes(activeTab)) activeTab = visibleTabs.includes(d.activeTab) ? d.activeTab : visibleTabs[0];
      if(forgeMode !== 'hub') d.activeTab = activeTab;
      root.classList.add('phase3-forge-shell');
      root.classList.toggle('phase3-forge-hub-shell', forgeMode === 'hub');
      root.innerHTML = forgeMode === 'hub' ? renderCharacterForgeHub() : renderCharacterCreator();
      bind();
      return;
    }
    root.classList.remove('phase3-forge-shell');
    root.classList.remove('phase3-forge-hub-shell');
    root.innerHTML = `
      <header class="phase3-header">
        <div>
          <p class="eyebrow">Phase 3A Character Forge</p>
          <h1>${esc(system.label)}</h1>
          <p>Metadata-driven RPG tools connected to the Asteria compendium databases.</p>
        </div>
        <div class="phase3-status">
          <span>${esc(VERSION)}</span>
          <b>${databaseEntries('race').length + databaseEntries('class').length + databaseEntries('creature').length + databaseEntries('item').length} linked entries</b>
        </div>
      </header>
      <section class="phase3-layout">
        <aside class="phase3-nav">
          <h3>Gameplay Systems</h3>
          ${SYSTEMS.map(item => `<button type="button" class="${item.id === activeSystem ? 'active' : ''}" data-phase3-open="${esc(item.id)}"><span>${esc(item.label)}</span><small>${esc(item.tag)}</small></button>`).join('')}
        </aside>
        <main class="phase3-main">
          <nav class="phase3-tabs">${system.tabs.map(tab => `<button type="button" class="${phase3TabClass(tab)}" data-phase3-tab="${esc(tab)}">${esc(tab)}</button>`).join('')}</nav>
          <section class="phase3-window">${renderSystem(system.id)}</section>
        </main>
      </section>
    `;
    bind();
  }

  function phase3TabClass(tab){
    const classes = [];
    if(tab === activeTab) classes.push('active');
    if(activeSystem === 'characterCreator' && forgeTabComplete(tab)) classes.push('complete');
    return classes.join(' ');
  }

  function forgeTabComplete(tab){
    const d = draft();
    if(tab === 'Race') return Boolean(d.raceSlug);
    if(tab === 'Class') return d.classMode === 'multi' ? classSlugsFromDraft(d).length === MAX_CHARACTER_CLASSES : Boolean(d.classSlug);
    if(tab === 'Patron') return !religiousPatronIssues(d).length;
    if(tab === 'Appearance') return Boolean(Object.keys(d.appearance || {}).length);
    if(tab === 'Origin') return Boolean(d.originSlug || Object.values(d.origin || {}).some(Boolean) || Object.values(d.family_tree || {}).some(Boolean));
    if(tab === 'Characteristics') return FORGE_CHARACTERISTICS.every(key => d.characteristics?.[key] !== '' && d.characteristics?.[key] !== undefined);
    if(tab === 'Magic') return !magicSelectionIssues(d).length;
    if(tab === 'Skills') return d.skills.length === 4;
    if(tab === 'Affinity Rolls') return affinityRollsComplete(d);
    if(tab === 'Equipment') return Boolean(d.equipmentPackSlug || d.equipment.length);
    return false;
  }

  function renderSystem(id){
    if(id === 'characterCreator') return renderCharacterCreator();
    if(id === 'characterSheet') return renderCharacterSheet();
    if(id === 'appearanceBuilder') return renderAppearanceBuilderPanel();
    if(id === 'talentTree') return renderTalentTree();
    if(id === 'encounterBuilder') return renderEncounterBuilder();
    if(id === 'lootGenerator') return renderLootGenerator();
    if(id === 'craftingSystem') return renderCraftingSystem();
    if(id === 'professionSystem') return renderProfessionSystem();
    if(id === 'partySystem') return renderPartySystem();
    if(id === 'adventureGuild') return renderAdventureGuild();
    if(id === 'gmDashboard') return renderGMDashboard();
    return '<section class="phase3-card"><h2>System coming soon</h2></section>';
  }

  function draft(){
    state.drafts = state.drafts || {};
    state.drafts.characterCreator = Object.assign(defaultState().drafts.characterCreator, state.drafts.characterCreator || {});
    const d = state.drafts.characterCreator;
    d.attributes = Object.assign(Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 10])), d.attributes || {});
    const legacy = d.characteristics || {};
    const migratedCharacteristics = Object.assign({}, legacy);
    if(legacy.might !== undefined && migratedCharacteristics.strength === undefined) migratedCharacteristics.strength = Number(legacy.might || 10);
    if(legacy.agility !== undefined && migratedCharacteristics.dexterity === undefined) migratedCharacteristics.dexterity = Number(legacy.agility || 10);
    if(legacy.might !== undefined && migratedCharacteristics.constitution === undefined) migratedCharacteristics.constitution = Number(legacy.might || 10);
    if(legacy.willpower !== undefined && migratedCharacteristics.endurance === undefined) migratedCharacteristics.endurance = Number(legacy.willpower || 10);
    if(legacy.intellect !== undefined && migratedCharacteristics.intelligence === undefined) migratedCharacteristics.intelligence = Number(legacy.intellect || 10);
    if(legacy.willpower !== undefined && migratedCharacteristics.wisdom === undefined) migratedCharacteristics.wisdom = Number(legacy.willpower || 10);
    if(legacy.presence !== undefined && migratedCharacteristics.charisma === undefined) migratedCharacteristics.charisma = Number(legacy.presence || 10);
    if(legacy.aether !== undefined && migratedCharacteristics.luck === undefined) migratedCharacteristics.luck = Number(legacy.aether || 10);
    d.characteristics = Object.assign(Object.fromEntries(FORGE_CHARACTERISTICS.map(key => [key, 10])), migratedCharacteristics);
    d.magicTypes = array(d.magicTypes);
    d.forgeCategories = Object.assign({ race:[], class:[] }, d.forgeCategories || {});
    d.forgeCategories.race = array(d.forgeCategories.race);
    d.forgeCategories.class = array(d.forgeCategories.class);
    d.forgeDrill = Object.assign({ race:[], class:[] }, d.forgeDrill || {});
    d.forgeDrill.race = array(d.forgeDrill.race);
    d.forgeDrill.class = array(d.forgeDrill.class);
    d.forgeSearch = Object.assign({ race:'', class:'', patron:'', skill:'' }, d.forgeSearch || {});
    d.skillCategory = d.skillCategory || '';
    d.skills = array(d.skills);
    d.classMode = d.classMode === 'multi' ? 'multi' : 'single';
    d.activePatronClassSlug = d.activePatronClassSlug || '';
    d.patronCategory = d.patronCategory || '';
    d.patronMagicType = d.patronMagicType || '';
    d.mancerAdvantageMagicType = d.mancerAdvantageMagicType || '';
    enforceMagicRules(d);
    d.affinityRolls = normalizeAffinityRolls(d.affinityRolls || {}, d);
    d.equipment = array(d.equipment);
    d.extraClassSlugs = array(d.extraClassSlugs).slice(0, Math.max(0, MAX_CHARACTER_CLASSES - 1));
    d.editCharacterId = d.editCharacterId || '';
    d.lockedClassSlug = d.lockedClassSlug || '';
    d.cardColour = safeCardColour(d.cardColour);
    d.appearance = d.appearance || {};
    d.origin = Object.assign(defaultState().drafts.characterCreator.origin, d.origin || {});
    d.family_tree = Object.assign(defaultState().drafts.characterCreator.family_tree, d.family_tree || {});
    d.details = Object.assign({ name:'', age:'', pronouns:'' }, d.details || {});
    const religious = religiousClassSelections(d);
    const religiousSlugs = new Set(religious.map(item => item.slug));
    if(!religiousSlugs.has(d.activePatronClassSlug)) d.activePatronClassSlug = religious[0]?.slug || '';
    const visibleTabs = forgeTabsForDraft(d);
    if(!visibleTabs.includes(d.activeTab)) d.activeTab = visibleTabs[Math.max(0, Math.min(visibleTabs.length - 1, Number(d.step || 0)))] || visibleTabs[0];
    d.step = tabIndex(d.activeTab, d);
    return d;
  }

  function renderStepPills(){
    const tabs = forgeTabsForDraft(draft());
    return `<div class="phase3-stepper">${tabs.map((step, index) => `<button type="button" class="${step === activeTab ? 'active' : ''} ${forgeTabComplete(step) ? 'done' : ''}" data-phase3-step="${index}"><b>${index + 1}</b><span>${esc(step)}</span></button>`).join('')}</div>`;
  }

  function characterImage(character){
    const schema = character?.character || {};
    const candidates = [
      character?.portrait,
      character?.image,
      character?.avatar,
      character?.appearance?.portrait,
      schema?.appearance?.portrait,
      schema?.image,
      schema?.race?.metadata?.imagePath,
      schema?.race?.metadata?.image
    ].filter(Boolean);
    return candidates[0] || '';
  }

  function characterCampaignName(character){
    return character?.campaign || character?.character?.campaign?.name || activeCampaign()?.name || 'Unassigned Campaign';
  }

  function renderCharacterForgeCard(id){
    const character = window.chars?.[id];
    if(!character) return '';
    const dashboard = window.ensureCharacterDashboardLink?.(id) || character.dashboard || {};
    const image = characterImage(character);
    const title = character.name || 'Unnamed Character';
    const colour = safeCardColour(character.cardColour || character.cardColor || character.character?.cardColour);
    return `
      <article class="forge-character-card" tabindex="0" role="button" style="--character-card-colour:${esc(colour)}" data-forge-character-id="${esc(id)}" data-dashboard-id="${esc(dashboard.id || '')}">
        <div class="forge-character-image">
          ${image ? `<img src="${esc(image)}" alt="${esc(title)} portrait" loading="lazy" decoding="async">` : `<span>${esc(character.initial || title.charAt(0).toUpperCase() || '?')}</span>`}
        </div>
        <div class="forge-character-card-body">
          <p class="eyebrow">${esc(characterCampaignName(character))}</p>
          <h3>${esc(title)}</h3>
          <p>${esc(character.race || 'Unselected Race')} / ${esc(character.klass || 'Unselected Class')}</p>
          <p class="forge-class-lock">Primary class locked / ${esc(array(character.classSlugs || character.talentClasses || [character.talentClass]).filter(Boolean).length || 1)}/${MAX_CHARACTER_CLASSES} classes</p>
          <small>Double-click to open Character Dashboard</small>
        </div>
        <div class="forge-card-actions" aria-label="${esc(title)} actions">
          <button class="forge-card-edit" type="button" data-forge-edit-character="${esc(id)}" aria-label="Edit ${esc(title)}">Edit</button>
          <button class="forge-card-delete" type="button" data-forge-delete-character="${esc(id)}" aria-label="Delete ${esc(title)}">Delete</button>
          <button class="forge-card-colour-settings" type="button" data-forge-card-colour-settings="${esc(id)}" aria-label="Change ${esc(title)} card colour" title="Change card colour"><span></span><span></span><span></span></button>
        </div>
      </article>
    `;
  }

  function openCharacterCardColourSettings(id){
    const character = window.chars?.[id];
    if(!character){
      window.toast?.('Character not found.');
      return false;
    }
    if(typeof window.openAsteriaInfoModal !== 'function'){
      window.toast?.('Colour settings are unavailable.');
      return false;
    }
    const title = character.name || 'Unnamed Character';
    const campaign = characterCampaignName(character);
    const colour = safeCardColour(character.cardColour || character.cardColor || character.character?.cardColour);
    window.openAsteriaInfoModal({
      eyebrow:'Character Card Settings',
      title:'Card Colour',
      subtitle:`Choose the border and glow colour for ${title}.`,
      body:`
        <section class="forge-colour-settings" data-forge-colour-settings-id="${esc(id)}" style="--preview-colour:${esc(colour)}">
          <div class="forge-colour-preview" aria-live="polite">
            <span>${esc(character.initial || title.charAt(0).toUpperCase() || '?')}</span>
            <div><strong>${esc(title)}</strong><small>${esc(campaign)}</small></div>
          </div>
          <label class="forge-colour-wheel-label">
            <span>Card colour</span>
            <input type="color" value="${esc(colour)}" data-forge-colour-picker aria-label="Choose character card colour">
          </label>
          <div class="forge-colour-presets" aria-label="Asteria colour presets">
            ${CARD_COLOUR_OPTIONS.map(option => `<button type="button" class="${option === colour ? 'active' : ''}" style="--swatch:${esc(option)}" data-forge-colour-preset="${esc(option)}" aria-label="Use ${esc(option)}"></button>`).join('')}
          </div>
          <div class="modal-action-row forge-colour-actions">
            <button type="button" class="primary" data-forge-colour-save>Save Colour</button>
            <button type="button" class="outline" data-forge-colour-reset>Reset</button>
          </div>
        </section>
      `
    });

    const modal = document.getElementById('asteriaInfoModal');
    const settings = modal?.querySelector(`[data-forge-colour-settings-id="${CSS.escape(String(id))}"]`);
    const picker = settings?.querySelector('[data-forge-colour-picker]');
    const preview = settings?.querySelector('.forge-colour-preview');
    const presets = Array.from(settings?.querySelectorAll('[data-forge-colour-preset]') || []);
    const updatePreview = nextColour => {
      const selected = safeCardColour(nextColour);
      if(picker) picker.value = selected;
      settings?.style.setProperty('--preview-colour', selected);
      preview?.style.setProperty('--preview-colour', selected);
      presets.forEach(button => button.classList.toggle('active', button.dataset.forgeColourPreset === selected));
    };
    picker?.addEventListener('input', () => updatePreview(picker.value));
    presets.forEach(button => button.addEventListener('click', () => updatePreview(button.dataset.forgeColourPreset)));
    settings?.querySelector('[data-forge-colour-save]')?.addEventListener('click', () => {
      setCharacterCardColour(id, picker?.value || colour);
      window.closeAsteriaInfoModal?.();
    });
    settings?.querySelector('[data-forge-colour-reset]')?.addEventListener('click', () => {
      setCharacterCardColour(id, CARD_COLOUR_OPTIONS[0]);
      window.closeAsteriaInfoModal?.();
    });
    return true;
  }

  function renderCharacterForgeHub(){
    const ids = accountCharacterIds();
    return `
      <section class="character-forge-hub">
        <article class="phase3-card phase3-forge-intro character-forge-hub-head">
          <div class="phase3-panel-head">
            <div>
              <p class="eyebrow">Character Forge</p>
              <h2>Your Characters</h2>
              <p>Select a character card, or double-click it to open that character's dashboard. Forge New Character starts a fresh guided build.</p>
            </div>
            <span>${ids.length} character${ids.length === 1 ? '' : 's'}</span>
          </div>
        </article>
        <section class="forge-character-gallery" aria-label="Character Forge character gallery">
          ${ids.map(renderCharacterForgeCard).join('')}
          <article class="forge-character-card forge-new-character-card" tabindex="0" role="button" data-forge-new-character>
            <div class="forge-character-image forge-new-symbol"><span>+</span></div>
            <div class="forge-character-card-body">
              <p class="eyebrow">New Build</p>
              <h3>Forge New Character</h3>
              <p>Start the guided Race, Class, Appearance, Origin, Characteristics, Magic, Skills, Affinity Rolls, Equipment, and Review flow.</p>
              <small>Click to begin</small>
            </div>
          </article>
        </section>
      </section>
    `;
  }

  function renderCharacterCreator(){
    const d = draft();
    const tabs = forgeTabsForDraft(d);
    const current = tabIndex(activeTab, d);
    const completed = tabs.filter(forgeTabComplete).length;
    return `
      <section class="phase3-creator">
        <article class="phase3-card phase3-forge-intro">
          <div class="phase3-panel-head">
            <div><p class="eyebrow">Guided Journey</p><h2>Character Forge</h2></div>
            <span>${completed}/${tabs.length} complete</span>
          </div>
        </article>
        ${renderStepPills()}
        <div class="phase3-creator-body">
          ${renderForgeTab(activeTab)}
        </div>
        <footer class="phase3-actions">
          <button type="button" data-phase3-forge-prev ${current <= 0 ? 'disabled' : ''}>Back</button>
          <button type="button" class="primary" data-phase3-forge-next ${current >= tabs.length - 1 ? 'disabled' : ''}>Next</button>
          <button type="button" class="primary" data-phase3-save-character>${activeTab === 'Review' ? 'Create Character' : 'Save Character'}</button>
        </footer>
        ${forgeDetailEntry ? renderForgeDetailViewer(forgeDetailEntry) : ''}
      </section>
    `;
  }

  function renderEntryCards(domain, selectedSlug, actionName, emptyText){
    const entries = forgeDatabaseEntries(domain);
    if(!entries.length) return `<p class="muted smallnote">${esc(emptyText || 'No database entries found yet.')}</p>`;
    return `<div class="phase3-card-grid">${entries.map(entry => `
      <article class="phase3-pick-card ${entry.slug === selectedSlug ? 'selected' : ''}" data-${actionName}="${esc(entry.slug)}" data-phase3-entry-domain="${esc(domain)}" data-phase3-entry-slug="${esc(entry.slug)}">
        ${entryImage(entry, domain) ? `<div class="phase3-pick-art"><img src="${esc(entryImage(entry, domain))}" alt="${esc(entry.title)}" loading="lazy" decoding="async"></div>` : `<div class="phase3-pick-art phase3-pick-symbol">${esc(String(entry.title || '?').charAt(0).toUpperCase())}</div>`}
        <span>${esc(entryCategory(entry, titleCase(domain)))}</span>
        <h3>${esc(entry.title)}</h3>
        <p>${esc(entry.summary || 'Information coming soon.')}</p>
      </article>
    `).join('')}</div>`;
  }

  function pathKey(path){
    return array(path).map(slug).join('/');
  }

  function entryPath(entry){
    return array(entry?.categoryPath || entry?.path);
  }

  function entryInPath(entry, path){
    const filter = array(path);
    if(!filter.length) return true;
    const candidate = entryPath(entry);
    return filter.every((part, index) => candidate[index] === part);
  }

  function compendiumCategoriesForDomain(domain){
    if(domain === 'race' && typeof window.AsteriaRaceCompendium?.categories === 'function'){
      return window.AsteriaRaceCompendium.categories().map(category => ({
        label:category.name,
        path:array(category.path)
      }));
    }
    return [];
  }

  function forgeCategoryChildren(domain, entries, drillPath){
    const drill = array(drillPath);
    const exactCategories = compendiumCategoriesForDomain(domain);
    if(exactCategories.length){
      return exactCategories
        .filter(category => category.path.length === drill.length + 1 && drill.every((part, index) => category.path[index] === part))
        .map(category => Object.assign({}, category, { count:entries.filter(item => entryInPath(item, category.path)).length }))
        .sort((a,b) => a.label.localeCompare(b.label));
    }
    const children = new Map();
    entries.forEach(entry => {
      const path = entryPath(entry);
      if(path.length <= drill.length) return;
      if(!drill.every((part, index) => path[index] === part)) return;
      const label = path[drill.length];
      const childPath = drill.concat(label);
      const key = pathKey(childPath);
      const count = entries.filter(item => entryInPath(item, childPath)).length;
      children.set(key, { label, path:childPath, count });
    });
    return [...children.values()].sort((a,b) => a.label.localeCompare(b.label));
  }

  function encodePath(path){
    return encodeURIComponent(JSON.stringify(array(path)));
  }

  function decodePath(value){
    try { return JSON.parse(decodeURIComponent(value || '[]')); } catch { return []; }
  }

  function forgeBreadcrumb(domain, path){
    const root = domain === 'race' ? 'Races' : 'Classes';
    const parts = [root].concat(array(path));
    return parts.map((part, index) => `<button type="button" data-phase3-forge-crumb="${esc(domain)}" data-phase3-forge-path="${esc(encodePath(index === 0 ? [] : path.slice(0, index)))}">${esc(part)}</button>`).join('<span>/</span>');
  }

  function forgeFilteredEntries(domain, entries){
    const d = draft();
    const activePath = array(d.forgeCategories?.[domain]);
    const query = String(d.forgeSearch?.[domain] || '').toLowerCase();
    return entries
      .filter(entry => entryInPath(entry, activePath))
      .filter(entry => {
        if(!query) return true;
        const text = [
          entry.title,
          entry.summary,
          entryCategory(entry, ''),
          entryPath(entry).join(' '),
          array(entry.tags).join(' '),
          entry.role,
          entry.magic_type,
          entry.difficulty,
          entry.size
        ].join(' ').toLowerCase();
        return text.includes(query);
      });
  }

  function renderForgeCategoryPanel(domain, entries){
    const d = draft();
    const activePath = array(d.forgeCategories?.[domain]);
    const drillPath = array(d.forgeDrill?.[domain]);
    const children = forgeCategoryChildren(domain, entries, drillPath);
    const heading = domain === 'race' ? 'Race Categories' : 'Class Categories';
    return `
      <aside class="workspace-category-panel clean-nav phase3-forge-categories">
        <div class="clean-nav-head">
          <h3>${esc(heading)}</h3>
          <button type="button" class="clean-clear" data-phase3-forge-clear="${esc(domain)}">Clear</button>
        </div>
        <p>${esc(heading)}</p>
        <div class="phase3-forge-breadcrumb">${forgeBreadcrumb(domain, drillPath)}</div>
        <div class="phase3-forge-cat-actions">
          <button type="button" class="clean-back" data-phase3-forge-back="${esc(domain)}" ${drillPath.length ? '' : 'disabled'}>Back</button>
          <span>Click filters. Double-click opens category.</span>
        </div>
        <div class="clean-nav-buttons">
          <button type="button" class="cat ${!activePath.length ? 'active' : ''}" data-phase3-forge-category="${esc(domain)}" data-phase3-forge-path="${esc(encodePath([]))}">
            <span class="clean-left"><span>All ${domain === 'race' ? 'Playable Races' : 'Classes'}</span></span>
          </button>
          ${children.map(child => `
            <button type="button" class="cat clean-drilldown-cat ${pathKey(activePath) === pathKey(child.path) ? 'active' : ''}" data-phase3-forge-category="${esc(domain)}" data-phase3-forge-path="${esc(encodePath(child.path))}">
              <span class="clean-left"><span>${esc(child.label)}</span></span><span class="clean-count">${child.count}</span>
            </button>
          `).join('')}
          ${!children.length ? '<div class="clean-empty">No deeper categories here.</div>' : ''}
        </div>
      </aside>
    `;
  }

  function renderForgeCompendiumCards(domain, entries, selectedSlug, actionName){
    const list = forgeFilteredEntries(domain, entries);
    const activePath = array(draft().forgeCategories?.[domain]);
    const title = activePath.length ? activePath[activePath.length - 1] : (domain === 'race' ? 'Playable Races' : 'Playable Classes');
    return `
      <section class="phase3-forge-card-window">
        <div class="phase3-forge-card-status"><span>${esc(title)}</span><b>${list.length} entries</b></div>
        <div class="phase3-forge-card-grid">
          ${list.length ? list.map(entry => renderForgeEntryCard(domain, entry, selectedSlug, actionName)).join('') : '<div class="phase3-forge-empty"><h3>Information coming soon</h3><p>No playable entries match this category or search yet.</p></div>'}
        </div>
      </section>
    `;
  }

  function renderForgeEntryCard(domain, entry, selectedSlug, actionName){
    const image = entryImage(entry, domain);
    const d = draft();
    const extraClassSlugs = array(d.extraClassSlugs).map(classSlugFromValue);
    const selected = entry.slug === selectedSlug || (domain === 'class' && extraClassSlugs.includes(entry.slug));
    if(domain === 'class'){
      const accent = entry.class_colour || entry.metadata?.class_colour || '#1f7dff';
      const locked = d.lockedClassSlug && entry.slug === classSlugFromValue(d.lockedClassSlug);
      const primary = entry.slug === classSlugFromValue(d.classSlug || d.lockedClassSlug);
      const secondary = extraClassSlugs.includes(entry.slug);
      return `
        <article class="phase3-pick-card phase3-forge-entry-card phase3-forge-class-card ${selected ? 'selected' : ''} ${locked ? 'locked-primary-class' : ''}" style="--class-accent:${esc(accent)}" data-${actionName}="${esc(entry.slug)}" data-phase3-entry-domain="${esc(domain)}" data-phase3-entry-slug="${esc(entry.slug)}">
          <div class="phase3-class-symbol">${esc(entry.symbol || entry.metadata?.symbol || String(entry.title || 'C').charAt(0).toUpperCase())}</div>
          <span>${esc(locked ? 'Primary Locked' : primary ? 'Primary Class' : secondary ? 'Secondary Class' : entryCategory(entry, 'Class'))}</span>
          <h3>${esc(entry.title)}</h3>
          <p>${esc([entry.role, entry.difficulty].filter(Boolean).join(' • ') || entry.summary || 'Information coming soon.')}</p>
        </article>
      `;
    }
    return `
      <article class="phase3-pick-card phase3-forge-entry-card ${selected ? 'selected' : ''}" data-${actionName}="${esc(entry.slug)}" data-phase3-entry-domain="${esc(domain)}" data-phase3-entry-slug="${esc(entry.slug)}">
        ${image ? `<div class="phase3-pick-art"><img src="${esc(image)}" alt="${esc(entry.title)}" loading="lazy" decoding="async"></div>` : `<div class="phase3-pick-art phase3-pick-symbol">${esc(String(entry.title || '?').charAt(0).toUpperCase())}</div>`}
        <span>${esc(entryCategory(entry, 'Race'))}</span>
        <h3>${esc(entry.title)}</h3>
        <p>${esc(entry.summary || 'Information coming soon.')}</p>
      </article>
    `;
  }

  function renderForgeTab(tab){
    const d = draft();
    if(tab === 'Race') return renderForgeChoice('race', d.raceSlug, 'phase3-race', 'Choose Race', 'All public race entries are available for Character Forge. Campaign-specific race limits will be controlled later in Campaign Forge.');
    if(tab === 'Class') return renderForgeChoice('class', d.classSlug, 'phase3-class', 'Choose Class', 'Playable classes are pulled from the Class Compendium. Talents are previewed only and are not chosen freely.');
    if(tab === 'Patron') return renderPatronSelection();
    if(tab === 'Appearance') return renderAppearanceBuilder(d.raceSlug, true);
    if(tab === 'Origin') return renderOriginBuilder();
    if(tab === 'Characteristics') return renderCharacteristics();
    if(tab === 'Magic') return renderMagicSelection();
    if(tab === 'Skills') return renderStartingSkills();
    if(tab === 'Affinity Rolls') return renderAffinityRolls();
    if(tab === 'Equipment') return renderStartingEquipment();
    return renderCharacterReview(true);
  }

  function renderSelectedRaceInfo(entry){
    if(!entry) return '';
    const info = raceInfoPayloadForEntry(entry);
    const traits = array(info.traits).slice(0, 6);
    const rows = [
      ['Movement', info.movement || info.movementMarkdown],
      ['Senses', info.senses],
      ['Languages', info.languages],
      ['Magic Affinity', info.magicAffinity]
    ].filter(([, value]) => String(value || '').trim());
    return `
      <article class="phase3-race-link-panel">
        <div>
          <h3>${esc(entry.title || entry.name)} Race Link</h3>
          <p>Racial features, traits, and characteristic rules will transfer into the saved Character Dashboard.</p>
        </div>
        ${rows.length ? `<dl>${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(String(value).split(/\r?\n/)[0])}</dd></div>`).join('')}</dl>` : ''}
        ${traits.length ? `<div class="phase3-race-trait-chips">${traits.map(trait => `<span>${esc(trait.name || trait)}</span>`).join('')}</div>` : ''}
      </article>
    `;
  }

  function renderClassModeControls(){
    const d = draft();
    const rules = classMagicRulesForDraft(d);
    return `
      <article class="phase3-class-mode-panel">
        <div class="phase3-class-mode-actions">
          <button type="button" class="${d.classMode !== 'multi' ? 'active' : ''}" data-phase3-class-mode="single">Single Class</button>
          <button type="button" class="${d.classMode === 'multi' ? 'active' : ''}" data-phase3-class-mode="multi">Multi-Class</button>
        </div>
        <div class="phase3-class-magic-summary">
          <b>${rules.slots || 0} magical element slot${rules.slots === 1 ? '' : 's'}</b>
          <span>${d.classMode === 'multi' ? 'Primary class slots + secondary class bonus.' : 'Single class uses primary class slots only.'}</span>
        </div>
        ${rules.classes.length ? `<div class="phase3-class-rule-grid">${rules.classes.map(item => `
          <div>
            <strong>${esc(item.role)}: ${esc(item.title)}</strong>
            <span>${esc(item.category)} / ${item.appliedSlots} slot${item.appliedSlots === 1 ? '' : 's'}</span>
            ${item.required.length ? `<em>Required: ${esc(item.required.join(', '))}</em>` : ''}
          </div>
        `).join('')}</div>` : '<p class="muted smallnote">Choose a class to calculate magical element slots.</p>'}
      </article>
    `;
  }

  function renderForgeChoice(domain, selectedSlug, actionName, title, intro){
    const d = draft();
    const selected = selectedSlug ? entryBySlug(domain, selectedSlug) : null;
    const entries = forgeDatabaseEntries(domain);
    const classLockNotice = domain === 'class' && d.editCharacterId && d.lockedClassSlug ? `
      <article class="phase3-class-lock-notice">
        <h3>Primary Class Locked</h3>
        <p>${esc(entryBySlug('class', d.lockedClassSlug)?.title || 'Primary class')} is locked for this forged character. You may add or swap one secondary class, up to ${MAX_CHARACTER_CLASSES} classes total.</p>
      </article>
    ` : '';
    const selectLabel = domain === 'class' && d.editCharacterId ? 'Confirm Classes' : `Select ${title.replace(/^Choose\s+/, '')}`;
    return `
      <section class="phase3-card">
        <div class="phase3-panel-head">
          <div><h2>${esc(title)}</h2><p>${esc(intro)}</p></div>
          ${selected ? `<button type="button" class="primary" data-phase3-forge-next>${esc(selectLabel)}</button>` : ''}
        </div>
        ${classLockNotice}
        ${domain === 'class' ? renderClassModeControls() : ''}
        <div class="phase3-forge-search-row">
          <label>Search<input data-phase3-forge-search="${esc(domain)}" value="${esc(draft().forgeSearch?.[domain] || '')}" placeholder="Search ${esc(domain === 'race' ? 'races' : 'classes')}..."></label>
          ${selected ? `<span>Selected: ${esc(domain === 'class' ? classDisplayNameFromDraft(d) : selected.title)}</span>` : '<span>No selection yet</span>'}
        </div>
        ${domain === 'race' && selected ? renderSelectedRaceInfo(selected) : ''}
        <div class="phase3-forge-compendium">
          ${renderForgeCategoryPanel(domain, entries)}
          ${renderForgeCompendiumCards(domain, entries, selectedSlug, actionName)}
        </div>
      </section>
    `;
  }

  function renderPatronSelection(){
    const d = draft();
    const religious = religiousClassSelections(d);
    const patrons = patronDatabaseEntries();
    if(!religious.length) return '<section class="phase3-card"><h2>Patron</h2><p>This step appears when a Religious Class is selected.</p></section>';

    const classPatrons = syncReligiousClassPatrons(d);
    const activeClass = religious.find(item => item.slug === d.activePatronClassSlug) || religious[0];
    d.activePatronClassSlug = activeClass.slug;
    const selectedPatron = classPatrons[activeClass.slug] || '';
    const query = String(d.forgeSearch?.patron || '').trim().toLowerCase();
    const category = d.patronCategory || '';
    const filtered = patrons.filter(entry => {
      if(category && patronCategory(entry) !== category) return false;
      if(!query) return true;
      return [entry.title, entry.name, patronCategory(entry), patronTitleLine(entry), entry.summary, array(entry.tags).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
    const selectedEntry = patronEntryBySlug(selectedPatron);

    return `
      <section class="phase3-card phase3-patron-page">
        <div class="phase3-panel-head">
          <div><h2>Patron</h2><p>Choose one Theology Compendium patron for each selected Religious Class.</p></div>
          <span>${religious.filter(item => classPatrons[item.slug]).length}/${religious.length} chosen</span>
        </div>
        <nav class="phase3-patron-class-tabs" aria-label="Religious classes requiring patrons">
          ${religious.map(item => `<button type="button" class="${item.slug === activeClass.slug ? 'active' : ''} ${classPatrons[item.slug] ? 'complete' : ''}" data-phase3-patron-class="${esc(item.slug)}">${esc(item.role)} ${esc(item.title)}${classPatrons[item.slug] ? ' - Chosen' : ''}</button>`).join('')}
        </nav>
        <div class="phase3-patron-selection-status">
          <div><span>Choosing for</span><strong>${esc(activeClass.role)} ${esc(activeClass.title)}</strong></div>
          <div><span>Selected patron</span><strong>${esc(selectedEntry?.title || selectedEntry?.name || 'None selected')}</strong></div>
        </div>
        <div class="phase3-patron-filters">
          <label>Search<input data-phase3-patron-search value="${esc(d.forgeSearch?.patron || '')}" placeholder="Search gods, goddesses, domains..."></label>
          <label>Pantheon or Court<select data-phase3-patron-category><option value="">All Theology Categories</option>${patronCategories().map(item => `<option value="${esc(item)}" ${category === item ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select></label>
        </div>
        <div class="phase3-patron-card-status"><span>${esc(category || 'All Theology Entries')}</span><b>${filtered.length} patrons</b></div>
        <div class="phase3-patron-card-grid">
          ${filtered.map(entry => {
            const value = entry.slug || slug(entry.title || entry.name);
            const image = entryImage(entry, 'religion');
            const selected = slug(selectedPatron) === slug(value);
            return `
              <article class="phase3-pick-card phase3-patron-card ${selected ? 'selected' : ''}" tabindex="0" role="button" data-phase3-class-patron-card="${esc(value)}" data-phase3-entry-domain="religion" data-phase3-entry-slug="${esc(value)}">
                <span class="phase3-patron-category">${esc(patronCategory(entry))}</span>
                ${image ? `<div class="phase3-patron-art"><img src="${esc(image)}" alt="${esc(entry.title || entry.name)}" loading="lazy" decoding="async"></div>` : `<div class="phase3-patron-art phase3-patron-symbol">${esc(String(entry.title || entry.name || '?').charAt(0).toUpperCase())}</div>`}
                <h3>${esc(entry.title || entry.name)}</h3>
                <p>${esc(patronTitleLine(entry) || 'Divine information coming soon.')}</p>
              </article>
            `;
          }).join('') || '<div class="phase3-forge-empty"><h3>No patrons found</h3><p>Try another search or Theology category.</p></div>'}
        </div>
      </section>
    `;
  }

  function renderOriginBuilder(){
    const d = draft();
    const origins = entriesForSelect('origin', FALLBACK_BACKGROUNDS);
    return `
      <section class="phase3-review-grid">
        <article class="phase3-card span-2">
          <h2>Origin</h2>
          <p>Choose an origin, then record family and story details. This data is stored now for later reputation, factions, quests, and campaign history.</p>
          <div class="phase3-card-grid compact">
            ${origins.map(origin => {
              const selected = d.originSlug === origin.slug || d.backgroundSlug === origin.slug;
              return `<article class="phase3-pick-card ${selected ? 'selected' : ''}" data-phase3-origin="${esc(origin.slug)}"><span>${esc(origin.category || 'Origin')}</span><h3>${esc(origin.title)}</h3><p>${esc(origin.summary || array(origin.tags).join(', ') || 'Information coming soon.')}</p></article>`;
            }).join('')}
          </div>
        </article>
        <article class="phase3-card">
          <h3>Family Tree</h3>
          <div class="phase3-form-grid">
            ${['father','mother','siblings','partner','children'].map(key => `<label>${esc(titleCase(key))}<input data-phase3-family="${esc(key)}" value="${esc(d.family_tree?.[key] || '')}" placeholder="${esc(titleCase(key))}"></label>`).join('')}
          </div>
        </article>
        <article class="phase3-card">
          <h3>Character Story</h3>
          <div class="phase3-form-grid">
            <label>Birthplace<input data-phase3-origin-field="birthplace" value="${esc(d.origin.birthplace || '')}" placeholder="Village, city, realm..."></label>
            <label>History<textarea data-phase3-origin-field="history">${esc(d.origin.history || '')}</textarea></label>
            <label>Backstory<textarea data-phase3-origin-field="backstory">${esc(d.origin.backstory || '')}</textarea></label>
            <label>Personality<textarea data-phase3-origin-field="personality">${esc(d.origin.personality || '')}</textarea></label>
            <label>Goals<input data-phase3-origin-field="goals" value="${esc(d.origin.goals || '')}"></label>
            <label>Ideals<input data-phase3-origin-field="ideals" value="${esc(d.origin.ideals || '')}"></label>
            <label>Flaws<input data-phase3-origin-field="flaws" value="${esc(d.origin.flaws || '')}"></label>
            <label>Notes<textarea data-phase3-origin-field="notes">${esc(d.origin.notes || '')}</textarea></label>
          </div>
        </article>
      </section>
    `;
  }

  function renderCharacteristics(){
    const d = draft();
    const raceEntry = entryBySlug('race', d.raceSlug);
    const rules = raceCharacteristicRulesFor(raceEntry);
    const base = normalizedCharacteristics(d.characteristics);
    return `
      <section class="phase3-card">
        <div class="phase3-panel-head">
          <div><h2>Characteristics</h2></div>
          <span>${esc(raceEntry?.title || 'Choose Race')}</span>
        </div>
        <article class="phase3-race-rule-card">
          <h3>${esc(rules.race)} Characteristic Rules</h3>
          <p>Manual input stays available. Race modifiers and tier caps are applied when the character is saved.</p>
        </article>
        <div class="phase3-characteristic-grid">
          ${FORGE_CHARACTERISTICS.map(key => `
            <label class="phase3-characteristic-card">
              <span class="phase3-characteristic-title">${esc(titleCase(key))}</span>
              <input type="number" min="0" max="${Number(rules.tierCaps[key]?.maxScore ?? 100)}" value="${Number(base[key] ?? 10)}" data-phase3-characteristic="${esc(key)}">
              <dl class="phase3-characteristic-lines">
                <div><dt>Stat Roll</dt><dd>${esc(rules.statRolls[key] || 'Manual')}</dd></div>
                <div><dt>Racial Modifier</dt><dd>${esc(signed(rules.modifiers[key]))}</dd></div>
                <div><dt>Characteristic Tier Cap</dt><dd>${esc(rules.tierCaps[key]?.label || 'Tier V')}</dd></div>
              </dl>
            </label>
          `).join('')}
        </div>
      </section>
    `;
  }

  function forgeTierOf(value){
    if(typeof window.tierOf === 'function') return window.tierOf(Number(value || 0));
    return tierInfoForValue(value).label;
  }

  function renderMagicRuleControls(rules, d){
    const selected = array(d.magicTypes).filter(name => String(name).toLowerCase() !== 'no magic');
    const options = selected.map(name => `<option value="${esc(name)}" ${slug(d.patronMagicType) === slug(name) ? 'selected' : ''}>${esc(name)}</option>`).join('');
    const mancerOptions = selected.map(name => `<option value="${esc(name)}" ${slug(d.mancerAdvantageMagicType) === slug(name) ? 'selected' : ''}>${esc(name)}</option>`).join('');
    return `
      <article class="phase3-magic-rule-panel">
        <div class="phase3-class-rule-grid">
          ${rules.classes.map(item => `
            <div>
              <strong>${esc(item.role)}: ${esc(item.title)}</strong>
              <span>${esc(item.category)} / ${item.appliedSlots} magic slot${item.appliedSlots === 1 ? '' : 's'}</span>
              ${item.required.length ? `<em>Required: ${esc(item.required.join(', '))}</em>` : ''}
            </div>
          `).join('') || '<div><strong>No class selected</strong><span>Choose a class to unlock magic slots.</span></div>'}
        </div>
        ${rules.notes.length ? `<ul class="phase3-magic-rule-notes">${rules.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>` : ''}
        <div class="phase3-magic-special-grid">
          ${rules.hasPatronRequirement ? `<label>Patron-linked Element<select data-phase3-patron-magic><option value="">Choose selected element...</option>${options}</select></label>` : ''}
          ${rules.hasMancer ? `<label>Mancer Advantage Element<select data-phase3-mancer-advantage><option value="">Choose selected element...</option>${mancerOptions}</select></label>` : ''}
        </div>
      </article>
    `;
  }

  function renderMagicSelection(){
    const d = draft();
    const rules = classMagicRulesForDraft(d);
    const selected = new Set(d.magicTypes);
    const racialMagic = racialMagicTypesForDraft(d);
    const selectedCount = array(d.magicTypes).filter(name => String(name).toLowerCase() !== 'no magic').length;
    const groups = magicGroups();
    const issues = magicSelectionIssues(d);
    return `
      <section class="phase3-card">
        <div class="phase3-panel-head">
          <div><h2>Magic</h2><p>Select the character's magic type access. This is stored on the character profile for later spell and class systems.</p></div>
          <span>${esc(rules.slots ? `${selectedCount}/${rules.slots} slots` : 'Choose class first')}</span>
        </div>
        ${renderMagicRuleControls(rules, d)}
        ${racialMagic.length ? `
          <article class="phase3-magic-rule-panel phase3-racial-magic-panel">
            <div>
              <strong>Race-granted magic</strong>
              <span>${esc(racialMagic.join(', '))}</span>
            </div>
            <p>These innate affinities are granted by the selected race and do not use class magical element slots.</p>
          </article>
        ` : ''}
        ${issues.length ? `<div class="phase3-rule-warning">${issues.map(esc).join(' ')}</div>` : ''}
        <div class="phase3-magic-layout">
          ${groups.map(group => `
            <section class="phase3-magic-group">
              <h3>${esc(group.label)}</h3>
              <div class="phase3-magic-grid">
                ${group.elements.map(element => {
                  const info = magicInfoByName(element.name || element.type);
                  const type = info.name || element.type;
                  const picked = selected.has(type);
                  const required = magicTypeIsRequired(type, d);
                  const disabled = !picked && (rules.slots <= 0 || selectedCount >= rules.slots);
                  return `
                  <article class="phase3-magic-card ${picked ? 'selected' : ''} ${required ? 'locked' : ''} ${disabled ? 'disabled' : ''}" role="button" tabindex="0" data-phase3-magic="${esc(type)}" style="--magic-color:${esc(info.color || info.cssColor || '#26d9ff')}">
                    <span>${esc(required ? 'Required' : (info.label || type.replace(/\s+Magic$/i, '')))}</span>
                    <h4>${esc(type)}</h4>
                    <p>${esc(info.desc || 'Magic information coming soon.')}</p>
                  </article>
                `;
                }).join('')}
              </div>
            </section>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderStartingSkills(){
    const d = draft();
    const skills = entriesForSelect('skill', FALLBACK_SKILLS);
    const suggestions = suggestedSkills(d);
    const query = String(d.forgeSearch?.skill || '').trim().toLowerCase();
    const categories = [...new Set(skills.map(skill => entryPath(skill).slice(0, 2).join(' / ')).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const visibleSkills = skills.filter(skill => {
      const categoryPath = entryPath(skill).slice(0, 2).join(' / ');
      if(d.skillCategory && categoryPath !== d.skillCategory) return false;
      if(!query) return true;
      return [skill.title, skill.name, skill.summary, categoryPath, array(skill.tags).join(' '), skill.primary_stat, skill.secondary_stat]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
    return `
      <section class="phase3-card">
        <h2>Choose 4 Starting Skills</h2>
        <p>Skills come from the Skill Compendium. Race, class, and origin recommendations are shown as suggestions only.</p>
        <div class="phase3-suggestion-line"><b>Suggestions:</b> ${suggestions.length ? suggestions.map(esc).join(', ') : 'No database recommendations yet.'}</div>
        <div class="phase3-patron-filters">
          <label>Search Skills<input data-phase3-forge-search="skill" value="${esc(d.forgeSearch?.skill || '')}" placeholder="Search names, categories, or characteristics..."></label>
          <label>Skill Category<select data-phase3-skill-category>
            <option value="">All Skill Categories</option>
            ${categories.map(category => `<option value="${esc(category)}" ${d.skillCategory === category ? 'selected' : ''}>${esc(category)}</option>`).join('')}
          </select></label>
        </div>
        <div class="phase3-patron-card-status"><span>${esc(d.skillCategory || 'All Skills')}</span><b>${visibleSkills.length} skills</b></div>
        <div class="phase3-card-grid compact">
          ${visibleSkills.map(skill => {
            const name = skill.title || skill.name;
            const selected = d.skills.includes(name);
            return `<article class="phase3-pick-card ${selected ? 'selected' : ''}" data-phase3-skill="${esc(name)}"><span>${esc(selected ? 'Selected' : (skill.category || 'Skill'))}</span><h3>${esc(name)}</h3><p>${esc(skill.summary || 'Rank starts at Novice unless modified by race, class, or origin.')}</p></article>`;
          }).join('') || '<p class="muted smallnote">No skills match the current search and category.</p>'}
        </div>
        <p class="muted smallnote">Selected: ${d.skills.length}/4. Exactly 4 skills are required before saving.</p>
      </section>
    `;
  }

  function renderAffinityRollCard(item, record){
    return `
      <article class="phase3-affinity-card ${record.locked ? 'locked' : ''}" style="--affinity-color:${esc(item.colour || 'var(--asteria-accent,#26d9ff)')}" data-phase3-affinity-card="${esc(item.kind)}:${esc(item.key)}">
        <span class="phase3-affinity-type">${esc(item.type)}</span>
        <h3>${esc(item.title)}</h3>
        <input type="number" min="1" max="100" inputmode="numeric" value="${esc(record.value)}" ${record.locked ? 'disabled' : ''} data-phase3-affinity-kind="${esc(item.kind)}" data-phase3-affinity-key="${esc(item.key)}" data-phase3-affinity-value>
        <button type="button" class="${record.locked ? '' : 'primary'}" data-phase3-affinity-kind="${esc(item.kind)}" data-phase3-affinity-lock="${esc(item.key)}">${record.locked ? 'Unlock Roll' : 'Confirm / Lock'}</button>
        <b class="phase3-affinity-rank">${esc(record.rank)}</b>
        <dl class="phase3-affinity-lines">
          <div><dt>Skill Rank Cap</dt><dd>${esc(record.rank)}</dd></div>
          <div><dt>Affinity Range</dt><dd>${esc(record.affinityRange)}</dd></div>
          <div><dt>Rank Modifier</dt><dd>${esc(signed(record.rankModifier))}</dd></div>
        </dl>
      </article>
    `;
  }

  function renderAffinityRollGroup(title, items, rolls){
    return `
      <section class="phase3-affinity-group">
        <h3>${esc(title)}</h3>
        <div class="phase3-affinity-grid">
          ${items.length ? items.map(item => renderAffinityRollCard(item, rolls[item.kind]?.[item.key] || normaliseAffinityRecord({}, item))).join('') : '<p class="muted smallnote">No selections yet.</p>'}
        </div>
      </section>
    `;
  }

  function renderAffinityRolls(){
    const d = draft();
    const items = selectedAffinityItems(d);
    const rolls = normalizeAffinityRolls(d.affinityRolls, d);
    const magicItems = items.filter(item => item.kind === 'magic');
    const skillItems = items.filter(item => item.kind === 'skills');
    return `
      <section class="phase3-card phase3-affinity-rolls">
        <div class="phase3-panel-head">
          <div>
            <h2>Affinity Rolls</h2>
            <p>Enter each D100 affinity roll for selected magic elements and starting skills, then lock the result.</p>
          </div>
          <span>${items.filter(item => rolls[item.kind]?.[item.key]?.locked).length}/${items.length} locked</span>
        </div>
        ${!items.length ? '<article class="phase3-race-rule-card"><h3>Choose Magic and Skills First</h3><p>Affinity roll cards appear here after magic access and starting skills are selected.</p></article>' : ''}
        ${renderAffinityRollGroup('Magic Elements', magicItems, rolls)}
        ${renderAffinityRollGroup('Starting Skills', skillItems, rolls)}
        <article class="phase3-affinity-reference">
          <h3>Rank Reference</h3>
          <table>
            <thead><tr><th>Skill Rank Cap</th><th>Affinity Range</th><th>Rank Modifier</th></tr></thead>
            <tbody>
              ${AFFINITY_RANKS.map(rank => `<tr><td>${esc(rank.label)}</td><td>${esc(rank.range)}</td><td>${esc(signed(rank.modifier))}</td></tr>`).join('')}
            </tbody>
          </table>
        </article>
      </section>
    `;
  }

  function renderStartingEquipment(){
    const d = draft();
    const selectedPack = EQUIPMENT_PACKS.find(pack => pack.slug === d.equipmentPackSlug);
    const resolved = selectedPack ? resolveEquipmentPack(selectedPack) : [];
    return `
      <section class="phase3-card">
        <div class="phase3-panel-head"><div><h2>Starting Equipment</h2><p>Choose one equipment pack. Pack items resolve against the Item Compendium when matching entries exist.</p></div><span>${esc(selectedPack?.title || 'No pack selected')}</span></div>
        <div class="phase3-card-grid compact">
          ${EQUIPMENT_PACKS.map(pack => `<article class="phase3-pick-card ${d.equipmentPackSlug === pack.slug ? 'selected' : ''}" data-phase3-pack="${esc(pack.slug)}"><span>${esc(pack.category)}</span><h3>${esc(pack.title)}</h3><p>${esc(pack.summary)}</p><small>${esc(resolveEquipmentPack(pack).map(item => item.title).join(', ') || 'Item links pending')}</small></article>`).join('')}
        </div>
        <div class="phase3-mini-list phase3-pack-preview">
          <h3>Selected Pack Items</h3>
          ${resolved.length ? resolved.map(item => `<article><span>${esc(item.category || item.filters?.rarity || 'Item')}</span><b>${esc(item.title)}</b><small>${esc(item.source === 'fallback' ? 'Compendium link pending' : 'Linked to Item Compendium')}</small></article>`).join('') : '<p class="muted smallnote">Select a pack to preview starting equipment.</p>'}
        </div>
      </section>
    `;
  }

  function resolveEquipmentPack(pack){
    const items = databaseEntries('item');
    return array(pack?.items).map(name => {
      const key = slug(name);
      const entry = items.find(item => item.slug === key || slug(item.title) === key || slug(item.name) === key);
      return entry ? Object.assign({ source:'compendium' }, entry) : { slug:key, title:name, category:'Item', source:'fallback' };
    });
  }

  function renderClassTalentsReview(){
    const classTitle = classNameFromDraft(draft());
    const starting = startingTalentsForClass(classTitle);
    const future = talentsForClass(classTitle).filter(item => !starting.includes(item));
    return `
      <section class="phase3-card">
        <h2>Automatic Class Talents</h2>
        <p>Players do not freely choose talents during creation. Starting talents are displayed from class progression metadata when available.</p>
        <div class="phase3-two-col">
          <div><h3>Starting Talents</h3>${talentMiniList(starting, 'Unlocked at start')}</div>
          <div><h3>Future Talent Tree</h3>${talentMiniList(future, 'Locked future talent')}</div>
        </div>
      </section>
    `;
  }

  function talentMiniList(list, label){
    return list.length ? `<div class="phase3-mini-list">${list.map(entry => `<article><span>${esc(label)}</span><b>${esc(entry.title)}</b><small>${esc(entry.filters?.talentTier || entry.category || 'Talent')}</small></article>`).join('')}</div>` : '<p class="muted smallnote">No matching talent entries found yet.</p>';
  }

  function renderForgeDetailViewer(entry){
    const image = entryImage(entry, entry.domain);
    const tabs = array(entry.tabs).length ? entry.tabs : ['Overview','Lore','Gallery','GM Notes'];
    return `
      <aside class="phase3-detail-viewer" role="dialog" aria-label="${esc(entry.title)} compendium page">
        <article class="phase3-detail-panel">
          <button type="button" class="phase3-detail-close" data-phase3-close-detail>Close</button>
          <header class="phase3-detail-head">
            ${image ? `<img src="${esc(image)}" alt="${esc(entry.title)}" loading="lazy" decoding="async">` : `<span>${esc(String(entry.title || '?').charAt(0).toUpperCase())}</span>`}
            <div>
              <p class="eyebrow">${esc(entry.compendium || titleCase(entry.domain || 'Compendium'))}</p>
              <h2>${esc(entry.title)}</h2>
              <p>${esc(entryCategory(entry, entry.domain))}</p>
            </div>
          </header>
          <nav class="phase3-detail-tabs">${tabs.map(tab => `<span>${esc(tab)}</span>`).join('')}</nav>
          ${pageMetaForEntry(entry)}
          <div class="markdown-body phase3-detail-body">${renderMarkdown(entry.body || entry.content || entry.summary || '')}</div>
        </article>
      </aside>
    `;
  }

  function pageMetaForEntry(entry){
    const metadata = entry?.metadata || {};
    const rows = [
      ['Category', entryCategory(entry, '')],
      ['Playable', isPlayableEntry(entry) ? 'Yes' : 'No'],
      ['Size', metadata.size || entry.filters?.size],
      ['Role', metadata.role || entry.filters?.role],
      ['Difficulty', metadata.difficulty || entry.filters?.difficulty],
      ['Tags', array(entry.tags).join(', ')]
    ].filter(([, value]) => value !== undefined && value !== null && value !== '');
    return rows.length ? `<dl class="phase3-detail-meta">${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : '';
  }

  function renderCharacterReview(saveMode){
    const d = draft();
    const race = raceNameFromDraft(d) || 'Unselected Race';
    const klass = classNameFromDraft(d) || 'Unselected Class';
    const equipment = d.equipment.map(slugValue => entryBySlug('item', slugValue)?.title || slugValue);
    const originEntry = entryBySlug('origin', d.originSlug) || FALLBACK_BACKGROUNDS.find(bg => bg.slug === d.originSlug || bg.slug === d.backgroundSlug);
    const raceEntry = entryBySlug('race', d.raceSlug);
    const finalCharacteristics = finalForgeCharacteristics(d);
    const affinityRolls = finalAffinityRolls(d);
    const magicRules = classMagicRulesForDraft(d);
    const classPatrons = classPatronRecordsForDraft(d);
    const patronSummary = classPatrons.map(record => `${record.className}: ${record.patronName}${record.patronDomain ? ` (${record.patronDomain})` : ''}`);
    const affinitySummary = Object.values(affinityRolls.magic || {})
      .concat(Object.values(affinityRolls.skills || {}))
      .map(record => `${record.title}: ${record.rank}${record.value !== '' ? ` (${record.value})` : ''}`);
    const portrait = entryImage(raceEntry, 'race');
    return `
      <section class="phase3-review-grid">
        <article class="phase3-card span-2">
          <h2>Review Character</h2>
          <div class="phase3-form-grid">
            <label>Name<input data-phase3-detail="name" value="${esc(d.details.name)}" placeholder="Character name"></label>
            <label>Age<input data-phase3-detail="age" value="${esc(d.details.age)}" placeholder="Age"></label>
            <label>Pronouns<input data-phase3-detail="pronouns" value="${esc(d.details.pronouns)}" placeholder="Optional"></label>
          </div>
          <div class="phase3-review-portrait">${portrait ? `<img src="${esc(portrait)}" alt="${esc(race)}">` : `<span>${esc((d.details.name || race || 'A').charAt(0).toUpperCase())}</span>`}</div>
          <dl class="phase3-review-list">
            <div><dt>Name</dt><dd>${esc(d.details.name || 'Unnamed Character')}</dd></div>
            <div><dt>Race</dt><dd>${esc(race)}</dd></div>
            <div><dt>Class</dt><dd>${esc(klass)}</dd></div>
            <div><dt>Origin</dt><dd>${esc(originEntry?.title || 'Unselected')}</dd></div>
            <div><dt>Appearance</dt><dd>${esc([d.appearance.body_type, d.appearance.hair_style, d.appearance.eye_colour].filter(Boolean).join(', ') || 'Not customised')}</dd></div>
            <div><dt>Magic</dt><dd>${esc(d.magicTypes.join(', ') || 'Unselected')}</dd></div>
            <div><dt>Magic Rules</dt><dd>${esc(`${d.classMode === 'multi' ? 'Multi-Class' : 'Single Class'} / ${magicRules.slots} slot${magicRules.slots === 1 ? '' : 's'}${d.patronMagicType ? ` / Patron: ${d.patronMagicType}` : ''}${d.mancerAdvantageMagicType ? ` / Mancer Advantage: ${d.mancerAdvantageMagicType}` : ''}`)}</dd></div>
            ${classPatrons.length ? `<div><dt>Religious Patrons</dt><dd>${esc(patronSummary.join(', '))}</dd></div>` : ''}
            <div><dt>Skills</dt><dd>${esc(d.skills.join(', ') || 'None selected')}</dd></div>
            <div><dt>Affinity Rolls</dt><dd>${esc(affinitySummary.join(', ') || 'Not locked yet')}</dd></div>
            <div><dt>Equipment</dt><dd>${esc(equipment.join(', ') || 'None selected')}</dd></div>
            <div><dt>Characteristics</dt><dd>${esc(FORGE_CHARACTERISTICS.map(key => `${FORGE_STAT_LABELS[key]} ${finalCharacteristics[key] ?? 0}`).join(', '))}</dd></div>
            <div><dt>Backstory</dt><dd>${esc(d.origin.backstory || d.origin.history || 'No backstory entered yet.')}</dd></div>
          </dl>
          <div class="phase3-actions inline">
            <button type="button" data-phase3-return-edit>Return To Edit</button>
            <button type="button" data-phase3-save-character>Save Character</button>
            <button type="button" class="primary" data-phase3-save-character>Create Character</button>
          </div>
        </article>
        ${renderClassTalentsReview()}
        <article class="phase3-card">
          <h2>Profession Slots</h2>
          <p>Players do not choose professions in the forge. Professions are earned through campaign training, guilds, quests, roleplay, apprenticeships, or downtime.</p>
          <div class="phase3-empty-slots"><span>No Profession Learned</span><span>No Profession Learned</span><span>No Profession Learned</span></div>
        </article>
      </section>
    `;
  }

  function renderAppearanceBuilder(raceSlug, compact = false){
    const race = entryBySlug('race', raceSlug) || firstEntry('race');
    const opts = appearanceOptionsForRace(race);
    const d = draft();
    const appearance = d.appearance || {};
    return `
      <section class="phase3-appearance ${compact ? 'compact' : ''}">
        <div class="phase3-preview-card">
          <div class="phase3-avatar">${esc((race?.title || 'A').charAt(0).toUpperCase())}</div>
          <h2>${esc(race?.title || 'Select a race first')}</h2>
          <p>${esc(race?.summary || 'Appearance controls unlock from race metadata.')}</p>
          <dl>
            <div><dt>Height</dt><dd>${esc(appearance.height || opts.height_range)}</dd></div>
            <div><dt>Body Type</dt><dd>${esc(appearance.body_type || opts.body_types[0])}</dd></div>
            <div><dt>Special</dt><dd>${esc(Object.entries(opts.special_features).filter(([, enabled]) => enabled).map(([key]) => titleCase(key)).join(', ') || 'None')}</dd></div>
          </dl>
        </div>
        <div class="phase3-card">
          <div class="phase3-panel-head"><h2>Race-Locked Appearance</h2><div><button type="button" data-phase3-random-appearance>Randomise</button><button type="button" data-phase3-reset-appearance>Reset</button></div></div>
          <div class="phase3-form-grid">
            ${appearanceControl('height', 'Height', [opts.height_range])}
            ${appearanceControl('weight', 'Weight', [opts.weight_range])}
            ${appearanceControl('body_type', 'Body Type', opts.body_types)}
            ${appearanceControl('skin_colour', 'Skin Colour', opts.skin_colours)}
            ${opts.fur_colours.length ? appearanceControl('fur_colour', 'Fur Colour', opts.fur_colours) : ''}
            ${opts.scale_colours.length ? appearanceControl('scale_colour', 'Scale Colour', opts.scale_colours) : ''}
            ${opts.feather_colours.length ? appearanceControl('feather_colour', 'Feather Colour', opts.feather_colours) : ''}
            ${appearanceControl('hair_style', 'Hair Style', opts.hair_styles)}
            ${appearanceControl('hair_colour', 'Hair Colour', opts.hair_colours)}
            ${appearanceControl('eye_colour', 'Eye Colour', opts.eye_colours)}
            ${appearanceControl('facial_features', 'Facial Features', opts.facial_features)}
            <label>Scars<input data-phase3-appearance="scars" value="${esc(appearance.scars || '')}" placeholder="Optional"></label>
            <label>Tattoos<input data-phase3-appearance="tattoos" value="${esc(appearance.tattoos || '')}" placeholder="Optional"></label>
            <label>Markings<input data-phase3-appearance="markings" value="${esc(appearance.markings || '')}" placeholder="Optional"></label>
            <label>Clothing Style<input data-phase3-appearance="clothing_style" value="${esc(appearance.clothing_style || '')}" placeholder="Travel, noble, tribal..."></label>
            <label>Voice / Accent Notes<textarea data-phase3-appearance="voice_notes">${esc(appearance.voice_notes || '')}</textarea></label>
          </div>
          <div class="phase3-feature-grid">
            ${Object.entries(opts.special_features).map(([key, enabled]) => `<label class="${enabled ? '' : 'disabled'}"><input type="checkbox" data-phase3-special="${esc(key)}" ${enabled ? '' : 'disabled'} ${appearance.special_features?.[key] ? 'checked' : ''}> ${esc(titleCase(key))}</label>`).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function appearanceControl(key, label, values){
    const appearance = draft().appearance || {};
    const list = array(values);
    if(list.length <= 1) return `<label>${esc(label)}<input data-phase3-appearance="${esc(key)}" value="${esc(appearance[key] || list[0] || '')}"></label>`;
    return `<label>${esc(label)}<select data-phase3-appearance="${esc(key)}">${list.map(value => `<option value="${esc(value)}" ${appearance[key] === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`;
  }

  function renderAppearanceBuilderPanel(){
    const character = selectedCharacter();
    if(character?.appearance && !draft().raceSlug){
      draft().raceSlug = slug(character.race);
      draft().appearance = Object.assign({}, character.appearance);
    }
    return renderAppearanceBuilder(draft().raceSlug || slug(character?.race || ''), false);
  }

  function renderCharacterSheet(){
    const character = selectedCharacter();
    if(!character) return '<section class="phase3-card"><h2>No Character Selected</h2><p>Create or select a character first.</p></section>';
    const professions = array(character.professions);
    const skills = Object.entries(character.skills || {}).map(([name, rank]) => ({ name, rank }));
    return `
      <section class="phase3-sheet-grid">
        <article class="phase3-card span-2">
          <div class="phase3-panel-head"><div><p class="eyebrow">Character Sheet</p><h2>${esc(character.name || 'Unnamed Character')}</h2></div><span>${esc(character.race || 'Race')} / ${esc(character.klass || 'Class')}</span></div>
          <dl class="phase3-review-list">
            <div><dt>Level</dt><dd>${esc(character.level || 0)}</dd></div>
            <div><dt>XP</dt><dd>${esc(window.AsteriaProgression?.progressSummary?.(character)?.label || `${character.xp || 0} / ${character.xpMax || 1000} XP`)}</dd></div>
            <div><dt>HP</dt><dd>${esc(character.hp?.[0] ?? 10)} / ${esc(character.hp?.[1] ?? 10)}</dd></div>
            <div><dt>SP</dt><dd>${esc(character.sp?.[0] ?? 10)} / ${esc(character.sp?.[1] ?? 10)}</dd></div>
            <div><dt>MP</dt><dd>${esc(character.mp?.[0] ?? 10)} / ${esc(character.mp?.[1] ?? 10)}</dd></div>
            <div><dt>Defence</dt><dd>${esc(character.defence || character.ac || 10)}</dd></div>
            <div><dt>Movement</dt><dd>${esc(character.movement || 'Standard')}</dd></div>
            <div><dt>Campaign</dt><dd>${esc(character.campaign || 'Unassigned')}</dd></div>
          </dl>
        </article>
        <article class="phase3-card"><h3>Attributes</h3><div class="phase3-stat-grid">${ATTRIBUTE_KEYS.map(key => `<span><b>${esc(key.slice(0,3).toUpperCase())}</b>${esc(character.characteristics?.[key] ?? 10)}</span>`).join('')}</div></article>
        <article class="phase3-card"><h3>Skills</h3>${skills.length ? skills.map(skill => `<p><b>${esc(skill.name)}</b> ${esc(SKILL_RANKS[Number(skill.rank) - 1] || skill.rank)}</p>`).join('') : '<p class="muted smallnote">No skills recorded yet.</p>'}</article>
        <article class="phase3-card"><h3>Talents</h3>${talentMiniList(array(character.talents).map(name => ({ title:name, category:'Unlocked' })), 'Unlocked')}</article>
        <article class="phase3-card"><h3>Spells</h3>${array(character.spells).length ? array(character.spells).map(name => `<p>${esc(name)}</p>`).join('') : '<p class="muted smallnote">No spells prepared.</p>'}</article>
        <article class="phase3-card"><h3>Inventory</h3>${array(character.inventory).length ? array(character.inventory).map(item => `<p>${esc(item.name || item)}</p>`).join('') : '<p class="muted smallnote">Inventory is empty.</p>'}</article>
        <article class="phase3-card"><h3>Money Pouch</h3>${renderCoins(character.coins || character.money || {})}</article>
        <article class="phase3-card"><h3>Profession Slots</h3>${professions.length ? professions.map(name => `<p>${esc(name)}</p>`).join('') : '<p>No Profession Learned</p>'}</article>
        <article class="phase3-card span-2"><h3>Appearance</h3><p>${esc(character.appearance?.voice_notes || 'Appearance information can be saved from the Appearance Builder.')}</p></article>
      </section>
    `;
  }

  function renderCoins(coins){
    const keys = ['copper','silver','gold','platinum_crown','royal_crown','royal_platinum'];
    return `<div class="phase3-coin-grid">${keys.map(key => `<span><b>${esc(titleCase(key))}</b>${esc(coins[key] || 0)}</span>`).join('')}</div>`;
  }

  function renderTalentTree(){
    const character = selectedCharacter();
    const classTitle = classNameFromDraft(draft()) || character?.klass || '';
    const talents = talentsForClass(classTitle);
    const byTier = [1,2,3,4,5].map(tier => ({
      tier,
      list:talents.filter(entry => String(entry.filters?.talentTier || entry.metadata?.talentTier || entry.metadata?.talent_tier || entry.category || '').includes(String(tier)))
    }));
    return `
      <section class="phase3-card">
        <div class="phase3-panel-head"><div><h2>Talent Tree Viewer</h2><p>Players can view and plan builds here. Unlocking remains controlled by progression rules.</p></div><span>${esc(classTitle || 'All Classes')}</span></div>
        <div class="phase3-tree-grid">
          ${byTier.map(group => `<section><h3>Tier ${group.tier}</h3>${group.list.length ? group.list.map(talent => `<article class="phase3-talent-node ${group.tier === 1 ? 'unlocked' : 'locked'}"><b>${esc(talent.title)}</b><small>${group.tier === 1 ? 'Available / starter' : 'Locked future talent'}</small><p>${esc(talent.summary || 'Information coming soon.')}</p></article>`).join('') : '<p class="muted smallnote">No entries yet.</p>'}</section>`).join('')}
        </div>
      </section>
    `;
  }

  function renderEncounterBuilder(){
    const encounter = state.encounters.active;
    const creatures = databaseEntries('creature');
    return `
      <section class="phase3-encounter-grid">
        <article class="phase3-card">
          <h2>Create Encounter</h2>
          <div class="phase3-form-grid">
            <label>Encounter Name<input data-phase3-encounter="name" value="${esc(encounter.name)}"></label>
            <label>Party Size<input type="number" min="1" data-phase3-encounter="partySize" value="${Number(encounter.partySize || 4)}"></label>
            <label>Party Level<input type="number" min="0" data-phase3-encounter="partyLevel" value="${Number(encounter.partyLevel || 1)}"></label>
            <label>Biome<input data-phase3-encounter="biome" value="${esc(encounter.biome)}" placeholder="Forest, cave, ruins..."></label>
            <label>Threat Tier<input data-phase3-encounter="threatTier" value="${esc(encounter.threatTier)}" placeholder="Tier 1, Tier 2..."></label>
            <label>Difficulty<select data-phase3-encounter="difficulty"><option ${encounter.difficulty === 'Easy' ? 'selected' : ''}>Easy</option><option ${encounter.difficulty === 'Standard' ? 'selected' : ''}>Standard</option><option ${encounter.difficulty === 'Hard' ? 'selected' : ''}>Hard</option><option ${encounter.difficulty === 'Boss' ? 'selected' : ''}>Boss</option></select></label>
          </div>
          <label>Encounter Notes<textarea data-phase3-encounter="notes">${esc(encounter.notes)}</textarea></label>
          <button type="button" class="primary" data-phase3-recalc-encounter>Calculate XP + Loot Preview</button>
        </article>
        <article class="phase3-card">
          <h2>Creature Selection</h2>
          <input id="phase3CreatureSearch" placeholder="Search creatures..." value="">
          <div class="phase3-mini-list selectable">${creatures.map(creature => `<article data-phase3-add-creature="${esc(creature.slug)}"><span>${esc(creature.filters?.threatTier || creature.category || 'Creature')}</span><b>${esc(creature.title)}</b><small>${esc(creature.summary || '')}</small></article>`).join('') || '<p class="muted smallnote">No creature entries found yet.</p>'}</div>
        </article>
        <article class="phase3-card span-2">
          <h2>Encounter Roster</h2>
          ${encounter.creatures.length ? encounter.creatures.map((creature, index) => `<div class="phase3-row"><b>${esc(creature.name)}</b><span>${esc(creature.threatTier || 'Threat pending')}</span><button type="button" data-phase3-remove-creature="${index}">Remove</button></div>`).join('') : '<p class="muted smallnote">No creatures added yet.</p>'}
          <div class="phase3-result-strip"><span>XP Preview: <b>${esc(encounter.xp || 0)}</b></span><span>Soul Preview: <b>${esc(encounter.soulValue || 0)}</b></span><span>Loot: <b>${esc(array(encounter.lootPreview).join(', ') || 'None')}</b></span></div>
        </article>
      </section>
    `;
  }

  function renderLootGenerator(){
    const rolls = state.lootRolls.slice(-8).reverse();
    return `
      <section class="phase3-encounter-grid">
        <article class="phase3-card">
          <h2>Loot Generator</h2>
          <p>Uses item rarity, creature metadata, biome, threat tier, profession materials, and future soul systems.</p>
          <div class="phase3-form-grid">
            <label>Mode<select id="phase3LootMode"><option>Random Loot</option><option>Harvest Materials</option><option>Alchemy Materials</option><option>Crafting Materials</option><option>Soul Stone Drops</option><option>Boss Loot</option></select></label>
            <label>Threat Tier<input id="phase3LootThreat" value="${esc(state.encounters.active.threatTier || '')}" placeholder="Tier 1"></label>
            <label>Biome<input id="phase3LootBiome" value="${esc(state.encounters.active.biome || '')}" placeholder="Cave"></label>
          </div>
          <button type="button" class="primary" data-phase3-generate-loot>Generate Loot</button>
        </article>
        <article class="phase3-card">
          <h2>Recent Loot Rolls</h2>
          ${rolls.length ? rolls.map(roll => `<div class="phase3-row"><b>${esc(roll.name)}</b><span>${esc(roll.mode)}</span><small>${esc(roll.createdAt)}</small></div>`).join('') : '<p class="muted smallnote">No loot rolls yet.</p>'}
        </article>
      </section>
    `;
  }

  function renderCraftingSystem(){
    const items = databaseEntries('item').slice(0, 12);
    const professions = databaseEntries('profession');
    return `
      <section class="phase3-encounter-grid">
        <article class="phase3-card">
          <h2>Crafting Foundations</h2>
          <div class="phase3-form-grid">
            <label>Recipe Name<input id="phase3RecipeName" placeholder="Iron Longsword"></label>
            <label>Profession Requirement<select id="phase3RecipeProfession"><option value="">None</option>${professions.map(entry => `<option>${esc(entry.title)}</option>`).join('')}</select></label>
            <label>Crafting Time<input id="phase3RecipeTime" placeholder="2 hours"></label>
            <label>Skill Check<input id="phase3RecipeCheck" placeholder="Smithing DC 12"></label>
            <label>Ingredients<textarea id="phase3RecipeIngredients" placeholder="Iron Ingot x2, Leather x1"></textarea></label>
            <label>Failure Results<textarea id="phase3RecipeFailure" placeholder="Material loss, flawed item..."></textarea></label>
          </div>
          <button type="button" class="primary" data-phase3-save-recipe>Save Recipe Draft</button>
        </article>
        <article class="phase3-card">
          <h2>Database Ingredients</h2>
          ${items.map(item => `<div class="phase3-row"><b>${esc(item.title)}</b><span>${esc(item.filters?.rarity || item.category || 'Item')}</span></div>`).join('') || '<p class="muted smallnote">No item entries found yet.</p>'}
        </article>
      </section>
    `;
  }

  function renderProfessionSystem(){
    const character = selectedCharacter();
    const progress = state.professions[character?.id || 'local'] || { slots:[], xp:0, level:0, knownRecipes:[] };
    const professionEntries = databaseEntries('profession');
    return `
      <section class="phase3-encounter-grid">
        <article class="phase3-card">
          <h2>Profession Progression</h2>
          <p>Professions are earned during campaigns. Character creation keeps these slots empty.</p>
          <dl class="phase3-review-list">
            <div><dt>Profession XP</dt><dd>${esc(progress.xp || 0)}</dd></div>
            <div><dt>Profession Level</dt><dd>${esc(progress.level || 0)}</dd></div>
            <div><dt>Known Recipes</dt><dd>${esc(array(progress.knownRecipes).length)}</dd></div>
          </dl>
          <div class="phase3-empty-slots">${[0,1,2].map(index => `<span>${esc(progress.slots?.[index] || 'No Profession Learned')}</span>`).join('')}</div>
        </article>
        <article class="phase3-card">
          <h2>GM Assignment</h2>
          <p class="muted smallnote">Visible as a foundation. GM enforcement connects through campaign permissions.</p>
          <label>Profession<select id="phase3ProfessionAssign">${professionEntries.map(entry => `<option value="${esc(entry.title)}">${esc(entry.title)}</option>`).join('')}</select></label>
          <button type="button" class="primary" data-phase3-assign-profession ${isGMMode() ? '' : 'disabled'}>Assign Profession</button>
        </article>
      </section>
    `;
  }

  function renderPartySystem(){
    const campaign = activeCampaign();
    const partyIds = array(campaign?.party);
    return `
      <section class="phase3-encounter-grid">
        <article class="phase3-card">
          <h2>${esc(campaign?.name || 'Party Workspace')}</h2>
          <p>Party support includes members, chat placeholder, shared notes, shared inventory, quest log, and session history.</p>
          ${partyIds.map(id => {
            const ch = window.chars?.[id] || {};
            return `<div class="phase3-row"><b>${esc(ch.name || id)}</b><span>${esc(ch.race || 'Race')} / ${esc(ch.klass || 'Class')}</span></div>`;
          }).join('') || '<p class="muted smallnote">No party members linked yet.</p>'}
        </article>
        <article class="phase3-card">
          <h2>Shared Notes</h2>
          <textarea data-phase3-party-notes>${esc(state.party.sharedNotes || '')}</textarea>
        </article>
        <article class="phase3-card">
          <h2>Shared Inventory</h2>
          ${state.party.sharedInventory.length ? state.party.sharedInventory.map(item => `<p>${esc(item.name || item)}</p>`).join('') : '<p class="muted smallnote">No shared items yet.</p>'}
        </article>
        <article class="phase3-card">
          <h2>Guild Bank</h2>
          <p class="muted smallnote">Guild bank is separate from personal inventory and money pouches.</p>
          ${renderCoins(state.guild.guildBank.coins || {})}
        </article>
      </section>
    `;
  }

  function renderAdventureGuild(){
    const guild = state.guild;
    return `
      <section class="phase3-encounter-grid">
        <article class="phase3-card">
          <h2>Adventure Guild</h2>
          <dl class="phase3-review-list">
            <div><dt>Guild Rank</dt><dd>${esc(guild.rank)}</dd></div>
            <div><dt>Reputation</dt><dd>${esc(guild.reputation)}</dd></div>
            <div><dt>Party Registration</dt><dd>${esc(activeCampaign()?.name || 'Unregistered')}</dd></div>
          </dl>
        </article>
        <article class="phase3-card"><h2>Contracts</h2>${guild.contracts.length ? guild.contracts.map(contract => `<p>${esc(contract.name)}</p>`).join('') : '<p class="muted smallnote">No contracts posted.</p>'}</article>
        <article class="phase3-card"><h2>Bounties</h2>${guild.bounties.length ? guild.bounties.map(bounty => `<p>${esc(bounty.name)}</p>`).join('') : '<p class="muted smallnote">No bounties posted.</p>'}</article>
        <article class="phase3-card"><h2>Guild Quest Board</h2><button type="button" data-phase3-add-contract>Add Placeholder Contract</button></article>
      </section>
    `;
  }

  function renderGMDashboard(){
    const campaign = activeCampaign();
    const partyIds = array(campaign?.party);
    const gmOnly = isGMMode() || window.AsteriaAuthBridge?.isLoggedIn?.();
    return `
      <section class="phase3-encounter-grid">
        <article class="phase3-card span-2">
          <div class="phase3-panel-head"><div><p class="eyebrow">GM Toolkit</p><h2>${esc(campaign?.name || 'Campaign Overview')}</h2></div><span>${gmOnly ? 'GM tools ready' : 'Login required'}</span></div>
          <p>Campaign overview, player characters, active parties, encounter management, loot tools, lore unlocks, NPC notes, world state, session logs, and GM-only notes.</p>
        </article>
        <article class="phase3-card"><h3>Player Characters</h3>${partyIds.map(id => `<button type="button" class="phase3-link-row" data-phase3-open-character="${esc(id)}">${esc(window.chars?.[id]?.name || id)}</button>`).join('') || '<p class="muted smallnote">No party characters linked.</p>'}</article>
        <article class="phase3-card"><h3>Active Parties</h3><p>${esc(partyIds.length)} party members linked.</p><button type="button" data-phase3-open="partySystem">Open Party System</button></article>
        <article class="phase3-card"><h3>Encounter Management</h3><button type="button" class="primary" data-phase3-open="encounterBuilder">Open Encounter Builder</button></article>
        <article class="phase3-card"><h3>Loot Tools</h3><button type="button" class="primary" data-phase3-open="lootGenerator">Open Loot Generator</button></article>
        <article class="phase3-card"><h3>Lore Unlocks</h3>${state.worldState.loreUnlocks.length ? state.worldState.loreUnlocks.map(item => `<p>${esc(item.title)}</p>`).join('') : '<p class="muted smallnote">No lore unlocks tracked yet.</p>'}</article>
        <article class="phase3-card span-2"><h3>GM-only Notes</h3><textarea data-phase3-gm-notes>${esc(state.worldState.gmNotes || '')}</textarea></article>
      </section>
    `;
  }

  function bind(){
    const root = byId('phase3GameplayShell');
    if(!root) return;
    qsa('[data-phase3-open]', root).forEach(button => {
      button.addEventListener('click', () => openSystem(button.dataset.phase3Open));
    });
    qsa('[data-phase3-tab]', root).forEach(button => {
      button.addEventListener('click', () => { activeTab = button.dataset.phase3Tab; render(); });
    });
    qsa('[data-phase3-step]', root).forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.phase3Step || 0);
        const tabs = forgeTabsForDraft(draft());
        activeTab = tabs[Math.max(0, Math.min(tabs.length - 1, index))];
        draft().activeTab = activeTab;
        draft().step = tabIndex(activeTab);
        saveState('creator-step');
        render();
      });
    });
    byId('phase3GameplayShell')?.addEventListener('input', handleInput);
    root.addEventListener('click', handleClick);
    root.addEventListener('dblclick', handleDoubleClick);
  }

  function handleInput(event){
    const target = event.target;
    if(target.dataset.phase3SkillCategory !== undefined){
      draft().skillCategory = target.value;
      saveState('forge-skill-category');
      render();
      return;
    }
    if(target.dataset.phase3PatronSearch !== undefined){
      draft().forgeSearch.patron = target.value;
      saveState('forge-patron-search');
      render();
      return;
    }
    if(target.dataset.phase3PatronCategory !== undefined){
      draft().patronCategory = target.value;
      saveState('forge-patron-category');
      render();
      return;
    }
    if(target.dataset.phase3ForgeSearch){
      draft().forgeSearch[target.dataset.phase3ForgeSearch] = target.value;
      saveState('forge-search');
      render();
      return;
    }
    if(target.dataset.phase3AffinityValue !== undefined){
      const d = draft();
      const kind = target.dataset.phase3AffinityKind;
      const key = target.dataset.phase3AffinityKey;
      const item = selectedAffinityItems(d).find(entry => entry.kind === kind && entry.key === key);
      if(item){
        const record = normaliseAffinityRecord({ ...(d.affinityRolls?.[kind]?.[key] || {}), value:target.value, locked:false }, item);
        d.affinityRolls = d.affinityRolls || { magic:{}, skills:{} };
        d.affinityRolls[kind] = d.affinityRolls[kind] || {};
        d.affinityRolls[kind][key] = record;
        const card = target.closest('[data-phase3-affinity-card]');
        const rank = card?.querySelector('.phase3-affinity-rank');
        const lines = card?.querySelector('.phase3-affinity-lines');
        if(rank) rank.textContent = record.rank;
        if(lines) {
          lines.innerHTML = `<div><dt>Skill Rank Cap</dt><dd>${esc(record.rank)}</dd></div><div><dt>Affinity Range</dt><dd>${esc(record.affinityRange)}</dd></div><div><dt>Rank Modifier</dt><dd>${esc(signed(record.rankModifier))}</dd></div>`;
        }
      }
      saveState('forge-affinity-roll');
      return;
    }
    if(target.dataset.phase3Attribute) draft().attributes[target.dataset.phase3Attribute] = Number(target.value || 0);
    if(target.dataset.phase3Characteristic) draft().characteristics[target.dataset.phase3Characteristic] = Number(target.value || 0);
    if(target.dataset.phase3Detail) draft().details[target.dataset.phase3Detail] = target.value;
    if(target.dataset.phase3OriginField) draft().origin[target.dataset.phase3OriginField] = target.value;
    if(target.dataset.phase3Family) draft().family_tree[target.dataset.phase3Family] = target.value;
    if(target.dataset.phase3PatronMagic !== undefined) draft().patronMagicType = target.value;
    if(target.dataset.phase3MancerAdvantage !== undefined) draft().mancerAdvantageMagicType = target.value;
    if(target.dataset.phase3Appearance) {
      draft().appearance = draft().appearance || {};
      draft().appearance[target.dataset.phase3Appearance] = target.value;
    }
    if(target.dataset.phase3Encounter) {
      const value = target.type === 'number' ? Number(target.value || 0) : target.value;
      state.encounters.active[target.dataset.phase3Encounter] = value;
    }
    if(target.dataset.phase3PartyNotes) state.party.sharedNotes = target.value;
    if(target.dataset.phase3GmNotes) state.worldState.gmNotes = target.value;
    saveState('phase3-input');
  }

  function handleClick(event){
    const target = event.target.closest('button,article,label');
    if(!target) return;
    if(target.dataset.forgeDeleteCharacter){
      deleteForgedCharacter(target.dataset.forgeDeleteCharacter);
      return;
    }
    if(target.dataset.forgeEditCharacter){
      editForgedCharacter(target.dataset.forgeEditCharacter);
      return;
    }
    if(target.dataset.forgeCardColourSettings){
      openCharacterCardColourSettings(target.dataset.forgeCardColourSettings);
      return;
    }
    if(target.dataset.forgeCardColour && target.dataset.forgeCharacterColourId){
      setCharacterCardColour(target.dataset.forgeCharacterColourId, target.dataset.forgeCardColour);
      return;
    }
    if(target.dataset.forgeNewCharacter !== undefined){
      startNewCharacterForge();
      return;
    }
    if(target.dataset.phase3ClassMode){
      setForgeClassMode(target.dataset.phase3ClassMode);
      return;
    }
    if(target.dataset.phase3AffinityLock !== undefined){
      lockAffinityRoll(target.dataset.phase3AffinityKind, target.dataset.phase3AffinityLock);
      return;
    }
    if(target.dataset.phase3PatronClass){
      draft().activePatronClassSlug = target.dataset.phase3PatronClass;
      saveState('forge-patron-class');
      render();
      return;
    }
    if(target.dataset.phase3ClassPatronCard){
      const d = draft();
      const religious = religiousClassSelections(d);
      const activeClass = religious.find(item => item.slug === d.activePatronClassSlug) || religious[0];
      if(!activeClass) return;
      d.classPatrons = d.classPatrons && typeof d.classPatrons === 'object' && !Array.isArray(d.classPatrons) ? d.classPatrons : {};
      d.classPatrons[activeClass.slug] = target.dataset.phase3ClassPatronCard;
      saveState('forge-class-patron');
      render();
      return;
    }
    if(target.dataset.forgeCharacterId){
      qsa('.forge-character-card').forEach(card => card.classList.toggle('selected', card.dataset.forgeCharacterId === target.dataset.forgeCharacterId));
      window.selected = target.dataset.forgeCharacterId;
      window.toast?.('Character selected. Double-click the card to open the dashboard.');
      return;
    }
    if(target.dataset.phase3ForgeCategory){
      const domain = target.dataset.phase3ForgeCategory;
      draft().forgeCategories[domain] = decodePath(target.dataset.phase3ForgePath);
      saveState('forge-category-filter');
      render();
      return;
    }
    if(target.dataset.phase3ForgeBack){
      const domain = target.dataset.phase3ForgeBack;
      const d = draft();
      d.forgeDrill[domain] = array(d.forgeDrill[domain]).slice(0, -1);
      d.forgeCategories[domain] = array(d.forgeDrill[domain]);
      saveState('forge-category-back');
      render();
      return;
    }
    if(target.dataset.phase3ForgeClear){
      const domain = target.dataset.phase3ForgeClear;
      const d = draft();
      d.forgeCategories[domain] = [];
      d.forgeDrill[domain] = [];
      d.forgeSearch[domain] = '';
      saveState('forge-category-clear');
      render();
      return;
    }
    if(target.dataset.phase3ForgeCrumb){
      const domain = target.dataset.phase3ForgeCrumb;
      const path = decodePath(target.dataset.phase3ForgePath);
      const d = draft();
      d.forgeDrill[domain] = path;
      d.forgeCategories[domain] = path;
      saveState('forge-category-crumb');
      render();
      return;
    }
    const magicCard = target.closest?.('[data-phase3-magic]');
    if(magicCard) {
      toggleMagicType(magicCard.dataset.phase3Magic);
      return;
    }
    if(target.dataset.phase3Race){ draft().raceSlug = target.dataset.phase3Race; saveState('creator-race'); render(); }
    if(target.dataset.phase3Class){ chooseForgeClass(target.dataset.phase3Class); }
    if(target.dataset.phase3Background){ draft().backgroundSlug = target.dataset.phase3Background; draft().originSlug = target.dataset.phase3Background; saveState('creator-background'); render(); }
    if(target.dataset.phase3Origin){ draft().originSlug = target.dataset.phase3Origin; draft().backgroundSlug = target.dataset.phase3Origin; saveState('creator-origin'); render(); }
    if(target.dataset.phase3Pack){ selectEquipmentPack(target.dataset.phase3Pack); }
    if(target.dataset.phase3Skill) toggleSkill(target.dataset.phase3Skill);
    if(target.dataset.phase3Equipment) toggleEquipment(target.dataset.phase3Equipment);
    if(target.dataset.phase3Prev !== undefined || target.dataset.phase3ForgePrev !== undefined){ goForgeTab(-1); }
    if(target.dataset.phase3Next !== undefined || target.dataset.phase3ForgeNext !== undefined){ goForgeTab(1); }
    if(target.dataset.phase3ReturnEdit !== undefined){ activeTab = 'Race'; draft().activeTab = activeTab; render(); }
    if(target.dataset.phase3CloseDetail !== undefined){ forgeDetailEntry = null; render(); }
    if(target.dataset.phase3SaveCharacter !== undefined) saveCharacterFromDraft();
    if(target.dataset.phase3RandomAppearance !== undefined) randomiseAppearance();
    if(target.dataset.phase3ResetAppearance !== undefined){ draft().appearance = {}; saveState('appearance-reset'); render(); }
    if(target.dataset.phase3Special){
      draft().appearance = draft().appearance || {};
      draft().appearance.special_features = draft().appearance.special_features || {};
      draft().appearance.special_features[target.dataset.phase3Special] = target.querySelector('input')?.checked || false;
      saveState('appearance-feature');
    }
    if(target.dataset.phase3AddCreature) addCreatureToEncounter(target.dataset.phase3AddCreature);
    if(target.dataset.phase3RemoveCreature !== undefined) removeCreatureFromEncounter(Number(target.dataset.phase3RemoveCreature));
    if(target.dataset.phase3RecalcEncounter !== undefined){ recalcEncounter(); render(); }
    if(target.dataset.phase3GenerateLoot !== undefined) generateLoot();
    if(target.dataset.phase3SaveRecipe !== undefined) saveRecipeDraft();
    if(target.dataset.phase3AssignProfession !== undefined) assignProfession();
    if(target.dataset.phase3AddContract !== undefined) addGuildContract();
    if(target.dataset.phase3OpenCharacter){ window.selected = target.dataset.phase3OpenCharacter; openSystem('characterSheet'); }
  }

  function handleDoubleClick(event){
    if(event.target.closest('[data-forge-delete-character],[data-forge-edit-character],[data-forge-card-colour],[data-forge-card-colour-settings]')) return;
    const characterCard = event.target.closest('[data-forge-character-id]');
    if(characterCard){
      event.preventDefault();
      event.stopPropagation();
      openCharacterDashboardFromForge(characterCard.dataset.forgeCharacterId);
      return;
    }
    const category = event.target.closest('[data-phase3-forge-category][data-phase3-forge-path]');
    if(category){
      event.preventDefault();
      event.stopPropagation();
      const domain = category.dataset.phase3ForgeCategory;
      const path = decodePath(category.dataset.phase3ForgePath);
      const d = draft();
      d.forgeDrill[domain] = path;
      d.forgeCategories[domain] = path;
      saveState('forge-category-open');
      render();
      return;
    }
    const target = event.target.closest('[data-phase3-entry-domain][data-phase3-entry-slug]');
    if(!target) return;
    const entry = entryBySlug(target.dataset.phase3EntryDomain, target.dataset.phase3EntrySlug);
    if(!entry) return;
    event.preventDefault();
    event.stopPropagation();
    forgeDetailEntry = entry;
    render();
  }

  function goForgeTab(delta){
    const d = draft();
    const tabs = forgeTabsForDraft(d);
    const next = Math.max(0, Math.min(tabs.length - 1, tabIndex(activeTab, d) + delta));
    activeTab = tabs[next];
    draft().activeTab = activeTab;
    draft().step = next;
    saveState(delta > 0 ? 'forge-next' : 'forge-prev');
    render();
  }

  function selectEquipmentPack(packSlug){
    const pack = EQUIPMENT_PACKS.find(item => item.slug === packSlug);
    if(!pack) return;
    const d = draft();
    d.equipmentPackSlug = pack.slug;
    d.equipment = resolveEquipmentPack(pack).map(item => item.slug || slug(item.title));
    saveState('creator-equipment-pack');
    render();
  }

  function toggleSkill(name){
    const d = draft();
    if(d.skills.includes(name)) d.skills = d.skills.filter(item => item !== name);
    else if(d.skills.length < 4) d.skills.push(name);
    else window.toast?.('Character Forge uses exactly 4 starting skills.');
    saveState('creator-skill');
    render();
  }

  function lockAffinityRoll(kind, key){
    const d = draft();
    const item = selectedAffinityItems(d).find(entry => entry.kind === kind && entry.key === key);
    if(!item) return;
    const existing = d.affinityRolls?.[kind]?.[key] || {};
    const value = cleanAffinityValue(existing.value);
    if(value === ''){
      window.toast?.('Enter a D100 affinity roll before locking.');
      return;
    }
    const record = normaliseAffinityRecord({ ...existing, value, locked:!existing.locked }, item);
    d.affinityRolls = d.affinityRolls || { magic:{}, skills:{} };
    d.affinityRolls[kind] = d.affinityRolls[kind] || {};
    d.affinityRolls[kind][key] = record;
    saveState(record.locked ? 'forge-affinity-locked' : 'forge-affinity-unlocked');
    render();
  }

  function toggleMagicType(name){
    const d = draft();
    const rules = classMagicRulesForDraft(d);
    if(rules.slots <= 0){
      window.toast?.('Choose a class before selecting magical elements.');
      return;
    }
    if(name === 'No Magic'){
      window.toast?.('Class rules require magical element slot selection.');
      return;
    }else if(d.magicTypes.includes(name)){
      if(magicTypeIsRequired(name, d)){
        window.toast?.(`${name} is required by class rules.`);
        return;
      }
      d.magicTypes = d.magicTypes.filter(item => item !== name);
      if(slug(d.patronMagicType) === slug(name)) d.patronMagicType = '';
      if(slug(d.mancerAdvantageMagicType) === slug(name)) d.mancerAdvantageMagicType = '';
    }else{
      const selectedCount = array(d.magicTypes).filter(item => String(item).toLowerCase() !== 'no magic').length;
      if(selectedCount >= rules.slots){
        window.toast?.(`This class setup allows ${rules.slots} magical element slot${rules.slots === 1 ? '' : 's'}.`);
        return;
      }
      d.magicTypes = d.magicTypes.filter(item => item !== 'No Magic').concat(name);
    }
    enforceMagicRules(d);
    saveState('creator-magic');
    render();
  }

  function toggleEquipment(slugValue){
    const d = draft();
    if(d.equipment.includes(slugValue)) d.equipment = d.equipment.filter(item => item !== slugValue);
    else d.equipment.push(slugValue);
    saveState('creator-equipment');
    render();
  }

  function randomiseAppearance(){
    const race = entryBySlug('race', draft().raceSlug) || firstEntry('race');
    const opts = appearanceOptionsForRace(race);
    function pick(list){ const arr = array(list); return arr[Math.floor(Math.random() * arr.length)] || ''; }
    draft().appearance = {
      height:opts.height_range,
      weight:opts.weight_range,
      body_type:pick(opts.body_types),
      skin_colour:pick(opts.skin_colours),
      fur_colour:pick(opts.fur_colours),
      scale_colour:pick(opts.scale_colours),
      feather_colour:pick(opts.feather_colours),
      hair_style:pick(opts.hair_styles),
      hair_colour:pick(opts.hair_colours),
      eye_colour:pick(opts.eye_colours),
      facial_features:pick(opts.facial_features),
      special_features:Object.fromEntries(Object.entries(opts.special_features).filter(([, enabled]) => enabled))
    };
    saveState('appearance-randomised');
    render();
  }

  function saveCharacterFromDraft(){
    const d = draft();
    if(!d.raceSlug){
      activeTab = 'Race';
      saveState('forge-race-required');
      window.toast?.('Choose a race before saving.');
      render();
      return;
    }
    if(!d.classSlug){
      activeTab = 'Class';
      saveState('forge-class-required');
      window.toast?.('Choose a class before saving.');
      render();
      return;
    }
    if(d.classMode === 'multi' && classSlugsFromDraft(d).length < MAX_CHARACTER_CLASSES){
      activeTab = 'Class';
      saveState('forge-secondary-class-required');
      window.toast?.('Choose a secondary class or switch back to Single Class.');
      render();
      return;
    }
    const patronIssues = religiousPatronIssues(d);
    if(patronIssues.length){
      activeTab = 'Patron';
      saveState('forge-patron-required');
      window.toast?.(patronIssues[0]);
      render();
      return;
    }
    const magicIssues = magicSelectionIssues(d);
    if(magicIssues.length){
      activeTab = 'Magic';
      saveState('forge-magic-required');
      window.toast?.(magicIssues[0]);
      render();
      return;
    }
    if(d.skills.length !== 4){
      activeTab = 'Skills';
      saveState('forge-skills-required');
      window.toast?.('Choose exactly 4 starting skills before saving.');
      render();
      return;
    }
    if(!affinityRollsComplete(d)){
      activeTab = 'Affinity Rolls';
      saveState('forge-affinity-required');
      window.toast?.('Enter and lock affinity rolls for selected magic and skills before saving.');
      render();
      return;
    }
    const name = String(d.details.name || '').trim() || 'New Character';
    const editingId = d.editCharacterId && window.chars?.[d.editCharacterId] ? d.editCharacterId : '';
    const existingCharacter = editingId ? window.chars[editingId] : null;
    const id = editingId || uniqueCharacterId(name);
    const raceEntry = entryBySlug('race', d.raceSlug);
    const classSlugs = classSlugsFromDraft(d);
    const classEntries = classSlugs.map(slugValue => entryBySlug('class', slugValue)).filter(Boolean);
    const classEntry = classEntries[0] || entryBySlug('class', d.classSlug);
    const originEntry = entryBySlug('origin', d.originSlug) || FALLBACK_BACKGROUNDS.find(bg => bg.slug === d.originSlug || bg.slug === d.backgroundSlug);
    const race = raceEntry?.title || raceNameFromDraft(d) || 'Unselected';
    const klass = classDisplayNameFromDraft(d) || classEntry?.title || classNameFromDraft(d) || 'Unselected';
    const startingTalentNames = Array.from(new Set(classEntries.flatMap(entry => startingTalentsForClass(entry.title).map(talent => talent.title))));
    const talentClassKey = classKeyFromEntry(classEntry, klass);
    const talentClasses = classEntries.map(entry => classKeyFromEntry(entry, entry.title)).filter(Boolean).slice(0, MAX_CHARACTER_CLASSES);
    const classInfo = Object.assign(classInfoFromEntry(classEntry, classEntry?.title || klass, talentClassKey), {
      lockedPrimary:true,
      maxClasses:MAX_CHARACTER_CLASSES,
      classes:classEntries.map(entry => classInfoFromEntry(entry, entry.title, classKeyFromEntry(entry, entry.title)))
    });
    const characteristicRules = raceCharacteristicRulesFor(raceEntry);
    const racialInfo = raceInfoPayloadForEntry(raceEntry);
    const characteristics = finalForgeCharacteristics(d);
    const affinityRolls = finalAffinityRolls(d);
    const magicRules = classMagicRulesForDraft(d);
    const classPatrons = classPatronRecordsForDraft(d);
    const existingGmGrantedMagic = array(existingCharacter?.gmGrantedMagicTypes || existingCharacter?.character?.magic?.gmGrantedTypes);
    const racialMagicTypes = racialMagicTypesForEntry(raceEntry);
    const existingGmBonusMagicSlots = Math.max(
      Number(existingCharacter?.gmBonusMagicSlots || existingCharacter?.character?.magic?.gmBonusSlots || 0),
      existingGmGrantedMagic.length
    );
    const mancerAffinity = magicRules.hasMancer ? {
      advantage:d.mancerAdvantageMagicType,
      disadvantage:d.magicTypes.filter(name => slug(name) !== slug(d.mancerAdvantageMagicType))
    } : null;
    const created = existingCharacter?.created || existingCharacter?.character?.created || now();
    const updated = now();
    const resourceMax = window.asteriaResourceMaxFromCharacteristic || ((value, modifier = 0) => 10 + (Number(value) || 0) * 10 + (Number(modifier) || 0));
    const hpMax = resourceMax(characteristics.constitution, existingCharacter?.resourceMods?.hp);
    const spMax = resourceMax(characteristics.endurance, existingCharacter?.resourceMods?.sp);
    const mpMax = resourceMax(characteristics.wisdom, existingCharacter?.resourceMods?.mp);
    const dashboard = {
      id:existingCharacter?.dashboard?.id || existingCharacter?.character?.dashboard?.id || 'dashboard-'+id,
      characterId:id,
      route:'player',
      title:name+' Dashboard',
      created,
      updated
    };
    const selectedPack = EQUIPMENT_PACKS.find(pack => pack.slug === d.equipmentPackSlug);
    const inventory = d.equipment.map(slugValue => ({ id:slugValue, name:entryBySlug('item', slugValue)?.title || titleCase(slugValue) }));
    const characterSchema = {
      id,
      name,
      race:{
        slug:d.raceSlug,
        title:race,
        metadata:raceEntry?.metadata || {},
        info:racialInfo,
        traits:racialInfo.traits,
        featuresMarkdown:racialInfo.featuresMarkdown,
        traitsMarkdown:racialInfo.traitsMarkdown,
        movementMarkdown:racialInfo.movementMarkdown,
        bonusesMarkdown:racialInfo.bonusesMarkdown
      },
      class:{
        slug:classSlugs[0] || d.classSlug,
        title:klass,
        key:talentClassKey,
        metadata:classEntry?.metadata || {},
        info:classInfo,
        patrons:classPatrons
      },
      classSlugs,
      primaryClassSlug:classSlugs[0] || d.classSlug,
      secondaryClassSlugs:classSlugs.slice(1),
      classMode:d.classMode,
      classLimit:{ max:MAX_CHARACTER_CLASSES, primaryLocked:true },
      cardColour:safeCardColour(d.cardColour),
      appearance:Object.assign({}, d.appearance),
      origin:{
        slug:d.originSlug || d.backgroundSlug || '',
        title:originEntry?.title || '',
        data:Object.assign({}, d.origin)
      },
      characteristics:Object.assign({}, characteristics),
      characteristic_rules:characteristicRules,
      racial_info:racialInfo,
      classPatrons,
      religiousPatrons:classPatrons,
      magic:{
        types:d.magicTypes.slice(),
        racialTypes:racialMagicTypes.slice(),
        gmGrantedTypes:existingGmGrantedMagic.slice(),
        gmBonusSlots:existingGmBonusMagicSlots,
        rules:magicRules,
        patronLinkedType:d.patronMagicType || '',
        classPatrons,
        patrons:classPatrons,
        mancerAffinity,
        affinities:affinityRolls.magic
      },
      skills:d.skills.slice(),
      affinityRolls,
      magicAffinities:affinityRolls.magic,
      skillAffinities:affinityRolls.skills,
      equipment:{
        pack:selectedPack ? { slug:selectedPack.slug, title:selectedPack.title } : null,
        items:inventory.slice()
      },
      family_tree:Object.assign({}, d.family_tree),
      backstory:Object.assign({}, d.origin),
      dashboard,
      created,
      updated
    };
    window.chars = window.chars || {};
    window.chars[id] = {
      id,
      initial:name.charAt(0).toUpperCase() || 'N',
      name,
      race,
      klass,
      classSlug:classSlugs[0] || d.classSlug,
      classSlugs,
      primaryClassSlug:classSlugs[0] || d.classSlug,
      secondaryClassSlugs:classSlugs.slice(1),
      classMode:d.classMode,
      classLimit:{ max:MAX_CHARACTER_CLASSES, primaryLocked:true },
      classInfo,
      age:d.details.age || '',
      pronouns:d.details.pronouns || '',
      origin:d.originSlug || d.backgroundSlug || '',
      originTitle:originEntry?.title || '',
      originNotes:d.origin.notes || d.origin.backstory || '',
      ownerUid:existingCharacter?.ownerUid || currentUserKey(),
      level:Number(existingCharacter?.level ?? 0),
      hp:existingCharacter?.hp ? [Math.min(Number(existingCharacter.hp[0] || 0), hpMax), hpMax] : [hpMax, hpMax],
      sp:existingCharacter?.sp ? [Math.min(Number(existingCharacter.sp[0] || 0), spMax), spMax] : [spMax, spMax],
      mp:existingCharacter?.mp ? [Math.min(Number(existingCharacter.mp[0] || 0), mpMax), mpMax] : [mpMax, mpMax],
      xp:Number(existingCharacter?.xp ?? 0),
      xpMax:window.AsteriaProgression?.xpToNextLevel?.(Number(existingCharacter?.level ?? 0)) || Number(existingCharacter?.xpMax ?? 1000),
      cp:Number(existingCharacter?.cp ?? 0),
      tp:Number(existingCharacter?.tp ?? 0),
      campaign:existingCharacter?.campaign || 'Unassigned',
      session:existingCharacter?.session || 'No active session',
      resourceMods:Object.assign({ hp:0, sp:0, mp:0 }, existingCharacter?.resourceMods || {}),
      characteristics,
      characteristicRules,
      raceInfo:racialInfo,
      racialFeatures:racialInfo.featuresMarkdown,
      racialTraits:racialInfo.traits,
      racialTraitsMarkdown:racialInfo.traitsMarkdown,
      racialMovement:racialInfo.movementMarkdown || racialInfo.movement,
      racialBonuses:racialInfo.bonusesMarkdown,
      skills:Object.fromEntries(d.skills.map(skill => [skill, Number(existingCharacter?.skills?.[skill] || 1)])),
      affinityRolls,
      magicAffinities:affinityRolls.magic,
      skillAffinities:affinityRolls.skills,
      talents:Object.assign({}, existingCharacter?.talents || {}, Object.fromEntries(startingTalentNames.map(name => [name, { rank:1, source:'Character Forge' }]))),
      classTalents:startingTalentNames.slice(),
      talentClass:talentClassKey,
      talentClasses,
      spells:array(existingCharacter?.spells),
      magicTypes:d.magicTypes.slice(),
      racialMagicTypes:racialMagicTypes.slice(),
      gmGrantedMagicTypes:existingGmGrantedMagic.slice(),
      gmBonusMagicSlots:existingGmBonusMagicSlots,
      magicRules,
      patronMagicType:d.patronMagicType || '',
      classPatrons,
      religiousPatrons:classPatrons,
      mancerAffinity,
      inventory,
      bags:array(existingCharacter?.bags),
      coins:Object.assign({}, existingCharacter?.coins || {}),
      conditions:array(existingCharacter?.conditions),
      professions:array(existingCharacter?.professions),
      appearance:Object.assign({}, d.appearance),
      family_tree:Object.assign({}, d.family_tree),
      backstory:Object.assign({}, d.origin),
      cardColour:safeCardColour(d.cardColour),
      dashboard,
      character:characterSchema,
      professionSlots:['No Profession Learned','No Profession Learned','No Profession Learned']
    };
    window.AsteriaCharacterDashboards = window.AsteriaCharacterDashboards || {};
    window.AsteriaCharacterDashboards[id] = window.ensureCharacterDashboardLink?.(id) || dashboard;
    characterSchema.dashboard = window.chars[id].dashboard || dashboard;
    const accountKey = currentUserKey();
    window.accountUsers = window.accountUsers || {};
    window.accountUsers[accountKey] = window.accountUsers[accountKey] || { characters:[] };
    window.accountUsers[accountKey].characters = Array.from(new Set([...(window.accountUsers[accountKey].characters || []), id]));
    window.session = window.session || {};
    if(!window.session.account && !window.session.uid && !window.session.user) window.session.account = accountKey;
    window.session.character = id;
    window.selected = id;
    window.saveAccountState?.();
    state.characters[id] = { id, createdAt:created, dashboard:characterSchema.dashboard, character:characterSchema, build:d };
    state.drafts.characterCreator = defaultState().drafts.characterCreator;
    saveState(editingId ? 'phase3a-character-updated' : 'phase3a-character-forged');
    window.AsteriaFirebase?.saveCharacter?.(id, window.chars[id]);
    const joinedCampaign = window.AsteriaWorkspace?.consumePendingCampaignJoin?.(id);
    window.ensureProgressionData?.();
    window.ensureTalentData?.(id);
    window.renderPlayerHome?.();
    window.renderUnlockedTalentSummary?.(id);
    window.renderTalentTreeUI?.(id);
    if(document.getElementById('player')?.classList.contains('show')) window.loadPlayer?.(id);
    window.toast?.(`${editingId ? 'Character updated' : 'Character saved'}: ${name}${joinedCampaign?.name ? ` linked to ${joinedCampaign.name}` : ''}`);
    openCharacterForgeHub();
  }

  function normalizedCharacteristics(characteristics){
    const source = Object.assign({}, characteristics || {});
    if(source.might !== undefined && source.strength === undefined) source.strength = source.might;
    if(source.agility !== undefined && source.dexterity === undefined) source.dexterity = source.agility;
    if(source.might !== undefined && source.constitution === undefined) source.constitution = source.might;
    if(source.willpower !== undefined && source.endurance === undefined) source.endurance = source.willpower;
    if(source.intellect !== undefined && source.intelligence === undefined) source.intelligence = source.intellect;
    if(source.willpower !== undefined && source.wisdom === undefined) source.wisdom = source.willpower;
    if(source.presence !== undefined && source.charisma === undefined) source.charisma = source.presence;
    if(source.aether !== undefined && source.luck === undefined) source.luck = source.aether;
    return Object.fromEntries(FORGE_CHARACTERISTICS.map(key => [key, Number(source[key] ?? 10)]));
  }

  function uniqueCharacterId(name){
    const base = slug(name);
    let id = base;
    let index = 2;
    while(window.chars?.[id]) id = `${base}-${index++}`;
    return id;
  }

  function addCreatureToEncounter(slugValue){
    const entry = entryBySlug('creature', slugValue);
    if(!entry) return;
    state.encounters.active.creatures.push({
      slug:entry.slug,
      name:entry.title,
      threatTier:entry.filters?.threatTier || entry.metadata?.threatTier || '',
      levelRange:entry.filters?.levelRange || '',
      xp:valueFromThreat(entry.filters?.threatTier || entry.metadata?.threatTier),
      soulValue:Number(entry.metadata?.soulValue || entry.metadata?.soul_value || 0)
    });
    recalcEncounter();
    saveState('encounter-creature-added');
    render();
  }

  function removeCreatureFromEncounter(index){
    state.encounters.active.creatures.splice(index, 1);
    recalcEncounter();
    saveState('encounter-creature-removed');
    render();
  }

  function valueFromThreat(threat){
    const match = String(threat || '').match(/\d+/);
    const tier = match ? Number(match[0]) : 1;
    return tier * 100;
  }

  function recalcEncounter(){
    const encounter = state.encounters.active;
    encounter.xp = encounter.creatures.reduce((total, creature) => total + Number(creature.xp || valueFromThreat(creature.threatTier)), 0);
    encounter.soulValue = encounter.creatures.reduce((total, creature) => total + Number(creature.soulValue || 0), 0);
    encounter.lootPreview = generateLootPreview();
    saveState('encounter-recalculated');
    return encounter;
  }

  function generateLootPreview(){
    return databaseEntries('item').slice(0, 3).map(entry => entry.title);
  }

  function generateLoot(){
    const items = databaseEntries('item');
    const mode = byId('phase3LootMode')?.value || 'Random Loot';
    const pick = items[Math.floor(Math.random() * Math.max(1, items.length))];
    const roll = {
      id:`loot-${Date.now()}`,
      mode,
      name:pick?.title || 'Coins and salvage',
      itemSlug:pick?.slug || '',
      threatTier:byId('phase3LootThreat')?.value || state.encounters.active.threatTier || '',
      biome:byId('phase3LootBiome')?.value || state.encounters.active.biome || '',
      createdAt:now()
    };
    state.lootRolls.push(roll);
    saveState('loot-generated');
    render();
  }

  function saveRecipeDraft(){
    const recipe = {
      id:`recipe-${Date.now()}`,
      name:byId('phase3RecipeName')?.value || 'New Recipe',
      profession:byId('phase3RecipeProfession')?.value || '',
      craftingTime:byId('phase3RecipeTime')?.value || '',
      skillCheck:byId('phase3RecipeCheck')?.value || '',
      ingredients:byId('phase3RecipeIngredients')?.value || '',
      failureResults:byId('phase3RecipeFailure')?.value || '',
      createdAt:now()
    };
    state.crafting.recipes.push(recipe);
    saveState('recipe-saved');
    window.toast?.('Recipe draft saved.');
    render();
  }

  function assignProfession(){
    if(!isGMMode()) {
      window.toast?.('GM mode is required to assign professions.');
      return;
    }
    const character = selectedCharacter();
    if(!character) return;
    const profession = byId('phase3ProfessionAssign')?.value;
    if(!profession) return;
    const id = character.id;
    state.professions[id] = state.professions[id] || { slots:[], xp:0, level:0, knownRecipes:[] };
    state.professions[id].slots = Array.from(new Set([...(state.professions[id].slots || []), profession]));
    window.chars[id].professions = state.professions[id].slots;
    saveState('profession-assigned');
    render();
  }

  function addGuildContract(){
    state.guild.contracts.push({
      id:`contract-${Date.now()}`,
      name:'Open Contract',
      reward:'Pending',
      status:'Posted',
      createdAt:now()
    });
    saveState('guild-contract-added');
    render();
  }

  function setForgeClassMode(mode){
    const d = draft();
    d.classMode = mode === 'multi' ? 'multi' : 'single';
    if(d.classMode !== 'multi') d.extraClassSlugs = [];
    enforceMagicRules(d);
    saveState('creator-class-mode');
    render();
  }

  function chooseForgeClass(slugValue){
    const d = draft();
    const picked = classSlugFromValue(slugValue);
    if(d.editCharacterId && d.lockedClassSlug){
      const locked = classSlugFromValue(d.lockedClassSlug);
      if(picked === locked){
        window.toast?.('Primary class is locked for this character.');
        return;
      }
      if(d.classMode !== 'multi'){
        window.toast?.('Choose Multi-Class to add a secondary class.');
        return;
      }
      d.extraClassSlugs = array(d.extraClassSlugs).filter(value => classSlugFromValue(value) !== locked);
      if(d.extraClassSlugs.includes(picked)){
        d.extraClassSlugs = d.extraClassSlugs.filter(value => value !== picked);
      }else{
        d.extraClassSlugs = [picked].slice(0, MAX_CHARACTER_CLASSES - 1);
      }
      enforceMagicRules(d);
      saveState('creator-secondary-class');
      render();
      return;
    }
    if(d.classMode === 'multi' && d.classSlug){
      const primary = classSlugFromValue(d.classSlug);
      if(picked === primary){
        window.toast?.('Primary class selected. Choose a different card for secondary class.');
        return;
      }
      if(d.extraClassSlugs.includes(picked)){
        d.extraClassSlugs = d.extraClassSlugs.filter(value => value !== picked);
      }else{
        d.extraClassSlugs = [picked].slice(0, MAX_CHARACTER_CLASSES - 1);
      }
      enforceMagicRules(d);
      saveState('creator-secondary-class');
      render();
      return;
    }
    d.classSlug = picked;
    d.lockedClassSlug = '';
    d.extraClassSlugs = [];
    enforceMagicRules(d);
    saveState('creator-class');
    render();
  }

  function setCharacterCardColour(id, colour){
    const character = window.chars?.[id];
    if(!character) return false;
    character.cardColour = safeCardColour(colour);
    if(character.character) character.character.cardColour = character.cardColour;
    window.saveAccountState?.();
    window.saveAsteriaState?.();
    saveState('character-card-colour');
    render();
    return true;
  }

  function editForgedCharacter(id){
    const character = window.chars?.[id];
    if(!character){
      window.toast?.('Character not found.');
      return false;
    }
    const schema = character.character || {};
    const primaryClassSlug = classSlugFromValue(character.primaryClassSlug || schema.class?.slug || character.classSlug || character.talentClass || character.klass);
    const savedClassSlugs = array(character.classSlugs || schema.classSlugs || character.secondaryClassSlugs)
      .map(classSlugFromValue)
      .filter(Boolean);
    const secondaryClassSlugs = savedClassSlugs.filter(value => value !== primaryClassSlug).slice(0, MAX_CHARACTER_CLASSES - 1);
    const skillKeys = Array.isArray(character.skills) ? character.skills : Object.keys(character.skills || {});
    const equipmentItems = array(schema.equipment?.items || character.inventory).map(item => item?.id || item?.slug || slug(item?.name || item?.title || item)).filter(Boolean);
    const savedClassPatrons = classPatronMapFrom(character.classPatrons || character.religiousPatrons || schema.classPatrons || schema.religiousPatrons || schema.magic?.classPatrons || schema.magic?.patrons || schema.class?.patrons);
    state.drafts.characterCreator = Object.assign(defaultState().drafts.characterCreator, {
      activeTab:'Race',
      editCharacterId:id,
      lockedClassSlug:primaryClassSlug,
      raceSlug:schema.race?.slug || slug(character.race),
      classSlug:primaryClassSlug,
      classMode:secondaryClassSlugs.length ? 'multi' : (schema.classMode || character.classMode || 'single'),
      extraClassSlugs:secondaryClassSlugs,
      originSlug:schema.origin?.slug || character.origin || '',
      backgroundSlug:schema.origin?.slug || character.origin || '',
      equipmentPackSlug:schema.equipment?.pack?.slug || '',
      cardColour:safeCardColour(character.cardColour || schema.cardColour),
      characteristics:Object.assign(Object.fromEntries(FORGE_CHARACTERISTICS.map(key => [key, 10])), character.characteristics || schema.characteristics || {}),
      magicTypes:array(character.magicTypes || schema.magic?.types),
      patronMagicType:character.patronMagicType || schema.magic?.patronLinkedType || '',
      classPatrons:savedClassPatrons,
      mancerAdvantageMagicType:character.mancerAffinity?.advantage || schema.magic?.mancerAffinity?.advantage || '',
      skills:skillKeys.slice(0, 4),
      affinityRolls:Object.assign({ magic:{}, skills:{} }, character.affinityRolls || schema.affinityRolls || { magic:character.magicAffinities || schema.magicAffinities || schema.magic?.affinities || {}, skills:character.skillAffinities || schema.skillAffinities || {} }),
      equipment:equipmentItems,
      appearance:Object.assign({}, character.appearance || schema.appearance || {}),
      origin:Object.assign(defaultState().drafts.characterCreator.origin, schema.origin?.data || character.backstory || {}),
      family_tree:Object.assign(defaultState().drafts.characterCreator.family_tree, character.family_tree || schema.family_tree || {}),
      details:{ name:character.name || '', age:character.age || '', pronouns:character.pronouns || '' }
    });
    activeSystem = 'characterCreator';
    forgeMode = 'create';
    activeTab = 'Race';
    saveState('character-forge-edit');
    render();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    window.toast?.(`Editing ${character.name || 'character'}. Primary class is locked.`);
    return true;
  }

  function deleteForgedCharacter(id){
    const character = window.chars?.[id];
    if(!character) {
      window.toast?.('Character not found.');
      return false;
    }
    const name = character.name || 'this character';
    if(!window.confirm?.(`Delete ${name}? This removes the local character card and dashboard link.`)) return false;
    const keys = currentAccountKeys();
    window.accountUsers = window.accountUsers || {};
    Object.values(window.accountUsers).forEach(record => {
      if(record?.characters) record.characters = record.characters.filter(characterId => characterId !== id);
    });
    (window.campaigns || []).forEach(campaign => {
      campaign.party = array(campaign.party).filter(characterId => characterId !== id);
      if(campaign.characters) delete campaign.characters[id];
      if(campaign.playerCharacterLinks) delete campaign.playerCharacterLinks[id];
      Object.values(campaign.players || {}).forEach(player => {
        if(player?.characterIds) player.characterIds = player.characterIds.filter(characterId => characterId !== id);
      });
    });
    if(window.AsteriaCharacterDashboards) delete window.AsteriaCharacterDashboards[id];
    delete window.chars[id];
    delete state.characters[id];
    if(window.session?.character === id) window.session.character = accountCharacterIds().find(characterId => window.chars?.[characterId]) || null;
    if(window.selected === id) window.selected = window.session?.character || Object.keys(window.chars || {})[0] || null;
    window.saveAccountState?.();
    window.saveAsteriaState?.();
    saveState('character-forge-delete');
    window.toast?.(`${name} deleted.`);
    openCharacterForgeHub();
    return true;
  }

  function openCharacterDashboardFromForge(id){
    if(!window.chars?.[id]) {
      window.toast?.('Character not found.');
      return false;
    }
    window.ensureCharacterDashboardLink?.(id);
    window.session = window.session || {};
    window.session.character = id;
    window.selected = id;
    const character=window.chars[id];
    const campaignId=character.sharedCampaignId || array(character.linkedCampaignIds)[0] ||
      array(window.campaigns).find(campaign => array(campaign?.party).includes(id))?.id || '';
    if(campaignId && window.AsteriaReactMigration?.available){
      window.AsteriaReactMigration.openCharacter(campaignId,id);
      return true;
    }
    if(typeof window.forceOpenPlayerDashboard === 'function') return window.forceOpenPlayerDashboard(id);
    document.querySelectorAll('.view').forEach(view => view.classList.remove('show'));
    byId('workspace')?.classList.remove('show');
    byId('player')?.classList.add('show');
    window.loadPlayer?.(id);
    window.saveAsteriaState?.();
    return true;
  }

  function allMagicTypeNames(){
    return magicGroups().flatMap(group => group.elements).map(element => magicInfoByName(element.name || element.type).name || element.name || element.type).filter(Boolean);
  }

  function activeMagicCampaign(){
    return array(window.campaigns)[Number(window.activeCampaign || 0)] || array(window.campaigns)[0] || null;
  }

  function campaignMagicCharacterIds(campaign = activeMagicCampaign()){
    if(!campaign) return [];
    const playerIds = Object.values(campaign.players || {}).flatMap(player => array(player?.characterIds));
    return Array.from(new Set([
      ...array(campaign.party),
      ...Object.keys(campaign.characters || {}),
      ...Object.keys(campaign.playerCharacterLinks || {}),
      ...playerIds
    ])).filter(Boolean);
  }

  function magicCharacter(id){
    const campaign = activeMagicCampaign();
    return window.chars?.[id] || campaign?.characters?.[id] || null;
  }

  function persistMagicCharacter(id, character, reason){
    if(!character) return;
    window.chars = window.chars || {};
    window.chars[id] = character;
    window.saveAccountState?.();
    window.saveAsteriaState?.();
    const user = window.AsteriaFirebase?.getUser?.();
    if(!character.ownerUid || character.ownerUid === user?.uid) window.AsteriaFirebase?.saveCharacter?.(id, character);
    array(window.campaigns).filter(campaign => campaign?.characters?.[id] || campaignMagicCharacterIds(campaign).includes(id)).forEach(campaign => {
      if(campaign?.id) window.AsteriaFirebase?.saveCampaignCharacter?.(campaign.id, id, character);
    });
    window.AsteriaDataSync?.scheduleSave?.(reason);
    saveState(reason);
  }

  function characterRacialMagicTypes(character){
    const types = array(character?.racialMagicTypes || character?.character?.magic?.racialTypes).map(canonicalMagicType).filter(Boolean);
    const raceName = String(character?.race || character?.raceName || character?.character?.race?.name || '');
    if(/undien/i.test(raceName)) types.push('Water Magic');
    const pixie = raceName.match(/^(Air|Earth|Water|Fire|Life|Death|Light|Dark)\s+Pixie/i);
    if(pixie) types.push(`${pixie[1]} Magic`);
    return Array.from(new Set(types.map(canonicalMagicType).filter(Boolean)));
  }

  function characterGMBonusMagicSlots(character){
    const grants = array(character?.gmGrantedMagicTypes || character?.character?.magic?.gmGrantedTypes);
    return Math.max(Number(character?.gmBonusMagicSlots || character?.character?.magic?.gmBonusSlots || 0), grants.length);
  }

  function setCharacterGMBonusMagicSlots(id, amount){
    const character = magicCharacter(id);
    if(!character) return false;
    const grants = array(character.gmGrantedMagicTypes || character.character?.magic?.gmGrantedTypes);
    const slots = Math.max(grants.length, Math.min(20, Number(amount || 0)));
    character.gmBonusMagicSlots = slots;
    character.character = character.character || {};
    character.character.magic = Object.assign({}, character.character.magic || {}, { gmBonusSlots:slots });
    persistMagicCharacter(id, character, 'gm-magic-slot-update');
    installGMMagicGrantPanel(id);
    installGMPartyMagicPanel();
    window.toast?.(`${character.name} now has ${slots} GM bonus magic slot${slots === 1 ? '' : 's'}.`);
    return true;
  }

  function grantCharacterMagicType(id, type){
    const character = magicCharacter(id);
    const magicType = magicInfoByName(type).name || type;
    if(!character || !magicType) return false;
    const base = array(character.magicTypes || character.character?.magic?.types);
    const racial = characterRacialMagicTypes(character);
    const grants = array(character.gmGrantedMagicTypes || character.character?.magic?.gmGrantedTypes);
    const slots = characterGMBonusMagicSlots(character);
    if(base.concat(racial).some(name => slug(name) === slug(magicType))){
      window.toast?.(`${magicType} is already available to ${character.name}.`);
      return false;
    }
    if(grants.length >= slots){
      window.toast?.(`Grant an additional magic slot to ${character.name} first.`);
      return false;
    }
    if(!grants.some(name => slug(name) === slug(magicType))) grants.push(magicType);
    character.gmGrantedMagicTypes = grants;
    character.character = character.character || {};
    character.character.magic = Object.assign({}, character.character.magic || {}, { gmGrantedTypes:grants.slice() });
    persistMagicCharacter(id, character, 'gm-magic-grant');
    window.toast?.(`${magicType} granted to ${character.name}.`);
    installGMPartyMagicPanel();
    if(document.getElementById('gmPlayer')?.classList.contains('show')) window.renderGMPlayer?.();
    if(document.getElementById('player')?.classList.contains('show')) window.loadPlayer?.(id);
    return true;
  }

  function revokeCharacterMagicType(id, type){
    const character = magicCharacter(id);
    if(!character || !type) return false;
    const grants = array(character.gmGrantedMagicTypes || character.character?.magic?.gmGrantedTypes).filter(name => slug(name) !== slug(type));
    character.gmGrantedMagicTypes = grants;
    if(character.character?.magic) character.character.magic.gmGrantedTypes = grants.slice();
    persistMagicCharacter(id, character, 'gm-magic-revoke');
    window.toast?.(`${type} removed from GM-granted magic.`);
    installGMPartyMagicPanel();
    if(document.getElementById('gmPlayer')?.classList.contains('show')) window.renderGMPlayer?.();
    if(document.getElementById('player')?.classList.contains('show')) window.loadPlayer?.(id);
    return true;
  }

  function installGMMagicGrantPanel(id = selectedCharacterId()){
    if(window.AsteriaReactMigration?.isDashboardActive?.()) return;
    const character = magicCharacter(id);
    const host = document.querySelector('#gmPlayer .gm-player-grid') || document.querySelector('#gmPlayer');
    if(!host || !character) return;
    byId('phase3GMMagicGrantPanel')?.remove();
    const base = array(character.magicTypes || character.character?.magic?.types);
    const racial = characterRacialMagicTypes(character);
    const grants = array(character.gmGrantedMagicTypes || character.character?.magic?.gmGrantedTypes);
    const bonusSlots = characterGMBonusMagicSlots(character);
    const available = allMagicTypeNames().filter(name => !base.concat(racial, grants).some(existing => slug(existing) === slug(name)));
    const panel = document.createElement('section');
    panel.id = 'phase3GMMagicGrantPanel';
    panel.className = 'card phase3-gm-magic-grant-panel';
    panel.innerHTML = `
      <div class="section-head mini"><div><p class="eyebrow">GM Magic Access</p><h3>Grant Additional Elements</h3></div><span class="pill">GM override</span></div>
      <p class="muted smallnote">Race magic and class-selected elements stay separate. Each GM-granted element uses one bonus slot.</p>
      <div class="phase3-gm-magic-slot-row"><b>Bonus slots: ${grants.length}/${bonusSlots} used</b><button type="button" data-phase3-gm-slot-delta="-1" ${bonusSlots <= grants.length ? 'disabled' : ''}>- Slot</button><button type="button" data-phase3-gm-slot-delta="1">+ Slot</button></div>
      <div class="phase3-gm-magic-row"><label>Element<select id="phase3GMMagicGrantSelect">${available.map(name => `<option>${esc(name)}</option>`).join('')}</select></label><button type="button" class="primary" data-phase3-gm-grant-magic="${esc(id)}" ${available.length && grants.length < bonusSlots ? '' : 'disabled'}>Grant Element</button></div>
      <div class="phase3-gm-magic-list"><b>Class Magic</b><span>${esc(base.join(', ') || 'None')}</span></div>
      <div class="phase3-gm-magic-list"><b>Race Magic</b><span>${esc(racial.join(', ') || 'None')}</span></div>
      <div class="phase3-gm-magic-list"><b>GM Granted</b>${grants.length ? grants.map(name => `<button type="button" data-phase3-gm-revoke-magic="${esc(name)}" data-phase3-gm-revoke-id="${esc(id)}">${esc(name)} x</button>`).join('') : '<span>None</span>'}</div>
    `;
    host.appendChild(panel);
    panel.querySelector('[data-phase3-gm-grant-magic]')?.addEventListener('click', () => grantCharacterMagicType(id, byId('phase3GMMagicGrantSelect')?.value));
    qsa('[data-phase3-gm-slot-delta]', panel).forEach(button => button.addEventListener('click', () => {
      setCharacterGMBonusMagicSlots(id, bonusSlots + Number(button.dataset.phase3GmSlotDelta || 0));
    }));
    qsa('[data-phase3-gm-revoke-magic]', panel).forEach(button => button.addEventListener('click', () => revokeCharacterMagicType(button.dataset.phase3GmRevokeId, button.dataset.phase3GmRevokeMagic)));
  }

  function installGMPartyMagicPanel(){
    if(window.AsteriaReactMigration?.isDashboardActive?.()) return;
    const host = document.querySelector('#gm .gm-panels');
    if(!host) return;
    byId('phase3GMPartyMagicPanel')?.remove();
    const campaign = activeMagicCampaign();
    const ids = campaignMagicCharacterIds(campaign).filter(id => magicCharacter(id));
    const panel = document.createElement('section');
    panel.id = 'phase3GMPartyMagicPanel';
    panel.className = 'card phase3-gm-party-magic-panel';
    panel.dataset.gmSystem = 'gm-main';
    panel.innerHTML = `
      <div class="section-head mini"><div><p class="eyebrow">GM Magic Access</p><h3>Additional Element Slots</h3></div><span class="pill">Campaign linked</span></div>
      <p class="muted smallnote">Bonus elements are separate from class slots and race-granted affinities.</p>
      <div class="phase3-gm-party-magic-list">${ids.map(id => {
        const character = magicCharacter(id);
        const classTypes = array(character?.magicTypes || character?.character?.magic?.types).map(canonicalMagicType).filter(Boolean);
        const raceTypes = characterRacialMagicTypes(character);
        const granted = array(character?.gmGrantedMagicTypes || character?.character?.magic?.gmGrantedTypes).map(canonicalMagicType).filter(Boolean);
        const slots = characterGMBonusMagicSlots(character);
        const available = allMagicTypeNames().filter(name => !classTypes.concat(raceTypes, granted).some(existing => slug(existing) === slug(name)));
        return `<article class="phase3-gm-party-magic-row">
          <div><h4>${esc(character?.name || id)}</h4><small>Class: ${esc(classTypes.join(', ') || 'None')} | Race: ${esc(raceTypes.join(', ') || 'None')}</small></div>
          <div class="phase3-gm-magic-slot-row"><b>${granted.length}/${slots} bonus slots</b><button type="button" data-party-magic-slot="${esc(id)}" data-party-magic-delta="-1" ${slots <= granted.length ? 'disabled' : ''}>-</button><button type="button" data-party-magic-slot="${esc(id)}" data-party-magic-delta="1">+</button></div>
          <div class="phase3-gm-magic-row"><select data-party-magic-select="${esc(id)}">${available.map(name => `<option>${esc(name)}</option>`).join('')}</select><button type="button" class="primary" data-party-magic-grant="${esc(id)}" ${available.length && granted.length < slots ? '' : 'disabled'}>Grant</button></div>
          <div class="phase3-gm-magic-list"><b>GM Granted</b>${granted.length ? granted.map(name => `<button type="button" data-party-magic-revoke="${esc(id)}" data-party-magic-type="${esc(name)}">${esc(name)} x</button>`).join('') : '<span>None</span>'}</div>
        </article>`;
      }).join('') || '<p>No linked campaign characters are available.</p>'}</div>`;
    host.appendChild(panel);
    qsa('[data-party-magic-slot]', panel).forEach(button => button.addEventListener('click', () => {
      const character = magicCharacter(button.dataset.partyMagicSlot);
      setCharacterGMBonusMagicSlots(button.dataset.partyMagicSlot, characterGMBonusMagicSlots(character) + Number(button.dataset.partyMagicDelta || 0));
    }));
    qsa('[data-party-magic-grant]', panel).forEach(button => button.addEventListener('click', () => {
      grantCharacterMagicType(button.dataset.partyMagicGrant, panel.querySelector(`[data-party-magic-select="${button.dataset.partyMagicGrant}"]`)?.value);
    }));
    qsa('[data-party-magic-revoke]', panel).forEach(button => button.addEventListener('click', () => revokeCharacterMagicType(button.dataset.partyMagicRevoke, button.dataset.partyMagicType)));
    window.applyGMSystemPanel?.();
  }

  function openCharacterForgeHub(){
    activeSystem = 'characterCreator';
    forgeMode = 'hub';
    activeTab = draft().activeTab || 'Race';
    render();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function startNewCharacterForge(){
    state.drafts.characterCreator = defaultState().drafts.characterCreator;
    activeSystem = 'characterCreator';
    forgeMode = 'create';
    activeTab = 'Race';
    draft().activeTab = activeTab;
    saveState('character-forge-new-draft');
    render();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function openSystem(id = 'characterCreator', mode = ''){
    activeSystem = SYSTEMS.some(system => system.id === id) ? id : 'characterCreator';
    forgeMode = activeSystem === 'characterCreator' ? (mode === 'create' ? 'create' : 'hub') : 'system';
    activeTab = systemConfig(activeSystem).tabs[0];
    render();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function gameplayEntries(){
    return SYSTEMS.map(system => ({
      id:`gameplay:${system.id}`,
      title:system.label,
      name:system.label,
      slug:system.id,
      section:'Gameplay Systems',
      workspaceSection:'Gameplay Systems',
      type:'Gameplay',
      domain:'gameplay',
      categoryPath:[system.tag],
      summary:`Phase 3A ${system.label} foundation.`,
      metadata:{ gameplaySystem:true, systemId:system.id, version:VERSION },
      searchTerms:[system.label, system.tag, 'phase 3a gameplay rpg campaign character gm forge'].join(' ').toLowerCase()
    }));
  }

  function installNav(){
    // Keep gameplay systems available through workspace/GM panels without adding a second sidebar menu.
  }

  function installGMPanel(){
    const host = document.querySelector('#gm .gm-panels') || document.querySelector('#gm .gm-main') || document.querySelector('#gm');
    if(!host || byId('phase3GMToolsPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'phase3GMToolsPanel';
    panel.className = 'card phase3-gm-hook-panel';
    panel.dataset.gmSystem = 'phase-3a';
    panel.innerHTML = `
      <div class="section-head mini"><div><p class="eyebrow">Phase 3A</p><h3>Gameplay Toolkit</h3></div><span class="pill">Database-linked</span></div>
      <div class="phase3-hook-actions">
        <button type="button" data-phase3-side="encounterBuilder">Encounter Builder</button>
        <button type="button" data-phase3-side="lootGenerator">Loot Generator</button>
        <button type="button" data-phase3-side="partySystem">Party System</button>
        <button type="button" data-phase3-side="gmDashboard">GM Tools</button>
      </div>
    `;
    host.appendChild(panel);
    qsa('[data-phase3-side]', panel).forEach(button => button.addEventListener('click', () => openSystem(button.dataset.phase3Side)));
    window.applyGMSystemPanel?.();
  }

  function publish(){
    originalOpenDashboard = originalOpenDashboard || window.AsteriaWorkspace?.openDashboard;
    originalWorkspaceEntries = originalWorkspaceEntries || window.AsteriaWorkspace?.entries;
    const api = {
      version:VERSION,
      forgeTabs:() => forgeTabsForDraft(draft()).slice(),
      systems:() => SYSTEMS.map(system => Object.assign({}, system)),
      state:() => JSON.parse(JSON.stringify(state)),
      save:saveState,
      entries:gameplayEntries,
      openSystem,
      openCharacterForge:openCharacterForgeHub,
      openCharacterCreator:startNewCharacterForge,
      openCharacterSheet:() => openSystem('characterSheet'),
      openEncounterBuilder:() => openSystem('encounterBuilder'),
      openLootGenerator:() => openSystem('lootGenerator'),
      databaseEntries,
      appearanceOptionsForRace,
      recalcEncounter,
      generateLoot,
      saveCharacterFromDraft,
      openCharacterForgeHub,
      startNewCharacterForge,
      openCharacterDashboard:openCharacterDashboardFromForge,
      grantCharacterMagicType,
      revokeCharacterMagicType,
      setCharacterGMBonusMagicSlots,
      racialMagicTypesForEntry,
      classMagicRulesForDraft
    };
    function routedDashboard(mode, ...args){
      if(mode === 'createCharacter') return startNewCharacterForge();
      if(mode === 'characters') return openCharacterForgeHub();
      if(mode === 'characterSheet') return openSystem('characterSheet');
      return originalOpenDashboard?.(mode, ...args);
    }
    function entriesWithGameplay(){
      const base = typeof originalWorkspaceEntries === 'function' ? originalWorkspaceEntries() : [];
      return base.concat(gameplayEntries());
    }
    window.AsteriaGameplay = api;
    window.AsteriaWorkspace = Object.assign({}, window.AsteriaWorkspace || {}, {
      gameplay:api,
      openGameplaySystem:openSystem,
      openCharacterForge:api.openCharacterForgeHub,
      openCharacterCreator:api.openCharacterCreator,
      openEncounterBuilder:api.openEncounterBuilder,
      openLootGenerator:api.openLootGenerator,
      openDashboard:routedDashboard,
      entries:entriesWithGameplay
    });
    window.toggleCharacterCreator = function(){ return openCharacterForgeHub(); };
    window.AsteriaGameplayGrantMagic = grantCharacterMagicType;
    window.AsteriaGameplayRevokeMagic = revokeCharacterMagicType;
    window.AsteriaGameplaySetMagicSlots = setCharacterGMBonusMagicSlots;
  }

  function boot(){
    publish();
    installNav();
    window.AsteriaViewHooks?.afterGMRender?.('phase3-gm-toolkit', installGMPanel);
    window.AsteriaViewHooks?.afterGMRender?.('phase3-gm-party-magic', installGMPartyMagicPanel);
    window.AsteriaViewHooks?.afterGMPlayerRender?.('phase3-gm-magic-grants', id => installGMMagicGrantPanel(id));
    window.addEventListener('asteria:campaigns-refreshed', () => {
      if(byId('gm')?.classList.contains('show')) installGMPartyMagicPanel();
    });
    if(byId('gm')?.classList.contains('show')){
      installGMPanel();
      installGMPartyMagicPanel();
    }
    if(byId('gmPlayer')?.classList.contains('show')) installGMMagicGrantPanel();
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
