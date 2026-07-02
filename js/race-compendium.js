/* Asteria Race Compendium v1
   Data-driven race workspace that replaces only the Races section renderer. */
(function(){
  'use strict';

  const DATA = window.ASTERIA_RACE_COMPENDIUM_DATA || { categories:[] };
  const RACE_INFO = window.ASTERIA_RACE_INFO_DATA || {};
  const TABS = ['Overview','Racial Sheet','Lore','Gallery'];
  const STAT_FIELDS = ['Population','Average Lifespan','Homeland','Common Professions','Magic Affinity','Languages','Lore Status'];
  const RACE_CHARACTERISTICS = ['strength','dexterity','agility','constitution','endurance','intelligence','wisdom','charisma','luck'];
  const RACE_STAT_LABELS = { strength:'STR', dexterity:'DEX', agility:'AGI', constitution:'CON', endurance:'END', intelligence:'INT', wisdom:'WIS', charisma:'CHA', luck:'LCK' };
  const RACE_STAT_NAMES = { strength:'Strength', dexterity:'Dexterity', agility:'Agility', constitution:'Constitution', endurance:'Endurance', intelligence:'Intelligence', wisdom:'Wisdom', charisma:'Charisma', luck:'Luck' };
  const RACE_TIER_RULES = [];
  const RACE_CHARACTERISTIC_ALIASES = {
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
  function displayName(value){
    return String(value || '').trim().toLowerCase().replace(/\b[a-z]/g, char => char.toUpperCase());
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
      Languages:'Information coming soon',
      'Lore Status':race.loreStatus || 'Common Knowledge',
      ...(race.stats || {})
    };
  }
  function raceInfoFor(name){
    const text = String(name || '').trim();
    return RACE_INFO[text] || RACE_INFO[displayName(text)] || (/ pixie$/i.test(text) ? RACE_INFO.Pixie : null) || {};
  }
  function firstMarkdownParagraph(value){
    const body = String(value || '')
      .replace(/!\[\[[^\]]+\]\]/g, '')
      .replace(/^---+$/gm, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*/g, '')
      .replace(/^>\s*/gm, '')
      .trim();
    return body.split(/\r?\n{2,}/).map(block => block.replace(/\r?\n/g, ' ').trim()).find(block => block.length > 50 && !/^Race Name:/i.test(block)) || '';
  }
  function rollSummary(statRolls){
    const rolls = statRolls || {};
    const pieces = RACE_CHARACTERISTICS.map(key => rolls[key] ? `${RACE_STAT_LABELS[key]} ${rolls[key]}` : '').filter(Boolean);
    return pieces.length ? pieces.join(', ') : 'Manual roll, then apply race +/- modifiers';
  }
  function prepare(){
    categories = [];
    races = [];
    function walk(nodes, path, parentId){
      return array(nodes).map(node => {
        if(isRaceNode(node)){
          const racePath = path.slice();
          const info = raceInfoFor(node.name);
          const item = {
            type:'race',
            id:slug(`${racePath.join(' ')} ${node.name}`),
            slug:slug(node.slug || node.name),
            name:node.name,
            path:racePath,
            pathId:pathId(racePath),
            primaryCategory:node.raceCategory || racePath[0] || 'Races',
            secondaryCategory:node.secondaryCategory || racePath[1] || '',
            tertiaryCategory:node.tertiaryCategory || racePath[2] || '',
            size:node.size || info.size || info.stats?.Size || inferSize(racePath[0] || ''),
            image:node.image || node.images?.female || node.images?.male || '',
            images:node.images || {},
            tags:[...new Set(array(info.tags).concat(array(node.tags)))],
            homeland:node.homeland || info.homeland || info.stats?.Homeland || '',
            region:node.region || '',
            biome:node.biome || '',
            essenceAffinity:node.essenceAffinity || info.essenceAffinity || '',
            magicAffinity:node.magicAffinity || info.magicAffinity || info.stats?.['Magic Affinity'] || '',
            affinityProfile:node.affinityProfile || {},
            loreStatus:node.loreStatus || 'Common Knowledge',
            playable:node.playable !== false,
            availability:node.availability || (node.playable === false ? 'non-playable' : 'playable'),
            visibility:node.visibility || 'public',
            summary:node.summary || info.summary || firstMarkdownParagraph(info.overviewMarkdown || info.loreMarkdown) || '',
            movement:node.movement || info.movement || info.stats?.Movement || '',
            senses:node.senses || info.senses || info.stats?.Senses || '',
            languages:node.languages || info.languages || info.stats?.Languages || '',
            characteristicRolls:node.characteristicRolls || node.characteristic_rolls || info.characteristicRolls || rollSummary(info.statRolls),
            rollModifiers:node.rollModifiers || node.roll_modifiers || node.characteristicModifiers || node.characteristic_modifiers || info.rollModifiers || {},
            statRolls:node.statRolls || node.stat_rolls || node.characteristicStatRolls || node.characteristic_stat_rolls || info.statRolls || {},
            tierCaps:node.tierCaps || node.tier_caps || node.characteristicTierCaps || node.characteristic_tier_caps || info.tierCaps || {},
            characteristicRows:array(node.characteristicRows || node.characteristic_rows || info.characteristicRows),
            racialFeaturesMarkdown:node.racialFeaturesMarkdown || node.racial_features_markdown || info.racialFeaturesMarkdown || '',
            racialCharacteristicsMarkdown:node.racialCharacteristicsMarkdown || node.racial_characteristics_markdown || info.racialCharacteristicsMarkdown || '',
            racialTraitsMarkdown:node.racialTraitsMarkdown || node.racial_traits_markdown || info.racialTraitsMarkdown || '',
            racialTraits:array(node.racialTraits || node.racial_traits || info.racialTraits),
            racialMovementMarkdown:node.racialMovementMarkdown || node.racial_movement_markdown || info.racialMovementMarkdown || '',
            racialBonusesMarkdown:node.racialBonusesMarkdown || node.racial_bonuses_markdown || info.racialBonusesMarkdown || '',
            racialDrawbacksMarkdown:node.racialDrawbacksMarkdown || node.racial_drawbacks_markdown || info.racialDrawbacksMarkdown || '',
            loreMarkdown:node.loreMarkdown || node.lore_markdown || info.loreMarkdown || '',
            overviewMarkdown:node.overviewMarkdown || node.overview_markdown || info.overviewMarkdown || '',
            cultureMarkdown:node.cultureMarkdown || node.culture_markdown || '',
            historicalFiguresMarkdown:node.historicalFiguresMarkdown || node.historical_figures_markdown || '',
            settlementsMarkdown:node.settlementsMarkdown || node.settlements_markdown || '',
            relationsMarkdown:node.relationsMarkdown || node.relations_markdown || '',
            galleryMarkdown:node.galleryMarkdown || node.gallery_markdown || '',
            gmNotesMarkdown:node.gmNotesMarkdown || node.gm_notes_markdown || '',
            mottosMarkdown:node.mottosMarkdown || node.mottos_markdown || info.mottosMarkdown || '',
            gmOnly:Boolean(node.gmOnly),
            stats:Object.assign({}, info.stats || {}, node.stats || {}),
            relations:array(node.relations),
            sourcePath:node.sourcePath || info.sourcePath || ''
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
    const fields = STAT_FIELDS;
    return `<section class="race-stats-panel"><h3>Race Statistics</h3><div>${fields.map(field => `<p><span>${escapeHtml(field)}</span><b>${escapeHtml(stats[field] || 'Information coming soon')}</b></p>`).join('')}</div></section>`;
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
  function raceCharacteristicKey(value){
    return RACE_CHARACTERISTIC_ALIASES[String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '')] || '';
  }
  function normalizeRaceRuleMap(source, fallback = 0){
    const out = Object.fromEntries(RACE_CHARACTERISTICS.map(key => [key, fallback]));
    if(!source || typeof source !== 'object') return out;
    Object.entries(source).forEach(([key, value]) => {
      const normalized = raceCharacteristicKey(key);
      if(normalized) out[normalized] = Number(value || 0);
    });
    return out;
  }
  function normalizeRaceTextMap(source){
    const out = Object.fromEntries(RACE_CHARACTERISTICS.map(key => [key, 'Manual']));
    if(!source || typeof source !== 'object') return out;
    Object.entries(source).forEach(([key, value]) => {
      const normalized = raceCharacteristicKey(key);
      if(normalized) out[normalized] = String(value || 'Manual');
    });
    return out;
  }
  function raceTierCapLabel(value){
    if(value && typeof value === 'object') return value.label || value.name || 'Tier V (100+)';
    const text = String(value || '').trim();
    if(!text) return 'Tier V (100+)';
    const lowerText = text.toLowerCase();
    if(lowerText.includes('tier v') || lowerText === 'v' || lowerText.includes('t5')) return 'Tier V (100+)';
    if(lowerText.includes('tier iv') || lowerText === 'iv' || lowerText.includes('t4')) return 'Tier IV (80-99)';
    if(lowerText.includes('tier iii') || lowerText === 'iii' || lowerText.includes('t3')) return 'Tier III (60-79)';
    if(lowerText.includes('tier ii') || lowerText === 'ii' || lowerText.includes('t2')) return 'Tier II (40-59)';
    if(lowerText.includes('tier i') || lowerText === 'i' || lowerText.includes('t1')) return 'Tier I (20-39)';
    if(lowerText.includes('tier 0') || lowerText.includes('t0')) return 'Tier 0 (0-19)';
    return text;
  }
  function normalizeRaceTierCaps(source){
    const out = Object.fromEntries(RACE_CHARACTERISTICS.map(key => [key, 'Tier V (100+)']));
    if(!source || typeof source !== 'object') return out;
    Object.entries(source).forEach(([key, value]) => {
      const normalized = raceCharacteristicKey(key);
      if(normalized) out[normalized] = raceTierCapLabel(value);
    });
    return out;
  }
  function signed(value){
    const numeric = Number(value || 0);
    return numeric > 0 ? `+${numeric}` : String(numeric);
  }
  function RaceCharacteristicRulesPanel(race){
    const modifiers = normalizeRaceRuleMap(race.rollModifiers || race.characteristicModifiers, 0);
    const statRolls = normalizeRaceTextMap(race.statRolls || race.characteristicStatRolls);
    const caps = normalizeRaceTierCaps(race.tierCaps || race.characteristicTierCaps);
    return `
      <section class="race-characteristic-rules-panel">
        <h3>Characteristic Rolls & Tier Caps</h3>
          ${RACE_TIER_RULES.map(rule => `<span><b>${escapeHtml(rule.label)}</b>${escapeHtml(rule.range)} • ${escapeHtml(rule.bonus)}</span>`).join('')}
        </div>
        <div class="race-characteristic-rules-grid">
          ${RACE_CHARACTERISTICS.map(key => `<article><h4>${escapeHtml(RACE_STAT_NAMES[key])}</h4><b>${escapeHtml(statRolls[key])}</b><em>${escapeHtml(signed(modifiers[key]))} result modifier</em><small>${escapeHtml(caps[key])}</small></article>`).join('')}
        </div>
      </section>
    `;
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
  function markdownHtml(markdown){
    const body = String(markdown || '').replace(/!\[\[[^\]]+\]\]/g, '').trim();
    if(!body) return '';
    if(typeof window.mdToHtml === 'function') return window.mdToHtml(body);
    return body.split(/\r?\n{2,}/).map(block => {
      const lines = block.split(/\r?\n/).filter(Boolean);
      const heading = block.match(/^(#{1,4})\s+(.+)$/);
      if(heading){
        const level = Math.min(6, heading[1].length + 2);
        return `<h${level}>${escapeHtml(heading[2])}</h${level}>`;
      }
      if(lines.every(line => /^[-*]\s+/.test(line.trim()))){
        return `<ul>${lines.map(line => `<li>${escapeHtml(line.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      if(block.trim().startsWith('|')){
        return `<pre>${escapeHtml(block)}</pre>`;
      }
      return `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }
  function plainMarkdown(markdown){
    return String(markdown || '')
      .replace(/!\[\[[^\]]+\]\]/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*/g, '')
      .replace(/^[-*]\s+/gm, '')
      .replace(/^---+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function markdownPanel(title, markdown, className = ''){
    const html = markdownHtml(markdown);
    if(!html) return '';
    return `<section class="race-info-section ${className}"><h3>${escapeHtml(title)}</h3><div class="race-markdown-body">${html}</div></section>`;
  }
  function overviewValue(race, labels){
    const stats = defaultStats(race);
    for(const label of array(labels)){
      if(stats[label]) return stats[label];
    }
    const source = String(race.overviewMarkdown || '');
    for(const label of array(labels)){
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = source.match(new RegExp(`\\*\\*${escaped}:\\*\\*\\s*([^\\n]+)`, 'i')) || source.match(new RegExp(`${escaped}:\\s*([^\\n]+)`, 'i'));
      if(match) return match[1].replace(/\s{2,}/g, ' ').trim();
    }
    return '';
  }
  function categoryBubbles(race){
    return [race.primaryCategory, race.secondaryCategory, race.tertiaryCategory]
      .filter(Boolean)
      .map(value => `<span>${escapeHtml(value)}</span>`)
      .join('');
  }
  function RaceOverviewArt(race){
    return `
      <section class="race-overview-art-panel">
        <div class="race-overview-art">${raceImage(race) ? `<img src="${escapeHtml(raceImage(race))}" alt="${escapeHtml(race.name)}">` : `<span>${escapeHtml(initials(race.name))}</span>`}</div>
        ${genderControls(race)}
      </section>
    `;
  }
  function RaceOverviewPanel(race){
    const quickRows = [
      ['Size', race.size || 'Information coming soon'],
      ['Movement', race.movement || overviewValue(race, ['Movement']) || 'Information coming soon'],
      ['Passive Perception', overviewValue(race, ['Passive Perception','Senses']) || race.senses || 'Information coming soon'],
      ['Racial Alignment', overviewValue(race, ['Racial Alignment','Alignment Tendencies']) || 'Information coming soon'],
      ['Magic Affinity', race.magicAffinity || overviewValue(race, ['Magic Affinity']) || 'Information coming soon']
    ];
    return `<section class="race-summary-panel"><h3>Overview</h3><p>${escapeHtml(race.summary || 'Information coming soon.')}</p><div class="race-quick-reference">${quickRows.map(([label, value]) => `<p><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></p>`).join('')}</div></section>`;
  }
  function raceFeatureHtml(markdown){
    const text = String(markdown || '').replace(/!\[\[[^\]]+\]\]/g, '').trim();
    if(!text) return '';
    const cards = [];
    let current = null;
    text.split(/\r?\n/).forEach(line => {
      const raw = line.replace(/\s+$/g, '');
      if(!raw || /^---+$/.test(raw.trim())) return;
      const heading = raw.match(/^-\s+(.+?):\s*$/);
      if(heading && !/^\s/.test(raw)){
        if(current) cards.push(current);
        current = { title:heading[1].trim(), items:[] };
        return;
      }
      const item = raw.match(/^\s*-\s+(.+)$/);
      if(item){
        if(!current) current = { title:'Features', items:[] };
        current.items.push(item[1].trim());
      }
    });
    if(current) cards.push(current);
    if(!cards.length) return markdownHtml(markdown);
    return `<div class="race-feature-list">${cards.map(card => `<article><h4>${escapeHtml(card.title)}</h4><ul>${card.items.length ? card.items.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>Information coming soon.</li>'}</ul></article>`).join('')}</div>`;
  }
  function RaceFeaturePanel(race){
    const html = raceFeatureHtml(race.racialFeaturesMarkdown);
    if(!html) return '';
    return `<section class="race-info-section span-2 race-feature-panel"><h3>Racial Features</h3>${html}</section>`;
  }
  function traitSetForRace(race){
    const realTraits = array(race?.racialTraits).map((trait, index) => ({
      name:trait.name || `Racial Trait ${index + 1}`,
      text:trait.text || trait.description || 'Information coming soon.',
      isPlaceholder:false
    }));
    const slots = realTraits.slice(0, 5);
    while(slots.length < 5){
      const number = slots.length + 1;
      slots.push({
        name:`Racial Trait ${number}`,
        text:'Information coming soon.',
        isPlaceholder:true
      });
    }
    return slots;
  }
  function RaceTraitCards(race){
    const traits = traitSetForRace(race);
    return `
      <section class="race-info-section span-2">
        <h3>Racial Traits</h3>
        <p class="smallnote">Each race has five racial trait slots. Double-click a card to open its trait page.</p>
        <div class="race-trait-card-grid">
          ${traits.map((trait, index) => `<article class="race-trait-card ${trait.isPlaceholder ? 'is-placeholder' : ''}" role="button" tabindex="0" data-race-trait-index="${index}"><h4>${escapeHtml(trait.name || 'Trait')}</h4><p>${escapeHtml(plainMarkdown(trait.text || trait.description || 'Information coming soon.').slice(0, 220))}</p><small>Double-click to open trait</small></article>`).join('')}
        </div>
      </section>
    `;
  }
  function openRaceTraitModal(index){
    if(!selectedRace) return;
    const trait = traitSetForRace(selectedRace)[index];
    if(!trait) return;
    if(typeof window.openAsteriaInfoModal === 'function'){
      window.openAsteriaInfoModal({
        eyebrow:`${selectedRace.name} Trait`,
        title:trait.name || 'Racial Trait',
        subtitle:'Race Compendium',
        body:markdownHtml(trait.text || trait.description || 'Information coming soon.'),
        image:raceImage(selectedRace),
        meta:`<span class="item-chip">${escapeHtml(selectedRace.primaryCategory || 'Race')}</span><span class="item-chip">${escapeHtml(selectedRace.size || 'Varies')}</span>`
      });
    }
  }
  function bindRaceTraitCards(root=document){
    qsa('[data-race-trait-index]', root).forEach(card => {
      const open = () => openRaceTraitModal(Number(card.dataset.raceTraitIndex || 0));
      card.addEventListener('dblclick', open);
      card.addEventListener('keydown', event => { if(event.key === 'Enter') open(); });
    });
  }
  function RaceSheetContent(race){
    const sections = [
      RaceCharacteristicRulesPanel(race),
      RaceFeaturePanel(race),
      RaceTraitCards(race),
      markdownPanel('Racial Movement', race.racialMovementMarkdown),
      markdownPanel('Bonuses / Drawbacks', race.racialBonusesMarkdown || race.racialDrawbacksMarkdown)
    ].filter(Boolean).join('');
    return sections || placeholderSections(['Gameplay Traits','Racial Abilities','Movement','Size','Languages','Resistances','Weaknesses','Starting Features']);
  }
  function tabContent(race){
    if(activeTab === 'Overview'){
      return `<div class="race-overview-layout">${RaceOverviewArt(race)}<div class="race-overview-stack">${RaceOverviewPanel(race)}${RaceTraitCards(race)}</div></div>`;
    }
    if(activeTab === 'Racial Sheet') return `<div class="race-overview-grid">${RaceSheetContent(race)}</div>`;
    if(activeTab === 'Lore') return `<div class="race-overview-grid">${RaceStatsPanel(race)}${markdownPanel('Lore', race.loreMarkdown || race.overviewMarkdown, 'span-2') || placeholderSections(['Origins','History','Mythology','Common Knowledge','Unlocked Lore','Hidden Lore'])}${markdownPanel('Culture', race.cultureMarkdown, 'span-2') || ''}${markdownPanel('Historical Figures', race.historicalFiguresMarkdown, 'span-2') || ''}${markdownPanel('Settlements', race.settlementsMarkdown, 'span-2') || ''}${markdownPanel('Mottos', race.mottosMarkdown)}${GMNotesBlock(race)}</div>`;
    if(activeTab === 'Gallery') return `<section class="race-gallery-panel"><h3>Gallery</h3><div class="race-gallery-slot">${raceImage(race) ? `<img src="${escapeHtml(raceImage(race))}" alt="${escapeHtml(race.name)}">` : `<span>${escapeHtml(initials(race.name))}</span>`}</div>${race.galleryMarkdown ? markdownHtml(race.galleryMarkdown) : '<p>Race artwork, symbols, cultural images, architecture, clothing, and variants can be added here.</p>'}</section>`;
    return '<p>Information coming soon.</p>';
  }
  function RaceTabs(race){
    return `<nav class="race-detail-tabs">${TABS.map(tab => `<button type="button" class="${tab === activeTab ? 'active' : ''}" data-race-tab="${escapeHtml(tab)}">${escapeHtml(tab)}</button>`).join('')}</nav>`;
  }
  function RaceDetailPage(race){
    return `
      <article class="race-detail-page">
        <header class="race-detail-head">
          <div>
            <h2>${escapeHtml(race.name)}</h2>
            <div class="race-category-bubbles">${categoryBubbles(race)}</div>
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
          <h1>Race Compendium</h1>
        </div>
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
    qsa('[data-race-tab]').forEach(button => {
      button.addEventListener('click', () => { activeTab = button.dataset.raceTab || TABS[0]; render(); });
    });
    bindRaceTraitCards();
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
