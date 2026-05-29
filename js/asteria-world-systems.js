/* Asteria Phase 4 Advanced World Systems.
   Living world foundations layered on the universal compendium and gameplay systems. */
(function(){
  'use strict';

  const VERSION = 'asteria-phase-4-advanced-world-systems';
  const STORE_KEY = 'asteria.phase4.world.v1';
  const KNOWLEDGE_LEVELS = ['Unknown','Known','Studied','Mastered','Forbidden','GM Only'];
  const REPUTATION_STATES = [
    { label:'Hated', min:-100 },
    { label:'Hostile', min:-70 },
    { label:'Distrusted', min:-35 },
    { label:'Neutral', min:-10 },
    { label:'Friendly', min:20 },
    { label:'Respected', min:45 },
    { label:'Honoured', min:70 },
    { label:'Legendary', min:95 }
  ];
  const WORLD_SYSTEMS = [
    { id:'worldState', label:'Dynamic World State', tag:'World', tabs:['Overview','Regions','Effects'] },
    { id:'economy', label:'World Economy', tag:'Economy', tabs:['Prices','Scarcity','Trade'] },
    { id:'reputation', label:'Reputation & Factions', tag:'Factions', tabs:['Matrix','Effects','History'] },
    { id:'events', label:'Dynamic Events', tag:'Events', tabs:['Active','Trigger','Effects'] },
    { id:'worldMap', label:'Interactive World Map', tag:'Map', tabs:['Map','Region','Discoveries'] },
    { id:'settlements', label:'Settlement Management', tag:'Settlements', tabs:['Settlements','Control','Threats'] },
    { id:'merchants', label:'Trade & Merchants', tag:'Trade', tabs:['Merchants','Stock','Routes'] },
    { id:'persistence', label:'Campaign Persistence', tag:'Campaign', tabs:['Changes','Consequences','Archive'] },
    { id:'knowledge', label:'Knowledge & Discovery', tag:'Discovery', tabs:['Knowledge','Unlocks','Player View'] },
    { id:'timeline', label:'World Timeline', tag:'Timeline', tabs:['Timeline','Filters','Links'] },
    { id:'npcs', label:'AI NPC Foundations', tag:'NPCs', tabs:['Profiles','Memory Hooks','Schedules'] },
    { id:'advancedGM', label:'Advanced GM Systems', tag:'GM', tabs:['Controls','Overrides','Visibility'] }
  ];

  let state = loadState();
  let activeSystem = 'worldState';
  let activeTab = '';
  let activeRegion = '';
  let originalWorkspaceEntries = null;
  let originalOpenDashboard = null;

  function byId(id){ return document.getElementById(id); }
  function qsa(selector, root=document){ return Array.from(root.querySelectorAll(selector)); }
  function esc(value){ return String(value ?? '').replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char])); }
  function slug(value){ return String(value || '').trim().toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'entry'; }
  function array(value){ return Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []); }
  function titleCase(value){ return String(value || '').replace(/[-_]+/g,' ').replace(/\b\w/g, char => char.toUpperCase()).trim(); }
  function now(){ return new Date().toISOString(); }
  function isGMMode(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    return document.body?.dataset?.role === 'gm' || session.role === 'gm' || byId('gm')?.classList.contains('show');
  }
  function campaignId(){
    const index = Number(window.activeCampaign || 0);
    const campaign = (window.campaigns || [])[index] || (window.campaigns || [])[0] || {};
    return campaign.id || slug(campaign.name || 'local-campaign');
  }
  function campaignName(){
    const index = Number(window.activeCampaign || 0);
    return ((window.campaigns || [])[index] || (window.campaigns || [])[0] || {}).name || 'Local Campaign';
  }

  function databaseEntries(domain){
    const api = window.AsteriaUniversalCompendium;
    const list = typeof api?.entries === 'function' ? api.entries() : array(window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries);
    return list.filter(entry => entry.domain === domain || entry.type === domain).sort((a,b) => String(a.title || a.name).localeCompare(String(b.title || b.name)));
  }

  function defaultConditionRegistry(){
    return ['At War','Peaceful','Starving','Corrupted','Prosperous','Collapsed','Under Siege','Monster Infested','Plagued','Magically Unstable','Declining','Fortified','Occupied','Abandoned'];
  }

  function defaultEventTypes(){
    return ['War','Plague','Monster Invasion','Natural Disaster','Soul Storm','Magical Catastrophe','Political Assassination','Religious Conflict','Trade Collapse','Faction Uprising'];
  }

  function defaultState(){
    return {
      version:VERSION,
      registries:{
        worldConditions:defaultConditionRegistry(),
        eventTypes:defaultEventTypes(),
        merchantTypes:['General Merchant','Blacksmith','Alchemist','Magic Trader','Guild Vendor','Black Market','Travelling Merchant','Faction Vendor'],
        settlementStates:['Prosperous','Declining','Ruined','Fortified','Occupied','Starving','Corrupted','Abandoned']
      },
      campaigns:{}
    };
  }

  function defaultCampaignWorld(){
    return {
      id:campaignId(),
      name:campaignName(),
      world_state:{
        kingdom_status:'Peaceful',
        settlement_status:'Stable',
        economy_status:'Normal',
        faction_status:'Tense',
        creature_activity:'Moderate',
        magical_activity:'Dormant',
        political_tension:20,
        corruption_level:5,
        resource_availability:'Normal'
      },
      regions:{},
      economy:{
        regionalInflation:{},
        priceModifiers:[],
        scarcity:{},
        merchantWealth:{},
        tradeAvailability:{},
        shippingCosts:{},
        blackMarketActivity:{}
      },
      reputation:{},
      events:[],
      map:{ zoom:1, selectedRegion:'', markers:[], routes:[], discoveries:[] },
      settlements:{},
      merchants:[],
      persistence:{
        completedEvents:[],
        destroyedLocations:[],
        factionChanges:[],
        npcDeaths:[],
        worldChanges:[],
        unlockedLore:[],
        regionalConditions:{}
      },
      knowledge:{},
      timeline:[],
      npcs:[],
      gm:{ hiddenLore:[], overrides:[], weather:'Clear', playerSafeMode:true, gmNotes:'' }
    };
  }

  function loadState(){
    try {
      const loaded = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return mergeWorldState(defaultState(), loaded);
    } catch {
      return defaultState();
    }
  }

  function mergeWorldState(base, loaded){
    const result = Object.assign({}, base, loaded || {});
    result.registries = Object.assign({}, base.registries, loaded?.registries || {});
    result.campaigns = Object.assign({}, loaded?.campaigns || {});
    return result;
  }

  function world(){
    const id = campaignId();
    state.campaigns[id] = state.campaigns[id] || defaultCampaignWorld();
    state.campaigns[id].id = id;
    state.campaigns[id].name = campaignName();
    seedWorldFromDatabase(state.campaigns[id]);
    return state.campaigns[id];
  }

  function saveState(reason = 'phase4-save'){
    state.version = VERSION;
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    window.saveAsteriaState?.();
    window.saveAccountState?.();
    window.AsteriaDataSync?.scheduleSave?.(reason);
    return state;
  }

  function seedWorldFromDatabase(record){
    databaseEntries('location').forEach((entry, index) => {
      const key = entry.slug || slug(entry.title);
      record.regions[key] = record.regions[key] || {
        slug:key,
        name:entry.title,
        sourceSlug:entry.slug,
        status:entry.filters?.status || 'Peaceful',
        economy:'Normal',
        creatureActivity:'Moderate',
        magicalActivity:entry.filters?.loreStatus || 'Dormant',
        resources:entry.filters?.biome || entry.filters?.region || 'Unknown',
        travelSafety:'Open',
        x:16 + ((index * 29) % 68),
        y:22 + ((index * 19) % 52)
      };
      if(!activeRegion) activeRegion = key;
      record.settlements[key] = record.settlements[key] || {
        slug:key,
        name:entry.title,
        population:entry.metadata?.population || 'Unknown',
        foodSupply:'Stable',
        economy:'Normal',
        military:'Local Guard',
        crime:'Low',
        factionControl:array(entry.metadata?.faction || entry.filters?.faction)[0] || 'Independent',
        religion:array(entry.metadata?.religion || entry.metadata?.pantheon)[0] || 'Mixed',
        creatureThreats:record.regions[key].creatureActivity,
        corruption:record.regions[key].status === 'Corrupted' ? 55 : 5,
        tradeActivity:'Open',
        state:'Prosperous'
      };
    });
    databaseEntries('faction').forEach(entry => {
      const key = entry.slug || slug(entry.title);
      record.reputation[key] = record.reputation[key] || {
        slug:key,
        name:entry.title,
        score:0,
        status:'Neutral',
        effects:['Standard prices','Standard quest access'],
        history:[]
      };
    });
    databaseEntries('religion').forEach(entry => {
      const key = entry.slug || slug(entry.title);
      record.reputation[key] = record.reputation[key] || {
        slug:key,
        name:entry.title,
        score:0,
        status:'Neutral',
        effects:['Standard temple access'],
        history:[]
      };
    });
    databaseEntries('lore').forEach(entry => {
      const key = entry.slug || slug(entry.title);
      record.knowledge[key] = record.knowledge[key] || {
        slug:key,
        title:entry.title,
        domain:entry.domain,
        level:entry.filters?.loreStatus || 'Unknown',
        visibility:entry.gmOnly ? 'GM Only' : 'Player Safe',
        discoveredBy:[],
        notes:''
      };
    });
    databaseEntries('creature').forEach(entry => {
      const key = entry.slug || slug(entry.title);
      record.knowledge[key] = record.knowledge[key] || {
        slug:key,
        title:entry.title,
        domain:'creature',
        level:'Unknown',
        visibility:'Player Safe',
        discoveredBy:[],
        notes:'Weaknesses and behaviour can be unlocked through encounters.'
      };
    });
    if(!record.merchants.length){
      const firstRegion = Object.keys(record.regions)[0] || 'local';
      record.merchants.push({
        id:'merchant-local',
        name:'Local Merchant',
        type:'General Merchant',
        region:firstRegion,
        wealth:250,
        demand:['Food','Tools'],
        supply:['Common Goods'],
        stock:databaseEntries('item').slice(0, 5).map(entry => entry.slug)
      });
    }
    if(!record.timeline.length){
      record.timeline.push({ id:'timeline-start', era:'Current Era', title:'Campaign Begins', type:'Campaign Event', region:Object.keys(record.regions)[0] || '', linked:['campaign'], visibility:'public', date:now() });
    }
  }

  function systemConfig(id = activeSystem){
    return WORLD_SYSTEMS.find(system => system.id === id) || WORLD_SYSTEMS[0];
  }

  function workspaceView(){
    let view = byId('workspace');
    if(!view){
      view = document.createElement('section');
      view.id = 'workspace';
      view.className = 'view workspace-view';
      (document.querySelector('main.main') || document.querySelector('main') || document.body).appendChild(view);
    }
    qsa('main .view,.view').forEach(item => item.classList.toggle('show', item.id === 'workspace'));
    document.body.classList.add('workspace-active');
    return view;
  }

  function shell(){
    const view = workspaceView();
    let root = byId('phase4WorldShell');
    if(root) return root;
    root = document.createElement('section');
    root.id = 'phase4WorldShell';
    root.className = 'phase4-shell';
    view.replaceChildren(root);
    return root;
  }

  function render(){
    const config = systemConfig();
    if(!activeTab || !config.tabs.includes(activeTab)) activeTab = config.tabs[0];
    const record = world();
    const root = shell();
    root.innerHTML = `
      <header class="phase4-header">
        <div>
          <p class="eyebrow">Phase 4 Advanced World Systems</p>
          <h1>${esc(config.label)}</h1>
          <p>A living fantasy world engine for ${esc(record.name)}.</p>
        </div>
        <div class="phase4-pulse">
          <span>${esc(record.world_state.kingdom_status)}</span>
          <b>${esc(record.world_state.economy_status)}</b>
          <small>${esc(VERSION)}</small>
        </div>
      </header>
      <section class="phase4-layout">
        <aside class="phase4-nav">
          <h3>World Systems</h3>
          ${WORLD_SYSTEMS.map(system => `<button type="button" class="${system.id === activeSystem ? 'active' : ''}" data-phase4-open="${esc(system.id)}"><span>${esc(system.label)}</span><small>${esc(system.tag)}</small></button>`).join('')}
        </aside>
        <main class="phase4-main">
          <nav class="phase4-tabs">${config.tabs.map(tab => `<button type="button" class="${tab === activeTab ? 'active' : ''}" data-phase4-tab="${esc(tab)}">${esc(tab)}</button>`).join('')}</nav>
          <section class="phase4-window">${renderSystem(config.id, record)}</section>
        </main>
      </section>
    `;
    bind();
  }

  function renderSystem(id, record){
    if(id === 'worldState') return renderWorldState(record);
    if(id === 'economy') return renderEconomy(record);
    if(id === 'reputation') return renderReputation(record);
    if(id === 'events') return renderEvents(record);
    if(id === 'worldMap') return renderWorldMap(record);
    if(id === 'settlements') return renderSettlements(record);
    if(id === 'merchants') return renderMerchants(record);
    if(id === 'persistence') return renderPersistence(record);
    if(id === 'knowledge') return renderKnowledge(record);
    if(id === 'timeline') return renderTimeline(record);
    if(id === 'npcs') return renderNpcs(record);
    if(id === 'advancedGM') return renderAdvancedGM(record);
    return '<section class="phase4-card"><h2>World system coming soon</h2></section>';
  }

  function renderWorldState(record){
    const fields = Object.keys(record.world_state);
    const regions = Object.values(record.regions);
    return `
      <section class="phase4-grid">
        <article class="phase4-card span-2">
          <div class="phase4-card-head"><div><p class="eyebrow">Dynamic World State</p><h2>${esc(record.name)}</h2></div><span>${esc(regions.length)} tracked regions</span></div>
          <div class="phase4-state-grid">
            ${fields.map(key => `<label>${esc(titleCase(key))}<input data-phase4-world-state="${esc(key)}" value="${esc(record.world_state[key])}" ${canEditGM() ? '' : 'readonly'}></label>`).join('')}
          </div>
        </article>
        ${regions.map(region => renderRegionCard(region)).join('') || emptyCard('Regions', 'Add location database entries to populate regional world state.')}
        <article class="phase4-card span-2"><h3>System Effects</h3>${renderWorldEffects(record)}</article>
      </section>
    `;
  }

  function renderRegionCard(region){
    return `
      <article class="phase4-card region-card" data-phase4-region="${esc(region.slug)}">
        <span>${esc(region.status)}</span>
        <h3>${esc(region.name)}</h3>
        <p>Economy: ${esc(region.economy)} / Creatures: ${esc(region.creatureActivity)}</p>
        <p>Travel: ${esc(region.travelSafety)} / Resources: ${esc(region.resources)}</p>
      </article>
    `;
  }

  function renderWorldEffects(record){
    const effects = computeWorldEffects(record);
    return `<div class="phase4-effect-grid">${effects.map(effect => `<span>${esc(effect)}</span>`).join('')}</div>`;
  }

  function computeWorldEffects(record){
    const status = JSON.stringify(record.world_state).toLowerCase();
    const effects = [];
    if(status.includes('war') || status.includes('siege')) effects.push('Shipping costs rise', 'Contracts and bounties increase', 'Travel safety drops');
    if(status.includes('starv') || status.includes('scarce')) effects.push('Food prices rise', 'Settlement unrest increases');
    if(status.includes('monster')) effects.push('Creature encounters increase', 'Merchant routes become dangerous');
    if(status.includes('corrupt') || status.includes('magical')) effects.push('Lore locks and magical events become more likely', 'Encounter difficulty can rise');
    if(status.includes('prosper')) effects.push('Merchant wealth improves', 'Guild contracts become safer');
    return effects.length ? effects : ['World state is stable. Standard prices, travel, quests, and creature activity apply.'];
  }

  function renderEconomy(record){
    return `
      <section class="phase4-grid">
        <article class="phase4-card span-2">
          <div class="phase4-card-head"><div><p class="eyebrow">World Economy</p><h2>Price Modifiers</h2></div><button type="button" data-phase4-add-price ${canEditGM() ? '' : 'disabled'}>Add Modifier</button></div>
          <div class="phase4-form-grid">
            <label>Item or Resource<input id="phase4PriceItem" placeholder="Iron Ore"></label>
            <label>Region<input id="phase4PriceRegion" placeholder="Northern Region"></label>
            <label>Modifier %<input id="phase4PriceModifier" type="number" value="10"></label>
            <label>Reason<input id="phase4PriceReason" placeholder="Mine collapse"></label>
          </div>
        </article>
        <article class="phase4-card"><h3>Active Price Modifiers</h3>${record.economy.priceModifiers.map((item, index) => `<div class="phase4-row"><b>${esc(item.item)}</b><span>${esc(item.region)} / ${esc(item.modifier)}%</span><small>${esc(item.reason)}</small><button type="button" data-phase4-remove-price="${index}" ${canEditGM() ? '' : 'disabled'}>Remove</button></div>`).join('') || '<p class="muted smallnote">No economy modifiers yet.</p>'}</article>
        <article class="phase4-card"><h3>Economy Signals</h3>${renderEconomySignals(record)}</article>
        <article class="phase4-card span-2"><h3>Integration</h3><p>Economy effects are available to items, professions, settlements, factions, trade routes, contracts, crafting, and merchants.</p></article>
      </section>
    `;
  }

  function renderEconomySignals(record){
    const modifiers = record.economy.priceModifiers;
    const total = modifiers.reduce((sum, item) => sum + Number(item.modifier || 0), 0);
    return `
      <div class="phase4-effect-grid">
        <span>Regional Inflation: ${esc(total)}%</span>
        <span>Black Market: ${esc(Object.values(record.economy.blackMarketActivity)[0] || 'Low')}</span>
        <span>Trade Routes: ${esc(record.map.routes.length || 'Unmapped')}</span>
        <span>Merchant Wealth: ${esc(record.merchants.reduce((sum, merchant) => sum + Number(merchant.wealth || 0), 0))}</span>
      </div>
    `;
  }

  function renderReputation(record){
    const reps = Object.values(record.reputation);
    return `
      <section class="phase4-grid">
        <article class="phase4-card span-2">
          <div class="phase4-card-head"><div><p class="eyebrow">Reputation Matrix</p><h2>Factions, Guilds, Kingdoms, Religions, Settlements, Races</h2></div><button type="button" data-phase4-recalc-rep>Refresh States</button></div>
          <p>Reputation affects prices, quest access, guild access, housing, travel safety, military rank, contracts, bounties, dialogue, and restricted areas.</p>
        </article>
        ${reps.map(rep => `
          <article class="phase4-card">
            <span>${esc(rep.status)}</span>
            <h3>${esc(rep.name)}</h3>
            <label>Score<input type="number" data-phase4-reputation="${esc(rep.slug)}" value="${Number(rep.score || 0)}" ${canEditGM() ? '' : 'readonly'}></label>
            <p>${esc(reputationEffects(rep).join(', '))}</p>
          </article>
        `).join('') || emptyCard('Reputation', 'Add faction or religion entries to populate reputation targets.')}
      </section>
    `;
  }

  function reputationState(score){
    return REPUTATION_STATES.reduce((current, stateItem) => score >= stateItem.min ? stateItem.label : current, 'Hated');
  }

  function reputationEffects(rep){
    const status = rep.status || reputationState(Number(rep.score || 0));
    if(['Hated','Hostile'].includes(status)) return ['Restricted access','Higher prices','Unsafe travel'];
    if(status === 'Distrusted') return ['Limited quests','Suspicious NPC dialogue'];
    if(status === 'Friendly') return ['Minor discounts','Basic contracts'];
    if(status === 'Respected') return ['Guild access','Better housing and vendors'];
    if(status === 'Honoured') return ['Military rank opportunities','Rare contracts'];
    if(status === 'Legendary') return ['Elite vendors','Restricted areas unlocked','Major faction support'];
    return ['Standard prices','Standard quest access'];
  }

  function renderEvents(record){
    return `
      <section class="phase4-grid">
        <article class="phase4-card span-2">
          <div class="phase4-card-head"><div><p class="eyebrow">Dynamic Events</p><h2>Trigger World Event</h2></div><button type="button" class="primary" data-phase4-trigger-event ${canEditGM() ? '' : 'disabled'}>Trigger Event</button></div>
          <div class="phase4-form-grid">
            <label>Event Type<select id="phase4EventType">${state.registries.eventTypes.map(type => `<option>${esc(type)}</option>`).join('')}</select></label>
            <label>Region<select id="phase4EventRegion">${Object.values(record.regions).map(region => `<option value="${esc(region.slug)}">${esc(region.name)}</option>`).join('')}</select></label>
            <label>Severity<select id="phase4EventSeverity"><option>Low</option><option>Moderate</option><option>High</option><option>Catastrophic</option></select></label>
            <label>Visibility<select id="phase4EventVisibility"><option>public</option><option>hidden</option><option>gm-only</option></select></label>
            <label>Notes<textarea id="phase4EventNotes" placeholder="Event hooks, consequences, or secret causes"></textarea></label>
          </div>
        </article>
        <article class="phase4-card"><h3>Active Events</h3>${record.events.map((event, index) => renderEventRow(event, index)).join('') || '<p class="muted smallnote">No world events active.</p>'}</article>
        <article class="phase4-card"><h3>Event Effects</h3>${renderWorldEffects(record)}</article>
      </section>
    `;
  }

  function renderEventRow(event, index){
    if(event.visibility === 'gm-only' && !isGMMode()) return '';
    return `<div class="phase4-row"><b>${esc(event.type)}</b><span>${esc(event.regionName)} / ${esc(event.severity)}</span><small>${esc(event.notes || 'No notes')}</small><button type="button" data-phase4-resolve-event="${index}" ${canEditGM() ? '' : 'disabled'}>Resolve</button></div>`;
  }

  function renderWorldMap(record){
    const regions = Object.values(record.regions);
    const selected = record.regions[activeRegion] || regions[0];
    if(selected) activeRegion = selected.slug;
    return `
      <section class="phase4-map-layout">
        <article class="phase4-map-card">
          <div class="phase4-map-surface" style="--map-zoom:${Number(record.map.zoom || 1)}">
            ${regions.map(region => `<button type="button" class="phase4-map-node ${region.slug === activeRegion ? 'active' : ''} state-${slug(region.status)}" style="left:${Number(region.x || 40)}%;top:${Number(region.y || 40)}%" data-phase4-map-region="${esc(region.slug)}"><span>${esc(region.name)}</span></button>`).join('')}
            ${record.events.map(event => `<span class="phase4-map-event" style="left:${Number(record.regions[event.region]?.x || 50)}%;top:${Number(record.regions[event.region]?.y || 50)}%">${esc(event.type.charAt(0))}</span>`).join('')}
          </div>
          <div class="phase4-map-controls"><button type="button" data-phase4-map-zoom="-0.1">Zoom Out</button><button type="button" data-phase4-map-zoom="0.1">Zoom In</button><button type="button" data-phase4-add-discovery>Mark Discovery</button></div>
        </article>
        <article class="phase4-card">
          <h2>${esc(selected?.name || 'No Region Selected')}</h2>
          ${selected ? `<dl class="phase4-meta-list"><div><dt>Settlements</dt><dd>${esc(record.settlements[selected.slug]?.name || 'Unknown')}</dd></div><div><dt>Factions</dt><dd>${esc(record.settlements[selected.slug]?.factionControl || 'Independent')}</dd></div><div><dt>Creatures</dt><dd>${esc(selected.creatureActivity)}</dd></div><div><dt>Economy</dt><dd>${esc(selected.economy)}</dd></div><div><dt>Events</dt><dd>${esc(record.events.filter(event => event.region === selected.slug).length)}</dd></div><div><dt>Resources</dt><dd>${esc(selected.resources)}</dd></div><div><dt>Travel</dt><dd>${esc(selected.travelSafety)}</dd></div></dl>` : '<p class="muted smallnote">Add location database entries to create map nodes.</p>'}
        </article>
      </section>
    `;
  }

  function renderSettlements(record){
    const settlements = Object.values(record.settlements);
    return `
      <section class="phase4-grid">
        ${settlements.map(settlement => `
          <article class="phase4-card">
            <span>${esc(settlement.state)}</span>
            <h3>${esc(settlement.name)}</h3>
            <dl class="phase4-meta-list">
              <div><dt>Population</dt><dd>${esc(settlement.population)}</dd></div>
              <div><dt>Food</dt><dd>${esc(settlement.foodSupply)}</dd></div>
              <div><dt>Economy</dt><dd>${esc(settlement.economy)}</dd></div>
              <div><dt>Military</dt><dd>${esc(settlement.military)}</dd></div>
              <div><dt>Crime</dt><dd>${esc(settlement.crime)}</dd></div>
              <div><dt>Faction</dt><dd>${esc(settlement.factionControl)}</dd></div>
              <div><dt>Religion</dt><dd>${esc(settlement.religion)}</dd></div>
              <div><dt>Threats</dt><dd>${esc(settlement.creatureThreats)}</dd></div>
            </dl>
          </article>
        `).join('') || emptyCard('Settlements', 'Add settlement/location entries to the location database.')}
      </section>
    `;
  }

  function renderMerchants(record){
    const items = databaseEntries('item');
    return `
      <section class="phase4-grid">
        <article class="phase4-card span-2">
          <div class="phase4-card-head"><div><p class="eyebrow">Trade & Merchant System</p><h2>Dynamic Merchants</h2></div><button type="button" data-phase4-add-merchant ${canEditGM() ? '' : 'disabled'}>Add Merchant</button></div>
          <p>Merchant stock can respond to region, demand, supply, routes, rare imports, black markets, and faction access.</p>
        </article>
        ${record.merchants.map((merchant, index) => `
          <article class="phase4-card">
            <span>${esc(merchant.type)}</span>
            <h3>${esc(merchant.name)}</h3>
            <p>Region: ${esc(record.regions[merchant.region]?.name || merchant.region)}</p>
            <p>Wealth: ${esc(merchant.wealth)}</p>
            <div class="phase4-chip-list">${array(merchant.stock).map(slugValue => `<button type="button" data-phase4-open-entry="${esc(slugValue)}">${esc(items.find(item => item.slug === slugValue)?.title || titleCase(slugValue))}</button>`).join('')}</div>
            <button type="button" data-phase4-restock-merchant="${index}" ${canEditGM() ? '' : 'disabled'}>Restock</button>
          </article>
        `).join('')}
      </section>
    `;
  }

  function renderPersistence(record){
    const changes = record.persistence.worldChanges;
    return `
      <section class="phase4-grid">
        <article class="phase4-card span-2">
          <div class="phase4-card-head"><div><p class="eyebrow">Campaign Persistence</p><h2>Permanent World Changes</h2></div><button type="button" data-phase4-add-change ${canEditGM() ? '' : 'disabled'}>Add Change</button></div>
          <div class="phase4-form-grid">
            <label>Change<input id="phase4ChangeTitle" placeholder="Bridge destroyed"></label>
            <label>Consequence<input id="phase4ChangeEffect" placeholder="Trade route disrupted; prices rise; bandits increase"></label>
            <label>Linked Region<select id="phase4ChangeRegion">${Object.values(record.regions).map(region => `<option value="${esc(region.slug)}">${esc(region.name)}</option>`).join('')}</select></label>
          </div>
        </article>
        <article class="phase4-card"><h3>Completed Events</h3>${array(record.persistence.completedEvents).map(item => `<p>${esc(item.title || item)}</p>`).join('') || '<p class="muted smallnote">No completed events tracked.</p>'}</article>
        <article class="phase4-card"><h3>World Changes</h3>${changes.map(change => `<div class="phase4-row"><b>${esc(change.title)}</b><span>${esc(change.regionName || '')}</span><small>${esc(change.effect)}</small></div>`).join('') || '<p class="muted smallnote">No permanent changes recorded.</p>'}</article>
      </section>
    `;
  }

  function renderKnowledge(record){
    const entries = Object.values(record.knowledge);
    return `
      <section class="phase4-grid">
        <article class="phase4-card span-2">
          <div class="phase4-card-head"><div><p class="eyebrow">Knowledge & Discovery</p><h2>Lore Unlock Matrix</h2></div><span>${esc(entries.length)} records</span></div>
          <p>Knowledge levels control creature, location, weakness, faction, spell, hidden truth, and lore visibility.</p>
        </article>
        ${entries.map(item => {
          if(item.visibility === 'GM Only' && !isGMMode()) return '';
          return `<article class="phase4-card"><span>${esc(item.level)}</span><h3>${esc(item.title)}</h3><label>Knowledge Level<select data-phase4-knowledge="${esc(item.slug)}" ${canEditGM() ? '' : 'disabled'}>${KNOWLEDGE_LEVELS.map(level => `<option ${item.level === level ? 'selected' : ''}>${esc(level)}</option>`).join('')}</select></label><p>${esc(item.notes || 'Discovery notes pending.')}</p></article>`;
        }).join('') || emptyCard('Knowledge', 'Add lore or creature entries to populate discovery records.')}
      </section>
    `;
  }

  function renderTimeline(record){
    const rows = record.timeline;
    return `
      <section class="phase4-grid">
        <article class="phase4-card span-2">
          <div class="phase4-card-head"><div><p class="eyebrow">World Timeline</p><h2>History + Campaign Timeline</h2></div><button type="button" data-phase4-add-timeline ${canEditGM() ? '' : 'disabled'}>Add Timeline Event</button></div>
          <div class="phase4-form-grid">
            <label>Era<input id="phase4TimelineEra" placeholder="Current Era"></label>
            <label>Title<input id="phase4TimelineTitle" placeholder="Faction uprising begins"></label>
            <label>Type<input id="phase4TimelineType" placeholder="Campaign Event"></label>
            <label>Linked Region<select id="phase4TimelineRegion">${Object.values(record.regions).map(region => `<option value="${esc(region.slug)}">${esc(region.name)}</option>`).join('')}</select></label>
          </div>
        </article>
        <article class="phase4-card span-2 phase4-timeline">
          ${rows.map(row => `<div><span>${esc(row.era)}</span><h3>${esc(row.title)}</h3><p>${esc(row.type)} / ${esc(record.regions[row.region]?.name || row.region || 'World')}</p><small>${esc(row.date || '')}</small></div>`).join('')}
        </article>
      </section>
    `;
  }

  function renderNpcs(record){
    return `
      <section class="phase4-grid">
        <article class="phase4-card span-2">
          <div class="phase4-card-head"><div><p class="eyebrow">AI NPC Foundations</p><h2>NPC Metadata Profiles</h2></div><button type="button" data-phase4-add-npc ${canEditGM() ? '' : 'disabled'}>Add NPC</button></div>
          <div class="phase4-form-grid">
            <label>Name<input id="phase4NpcName" placeholder="NPC name"></label>
            <label>Personality<input id="phase4NpcPersonality" placeholder="Guarded, curious, devout..."></label>
            <label>Goals<input id="phase4NpcGoals" placeholder="Protect the guild"></label>
            <label>Fears<input id="phase4NpcFears" placeholder="Losing status"></label>
            <label>Faction<select id="phase4NpcFaction">${Object.values(record.reputation).map(rep => `<option value="${esc(rep.slug)}">${esc(rep.name)}</option>`).join('')}</select></label>
            <label>Dialogue Style<input id="phase4NpcDialogue" placeholder="Formal, blunt, poetic..."></label>
          </div>
        </article>
        ${record.npcs.map(npc => `<article class="phase4-card"><span>${esc(npc.factionName || 'Independent')}</span><h3>${esc(npc.name)}</h3><p><b>Personality:</b> ${esc(npc.personality)}</p><p><b>Goals:</b> ${esc(npc.goals)}</p><p><b>Fears:</b> ${esc(npc.fears)}</p><p><b>Dialogue:</b> ${esc(npc.dialogue_style)}</p></article>`).join('') || emptyCard('NPCs', 'No NPC metadata profiles yet.')}
      </section>
    `;
  }

  function renderAdvancedGM(record){
    return `
      <section class="phase4-grid">
        <article class="phase4-card span-2">
          <div class="phase4-card-head"><div><p class="eyebrow">Advanced GM Systems</p><h2>World Control Panel</h2></div><span>${esc(isGMMode() ? 'GM mode' : 'Player-safe preview')}</span></div>
          <p>World state editing, faction control, event triggering, economy overrides, settlement editing, NPC management, timeline control, hidden lore, weather, encounter injection, and map editing share one campaign state.</p>
        </article>
        <article class="phase4-card"><h3>Weather Control</h3><label>Weather<input data-phase4-gm="weather" value="${esc(record.gm.weather)}" ${canEditGM() ? '' : 'readonly'}></label></article>
        <article class="phase4-card"><h3>Player-safe Mode</h3><label><input type="checkbox" data-phase4-gm-safe ${record.gm.playerSafeMode ? 'checked' : ''} ${canEditGM() ? '' : 'disabled'}> Hide GM-only content from player view</label></article>
        <article class="phase4-card"><h3>GM Notes</h3><textarea data-phase4-gm="gmNotes" ${canEditGM() ? '' : 'readonly'}>${esc(record.gm.gmNotes)}</textarea></article>
        <article class="phase4-card"><h3>Quick Controls</h3><div class="phase4-chip-list">${['worldState','events','economy','reputation','knowledge','timeline','npcs'].map(id => `<button type="button" data-phase4-open="${esc(id)}">${esc(systemConfig(id).label)}</button>`).join('')}</div></article>
      </section>
    `;
  }

  function emptyCard(title, body){
    return `<article class="phase4-card"><h3>${esc(title)}</h3><p class="muted smallnote">${esc(body)}</p></article>`;
  }

  function canEditGM(){
    return isGMMode() || window.AsteriaAuthBridge?.isLoggedIn?.();
  }

  function bind(){
    const root = byId('phase4WorldShell');
    if(!root) return;
    root.addEventListener('click', handleClick);
    root.addEventListener('input', handleInput);
    root.addEventListener('change', handleInput);
  }

  function handleInput(event){
    const target = event.target;
    const record = world();
    if(target.dataset.phase4WorldState){
      record.world_state[target.dataset.phase4WorldState] = target.value;
      saveState('world-state-updated');
    }
    if(target.dataset.phase4Reputation){
      const rep = record.reputation[target.dataset.phase4Reputation];
      if(rep){
        rep.score = Number(target.value || 0);
        rep.status = reputationState(rep.score);
        rep.effects = reputationEffects(rep);
        rep.history.push({ date:now(), score:rep.score, status:rep.status });
        saveState('reputation-updated');
      }
    }
    if(target.dataset.phase4Knowledge){
      const item = record.knowledge[target.dataset.phase4Knowledge];
      if(item){
        item.level = target.value;
        record.persistence.unlockedLore = Array.from(new Set([...(record.persistence.unlockedLore || []), item.slug]));
        saveState('knowledge-updated');
      }
    }
    if(target.dataset.phase4Gm){
      record.gm[target.dataset.phase4Gm] = target.value;
      saveState('gm-world-updated');
    }
    if(target.dataset.phase4GmSafe !== undefined){
      record.gm.playerSafeMode = Boolean(target.checked);
      saveState('gm-safe-mode');
    }
  }

  function handleClick(event){
    const target = event.target.closest('button,article');
    if(!target) return;
    if(target.dataset.phase4Open){ openSystem(target.dataset.phase4Open); return; }
    if(target.dataset.phase4Tab){ activeTab = target.dataset.phase4Tab; render(); return; }
    if(target.dataset.phase4Region){ activeRegion = target.dataset.phase4Region; activeSystem = 'worldMap'; render(); return; }
    if(target.dataset.phase4MapRegion){ activeRegion = target.dataset.phase4MapRegion; render(); return; }
    if(target.dataset.phase4MapZoom){ adjustMapZoom(Number(target.dataset.phase4MapZoom)); return; }
    if(target.dataset.phase4AddDiscovery !== undefined){ addDiscovery(); return; }
    if(target.dataset.phase4AddPrice !== undefined){ addPriceModifier(); return; }
    if(target.dataset.phase4RemovePrice !== undefined){ removePriceModifier(Number(target.dataset.phase4RemovePrice)); return; }
    if(target.dataset.phase4RecalcRep !== undefined){ recalcReputation(); return; }
    if(target.dataset.phase4TriggerEvent !== undefined){ triggerWorldEvent(); return; }
    if(target.dataset.phase4ResolveEvent !== undefined){ resolveWorldEvent(Number(target.dataset.phase4ResolveEvent)); return; }
    if(target.dataset.phase4AddMerchant !== undefined){ addMerchant(); return; }
    if(target.dataset.phase4RestockMerchant !== undefined){ restockMerchant(Number(target.dataset.phase4RestockMerchant)); return; }
    if(target.dataset.phase4AddChange !== undefined){ addWorldChange(); return; }
    if(target.dataset.phase4AddTimeline !== undefined){ addTimelineEvent(); return; }
    if(target.dataset.phase4AddNpc !== undefined){ addNpc(); return; }
    if(target.dataset.phase4OpenEntry){ window.AsteriaWorkspace?.openEntryBySlug?.(target.dataset.phase4OpenEntry); }
  }

  function adjustMapZoom(delta){
    const record = world();
    record.map.zoom = Math.max(0.7, Math.min(2.2, Number(record.map.zoom || 1) + delta));
    saveState('map-zoom');
    render();
  }

  function addDiscovery(){
    const record = world();
    const region = record.regions[activeRegion] || Object.values(record.regions)[0];
    if(!region) return;
    record.map.discoveries.push({ id:`discovery-${Date.now()}`, region:region.slug, title:`Discovery in ${region.name}`, date:now(), visibility:'public' });
    record.persistence.unlockedLore.push(region.slug);
    saveState('map-discovery');
    render();
  }

  function addPriceModifier(){
    const record = world();
    record.economy.priceModifiers.push({
      item:byId('phase4PriceItem')?.value || 'Unknown Item',
      region:byId('phase4PriceRegion')?.value || 'Global',
      modifier:Number(byId('phase4PriceModifier')?.value || 0),
      reason:byId('phase4PriceReason')?.value || 'GM override',
      createdAt:now()
    });
    saveState('price-modifier-added');
    render();
  }

  function removePriceModifier(index){
    world().economy.priceModifiers.splice(index, 1);
    saveState('price-modifier-removed');
    render();
  }

  function recalcReputation(){
    const record = world();
    Object.values(record.reputation).forEach(rep => {
      rep.status = reputationState(Number(rep.score || 0));
      rep.effects = reputationEffects(rep);
    });
    saveState('reputation-recalculated');
    render();
  }

  function triggerWorldEvent(){
    const record = world();
    const regionSlug = byId('phase4EventRegion')?.value || Object.keys(record.regions)[0] || '';
    const event = {
      id:`event-${Date.now()}`,
      type:byId('phase4EventType')?.value || 'World Event',
      region:regionSlug,
      regionName:record.regions[regionSlug]?.name || regionSlug,
      severity:byId('phase4EventSeverity')?.value || 'Moderate',
      visibility:byId('phase4EventVisibility')?.value || 'public',
      notes:byId('phase4EventNotes')?.value || '',
      createdAt:now(),
      effects:[]
    };
    record.events.push(event);
    applyEventEffects(record, event);
    record.timeline.push({ id:`timeline-${event.id}`, era:'Current Era', title:event.type, type:'World Event', region:regionSlug, linked:[event.id], visibility:event.visibility, date:now() });
    saveState('world-event-triggered');
    render();
  }

  function applyEventEffects(record, event){
    const region = record.regions[event.region];
    if(!region) return;
    const type = event.type.toLowerCase();
    if(type.includes('war') || type.includes('uprising')) region.travelSafety = 'Dangerous';
    if(type.includes('monster')) region.creatureActivity = 'High';
    if(type.includes('plague')) record.settlements[event.region].foodSupply = 'Strained';
    if(type.includes('trade')) region.economy = 'Disrupted';
    if(type.includes('soul') || type.includes('magical')) region.magicalActivity = 'Unstable';
    record.persistence.regionalConditions[event.region] = event.type;
  }

  function resolveWorldEvent(index){
    const record = world();
    const event = record.events.splice(index, 1)[0];
    if(event) record.persistence.completedEvents.push(event);
    saveState('world-event-resolved');
    render();
  }

  function addMerchant(){
    const record = world();
    const region = Object.keys(record.regions)[0] || 'local';
    record.merchants.push({ id:`merchant-${Date.now()}`, name:'New Merchant', type:state.registries.merchantTypes[0], region, wealth:100, demand:[], supply:[], stock:databaseEntries('item').slice(0, 4).map(entry => entry.slug) });
    saveState('merchant-added');
    render();
  }

  function restockMerchant(index){
    const record = world();
    const merchant = record.merchants[index];
    if(!merchant) return;
    merchant.stock = databaseEntries('item').sort(() => Math.random() - 0.5).slice(0, 6).map(entry => entry.slug);
    merchant.lastRestock = now();
    saveState('merchant-restocked');
    render();
  }

  function addWorldChange(){
    const record = world();
    const regionSlug = byId('phase4ChangeRegion')?.value || '';
    record.persistence.worldChanges.push({
      id:`change-${Date.now()}`,
      title:byId('phase4ChangeTitle')?.value || 'World Change',
      effect:byId('phase4ChangeEffect')?.value || 'Consequence pending',
      region:regionSlug,
      regionName:record.regions[regionSlug]?.name || '',
      date:now()
    });
    saveState('world-change-added');
    render();
  }

  function addTimelineEvent(){
    const record = world();
    record.timeline.push({
      id:`timeline-${Date.now()}`,
      era:byId('phase4TimelineEra')?.value || 'Current Era',
      title:byId('phase4TimelineTitle')?.value || 'Timeline Event',
      type:byId('phase4TimelineType')?.value || 'Campaign Event',
      region:byId('phase4TimelineRegion')?.value || '',
      linked:['campaign'],
      visibility:'public',
      date:now()
    });
    saveState('timeline-added');
    render();
  }

  function addNpc(){
    const record = world();
    const factionSlug = byId('phase4NpcFaction')?.value || '';
    record.npcs.push({
      id:`npc-${Date.now()}`,
      name:byId('phase4NpcName')?.value || 'Unnamed NPC',
      personality:byId('phase4NpcPersonality')?.value || '',
      goals:byId('phase4NpcGoals')?.value || '',
      fears:byId('phase4NpcFears')?.value || '',
      faction:factionSlug,
      factionName:record.reputation[factionSlug]?.name || '',
      reputation:0,
      schedule:[],
      relationships:[],
      dialogue_style:byId('phase4NpcDialogue')?.value || '',
      memoryHooks:[]
    });
    saveState('npc-added');
    render();
  }

  function openSystem(id = 'worldState'){
    activeSystem = WORLD_SYSTEMS.some(system => system.id === id) ? id : 'worldState';
    activeTab = systemConfig(activeSystem).tabs[0];
    render();
    window.scrollTo?.({ top:0, left:0, behavior:'auto' });
    return true;
  }

  function worldEntries(){
    return WORLD_SYSTEMS.map(system => ({
      id:`world:${system.id}`,
      title:system.label,
      name:system.label,
      slug:system.id,
      section:'Living World Systems',
      workspaceSection:'Living World Systems',
      type:'World System',
      domain:'world-system',
      categoryPath:[system.tag],
      summary:`Phase 4 ${system.label} foundation.`,
      metadata:{ worldSystem:true, systemId:system.id, version:VERSION },
      searchTerms:[system.label, system.tag, 'phase 4 living world economy faction map settlement timeline npc gm'].join(' ').toLowerCase()
    }));
  }

  function installNav(){
    // Keep living-world systems available through workspace/GM panels without adding a second sidebar menu.
  }

  function installGMPanel(){
    const host = document.querySelector('#gm .gm-main') || document.querySelector('#gm');
    if(!host || byId('phase4GMWorldPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'phase4GMWorldPanel';
    panel.className = 'card phase4-gm-hook-panel';
    panel.innerHTML = `
      <div class="section-head mini"><div><p class="eyebrow">Phase 4</p><h3>Living World Engine</h3></div><span class="pill">Campaign State</span></div>
      <div class="phase4-hook-actions">
        <button type="button" data-phase4-side="worldState">World State</button>
        <button type="button" data-phase4-side="events">Trigger Event</button>
        <button type="button" data-phase4-side="economy">Economy</button>
        <button type="button" data-phase4-side="knowledge">Lore Unlocks</button>
        <button type="button" data-phase4-side="advancedGM">GM World Tools</button>
      </div>
    `;
    host.appendChild(panel);
    qsa('[data-phase4-side]', panel).forEach(button => button.addEventListener('click', () => openSystem(button.dataset.phase4Side)));
  }

  function publish(){
    originalWorkspaceEntries = originalWorkspaceEntries || window.AsteriaWorkspace?.entries;
    originalOpenDashboard = originalOpenDashboard || window.AsteriaWorkspace?.openDashboard;
    const api = {
      version:VERSION,
      systems:() => WORLD_SYSTEMS.map(system => Object.assign({}, system)),
      state:() => JSON.parse(JSON.stringify(state)),
      world:() => JSON.parse(JSON.stringify(world())),
      save:saveState,
      entries:worldEntries,
      openSystem,
      openWorldState:() => openSystem('worldState'),
      openEconomy:() => openSystem('economy'),
      openWorldMap:() => openSystem('worldMap'),
      openAdvancedGM:() => openSystem('advancedGM'),
      triggerWorldEvent,
      recalcReputation,
      databaseEntries,
      computeWorldEffects
    };
    function entriesWithWorld(){
      const base = typeof originalWorkspaceEntries === 'function' ? originalWorkspaceEntries() : [];
      return base.concat(worldEntries());
    }
    function routedDashboard(mode, ...args){
      if(mode === 'worldState') return openSystem('worldState');
      if(mode === 'worldMap') return openSystem('worldMap');
      if(mode === 'advancedGMWorld') return openSystem('advancedGM');
      return originalOpenDashboard?.(mode, ...args);
    }
    window.AsteriaWorld = api;
    window.AsteriaWorkspace = Object.assign({}, window.AsteriaWorkspace || {}, {
      world:api,
      openWorldSystem:openSystem,
      openWorldState:api.openWorldState,
      openWorldMap:api.openWorldMap,
      openAdvancedWorldGM:api.openAdvancedGM,
      openDashboard:routedDashboard,
      entries:entriesWithWorld
    });
  }

  function boot(){
    publish();
    installNav();
    window.AsteriaViewHooks?.afterGMRender?.('phase4-living-world-gm-panel', installGMPanel);
    if(byId('gm')?.classList.contains('show')) installGMPanel();
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
