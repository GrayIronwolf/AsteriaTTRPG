/* Shared compendium search, navigation and viewer, backed by AsteriaContent. */
(function(){
  'use strict';

  const INDEX = window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX || { entries:[], domains:{}, databases:{}, tabTemplates:{}, filterFields:{} };

  let activeDomain = 'item';
  let activePath = [];
  let drillPath = [];
  let selectedEntry = null;
  let activeTab = 'Overview';
  let activeQuery = '';
  let activeFilterField = '';
  let activeFilterValue = '';
  let activeSort = 'name';
  let activeIncludeGM = false;
  let categoryClickTimer = null;
  let activeLimit = 60;
  let readingRoute = false;
  let routeMessage = '';
  let routeChoices = null;

  function byId(id){ return document.getElementById(id); }
  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }
  function lower(value){ return String(value || '').toLowerCase(); }
  function array(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
  }
  function slug(value){
    return String(value || '').trim().toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'entry';
  }
  function titleCase(value){
    return String(value || '').replace(/[-_]+/g,' ').replace(/\b\w/g, char => char.toUpperCase()).trim();
  }
  function pathId(path){ return array(path).map(slug).join('/'); }
  function initials(name){
    return String(name || '').replace(/[^A-Za-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase() || 'A';
  }
  function isGMMode(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return document.body?.dataset?.role === 'gm' || session.role === 'gm' || byId('gm')?.classList.contains('show');
  }

  const domainMap = {
    race:'race', races:'race',
    class:'class', classes:'class',
    creature:'creature', creatures:'creature',
    item:'item', items:'item', flora:'item', minerals:'item', materials:'item',
    spell:'spell', spells:'spell', magic:'spell',
    talent:'talent', talents:'talent',
    profession:'profession', professions:'profession',
    skill:'skill', skills:'skill', origin:'origin', origins:'origin', backgrounds:'origin',
    location:'location', locations:'location', world:'location', worlds:'location', realms:'location', planes:'location',
    religion:'religion', religions:'religion', theology:'religion', theologies:'religion', god:'religion', gods:'religion', deity:'religion', deities:'religion', pantheon:'religion', court:'religion', courts:'religion',
    faction:'faction', factions:'faction', guild:'faction', guilds:'faction', organization:'faction', organizations:'faction',
    lore:'lore', history:'lore', histories:'lore', timeline:'lore', timelines:'lore', legend:'lore',
    handbook:'handbook', rules:'handbook'
  };

  const domainLabels = INDEX.domains;
  const databaseRegistry = INDEX.databases;

  const filterLabels = {
    rarity:'Rarity',
    itemType:'Item Type',
    craftingCategory:'Crafting Category',
    materialType:'Material Type',
    role:'Role',
    size:'Size',
    biome:'Biome',
    habitat:'Habitat',
    region:'Region',
    faction:'Faction',
    pantheon:'Pantheon',
    deity:'Deity',
    divineDomain:'Divine Domain',
    spellSchool:'Spell School',
    element:'Element',
    damageType:'Damage Type',
    castingType:'Casting Type',
    rank:'Rank',
    talentTier:'Talent Tier',
    professionType:'Profession Type',
    skillRank:'Skill Rank',
    locationType:'Location Type',
    settlementType:'Settlement Type',
    factionType:'Faction Type',
    alignment:'Alignment',
    influence:'Influence',
    era:'Era',
    availability:'Availability',
    playable:'Playable',
    climate:'Climate',
    language:'Language',
    threatTier:'Threat Tier',
    levelRange:'Level Range',
    hostility:'Hostility',
    magical:'Magical',
    boss:'Boss',
    soulTier:'Soul Tier',
    encounterRole:'Encounter Role',
    magicType:'Magic Type',
    essenceAffinity:'Essence Affinity',
    primaryStat:'Primary Stat',
    secondaryStat:'Secondary Stat',
    className:'Class',
    difficulty:'Difficulty',
    toolType:'Tool Type',
    trainingType:'Training Type',
    loreStatus:'Lore Status',
    status:'Status',
    visibility:'Visibility'
  };

  const tabTemplates = INDEX.tabTemplates;

  function normalizeDomain(value){
    const key = slug(value).replace(/-compendium$/, '');
    if(domainMap[key]) return domainMap[key];
    if(key.includes('race')) return 'race';
    if(key.includes('class')) return 'class';
    if(key.includes('creature')) return 'creature';
    if(key.includes('item') || key.includes('material') || key.includes('flora') || key.includes('mineral')) return 'item';
    if(key.includes('spell') || key.includes('magic')) return 'spell';
    if(key.includes('talent')) return 'talent';
    if(key.includes('profession')) return 'profession';
    if(key.includes('skill')) return 'skill';
    if(key.includes('location') || key.includes('world') || key.includes('realm') || key.includes('plane')) return 'location';
    if(key.includes('religion') || key.includes('theology') || key.includes('deity') || key.includes('god') || key.includes('pantheon') || key.includes('court')) return 'religion';
    if(key.includes('faction') || key.includes('guild') || key.includes('organization') || key.includes('organisation')) return 'faction';
    if(key.includes('lore') || key.includes('history') || key.includes('timeline') || key.includes('legend')) return 'lore';
    return 'handbook';
  }

  function markdownToHtml(markdown, entry = selectedEntry){
    const tokens = [];
    const token = html => { const id=tokens.push(html)-1; return `\uE000${id}\uE001`; };
    function artwork(reference,label){
      const src=entry?.imageReferences?.[reference];
      return token(src ? `<img class="compendium-inline-art" src="${escapeHtml(src)}" alt="${escapeHtml(label || entry?.title || 'Artwork')}" loading="lazy">` : `<span class="compendium-missing-art">Artwork unavailable: ${escapeHtml(label || reference)}</span>`);
    }
    function link(reference,label){
      if(/^https?:\/\//i.test(reference)) return token(`<a href="${escapeHtml(reference)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
      let candidates=[reference,reference.replace(/\.md$/i,'')];
      if(entry && !reference.startsWith('#')) for(const source of [entry.sourcePath,...array(entry.aliases).filter(value => value.endsWith('.md'))]) {
        try { candidates.push(decodeURI(new URL(reference,`https://asteria.invalid/${source}`).pathname).slice(1)); } catch { /* Invalid links remain readable text. */ }
      }
      const target=candidates.find(value => window.AsteriaContent.resolveAll(value).some(item => !item.gmOnly || isGMMode()));
      return token(target ? `<button type="button" class="universal-wiki-link" data-universal-link="${escapeHtml(target)}">${escapeHtml(label)}</button>` : `<span title="Unresolved reference: ${escapeHtml(reference)}">${escapeHtml(label)}</span>`);
    }
    const prepared=String(markdown || '')
      .replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g,(_,ref,label) => artwork(ref,label))
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,label,ref) => artwork(ref,label))
      .replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g,(_,ref,label) => link(ref,label || ref))
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,ref) => link(ref,label));
    const restore=html => html.replace(/\uE000(\d+)\uE001/g,(_,index) => tokens[Number(index)]);
    if(typeof window.mdToHtml === 'function') return restore(window.mdToHtml(prepared));
    const lines = prepared.split(/\r?\n/);
    let inList = false;
    const html = [];
    function inline(value){
      return escapeHtml(value)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[\[([^\]]+)\]\]/g, '<button type="button" class="universal-wiki-link" data-universal-link="$1">$1</button>');
    }
    lines.forEach(line => {
      if(!line.trim()){
        if(inList){ html.push('</ul>'); inList = false; }
        return;
      }
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if(heading){
        if(inList){ html.push('</ul>'); inList = false; }
        const level = Math.min(4, heading[1].length + 1);
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        return;
      }
      const item = line.match(/^[-*]\s+(.+)$/);
      if(item){
        if(!inList){ html.push('<ul>'); inList = true; }
        html.push(`<li>${inline(item[1])}</li>`);
        return;
      }
      if(inList){ html.push('</ul>'); inList = false; }
      html.push(`<p>${inline(line)}</p>`);
    });
    if(inList) html.push('</ul>');
    return restore(html.join(''));
  }

  function allEntries(){ return window.AsteriaContent.entries(); }

  function visibleEntries(includeGM = false){
    return allEntries().filter(entry => !entry.gmOnly || (includeGM && isGMMode()));
  }

  function search(query = '', filters = {}){
    const q = lower(query || filters.query || '');
    const domain = filters.domain ? normalizeDomain(filters.domain) : '';
    const includeGM = Boolean(filters.includeGM);
    return visibleEntries(includeGM).filter(entry => {
      if(domain && entry.domain !== domain) return false;
      if(filters.section && entry.workspaceSection !== filters.section && entry.section !== filters.section) return false;
      if(filters.category && !entry.categoryPath.map(lower).includes(lower(filters.category))) return false;
      if(filters.route && entry.route !== filters.route) return false;
      if(q && !entry.searchTerms.includes(q)) return false;
      return Object.entries(filters.metadata || {}).every(([key, value]) => !value || lower(entry.filters?.[key] ?? entry.metadata?.[key]) === lower(value));
    });
  }

  function filters(domainValue){
    const domain = domainValue ? normalizeDomain(domainValue) : '';
    const scoped = visibleEntries(activeIncludeGM).filter(entry => !domain || entry.domain === domain);
    const result = { categories:[], tags:[], visibility:[], routes:[] };
    filterKeysForDomain(domain || activeDomain).forEach(key => result[key] = result[key] || []);
    scoped.forEach(entry => {
      result.categories.push(...entry.categoryPath);
      result.tags.push(...entry.tags);
      result.visibility.push(entry.visibility);
      result.routes.push(entry.route);
      Object.entries(entry.filters || {}).forEach(([key, value]) => {
        result[key] = result[key] || [];
        if(value) result[key].push(value);
      });
    });
    Object.keys(result).forEach(key => result[key] = [...new Set(result[key].filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b))));
    return result;
  }

  function filterKeysForDomain(domain){
    const normalized = normalizeDomain(domain || activeDomain);
    const registryKeys = array(databaseRegistry[normalized]?.filterFields);
    const indexKeys = array(INDEX.filterFields?.[normalized]);
    return [...new Set(registryKeys.concat(indexKeys))];
  }

  function filterLabel(key){
    return filterLabels[key] || titleCase(key.replace(/([a-z])([A-Z])/g, '$1 $2'));
  }

  function tree(domainValue){
    const domain = normalizeDomain(domainValue || activeDomain);
    const root = { label:domainLabels[domain] || 'Compendium', path:[], children:{}, entries:[] };
    visibleEntries(activeIncludeGM).filter(entry => entry.domain === domain).forEach(entry => {
      let cursor = root;
      entry.categoryPath.forEach(part => {
        cursor.children[part] = cursor.children[part] || { label:part, path:cursor.path.concat(part), children:{}, entries:[] };
        cursor = cursor.children[part];
      });
      cursor.entries.push(entry);
    });
    function finish(node){
      return {
        label:node.label,
        path:node.path,
        entries:node.entries,
        children:Object.values(node.children).map(finish).sort((a,b) => a.label.localeCompare(b.label)),
        count:node.entries.length + Object.values(node.children).reduce((total, child) => total + finish(child).count, 0)
      };
    }
    return finish(root);
  }

  function getBySlug(value, domain){ return window.AsteriaContent.resolve(value, domain); }

  function getByRoute(value){ return window.AsteriaContent.resolve(value); }

  function related(entryOrSlug){
    const entry = typeof entryOrSlug === 'string' ? getBySlug(entryOrSlug) : entryOrSlug;
    if(!entry) return [];
    const referenceFields=['sourceItems','relatedItems','craftingUses','alchemyUses','culinaryUses','recipes','recipeLinks','ingredients','materials','outputs','requires','upgradesFrom','upgradesTo'];
    const references=[...array(entry.related),...referenceFields.flatMap(key => array(entry.metadata[key]))];
    for(const match of entry.body.matchAll(/(?<!!)\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g))references.push(match[1]);
    const requested = new Set(references.flatMap(value => window.AsteriaContent.resolveAll(typeof value==='object' ? value.id || value.name || value.title : value)).map(value => value.id));
    const tagSet = new Set(entry.tags.map(slug));
    return visibleEntries(activeIncludeGM).filter(candidate => {
      if(candidate.id === entry.id) return false;
      if(requested.has(candidate.id)) return true;
      return candidate.tags.some(tag => tagSet.has(slug(tag)));
    }).slice(0, 8);
  }

  function workspaceView(){
    window.setView?.('workspace');
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
    let root = byId('universal-compendium-shell');
    if(root) return root;
    root = document.createElement('section');
    root.id = 'universal-compendium-shell';
    root.className = 'codex-compendium-shell universal-compendium-shell';
    view.replaceChildren(root);
    return root;
  }

  function currentEntries(){
    const q = activeQuery || '';
    const categoryId = pathId(activePath);
    activeQuery = q;
    activeIncludeGM = Boolean(activeIncludeGM && isGMMode());
    const metadata = {};
    if(activeFilterField && activeFilterValue) metadata[activeFilterField] = activeFilterValue;
    let list = search(q, { domain:activeDomain, includeGM:activeIncludeGM, metadata });
    if(activePath.length) list = list.filter(entry => entry.pathId === categoryId || entry.pathId.startsWith(categoryId + '/'));
    return list;
  }

  function currentNode(){
    let node = tree(activeDomain);
    drillPath.forEach(part => {
      node = (node.children || []).find(child => child.label === part) || { children:[], entries:[] };
    });
    return node;
  }

  function breadcrumb(path, entry){
    const parts = [domainLabels[activeDomain] || 'Compendium'].concat(array(path));
    if(entry) parts.push(entry.title);
    return parts.map((part, index) => `<button type="button" data-universal-breadcrumb="${index}">${escapeHtml(part)}</button>`).join('<span>/</span>');
  }

  function sidebar(){
    const node = currentNode();
    return `
      <aside class="codex-sidebar universal-sidebar">
        <div class="codex-sidebar-head">
          <h3>Categories</h3>
          <button type="button" id="universalAllBtn">All</button>
        </div>
        <div class="codex-sidebar-breadcrumb">${breadcrumb(drillPath)}</div>
        <div class="codex-sidebar-actions">
          <button type="button" id="universalBackBtn" ${drillPath.length ? '' : 'disabled'}>Back</button>
          <span>Click filters. Double-click opens category.</span>
        </div>
        <div class="codex-tree-list">
          ${(node.children || []).map(child => `<button type="button" class="codex-tree-category ${pathId(activePath) === pathId(child.path) ? 'active' : ''}" data-universal-category="${escapeHtml(child.path.join('|'))}"><span>${escapeHtml(child.label)}</span><small>${child.count}</small></button>`).join('')}
          ${(node.entries || []).map(entry => `<button type="button" class="codex-tree-entry" data-universal-entry="${escapeHtml(entry.id)}">${escapeHtml(entry.title)}</button>`).join('')}
        </div>
      </aside>
    `;
  }

  function searchBar(){
    const availableFilters = filters(activeDomain);
    const filterFields = filterKeysForDomain(activeDomain).filter(key => availableFilters[key]?.length);
    if(activeFilterField && !filterFields.includes(activeFilterField)){
      activeFilterField = '';
      activeFilterValue = '';
    }
    const filterValues = activeFilterField ? availableFilters[activeFilterField] || [] : [];
    if(activeFilterValue && !filterValues.includes(activeFilterValue)) activeFilterValue = '';
    return `
      <section class="codex-search-filter-bar universal-search-filter-bar">
        <label>Search<input type="search" id="universalSearch" value="${escapeHtml(activeQuery)}" placeholder="Search ${escapeHtml(domainLabels[activeDomain] || 'Asteria')}..."></label>
        <label>Domain<select id="universalDomain">${Object.keys(domainLabels).map(domain => `<option value="${escapeHtml(domain)}" ${domain === activeDomain ? 'selected' : ''}>${escapeHtml(domainLabels[domain])}</option>`).join('')}</select></label>
        <label>Filter<select id="universalFilterField"><option value="">All Metadata</option>${filterFields.map(key => `<option value="${escapeHtml(key)}" ${key === activeFilterField ? 'selected' : ''}>${escapeHtml(filterLabel(key))}</option>`).join('')}</select></label>
        <label>Value<select id="universalFilterValue" ${activeFilterField ? '' : 'disabled'}><option value="">All Values</option>${filterValues.map(value => `<option value="${escapeHtml(value)}" ${value === activeFilterValue ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label>
        ${isGMMode() ? `<label class="codex-toggle-label"><input id="universalGMToggle" type="checkbox" ${activeIncludeGM ? 'checked' : ''}> Show GM-only</label>` : ''}
        <label>Sort<select id="universalSort"><option value="name" ${activeSort === 'name' ? 'selected' : ''}>Sort: Name</option><option value="category" ${activeSort === 'category' ? 'selected' : ''}>Sort: Category</option></select></label>
      </section>
    `;
  }

  function card(entry){
    return `
      <article class="codex-card universal-card" data-universal-entry="${escapeHtml(entry.id)}" tabindex="0">
        <div class="codex-card-art">${entry.imagePath ? `<img src="${escapeHtml(entry.imagePath)}" alt="${escapeHtml(entry.title)}" loading="lazy" decoding="async">` : `<span>${escapeHtml(initials(entry.title))}</span>`}</div>
        <h3><a href="#${escapeHtml(entry.route)}" tabindex="-1">${escapeHtml(entry.title)}</a></h3>
        <span class="universal-card-type">${escapeHtml((entry.domain === 'talent' ? (entry.metadata.className || '')+' / ' : '')+(entry.category || entry.compendium))}</span>
      </article>
    `;
  }

  function grid(){
    let list = routeChoices || currentEntries();
    const sort = activeSort || 'name';
    activeSort = sort;
    list = list.sort((a,b) => sort === 'category'
      ? a.categoryPath.join('/').localeCompare(b.categoryPath.join('/')) || a.title.localeCompare(b.title)
      : a.title.localeCompare(b.title)
    );
    return `
      <section class="codex-card-grid-panel">
        ${routeMessage ? `<p class="compendium-message" role="status">${escapeHtml(routeMessage)}</p>` : ''}
        <div class="codex-display-status"><span>${escapeHtml(activePath[activePath.length - 1] || 'All Entries')}</span><b aria-live="polite">${list.length} entries</b></div>
        <div class="codex-card-grid">${list.length ? list.slice(0,activeLimit).map(card).join('') : '<div class="codex-empty"><h3>No matching entries</h3><p>Try another search or clear the filters.</p><button type="button" id="universalClearFilters">Clear filters</button></div>'}</div>
        ${list.length > activeLimit ? '<button type="button" id="universalLoadMore">Show more entries</button>' : ''}
      </section>
    `;
  }

  function tabContent(entry){
    if(activeTab === 'GM Notes' && !isGMMode()) return '<section class="codex-gm-notes locked"><h3>GM Notes</h3><p>Hidden from player view.</p></section>';
    if(activeTab === 'Gallery') return `<section class="codex-gallery-panel"><h3>Gallery</h3><div class="compendium-gallery">${Object.entries(entry.images || {}).filter(([key,src],index,images) => images.findIndex(([,value]) => value===src)===index).map(([label,src]) => `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(entry.title+' — '+label)}" loading="lazy" decoding="async"><figcaption>${escapeHtml(titleCase(label))}</figcaption></figure>`).join('') || '<p>No artwork recorded.</p>'}</div>${markdownToHtml(entry.sections.Gallery,entry)}</section>`;
    if(activeTab === 'Related') return `<section class="codex-info-panel"><h3>Related Content</h3>${related(entry).map(item => `<button type="button" class="codex-tree-entry" data-universal-entry="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button>`).join('') || '<p>Information coming soon.</p>'}</section>`;
    if(entry.domain === 'class' && activeTab === 'Overview'){
      const content = sectionBundle(entry, ['Overview','Class Information','Class Features']);
      return `<section class="codex-info-panel markdown-body"><h3>Overview</h3>${markdownToHtml(content || 'Information coming soon.',entry)}</section>`;
    }
    if(entry.domain === 'class' && activeTab === 'Talent Tree'){
      return `<section class="codex-info-panel"><h3>Talent Tree</h3><div class="codex-talent-map">${[1,2,3,4,5].map(tier => `<section class="codex-talent-tier"><h4>Tier ${tier}</h4>${allEntries().filter(talent => talent.domain === 'talent' && slug(talent.metadata.className || talent.metadata.classname) === entry.slug && Number(String(talent.metadata.talentTier || talent.metadata.talenttier || talent.metadata.tier || '').match(/\d+/)?.[0]) === tier).map(talent => `<button type="button" class="codex-talent-card" data-universal-entry="${escapeHtml(talent.id)}"><b>${escapeHtml(talent.title)}</b><span>View ranks 1–5</span></button>`).join('')}</section>`).join('')}</div></section>`;
    }
    if(entry.domain === 'talent' && activeTab === 'Ranks') return `<section class="codex-info-panel markdown-body">${[1,2,3,4,5].map(rank => `<h3>Rank ${rank}</h3>${markdownToHtml(entry.sections?.[`Rank ${rank}`] || 'Information coming soon.',entry)}`).join('')}</section>`;
    if(entry.domain === 'race' && activeTab === 'Racial Sheet') return `<section class="codex-info-panel markdown-body"><h3>Natural Armour Class (NAC): ${escapeHtml(naturalACLabel(entry))}</h3>${markdownToHtml(sectionBundle(entry,['Racial Features','Racial Characteristics']),entry)}<h3>Racial Traits</h3><div class="compendium-traits">${array(entry.racialTraits || entry.metadata.racialTraits).map((trait,index) => `<details><summary>${escapeHtml(trait.name || 'Trait '+(index+1))}</summary>${markdownToHtml(trait.text || trait.description,entry)}</details>`).join('') || '<p>No racial traits recorded.</p>'}</div>${markdownToHtml(entry.sections['Traits & Biology'],entry)}</section>`;
    if(entry.domain === 'creature' && activeTab === 'Stat Sheet') return properties(entry,['hp','sp','mp','armour','threatTier','levelRange','size','attacks']);
    const content = entry.sections?.[activeTab] || (activeTab === 'Overview' ? entry.summary : '');
    const stats = activeTab === 'Overview' ? properties(entry, entry.domain === 'item' ? ['itemType','itemClass','weight','durability','damage','marketValue','marketPrice'] : entry.domain === 'race' ? ['naturalAC','size','movement','languages','magicAffinity'] : []) : activeTab === 'Properties' ? properties(entry) : '';
    return `${stats}<section class="codex-info-panel markdown-body"><h3>${escapeHtml(activeTab)}</h3>${markdownToHtml(content || 'Information coming soon.',entry)}</section>`;
  }

  function properties(entry, keys){
    const hidden = /^(id|title|name|slug|type|domain|categoryPath|aliases|source|visibility|images|image|symbol|raceInfo|.*Markdown|.*Details|tags|sections|body|content)/;
    const rows = (keys || Object.keys(entry.metadata).filter(key => !hidden.test(key))).map(key => [filterLabel(key),entry.metadata[key] ?? entry[key]]).filter(([,value]) => value !== undefined && value !== null && value !== '' && (typeof value !== 'object' || Array.isArray(value) && value.every(item => typeof item !== 'object')));
    return rows.length ? `<dl class="compendium-properties">${rows.map(([key,value]) => `<div><dt>${escapeHtml(key === 'Natural AC' ? 'Natural Armour Class (NAC)' : key)}</dt><dd>${escapeHtml(key === 'Natural AC' ? naturalACLabel(entry) : Array.isArray(value) ? value.join(', ') : value)}</dd></div>`).join('')}</dl>` : '';
  }
  function naturalACLabel(entry){ return entry.metadata.naturalACSource === 'fallback' ? 'Not recorded (fallback 1)' : entry.metadata.naturalAC ?? 1; }

  function sectionBundle(entry, names){
    return names
      .map(name => entry.sections?.[name])
      .filter(Boolean)
      .join('\n\n');
  }

  function detail(entry){
    const tabs = [...new Set([...(entry.tabs || tabTemplates[entry.domain] || tabTemplates.handbook),...Object.keys(entry.sections || {})])].filter(tab => tab !== 'GM Notes' || isGMMode());
    if(!tabs.includes('Related')) tabs.push('Related');
    return `
      <article class="codex-detail-page universal-detail-page">
        <button type="button" id="universalBackToCards" class="clean-back codex-return">Back to cards</button>
        <header class="codex-detail-head">
          <div class="codex-detail-art">${entry.imagePath ? `<img src="${escapeHtml(entry.imagePath)}" alt="${escapeHtml(entry.title)}" decoding="async">` : `<span>${escapeHtml(initials(entry.title))}</span>`}</div>
          <div>
            <p class="eyebrow">${escapeHtml(entry.compendium || domainLabels[entry.domain])}</p>
            <h2>${escapeHtml(entry.title)}</h2>
            <div class="codex-detail-breadcrumb">${breadcrumb(entry.categoryPath, entry)}</div>
          </div>
        </header>
        <nav class="codex-detail-tabs">${tabs.map(tab => `<button type="button" class="${tab === activeTab ? 'active' : ''}" data-universal-tab="${escapeHtml(tab)}">${escapeHtml(tab)}</button>`).join('')}</nav>
        <section class="codex-tab-window">${tabContent(entry)}</section>
      </article>
    `;
  }

  function layout(){
    return `
      <section class="codex-compendium-header universal-compendium-header">
        <h1>${escapeHtml(domainLabels[activeDomain] || 'Asteria Compendium')}</h1>
        <div class="codex-breadcrumbs">${breadcrumb(activePath, selectedEntry)}</div>
      </section>
      ${searchBar()}
      <section class="codex-compendium-body">
        ${sidebar()}
        <main class="codex-main-display">${selectedEntry ? detail(selectedEntry) : grid()}</main>
      </section>
    `;
  }

  function render(){
    const focused = document.activeElement;
    const focusId = focused?.id;
    const selection = typeof focused?.selectionStart === 'number' ? [focused.selectionStart,focused.selectionEnd] : null;
    const root = shell();
    root.innerHTML = layout();
    bind();
    const next = focusId ? byId(focusId) : null;
    if(next){ next.focus({preventScroll:true}); if(selection) next.setSelectionRange?.(...selection); }
    writeRoute(false);
  }

  function openSection(name, options = {}){
    activeDomain = normalizeDomain(name || activeDomain);
    activePath = options.path ? String(options.path).split('/').filter(Boolean) : [];
    drillPath = activePath.slice(0, Math.max(0, activePath.length - 1));
    selectedEntry = null;
    activeQuery = options.query || '';
    activeLimit = 60;
    routeChoices = null;
    routeMessage = '';
    activeFilterField = '';
    activeFilterValue = '';
    activeTab = (tabTemplates[activeDomain] || tabTemplates.handbook)[0];
    writeRoute(true);
    render();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function openEntry(entry){
    const target = typeof entry === 'string' ? getBySlug(entry) : entry;
    if(!target || (target.gmOnly && !isGMMode())) return false;
    selectedEntry = target;
    routeChoices = null;
    routeMessage = '';
    activeDomain = selectedEntry.domain;
    activePath = selectedEntry.categoryPath.slice();
    drillPath = selectedEntry.categoryPath.slice(0, -1);
    activeTab = (selectedEntry.tabs || tabTemplates[activeDomain] || tabTemplates.handbook)[0];
    writeRoute(true);
    render();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function openEntryBySlug(slugValue){
    const matches = window.AsteriaContent.resolveAll(slugValue).filter(entry => !entry.gmOnly || isGMMode());
    if(matches.length === 1) return openEntry(matches[0]);
    if(matches.length > 1){
      activeDomain = matches[0].domain; selectedEntry = null; routeChoices = matches;
      routeMessage = 'This older link matches more than one entry. Choose the class or category you need.';
      render(); return true;
    }
    return false;
  }

  function writeRoute(push){
    if(readingRoute || !window.history?.replaceState) return;
    const params = new URLSearchParams();
    if(activeQuery) params.set('q',activeQuery);
    if(activePath.length && !selectedEntry) params.set('category',activePath.join('/'));
    if(activeFilterField) params.set('filter',activeFilterField);
    if(activeFilterValue) params.set('value',activeFilterValue);
    if(activeSort !== 'name') params.set('sort',activeSort);
    if(selectedEntry && activeTab !== 'Overview') params.set('tab',activeTab);
    const hash = '#' + (selectedEntry?.route || `/compendium/${activeDomain}`) + (params.size ? '?' + params : '');
    if(window.location.hash !== hash) window.history[push ? 'pushState' : 'replaceState'](window.history.state,'',hash);
  }
  function readRoute(){
    const hash = (window.location.hash || '').replace(/^#/,'');
    const [pathname,query=''] = hash.split('?');
    const segments = pathname.replace(/^\//,'').split('/');
    const legacyCollection = ['flora','minerals','materials'].includes(segments[0]);
    const matches = window.AsteriaContent.resolveAll(pathname);
    if(segments[0] !== 'compendium' && !legacyCollection && !matches.length) return false;
    readingRoute = true;
    try {
      if(matches.length) {
        if(!openEntryBySlug(pathname)) { openSection(matches[0].domain); routeMessage='This entry is unavailable in the current view.'; }
      }
      else {
        openSection(legacyCollection ? 'item' : segments[1]);
        if(legacyCollection) { activeFilterField='collection'; activeFilterValue=segments[0]; }
        else if(segments.length > 2) routeMessage='This entry could not be found. Search the compendium below.';
      }
      const params = new URLSearchParams(query);
      activeQuery=params.get('q') || '';
      if(params.has('category'))activePath=params.get('category').split('/').filter(Boolean);
      if(params.has('filter'))activeFilterField=params.get('filter');
      if(params.has('value'))activeFilterValue=params.get('value');
      activeSort=params.get('sort') || 'name';
      if(params.has('tab'))activeTab=params.get('tab');
      render();
    } finally { readingRoute=false; }
    if(matches.length===1 || legacyCollection) writeRoute(false);
    return true;
  }

  function bind(){
    byId('universalLoadMore')?.addEventListener('click', () => { activeLimit+=60; render(); });
    byId('universalClearFilters')?.addEventListener('click', () => openSection(activeDomain));
    byId('universalAllBtn')?.addEventListener('click', () => {
      activePath = [];
      drillPath = [];
      selectedEntry = null;
      render();
    });
    byId('universalBackBtn')?.addEventListener('click', () => {
      drillPath = drillPath.slice(0, -1);
      activePath = drillPath.slice();
      selectedEntry = null;
      render();
    });
    byId('universalDomain')?.addEventListener('change', event => openSection(event.target.value));
    byId('universalSearch')?.addEventListener('input', event => {
      activeQuery = event.target.value || '';
      activeLimit = 60; routeChoices = null; routeMessage = '';
      selectedEntry = null;
      render();
    });
    byId('universalFilterField')?.addEventListener('change', event => {
      activeFilterField = event.target.value || '';
      activeFilterValue = '';
      selectedEntry = null;
      render();
    });
    byId('universalFilterValue')?.addEventListener('change', event => {
      activeFilterValue = event.target.value || '';
      selectedEntry = null;
      render();
    });
    byId('universalGMToggle')?.addEventListener('change', event => {
      activeIncludeGM = Boolean(event.target.checked);
      selectedEntry = null;
      render();
    });
    byId('universalSort')?.addEventListener('change', event => {
      activeSort = event.target.value || 'name';
      selectedEntry = null;
      render();
    });
    qsa('[data-universal-category]').forEach(button => {
      button.addEventListener('click', () => {
        const path = String(button.dataset.universalCategory || '').split('|').filter(Boolean);
        clearTimeout(categoryClickTimer);
        categoryClickTimer = setTimeout(() => {
          activePath = path;
          selectedEntry = null;
          render();
        }, 190);
      });
      button.addEventListener('dblclick', () => {
        clearTimeout(categoryClickTimer);
        drillPath = String(button.dataset.universalCategory || '').split('|').filter(Boolean);
        activePath = drillPath.slice();
        selectedEntry = null;
        render();
      });
    });
    qsa('[data-universal-entry]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const entry = allEntries().find(item => item.id === button.dataset.universalEntry);
        if(entry) openEntry(entry);
      });
      button.addEventListener('keydown', event => {
        if(event.key === 'Enter'){
          const entry = allEntries().find(item => item.id === button.dataset.universalEntry);
          if(entry) openEntry(entry);
        }
      });
    });
    qsa('[data-universal-tab]').forEach(button => {
      button.addEventListener('click', () => {
        activeTab = button.dataset.universalTab || 'Overview';
        render();
      });
    });
    qsa('[data-universal-breadcrumb]').forEach(button => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.universalBreadcrumb || 0);
        activePath = index <= 0 ? [] : activePath.slice(0, index);
        drillPath = activePath.slice();
        selectedEntry = null;
        render();
      });
    });
    byId('universalBackToCards')?.addEventListener('click', () => {
      selectedEntry = null;
      render();
    });
    qsa('[data-universal-link]').forEach(button => {
      button.addEventListener('click', () => openEntryBySlug(button.dataset.universalLink));
    });
  }

  function workspaceEntries(){ return allEntries(); }

  function publish(){
    const api = {
      version:'asteria-compendium-v2',
      entries:allEntries,
      visibleEntries,
      search,
      filters,
      tree,
      getBySlug,
      getByRoute,
      related,
      openSection,
      openEntry,
      openEntryBySlug,
      openRoute:readRoute,
      tabsFor:domain => tabTemplates[normalizeDomain(domain)] || tabTemplates.handbook,
      domains:() => Object.assign({}, domainLabels),
      databases:() => Object.assign({}, databaseRegistry),
      filterFields:domain => filterKeysForDomain(domain),
      invalidate(){ return allEntries(); }
    };

    function routedOpenSection(name, options){
      return openSection(name, options || {});
    }
    function routedOpenEntryBySlug(slugValue){
      return openEntryBySlug(slugValue);
    }

    window.AsteriaUniversalCompendium = api;
    window.AsteriaWorkspace = Object.assign({}, window.AsteriaWorkspace || {}, {
      universal:api,
      universalEntries:allEntries,
      searchAll:search,
      openUniversalSection:openSection,
      openUniversalEntry:openEntryBySlug,
      openSection:routedOpenSection,
      openEntryBySlug:routedOpenEntryBySlug,
      entries:workspaceEntries
    });
    window.AsteriaCompendium = Object.assign({}, window.AsteriaCompendium || {}, {
      universal:api,
      universalEntries:allEntries,
      searchAll:search,
      openUniversalSection:openSection,
      openUniversalEntry:openEntryBySlug,
      openSection, openEntry, openEntryBySlug, entries:allEntries
    });
    window.openSection = openSection;
    window.openCompendiumSection = openSection;
    window.openWorkspaceEntry = openEntryBySlug;
  }

  function boot(){
    publish();
    window.addEventListener('hashchange',readRoute);
    window.addEventListener('popstate',readRoute);
    window.addEventListener('asteria:custom-items-updated',() => {
      if(byId('universal-compendium-shell') && byId('workspace')?.classList.contains('show')) {
        if(selectedEntry) selectedEntry = getBySlug(selectedEntry.id);
        render();
      }
    });
    readRoute();
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
