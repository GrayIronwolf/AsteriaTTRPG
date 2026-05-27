/* Asteria Race Compendium v1
   Data-driven race workspace that replaces only the Races section renderer. */
(function(){
  'use strict';

  const DATA = window.ASTERIA_RACE_COMPENDIUM_DATA || { categories:[] };
  const TABS = ['Overview','Racial Sheet','Lore','Culture','Historical Figures','Settlements','Relations','Traits & Biology','Gallery'];
  const STAT_FIELDS = ['Population','Average Lifespan','Height Range','Average Weight','Homeland','Dominant Climate','Essence Affinity','Common Professions','Magic Affinity','Technology Level','Threat Level','Languages','Related Factions','Related Locations'];

  let categories = [];
  let races = [];
  let activeCategoryPath = [];
  let drillPath = [];
  let selectedRace = null;
  let activeTab = TABS[0];
  let categoryClickTimer = null;
  let raceGender = {};
  let originalOpenSection = null;

  function byId(id){ return document.getElementById(id); }
  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }
  function lower(value){ return String(value || '').toLowerCase(); }
  function escapeHtml(value){
    return String(value || '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  }
  function slug(value){
    return String(value || '').trim().toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'entry';
  }
  function pathId(path){ return path.map(slug).join('/'); }
  function array(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
  function isRaceNode(node){ return node && node.type === 'race'; }
  function isCategoryNode(node){ return node && node.type !== 'race'; }
  function isGMMode(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return document.body?.dataset?.role === 'gm' || session.role === 'gm' || byId('gm')?.classList.contains('show');
  }
  function inferSize(primary){
    const value = lower(primary);
    if(value.includes('small')) return 'Small';
    if(value.includes('extra large')) return 'Extra Large';
    if(value.includes('large')) return 'Large';
    if(value.includes('medium')) return 'Medium';
    return 'Varies';
  }
  function defaultStats(race){
    const size = race.size || inferSize(race.primaryCategory);
    return {
      Population:'Information coming soon',
      'Average Lifespan':'Information coming soon',
      'Height Range':size === 'Varies' ? 'Information coming soon' : `${size} ancestry range`,
      'Average Weight':'Information coming soon',
      Homeland:race.homeland || 'Unmapped',
      'Dominant Climate':race.climate || 'Varies',
      'Essence Affinity':race.essenceAffinity || 'Information coming soon',
      'Common Professions':'Information coming soon',
      'Magic Affinity':race.magicAffinity || 'Information coming soon',
      'Technology Level':'Information coming soon',
      'Threat Level':race.threatLevel || 'Information coming soon',
      Languages:'Information coming soon',
      'Related Factions':'Information coming soon',
      'Related Locations':'Information coming soon',
      ...(race.stats || {})
    };
  }
  function prepare(){
    categories = [];
    races = [];
    function walk(nodes, path, parentId){
      return array(nodes).map(node => {
        if(isRaceNode(node)){
          const racePath = path.slice();
          const item = {
            type:'race',
            id:slug(`${racePath.join(' ')} ${node.name}`),
            slug:slug(node.slug || node.name),
            name:node.name,
            path:racePath,
            pathId:pathId(racePath),
            primaryCategory:racePath[0] || 'Races',
            secondaryCategory:racePath[1] || '',
            tertiaryCategory:racePath[2] || '',
            size:node.size || inferSize(racePath[0] || ''),
            image:node.image || '',
            images:node.images || {},
            tags:array(node.tags),
            homeland:node.homeland || '',
            region:node.region || '',
            biome:node.biome || '',
            essenceAffinity:node.essenceAffinity || '',
            magicAffinity:node.magicAffinity || '',
            loreStatus:node.loreStatus || 'Common Knowledge',
            gmOnly:Boolean(node.gmOnly),
            stats:node.stats || {},
            relations:array(node.relations),
            sourcePath:node.sourcePath || ''
          };
          races.push(item);
          return item;
        }
        const nextPath = path.concat(node.name);
        const item = {
          id:pathId(nextPath),
          name:node.name,
          path:nextPath,
          parentId,
          children:[],
          raceCount:0
        };
        categories.push(item);
        item.children = walk(node.children || [], nextPath, item.id);
        item.raceCount = races.filter(race => race.pathId === item.id || race.pathId.startsWith(item.id + '/')).length;
        return item;
      });
    }
    walk(DATA.categories || [], [], 'root');
  }
  function categoryByPath(path){
    const id = pathId(path || []);
    return categories.find(category => category.id === id) || null;
  }
  function childrenForCategory(path){
    const id = pathId(path || []);
    const node = categoryByPath(path);
    return node ? node.children : (DATA.categories || []);
  }
  function categoryOptions(depth){
    return categories.filter(category => category.path.length === depth).map(category => category.name);
  }
  function unique(values){
    return [...new Set(values.filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b)));
  }
  function optionList(values, selected, label){
    return `<option value="">${escapeHtml(label)}</option>` + unique(values).map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
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
  function shell(){
    const view = workspaceView();
    let root = byId('race-compendium-shell');
    if(root) return root;
    root = document.createElement('section');
    root.id = 'race-compendium-shell';
    root.className = 'race-compendium-shell';
    view.replaceChildren(root);
    return root;
  }
  function open(options = {}){
    if(!races.length) prepare();
    const optionPath = options.path ? String(options.path).split('/').filter(Boolean) : [];
    activeCategoryPath = optionPath;
    drillPath = optionPath.slice(0, Math.max(0, optionPath.length - 1));
    selectedRace = null;
    activeTab = TABS[0];
    render();
    syncNav();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
  }
  function syncNav(){
    qsa('[data-workspace-section],[data-view]').forEach(link => {
      const match = link.dataset.workspaceSection === 'Races' || link.dataset.view === 'racesHub';
      link.classList.toggle('active', match);
    });
  }
  function currentCategoryLabel(){
    return activeCategoryPath.length ? activeCategoryPath[activeCategoryPath.length - 1] : 'All Race Categories';
  }
  function breadcrumbHtml(extraRace){
    const parts = ['Races'].concat(activeCategoryPath);
    if(extraRace) parts.push(extraRace.name);
    return parts.map((part, index) => `<button type="button" data-breadcrumb-index="${index}">${escapeHtml(part)}</button>`).join('<span>/</span>');
  }
  function sidebarBreadcrumbHtml(){
    const parts = ['Races'].concat(drillPath);
    return parts.map((part, index) => `<button type="button" data-race-drill-index="${index}">${escapeHtml(part)}</button>`).join('<span>/</span>');
  }
  function SearchAndFilters(){
    return `
      <section class="race-search-filter-bar">
        <label>Search<input id="raceSearch" placeholder="Search race name, category, tag, homeland, affinity..."></label>
        <label>Region<input id="raceRegionFilter" placeholder="Any region"></label>
        <label>Size<select id="raceSizeFilter">${optionList(['Small','Medium','Large','Extra Large','Varies'], '', 'All')}</select></label>
        <label>Magic Affinity<input id="raceMagicFilter" placeholder="Any magic"></label>
        <label class="race-toggle-label"><input id="raceGMToggle" type="checkbox"> Show GM-only</label>
        <label>Sort<select id="raceSort"><option value="name">Sort: Name</option><option value="category">Sort: Category</option><option value="size">Sort: Size</option></select></label>
      </section>
    `;
  }
  function RaceCategoryTree(){
    const children = childrenForCategory(drillPath);
    const catChildren = children.filter(isCategoryNode);
    const raceChildren = children.filter(isRaceNode);
    return `
      <aside class="race-category-tree">
        <div class="race-tree-head">
          <h3>Race Categories</h3>
          <button type="button" id="raceTreeClear">All</button>
        </div>
        <div class="race-sidebar-breadcrumb">${sidebarBreadcrumbHtml()}</div>
        <div class="race-sidebar-actions">
          <button type="button" id="raceTreeBack" ${drillPath.length ? '' : 'disabled'}>Back</button>
          <span>Click filters. Double-click opens category.</span>
        </div>
        <div class="race-tree-scroll">
          ${catChildren.map(node => categoryTreeNode(node, drillPath)).join('')}
          ${raceChildren.map(child => `<button type="button" class="race-tree-entry" data-race-slug="${escapeHtml(slug(child.name))}">${escapeHtml(child.name)}</button>`).join('')}
          ${!catChildren.length && !raceChildren.length ? '<div class="race-empty-small">Information coming soon.</div>' : ''}
        </div>
      </aside>
    `;
  }
  function categoryTreeNode(node, parentPath){
    const path = parentPath.concat(node.name);
    const id = pathId(path);
    const active = pathId(activeCategoryPath) === id;
    const prepared = categoryByPath(path);
    return `
      <button type="button" class="race-tree-category ${active ? 'active' : ''}" data-category-path="${escapeHtml(path.join('|'))}">
        <span>${escapeHtml(node.name)}</span>
        <small>${prepared?.raceCount || 0}</small>
      </button>
    `;
  }
  function activeRaces(){
    let list = races.slice();
    if(activeCategoryPath.length){
      const id = pathId(activeCategoryPath);
      list = list.filter(race => race.pathId === id || race.pathId.startsWith(id + '/'));
    }
    const query = lower(byId('raceSearch')?.value || '');
    const region = lower(byId('raceRegionFilter')?.value || '');
    const size = byId('raceSizeFilter')?.value || '';
    const magic = lower(byId('raceMagicFilter')?.value || '');
    const showGM = byId('raceGMToggle')?.checked || false;
    list = list.filter(race => {
      const text = lower([race.name, race.path.join(' '), race.tags.join(' '), race.homeland, race.region, race.biome, race.essenceAffinity, race.magicAffinity, race.loreStatus].join(' '));
      if(query && !text.includes(query)) return false;
      if(region && !lower([race.region, race.homeland].join(' ')).includes(region)) return false;
      if(size && race.size !== size) return false;
      if(magic && !lower(race.magicAffinity).includes(magic)) return false;
      if(race.gmOnly && !(showGM && isGMMode())) return false;
      return true;
    });
    const sort = byId('raceSort')?.value || 'name';
    return list.sort((a,b) => {
      if(sort === 'category') return a.path.join('/').localeCompare(b.path.join('/')) || a.name.localeCompare(b.name);
      if(sort === 'size') return a.size.localeCompare(b.size) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }
  function RaceCard(race){
    const image = raceImage(race);
    const controls = genderControls(race);
    return `
      <article class="race-card" data-race-id="${escapeHtml(race.id)}" tabindex="0">
        <div class="race-card-art">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(race.name)}">` : `<span>${escapeHtml(initials(race.name))}</span>`}</div>
        ${controls}
        <h3>${escapeHtml(race.name)}</h3>
      </article>
    `;
  }
  function raceGenderValue(race){
    if(raceGender[race.id]) return raceGender[race.id];
    if(race.images?.female) return 'female';
    if(race.images?.male) return 'male';
    return '';
  }
  function raceImage(race){
    const gender = raceGenderValue(race);
    return race.images?.[gender] || race.image || '';
  }
  function genderControls(race){
    const hasFemale = Boolean(race.images?.female);
    const hasMale = Boolean(race.images?.male);
    if(!hasFemale && !hasMale) return '';
    const active = raceGenderValue(race);
    return `
      <div class="race-gender-switch" aria-label="${escapeHtml(race.name)} image variants">
        ${hasFemale ? `<button type="button" class="${active === 'female' ? 'active' : ''}" data-race-gender="${escapeHtml(race.id)}|female" title="Female artwork">♀</button>` : ''}
        ${hasMale ? `<button type="button" class="${active === 'male' ? 'active' : ''}" data-race-gender="${escapeHtml(race.id)}|male" title="Male artwork">♂</button>` : ''}
      </div>
    `;
  }
  function initials(name){
    return String(name || '').replace(/[^A-Za-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase() || 'R';
  }
  function RaceCardGrid(){
    const list = activeRaces();
    return `
      <section class="race-card-grid-panel">
        <div class="race-display-status"><span>${escapeHtml(currentCategoryLabel())}</span><b>${list.length} race entries</b></div>
        <div id="raceCardGrid" class="race-card-grid">
          ${list.length ? list.map(RaceCard).join('') : `<div class="race-empty"><h3>Information coming soon</h3><p>No race entries exist in this category yet. The category is preserved from the source folder structure.</p></div>`}
        </div>
      </section>
    `;
  }
  function RaceStatsPanel(race){
    const stats = defaultStats(race);
    return `<section class="race-stats-panel"><h3>Race Statistics</h3><div>${STAT_FIELDS.map(field => `<p><span>${escapeHtml(field)}</span><b>${escapeHtml(stats[field] || 'Information coming soon')}</b></p>`).join('')}</div></section>`;
  }
  function LoreUnlockBlock(race){
    const gm = isGMMode();
    const levels = DATA.loreLevels || TABS;
    return `<section class="race-lore-unlocks"><h3>Lore Visibility</h3>${levels.map(level => {
      const locked = level !== 'Common Knowledge' && !gm;
      const gmOnly = level === 'GM Only';
      return `<article class="${locked ? 'locked' : ''} ${gmOnly ? 'gm-only-lore' : ''}"><span>${escapeHtml(level)}</span><p>${locked ? 'Locked lore. Visible in GM mode or when discovered.' : 'Information coming soon.'}</p></article>`;
    }).join('')}</section>`;
  }
  function GMNotesBlock(race){
    if(isGMMode()) return `<section class="gm-notes-block"><h3>GM-only Notes</h3><p>Secret origins, hidden weaknesses, true history, campaign hooks, hidden factions, and forbidden lore can be added here.</p></section>`;
    return `<section class="gm-notes-block locked"><h3>GM-only Notes</h3><p>Hidden from player view.</p></section>`;
  }
  function RelationshipMatrix(race){
    const rows = race.relations.length ? race.relations : [{ name:'Information coming soon', status:'Neutral', notes:'Relationship matrix not filled yet.', reason:'Pending lore entry.' }];
    return `<section class="relationship-matrix"><h3>Relationship Matrix</h3><table><thead><tr><th>Race/Faction</th><th>Status</th><th>Notes</th><th>Historical Reason</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHtml(row.name || row.target)}</td><td>${escapeHtml(row.status || 'Neutral')}</td><td>${escapeHtml(row.notes || 'Information coming soon')}</td><td>${escapeHtml(row.reason || 'Information coming soon')}</td></tr>`).join('')}</tbody></table></section>`;
  }
  function placeholderSections(names){
    return `<div class="race-placeholder-sections">${names.map(name => `<article><h3>${escapeHtml(name)}</h3><p>Information coming soon.</p></article>`).join('')}</div>`;
  }
  function tabContent(race){
    if(activeTab === 'Overview'){
      return `<div class="race-overview-grid"><section class="race-summary-panel"><h3>Overview</h3><p>${escapeHtml(race.summary || 'Information coming soon.')}</p><div class="race-quick-reference"><p><span>Primary Category</span><b>${escapeHtml(race.primaryCategory)}</b></p><p><span>Secondary Category</span><b>${escapeHtml(race.secondaryCategory || 'None')}</b></p><p><span>Size</span><b>${escapeHtml(race.size)}</b></p><p><span>Lore Status</span><b>${escapeHtml(race.loreStatus)}</b></p></div></section>${RaceStatsPanel(race)}${LoreUnlockBlock(race)}</div>`;
    }
    if(activeTab === 'Racial Sheet') return placeholderSections(['Gameplay Traits','Racial Abilities','Movement','Size','Languages','Resistances','Weaknesses','Starting Features']);
    if(activeTab === 'Lore') return `${placeholderSections(['Origins','History','Mythology','Common Knowledge','Unlocked Lore','Hidden Lore'])}${LoreUnlockBlock(race)}${GMNotesBlock(race)}`;
    if(activeTab === 'Culture') return placeholderSections(['Traditions','Society','Religion','Clothing','Food','Architecture','Combat Styles','Rituals']);
    if(activeTab === 'Historical Figures') return placeholderSections(['Heroes','Villains','Rulers','Prophets','Legendary Members']);
    if(activeTab === 'Settlements') return placeholderSections(['Homelands','Cities','Villages','Ruins','Territories']);
    if(activeTab === 'Relations') return RelationshipMatrix(race);
    if(activeTab === 'Traits & Biology') return placeholderSections(['Physical Traits','Lifespan','Height Range','Reproduction','Bloodlines','Mutations','Magical Traits','Biological Quirks']);
    if(activeTab === 'Gallery') return `<section class="race-gallery-panel"><h3>Gallery</h3><div class="race-gallery-slot">${raceImage(race) ? `<img src="${escapeHtml(raceImage(race))}" alt="${escapeHtml(race.name)}">` : `<span>${escapeHtml(initials(race.name))}</span>`}</div><p>Race artwork, symbols, cultural images, architecture, clothing, and variants can be added here.</p></section>`;
    return '<p>Information coming soon.</p>';
  }
  function RaceTabs(race){
    return `<nav class="race-detail-tabs">${TABS.map(tab => `<button type="button" class="${tab === activeTab ? 'active' : ''}" data-race-tab="${escapeHtml(tab)}">${escapeHtml(tab)}</button>`).join('')}</nav>`;
  }
  function RaceDetailPage(race){
    return `
      <article class="race-detail-page">
        <button type="button" id="raceBackToGrid" class="clean-back race-return">Back to race cards</button>
        <header class="race-detail-head">
          <div class="race-detail-art">${raceImage(race) ? `<img src="${escapeHtml(raceImage(race))}" alt="${escapeHtml(race.name)}">` : `<span>${escapeHtml(initials(race.name))}</span>`}</div>
          <div>
            <p class="eyebrow">Race Entry</p>
            <h2>${escapeHtml(race.name)}</h2>
            ${genderControls(race)}
            <div class="race-detail-breadcrumb">${breadcrumbHtml(race)}</div>
          </div>
        </header>
        ${RaceTabs(race)}
        <section class="race-tab-window">${tabContent(race)}</section>
      </article>
    `;
  }
  function RaceCompendiumPage(){
    const main = selectedRace ? RaceDetailPage(selectedRace) : RaceCardGrid();
    return `
      <section class="race-compendium-header">
        <div>
          <p class="eyebrow">Asteria Compendium</p>
          <h1>Race Compendium</h1>
          <p>Categories organise navigation only. Every race is an independent entry with its own card and page.</p>
        </div>
        <div class="race-breadcrumbs">${breadcrumbHtml(selectedRace)}</div>
      </section>
      ${SearchAndFilters()}
      <section class="race-compendium-body">
        ${RaceCategoryTree()}
        <main class="race-main-display">${main}</main>
      </section>
    `;
  }
  function render(){
    const root = shell();
    root.innerHTML = RaceCompendiumPage();
    bind();
  }
  function setActivePath(path){
    activeCategoryPath = path;
    drillPath = path.slice(0, Math.max(0, path.length - 1));
    selectedRace = null;
    render();
  }
  function bind(){
    byId('raceTreeClear')?.addEventListener('click', () => setActivePath([]));
    byId('raceTreeBack')?.addEventListener('click', () => {
      drillPath = drillPath.slice(0, -1);
      activeCategoryPath = drillPath.slice();
      selectedRace = null;
      render();
    });
    qsa('[data-category-path]').forEach(button => {
      button.addEventListener('click', () => {
        const path = String(button.dataset.categoryPath || '').split('|').filter(Boolean);
        clearTimeout(categoryClickTimer);
        categoryClickTimer = setTimeout(() => {
          activeCategoryPath = path;
          selectedRace = null;
          render();
        }, 190);
      });
      button.addEventListener('dblclick', () => {
        const path = String(button.dataset.categoryPath || '').split('|').filter(Boolean);
        clearTimeout(categoryClickTimer);
        drillPath = path;
        activeCategoryPath = path;
        selectedRace = null;
        render();
      });
    });
    qsa('[data-race-slug]').forEach(button => {
      button.addEventListener('click', () => {
        const item = races.find(race => race.slug === button.dataset.raceSlug || slug(race.name) === button.dataset.raceSlug);
        if(item) openRace(item);
      });
    });
    qsa('.race-card').forEach(card => {
      const item = races.find(race => race.id === card.dataset.raceId);
      card.addEventListener('click', () => item && openRace(item));
      card.addEventListener('keydown', event => { if(event.key === 'Enter' && item) openRace(item); });
    });
    qsa('[data-race-gender]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const [id, gender] = String(button.dataset.raceGender || '').split('|');
        if(!id || !gender) return;
        raceGender[id] = gender;
        if(selectedRace) render();
        else renderCardsOnly();
      });
    });
    qsa('#race-compendium-shell input,#race-compendium-shell select').forEach(control => {
      control.addEventListener('input', () => { selectedRace = null; renderCardsOnly(); });
      control.addEventListener('change', () => { selectedRace = null; renderCardsOnly(); });
    });
    qsa('[data-breadcrumb-index]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.breadcrumbIndex || 0);
        if(index <= 0) setActivePath([]);
        else setActivePath(activeCategoryPath.slice(0, index));
      });
    });
    qsa('[data-race-drill-index]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.raceDrillIndex || 0);
        drillPath = index <= 0 ? [] : drillPath.slice(0, index);
        activeCategoryPath = drillPath.slice();
        selectedRace = null;
        render();
      });
    });
    byId('raceBackToGrid')?.addEventListener('click', () => { selectedRace = null; activeTab = TABS[0]; render(); });
    qsa('[data-race-tab]').forEach(button => {
      button.addEventListener('click', () => { activeTab = button.dataset.raceTab || TABS[0]; render(); });
    });
  }
  function renderCardsOnly(){
    const display = document.querySelector('.race-main-display');
    if(!display) return render();
    display.innerHTML = RaceCardGrid();
    qsa('.race-card', display).forEach(card => {
      const item = races.find(race => race.id === card.dataset.raceId);
      card.addEventListener('click', () => item && openRace(item));
      card.addEventListener('keydown', event => { if(event.key === 'Enter' && item) openRace(item); });
    });
    qsa('[data-race-gender]', display).forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const [id, gender] = String(button.dataset.raceGender || '').split('|');
        if(!id || !gender) return;
        raceGender[id] = gender;
        renderCardsOnly();
      });
    });
    const crumb = document.querySelector('.race-breadcrumbs');
    if(crumb) crumb.innerHTML = breadcrumbHtml();
  }
  function openRace(race){
    selectedRace = race;
    activeCategoryPath = race.path.slice();
    drillPath = race.path.slice(0, -1);
    activeTab = TABS[0];
    render();
  }
  function bindPublicButtons(){
    qsa('[data-workspace-section="Races"],[data-view="racesHub"]').forEach(button => {
      if(button.dataset.raceCompendiumBound) return;
      button.dataset.raceCompendiumBound = '1';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        open();
      }, true);
    });
  }
  function wrapWorkspaceApis(){
    originalOpenSection = originalOpenSection || window.AsteriaWorkspace?.openSection || window.openCompendiumSection || window.openSection;
    const routedOpenSection = function(name, options){
      if(name === 'Races') return open(options || {});
      return originalOpenSection?.(name, options);
    };
    window.openRaceCompendium = open;
    window.AsteriaRaceCompendium = {
      open,
      entries:() => races.slice(),
      categories:() => categories.slice(),
      data:DATA
    };
    window.AsteriaWorkspace = Object.assign({}, window.AsteriaWorkspace || {}, { openSection:routedOpenSection, openRaces:open });
    window.AsteriaCompendium = Object.assign({}, window.AsteriaCompendium || {}, { openRaces:open });
  }
  function boot(){
    prepare();
    wrapWorkspaceApis();
    bindPublicButtons();
    const observer = new MutationObserver(bindPublicButtons);
    observer.observe(document.body, { childList:true, subtree:true });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
