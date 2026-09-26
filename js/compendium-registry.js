/* Shared read-only definitions. Owned items remain independent campaign snapshots. */
(function(){
  'use strict';
  const data = window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX;
  const list = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const slug = value => String(value || '').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  const byId = new Map(data.entries.map(entry => [entry.id,entry]));
  const staticEntries = data.entries;
  const customCache = new WeakMap();
  const emptyCustom = [];
  for (const entry of staticEntries) {
    for (const [key,value] of Object.entries(entry.metadata)) if (entry[key] === undefined) entry[key] = value;
    entry.primaryCategory = entry.categoryPath[0] || '';
    entry.info = entry.metadata.raceInfo || {};
    entry.stats = entry.info.stats || {};
    if (entry.domain === 'race') {
      entry.traits = entry.metadata.racialTraits || [];
      entry.characteristicRows = entry.metadata.characteristicRows || [];
      entry.availability = entry.playable === false ? 'non-playable' : 'playable';
    }
    if (entry.domain === 'class') {
      entry.talents = staticEntries.filter(talent => talent.domain === 'talent' && slug(talent.metadata.className || talent.metadata.classname) === entry.slug);
      entry.overview = entry.sections.Overview || '';
      entry.lore = entry.sections.Lore || '';
    }
    if (entry.domain === 'creature') {
      entry.ac = entry.metadata.armour ?? entry.metadata.ac;
      entry.max = entry.metadata.hp;
      entry.tier = entry.metadata.threat_tier || entry.metadata.threatTier;
      entry.threatTier = entry.tier;
    }
  }
  function custom(source = window.ASTERIA_CUSTOM_ITEMS || emptyCustom) {
    if (customCache.has(source)) return customCache.get(source);
    const customEntries = source.map(item => {
      const title = item.title || item.name || 'Custom Item';
      const id = `custom-item:${item.id || slug(title)}`;
      const category = item.category || item.type || 'Custom Items';
      const body = item.description || item.desc || '';
      return { ...item, id, customId:item.id, title, name:title, slug:item.slug || slug(title), domain:'item', type:'item', section:'Items', workspaceSection:'Items',
        category, categoryPath:[category], path:[category], pathId:slug(category), route:`/compendium/item/${encodeURIComponent(id)}`,
        metadata:{...item.metadata,...item,custom:true,itemType:item.itemType || item.type,itemClass:item.itemClass || item.rarity},
        body, content:body, summary:body, description:body, sections:{Overview:body}, tags:list(item.tags), tabs:data.tabTemplates.item,
        imagePath:item.image || item.imagePath || '', filters:{category,rarity:item.itemClass || item.rarity || ''},
        aliases:list(item.aliases), visibility:item.visibility || 'public', gmOnly:!!item.gmOnly, searchTerms:[title,category,body,list(item.tags).join(' ')].join(' ').toLowerCase()
      };
    });
    customCache.set(source,customEntries);
    return customEntries;
  }
  function entries(domain) { return [...staticEntries,...custom()].filter(entry => !domain || entry.domain === domain); }
  function resolveAll(value, domain) {
    let key = String(value || '').replace(/^#/, '');
    try { key = decodeURI(key); } catch { return []; }
    const alias = data.aliases[key] || data.aliases['/'+key];
    const exact = list(alias).map(id => byId.get(id)).filter(Boolean);
    const source = exact.length ? exact : entries(domain).filter(entry => entry.id === key || entry.route === key || entry.sourcePath === key || entry.customId === key);
    const matches = source.length ? source : entries(domain).filter(entry => entry.slug === slug(key) || slug(entry.title) === slug(key));
    return matches.filter(entry => !domain || entry.domain === domain);
  }
  function resolve(value, domain) { const found = resolveAll(value,domain); return found.length === 1 ? found[0] : null; }
  function tree(domain) {
    const categories = [];
    for (const entry of entries(domain)) {
      let children = categories;
      for (const name of entry.categoryPath) {
        let node = children.find(item => item.type === 'category' && item.name === name);
        if (!node) { node = {type:'category',name,children:[]}; children.push(node); }
        children = node.children;
      }
      children.push(entry);
    }
    return categories;
  }
  window.AsteriaContent = Object.freeze({ entries, resolve, resolveAll, item:id => resolve(id,'item'), items:source => [...staticEntries.filter(entry => entry.domain === 'item'),...custom(source)], tree, version:data.contentHash });
  // Compatibility views contain references to the same definitions; no fallback catalogs.
  window.ASTERIA_CONTENT = {pages:staticEntries.map(entry => ({slug:entry.slug,title:entry.title,category:entry.section,source:entry.sourcePath.replace(/^content\//,''),content:entry.content}))};
  for (const [domain,globalName] of Object.entries({race:'ASTERIA_RACE_COMPENDIUM_DATA',class:'ASTERIA_CLASS_COMPENDIUM_DATA',creature:'ASTERIA_CREATURE_COMPENDIUM_DATA'})) window[globalName] = {categories:tree(domain),entryCount:entries(domain).length};
  window.ASTERIA_RACE_INFO_DATA = Object.fromEntries(entries('race').filter(entry => entry.metadata.raceInfo).map(entry => [entry.title,entry.metadata.raceInfo]));
  window.ASTERIA_WIKI_INDEXES = Object.fromEntries(['flora','minerals','materials'].map(id => [id,{id,title:id,items:entries('item').filter(entry => entry.metadata.collection === id).map(entry => ({...entry,collection:id,contentPath:entry.sourcePath,item_class:entry.rarity}))}]));
  const open = (domain, options) => window.AsteriaUniversalCompendium?.openSection(domain,options);
  window.AsteriaRaceCompendium = {entries:() => entries('race'),categories:() => tree('race'),open:options => open('race',options),data:window.ASTERIA_RACE_COMPENDIUM_DATA};
  window.AsteriaCodexCompendium = {classEntries:() => entries('class'),creatureEntries:() => entries('creature'),entries:() => [...entries('class'),...entries('creature')],openSection:open,openEntryBySlug:value => window.AsteriaUniversalCompendium?.openEntryBySlug(value)};
  window.openRaceCompendium = options => open('race',options);
})();
