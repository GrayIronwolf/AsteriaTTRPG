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
    { id:'settings', label:'Settings', title:'Account Settings', intro:'Account state, Firebase sync status, and dashboard preferences.' }
  ];
  const authWorkspaceTabs = {
    dashboard: ['Overview','Campaigns','Characters','Activity'],
    campaigns: ['Campaign Gallery','Invite Links','Linked Characters','Activity'],
    settings: ['Account','Sync','Theme','Activity']
  };

  let entries = [];
  let currentSection = 'Items';

  let activeWorkspaceTab = '';
  let currentDashboardMode = 'dashboard';
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
      settings:'Search settings...'
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
    element.tabIndex = 0;
    element.innerHTML = `
      <span class="clean-tag">${escapeHtml(tag || 'Workspace')}</span>
      <h3>${escapeHtml(title)}</h3>
      ${subtitle ? `<div class="clean-card-subtitle">${escapeHtml(subtitle)}</div>` : ''}
      <p>${escapeHtml(body || '')}</p>
      ${meta ? `<div class="clean-meta">${meta}</div>` : ''}
    `;
    element.onclick = () => {
      if (create) {
        action?.();
        return;
      }
      qsa('.clean-card', element.parentElement).forEach(cardElement => cardElement.classList.remove('selected'));
      element.classList.add('selected');
    };
    element.ondblclick = () => action?.();
    element.onkeydown = event => { if (event.key === 'Enter') action?.(); };
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
    element.ondblclick = () => action?.();
    element.onkeydown = event => { if (event.key === 'Enter') action?.(); };
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
      { tag:'Notifications', title:'Notifications', subtitle:'Placeholder', body:'Campaign invites, GM messages, session alerts, and character approvals will appear here.', action:() => renderPlaceholderPage('Notifications', 'No notifications have been added yet.') },
      { tag:'Party', title:'Active Party', subtitle:`${activePartyCount} linked`, body:'Active party roster, session presence, and party status tools will appear here later.', action:() => renderPlaceholderPage('Active Party', 'Active party tools will connect to campaign sessions later.') }
    ];
    filterCards(cards, card => [card.title, card.subtitle, card.body].join(' ')).forEach(cardData => grid.appendChild(workspaceCard(cardData)));
  }

  function renderCampaignCards(grid) {
    const list = sortCards(filterCards(accountCampaigns(), campaign => [campaign.name, campaignRole(campaign), campaign.description].join(' ')), campaign => campaign.name || campaign.id, campaignRole);
    list.forEach(campaign => {
      ensureCampaignInviteFields(campaign);
      grid.appendChild(galleryCard({
        tag:campaignRole(campaign),
        title:campaign.name || 'Untitled Campaign',
        subtitle:`${arrayValue(campaign.party).length} linked character${arrayValue(campaign.party).length === 1 ? '' : 's'}`,
        body:campaign.description || 'Double-click to open the GM Dashboard for this campaign.',
        image:campaign.image || campaign.art || campaign.banner || '',
        initial:'C',
        action:() => openCampaignGMDashboard(campaign)
      }));
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

  function renderJoinCampaignCard() {
    const element = document.createElement('article');
    element.className = 'clean-card workspace-dashboard-card workspace-gallery-card workspace-campaign-join-card';
    element.innerHTML = `
      <div class="workspace-gallery-art workspace-join-art"><span>#</span></div>
      <div class="workspace-gallery-copy">
        <span class="clean-tag">Join Campaign</span>
        <h3>Join Campaign</h3>
        <p>Enter the 12 digit UCN from your GM invite, then link an existing character or forge a new one.</p>
        <label class="workspace-join-code-label">Unique Campaign Number<input id="workspaceJoinCampaignCode" inputmode="numeric" maxlength="14" placeholder="000000000000"></label>
        <button class="primary" type="button" id="workspaceJoinCampaignBtn">Join Campaign</button>
        <div id="workspaceJoinCampaignResult" class="workspace-join-result" aria-live="polite"></div>
        <div id="workspaceJoinCharacterChooser" class="workspace-join-character-chooser"></div>
      </div>
    `;
    element.addEventListener('click', event => {
      if (event.target.closest('input,button,select')) event.stopPropagation();
    });
    element.querySelector('#workspaceJoinCampaignBtn')?.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await joinCampaignByUCN(element.querySelector('#workspaceJoinCampaignCode')?.value || '');
    });
    const pendingInviteCode = takeCampaignInviteCode();
    if (pendingInviteCode) {
      const input = element.querySelector('#workspaceJoinCampaignCode');
      if (input) input.value = pendingInviteCode;
      const result = element.querySelector('#workspaceJoinCampaignResult');
      if (result) result.innerHTML = '<span class="ok">Invite loaded. Click Join Campaign to accept it.</span>';
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
    grid.innerHTML = `
      <article class="clean-page workspace-viewer" data-viewer="universal-workspace-viewer">
        <button class="clean-back clean-return" type="button" id="workspace-campaign-return">Back to campaigns</button>
        <header class="clean-page-head"><span class="clean-tag">${escapeHtml(role)}</span><div><p class="eyebrow">Campaign Forge</p><h2>${escapeHtml(campaign.name || 'Untitled Campaign')}</h2><p>${escapeHtml(campaign.description || 'Campaign workspace.')}</p></div></header>
        <dl class="clean-page-meta">
          <div><dt>Campaign ID</dt><dd>${escapeHtml(campaign.id)}</dd></div>
          <div><dt>UCN</dt><dd>${escapeHtml(campaign.ucn || 'Not generated')}</dd></div>
          <div><dt>Invite Link</dt><dd>${escapeHtml(inviteLink(campaign))}</dd></div>
          <div><dt>GM ID</dt><dd>${escapeHtml(campaign.gmId || campaign.ownerUid || 'Not set')}</dd></div>
          <div><dt>Party Characters</dt><dd>${arrayValue(campaign.party).length}</dd></div>
        </dl>
        ${role === 'GM' ? `
          <section class="workspace-link-panel campaign-invite-tools">
            <h3>Campaign Invites</h3>
            <p class="muted">Static build note: this creates an email-ready invite record and link. Actual email sending will connect through Firebase later.</p>
            <label>Player Email<input id="workspaceInviteEmail" type="email" placeholder="player@example.com"></label>
            <button class="primary" type="button" id="workspaceCreateInviteBtn">Create Invite</button>
            <div class="campaign-code-pill"><b>UCN</b><span>${escapeHtml(campaign.ucn)}</span></div>
            <div class="workspace-invite-list">
              ${invites.length ? invites.map(invite => `<div><b>${escapeHtml(invite.email || 'Invite')}</b><span>${escapeHtml(invite.status || 'created')}</span><small>${escapeHtml(invite.link || inviteLink(campaign))}</small></div>`).join('') : '<p class="muted">No invite records yet.</p>'}
            </div>
          </section>
        ` : ''}
        <section class="workspace-link-panel">
          <h3>Link Existing Character</h3>
          <p class="muted">Players can link a character they own to this campaign. A full approval flow can be added later.</p>
          <label>Character<select id="workspaceLinkCharacter">${characters.map(character => `<option value="${escapeHtml(character.id)}">${escapeHtml(character.name || character.id)}</option>`).join('')}</select></label>
          <button class="primary" type="button" id="workspaceLinkCharacterBtn" ${characters.length ? '' : 'disabled'}>Link Character</button>
        </section>
      </article>
    `;
    byId('workspace-campaign-return').onclick = () => openDashboard('campaigns');
    byId('workspaceCreateInviteBtn')?.addEventListener('click', () => createCampaignInvite(campaign.id));
    byId('workspaceLinkCharacterBtn')?.addEventListener('click', () => linkCharacterToCampaign(campaign.id));
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
      setPendingCampaignJoin(campaign);
      if (window.AsteriaGameplay?.startNewCharacterForge) window.AsteriaGameplay.startNewCharacterForge();
      else if (window.AsteriaGameplay?.openCharacterCreator) window.AsteriaGameplay.openCharacterCreator();
      else window.AsteriaGameplay?.openCharacterForge?.();
    });
  }

  async function joinCampaignByUCN(codeValue) {
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

  function consumePendingCampaignJoin(characterId) {
    const pending = readPendingCampaignJoin();
    if (!pending?.campaignId || !characterId) return null;
    const campaign = findCampaign(pending.campaignId);
    if (!campaign) {
      clearPendingCampaignJoin();
      return null;
    }
    addCampaignPlayer(campaign);
    const linkedCampaign = linkCharacterToCampaign(pending.campaignId, characterId, { silent:true, skipRender:true });
    clearPendingCampaignJoin();
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

  function createWorkspaceCampaign() {
    if (!requireAccountWorkspace()) return;
    const name = String(byId('workspaceCampaignName')?.value || '').trim() || 'New Campaign';
    const description = String(byId('workspaceCampaignDescription')?.value || '').trim();
    const partySize = Math.max(1, Math.min(12, Number(byId('workspaceCampaignPartySize')?.value || 4)));
    const uid = accountKey();
    const id = randomToken('camp-');
    const inviteCode = uniqueCampaignCode();
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
    window.AsteriaFirebase?.saveCampaign?.(id, campaign);
    window.toast?.(`Campaign created: ${name}`);
    openDashboard('campaigns');
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

  async function linkCharacterToCampaign(campaignIdValue, characterIdValue = '', options = {}) {
    const campaign = findCampaign(campaignIdValue);
    const characterId = characterIdValue || byId('workspaceLinkCharacter')?.value;
    if (!campaign || !characterId || !window.chars?.[characterId]) return;
    ensureCampaignInviteFields(campaign);
    const uid = accountKey();
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
    if (window.AsteriaFirebase?.isReady?.() && window.AsteriaFirebase?.linkCharacterToCampaign) {
      try {
        const sharedCampaign = await window.AsteriaFirebase.linkCharacterToCampaign(campaign.id, Object.assign({ id:characterId }, window.chars[characterId]));
        if (!sharedCampaign) throw new Error('shared-campaign-link-failed');
        storeAccountCampaign(sharedCampaign);
      } catch (error) {
        console.warn('Could not link character to the shared campaign.', error);
        campaign.party = arrayValue(campaign.party).filter(id => id !== characterId);
        if (campaign.players?.[uid]) campaign.players[uid].characterIds = arrayValue(campaign.players[uid].characterIds).filter(id => id !== characterId);
        if (campaign.characters) delete campaign.characters[characterId];
        if (campaign.playerCharacterLinks) delete campaign.playerCharacterLinks[characterId];
        window.chars[characterId].linkedCampaignIds = arrayValue(window.chars[characterId].linkedCampaignIds).filter(id => id !== campaign.id);
        if (window.chars[characterId].sharedCampaignId === campaign.id) delete window.chars[characterId].sharedCampaignId;
        window.chars[characterId].campaign = 'Unassigned';
        persistWorkspaceChange('workspace-character-link-rollback');
        window.toast?.('Firebase could not link this character. It has not been added to the campaign party.');
        if (!options.skipRender) renderCampaignDetail(campaign);
        return null;
      }
    } else {
      window.AsteriaFirebase?.saveCampaign?.(campaign.id, campaign);
    }
    window.AsteriaFirebase?.saveCharacter?.(characterId, window.chars[characterId]);
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

  function bindPublicButtons() {
    qsa('button,a').forEach(element => {
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
      openCampaignHub:() => openDashboard('campaigns'),
      openDashboardMode: openDashboard,
      createCampaign: createWorkspaceCampaign,
      createCharacter: createWorkspaceCharacter,
      createCampaignInvite,
      joinCampaignByUCN,
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
    if (window.__asteriaOpenDashboardOnReady || (accountSignedIn() && byId('home')?.classList.contains('show'))) {
      window.__asteriaOpenDashboardOnReady = false;
      openDashboard('dashboard');
    }
    window.addEventListener('hashchange', openRouteFromLocation);
    const observer = new MutationObserver(bindPublicButtons);
    observer.observe(document.body, { childList:true, subtree:true });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
