/* Asteria static shell helpers.
   Keeps layout/auth navigation stable without interval-based cleanup guards. */
(function(){
  const hiddenUtilitySelector = '.test-logins,.offline-logins';
  let setViewHomeWrapped = false;
  let homeRouting = false;
  let mobileNavReturnFocus = null;
  let settingsReturnFocus = null;

  function byId(id){ return document.getElementById(id); }
  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }
  function toast(message){ if(typeof window.toast === 'function') window.toast(message); else alert(message); }
  function announce(message, priority = 'polite'){
    const region = byId('asteriaLiveRegion');
    if(!region || !message) return;
    region.setAttribute('aria-live', priority === 'assertive' ? 'assertive' : 'polite');
    region.textContent = '';
    requestAnimationFrame(() => { region.textContent = String(message); });
  }
  function normalizeLoginRole(role){ return role === 'admin' ? 'gm' : (role || 'player'); }
  function cleanUsername(value){ return String(value || '').trim().toLowerCase(); }
  function isAccountSignedIn(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return Boolean(session.uid || session.email || ['account', 'player', 'gm'].includes(session.role));
  }

  function mobileNavigationIsAvailable(){
    return window.matchMedia?.('(max-width: 900px)').matches;
  }

  function setMobileNavigation(open, restoreFocus = true){
    const toggle = byId('mobileNavToggle');
    const navigation = byId('globalNavigation');
    if(!toggle || !navigation) return;
    const shouldOpen = Boolean(open && mobileNavigationIsAvailable());
    if(shouldOpen) mobileNavReturnFocus = document.activeElement;
    document.body.classList.toggle('mobile-nav-open', shouldOpen);
    toggle.setAttribute('aria-expanded', String(shouldOpen));
    toggle.setAttribute('aria-label', shouldOpen ? 'Close main navigation' : 'Open main navigation');
    navigation.setAttribute('aria-hidden', String(mobileNavigationIsAvailable() && !shouldOpen));
    if(shouldOpen){
      requestAnimationFrame(() => navigation.querySelector('button, a, [tabindex]:not([tabindex="-1"])')?.focus());
    } else if(restoreFocus && mobileNavReturnFocus){
      mobileNavReturnFocus.focus?.();
      mobileNavReturnFocus = null;
    }
  }

  function bindMobileNavigation(){
    const toggle = byId('mobileNavToggle');
    const navigation = byId('globalNavigation');
    const shade = byId('mobileNavShade');
    if(!toggle || !navigation || toggle.dataset.shellBound) return;
    toggle.dataset.shellBound = '1';
    setMobileNavigation(false, false);
    toggle.addEventListener('click', event => {
      event.preventDefault();
      setMobileNavigation(toggle.getAttribute('aria-expanded') !== 'true');
    });
    shade?.addEventListener('click', () => setMobileNavigation(false));
    navigation.addEventListener('click', event => {
      if(mobileNavigationIsAvailable() && event.target.closest('button, a, [role="button"]')) setMobileNavigation(false, false);
    }, true);
    document.addEventListener('keydown', event => {
      if(!document.body.classList.contains('mobile-nav-open')) return;
      if(event.key === 'Escape'){
        event.preventDefault();
        setMobileNavigation(false);
        return;
      }
      if(event.key !== 'Tab') return;
      const controls = qsa('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])', navigation)
        .filter(control => control.offsetParent !== null);
      if(!controls.length) return event.preventDefault();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
      else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
    });
    window.matchMedia?.('(max-width: 900px)').addEventListener?.('change', () => setMobileNavigation(false, false));
  }

  function settingsFocusableControls(panel){
    return qsa('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', panel)
      .filter(control => control.offsetParent !== null);
  }

  function syncSettingsAccessibility({ focusPanel = false, restoreFocus = false } = {}){
    const panel = byId('settingsPanel');
    const toggle = byId('settingsToggle');
    const shade = byId('shade');
    if(!panel || !toggle) return;
    const open = panel.classList.contains('open');
    panel.setAttribute('aria-hidden', String(!open));
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close settings' : 'Open settings');
    shade?.setAttribute('aria-hidden', String(!open));
    if(open){
      if(!settingsReturnFocus) settingsReturnFocus = toggle;
      if(focusPanel) requestAnimationFrame(() => settingsFocusableControls(panel)[0]?.focus());
    } else if(restoreFocus && settingsReturnFocus){
      settingsReturnFocus.focus?.();
      settingsReturnFocus = null;
    }
  }

  function bindSettingsAccessibility(){
    const panel = byId('settingsPanel');
    const toggle = byId('settingsToggle');
    const close = byId('settingsClose');
    const shade = byId('shade');
    if(!panel || !toggle || panel.dataset.shellA11yBound) return;
    panel.dataset.shellA11yBound = '1';
    syncSettingsAccessibility();

    const observer = new MutationObserver(() => {
      const open = panel.classList.contains('open');
      syncSettingsAccessibility({ focusPanel:open, restoreFocus:!open });
      if(open) announce('Settings opened.');
    });
    observer.observe(panel, { attributes:true, attributeFilter:['class'] });

    toggle.addEventListener('click', () => requestAnimationFrame(() => syncSettingsAccessibility({ focusPanel:panel.classList.contains('open') })));
    close?.addEventListener('click', () => requestAnimationFrame(() => syncSettingsAccessibility({ restoreFocus:true })));
    shade?.addEventListener('click', () => requestAnimationFrame(() => syncSettingsAccessibility({ restoreFocus:true })));
    document.addEventListener('keydown', event => {
      if(!panel.classList.contains('open')) return;
      if(event.key === 'Escape'){
        event.preventDefault();
        close?.click();
        return;
      }
      if(event.key !== 'Tab') return;
      const controls = settingsFocusableControls(panel);
      if(!controls.length) return event.preventDefault();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
      else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
    });
  }

  function bindStaticDialogAccessibility(){
    if(document.body.dataset.shellDialogA11yBound) return;
    document.body.dataset.shellDialogA11yBound = '1';
    document.addEventListener('keydown', event => {
      const overlay = [byId('itemModal'), byId('levelModal')].find(element => element?.classList.contains('show'));
      const dialog = overlay?.querySelector('[role="dialog"]');
      if(!dialog) return;
      if(event.key === 'Escape'){
        event.preventDefault();
        dialog.querySelector('[aria-label^="Close"]')?.click();
        return;
      }
      if(event.key !== 'Tab') return;
      const controls = settingsFocusableControls(dialog);
      if(!controls.length) return event.preventDefault();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
      else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
    });
  }
  function accountKey(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return session.uid || session.account || session.user || session.email || '';
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
    const character=window.chars?.[id] || {};
    const campaignId=character.sharedCampaignId || character.linkedCampaignIds?.[0] ||
      (window.campaigns || []).find(campaign => (campaign.party || []).includes(id))?.id || '';
    if(campaignId && window.AsteriaReactMigration?.available){
      window.AsteriaReactMigration.openCharacter(campaignId,id);
      return;
    }
    window.AsteriaGameplay?.openCharacterForgeHub?.() || window.AsteriaWorkspace?.openCharacterForge?.();
    toast('Link this character to a campaign to open its live dashboard.');
  }

  async function openGMDashboard(){
    if(!isAccountSignedIn()){
      window.setView?.('loginPage');
      toast('Please log in first.');
      return;
    }
    await window.AsteriaDataSync?.refreshCampaigns?.('gm-dashboard-open');
    const index = gmCampaignIndex();
    if(index < 0){
      window.AsteriaWorkspace?.openDashboard?.('createCampaign');
      toast('Create a campaign to unlock GM tools for that campaign.');
      return;
    }
    window.activeCampaign = index;
    const campaignId=window.campaigns?.[index]?.id || '';
    if(campaignId && window.AsteriaReactMigration?.available){
      window.AsteriaReactMigration.openGM(campaignId);
      return;
    }
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

  function openCampaignHub(){
    if(!isAccountSignedIn()){
      window.setView?.('loginPage');
      toast('Please log in first.');
      return;
    }
    window.AsteriaWorkspace?.openCampaignHub?.() ||
      window.AsteriaWorkspace?.openDashboard?.('campaigns') ||
      openCampaignManager();
  }

  function publishPublicAPIs(){
    const homeRoute = window.asteriaHardHome || goHome;
    window.goHome = homeRoute;
    window.asteriaHomeRoute = homeRoute;
    window.AsteriaRouter = {
      ...(window.AsteriaRouter || {}),
      go(view){
        if(view === 'home') return goHome();
        if(['Asteria Handbook','World, Realms & Planes','Races','Classes','Skills','Items','Magic'].includes(view)){
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
      openCampaignHub,
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
    window.AsteriaAnnounce = announce;
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
    bindMobileNavigation();
    bindSettingsAccessibility();
    bindStaticDialogAccessibility();

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
        if(window.AsteriaAuthBridge?.isLoggedIn?.()) window.logout?.();
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

    const forge = byId('characterForgeTop');
    if(forge && !forge.dataset.shellBound){
      forge.dataset.shellBound = '1';
      forge.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if(!isAccountSignedIn()){
          window.setView?.('loginPage');
          toast('Please log in first.');
          return;
        }
        window.AsteriaGameplay?.openCharacterForgeHub?.() ||
          window.AsteriaWorkspace?.openCharacterForge?.() ||
          window.AsteriaWorkspace?.openDashboard?.('characters');
      }, true);
    }

    const campaigns = byId('campaignsTop');
    if(campaigns && !campaigns.dataset.shellBound){
      campaigns.dataset.shellBound = '1';
      campaigns.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        openCampaignHub();
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
