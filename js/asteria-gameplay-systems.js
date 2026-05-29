/* Asteria Phase 3A Character Forge.
   Frontend-safe gameplay foundations connected to the universal compendium database. */
(function(){
  'use strict';

  const VERSION = 'asteria-character-forge-final';
  const STORE_KEY = 'asteria.phase3.gameplay.v1';
  const ATTRIBUTE_KEYS = ['strength','dexterity','agility','constitution','endurance','intelligence','wisdom','charisma','luck'];
  const FORGE_TABS = ['Race','Class','Appearance','Origin','Characteristics','Magic','Skills','Equipment','Review'];
  const FORGE_CHARACTERISTICS = ATTRIBUTE_KEYS;
  const FORGE_STAT_LABELS = { strength:'STR', dexterity:'DEX', agility:'AGI', constitution:'CON', endurance:'END', intelligence:'INT', wisdom:'WIS', charisma:'CHA', luck:'LCK' };
  const MAGIC_TYPE_GROUPS = [
    { label:'Basic Elements', types:['Air Magic','Dark Magic','Death Magic','Earth Magic','Fire Magic','Life Magic','Light Magic','Water Magic'] },
    { label:'Higher Elements', types:['Abyssal Magic','Blood Magic','Celestial Magic','Chaos Magic','Eldritch Magic','Fae Magic','Fate Magic','Infernal Magic','Space Magic','Spirit Magic','Time Magic'] }
  ];
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

  let state = loadState();
  let activeSystem = 'characterCreator';
  let activeTab = '';
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
          raceSlug:'',
          classSlug:'',
          originSlug:'',
          backgroundSlug:'',
          equipmentPackSlug:'',
          attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key, 10])),
          characteristics:Object.fromEntries(FORGE_CHARACTERISTICS.map(key => [key, 10])),
          magicTypes:[],
          forgeCategories:{ race:[], class:[] },
          forgeDrill:{ race:[], class:[] },
          forgeSearch:{ race:'', class:'' },
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
      const playableKeys = playableSlugSet('race');
      if(playableKeys.size){
        entries = entries.filter(entry => playableKeys.has(entry.slug) || playableKeys.has(slug(entry.title || entry.name)));
      }else{
        const explicitPlayable = entries.filter(isPlayableEntry);
        entries = explicitPlayable.length ? explicitPlayable : entries;
      }
      return entries.sort((a,b) => String(a.title).localeCompare(String(b.title)));
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

  function tabIndex(tab = activeTab){
    return Math.max(0, FORGE_TABS.indexOf(tab));
  }

  function firstEntry(domain){
    return (domain === 'race' || domain === 'class' ? forgeDatabaseEntries(domain) : databaseEntries(domain))[0] || null;
  }

  function entryBySlug(domain, slugValue){
    const key = slug(slugValue);
    const source = domain === 'race' || domain === 'class' ? forgeDatabaseEntries(domain) : databaseEntries(domain);
    return source.find(entry => entry.slug === key || slug(entry.title || entry.name) === key) || null;
  }

  function classNameFromDraft(draft){
    return entryBySlug('class', draft.classSlug)?.title || draft.classSlug || '';
  }

  function raceNameFromDraft(draft){
    return entryBySlug('race', draft.raceSlug)?.title || draft.raceSlug || '';
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
    if(activeSystem === 'characterCreator') draft().activeTab = activeTab;
    const root = shell();
    if(activeSystem === 'characterCreator'){
      if(!FORGE_TABS.includes(activeTab)) activeTab = draft().activeTab || FORGE_TABS[0];
      draft().activeTab = activeTab;
      root.classList.add('phase3-forge-shell');
      root.innerHTML = renderCharacterCreator();
      bind();
      return;
    }
    root.classList.remove('phase3-forge-shell');
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
    if(tab === 'Class') return Boolean(d.classSlug);
    if(tab === 'Appearance') return Boolean(Object.keys(d.appearance || {}).length);
    if(tab === 'Origin') return Boolean(d.originSlug || Object.values(d.origin || {}).some(Boolean) || Object.values(d.family_tree || {}).some(Boolean));
    if(tab === 'Characteristics') return FORGE_CHARACTERISTICS.every(key => d.characteristics?.[key] !== '' && d.characteristics?.[key] !== undefined);
    if(tab === 'Magic') return d.magicTypes.length > 0;
    if(tab === 'Skills') return d.skills.length === 4;
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
    d.forgeSearch = Object.assign({ race:'', class:'' }, d.forgeSearch || {});
    d.skills = array(d.skills);
    d.equipment = array(d.equipment);
    d.appearance = d.appearance || {};
    d.origin = Object.assign(defaultState().drafts.characterCreator.origin, d.origin || {});
    d.family_tree = Object.assign(defaultState().drafts.characterCreator.family_tree, d.family_tree || {});
    d.details = Object.assign({ name:'', age:'', pronouns:'' }, d.details || {});
    if(!FORGE_TABS.includes(d.activeTab)) d.activeTab = FORGE_TABS[Math.max(0, Math.min(FORGE_TABS.length - 1, Number(d.step || 0)))];
    d.step = tabIndex(d.activeTab);
    return d;
  }

  function renderStepPills(){
    return `<div class="phase3-stepper">${FORGE_TABS.map((step, index) => `<button type="button" class="${step === activeTab ? 'active' : ''} ${forgeTabComplete(step) ? 'done' : ''}" data-phase3-step="${index}"><b>${index + 1}</b><span>${esc(step)}</span></button>`).join('')}</div>`;
  }

  function renderCharacterCreator(){
    const d = draft();
    const current = tabIndex(activeTab);
    const completed = FORGE_TABS.filter(forgeTabComplete).length;
    return `
      <section class="phase3-creator">
        <article class="phase3-card phase3-forge-intro">
          <div class="phase3-panel-head">
            <div><p class="eyebrow">Guided Journey</p><h2>Character Forge</h2><p>Build a playable Asteria character from compendium races, classes, skills, origins, and items.</p></div>
            <span>${completed}/${FORGE_TABS.length} complete</span>
          </div>
        </article>
        ${renderStepPills()}
        <div class="phase3-creator-body">
          ${renderForgeTab(activeTab)}
        </div>
        <footer class="phase3-actions">
          <button type="button" data-phase3-forge-prev ${current <= 0 ? 'disabled' : ''}>Back</button>
          <button type="button" class="primary" data-phase3-forge-next ${current >= FORGE_TABS.length - 1 ? 'disabled' : ''}>Next</button>
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
        ${entryImage(entry, domain) ? `<div class="phase3-pick-art"><img src="${esc(entryImage(entry, domain))}" alt="${esc(entry.title)}"></div>` : `<div class="phase3-pick-art phase3-pick-symbol">${esc(String(entry.title || '?').charAt(0).toUpperCase())}</div>`}
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
    const selected = entry.slug === selectedSlug;
    if(domain === 'class'){
      const accent = entry.class_colour || entry.metadata?.class_colour || '#1f7dff';
      return `
        <article class="phase3-pick-card phase3-forge-entry-card phase3-forge-class-card ${selected ? 'selected' : ''}" style="--class-accent:${esc(accent)}" data-${actionName}="${esc(entry.slug)}" data-phase3-entry-domain="${esc(domain)}" data-phase3-entry-slug="${esc(entry.slug)}">
          <div class="phase3-class-symbol">${esc(entry.symbol || entry.metadata?.symbol || String(entry.title || 'C').charAt(0).toUpperCase())}</div>
          <span>${esc(entryCategory(entry, 'Class'))}</span>
          <h3>${esc(entry.title)}</h3>
          <p>${esc([entry.role, entry.difficulty].filter(Boolean).join(' • ') || entry.summary || 'Information coming soon.')}</p>
        </article>
      `;
    }
    return `
      <article class="phase3-pick-card phase3-forge-entry-card ${selected ? 'selected' : ''}" data-${actionName}="${esc(entry.slug)}" data-phase3-entry-domain="${esc(domain)}" data-phase3-entry-slug="${esc(entry.slug)}">
        ${image ? `<div class="phase3-pick-art"><img src="${esc(image)}" alt="${esc(entry.title)}"></div>` : `<div class="phase3-pick-art phase3-pick-symbol">${esc(String(entry.title || '?').charAt(0).toUpperCase())}</div>`}
        <span>${esc(entryCategory(entry, 'Race'))}</span>
        <h3>${esc(entry.title)}</h3>
        <p>${esc(entry.summary || 'Information coming soon.')}</p>
      </article>
    `;
  }

  function renderForgeTab(tab){
    const d = draft();
    if(tab === 'Race') return renderForgeChoice('race', d.raceSlug, 'phase3-race', 'Choose Race', 'Only playable, player-visible races are shown here. The category panel uses the Race Compendium structure.');
    if(tab === 'Class') return renderForgeChoice('class', d.classSlug, 'phase3-class', 'Choose Class', 'Playable classes are pulled from the Class Compendium. Talents are previewed only and are not chosen freely.');
    if(tab === 'Appearance') return renderAppearanceBuilder(d.raceSlug, true);
    if(tab === 'Origin') return renderOriginBuilder();
    if(tab === 'Characteristics') return renderCharacteristics();
    if(tab === 'Magic') return renderMagicSelection();
    if(tab === 'Skills') return renderStartingSkills();
    if(tab === 'Equipment') return renderStartingEquipment();
    return renderCharacterReview(true);
  }

  function renderForgeChoice(domain, selectedSlug, actionName, title, intro){
    const selected = selectedSlug ? entryBySlug(domain, selectedSlug) : null;
    const entries = forgeDatabaseEntries(domain);
    return `
      <section class="phase3-card">
        <div class="phase3-panel-head">
          <div><h2>${esc(title)}</h2><p>${esc(intro)}</p></div>
          ${selected ? `<button type="button" class="primary" data-phase3-forge-next>Select ${esc(title.replace(/^Choose\s+/, ''))}</button>` : ''}
        </div>
        <div class="phase3-forge-search-row">
          <label>Search<input data-phase3-forge-search="${esc(domain)}" value="${esc(draft().forgeSearch?.[domain] || '')}" placeholder="Search ${esc(domain === 'race' ? 'races' : 'classes')}..."></label>
          ${selected ? `<span>Selected: ${esc(selected.title)}</span>` : '<span>No selection yet</span>'}
        </div>
        <div class="phase3-forge-compendium">
          ${renderForgeCategoryPanel(domain, entries)}
          ${renderForgeCompendiumCards(domain, entries, selectedSlug, actionName)}
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
    return `
      <section class="phase3-card">
        <div class="phase3-panel-head">
          <div><h2>Characteristics</h2><p>Enter rolled values using the same nine-stat characteristic structure as the Character Dashboard.</p></div>
          <span>Dice roller reserved</span>
        </div>
        <div class="phase3-characteristic-grid">
          ${FORGE_CHARACTERISTICS.map(key => `
            <label class="phase3-characteristic-card">
              <span>${esc(FORGE_STAT_LABELS[key] || key.slice(0,3).toUpperCase())}</span>
              <input type="number" min="0" max="30" value="${Number(d.characteristics[key] ?? 10)}" data-phase3-characteristic="${esc(key)}">
              <b>${esc(forgeTierOf(d.characteristics[key] ?? 10))}</b>
              <small>${esc(titleCase(key))}</small>
            </label>
          `).join('')}
        </div>
      </section>
    `;
  }

  function forgeTierOf(value){
    if(typeof window.tierOf === 'function') return window.tierOf(Number(value || 0));
    const numeric = Number(value || 0);
    if(numeric >= 90) return 'T9';
    if(numeric >= 80) return 'T8';
    if(numeric >= 70) return 'T7';
    if(numeric >= 60) return 'T6';
    if(numeric >= 50) return 'T5';
    if(numeric >= 40) return 'T4';
    if(numeric >= 30) return 'T3';
    if(numeric >= 20) return 'T2';
    return 'T1';
  }

  function renderMagicSelection(){
    const d = draft();
    const selected = new Set(d.magicTypes);
    return `
      <section class="phase3-card">
        <div class="phase3-panel-head">
          <div><h2>Magic</h2><p>Select the character's magic type access. This is stored on the character profile for later spell and class systems.</p></div>
          <span>${esc(d.magicTypes.length ? `${d.magicTypes.length} selected` : 'Choose magic type')}</span>
        </div>
        <div class="phase3-magic-layout">
          <article class="phase3-magic-none ${selected.has('No Magic') ? 'selected' : ''}" data-phase3-magic="No Magic">
            <span>None</span>
            <h3>No Magic</h3>
            <p>Use this for martial or non-magical characters.</p>
          </article>
          ${MAGIC_TYPE_GROUPS.map(group => `
            <section class="phase3-magic-group">
              <h3>${esc(group.label)}</h3>
              <div class="phase3-magic-grid">
                ${group.types.map(type => `
                  <button type="button" class="${selected.has(type) ? 'selected' : ''}" data-phase3-magic="${esc(type)}">
                    <span></span>${esc(type)}
                  </button>
                `).join('')}
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
    return `
      <section class="phase3-card">
        <h2>Choose 4 Starting Skills</h2>
        <p>Skills come from the Skill Compendium. Race, class, and origin recommendations are shown as suggestions only.</p>
        <div class="phase3-suggestion-line"><b>Suggestions:</b> ${suggestions.length ? suggestions.map(esc).join(', ') : 'No database recommendations yet.'}</div>
        <div class="phase3-card-grid compact">
          ${skills.map(skill => {
            const name = skill.title || skill.name;
            const selected = d.skills.includes(name);
            return `<article class="phase3-pick-card ${selected ? 'selected' : ''}" data-phase3-skill="${esc(name)}"><span>${esc(selected ? 'Selected' : (skill.category || 'Skill'))}</span><h3>${esc(name)}</h3><p>${esc(skill.summary || 'Rank starts at Novice unless modified by race, class, or origin.')}</p></article>`;
          }).join('')}
        </div>
        <p class="muted smallnote">Selected: ${d.skills.length}/4. Exactly 4 skills are required before saving.</p>
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
            ${image ? `<img src="${esc(image)}" alt="${esc(entry.title)}">` : `<span>${esc(String(entry.title || '?').charAt(0).toUpperCase())}</span>`}
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
            <div><dt>Skills</dt><dd>${esc(d.skills.join(', ') || 'None selected')}</dd></div>
            <div><dt>Equipment</dt><dd>${esc(equipment.join(', ') || 'None selected')}</dd></div>
            <div><dt>Characteristics</dt><dd>${esc(FORGE_CHARACTERISTICS.map(key => `${FORGE_STAT_LABELS[key]} ${d.characteristics[key] ?? 0}`).join(', '))}</dd></div>
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
            <div><dt>XP</dt><dd>${esc(character.xp || 0)} / ${esc(character.xpMax || 5000)}</dd></div>
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
        activeTab = FORGE_TABS[Math.max(0, Math.min(FORGE_TABS.length - 1, index))];
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
    if(target.dataset.phase3ForgeSearch){
      draft().forgeSearch[target.dataset.phase3ForgeSearch] = target.value;
      saveState('forge-search');
      render();
      return;
    }
    if(target.dataset.phase3Attribute) draft().attributes[target.dataset.phase3Attribute] = Number(target.value || 0);
    if(target.dataset.phase3Characteristic) draft().characteristics[target.dataset.phase3Characteristic] = Number(target.value || 0);
    if(target.dataset.phase3Detail) draft().details[target.dataset.phase3Detail] = target.value;
    if(target.dataset.phase3OriginField) draft().origin[target.dataset.phase3OriginField] = target.value;
    if(target.dataset.phase3Family) draft().family_tree[target.dataset.phase3Family] = target.value;
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
    if(target.dataset.phase3Magic) {
      toggleMagicType(target.dataset.phase3Magic);
      return;
    }
    if(target.dataset.phase3Race){ draft().raceSlug = target.dataset.phase3Race; saveState('creator-race'); render(); }
    if(target.dataset.phase3Class){ draft().classSlug = target.dataset.phase3Class; saveState('creator-class'); render(); }
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
    const next = Math.max(0, Math.min(FORGE_TABS.length - 1, tabIndex(activeTab) + delta));
    activeTab = FORGE_TABS[next];
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

  function toggleMagicType(name){
    const d = draft();
    if(name === 'No Magic'){
      d.magicTypes = ['No Magic'];
    }else if(d.magicTypes.includes(name)){
      d.magicTypes = d.magicTypes.filter(item => item !== name);
    }else{
      d.magicTypes = d.magicTypes.filter(item => item !== 'No Magic').concat(name);
    }
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
    if(d.skills.length !== 4){
      activeTab = 'Skills';
      saveState('forge-skills-required');
      window.toast?.('Choose exactly 4 starting skills before saving.');
      render();
      return;
    }
    const name = String(d.details.name || '').trim() || 'New Character';
    const id = uniqueCharacterId(name);
    const raceEntry = entryBySlug('race', d.raceSlug);
    const classEntry = entryBySlug('class', d.classSlug);
    const originEntry = entryBySlug('origin', d.originSlug) || FALLBACK_BACKGROUNDS.find(bg => bg.slug === d.originSlug || bg.slug === d.backgroundSlug);
    const race = raceEntry?.title || raceNameFromDraft(d) || 'Unselected';
    const klass = classEntry?.title || classNameFromDraft(d) || 'Unselected';
    const talents = startingTalentsForClass(klass).map(entry => entry.title);
    const characteristics = normalizedCharacteristics(d.characteristics);
    const created = now();
    const selectedPack = EQUIPMENT_PACKS.find(pack => pack.slug === d.equipmentPackSlug);
    const inventory = d.equipment.map(slugValue => ({ id:slugValue, name:entryBySlug('item', slugValue)?.title || titleCase(slugValue) }));
    const characterSchema = {
      id,
      name,
      race:{
        slug:d.raceSlug,
        title:race,
        metadata:raceEntry?.metadata || {}
      },
      class:{
        slug:d.classSlug,
        title:klass,
        metadata:classEntry?.metadata || {}
      },
      appearance:Object.assign({}, d.appearance),
      origin:{
        slug:d.originSlug || d.backgroundSlug || '',
        title:originEntry?.title || '',
        data:Object.assign({}, d.origin)
      },
      characteristics:Object.assign({}, characteristics),
      magic:{ types:d.magicTypes.slice() },
      skills:d.skills.slice(),
      equipment:{
        pack:selectedPack ? { slug:selectedPack.slug, title:selectedPack.title } : null,
        items:inventory.slice()
      },
      family_tree:Object.assign({}, d.family_tree),
      backstory:Object.assign({}, d.origin),
      created,
      updated:created
    };
    window.chars = window.chars || {};
    window.chars[id] = {
      id,
      initial:name.charAt(0).toUpperCase() || 'N',
      name,
      race,
      klass,
      age:d.details.age || '',
      pronouns:d.details.pronouns || '',
      origin:d.originSlug || d.backgroundSlug || '',
      originTitle:originEntry?.title || '',
      originNotes:d.origin.notes || d.origin.backstory || '',
      ownerUid:currentUserKey(),
      level:0,
      hp:[10 + Number(d.characteristics.constitution || 0), 10 + Number(d.characteristics.constitution || 0)],
      sp:[10 + Number(d.characteristics.endurance || 0), 10 + Number(d.characteristics.endurance || 0)],
      mp:[10 + Number(d.characteristics.wisdom || 0), 10 + Number(d.characteristics.wisdom || 0)],
      xp:0,
      xpMax:5000,
      campaign:'Unassigned',
      session:'No active session',
      characteristics,
      skills:Object.fromEntries(d.skills.map(skill => [skill, 1])),
      talents,
      spells:[],
      magicTypes:d.magicTypes.slice(),
      inventory,
      conditions:[],
      professions:[],
      appearance:Object.assign({}, d.appearance),
      family_tree:Object.assign({}, d.family_tree),
      backstory:Object.assign({}, d.origin),
      character:characterSchema,
      professionSlots:['No Profession Learned','No Profession Learned','No Profession Learned']
    };
    const accountKey = currentUserKey();
    window.accountUsers = window.accountUsers || {};
    window.accountUsers[accountKey] = window.accountUsers[accountKey] || { characters:[] };
    window.accountUsers[accountKey].characters = Array.from(new Set([...(window.accountUsers[accountKey].characters || []), id]));
    window.session = window.session || {};
    window.session.character = id;
    window.selected = id;
    state.characters[id] = { id, createdAt:created, character:characterSchema, build:d };
    state.drafts.characterCreator = defaultState().drafts.characterCreator;
    saveState('phase3a-character-forged');
    window.AsteriaFirebase?.saveCharacter?.(id, window.chars[id]);
    window.toast?.(`Character saved: ${name}`);
    openSystem('characterSheet');
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

  function openSystem(id = 'characterCreator'){
    activeSystem = SYSTEMS.some(system => system.id === id) ? id : 'characterCreator';
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
    const host = document.querySelector('#gm .gm-main') || document.querySelector('#gm');
    if(!host || byId('phase3GMToolsPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'phase3GMToolsPanel';
    panel.className = 'card phase3-gm-hook-panel';
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
  }

  function publish(){
    originalOpenDashboard = originalOpenDashboard || window.AsteriaWorkspace?.openDashboard;
    originalWorkspaceEntries = originalWorkspaceEntries || window.AsteriaWorkspace?.entries;
    const api = {
      version:VERSION,
      forgeTabs:() => FORGE_TABS.slice(),
      systems:() => SYSTEMS.map(system => Object.assign({}, system)),
      state:() => JSON.parse(JSON.stringify(state)),
      save:saveState,
      entries:gameplayEntries,
      openSystem,
      openCharacterForge:() => openSystem('characterCreator'),
      openCharacterCreator:() => openSystem('characterCreator'),
      openCharacterSheet:() => openSystem('characterSheet'),
      openEncounterBuilder:() => openSystem('encounterBuilder'),
      openLootGenerator:() => openSystem('lootGenerator'),
      databaseEntries,
      appearanceOptionsForRace,
      recalcEncounter,
      generateLoot,
      saveCharacterFromDraft
    };
    function routedDashboard(mode, ...args){
      if(mode === 'createCharacter') return openSystem('characterCreator');
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
      openCharacterForge:api.openCharacterForge,
      openCharacterCreator:api.openCharacterCreator,
      openEncounterBuilder:api.openEncounterBuilder,
      openLootGenerator:api.openLootGenerator,
      openDashboard:routedDashboard,
      entries:entriesWithGameplay
    });
    window.toggleCharacterCreator = function(){ return openSystem('characterCreator'); };
  }

  function boot(){
    publish();
    installNav();
    window.AsteriaViewHooks?.afterGMRender?.('phase3-gm-toolkit', installGMPanel);
    if(byId('gm')?.classList.contains('show')) installGMPanel();
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
