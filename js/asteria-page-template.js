/* Shared outer page template for menu destinations.
 * Phase 1 applies it only to Account. Existing feature controllers continue
 * to own authentication, data, forms, navigation actions and panel content. */
(function(root, document){
  'use strict';
  if(!root || !document)return;

  const resolve=target=>typeof target==='string'?document.getElementById(target):target;
  const labelText=value=>String(value||'').trim();
  const safePart=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'-');

  function ensureHeader(page,{title,headerId}={}){
    if(!page)return null;
    let header=(headerId&&document.getElementById(headerId))||
      page.querySelector('.asteria-template-header');
    if(!header){
      header=document.createElement('header');
      if(headerId)header.id=headerId;
      header.className='aaa-page-hero asteria-template-header';
      const heading=document.createElement('h1');
      heading.textContent=labelText(title);
      header.appendChild(heading);
      page.insertBefore(header,page.firstChild);
    }else{
      header.classList.add('asteria-template-header');
      if(title && header.querySelector('h1'))header.querySelector('h1').textContent=title;
    }
    return header;
  }

  // Keep tab semantics accurate when desktop's vertical sidebar becomes a
  // horizontal, scrollable navigation strip on narrow screens.
  const oriented=new WeakSet();
  function orient(tablist){
    if(tablist?.getAttribute('role')!=='tablist' || oriented.has(tablist))return;
    oriented.add(tablist);
    const media=root.matchMedia?.('(max-width: 720px)');
    const sync=()=>tablist.setAttribute('aria-orientation',media?.matches?'horizontal':'vertical');
    sync();
    media?.addEventListener?.('change',sync);
  }

  // Adopt existing markup *without* moving controls or replacing listeners.
  // A future menu page can supply its own selectors but share the same shell.
  function adopt({page:target,title,headerId,layoutSelector='.asteria-template-layout',
    sidebarSelector='.asteria-template-sidebar',
    navSelector='.asteria-template-nav',
    contentSelector='.asteria-template-content',
    panelSelector='.asteria-template-panel'}={}){
    const page=resolve(target);
    if(!page)return false;
    const layout=page.querySelector(layoutSelector);
    const sidebar=page.querySelector(sidebarSelector);
    const nav=page.querySelector(navSelector);
    const content=page.querySelector(contentSelector);
    if(!layout||!sidebar||!nav||!content)return false;
    page.classList.add('asteria-template-page');
    layout.classList.add('asteria-template-layout');
    sidebar.classList.add('asteria-template-sidebar');
    nav.classList.add('asteria-template-nav');
    content.classList.add('asteria-template-content');
    for(const item of nav.querySelectorAll('[role="tab"],button,a')){
      item.classList.add('asteria-template-nav-item');
      const label=item.querySelector('.asteria-account-link-label,.asteria-template-nav-label');
      label?.classList.add('asteria-template-nav-label');
    }
    for(const panel of content.querySelectorAll(panelSelector))
      panel.classList.add('asteria-template-panel');
    ensureHeader(page,{title,headerId});
    orient(nav);
    return true;
  }

  // Factory for subsequent menu phases. No data stores, routes or permissions
  // are created; consumers supply each section's existing DOM/controller.
  function create({id,title,sections=[],navLabel='Page sections',onSelect}={}){
    if(!id||!Array.isArray(sections)||!sections.length||document.getElementById(id))
      return null;
    const page=document.createElement('section');
    page.id=id;
    page.className='view asteria-template-page';
    ensureHeader(page,{title});
    const layout=document.createElement('div');
    layout.className='asteria-template-layout';
    const sidebar=document.createElement('nav');
    sidebar.className='asteria-template-sidebar';
    sidebar.setAttribute('aria-label',navLabel);
    const nav=document.createElement('div');
    nav.className='asteria-template-nav';
    nav.setAttribute('role','tablist');
    nav.setAttribute('aria-label',navLabel);
    nav.setAttribute('aria-orientation','vertical');
    const main=document.createElement('div');
    main.className='asteria-template-content';
    const items=new Map();
    for(const section of sections){
      const key=labelText(section?.key);
      if(!key||items.has(key))continue;
      const tab=document.createElement('button');
      const panel=section.node||document.createElement('section');
      const suffix=safePart(key);
      const tabId=id+'-tab-'+suffix, panelId=id+'-panel-'+suffix;
      tab.type='button';
      tab.id=tabId;
      tab.className='asteria-template-nav-item';
      tab.setAttribute('role','tab');
      tab.setAttribute('aria-controls',panelId);
      const label=document.createElement('span');
      label.className='asteria-template-nav-label';
      label.textContent=labelText(section.label)||key;
      tab.appendChild(label);
      panel.id=panelId;
      panel.classList.add('asteria-template-panel');
      panel.setAttribute('role','tabpanel');
      panel.setAttribute('aria-labelledby',tabId);
      panel.tabIndex=0;
      tab.addEventListener('click',()=>select(key));
      nav.appendChild(tab);
      main.appendChild(panel);
      items.set(key,{tab,panel});
    }
    if(!items.size)return null;
    sidebar.appendChild(nav);
    layout.append(sidebar,main);
    page.appendChild(layout);
    orient(nav);

    function select(key,{focus=false}={}){
      if(!items.has(key))return false;
      if(typeof onSelect==='function' && onSelect(key)===false)return false;
      for(const [value,{tab,panel}] of items){
        const active=value===key;
        tab.setAttribute('aria-selected',String(active));
        tab.tabIndex=active?0:-1;
        panel.hidden=!active;
        if(active&&focus)tab.focus();
      }
      return true;
    }
    nav.addEventListener('keydown',event=>{
      const tab=event.target?.closest?.('[role="tab"]');
      if(!tab||!nav.contains(tab))return;
      const ordered=[...items.keys()];
      const index=ordered.findIndex(key=>items.get(key).tab===tab);
      if(index<0)return;
      const horizontal=nav.getAttribute('aria-orientation')==='horizontal';
      const forward=horizontal?'ArrowRight':'ArrowDown';
      const backward=horizontal?'ArrowLeft':'ArrowUp';
      let next=index;
      if(event.key===forward)next=(index+1)%ordered.length;
      else if(event.key===backward)next=(index+ordered.length-1)%ordered.length;
      else if(event.key==='Home')next=0;
      else if(event.key==='End')next=ordered.length-1;
      else return;
      event.preventDefault();
      select(ordered[next],{focus:true});
    });
    select(items.keys().next().value);
    return Object.freeze({page,select});
  }

  // Account is the reference implementation; leave its existing IDs,
  // tab handlers, profile mounts and sign-out action untouched.
  function boot(){
    adopt({
      page:'asteriaAccountPage',
      title:'Account',
      headerId:'aaaAccountHero',
      layoutSelector:'.asteria-account-shell',
      sidebarSelector:'.asteria-account-sidebar',
      navSelector:'.asteria-account-sidebar-options',
      contentSelector:'.asteria-account-content',
      panelSelector:'.asteria-account-panel'
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
  root.AsteriaPageTemplate=Object.freeze({adopt,create,ensureHeader});
})(typeof window!=='undefined'?window:null,typeof document!=='undefined'?document:null);
