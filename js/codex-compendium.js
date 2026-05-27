/* Asteria Codex Compendium v1
   Shared Class and Creature compendium renderer. */
(function(){
  'use strict';

  const CLASS_DATA = window.ASTERIA_CLASS_COMPENDIUM_DATA || { categories:[] };
  const CREATURE_DATA = window.ASTERIA_CREATURE_COMPENDIUM_DATA || { categories:[] };
  const LORE_LEVELS = ['Common Knowledge','Discovered Lore','Rare Lore','Forbidden Lore','GM Only'];

  const CONFIGS = {
    Classes:{
      section:'Classes',
      singular:'Class',
      title:'Class Compendium',
      eyebrow:'Asteria Codex',
      intro:'Browse Asteria classes, progression paths, talent trees, equipment hooks, and lore.',
      data:CLASS_DATA,
      entryType:'class',
      shellClass:'codex-class-compendium',
      tabs:['Overview','Class Information','Mechanics','Progression','Talent Trees','Pathways','Equipment','Lore','Gallery','GM Notes']
    },
    Creatures:{
      section:'Creatures',
      singular:'Creature',
      title:'Creature Compendium',
      eyebrow:'Asteria Bestiary',
      intro:'Browse creatures for lore, stat sheets, loot, souls, variants, and encounter planning.',
      data:CREATURE_DATA,
      entryType:'creature',
      shellClass:'codex-creature-compendium',
      tabs:['Overview','Stat Sheet','Lore','Habitat','Behaviour','Combat','Loot & Drops','Soul Information','Variants','Encounter Use','Gallery','GM Notes']
    }
  };

  const state = {};
  let originalWorkspaceOpenSection = null;
  let originalCompendiumOpenSection = null;
  let originalGlobalOpenSection = null;
  let originalWorkspaceEntries = null;
  let originalOpenEntryBySlug = null;
  let categoryClickTimer = null;

  function byId(id){ return document.getElementById(id); }
  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }
  function lower(value){ return String(value || '').toLowerCase(); }
  function array(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
  function escapeHtml(value){
    return String(value || '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  }
  function slug(value){
    return String(value || '').trim().toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'entry';
  }
  function pathId(path){ return array(path).map(slug).join('/'); }
  function initials(name){
    return String(name || '').replace(/[^A-Za-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase() || 'A';
  }
  function isGMMode(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return document.body?.dataset?.role === 'gm' || session.role === 'gm' || byId('gm')?.classList.contains('show');
  }
  function isCategory(node){ return node && node.type === 'category'; }
  function unique(values){ return [...new Set(values.filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b))); }
  function optionList(values, selected, first){
    return `<option value="">${escapeHtml(first)}</option>` + unique(values).map(value => `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
  }

  function ensureState(section){
    if(state[section]) return state[section];
    state[section] = {
      section,
      categories:[],
      entries:[],
      activePath:[],
      drillPath:[],
      selectedEntry:null,
      activeTab:CONFIGS[section].tabs[0],
      selectedTalent:null
    };
    prepare(section);
    return state[section];
  }

  function prepare(section){
    const config = CONFIGS[section];
    const s = state[section];
    s.categories = [];
    s.entries = [];

    function walk(nodes, path, parentId){
      return array(nodes).map(node => {
        if(!isCategory(node)){
          const entryPath = path.slice();
          const id = slug(`${section} ${entryPath.join(' ')} ${node.name}`);
          const entry = normaliseEntry(config, node, entryPath, id);
          s.entries.push(entry);
          return entry;
        }
        const nextPath = path.concat(node.name);
        const category = { type:'category', id:pathId(nextPath), name:node.name, path:nextPath, parentId, children:[], entryCount:0 };
        s.categories.push(category);
        category.children = walk(node.children || [], nextPath, category.id);
        category.entryCount = s.entries.filter(entry => entry.pathId === category.id || entry.pathId.startsWith(category.id + '/')).length;
        return category;
      });
    }

    walk(config.data.categories || [], [], 'root');
  }

  function normaliseEntry(config, node, path, id){
    if(config.section === 'Classes'){
      return {
        id,
        slug:slug(node.slug || node.name),
        section:'Classes',
        entryType:'class',
        title:node.name,
        name:node.name,
        path,
        pathId:pathId(path),
        primaryCategory:path[0] || 'Classes',
        category:path[path.length - 1] || 'Classes',
        role:node.role || 'Information coming soon',
        primary_stat:node.primary_stat || 'Information coming soon',
        secondary_stat:node.secondary_stat || 'Information coming soon',
        combat_style:node.combat_style || 'Information coming soon',
        magic_type:node.magic_type || 'None',
        difficulty:node.difficulty || 'Information coming soon',
        class_colour:node.class_colour || '#1f7dff',
        symbol:node.symbol || initials(node.name),
        playable:node.playable !== false,
        tags:array(node.tags),
        loreStatus:node.loreStatus || 'Common Knowledge',
        gmOnly:Boolean(node.gmOnly),
        starting_equipment:array(node.starting_equipment),
        recommended_professions:array(node.recommended_professions),
        talents:array(node.talents)
      };
    }

    return {
      id,
      slug:slug(node.slug || node.name),
      section:'Creatures',
      entryType:'creature',
      type:'Creature',
      title:node.name,
      name:node.name,
      path,
      pathId:pathId(path),
      primaryCategory:path[0] || 'Creatures',
      category:path[path.length - 1] || 'Creatures',
      creature_type:node.creature_type || path[0] || 'Creature',
      threat_tier:node.threat_tier || 'TT 0',
      tier:node.threat_tier || 'TT 0',
      level_range:node.level_range || 'Information coming soon',
      size:node.size || 'Information coming soon',
      biome:node.biome || '',
      habitat:node.habitat || '',
      hostility:node.hostility || 'Information coming soon',
      magical:Boolean(node.magical),
      boss:Boolean(node.boss),
      soul_value:node.soul_value ?? 'Information coming soon',
      soul_tier:node.soul_tier || 'Information coming soon',
      encounter_role:node.encounter_role || 'Information coming soon',
      loot_tags:array(node.loot_tags),
      tags:array(node.tags),
      loreStatus:node.loreStatus || 'Common Knowledge',
      gmOnly:Boolean(node.gmOnly),
      hp:Number(node.hp || 10),
      max:Number(node.hp || 10),
      sp:Number(node.sp || 0),
      mp:Number(node.mp || 0),
      ac:Number(node.armour || node.ac || 10),
      armour:Number(node.armour || node.ac || 10),
      attacks:array(node.attacks),
      notes:node.notes || 'Information coming soon'
    };
  }

  function currentState(){ return ensureState(activeSection()); }
  function activeSection(){
    return byId('codex-compendium-shell')?.dataset.section || 'Classes';
  }
  function categoryByPath(section, path){
    const s = ensureState(section);
    const id = pathId(path || []);
    return s.categories.find(category => category.id === id) || null;
  }
  function nodeChildren(section, path){
    const s = ensureState(section);
    if(!array(path).length) return s.categories.filter(category => category.path.length === 1);
    const category = categoryByPath(section, path);
    return category ? category.children : [];
  }
  function categoryNames(section, depth){
    return ensureState(section).categories.filter(category => category.path.length === depth).map(category => category.name);
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
    document.body.classList.add('workspace-active','compendium-active');
    return view;
  }
  function shell(section){
    const view = workspaceView();
    let root = byId('codex-compendium-shell');
    if(root && root.dataset.section === section) return root;
    root = document.createElement('section');
    root.id = 'codex-compendium-shell';
    root.className = 'codex-compendium-shell';
    root.dataset.section = section;
    view.replaceChildren(root);
    return root;
  }

  function openSection(section, options = {}){
    if(!CONFIGS[section]) return false;
    const s = ensureState(section);
    s.activePath = options.path ? String(options.path).split('/').filter(Boolean) : [];
    s.drillPath = s.activePath.slice(0, Math.max(0, s.activePath.length - 1));
    s.selectedEntry = null;
    s.activeTab = CONFIGS[section].tabs[0];
    s.selectedTalent = null;
    render(section);
    syncNav(section);
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function syncNav(section){
    qsa('[data-workspace-section],[data-view]').forEach(link => {
      const match = link.dataset.workspaceSection === section ||
        (section === 'Classes' && link.dataset.view === 'classesHub') ||
        (section === 'Creatures' && link.dataset.view === 'creaturesHub');
      link.classList.toggle('active', Boolean(match));
    });
  }

  function breadcrumb(path, entry){
    const parts = [activeSection()].concat(array(path));
    if(entry) parts.push(entry.title);
    return parts.map((part, index) => `<button type="button" data-codex-breadcrumb="${index}">${escapeHtml(part)}</button>`).join('<span>/</span>');
  }

  function SearchAndFilters(section){
    const config = CONFIGS[section];
    const s = ensureState(section);
    if(section === 'Classes'){
      return `
        <section class="codex-search-filter-bar">
          <label>Search<input id="codexSearch" placeholder="Search classes, talents, roles, tags..."></label>
          <label>Category<select id="codexPrimaryFilter">${optionList(categoryNames(section, 1), '', 'All')}</select></label>
          <label>Role<select id="codexRoleFilter">${optionList(s.entries.map(entry => entry.role), '', 'All')}</select></label>
          <label>Combat Style<select id="codexCombatFilter">${optionList(s.entries.map(entry => entry.combat_style), '', 'All')}</select></label>
          <label>Magic Type<select id="codexMagicFilter">${optionList(s.entries.map(entry => entry.magic_type), '', 'All')}</select></label>
          <label>Difficulty<select id="codexDifficultyFilter">${optionList(s.entries.map(entry => entry.difficulty), '', 'All')}</select></label>
          <label>Lore Status<select id="codexLoreFilter">${optionList(LORE_LEVELS, '', 'All')}</select></label>
          <label class="codex-toggle-label"><input id="codexGMToggle" type="checkbox"> Show GM-only</label>
          <label>Sort<select id="codexSort"><option value="name">Sort: Name</option><option value="category">Sort: Category</option><option value="role">Sort: Role</option></select></label>
        </section>
      `;
    }
    return `
      <section class="codex-search-filter-bar codex-creature-filters">
        <label>Search<input id="codexSearch" placeholder="Search creatures, tags, biome, tier..."></label>
        <label>Creature Type<select id="codexTypeFilter">${optionList(s.entries.map(entry => entry.creature_type), '', 'All')}</select></label>
        <label>Threat Tier<select id="codexThreatFilter">${optionList(config.data.threatTiers || s.entries.map(entry => entry.threat_tier), '', 'All')}</select></label>
        <label>Level Range<input id="codexLevelFilter" placeholder="e.g. 2-5"></label>
        <label>Size<select id="codexSizeFilter">${optionList(s.entries.map(entry => entry.size), '', 'All')}</select></label>
        <label>Biome<input id="codexBiomeFilter" placeholder="Any biome"></label>
        <label>Habitat<input id="codexHabitatFilter" placeholder="Any habitat"></label>
        <label>Hostility<select id="codexHostilityFilter">${optionList(s.entries.map(entry => entry.hostility), '', 'All')}</select></label>
        <label>Magical<select id="codexMagicalFilter"><option value="">All</option><option value="true">Magical</option><option value="false">Non-magical</option></select></label>
        <label>Boss<select id="codexBossFilter"><option value="">All</option><option value="true">Boss</option><option value="false">Not Boss</option></select></label>
        <label>Loot Type<input id="codexLootFilter" placeholder="Hide, soul, fang..."></label>
        <label>Soul Tier<select id="codexSoulFilter">${optionList(s.entries.map(entry => entry.soul_tier), '', 'All')}</select></label>
        <label>Encounter Role<select id="codexEncounterFilter">${optionList(s.entries.map(entry => entry.encounter_role), '', 'All')}</select></label>
        <label>Lore Status<select id="codexLoreFilter">${optionList(LORE_LEVELS, '', 'All')}</select></label>
        <label class="codex-toggle-label"><input id="codexGMToggle" type="checkbox"> Show GM-only</label>
        <label>Sort<select id="codexSort"><option value="name">Sort: Name</option><option value="category">Sort: Category</option><option value="tier">Sort: Threat Tier</option><option value="role">Sort: Role</option></select></label>
      </section>
    `;
  }

  function CompendiumSidebar(section){
    const s = ensureState(section);
    const children = nodeChildren(section, s.drillPath);
    const categories = children.filter(isCategory);
    const entries = children.filter(child => !isCategory(child));
    return `
      <aside class="codex-sidebar">
        <div class="codex-sidebar-head">
          <h3>${escapeHtml(CONFIGS[section].singular)} Categories</h3>
          <button type="button" id="codexAllBtn">All</button>
        </div>
        <div class="codex-sidebar-breadcrumb">${breadcrumb(s.drillPath)}</div>
        <div class="codex-sidebar-actions">
          <button type="button" id="codexUpBtn" ${s.drillPath.length ? '' : 'disabled'}>Back</button>
          <span>Click filters. Double-click opens category.</span>
        </div>
        <div class="codex-tree-list">
          ${categories.map(category => categoryButton(section, category)).join('')}
          ${entries.map(entry => entryButton(entry)).join('')}
          ${!categories.length && !entries.length ? `<div class="codex-empty-small">Information coming soon.</div>` : ''}
        </div>
      </aside>
    `;
  }

  function categoryButton(section, category){
    const s = ensureState(section);
    const active = pathId(s.activePath) === category.id;
    return `
      <button type="button" class="codex-tree-category ${active ? 'active' : ''}" data-codex-category="${escapeHtml(category.path.join('|'))}">
        <span>${escapeHtml(category.name)}</span>
        <small>${category.entryCount}</small>
      </button>
    `;
  }
  function entryButton(entry){
    return `<button type="button" class="codex-tree-entry" data-codex-entry="${escapeHtml(entry.id)}">${escapeHtml(entry.title)}</button>`;
  }

  function filteredEntries(section){
    const s = ensureState(section);
    let list = s.entries.slice();
    if(s.activePath.length){
      const id = pathId(s.activePath);
      list = list.filter(entry => entry.pathId === id || entry.pathId.startsWith(id + '/'));
    }
    const query = lower(byId('codexSearch')?.value || '');
    const showGM = byId('codexGMToggle')?.checked || false;
    const lore = byId('codexLoreFilter')?.value || '';

    list = list.filter(entry => {
      if(entry.gmOnly && !(showGM && isGMMode())) return false;
      const searchText = lower(searchTerms(entry).join(' '));
      if(query && !searchText.includes(query)) return false;
      if(lore && entry.loreStatus !== lore) return false;

      if(section === 'Classes'){
        const category = byId('codexPrimaryFilter')?.value || '';
        const role = byId('codexRoleFilter')?.value || '';
        const combat = byId('codexCombatFilter')?.value || '';
        const magic = byId('codexMagicFilter')?.value || '';
        const difficulty = byId('codexDifficultyFilter')?.value || '';
        if(category && entry.primaryCategory !== category) return false;
        if(role && entry.role !== role) return false;
        if(combat && entry.combat_style !== combat) return false;
        if(magic && entry.magic_type !== magic) return false;
        if(difficulty && entry.difficulty !== difficulty) return false;
        return true;
      }

      const type = byId('codexTypeFilter')?.value || '';
      const tier = byId('codexThreatFilter')?.value || '';
      const level = lower(byId('codexLevelFilter')?.value || '');
      const size = byId('codexSizeFilter')?.value || '';
      const biome = lower(byId('codexBiomeFilter')?.value || '');
      const habitat = lower(byId('codexHabitatFilter')?.value || '');
      const hostility = byId('codexHostilityFilter')?.value || '';
      const magical = byId('codexMagicalFilter')?.value || '';
      const boss = byId('codexBossFilter')?.value || '';
      const loot = lower(byId('codexLootFilter')?.value || '');
      const soul = byId('codexSoulFilter')?.value || '';
      const encounter = byId('codexEncounterFilter')?.value || '';
      if(type && entry.creature_type !== type) return false;
      if(tier && entry.threat_tier !== tier) return false;
      if(level && !lower(entry.level_range).includes(level)) return false;
      if(size && entry.size !== size) return false;
      if(biome && !lower(entry.biome).includes(biome)) return false;
      if(habitat && !lower(entry.habitat).includes(habitat)) return false;
      if(hostility && entry.hostility !== hostility) return false;
      if(magical && String(entry.magical) !== magical) return false;
      if(boss && String(entry.boss) !== boss) return false;
      if(loot && !lower(entry.loot_tags.join(' ')).includes(loot)) return false;
      if(soul && entry.soul_tier !== soul) return false;
      if(encounter && entry.encounter_role !== encounter) return false;
      return true;
    });

    const sort = byId('codexSort')?.value || 'name';
    return list.sort((a,b) => {
      if(sort === 'category') return a.path.join('/').localeCompare(b.path.join('/')) || a.title.localeCompare(b.title);
      if(sort === 'role') return String(a.role || a.encounter_role).localeCompare(String(b.role || b.encounter_role)) || a.title.localeCompare(b.title);
      if(sort === 'tier') return tierNumber(a.threat_tier) - tierNumber(b.threat_tier) || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title);
    });
  }
  function searchTerms(entry){
    if(entry.section === 'Classes') return [entry.title, entry.path.join(' '), entry.role, entry.primary_stat, entry.secondary_stat, entry.combat_style, entry.magic_type, entry.difficulty, entry.tags.join(' '), entry.talents.map(t => t.name).join(' ')];
    return [entry.title, entry.path.join(' '), entry.creature_type, entry.threat_tier, entry.level_range, entry.size, entry.biome, entry.habitat, entry.hostility, entry.soul_tier, entry.encounter_role, entry.loot_tags.join(' '), entry.attacks.join(' '), entry.tags.join(' ')];
  }
  function tierNumber(value){
    const match = String(value || '').match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function CardGrid(section){
    const list = filteredEntries(section);
    const s = ensureState(section);
    const label = s.activePath.length ? s.activePath[s.activePath.length - 1] : `All ${section}`;
    return `
      <section class="codex-card-grid-panel">
        <div class="codex-display-status"><span>${escapeHtml(label)}</span><b>${list.length} ${CONFIGS[section].singular.toLowerCase()} entries</b></div>
        <div class="codex-card-grid">
          ${list.length ? list.map(entry => CompendiumCard(section, entry)).join('') : `<div class="codex-empty"><h3>Information coming soon</h3><p>No entries match this category or filter yet.</p></div>`}
        </div>
      </section>
    `;
  }

  function CompendiumCard(section, entry){
    if(section === 'Classes'){
      return `
        <article class="codex-card codex-class-card" data-codex-entry="${escapeHtml(entry.id)}" tabindex="0" style="--class-accent:${escapeHtml(entry.class_colour)}">
          <div class="codex-class-symbol">${escapeHtml(entry.symbol)}</div>
          <h3>${escapeHtml(entry.title)}</h3>
          <span></span>
        </article>
      `;
    }
    return `
      <article class="codex-card codex-creature-card" data-codex-entry="${escapeHtml(entry.id)}" tabindex="0">
        <div class="codex-card-art">${entry.image ? `<img src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.title)}">` : `<span>${escapeHtml(initials(entry.title))}</span>`}</div>
        <h3>${escapeHtml(entry.title)}</h3>
      </article>
    `;
  }

  function DetailPage(section, entry){
    const s = ensureState(section);
    return `
      <article class="codex-detail-page ${section === 'Classes' ? 'codex-class-detail' : 'codex-creature-detail'}">
        <button type="button" id="codexBackToCards" class="clean-back codex-return">Back to cards</button>
        <header class="codex-detail-head">
          ${section === 'Classes' ? `<div class="codex-detail-symbol" style="--class-accent:${escapeHtml(entry.class_colour)}">${escapeHtml(entry.symbol)}</div>` : `<div class="codex-detail-art">${entry.image ? `<img src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.title)}">` : `<span>${escapeHtml(initials(entry.title))}</span>`}</div>`}
          <div>
            <p class="eyebrow">${escapeHtml(CONFIGS[section].singular)} Entry</p>
            <h2>${escapeHtml(entry.title)}</h2>
            <div class="codex-detail-breadcrumb">${breadcrumb(entry.path, entry)}</div>
          </div>
        </header>
        ${CompendiumTabs(section)}
        <section class="codex-tab-window">${s.selectedTalent ? TalentDetail(entry, s.selectedTalent) : tabContent(section, entry)}</section>
      </article>
    `;
  }

  function CompendiumTabs(section){
    const s = ensureState(section);
    return `<nav class="codex-detail-tabs">${CONFIGS[section].tabs.map(tab => `<button type="button" class="${tab === s.activeTab ? 'active' : ''}" data-codex-tab="${escapeHtml(tab)}">${escapeHtml(tab)}</button>`).join('')}</nav>`;
  }

  function keyValueGrid(rows){
    return `<div class="codex-kv-grid">${rows.map(([key,value]) => `<p><span>${escapeHtml(key)}</span><b>${escapeHtml(value || 'Information coming soon')}</b></p>`).join('')}</div>`;
  }
  function listPanel(title, items){
    const list = array(items);
    return `<section class="codex-info-panel"><h3>${escapeHtml(title)}</h3>${list.length ? `<ul>${list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>Information coming soon.</p>'}</section>`;
  }
  function placeholderPanels(names){
    return `<div class="codex-placeholder-grid">${names.map(name => `<section class="codex-info-panel"><h3>${escapeHtml(name)}</h3><p>Information coming soon.</p></section>`).join('')}</div>`;
  }
  function LoreVisibilityBlock(){
    const gm = isGMMode();
    return `<section class="codex-lore-visibility"><h3>Lore Visibility</h3>${LORE_LEVELS.map(level => {
      const locked = level !== 'Common Knowledge' && !gm;
      return `<article class="${locked ? 'locked' : ''}"><span>${escapeHtml(level)}</span><p>${locked ? 'Locked lore. Visible in GM mode or when unlocked.' : 'Information coming soon.'}</p></article>`;
    }).join('')}</section>`;
  }
  function GMNotesBlock(){
    return isGMMode()
      ? `<section class="codex-gm-notes"><h3>GM Notes</h3><p>Hidden lore, campaign hooks, secret mechanics, and private GM notes can be stored here.</p></section>`
      : `<section class="codex-gm-notes locked"><h3>GM Notes</h3><p>Hidden from player view.</p></section>`;
  }

  function tabContent(section, entry){
    if(section === 'Classes') return classTabContent(entry);
    return creatureTabContent(entry);
  }
  function classTabContent(entry){
    const s = ensureState('Classes');
    if(s.activeTab === 'Overview') return `<div class="codex-overview-grid"><section class="codex-info-panel"><h3>Overview</h3><p>${escapeHtml(entry.role)}. Full class description coming soon.</p>${keyValueGrid([['Category',entry.primaryCategory],['Role',entry.role],['Difficulty',entry.difficulty],['Playable',entry.playable ? 'Yes' : 'No']])}</section>${LoreVisibilityBlock()}</div>`;
    if(s.activeTab === 'Class Information') return `<section class="codex-info-panel"><h3>Class Information</h3>${keyValueGrid([['Class Name',entry.title],['Class Category',entry.primaryCategory],['Primary Stat',entry.primary_stat],['Secondary Stat',entry.secondary_stat],['Role',entry.role],['Combat Style',entry.combat_style],['Magic Type',entry.magic_type],['Difficulty',entry.difficulty],['Recommended Professions',entry.recommended_professions.join(', ') || 'Information coming soon']])}</section>`;
    if(s.activeTab === 'Mechanics') return placeholderPanels(['Core Mechanics','Resource Use','Action Flow','Scaling Rules','Synergy Notes']);
    if(s.activeTab === 'Progression') return placeholderPanels(['Level 0','Early Progression','Mid Progression','Advanced Progression','Capstone']);
    if(s.activeTab === 'Talent Trees') return TalentTree(entry);
    if(s.activeTab === 'Pathways') return placeholderPanels(['Pathway Options','Specialisations','Advanced Branches']);
    if(s.activeTab === 'Equipment') return listPanel('Starting Equipment', entry.starting_equipment);
    if(s.activeTab === 'Lore') return `${placeholderPanels(['Origins','Training Traditions','Role in Asteria','Known Orders'])}${LoreVisibilityBlock()}`;
    if(s.activeTab === 'Gallery') return `<section class="codex-gallery-panel"><h3>Gallery</h3><div class="codex-gallery-slot"><span>${escapeHtml(entry.symbol)}</span></div><p>Class symbol, armour references, talent art, and pathway images can be added here.</p></section>`;
    if(s.activeTab === 'GM Notes') return GMNotesBlock();
    return '<p>Information coming soon.</p>';
  }
  function TalentTree(entry){
    const tiers = ['Tier 1','Tier 2','Tier 3','Tier 4','Tier 5'];
    return `<section class="codex-talent-tree"><h3>Talent Tree</h3><p>Talent cards are ready to connect into the existing Asteria Talent System.</p>${tiers.map(tier => {
      const talents = entry.talents.filter(talent => talent.tier === tier);
      return `<div class="codex-talent-tier"><h4>${escapeHtml(tier)}</h4><div>${talents.length ? talents.map(talent => `<button type="button" class="codex-talent-card" data-talent-name="${escapeHtml(talent.name)}"><b>${escapeHtml(talent.name)}</b><span>Ranks ${escapeHtml(talent.ranks)}</span></button>`).join('') : '<p>Information coming soon.</p>'}</div></div>`;
    }).join('')}</section>`;
  }
  function TalentDetail(entry, talent){
    return `<section class="codex-talent-detail"><button type="button" id="codexBackToTalents">Back to Talent Tree</button><p class="eyebrow">${escapeHtml(entry.title)} Talent</p><h3>${escapeHtml(talent.name)}</h3>${keyValueGrid([['Tier',talent.tier],['Ranks',talent.ranks],['Prerequisites',talent.prerequisite],['Cost',talent.cost],['Cooldown',talent.cooldown],['Scaling',talent.scaling],['Synergy Notes',talent.synergy],['GM Notes',isGMMode() ? talent.gmNotes : 'Hidden from player view']])}</section>`;
  }

  function creatureTabContent(entry){
    const s = ensureState('Creatures');
    if(s.activeTab === 'Overview') return `<div class="codex-overview-grid"><section class="codex-info-panel"><h3>Overview</h3><p>${escapeHtml(entry.notes || 'Information coming soon.')}</p>${keyValueGrid([['Creature Type',entry.creature_type],['Threat Tier',entry.threat_tier],['Level Range',entry.level_range],['Encounter Role',entry.encounter_role]])}</section>${LoreVisibilityBlock()}</div>`;
    if(s.activeTab === 'Stat Sheet') return `<section class="codex-info-panel"><h3>Creature Stat Sheet</h3>${keyValueGrid([['Name',entry.title],['Creature Type',entry.creature_type],['Threat Tier',entry.threat_tier],['Level Range',entry.level_range],['Size',entry.size],['Health',entry.hp],['Stamina',entry.sp],['Mana',entry.mp],['Armour',entry.armour],['Movement','Information coming soon'],['Senses','Information coming soon'],['Abilities','Information coming soon'],['Attacks',entry.attacks.join(', ') || 'Information coming soon']])}</section>`;
    if(s.activeTab === 'Lore') return `${placeholderPanels(['Origins','Mythology','Common Knowledge','Hidden Lore'])}${LoreVisibilityBlock()}${GMNotesBlock()}`;
    if(s.activeTab === 'Habitat') return `<section class="codex-info-panel"><h3>Habitat</h3>${keyValueGrid([['Biome',entry.biome],['Habitat',entry.habitat],['Environment Modifiers','Information coming soon']])}</section>`;
    if(s.activeTab === 'Behaviour') return placeholderPanels(['Hostility','Pack Behaviour','Hunting Pattern','Social Behaviour']);
    if(s.activeTab === 'Combat') return `${listPanel('Attacks', entry.attacks)}${placeholderPanels(['Resistances','Weaknesses','Abilities','Combat Tactics'])}`;
    if(s.activeTab === 'Loot & Drops') return `${listPanel('Loot Tags', entry.loot_tags)}${placeholderPanels(['Common Drops','Rare Drops','Harvest Materials','Alchemy Materials','Crafting Materials','Soul Stone Compatibility'])}`;
    if(s.activeTab === 'Soul Information') return `<section class="codex-info-panel"><h3>Soul Information</h3>${keyValueGrid([['Soul Point Value',entry.soul_value],['Soul Tier',entry.soul_tier],['Soul Capture Difficulty','Information coming soon'],['Soul Uses','Information coming soon'],['Enchanting Uses','Information coming soon'],['Crafting Uses','Information coming soon']])}</section>`;
    if(s.activeTab === 'Variants') return placeholderPanels(['Boss Variant','Minion Variant','Regional Variants','Elite Variants']);
    if(s.activeTab === 'Encounter Use') return `<section class="codex-info-panel"><h3>Encounter Use</h3>${keyValueGrid([['Encounter Role',entry.encounter_role],['Difficulty Rating',entry.threat_tier],['Party Recommendation','Information coming soon'],['Pack Behaviour','Information coming soon'],['Boss Variant',entry.boss ? 'Yes' : 'No'],['Environment Modifiers','Information coming soon']])}<button type="button" class="primary codex-add-encounter" data-creature-id="${escapeHtml(entry.id)}">Add to GM Encounter</button></section>`;
    if(s.activeTab === 'Gallery') return `<section class="codex-gallery-panel"><h3>Gallery</h3><div class="codex-gallery-slot"><span>${escapeHtml(initials(entry.title))}</span></div><p>Creature artwork, variants, habitat images, and anatomy references can be added here.</p></section>`;
    if(s.activeTab === 'GM Notes') return GMNotesBlock();
    return '<p>Information coming soon.</p>';
  }

  function CompendiumLayout(section){
    const config = CONFIGS[section];
    const s = ensureState(section);
    return `
      <section class="codex-compendium-header">
        <div>
          <p class="eyebrow">${escapeHtml(config.eyebrow)}</p>
          <h1>${escapeHtml(config.title)}</h1>
          <p>${escapeHtml(config.intro)}</p>
        </div>
        <div class="codex-breadcrumbs">${breadcrumb(s.activePath, s.selectedEntry)}</div>
      </section>
      ${SearchAndFilters(section)}
      <section class="codex-compendium-body">
        ${CompendiumSidebar(section)}
        <main class="codex-main-display">${s.selectedEntry ? DetailPage(section, s.selectedEntry) : CardGrid(section)}</main>
      </section>
    `;
  }

  function render(section){
    const root = shell(section);
    root.className = `codex-compendium-shell ${CONFIGS[section].shellClass}`;
    root.innerHTML = CompendiumLayout(section);
    bind(section);
  }
  function renderDisplayOnly(section){
    const display = document.querySelector('#codex-compendium-shell .codex-main-display');
    if(!display) return render(section);
    const s = ensureState(section);
    display.innerHTML = s.selectedEntry ? DetailPage(section, s.selectedEntry) : CardGrid(section);
    const crumb = document.querySelector('#codex-compendium-shell .codex-breadcrumbs');
    if(crumb) crumb.innerHTML = breadcrumb(s.activePath, s.selectedEntry);
    bind(section);
  }

  function bind(section){
    const s = ensureState(section);
    byId('codexAllBtn')?.addEventListener('click', () => {
      s.activePath = [];
      s.drillPath = [];
      s.selectedEntry = null;
      render(section);
    });
    byId('codexUpBtn')?.addEventListener('click', () => {
      s.drillPath = s.drillPath.slice(0, -1);
      s.activePath = s.drillPath.slice();
      s.selectedEntry = null;
      render(section);
    });
    qsa('[data-codex-category]').forEach(button => {
      button.addEventListener('click', () => {
        const path = String(button.dataset.codexCategory || '').split('|').filter(Boolean);
        clearTimeout(categoryClickTimer);
        categoryClickTimer = setTimeout(() => {
          s.activePath = path;
          s.selectedEntry = null;
          render(section);
        }, 190);
      });
      button.addEventListener('dblclick', () => {
        clearTimeout(categoryClickTimer);
        s.drillPath = String(button.dataset.codexCategory || '').split('|').filter(Boolean);
        s.activePath = s.drillPath.slice();
        s.selectedEntry = null;
        render(section);
      });
    });
    qsa('[data-codex-entry]').forEach(button => {
      button.addEventListener('click', () => {
        const entry = s.entries.find(item => item.id === button.dataset.codexEntry);
        if(entry) openEntry(section, entry);
      });
      button.addEventListener('keydown', event => {
        if(event.key === 'Enter'){
          const entry = s.entries.find(item => item.id === button.dataset.codexEntry);
          if(entry) openEntry(section, entry);
        }
      });
    });
    qsa('#codex-compendium-shell input,#codex-compendium-shell select').forEach(control => {
      control.addEventListener('input', () => { s.selectedEntry = null; renderDisplayOnly(section); });
      control.addEventListener('change', () => { s.selectedEntry = null; renderDisplayOnly(section); });
    });
    qsa('[data-codex-breadcrumb]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.codexBreadcrumb || 0);
        s.activePath = index <= 0 ? [] : s.activePath.slice(0, index);
        s.drillPath = s.activePath.slice();
        s.selectedEntry = null;
        render(section);
      });
    });
    byId('codexBackToCards')?.addEventListener('click', () => {
      s.selectedEntry = null;
      s.selectedTalent = null;
      render(section);
    });
    qsa('[data-codex-tab]').forEach(button => {
      button.addEventListener('click', () => {
        s.activeTab = button.dataset.codexTab || CONFIGS[section].tabs[0];
        s.selectedTalent = null;
        renderDisplayOnly(section);
      });
    });
    qsa('[data-talent-name]').forEach(button => {
      button.addEventListener('click', () => {
        const entry = s.selectedEntry;
        s.selectedTalent = entry?.talents?.find(talent => talent.name === button.dataset.talentName) || null;
        renderDisplayOnly(section);
      });
    });
    byId('codexBackToTalents')?.addEventListener('click', () => {
      s.selectedTalent = null;
      renderDisplayOnly(section);
    });
    qsa('.codex-add-encounter').forEach(button => {
      button.addEventListener('click', () => {
        const entry = s.entries.find(item => item.id === button.dataset.creatureId);
        if(entry && typeof window.gmAddCreatureToEncounter === 'function'){
          window.gmAddCreatureToEncounter(entry.id);
          window.toast?.(`${entry.title} sent to the GM encounter workspace.`);
        }else{
          window.toast?.('Encounter builder is available from the GM Dashboard.');
        }
      });
    });
  }

  function openEntry(section, entry){
    const s = ensureState(section);
    s.selectedEntry = entry;
    s.selectedTalent = null;
    s.activePath = entry.path.slice();
    s.drillPath = entry.path.slice(0, -1);
    s.activeTab = CONFIGS[section].tabs[0];
    render(section);
  }
  function openEntryBySlug(slugValue){
    const key = slug(slugValue);
    for(const section of Object.keys(CONFIGS)){
      const s = ensureState(section);
      const entry = s.entries.find(item => item.slug === key || slug(item.title) === key || item.id === key);
      if(entry){
        openSection(section, { path:entry.path.join('/') });
        openEntry(section, entry);
        return true;
      }
    }
    return false;
  }

  function allEntries(){
    return Object.keys(CONFIGS).flatMap(section => ensureState(section).entries);
  }
  function workspaceEntries(){
    const base = typeof originalWorkspaceEntries === 'function' ? originalWorkspaceEntries() : [];
    const codex = allEntries().map(entry => ({
      id:entry.id,
      slug:entry.slug,
      title:entry.title,
      name:entry.title,
      section:entry.section,
      type:entry.section === 'Creatures' ? 'Creature' : 'Class',
      categoryPath:entry.path,
      category:entry.category,
      sourcePath:'',
      searchTerms:lower(searchTerms(entry).join(' ')),
      metadata:entry,
      threatTier:entry.threat_tier,
      tier:entry.threat_tier,
      hp:entry.hp,
      max:entry.max,
      ac:entry.ac,
      initiative:entry.initiative || 10,
      notes:entry.notes,
      attacks:entry.attacks,
      creature_type:entry.creature_type,
      encounter_role:entry.encounter_role
    }));
    const seen = new Set();
    return base.concat(codex).filter(entry => {
      const key = `${entry.section}:${entry.id || entry.slug || entry.title}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function bindPublicButtons(){
    qsa('[data-workspace-section="Classes"],[data-workspace-section="Creatures"],[data-view="classesHub"],[data-view="creaturesHub"]').forEach(button => {
      if(button.dataset.codexCompendiumBound) return;
      button.dataset.codexCompendiumBound = '1';
      button.addEventListener('click', event => {
        const section = button.dataset.workspaceSection || (button.dataset.view === 'classesHub' ? 'Classes' : 'Creatures');
        event.preventDefault();
        event.stopImmediatePropagation();
        openSection(section);
      }, true);
    });
  }

  function publishApis(){
    originalWorkspaceOpenSection = originalWorkspaceOpenSection || window.AsteriaWorkspace?.openSection || window.openCompendiumSection || window.openSection;
    originalCompendiumOpenSection = originalCompendiumOpenSection || window.AsteriaCompendium?.openSection || originalWorkspaceOpenSection;
    originalGlobalOpenSection = originalGlobalOpenSection || window.openSection || originalWorkspaceOpenSection;
    originalWorkspaceEntries = originalWorkspaceEntries || window.AsteriaWorkspace?.entries;
    originalOpenEntryBySlug = originalOpenEntryBySlug || window.AsteriaWorkspace?.openEntryBySlug || window.openWorkspaceEntry;

    const routedOpenSection = function(name, options){
      if(CONFIGS[name]) return openSection(name, options || {});
      return originalWorkspaceOpenSection?.(name, options);
    };
    const routedOpenEntryBySlug = function(slugValue){
      return openEntryBySlug(slugValue) || originalOpenEntryBySlug?.(slugValue);
    };

    window.AsteriaCodexCompendium = {
      openSection,
      openEntryBySlug,
      entries:allEntries,
      classEntries:() => ensureState('Classes').entries.slice(),
      creatureEntries:() => ensureState('Creatures').entries.slice()
    };
    window.AsteriaWorkspace = Object.assign({}, window.AsteriaWorkspace || {}, {
      openSection:routedOpenSection,
      openClasses:() => openSection('Classes'),
      openCreatures:() => openSection('Creatures'),
      openEntryBySlug:routedOpenEntryBySlug,
      entries:workspaceEntries
    });
    window.AsteriaCompendium = Object.assign({}, window.AsteriaCompendium || {}, {
      openSection:routedOpenSection,
      openClasses:() => openSection('Classes'),
      openCreatures:() => openSection('Creatures'),
      openEntryBySlug:routedOpenEntryBySlug,
      entries:workspaceEntries
    });
    window.openSection = routedOpenSection;
    window.openWorkspaceEntry = routedOpenEntryBySlug;
  }

  function boot(){
    Object.keys(CONFIGS).forEach(ensureState);
    publishApis();
    bindPublicButtons();
    const observer = new MutationObserver(bindPublicButtons);
    observer.observe(document.body, { childList:true, subtree:true });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
