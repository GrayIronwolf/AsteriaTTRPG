/* Asteria Phase 1 Universal Compendium Engine.
   Normalizes structured content, generated indexes, and current manifest data into one shared API. */
(function(){
  'use strict';

  const INDEX = window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX || { entries:[], domains:{}, databases:{}, tabTemplates:{}, filterFields:{} };
  const LORE_LEVELS = ['Common Knowledge','Discovered Lore','Rare Lore','Forbidden Lore','GM Only'];
  const UNIVERSAL_ROUTE_SECTIONS = new Set(['Talents','Talent Compendium','Professions','Profession Compendium','Skills','Skill Compendium','Locations','Location Compendium','Religions','Religion & Gods Compendium','Gods','Factions','Faction Compendium','Lore','Lore Compendium']);

  let cachedEntries = null;
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
  let originalWorkspaceEntries = null;
  let originalWorkspaceOpenSection = null;
  let originalOpenEntryBySlug = null;

  function byId(id){ return document.getElementById(id); }
  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }
  function lower(value){ return String(value || '').toLowerCase(); }
  function array(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
  function firstValue(object, keys){
    for(const key of keys){
      if(object && object[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
    }
    return '';
  }
  function joinedValue(object, keys){ return array(firstValue(object, keys)).join(', '); }
  function escapeHtml(value){
    return String(value || '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
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
    skill:'skill', skills:'skill',
    location:'location', locations:'location', world:'location', worlds:'location', realms:'location', planes:'location',
    religion:'religion', religions:'religion', god:'religion', gods:'religion', pantheon:'religion',
    faction:'faction', factions:'faction', guild:'faction', guilds:'faction', organization:'faction', organizations:'faction',
    lore:'lore', history:'lore', histories:'lore', timeline:'lore', timelines:'lore', legend:'lore',
    handbook:'handbook', rules:'handbook'
  };

  const domainLabels = Object.assign({
    race:'Race Compendium',
    class:'Class Compendium',
    creature:'Creature Compendium',
    item:'Item Compendium',
    spell:'Spell Compendium',
    talent:'Talent Compendium',
    profession:'Profession Compendium',
    skill:'Skill Compendium',
    location:'Location Compendium',
    religion:'Religion & Gods Compendium',
    faction:'Faction Compendium',
    lore:'Lore Compendium',
    handbook:'Asteria Handbook'
  }, INDEX.domains || {});

  const databaseRegistry = Object.assign({}, INDEX.databases || {});

  const baseFilterKeys = [
    'category','rarity','itemType','craftingCategory','materialType','role','size','biome','habitat','region',
    'faction','pantheon','deity','divineDomain','spellSchool','element','damageType','castingType','rank','talentTier',
    'professionType','skillRank','locationType','settlementType','factionType','alignment','influence','era',
    'availability','playable','climate','language','threatTier','levelRange','hostility','magical','boss','soulTier',
    'encounterRole','magicType','essenceAffinity','primaryStat','secondaryStat','className','difficulty','toolType',
    'trainingType','loreStatus','status','visibility'
  ];

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

  const tabTemplates = Object.assign({
    race:['Overview','Racial Sheet','Lore','Culture','Historical Figures','Settlements','Relations','Traits & Biology','Gallery','GM Notes'],
    class:['Overview','Class Information','Mechanics','Progression','Talent Trees','Pathways','Equipment','Lore','Gallery','GM Notes'],
    creature:['Overview','Stat Sheet','Lore','Habitat','Behaviour','Combat','Loot & Drops','Soul Information','Variants','Encounter Use','Gallery','GM Notes'],
    item:['Overview','Properties','Crafting','Lore','Sources','Gallery','GM Notes'],
    spell:['Overview','Casting','Scaling','Lore','Sources','GM Notes'],
    talent:['Overview','Ranks','Prerequisites','Scaling','Synergy','GM Notes'],
    profession:['Overview','Progression','Tools','Recipes','Lore','GM Notes'],
    skill:['Overview','Ranks','Checks','Training','Lore','GM Notes'],
    location:['Overview','Map Notes','Regions','Factions','Lore','Encounters','GM Notes'],
    religion:['Overview','Doctrine','Gods','Followers','Rituals','Lore','GM Notes'],
    faction:['Overview','Influence','Members','Relations','Holdings','History','Hooks','GM Notes'],
    lore:['Overview','Chronicle','People','Places','Artifacts','Related','GM Notes'],
    handbook:['Overview','Rules','Examples','Related','GM Notes']
  }, INDEX.tabTemplates || {});

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
    if(key.includes('religion') || key.includes('god') || key.includes('pantheon')) return 'religion';
    if(key.includes('faction') || key.includes('guild') || key.includes('organization') || key.includes('organisation')) return 'faction';
    if(key.includes('lore') || key.includes('history') || key.includes('timeline') || key.includes('legend')) return 'lore';
    return 'handbook';
  }

  function markdownToHtml(markdown){
    if(typeof window.mdToHtml === 'function') return window.mdToHtml(markdown || '');
    const lines = String(markdown || '').split(/\r?\n/);
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
    return html.join('');
  }

  function sectionsFromMarkdown(markdown){
    const sections = {};
    let current = 'Overview';
    sections[current] = [];
    String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').split(/\r?\n/).forEach(line => {
      const heading = line.match(/^##\s+(.+)$/);
      if(heading){
        current = heading[1].trim();
        sections[current] = sections[current] || [];
        return;
      }
      sections[current] = sections[current] || [];
      sections[current].push(line);
    });
    return Object.fromEntries(Object.entries(sections).map(([key, lines]) => [key, lines.join('\n').trim()]));
  }

  function normalizeEntry(entry, source = 'generated'){
    const domain = normalizeDomain(entry.domain || entry.type || entry.section || entry.workspaceSection);
    const title = entry.title || entry.name || 'Untitled';
    const categoryPath = array(entry.categoryPath).length
      ? array(entry.categoryPath)
      : array(entry.path).length
        ? array(entry.path)
        : [entry.category || domainLabels[domain] || 'Entries'].filter(Boolean);
    const metadata = entry.metadata || {};
    const content = entry.content || entry.body || '';
    const sections = entry.sections || sectionsFromMarkdown(content);
    const tabs = array(entry.tabs).length ? array(entry.tabs) : (tabTemplates[domain] || tabTemplates.handbook);
    const imagePath = entry.imagePath || entry.image || entry.images?.female || entry.images?.male || entry.images?.image || entry.symbol || '';
    const metadataFilters = {
      category: categoryPath[categoryPath.length - 1] || '',
      rarity: joinedValue(entry, ['rarity','item_class']).replace(/^$/, joinedValue(metadata, ['itemClass','item_class','rarity'])),
      itemType: joinedValue(metadata, ['itemType','item_type']),
      craftingCategory: joinedValue(metadata, ['craftingCategory','crafting_category']),
      materialType: joinedValue(metadata, ['materialType','material_type']),
      role: joinedValue(entry, ['role','encounter_role']).replace(/^$/, joinedValue(metadata, ['role','partyRole','party_role','encounterRole','encounter_role'])),
      size: joinedValue(entry, ['size']).replace(/^$/, joinedValue(metadata, ['size'])),
      biome: joinedValue(entry, ['biome']).replace(/^$/, joinedValue(metadata, ['biome','biomes'])),
      habitat: joinedValue(metadata, ['habitat','habitats']),
      region: joinedValue(metadata, ['region','regions']),
      faction: joinedValue(metadata, ['faction','factions','relatedFactions','related_factions']),
      pantheon: joinedValue(metadata, ['pantheon','pantheons']),
      deity: joinedValue(metadata, ['deity','god','gods']),
      divineDomain: joinedValue(metadata, ['divineDomain','divine_domain','domain','domains']),
      spellSchool: joinedValue(metadata, ['spellSchool','spell_school','school','magicSchool','magic_school']),
      element: joinedValue(metadata, ['element','elements','affinity','affinities']),
      damageType: joinedValue(metadata, ['damageType','damage_type']),
      castingType: joinedValue(metadata, ['castingType','casting_type']),
      rank: joinedValue(metadata, ['rank','spellRank','spell_rank']),
      talentTier: joinedValue(metadata, ['talentTier','talent_tier','tier']),
      professionType: joinedValue(metadata, ['professionType','profession_type']),
      skillRank: joinedValue(metadata, ['skillRank','skill_rank','rank']),
      locationType: joinedValue(metadata, ['locationType','location_type']),
      settlementType: joinedValue(metadata, ['settlementType','settlement_type']),
      factionType: joinedValue(metadata, ['factionType','faction_type']),
      alignment: joinedValue(metadata, ['alignment']),
      influence: joinedValue(metadata, ['influence','influenceLevel','influence_level']),
      era: joinedValue(metadata, ['era','age','timeline']),
      availability: joinedValue(metadata, ['availability','playable']),
      playable: joinedValue(metadata, ['playable']),
      climate: joinedValue(metadata, ['climate']),
      language: joinedValue(metadata, ['language','languages']),
      threatTier: joinedValue(entry, ['threatTier','threat_tier']).replace(/^$/, joinedValue(metadata, ['threatTier','threat_tier'])),
      levelRange: joinedValue(metadata, ['levelRange','level_range']),
      hostility: joinedValue(metadata, ['hostility']),
      magical: joinedValue(metadata, ['magical']),
      boss: joinedValue(metadata, ['boss']),
      soulTier: joinedValue(metadata, ['soulTier','soul_tier']),
      encounterRole: joinedValue(metadata, ['encounterRole','encounter_role']),
      magicType: joinedValue(entry, ['magicType','magic_type']).replace(/^$/, joinedValue(metadata, ['magicType','magic_type'])),
      essenceAffinity: joinedValue(metadata, ['essenceAffinity','essence_affinity','affinity','affinities']),
      primaryStat: joinedValue(metadata, ['primaryStat','primary_stat']),
      secondaryStat: joinedValue(metadata, ['secondaryStat','secondary_stat']),
      className: joinedValue(metadata, ['className','class_name','class']),
      difficulty: joinedValue(metadata, ['difficulty']),
      toolType: joinedValue(metadata, ['toolType','tool_type']),
      trainingType: joinedValue(metadata, ['trainingType','training_type']),
      loreStatus: joinedValue(entry, ['loreStatus','lore_status']).replace(/^$/, joinedValue(metadata, ['loreStatus','lore_status','loreVisibility','lore_visibility']) || 'Common Knowledge'),
      status: joinedValue(metadata, ['status']),
      visibility: joinedValue(metadata, ['visibility'])
    };
    const filters = Object.fromEntries(Object.entries(Object.assign({}, metadataFilters, entry.filters || {})).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    const slugValue = entry.slug || slug(title);
    const route = entry.route || entry.wikiRoute || `/compendium/${domain}/${categoryPath.map(slug).join('/')}${categoryPath.length ? '/' : ''}${slugValue}`;
    const gmOnly = Boolean(entry.gmOnly || String(entry.visibility || metadata.visibility || '').toLowerCase().includes('gm'));
    return {
      id: entry.id || `${source}:${domain}:${slugValue}`,
      title,
      name: title,
      slug: slugValue,
      domain,
      type: domain,
      section: entry.section || entry.workspaceSection || workspaceSection(domain),
      workspaceSection: entry.workspaceSection || entry.section || workspaceSection(domain),
      compendium: entry.compendium || domainLabels[domain],
      categoryPath,
      path: categoryPath,
      pathId: pathId(categoryPath),
      category: categoryPath[categoryPath.length - 1] || domainLabels[domain],
      route,
      sourcePath: entry.sourcePath || entry.contentPath || '',
      sourceFolder: entry.sourceFolder || '',
      content,
      body: entry.body || content,
      sections,
      tabs,
      activeTabs: tabs,
      summary: entry.summary || entry.description || Object.values(sections).find(Boolean) || 'Information coming soon.',
      description: entry.description || entry.summary || 'Information coming soon.',
      metadata,
      tags: array(entry.tags),
      visibility: gmOnly ? 'gm-only' : (entry.visibility || 'public'),
      gmOnly,
      images: entry.images || {},
      imagePath,
      related: array(entry.related),
      filters,
      source,
      searchTerms: lower([title, domain, categoryPath.join(' '), entry.searchTerms, content, JSON.stringify(metadata), JSON.stringify(filters), array(entry.tags).join(' ')].join(' '))
    };
  }

  function workspaceSection(domain){
    return {
      race:'Races',
      class:'Classes',
      creature:'Creatures',
      item:'Items',
      spell:'Magic',
      talent:'Classes',
      profession:'Asteria Handbook',
      skill:'Asteria Handbook',
      location:'World, Realms & Planes',
      religion:'World, Realms & Planes',
      faction:'Factions',
      lore:'Asteria Handbook',
      handbook:'Asteria Handbook'
    }[domain] || 'Asteria Handbook';
  }

  function traverseManifest(data, domain, nodeToEntry){
    const entries = [];
    function walk(nodes, path){
      array(nodes).forEach(node => {
        if(node && node.type === 'category') return walk(node.children || [], path.concat(node.name));
        entries.push(nodeToEntry(node, path));
      });
    }
    walk(data?.categories || [], []);
    return entries.map(entry => normalizeEntry(entry, `${domain}-manifest`));
  }

  function manifestRaceEntries(){
    return traverseManifest(window.ASTERIA_RACE_COMPENDIUM_DATA, 'race', (node, path) => ({
      title: node.name,
      slug: slug(node.slug || node.name),
      domain:'race',
      section:'Races',
      categoryPath:path,
      images:node.images || {},
      imagePath:node.image || node.images?.female || node.images?.male || '',
      metadata:node,
      tags:array(node.tags),
      tabs:tabTemplates.race
    }));
  }

  function manifestClassEntries(){
    return traverseManifest(window.ASTERIA_CLASS_COMPENDIUM_DATA, 'class', (node, path) => ({
      title: node.name,
      slug: slug(node.slug || node.name),
      domain:'class',
      section:'Classes',
      categoryPath:path,
      metadata:node,
      tags:array(node.tags),
      summary:node.role || 'Information coming soon.',
      tabs:tabTemplates.class,
      filters:{ role:node.role, magicType:node.magic_type, category:path[0] || '' }
    }));
  }

  function manifestCreatureEntries(){
    return traverseManifest(window.ASTERIA_CREATURE_COMPENDIUM_DATA, 'creature', (node, path) => ({
      title: node.name,
      slug: slug(node.slug || node.name),
      domain:'creature',
      section:'Creatures',
      categoryPath:path,
      metadata:node,
      tags:array(node.tags),
      summary:node.notes || 'Information coming soon.',
      tabs:tabTemplates.creature,
      filters:{ threatTier:node.threat_tier, role:node.encounter_role, size:node.size, biome:node.biome, category:path[0] || '' }
    }));
  }

  function wikiEntries(){
    const indexes = window.ASTERIA_WIKI_INDEXES || {};
    return Object.values(indexes).flatMap(index => (index.items || []).map(item => normalizeEntry({
      id:`wiki:${item.collection || index.id}:${item.slug}`,
      title:item.title,
      slug:item.slug,
      domain:'item',
      section:'Items',
      compendium:index.title || 'Item Compendium',
      categoryPath:['Content Collections', index.title || item.collection || 'Collection', item.categoryLabel || item.category || 'Entries'],
      route:item.route,
      sourcePath:item.contentPath,
      imagePath:item.imagePath,
      content:item.body || '',
      body:item.body || '',
      metadata:item.metadata || {},
      tags:item.tags || [],
      filters:{ rarity:item.item_class, category:item.categoryLabel || item.category, affinity:array(item.affinities).join(', ') }
    }, 'wiki-index')));
  }

  function generatedEntries(){
    return array(INDEX.entries).map(entry => normalizeEntry(entry, 'universal-index'));
  }

  function allEntries(){
    if(cachedEntries) return cachedEntries.slice();
    const combined = [
      ...generatedEntries(),
      ...wikiEntries(),
      ...manifestRaceEntries(),
      ...manifestClassEntries(),
      ...manifestCreatureEntries()
    ];
    const seen = new Set();
    cachedEntries = combined.filter(entry => {
      const key = `${entry.domain}:${entry.slug}:${entry.categoryPath.join('/')}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a,b) => a.domain.localeCompare(b.domain) || a.categoryPath.join('/').localeCompare(b.categoryPath.join('/')) || a.title.localeCompare(b.title));
    return cachedEntries.slice();
  }

  function visibleEntries(includeGM = false){
    return allEntries().filter(entry => !entry.gmOnly || includeGM || isGMMode());
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
      return Object.entries(filters.metadata || {}).every(([key, value]) => !value || lower(entry.filters?.[key] || entry.metadata?.[key]).includes(lower(value)));
    });
  }

  function filters(domainValue){
    const domain = domainValue ? normalizeDomain(domainValue) : '';
    const scoped = domain ? allEntries().filter(entry => entry.domain === domain) : allEntries();
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
    return [...new Set(registryKeys.concat(indexKeys, baseFilterKeys))];
  }

  function filterLabel(key){
    return filterLabels[key] || titleCase(key.replace(/([a-z])([A-Z])/g, '$1 $2'));
  }

  function tree(domainValue){
    const domain = normalizeDomain(domainValue || activeDomain);
    const root = { label:domainLabels[domain] || 'Compendium', path:[], children:{}, entries:[] };
    allEntries().filter(entry => entry.domain === domain).forEach(entry => {
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

  function getBySlug(slugValue){
    const key = slug(slugValue);
    return allEntries().find(entry => entry.slug === key || slug(entry.title) === key || entry.id === slugValue || slug(entry.route) === key) || null;
  }

  function getByRoute(route){
    return allEntries().find(entry => entry.route === route) || null;
  }

  function related(entryOrSlug){
    const entry = typeof entryOrSlug === 'string' ? getBySlug(entryOrSlug) : entryOrSlug;
    if(!entry) return [];
    const requested = array(entry.related).map(slug);
    const tagSet = new Set(entry.tags.map(slug));
    return allEntries().filter(candidate => {
      if(candidate.id === entry.id) return false;
      if(requested.includes(candidate.slug) || requested.includes(slug(candidate.title))) return true;
      return candidate.tags.some(tag => tagSet.has(slug(tag)));
    }).slice(0, 8);
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
    let root = byId('universal-compendium-shell');
    if(root) return root;
    root = document.createElement('section');
    root.id = 'universal-compendium-shell';
    root.className = 'codex-compendium-shell universal-compendium-shell';
    view.replaceChildren(root);
    return root;
  }

  function currentEntries(){
    const q = byId('universalSearch')?.value || activeQuery || '';
    const categoryId = pathId(activePath);
    activeQuery = q;
    const gmToggle = byId('universalGMToggle');
    activeIncludeGM = gmToggle ? Boolean(gmToggle.checked) : Boolean(activeIncludeGM);
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
        <label>Search<input id="universalSearch" value="${escapeHtml(activeQuery)}" placeholder="Search ${escapeHtml(domainLabels[activeDomain] || 'Asteria')}..."></label>
        <label>Domain<select id="universalDomain">${Object.keys(domainLabels).map(domain => `<option value="${escapeHtml(domain)}" ${domain === activeDomain ? 'selected' : ''}>${escapeHtml(domainLabels[domain])}</option>`).join('')}</select></label>
        <label>Filter<select id="universalFilterField"><option value="">All Metadata</option>${filterFields.map(key => `<option value="${escapeHtml(key)}" ${key === activeFilterField ? 'selected' : ''}>${escapeHtml(filterLabel(key))}</option>`).join('')}</select></label>
        <label>Value<select id="universalFilterValue" ${activeFilterField ? '' : 'disabled'}><option value="">All Values</option>${filterValues.map(value => `<option value="${escapeHtml(value)}" ${value === activeFilterValue ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label>
        <label class="codex-toggle-label"><input id="universalGMToggle" type="checkbox" ${activeIncludeGM ? 'checked' : ''}> Show GM-only</label>
        <label>Sort<select id="universalSort"><option value="name" ${activeSort === 'name' ? 'selected' : ''}>Sort: Name</option><option value="category" ${activeSort === 'category' ? 'selected' : ''}>Sort: Category</option></select></label>
      </section>
    `;
  }

  function card(entry){
    return `
      <article class="codex-card universal-card" data-universal-entry="${escapeHtml(entry.id)}" tabindex="0">
        <div class="codex-card-art">${entry.imagePath ? `<img src="${escapeHtml(entry.imagePath)}" alt="${escapeHtml(entry.title)}">` : `<span>${escapeHtml(initials(entry.title))}</span>`}</div>
        <h3>${escapeHtml(entry.title)}</h3>
        <span class="universal-card-type">${escapeHtml(entry.category || entry.compendium)}</span>
      </article>
    `;
  }

  function grid(){
    let list = currentEntries();
    const sort = byId('universalSort')?.value || activeSort || 'name';
    activeSort = sort;
    list = list.sort((a,b) => sort === 'category'
      ? a.categoryPath.join('/').localeCompare(b.categoryPath.join('/')) || a.title.localeCompare(b.title)
      : a.title.localeCompare(b.title)
    );
    return `
      <section class="codex-card-grid-panel">
        <div class="codex-display-status"><span>${escapeHtml(activePath[activePath.length - 1] || 'All Entries')}</span><b>${list.length} entries</b></div>
        <div class="codex-card-grid">${list.length ? list.map(card).join('') : '<div class="codex-empty"><h3>Information coming soon</h3><p>No entries match this category or filter yet.</p></div>'}</div>
      </section>
    `;
  }

  function tabContent(entry){
    if(activeTab === 'GM Notes' && !isGMMode()) return '<section class="codex-gm-notes locked"><h3>GM Notes</h3><p>Hidden from player view.</p></section>';
    if(activeTab === 'Gallery') return `<section class="codex-gallery-panel"><h3>Gallery</h3><div class="codex-gallery-slot">${entry.imagePath ? `<img src="${escapeHtml(entry.imagePath)}" alt="${escapeHtml(entry.title)}">` : `<span>${escapeHtml(initials(entry.title))}</span>`}</div></section>`;
    if(activeTab === 'Related') return `<section class="codex-info-panel"><h3>Related Content</h3>${related(entry).map(item => `<button type="button" class="codex-tree-entry" data-universal-entry="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button>`).join('') || '<p>Information coming soon.</p>'}</section>`;
    const content = entry.sections?.[activeTab] || entry.sections?.Overview || entry.body || entry.content || entry.summary;
    return `<section class="codex-info-panel markdown-body"><h3>${escapeHtml(activeTab)}</h3>${markdownToHtml(content || 'Information coming soon.')}</section>`;
  }

  function detail(entry){
    const tabs = array(entry.tabs).length ? entry.tabs : (tabTemplates[entry.domain] || tabTemplates.handbook);
    if(!tabs.includes('Related')) tabs.push('Related');
    return `
      <article class="codex-detail-page universal-detail-page">
        <button type="button" id="universalBackToCards" class="clean-back codex-return">Back to cards</button>
        <header class="codex-detail-head">
          <div class="codex-detail-art">${entry.imagePath ? `<img src="${escapeHtml(entry.imagePath)}" alt="${escapeHtml(entry.title)}">` : `<span>${escapeHtml(initials(entry.title))}</span>`}</div>
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
        <div>
          <p class="eyebrow">Phase 1 Universal Compendium Engine</p>
          <h1>${escapeHtml(domainLabels[activeDomain] || 'Asteria Compendium')}</h1>
          <p>Generated from structured content, metadata, manifests, and reusable compendium rendering.</p>
        </div>
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
    const root = shell();
    root.innerHTML = layout();
    bind();
  }

  function openSection(name, options = {}){
    activeDomain = normalizeDomain(name || activeDomain);
    activePath = options.path ? String(options.path).split('/').filter(Boolean) : [];
    drillPath = activePath.slice(0, Math.max(0, activePath.length - 1));
    selectedEntry = null;
    activeFilterField = '';
    activeFilterValue = '';
    activeTab = (tabTemplates[activeDomain] || tabTemplates.handbook)[0];
    render();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function openEntry(entry){
    selectedEntry = typeof entry === 'string' ? getBySlug(entry) : entry;
    if(!selectedEntry) return false;
    activeDomain = selectedEntry.domain;
    activePath = selectedEntry.categoryPath.slice();
    drillPath = selectedEntry.categoryPath.slice(0, -1);
    activeTab = (selectedEntry.tabs || tabTemplates[activeDomain] || tabTemplates.handbook)[0];
    render();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function openEntryBySlug(slugValue){
    const entry = getBySlug(slugValue) || getByRoute(slugValue);
    return entry ? openEntry(entry) : false;
  }

  function bind(){
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

  function workspaceEntries(){
    const base = typeof originalWorkspaceEntries === 'function' ? originalWorkspaceEntries() : [];
    const universal = allEntries().map(entry => Object.assign({}, entry, {
      section:entry.workspaceSection,
      type:titleCase(entry.domain),
      metadata:Object.assign({}, entry.metadata, { universalEntry:true, universalDomain:entry.domain }),
      categoryPath:entry.categoryPath,
      searchTerms:entry.searchTerms
    }));
    const seen = new Set();
    return base.concat(universal).filter(entry => {
      const key = `${entry.section || entry.workspaceSection}:${entry.id || entry.slug || entry.title}:${entry.sourcePath || ''}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function publish(){
    originalWorkspaceEntries = originalWorkspaceEntries || window.AsteriaWorkspace?.entries;
    originalWorkspaceOpenSection = originalWorkspaceOpenSection || window.AsteriaWorkspace?.openSection || window.openCompendiumSection || window.openSection;
    originalOpenEntryBySlug = originalOpenEntryBySlug || window.AsteriaWorkspace?.openEntryBySlug || window.openWorkspaceEntry;

    const api = {
      version:'asteria-phase-2-content-database-expansion',
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
      normalizeEntry,
      tabsFor:domain => tabTemplates[normalizeDomain(domain)] || tabTemplates.handbook,
      domains:() => Object.assign({}, domainLabels),
      databases:() => Object.assign({}, databaseRegistry),
      filterFields:domain => filterKeysForDomain(domain),
      invalidate(){ cachedEntries = null; return allEntries(); }
    };

    function routedOpenSection(name, options){
      if(UNIVERSAL_ROUTE_SECTIONS.has(name) || options?.universalCompendium) return openSection(name, options || {});
      return originalWorkspaceOpenSection?.(name, options);
    }
    function routedOpenEntryBySlug(slugValue){
      return originalOpenEntryBySlug?.(slugValue) || openEntryBySlug(slugValue);
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
      openUniversalEntry:openEntryBySlug
    });
  }

  function boot(){
    publish();
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
