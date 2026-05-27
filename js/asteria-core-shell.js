/* Asteria static shell helpers.
   Keeps layout/auth navigation stable without interval-based cleanup guards. */
(function(){
  const hiddenUtilitySelector = '.test-logins,.offline-logins';
  let setViewHomeWrapped = false;
  let homeRouting = false;

  function byId(id){ return document.getElementById(id); }
  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }
  function toast(message){ if(typeof window.toast === 'function') window.toast(message); else alert(message); }
  function normalizeLoginRole(role){ return role === 'admin' ? 'gm' : (role || 'player'); }
  function cleanUsername(value){ return String(value || '').trim().toLowerCase(); }
  function isAccountSignedIn(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return Boolean(session.uid || session.email || ['account', 'player', 'gm'].includes(session.role));
  }
  function accountKey(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return session.uid || session.account || session.user || '';
  }
  function firstOwnedCharacter(){
    const key = accountKey();
    const record = window.accountUsers?.[key] || {};
    return (record.characters || []).find(id => window.chars?.[id]) ||
      Object.keys(window.chars || {}).find(id => window.chars?.[id]?.ownerUid === key) ||
      window.session?.character ||
      null;
  }
  function gmCampaignIndex(){
    const key = accountKey();
    return (window.campaigns || []).findIndex(campaign =>
      campaign?.gmId === key ||
      campaign?.ownerUid === key ||
      (campaign?.gmUids || []).includes(key) ||
      campaign?.roles?.[key] === 'gm'
    );
  }

  function restoreMainViews(){
    byId('asteria-workspace-shell')?.remove();
    byId('clean-compendium-shell')?.remove();
    byId('workspace')?.classList.remove('show');
    qsa('.asteria-workspace-shell,.clean-compendium-shell,.compendium-shell,#compendiumShell').forEach(el => el.remove());
    qsa('.clean-hidden,.compendium-hidden,.is-compendium-hidden,main .view,.view').forEach(el => {
      el.classList.remove('clean-hidden', 'compendium-hidden', 'is-compendium-hidden');
    });
    document.documentElement.classList.remove('clean-hidden', 'compendium-hidden', 'is-compendium-hidden', 'workspace-active', 'compendium-active');
    document.body.classList.remove('clean-hidden', 'compendium-hidden', 'is-compendium-hidden', 'workspace-active', 'compendium-active');
  }

  function clearRouteState(){
    if(window.location.hash){
      window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
  }

  function showPublicHome(){
    qsa('.view').forEach(view => view.classList.toggle('show', view.id === 'home'));
    qsa('[data-view], [data-home-action]').forEach(link => {
      link.classList.toggle('active', link.dataset.view === 'home' || link.dataset.homeAction === 'true');
    });
    window.renderAccountHome?.();
  }

  function goHome(){
    if(typeof window.asteriaHardHome === 'function' && !window.__asteriaRoutingHome){
      return window.asteriaHardHome();
    }
    if(homeRouting) return true;
    homeRouting = true;
    window.__asteriaRoutingHome = true;
    try {
      restoreMainViews();
      clearRouteState();
      byId('settingsPanel')?.classList.remove('open');
      byId('shade')?.classList.remove('open');
      if(isAccountSignedIn() && window.AsteriaWorkspace?.openDashboard){
        const opened = window.AsteriaWorkspace.openDashboard('dashboard');
        if(opened !== false){
          window.scrollTo?.({ top:0, left:0, behavior:'auto' });
          return true;
        }
      }
      showPublicHome();
      window.scrollTo?.({ top:0, left:0, behavior:'auto' });
      restoreMainViews();
      return true;
    } finally {
      setTimeout(() => {
        homeRouting = false;
        window.__asteriaRoutingHome = false;
      }, 0);
    }
  }

  function wrapSetViewHomeRoute(){
    if(setViewHomeWrapped || typeof window.setView !== 'function') return;
    const originalSetView = window.setView;
    if(originalSetView.__asteriaHomeWrapped) {
      setViewHomeWrapped = true;
      return;
    }
    window.setView = function(id, ...args){
      if(id === 'home') return goHome();
      return originalSetView.call(this, id, ...args);
    };
    window.setView.__asteriaHomeWrapped = true;
    setViewHomeWrapped = true;
  }

  function openPlayerDashboard(){
    if(!isAccountSignedIn()){
      window.setView?.('loginPage');
      toast('Please log in first.');
      return;
    }
    const id = firstOwnedCharacter();
    if(!id){
      window.AsteriaWorkspace?.openDashboard?.('characters');
      toast('Create or link a character first.');
      return;
    }
    window.session = window.session || {};
    window.session.character = id;
    window.selected = id;
    restoreMainViews();
    window.loadPlayer?.(id);
    window.setView?.('player');
  }

  function openGMDashboard(){
    if(!isAccountSignedIn()){
      window.setView?.('loginPage');
      toast('Please log in first.');
      return;
    }
    const index = gmCampaignIndex();
    if(index < 0){
      window.AsteriaWorkspace?.openDashboard?.('createCampaign');
      toast('Create a campaign to unlock GM tools for that campaign.');
      return;
    }
    window.activeCampaign = index;
    restoreMainViews();
    window.renderCampaigns?.();
    window.renderGM?.();
    window.setView?.('gm');
  }

  function openCampaignManager(){
    if(!isAccountSignedIn()){
      window.setView?.('loginPage');
      toast('Please log in first.');
      return;
    }
    restoreMainViews();
    window.renderCampaigns?.();
    window.setView?.('campaigns');
  }

  function publishPublicAPIs(){
    const homeRoute = window.asteriaHardHome || goHome;
    window.goHome = homeRoute;
    window.asteriaHomeRoute = homeRoute;
    window.AsteriaRouter = {
      ...(window.AsteriaRouter || {}),
      go(view){
        if(view === 'home') return goHome();
        if(['Asteria Handbook','World, Realms & Planes','Races','Classes','Items','Magic'].includes(view)){
          window.AsteriaWorkspace?.openSection?.(view);
          return;
        }
        window.setView?.(view);
      },
      home:homeRoute,
      restoreMainViews,
      openPlayerDashboard,
      openGMDashboard,
      openCampaignManager,
      current(){
        return document.querySelector('.view.show')?.id || null;
      }
    };

    window.AsteriaAccounts = window.AsteriaAccounts || {
      login(){ window.loginFromPage?.(); },
      create(){ window.firebaseCreateAccountPage?.(); },
      logout(){ window.logout?.(); },
      load(){ window.loadAccountState?.(); return window.accountUsers || {}; },
      save(){ window.saveAccountState?.(); },
      session(){ return window.session || { role:'guest', character:null }; }
    };
  }

  window.loginFromPage = function(){
    const user = byId('loginPageUser')?.value || byId('loginUser')?.value || '';
    const pass = byId('loginPagePass')?.value || byId('loginPass')?.value || '';

    if(!user || !pass){
      toast('Enter your username or email and password.');
      return;
    }
    if(typeof window.firebaseLoginFromPage === 'function') return window.firebaseLoginFromPage();
    if(typeof window.firebaseLogin === 'function') return window.firebaseLogin({ username:user, password:pass });
    toast('Firebase Authentication is still loading. Please try again in a moment.');
  };

  window.requestPasswordReset = window.requestPasswordReset || function(){
    const email = byId('forgotPasswordEmail')?.value || byId('loginPageUser')?.value || '';
    if(typeof window.firebaseResetPassword === 'function') return window.firebaseResetPassword(email);
    toast(email ? 'Firebase password reset is still loading. Please try again in a moment.' : 'Enter an email first.');
  };

  window.backToLogin = window.backToLogin || function(){ window.setView?.('loginPage'); };
  window.openAccountCreate = window.openAccountCreate || function(){ window.setView?.('accountCreate'); };
  window.firebaseCreateAccountPage = window.firebaseCreateAccountPage || function(){
    toast('Firebase Authentication is still loading. Please try again in a moment.');
  };

  function bindStaticControls(){
    qsa(hiddenUtilitySelector).forEach(el => el.remove());
    wrapSetViewHomeRoute();

    const settings = byId('settingsToggle') || document.querySelector('.hamburger');
    if(settings && qsa('span', settings).length !== 3){
      settings.innerHTML = '<span></span><span></span><span></span>';
    }

    const login = byId('loginToggle');
    if(login && !login.dataset.shellBound){
      login.dataset.shellBound = '1';
      login.textContent = 'Login';
      login.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if(window.AsteriaAuthBridge?.isLoggedIn?.()) window.AsteriaWorkspace?.openDashboard?.('dashboard');
        else window.setView?.('loginPage');
      }, true);
    }

    const create = byId('createAccountTop');
    if(create && !create.dataset.shellBound){
      create.dataset.shellBound = '1';
      create.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if(window.AsteriaAuthBridge?.isLoggedIn?.()) window.logout?.();
        else window.setView?.('accountCreate');
      }, true);
    }

    qsa('.side-main[data-view="home"], .public-sidebar [data-view="home"]').forEach(button => {
      if(button.dataset.shellHomeBound) return;
      button.dataset.shellHomeBound = '1';
      button.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        goHome();
      }, true);
    });

    if(!document.body.dataset.shellHomeCaptureBound){
      document.body.dataset.shellHomeCaptureBound = '1';
      document.addEventListener('click', ev => {
        const button = ev.target?.closest?.('[data-home-action="true"], .side-main[data-view="home"], .public-sidebar [data-view="home"], button, a, [role="button"]');
        if(!button) return;
        const text = String(button.textContent || '').trim().toLowerCase();
        const onclick = String(button.getAttribute?.('onclick') || '');
        const isHomeButton = button.dataset?.homeAction === 'true' ||
          button.dataset?.view === 'home' ||
          text === 'home' ||
          /goHome\s*\(|setView\s*\(\s*['"]home['"]\s*\)/.test(onclick);
        if(!isHomeButton) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        goHome();
      }, true);
    }

    qsa('[data-app-route]').forEach(button => {
      if(button.dataset.shellAppRouteBound) return;
      button.dataset.shellAppRouteBound = '1';
      button.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if(button.dataset.appRoute === 'player-dashboard') openPlayerDashboard();
        if(button.dataset.appRoute === 'campaign-manager') openCampaignManager();
        if(button.dataset.appRoute === 'gm-dashboard') openGMDashboard();
      }, true);
    });
  }

  function boot(){
    document.body.style.visibility = 'visible';
    document.body.style.opacity = '1';
    publishPublicAPIs();
    bindStaticControls();
    const observer = new MutationObserver(() => {
      if(boot.pending) return;
      boot.pending = requestAnimationFrame(() => {
        boot.pending = null;
        bindStaticControls();
      });
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
