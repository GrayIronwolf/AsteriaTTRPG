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
  if(data.lazy) for(const entry of staticEntries) for(const alias of [entry.id,entry.sourcePath,entry.route,...entry.aliases]) {
    data.aliases[alias]=data.aliases[alias] && data.aliases[alias]!==entry.id
      ? [...new Set([...list(data.aliases[alias]),entry.id])] : entry.id;
  }
  function decorate(entry) {
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
  staticEntries.forEach(decorate);

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
  const loaded = new Set(data.lazy ? [] : staticEntries.map(entry => entry.id));
  const pending = new Map();
  const searchCache = new WeakMap();
  let searchWords;
  function matches(entry, query = '') {
    const terms = String(query).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    if(!terms.length) return true;
    const code = String(query).trim();
    if(/^\d{2}-\d{2}-\d{3}-\d{3}$/.test(code)) return entry.metadata?.['Asteria ID Index Code'] === code;
    let text = searchCache.get(entry);
    if(text === undefined) {
      if(entry.searchCodes) {
        searchWords ||= data.searchWords.split(' ');
        const bytes = atob(entry.searchCodes), words=[];
        let id=0,delta=0,shift=0;
        for(let i=0;i<bytes.length;i++) {
          const byte=bytes.charCodeAt(i);delta|=(byte&127)<<shift;
          if(byte&128) shift+=7;
          else {id+=delta;words.push(searchWords[id]);delta=0;shift=0;}
        }
        text=words.join(' ');
      } else text=String(entry.searchTerms || [entry.title,entry.body,JSON.stringify(entry.metadata)].join(' ')).toLowerCase();
      searchCache.set(entry,text);
    }
    return terms.every(term => text.includes(term));
  }
  function isLoaded(value) {
    const entry=typeof value==='object'?value:resolve(value);
    return !entry || !data.lazy || !byId.has(entry.id) || loaded.has(entry.id);
  }
  function loadPart(number) {
    if(pending.has(number)) return pending.get(number);
    const part=data.parts[number];
    const request=window.fetch(new URL(part.url,data.baseUrl).href)
      .then(response => {if(!response.ok)throw new Error('Compendium download failed.');return response.json();})
      .then(payload => {
        // Validate the complete response before updating any shared definition.
        if(payload.domain!==part.domain || payload.entries?.length!==part.ids.length || payload.entries.some((entry,index)=>entry.id!==part.ids[index] || entry.domain!==part.domain || typeof entry.body!=='string'))throw new Error('Compendium download is incomplete.');
        const full=data.hydrate({...data,entries:payload.entries});
        for(const entry of full.entries) {
          const target=byId.get(entry.id);
          Object.assign(target,entry);decorate(target);loaded.add(entry.id);
        }
        return full.entries.map(entry=>byId.get(entry.id));
      }).catch(error => {pending.delete(number);throw error;});
    pending.set(number,request);
    return request;
  }
  function ensureEntry(value) {
    const entry=typeof value==='object'?(byId.get(value?.id) || value):resolve(value);
    if(isLoaded(entry))return Promise.resolve(entry);
    return loadPart(entry.part).then(()=>entry);
  }
  function domainsReady(domains) {return !data.lazy || domains.every(domain=>staticEntries.filter(entry=>entry.domain===domain).every(isLoaded));}
  function ensureDomains(domains) {
    if(!data.lazy)return Promise.resolve();
    return Promise.all([...new Set(staticEntries.filter(entry=>domains.includes(entry.domain)&&!isLoaded(entry)).map(entry=>entry.part))].map(loadPart));
  }
  const viewRequests=new WeakMap();
  function readyForView(root, target, render) {
    viewRequests.delete(root);
    const domains=Array.isArray(target)?target:null;
    if(domains ? domainsReady(domains) : isLoaded(target))return true;
    const request={};viewRequests.set(root,request);
    const current=()=>viewRequests.get(root)===request && root.isConnected && root.closest('.view')?.classList.contains('show');
    root.innerHTML='<section class="card compendium-loading"><p role="status" aria-live="polite">Loading Asteria content...</p></section>';
    (domains?ensureDomains(domains):ensureEntry(target)).then(()=>{if(current())render();}).catch(error=>{
      console.warn('Asteria content could not load.',error);
      if(!current())return;
      root.innerHTML='<section class="card compendium-loading" role="alert"><p>This content could not load. Check your connection and try again.</p><button type="button">Try again</button></section>';
      root.querySelector('button')?.addEventListener('click',render,{once:true});
    });
    return false;
  }
  window.AsteriaContent = Object.freeze({ entries, resolve, resolveAll, matches, isLoaded, ensureEntry, domainsReady, ensureDomains, readyForView, item:id => resolve(id,'item'), items:source => [...staticEntries.filter(entry => entry.domain === 'item'),...custom(source)], tree, version:data.contentHash });
  // Compatibility views contain references to the same definitions; no fallback catalogs.
  window.ASTERIA_CONTENT = {pages:staticEntries.map(entry => ({slug:entry.slug,title:entry.title,category:entry.section,source:entry.sourcePath.replace(/^content\//,''),get content(){return entry.content;}}))};
  for (const [domain,globalName] of Object.entries({race:'ASTERIA_RACE_COMPENDIUM_DATA',class:'ASTERIA_CLASS_COMPENDIUM_DATA',creature:'ASTERIA_CREATURE_COMPENDIUM_DATA'})) window[globalName] = {categories:tree(domain),entryCount:entries(domain).length};
  window.ASTERIA_RACE_INFO_DATA = Object.fromEntries(entries('race').filter(entry => entry.metadata.raceInfo).map(entry => [entry.title,entry.metadata.raceInfo]));
  window.ASTERIA_WIKI_INDEXES = Object.fromEntries(['flora','minerals','materials'].map(id => [id,{id,title:id,items:entries('item').filter(entry => entry.metadata.collection === id).map(entry => ({...entry,collection:id,contentPath:entry.sourcePath,item_class:entry.rarity}))}]));
  const open = (domain, options) => window.AsteriaUniversalCompendium?.openSection(domain,options);
  window.AsteriaRaceCompendium = {entries:() => entries('race'),categories:() => tree('race'),open:options => open('race',options),data:window.ASTERIA_RACE_COMPENDIUM_DATA};
  window.AsteriaCodexCompendium = {classEntries:() => entries('class'),creatureEntries:() => entries('creature'),entries:() => [...entries('class'),...entries('creature')],openSection:open,openEntryBySlug:value => window.AsteriaUniversalCompendium?.openEntryBySlug(value)};
  window.openRaceCompendium = options => open('race',options);
})();
