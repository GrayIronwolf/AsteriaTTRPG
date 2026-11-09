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
  let query='', groupId='', categoryId='', savedOnly=false, sortMode='relevance', limit=48, reading=false;
  let searchFrame=0;
  function libraryAccountKey(){
    // The signed-in session is authoritative. Firebase may briefly retain
    // the previous user while a logout transition is still being processed.
    try{
      const session=window.AsteriaAuthBridge?.getSession?.() || window.session || {};
      if(session.role==='guest'&&!session.uid&&!session.account)return 'guest';
      return String(session.uid || session.account || window.session?.uid ||
        window.AsteriaFirebase?.getUser?.()?.uid || 'guest');
    }catch{return 'guest';}
  }
  const storageKey = kind=>`asteria.library.${kind}.${libraryAccountKey()}`;
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
  const allowedSorts = ['relevance','name','category'];
  const normal = value => String(value ?? '').trim().toLocaleLowerCase();
  const titleSort = (a,b) => String(a.title||'').localeCompare(String(b.title||''),undefined,{sensitivity:'base'});
  const definitionCode = entry => String(entry.metadata?.['Asteria ID Index Code'] || '');
  function matchesSearch(entry,search){
    const q=normal(search);
    if(!q)return true;
    const code=normal(definitionCode(entry));
    // Whole permanent IDs have one unambiguous result; partial IDs also
    // support browsing a system/category prefix without changing ID identity.
    if(/^\d{2}-\d{2}-\d{3}-\d{3}$/.test(q))return code===q;
    if(/^\d{2}(?:-\d{1,3}){1,3}-?$/.test(q) && code.startsWith(q))return true;
    if(window.AsteriaContent?.matches?.(entry,q))return true;
    const haystack=[
      entry.title,entry.summary,entry.description,entry.searchTerms,definitionCode(entry),
      ...(Array.isArray(entry.aliases)?entry.aliases:[]),
      ...(Array.isArray(entry.tags)?entry.tags:[]),
      ...(Array.isArray(entry.categoryPath)?entry.categoryPath:[])
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    return q.split(/\s+/).every(word=>haystack.includes(word));
  }
  function resultPriority(entry){
    if(!normal(query))return 5;
    const q=normal(query),title=normal(entry.title),code=normal(definitionCode(entry));
    if(code===q)return 0;
    if(title===q)return 1;
    if(title.startsWith(q))return 2;
    if(title.includes(q))return 3;
    if(Array.isArray(entry.aliases)&&entry.aliases.some(alias=>normal(alias).includes(q)))return 4;
    return 5;
  }
  function filtered(){
    const favouriteIds=savedOnly?new Set(readSaved('favourites')):null;
    const rows=entries().filter(entry=>{
      const category=classify(entry);
      if(categoryId && category!==categoryId)return false;
      if(groupId && CATEGORIES.find(c=>c.id===category)?.group!==groupId)return false;
      if(favouriteIds && !favouriteIds.has(entry.id))return false;
      return matchesSearch(entry,query);
    });
    if(sortMode==='name')return rows.sort(titleSort);
    if(sortMode==='category')return rows.sort((a,b)=>
      String(CATEGORIES.find(c=>c.id===classify(a))?.title||'').localeCompare(
        String(CATEGORIES.find(c=>c.id===classify(b))?.title||'')) || titleSort(a,b));
    if(normal(query))return rows.sort((a,b)=>resultPriority(a)-resultPriority(b)||titleSort(a,b));
    return rows;
  }
  function href(group='',category='',q='',saved=false,sort='relevance'){
    const params=new URLSearchParams();
    if(group)params.set('group',group);
    if(category)params.set('category',category);
    if(q)params.set('q',q);
    if(saved)params.set('saved','1');
    if(allowedSorts.includes(sort)&&sort!=='relevance')params.set('sort',sort);
    return '#/compendium'+(params.size?'?'+params:'');
  }
  function closePanels(){setQuick(false);window.closeSettings?.();}
  function route(push=true){
    const url=href(groupId,categoryId,query,savedOnly,sortMode);
    if(!reading && window.location.hash!==url)window.history[push?'pushState':'replaceState'](window.history.state,'',url);
    syncNavigation();
  }
  function show({group='',category='',search='',saved=false,sort='relevance',push=true}={}){
    if(searchFrame && window.cancelAnimationFrame)window.cancelAnimationFrame(searchFrame);
    searchFrame=0;
    groupId=GROUPS.some(g=>g.id===group)?group:'';
    categoryId=CATEGORIES.some(c=>c.id===category)?category:'';
    if(categoryId)groupId=CATEGORIES.find(c=>c.id===categoryId).group;
    query=String(search||'');savedOnly=saved===true||saved==='1';sortMode=allowedSorts.includes(sort)?sort:'relevance';limit=48;closePanels();
    window.setView?.('compendiumLibrary');
    document.querySelectorAll('.view').forEach(view=>view.classList.toggle('show',view.id==='compendiumLibrary'));
    document.body.classList.remove('workspace-active','compendium-active');
    render();route(push);return true;
  }
  function readRoute(){
    const [path,params='']=window.location.hash.replace(/^#/,'').split('?');
    if(!/^\/?compendium\/?$/.test(path)){syncNavigation();return false;}
    const p=new URLSearchParams(params);reading=true;
    try{return show({group:p.get('group')||'',category:p.get('category')||'',search:p.get('q')||'',saved:p.get('saved')==='1',sort:p.get('sort')||'relevance',push:false});}
    finally{reading=false;}
  }
  function cards(rows){
    const saved=new Set(readSaved('favourites'));
    return rows.map(entry=>{
      const category=CATEGORIES.find(c=>c.id===classify(entry));
      const code=definitionCode(entry);
      const path=Array.isArray(entry.categoryPath)?entry.categoryPath.filter(Boolean).slice(0,3):[];
      const summary=String(entry.summary||entry.description||'').trim().slice(0,170);
      return '<article class="library-entry"><a href="#'+escape(entry.route)+'" data-library-entry="'+escape(entry.id)+'">'+
        '<span class="library-entry-kind">'+escape(category?.title||entry.domain)+'</span>'+
        '<h3>'+escape(entry.title)+'</h3>'+
        (summary?'<p>'+escape(summary)+'</p>':'<p class="library-entry-no-summary">Open to view this definition.</p>')+
        (path.length?'<span class="library-entry-path">'+escape(path.join(' / '))+'</span>':'')+
        (code?'<span class="library-entry-code" title="Permanent Asteria ID Index Code">'+escape(code)+'</span>':'')+
        '<span class="library-entry-open">View definition</span></a>'+
        '<button type="button" class="library-favourite" data-library-favourite="'+escape(entry.id)+'" aria-label="'+
        (saved.has(entry.id)?'Remove':'Add')+' '+escape(entry.title)+' '+(saved.has(entry.id)?'from':'to')+
        ' favourites" aria-pressed="'+saved.has(entry.id)+'">'+(saved.has(entry.id)?'★':'☆')+'</button></article>';
    }).join('');
  }
  function render(){
    const view=byId('compendiumLibrary');if(!view)return;
    const focused=document.activeElement,focusId=focused?.id,selection=focused?.selectionStart;
    const favouriteId=focused?.dataset?.libraryFavourite;
    const rows=filtered(),all=entries(),group=GROUPS.find(g=>g.id===groupId),category=CATEGORIES.find(c=>c.id===categoryId);
    const recent=readSaved('recent').map(id=>all.find(e=>e.id===id)).filter(Boolean).slice(0,6);
    const favourites=readSaved('favourites').map(id=>all.find(e=>e.id===id)).filter(Boolean);
    const showResults=Boolean(query||groupId||categoryId||savedOnly||sortMode!=='relevance');
    const byCategory=new Map(),byGroup=new Map();
    for(const entry of all){
      const cat=classify(entry),parent=CATEGORIES.find(c=>c.id===cat)?.group;
      byCategory.set(cat,(byCategory.get(cat)||0)+1);
      if(parent)byGroup.set(parent,(byGroup.get(parent)||0)+1);
    }
    const categoryOptions=CATEGORIES.filter(c=>!groupId||c.group===groupId);
    const filterBar='<section class="library-filter-bar" role="group" aria-label="Compendium filters">'+
      '<label for="libraryGroupFilter">Section<select id="libraryGroupFilter"><option value="">All sections</option>'+
      GROUPS.map(g=>'<option value="'+escape(g.id)+'" '+(g.id===groupId?'selected':'')+'>'+escape(g.title)+' ('+(byGroup.get(g.id)||0)+')</option>').join('')+
      '</select></label><label for="libraryCategoryFilter">Category<select id="libraryCategoryFilter"><option value="">All categories</option>'+
      categoryOptions.map(c=>'<option value="'+escape(c.id)+'" '+(c.id===categoryId?'selected':'')+'>'+escape(c.title)+' ('+(byCategory.get(c.id)||0)+')</option>').join('')+
      '</select></label><label for="librarySort">Sort<select id="librarySort">'+
      allowedSorts.map(value=>'<option value="'+value+'" '+(value===sortMode?'selected':'')+'>'+({relevance:'Relevance',name:'Name A–Z',category:'Category'})[value]+'</option>').join('')+
      '</select></label><label class="library-saved-filter" for="librarySavedOnly"><input id="librarySavedOnly" type="checkbox" '+(savedOnly?'checked':'')+'><span>Favourites only</span></label>'+
      (showResults?'<a class="library-clear-filters" href="'+href()+'">Clear filters</a>':'')+'</section>';
    view.innerHTML=`<div class="asteria-library">
      <header class="library-hero"><p class="eyebrow">The Asteria Library</p><h1>Asteria Compendium</h1><p>Explore the rules, characters and worlds of Asteria.</p></header>
      <nav class="library-breadcrumbs" aria-label="Compendium breadcrumbs"><a href="${href()}">Asteria Compendium</a>${group?`<span aria-hidden="true">/</span><a href="${href(groupId)}">${escape(group.title)}</a>`:''}${category?`<span aria-hidden="true">/</span><span aria-current="page">${escape(category.title)}</span>`:''}</nav>
      <label class="library-search" for="librarySearch"><span>${category?`Search ${escape(category.title)}`:group?`Search ${escape(group.title)}`:'Search the entire Compendium'}</span><input id="librarySearch" type="search" value="${escape(query)}" placeholder="Find a rule, race, spell, item or definition ID…" autocomplete="off" aria-describedby="librarySearchHelp"></label>
      <p class="library-search-help" id="librarySearchHelp">Search by name, alias, keyword or permanent Asteria ID. A prefix such as 07-05 also works.</p>
      ${filterBar}
      ${!query&&!categoryId&&!savedOnly?`<div class="library-groups">${GROUPS.filter(g=>!groupId||g.id===groupId).map(g=>{
        const count=all.filter(e=>CATEGORIES.find(c=>c.id===classify(e))?.group===g.id).length;
        return `<section class="library-group"><div class="library-group-heading"><span aria-hidden="true">${g.symbol}</span><div><h2>${escape(g.title)}</h2><p>${escape(g.description)}</p></div></div><small>${count} published entries</small><details ${groupId?'open':''}><summary>Browse categories</summary><ul>${g.categories.map(([code,id,title])=>{
          const count=all.filter(e=>classify(e)===id).length;
          return `<li>${count?`<a href="${href(g.id,id)}"><span>${escape(title)}</span><small>${count}</small></a>`:`<span class="library-unavailable"><span>${escape(title)}</span><small>No published entries</small></span>`}</li>`;
        }).join('')}</ul></details></section>`;
      }).join('')}</div>`:''}
      ${!showResults&&favourites.length?`<section class="library-collection"><h2>Favourites</h2><div class="library-results">${cards(favourites)}</div></section>`:''}
      ${!showResults&&recent.length?`<section class="library-collection"><h2>Recently viewed</h2><div class="library-results">${cards(recent)}</div></section>`:''}
      ${showResults?`<section class="library-collection"><h2>${category?escape(category.title):group?escape(group.title):'Search results'}</h2><p id="libraryResultCount" role="status" aria-live="polite">${rows.length} matching ${rows.length===1?'entry':'entries'} · Showing ${Math.min(limit,rows.length)}${savedOnly?' · Favourites only':''}</p><div class="library-results">${cards(rows.slice(0,limit))}</div>${!rows.length?'<p class="library-empty">No published entries match the selected filters. Clear filters or try another search.</p>':''}${rows.length>limit?'<button class="crystal-button" id="libraryLoadMore" type="button">Show more entries</button>':''}</section>`:''}
    </div>`;
    byId('librarySearch')?.addEventListener('input',event=>{
      query=event.target.value;
      limit=48;
      // Coalesce keystrokes within one paint frame. Rebuilding the entire
      // library and normalising all search results on every input event is costly.
      if(searchFrame && window.cancelAnimationFrame)window.cancelAnimationFrame(searchFrame);
      if(window.requestAnimationFrame)searchFrame=window.requestAnimationFrame(()=>{
        searchFrame=0;render();route(false);
      });
      else {searchFrame=0;render();route(false);}
    });
    byId('libraryGroupFilter')?.addEventListener('change',event=>{
      groupId=GROUPS.some(g=>g.id===event.target.value)?event.target.value:'';
      if(categoryId&&CATEGORIES.find(c=>c.id===categoryId)?.group!==groupId)categoryId='';
      limit=48;render();route(false);
    });
    byId('libraryCategoryFilter')?.addEventListener('change',event=>{
      categoryId=CATEGORIES.some(c=>c.id===event.target.value)?event.target.value:'';
      if(categoryId)groupId=CATEGORIES.find(c=>c.id===categoryId).group;
      limit=48;render();route(false);
    });
    byId('librarySort')?.addEventListener('change',event=>{
      sortMode=allowedSorts.includes(event.target.value)?event.target.value:'relevance';
      limit=48;render();route(false);
    });
    byId('librarySavedOnly')?.addEventListener('change',event=>{
      savedOnly=Boolean(event.target.checked);limit=48;render();route(false);
    });
    byId('libraryLoadMore')?.addEventListener('click',()=>{limit+=48;render();});
    if(focusId==='librarySearch'){const input=byId(focusId);input?.focus({preventScroll:true});if(typeof selection==='number')input?.setSelectionRange?.(selection,selection);}
    else if(favouriteId){[...view.querySelectorAll('[data-library-favourite]')].find(button=>button.dataset.libraryFavourite===favouriteId)?.focus({preventScroll:true});}
    else if(focusId==='libraryLoadMore'){byId(focusId)?.focus({preventScroll:true});}
    else if(['libraryGroupFilter','libraryCategoryFilter','librarySort','librarySavedOnly'].includes(focusId)){byId(focusId)?.focus?.({preventScroll:true});}
  }
  function refreshAccount(){
    // Explicitly invoked by authentication even when account->account keeps
    // the same data-role attribute and MutationObserver cannot detect it.
    if(byId('compendiumLibrary')?.classList.contains('show'))render();
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
        show({group:params.get('group')||'',category:params.get('category')||'',search:params.get('q')||'',saved:params.get('saved')==='1',sort:params.get('sort')||'relevance'});return;
      }
      const favourite=event.target.closest?.('[data-library-favourite]');
      if(favourite){const id=favourite.dataset.libraryFavourite,ids=readSaved('favourites');if(entries().some(e=>e.id===id)){save('favourites',ids.includes(id)?ids.filter(x=>x!==id):[id,...ids]);render();}return;}
      // Account menu controls must not close the mobile settings drawer before
      // their click handler opens the nested menu or activates an item.
      if(event.target.closest?.('#globalNavigation a,#globalNavigation button,#accountControls button') &&
         !event.target.closest?.('#compendiumQuickToggle,.asteria-account-menu-wrap'))closePanels();
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
    // Favourites/recent items changed in another tab are reflected immediately.
    window.addEventListener('storage',event=>{
      if((event.key===null || event.key===storageKey('favourites') || event.key===storageKey('recent')) &&
        byId('compendiumLibrary')?.classList.contains('show'))render();
    });
    // Logout/account changes must not leave another account's saved-page list visible.
    new MutationObserver(()=>{if(byId('compendiumLibrary')?.classList.contains('show'))render();syncNavigation();}).observe(document.body,{attributes:true,attributeFilter:['data-role']});
    // Home and legacy workspaces can change views without changing the hash.
    const main=byId('mainContent');
    const viewSelector='.view,#asteria-workspace-shell,#universal-compendium-shell,#phase3GameplayShell';
    if(main)new MutationObserver(records=>{if(records.some(record=>record.target.matches?.(viewSelector)||(record.type==='childList'&&[...record.addedNodes,...record.removedNodes].some(node=>node.matches?.(viewSelector)))))syncNavigation();}).observe(main,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    window.AsteriaViewHooks?.afterView?.('top-navigation-state',null,syncNavigation,{defer:false});
    readRoute();
  }
  window.addEventListener('asteria:compendium-viewed',event=>{const id=event.detail?.id;if(id&&entries().some(e=>e.id===id))save('recent',[id,...readSaved('recent').filter(x=>x!==id)]);});
  window.AsteriaLibrary=Object.freeze({groups:GROUPS,categories:CATEGORIES,classify,entries,filtered,open:show,readRoute,matchesSearch,refreshAccount});
  function boot(){
    if(!byId('compendiumLibrary')){const view=document.createElement('section');view.id='compendiumLibrary';view.className='view';view.setAttribute('aria-label','Asteria Compendium library');byId('mainContent')?.appendChild(view);}
    bind();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
