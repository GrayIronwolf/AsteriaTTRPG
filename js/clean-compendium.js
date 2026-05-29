(function(){
  'use strict';

  const itemClasses = ['Common','Uncommon','Unusual','Rare','Epic','Mythic','Legendary','Relic'];
  const raceCategories = [
    'Beastkin',
    'Celestial',
    'Demonic',
    'Dragon',
    'Fae',
    'Humanoid',
    'Hybrid',
    'Shadowborn / Dark Races',
    'Spirit Races',
    'Undead',
    'Titan-Class / Extra Large Humanoid',
    'Demi-Races'
  ];
  const sizes = ['Small','Medium','Large','Extra Large','Titan-Class'];
  const publicSections = ['Asteria Handbook','World, Realms & Planes','Races','Classes','Items','Magic','Creatures','Factions'];
  const relationshipMetadataKeys = [
    'source_items',
    'sourceItems',
    'related_items',
    'relatedItems',
    'crafting_uses',
    'craftingUses',
    'alchemy_uses',
    'alchemyUses',
    'culinary_uses',
    'culinaryUses',
    'recipes',
    'recipe_links',
    'recipeLinks',
    'ingredients',
    'materials',
    'outputs',
    'requires',
    'upgrades_from',
    'upgradesFrom',
    'upgrades_to',
    'upgradesTo'
  ];
  const sectionViews = {
    handbookHub: 'Asteria Handbook',
    worldHub: 'World, Realms & Planes',
    racesHub: 'Races',
    classesHub: 'Classes',
    itemsHub: 'Items',
    magicHub: 'Magic',
    creaturesHub: 'Creatures',
    factionsHub: 'Factions'
  };
  const sectionIntros = {
    'Asteria Handbook': 'Rules, systems, skills, talents, professions, and table references as workspace notes.',
    'World, Realms & Planes': 'Lore, realms, planes, timelines, pantheons, kingdoms, and locations as workspace entries.',
    Races: 'Lineages and creature peoples with playable status stored as metadata, not navigation.',
    Classes: 'Class pages, talents, trees, pathways, roles, and progression references.',
    Items: 'Items, flora, minerals, materials, equipment, crafting resources, and magic objects.',
    Magic: 'Spells, enchantments, elements, runes, soul stones, and magic system notes.',
    Creatures: 'Creature records are reserved for the same workspace structure when the bestiary data is promoted.',
    Factions: 'Faction records are reserved for the same workspace structure when organisation data is promoted.'
  };
  const workspaceTabs = {
    'Asteria Handbook': ['Rule Sheet','Systems','Tables','Sources'],
    'World, Realms & Planes': ['Lore Sheet','Regions','Timeline','Images'],
    Races: ['Race Sheet','Racial Traits','Lore','Images'],
    Classes: ['Class Sheet','Talent Tree','Lore','Images'],
    Items: [],
    Magic: ['Magic Sheet','Effects','Lore','Sources'],
    Creatures: ['Creature Sheet','Abilities','Lore','Images'],
    Factions: ['Faction Sheet','Relationships','Lore','Images']
  };
  const authWorkspaceModes = [
    { id:'dashboard', label:'Dashboard', title:'User Workspace Dashboard', intro:'Your account workspace for campaigns, characters, notifications, and active party tools.' },
    { id:'campaigns', label:'Campaigns', title:'Campaign Workspace', intro:'Campaign cards, GM permissions for campaigns you created, invite links, and character linking.' },
    { id:'characters', label:'Characters', title:'Character Workspace', intro:'Characters owned by this account, ready to link into campaigns.' },
    { id:'createCampaign', label:'Create Campaign', title:'Create Campaign', intro:'Create a campaign and automatically become GM for that campaign.' },
    { id:'createCharacter', label:'Character Forge', title:'Character Forge', intro:'Forge a character under the signed-in account.' },
    { id:'settings', label:'Settings', title:'Account Settings', intro:'Account state, Firebase sync status, and dashboard preferences.' }
  ];
  const authWorkspaceTabs = {
    dashboard: ['Overview','Campaigns','Characters','Activity'],
    campaigns: ['Campaigns','Invite Links','Linked Characters','Activity'],
    characters: ['Characters','Character Forge','Link Existing','Activity'],
    createCampaign: ['Campaign Form','Invite Link','GM Role','Activity'],
    createCharacter: ['Forge Flow','Starting Sheet','Inventory','Activity'],
    settings: ['Account','Sync','Theme','Activity']
  };

  const trees = {
    'Asteria Handbook': {
      label: 'Handbook Categories',
      children: [
        leaf('Core Rules', { section:'Asteria Handbook', path:'Core Rules', type:'Handbook' }),
        leaf('Systems', { section:'Asteria Handbook', path:'System' }),
        leaf('Skills', { section:'Asteria Handbook', path:'Skill' }),
        leaf('Talents', { section:'Asteria Handbook', path:'Talent' }),
        leaf('Professions', { section:'Asteria Handbook', path:'Profession' })
      ]
    },
    'World, Realms & Planes': {
      label: 'World Categories',
      children: [
        leaf('Worlds & Planes', { section:'World, Realms & Planes', path:'World' }),
        leaf('Continents', { section:'World, Realms & Planes', path:'Continent' }),
        leaf('Shattered Zones', { section:'World, Realms & Planes', path:'Shattered' }),
        leaf('Pantheons', { section:'World, Realms & Planes', path:'Pantheon' }),
        leaf('Kingdoms', { section:'World, Realms & Planes', path:'Kingdom' }),
        leaf('Timeline', { section:'World, Realms & Planes', path:'Timeline' })
      ]
    },
    Races: {
      label: 'Race Categories',
      children: raceCategories.map(category => leaf(category, { section:'Races', raceCategory:category }))
    },
    Classes: {
      label: 'Class Categories',
      children: [
        leaf('Class Pages', { section:'Classes', type:'Class' }),
        leaf('Class Talents', { section:'Classes', path:'Class Talent' }),
        leaf('Talent Trees', { section:'Classes', path:'Talent Tree' }),
        leaf('Pathways', { section:'Classes', path:'Pathway' })
      ]
    },
    Items: {
      label: 'Item Categories',
      children: [
        leaf('Armour & Protection', { section:'Items', path:'Armour' }),
        leaf('Consumables', { section:'Items', path:'Consumable' }),
        leaf('Containers', { section:'Items', path:'Container' }),
        leaf('Jewelry', { section:'Items', path:'Jewelry' }),
        branch('Resources & Materials', [
          leaf('Animal Parts', { section:'Items', path:'Animal Parts' }),
          leaf('Beast Parts', { section:'Items', path:'Beast Parts' }),
          leaf('Cloths & Fibre', { section:'Items', path:'Cloths' }),
          leaf('Gems, Stone & Cores', { section:'Items', path:'Gems' }),
          leaf('Herbalist & Plants', { section:'Items', path:'Plants' }),
          leaf('Leather Work', { section:'Items', path:'Leather' }),
          branch('Metal', [
            leaf('Metal Ores', { section:'Items', type:'Ore' }),
            leaf('Metal Ingots', { section:'Items', type:'Ingot' })
          ]),
          leaf('Monster Parts', { section:'Items', path:'Monster Parts' })
        ]),
        leaf('Tools & Equipment', { section:'Items', path:'Tools' }),
        leaf('Weapons & Ammunition', { section:'Items', type:'Weapon', aliases:['Weapon & Ammunition'] }),
        leaf('Magic Items', { section:'Items', path:'Magic Items' })
      ]
    },
    Magic: {
      label: 'Magic Categories',
      children: [
        leaf('Spells', { section:'Magic', path:'Spell' }),
        leaf('Enchantments', { section:'Magic', path:'Enchantment' }),
        leaf('Elements', { section:'Magic', path:'Element' }),
        leaf('Soul Stones', { section:'Magic', path:'Soul Stone' }),
        leaf('Runes', { section:'Magic', path:'Rune' }),
        leaf('Magic Systems', { section:'Magic', type:'Magic' })
      ]
    },
    Creatures: {
      label: 'Creature Categories',
      children: [
        leaf('Animals', { section:'Creatures', path:'Animal' }),
        leaf('Beasts', { section:'Creatures', path:'Beast' }),
        leaf('Monsters', { section:'Creatures', path:'Monster' }),
        leaf('Constructs', { section:'Creatures', path:'Construct' }),
        leaf('Summons', { section:'Creatures', path:'Summon' })
      ]
    },
    Factions: {
      label: 'Faction Categories',
      children: [
        leaf('Organisations', { section:'Factions', path:'Organisation' }),
        leaf('Guilds', { section:'Factions', path:'Guild' }),
        leaf('Kingdoms', { section:'Factions', path:'Kingdom' }),
        leaf('Religious Orders', { section:'Factions', path:'Religious' }),
        leaf('NPC Networks', { section:'Factions', path:'NPC' })
      ]
    }
  };

  let entries = [];
  let currentSection = 'Items';
  let stack = [];
  let active = null;
  let selectedEntry = null;
  let activeWorkspaceTab = '';
  let currentDashboardMode = 'dashboard';
  let legacyOpenRuleCategory = null;
  let legacyOpenRulePage = null;

  function leaf(label, query = {}) {
    return { label, leaf:true, query };
  }

  function branch(label, children) {
    return { label, children };
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function textOf(element) {
    return (element && element.textContent || '').trim();
  }

  function lower(value) {
    return String(value || '').toLowerCase();
  }

  function isDeprecatedLooseResourcePath(value) {
    const normalized = lower(value).replace(/\\/g, '/').replace(/&/g, 'and');
    return [
      'content/items/resources and materials/ores/',
      'content/items/resources and materials/ingots/',
      'content/items/resources and materials/metal ores/',
      'content/items/resources and materials/metal ingots/'
    ].some(fragment => normalized.includes(fragment));
  }

  function isDeprecatedLooseResourceEntry(entry) {
    return entry && entry.section === 'Items' && isDeprecatedLooseResourcePath(entry.sourcePath || entry.source || '');
  }

  function isCollectionIndexPath(value) {
    const normalized = lower(value).replace(/\\/g, '/');
    return /(^|\/)(flora|minerals|materials)\/index\.md$/.test(normalized);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"]/g, character => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;'
    }[character]));
  }

  function slugify(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'page';
  }

  function normalizeKey(value) {
    return slugify(value).replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
  }

  function root() {
    return document.querySelector('main.main') || document.querySelector('main') || document.body;
  }

  function parseScalar(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (trimmed === '[]') return [];
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^\[.*\]$/.test(trimmed)) {
      const inner = trimmed.slice(1, -1).trim();
      return inner ? inner.split(',').map(part => parseScalar(part)) : [];
    }
    return trimmed.replace(/^["']|["']$/g, '');
  }

  function parseFrontmatter(markdown) {
    const match = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    const metadata = {};
    if (!match) return metadata;

    let currentKey = null;
    match[1].split(/\r?\n/).forEach(line => {
      if (!line.trim()) return;
      const listItem = line.match(/^\s*-\s+(.*)$/);
      if (listItem && currentKey) {
        if (!Array.isArray(metadata[currentKey])) metadata[currentKey] = [];
        metadata[currentKey].push(parseScalar(listItem[1]));
        return;
      }
      const pair = line.match(/^([A-Za-z0-9_ -]+):(?:\s*(.*))?$/);
      if (!pair) return;
      const key = normalizeKey(pair[1]);
      metadata[key] = parseScalar(pair[2] || '');
      currentKey = String(pair[2] || '').trim() === '' ? key : null;
    });

    return metadata;
  }

  function stripFrontmatter(markdown) {
    return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  }

  function arrayValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
  }

  function sectionFromCategory(category, metadata = {}) {
    const source = lower([category, metadata.type, metadata.category].join(' '));
    if (source.includes('race')) return 'Races';
    if (source.includes('class') || source.includes('talent tree') || source.includes('pathway')) return 'Classes';
    if (source.includes('item') || source.includes('weapon') || source.includes('armour') || source.includes('armor') || source.includes('material') || source.includes('mineral') || source.includes('ore') || source.includes('ingot') || source.includes('consumable')) return 'Items';
    if (source.includes('spell') || source.includes('magic') || source.includes('enchantment') || source.includes('soul stone') || source.includes('rune') || source.includes('element')) return 'Magic';
    if (source.includes('creature') || source.includes('beast') || source.includes('monster') || source.includes('animal') || source.includes('construct')) return 'Creatures';
    if (source.includes('faction') || source.includes('guild') || source.includes('organisation') || source.includes('organization') || source.includes('npc')) return 'Factions';
    if (source.includes('world') || source.includes('realm') || source.includes('plane') || source.includes('continent') || source.includes('kingdom') || source.includes('pantheon') || source.includes('timeline')) return 'World, Realms & Planes';
    return 'Asteria Handbook';
  }

  function titleFromPage(page, body) {
    const heading = String(body || '').match(/^#\s+(.+)$/m);
    return heading ? heading[1].trim() : (page.title || 'Untitled');
  }

  function descriptionFromBody(body) {
    const cleaned = stripFrontmatter(body)
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('|') && !/^---+$/.test(line))
      .join(' ');
    return cleaned.slice(0, 230) || 'Compendium page.';
  }

  function sectionListItems(body, headingPattern) {
    const values = [];
    let activeSection = false;
    String(body || '').split(/\r?\n/).forEach(line => {
      if (/^##\s+/.test(line)) {
        activeSection = headingPattern.test(line);
        return;
      }
      if (!activeSection) return;
      const item = line.match(/^[-*]\s+(.+)$/);
      if (item) values.push(item[1].trim());
    });
    return values.slice(0, 4);
  }

  function pageToEntry(page) {
    const metadata = parseFrontmatter(page.content || '');
    const section = sectionFromCategory(page.category || '', metadata);
    const categoryPath = String(page.category || '').split('/').filter(Boolean);
    const type = metadata.type || (section === 'Items' ? 'Item' : section.replace(/s$/, ''));
    const itemClass = metadata.itemClass || metadata.item_class || metadata.rarity || '';
    const raceCategory = metadata.raceCategory || metadata.racecategory || (section === 'Races' ? 'Humanoid' : '');
    const playable = metadata.playable === true || lower(metadata.availability) === 'playable';
    const availability = section === 'Races' ? (playable ? 'playable' : 'non-playable') : '';
    const body = stripFrontmatter(page.content || '');

    return {
      id: page.slug || slugify(page.title),
      title: titleFromPage(page, body),
      section,
      type,
      categoryPath,
      category: categoryPath[categoryPath.length - 1] || section,
      rarity: itemClass || (section === 'Items' ? 'Common' : ''),
      rarityRank: Math.max(0, itemClasses.findIndex(item => lower(item) === lower(itemClass))),
      description: descriptionFromBody(page.content || ''),
      sourcePath: page.source ? `content/${page.source}` : '',
      tags: arrayValue(metadata.tags),
      metadata,
      playable,
      availability,
      raceCategory,
      size: metadata.size || (section === 'Races' ? 'Unknown' : ''),
      affinity: arrayValue(metadata.affinity || metadata.affinities),
      traits: section === 'Races' ? sectionListItems(body, /^##\s+(Racial\s+)?Traits/i) : [],
      marketValue: metadata.marketValue || metadata.market_value || '',
      damage: metadata.damage || '',
      content: page.content || '',
      searchTerms: lower([page.title, page.category, page.content, JSON.stringify(metadata)].join(' '))
    };
  }

  function loadFromManifest() {
    const pages = window.ASTERIA_CONTENT?.pages || [];
    return pages
      .filter(page => !isDeprecatedLooseResourcePath(page?.source || ''))
      .filter(page => !isCollectionIndexPath(page?.source || ''))
      .filter(page => page && page.content && publicSections.includes(sectionFromCategory(page.category, parseFrontmatter(page.content))))
      .map(pageToEntry)
      .filter(entry => !isDeprecatedLooseResourceEntry(entry));
  }

  function allWikiIndexes() {
    const indexes = { ...(window.ASTERIA_WIKI_INDEXES || {}) };
    if (window.ASTERIA_FLORA_INDEX && !indexes.flora) indexes.flora = window.ASTERIA_FLORA_INDEX;
    return indexes;
  }

  function wikiItemToEntry(index, item) {
    const collectionId = item.collection || index.id;
    const collectionTitle = index.title || collectionId;
    const placement = itemPlacement(index, item);
    const wikiCategory = placement.category;
    const itemClass = item.item_class || '';

    return {
      id: `wiki-${collectionId}-${item.slug || slugify(item.title)}`,
      title: item.title,
      section: 'Items',
      type: placement.type,
      categoryPath: placement.categoryPath,
      category: placement.category,
      rarity: itemClass || 'Common',
      rarityRank: Math.max(0, Number(item.rarityOrder || 1) - 1),
      description: descriptionFromBody(item.body || ''),
      sourcePath: item.contentPath || '',
      tags: arrayValue(item.tags),
      metadata: item.metadata || {},
      playable: false,
      availability: '',
      raceCategory: '',
      size: '',
      affinity: arrayValue(item.affinities),
      traits: [],
      marketValue: item.market_value || item.metadata?.market_value || '',
      damage: item.metadata?.damage || '',
      content: item.body || '',
      imagePath: item.imagePath || '',
      wikiCollection: collectionId,
      wikiCollectionTitle: collectionTitle,
      wikiCategory,
      wikiRoute: item.route || '',
      searchTerms: lower([item.title, collectionTitle, item.category, item.categoryLabel, item.item_class, item.body, JSON.stringify(item.metadata || {})].join(' '))
    };
  }

  function itemPlacement(index, item) {
    const collectionId = lower(item.collection || index.id);
    const categorySlug = lower(item.categorySlug || item.category || item.categoryLabel);
    const categoryName = lower(item.category || item.categoryLabel || item.metadata?.category);
    const title = lower(item.title);
    const metadata = item.metadata || {};
    const text = lower([
      item.title,
      item.category,
      item.categoryLabel,
      categorySlug,
      metadata.category,
      metadata.subcategory,
      metadata.material_family,
      arrayValue(item.tags).join(' '),
      arrayValue(metadata.tags).join(' ')
    ].join(' '));

    if (collectionId === 'minerals' && (categorySlug === 'ores' || categoryName === 'ore' || title.includes(' ore'))) {
      return { type:'Ore', category:'Metal Ores', categoryPath:['Items','Resources & Materials','Metal','Metal Ores'] };
    }
    if (collectionId === 'materials' && (title.includes('ingot') || categoryName === 'ingot' || text.includes(' ingot'))) {
      return { type:'Ingot', category:'Metal Ingots', categoryPath:['Items','Resources & Materials','Metal','Metal Ingots'] };
    }
    if (collectionId === 'materials' && (categorySlug === 'metals' || text.includes('metal'))) {
      return { type:'Material', category:'Metal', categoryPath:['Items','Resources & Materials','Metal'] };
    }
    if (collectionId === 'flora') {
      return { type:item.category || index.singular || 'Flora Item', category:'Herbalist & Plants', categoryPath:['Items','Resources & Materials','Herbalist & Plants'] };
    }
    if (collectionId === 'minerals') {
      return { type:item.category || index.singular || 'Mineral', category:'Gems, Stone & Cores', categoryPath:['Items','Resources & Materials','Gems, Stone & Cores'] };
    }
    if (collectionId === 'materials' && (categorySlug === 'fibres' || categorySlug === 'woods')) {
      return { type:item.category || index.singular || 'Material', category:'Cloths & Fibre', categoryPath:['Items','Resources & Materials','Cloths & Fibre'] };
    }
    if (collectionId === 'materials' && categorySlug === 'leathers') {
      return { type:item.category || index.singular || 'Material', category:'Leather Work', categoryPath:['Items','Resources & Materials','Leather Work'] };
    }
    return { type:index.singular || item.category || 'Item', category:item.categoryLabel || item.category || 'Resources & Materials', categoryPath:['Items','Resources & Materials'] };
  }

  function loadFromWikiIndexes() {
    return Object.values(allWikiIndexes()).flatMap(index =>
      (index.items || []).map(item => wikiItemToEntry(index, item))
    );
  }

  function entryMergeKey(entry) {
    if (entry.section === 'Items') return `${entry.section}:${slugify(entry.title)}:${itemMergeType(entry)}`;
    return entry.id || `${entry.section}:${entry.title}:${entry.sourcePath}`;
  }

  function itemMergeType(entry) {
    const text = lower([
      entry.type,
      entry.category,
      (entry.categoryPath || []).join(' '),
      entry.title,
      entry.sourcePath,
      JSON.stringify(entry.metadata || {})
    ].join(' '));
    if (/\bore\b|ores/.test(text)) return 'ore';
    if (/\bingot\b|ingots/.test(text)) return 'ingot';
    return slugify(entry.type || entry.category || 'item');
  }

  function mergeEntries(baseEntries, wikiEntries) {
    const seen = new Set();
    return [...wikiEntries, ...baseEntries].filter(entry => {
      const key = entryMergeKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function load() {
    entries = loadFromManifest();
    try {
      const response = await fetch('data/compendium-index-clean.json', { cache:'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.entries)) entries = data.entries.filter(entry => !isDeprecatedLooseResourceEntry(entry));
      }
    } catch(error) {
      console.warn('Asteria compendium JSON failed; using content manifest fallback.', error);
    }
    entries = mergeEntries(entries, loadFromWikiIndexes()).filter(entry => !isDeprecatedLooseResourceEntry(entry));
  }

  function hideOldViews() {
    const view = workspaceView();
    if (view && typeof window.setView === 'function') {
      window.setView('workspace');
      qsa('main .view').forEach(element => element.classList.toggle('show', element.id === 'workspace'));
    } else {
      qsa('main .view').forEach(element => element.classList.add('clean-hidden'));
    }
    document.body.classList.add('workspace-active', 'compendium-active');
  }

  function showHome() {
    if (!window.__asteriaRoutingHome && window.AsteriaRouter?.home) {
      return window.AsteriaRouter.home();
    }
    byId('asteria-workspace-shell')?.remove();
    byId('clean-compendium-shell')?.remove();
    byId('workspace')?.classList.remove('show');
    qsa('.clean-hidden,.compendium-hidden,.is-compendium-hidden').forEach(element => {
      element.classList.remove('clean-hidden', 'compendium-hidden', 'is-compendium-hidden');
    });
    qsa('main .view').forEach(element => element.classList.toggle('show', element.id === 'home'));
    document.body.classList.remove('workspace-active', 'compendium-active');
  }

  function workspaceView() {
    let view = byId('workspace');
    if (view) return view;
    view = document.createElement('section');
    view.id = 'workspace';
    view.className = 'view workspace-view';
    view.setAttribute('aria-label', 'Asteria Workspace');
    root().appendChild(view);
    return view;
  }

  function shell() {
    let element = byId('asteria-workspace-shell') || byId('clean-compendium-shell');
    if (element) return element;

    element = document.createElement('section');
    element.id = 'asteria-workspace-shell';
    element.className = 'asteria-workspace-shell clean-compendium-shell';
    element.dataset.version = 'ASTERIA FRAMEWORK v3';
    element.innerHTML = `
      <section class="clean-header workspace-header">
        <div class="clean-title-block">
          <div class="eyebrow">Asteria Workspace</div>
          <h1 id="clean-title">Items</h1>
          <p id="clean-intro">Browse Asteria through one persistent RPG workspace.</p>
        </div>
        <div id="clean-filters" class="clean-filters workspace-filter-area"></div>
      </section>
      <nav id="workspace-tabs" class="workspace-tabs clean-tabs" aria-label="Workspace sections"></nav>
      <section class="clean-body workspace-body">
        <aside class="clean-nav workspace-category-panel">
          <div class="clean-nav-head">
            <h3 id="clean-nav-title">Categories</h3>
            <button class="clean-back" type="button">Clear</button>
          </div>
          <div class="clean-breadcrumb"></div>
          <div class="clean-buttons"></div>
        </aside>
        <section class="clean-display workspace-display-window">
          <div class="clean-status">
            <span id="clean-status">All entries</span>
            <span id="clean-count"></span>
          </div>
          <div id="clean-grid" class="clean-grid"></div>
        </section>
      </section>
    `;
    workspaceView().replaceChildren(element);
    return element;
  }

  function sectionEntries(section = currentSection) {
    return entries.filter(entry => entry.section === section);
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  }

  function optionList(values, selected, firstLabel) {
    return `<option value="">${escapeHtml(firstLabel)}</option>` + values.map(value =>
      `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(value)}</option>`
    ).join('');
  }

  function renderFilters() {
    const box = shell().querySelector('#clean-filters');
    const sectionData = sectionEntries();

    if (currentSection === 'Races') {
      box.innerHTML = `
        <label>Search<input id="clean-search" placeholder="Search races, traits, affinity..."></label>
        <label>Playable Status<select id="clean-availability">${optionList(['Playable','Non-Playable'], '', 'All')}</select></label>
        <label>Race Type<select id="clean-race-type">${optionList(raceCategories, '', 'All')}</select></label>
        <label>Size<select id="clean-size">${optionList(sizes, '', 'All')}</select></label>
        <label>Sort<select id="clean-sort"><option value="name">Sort: Name</option><option value="type">Sort: Type</option><option value="size">Sort: Size</option></select></label>
      `;
    } else if (currentSection === 'Items') {
      box.innerHTML = `
        <label>Search<input id="clean-search" placeholder="Search items, tags, materials..."></label>
        <label>Item Class<select id="clean-rarity">${optionList(itemClasses, '', 'All Classes')}</select></label>
        <label>Type<select id="clean-type">${optionList(unique(sectionData.map(entry => entry.type)), '', 'All Types')}</select></label>
        <label>Category<select id="clean-category">${optionList(unique(sectionData.map(entry => entry.wikiCategory || entry.category)), '', 'All Categories')}</select></label>
        <label>Sort<select id="clean-sort"><option value="rarity">Sort: Rarity</option><option value="name">Sort: Name</option><option value="type">Sort: Type</option></select></label>
      `;
    } else {
      box.innerHTML = `
        <label>Search<input id="clean-search" placeholder="Search ${escapeHtml(currentSection.toLowerCase())}..."></label>
        <label>Type<select id="clean-type">${optionList(unique(sectionData.map(entry => entry.type)), '', 'All Types')}</select></label>
        <label>Category<select id="clean-category">${optionList(unique(sectionData.map(entry => entry.category)), '', 'All Categories')}</select></label>
        <label>Sort<select id="clean-sort"><option value="name">Sort: Name</option><option value="type">Sort: Type</option><option value="category">Sort: Category</option></select></label>
      `;
    }

    qsa('input,select', box).forEach(control => {
      control.addEventListener('input', render);
      control.addEventListener('change', render);
    });
  }

  function viewForSection(section) {
    const match = Object.entries(sectionViews).find(([, value]) => value === section);
    return match ? match[0] : '';
  }

  function tabsForSection(section = currentSection) {
    return workspaceTabs[section] || ['Sheet','Lore','Images','Sources'];
  }

  function firstTab(section = currentSection) {
    return tabsForSection(section)[0] || 'Item Page';
  }

  function ensureActiveTab(section = currentSection) {
    const tabs = tabsForSection(section);
    if (!tabs.length) {
      activeWorkspaceTab = firstTab(section);
      return;
    }
    if (!tabs.includes(activeWorkspaceTab)) activeWorkspaceTab = tabs[0];
  }

  function renderTabs() {
    const tabs = shell().querySelector('#workspace-tabs');
    if (!tabs) return;
    ensureActiveTab();
    const sectionTabs = tabsForSection();
    tabs.classList.toggle('is-empty', !sectionTabs.length);
    if (!sectionTabs.length) {
      tabs.innerHTML = '';
      return;
    }
    tabs.innerHTML = sectionTabs.map(tab => `
      <button type="button" class="${tab === activeWorkspaceTab ? 'active' : ''}" data-workspace-tab="${escapeHtml(tab)}">
        ${escapeHtml(tab)}
      </button>
    `).join('');
    qsa('button', tabs).forEach(button => {
      button.onclick = () => {
        activeWorkspaceTab = button.dataset.workspaceTab || firstTab();
        renderTabs();
        if (selectedEntry) openPage(selectedEntry, activeWorkspaceTab);
        else render();
      };
    });
  }

  function syncGlobalNavState() {
    const activeView = viewForSection(currentSection);
    qsa('[data-view]').forEach(link => {
      const match = link.dataset.workspaceSection === currentSection || link.dataset.view === activeView;
      link.classList.toggle('active', Boolean(match));
    });
  }

  function renderNav() {
    const element = shell();
    const node = stack[stack.length - 1];
    const back = element.querySelector('.clean-back');
    const buttons = element.querySelector('.clean-buttons');

    element.querySelector('#clean-title').textContent = currentSection;
    element.querySelector('#clean-intro').textContent = sectionIntros[currentSection] || `Browse ${currentSection.toLowerCase()} with shared categories, filters, cards, and full page viewing.`;
    element.querySelector('#clean-nav-title').textContent = node.label || 'Categories';
    element.querySelector('.clean-breadcrumb').textContent = stack.map(item => item.label).join(' / ');

    back.disabled = !active && stack.length <= 1;
    back.textContent = stack.length > 1 ? 'Back' : 'Clear';
    back.onclick = () => {
      if (active) active = null;
      else if (stack.length > 1) stack.pop();
      renderNav();
      render();
    };

    buttons.innerHTML = '';
    if (stack.length <= 1) {
      const allButton = document.createElement('button');
      allButton.type = 'button';
      allButton.className = `cat ${!active ? 'active' : ''}`;
      allButton.innerHTML = `<span class="clean-left"><span>All ${escapeHtml(currentSection)}</span></span>`;
      allButton.onclick = () => {
        active = null;
        selectedEntry = null;
        renderNav();
        render();
      };
      buttons.appendChild(allButton);
    }

    function appendNavNode(container, child, depth = 0) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cat ${active === child ? 'active' : ''}`;
      button.style.setProperty('--nav-depth', String(depth));
      if (child.children) {
        button.className = 'cat clean-drilldown-cat';
        button.innerHTML = `<span class="clean-left"><span>${escapeHtml(child.label)}</span></span><span class="clean-chevron">&rsaquo;</span>`;
        button.onclick = () => {
          stack.push(child);
          active = null;
          selectedEntry = null;
          renderNav();
          render();
        };
        container.appendChild(button);
        return;
      }

      button.innerHTML = `<span class="clean-left"><span>${escapeHtml(child.label)}</span></span>`;
      button.onclick = () => {
        active = child;
        selectedEntry = null;
        renderNav();
        render();
      };
      container.appendChild(button);
    }

    (node.children || []).forEach(child => appendNavNode(buttons, child));
  }

  function activeMatches(entry) {
    if (entry.section !== currentSection) return false;
    if (!active) {
      if (stack.length <= 1) return true;
      const haystack = lower([entry.title, entry.type, entry.category, (entry.categoryPath || []).join(' '), entry.searchTerms].join(' '));
      return stack.slice(1).every(node => haystack.includes(lower(node.label)));
    }

    const query = active.query || {};
    const haystack = lower([entry.title, entry.type, entry.category, (entry.categoryPath || []).join(' '), entry.searchTerms].join(' '));
    if (query.type && lower(entry.type) !== lower(query.type)) return false;
    if (query.raceCategory && lower(entry.raceCategory) !== lower(query.raceCategory)) return false;
    if (query.wikiCollection && lower(entry.wikiCollection) !== lower(query.wikiCollection)) return false;
    if (query.path && !haystack.includes(lower(query.path))) return false;
    return true;
  }

  function filterMatches(entry) {
    const query = lower(byId('clean-search')?.value || '');
    if (query && !lower([entry.title, entry.description, entry.type, entry.category, entry.raceCategory, entry.size, (entry.affinity || []).join(' '), (entry.traits || []).join(' '), entry.searchTerms].join(' ')).includes(query)) return false;

    if (currentSection === 'Races') {
      const availability = byId('clean-availability')?.value || '';
      const raceType = byId('clean-race-type')?.value || '';
      const size = byId('clean-size')?.value || '';
      if (availability && lower(entry.availability) !== lower(availability)) return false;
      if (raceType && lower(entry.raceCategory) !== lower(raceType)) return false;
      if (size && lower(entry.size) !== lower(size)) return false;
      return true;
    }

    if (currentSection === 'Items') {
      const rarity = byId('clean-rarity')?.value || '';
      const type = byId('clean-type')?.value || '';
      const category = byId('clean-category')?.value || '';
      if (rarity && lower(entry.rarity) !== lower(rarity)) return false;
      if (type && lower(entry.type) !== lower(type)) return false;
      if (category && lower(entry.wikiCategory || entry.category) !== lower(category)) return false;
      return true;
    }

    const type = byId('clean-type')?.value || '';
    const category = byId('clean-category')?.value || '';
    if (type && lower(entry.type) !== lower(type)) return false;
    if (category && lower(entry.category) !== lower(category)) return false;
    return true;
  }

  function sortEntries(a, b) {
    const sort = byId('clean-sort')?.value || (currentSection === 'Items' ? 'rarity' : 'name');
    if (sort === 'rarity') return (a.rarityRank || 0) - (b.rarityRank || 0) || String(a.title).localeCompare(String(b.title));
    if (sort === 'type') return String(a.type).localeCompare(String(b.type)) || String(a.title).localeCompare(String(b.title));
    if (sort === 'category') return String(a.category).localeCompare(String(b.category)) || String(a.title).localeCompare(String(b.title));
    if (sort === 'size') return String(a.size).localeCompare(String(b.size)) || String(a.title).localeCompare(String(b.title));
    return String(a.title).localeCompare(String(b.title));
  }

  function render() {
    selectedEntry = null;
    ensureActiveTab();
    const element = shell();
    const grid = element.querySelector('#clean-grid');
    const status = element.querySelector('#clean-status');
    const count = element.querySelector('#clean-count');
    grid.classList.toggle('clean-item-grid', currentSection === 'Items');
    if (stack.length > 1 && !active) {
      const node = stack[stack.length - 1];
      status.textContent = `${node.label} / Choose a category`;
      count.textContent = 'Category step';
      grid.innerHTML = `<div class="clean-empty"><h3>Choose a category</h3><p>Select one of the categories on the left to show its entries.</p></div>`;
      return;
    }
    const result = entries.filter(activeMatches).filter(filterMatches).sort(sortEntries);

    const statusSuffix = tabsForSection().length ? ` / ${activeWorkspaceTab}` : '';
    status.textContent = active ? `${active.label}${statusSuffix}` : `All ${currentSection}${statusSuffix}`;
    count.textContent = `${result.length} entries`;
    grid.innerHTML = indexTabContext(result.length);

    result.forEach(entry => grid.appendChild(card(entry)));
  }

  function indexTabContext(count) {
    const copy = {
      'Racial Traits': 'Trait-focused browsing keeps the same race cards and highlights trait previews where data exists.',
      'Talent Tree': 'Class talent and pathway data will surface here while keeping the same class card grid.',
      Crafting: 'Crafting mode keeps item cards in place and prioritises crafting metadata, uses, sources, and materials.',
      Sources: 'Source mode keeps entries in the same display and exposes origin, relationship, and collection metadata in notes.',
      Lore: 'Lore mode keeps cards in the same display and opens each note to lore-focused sections.',
      Images: 'Image mode keeps the same card index and opens media-focused entry views where images exist.',
      Effects: 'Effects mode keeps magic cards in the same display and opens effect-focused notes.',
      Tables: 'Table mode keeps handbook cards in the same display and opens table-capable markdown notes.',
      Regions: 'Region mode keeps world cards in the same display and opens regional note sections.',
      Timeline: 'Timeline mode keeps world cards in the same display and opens timeline sections.'
    };
    if (!count) return `<div class="clean-empty"><h3>No entries found</h3><p>No public pages match this category or filter yet.</p></div>`;
    if (!tabsForSection().length) return '';
    return activeWorkspaceTab === firstTab()
      ? ''
      : `<div class="workspace-tab-context"><b>${escapeHtml(activeWorkspaceTab)}</b><span>${escapeHtml(copy[activeWorkspaceTab] || 'This workspace tab changes how each entry opens while preserving one shared card and note system.')}</span></div>`;
  }

  function statusLabel(entry) {
    if (entry.section === 'Races') return entry.playable ? 'PLAYABLE' : 'NON-PLAYABLE';
    if (entry.section === 'Items') return entry.rarity || entry.type || 'Item';
    return entry.type || entry.category || entry.section;
  }

  function cardClass(entry) {
    if (entry.section === 'Races') return `clean-card clean-race-card clean-race-${entry.playable ? 'playable' : 'non-playable'}`;
    if (entry.section === 'Items') return `clean-card clean-item-card clean-rarity-${slugify(entry.rarity || 'common')}`;
    return `clean-card clean-generic-card clean-section-${slugify(entry.section)}`;
  }

  function chipList(values, className = 'clean-chip-row') {
    const list = arrayValue(values).slice(0, 5);
    return list.length ? `<div class="${className}">${list.map(value => `<em>${escapeHtml(value)}</em>`).join('')}</div>` : '';
  }

  function raceCardBody(entry) {
    return `
      <span class="clean-tag clean-race-status">${statusLabel(entry)}</span>
      <h3>${escapeHtml(entry.title)}</h3>
      <div class="clean-card-subtitle">${escapeHtml(entry.raceCategory || 'Unknown')} &bull; ${escapeHtml(entry.size || 'Unknown')}</div>
      <p>${escapeHtml(entry.description)}</p>
      ${chipList(entry.affinity, 'clean-affinity-row')}
      ${entry.traits && entry.traits.length ? `<div class="clean-traits"><b>Traits</b><ul>${entry.traits.slice(0, 3).map(trait => `<li>${escapeHtml(trait)}</li>`).join('')}</ul></div>` : ''}
    `;
  }

  function itemCardBody(entry) {
    const imageMarkup = entry.imagePath
      ? `<img src="${escapeHtml(entry.imagePath)}" alt="${escapeHtml(entry.title)}" onerror="this.closest('.clean-item-card-image')?.classList.add('is-missing'); this.remove();">`
      : `<span aria-hidden="true">${escapeHtml((entry.title || 'I').charAt(0))}</span>`;

    return `
      <span class="clean-tag clean-rarity-tag">${escapeHtml(statusLabel(entry))}</span>
      <div class="clean-item-card-image">${imageMarkup}</div>
      <div class="clean-item-card-content">
        <h3>${escapeHtml(entry.title)}</h3>
      </div>
    `;
  }

  function genericCardBody(entry) {
    return `
      <span class="clean-tag">${escapeHtml(statusLabel(entry))}</span>
      <h3>${escapeHtml(entry.title)}</h3>
      <div class="clean-card-subtitle">${escapeHtml(entry.category || currentSection)}</div>
      <p>${escapeHtml(entry.description)}</p>
      ${chipList(entry.tags)}
    `;
  }

  function card(entry) {
    const element = document.createElement('article');
    element.className = cardClass(entry);
    element.tabIndex = 0;
    element.innerHTML = entry.section === 'Races' ? raceCardBody(entry) : entry.section === 'Items' ? itemCardBody(entry) : genericCardBody(entry);
    element.onclick = () => {
      qsa('.clean-card', element.parentElement).forEach(cardElement => cardElement.classList.remove('selected'));
      element.classList.add('selected');
    };
    element.ondblclick = () => openPage(entry);
    element.onkeydown = event => {
      if (event.key === 'Enter') openPage(entry);
    };
    return element;
  }

  function authMode(mode = currentDashboardMode) {
    return authWorkspaceModes.find(item => item.id === mode) || authWorkspaceModes[0];
  }

  function authTabs(mode = currentDashboardMode) {
    return authWorkspaceTabs[mode] || authWorkspaceTabs.dashboard;
  }

  function authFirstTab(mode = currentDashboardMode) {
    return authTabs(mode)[0];
  }

  function sessionInfo() {
    return window.AsteriaAuthBridge?.getSession?.() || window.session || {};
  }

  function accountSignedIn() {
    const s = sessionInfo();
    return Boolean(s.uid || s.email || ['account', 'player', 'gm'].includes(s.role));
  }

  function accountKey() {
    const s = sessionInfo();
    return s.uid || s.account || s.user || 'firebase-user';
  }

  function ensureAccountRecord() {
    const key = accountKey();
    window.loadAccountState?.();
    window.accountUsers = window.accountUsers || {};
    window.accountUsers[key] = window.accountUsers[key] || { characters: [] };
    window.accountUsers[key].characters = Array.from(new Set(window.accountUsers[key].characters || []));
    return window.accountUsers[key];
  }

  function ownedCharacterIds() {
    const s = sessionInfo();
    const record = ensureAccountRecord();
    const ids = [
      ...(record.characters || []),
      ...arrayValue(s.profile?.characters),
      ...(s.character ? [s.character] : [])
    ];
    return Array.from(new Set(ids)).filter(id => window.chars?.[id]);
  }

  function ownedCharacters() {
    return ownedCharacterIds().map(id => Object.assign({ id }, window.chars[id]));
  }

  function randomToken(prefix = '') {
    const part = Math.random().toString(36).slice(2, 8);
    return `${prefix}${Date.now().toString(36)}-${part}`;
  }

  function inviteLink(campaign) {
    const base = String(window.location?.href || '').split('#')[0] || 'index.html';
    return campaign.inviteLink || `${base}#/join/${campaign.id}/${campaign.inviteCode || ''}`;
  }

  function campaignId(campaign, index = 0) {
    if (!campaign.id) campaign.id = `campaign-${index + 1}`;
    return campaign.id;
  }

  function campaignRole(campaign) {
    const uid = accountKey();
    const roles = campaign.roles || {};
    if (campaign.ownerUid === uid || roles[uid] === 'gm' || arrayValue(campaign.gmUids).includes(uid)) return 'GM';
    if (roles[uid] === 'player' || arrayValue(campaign.playerUids).includes(uid)) return 'Player';
    const owned = ownedCharacterIds();
    if (arrayValue(campaign.party).some(id => owned.includes(id))) return 'Player';
    return '';
  }

  function accountCampaigns() {
    return (window.campaigns || [])
      .map((campaign, index) => Object.assign(campaign, { id:campaignId(campaign, index) }))
      .filter(campaign => campaignRole(campaign));
  }

  function dashboardQuery() {
    return lower(byId('auth-workspace-search')?.value || '');
  }

  function requireAccountWorkspace() {
    if (accountSignedIn()) return true;
    window.setView?.('loginPage');
    window.toast?.('Please log in to open your workspace dashboard.');
    return false;
  }

  function renderAuthFilters() {
    const box = shell().querySelector('#clean-filters');
    if (!box) return;
    const labels = {
      dashboard:'Search dashboard...',
      campaigns:'Search campaigns...',
      characters:'Search characters...',
      createCampaign:'Campaign setup...',
      createCharacter:'Character setup...',
      settings:'Search settings...'
    };
    box.innerHTML = `
      <label>Search<input id="auth-workspace-search" placeholder="${escapeHtml(labels[currentDashboardMode] || 'Search workspace...')}"></label>
      <label>Workspace<select id="auth-workspace-mode-filter">${authWorkspaceModes.map(mode => `<option value="${escapeHtml(mode.id)}" ${mode.id === currentDashboardMode ? 'selected' : ''}>${escapeHtml(mode.label)}</option>`).join('')}</select></label>
      <label>Sort<select id="auth-workspace-sort"><option value="recent">Sort: Recent</option><option value="name">Sort: Name</option><option value="role">Sort: Role</option></select></label>
    `;
    byId('auth-workspace-search')?.addEventListener('input', renderAuthDisplay);
    byId('auth-workspace-mode-filter')?.addEventListener('change', event => openDashboard(event.target.value));
    byId('auth-workspace-sort')?.addEventListener('change', renderAuthDisplay);
  }

  function renderAuthTabs() {
    const tabs = shell().querySelector('#workspace-tabs');
    if (!tabs) return;
    if (!authTabs().includes(activeWorkspaceTab)) activeWorkspaceTab = authFirstTab();
    tabs.innerHTML = authTabs().map(tab => `
      <button type="button" class="${tab === activeWorkspaceTab ? 'active' : ''}" data-auth-workspace-tab="${escapeHtml(tab)}">
        ${escapeHtml(tab)}
      </button>
    `).join('');
    qsa('button', tabs).forEach(button => {
      button.onclick = () => {
        activeWorkspaceTab = button.dataset.authWorkspaceTab || authFirstTab();
        renderAuthTabs();
        renderAuthDisplay();
      };
    });
  }

  function renderAuthNav() {
    const element = shell();
    const buttons = element.querySelector('.clean-buttons');
    const config = authMode();
    element.querySelector('#clean-title').textContent = config.title;
    element.querySelector('#clean-intro').textContent = config.intro;
    element.querySelector('#clean-nav-title').textContent = 'Account Workspace';
    element.querySelector('.clean-breadcrumb').textContent = `Signed-in Workspace / ${config.label}`;
    const back = element.querySelector('.clean-back');
    back.disabled = false;
    back.textContent = 'Dashboard';
    back.onclick = () => openDashboard('dashboard');
    buttons.innerHTML = '';
    authWorkspaceModes.forEach(mode => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cat ${mode.id === currentDashboardMode ? 'active' : ''}`;
      button.innerHTML = `<span class="clean-left"><span>${escapeHtml(mode.label)}</span></span>`;
      button.onclick = () => openDashboard(mode.id);
      buttons.appendChild(button);
    });
  }

  function syncAuthNavState() {
    qsa('[data-view]').forEach(link => {
      const match = link.dataset.workspaceMode === currentDashboardMode;
      link.classList.toggle('active', Boolean(match));
    });
    qsa('[data-workspace-action]').forEach(link => {
      const action = link.dataset.workspaceAction;
      const match = (action === 'create-campaign' && currentDashboardMode === 'createCampaign') ||
        (action === 'create-character' && currentDashboardMode === 'createCharacter') ||
        (action === 'settings' && currentDashboardMode === 'settings');
      link.classList.toggle('active', match);
    });
  }

  function workspaceCard({ tag, title, subtitle, body, meta, action }) {
    const element = document.createElement('article');
    element.className = 'clean-card workspace-dashboard-card';
    element.tabIndex = 0;
    element.innerHTML = `
      <span class="clean-tag">${escapeHtml(tag || 'Workspace')}</span>
      <h3>${escapeHtml(title)}</h3>
      ${subtitle ? `<div class="clean-card-subtitle">${escapeHtml(subtitle)}</div>` : ''}
      <p>${escapeHtml(body || '')}</p>
      ${meta ? `<div class="clean-meta">${meta}</div>` : ''}
    `;
    element.onclick = () => {
      qsa('.clean-card', element.parentElement).forEach(cardElement => cardElement.classList.remove('selected'));
      element.classList.add('selected');
    };
    element.ondblclick = () => action?.();
    element.onkeydown = event => { if (event.key === 'Enter') action?.(); };
    return element;
  }

  function filterCards(list, textFn) {
    const query = dashboardQuery();
    if (!query) return list;
    return list.filter(item => lower(textFn(item)).includes(query));
  }

  function sortCards(list, nameFn, roleFn = null) {
    const sort = byId('auth-workspace-sort')?.value || 'recent';
    if (sort === 'name') return list.sort((a, b) => String(nameFn(a)).localeCompare(String(nameFn(b))));
    if (sort === 'role' && roleFn) return list.sort((a, b) => String(roleFn(a)).localeCompare(String(roleFn(b))) || String(nameFn(a)).localeCompare(String(nameFn(b))));
    return list;
  }

  function renderOverviewCards(grid) {
    const campaigns = accountCampaigns();
    const characters = ownedCharacters();
    const activePartyCount = campaigns.reduce((total, campaign) => total + arrayValue(campaign.party).length, 0);
    const cards = [
      { tag:'Campaigns', title:'Current Campaigns', subtitle:`${campaigns.length} linked`, body:'Campaigns you created or joined with this account.', action:() => openDashboard('campaigns') },
      { tag:'Characters', title:'Available Characters', subtitle:`${characters.length} owned`, body:'Characters attached to this Firebase account.', action:() => openDashboard('characters') },
      { tag:'Notifications', title:'Notifications', subtitle:'Placeholder', body:'Campaign invites, GM messages, session alerts, and character approvals will appear here.', action:() => renderPlaceholderPage('Notifications', 'No notifications have been added yet.') },
      { tag:'Party', title:'Active Party', subtitle:`${activePartyCount} linked`, body:'Active party roster, session presence, and party status tools will appear here later.', action:() => renderPlaceholderPage('Active Party', 'Active party tools will connect to campaign sessions later.') }
    ];
    filterCards(cards, card => [card.title, card.subtitle, card.body].join(' ')).forEach(cardData => grid.appendChild(workspaceCard(cardData)));
  }

  function renderCampaignCards(grid) {
    const list = sortCards(filterCards(accountCampaigns(), campaign => [campaign.name, campaignRole(campaign), campaign.description].join(' ')), campaign => campaign.name || campaign.id, campaignRole);
    if (!list.length) {
      grid.innerHTML += `<div class="clean-empty"><h3>No campaigns yet</h3><p>Create a campaign to become GM for that campaign, then share its invite link with players.</p></div>`;
      return;
    }
    list.forEach(campaign => {
      grid.appendChild(workspaceCard({
        tag:campaignRole(campaign),
        title:campaign.name || 'Untitled Campaign',
        subtitle:`Campaign ID: ${campaign.id}`,
        body:campaign.description || 'Campaign workspace with invite links and linked characters.',
        meta:`<b>Party:</b> ${arrayValue(campaign.party).length} characters<br><b>Invite:</b> ${escapeHtml(campaign.inviteCode || 'Not generated')}`,
        action:() => renderCampaignDetail(campaign)
      }));
    });
  }

  function renderCharacterCards(grid) {
    const list = sortCards(filterCards(ownedCharacters(), character => [character.name, character.race, character.klass, character.campaign].join(' ')), character => character.name || character.id);
    if (!list.length) {
      grid.innerHTML += `<div class="clean-empty"><h3>No characters yet</h3><p>Create a character here, then link it to a campaign.</p></div>`;
      return;
    }
    list.forEach(character => {
      grid.appendChild(workspaceCard({
        tag:'Character',
        title:character.name || 'Unnamed Character',
        subtitle:`${character.race || 'Unselected Race'} / ${character.klass || 'Unselected Class'}`,
        body:`Level ${character.level || 0}. ${character.campaign || 'Not linked to a campaign yet.'}`,
        meta:`<b>HP:</b> ${character.hp?.[0] ?? 10}/${character.hp?.[1] ?? 10}<br><b>SP:</b> ${character.sp?.[0] ?? 10}/${character.sp?.[1] ?? 10}<br><b>MP:</b> ${character.mp?.[0] ?? 10}/${character.mp?.[1] ?? 10}`,
        action:() => renderCharacterDetail(character)
      }));
    });
  }

  function renderCreateCampaignForm(grid) {
    grid.innerHTML += `
      <article class="clean-page workspace-viewer workspace-form-page" data-viewer="universal-workspace-viewer">
        <header class="clean-page-head"><span class="clean-tag">GM</span><div><p class="eyebrow">Campaign Creation</p><h2>Create Campaign</h2><p>Creating a campaign grants this account GM permissions for that campaign only.</p></div></header>
        <div class="workspace-form-grid">
          <label>Campaign Name<input id="workspaceCampaignName" placeholder="Campaign name"></label>
          <label>Party Size<input id="workspaceCampaignPartySize" type="number" min="1" max="12" value="4"></label>
          <label>Description<textarea id="workspaceCampaignDescription" placeholder="Short campaign premise"></textarea></label>
        </div>
        <button class="primary" id="workspaceCreateCampaignBtn" type="button">Create Campaign</button>
      </article>
    `;
    byId('workspaceCreateCampaignBtn')?.addEventListener('click', createWorkspaceCampaign);
  }

  function renderCreateCharacterForm(grid) {
    grid.innerHTML += `
      <article class="clean-page workspace-viewer workspace-form-page" data-viewer="universal-workspace-viewer">
        <header class="clean-page-head"><span class="clean-tag">Character</span><div><p class="eyebrow">Character Forge</p><h2>Character Forge</h2><p>Character Forge is the single official character creation workflow for Asteria.</p></div></header>
        <p class="muted">The old quick form has been retired so races, classes, skills, origins, and items all come from the compendium databases.</p>
        <button class="primary" id="workspaceOpenCharacterForgeBtn" type="button">Open Character Forge</button>
      </article>
    `;
    byId('workspaceOpenCharacterForgeBtn')?.addEventListener('click', () => {
      if (window.AsteriaGameplay?.openCharacterForge) window.AsteriaGameplay.openCharacterForge();
    });
  }

  function renderSettingsPanel(grid) {
    const s = sessionInfo();
    grid.innerHTML += `
      <article class="clean-page workspace-viewer" data-viewer="universal-workspace-viewer">
        <header class="clean-page-head"><span class="clean-tag">Account</span><div><p class="eyebrow">Firebase Account</p><h2>${escapeHtml(s.user || s.email || 'Signed-in Account')}</h2><p>One account can GM campaigns it creates and play characters in other campaigns.</p></div></header>
        <dl class="clean-page-meta">
          <div><dt>Account ID</dt><dd>${escapeHtml(s.uid || s.account || 'Not available')}</dd></div>
          <div><dt>Email</dt><dd>${escapeHtml(s.email || 'Not available')}</dd></div>
          <div><dt>Campaign Permissions</dt><dd>Assigned per campaign</dd></div>
          <div><dt>Characters</dt><dd>${ownedCharacters().length}</dd></div>
        </dl>
        <p class="muted">Theme controls remain in the Settings panel. Firebase sync status appears under Access when connected.</p>
      </article>
    `;
  }

  function renderPlaceholderPage(title, body) {
    const grid = byId('clean-grid');
    if (!grid) return;
    grid.innerHTML = `
      <article class="clean-page workspace-viewer" data-viewer="universal-workspace-viewer">
        <button class="clean-back clean-return" type="button" id="workspace-dashboard-return">Back to dashboard</button>
        <header class="clean-page-head"><span class="clean-tag">Placeholder</span><div><p class="eyebrow">Workspace</p><h2>${escapeHtml(title)}</h2></div></header>
        <p>${escapeHtml(body)}</p>
      </article>
    `;
    byId('workspace-dashboard-return').onclick = () => openDashboard('dashboard');
  }

  function renderCampaignDetail(campaign) {
    const grid = byId('clean-grid');
    const characters = ownedCharacters();
    if (!grid) return;
    grid.innerHTML = `
      <article class="clean-page workspace-viewer" data-viewer="universal-workspace-viewer">
        <button class="clean-back clean-return" type="button" id="workspace-campaign-return">Back to campaigns</button>
        <header class="clean-page-head"><span class="clean-tag">${escapeHtml(campaignRole(campaign))}</span><div><p class="eyebrow">Campaign Workspace</p><h2>${escapeHtml(campaign.name || 'Untitled Campaign')}</h2><p>${escapeHtml(campaign.description || 'Campaign workspace.')}</p></div></header>
        <dl class="clean-page-meta">
          <div><dt>Campaign ID</dt><dd>${escapeHtml(campaign.id)}</dd></div>
          <div><dt>Invite Code</dt><dd>${escapeHtml(campaign.inviteCode || 'Not generated')}</dd></div>
          <div><dt>Invite Link</dt><dd>${escapeHtml(inviteLink(campaign))}</dd></div>
          <div><dt>GM ID</dt><dd>${escapeHtml(campaign.gmId || campaign.ownerUid || 'Not set')}</dd></div>
          <div><dt>Party Characters</dt><dd>${arrayValue(campaign.party).length}</dd></div>
        </dl>
        <section class="workspace-link-panel">
          <h3>Link Existing Character</h3>
          <p class="muted">Players can link a character they own to this campaign. A full approval flow can be added later.</p>
          <label>Character<select id="workspaceLinkCharacter">${characters.map(character => `<option value="${escapeHtml(character.id)}">${escapeHtml(character.name || character.id)}</option>`).join('')}</select></label>
          <button class="primary" type="button" id="workspaceLinkCharacterBtn" ${characters.length ? '' : 'disabled'}>Link Character</button>
        </section>
      </article>
    `;
    byId('workspace-campaign-return').onclick = () => openDashboard('campaigns');
    byId('workspaceLinkCharacterBtn')?.addEventListener('click', () => linkCharacterToCampaign(campaign.id));
  }

  function renderCharacterDetail(character) {
    const grid = byId('clean-grid');
    if (!grid) return;
    grid.innerHTML = `
      <article class="clean-page workspace-viewer" data-viewer="universal-workspace-viewer">
        <button class="clean-back clean-return" type="button" id="workspace-character-return">Back to characters</button>
        <header class="clean-page-head"><span class="clean-tag">Character</span><div><p class="eyebrow">Character Workspace</p><h2>${escapeHtml(character.name || 'Unnamed Character')}</h2><p>${escapeHtml(character.race || 'Unselected Race')} / ${escapeHtml(character.klass || 'Unselected Class')}</p></div></header>
        <dl class="clean-page-meta">
          <div><dt>Level</dt><dd>${escapeHtml(character.level || 0)}</dd></div>
          <div><dt>Campaign</dt><dd>${escapeHtml(character.campaign || 'Unassigned')}</dd></div>
          <div><dt>HP</dt><dd>${escapeHtml(`${character.hp?.[0] ?? 10} / ${character.hp?.[1] ?? 10}`)}</dd></div>
          <div><dt>SP</dt><dd>${escapeHtml(`${character.sp?.[0] ?? 10} / ${character.sp?.[1] ?? 10}`)}</dd></div>
          <div><dt>MP</dt><dd>${escapeHtml(`${character.mp?.[0] ?? 10} / ${character.mp?.[1] ?? 10}`)}</dd></div>
        </dl>
      </article>
    `;
    byId('workspace-character-return').onclick = () => openDashboard('characters');
  }

  function findCampaign(id) {
    return (window.campaigns || []).find(campaign => campaign.id === id);
  }

  function persistWorkspaceChange(reason) {
    window.saveAccountState?.();
    window.saveAsteriaState?.();
    window.AsteriaDataSync?.scheduleSave?.(reason);
  }

  function createWorkspaceCampaign() {
    if (!requireAccountWorkspace()) return;
    const name = String(byId('workspaceCampaignName')?.value || '').trim() || 'New Campaign';
    const description = String(byId('workspaceCampaignDescription')?.value || '').trim();
    const partySize = Math.max(1, Math.min(12, Number(byId('workspaceCampaignPartySize')?.value || 4)));
    const uid = accountKey();
    const id = randomToken('camp-');
    const inviteCode = randomToken('invite-');
    const campaign = {
      id,
      name,
      description,
      gmId:uid,
      party:[],
      partySize,
      access:{ dashboard:true, inventory:true, spells:true, journal:true, quests:true, notes:false },
      ownerUid:uid,
      ownerAccount:uid,
      createdBy:sessionInfo().user || sessionInfo().email || uid,
      gmUids:[uid],
      playerUids:[],
      roles:{ [uid]:'gm' },
      players:{
        [uid]:{
          uid,
          role:'gm',
          status:'active',
          characterIds:[],
          joinedAt:new Date().toISOString()
        }
      },
      characters:{},
      chat:{ messages:[] },
      guildBank:{
        coins:{ copper:0, silver:0, gold:0, platinum_crown:0, royal_crown:0, royal_platinum:0 },
        items:[],
        transactions:[]
      },
      settings:{
        partySize,
        visibility:'private',
        inviteRequired:true,
        allowPlayerCreateCharacter:true,
        allowPlayerLinkCharacter:true
      },
      inviteCode,
      inviteLink:'',
      createdAt:new Date().toISOString(),
      activity:[`Campaign created by ${sessionInfo().user || sessionInfo().email || 'account'}.`]
    };
    campaign.inviteLink = inviteLink(campaign);
    window.campaigns = window.campaigns || [];
    window.campaigns.push(campaign);
    window.activeCampaign = window.campaigns.length - 1;
    persistWorkspaceChange('workspace-campaign-created');
    window.AsteriaFirebase?.saveCampaign?.(id, campaign);
    window.toast?.(`Campaign created: ${name}`);
    openDashboard('campaigns');
    renderCampaignDetail(campaign);
  }

  function createWorkspaceCharacter() {
    if (window.AsteriaGameplay?.openCharacterForge) {
      window.AsteriaGameplay.openCharacterForge();
      return;
    }
    if (!requireAccountWorkspace()) return;
    const record = ensureAccountRecord();
    const name = String(byId('workspaceCharacterName')?.value || '').trim() || 'New Character';
    const id = typeof window.normaliseId === 'function' ? window.normaliseId(name) : slugify(name);
    const race = String(byId('workspaceCharacterRace')?.value || 'Unselected').trim();
    const klass = String(byId('workspaceCharacterClass')?.value || 'Unselected').trim();
    const age = String(byId('workspaceCharacterAge')?.value || '').trim();
    const initial = typeof window.characterInitial === 'function' ? window.characterInitial(name) : (name.charAt(0).toUpperCase() || '?');
    window.chars = window.chars || {};
    window.chars[id] = {
      id,
      initial,
      name,
      race,
      klass,
      age,
      ownerUid:accountKey(),
      level:0,
      hp:[10,10],
      sp:[10,10],
      mp:[10,10],
      xp:0,
      xpMax:5000,
      campaign:'Unassigned',
      session:'No active session',
      conditions:[],
      cp:0,
      tp:0,
      resourceMods:{ hp:0, sp:0, mp:0 },
      characteristics:{ strength:0, dexterity:0, agility:0, constitution:0, endurance:0, intelligence:0, wisdom:0, charisma:0, luck:0 },
      inventory:[]
    };
    if (!record.characters.includes(id)) record.characters.push(id);
    window.session = window.session || {};
    window.session.character = id;
    window.selected = id;
    persistWorkspaceChange('workspace-character-created');
    window.AsteriaFirebase?.saveCharacter?.(id, window.chars[id]);
    window.toast?.(`Character created: ${name}`);
    openDashboard('characters');
    renderCharacterDetail(Object.assign({ id }, window.chars[id]));
  }

  function linkCharacterToCampaign(campaignIdValue) {
    const campaign = findCampaign(campaignIdValue);
    const characterId = byId('workspaceLinkCharacter')?.value;
    if (!campaign || !characterId || !window.chars?.[characterId]) return;
    const uid = accountKey();
    campaign.party = Array.from(new Set([...(campaign.party || []), characterId]));
    campaign.players = Object.assign({}, campaign.players || {});
    campaign.players[uid] = campaign.players[uid] || { uid, role:campaignRole(campaign) === 'GM' ? 'gm' : 'player', status:'active', characterIds:[], joinedAt:new Date().toISOString() };
    campaign.players[uid].characterIds = Array.from(new Set([...(campaign.players[uid].characterIds || []), characterId]));
    campaign.characters = Object.assign({}, campaign.characters || {});
    campaign.characters[characterId] = {
      id:characterId,
      ownerUid:uid,
      name:window.chars[characterId].name || characterId,
      status:'linked',
      linkedAt:new Date().toISOString()
    };
    campaign.playerCharacterLinks = Object.assign({}, campaign.playerCharacterLinks || {}, { [characterId]:accountKey() });
    window.chars[characterId].campaign = campaign.name;
    persistWorkspaceChange('workspace-character-linked');
    window.AsteriaFirebase?.saveCampaign?.(campaign.id, campaign);
    window.AsteriaFirebase?.saveCharacter?.(characterId, window.chars[characterId]);
    window.toast?.(`${window.chars[characterId].name} linked to ${campaign.name}.`);
    renderCampaignDetail(campaign);
  }

  function renderAuthDisplay() {
    const element = shell();
    const grid = element.querySelector('#clean-grid');
    const status = element.querySelector('#clean-status');
    const count = element.querySelector('#clean-count');
    grid.innerHTML = activeWorkspaceTab === authFirstTab() ? '' : `<div class="workspace-tab-context"><b>${escapeHtml(activeWorkspaceTab)}</b><span>${escapeHtml('This tab uses the same workspace display window and swaps the account data shown inside it.')}</span></div>`;
    if (currentDashboardMode === 'dashboard') renderOverviewCards(grid);
    if (currentDashboardMode === 'campaigns') renderCampaignCards(grid);
    if (currentDashboardMode === 'characters') renderCharacterCards(grid);
    if (currentDashboardMode === 'createCampaign') renderCreateCampaignForm(grid);
    if (currentDashboardMode === 'createCharacter') renderCreateCharacterForm(grid);
    if (currentDashboardMode === 'settings') renderSettingsPanel(grid);
    status.textContent = `${authMode().label} / ${activeWorkspaceTab}`;
    count.textContent = currentDashboardMode === 'campaigns'
      ? `${accountCampaigns().length} campaigns`
      : currentDashboardMode === 'characters'
        ? `${ownedCharacters().length} characters`
        : 'Account workspace';
  }

  function openDashboard(mode = 'dashboard') {
    if (!requireAccountWorkspace()) return false;
    hideOldViews();
    currentDashboardMode = authWorkspaceModes.some(item => item.id === mode) ? mode : 'dashboard';
    currentSection = 'Dashboard';
    active = null;
    selectedEntry = null;
    activeWorkspaceTab = authFirstTab(currentDashboardMode);
    shell();
    renderAuthFilters();
    renderAuthTabs();
    renderAuthNav();
    renderAuthDisplay();
    syncAuthNavState();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function stripPublicHiddenSections(markdown) {
    const lines = stripFrontmatter(markdown).split(/\r?\n/);
    const output = [];
    let hidden = false;
    lines.forEach(line => {
      if (/^##\s+/.test(line)) hidden = /^##\s+(GM Notes|GM Only|Hidden|Private)/i.test(line);
      if (!hidden) output.push(line);
    });
    return output.join('\n').trim();
  }

  function inlineMarkdown(value) {
    return escapeHtml(value)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function markdownToHtml(markdown) {
    if (typeof window.mdToHtml === 'function') return window.mdToHtml(markdown || '');

    const lines = String(markdown || '').split(/\r?\n/);
    let html = '';
    let inList = false;
    function closeList() {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
    }
    lines.forEach(raw => {
      const line = raw.trim();
      if (!line) {
        closeList();
        return;
      }
      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        closeList();
        const level = Math.min(heading[1].length + 1, 5);
        html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
        return;
      }
      if (/^[-*]\s+/.test(line)) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        html += `<li>${inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`;
        return;
      }
      closeList();
      html += `<p>${inlineMarkdown(line)}</p>`;
    });
    closeList();
    return html;
  }

  function relationKey(value) {
    return slugify(String(value || '').replace(/^#/, '').replace(/^\/+/, ''));
  }

  function relationshipKeysForValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];

    const markdownLink = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const candidates = markdownLink ? [markdownLink[1], markdownLink[2]] : [raw];
    const keys = [];

    candidates.forEach(candidate => {
      const cleaned = String(candidate || '')
        .replace(/^#/, '')
        .replace(/^\/+/, '')
        .replace(/\.(md|png|jpg|jpeg|webp)$/i, '')
        .trim();
      if (!cleaned) return;
      keys.push(relationKey(cleaned));
      const parts = cleaned.split('/').filter(Boolean);
      if (parts.length) keys.push(relationKey(parts[parts.length - 1]));
      if (/s$/i.test(cleaned)) keys.push(relationKey(cleaned.replace(/s$/i, '')));
    });

    return [...new Set(keys.filter(Boolean))];
  }

  function addRelationshipKey(map, key, entry) {
    const normalized = relationKey(key);
    if (!normalized || map.has(normalized)) return;
    map.set(normalized, entry);
  }

  function relationshipLookup() {
    const map = new Map();
    entries.forEach(entry => {
      addRelationshipKey(map, entry.id, entry);
      addRelationshipKey(map, entry.title, entry);
      addRelationshipKey(map, entry.wikiRoute, entry);
      addRelationshipKey(map, entry.sourcePath, entry);
      addRelationshipKey(map, entry.metadata?.slug, entry);
      arrayValue(entry.metadata?.aliases).forEach(alias => addRelationshipKey(map, alias, entry));
    });
    return map;
  }

  function resolveReference(value, currentEntry = null) {
    const lookup = relationshipLookup();
    for (const key of relationshipKeysForValue(value)) {
      const entry = lookup.get(key);
      if (entry && (!currentEntry || entry.id !== currentEntry.id)) return entry;
    }
    return null;
  }

  function relationshipValuesFromContent(markdown) {
    const values = [];
    let activeSection = false;
    stripFrontmatter(markdown).split(/\r?\n/).forEach(line => {
      if (/^##\s+/.test(line)) {
        activeSection = /^##\s+(Related Items|Related Entries|Ingredients|Source Items|Outputs|Recipes)/i.test(line);
        return;
      }
      if (!activeSection) return;
      const item = line.match(/^[-*]\s+(.+)$/);
      if (item) values.push(item[1].replace(/\s+-\s+.*$/, '').trim());
    });
    return values;
  }

  function relationshipReferences(entry, content) {
    const refs = [];
    const seen = new Set();
    function addRef(label) {
      const target = resolveReference(label, entry);
      if (!target || seen.has(target.id)) return;
      seen.add(target.id);
      refs.push({ label: String(label || target.title), entry: target });
    }

    relationshipMetadataKeys.forEach(key => arrayValue(entry.metadata?.[key]).forEach(addRef));
    relationshipValuesFromContent(content).forEach(addRef);
    return refs.slice(0, 12);
  }

  function relationshipPanel(entry, content) {
    const refs = relationshipReferences(entry, content);
    if (!refs.length) return '';
    return `
      <aside class="clean-relationship-panel">
        <b>Linked Compendium Entries</b>
        <div>
          ${refs.map(ref => `<button type="button" class="clean-relation-link" data-entry-id="${escapeHtml(ref.entry.id)}">${escapeHtml(ref.entry.title)}</button>`).join('')}
        </div>
      </aside>
    `;
  }

  function linkKnownReferences(html, entry) {
    return String(html || '').replace(/<li>([^<]+)<\/li>/g, (match, label) => {
      const target = resolveReference(label, entry);
      return target ? `<li><button type="button" class="clean-inline-link" data-entry-id="${escapeHtml(target.id)}">${escapeHtml(label)}</button></li>` : match;
    });
  }

  function metadataLabel(key) {
    return String(key || '')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  function metadataValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join(', ');
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    return String(value || '').trim();
  }

  function pageMetadata(entry) {
    const rows = [];
    const seen = new Set();
    function add(label, value) {
      const text = metadataValue(value);
      if (!text || text === '[]') return;
      const key = lower(label);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ label, value:text });
    }

    add('Type', entry.type);
    add('Category', (entry.categoryPath || []).length ? entry.categoryPath.join(' / ') : entry.category);
    if (entry.section === 'Races') {
      add('Availability', entry.playable ? 'Playable' : 'Non-Playable');
      add('Race Type', entry.raceCategory);
      add('Size', entry.size);
      add('Affinity', entry.affinity);
    }
    if (entry.section === 'Items') {
      add('Item Class', entry.rarity);
      add('Content Collection', entry.wikiCollectionTitle || '');
      add('Content Category', entry.wikiCategory || '');
      add('Market Value', entry.marketValue || entry.metadata?.market_value || entry.metadata?.marketValue);
    }
    add('Tags', entry.tags);

    [
      'kingdom',
      'subcategory',
      'habitats',
      'climate',
      'regions',
      'harvest_season',
      'harvestSeason',
      'mana_density',
      'manaDensity',
      'toxicity',
      'growth_difficulty',
      'growthDifficulty',
      'affinities',
      'source_items',
      'sourceItems',
      'crafting_uses',
      'craftingUses',
      'alchemy_uses',
      'alchemyUses',
      'culinary_uses',
      'culinaryUses',
      'outputs',
      'processing_methods',
      'processingMethods'
    ].forEach(key => add(metadataLabel(key), entry.metadata?.[key]));

    return rows.length ? `<dl class="clean-page-meta">${rows.map(row => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`).join('')}</dl>` : '';
  }

  function bindPageLinks(grid) {
    qsa('.clean-relation-link,.clean-inline-link', grid).forEach(button => {
      button.onclick = () => {
        const target = entries.find(entry => entry.id === button.dataset.entryId);
        if (target) openPage(target);
      };
    });
  }

  function sectionsForTab(entry, tab) {
    const map = {
      Races: {
        'Race Sheet': ['Overview','Physical Traits','Character Forge Notes'],
        'Racial Traits': ['Racial Traits','Traits','Racial Skills','Affinities','Magical Affinities'],
        Lore: ['Lore','Culture','Regions','Relationships','Related Items'],
        Images: ['Appearance','Images']
      },
      Classes: {
        'Class Sheet': ['Overview','Class Features','Progression'],
        'Talent Tree': ['Talent Tree','Talents','Pathways','Class Talents'],
        Lore: ['Lore','Culture','Roleplay'],
        Images: ['Appearance','Images']
      },
      Items: {
        'Item Sheet': ['Overview','Appearance','Uses','Market Value'],
        Crafting: ['Crafting Uses','Crafting','Alchemy Uses','Culinary Uses','Harvesting'],
        Lore: ['Lore','Overview','Habitat','Magical Affinities','Related Items'],
        Sources: ['Sources','Source Items','Related Items','Market Value','Harvesting']
      },
      Magic: {
        'Magic Sheet': ['Overview','Spell Details','Magic System'],
        Effects: ['Effects','Uses','Enchantments','Affinities'],
        Lore: ['Lore','Magical Affinities','Related Items'],
        Sources: ['Sources','Related Items']
      },
      'Asteria Handbook': {
        'Rule Sheet': ['Overview','Rules','Core Rules'],
        Systems: ['System','Systems','Mechanics'],
        Tables: ['Tables','Reference'],
        Sources: ['Sources','Related Items']
      },
      'World, Realms & Planes': {
        'Lore Sheet': ['Overview','Lore','Description'],
        Regions: ['Regions','Locations','Kingdoms','Realms'],
        Timeline: ['Timeline','History'],
        Images: ['Appearance','Images','Map']
      },
      Creatures: {
        'Creature Sheet': ['Overview','Stats','Combat Stats'],
        Abilities: ['Abilities','Traits','Attacks'],
        Lore: ['Lore','Habitat','Relationships'],
        Images: ['Appearance','Images']
      },
      Factions: {
        'Faction Sheet': ['Overview','Status','Leadership'],
        Relationships: ['Relationships','Allies','Enemies'],
        Lore: ['Lore','History','Culture'],
        Images: ['Appearance','Images']
      }
    };
    return map[entry.section]?.[tab] || [];
  }

  function markdownSections(markdown, headings) {
    const wanted = headings.map(heading => lower(heading));
    if (!wanted.length) return '';
    const lines = stripPublicHiddenSections(markdown).split(/\r?\n/);
    const output = [];
    let capture = false;
    lines.forEach(line => {
      const heading = line.match(/^##\s+(.+)$/);
      if (heading) capture = wanted.some(wantedHeading => lower(heading[1]).includes(wantedHeading) || wantedHeading.includes(lower(heading[1])));
      if (capture) output.push(line);
    });
    return output.join('\n').trim();
  }

  function fallbackTabContent(entry, tab) {
    if (tab === 'Images') {
      return entry.imagePath
        ? ''
        : `## Images\n\nNo image has been attached to this entry yet.`;
    }
    if (tab === 'Crafting') {
      const uses = arrayValue(entry.metadata?.crafting_uses || entry.metadata?.craftingUses);
      const sourceItems = arrayValue(entry.metadata?.source_items || entry.metadata?.sourceItems);
      return `## Crafting\n\n${uses.length ? uses.map(use => `- ${use}`).join('\n') : 'No crafting data has been added yet.'}\n\n${sourceItems.length ? `## Sources\n\n${sourceItems.map(source => `- ${source}`).join('\n')}` : ''}`;
    }
    if (tab === 'Sources') {
      return `## Sources\n\n${entry.sourcePath ? `- ${entry.sourcePath}` : '- Source path not available.'}\n${entry.wikiRoute ? `- ${entry.wikiRoute}` : ''}`;
    }
    return `## ${tab}\n\nNo dedicated ${tab.toLowerCase()} section has been added yet.`;
  }

  function contentForWorkspaceTab(entry, content, tab) {
    const sections = markdownSections(content, sectionsForTab(entry, tab));
    if (sections) return sections;
    if (tab === firstTab(entry.section)) return stripPublicHiddenSections(content);
    return fallbackTabContent(entry, tab);
  }

  async function openPage(entry, tab = activeWorkspaceTab) {
    selectedEntry = entry;
    activeWorkspaceTab = tab || firstTab(entry.section);
    currentSection = entry.section;
    ensureActiveTab(entry.section);
    renderTabs();
    const grid = byId('clean-grid');
    let content = entry.content || '';
    if (entry.sourcePath) {
      try {
        const response = await fetch(entry.sourcePath);
        if (response.ok) content = await response.text();
      } catch(error) {
        content = entry.content || '';
      }
    }
    if (!content) content = `# ${entry.title}\n\n${entry.description || ''}`;
    const tabContent = contentForWorkspaceTab(entry, content, activeWorkspaceTab);
    const showOverview = activeWorkspaceTab === firstTab(entry.section);

    grid.innerHTML = `
      <article class="clean-page workspace-viewer clean-page-${slugify(entry.section)}" data-viewer="universal-workspace-viewer">
        <button class="clean-back clean-return" id="clean-return" type="button">Back to results</button>
        <header class="clean-page-head">
          <span class="clean-tag ${entry.section === 'Races' ? 'clean-race-status' : entry.section === 'Items' ? 'clean-rarity-tag' : ''}">${escapeHtml(statusLabel(entry))}</span>
          <div>
            <p class="eyebrow">${escapeHtml(entry.section)}${entry.category ? ` / ${escapeHtml(entry.category)}` : ''}</p>
            <h2>${escapeHtml(entry.title)}</h2>
            ${entry.section === 'Races' ? `<p>${escapeHtml(entry.raceCategory || 'Unknown')} &bull; ${escapeHtml(entry.size || 'Unknown')}</p>` : ''}
          </div>
        </header>
        ${tabsForSection(entry.section).length ? `<div class="workspace-note-tab-label">${escapeHtml(activeWorkspaceTab)}</div>` : ''}
        ${(entry.imagePath && (showOverview || activeWorkspaceTab === 'Images')) ? `<div class="clean-page-image"><img src="${escapeHtml(entry.imagePath)}" alt="${escapeHtml(entry.title)}" onerror="this.parentElement.remove();"></div>` : ''}
        ${showOverview ? pageMetadata(entry) : ''}
        ${showOverview || ['Sources','Relationships','Crafting'].includes(activeWorkspaceTab) ? relationshipPanel(entry, content) : ''}
        <div class="markdown-body clean-page-body">${linkKnownReferences(markdownToHtml(tabContent), entry)}</div>
      </article>
    `;
    byId('clean-return').onclick = () => {
      selectedEntry = null;
      renderTabs();
      render();
    };
    bindPageLinks(grid);
  }

  function allLeaves(node, output = []) {
    (node.children || []).forEach(child => {
      if (child.children) allLeaves(child, output);
      else output.push(child);
    });
    return output;
  }

  function sectionFromHint(hint) {
    const value = lower(hint);
    if (value.includes('race')) return 'Races';
    if (value.includes('class') || value.includes('talent tree') || value.includes('pathway')) return 'Classes';
    if (value.startsWith('items') || value.includes('items/') || value.includes('weapon') || value.includes('armour') || value.includes('armor') || value.includes('material') || value.includes('consumable')) return 'Items';
    if (value.includes('spell') || value.includes('magic') || value.includes('enchantment') || value.includes('element') || value.includes('soul stone') || value.includes('rune')) return 'Magic';
    if (value.includes('creature') || value.includes('beast') || value.includes('monster') || value.includes('animal') || value.includes('construct')) return 'Creatures';
    if (value.includes('faction') || value.includes('guild') || value.includes('organisation') || value.includes('organization') || value.includes('npc')) return 'Factions';
    if (value.includes('world') || value.includes('realm') || value.includes('plane') || value.includes('continent') || value.includes('shattered') || value.includes('pantheon') || value.includes('kingdom') || value.includes('timeline')) return 'World, Realms & Planes';
    if (value.includes('handbook') || value.includes('system') || value.includes('skill') || value.includes('talent') || value.includes('profession')) return 'Asteria Handbook';
    return publicSections.includes(hint) ? hint : '';
  }

  function activateFromHint(hint) {
    if (!hint) return;
    const tail = lower(String(hint).split('/').filter(Boolean).pop() || hint);
    const leaves = allLeaves(trees[currentSection] || trees.Items);
    active = leaves.find(item => {
      const labels = [item.label, ...(item.query?.aliases || []), item.query?.path, item.query?.type, item.query?.raceCategory, item.query?.wikiCollection].map(lower);
      return labels.some(label => label && (tail.includes(label) || label.includes(tail)));
    }) || null;
  }

  function openSection(name, options = {}) {
    const section = publicSections.includes(name) ? name : (sectionFromHint(name) || 'Items');
    if (section === 'Races' && window.AsteriaRaceCompendium?.open && !options.cleanCompendiumFallback) {
      window.AsteriaRaceCompendium.open(options);
      return;
    }
    if ((section === 'Classes' || section === 'Creatures') && window.AsteriaCodexCompendium?.openSection && !options.cleanCompendiumFallback) {
      window.AsteriaCodexCompendium.openSection(section, options);
      return;
    }
    hideOldViews();
    currentSection = section;
    stack = [trees[section] || trees.Items];
    active = null;
    selectedEntry = null;
    activeWorkspaceTab = firstTab(section);
    shell();
    renderFilters();
    renderTabs();
    activateFromHint(options.hint || options.path || '');
    renderNav();
    render();
    syncGlobalNavState();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
  }

  function openPath(path) {
    const section = sectionFromHint(path);
    if (section) openSection(section, { path });
  }

  function routeKey(value) {
    return String(value || '')
      .replace(/^#/, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  function routeFromLocation() {
    const hashRoute = routeKey(window.location?.hash || '');
    if (hashRoute) return hashRoute;
    const pathRoute = routeKey(window.location?.pathname || '');
    return pathRoute === 'index.html' || pathRoute === 'index' ? '' : pathRoute;
  }

  function entryForRoute(route) {
    return entries.find(entry => routeKey(entry.wikiRoute) === route || routeKey(entry.sourcePath) === route);
  }

  function setFilterValue(id, value) {
    const control = byId(id);
    if (!control || !value) return;
    const target = slugify(value);
    const option = Array.from(control.options || []).find(item => slugify(item.value) === target || slugify(item.textContent) === target);
    if (option) control.value = option.value;
  }

  function openRouteFromLocation() {
    const route = routeFromLocation();
    if (!route) return false;

    const entry = entryForRoute(route);
    if (entry) {
      openSection(entry.section, { path:(entry.categoryPath || []).join('/') });
      openPage(entry);
      return true;
    }

    const segments = route.split('/').filter(Boolean);
    const collectionId = segments[0];
    const index = allWikiIndexes()[collectionId];
    if (!index) return false;

    const routePath = collectionId === 'minerals'
      ? 'Items/Resources & Materials/Metal/Metal Ores'
      : collectionId === 'materials'
        ? 'Items/Resources & Materials/Metal/Metal Ingots'
        : 'Items/Resources & Materials/Herbalist & Plants';
    openSection('Items', { path:routePath });
    const rarity = itemClasses.find(itemClass => slugify(itemClass) === slugify(segments[1] || ''));
    const category = rarity ? segments[2] : segments[1];
    setFilterValue('clean-rarity', rarity || '');
    setFilterValue('clean-category', category || '');
    render();
    return true;
  }

  function bindPublicButtons() {
    qsa('button,a').forEach(element => {
      if (element.dataset.cleanCompendiumBound) return;

      const workspaceMode = element.dataset.workspaceMode;
      if (workspaceMode) {
        element.dataset.cleanCompendiumBound = '1';
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          openDashboard(workspaceMode);
        }, true);
        return;
      }

      const workspaceAction = element.dataset.workspaceAction;
      if (workspaceAction) {
        element.dataset.cleanCompendiumBound = '1';
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (workspaceAction === 'create-campaign') openDashboard('createCampaign');
          if (workspaceAction === 'create-character') {
            if (window.AsteriaGameplay?.openCharacterForge) window.AsteriaGameplay.openCharacterForge();
            else openDashboard('createCharacter');
          }
          if (workspaceAction === 'settings') openDashboard('settings');
        }, true);
        return;
      }

      const workspaceSection = element.dataset.workspaceSection;
      if (workspaceSection && publicSections.includes(workspaceSection)) {
        element.dataset.cleanCompendiumBound = '1';
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          openSection(workspaceSection);
        }, true);
        return;
      }

      const view = element.dataset.view;
      if (sectionViews[view]) {
        element.dataset.cleanCompendiumBound = '1';
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          openSection(sectionViews[view]);
        }, true);
        return;
      }

      if (view === 'home' || lower(textOf(element)) === 'home') {
        element.dataset.cleanCompendiumBound = '1';
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (window.AsteriaRouter?.home) window.AsteriaRouter.home();
          else if (window.asteriaHomeRoute) window.asteriaHomeRoute();
          else if (window.goHome) window.goHome();
          else showHome();
        }, true);
      }
    });
  }

  function entryForSlug(slug) {
    const key = slugify(slug);
    const route = routeKey(slug);
    return entries.find(entry =>
      slugify(entry.id) === key ||
      slugify(entry.title) === key ||
      slugify(entry.metadata?.slug) === key ||
      routeKey(entry.wikiRoute) === route ||
      routeKey(entry.sourcePath).endsWith(route)
    );
  }

  function openEntry(entry) {
    if (!entry) return false;
    openSection(entry.section, { path:(entry.categoryPath || []).join('/') });
    openPage(entry);
    return true;
  }

  function openEntryBySlug(slug) {
    return openEntry(entryForSlug(slug));
  }

  function openCategory(category) {
    const section = sectionFromHint(category) || 'Asteria Handbook';
    openSection(section, { hint:category });

    const tail = String(category || '').split('/').filter(Boolean).pop() || category;
    setFilterValue('clean-category', tail);
    render();
  }

  function publishApis() {
    legacyOpenRuleCategory = legacyOpenRuleCategory || window.openRuleCategory;
    legacyOpenRulePage = legacyOpenRulePage || window.openRulePage;
    window.openCompendiumSection = openSection;
    window.openCompendiumPath = openPath;
    window.openSection = openSection;
    window.openRuleCategory = function(category) {
      openCategory(category);
    };
    window.openRulePage = function(slug) {
      if (openEntryBySlug(slug)) return;
      legacyOpenRulePage?.(slug);
    };
    window.openWorkspaceEntry = openEntryBySlug;
    window.AsteriaCompendium = {
      ...(window.AsteriaCompendium || {}),
      openSection,
      openDashboard,
      openPath,
      openRoute: openRouteFromLocation,
      openEntry,
      openEntryBySlug,
      entries: () => entries.slice(),
      sectionEntries,
      showHome
    };
    window.AsteriaWorkspace = {
      ...(window.AsteriaWorkspace || {}),
      openSection,
      openDashboard,
      openDashboardMode: openDashboard,
      createCampaign: createWorkspaceCampaign,
      createCharacter: createWorkspaceCharacter,
      openPath,
      openEntry,
      openEntryBySlug,
      openCategory,
      showHome,
      entries: () => entries.slice()
    };
  }

  async function init() {
    await load();
    publishApis();
    bindPublicButtons();
    openRouteFromLocation();
    if (window.__asteriaOpenDashboardOnReady || (accountSignedIn() && byId('home')?.classList.contains('show'))) {
      window.__asteriaOpenDashboardOnReady = false;
      openDashboard('dashboard');
    }
    window.addEventListener('hashchange', openRouteFromLocation);
    const observer = new MutationObserver(bindPublicButtons);
    observer.observe(document.body, { childList:true, subtree:true });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
