/* Asteria Home Guard
   Loads before the app so the sidebar Home button cannot be swallowed by
   workspace or compendium click handlers. */
(function(){
  let routingHome = false;

  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }
  function byId(id){ return document.getElementById(id); }

  function isLoggedIn(){
    const bridgeSession = window.AsteriaAuthBridge?.getSession?.() || {};
    const legacySession = window.session || {};
    const session = Object.assign({}, legacySession, bridgeSession);
    return Boolean(
      window.AsteriaAuthBridge?.isLoggedIn?.() ||
      session.uid ||
      session.email ||
      ['account', 'player', 'gm'].includes(session.role)
    );
  }

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
      if(isLoggedIn() && typeof window.AsteriaWorkspace?.openDashboard === 'function'){
        const opened = window.AsteriaWorkspace.openDashboard('dashboard');
        if(opened !== false){
          window.scrollTo?.({ top:0, left:0, behavior:'auto' });
          return false;
        }
      }
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
    const observer = new MutationObserver(bindKnownHomeControls);
    observer.observe(document.body, { childList:true, subtree:true });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
