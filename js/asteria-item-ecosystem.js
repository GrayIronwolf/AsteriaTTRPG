/* Asteria Item Ecosystem v1.
   Player and GM workspaces over the shared AsteriaInventory data model. */
(function(){
  'use strict';

  const api = window.AsteriaInventory;
  if(!api) return;

  const VERSION = 'ASTERIA ITEM ECOSYSTEM v1';
  const PLAYER_TABS = [
    ['inventory','Inventory'],
    ['equipment','Equipment'],
    ['bags','Bags'],
    ['storage','Storage'],
    ['party-loot','Party Loot'],
    ['shops','Shops'],
    ['trade','Player Trade'],
    ['marketplace','Trade Listings'],
    ['wishlist','Wishlist'],
    ['history','Transaction History']
  ];
  const GM_TABS = [
    ['rewards','Reward Loot'],
    ['party-loot','Party Loot Manager'],
    ['loot-tables','Loot Tables'],
    ['loot-drop','Loot Drop Generator'],
    ['shops','Shop Manager'],
    ['inventories','Player Inventories'],
    ['trades','Trade History'],
    ['audit','Inventory Activity Logs']
  ];
  const SHOP_TYPES = [
    'Blacksmith','Armourer','General Goods','Alchemist','Herbalist','Enchanter',
    'Jeweller','Tailor','Carpenter','Fletcher','Stable','Magical Goods',
    'Temple Services','Guild Store','Monster-Parts Merchant','Travelling Merchant'
  ];
  const ui = {
    playerTab:'inventory',
    gmTab:'rewards',
    query:'',
    type:'all',
    rarity:'all',
    location:'all',
    sort:'newest',
    view:'grid',
    selectedItemId:'',
    selectedStorageId:'',
    selectedLootId:'',
    selectedShopId:'',
    selectedTradeId:'',
    gmCatalogQuery:'',
    gmSelectedCatalogId:'',
    gmSelectedCharacterId:'',
    gmSelectedLootTableId:''
  };

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[character]);
  }
  function array(value){ return api.array(value); }
  function clone(value){ return api.clone(value); }
  function slug(value){ return api.slug(value); }
  function now(){ return new Date().toISOString(); }
  function activeId(){ return api.currentId(); }
  function activeCharacter(){ return api.ensure(activeId()); }
  function activeCampaign(){ return api.activeCampaign(); }
  function ecosystem(){ return api.ensureCampaign(activeCampaign()); }
  function campaignCharacter(id){
    const campaign = activeCampaign();
    return window.chars?.[id] || campaign?.characters?.[id] || null;
  }
  function saveCampaign(reason){
    api.persistCampaign(activeCampaign(), reason);
    renderPlayer();
    renderGM();
  }
  function notify(title, message, options){ api.notify(title, message, options); }
  function unique(values){ return Array.from(new Set(values.filter(Boolean))); }
  function number(value, fallback = 0){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function dateLabel(value){
    if(!value) return 'Unknown';
    try{return new Date(value).toLocaleString();}catch(error){return String(value);}
  }
  function catalogEntries(){
    return typeof api.catalogEntries === 'function' ? api.catalogEntries() : [];
  }
  function catalogEntry(id){
    const key = slug(id);
    return catalogEntries().find(entry => slug(entry.slug || entry.title) === key) || null;
  }
  function catalogSnapshot(id, quantity = 1){
    const entry = catalogEntry(id);
    if(!entry) return null;
    if(typeof api.itemSnapshot === 'function') return api.normalizeItem(api.itemSnapshot(entry, quantity), { newInstance:true });
    const meta = entry.metadata || {};
    return api.normalizeItem({
      id:api.uid(slug(entry.slug || entry.title)),
      catalogId:slug(entry.slug || entry.title),
      name:entry.title,
      type:meta.itemType || entry.category || 'Item',
      category:entry.category || '',
      itemClass:meta.itemClass || meta.item_class || 'Common',
      qty:quantity,
      image:entry.imagePath || meta.image || '',
      desc:entry.summary || meta.description || '',
      weight:meta.weight || 0,
      value:meta.value || meta.marketValue || 0,
      tags:entry.tags || meta.tags || [],
      compendiumPath:entry.route || entry.sourcePath || ''
    }, { newInstance:true });
  }
  function campaignCharacters(){
    return api.campaignCharacterIds(activeCampaign()).map(id => ({ id, record:campaignCharacter(id) })).filter(entry => entry.record);
  }
  function migrateSharedState(){
    const campaign = activeCampaign();
    const shared = ecosystem();
    if(!campaign || !shared || shared.migratedLegacy) return;
    if(campaign.activeShop && !shared.shops.some(shop => shop.id === campaign.activeShop.id)){
      shared.shops.push(Object.assign({
        description:'',
        type:'General Goods',
        owner:'',
        location:'',
        region:'',
        openingHours:'GM controlled',
        acceptedCurrencies:api.CURRENCY.map(currency => currency.key),
        buyModifier:1,
        sellModifier:.5,
        services:[],
        restock:{ mode:'Manual', days:0 },
        visibility:'discovered'
      }, clone(campaign.activeShop)));
    }
    try{
      const old = window.asteriaTransaction?.read?.();
      array(old?.partyLoot).forEach(record => {
        const item = api.normalizeItem(record.item || {}, { newInstance:true });
        if(!shared.partyLoot.some(loot => loot.legacyId === record.lootId)){
          shared.partyLoot.push({
            id:api.uid('loot'),
            legacyId:record.lootId,
            item,
            quantity:item.qty,
            source:record.source || 'Legacy Party Loot',
            discoveredBy:'',
            status:record.status || 'available',
            responses:{},
            createdAt:record.dateGained || now(),
            distribution:null
          });
        }
      });
    }catch(error){}
    shared.migratedLegacy = true;
    api.persistCampaign(campaign, 'item-ecosystem-migration');
  }

  function itemImage(item){
    return item?.image
      ? `<img src="${esc(item.image)}" alt="" loading="lazy">`
      : `<span>${esc(String(item?.name || '?').charAt(0))}</span>`;
  }
  function rarityClass(item){ return `rarity-${slug(item?.rarity || item?.itemClass || 'common')}`; }
  function itemCard(item, options = {}){
    const selected = ui.selectedItemId === item.id;
    return `
      <article class="ecosystem-item-card ${rarityClass(item)} ${selected ? 'selected' : ''} ${item.locked ? 'locked' : ''}" data-item-card="${esc(item.id)}" draggable="true">
        <button type="button" class="ecosystem-item-select" data-item-open="${esc(item.id)}" aria-label="Inspect ${esc(item.name)}">
          <span class="ecosystem-rarity">${esc(item.rarity)}</span>
          ${item.favourite ? '<span class="ecosystem-favourite" title="Favourite">★</span>' : ''}
          ${item.locked ? '<span class="ecosystem-lock" title="Locked">◆</span>' : ''}
          <span class="ecosystem-item-art">${itemImage(item)}</span>
          <b>${esc(item.name)}</b>
          <small>${esc(item.type)}${item.qty > 1 ? ` · ×${item.qty}` : ''}</small>
          <span class="ecosystem-card-meta"><em>${number(item.weight * item.qty).toFixed(1)} wt</em><em>${number(item.value * item.qty).toLocaleString()} cp</em></span>
        </button>
        ${options.actions || ''}
      </article>`;
  }
  function emptyState(title, text){
    return `<div class="ecosystem-empty"><b>${esc(title)}</b><p>${esc(text)}</p></div>`;
  }
  function meter(value, max, label){
    const percent = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
    return `<div class="ecosystem-meter"><span><b>${esc(label)}</b><em>${number(value).toFixed(1)} / ${number(max).toFixed(1)}</em></span><i><u style="width:${percent}%"></u></i></div>`;
  }
  function playerSummary(){
    const record = activeCharacter();
    const encumbrance = api.encumbrance(activeId());
    return `
      <section class="ecosystem-summary">
        <div class="ecosystem-character-identity">
          <span class="ecosystem-portrait">${record?.image || record?.portrait ? `<img src="${esc(record.image || record.portrait)}" alt="">` : esc(String(record?.name || '?').charAt(0))}</span>
          <div><small>${esc(record?.race || 'Race pending')} · ${esc(record?.klass || record?.class || 'Class pending')}</small><h3>${esc(record?.name || 'Character')}</h3><p>Level ${number(record?.level, 1)}</p></div>
        </div>
        ${meter(encumbrance.weight, encumbrance.capacity, encumbrance.state)}
        <div class="ecosystem-summary-stat"><small>Currency</small><b>${api.currencyTotal(record).toLocaleString()} cp</b></div>
        <div class="ecosystem-summary-stat"><small>Items</small><b>${api.items(activeId()).length}</b></div>
      </section>`;
  }
  function inventoryToolbar(){
    const items = api.items(activeId());
    const types = unique(items.map(item => item.type)).sort();
    const rarities = unique(items.map(item => item.rarity)).sort();
    return `
      <div class="ecosystem-toolbar">
        <label class="wide"><span>Search inventory</span><input type="search" data-eco-filter="query" value="${esc(ui.query)}" placeholder="Name, type, material, enchantment, profession..."></label>
        <label><span>Type</span><select data-eco-filter="type"><option value="all">All Types</option>${types.map(value => `<option ${ui.type === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>
        <label><span>Rarity</span><select data-eco-filter="rarity"><option value="all">All Rarities</option>${rarities.map(value => `<option ${ui.rarity === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>
        <label><span>Location</span><select data-eco-filter="location">${['all','inventory','bag','equipment','storage'].map(value => `<option value="${value}" ${ui.location === value ? 'selected' : ''}>${value === 'all' ? 'All Locations' : esc(value)}</option>`).join('')}</select></label>
        <label><span>Sort</span><select data-eco-filter="sort">
          ${[
            ['newest','Newest acquired'],['oldest','Oldest acquired'],['alphabetical','Alphabetical'],
            ['value-high','Highest value'],['value-low','Lowest value'],['weight-high','Highest weight'],
            ['weight-low','Lowest weight'],['rarity','Rarity'],['quantity','Quantity'],
            ['condition','Condition'],['recent','Recently used']
          ].map(([value,label]) => `<option value="${value}" ${ui.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select></label>
        <div class="ecosystem-view-toggle" role="group"><button type="button" data-eco-view="grid" class="${ui.view === 'grid' ? 'active' : ''}" title="Grid view">▦</button><button type="button" data-eco-view="list" class="${ui.view === 'list' ? 'active' : ''}" title="List view">☷</button></div>
      </div>`;
  }
  function renderInventoryView(){
    const record = activeCharacter();
    if(!record) return emptyState('No character selected', 'Open one of your characters to manage its inventory.');
    const items = api.filterItems(record.inventory, {
      query:ui.query,
      type:ui.type,
      rarity:ui.rarity,
      location:ui.location
    }, ui.sort);
    return `
      ${inventoryToolbar()}
      <div class="ecosystem-section-head"><div><h3>Central Inventory</h3><p>${items.length} matching stack${items.length === 1 ? '' : 's'}</p></div><div><button type="button" data-eco-add-item>Add Item</button><button type="button" data-eco-filter-favourites>Favourites</button></div></div>
      <div class="ecosystem-item-gallery ${ui.view === 'list' ? 'list' : ''}">
        ${items.map(item => itemCard(item)).join('') || emptyState('No matching items', 'Change the filters or add an item from the Asteria Item Compendium.')}
      </div>`;
  }
  function equipmentSlot(slot){
    const item = api.items(activeId()).find(candidate => candidate.equipped && (candidate.equippedSlot === slot || api.SLOT_ALIASES[candidate.equippedSlot] === slot));
    return `
      <button type="button" class="ecosystem-equipment-slot ${item ? 'filled' : ''}" data-equipment-slot="${esc(slot)}" ${item ? `data-item-open="${esc(item.id)}"` : 'data-eco-add-item'}>
        <small>${esc(slot)}</small>
        <span>${item ? itemImage(item) : '+'}</span>
        <b>${esc(item?.name || 'Empty')}</b>
      </button>`;
  }
  function renderEquipmentView(){
    const stats = api.equipmentStats(activeId());
    const statRows = Object.entries(stats);
    return `
      <div class="ecosystem-two-column equipment-layout">
        <section><div class="ecosystem-section-head"><div><h3>Character Equipment</h3><p>Compatible items can be dragged or equipped from item details.</p></div></div><div class="ecosystem-equipment-grid">${api.EQUIPMENT_SLOTS.map(equipmentSlot).join('')}</div></section>
        <aside class="ecosystem-inspector">
          <h3>Equipment Effects</h3>
          ${statRows.length ? `<dl>${statRows.map(([key,value]) => `<div><dt>${esc(key)}</dt><dd>${value >= 0 ? '+' : ''}${esc(value)}</dd></div>`).join('')}</dl>` : '<p>No numeric equipment modifiers are active.</p>'}
          <h4>Requirements</h4>
          <p>Select an item to compare its requirements and effects with the currently equipped item.</p>
        </aside>
      </div>`;
  }
  function bagItems(bag){
    const ids = array(bag.slots).flatMap(slot => array(slot.items).map(reference => reference.id));
    return api.items(activeId()).filter(item => ids.includes(item.id));
  }
  function bagWeight(bag){
    return bagItems(bag).reduce((total, item) => total + item.weight * item.qty, 0);
  }
  function renderBagsView(){
    const record = activeCharacter();
    return `
      <div class="ecosystem-section-head"><div><h3>Item Bags</h3><p>Existing Asteria bags now act as searchable, weighted containers.</p></div><button type="button" data-eco-create-bag>Create Bag</button></div>
      <div class="ecosystem-bag-list">
        ${array(record?.bags).sort((a,b) => a.order - b.order).map(bag => {
          const items = bagItems(bag);
          const used = array(bag.slots).filter(slot => array(slot.items).length).length;
          const weight = bagWeight(bag);
          return `<section class="ecosystem-bag ${bag.locked ? 'locked' : ''}" data-bag-drop="${esc(bag.id)}">
            <header><div><small>${esc(bag.type)}</small><h3>${esc(bag.name)}</h3></div><div><button type="button" data-bag-rename="${esc(bag.id)}">Rename</button><button type="button" data-bag-toggle="${esc(bag.id)}">${bag.collapsed ? 'Expand' : 'Collapse'}</button></div></header>
            <div class="ecosystem-bag-status"><span>${used} / ${bag.maxSlots} slots</span><span>${weight.toFixed(1)}${bag.maxWeight ? ` / ${bag.maxWeight}` : ''} wt</span><span>${bag.allowedCategories.length ? esc(bag.allowedCategories.join(', ')) : 'All categories'}</span></div>
            ${bag.collapsed ? '' : `<div class="ecosystem-item-gallery compact">${items.map(item => itemCard(item)).join('') || emptyState('Bag is empty', 'Move inventory items here using item actions or drag-and-drop.')}</div>`}
          </section>`;
        }).join('') || emptyState('No bags', 'Create a bag to organise carried items.')}
      </div>`;
  }
  function renderStorageView(){
    const record = activeCharacter();
    return `
      <div class="ecosystem-section-head"><div><h3>Storage</h3><p>Stored items are separate from carried weight and equipment.</p></div><button type="button" data-eco-create-storage>New Storage Tab</button></div>
      <div class="ecosystem-storage-tabs">${array(record?.storages).map(storage => `<button type="button" class="${ui.selectedStorageId === storage.id || !ui.selectedStorageId && storage === record.storages[0] ? 'active' : ''}" data-storage-select="${esc(storage.id)}">${esc(storage.name)}</button>`).join('')}</div>
      ${(() => {
        const storage = record?.storages?.find(candidate => candidate.id === ui.selectedStorageId) || record?.storages?.[0];
        if(!storage) return emptyState('No storage', 'Create a storage tab.');
        const stored = api.items(activeId()).filter(item => array(storage.itemIds).includes(item.id));
        ui.selectedStorageId = storage.id;
        return `<section class="ecosystem-storage" data-storage-drop="${esc(storage.id)}"><header><div><small>${esc(storage.type)}</small><h3>${esc(storage.name)}</h3></div><span>${stored.length} / ${storage.maxSlots || '∞'} slots</span></header><div class="ecosystem-item-gallery">${stored.map(item => itemCard(item, { actions:`<button type="button" data-storage-retrieve="${esc(item.id)}">Retrieve</button>` })).join('') || emptyState('Storage is empty', 'Use Store from an item detail panel or drag it here.')}</div></section>`;
      })()}`;
  }
  function lootResponseSummary(loot){
    const responses = Object.entries(loot.responses || {});
    return ['need','greed','pass'].map(choice => {
      const names = responses.filter(([,value]) => value === choice).map(([id]) => campaignCharacter(id)?.name || id);
      return `<span class="${choice}"><b>${choice}</b> ${names.length ? esc(names.join(', ')) : '—'}</span>`;
    }).join('');
  }
  function partyLootCard(loot, gm = false){
    const id = activeId();
    const choice = loot.responses?.[id] || '';
    return `<article class="ecosystem-loot-card ${rarityClass(loot.item)}">
      <span class="ecosystem-item-art">${itemImage(loot.item)}</span>
      <div><span class="ecosystem-rarity">${esc(loot.item.rarity)}</span><h3>${esc(loot.item.name)}</h3><p>${esc(loot.source || 'Unknown source')}</p><small>×${number(loot.quantity || loot.item.qty, 1)} · ${number(loot.item.value).toLocaleString()} cp · ${number(loot.item.weight).toFixed(1)} wt</small></div>
      <div class="ecosystem-loot-responses">${lootResponseSummary(loot)}</div>
      ${gm ? `<div class="ecosystem-card-actions"><select data-loot-recipient="${esc(loot.id)}"><option value="">Choose recipient</option>${campaignCharacters().map(entry => `<option value="${esc(entry.id)}">${esc(entry.record.name)}</option>`).join('')}</select><button type="button" data-loot-distribute="${esc(loot.id)}">Distribute</button><button type="button" data-loot-random="${esc(loot.id)}">Need / Greed Roll</button></div>` : `<div class="ecosystem-card-actions choice"><button type="button" class="${choice === 'need' ? 'active' : ''}" data-loot-choice="${esc(loot.id)}:need">Need</button><button type="button" class="${choice === 'greed' ? 'active' : ''}" data-loot-choice="${esc(loot.id)}:greed">Greed</button><button type="button" class="${choice === 'pass' ? 'active' : ''}" data-loot-choice="${esc(loot.id)}:pass">Pass</button><button type="button" data-loot-inspect="${esc(loot.id)}">Inspect</button></div>`}
    </article>`;
  }
  function renderPartyLootView(gm = false){
    const shared = ecosystem();
    const available = array(shared?.partyLoot).filter(loot => loot.status !== 'distributed');
    return `
      <div class="ecosystem-section-head"><div><h3>${gm ? 'Party Loot Manager' : 'Shared Party Loot'}</h3><p>Need, Greed, Pass, claim status, sources, and distribution remain campaign-synchronised.</p></div>${gm ? '<button type="button" data-loot-sell-all>Sell All & Split Currency</button>' : ''}</div>
      <div class="ecosystem-loot-list">${available.map(loot => partyLootCard(loot, gm)).join('') || emptyState('No party loot', 'Encounter and quest rewards sent to the party will appear here.')}</div>`;
  }
  function shopAccessible(shop){
    return shop.status === 'open' && (!array(shop.visitorCharacterIds).length || array(shop.visitorCharacterIds).includes(activeId()));
  }
  function shopStockCard(shop, stock, index){
    const item = api.normalizeItem(stock.item || {});
    const available = Math.max(0, number(stock.qty, 0));
    return `<article class="ecosystem-shop-stock ${rarityClass(item)}"><span class="ecosystem-item-art">${itemImage(item)}</span><b>${esc(item.name)}</b><small>${available} in stock</small><strong>${number(stock.priceCopper || item.value).toLocaleString()} cp</strong><div><input type="number" min="1" max="${available}" value="1" data-shop-qty="${esc(shop.id)}:${index}"><button type="button" data-shop-buy="${esc(shop.id)}:${index}" ${available ? '' : 'disabled'}>Buy</button></div></article>`;
  }
  function renderShopsView(){
    const shops = array(ecosystem()?.shops).filter(shop => shop.visibility !== 'hidden' && shopAccessible(shop));
    return `
      <div class="ecosystem-section-head"><div><h3>Accessible Shops</h3><p>Campaign merchants, map locations, prices, stock, and transactions share one record.</p></div></div>
      <div class="ecosystem-shop-list">${shops.map(shop => `<section class="ecosystem-shop">
        <header><div><small>${esc(shop.type)} · ${esc(shop.region || 'Unknown region')}</small><h3>${esc(shop.name)}</h3><p>${esc(shop.description || '')}</p></div><div><span>${esc(shop.status)}</span><small>${esc(shop.owner || 'Independent merchant')}</small></div></header>
        <div class="ecosystem-shop-stock-grid">${array(shop.stock).map((stock,index) => shopStockCard(shop, stock, index)).join('') || emptyState('No stock', 'This merchant has no available stock.')}</div>
        <details><summary>Sell items to ${esc(shop.name)}</summary><div class="ecosystem-sell-list">${api.items(activeId()).filter(item => !item.equipped && !item.locked && !item.bound && !item.questItem).map(item => `<div><span>${esc(item.name)} ×${item.qty}</span><b>${saleValue(item, shop).toLocaleString()} cp</b><button type="button" data-shop-sell="${esc(shop.id)}:${esc(item.id)}">Sell One</button></div>`).join('') || '<p>No sellable items.</p>'}</div></details>
      </section>`).join('') || emptyState('No accessible shops', 'A GM can open a shop for this character or connect one to a discovered map location.')}</div>`;
  }
  function renderTradeView(){
    const shared = ecosystem();
    const id = activeId();
    const peers = campaignCharacters().filter(entry => entry.id !== id);
    const trades = array(shared?.directTrades).filter(trade => [trade.fromCharacterId,trade.toCharacterId].includes(id) && !['completed','cancelled'].includes(trade.status));
    const tradeable = api.items(id).filter(item => !item.equipped && !item.locked && !item.bound && !item.questItem && item.tradeAvailable);
    return `
      <div class="ecosystem-two-column">
        <section class="ecosystem-form-card"><h3>Secure Trade Request</h3><label>Trade with<select id="ecoTradeRecipient"><option value="">Choose character</option>${peers.map(entry => `<option value="${esc(entry.id)}">${esc(entry.record.name)}</option>`).join('')}</select></label><label>Offer item<select id="ecoTradeItem"><option value="">No item</option>${tradeable.map(item => `<option value="${esc(item.id)}">${esc(item.name)} ×${item.qty}</option>`).join('')}</select></label><label>Quantity<input id="ecoTradeQty" type="number" min="1" value="1"></label><label>Offer currency (copper equivalent)<input id="ecoTradeCurrency" type="number" min="0" value="0"></label><label>Request / note<textarea id="ecoTradeNote" placeholder="Optional requested item or message"></textarea></label><button type="button" class="primary" data-trade-create>Send Trade Request</button></section>
        <section><h3>Open Trades</h3><div class="ecosystem-trade-list">${trades.map(trade => tradeCard(trade,id)).join('') || emptyState('No open trades', 'Send a request to another linked campaign character.')}</div></section>
      </div>`;
  }
  function tradeCard(trade, id){
    const peerId = trade.fromCharacterId === id ? trade.toCharacterId : trade.fromCharacterId;
    const peer = campaignCharacter(peerId);
    const own = trade.offers?.[id] || {items:[],currencyCopper:0};
    const other = trade.offers?.[peerId] || {items:[],currencyCopper:0};
    const tradeable = api.items(id).filter(item => !item.equipped && !item.locked && !item.bound && !item.questItem && item.tradeAvailable);
    const selected = own.items?.[0]?.itemId || '';
    const selectedQty = own.items?.[0]?.qty || 1;
    return `<article class="ecosystem-trade-card"><header><div><small>${esc(trade.status)}</small><h4>Trade with ${esc(peer?.name || peerId)}</h4></div><button type="button" data-trade-cancel="${esc(trade.id)}">Cancel</button></header><div class="ecosystem-trade-offers"><div><b>Your offer</b>${offerHtml(own)}</div><div><b>Their offer</b>${offerHtml(other)}</div></div><div class="ecosystem-trade-editor"><label>Item<select data-trade-edit-item="${esc(trade.id)}"><option value="">No item</option>${tradeable.map(item => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(item.name)} ×${item.qty}</option>`).join('')}</select></label><label>Quantity<input data-trade-edit-qty="${esc(trade.id)}" type="number" min="1" value="${number(selectedQty,1)}"></label><label>Currency (cp)<input data-trade-edit-currency="${esc(trade.id)}" type="number" min="0" value="${number(own.currencyCopper)}"></label><button type="button" data-trade-update="${esc(trade.id)}">Update My Offer</button></div><p>${esc(trade.note || '')}</p><button type="button" class="${trade.confirmations?.[id] ? 'confirmed' : 'primary'}" data-trade-confirm="${esc(trade.id)}">${trade.confirmations?.[id] ? 'Confirmed' : 'Confirm Final Offer'}</button></article>`;
  }
  function offerHtml(offer){
    return `<p>${array(offer.items).map(line => `${esc(line.item?.name || line.itemId)} ×${line.qty}`).join('<br>') || 'No items'}</p><small>${number(offer.currencyCopper).toLocaleString()} cp</small>`;
  }
  function renderMarketplaceView(){
    const shared = ecosystem();
    const id = activeId();
    const listings = array(shared?.marketplace).filter(listing => listing.status === 'active');
    const listable = api.items(id).filter(item => !item.equipped && !item.locked && !item.bound && !item.questItem && !item.listingId);
    return `
      <div class="ecosystem-section-head"><div><h3>Player Marketplace</h3><p>Campaign listings remain reserved, auditable, and available across player logins.</p></div></div>
      <div class="ecosystem-market-layout">
        <section class="ecosystem-form-card"><h3>Create Listing</h3><label>Item<select id="ecoListingItem"><option value="">Choose item</option>${listable.map(item => `<option value="${esc(item.id)}">${esc(item.name)} ×${item.qty}</option>`).join('')}</select></label><label>Quantity<input id="ecoListingQty" type="number" min="1" value="1"></label><label>Fixed price (copper)<input id="ecoListingPrice" type="number" min="0" value="0"></label><label>Duration<select id="ecoListingDuration"><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select></label><label>Requested trade / note<input id="ecoListingRequest" placeholder="Optional requested item"></label><button type="button" class="primary" data-listing-create>Create Listing</button></section>
        <div class="ecosystem-market-grid">${listings.map(listing => listingCard(listing,id)).join('') || emptyState('No active listings', 'Campaign members can list tradeable items here.')}</div>
      </div>`;
  }
  function listingCard(listing, id){
    const seller = campaignCharacter(listing.sellerCharacterId);
    const own = listing.sellerCharacterId === id;
    return `<article class="ecosystem-listing-card ${rarityClass(listing.item)}"><span class="ecosystem-item-art">${itemImage(listing.item)}</span><div><span class="ecosystem-rarity">${esc(listing.item.rarity)}</span><h3>${esc(listing.item.name)}</h3><p>Seller: ${esc(seller?.name || listing.sellerCharacterId)}</p><small>×${listing.qty} · ${esc(listing.item.quality)} · ${listing.item.condition}% condition</small><strong>${number(listing.priceCopper).toLocaleString()} cp</strong><p>${esc(listing.requestedTrade || '')}</p></div><button type="button" ${own ? `data-listing-cancel="${esc(listing.id)}"` : `data-listing-buy="${esc(listing.id)}"`}>${own ? 'Cancel Listing' : 'Buy Listing'}</button></article>`;
  }
  function renderWishlistView(){
    const record = activeCharacter();
    return `
      <div class="ecosystem-section-head"><div><h3>Wishlist</h3><p>Track wanted compendium items and receive campaign listing notifications.</p></div></div>
      <div class="ecosystem-form-inline"><input id="ecoWishlistSearch" list="ecoCatalogNames" placeholder="Search or enter item name"><button type="button" data-wishlist-add>Add to Wishlist</button></div>
      <datalist id="ecoCatalogNames">${catalogEntries().map(entry => `<option value="${esc(entry.title)}"></option>`).join('')}</datalist>
      <div class="ecosystem-wishlist">${array(record?.wishlist).map(value => `<div><span>★</span><b>${esc(value)}</b><button type="button" data-wishlist-remove="${esc(value)}">Remove</button></div>`).join('') || emptyState('Wishlist is empty', 'Add an Asteria item you want to find or trade for.')}</div>`;
  }
  function renderHistoryView(){
    const record = activeCharacter();
    return `<div class="ecosystem-section-head"><div><h3>Inventory & Transaction History</h3><p>Ownership, currency, equipment, loot, shop, storage, and trade actions are recorded.</p></div></div>${auditTable(array(record?.inventoryActivity))}`;
  }
  function auditTable(entries){
    return `<div class="ecosystem-audit-table"><div class="head"><b>Date</b><b>Action</b><b>Character</b><b>Item / Currency</b><b>Source</b></div>${entries.map(entry => `<div><span>${esc(dateLabel(entry.at))}</span><b>${esc(entry.action)}</b><span>${esc(entry.characterName || entry.characterId || '')}</span><span>${esc(entry.itemName || '')}${entry.quantity ? ` ×${entry.quantity}` : ''}${entry.currency?.copperEquivalent ? ` ${entry.currency.copperEquivalent} cp` : ''}</span><span>${esc(entry.source || entry.notes || '')}${entry.gmOverride ? ' · GM override' : ''}</span></div>`).join('') || '<p>No inventory activity has been recorded yet.</p>'}</div>`;
  }
  function playerContent(){
    if(ui.playerTab === 'inventory') return renderInventoryView();
    if(ui.playerTab === 'equipment') return renderEquipmentView();
    if(ui.playerTab === 'bags') return renderBagsView();
    if(ui.playerTab === 'storage') return renderStorageView();
    if(ui.playerTab === 'party-loot') return renderPartyLootView(false);
    if(ui.playerTab === 'shops') return renderShopsView();
    if(ui.playerTab === 'trade') return renderTradeView();
    if(ui.playerTab === 'marketplace') return renderMarketplaceView();
    if(ui.playerTab === 'wishlist') return renderWishlistView();
    return renderHistoryView();
  }
  function ensurePlayerShell(){
    const pane = document.getElementById('inventory');
    if(!pane) return null;
    let root = document.getElementById('asteriaItemEcosystemPlayer');
    if(!root){
      root = document.createElement('div');
      root.id = 'asteriaItemEcosystemPlayer';
      root.className = 'asteria-item-ecosystem';
      pane.prepend(root);
      pane.querySelector('.inventory-system-layout')?.classList.add('ecosystem-legacy-hidden');
      bindRoot(root);
    }
    return root;
  }
  function renderPlayer(){
    if(document.documentElement.dataset.asteriaLiveCharacterDashboard==='active'){
      document.getElementById('asteriaItemEcosystemPlayer')?.remove();
      return;
    }
    const root = ensurePlayerShell();
    if(!root) return;
    api.ensure(activeId());
    migrateSharedState();
    root.innerHTML = `
      <header class="ecosystem-title"><div><p class="eyebrow">Character Item Workspace</p><h2>Inventory & Equipment</h2></div><span>${esc(VERSION)}</span></header>
      ${playerSummary()}
      <nav class="ecosystem-tabs">${PLAYER_TABS.map(([id,label]) => `<button type="button" data-player-tab="${id}" class="${ui.playerTab === id ? 'active' : ''}">${label}</button>`).join('')}</nav>
      <main class="ecosystem-display">${playerContent()}</main>`;
  }

  function gmCatalogSelect(limit = 30){
    const query = ui.gmCatalogQuery.trim().toLowerCase();
    return catalogEntries().filter(entry => !query || [entry.title,entry.category,entry.metadata?.itemClass].join(' ').toLowerCase().includes(query)).slice(0, limit);
  }
  function renderGMRewards(){
    const selected = catalogEntry(ui.gmSelectedCatalogId);
    return `
      <div class="ecosystem-gm-grid">
        <section class="ecosystem-form-card">
          <h3>Issue Loot Reward</h3>
          <label>Recipients<div class="ecosystem-character-checks">${campaignCharacters().map(entry => `<label><input type="checkbox" data-gm-reward-character value="${esc(entry.id)}"><span>${esc(entry.record.name)}</span></label>`).join('') || '<p>No linked characters.</p>'}</div></label>
          <label>Destination<select id="gmEcoRewardDestination"><option value="character">Selected inventories</option><option value="party">Party Loot pool</option><option value="choice">Player reward choice</option></select></label>
          <label>Quantity<input id="gmEcoRewardQty" type="number" min="1" value="1"></label>
          <label>Quality<select id="gmEcoRewardQuality">${['Trash','Poor','Average','Well Crafted','Exceptional','Superb','Exquisite','Masterwork'].map(value => `<option>${value}</option>`).join('')}</select></label>
          <label>Condition<input id="gmEcoRewardCondition" type="number" min="0" max="100" value="100"></label>
          <label>Enchantment / note<input id="gmEcoRewardNote" placeholder="Optional enchantment, source, or GM note"></label>
          <label><input id="gmEcoRewardIdentified" type="checkbox" checked> Identified</label>
          <button type="button" class="primary" data-gm-reward-preview>Preview & Issue Reward</button>
        </section>
        <section>
          <div class="ecosystem-section-head"><div><h3>Asteria Item Database</h3><p>Search uses the existing compendium source.</p></div></div>
          <input type="search" data-gm-catalog-search value="${esc(ui.gmCatalogQuery)}" placeholder="Search category, rarity, region, or item...">
          <div class="ecosystem-item-gallery compact">${gmCatalogSelect().map(entry => {
            const snapshot = catalogSnapshot(entry.slug || entry.title);
            return snapshot ? itemCard(snapshot, { actions:`<button type="button" data-gm-catalog-select="${esc(entry.slug || slug(entry.title))}">${ui.gmSelectedCatalogId === slug(entry.slug || entry.title) ? 'Selected' : 'Select'}</button>` }) : '';
          }).join('')}</div>
          ${selected ? `<div class="ecosystem-selected-callout"><b>Selected: ${esc(selected.title)}</b><span>${esc(selected.category || '')}</span></div>` : ''}
        </section>
      </div>`;
  }
  function renderGMLootTables(){
    const shared = ecosystem();
    return `
      <div class="ecosystem-two-column">
        <section class="ecosystem-form-card"><h3>Create Loot Table</h3><label>Name<input id="gmLootTableName" placeholder="Cave Drake Harvest"></label><label>Source type<select id="gmLootTableSource"><option>Monster</option><option>Encounter</option><option>Treasure Chest</option><option>Location</option><option>Event</option><option>Quest</option></select></label><label>Region<input id="gmLootTableRegion" placeholder="Optional region"></label><label>Level range<input id="gmLootTableLevel" placeholder="1-10"></label><button type="button" data-loot-table-create>Create Table</button></section>
        <section><h3>Loot Tables</h3><div class="ecosystem-loot-table-list">${array(shared?.lootTables).map(table => `<article class="ecosystem-loot-table"><header><div><small>${esc(table.sourceType)} · ${esc(table.region || 'All regions')}</small><h4>${esc(table.name)}</h4></div><button type="button" data-loot-table-select="${esc(table.id)}">Edit</button></header><p>${array(table.entries).length} entries · Level ${esc(table.levelRange || 'Any')}</p><button type="button" data-loot-table-roll="${esc(table.id)}">Roll to Party Loot</button></article>`).join('') || emptyState('No loot tables', 'Create a metadata-driven drop table for a monster, encounter, chest, location, or event.')}</div></section>
      </div>
      ${renderLootTableEditor()}`;
  }
  function renderLootTableEditor(){
    const table = ecosystem()?.lootTables?.find(candidate => candidate.id === ui.gmSelectedLootTableId);
    if(!table) return '';
    return `<section class="ecosystem-loot-table-editor"><div class="ecosystem-section-head"><div><h3>${esc(table.name)}</h3><p>Guaranteed, percentage, weighted, quantity, rarity, region, and unique drop foundations.</p></div></div><div class="ecosystem-form-inline"><select id="gmLootEntryItem"><option value="">Choose compendium item</option>${catalogEntries().map(entry => `<option value="${esc(entry.slug || slug(entry.title))}">${esc(entry.title)}</option>`).join('')}</select><input id="gmLootEntryChance" type="number" min="0" max="100" value="100" title="Drop chance %"><input id="gmLootEntryMin" type="number" min="1" value="1" title="Minimum quantity"><input id="gmLootEntryMax" type="number" min="1" value="1" title="Maximum quantity"><label><input id="gmLootEntryUnique" type="checkbox"> Unique</label><button type="button" data-loot-entry-add>Add Drop</button></div><div class="ecosystem-audit-table">${array(table.entries).map((entry,index) => `<div><span>${esc(entry.itemName)}</span><span>${entry.chance}%</span><span>${entry.minQty}-${entry.maxQty}</span><span>${entry.unique ? 'Unique' : 'Repeatable'}</span><button type="button" data-loot-entry-remove="${index}">Remove</button></div>`).join('') || '<p>No entries yet.</p>'}</div></section>`;
  }
  function renderGMLootDrop(){
    const tables = array(ecosystem()?.lootTables);
    return `<section class="ecosystem-form-card wide"><h3>Loot Drop Generator</h3><p>Roll a table, inspect the generated items, then send them to Party Loot for Need / Greed distribution.</p><div class="ecosystem-form-inline"><select id="gmLootRollTable"><option value="">Choose loot table</option>${tables.map(table => `<option value="${esc(table.id)}">${esc(table.name)}</option>`).join('')}</select><label>Difficulty scale<input id="gmLootDifficulty" type="number" min=".1" max="5" step=".1" value="1"></label><label>Party scale<input id="gmLootPartyScale" type="number" min="1" max="20" value="${Math.max(1,campaignCharacters().length)}"></label><button type="button" class="primary" data-loot-generator-roll>Roll Shared Loot</button></div><div id="gmLootGeneratedPreview" class="ecosystem-item-gallery compact"></div></section>`;
  }
  function renderGMShops(){
    const shops = array(ecosystem()?.shops);
    return `
      <div class="ecosystem-two-column">
        <section class="ecosystem-form-card"><h3>Shop Creator</h3><label>Shop name<input id="gmEcoShopName" placeholder="Greystone Forge"></label><label>Type<select id="gmEcoShopType">${SHOP_TYPES.map(type => `<option>${type}</option>`).join('')}</select></label><label>Owner / NPC<input id="gmEcoShopOwner" placeholder="Merchant name"></label><label>Description<textarea id="gmEcoShopDescription"></textarea></label><label>Map location<input id="gmEcoShopLocation" placeholder="Settlement or location slug"></label><label>Region<input id="gmEcoShopRegion" placeholder="Region"></label><label>Opening hours<input id="gmEcoShopHours" value="GM controlled"></label><div class="ecosystem-form-inline"><label>Buy modifier<input id="gmEcoShopBuyMod" type="number" step=".05" value="1"></label><label>Sell modifier<input id="gmEcoShopSellMod" type="number" step=".05" value=".5"></label></div><label>Restock<select id="gmEcoShopRestock"><option>Manual</option><option>No Restocking</option><option>In-game Days</option><option>Party Leaves Region</option><option>Random Item Table</option><option>Local Resources</option><option>World Events</option></select></label><button type="button" class="primary" data-shop-create>Create Shop & Map Marker</button></section>
        <section><h3>Campaign Shops</h3><div class="ecosystem-shop-admin-list">${shops.map(shop => `<article><div><small>${esc(shop.type)} · ${esc(shop.region || 'No region')}</small><h4>${esc(shop.name)}</h4><p>${array(shop.stock).length} stock lines · ${esc(shop.status || 'closed')}</p></div><div><button type="button" data-shop-admin-open="${esc(shop.id)}">${shop.status === 'open' ? 'Close' : 'Open'}</button><button type="button" data-shop-admin-restock="${esc(shop.id)}">Restock</button><button type="button" data-shop-admin-stock="${esc(shop.id)}">Add Selected Item</button></div></article>`).join('') || emptyState('No shops', 'Create a campaign merchant and connect it to the existing map.')}</div></section>
      </div>`;
  }
  function renderGMInventories(){
    const selectedId = ui.gmSelectedCharacterId || campaignCharacters()[0]?.id || '';
    const record = campaignCharacter(selectedId);
    ui.gmSelectedCharacterId = selectedId;
    return `<div class="ecosystem-section-head"><div><h3>Player Inventories</h3><p>GM inspection and correction uses the same shared character records.</p></div><select data-gm-character-select>${campaignCharacters().map(entry => `<option value="${esc(entry.id)}" ${entry.id === selectedId ? 'selected' : ''}>${esc(entry.record.name)}</option>`).join('')}</select></div>${record ? `<div class="ecosystem-item-gallery">${api.items(selectedId).map(item => itemCard(item, { actions:`<button type="button" data-gm-item-remove="${esc(selectedId)}:${esc(item.id)}">GM Remove</button>` })).join('') || emptyState('Inventory empty','This character has no items.')}</div>` : emptyState('No linked characters','Link characters to the campaign first.')}`;
  }
  function renderGMTrades(){
    const shared = ecosystem();
    const trades = [...array(shared?.directTrades), ...array(shared?.marketplace)];
    return `<div class="ecosystem-section-head"><div><h3>Trade & Listing History</h3><p>Direct trades and asynchronous listings are auditable and GM-moderated.</p></div></div><div class="ecosystem-audit-table"><div class="head"><b>Date</b><b>Type</b><b>Status</b><b>Participants</b><b>Details</b></div>${trades.map(record => `<div><span>${esc(dateLabel(record.createdAt))}</span><b>${record.sellerCharacterId ? 'Listing' : 'Direct Trade'}</b><span>${esc(record.status)}</span><span>${esc(record.sellerCharacterId ? campaignCharacter(record.sellerCharacterId)?.name : `${campaignCharacter(record.fromCharacterId)?.name || ''} / ${campaignCharacter(record.toCharacterId)?.name || ''}`)}</span><span>${esc(record.item?.name || record.note || '')}${record.status === 'active' ? `<button type="button" data-gm-trade-remove="${esc(record.id)}">Remove</button>` : ''}</span></div>`).join('') || '<p>No trade records.</p>'}</div>`;
  }
  function renderGMAudit(){
    return `<div class="ecosystem-section-head"><div><h3>Inventory Activity & Audit</h3><p>Secure campaign log for ownership, currency, shops, trades, loot, and GM overrides.</p></div><button type="button" data-audit-export>Export JSON</button></div>${auditTable(array(ecosystem()?.auditLog))}`;
  }
  function gmContent(){
    if(ui.gmTab === 'rewards') return renderGMRewards();
    if(ui.gmTab === 'party-loot') return renderPartyLootView(true);
    if(ui.gmTab === 'loot-tables') return renderGMLootTables();
    if(ui.gmTab === 'loot-drop') return renderGMLootDrop();
    if(ui.gmTab === 'shops') return renderGMShops();
    if(ui.gmTab === 'inventories') return renderGMInventories();
    if(ui.gmTab === 'trades') return renderGMTrades();
    return renderGMAudit();
  }
  function ensureGMShell(){
    const host = document.querySelector('#gm .gm-panels');
    if(!host) return null;
    let root = document.getElementById('asteriaItemEcosystemGM');
    if(!root){
      root = document.createElement('section');
      root.id = 'asteriaItemEcosystemGM';
      root.className = 'card asteria-item-ecosystem ecosystem-gm';
      root.dataset.gmSystem = 'campaign-manager';
      host.appendChild(root);
      bindRoot(root);
    }
    return root;
  }
  function renderGM(){
    const root = ensureGMShell();
    if(!root) return;
    migrateSharedState();
    root.innerHTML = `<header class="ecosystem-title"><div><p class="eyebrow">GM Item Tools</p><h2>Loot, Shops & Trading</h2></div><span>${esc(VERSION)}</span></header><nav class="ecosystem-tabs">${GM_TABS.map(([id,label]) => `<button type="button" data-gm-tab="${id}" class="${ui.gmTab === id ? 'active' : ''}">${label}</button>`).join('')}</nav><main class="ecosystem-display">${gmContent()}</main>`;
    window.applyGMSystemPanel?.();
  }

  function openItemDetails(itemId, characterId = activeId()){
    const item = api.find(itemId, characterId);
    if(!item) return;
    ui.selectedItemId = item.id;
    const requirement = api.requirements(item, characterId);
    const slots = api.inferSlots(item);
    const record = api.ensure(characterId);
    const equippedComparison = slots.map(slot => api.items(characterId).find(candidate => candidate.equipped && candidate.id !== item.id && candidate.equippedSlot === slot)).find(Boolean);
    const bagOptions = array(record?.bags).map(bag => `<option value="${esc(bag.id)}">${esc(bag.name)}</option>`).join('');
    const storageOptions = array(record?.storages).map(storage => `<option value="${esc(storage.id)}">${esc(storage.name)}</option>`).join('');
    const history = array(item.history).slice(0, 12);
    const meta = `<span class="ecosystem-rarity ${rarityClass(item)}">${esc(item.rarity)}</span><span>${esc(item.quality)}</span><span>${item.condition}% condition</span><span>${item.durability}/${item.maxDurability} durability</span>`;
    const body = `
      <div class="ecosystem-item-detail">
        <div class="ecosystem-detail-stats"><div><small>Type</small><b>${esc(item.type)}</b></div><div><small>Quantity</small><b>${item.qty}</b></div><div><small>Weight</small><b>${item.weight} each</b></div><div><small>Value</small><b>${item.value.toLocaleString()} cp</b></div><div><small>Location</small><b>${esc(item.location)}</b></div><div><small>Trade</small><b>${item.tradeAvailable && !item.bound ? 'Available' : 'Restricted'}</b></div></div>
        <section><h3>Description</h3><p>${esc(item.desc || item.description || 'Information coming soon.')}</p></section>
        ${item.lore ? `<section><h3>Lore</h3><p>${esc(item.lore)}</p></section>` : ''}
        <section><h3>Requirements</h3><p class="${requirement.met ? 'success' : 'warning'}">${requirement.met ? 'All requirements met.' : `Missing: ${esc(requirement.failures.join(', '))}`}</p></section>
        ${slots.length ? `<section><h3>Equipment Comparison</h3><div class="ecosystem-comparison"><div><small>Selected</small><b>${esc(item.name)}</b><span>${number(item.weight).toFixed(1)} wt · ${number(item.value).toLocaleString()} cp</span><pre>${esc(JSON.stringify(item.stats || item.effects || {}, null, 2))}</pre></div><div><small>Currently Equipped</small><b>${esc(equippedComparison?.name || 'Empty slot')}</b><span>${equippedComparison ? `${number(equippedComparison.weight).toFixed(1)} wt · ${number(equippedComparison.value).toLocaleString()} cp` : 'No comparison item'}</span>${equippedComparison ? `<pre>${esc(JSON.stringify(equippedComparison.stats || equippedComparison.effects || {}, null, 2))}</pre>` : ''}</div></div></section>` : ''}
        <section><h3>Effects & Enchantments</h3><pre>${esc(JSON.stringify({ effects:item.effects, enchantments:item.enchantments }, null, 2))}</pre></section>
        <section><h3>Quick Actions</h3><div class="ecosystem-detail-actions">
          ${slots.length ? `<select id="ecoDetailEquipSlot">${slots.map(slot => `<option>${esc(slot)}</option>`).join('')}</select><button type="button" data-detail-equip="${esc(item.id)}">${item.equipped ? 'Unequip' : 'Equip'}</button>` : ''}
          ${item.type.toLowerCase().includes('consum') || item.effect ? `<button type="button" data-detail-use="${esc(item.id)}">Use / Consume</button>` : ''}
          ${item.qty > 1 ? `<input id="ecoDetailSplitQty" type="number" min="1" max="${item.qty - 1}" value="1"><button type="button" data-detail-split="${esc(item.id)}">Split Stack</button>` : ''}
          ${bagOptions ? `<select id="ecoDetailBag">${bagOptions}</select><button type="button" data-detail-bag="${esc(item.id)}">Add to Bag</button>` : ''}
          ${storageOptions && !item.equipped ? `<select id="ecoDetailStorage">${storageOptions}</select><button type="button" data-detail-store="${esc(item.id)}">Store</button>` : ''}
          ${item.location === 'storage' ? `<button type="button" data-detail-retrieve="${esc(item.id)}">Retrieve</button>` : ''}
          <button type="button" data-detail-favourite="${esc(item.id)}">${item.favourite ? 'Unfavourite' : 'Favourite'}</button>
          <button type="button" data-detail-lock="${esc(item.id)}">${item.locked ? 'Unlock' : 'Lock'}</button>
          <button type="button" data-detail-party-loot="${esc(item.id)}" ${item.equipped || item.locked || item.bound || item.questItem ? 'disabled' : ''}>Add to Party Loot</button>
          <button type="button" class="danger" data-detail-drop="${esc(item.id)}" ${item.locked || item.bound || item.questItem ? 'disabled' : ''}>Drop</button>
        </div></section>
        <section><h3>Ownership History</h3>${history.map(entry => `<p><b>${esc(entry.action)}</b> · ${esc(dateLabel(entry.at))} · ${esc(entry.source || '')}</p>`).join('') || '<p>No item history.</p>'}</section>
      </div>`;
    window.openAsteriaInfoModal?.({
      eyebrow:item.identified ? 'Inventory Item' : 'Unidentified Item',
      title:item.identified ? item.name : 'Unidentified Item',
      subtitle:`Owned by ${record?.name || 'character'}`,
      image:item.image || '',
      meta,
      body
    });
  }
  function openLootDetails(loot){
    const item = loot?.item ? api.normalizeItem(loot.item) : null;
    if(!item) return;
    const meta = `<span class="ecosystem-rarity ${rarityClass(item)}">${esc(item.rarity)}</span><span>${esc(item.quality)}</span><span>${item.condition}% condition</span>`;
    const body = `<div class="ecosystem-item-detail"><div class="ecosystem-detail-stats"><div><small>Type</small><b>${esc(item.type)}</b></div><div><small>Quantity</small><b>${number(loot.quantity || item.qty,1)}</b></div><div><small>Weight</small><b>${number(item.weight).toFixed(1)} each</b></div><div><small>Value</small><b>${number(item.value).toLocaleString()} cp</b></div><div><small>Source</small><b>${esc(loot.source || 'Party Loot')}</b></div><div><small>Status</small><b>${esc(loot.status || 'Available')}</b></div></div><section><h3>Description</h3><p>${esc(item.desc || item.description || 'Information coming soon.')}</p></section><section><h3>Effects & Enchantments</h3><pre>${esc(JSON.stringify({ effects:item.effects, enchantments:item.enchantments }, null, 2))}</pre></section></div>`;
    window.openAsteriaInfoModal?.({
      eyebrow:'Shared Party Loot',
      title:item.identified ? item.name : 'Unidentified Item',
      subtitle:'Read-only inspection',
      image:item.image || '',
      meta,
      body
    });
  }

  function addToPartyLoot(itemId, characterId = activeId(), quantity){
    const item = api.find(itemId, characterId);
    const shared = ecosystem();
    if(!item || !shared || item.equipped || item.locked || item.bound || item.questItem) return false;
    const amount = Math.max(1, Math.min(item.qty, number(quantity, item.qty)));
    const snapshot = api.normalizeItem(Object.assign({}, clone(item), { qty:amount }), { newInstance:true });
    shared.partyLoot.unshift({
      id:api.uid('loot'),
      item:snapshot,
      quantity:amount,
      source:`Transferred by ${api.character(characterId)?.name || characterId}`,
      discoveredBy:characterId,
      status:'available',
      responses:{},
      createdAt:now(),
      distribution:null
    });
    api.remove(item.id, characterId, amount, { action:'party-loot-transfer', source:activeCampaign()?.name || 'Campaign' });
    api.audit('party-loot-added', { characterId, itemId:item.id, itemName:item.name, quantity:amount, source:activeCampaign()?.name || 'Campaign' });
    saveCampaign('party-loot-added');
    notify('Party Loot Available', `${snapshot.name} was added to shared Party Loot.`, { level:'medium', partyWide:true });
    return true;
  }
  function chooseLoot(lootId, choice){
    const loot = ecosystem()?.partyLoot?.find(entry => entry.id === lootId);
    if(!loot) return;
    loot.responses = loot.responses || {};
    loot.responses[activeId()] = choice;
    api.audit('party-loot-choice', { characterId:activeId(), itemId:loot.item.id, itemName:loot.item.name, notes:choice });
    saveCampaign('party-loot-choice');
  }
  function distributeLoot(lootId, recipientId, method = 'direct'){
    const shared = ecosystem();
    const loot = shared?.partyLoot?.find(entry => entry.id === lootId);
    if(!loot) return false;
    let winner = recipientId;
    if(method === 'need-greed'){
      const responses = Object.entries(loot.responses || {});
      const needs = responses.filter(([,choice]) => choice === 'need').map(([id]) => id);
      const greeds = responses.filter(([,choice]) => choice === 'greed').map(([id]) => id);
      const pool = needs.length ? needs : greeds;
      if(!pool.length){ notify('No Eligible Claims', 'No party member selected Need or Greed.', { type:'warning' }); return false; }
      winner = pool[Math.floor(Math.random() * pool.length)];
      loot.rolls = Object.fromEntries(pool.map(id => [id, Math.floor(Math.random() * 100) + 1]));
      winner = pool.sort((a,b) => loot.rolls[b] - loot.rolls[a])[0];
    }
    if(!winner || !campaignCharacter(winner)) return false;
    const received = api.add(Object.assign({}, loot.item, { qty:loot.quantity }), winner, { forceNew:true, source:loot.source, reason:'party-loot-awarded' });
    if(!received) return false;
    loot.status = 'distributed';
    loot.distribution = { method, recipientId:winner, at:now(), rolls:loot.rolls || null };
    api.audit('party-loot-distributed', { characterId:winner, itemId:received.id, itemName:received.name, quantity:received.qty, source:loot.source, gmOverride:true });
    saveCampaign('party-loot-distributed');
    notify('Party Loot Awarded', `${campaignCharacter(winner)?.name || winner} received ${received.name}.`, { level:'medium', partyWide:true, targetPlayer:winner });
    return true;
  }
  function sellAllPartyLoot(){
    const shared = ecosystem();
    const available = array(shared?.partyLoot).filter(loot => loot.status !== 'distributed');
    if(!available.length) return;
    const total = available.reduce((sum,loot) => sum + number(loot.item.value) * number(loot.quantity,1), 0);
    const members = campaignCharacters();
    const share = members.length ? Math.floor(total / members.length) : 0;
    members.forEach(entry => api.adjustCurrency(entry.id, share, { action:'party-loot-currency-share', source:'Party Loot Sale' }));
    available.forEach(loot => { loot.status = 'sold'; loot.distribution = { method:'sell-and-split', at:now(), share }; });
    shared.partyCurrency = number(shared.partyCurrency, 0) + total - share * members.length;
    saveCampaign('party-loot-sold');
    notify('Party Loot Sold', `${total.toLocaleString()} copper was divided between ${members.length} characters.`, { level:'medium', partyWide:true });
  }
  function saleValue(item, shop){
    const condition = Math.max(.1, number(item.condition,100) / 100);
    const quality = { Trash:.1,Poor:.35,Average:1,'Well Crafted':1.15,Exceptional:1.35,Superb:1.6,Exquisite:2,Masterwork:2.5 }[item.quality] || 1;
    const speciality = String(shop.type || '').toLowerCase();
    const text = `${item.type} ${item.category} ${item.material}`.toLowerCase();
    let specialtyModifier = .75;
    if(speciality.includes('blacksmith') && /weapon|armor|armour|ore|metal/.test(text)) specialtyModifier = 1.1;
    if(speciality.includes('alchemist') && /herb|potion|reagent|alchemy/.test(text)) specialtyModifier = 1.1;
    if(speciality.includes('general')) specialtyModifier = .85;
    return Math.max(0, Math.floor(number(item.value) * number(shop.sellModifier,.5) * condition * quality * specialtyModifier));
  }
  function buyShopItem(shopId, stockIndex, quantity){
    const shop = ecosystem()?.shops?.find(entry => entry.id === shopId);
    const stock = shop?.stock?.[stockIndex];
    const record = activeCharacter();
    if(!shop || !stock || !record || !shopAccessible(shop)) return false;
    const qty = Math.max(1, Math.min(number(quantity,1), number(stock.qty,0)));
    const cost = number(stock.priceCopper || stock.item?.value) * qty;
    const item = api.normalizeItem(Object.assign({}, stock.item, { qty }), { newInstance:true });
    const enc = api.encumbrance(activeId());
    if(api.currencyTotal(record) < cost){ notify('Purchase Failed','Not enough currency.',{type:'warning'}); return false; }
    if(!activeCampaign()?.itemEcosystem?.settings?.allowOverencumbrance && enc.weight + item.weight * qty > enc.capacity){ notify('Purchase Failed','This purchase exceeds carry capacity.',{type:'warning'}); return false; }
    if(!api.adjustCurrency(activeId(), -cost, { action:'shop-purchase', source:shop.name })) return false;
    const received = api.add(item, activeId(), { forceNew:true, source:shop.name, reason:'shop-purchase' });
    if(!received) return false;
    stock.qty -= qty;
    shop.currencyCopper = number(shop.currencyCopper,0) + cost;
    api.audit('shop-purchase', { characterId:activeId(), itemId:received.id, itemName:received.name, quantity:qty, currency:{copperEquivalent:-cost}, source:shop.name });
    saveCampaign('shop-purchase');
    notify('Purchase Complete', `${qty} × ${received.name} added to inventory.`, { targetPlayer:activeId() });
    return true;
  }
  function sellShopItem(shopId, itemId){
    const shop = ecosystem()?.shops?.find(entry => entry.id === shopId);
    const item = api.find(itemId, activeId());
    if(!shop || !item || item.equipped || item.locked || item.bound || item.questItem) return false;
    const value = saleValue(item, shop);
    if(number(shop.currencyCopper, Infinity) < value) return false;
    const snapshot = api.normalizeItem(Object.assign({}, clone(item), { qty:1 }), { newInstance:true });
    if(!api.remove(item.id, activeId(), 1, { action:'shop-sale', source:shop.name })) return false;
    api.adjustCurrency(activeId(), value, { action:'shop-sale-payment', source:shop.name });
    const stock = array(shop.stock).find(line => slug(line.item?.catalogId || line.item?.name) === slug(snapshot.catalogId || snapshot.name));
    if(stock) stock.qty += 1;
    else shop.stock.push({ item:snapshot, qty:1, priceCopper:Math.max(snapshot.value, Math.ceil(value / Math.max(.1,number(shop.sellModifier,.5)))) });
    shop.currencyCopper = Math.max(0, number(shop.currencyCopper,0) - value);
    shop.buyback = array(shop.buyback);
    shop.buyback.unshift({ item:snapshot, sellerCharacterId:activeId(), priceCopper:value, soldAt:now() });
    saveCampaign('shop-sale');
    notify('Item Sold', `${snapshot.name} sold for ${value.toLocaleString()} copper.`, { targetPlayer:activeId() });
    return true;
  }
  function createDirectTrade(){
    const toId = document.getElementById('ecoTradeRecipient')?.value;
    const itemId = document.getElementById('ecoTradeItem')?.value;
    const qty = Math.max(1, number(document.getElementById('ecoTradeQty')?.value,1));
    const currency = Math.max(0, number(document.getElementById('ecoTradeCurrency')?.value,0));
    const note = document.getElementById('ecoTradeNote')?.value || '';
    const fromId = activeId();
    const item = itemId ? api.find(itemId, fromId) : null;
    if(!toId || toId === fromId || itemId && (!item || item.equipped || item.locked || item.bound || item.questItem || qty > item.qty)) return false;
    if(currency > api.currencyTotal(activeCharacter())) return false;
    const trade = {
      id:api.uid('trade'),
      fromCharacterId:fromId,
      toCharacterId:toId,
      offers:{
        [fromId]:{ items:item ? [{ itemId:item.id, item:api.normalizeItem(Object.assign({},clone(item),{qty}),{newInstance:true}), qty }] : [], currencyCopper:currency },
        [toId]:{ items:[], currencyCopper:0 }
      },
      confirmations:{ [fromId]:false, [toId]:false },
      status:'pending',
      note,
      createdAt:now(),
      updatedAt:now()
    };
    ecosystem().directTrades.unshift(trade);
    api.audit('trade-requested', { characterId:fromId, itemId:item?.id || '', itemName:item?.name || '', quantity:item ? qty : 0, currency:{copperEquivalent:currency}, newOwner:toId, notes:note });
    saveCampaign('trade-request');
    notify('Trade Request Received', `${activeCharacter()?.name || 'A player'} sent a trade request.`, { level:'medium', targetPlayer:toId });
    return true;
  }
  function updateTradeOffer(tradeId, root){
    const trade = ecosystem()?.directTrades?.find(entry => entry.id === tradeId);
    const id = activeId();
    if(!trade || ![trade.fromCharacterId,trade.toCharacterId].includes(id) || ['completed','cancelled'].includes(trade.status)) return false;
    const itemId = root.querySelector(`[data-trade-edit-item="${tradeId}"]`)?.value || '';
    const qty = Math.max(1, number(root.querySelector(`[data-trade-edit-qty="${tradeId}"]`)?.value, 1));
    const currency = Math.max(0, number(root.querySelector(`[data-trade-edit-currency="${tradeId}"]`)?.value, 0));
    const item = itemId ? api.find(itemId, id) : null;
    if(itemId && (!item || item.equipped || item.locked || item.bound || item.questItem || !item.tradeAvailable || qty > item.qty)){
      notify('Trade Offer Not Updated', 'Choose an available item and a valid quantity.', { type:'warning' });
      return false;
    }
    if(currency > api.currencyTotal(api.ensure(id))){
      notify('Trade Offer Not Updated', 'The offered currency exceeds the character balance.', { type:'warning' });
      return false;
    }
    trade.offers[id] = {
      items:item ? [{ itemId:item.id, item:api.normalizeItem(Object.assign({},clone(item),{qty}),{newInstance:true}), qty }] : [],
      currencyCopper:currency
    };
    trade.confirmations[trade.fromCharacterId] = false;
    trade.confirmations[trade.toCharacterId] = false;
    trade.status = 'pending';
    trade.updatedAt = now();
    api.audit('trade-offer-updated', {
      characterId:id,
      itemId:item?.id || '',
      itemName:item?.name || '',
      quantity:item ? qty : 0,
      currency:{copperEquivalent:currency},
      source:trade.id
    });
    saveCampaign('trade-offer-updated');
    return true;
  }
  function confirmTrade(tradeId){
    const trade = ecosystem()?.directTrades?.find(entry => entry.id === tradeId);
    const id = activeId();
    if(!trade || ![trade.fromCharacterId,trade.toCharacterId].includes(id) || ['completed','cancelled'].includes(trade.status)) return false;
    trade.confirmations[id] = true;
    trade.status = 'awaiting-confirmation';
    trade.updatedAt = now();
    if(trade.confirmations[trade.fromCharacterId] && trade.confirmations[trade.toCharacterId]) return executeTrade(trade);
    saveCampaign('trade-confirmed');
    return true;
  }
  function executeTrade(trade){
    const ids = [trade.fromCharacterId,trade.toCharacterId];
    const prepared = [];
    for(const ownerId of ids){
      const recipientId = ids.find(id => id !== ownerId);
      const offer = trade.offers[ownerId] || {items:[],currencyCopper:0};
      if(api.currencyTotal(api.ensure(ownerId)) < number(offer.currencyCopper)) return false;
      for(const line of array(offer.items)){
        const item = api.find(line.itemId, ownerId);
        if(!item || item.equipped || item.locked || item.bound || item.questItem || item.qty < line.qty) return false;
        prepared.push({ ownerId, recipientId, item, qty:line.qty });
      }
    }
    ids.forEach(ownerId => {
      const recipientId = ids.find(id => id !== ownerId);
      const amount = number(trade.offers[ownerId]?.currencyCopper);
      if(amount){
        api.adjustCurrency(ownerId,-amount,{action:'trade-currency-sent',source:trade.id});
        api.adjustCurrency(recipientId,amount,{action:'trade-currency-received',source:trade.id});
      }
    });
    prepared.forEach(line => {
      const snapshot = api.normalizeItem(Object.assign({},clone(line.item),{qty:line.qty}),{newInstance:true});
      api.remove(line.item.id,line.ownerId,line.qty,{action:'item-traded',source:trade.id});
      api.add(snapshot,line.recipientId,{forceNew:true,source:`Trade with ${campaignCharacter(line.ownerId)?.name || line.ownerId}`});
    });
    trade.status = 'completed';
    trade.completedAt = now();
    saveCampaign('trade-completed');
    notify('Trade Completed','Both players confirmed and the final offers were exchanged.',{level:'medium',partyWide:true});
    return true;
  }
  function createListing(){
    const id = activeId();
    const itemId = document.getElementById('ecoListingItem')?.value;
    const item = api.find(itemId,id);
    const qty = Math.max(1,number(document.getElementById('ecoListingQty')?.value,1));
    const priceCopper = Math.max(0,number(document.getElementById('ecoListingPrice')?.value,0));
    const hours = Math.max(1,number(document.getElementById('ecoListingDuration')?.value,24));
    if(!item || item.equipped || item.locked || item.bound || item.questItem || item.listingId || qty > item.qty) return false;
    const listing = {
      id:api.uid('listing'),
      sellerCharacterId:id,
      item:api.normalizeItem(Object.assign({},clone(item),{qty}),{newInstance:true}),
      sourceItemId:item.id,
      qty,
      priceCopper,
      requestedTrade:document.getElementById('ecoListingRequest')?.value || '',
      status:'active',
      createdAt:now(),
      expiresAt:new Date(Date.now()+hours*3600000).toISOString()
    };
    item.listingId = listing.id;
    ecosystem().marketplace.unshift(listing);
    api.audit('trade-listing-created',{characterId:id,itemId:item.id,itemName:item.name,quantity:qty,currency:{copperEquivalent:priceCopper}});
    api.persistCharacter(id,'trade-listing-reserved');
    saveCampaign('trade-listing-created');
    return true;
  }
  function cancelListing(listingId, gmOverride = false){
    const listing = ecosystem()?.marketplace?.find(entry => entry.id === listingId);
    if(!listing || listing.status !== 'active' || !gmOverride && listing.sellerCharacterId !== activeId()) return false;
    listing.status = 'cancelled';
    listing.cancelledAt = now();
    const item = api.find(listing.sourceItemId, listing.sellerCharacterId);
    if(item) item.listingId = '';
    api.persistCharacter(listing.sellerCharacterId,'trade-listing-cancelled');
    saveCampaign('trade-listing-cancelled');
    return true;
  }
  function buyListing(listingId){
    const listing = ecosystem()?.marketplace?.find(entry => entry.id === listingId);
    const buyerId = activeId();
    if(!listing || listing.status !== 'active' || listing.sellerCharacterId === buyerId || new Date(listing.expiresAt) <= new Date()) return false;
    const source = api.find(listing.sourceItemId, listing.sellerCharacterId);
    if(!source || source.qty < listing.qty || api.currencyTotal(activeCharacter()) < listing.priceCopper) return false;
    api.adjustCurrency(buyerId,-listing.priceCopper,{action:'listing-purchase',source:listing.id});
    api.adjustCurrency(listing.sellerCharacterId,listing.priceCopper,{action:'listing-sale',source:listing.id});
    api.remove(source.id,listing.sellerCharacterId,listing.qty,{action:'listing-item-transferred',source:listing.id});
    const received = api.add(listing.item,buyerId,{forceNew:true,source:`Marketplace: ${campaignCharacter(listing.sellerCharacterId)?.name || listing.sellerCharacterId}`});
    listing.status = 'sold';
    listing.buyerCharacterId = buyerId;
    listing.soldAt = now();
    if(source) source.listingId = '';
    saveCampaign('trade-listing-sold');
    notify('Listing Sold',`${received?.name || listing.item.name} was purchased.`,{level:'medium',targetPlayer:listing.sellerCharacterId});
    return true;
  }
  function createLootTable(){
    const name = document.getElementById('gmLootTableName')?.value?.trim();
    if(!name) return false;
    const table = {
      id:api.uid('loot-table'),
      name,
      sourceType:document.getElementById('gmLootTableSource')?.value || 'Encounter',
      region:document.getElementById('gmLootTableRegion')?.value || '',
      levelRange:document.getElementById('gmLootTableLevel')?.value || '',
      entries:[],
      createdAt:now(),
      uniqueDrops:[],
      settings:{ partyScaled:true, difficultyScaled:true }
    };
    ecosystem().lootTables.push(table);
    ui.gmSelectedLootTableId = table.id;
    saveCampaign('loot-table-created');
    return true;
  }
  function rollLootTable(tableId, options = {}){
    const table = ecosystem()?.lootTables?.find(entry => entry.id === tableId);
    if(!table) return [];
    const difficulty = Math.max(.1,number(options.difficulty,1));
    const partyScale = Math.max(1,number(options.partyScale,campaignCharacters().length || 1));
    const results = [];
    array(table.entries).forEach(entry => {
      if(entry.unique && table.uniqueDrops.includes(entry.itemSlug)) return;
      const chance = Math.min(100,number(entry.chance,100) * Math.min(1.5,.75+difficulty*.25));
      if(Math.random()*100 > chance) return;
      const min = Math.max(1,number(entry.minQty,1));
      const max = Math.max(min,number(entry.maxQty,min));
      const baseQty = min + Math.floor(Math.random()*(max-min+1));
      const quantity = Math.max(1,Math.round(baseQty * (table.settings.partyScaled ? Math.max(1,partyScale/4) : 1)));
      const item = catalogSnapshot(entry.itemSlug,quantity);
      if(!item) return;
      results.push({item,quantity,source:`${table.sourceType}: ${table.name}`});
      if(entry.unique) table.uniqueDrops.push(entry.itemSlug);
    });
    results.forEach(result => ecosystem().partyLoot.unshift({
      id:api.uid('loot'),
      item:result.item,
      quantity:result.quantity,
      source:result.source,
      discoveredBy:'GM',
      status:'available',
      responses:{},
      createdAt:now(),
      distribution:null
    }));
    api.audit('loot-table-rolled',{characterId:'party',source:table.name,notes:`${results.length} result(s)`,gmOverride:true});
    saveCampaign('loot-table-rolled');
    if(results.length) notify('Party Loot Available',`${results.length} loot result${results.length === 1 ? '' : 's'} added to Party Loot.`,{level:'medium',partyWide:true});
    return results;
  }
  function createShop(){
    const name = document.getElementById('gmEcoShopName')?.value?.trim();
    if(!name) return false;
    const shop = {
      id:api.uid('shop'),
      name,
      image:'',
      description:document.getElementById('gmEcoShopDescription')?.value || '',
      type:document.getElementById('gmEcoShopType')?.value || 'General Goods',
      owner:document.getElementById('gmEcoShopOwner')?.value || '',
      location:document.getElementById('gmEcoShopLocation')?.value || '',
      region:document.getElementById('gmEcoShopRegion')?.value || '',
      openingHours:document.getElementById('gmEcoShopHours')?.value || 'GM controlled',
      acceptedCurrencies:api.CURRENCY.map(currency => currency.key),
      buyModifier:number(document.getElementById('gmEcoShopBuyMod')?.value,1),
      sellModifier:number(document.getElementById('gmEcoShopSellMod')?.value,.5),
      services:[],
      stock:[],
      currencyCopper:100000,
      restock:{ mode:document.getElementById('gmEcoShopRestock')?.value || 'Manual', days:0, lastRestockedAt:'' },
      requirements:{ reputation:'', faction:'', access:'' },
      visitorCharacterIds:campaignCharacters().map(entry => entry.id),
      status:'closed',
      visibility:'discovered',
      createdAt:now()
    };
    ecosystem().shops.push(shop);
    window.AsteriaWorld?.registerShopMarker?.(shop);
    api.audit('shop-created',{characterId:'GM',source:shop.name,notes:`${shop.location} / ${shop.region}`,gmOverride:true});
    saveCampaign('shop-created');
    return true;
  }
  function restockShop(shopId){
    const shop = ecosystem()?.shops?.find(entry => entry.id === shopId);
    if(!shop) return false;
    const candidates = catalogEntries().sort(() => Math.random()-.5).slice(0,8);
    candidates.forEach(entry => {
      const item = catalogSnapshot(entry.slug || entry.title,1);
      if(!item) return;
      const existing = array(shop.stock).find(line => slug(line.item?.catalogId || line.item?.name) === slug(item.catalogId || item.name));
      const quantity = Math.floor(Math.random()*4)+1;
      if(existing) existing.qty += quantity;
      else shop.stock.push({ item, qty:quantity, priceCopper:Math.max(1,Math.round(number(item.value,100)*number(shop.buyModifier,1))) });
    });
    shop.restock.lastRestockedAt = now();
    api.audit('shop-restocked',{characterId:'GM',source:shop.name,gmOverride:true});
    saveCampaign('shop-restocked');
    notify('Shop Restocked',`${shop.name} has new stock.`,{partyWide:true});
    return true;
  }
  function issueGMReward(){
    const recipients = Array.from(document.querySelectorAll('[data-gm-reward-character]:checked')).map(input => input.value);
    const destination = document.getElementById('gmEcoRewardDestination')?.value || 'character';
    const quantity = Math.max(1,number(document.getElementById('gmEcoRewardQty')?.value,1));
    const snapshot = catalogSnapshot(ui.gmSelectedCatalogId,quantity);
    if(!snapshot || destination !== 'party' && !recipients.length) return false;
    snapshot.quality = document.getElementById('gmEcoRewardQuality')?.value || 'Average';
    snapshot.condition = Math.max(0,Math.min(100,number(document.getElementById('gmEcoRewardCondition')?.value,100)));
    snapshot.identified = Boolean(document.getElementById('gmEcoRewardIdentified')?.checked);
    const note = document.getElementById('gmEcoRewardNote')?.value || '';
    if(note) snapshot.history.unshift({action:'GM note',at:now(),source:note});
    if(destination === 'party'){
      ecosystem().partyLoot.unshift({id:api.uid('loot'),item:snapshot,quantity,source:'GM Reward',discoveredBy:'GM',status:'available',responses:{},createdAt:now(),distribution:null});
    }else recipients.forEach(id => {
      if(destination === 'choice'){
        const record = campaignCharacter(id);
        record.pendingItemRewards = array(record.pendingItemRewards);
        record.pendingItemRewards.push({id:api.uid('reward'),campaignId:activeCampaign()?.id,campaignName:activeCampaign()?.name,item:clone(snapshot),message:note || 'The GM awarded an item.',status:'pending',createdAt:now()});
        api.persistCharacter(id,'gm-reward-choice');
      }else api.add(snapshot,id,{forceNew:true,source:'GM Reward',notes:note,reason:'gm-reward'});
    });
    api.audit('gm-loot-reward',{characterId:destination === 'party' ? 'party' : recipients.join(','),itemId:snapshot.id,itemName:snapshot.name,quantity,source:'GM Reward',gmOverride:true,notes:note});
    saveCampaign('gm-loot-reward');
    notify('Loot Awarded',`${snapshot.name} was awarded.`,{level:'medium',partyWide:destination === 'party'});
    return true;
  }
  function createBag(){
    const record = activeCharacter();
    if(!record) return;
    const name = window.prompt?.('Bag name:','New Bag') || 'New Bag';
    const type = window.prompt?.('Bag type:','General Backpack') || 'General Backpack';
    record.bags.push(api.normalizeBag({id:api.uid('bag'),name,type,rows:4,cols:5,maxWeight:0,slots:[]},record.bags.length));
    api.audit('bag-created',{characterId:activeId(),source:name,notes:type});
    api.persistCharacter(activeId(),'bag-created');
    renderPlayer();
  }
  function createStorage(){
    const record = activeCharacter();
    if(!record) return;
    const name = window.prompt?.('Storage name:','Character Chest') || 'Character Chest';
    const storage = {id:api.uid('storage'),name,type:'Character Chest',maxSlots:100,maxWeight:0,shared:false,permissions:{owners:[activeId()]},itemIds:[],lockedSections:[],activity:[]};
    record.storages.push(storage);
    ui.selectedStorageId = storage.id;
    api.persistCharacter(activeId(),'storage-created');
    renderPlayer();
  }
  function openAddItemPicker(){
    if(typeof api.openItemPicker === 'function') api.openItemPicker({});
    else notify('Item Picker','The Item Compendium picker is not available.',{type:'warning'});
  }
  function exportAudit(){
    const data = JSON.stringify(ecosystem()?.auditLog || [],null,2);
    const blob = new Blob([data],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug(activeCampaign()?.name || 'campaign')}-inventory-audit.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function closeInfo(){ window.closeAsteriaInfoModal?.(); }

  function bindRoot(root){
    root.addEventListener('dragstart', event => {
      const card = event.target.closest('[data-item-card]');
      if(!card || !event.dataTransfer) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/asteria-item-id', card.dataset.itemCard);
      card.classList.add('dragging');
    });
    root.addEventListener('dragend', event => {
      event.target.closest('[data-item-card]')?.classList.remove('dragging');
      root.querySelectorAll('.drop-ready').forEach(element => element.classList.remove('drop-ready'));
    });
    root.addEventListener('dragover', event => {
      const target = event.target.closest('[data-equipment-slot],[data-bag-drop],[data-storage-drop]');
      if(!target) return;
      event.preventDefault();
      if(event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      root.querySelectorAll('.drop-ready').forEach(element => element.classList.remove('drop-ready'));
      target.classList.add('drop-ready');
    });
    root.addEventListener('drop', event => {
      const target = event.target.closest('[data-equipment-slot],[data-bag-drop],[data-storage-drop]');
      const itemId = event.dataTransfer?.getData('text/asteria-item-id');
      if(!target || !itemId) return;
      event.preventDefault();
      target.classList.remove('drop-ready');
      let moved = false;
      if(target.dataset.equipmentSlot){
        moved = Boolean(api.equipItem?.(itemId, target.dataset.equipmentSlot, activeId()));
      }else if(target.dataset.storageDrop){
        moved = api.moveToStorage(itemId, target.dataset.storageDrop, activeId());
      }else if(target.dataset.bagDrop){
        const bag = activeCharacter()?.bags?.find(candidate => candidate.id === target.dataset.bagDrop);
        if(bag){
          const max = Math.max(1, number(bag.rows,4) * number(bag.cols,4));
          const used = new Set(array(bag.slots).filter(slot => array(slot.items).length).map(slot => number(slot.slot)));
          let slot = 1;
          while(slot <= max && used.has(slot)) slot += 1;
          if(slot <= max) moved = Boolean(api.placeInBag?.(itemId, bag.id, slot, activeId()));
        }
      }
      if(!moved) notify('Item Not Moved', 'The item is incompatible, restricted, or the destination is full.', { type:'warning' });
      renderPlayer();
    });
    root.addEventListener('input', event => {
      const filter = event.target.dataset.ecoFilter;
      if(filter){
        ui[filter] = event.target.value;
        clearTimeout(root.__filterTimer);
        root.__filterTimer = setTimeout(renderPlayer,80);
      }
      if(event.target.matches('[data-gm-catalog-search]')){
        ui.gmCatalogQuery = event.target.value;
        clearTimeout(root.__catalogTimer);
        root.__catalogTimer = setTimeout(renderGM,100);
      }
    });
    root.addEventListener('change', event => {
      if(event.target.matches('[data-gm-character-select]')){ui.gmSelectedCharacterId=event.target.value;renderGM();}
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if(!button) return;
      if(button.dataset.playerTab){ui.playerTab=button.dataset.playerTab;renderPlayer();return;}
      if(button.dataset.gmTab){ui.gmTab=button.dataset.gmTab;renderGM();return;}
      if(button.dataset.ecoView){ui.view=button.dataset.ecoView;renderPlayer();return;}
      if(button.hasAttribute('data-eco-add-item')){openAddItemPicker();return;}
      if(button.hasAttribute('data-eco-filter-favourites')){ui.query='';ui.type='all';ui.rarity='all';ui.location='all';const items=api.filterItems(api.items(activeId()),{favourite:true},ui.sort);root.querySelector('.ecosystem-item-gallery').innerHTML=items.map(item=>itemCard(item)).join('')||emptyState('No favourites','Favourite an item from its detail window.');return;}
      if(button.dataset.itemOpen){openItemDetails(button.dataset.itemOpen,ui.gmSelectedCharacterId||activeId());return;}
      if(button.hasAttribute('data-eco-create-bag')){createBag();return;}
      if(button.hasAttribute('data-eco-create-storage')){createStorage();return;}
      if(button.dataset.bagRename){const record=activeCharacter();const bag=record?.bags.find(item=>item.id===button.dataset.bagRename);if(bag){bag.name=window.prompt?.('Rename bag:',bag.name)||bag.name;api.persistCharacter(activeId(),'bag-renamed');renderPlayer();}return;}
      if(button.dataset.bagToggle){const bag=activeCharacter()?.bags.find(item=>item.id===button.dataset.bagToggle);if(bag){bag.collapsed=!bag.collapsed;api.persistCharacter(activeId(),'bag-toggled');renderPlayer();}return;}
      if(button.dataset.storageSelect){ui.selectedStorageId=button.dataset.storageSelect;renderPlayer();return;}
      if(button.dataset.storageRetrieve){api.moveFromStorage(button.dataset.storageRetrieve);renderPlayer();return;}
      if(button.dataset.lootChoice){const [id,choice]=button.dataset.lootChoice.split(':');chooseLoot(id,choice);return;}
      if(button.dataset.lootInspect){const loot=ecosystem()?.partyLoot.find(item=>item.id===button.dataset.lootInspect);if(loot)openLootDetails(loot);return;}
      if(button.dataset.lootDistribute){const select=root.querySelector(`[data-loot-recipient="${CSS.escape(button.dataset.lootDistribute)}"]`);distributeLoot(button.dataset.lootDistribute,select?.value,'direct');return;}
      if(button.dataset.lootRandom){distributeLoot(button.dataset.lootRandom,'','need-greed');return;}
      if(button.hasAttribute('data-loot-sell-all')){sellAllPartyLoot();return;}
      if(button.dataset.shopBuy){const [shopId,index]=button.dataset.shopBuy.split(':');const qty=root.querySelector(`[data-shop-qty="${CSS.escape(button.dataset.shopBuy)}"]`)?.value;buyShopItem(shopId,number(index),qty);return;}
      if(button.dataset.shopSell){const [shopId,itemId]=button.dataset.shopSell.split(':');sellShopItem(shopId,itemId);return;}
      if(button.hasAttribute('data-trade-create')){createDirectTrade();renderPlayer();return;}
      if(button.dataset.tradeUpdate){updateTradeOffer(button.dataset.tradeUpdate,root);renderPlayer();return;}
      if(button.dataset.tradeConfirm){confirmTrade(button.dataset.tradeConfirm);renderPlayer();return;}
      if(button.dataset.tradeCancel){const trade=ecosystem()?.directTrades.find(item=>item.id===button.dataset.tradeCancel);if(trade){trade.status='cancelled';trade.cancelledAt=now();saveCampaign('trade-cancelled');}return;}
      if(button.hasAttribute('data-listing-create')){createListing();renderPlayer();return;}
      if(button.dataset.listingCancel){cancelListing(button.dataset.listingCancel);renderPlayer();return;}
      if(button.dataset.listingBuy){buyListing(button.dataset.listingBuy);renderPlayer();return;}
      if(button.hasAttribute('data-wishlist-add')){const value=document.getElementById('ecoWishlistSearch')?.value?.trim();if(value&&!activeCharacter().wishlist.includes(value)){activeCharacter().wishlist.push(value);api.persistCharacter(activeId(),'wishlist-add');renderPlayer();}return;}
      if(button.dataset.wishlistRemove){activeCharacter().wishlist=activeCharacter().wishlist.filter(value=>value!==button.dataset.wishlistRemove);api.persistCharacter(activeId(),'wishlist-remove');renderPlayer();return;}
      if(button.dataset.gmCatalogSelect){ui.gmSelectedCatalogId=button.dataset.gmCatalogSelect;renderGM();return;}
      if(button.hasAttribute('data-gm-reward-preview')){issueGMReward();renderGM();return;}
      if(button.hasAttribute('data-loot-table-create')){createLootTable();renderGM();return;}
      if(button.dataset.lootTableSelect){ui.gmSelectedLootTableId=button.dataset.lootTableSelect;renderGM();return;}
      if(button.dataset.lootTableRoll){rollLootTable(button.dataset.lootTableRoll);renderGM();return;}
      if(button.hasAttribute('data-loot-entry-add')){const table=ecosystem()?.lootTables.find(item=>item.id===ui.gmSelectedLootTableId);const itemSlug=document.getElementById('gmLootEntryItem')?.value;if(table&&itemSlug){const entry=catalogEntry(itemSlug);table.entries.push({itemSlug,itemName:entry?.title||itemSlug,chance:number(document.getElementById('gmLootEntryChance')?.value,100),weight:1,minQty:number(document.getElementById('gmLootEntryMin')?.value,1),maxQty:number(document.getElementById('gmLootEntryMax')?.value,1),unique:Boolean(document.getElementById('gmLootEntryUnique')?.checked)});saveCampaign('loot-table-entry-added');}return;}
      if(button.dataset.lootEntryRemove!==undefined){const table=ecosystem()?.lootTables.find(item=>item.id===ui.gmSelectedLootTableId);if(table){table.entries.splice(number(button.dataset.lootEntryRemove),1);saveCampaign('loot-table-entry-removed');}return;}
      if(button.hasAttribute('data-loot-generator-roll')){const tableId=document.getElementById('gmLootRollTable')?.value;rollLootTable(tableId,{difficulty:document.getElementById('gmLootDifficulty')?.value,partyScale:document.getElementById('gmLootPartyScale')?.value});renderGM();return;}
      if(button.hasAttribute('data-shop-create')){createShop();renderGM();return;}
      if(button.dataset.shopAdminOpen){const shop=ecosystem()?.shops.find(item=>item.id===button.dataset.shopAdminOpen);if(shop){shop.status=shop.status==='open'?'closed':'open';activeCampaign().activeShop=shop.status==='open'?shop:null;saveCampaign('shop-status-changed');}return;}
      if(button.dataset.shopAdminRestock){restockShop(button.dataset.shopAdminRestock);return;}
      if(button.dataset.shopAdminStock){const shop=ecosystem()?.shops.find(item=>item.id===button.dataset.shopAdminStock);const snapshot=catalogSnapshot(ui.gmSelectedCatalogId,1);if(shop&&snapshot){shop.stock.push({item:snapshot,qty:1,priceCopper:Math.max(1,snapshot.value||100)});saveCampaign('shop-stock-added');}else notify('Select Item','Select an item in Reward Loot first.',{type:'warning'});return;}
      if(button.dataset.gmItemRemove){const [characterId,itemId]=button.dataset.gmItemRemove.split(':');api.remove(itemId,characterId,null,{action:'gm-item-removed',source:'GM Inventory Tool',gmOverride:true});renderGM();return;}
      if(button.dataset.gmTradeRemove){cancelListing(button.dataset.gmTradeRemove,true);renderGM();return;}
      if(button.hasAttribute('data-audit-export')){exportAudit();return;}
    });
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('#asteriaInfoModal button');
    if(!button) return;
    const id = button.dataset.detailEquip || button.dataset.detailUse || button.dataset.detailSplit || button.dataset.detailBag || button.dataset.detailStore || button.dataset.detailRetrieve || button.dataset.detailFavourite || button.dataset.detailLock || button.dataset.detailPartyLoot || button.dataset.detailDrop;
    if(!id) return;
    if(button.dataset.detailEquip){
      const item = api.find(id);
      if(item?.equipped) api.unequipItem?.(id);
      else api.equipItem?.(id,document.getElementById('ecoDetailEquipSlot')?.value);
    }else if(button.dataset.detailUse) window.useInventoryItem?.(id);
    else if(button.dataset.detailSplit) api.splitStack(id,document.getElementById('ecoDetailSplitQty')?.value);
    else if(button.dataset.detailBag){
      const bagId=document.getElementById('ecoDetailBag')?.value;
      const record=activeCharacter();
      const bag=record?.bags.find(item=>item.id===bagId);
      const used=new Set(array(bag?.slots).filter(slot=>array(slot.items).length).map(slot=>number(slot.slot)));
      let slot=1;while(used.has(slot)&&slot<=bag.maxSlots)slot++;
      if(slot<=bag.maxSlots) api.placeInBag?.(id,bagId,slot);
    }else if(button.dataset.detailStore) api.moveToStorage(id,document.getElementById('ecoDetailStorage')?.value);
    else if(button.dataset.detailRetrieve) api.moveFromStorage(id);
    else if(button.dataset.detailFavourite) api.setFlag(id,'favourite');
    else if(button.dataset.detailLock) api.setFlag(id,'locked');
    else if(button.dataset.detailPartyLoot) addToPartyLoot(id);
    else if(button.dataset.detailDrop) api.remove(id,activeId(),null,{action:'drop',source:'Character Inventory'});
    closeInfo();
    renderPlayer();
  });

  function onSharedChange(){
    if(document.getElementById('player')?.classList.contains('show')) renderPlayer();
    if(document.getElementById('gm')?.classList.contains('show')) renderGM();
  }
  function boot(){
    migrateSharedState();
    ensurePlayerShell();
    ensureGMShell();
    renderPlayer();
    renderGM();
    window.AsteriaViewHooks?.afterPlayerLoad?.('item-ecosystem-player', () => setTimeout(renderPlayer,40));
    window.AsteriaViewHooks?.afterGMRender?.('item-ecosystem-gm', () => setTimeout(renderGM,40));
    window.addEventListener('asteria:campaigns-refreshed',onSharedChange);
    window.addEventListener('asteria:campaign-realtime',onSharedChange);
    window.addEventListener('asteria:character-realtime',onSharedChange);
    window.addEventListener('asteria:item-ecosystem-realtime',onSharedChange);
    window.addEventListener('asteria:inventory-changed',onSharedChange);
    window.addEventListener('asteria:item-campaign-changed',onSharedChange);
  }

  window.AsteriaItemEcosystem = {
    version:VERSION,
    renderPlayer,
    renderGM,
    openItemDetails,
    addToPartyLoot,
    chooseLoot,
    distributeLoot,
    rollLootTable,
    createShop,
    restockShop,
    buyShopItem,
    sellShopItem,
    confirmTrade,
    buyListing,
    state:() => clone(ui)
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded',boot) : boot();
})();
