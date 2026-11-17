/* Asteria Home Guard
   Loads before the app so the sidebar Home button cannot be swallowed by
   workspace or compendium click handlers. */
(function(){
  // Make a fresh site entry start on Home, even when the browser restores a
  // previous Character Forge/React hash from a closed tab or saved session.
  // Actual inbound invitations remain actionable rather than being discarded.
  const entryHash = String(window.location?.hash || '');
  const explicitInvitation = /^#(?:secure-campaign-invite=|campaign-invite=|\\/join\\/)/i.test(entryHash)
    || /[?&](?:campaign-invite|invite)=/i.test(String(window.location?.search || ''));
  const ordinaryStartup = !explicitInvitation;
  let startupHomePending = ordinaryStartup;
  let userNavigated = false;
  if (ordinaryStartup && entryHash && entryHash !== '#home') {
    window.history?.replaceState?.(window.history.state || null,document.title,
      (window.location.pathname || '/') + (window.location.search || ''));
  }
  let routingHome = false;

  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }
  function byId(id){ return document.getElementById(id); }

  function isHomeControl(element){
    if(!element) return false;
    const text = String(element.textContent || '').trim().toLowerCase();
    const onclick = String(element.getAttribute?.('onclick') || '');
    return element.id === 'sidebarHomeButton' ||
      element.dataset?.homeAction === 'true' ||
      element.dataset?.view === 'home' ||
      text === 'home' ||
      /goHome\s*\(|setView\s*\(\s*['"]home['"]\s*\)|asteriaHardHome\s*\(/.test(onclick);
  }

  function clearShellsAndHiddenState(){
    byId('asteria-workspace-shell')?.remove();
    byId('clean-compendium-shell')?.remove();
    byId('compendiumShell')?.remove();
    qsa('.asteria-workspace-shell,.clean-compendium-shell,.compendium-shell').forEach(element => element.remove());
    qsa('.clean-hidden,.compendium-hidden,.is-compendium-hidden').forEach(element => {
      element.classList.remove('clean-hidden', 'compendium-hidden', 'is-compendium-hidden');
    });
    byId('workspace')?.classList.remove('show');
    document.documentElement.classList.remove('clean-hidden', 'compendium-hidden', 'is-compendium-hidden', 'workspace-active', 'compendium-active');
    document.body?.classList.remove('clean-hidden', 'compendium-hidden', 'is-compendium-hidden', 'workspace-active', 'compendium-active');
    byId('settingsPanel')?.classList.remove('open');
    byId('shade')?.classList.remove('open');
    byId('itemModal')?.classList.remove('show');
    byId('levelModal')?.classList.remove('show');
  }

  function clearRouteHash(){
    if(!window.location?.hash) return;
    window.history?.replaceState?.(null, document.title, window.location.pathname + window.location.search);
  }

  function showPublicHome(){
    clearShellsAndHiddenState();
    qsa('main .view, .view').forEach(view => view.classList.toggle('show', view.id === 'home'));
    qsa('[data-view], [data-home-action]').forEach(control => {
      control.classList.toggle('active', isHomeControl(control));
    });
    window.renderAccountHome?.();
  }

  function hardHome(event){
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    event?.stopPropagation?.();
    if(routingHome) return false;

    routingHome = true;
    window.__asteriaRoutingHome = true;
    try {
      clearRouteHash();
      clearShellsAndHiddenState();
      showPublicHome();
      window.scrollTo?.({ top:0, left:0, behavior:'auto' });
      return false;
    } finally {
      setTimeout(() => {
        routingHome = false;
        window.__asteriaRoutingHome = false;
      }, 0);
    }
  }

  function handleHomeEvent(event){
    const control = event.target?.closest?.('#sidebarHomeButton, [data-home-action="true"], [data-view="home"], button, a, [role="button"]');
    if(!isHomeControl(control)) return;
    hardHome(event);
  }

  function bindKnownHomeControls(){
    qsa('#sidebarHomeButton, [data-home-action="true"], [data-view="home"], button, a, [role="button"]').forEach(control => {
      if(!isHomeControl(control)) return;
      control.dataset.homeAction = 'true';
      control.onclick = hardHome;
    });
  }

  window.asteriaHardHome = hardHome;
  document.addEventListener('click', handleHomeEvent, true);
  document.addEventListener('keydown', event => {
    if(event.key !== 'Enter' && event.key !== ' ') return;
    handleHomeEvent(event);
  }, true);

  function boot(){
    bindKnownHomeControls();
    // Capture delegation above also handles Home controls inserted later.
    // Re-scanning every button after every DOM update is unnecessary.
    if(startupHomePending) hardHome();
  }
  function markUserNavigation(event){
    if(!event.isTrusted)return;
    if(event.target?.closest?.('button,a,[role="button"],[role="tab"],input,select,textarea')){
      userNavigated=true;
      startupHomePending=false;
    }
  }
  document.addEventListener('click',markUserNavigation,true);
  // A restored Firebase session can cause another component to open a stale
  // character route *after* DOMContentLoaded. Correct that single startup
  // transition, never navigation performed deliberately by the user.
  window.addEventListener('asteria:firebase-ready',()=>{
    if(!startupHomePending || userNavigated || !ordinaryStartup)return;
    window.setTimeout?.(()=>{
      if(startupHomePending && !userNavigated){hardHome();startupHomePending=false;}
    },0);
  });
  window.addEventListener('asteria:owned-characters-loaded',()=>{
    if(!startupHomePending || userNavigated || !ordinaryStartup)return;
    window.setTimeout?.(()=>{
      if(startupHomePending && !userNavigated){hardHome();startupHomePending=false;}
    },0);
  });

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
