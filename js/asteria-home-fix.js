/* Asteria Home Button Compatibility Shim
   The real route lives in asteria-core-shell.js. This file only catches old
   Home controls and sends them to the single router. */
(function(){
  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }

  function isHomeControl(element){
    if(!element) return false;
    const text = String(element.textContent || '').trim().toLowerCase();
    const onclick = String(element.getAttribute?.('onclick') || '');
    return element.dataset?.homeAction === 'true' ||
      element.dataset?.view === 'home' ||
      element.id === 'sidebarHomeButton' ||
      text === 'home' ||
      /goHome\s*\(|setView\s*\(\s*['"]home['"]\s*\)/.test(onclick);
  }

  function routeHome(){
    const route = window.asteriaHardHome || window.AsteriaRouter?.home || window.goHome || window.asteriaHomeRoute;
    if(typeof route === 'function') return route();
    return false;
  }

  function handleHomeEvent(event){
    const control = event.target?.closest?.('[data-home-action="true"], [data-view="home"], #sidebarHomeButton, button, a, [role="button"]');
    if(!isHomeControl(control)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    routeHome();
  }

  function bindHomeControls(){
    qsa('[data-home-action="true"], [data-view="home"], #sidebarHomeButton, button, a, [role="button"]').forEach(control => {
      if(!isHomeControl(control)) return;
      control.dataset.homeAction = 'true';
      control.onclick = event => {
        handleHomeEvent(event);
        return false;
      };
    });
  }

  document.addEventListener('click', handleHomeEvent, true);
  document.addEventListener('keydown', event => {
    if(event.key !== 'Enter' && event.key !== ' ') return;
    handleHomeEvent(event);
  }, true);

  const previousSetView = window.setView;
  if(typeof previousSetView === 'function' && !previousSetView.__asteriaFinalHomeWrapped){
    window.setView = function(id, ...args){
      if(id === 'home') return routeHome();
      return previousSetView.call(this, id, ...args);
    };
    window.setView.__asteriaFinalHomeWrapped = true;
  }

  function boot(){
    bindHomeControls();
    const observer = new MutationObserver(bindHomeControls);
    observer.observe(document.body, { childList:true, subtree:true });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
