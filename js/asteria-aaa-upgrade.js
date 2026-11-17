/* Asteria Website polish: additive navigation and Home experience.
   Gameplay, Firestore identities, campaigns and private media remain owned by
   their existing controllers. This file only projects existing UI routes. */
(function (window, document) {
  'use strict';
  const $ = id => document.getElementById(id);
  const $all = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const INTERVAL = 15000;
  const MENUS = [
    { id:'handbook', trigger:'asteriaHandbookTop', title:'Asteria Handbook', entries:[
      ['Asteria Players Guide','Player guides and advice','library','rules','handbook',''],
      ['Asteria GM Guide','Game Master resources','library','adventures','gm',''],
      ['Rules','Foundational game rules','library','rules','core',''],
      ['Systems','Game systems and mechanics','library','rules','',''],
      ['Quests','Quest and adventure reference','library','adventures','quests',''],
      ['Campaigns','Campaign guidance','library','adventures','','']
    ]},
    { id:'world', trigger:'worldLoreTop', title:'Worlds & Lore', entries:[
      ['Worlds','Explore the world','library','world','worlds','World'],
      ['Realms','The realms of Asteria','library','world','worlds','Realm'],
      ['Planes','The planes of existence','library','world','worlds','Plane'],
      ['Theology','Gods and pantheons','library','world','theology',''],
      ['NPC','People of Asteria','library','world','npcs',''],
      ['Lore','History and stories','library','world','lore',''],
      ['Languages','Spoken and written languages','library','world','languages',''],
      ['Factions','Guilds and factions','library','world','factions','']
    ]},
    { id:'compendium', trigger:'compendiumIndexButton', title:'Asteria Compendium', entries:[
      ['Races','Playable peoples','library','characters','races',''],
      ['Classes','Character classes','library','characters','classes',''],
      ['Magical & Element','Magic and elemental reference','library','characters','magic',''],
      ['Resources','Materials and resources','library','equipment','resources',''],
      ['Blueprints','Construction blueprints','library','crafting','blueprints',''],
      ['Recipes','Recipes and crafting','library','crafting','recipes',''],
      ['Schematics','Schematics and plans','library','crafting','schematics',''],
      ['Patterns','Crafting patterns','library','crafting','patterns',''],
      ['Formulas','Formulas and procedures','library','crafting','formulas',''],
      ['Design','Designs and drawings','library','crafting','designs','']
    ]},
    { id:'characters', trigger:'characterForgeTop', title:'Character Forge', entries:[
      ['Forge a Character','Create a new hero','forge','','',''],
      ['My Characters','Your saved characters','characters','','','']
    ]},
    { id:'campaigns', trigger:'campaignsTop', title:'Campaign Forge', entries:[
      ['Forge A Campaign','Create a new campaign','campaign-new','','',''],
      ['My Campaigns','Your campaigns','campaigns','','',''],
      ['Join A Campaign','Enter your 12-digit UCN','campaign-join','','','']
    ]},
    { id:'friends', trigger:'asteriaFriendsTop', title:'Friends', entries:[
      ['My Friends','Friends, requests and profiles','friends','','',''],
      ['Chats','Your campaign conversations','chats','','','']
    ]},
    { id:'account', trigger:'loginToggle', title:'Account', entries:[
      ['Profile','Your profile','account','profile','',''],
      ['Account Settings','Account preferences','account','settings','',''],
      ['Appearance','Website appearance','account','appearance','',''],
      ['Password & Security','Account protection','account','security','','']
    ]}
  ];
  let activeMenu = null;
  let menuTrigger = null;
  let timer = null;
  let slideIndex = 0;
  let carouselVisible = true;
  let carouselHover = false;
  let carouselFocus = false;
  let carouselInteracted = false;
  let libraryScheduled = false;
  let libraryMenuContext = '';
  let libraryMenuSelection = '';
  let friendSection = 'friends';

  function isLoggedIn() {
    return Boolean(window.AsteriaAuthBridge?.isLoggedIn?.() || window.session?.uid);
  }
  function showLogin() { window.setView?.('loginPage'); }
  function requireAccount(fn) {
    if (!isLoggedIn()) { showLogin(); return; }
    fn();
  }
  function openCampaignMode(kind) {
    const api=window.AsteriaWorkspace;
    if(kind==='campaign-new' && typeof api?.openCampaignCreateForm==='function')
      return api.openCampaignCreateForm();
    if(kind==='campaign-join' && typeof api?.openCampaignJoinForm==='function')
      return api.openCampaignJoinForm();
    if(typeof api?.openDashboard==='function'){
      api.openDashboard('campaigns');
      if(kind==='campaign-join'){
        const input=$('workspaceJoinCampaignCode');
        input?.scrollIntoView?.({block:'center'});
        input?.focus?.({preventScroll:true});
      }
      return true;
    }
    return window.AsteriaRouter?.openCampaignHub?.();
  }
  function navigate(entry, sourceMenu = '') {
    const [title, description, kind, a, b, c] = entry;
    void description;
    if (kind === 'library') {
      libraryMenuContext = sourceMenu || (a==='world'?'world':a==='rules'||a==='adventures'?'handbook':'compendium');
      libraryMenuSelection = title;
      if (window.AsteriaLibrary?.open) window.AsteriaLibrary.open({group:a,category:b,search:c});
      else {
        const params=new URLSearchParams();
        if(a)params.set('group',a);
        if(b)params.set('category',b);
        if(c)params.set('q',c);
        window.location.hash='#/compendium'+(params.size?'?'+params.toString():'');
      }
      scheduleLibrary();
      return;
    }
    if (kind === 'friends' || kind === 'chats') {
      requireAccount(()=>showFriendSection(kind==='chats'?'chats':'friends'));
      return;
    }
    if (kind === 'account') { requireAccount(() => window.AsteriaAccountPages?.openSection?.(a)); return; }
    if (kind === 'forge') {
      requireAccount(() => {
        if (typeof window.AsteriaGameplay?.openCharacterForgeHub === 'function') window.AsteriaGameplay.openCharacterForgeHub();
        else window.AsteriaWorkspace?.openCharacterForge?.();
      });
      return;
    }
    if (kind === 'characters') {
      requireAccount(() => {
        if (typeof window.AsteriaWorkspace?.openDashboard === 'function') window.AsteriaWorkspace.openDashboard('characters');
        else window.AsteriaGameplay?.openCharacterForgeHub?.();
      });
      return;
    }
    if (['campaigns','campaign-new','campaign-join'].includes(kind))
      requireAccount(() => openCampaignMode(kind));
  }
  function showFriendSection(section) {
    prepareFriendSections();
    friendSection=section==='chats'?'chats':'friends';
    window.AsteriaAccountPages?.open?.('friends');
    const host=$('aaaFriendsBody');
    if(!host)return;
    const friends=$('asteriaFriendsPageMount'),chats=$('aaaFriendsChatPanel');
    if(friends)friends.hidden=friendSection!=='friends';
    if(chats)chats.hidden=friendSection!=='chats';
    $all('[data-aaa-friend-section]',host).forEach(button=>{
      const active=button.dataset.aaaFriendSection===friendSection;
      button.classList.toggle('is-current',active);
      button.setAttribute('aria-current',active?'page':'false');
    });
  }
  function prepareFriendSections(){
    const friends=$('asteriaFriendsPage'), mount=$('asteriaFriendsPageMount');
    if(!friends||!mount||$('aaaFriendsBody'))return;
    const holder=document.createElement('div');holder.id='aaaFriendsBody';
    const nav=document.createElement('nav');nav.id='aaaFriendsTopTabs';
    nav.setAttribute('aria-label','Friends sections');
    for(const [label,section] of [['My Friends','friends'],['Chats','chats']]){
      const button=document.createElement('button');
      button.type='button';button.dataset.aaaFriendSection=section;
      button.textContent=label;button.className='aaa-category-link';
      button.addEventListener('click',()=>showFriendSection(section));
      nav.appendChild(button);
    }
    const chats=document.createElement('section');
    chats.id='aaaFriendsChatPanel';chats.setAttribute('aria-label','Chats');chats.hidden=true;
    chats.className='aaa-friends-chat-panel';
    const title=document.createElement('h2');title.textContent='Chats';
    const info=document.createElement('p');
    info.textContent='Live party chat is available inside a linked character’s Party dashboard during an active session. Private friend-to-friend messaging has not been enabled.';
    const action=document.createElement('button');action.type='button';
    action.className='aaa-chat-open';action.textContent='Open my Party Dashboard';
    action.addEventListener('click',()=>requireAccount(()=>{
      if(typeof window.AsteriaRouter?.openPlayerDashboard==='function')
        window.AsteriaRouter.openPlayerDashboard();
      else window.AsteriaWorkspace?.openDashboard?.('campaigns');
    }));
    const other=document.createElement('button');other.type='button';
    other.className='aaa-chat-open';other.textContent='Browse My Campaigns';
    other.addEventListener('click',()=>requireAccount(()=>openCampaignMode('campaigns')));
    chats.append(title,info,action,other);
    mount.before(holder);
    holder.append(nav,mount,chats);
    friendSection='friends';
    nav.querySelector('[data-aaa-friend-section="friends"]')?.classList.add('is-current');
    nav.querySelector('[data-aaa-friend-section="friends"]')?.setAttribute('aria-current','page');
  }

  function prepareMenu() {
    if ($('aaaMegaMenu')) return;
    const mask = document.createElement('button');
    mask.id = 'aaaMegaBackdrop'; mask.type = 'button';
    mask.className = 'aaa-mega-backdrop'; mask.hidden = true;
    mask.setAttribute('aria-label','Close navigation menu');
    mask.addEventListener('click', () => closeMenu());
    const panel = document.createElement('section');
    panel.id = 'aaaMegaMenu'; panel.className = 'aaa-mega-menu';
    panel.setAttribute('aria-label','Website navigation choices');
    panel.setAttribute('role','region'); panel.hidden = true;
    panel.innerHTML = '<div class="aaa-mega-heading"><h2 id="aaaMegaTitle"></h2><label class="aaa-mega-search"><span class="aaa-visually-hidden">Search menu choices</span><input id="aaaMegaSearch" type="search" placeholder="Find a section..." autocomplete="off" aria-label="Search menu choices"></label><button type="button" id="aaaMegaClose" aria-label="Close navigation">\u00d7</button></div><div class="aaa-mega-grid" id="aaaMegaCards"></div>';
    document.body.append(mask, panel);
    $('aaaMegaClose')?.addEventListener('click', () => closeMenu(true));
    $('aaaMegaSearch')?.addEventListener('input',event=>{
      const q=String(event.target.value||'').trim().toLowerCase();
      $all('.aaa-nav-card',$('aaaMegaCards')).forEach(card=>{card.hidden=Boolean(q)&&!card.textContent.toLowerCase().includes(q);});
    });
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') {event.preventDefault();closeMenu(true);}
      if (event.key === 'Tab') {
        const controls = $all('button:not([disabled])', panel);
        if (!controls.length) return;
        if (event.shiftKey && document.activeElement === controls[0]) {event.preventDefault();controls.at(-1)?.focus();}
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) {event.preventDefault();controls[0]?.focus();}
      }
    });
  }
  function closeMenu(restoreFocus = false) {
    $('aaaMegaMenu')?.setAttribute('hidden','');
    $('aaaMegaBackdrop')?.setAttribute('hidden','');
    for (const {trigger} of MENUS) $(trigger)?.setAttribute('aria-expanded','false');
    activeMenu = null;
    if (restoreFocus) menuTrigger?.focus?.({preventScroll:true});
  }
  function openMenu(menu, trigger) {
    if (activeMenu === menu.id) {closeMenu(true);return;}
    window.closeSettings?.();
    window.AsteriaAccountMenu?.close?.();
    prepareMenu();
    activeMenu = menu.id;
    menuTrigger = trigger;
    const panel = $('aaaMegaMenu'), mask = $('aaaMegaBackdrop'), holder = $('aaaMegaCards');
    $('aaaMegaTitle').textContent = menu.title;
    holder.replaceChildren();
    const visibleEntries=menu.entries.filter(entry=>entry[2]!=='characters'||isLoggedIn());
    visibleEntries.forEach((entry, index) => {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'aaa-nav-card';
      card.dataset.category = menu.id; card.dataset.index = String(index);
      const artwork = document.createElement('span');
      artwork.className = 'aaa-nav-card-art'; artwork.setAttribute('aria-hidden','true');
      const label = document.createElement('span');
      label.className = 'aaa-nav-card-label'; label.textContent = entry[0];
      const summary = document.createElement('span');
      summary.className = 'aaa-nav-card-summary'; summary.textContent = entry[1];
      card.append(artwork, label, summary);
      card.setAttribute('aria-label', entry[0] + ': ' + entry[1]);
      card.addEventListener('click', () => {closeMenu();navigate(entry,menu.id);});
      holder.append(card);
    });
    if($('aaaMegaSearch'))$('aaaMegaSearch').value='';
    panel.dataset.menu=menu.id;
    panel.hidden = false; mask.hidden = false;
    for (const {trigger:id} of MENUS) $(id)?.setAttribute('aria-expanded', String(id === menu.trigger));
    holder.querySelector('button')?.focus({preventScroll:true});
  }
  function bindMenu() {
    prepareMenu();
    for (const menu of MENUS) {
      const trigger = $(menu.trigger);
      if (!trigger) continue;
      trigger.setAttribute('aria-haspopup','true');
      trigger.setAttribute('aria-controls','aaaMegaMenu');
      trigger.setAttribute('aria-expanded','false');
    }
    // Capture before the legacy Forge and Compendium click handlers, but only
    // for known primary header buttons. Existing destinations remain intact.
    document.addEventListener('click', event => {
      const target = event.target?.closest?.('#asteriaHandbookTop,#worldLoreTop,#compendiumIndexButton,#characterForgeTop,#campaignsTop,#asteriaFriendsTop,#loginToggle');
      if (!target) return;
      if (target.id === 'loginToggle' && !isLoggedIn()) return;
      const menu = MENUS.find(item => item.trigger === target.id);
      if (!menu) return;
      event.preventDefault(); event.stopImmediatePropagation();
      openMenu(menu, target);
    }, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && activeMenu) {event.preventDefault();closeMenu(true);}
    });
    window.addEventListener('popstate', () => closeMenu());
    window.addEventListener('hashchange', () => closeMenu());
    window.addEventListener('asteria:firebase-signed-out', () => closeMenu());
  }

  function setupCarousel() {
    const host = $('aaaHomeCarousel');
    if (!host) return;
    const slides = $all('.aaa-home-slide', host), dots = $all('.aaa-carousel-dot',host);
    const live = $('aaaCarouselAnnouncement');
    function active() {return !document.hidden && carouselVisible && !carouselHover && !carouselFocus && !REDUCED_MOTION?.matches && slides.length > 1;}
    function schedule() { if(timer) window.clearInterval(timer); timer = null; host.classList.toggle('aaa-carousel-paused', !active()); if(active()) timer = window.setInterval(() => update((slideIndex+1)%slides.length),INTERVAL); }
    function update(index) {
      if (!slides.length) return;
      slideIndex = (index+slides.length) % slides.length;
      slides.forEach((slide, i) => {
        const selected = i === slideIndex;
        slide.classList.toggle('is-active', selected);
        slide.setAttribute('aria-hidden', String(!selected));
        if (selected) slide.removeAttribute('inert'); else slide.setAttribute('inert','');
      });
      dots.forEach((dot,i)=>{dot.setAttribute('aria-selected',String(i === slideIndex));dot.setAttribute('aria-current',i === slideIndex?'true':'false');});
      if(live && carouselInteracted) live.textContent = 'Image '+(slideIndex+1)+' of '+slides.length;
      const progress=$('aaaCarouselProgress');
      if(progress){const bar=document.createElement('span');progress.replaceChildren(bar);}
      schedule();
    }
    dots.forEach((button,i)=>button.addEventListener('click',()=>{carouselInteracted=true;update(i);}));
    $('aaaCarouselPrevious')?.addEventListener('click',()=>{carouselInteracted=true;update(slideIndex-1);});
    $('aaaCarouselNext')?.addEventListener('click',()=>{carouselInteracted=true;update(slideIndex+1);});
    host.addEventListener('mouseenter',()=>{carouselHover=true;schedule();});
    host.addEventListener('mouseleave',()=>{carouselHover=false;schedule();});
    host.addEventListener('focusin',()=>{carouselFocus=true;schedule();});
    host.addEventListener('focusout',event=>{if(!host.contains(event.relatedTarget)){carouselFocus=false;schedule();}});
    document.addEventListener('visibilitychange',schedule);
    REDUCED_MOTION?.addEventListener?.('change',schedule);
    if('IntersectionObserver' in window){new window.IntersectionObserver(entries=>{carouselVisible=Boolean(entries[0]?.isIntersecting);schedule();},{threshold:0.1}).observe(host);}
    let touchX=null;
    host.addEventListener('touchstart',event=>{touchX=event.changedTouches?.[0]?.clientX ?? null;},{passive:true});
    host.addEventListener('touchend',event=>{
      if(touchX == null) return;
      const diff=(event.changedTouches?.[0]?.clientX ?? touchX)-touchX;
      if(Math.abs(diff)>60){carouselInteracted=true;update(slideIndex+(diff<0?1:-1));}
      touchX=null;
    },{passive:true});
    host.addEventListener('keydown',event=>{
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
      event.preventDefault();carouselInteracted=true;update(slideIndex+(event.key==='ArrowRight'?1:-1));
    });
    update(0);
    const returnButton=$('aaaContinueAdventure');
    if(returnButton){
      const sync=()=>{returnButton.hidden=!isLoggedIn();};
      returnButton.addEventListener('click',()=>navigate(['My Characters','','characters','','','']));
      window.addEventListener('asteria:auth-changed',sync);
      window.addEventListener('asteria:firebase-signed-out',sync);
      const account=$('loginToggle');
      if(account&&window.MutationObserver)new MutationObserver(sync).observe(account,{childList:true,subtree:true});
      sync();
    }
  }

  function currentLibraryRoute() {
    const raw=window.location.hash || '';
    const parts=raw.split('?');const params=new URLSearchParams(parts[1]||'');
    return {group:params.get('group')||'',category:params.get('category')||''};
  }
  function polishLibrary() {
    libraryScheduled = false;
    const view=$('compendiumLibrary');
    if(!view?.classList.contains('show'))return;
    const root=view.querySelector('.asteria-library'),hero=root?.querySelector('.library-hero');
    if(!root||!hero || hero.classList.contains('aaa-page-hero'))return;
    const search=root.querySelector('.library-search');
    const help=root.querySelector('.library-search-help');
    const filters=root.querySelector('.library-filter-bar');
    const route=currentLibraryRoute();
    const groups=window.AsteriaLibrary?.groups || [];
    const selected=groups.find(group=>group.id===route.group);
    const title=route.group==='rules'?'Asteria Handbook':route.group==='world'?'Worlds, Realms & Lore':'Asteria Compendium';
    hero.classList.add('aaa-page-hero');
    const h1=hero.querySelector('h1');if(h1)h1.textContent=title;
    hero.querySelector('.eyebrow')?.remove();
    hero.querySelector('p')?.remove();
    const tools=document.createElement('div');tools.className='aaa-page-search-tools';
    if(search)tools.appendChild(search);
    if(filters)tools.appendChild(filters);
    if(help){help.classList.add('aaa-visually-hidden');tools.appendChild(help);}
    hero.appendChild(tools);
    const structure=document.createElement('div');structure.className='aaa-library-layout';
    const sidebar=document.createElement('aside');sidebar.className='aaa-category-sidebar';sidebar.setAttribute('aria-label','Browse Asteria categories');
    const label=document.createElement('h2');label.textContent='Browse';sidebar.appendChild(label);
    const links=document.createElement('nav');links.className='aaa-category-links';
    const available=selected?selected.categories.map(([,id,title])=>({id,title,group:selected.id})):
      groups.map(group=>({id:'',title:group.title,group:group.id}));
    for(const item of available){
      const a=document.createElement('a');
      a.href='#/compendium?group='+encodeURIComponent(item.group)+(item.id?'&category='+encodeURIComponent(item.id):'');
      a.textContent=item.title;a.className='aaa-category-link';
      const selectedItem=item.id?route.category===item.id:route.group===item.group;
      if(selectedItem){a.classList.add('is-current');a.setAttribute('aria-current','page');}
      links.appendChild(a);
    }
    if(selected){const all=document.createElement('a');all.href='#/compendium?group='+encodeURIComponent(route.group);all.textContent='All '+selected.title;all.className='aaa-category-link';if(!route.category){all.classList.add('is-current');all.setAttribute('aria-current','page');}links.prepend(all);}
    sidebar.appendChild(links);
    const body=document.createElement('div');body.className='aaa-library-content';
    for(const el of Array.from(root.children)){
      if(el===hero || el.classList.contains('library-breadcrumbs'))continue;
      body.append(el);
    }
    structure.append(sidebar,body);root.append(structure);
  }
  function scheduleLibrary() {
    if(libraryScheduled)return;
    libraryScheduled=true;
    window.requestAnimationFrame?requestAnimationFrame(polishLibrary):polishLibrary();
  }
  function polishStaticPages() {
    prepareFriendSections();
    const friends=$('asteriaFriendsPage');
    if(friends){
      const heading=friends.querySelector('.asteria-page-heading');
      heading?.classList.add('aaa-page-hero');
      heading?.querySelector('.eyebrow')?.remove();
      heading?.querySelector('p')?.remove();
      const input=document.createElement('input');input.type='search';input.id='aaaFriendFilter';
      input.placeholder='Filter my visible friends';input.autocomplete='off';
      input.setAttribute('aria-label','Filter loaded friends by name or Account ID');
      const search=document.createElement('label');search.className='aaa-friend-filter';
      search.textContent='Filter friend cards';search.append(input);
      heading?.append(search);
      const list=$('accountFriendsAcceptedList');
      const filter=()=>{
        const term=input.value.trim().toLowerCase();
        $all('.asteria-accepted-friend-card',list||document).forEach(card=>{card.hidden=Boolean(term)&&!card.textContent.toLowerCase().includes(term);});
      };
      input.addEventListener('input',filter);
      if(list&&window.MutationObserver)new MutationObserver(filter).observe(list,{childList:true});
      const tabs=$('accountFriendsWorkspaceTabs');
      const mount=$('asteriaFriendsPageMount');
      if(tabs&&mount){tabs.classList.add('aaa-friends-tabs');}
    }
    const account=$('asteriaAccountPage');
    if(account&&!$('aaaAccountHero')){
      const hero=document.createElement('header');hero.id='aaaAccountHero';hero.className='aaa-page-hero';
      const title=document.createElement('h1');title.textContent='Account';hero.append(title);
      account.prepend(hero);
    }
    const pageTitles={
      'asteriaNotificationsPage':'Notifications',
      'characterSelect':'Character Forge',
      'campaigns':'Campaign Forge'
    };
    for(const [id,title] of Object.entries(pageTitles)){
      const page=$(id);if(!page||page.querySelector('.aaa-page-hero'))continue;
      const hero=document.createElement('header');hero.className='aaa-page-hero aaa-simple-page-hero';
      const h1=document.createElement('h1');h1.textContent=title;hero.append(h1);page.prepend(hero);
    }
    const campaigns=$('campaigns');
    const manager=campaigns?.querySelector('.campaign-manager');
    if(manager && !$('aaaCampaignSidebar')){
      const sidebar=document.createElement('nav');
      sidebar.id='aaaCampaignSidebar';sidebar.className='aaa-campaign-sidebar';
      sidebar.setAttribute('aria-label','Campaign Forge sections');
      const options=[
        ['My Campaigns',()=>requireAccount(()=>openCampaignMode('campaigns'))],
        ['Forge A Campaign',()=>requireAccount(()=>openCampaignMode('campaign-new'))],
        ['Join A Campaign',()=>requireAccount(()=>openCampaignMode('campaign-join'))]
      ];
      options.forEach(([name,action],i)=>{
        const button=document.createElement('button');button.type='button';
        button.className='aaa-campaign-nav-option';button.textContent=name;
        if(i===0){button.classList.add('is-current');button.setAttribute('aria-current','page');}
        button.addEventListener('click',()=>{action();sidebar.querySelectorAll('button').forEach(x=>{x.classList.remove('is-current');x.removeAttribute('aria-current');});button.classList.add('is-current');button.setAttribute('aria-current','page');});
        sidebar.append(button);
      });
      manager.prepend(sidebar);
    }
  }
  function hideLoadingToasts() {
    // Only suppress transient *loading* corner toasts, not failures or success.
    // Semantic status regions inside workspaces remain visible and accessible.
    const root=$('toast');
    if(!root || !window.MutationObserver)return;
    const update=()=>{
      const text=(root.textContent||'').trim().toLowerCase();
      root.classList.toggle('aaa-loading-toast-hidden', /^(loading|syncing|please wait|fetching)(\b|\.{1,3})/.test(text));
    };
    new MutationObserver(update).observe(root,{characterData:true,childList:true,subtree:true});
    update();
  }
  function startup() {
    bindMenu();setupCarousel();polishStaticPages();hideLoadingToasts();
    const library=$('compendiumLibrary');
    if(library&&window.MutationObserver)new MutationObserver(records=>{
      if(records.some(record=>record.type==='childList'))scheduleLibrary();
    }).observe(library,{childList:true,subtree:true});
    scheduleLibrary();
    window.addEventListener('hashchange',scheduleLibrary);
    // Ordinary root entry opens Home for guests and logged-in users. Preserve
    // explicit invitation, campaign, character and Compendium deep links.
    if (!window.location.hash || ['#','#/','#home'].includes(window.location.hash)) {
      const view=$('home');
      if(view && !view.classList.contains('show')) window.asteriaHardHome?.();
    }
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',startup);
  else startup();
  window.AsteriaAAAWebsite=Object.freeze({menus:MENUS,closeMenu,intervalMs:INTERVAL});
})(window,document);