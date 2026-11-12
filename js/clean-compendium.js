(function(){
  'use strict';

  const publicSections = ['Asteria Handbook','World, Realms & Planes','Races','Classes','Skills','Items','Magic','Theology','Creatures','Factions'];

  const sectionViews = {
    handbookHub: 'Asteria Handbook',
    worldHub: 'World, Realms & Planes',
    racesHub: 'Races',
    classesHub: 'Classes',
    skillsHub: 'Skills',
    itemsHub: 'Items',
    magicHub: 'Magic',
    theologyHub: 'Theology',
    creaturesHub: 'Creatures',
    factionsHub: 'Factions'
  };

  const authWorkspaceModes = [
    { id:'dashboard', label:'Dashboard', title:'User Workspace Dashboard', intro:'Your account workspace for campaigns, characters, notifications, and active party tools.' },
    { id:'campaigns', label:'Campaign Forge', title:'Campaign Forge', intro:'Campaign cards, GM permissions for campaigns you created, invite links, and character linking.' },
    { id:'settings', label:'Account Settings', title:'Account Settings', intro:'Account state, Firebase sync status, and dashboard preferences.' },
    { id:'notifications', label:'Notifications', title:'Notifications', intro:'Private friend updates and separately gated campaign notifications.' }
  ];
  const authWorkspaceTabs = {
    dashboard: ['Overview','Campaigns','Characters','Activity'],
    campaigns: ['Campaign Gallery','Invite Links','Linked Characters','Activity'],
    settings: ['Account','Sync','Theme','Activity'],
    notifications: ['Friend Notifications','Campaign Notifications']
  };

  let entries = [];
  let currentSection = 'Items';

  let activeWorkspaceTab = '';
  let currentDashboardMode = 'dashboard';
  let campaignLookupState = null;
  let campaignLookupSequence = 0;
  // Kept only in this tab's volatile memory. Never write bearer tokens to
  // session, account state, analytics, localStorage or campaign documents.
  let secureInvitationPending = null;
  let legacyOpenRuleCategory = null;
  let legacyOpenRulePage = null;

  function branch(label, children) {
    return { label, children };
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function textOf(element) {
    return (element && element.textContent || '').trim();
  }

  function lower(value) {
    return String(value || '').toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"]/g, character => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;'
    }[character]));
  }

  function slugify(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'page';
  }

  function root() {
    return document.querySelector('main.main') || document.querySelector('main') || document.body;
  }

  function arrayValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
  }

  function mergeCustomItems(items = window.ASTERIA_CUSTOM_ITEMS || []) {
    entries = window.AsteriaContent.entries();
  }

  function load() {
    entries = window.AsteriaContent.entries();
  }

  function hideOldViews() {
    const view = workspaceView();
    if (view && typeof window.setView === 'function') {
      window.setView('workspace');
      qsa('main .view').forEach(element => element.classList.toggle('show', element.id === 'workspace'));
    } else {
      qsa('main .view').forEach(element => element.classList.add('clean-hidden'));
    }
    document.body.classList.add('workspace-active', 'compendium-active');
  }

  function showHome() {
    if (!window.__asteriaRoutingHome && window.AsteriaRouter?.home) {
      return window.AsteriaRouter.home();
    }
    byId('asteria-workspace-shell')?.remove();
    byId('clean-compendium-shell')?.remove();
    byId('workspace')?.classList.remove('show');
    qsa('.clean-hidden,.compendium-hidden,.is-compendium-hidden').forEach(element => {
      element.classList.remove('clean-hidden', 'compendium-hidden', 'is-compendium-hidden');
    });
    qsa('main .view').forEach(element => element.classList.toggle('show', element.id === 'home'));
    document.body.classList.remove('workspace-active', 'compendium-active');
  }

  function workspaceView() {
    let view = byId('workspace');
    if (view) return view;
    view = document.createElement('section');
    view.id = 'workspace';
    view.className = 'view workspace-view';
    view.setAttribute('aria-label', 'Asteria Workspace');
    root().appendChild(view);
    return view;
  }

  function shell() {
    let element = byId('asteria-workspace-shell') || byId('clean-compendium-shell');
    if (element) return element;

    element = document.createElement('section');
    element.id = 'asteria-workspace-shell';
    element.className = 'asteria-workspace-shell clean-compendium-shell';
    element.dataset.version = 'ASTERIA FRAMEWORK v3';
    element.innerHTML = `
      <section class="clean-header workspace-header">
        <div class="clean-title-block">
          <h1 id="clean-title">Items</h1>
        </div>
      </section>
      <div id="clean-filters" class="clean-filters workspace-filter-area"></div>
      <nav id="workspace-tabs" class="workspace-tabs clean-tabs" aria-label="Workspace sections"></nav>
      <section class="clean-body workspace-body">
        <aside class="clean-nav workspace-category-panel">
          <div class="clean-nav-head">
            <h3 id="clean-nav-title">Categories</h3>
            <button class="clean-back" type="button">Clear</button>
          </div>
          <div class="clean-breadcrumb"></div>
          <div class="clean-buttons"></div>
        </aside>
        <section class="clean-display workspace-display-window">
          <div class="clean-status">
            <span id="clean-status">All entries</span>
            <span id="clean-count"></span>
          </div>
          <div id="clean-grid" class="clean-grid"></div>
        </section>
      </section>
    `;
    workspaceView().replaceChildren(element);
    return element;
  }

  function sectionEntries(section = currentSection) {
    return entries.filter(entry => entry.section === section);
  }

  function authMode(mode = currentDashboardMode) {
    return authWorkspaceModes.find(item => item.id === mode) || authWorkspaceModes[0];
  }

  function authTabs(mode = currentDashboardMode) {
    return authWorkspaceTabs[mode] || authWorkspaceTabs.dashboard;
  }

  function authFirstTab(mode = currentDashboardMode) {
    return authTabs(mode)[0];
  }

  function sessionInfo() {
    return window.AsteriaAuthBridge?.getSession?.() || window.session || {};
  }

  function accountSignedIn() {
    const s = sessionInfo();
    return Boolean(s.uid || s.email || ['account', 'player', 'gm'].includes(s.role));
  }

  function accountKey() {
    const s = sessionInfo();
    return s.uid || s.account || s.user || s.email || 'local-player';
  }

  function ensureAccountRecord() {
    const key = accountKey();
    window.loadAccountState?.();
    window.accountUsers = window.accountUsers || {};
    window.accountUsers[key] = window.accountUsers[key] || { characters: [] };
    window.accountUsers[key].characters = Array.from(new Set(window.accountUsers[key].characters || []));
    return window.accountUsers[key];
  }

  function ownedCharacterIds() {
    if(window.AsteriaFirebase && !window.AsteriaFirebase.isReady?.()) return [];
    const uid = window.AsteriaFirebase?.getUser?.()?.uid ||
      (!window.AsteriaFirebase ? sessionInfo().uid : '');
    return window.AsteriaCharacterAccess?.ownedIds(window.chars, uid) || [];
  }

  function ownedCharacters() {
    return ownedCharacterIds().map(id => Object.assign({ id }, window.chars[id]));
  }

  function randomToken(prefix = '') {
    const part = Math.random().toString(36).slice(2, 8);
    return `${prefix}${Date.now().toString(36)}-${part}`;
  }

  function randomDigits(length = 12) {
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
  }

  function campaignCode(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 12);
  }

  function uniqueCampaignCode() {
    const used = new Set((window.campaigns || [])
      .map(campaign => campaignCode(campaign?.ucn || campaign?.uniqueCampaignCode || campaign?.inviteCode))
      .filter(Boolean));
    let code = '';
    do {
      code = randomDigits(12);
    } while (used.has(code));
    return code;
  }

  function campaignInviteUrl(campaign) {
    const base = String(window.location?.href || '').split('#')[0] || 'index.html';
    const code = campaignCode(campaign?.ucn || campaign?.uniqueCampaignCode || campaign?.inviteCode);
    return `${base}#campaign-invite=${encodeURIComponent(code)}`;
  }

  function ensureCampaignInviteFields(campaign) {
    if (!campaign) return campaign;
    const code = campaignCode(campaign.ucn || campaign.uniqueCampaignCode || campaign.inviteCode) || uniqueCampaignCode();
    campaign.ucn = code;
    campaign.uniqueCampaignCode = code;
    campaign.inviteCode = code;
    campaign.inviteLink = campaignInviteUrl(campaign);
    campaign.invites = Array.isArray(campaign.invites) ? campaign.invites : [];
    return campaign;
  }

  function inviteLink(campaign) {
    return ensureCampaignInviteFields(campaign)?.inviteLink || '';
  }

  function campaignId(campaign, index = 0) {
    if (!campaign.id) campaign.id = `campaign-${index + 1}`;
    return campaign.id;
  }

  function campaignRole(campaign) {
    const uid = accountKey();
    const roles = campaign.roles || {};
    if (campaign.ownerUid === uid || roles[uid] === 'gm' || arrayValue(campaign.gmUids).includes(uid)) return 'GM';
    if (roles[uid] === 'player' || arrayValue(campaign.playerUids).includes(uid)) return 'Player';
    const owned = ownedCharacterIds();
    if (arrayValue(campaign.party).some(id => owned.includes(id))) return 'Player';
    return '';
  }

  function accountCampaigns() {
    return (window.campaigns || [])
      .map((campaign, index) => ensureCampaignInviteFields(Object.assign(campaign, { id:campaignId(campaign, index) })))
      .filter(campaign => campaignRole(campaign));
  }

  function dashboardQuery() {
    return lower(byId('auth-workspace-search')?.value || '');
  }

  function requireAccountWorkspace() {
    if (accountSignedIn()) return true;
    window.setView?.('loginPage');
    window.toast?.('Please log in to open your workspace dashboard.');
    return false;
  }

  function renderAuthFilters() {
    const box = shell().querySelector('#clean-filters');
    if (!box) return;
    const labels = {
      dashboard:'Search dashboard...',
      campaigns:'Search campaigns...',
      settings:'Search settings...',
      notifications:'Search notifications...'
    };
    box.innerHTML = `
      <label>Search<input id="auth-workspace-search" placeholder="${escapeHtml(labels[currentDashboardMode] || 'Search workspace...')}"></label>
      <label>Workspace<select id="auth-workspace-mode-filter">${authWorkspaceModes.map(mode => `<option value="${escapeHtml(mode.id)}" ${mode.id === currentDashboardMode ? 'selected' : ''}>${escapeHtml(mode.label)}</option>`).join('')}</select></label>
      <label>Sort<select id="auth-workspace-sort"><option value="recent">Sort: Recent</option><option value="name">Sort: Name</option><option value="role">Sort: Role</option></select></label>
    `;
    byId('auth-workspace-search')?.addEventListener('input', renderAuthDisplay);
    byId('auth-workspace-mode-filter')?.addEventListener('change', event => openDashboard(event.target.value));
    byId('auth-workspace-sort')?.addEventListener('change', renderAuthDisplay);
  }

  function renderAuthTabs() {
    const tabs = shell().querySelector('#workspace-tabs');
    if (!tabs) return;
    if (!authTabs().includes(activeWorkspaceTab)) activeWorkspaceTab = authFirstTab();
    tabs.innerHTML = authTabs().map(tab => `
      <button type="button" class="${tab === activeWorkspaceTab ? 'active' : ''}" data-auth-workspace-tab="${escapeHtml(tab)}">
        ${escapeHtml(tab)}
      </button>
    `).join('');
    qsa('button', tabs).forEach(button => {
      button.onclick = () => {
        activeWorkspaceTab = button.dataset.authWorkspaceTab || authFirstTab();
        renderAuthTabs();
        renderAuthDisplay();
      };
    });
  }

  function renderAuthNav() {
    const element = shell();
    const buttons = element.querySelector('.clean-buttons');
    const config = authMode();
    element.querySelector('#clean-title').textContent = config.title;
    const intro = element.querySelector('#clean-intro');
    if (intro) intro.textContent = config.intro;
    element.querySelector('#clean-nav-title').textContent = 'Account Workspace';
    element.querySelector('.clean-breadcrumb').textContent = `Signed-in Workspace / ${config.label}`;
    const back = element.querySelector('.clean-back');
    back.disabled = false;
    back.textContent = 'Dashboard';
    back.onclick = () => openDashboard('dashboard');
    buttons.innerHTML = '';
    authWorkspaceModes.forEach(mode => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `cat ${mode.id === currentDashboardMode ? 'active' : ''}`;
      button.innerHTML = `<span class="clean-left"><span>${escapeHtml(mode.label)}</span></span>`;
      button.onclick = () => openDashboard(mode.id);
      buttons.appendChild(button);
    });
  }

  function syncAuthNavState() {
    qsa('[data-view]').forEach(link => {
      const match = link.dataset.workspaceMode === currentDashboardMode;
      link.classList.toggle('active', Boolean(match));
    });
    qsa('[data-workspace-action]').forEach(link => {
      const action = link.dataset.workspaceAction;
      const match = action === 'settings' && currentDashboardMode === 'settings';
      link.classList.toggle('active', match);
    });
  }

  function workspaceCard({ tag, title, subtitle, body, meta, action }) {
    const element = document.createElement('article');
    element.className = 'clean-card workspace-dashboard-card';
    element.innerHTML = `
      <span class="clean-tag">${escapeHtml(tag || 'Workspace')}</span>
      <h3>${escapeHtml(title)}</h3>
      ${subtitle ? `<div class="clean-card-subtitle">${escapeHtml(subtitle)}</div>` : ''}
      <p>${escapeHtml(body || '')}</p>
      ${meta ? `<div class="clean-meta">${meta}</div>` : ''}
    `;
    // A dedicated control works with touch, keyboard, and screen readers.
    // The previous click handler referenced an undefined 'create' variable.
    if (typeof action === 'function') {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'workspace-gallery-open primary';
      open.textContent = 'Open ' + String(title || 'workspace');
      open.addEventListener('click', event => {
        event.stopPropagation();
        action();
      });
      element.appendChild(open);
    }
    return element;
  }

  function galleryCard({ tag, title, subtitle, body, image, initial, action, create = false }) {
    const element = document.createElement('article');
    element.className = `clean-card workspace-dashboard-card workspace-gallery-card${create ? ' workspace-gallery-create' : ''}`;
    element.tabIndex = 0;
    element.innerHTML = `
      <div class="workspace-gallery-art">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">` : `<span>${escapeHtml(initial || String(title || '?').charAt(0).toUpperCase() || '?')}</span>`}
      </div>
      <div class="workspace-gallery-copy">
        <span class="clean-tag">${escapeHtml(tag || 'Workspace')}</span>
        <h3>${escapeHtml(title)}</h3>
        ${subtitle ? `<div class="clean-card-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        <p>${escapeHtml(body || '')}</p>
      </div>
    `;
    element.onclick = () => {
      qsa('.clean-card', element.parentElement).forEach(cardElement => cardElement.classList.remove('selected'));
      element.classList.add('selected');
    };
    // Gallery cards retain single-tap selection and double-click opening on desktop.
    // An explicit button makes opening available on mobile and to keyboard users.
    if (typeof action === 'function') {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'workspace-gallery-open primary';
      open.textContent = 'Open ' + String(title || 'entry');
      open.addEventListener('click', event => {
        event.stopPropagation();
        action();
      });
      element.querySelector('.workspace-gallery-copy')?.appendChild(open);
    }
    element.ondblclick = event => {
      if (!event.target.closest?.('button,input,select,textarea')) action?.();
    };
    element.onkeydown = event => {
      if (event.target === element && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        action?.();
      }
    };
    return element;
  }

  function filterCards(list, textFn) {
    const query = dashboardQuery();
    if (!query) return list;
    return list.filter(item => lower(textFn(item)).includes(query));
  }

  function sortCards(list, nameFn, roleFn = null) {
    const sort = byId('auth-workspace-sort')?.value || 'recent';
    if (sort === 'name') return list.sort((a, b) => String(nameFn(a)).localeCompare(String(nameFn(b))));
    if (sort === 'role' && roleFn) return list.sort((a, b) => String(roleFn(a)).localeCompare(String(roleFn(b))) || String(nameFn(a)).localeCompare(String(nameFn(b))));
    return list;
  }

  function renderOverviewCards(grid) {
    const campaigns = accountCampaigns();
    const characters = ownedCharacters();
    const activePartyCount = campaigns.reduce((total, campaign) => total + arrayValue(campaign.party).length, 0);
    const cards = [
      { tag:'Campaigns', title:'Current Campaigns', subtitle:`${campaigns.length} linked`, body:'Campaigns you created or joined with this account.', action:() => openDashboard('campaigns') },
      { tag:'Characters', title:'Available Characters', subtitle:`${characters.length} owned`, body:'Characters attached to this account. Open the Character Forge gallery to manage them.', action:() => window.AsteriaGameplay?.openCharacterForgeHub?.() },
      { tag:'Notifications', title:'Notifications', subtitle:(window.AsteriaFeatureFlags?.friendNotificationsEnabled===true||window.AsteriaFeatureFlags?.campaignNotifications===true)?'Account updates':'Not active', body:'Campaign invitations and account updates.', action:() => openDashboard('notifications') },
      { tag:'Party', title:'Active Party', subtitle:`${activePartyCount} linked`, body:'Active party roster, session presence, and party status tools will appear here later.', action:() => renderPlaceholderPage('Active Party', 'Active party tools will connect to campaign sessions later.') }
    ];
    filterCards(cards, card => [card.title, card.subtitle, card.body].join(' ')).forEach(cardData => grid.appendChild(workspaceCard(cardData)));
  }

  function renderCampaignCards(grid) {
    const list = sortCards(filterCards(accountCampaigns(), campaign => [campaign.name, campaignRole(campaign), campaign.description].join(' ')), campaign => campaign.name || campaign.id, campaignRole);
    list.forEach(campaign => {
      ensureCampaignInviteFields(campaign);
      const card=galleryCard({
        tag:campaignRole(campaign),
        title:campaign.name || 'Untitled Campaign',
        subtitle:`${arrayValue(campaign.party).length} linked character${arrayValue(campaign.party).length === 1 ? '' : 's'}`,
        body:campaign.description || 'Double-click to open the GM Dashboard for this campaign.',
        image:campaign.image || campaign.art || campaign.banner || '',
        initial:'C',
        action:() => openCampaignGMDashboard(campaign)
      });
      const manage=document.createElement('button');manage.type='button';manage.textContent='Manage character links';
      manage.addEventListener('click',event=>{event.stopPropagation();renderCampaignDetail(campaign);});
      manage.addEventListener('dblclick',event=>event.stopPropagation());
      manage.addEventListener('keydown',event=>event.stopPropagation());
      card.appendChild(manage);grid.appendChild(card);
    });
    grid.appendChild(galleryCard({
      tag:'New Campaign',
      title:'Forge New Campaign',
      subtitle:'Create a campaign and become GM',
      body:'Start a new campaign workspace, generate its invite link, and link characters after creation.',
      initial:'+',
      create:true,
      action:openCreateCampaignForm
    }));
    grid.appendChild(renderJoinCampaignCard());
  }

  function renderPendingSecureInvitation(card){
    const host=card.querySelector('#workspaceSecureInvitationAcceptance');
    if(!host||!secureInvitationPending)return;
    const invitation=secureInvitationPending;
    const api=window.AsteriaFirebase;
    const ownerUid=api?.getUser?.()?.uid;
    host.replaceChildren();
    const section=document.createElement('section');
    section.className='workspace-link-panel workspace-secure-invite-acceptance';
    const title=document.createElement('h3');
    title.textContent='Secure Campaign Invitation';
    const description=document.createElement('p');
    description.textContent='Review the invitation before requesting membership. GM approval remains required; an offered Co-GM role is not granted automatically.';
    const status=document.createElement('p');
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    const actions=document.createElement('div');
    actions.className='workspace-join-review-actions';
    const review=document.createElement('button');
    review.type='button';
    review.className='primary';
    review.textContent='Review Secure Invitation';
    const discard=document.createElement('button');
    discard.type='button';
    discard.textContent='Discard Invitation';
    actions.append(review,discard);
    section.append(title,description,actions,status);
    host.appendChild(section);
    const valid=()=>host.isConnected&&secureInvitationPending===invitation&&
      api?.getUser?.()?.uid===ownerUid;
    const currentAccount=()=>{
      const active=api?.getUser?.();
      return active?.uid&&api?.isReady?.()&&
        window.AsteriaCampaignJoinModel?.joinAccountValid?.(sessionInfo(),active);
    };
    discard.addEventListener('click',()=>{
      if(secureInvitationPending===invitation)secureInvitationPending=null;
      host.replaceChildren();
    });
    review.addEventListener('click',async()=>{
      if(!valid())return;
      if(!currentAccount()){
        status.textContent='Sign in with your Firebase account to review this invitation. Test Login cannot accept.';
        return;
      }
      review.disabled=true;
      status.textContent='Checking the invitation securely...';
      try{
        const info=await api.previewSecureCampaignInvitation(
          invitation.campaignId,invitation.inviteId,invitation.token);
        if(!valid())return;
        status.textContent='Invitation verified. No membership has been granted.';
        const display=document.createElement('p');
        display.textContent='Campaign: '+String(info.campaignName||'Campaign')+
          ' · Offered role: '+String(info.roleOffered||'player')+
          ' · Expires: '+String(info.expiresAt||'');
        const accept=document.createElement('button');
        accept.type='button';
        accept.className='primary';
        accept.textContent='Request to Join Campaign';
        section.insertBefore(display,status);
        actions.insertBefore(accept,discard);
        review.remove();
        accept.addEventListener('click',async()=>{
          if(!valid()||!currentAccount())return;
          if(!window.confirm('Submit a request to join this campaign? The GM must approve it before you can access the campaign.'))return;
          accept.disabled=true;
          status.textContent='Submitting your secure invitation request...';
          try{
            const result=await api.acceptSecureCampaignInvitation(
              invitation.campaignId,invitation.inviteId,invitation.token);
            if(!valid())return;
            status.textContent=result.status==='member'?
              'You already have campaign access.':
              result.status==='pending'?
                'Invitation accepted. Your request is pending GM approval.':
                'Your existing campaign join request is '+String(result.status)+'.';
            secureInvitationPending=null;
            accept.remove();
            discard.remove();
          }catch(error){
            if(valid())status.textContent=error?.message||
              'Could not submit the invitation. Reopen a valid link or ask the GM.';
            accept.disabled=false;
          }
        });
      }catch(error){
        if(valid())status.textContent=error?.message||
          'This invitation is expired, revoked, exhausted or not intended for this account.';
        review.disabled=false;
      }
    });
  }

  function renderJoinCampaignCard() {
    const previewEnabled = campaignJoinPreviewEnabled();
    const element = document.createElement('article');
    element.className = 'clean-card workspace-dashboard-card workspace-gallery-card workspace-campaign-join-card';
    element.innerHTML = `
      <div class="workspace-gallery-art workspace-join-art"><span>#</span></div>
      <div class="workspace-gallery-copy">
        <span class="clean-tag">Join Campaign</span>
        <h3>Join Campaign</h3>
        <p>${previewEnabled ? 'Find your GM\'s campaign using its 12-digit Unique Campaign Number. Review the campaign before submitting a request.' : 'Enter the 12-digit UCN provided by your GM, then link a character after joining.'}</p>
        <ol class="workspace-connection-steps" aria-label="Campaign connection steps">
          <li><span class="workspace-step-number" aria-hidden="true">1</span>Enter campaign number</li>
          <li><span class="workspace-step-number" aria-hidden="true">2</span>${previewEnabled?'Request GM approval':'Join legacy campaign'}</li>
          <li><span class="workspace-step-number" aria-hidden="true">3</span>Link your character</li>
        </ol>
        <label class="workspace-join-code-label">Unique Campaign Number<input id="workspaceJoinCampaignCode" inputmode="numeric" autocomplete="off" maxlength="16" placeholder="000000000000" aria-describedby="workspaceJoinCodeHelp"></label>
        <p class="muted" id="workspaceJoinCodeHelp">Enter all 12 digits. Spaces or hyphens are optional.</p>
        <button class="primary" type="button" id="workspaceJoinCampaignBtn">${previewEnabled ? 'Find Campaign' : 'Join Campaign'}</button>
        <div id="workspaceJoinCampaignResult" class="workspace-join-result" aria-live="polite" role="status"></div>
        <div id="workspaceJoinCampaignPreview" class="workspace-join-preview" hidden></div>
        <div id="workspaceJoinCharacterChooser" class="workspace-join-character-chooser"></div>
        ${window.AsteriaFeatureFlags?.secureInvitationAcceptance===true?
          '<div id="workspaceSecureInvitationAcceptance"></div>':''}
      </div>
    `;
    element.addEventListener('click', event => {
      if (event.target.closest('input,button,select')) event.stopPropagation();
    });
    element.querySelector('#workspaceJoinCampaignBtn')?.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await (previewEnabled ? lookupCampaignByUCN : joinLegacyCampaignByUCN)(
        element.querySelector('#workspaceJoinCampaignCode')?.value || ''
      );
    });
    element.querySelector('#workspaceJoinCampaignCode')?.addEventListener('input', () => {
      campaignLookupSequence += 1;
      campaignLookupState = null;
      const preview = element.querySelector('#workspaceJoinCampaignPreview');
      if(preview) { preview.replaceChildren(); preview.hidden = true; }
      const chooser = element.querySelector('#workspaceJoinCharacterChooser');
      if(chooser) chooser.replaceChildren();
      const status = element.querySelector('#workspaceJoinCampaignResult');
      if(status) status.textContent = '';
    });
    if(window.AsteriaFeatureFlags?.secureInvitationAcceptance===true)
      renderPendingSecureInvitation(element);
    const pendingInviteCode = takeCampaignInviteCode();
    if (pendingInviteCode) {
      const input = element.querySelector('#workspaceJoinCampaignCode');
      if (input) input.value = pendingInviteCode;
      const result = element.querySelector('#workspaceJoinCampaignResult');
      if (result) result.textContent = previewEnabled ? 'Campaign number loaded. Select Find Campaign to verify it before joining.' : 'Invite loaded. Select Join Campaign to connect.';
    }
    return element;
  }

  function openCreateCampaignForm() {
    const grid = byId('clean-grid');
    if (!grid) return;
    grid.innerHTML = '';
    renderCreateCampaignForm(grid);
  }

  function campaignIndex(campaign) {
    return (window.campaigns || []).findIndex((item, index) => campaignId(item, index) === campaign.id);
  }

  async function openCampaignGMDashboard(campaign) {
    const campaignIdValue = campaign?.id;
    await window.AsteriaDataSync?.refreshCampaigns?.('campaign-card-open');
    campaign = findCampaign(campaignIdValue) || campaign;
    const index = campaignIndex(campaign);
    if (index < 0) return;
    if (campaignRole(campaign) !== 'GM') {
      renderCampaignDetail(campaign);
      window.toast?.('This campaign is linked to your account as a player. GM Dashboard opens for campaigns you created.');
      return;
    }
    window.activeCampaign = index;
    if(campaign.id && window.AsteriaReactMigration?.available){
      window.AsteriaReactMigration.openGM(campaign.id);
      window.toast?.(`Opened ${campaign.name || 'campaign'} live GM Dashboard.`);
      return;
    }
    hideOldViews();
    window.renderCampaigns?.();
    window.renderGM?.();
    window.setView?.('gm');
    window.toast?.(`Opened ${campaign.name || 'campaign'} GM Dashboard.`);
  }

  function renderCreateCampaignForm(grid) {
    grid.innerHTML += `
      <article class="clean-page workspace-viewer workspace-form-page" data-viewer="universal-workspace-viewer">
        <header class="clean-page-head"><span class="clean-tag">GM</span><div><p class="eyebrow">Campaign Forge</p><h2>Forge Campaign</h2><p>Creating a campaign grants this account GM permissions for that campaign only.</p></div></header>
        <div class="workspace-form-grid">
          <label>Campaign Name<input id="workspaceCampaignName" placeholder="Campaign name"></label>
          <label>Party Size<input id="workspaceCampaignPartySize" type="number" min="1" max="12" value=""></label>
          <label>Description<textarea id="workspaceCampaignDescription" placeholder="Short campaign premise"></textarea></label>
          <label>Campaign Image (optional)<input type="file" id="workspaceCampaignArtwork" accept="image/png,image/jpeg,image/webp,image/gif"></label>
          <p class="muted">PNG, JPG, WEBP or GIF, up to 8 MB. This image will appear in Campaign Forge and on the Player Dashboard.</p>
          <p id="workspaceCampaignArtworkStatus" role="status" aria-live="polite"></p>
        </div>
        <button class="primary" id="workspaceCreateCampaignBtn" type="button">Forge Campaign</button>
      </article>
    `;
    byId('workspaceCreateCampaignBtn')?.addEventListener('click', createWorkspaceCampaign);
  }

  function renderSettingsPanel(grid) {
    const s = sessionInfo();
    grid.innerHTML += `
      <article class="clean-page workspace-viewer" data-viewer="universal-workspace-viewer">
        <header class="clean-page-head"><span class="clean-tag">Account</span><div><p class="eyebrow">Firebase Account</p><h2>${escapeHtml(s.user || s.email || 'Signed-in Account')}</h2><p>One account can GM campaigns it creates and play characters in other campaigns.</p></div></header>
        <dl class="clean-page-meta">
          <div><dt>Account ID</dt><dd>${escapeHtml(s.uid || s.account || 'Not available')}</dd></div>
          <div><dt>Email</dt><dd>${escapeHtml(s.email || 'Not available')}</dd></div>
          <div><dt>Campaign Permissions</dt><dd>Assigned per campaign</dd></div>
          <div><dt>Characters</dt><dd>${ownedCharacters().length}</dd></div>
        </dl>
        <p class="muted">Theme controls remain in the Settings panel. Firebase sync status appears under Access when connected.</p>
      </article>
    `;
  }

  function renderPlaceholderPage(title, body) {
    const grid = byId('clean-grid');
    if (!grid) return;
    grid.innerHTML = `
      <article class="clean-page workspace-viewer" data-viewer="universal-workspace-viewer">
        <button class="clean-back clean-return" type="button" id="workspace-dashboard-return">Back to dashboard</button>
        <header class="clean-page-head"><span class="clean-tag">Placeholder</span><div><p class="eyebrow">Workspace</p><h2>${escapeHtml(title)}</h2></div></header>
        <p>${escapeHtml(body)}</p>
      </article>
    `;
    byId('workspace-dashboard-return').onclick = () => openDashboard('dashboard');
  }

  function renderCampaignDetail(campaign) {
    const grid = byId('clean-grid');
    const characters = ownedCharacters();
    if (!grid) return;
    ensureCampaignInviteFields(campaign);
    const role = campaignRole(campaign);
    const invites = arrayValue(campaign.invites);
    const repairIds=[...new Set([...arrayValue(campaign.party),...Object.keys(campaign.characters || {})])];
    grid.innerHTML = `
      <article class="clean-page workspace-viewer" data-viewer="universal-workspace-viewer">
        <button class="clean-back clean-return" type="button" id="workspace-campaign-return">Back to campaigns</button>
        <header class="clean-page-head"><span class="clean-tag">${escapeHtml(role)}</span><div><p class="eyebrow">Campaign Forge</p><h2>${escapeHtml(campaign.name || 'Untitled Campaign')}</h2><p>${escapeHtml(campaign.description || 'Campaign workspace.')}</p></div></header>
        <section class="workspace-link-panel workspace-campaign-artwork-editor">
          <h3>Campaign Image</h3>
          <div class="workspace-campaign-artwork-preview" id="workspaceCampaignArtworkPreview">${campaign.image ? `<img src="${escapeHtml(campaign.image)}" alt="Campaign artwork" loading="lazy">` : `<p class="muted">No campaign artwork uploaded.</p>`}</div>
          ${role === 'GM' ? `<label>Upload or Replace Image<input id="workspaceCampaignDetailImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><button id="workspaceRemoveCampaignImage" type="button" ${campaign.image ? '' : 'disabled'}>Remove Campaign Image</button><p class="muted">PNG, JPG, WEBP or GIF, up to 8 MB.</p>` : ''}
          <p id="workspaceCampaignDetailImageStatus" role="status" aria-live="polite"></p>
        </section>
        <dl class="clean-page-meta">
          <div><dt>Campaign ID</dt><dd>${escapeHtml(campaign.id)}</dd></div>
          <div><dt>UCN</dt><dd>${escapeHtml(campaign.ucn || 'Not generated')}</dd></div>
          <div><dt>${campaign.membershipSchemaVersion===2?'Campaign Lookup Link':'Invite Link'}</dt><dd>${escapeHtml(inviteLink(campaign))}</dd></div>
          <div><dt>GM ID</dt><dd>${escapeHtml(campaign.gmId || campaign.ownerUid || 'Not set')}</dd></div>
          <div><dt>Party Characters</dt><dd>${arrayValue(campaign.party).length}</dd></div>
        </dl>
        ${role === 'GM' && campaign.membershipSchemaVersion!==2 ? `
          <section class="workspace-link-panel campaign-invite-tools">
            <h3>Campaign Invites</h3>
            <p class="muted">Legacy invitations create a record and link only; this form does not send email. Use the secure invitation manager when enabled for protected invitations.</p>
            <label>Player Email<input id="workspaceInviteEmail" type="email" placeholder="player@example.com"></label>
            <button class="primary" type="button" id="workspaceCreateInviteBtn">Create Invite</button>
            <div class="campaign-code-pill"><b>UCN</b><span>${escapeHtml(campaign.ucn)}</span></div>
            <div class="workspace-invite-list">
              ${invites.length ? invites.map(invite => `<div><b>${escapeHtml(invite.email || 'Invite')}</b><span>${escapeHtml(invite.status || 'created')}</span><small>${escapeHtml(invite.link || inviteLink(campaign))}</small></div>`).join('') : '<p class="muted">No invite records yet.</p>'}
            </div>
          </section>
        ` : ''}
        ${campaign.membershipSchemaVersion===2 && campaign.ownerUid===window.AsteriaFirebase?.getUser?.()?.uid && window.AsteriaFeatureFlags?.secureInvitationManager===true ? `
          <section class="workspace-link-panel workspace-secure-invite-manager">
            <h3>Secure Invitation Manager</h3>
            <p class="muted">Create and manage protected invitations. A link never grants campaign access by itself; joining requires the recipient to sign in and follow the GM approval process.</p>
            <div class="workspace-form-grid">
              <label>Invitation Type<select id="workspaceSecureInviteType"><option value="share-link">Share link / QR</option></select></label>
              <label>Offered Role<select id="workspaceSecureInviteRole"><option value="player">Player</option><option value="co-gm">Co-GM (owner approval required)</option></select></label>
              <label>Expires In<select id="workspaceSecureInviteExpiry"><option value="24">24 hours</option><option value="72">3 days</option><option value="168" selected>7 days</option><option value="336">14 days</option><option value="720">30 days</option></select></label>
              <label>Maximum Uses<input id="workspaceSecureInviteUses" type="number" min="1" max="25" step="1" value="1"></label>
            </div>
            <button class="primary" type="button" id="workspaceSecureInviteIssue">Create Secure Invitation</button>

            <p id="workspaceSecureInviteCreationStatus" role="status" aria-live="polite"></p>
            <div id="workspaceSecureInviteOneTime" aria-live="polite"></div>
            <div class="workspace-join-review-actions"><button type="button" id="workspaceSecureInviteRefresh">Refresh Invitations</button><button type="button" id="workspaceSecureInvitePrevious" disabled>Previous</button><button type="button" id="workspaceSecureInviteNext" disabled>Next</button></div>
            <div id="workspaceSecureInviteList" class="workspace-invite-list" aria-live="polite"></div>
            <p id="workspaceSecureInviteListStatus" role="status" aria-live="polite"></p>
          </section>
        ` : ''}
        ${role === 'GM' && window.AsteriaFeatureFlags?.campaignJoinReview===true ? `
          <section class="workspace-link-panel workspace-join-review">
            <h3>Join Requests</h3>
            <p class="muted">Approve or decline a pending account request. Any selected character is a preference, not an automatic link.</p>
            <div id="workspaceJoinReviewSummary" aria-live="polite">Checking pending requests...</div>
            <div class="workspace-join-review-actions"><button type="button" id="workspaceRefreshJoinReviews">Refresh Requests</button></div>
            <div id="workspaceJoinReviewList" class="workspace-invite-list"></div>
            <p id="workspaceJoinReviewMessage" role="status" aria-live="polite"></p>
          </section>
        ` : ''}
        ${role === 'GM' && window.AsteriaFeatureFlags?.campaignRolePermissions===true ? `
          <section class="workspace-link-panel workspace-gm-history">
            <h3>GM Activity History</h3>
            <p class="muted">Recent member decisions, role changes and delegated permission updates.</p>
            <button type="button" id="workspaceRefreshMemberActivity">Refresh Activity</button>
            <div id="workspaceMemberActivity" aria-live="polite"></div>
            <p id="workspaceMemberActivityStatus" role="status" aria-live="polite"></p>
          </section>
        ` : ''}
        ${role === 'GM' && window.AsteriaFeatureFlags?.campaignPlayerRoster===true ? `
          <section class="workspace-link-panel workspace-player-roster">
            <h3>Player Roster</h3>
            <p class="muted">Account membership and verified linked-character summaries. Controls appear only for server-authorized GM actions.</p>
            <button type="button" id="workspaceRefreshPlayerRoster">Refresh Roster</button>
            <div id="workspacePlayerRosterContent" aria-live="polite"></div>
            <p id="workspacePlayerRosterStatus" role="status" aria-live="polite"></p>
          </section>
        ` : ''}
        ${role === 'GM' && campaign.membershipSchemaVersion===2 &&
          window.AsteriaFeatureFlags?.campaignCharacterApproval===true ? `
          <section class="workspace-link-panel workspace-character-approval">
            <h3>Character Link Requests</h3>
            <p class="muted">Review saved characters requested by active campaign members. Approval adds a verified character to the party. Declining leaves the saved character unchanged.</p>
            <button type="button" id="workspaceRefreshCharacterLinks">Refresh Requests</button>
            <div id="workspaceCharacterApprovalList" aria-live="polite"></div>
            <p id="workspaceCharacterApprovalStatus" role="status" aria-live="polite"></p>
          </section>
        ` : ''}
        ${role === 'GM' && campaign.membershipSchemaVersion===2 &&
          window.AsteriaFeatureFlags?.campaignCharacterLifecycle===true ? `
          <section class="workspace-link-panel workspace-character-lifecycle">
            <h3>Manage Campaign Characters</h3>
            <p class="muted">Deactivation archives the current gameplay sheet and removes it from active encounters and party lists. Restore returns it without losing progress. Unlink preserves the archived character and original Forge sheet.</p>
            <button type="button" id="workspaceRefreshCharacterLifecycle">Refresh Character Links</button>
            <div id="workspaceCharacterLifecycleList" aria-live="polite"></div>
            <p id="workspaceCharacterLifecycleStatus" role="status" aria-live="polite"></p>
          </section>
        ` : ''}
        <section class="workspace-link-panel">
          <h3>${campaign.membershipSchemaVersion===2?'Request Character Link':'Link Existing Character'}</h3>
          <p class="muted">${campaign.membershipSchemaVersion===2?'Choose a saved character you own. A request is sent for GM approval; the character will not enter the party until approved.':'Players can link a saved character they own to this campaign.'}</p>
          <label>Character<select id="workspaceLinkCharacter">${characters.map(character => `<option value="${escapeHtml(character.id)}" ${character.id === (window.session?.character || window.selected) ? 'selected' : ''}>${escapeHtml(character.name || character.id)}</option>`).join('')}</select></label>
          <button class="primary" type="button" id="workspaceLinkCharacterBtn" ${characters.length && (campaign.membershipSchemaVersion!==2 || (window.AsteriaFeatureFlags?.campaignCharacterLinks===true && campaign.settings?.allowPlayerLinkCharacter!==false)) ? '' : 'disabled'}>${campaign.membershipSchemaVersion===2?'Request Link':'Link Character'}</button>
          <p id="workspaceCharacterLinkStatus" role="status" aria-live="polite">${campaign.membershipSchemaVersion===2 && window.AsteriaFeatureFlags?.campaignCharacterLinks!==true?'Character link requests are not activated yet.':campaign.membershipSchemaVersion===2 && campaign.settings?.allowPlayerLinkCharacter===false?'The GM has disabled character linking.':''}</p>
          ${campaign.membershipSchemaVersion===2&&window.AsteriaFeatureFlags?.campaignCharacterLifecycle===true?
            '<button type="button" id="workspaceUnlinkOwnCharacter">Unlink My Character</button>':''}
          ${campaign.settings?.allowPlayerCreateCharacter!==false?'<button type="button" id="workspaceForgeCharacterForCampaign">Forge New Character</button>':''}
        </section>
        <section class="workspace-link-panel">
          <h3>Repair Existing Character Link</h3>
          <p>The character owner can repair conflicting campaign links. Both existing character sheets must verify the same owner and campaign. HP, XP, inventory and ownership stay unchanged.</p>
          <label>Campaign character<select id="workspaceRepairCharacter">${repairIds.map(id=>`<option value="${escapeHtml(id)}">${escapeHtml(campaign.characters?.[id]?.name || id)}</option>`).join('')}</select></label>
          <button type="button" id="workspaceRepairCharacterBtn" ${repairIds.length ? '' : 'disabled'}>Verify Ownership &amp; Repair Link</button>
          <p id="workspaceRepairStatus" role="status" aria-live="polite"></p>
        </section>
      </article>
    `;
    byId('workspaceCampaignDetailImage')?.addEventListener('change',async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file)return;
      const input=byId('workspaceCampaignDetailImage'),status=byId('workspaceCampaignDetailImageStatus');
      if(input)input.disabled=true;if(status)status.textContent='Uploading campaign artwork...';
      try {
        const result=await window.AsteriaFirebase?.uploadCampaignArtwork?.(campaign.id,file);
        if(result?.ok){campaign.image=result.image;campaign.imagePath=result.path;persistWorkspaceChange('campaign-artwork-updated');renderCampaignDetail(campaign);}
        else if(status)status.textContent=result?.error||'Campaign artwork upload failed.';
      }catch(error){if(status)status.textContent=error?.message||'Campaign artwork upload failed.';}
      finally{if(input)input.disabled=false;}
    });
    byId('workspaceRemoveCampaignImage')?.addEventListener('click',async()=>{
      const button=byId('workspaceRemoveCampaignImage'),status=byId('workspaceCampaignDetailImageStatus');
      if(button)button.disabled=true;if(status)status.textContent='Removing artwork...';
      try{
        const result=await window.AsteriaFirebase?.removeCampaignArtwork?.(campaign.id);
        if(result?.ok){campaign.image='';campaign.imagePath='';campaign.art='';campaign.banner='';persistWorkspaceChange('campaign-artwork-removed');renderCampaignDetail(campaign);}
        else if(status)status.textContent=result?.error||'Could not remove campaign artwork.';
      }catch(error){if(status)status.textContent=error?.message||'Could not remove campaign artwork.';}
      finally{if(button)button.disabled=false;}
    });
    byId('workspace-campaign-return').onclick = () => openDashboard('campaigns');
    byId('workspaceCreateInviteBtn')?.addEventListener('click', () => createCampaignInvite(campaign.id));
    if(campaign.membershipSchemaVersion===2&&
      campaign.ownerUid===window.AsteriaFirebase?.getUser?.()?.uid&&
      window.AsteriaFeatureFlags?.campaignFriendRecipients===true)
      window.AsteriaCampaignFriendRecipients?.render?.(grid,campaign);
    if(campaign.membershipSchemaVersion===2&&
      campaign.ownerUid===window.AsteriaFirebase?.getUser?.()?.uid&&
      window.AsteriaFeatureFlags?.secureInvitationManager===true)
      renderSecureCampaignInvitationManager(campaign);
    if(role === 'GM' && window.AsteriaFeatureFlags?.campaignJoinReview===true) renderCampaignGMJoinApprovals(campaign);
    if(role === 'GM' && window.AsteriaFeatureFlags?.campaignPlayerRoster===true) renderCampaignGMPlayerRoster(campaign);
    if(role === 'GM' && window.AsteriaFeatureFlags?.campaignRolePermissions===true) renderCampaignGMActivity(campaign);
    if(role === 'GM' && campaign.membershipSchemaVersion===2 &&
      window.AsteriaFeatureFlags?.campaignCharacterApproval===true)
      renderCampaignGMCharacterApprovals(campaign);
    byId('workspaceLinkCharacterBtn')?.addEventListener('click', () => linkCharacterToCampaign(campaign.id));
    if(role==='GM'&&campaign.membershipSchemaVersion===2&&
      window.AsteriaFeatureFlags?.campaignCharacterLifecycle===true)
      renderCampaignGMCharacterLifecycle(campaign);
    byId('workspaceUnlinkOwnCharacter')?.addEventListener('click',async()=>{
      const api=window.AsteriaFirebase,choice=byId('workspaceLinkCharacter');
      const status=byId('workspaceCharacterLinkStatus');
      const saved=window.chars?.[choice?.value];
      if(!api?.changeCampaignCharacterLifecycle||!api?.getCampaignCharacterLinkStatus||!saved)return;
      const sourceCharacterId=String(saved.sourceCharacterId||saved.id||'');
      const request=await api.getCampaignCharacterLinkStatus(campaign.id,sourceCharacterId)
        .catch(error=>({error:error?.message||'Could not check character status.'}));
      if(request.error){if(status)status.textContent=request.error;return;}
      const action=request.status==='pending'?'cancel':'unlink';
      if(!['pending','approved','inactive'].includes(request.status)){
        if(status)status.textContent='No active character link to withdraw.';
        return;
      }
      if(!window.confirm(action==='cancel'?'Withdraw this pending character request?':
        'Unlink this character from the campaign? Your original Forge sheet and archived gameplay will be preserved.'))return;
      const button=byId('workspaceUnlinkOwnCharacter');
      if(button)button.disabled=true;
      try{
        const result=await api.changeCampaignCharacterLifecycle(campaign.id,{
          sourceCharacterId,action,expectedRevision:request.revision
        });
        if(status)status.textContent=result.status==='declined'?
          'Pending request withdrawn.':'Character unlinked. Original sheet and gameplay archive retained.';
        if(action==='unlink')await window.AsteriaDataSync?.refreshCampaigns?.('character-unlinked');
      }catch(error){if(status)status.textContent=error?.message||'Could not unlink character.';}
      finally{if(button)button.disabled=false;}
    });
    if(campaign.membershipSchemaVersion===2&&window.AsteriaFeatureFlags?.campaignCharacterLinks===true){
      const choice=byId('workspaceLinkCharacter');
      const status=byId('workspaceCharacterLinkStatus');
      const api=window.AsteriaFirebase;
      let sequence=0;
      const refreshStatus=async()=>{
        const id=choice?.value;
        const saved=id&&window.chars?.[id];
        const sourceId=String(saved?.sourceCharacterId||id||'');
        const request=++sequence;
        if(!status||!sourceId||!api?.getCampaignCharacterLinkStatus)return;
        status.textContent='Checking character request status...';
        try{
          const result=await api.getCampaignCharacterLinkStatus(campaign.id,sourceId);
          if(request!==sequence||!status.isConnected)return;
          status.textContent=result?.status==='pending'?'Pending GM approval.':
            result?.status==='approved'?'Approved character link.':
            'No character link request yet.';
        }catch(error){
          if(request===sequence&&status.isConnected)
            status.textContent=error?.message||'Could not check this character request.';
        }
      };
      choice?.addEventListener('change',refreshStatus);
      if(choice?.value)void refreshStatus();
    }
    byId('workspaceForgeCharacterForCampaign')?.addEventListener('click',()=>{
      if(campaign.membershipSchemaVersion===2 && window.AsteriaFeatureFlags?.campaignCharacterLinks!==true){
        window.toast?.('Campaign character requests are not activated yet.');return;
      }
      setPendingCampaignJoin(campaign);
      if(window.AsteriaGameplay?.startNewCharacterForge)window.AsteriaGameplay.startNewCharacterForge();
      else if(window.AsteriaGameplay?.openCharacterCreator)window.AsteriaGameplay.openCharacterCreator();
      else window.AsteriaGameplay?.openCharacterForge?.();
    });
    byId('workspaceRepairCharacterBtn')?.addEventListener('click', () => repairCharacterCampaignLink(campaign.id));
  }

  async function renderSecureCampaignInvitationManager(campaign){
    const api=window.AsteriaFirebase;
    const list=byId('workspaceSecureInviteList');
    const status=byId('workspaceSecureInviteListStatus');
    const created=byId('workspaceSecureInviteCreationStatus');
    const oneTime=byId('workspaceSecureInviteOneTime');
    const createButton=byId('workspaceSecureInviteIssue');
    const refresh=byId('workspaceSecureInviteRefresh');
    const previous=byId('workspaceSecureInvitePrevious');
    const next=byId('workspaceSecureInviteNext');
    const type=byId('workspaceSecureInviteType');
    const uses=byId('workspaceSecureInviteUses');
    if(!api?.issueSecureCampaignInvitation||!api?.listSecureCampaignInvitations||
       !api?.changeSecureCampaignInvitation||!list||!status)return;
    const uid=api.getUser?.()?.uid;
    const current=()=>list.isConnected&&api.getUser?.()?.uid===uid&&
      window.AsteriaFeatureFlags?.secureInvitationManager===true;
    const pageHistory=[null];
    let pageIndex=0,forwardCursor=null,busy=false;
    const setBusy=value=>{
      busy=value;
      for(const control of [createButton,refresh,type,uses,
        byId('workspaceSecureInviteRole'),byId('workspaceSecureInviteExpiry')])
        if(control)control.disabled=value;
    };
    const updateType=()=>{if(type)type.disabled=busy;};
    const showOneTime=issued=>{
      oneTime.replaceChildren();
      const heading=document.createElement('p');
      heading.textContent='Created: '+issued.inviteId.slice(0,12)+'…';
      oneTime.appendChild(heading);
      if(!issued.token){
        const warning=document.createElement('p');
        warning.textContent='This invitation already exists. Its secure token cannot be retrieved. Create a new invitation if the token was lost.';
        oneTime.appendChild(warning);
        return;
      }
      const base=window.location.href.split('#')[0];
      const link=window.AsteriaSecureInvitationLinks.link(base,
        campaign.id,issued.inviteId,issued.token);
      const info=document.createElement('p');
      info.textContent='Copy this private invitation link now. It cannot be retrieved later. The recipient will need to sign in and request GM approval.';
      const copy=document.createElement('button');
      copy.type='button';
      copy.textContent='Copy One-Time Invitation Link';
      const copyStatus=document.createElement('p');
      copyStatus.setAttribute('role','status');
      copy.addEventListener('click',async()=>{
        try{
          if(!navigator.clipboard?.writeText)throw Error('Clipboard is not available.');
          await navigator.clipboard.writeText(link);
          copyStatus.textContent='Link copied. Treat it as a private credential.';
        }catch{
          copyStatus.textContent='Copy failed. Clipboard permission is required.';
        }
      });
      const forget=document.createElement('button');
      forget.type='button';
      forget.textContent='Clear One-Time Link';
      forget.addEventListener('click',()=>{
        oneTime.replaceChildren();
      });
      const qrButton=document.createElement('button');
      qrButton.type='button';
      qrButton.textContent='Show Invitation QR Code';
      const qrHost=document.createElement('div');
      qrHost.setAttribute('aria-label','QR code representing the private invitation link');
      qrButton.addEventListener('click',()=>{
        qrHost.replaceChildren();
        if(typeof window.QRCode!=='function'){
          copyStatus.textContent='Local QR generator is unavailable.';
          return;
        }
        try{
          new window.QRCode(qrHost,{text:link,width:224,height:224,
            correctLevel:window.QRCode.CorrectLevel.M});
          copyStatus.textContent='QR generated locally. Anyone with this code can submit a request using the invitation.';
        }catch{
          qrHost.replaceChildren();
          copyStatus.textContent='QR generation failed. Copy the invitation link instead.';
        }
      });
      oneTime.append(info,copy,qrButton,forget,copyStatus,qrHost);
    };
    const load=async()=>{
      if(busy||!current())return;
      setBusy(true);
      status.textContent='Loading secure invitations...';
      if(next)next.disabled=true;
      if(previous)previous.disabled=true;
      try{
        const page=await api.listSecureCampaignInvitations(campaign.id,
          pageHistory[pageIndex]);
        if(!current())return;
        forwardCursor=page.nextCursor||null;
        list.replaceChildren();
        const items=Array.isArray(page.invitations)?page.invitations:[];
        if(!items.length){
          const empty=document.createElement('p');
          empty.textContent='No secure invitations on this page.';
          list.appendChild(empty);
        }
        for(const invite of items){
          const row=document.createElement('article');
          row.className='workspace-join-review-row';
          const name=document.createElement('strong');
          name.textContent=String(invite.type||'Invitation')+' · '+
            String(invite.inviteId||'').slice(0,12);
          const details=document.createElement('p');
          details.textContent='Role: '+String(invite.roleOffered||'player')+
            ' · Status: '+String(invite.status||'unknown')+
            ' · Uses: '+String(invite.usedCount)+'/'+String(invite.maxUses);
          const dates=document.createElement('small');
          dates.textContent='Expires: '+String(invite.expiresAt||'Unknown');
          row.append(name,details,dates);
          if(invite.recipientEmail){
            const recipient=document.createElement('small');
            recipient.textContent='Recipient: '+invite.recipientEmail;
            row.appendChild(recipient);
          }
          if(invite.status==='active'){
            const actions=document.createElement('div');
            actions.className='workspace-join-review-actions';
            for(const [action,label] of [['revoke','Revoke'],['expire','Expire Now']]){
              const button=document.createElement('button');
              button.type='button';
              button.textContent=label;
              button.addEventListener('click',async()=>{
                if(busy||!current())return;
                if(!window.confirm(action==='revoke'?
                  'Revoke this invitation immediately? Existing members will not be removed.':
                  'Expire this invitation now? This cannot be undone.'))return;
                setBusy(true);
                status.textContent='Updating invitation...';
                try{
                  await api.changeSecureCampaignInvitation(campaign.id,
                    invite.inviteId,action,invite.revision);
                  if(current())status.textContent='Invitation '+(action==='revoke'?'revoked.':'expired.');
                }catch(error){
                  if(current())status.textContent=error?.message||'Could not update invitation.';
                }finally{
                  setBusy(false);
                  if(current())void load();
                }
              });
              actions.appendChild(button);
            }
            row.appendChild(actions);
          }
          list.appendChild(row);
        }
        status.textContent=items.length+' invitation(s) displayed. Tokens cannot be retrieved or resent.';
      }catch(error){
        if(current()){
          list.replaceChildren();
          status.textContent=error?.message||'Could not load secure invitations.';
        }
      }finally{
        setBusy(false);
        updateType();
        if(current()){
          if(previous)previous.disabled=pageIndex===0;
          if(next)next.disabled=!forwardCursor;
        }
      }
    };
    refresh?.addEventListener('click',load);
    previous?.addEventListener('click',()=>{
      if(busy||pageIndex===0)return;
      pageIndex--;void load();
    });
    next?.addEventListener('click',()=>{
      if(busy||!forwardCursor)return;
      pageIndex++;
      pageHistory[pageIndex]=forwardCursor;
      pageHistory.length=pageIndex+1;
      void load();
    });
    createButton?.addEventListener('click',async()=>{
      if(busy||!current())return;
      const inviteType='share-link';
      const maximum=Number(uses?.value);
      const expiry=Number(byId('workspaceSecureInviteExpiry')?.value);
      if(!Number.isSafeInteger(maximum)||maximum<1||maximum>25||
         !Number.isSafeInteger(expiry)){
        created.textContent='Enter valid invitation settings.';
        return;
      }
      if(!window.crypto?.randomUUID){
        created.textContent='Secure request IDs require a supported HTTPS browser.';
        return;
      }
      setBusy(true);
      oneTime.replaceChildren();
      created.textContent='Creating secure invitation...';
      try{
        const result=await api.issueSecureCampaignInvitation({
          campaignId:campaign.id,requestId:window.crypto.randomUUID(),
          type:inviteType,
          roleOffered:byId('workspaceSecureInviteRole')?.value||'player',
          recipientEmail:null,
          expiresInHours:expiry,maxUses:maximum
        });
        if(!current())return;
        showOneTime(result);
        created.textContent='Secure invitation created. Share the private link or QR code with the intended recipient.';
        pageIndex=0;pageHistory.length=1;forwardCursor=null;
      }catch(error){
        if(current())created.textContent=error?.message||'Unable to issue invitation.';
      }finally{
        setBusy(false);updateType();
        if(current())void load();
      }
    });
    await load();
  }

  async function renderCampaignGMCharacterLifecycle(campaign){
    const host=byId('workspaceCharacterLifecycleList');
    const status=byId('workspaceCharacterLifecycleStatus');
    const refresh=byId('workspaceRefreshCharacterLifecycle');
    const api=window.AsteriaFirebase;
    if(!host||!status||!api?.listCampaignCharacterLifecycle||
      !api?.changeCampaignCharacterLifecycle)return;
    const uid=api.getUser?.()?.uid;
    let busy=false;
    const load=async()=>{
      if(busy)return;
      busy=true;
      if(refresh)refresh.disabled=true;
      status.textContent='Loading character lifecycle records...';
      try{
        const result=await api.listCampaignCharacterLifecycle(campaign.id);
        if(!host.isConnected||api.getUser?.()?.uid!==uid)return;
        host.replaceChildren();
        const links=Array.isArray(result?.links)?result.links:[];
        if(!links.length){
          const empty=document.createElement('p');
          empty.className='muted';
          empty.textContent='No approved or deactivated characters to manage.';
          host.appendChild(empty);
        }
        for(const link of links){
          const row=document.createElement('article');
          row.className='workspace-roster-row';
          const name=document.createElement('b');
          name.textContent='Character: '+String(link.sourceCharacterId||'');
          const owner=document.createElement('small');
          owner.textContent='Owner: '+String(link.ownerUid||'');
          const state=document.createElement('small');
          state.textContent='Status: '+String(link.status||'');
          row.append(name,owner,state);
          const actions=document.createElement('div');
          actions.className='workspace-roster-controls';
          const choices=link.status==='approved'?
            [['deactivate','Deactivate'],['unlink','Unlink']]:
            [['restore','Restore'],['unlink','Unlink']];
          for(const [action,label] of choices){
            const button=document.createElement('button');
            button.type='button';
            button.textContent=label;
            button.addEventListener('click',async()=>{
              if(busy||api.getUser?.()?.uid!==uid)return;
              const question=action==='deactivate'?
                'Deactivate this character? The live sheet will be archived and active gameplay stopped.':
                action==='restore'?
                  'Restore this character and its archived gameplay to the active campaign?':
                  'Unlink this character? The Forge sheet and gameplay archive will be retained.';
              if(!window.confirm(question))return;
              busy=true;
              if(refresh)refresh.disabled=true;
              host.querySelectorAll('button').forEach(b=>{b.disabled=true;});
              status.textContent='Updating character lifecycle...';
              let message='';
              try{
                const outcome=await api.changeCampaignCharacterLifecycle(campaign.id,{
                  linkId:link.linkId,action,expectedRevision:link.revision
                });
                if(api.getUser?.()?.uid!==uid)return;
                message='Character '+outcome.status+'. Original Forge data preserved.';
                await window.AsteriaDataSync?.refreshCampaigns?.('character-'+action);
              }catch(error){message=error?.message||'Could not change character state.';}
              finally{
                busy=false;
                if(status.isConnected)status.textContent=message;
                if(host.isConnected&&api.getUser?.()?.uid===uid)void load();
              }
            });
            actions.appendChild(button);
          }
          row.appendChild(actions);
          host.appendChild(row);
        }
        status.textContent=links.length+' character lifecycle record(s) loaded.';
      }catch(error){
        if(host.isConnected)host.replaceChildren();
        if(status.isConnected)status.textContent=error?.message||
          'Could not load character lifecycle records.';
      }finally{
        busy=false;
        if(refresh)refresh.disabled=false;
      }
    };
    refresh?.addEventListener('click',load);
    await load();
  }

  async function renderCampaignGMCharacterApprovals(campaign){
    const host=byId('workspaceCharacterApprovalList');
    const status=byId('workspaceCharacterApprovalStatus');
    const refresh=byId('workspaceRefreshCharacterLinks');
    const api=window.AsteriaFirebase;
    if(!host||!status||!api?.listPendingCampaignCharacterLinks||
      !api?.reviewCampaignCharacterLink)return;
    const uid=api.getUser?.()?.uid;
    let busy=false;
    const load=async()=>{
      if(busy)return;
      busy=true;
      if(refresh)refresh.disabled=true;
      status.textContent='Loading character link requests...';
      try{
        const result=await api.listPendingCampaignCharacterLinks(campaign.id);
        if(!host.isConnected||api.getUser?.()?.uid!==uid)return;
        host.replaceChildren();
        const requests=Array.isArray(result?.requests)?result.requests:[];
        if(!requests.length){
          const empty=document.createElement('p');
          empty.className='muted';
          empty.textContent='No character links awaiting approval.';
          host.appendChild(empty);
        }
        for(const item of requests){
          const row=document.createElement('div');
          row.className='workspace-join-review-row';
          const heading=document.createElement('b');
          heading.textContent='Account '+String(item.ownerUid||'');
          const detail=document.createElement('small');
          detail.textContent='Saved character: '+String(item.sourceCharacterId||'');
          const when=document.createElement('small');
          when.textContent='Requested: '+String(item.requestedAt||'Unknown time');
          row.append(heading,detail,when);
          const actions=document.createElement('div');
          actions.className='workspace-join-review-actions';
          for(const decision of ['approve','decline']){
            const button=document.createElement('button');
            button.type='button';
            button.textContent=decision==='approve'?'Approve Character':'Decline Request';
            if(decision==='approve')button.className='primary';
            button.addEventListener('click',async()=>{
              if(busy||api.getUser?.()?.uid!==uid)return;
              if(!window.confirm((decision==='approve'?'Approve':'Decline')+
                ' the character link for '+String(item.ownerUid||'')+
                '? This decision will be recorded.'))return;
              busy=true;
              if(refresh)refresh.disabled=true;
              host.querySelectorAll('button').forEach(b=>{b.disabled=true;});
              status.textContent='Reviewing character link...';
              let message='';
              try{
                const outcome=await api.reviewCampaignCharacterLink(campaign.id,
                  item.linkId,decision,item.revision);
                if(api.getUser?.()?.uid!==uid)return;
                message=outcome.status==='approved'?
                  'Character approved and linked to the campaign.':
                  'Character link declined. The original Forge character was preserved.';
                if(outcome.status==='approved')
                  await window.AsteriaDataSync?.refreshCampaigns?.('character-link-approved');
              }catch(error){
                message=error?.message||'Could not review character link. Refresh and retry.';
              }finally{
                busy=false;
                if(status.isConnected)status.textContent=message;
                if(host.isConnected&&api.getUser?.()?.uid===uid)void load();
              }
            });
            actions.appendChild(button);
          }
          row.appendChild(actions);
          host.appendChild(row);
        }
        status.textContent=result?.truncated?
          'Showing the first 100 requests. Review these and refresh for more.':
          requests.length+' character link request(s) pending.';
      }catch(error){
        if(host.isConnected)host.replaceChildren();
        if(status.isConnected)
          status.textContent=error?.message||'Could not retrieve character link requests.';
      }finally{
        busy=false;
        if(refresh)refresh.disabled=false;
      }
    };
    refresh?.addEventListener('click',load);
    await load();
  }

  async function renderCampaignGMActivity(campaign) {
    const host=byId('workspaceMemberActivity');
    const status=byId('workspaceMemberActivityStatus');
    const button=byId('workspaceRefreshMemberActivity');
    const api=window.AsteriaFirebase;
    if(!host||!status||!api?.listCampaignMembershipActivity)return;
    const uid=api.getUser?.()?.uid;
    let busy=false;
    const load=async()=>{
      if(busy)return;
      busy=true;
      if(button)button.disabled=true;
      status.textContent='Loading recent GM activity...';
      try{
        const result=await api.listCampaignMembershipActivity(campaign.id);
        if(!host.isConnected||api.getUser?.()?.uid!==uid)return;
        host.replaceChildren();
        const events=Array.isArray(result?.events)?result.events:[];
        for(const event of events){
          const entry=document.createElement('div');
          entry.className='workspace-roster-row';
          const title=document.createElement('b');
          title.textContent=String(event.type||'activity')+' · '+String(event.uid||'');
          const detail=document.createElement('small');
          detail.textContent=String(event.detail||'');
          const meta=document.createElement('small');
          meta.textContent='GM: '+String(event.actorUid||'')+' · '+String(event.at||'Unknown time');
          entry.append(title,detail,meta);
          if(event.reason){
            const reason=document.createElement('small');
            reason.textContent='Reason: '+String(event.reason);
            entry.append(reason);
          }
          host.append(entry);
        }
        if(!events.length){const empty=document.createElement('p');empty.textContent='No recorded GM activity.';host.append(empty);}
        status.textContent=result?.limited?'Showing the most recent 40 events.':'Activity loaded.';
      }catch(error){
        host.replaceChildren();
        status.textContent=error?.message||'Unable to load GM activity.';
      }finally{busy=false;if(button)button.disabled=false;}
    };
    button?.addEventListener('click',load);
    await load();
  }

  async function renderCampaignGMPlayerRoster(campaign) {
    const content=byId('workspacePlayerRosterContent');
    const status=byId('workspacePlayerRosterStatus');
    const button=byId('workspaceRefreshPlayerRoster');
    const api=window.AsteriaFirebase;
    if(!content || !status || !api?.listCampaignPlayerRoster) return;
    const uid=api.getUser?.()?.uid;
    let busy=false;
    const refresh=async()=>{
      if(busy) return;
      busy=true;
      if(button)button.disabled=true;
      status.textContent='Loading verified roster...';
      try{
        const data=await api.listCampaignPlayerRoster(campaign.id);
        if(!content.isConnected || api.getUser?.()?.uid!==uid) return;
        if(!window.AsteriaCampaignRosterView?.present?.(content,data,{
          enableControls:window.AsteriaFeatureFlags?.campaignMemberControls===true,
          enableRoleControls:window.AsteriaFeatureFlags?.campaignRolePermissions===true,
          onRoleChange:async item=>{
            if(busy||api.getUser?.()?.uid!==uid)return;
            if(!window.confirm('Change '+item.name+' from '+item.role+' to '+item.newRole+'? This changes campaign permissions immediately and will be recorded.'))return;
            busy=true;
            status.textContent='Changing member role...';
            try{
              await api.changeCampaignMemberRole(campaign.id,item.uid,item.newRole,item.revision,item.role,item.status);
              status.textContent='Member role updated. Refreshing roster.';
            }catch(error){status.textContent=error?.message||'Role change failed.';}
            finally{busy=false;refresh();}
          },
          onPermissionChange:async item=>{
            if(busy||api.getUser?.()?.uid!==uid)return;
            if(!window.confirm((item.enabled?'Grant ':'Revoke ')+item.capability+' for '+item.name+'? This changes delegated GM permissions immediately.'))return;
            busy=true;
            status.textContent='Updating Co-GM permission...';
            try{
              await api.setCampaignCoGmPermission(campaign.id,item.uid,item.capability,item.enabled,item.revision,item.role,item.status);
              status.textContent='Co-GM permission updated. Refreshing roster.';
            }catch(error){status.textContent=error?.message||'Permission change failed.';}
            finally{busy=false;refresh();}
          },
          onAction:async item=>{
            if(busy || api.getUser?.()?.uid!==uid)return;
            const action=item.action;
            const label=action.charAt(0).toUpperCase()+action.slice(1);
            const question=action==='suspend'
              ? 'Suspend account access to this campaign? Character sheets and progress will remain saved.'
              : action==='restore'
                ? 'Restore campaign access for this account? Existing character records will remain unchanged.'
                : action==='remove'
                  ? 'Remove this account from campaign access? All characters and progress will be retained.'
                  : 'Ban this account from campaign access? An owner must explicitly restore a banned account.';
            if(!window.confirm(label+' '+item.displayName+'? '+question))return;
            let reason='';
            if(action==='remove'||action==='ban'){
              const typed=window.prompt('Reason for '+label.toLowerCase()+' (4–240 characters, recorded in the GM audit):','');
              if(typed===null)return;
              reason=typed.trim();
              if(reason.length<4 || reason.length>240){
                status.textContent='A reason of 4–240 characters is required.';
                return;
              }
            }
            busy=true;
            if(button)button.disabled=true;
            content.querySelectorAll('button[data-member-action]').forEach(btn=>btn.disabled=true);
            status.textContent=label+' in progress...';
            try{
              const result=await api.moderateCampaignMember(campaign.id,item.uid,action,item.revision,item.status,reason);
              if(api.getUser?.()?.uid!==uid)return;
              status.textContent='Account '+result.status+'. Access permissions were updated on the server. Previously downloaded copies cannot be recalled.';
              await window.AsteriaDataSync?.refreshCampaigns?.('member-'+action);
            }catch(error){
              status.textContent=error?.message||'Member change failed. Refresh roster and retry.';
            }finally{
              busy=false;
              if(button)button.disabled=false;
              refresh();
            }
          }
        }))
          throw new Error('The roster response was not valid.');
        status.textContent='Roster loaded. Membership status does not indicate who is online.';
      }catch(error){
        if(content.isConnected){
          content.replaceChildren();
          status.textContent=error?.message||'Could not load campaign roster.';
        }
      }finally{
        busy=false;
        if(button)button.disabled=false;
      }
    };
    button?.addEventListener('click',refresh);
    await refresh();
  }

  async function renderCampaignGMJoinApprovals(campaign) {
    const host=byId('workspaceJoinReviewList');
    const summary=byId('workspaceJoinReviewSummary');
    const message=byId('workspaceJoinReviewMessage');
    const refresh=byId('workspaceRefreshJoinReviews');
    const api=window.AsteriaFirebase;
    if(!host || !summary || !api?.listCampaignJoinRequests) return;
    const accountUid=api.getUser?.()?.uid;
    let busy=false;
    const report=text=>{if(message)message.textContent=text;};
    const load=async()=>{
      if(busy)return;
      busy=true;
      if(refresh)refresh.disabled=true;
      if(summary)summary.textContent='Loading join requests...';
      try{
        const result=await api.listCampaignJoinRequests(campaign.id);
        if(!host.isConnected || accountUid!==api.getUser?.()?.uid) return;
        const requests=Array.isArray(result?.requests)?result.requests:[];
        const cap=Number(result?.capacity||0),count=Number(result?.activePlayers||0);
        summary.textContent=`${requests.length} pending requests · ${count} of ${cap} player slots filled · ${result.approvalMode==='automatic'?'Automatic approval':'GM approval'}`;
        const manualSelect=result.canSetMode ? `<label>Join Request Approval
          <select id="workspaceJoinApprovalMode">
            <option value="manual" ${result.approvalMode!=='automatic'?'selected':''}>GM approval (default)</option>
            ${result.autoAvailable || result.approvalMode==='automatic' ? `<option value="automatic" ${result.approvalMode==='automatic'?'selected':''} ${!result.autoAvailable?'disabled':''}>Automatic approval when capacity allows</option>` : ''}
          </select>
        </label>` : '';
        host.innerHTML=manualSelect + (requests.length?requests.map(row=>`
          <div class="workspace-join-review-row">
            <b>Account ${escapeHtml(row.uid)}</b>
            <small>Character preference: ${escapeHtml(row.requestedCharacterId||'None selected')}</small>
            <small>Requested: ${escapeHtml(row.requestedAt||'Not recorded')}</small>
            <div class="workspace-join-review-actions">
              <button class="primary" type="button" data-review="approve" data-uid="${escapeHtml(row.uid)}" data-revision="${Number(row.revision)||0}" ${count>=cap?'disabled':''}>Approve</button>
              <button type="button" data-review="decline" data-uid="${escapeHtml(row.uid)}" data-revision="${Number(row.revision)||0}">Decline</button>
            </div>
          </div>
        `).join(''):'<p class="muted">No pending join requests.</p>');
        if(result.truncated) host.insertAdjacentHTML('beforeend','<p class="muted">More requests may be pending. Refresh after reviewing these requests.</p>');
        const mode=byId('workspaceJoinApprovalMode');
        mode?.addEventListener('change',async()=>{
          const next=mode.value;
          if(next==='automatic' && !window.confirm('Allow automatic approval of future join requests while slots remain available?')){
            mode.value='manual';return;
          }
          mode.disabled=true;
          try{
            await api.setCampaignJoinApprovalMode(campaign.id,next);
            report('Approval preference saved.');
          }catch(error){report(error?.message||'Could not change approval settings.');}
          finally{mode.disabled=false;await load();}
        });
        host.querySelectorAll('button[data-review]').forEach(button=>button.addEventListener('click',async()=>{
          const decision=button.dataset.review;
          const id=button.dataset.uid;
          const revision=Number(button.dataset.revision);
          if(!['approve','decline'].includes(decision)||!Number.isSafeInteger(revision))return;
          if(!window.confirm(`${decision==='approve'?'Approve':'Decline'} this request? This action is recorded.`))return;
          host.querySelectorAll('button').forEach(btn=>btn.disabled=true);
          try{
            const response=await api.reviewCampaignJoinRequest(campaign.id,id,decision,revision);
            report(response.status==='approved'?'Account approved and given campaign access.':'Request declined without granting access.');
          }catch(error){report(error?.message||'Request review failed. Refresh and retry.');}
          await load();
        }));
      }catch(error){
        if(summary) summary.textContent='Unable to verify GM request access.';
        host.replaceChildren();
        report(error?.message||'Unable to retrieve join requests.');
      }finally{
        busy=false;
        if(refresh)refresh.disabled=false;
      }
    };
    refresh?.addEventListener('click',load);
    await load();
  }

  function renderCharacterDetail(character) {
    const grid = byId('clean-grid');
    if (!grid) return;
    grid.innerHTML = `
      <article class="clean-page workspace-viewer" data-viewer="universal-workspace-viewer">
        <button class="clean-back clean-return" type="button" id="workspace-character-return">Back to characters</button>
        <header class="clean-page-head"><span class="clean-tag">Character</span><div><p class="eyebrow">Character Workspace</p><h2>${escapeHtml(character.name || 'Unnamed Character')}</h2><p>${escapeHtml(character.race || 'Unselected Race')} / ${escapeHtml(character.klass || 'Unselected Class')}</p></div></header>
        <dl class="clean-page-meta">
          <div><dt>Level</dt><dd>${escapeHtml(character.level || 0)}</dd></div>
          <div><dt>Campaign</dt><dd>${escapeHtml(character.campaign || 'Unassigned')}</dd></div>
          <div><dt>HP</dt><dd>${escapeHtml(`${character.hp?.[0] ?? 10} / ${character.hp?.[1] ?? 10}`)}</dd></div>
          <div><dt>SP</dt><dd>${escapeHtml(`${character.sp?.[0] ?? 10} / ${character.sp?.[1] ?? 10}`)}</dd></div>
          <div><dt>MP</dt><dd>${escapeHtml(`${character.mp?.[0] ?? 10} / ${character.mp?.[1] ?? 10}`)}</dd></div>
        </dl>
      </article>
    `;
    byId('workspace-character-return').onclick = () => openDashboard('characters');
    const controls=document.createElement('div');
    const repair=document.createElement('button');repair.type='button';repair.textContent='Manage / repair campaign links';
    repair.addEventListener('click',()=>openDashboard('campaigns'));controls.appendChild(repair);grid.querySelector('article')?.appendChild(controls);
  }

  function campaignByCode(codeValue) {
    const code = campaignCode(codeValue);
    if (!code) return null;
    return (window.campaigns || [])
      .map((campaign, index) => ensureCampaignInviteFields(Object.assign(campaign, { id:campaignId(campaign, index) })))
      .find(campaign => campaign.ucn === code || campaign.uniqueCampaignCode === code || campaign.inviteCode === code) || null;
  }

  function storeAccountCampaign(campaign) {
    if (!campaign?.id) return null;
    window.campaigns = Array.isArray(window.campaigns) ? window.campaigns : [];
    const index = window.campaigns.findIndex(item => item?.id === campaign.id);
    if (index >= 0) window.campaigns[index] = Object.assign({}, window.campaigns[index], campaign);
    else window.campaigns.push(campaign);
    return index >= 0 ? window.campaigns[index] : campaign;
  }

  function joinResult(message, tone = '') {
    const result = byId('workspaceJoinCampaignResult');
    if (result) result.innerHTML = `<span class="${escapeHtml(tone)}">${escapeHtml(message)}</span>`;
  }

  function rememberCampaignInviteCode(codeValue) {
    const code = campaignCode(codeValue);
    if (!code) return '';
    window.AsteriaPendingInviteCode = code;
    try { localStorage.setItem('asteriaPendingInviteCode', code); } catch {}
    return code;
  }

  function takeCampaignInviteCode() {
    const code = campaignCode(window.AsteriaPendingInviteCode || (() => {
      try { return localStorage.getItem('asteriaPendingInviteCode') || ''; } catch { return ''; }
    })());
    if (code) {
      window.AsteriaPendingInviteCode = '';
      try { localStorage.removeItem('asteriaPendingInviteCode'); } catch {}
    }
    return code;
  }

  function addCampaignPlayer(campaign) {
    const uid = accountKey();
    const role = campaignRole(campaign) === 'GM' ? 'gm' : 'player';
    campaign.players = Object.assign({}, campaign.players || {});
    campaign.roles = Object.assign({}, campaign.roles || {});
    campaign.playerUids = Array.from(new Set([...(campaign.playerUids || []), uid]));
    if (role !== 'gm' && campaign.roles[uid] !== 'gm') campaign.roles[uid] = 'player';
    campaign.players[uid] = Object.assign({
      uid,
      role,
      status:'active',
      characterIds:[],
      joinedAt:new Date().toISOString()
    }, campaign.players[uid] || {});
    campaign.players[uid].role = campaign.players[uid].role === 'gm' ? 'gm' : role;
    campaign.players[uid].status = 'active';
    return campaign.players[uid];
  }

  function renderJoinCharacterChooser(campaign) {
    const host = byId('workspaceJoinCharacterChooser');
    if (!host || !campaign) return;
    const characters = ownedCharacters();
    host.innerHTML = `
      <div class="workspace-join-choice">
        <b>${escapeHtml(campaign.name || 'Campaign found')}</b>
        <small>UCN ${escapeHtml(campaign.ucn)}</small>
      </div>
      ${characters.length ? `
        <label>Choose Character<select id="workspaceJoinCharacterSelect">
          ${characters.map(character => `<option value="${escapeHtml(character.id)}">${escapeHtml(character.name || character.id)}${character.campaign && character.campaign !== 'Unassigned' ? ` - ${escapeHtml(character.campaign)}` : ''}</option>`).join('')}
        </select></label>
        <button class="primary" type="button" id="workspaceJoinCharacterBtn">Link Selected Character</button>
      ` : '<p class="muted">No forged characters are attached to this account yet.</p>'}
      <button type="button" id="workspaceJoinForgeCharacterBtn">Forge New Character For This Campaign</button>
    `;
    byId('workspaceJoinCharacterBtn')?.addEventListener('click', event => {
      event.preventDefault();
      linkCharacterToCampaign(campaign.id, byId('workspaceJoinCharacterSelect')?.value || '');
    });
    byId('workspaceJoinForgeCharacterBtn')?.addEventListener('click', event => {
      event.preventDefault();
      if(campaign.settings?.allowPlayerCreateCharacter===false) {
        window.toast?.('The GM has disabled new characters for this campaign.');
        return;
      }
      setPendingCampaignJoin(campaign);
      if (window.AsteriaGameplay?.startNewCharacterForge) window.AsteriaGameplay.startNewCharacterForge();
      else if (window.AsteriaGameplay?.openCharacterCreator) window.AsteriaGameplay.openCharacterCreator();
      else window.AsteriaGameplay?.openCharacterForge?.();
    });
  }

  function campaignJoinPreviewEnabled() {
    // The website and Firebase Cloud Functions deploy separately. Leave the
    // legacy join path intact until the new backend response is verified.
    return window.AsteriaFeatureFlags?.campaignJoinPreview === true;
  }

  async function joinLegacyCampaignByUCN(codeValue) {
    if (!requireAccountWorkspace()) return null;
    const code = campaignCode(codeValue);
    if (code.length !== 12) {
      joinResult('Enter the 12 digit Unique Campaign Number from your GM.', 'warn');
      return null;
    }
    const joinButton = byId('workspaceJoinCampaignBtn');
    let campaign = campaignByCode(code);
    let joinedInCloud = false;
    const firebaseReady = Boolean(window.AsteriaFirebase?.isReady?.());
    if (firebaseReady && (!campaign || campaignRole(campaign) !== 'GM')) {
      if (joinButton) joinButton.disabled = true;
      joinResult('Finding campaign...', 'info');
      try {
        const sharedCampaign = await window.AsteriaFirebase.joinCampaignByUCN(code);
        if (sharedCampaign) {
          campaign = storeAccountCampaign(sharedCampaign);
          joinedInCloud = true;
        }
      } catch (error) {
        console.warn('UCN campaign join failed.', error);
        const permissionProblem = error?.code === 'permission-denied' || /permission/i.test(String(error?.message || ''));
        joinResult(permissionProblem
          ? 'Firebase blocked this join. Publish the included Firestore rules, then try again.'
          : 'The campaign service could not complete the join. Please try again.', 'warn');
        return null;
      } finally {
        if (joinButton) joinButton.disabled = false;
      }
    }
    if (!campaign) {
      joinResult(firebaseReady
        ? 'No campaign was found for that UCN.'
        : 'Cross-account UCN joining requires a real Firebase login. Test Login only sees campaigns in this browser.', 'warn');
      return null;
    }
    ensureCampaignInviteFields(campaign);
    const player = addCampaignPlayer(campaign);
    const email = sessionInfo().email || '';
    campaign.invites = arrayValue(campaign.invites).map(invite => {
      if (invite.code === campaign.ucn && (!invite.email || !email || lower(invite.email) === lower(email))) {
        return Object.assign({}, invite, { status:'accepted', acceptedBy:accountKey(), acceptedAt:new Date().toISOString() });
      }
      return invite;
    });
    campaign.activity = arrayValue(campaign.activity);
    if (!joinedInCloud) campaign.activity.push(`${sessionInfo().user || sessionInfo().email || 'Player'} joined with UCN.`);
    persistWorkspaceChange('campaign-ucn-joined');
    if (!joinedInCloud) window.AsteriaFirebase?.saveCampaign?.(campaign.id, campaign);
    joinResult(`Joined ${campaign.name || 'campaign'}. Choose a character to link.`, 'ok');
    renderJoinCharacterChooser(campaign);
    return player;
  }


  function clearCampaignJoinPreview() {
    campaignLookupSequence += 1;
    campaignLookupState = null;
    const preview = byId('workspaceJoinCampaignPreview');
    if(preview) { preview.hidden = true; preview.replaceChildren(); }
    const chooser = byId('workspaceJoinCharacterChooser');
    if(chooser) chooser.replaceChildren();
  }

  async function lookupCampaignByUCN(codeValue) {
    if (!requireAccountWorkspace()) return null;
    clearCampaignJoinPreview();
    const model = window.AsteriaCampaignJoinModel;
    const code = model?.normalizeUCN?.(codeValue) || '';
    if (!code) {
      joinResult('Enter a valid 12-digit Unique Campaign Number.', 'warn');
      return null;
    }
    const firebase = window.AsteriaFirebase;
    const activeUser = firebase?.getUser?.();
    const account = sessionInfo();
    if (!firebase?.isReady?.() || !model?.joinAccountValid?.(account,activeUser)) {
      joinResult('Sign in with your Firebase account to verify the campaign. Test Login cannot join another account\'s campaign.', 'warn');
      return null;
    }
    if (typeof firebase.previewCampaignByUCN !== 'function') {
      joinResult('Campaign lookup is currently unavailable. Try again after the connection is restored.', 'warn');
      return null;
    }
    const requestId=campaignLookupSequence;
    const joinButton=byId('workspaceJoinCampaignBtn');
    if(joinButton) joinButton.disabled=true;
    joinResult('Checking campaign number...', 'info');
    try {
      let response;
      try {
        response=await firebase.previewCampaignByUCN(code);
      }catch(error){
        // Older backend deployments may support the original preview callable.
        // Never bypass security/rate-limit errors or treat an unlabelled
        // response as proof that an unknown campaign allows instant joining.
        if(!/not-found|unimplemented/i.test(String(error?.code || '')) ||
          typeof firebase.findCampaignByUCN !== 'function') throw error;
        response=await firebase.findCampaignByUCN(code);
      }
      if(requestId !== campaignLookupSequence ||
        firebase?.getUser?.()?.uid !== activeUser.uid) return null;
      const locallyVerified = (window.campaigns || []).find(campaign=>
        campaign?.id===response?.id && campaign?.ucn===code);
      if(response && !response.joinMode && locallyVerified &&
        [undefined,null,1].includes(locallyVerified.membershipSchemaVersion)){
        response={...response,joinMode:'legacy-compatibility'};
      }
      const candidate=model.verifiedPreview(response,code);
      if(!candidate){
        joinResult(response ? 'The campaign could not be verified for joining. Please try again later.' : 'No campaign was found for that UCN.', 'warn');
        return null;
      }
      campaignLookupState={preview:candidate,uid:activeUser.uid};
      renderCampaignJoinPreview(candidate,activeUser);
      joinResult('Campaign found. Review the details and your account below.', 'ok');
      if(candidate.joinMode==='request' && window.AsteriaFeatureFlags?.campaignJoinRequests===true && typeof firebase.joinRequestStatus==='function') {
        try {
          const status=await firebase.joinRequestStatus(candidate.id,candidate.ucn);
          if(requestId===campaignLookupSequence && firebase.getUser?.()?.uid===activeUser.uid){
            campaignLookupState.requestStatus=status;
            renderCampaignJoinRequestStatus(status);
          }
        }catch(error){
          if(requestId===campaignLookupSequence){
            joinResult('Campaign found, but request status could not be verified. Search again before submitting.', 'warn');
            const submit=byId('workspaceSubmitJoinRequest');
            if(submit) submit.disabled=true;
          }
        }
      }
      return candidate;
    }catch(error){
      console.warn('Campaign preview failed.',error);
      if(requestId !== campaignLookupSequence) return null;
      const throttled=/too many|resource-exhausted/i.test(String(error?.message || '')+' '+String(error?.code || ''));
      joinResult(throttled ? 'Too many campaign lookups. Please try again shortly.' :
        'Campaign lookup is unavailable. No account connection was changed.', 'warn');
      return null;
    }finally{
      if(joinButton) joinButton.disabled=false;
    }
  }

  function renderCampaignJoinPreview(preview,activeUser) {
    const host=byId('workspaceJoinCampaignPreview');
    if(!host) return;
    const account=sessionInfo();
    const label=account.email || account.user || activeUser.email || activeUser.uid;
    const legacy=preview.joinMode==='legacy' || preview.joinMode==='legacy-compatibility';
    const request=preview.joinMode==='request';
    host.hidden=false;
    host.innerHTML=`
      <div class="workspace-join-choice">
        <div><b>${escapeHtml(preview.name)}</b><small>UCN ${escapeHtml(preview.ucn)}</small></div>
        <span class="clean-tag">${legacy?'Legacy invitation':request?'GM approval required':'Unavailable'}</span>
      </div>
      <p class="workspace-join-account"><b>Verified account:</b> ${escapeHtml(label)}</p>
      <p class="muted">${legacy
        ? 'This campaign still uses the legacy invitation system. Confirming joins immediately without the new GM approval workflow.'
        : request
          ? 'Submit a join request for GM approval. You may select an owned character as a preference; no character will be linked until approval.'
          : 'This campaign is not accepting connections through the current joining system.'}</p>
      ${legacy ? '<button class="primary" type="button" id="workspaceConfirmCampaignJoin">Confirm &amp; Join Campaign</button>' : ''}
      ${request ? `<section class="workspace-join-request" aria-label="Campaign join request">
        <p id="workspaceJoinRequestStatus" aria-live="polite">Checking request status...</p>
        <label class="workspace-join-code-label">Character preference (optional)
          <select id="workspaceJoinRequestCharacter" disabled>
            <option value="">No character selected</option>
            ${ownedCharacters().map(character=>`<option value="${escapeHtml(character.id)}">${escapeHtml(character.name || character.id)}</option>`).join('')}
          </select>
        </label>
        <button class="primary" type="button" id="workspaceSubmitJoinRequest" disabled>Request to Join</button>
      </section>` : ''}
    `;
    byId('workspaceSubmitJoinRequest')?.addEventListener('click',async event=>{
      event.preventDefault();event.stopPropagation();
      await submitCampaignJoinRequest();
    });
    byId('workspaceConfirmCampaignJoin')?.addEventListener('click',async event=>{
      event.preventDefault();event.stopPropagation();
      await confirmCampaignJoin();
    });
  }

  function renderCampaignJoinRequestStatus(status){
    const state=campaignLookupState;
    if(state?.preview?.joinMode!=='request') return;
    const line=byId('workspaceJoinRequestStatus');
    const submit=byId('workspaceSubmitJoinRequest');
    const choice=byId('workspaceJoinRequestCharacter');
    const value=status?.status || 'unknown';
    const copy={
      none:'You have not requested access yet. The GM must approve a new request.',
      pending:'Request pending GM approval. You cannot join or link a character yet.',
      approved:'Your request was approved. Your account now has campaign access. Character linking is a separate step.',
      declined:'Your previous request was declined. Contact the GM if you need assistance.',
      cancelled:'This request is cancelled. Contact the GM to request another invitation.',
      expired:'This request has expired. Contact the GM to submit again.',
      closed:'This campaign is not accepting new join requests.',
      member:'This account is already a campaign member.',
      blocked:'This account cannot submit a new request. Contact the GM.'
    };
    if(line) line.textContent=copy[value] || 'Request status could not be verified.';
    const eligible=value==='none' && window.AsteriaFeatureFlags?.campaignJoinRequests===true;
    if(submit) { submit.disabled=!eligible; submit.hidden=!eligible; }
    if(choice) choice.disabled=!eligible;
    if(value==='none' && !eligible && line) line.textContent=
      'Join requests are not activated on this website yet. No account connection has been changed.';
  }

  async function submitCampaignJoinRequest(){
    const state=campaignLookupState;
    const firebase=window.AsteriaFirebase;
    const activeUser=firebase?.getUser?.();
    const model=window.AsteriaCampaignJoinModel;
    if(!state || state.preview?.joinMode!=='request' ||
       state.uid!==activeUser?.uid ||
       !model?.joinAccountValid?.(sessionInfo(),activeUser) ||
       model.normalizeUCN(byId('workspaceJoinCampaignCode')?.value || '')!==state.preview.ucn ||
       state.requestStatus?.status!=='none' ||
       window.AsteriaFeatureFlags?.campaignJoinRequests!==true){
      clearCampaignJoinPreview();
      joinResult('Account or campaign verification changed. Search again before requesting access.', 'warn');
      return null;
    }
    const requestId=campaignLookupSequence;
    const button=byId('workspaceSubmitJoinRequest');
    if(button) button.disabled=true;
    joinResult('Submitting join request...', 'info');
    try{
      const selected=byId('workspaceJoinRequestCharacter')?.value || null;
      const result=await firebase.submitCampaignJoinRequest(state.preview.id,state.preview.ucn,selected);
      if(requestId!==campaignLookupSequence || firebase.getUser?.()?.uid!==state.uid) return null;
      if(!result || result.campaignId!==state.preview.id || typeof result.status!=='string'){
        throw new Error('Unexpected join request response.');
      }
      state.requestStatus=result;
      renderCampaignJoinRequestStatus(result);
      joinResult(result.status==='pending' ? 'Request pending GM approval. You will not gain access until approved.' :
        'Your campaign request status has been updated.', 'ok');
      return result;
    }catch(error){
      console.warn('Campaign join request failed.',error);
      if(requestId===campaignLookupSequence){
        joinResult('Request could not be confirmed. Search again to check its status before retrying.', 'warn');
        clearCampaignJoinPreview();
      }
      return null;
    }
  }

  async function confirmCampaignJoin() {
    const state=campaignLookupState;
    const model=window.AsteriaCampaignJoinModel;
    const firebase=window.AsteriaFirebase;
    const account=sessionInfo(),activeUser=firebase?.getUser?.();
    const code=byId('workspaceJoinCampaignCode')?.value || '';
    if(!state || state.uid!==activeUser?.uid ||
      !model?.canJoinPreview?.(state.preview,account,activeUser,code)){
      clearCampaignJoinPreview();
      joinResult('Campaign or account verification changed. Search again before joining.', 'warn');
      return null;
    }
    const button=byId('workspaceConfirmCampaignJoin');
    if(button) button.disabled=true;
    joinResult('Connecting your account to this legacy campaign...', 'info');
    try {
      const sharedCampaign=await firebase.joinCampaignByUCN(state.preview.ucn);
      if(!sharedCampaign || sharedCampaign.id!==state.preview.id ||
        sharedCampaign.ucn!==state.preview.ucn){
        throw new Error('Campaign identity changed while joining.');
      }
      if(firebase.getUser?.()?.uid!==state.uid || !model.joinAccountValid(sessionInfo(),firebase.getUser?.())){
        clearCampaignJoinPreview();
        joinResult('Account changed. Refresh the campaign list before continuing.', 'warn');
        return null;
      }
      const campaign=storeAccountCampaign(sharedCampaign);
      const player=addCampaignPlayer(campaign);
      persistWorkspaceChange('campaign-ucn-joined');
      joinResult(`Joined ${campaign.name || 'campaign'}. Choose a character to link.`, 'ok');
      renderJoinCharacterChooser(campaign);
      return player;
    }catch(error){
      console.warn('UCN campaign join failed.',error);
      joinResult(/join request/i.test(String(error?.message || ''))
        ? 'This campaign requires GM approval. Join requests will be available in the next update.'
        : 'The campaign service could not complete the connection. No local membership was added.', 'warn');
      return null;
    }finally {
      if(button) button.disabled=false;
    }
  }

  // Existing API name now performs read-only discovery, never an implicit join.
  async function joinCampaignByUCN(codeValue) {
    return campaignJoinPreviewEnabled()
      ? lookupCampaignByUCN(codeValue)
      : joinLegacyCampaignByUCN(codeValue);
  }

  function setPendingCampaignJoin(campaign) {
    ensureCampaignInviteFields(campaign);
    const pending = {
      campaignId:campaign.id,
      ucn:campaign.ucn,
      campaignName:campaign.name || 'Untitled Campaign',
      createdAt:new Date().toISOString()
    };
    window.AsteriaPendingCampaignJoin = pending;
    try { localStorage.setItem('asteriaPendingCampaignJoin', JSON.stringify(pending)); } catch {}
    window.toast?.(`Forge a character for ${pending.campaignName}. It will link when saved.`);
    return pending;
  }

  function readPendingCampaignJoin() {
    if (window.AsteriaPendingCampaignJoin?.campaignId) return window.AsteriaPendingCampaignJoin;
    try { return JSON.parse(localStorage.getItem('asteriaPendingCampaignJoin') || '{}'); } catch { return {}; }
  }

  function clearPendingCampaignJoin() {
    window.AsteriaPendingCampaignJoin = null;
    try { localStorage.removeItem('asteriaPendingCampaignJoin'); } catch {}
  }

  async function consumePendingCampaignJoin(characterId) {
    const pending = readPendingCampaignJoin();
    if (!pending?.campaignId || !characterId) return null;
    const campaign = findCampaign(pending.campaignId);
    if (!campaign) {
      clearPendingCampaignJoin();
      return null;
    }
    pending.characterId=characterId;
    if(typeof window!=='undefined')window.AsteriaPendingCampaignJoin=pending;
    try{localStorage.setItem('asteriaPendingCampaignJoin',JSON.stringify(pending));}catch{}
    const linkedCampaign = await linkCharacterToCampaign(pending.campaignId, characterId, { silent:true, skipRender:true });
    if (linkedCampaign) clearPendingCampaignJoin();
    return linkedCampaign;
  }

  function createCampaignInvite(campaignIdValue) {
    const campaign = findCampaign(campaignIdValue);
    if (!campaign || campaignRole(campaign) !== 'GM') return null;
    ensureCampaignInviteFields(campaign);
    const email = String(byId('workspaceInviteEmail')?.value || '').trim();
    if (!email) {
      window.toast?.('Add the player email first.');
      return null;
    }
    const invite = {
      id:randomToken('invite-'),
      email,
      code:campaign.ucn,
      link:inviteLink(campaign),
      status:'created-email-ready',
      invitedBy:accountKey(),
      createdAt:new Date().toISOString()
    };
    campaign.invites = arrayValue(campaign.invites).concat(invite);
    campaign.activity = arrayValue(campaign.activity).concat(`Invite created for ${email}.`);
    persistWorkspaceChange('campaign-invite-created');
    window.AsteriaFirebase?.saveCampaign?.(campaign.id, campaign);
    window.toast?.(`Invite ready for ${email}.`);
    renderCampaignDetail(campaign);
    return invite;
  }

  function findCampaign(id) {
    return (window.campaigns || []).find(campaign => campaign.id === id);
  }

  function persistWorkspaceChange(reason) {
    window.saveAccountState?.();
    window.saveAsteriaState?.();
    window.AsteriaDataSync?.scheduleSave?.(reason);
  }

  async function createWorkspaceCampaign() {
    if (!requireAccountWorkspace()) return;
    const name = String(byId('workspaceCampaignName')?.value || '').trim() || 'New Campaign';
    const description = String(byId('workspaceCampaignDescription')?.value || '').trim();
    const imageFile=byId('workspaceCampaignArtwork')?.files?.[0];
    if(imageFile && (!['image/png','image/jpeg','image/webp','image/gif'].includes(imageFile.type) || !imageFile.size || imageFile.size>8*1024*1024)) {
      const status=byId('workspaceCampaignArtworkStatus');if(status)status.textContent='Choose a PNG, JPG, WEBP or GIF image up to 8 MB.';
      return;
    }
    const forgeButton=byId('workspaceCreateCampaignBtn');if(forgeButton)forgeButton.disabled=true;
    const partySize = Math.max(1, Math.min(12, Number(byId('workspaceCampaignPartySize')?.value || 4)));
    const uid = accountKey();
    let id = randomToken('camp-');
    let inviteCode = uniqueCampaignCode();
    const canaryV2=window.AsteriaFeatureFlags?.campaignInAppCanary===true &&
      new URLSearchParams(window.location.search).get('campaign-inapp-canary')==='1';
    const serverIdentityEnabled = window.AsteriaFirebase?.serverCampaignUCNEnabled?.() === true;
    if(canaryV2&&!serverIdentityEnabled){
      const status=byId('workspaceCampaignArtworkStatus');
      if(status)status.textContent='The new campaign invitation test is not activated.';
      if(forgeButton)forgeButton.disabled=false;
      return;
    }
    if(serverIdentityEnabled) {
      try {
        const identity = await window.AsteriaFirebase.createCampaignIdentity(name,
          {v2Test:canaryV2,partySize});
        if(canaryV2&&identity?.membershipSchemaVersion!==2)
          throw new Error('The server did not create a v2 campaign.');
        if(!identity || !/^\d{12}$/.test(String(identity.ucn || '')) || !identity.id) {
          throw new Error('Invalid server campaign identity.');
        }
        id = identity.id;
        inviteCode = identity.ucn;
      } catch(error) {
        console.warn('Campaign identity could not be reserved.',error);
        const status = byId('workspaceCampaignArtworkStatus');
        if(status) status.textContent = 'Campaign number could not be reserved. No campaign was created. Check the connection and retry.';
        if(forgeButton) forgeButton.disabled = false;
        return;
      }
    }
    const campaign = {
      id,
      name,
      description,
      gmId:uid,
      party:[],
      partySize,
      access:{ dashboard:true, inventory:true, spells:true, journal:true, quests:true, notes:false },
      ownerUid:uid,
      ownerAccount:uid,
      ...(canaryV2?{membershipSchemaVersion:2,membershipRevision:1,joinPolicy:{
        joinRequestsOpen:true,autoApprove:false
      }}:{}),
      createdBy:sessionInfo().user || sessionInfo().email || uid,
      gmUids:[uid],
      playerUids:[],
      roles:{ [uid]:'gm' },
      players:{
        [uid]:{
          uid,
          role:'gm',
          status:'active',
          characterIds:[],
          joinedAt:new Date().toISOString()
        }
      },
      characters:{},
      playerCharacterLinks:{},
      chat:{ messages:[] },
      guildBank:{
        coins:{ copper:0, silver:0, gold:0, platinum_crown:0, royal_crown:0, royal_platinum:0 },
        items:[],
        transactions:[]
      },
      settings:{
        partySize,
        visibility:'private',
        inviteRequired:true,
        allowPlayerCreateCharacter:true,
        allowPlayerLinkCharacter:true
      },
      ucn:inviteCode,
      uniqueCampaignCode:inviteCode,
      inviteCode,
      inviteLink:'',
      invites:[],
      createdAt:new Date().toISOString(),
      activity:[`Campaign created by ${sessionInfo().user || sessionInfo().email || 'account'}.`]
    };
    ensureCampaignInviteFields(campaign);
    window.campaigns = window.campaigns || [];
    window.campaigns.push(campaign);
    window.activeCampaign = window.campaigns.length - 1;
    persistWorkspaceChange('workspace-campaign-created');
    // Save the campaign first: Storage access requires its verified GM membership.
    const saveCampaign=window.AsteriaFirebase?.saveCampaign;
    let saved=false;
    try{saved=Boolean(await saveCampaign?.(id,campaign));}
    catch(error){console.warn('Campaign save failed before artwork upload',error);}
    if(!saved){
      window.toast?.('Campaign saved locally, but the cloud save failed. Open Campaign Forge to retry after reconnecting.');
      openDashboard('campaigns');
      return;
    }
    let imageWarning='';
    if(imageFile){
      const status=byId('workspaceCampaignArtworkStatus');
      if(status)status.textContent='Uploading campaign artwork...';
      try{
        const result=await window.AsteriaFirebase?.uploadCampaignArtwork?.(id,imageFile);
        if(result?.ok){campaign.image=result.image;campaign.imagePath=result.path;}
        else imageWarning=result?.error||'Artwork upload failed. Add it in the GM Campaign Manager.';
      }catch(error){imageWarning=error?.message||'Artwork upload failed. Add it in the GM Campaign Manager.';}
    }
    openDashboard('campaigns');
    window.toast?.(imageWarning ? `Campaign created, but ${imageWarning}` : `Campaign created: ${name}`);
  }

  function createWorkspaceCharacter() {
    if (window.AsteriaGameplay?.openCharacterForge) {
      window.AsteriaGameplay.openCharacterForge();
      return;
    }
    if (!requireAccountWorkspace()) return;
    const record = ensureAccountRecord();
    const name = String(byId('workspaceCharacterName')?.value || '').trim() || 'New Character';
    const id = typeof window.normaliseId === 'function' ? window.normaliseId(name) : slugify(name);
    const race = String(byId('workspaceCharacterRace')?.value || 'Unselected').trim();
    const klass = String(byId('workspaceCharacterClass')?.value || 'Unselected').trim();
    const age = String(byId('workspaceCharacterAge')?.value || '').trim();
    const initial = typeof window.characterInitial === 'function' ? window.characterInitial(name) : (name.charAt(0).toUpperCase() || '?');
    window.chars = window.chars || {};
    window.chars[id] = {
      id,
      initial,
      name,
      race,
      klass,
      age,
      ownerUid:accountKey(),
      level:0,
      hp:[10,10],
      sp:[10,10],
      mp:[10,10],
      xp:0,
      xpMax:window.AsteriaProgression?.xpToNextLevel?.(0) || 1000,
      campaign:'Unassigned',
      session:'No active session',
      conditions:[],
      cp:0,
      tp:0,
      resourceMods:{ hp:0, sp:0, mp:0 },
      characteristics:{ strength:0, dexterity:0, agility:0, constitution:0, endurance:0, intelligence:0, wisdom:0, charisma:0, luck:0 },
      inventory:[]
    };
    if (!record.characters.includes(id)) record.characters.push(id);
    window.session = window.session || {};
    window.session.character = id;
    window.selected = id;
    persistWorkspaceChange('workspace-character-created');
    window.AsteriaFirebase?.saveCharacter?.(id, window.chars[id]);
    window.toast?.(`Character created: ${name}`);
    openDashboard('characters');
    renderCharacterDetail(Object.assign({ id }, window.chars[id]));
  }

  async function repairCharacterCampaignLink(campaignId) {
    const button=byId('workspaceRepairCharacterBtn'),status=byId('workspaceRepairStatus');
    const id=byId('workspaceRepairCharacter')?.value;
    if(!id || !button || button.disabled)return;
    button.disabled=true;
    try {
      const api=window.AsteriaFirebase;
      if(!api?.isReady?.() || !api.repairCampaignCharacterLink)throw new Error('Sign in and wait for Firebase before repairing a link.');
      if(status)status.textContent='Verifying the existing owner and saved character…';
      const result=await api.repairCampaignCharacterLink(campaignId,id);
      if(!result?.ok)throw new Error(result?.error || 'The link could not be repaired.');
      await window.AsteriaDataSync?.refreshCampaigns?.('character-link-repaired');
      const target=byId('workspaceRepairStatus') || status;
      if(target)target.textContent='Link repaired. Return to the GM encounter and choose Add linked players.';
    } catch(error) {
      if(status)status.textContent=error.message || 'The link could not be repaired.';
    } finally { button.disabled=false; }
  }

  async function linkCharacterToCampaign(campaignIdValue, characterIdValue = '', options = {}) {
    let campaign = findCampaign(campaignIdValue);
    const characterId = characterIdValue || byId('workspaceLinkCharacter')?.value;
    if (!campaign || !characterId || !window.chars?.[characterId]) return null;
    const api = window.AsteriaFirebase;
    const uid = api?.getUser?.()?.uid || accountKey();
    if (window.chars[characterId].ownerUid !== uid) {
      window.toast?.('Only the character owner can link this character.');
      return null;
    }
    if(campaign.membershipSchemaVersion===2){
      const status=byId('workspaceCharacterLinkStatus');
      const button=byId('workspaceLinkCharacterBtn');
      if(!api?.isReady?.()||!api.requestCampaignCharacterLink){
        if(status)status.textContent='Sign in and connect Firebase to request a character link.';
        return null;
      }
      if(window.AsteriaFeatureFlags?.campaignCharacterLinks!==true){
        if(status)status.textContent='Campaign character requests are not activated yet.';
        return null;
      }
      if(button){button.disabled=true;button.textContent='Requesting…';}
      try{
        const pending=readPendingCampaignJoin();
        const sourceKind=pending?.campaignId===campaign.id&&pending?.characterId===characterId?'forge':'owned';
        const response=await api.requestCampaignCharacterLink(campaign.id,
          String(window.chars[characterId].sourceCharacterId||characterId),sourceKind);
        const outcome=response?.status==='approved'?'already approved':'pending GM approval';
        const message='Character link '+outcome+'. Your saved character remains unchanged.';
        if(status)status.textContent=message;
        if(!options.silent)window.toast?.(message);
        if(response?.status==='pending'||response?.status==='approved')return campaign;
        return null;
      }catch(error){
        const message=error?.message||'The character link request could not be submitted.';
        if(status)status.textContent=message;
        if(!options.silent)window.toast?.(message);
        return null;
      }finally{
        if(button){button.disabled=false;button.textContent='Request Link';}
      }
    }
    if (api) {
      if (!api.isReady?.() || !api.linkCharacterToCampaign) {
        window.toast?.('Wait for Firebase to connect before linking this character.');
        return null;
      }
      const button = byId('workspaceLinkCharacterBtn');
      if (button) { button.disabled = true; button.textContent = 'Linking…'; }
      try {
        // Commit first. Optimistic roster edits used to trigger background saves
        // and destructive rollback even when an earlier link already existed.
        const linked = await api.linkCharacterToCampaign(campaign.id, { ...window.chars[characterId], id:characterId });
        if (!linked) throw new Error('The campaign is unavailable. Refresh your campaigns and try again.');
        campaign = storeAccountCampaign(linked);
        window.chars[characterId] = { ...window.chars[characterId], campaign:campaign.name,
          sharedCampaignId:campaign.id,
          linkedCampaignIds:Array.from(new Set([...(window.chars[characterId].linkedCampaignIds || []), campaign.id])) };
        persistWorkspaceChange('workspace-character-linked');
        if (!options.silent) window.toast?.(`${window.chars[characterId].name} linked to ${campaign.name}.`);
        if (!options.skipRender) renderCampaignDetail(campaign);
        return campaign;
      } catch (error) {
        console.warn('Could not link character to the shared campaign.', error);
        const reason = error?.code === 'permission-denied'
          ? 'Firebase denied the link. Check campaign membership and that the current Firestore rules are deployed.'
          : error?.message || 'The character could not be linked. Please try again.';
        window.toast?.(reason);
        return null;
      } finally {
        if (button) { button.disabled = false; button.textContent = 'Link Character'; }
      }
    }
    ensureCampaignInviteFields(campaign);
    campaign.party = Array.from(new Set([...(campaign.party || []), characterId]));
    campaign.playerUids = Array.from(new Set([...(campaign.playerUids || []), uid]));
    campaign.roles = Object.assign({}, campaign.roles || {});
    if (campaign.roles[uid] !== 'gm') campaign.roles[uid] = 'player';
    campaign.players = Object.assign({}, campaign.players || {});
    campaign.players[uid] = campaign.players[uid] || { uid, role:campaignRole(campaign) === 'GM' ? 'gm' : 'player', status:'active', characterIds:[], joinedAt:new Date().toISOString() };
    campaign.players[uid].characterIds = Array.from(new Set([...(campaign.players[uid].characterIds || []), characterId]));
    campaign.characters = Object.assign({}, campaign.characters || {});
    campaign.characters[characterId] = {
      id:characterId,
      ownerUid:uid,
      name:window.chars[characterId].name || characterId,
      initial:window.chars[characterId].initial || String(window.chars[characterId].name || characterId).charAt(0).toUpperCase(),
      race:window.chars[characterId].race || '',
      klass:window.chars[characterId].klass || window.chars[characterId].class || '',
      level:Number(window.chars[characterId].level || 0),
      hp:Array.isArray(window.chars[characterId].hp) ? window.chars[characterId].hp.slice() : [10,10],
      sp:Array.isArray(window.chars[characterId].sp) ? window.chars[characterId].sp.slice() : [10,10],
      mp:Array.isArray(window.chars[characterId].mp) ? window.chars[characterId].mp.slice() : [10,10],
      bp:Array.isArray(window.chars[characterId].bp) ? window.chars[characterId].bp.slice() : null,
      xp:Number(window.chars[characterId].xp || 0),
      xpMax:Number(window.chars[characterId].xpMax || 1000),
      conditions:arrayValue(window.chars[characterId].conditions),
      status:'linked',
      linkedAt:new Date().toISOString()
    };
    campaign.playerCharacterLinks = Object.assign({}, campaign.playerCharacterLinks || {}, { [characterId]:accountKey() });
    campaign.activity = arrayValue(campaign.activity).concat(`${window.chars[characterId].name || characterId} linked to campaign.`);
    window.chars[characterId].campaign = campaign.name;
    window.chars[characterId].sharedCampaignId = campaign.id;
    window.chars[characterId].linkedCampaignIds = Array.from(new Set([...(window.chars[characterId].linkedCampaignIds || []), campaign.id]));
    persistWorkspaceChange('workspace-character-linked');
    if (!options.silent) window.toast?.(`${window.chars[characterId].name} linked to ${campaign.name}.`);
    if (!options.skipRender) renderCampaignDetail(campaign);
    return campaign;
  }

  function renderAuthDisplay() {
    const element = shell();
    const grid = element.querySelector('#clean-grid');
    const status = element.querySelector('#clean-status');
    const count = element.querySelector('#clean-count');
    grid.innerHTML = activeWorkspaceTab === authFirstTab() ? '' : `<div class="workspace-tab-context"><b>${escapeHtml(activeWorkspaceTab)}</b><span>${escapeHtml('This tab uses the same workspace display window and swaps the account data shown inside it.')}</span></div>`;
    if (currentDashboardMode === 'dashboard') renderOverviewCards(grid);
    if (currentDashboardMode === 'campaigns') renderCampaignCards(grid);
    if (currentDashboardMode === 'settings') renderSettingsPanel(grid);
    if(currentDashboardMode==='notifications'){
      if(window.AsteriaFeatureFlags?.friendNotificationsEnabled===true &&
         window.AsteriaFirebase?.isReady?.() &&
         window.AsteriaFriendNotificationsUI?.render) {
        window.AsteriaFriendNotificationsUI.render(grid);
      }else{
        const friendMessage=document.createElement('p');
        friendMessage.className='workspace-link-panel workspace-notifications-unavailable';
        friendMessage.setAttribute('role','status');
        friendMessage.textContent=window.AsteriaFeatureFlags?.friendNotificationsEnabled===true?
          'Friend notifications are unavailable. Sign in and retry when the service is ready.':
          'Friend notifications are not active yet. Your existing Friends workspace is unchanged.';
        grid.appendChild(friendMessage);
      }
      if(window.AsteriaFeatureFlags?.campaignNotifications===true &&
         window.AsteriaFirebase?.isReady?.() &&
         window.AsteriaCampaignNotificationsUI?.render) {
        window.AsteriaCampaignNotificationsUI.render(grid);
      }else{
        const message=document.createElement('p');
        message.className='workspace-link-panel workspace-notifications-unavailable';
        message.setAttribute('role','status');
        message.textContent=window.AsteriaFeatureFlags?.campaignNotifications===true?
          'Notifications are unavailable. Sign in and retry when the service is ready.':
          'Campaign notifications are not active yet. Existing campaign invitations remain available in Campaign Forge.';
        grid.appendChild(message);
      }
    }else window.AsteriaCampaignNotificationsUI?.render?.(grid);
    status.textContent = `${authMode().label} / ${activeWorkspaceTab}`;
    count.textContent = currentDashboardMode === 'campaigns'
      ? `${accountCampaigns().length} campaigns`
      : currentDashboardMode === 'characters'
        ? `${ownedCharacters().length} characters`
        : 'Account workspace';
  }

  function openDashboard(mode = 'dashboard') {
    if (!requireAccountWorkspace()) return false;
    if (['characters', 'createCharacter', 'characterForge'].includes(mode)) {
      window.AsteriaGameplay?.openCharacterForgeHub?.();
      return true;
    }
    if (mode === 'createCampaign') mode = 'campaigns';
    hideOldViews();
    currentDashboardMode = authWorkspaceModes.some(item => item.id === mode) ? mode : 'dashboard';
    currentSection = 'Dashboard';
    activeWorkspaceTab = authFirstTab(currentDashboardMode);
    shell();
    renderAuthFilters();
    renderAuthTabs();
    renderAuthNav();
    renderAuthDisplay();
    syncAuthNavState();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function sectionFromHint(hint) {
    const value = lower(hint);
    if (value.includes('race')) return 'Races';
    if (value.includes('class') || value.includes('talent tree') || value.includes('pathway')) return 'Classes';
    if (value.includes('skill')) return 'Skills';
    if (value.startsWith('items') || value.includes('items/') || value.includes('weapon') || value.includes('armour') || value.includes('armor') || value.includes('material') || value.includes('consumable')) return 'Items';
    if (value.includes('theology') || value.includes('deity') || value.includes('god') || value.includes('goddess') || value.includes('pantheon') || value.includes('court')) return 'Theology';
    if (value.includes('spell') || value.includes('magic') || value.includes('enchantment') || value.includes('element') || value.includes('soul stone') || value.includes('rune')) return 'Magic';
    if (value.includes('creature') || value.includes('beast') || value.includes('monster') || value.includes('animal') || value.includes('construct')) return 'Creatures';
    if (value.includes('faction') || value.includes('guild') || value.includes('organisation') || value.includes('organization') || value.includes('npc')) return 'Factions';
    if (value.includes('world') || value.includes('realm') || value.includes('plane') || value.includes('continent') || value.includes('shattered') || value.includes('pantheon') || value.includes('kingdom') || value.includes('timeline')) return 'World, Realms & Planes';
    if (value.includes('handbook') || value.includes('system') || value.includes('talent') || value.includes('profession')) return 'Asteria Handbook';
    return publicSections.includes(hint) ? hint : '';
  }

  function openSection(name, options = {}) {
    return window.AsteriaUniversalCompendium?.openSection(name,options);
  }

  function openPath(path) {
    const section = sectionFromHint(path);
    if (section) openSection(section, { path });
  }

  function routeKey(value) {
    return String(value || '')
      .replace(/^#/, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  function routeFromLocation() {
    const hashRoute = routeKey(window.location?.hash || '');
    if (hashRoute) return hashRoute;
    const pathRoute = routeKey(window.location?.pathname || '');
    return pathRoute === 'index.html' || pathRoute === 'index' ? '' : pathRoute;
  }

  function openRouteFromLocation() {
    const raw=window.location.hash||'';
    if(raw.startsWith('#secure-campaign-invite=')){
      const parsed=window.AsteriaSecureInvitationLinks?.parse(raw)||null;
      // Hash fragments contain bearer secrets; clear immediately before any
      // navigation, user interaction or asynchronous Firebase request.
      window.history.replaceState(window.history.state,'',
        window.location.pathname+window.location.search);
      if(!parsed){
        window.toast?.('The secure invitation link is malformed.');
        return true;
      }
      if(window.AsteriaFeatureFlags?.secureInvitationAcceptance!==true){
        window.toast?.('Secure invitation acceptance is not activated yet.');
        return true;
      }
      secureInvitationPending=parsed;
      if(window.AsteriaFirebase?.isReady?.())openDashboard('campaigns');
      else window.toast?.('Sign in to review this secure invitation.');
      return true;
    }
    if (window.AsteriaUniversalCompendium?.openRoute?.()) return true;
    const route = routeFromLocation();
    if (!route) return false;

    const campaignInvite = route.match(/^campaign-invite=(\d{12})$/) || route.match(/^join\/(?:[^/]+\/)?(\d{12})$/) || route.match(/^join\/[^/]+\/invite\/(\d{12})$/);
    if (campaignInvite) {
      rememberCampaignInviteCode(campaignInvite[1]);
      openDashboard('campaigns');
      byId('workspaceJoinCampaignCode')?.scrollIntoView?.({ block:'center', behavior:'smooth' });
      return true;
    }

    return false;
  }

  function bindPublicButtons(root = document) {
    const controls = root.matches?.('button,a') ? [root] : [];
    if(root === document || root.firstElementChild) controls.push(...qsa('button,a',root));
    controls.forEach(element => {
      if (element.dataset.cleanCompendiumBound) return;

      const workspaceMode = element.dataset.workspaceMode;
      if (workspaceMode) {
        element.dataset.cleanCompendiumBound = '1';
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          openDashboard(workspaceMode);
        }, true);
        return;
      }

      const workspaceAction = element.dataset.workspaceAction;
      if (workspaceAction) {
        element.dataset.cleanCompendiumBound = '1';
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (workspaceAction === 'create-campaign') {
            openDashboard('campaigns');
            openCreateCampaignForm();
          }
          if (workspaceAction === 'create-character') {
            if (window.AsteriaGameplay?.openCharacterForgeHub) window.AsteriaGameplay.openCharacterForgeHub();
            else if (window.AsteriaGameplay?.openCharacterForge) window.AsteriaGameplay.openCharacterForge();
            else openDashboard('dashboard');
          }
          if (workspaceAction === 'settings') openDashboard('settings');
        }, true);
        return;
      }

      const workspaceSection = element.dataset.workspaceSection;
      if (workspaceSection && publicSections.includes(workspaceSection)) {
        element.dataset.cleanCompendiumBound = '1';
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          openSection(workspaceSection);
        }, true);
        return;
      }

      const view = element.dataset.view;
      if (sectionViews[view]) {
        element.dataset.cleanCompendiumBound = '1';
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          openSection(sectionViews[view]);
        }, true);
        return;
      }

      if (view === 'home' || lower(textOf(element)) === 'home') {
        element.dataset.cleanCompendiumBound = '1';
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (window.AsteriaRouter?.home) window.AsteriaRouter.home();
          else if (window.asteriaHomeRoute) window.asteriaHomeRoute();
          else if (window.goHome) window.goHome();
          else showHome();
        }, true);
      }
    });
  }

  function openEntry(entry) { return window.AsteriaUniversalCompendium?.openEntry(entry) || false; }

  function openEntryBySlug(slug) {
    return window.AsteriaUniversalCompendium?.openEntryBySlug(slug) || false;
  }

  function openCategory(category) {
    return openSection(sectionFromHint(category) || 'Asteria Handbook',{path:category});
  }

  function publishApis() {
    legacyOpenRuleCategory = legacyOpenRuleCategory || window.openRuleCategory;
    legacyOpenRulePage = legacyOpenRulePage || window.openRulePage;
    window.openCompendiumSection = openSection;
    window.openCompendiumPath = openPath;
    window.openSection = openSection;
    window.openRuleCategory = function(category) {
      openCategory(category);
    };
    window.openRulePage = function(slug) {
      if (openEntryBySlug(slug)) return;
      legacyOpenRulePage?.(slug);
    };
    window.openWorkspaceEntry = openEntryBySlug;
    window.AsteriaCompendium = {
      ...(window.AsteriaCompendium || {}),
      openSection,
      openDashboard,
      openPath,
      openRoute: openRouteFromLocation,
      openEntry,
      openEntryBySlug,
      entries: () => entries.slice(),
      sectionEntries,
      showHome
    };
    window.AsteriaWorkspace = {
      ...(window.AsteriaWorkspace || {}),
      openSection,
      openDashboard,
      openNotifications:() => openDashboard('notifications'),
      openCampaignHub:() => openDashboard('campaigns'),
      openDashboardMode: openDashboard,
      createCampaign: createWorkspaceCampaign,
      createCharacter: createWorkspaceCharacter,
      createCampaignInvite,
      joinCampaignByUCN,
      lookupCampaignByUCN,
      confirmCampaignJoin,
      linkCharacterToCampaign,
      consumePendingCampaignJoin,
      setPendingCampaignJoin,
      openPath,
      openEntry,
      openEntryBySlug,
      openCategory,
      showHome,
      entries: () => entries.slice()
    };
  }

  function init() {
    load();
    publishApis();
    window.addEventListener('asteria:custom-items-updated', event => {
      mergeCustomItems(event.detail?.items || []);

    });
    bindPublicButtons();
    openRouteFromLocation();
    window.addEventListener('hashchange', openRouteFromLocation);
    window.addEventListener('asteria:firebase-ready',()=>{
      if(secureInvitationPending&&
        window.AsteriaFeatureFlags?.secureInvitationAcceptance===true)
        openDashboard('campaigns');
    });
    window.addEventListener('asteria:firebase-signed-out',()=>{
      secureInvitationPending=null;
    });
    const observer = new MutationObserver(records => {
      const roots = new Set(records.flatMap(record => Array.from(record.addedNodes)).filter(node => node.nodeType === 1 && node.isConnected));
      roots.forEach(node => {
        for(let parent = node.parentElement; parent; parent = parent.parentElement) if(roots.has(parent)) return;
        bindPublicButtons(node);
      });
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
