/* Navigation projection only: every page remains owned by AsteriaContent. */
(function(){
  'use strict';
  const GROUPS = [
    {id:'rules',title:'Rules & Handbook',symbol:'◇',description:'The foundations of play.',categories:[
      ['00','core','Core Standards'],['03','skills','Skills & Techniques'],['04','talents','Talents'],['17','conditions','Conditions & Status Effects'],['handbook','handbook','Asteria Handbook']]},
    {id:'characters',title:'Characters & Magic',symbol:'✧',description:'Discover who you can become.',categories:[
      ['01','races','Races'],['02','classes','Classes'],['05','magic','Spells & Magic'],['','origins','Origins & Backgrounds']]},
    {id:'equipment',title:'Equipment & Resources',symbol:'◈',description:'Tools, treasures and materials.',categories:[
      ['06','items','Items'],['07','resources','Resources & Materials'],['14','enchantments','Enchantments'],['15','runestones','Runestones']]},
    {id:'crafting',title:'Crafting & Building',symbol:'⚒',description:'From a pattern to a finished creation.',categories:[
      ['08','schematics','Schematics'],['09','recipes','Recipes'],['10','blueprints','Blueprints'],['11','patterns','Patterns'],['12','formulas','Formulas'],['13','designs','Designs'],['18','structures','Structures'],['','professions','Professions']]},
    {id:'world',title:'World & Lore',symbol:'◎',description:'Places, peoples and their stories.',categories:[
      ['19','theology','Theology'],['20','worlds','Worlds, Realms & Planes'],['22','npcs','NPCs'],['23','lore','Asteria Lore'],['24','languages','Languages'],['','factions','Factions']]},
    {id:'adventures',title:'Adventures & GM',symbol:'⚑',description:'Encounters and stories to unfold.',categories:[
      ['16','creatures','Creatures & Encounters'],['21','quests','Quests & Adventures'],['25','gm','Game Master']]}
  ];
  const CATEGORIES = GROUPS.flatMap(group=>group.categories.map(([code,id,title])=>({code,id,title,group:group.id})));
  const domainCategory = {race:'races',class:'classes',skill:'skills',talent:'talents',spell:'magic',item:'items',creature:'creatures',location:'worlds',religion:'theology',lore:'lore',faction:'factions',profession:'professions',origin:'origins',handbook:'handbook'};
  const keywords = {core:/core standards/,conditions:/conditions|status effects/,resources:/resources|materials|flora|minerals|plants|herbs|ores|ingots/,enchantments:/enchantments?/,runestones:/runestones?/,schematics:/schematics?/,recipes:/recipes?/,blueprints:/blueprints?/,patterns:/patterns?/,formulas:/formulas?/,designs:/designs|jewellery design/,structures:/structures|buildings/,npcs:/^npcs?$|non.player characters/,languages:/languages?/,quests:/quests?|adventures?/,gm:/game master|gm resources/};
  const byId = id=>document.getElementById(id);
  const escape = value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let query='', groupId='', categoryId='', limit=48, reading=false;
  const storageKey = kind=>`asteria.library.${kind}.${window.AsteriaFirebase?.getUser?.()?.uid || window.session?.uid || 'guest'}`;
  function readSaved(kind){try{const value=JSON.parse(localStorage.getItem(storageKey(kind))||'[]');return Array.isArray(value)?value.filter(id=>typeof id==='string').slice(0,100):[];}catch{return [];}}
  function save(kind,ids){try{localStorage.setItem(storageKey(kind),JSON.stringify(ids.slice(0,100)));}catch{/* Reading remains available when browser storage is disabled. */}}
  function classify(entry){
    const meta=entry.metadata||{};
    // Source navigation labels are distinct from permanent definition IDs.
    const explicit=String(meta.sourceCategory||meta.obsidianCategory||'').match(/^(\d{2})(?:\D|$)/);
    if(explicit){const category=CATEGORIES.find(c=>c.code===explicit[1]);if(category)return category.id;}
    if(!['item','handbook','lore'].includes(entry.domain)&&domainCategory[entry.domain])return domainCategory[entry.domain];
    const labels=[meta.type,meta.craftingCategory,...(entry.categoryPath||[])].filter(Boolean).join(' ').toLowerCase();
    const match=Object.entries(keywords).find(([,pattern])=>pattern.test(labels));
    return match?.[0] || domainCategory[entry.domain] || 'handbook';
  }
  function entries(){return window.AsteriaUniversalCompendium?.visibleEntries?.(true) || [];}
  function filtered(){return entries().filter(entry=>{
    const category=classify(entry);
    if(categoryId && category!==categoryId)return false;
    if(groupId && CATEGORIES.find(c=>c.id===category)?.group!==groupId)return false;
    return !query || `${entry.searchTerms||entry.title||''} ${entry.metadata?.['Asteria ID Index Code']||''}`.toLowerCase().includes(query.toLowerCase().trim());
  });}
  function href(group='',category='',q=''){
    const params=new URLSearchParams();if(group)params.set('group',group);if(category)params.set('category',category);if(q)params.set('q',q);
    return '#/compendium'+(params.size?'?'+params:'');
  }
  function closePanels(){setQuick(false);window.closeSettings?.();}
  function route(push=true){
    const url=href(groupId,categoryId,query);
    if(!reading && window.location.hash!==url)window.history[push?'pushState':'replaceState'](window.history.state,'',url);
    syncNavigation();
  }
  function show({group='',category='',search='',push=true}={}){
    groupId=GROUPS.some(g=>g.id===group)?group:'';
    categoryId=CATEGORIES.some(c=>c.id===category)?category:'';
    if(categoryId)groupId=CATEGORIES.find(c=>c.id===categoryId).group;
    query=search;limit=48;closePanels();
    window.setView?.('compendiumLibrary');
    document.querySelectorAll('.view').forEach(view=>view.classList.toggle('show',view.id==='compendiumLibrary'));
    document.body.classList.remove('workspace-active','compendium-active');
    render();route(push);return true;
  }
  function readRoute(){
    const [path,params='']=window.location.hash.replace(/^#/,'').split('?');
    if(!/^\/?compendium\/?$/.test(path)){syncNavigation();return false;}
    const p=new URLSearchParams(params);reading=true;
    try{return show({group:p.get('group')||'',category:p.get('category')||'',search:p.get('q')||'',push:false});}
    finally{reading=false;}
  }
  function cards(rows){
    const saved=new Set(readSaved('favourites'));
    return rows.map(entry=>`<article class="library-entry"><a href="#${escape(entry.route)}" data-library-entry="${escape(entry.id)}"><span class="library-entry-kind">${escape(CATEGORIES.find(c=>c.id===classify(entry))?.title||entry.domain)}</span><h3>${escape(entry.title)}</h3><p>${escape(String(entry.summary||'').slice(0,160))}</p>${entry.metadata?.['Asteria ID Index Code']?`<small>${escape(entry.metadata['Asteria ID Index Code'])}</small>`:''}</a><button type="button" class="library-favourite" data-library-favourite="${escape(entry.id)}" aria-label="${saved.has(entry.id)?'Remove':'Add'} ${escape(entry.title)} ${saved.has(entry.id)?'from':'to'} favourites" aria-pressed="${saved.has(entry.id)}">${saved.has(entry.id)?'★':'☆'}</button></article>`).join('');
  }
  function render(){
    const view=byId('compendiumLibrary');if(!view)return;
    const focused=document.activeElement,focusId=focused?.id,selection=focused?.selectionStart;
    const favouriteId=focused?.dataset?.libraryFavourite;
    const rows=filtered(),all=entries(),group=GROUPS.find(g=>g.id===groupId),category=CATEGORIES.find(c=>c.id===categoryId);
    const recent=readSaved('recent').map(id=>all.find(e=>e.id===id)).filter(Boolean).slice(0,6);
    const favourites=readSaved('favourites').map(id=>all.find(e=>e.id===id)).filter(Boolean);
    view.innerHTML=`<div class="asteria-library">
      <header class="library-hero"><p class="eyebrow">The Asteria Library</p><h1>Asteria Compendium</h1><p>Explore the rules, characters and worlds of Asteria.</p></header>
      <nav class="library-breadcrumbs" aria-label="Compendium breadcrumbs"><a href="${href()}">Asteria Compendium</a>${group?`<span aria-hidden="true">/</span><a href="${href(groupId)}">${escape(group.title)}</a>`:''}${category?`<span aria-hidden="true">/</span><span aria-current="page">${escape(category.title)}</span>`:''}</nav>
      <label class="library-search" for="librarySearch"><span>${category?`Search ${escape(category.title)}`:group?`Search ${escape(group.title)}`:'Search the entire Compendium'}</span><input id="librarySearch" type="search" value="${escape(query)}" placeholder="Find a rule, race, spell, item or definition ID…" autocomplete="off"></label>
      ${!query&&!categoryId?`<div class="library-groups">${GROUPS.filter(g=>!groupId||g.id===groupId).map(g=>{
        const count=all.filter(e=>CATEGORIES.find(c=>c.id===classify(e))?.group===g.id).length;
        return `<section class="library-group"><div class="library-group-heading"><span aria-hidden="true">${g.symbol}</span><div><h2>${escape(g.title)}</h2><p>${escape(g.description)}</p></div></div><small>${count} published entries</small><details ${groupId?'open':''}><summary>Browse categories</summary><ul>${g.categories.map(([code,id,title])=>{
          const count=all.filter(e=>classify(e)===id).length;
          return `<li>${count?`<a href="${href(g.id,id)}"><span>${escape(title)}</span><small>${count}</small></a>`:`<span class="library-unavailable"><span>${escape(title)}</span><small>No published entries</small></span>`}</li>`;
        }).join('')}</ul></details></section>`;
      }).join('')}</div>`:''}
      ${!query&&!groupId&&favourites.length?`<section class="library-collection"><h2>Favourites</h2><div class="library-results">${cards(favourites)}</div></section>`:''}
      ${!query&&!groupId&&recent.length?`<section class="library-collection"><h2>Recently viewed</h2><div class="library-results">${cards(recent)}</div></section>`:''}
      ${query||groupId?`<section class="library-collection"><h2>${category?escape(category.title):group?escape(group.title):'Search results'}</h2><p id="libraryResultCount" role="status" aria-live="polite">${rows.length} matching entries</p><div class="library-results">${cards(rows.slice(0,limit))}</div>${!rows.length?'<p class="library-empty">No published entries match this search. Try another word or return to the library.</p>':''}${rows.length>limit?'<button class="crystal-button" id="libraryLoadMore" type="button">Show more entries</button>':''}</section>`:''}
    </div>`;
    byId('librarySearch')?.addEventListener('input',event=>{query=event.target.value;limit=48;render();route(false);});
    byId('libraryLoadMore')?.addEventListener('click',()=>{limit+=48;render();});
    if(focusId==='librarySearch'){const input=byId(focusId);input?.focus({preventScroll:true});if(typeof selection==='number')input?.setSelectionRange?.(selection,selection);}
    else if(favouriteId){[...view.querySelectorAll('[data-library-favourite]')].find(button=>button.dataset.libraryFavourite===favouriteId)?.focus({preventScroll:true});}
    else if(focusId==='libraryLoadMore'){byId(focusId)?.focus({preventScroll:true});}
  }
  function setQuick(open,focus=false){
    const toggle=byId('compendiumQuickToggle'),menu=byId('compendiumQuickMenu');if(!toggle||!menu)return;
    menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
    if(open&&focus)menu.querySelector('a')?.focus();
  }
  function syncNavigation(){
    const visible=id=>Boolean(byId(id)?.getClientRects?.().length);
    const workspace=visible('asteria-workspace-shell');
    const mode=byId('auth-workspace-mode-filter')?.value;
    const states={
      sidebarHomeButton:visible('home') || workspace&&mode==='dashboard',
      compendiumIndexButton:visible('compendiumLibrary') || visible('universal-compendium-shell'),
      characterForgeTop:visible('phase3GameplayShell') && byId('phase3GameplayShell')?.classList.contains('phase3-forge-shell'),
      campaignsTop:workspace&&mode==='campaigns',
      accountSettingsTop:workspace&&mode==='settings'
    };
    Object.entries(states).forEach(([id,current])=>{const button=byId(id);if(button){button.setAttribute('aria-current',current?'page':'false');button.classList.toggle('active',Boolean(current));}});
  }
  function bind(){
    const menu=byId('compendiumQuickMenu');
    if(menu)menu.innerHTML=`<p class="eyebrow">Asteria Compendium</p>${GROUPS.map(g=>`<a href="${href(g.id)}"><span aria-hidden="true">${g.symbol}</span>${escape(g.title)}</a>`).join('')}<a class="quick-index-link" href="${href()}">Open the full library →</a>`;
    byId('compendiumQuickToggle')?.addEventListener('click',()=>setQuick(menu.hidden));
    byId('compendiumQuickToggle')?.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setQuick(true,true);}});
    menu?.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setQuick(false);byId('compendiumQuickToggle')?.focus();}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();const links=[...menu.querySelectorAll('a')],index=links.indexOf(document.activeElement);
        links[event.key==='Home'?0:event.key==='End'?links.length-1:(index+(event.key==='ArrowDown'?1:-1)+links.length)%links.length]?.focus();
      }
    });
    document.addEventListener('click',event=>{
      const account=event.target.closest?.('#accountSettingsTop');
      if(account){event.preventDefault();event.stopImmediatePropagation();closePanels();window.AsteriaWorkspace?.openDashboard?.('settings');return;}
      const link=event.target.closest?.('a[href^="#/compendium"]');
      if(link&&/^#\/compendium(?:\?|$)/.test(link.getAttribute('href'))){
        event.preventDefault();event.stopImmediatePropagation();const params=new URLSearchParams(link.getAttribute('href').split('?')[1]||'');
        show({group:params.get('group')||'',category:params.get('category')||'',search:params.get('q')||''});return;
      }
      const favourite=event.target.closest?.('[data-library-favourite]');
      if(favourite){const id=favourite.dataset.libraryFavourite,ids=readSaved('favourites');if(entries().some(e=>e.id===id)){save('favourites',ids.includes(id)?ids.filter(x=>x!==id):[id,...ids]);render();}return;}
      if(event.target.closest?.('#globalNavigation a,#globalNavigation button,#accountControls button')&&!event.target.closest?.('#compendiumQuickToggle'))closePanels();
      if(!event.target.closest?.('.compendium-split'))setQuick(false);
    },true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu?.hidden){setQuick(false);byId('compendiumQuickToggle')?.focus();}});
    document.addEventListener('focusin',event=>{if(!event.target.closest?.('.compendium-split'))setQuick(false);});
    const desktopNavParent=byId('globalNavigation')?.parentElement,desktopAccountsParent=byId('accountControls')?.parentElement;
    const media=window.matchMedia('(max-width: 1679px)');
    const alignHeader=()=>{
      if(media.matches)return;
      const nav=byId('globalNavigation'),trigger=byId('compendiumQuickToggle');
      if(!nav||!trigger)return;
      const row=nav.getBoundingClientRect(),marker=trigger.getBoundingClientRect();
      nav.style.setProperty('--compendium-trigger-offset',`${marker.left+marker.width/2-row.left}px`);
    };
    const reflow=()=>{
      closePanels();
      const nav=byId('globalNavigation'),accounts=byId('accountControls');
      if(media.matches){byId('mobileNavigationSlot')?.appendChild(nav);byId('mobileAccountSlot')?.appendChild(accounts);}
      else{desktopNavParent?.insertBefore(nav,desktopAccountsParent);desktopAccountsParent?.insertBefore(accounts,byId('settingsToggle'));}
      byId('settingsToggle')?.setAttribute('aria-label',media.matches?'Open main menu':'Open menu and appearance');
      alignHeader();
    };
    media.addEventListener('change',reflow);reflow();
    window.addEventListener('resize',alignHeader);
    if(window.ResizeObserver&&byId('globalNavigation'))new window.ResizeObserver(alignHeader).observe(byId('globalNavigation'));
    document.fonts?.ready.then(alignHeader);
    window.addEventListener('hashchange',()=>{readRoute();closePanels();});
    window.addEventListener('popstate',readRoute);
    window.addEventListener('asteria:custom-items-updated',()=>{if(byId('compendiumLibrary')?.classList.contains('show'))render();});
    // Logout/account changes must not leave another account's saved-page list visible.
    new MutationObserver(()=>{if(byId('compendiumLibrary')?.classList.contains('show'))render();syncNavigation();}).observe(document.body,{attributes:true,attributeFilter:['data-role']});
    // Home and legacy workspaces can change views without changing the hash.
    const main=byId('mainContent');
    if(main)new MutationObserver(records=>{if(records.some(record=>record.type==='childList'||record.target.classList?.contains('view')))syncNavigation();}).observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    window.AsteriaViewHooks?.afterView?.('top-navigation-state',null,syncNavigation,{defer:false});
    readRoute();
  }
  window.addEventListener('asteria:compendium-viewed',event=>{const id=event.detail?.id;if(id&&entries().some(e=>e.id===id))save('recent',[id,...readSaved('recent').filter(x=>x!==id)]);});
  window.AsteriaLibrary=Object.freeze({groups:GROUPS,categories:CATEGORIES,classify,entries,filtered,open:show,readRoute});
  function boot(){
    if(!byId('compendiumLibrary')){const view=document.createElement('section');view.id='compendiumLibrary';view.className='view';view.setAttribute('aria-label','Asteria Compendium library');byId('mainContent')?.appendChild(view);}
    bind();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
