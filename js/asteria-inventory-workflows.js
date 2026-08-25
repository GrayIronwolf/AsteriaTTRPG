/* Asteria equipment, loot reward, and campaign shop workflows.
   Extends the shared inventory API without creating another inventory model. */
(function(){
  const api = window.AsteriaInventory = window.AsteriaInventory || {};
  const pricing = window.AsteriaMarketPricing;
  const COINS = [
    ['royal_platinum', 10000000000],
    ['royal_crown', 100000000],
    ['platinum_crown', 1000000],
    ['gold', 10000],
    ['silver', 100],
    ['copper', 1]
  ];
  const ALL_SLOTS = [
    'Head','Shoulders','Chest','Torso','Back','Waist','Hands','Feet',
    'Main Weapon','Off Weapon','Secondary Weapon','Quiver','Shield',
    'Necklace','Ring 1','Ring 2','Trinket','Charm',
    'Potion / Poison 1','Potion / Poison 2','Potion / Poison 3','Potion / Poison 4'
  ];
  let pickerContext = null;
  let rewardPickerEntry = null;
  let shopPickerEntry = null;
  let shopDraftStock = [];
  let dragPayload = null;
  let activeRewardId = '';
  let activeShopId = '';
  const resolvingRewardIds = new Set();
  const shopCart = new Map();

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[character]);
  }
  function slug(value){
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function array(value){
    if(Array.isArray(value)) return value;
    if(value === undefined || value === null || value === '') return [];
    return [value];
  }
  function clone(value){
    try{return JSON.parse(JSON.stringify(value));}catch(error){return value;}
  }
  function currentId(){
    return api.currentId?.() || window.currentPlayerId?.() || window.session?.character || window.selected || '';
  }
  function character(id = currentId()){
    return window.chars?.[id] || null;
  }
  function activeCampaign(){
    return window.campaigns?.[Number(window.activeCampaign || 0)] || window.campaigns?.[0] || null;
  }
  function campaignCharacterIds(campaign = activeCampaign()){
    if(!campaign) return [];
    const playerIds = Object.values(campaign.players || {}).flatMap(player => array(player?.characterIds));
    return Array.from(new Set([
      ...array(campaign.party),
      ...Object.keys(campaign.characters || {}),
      ...Object.keys(campaign.playerCharacterLinks || {}),
      ...playerIds
    ])).filter(id => window.chars?.[id] || campaign.characters?.[id]);
  }
  function getCampaignCharacter(id, campaign = activeCampaign()){
    return window.chars?.[id] || campaign?.characters?.[id] || null;
  }
  function isOwnedCharacter(id, item = character(id)){
    const user = window.AsteriaFirebase?.getUser?.();
    const account = window.session?.account || window.session?.uid || window.session?.user;
    const owned = array(window.accountUsers?.[account]?.characters);
    return owned.includes(id) || Boolean(user?.uid && item?.ownerUid === user.uid);
  }
  function campaignsForCharacter(id){
    return array(window.campaigns).filter(campaign => campaignCharacterIds(campaign).includes(id));
  }
  function persistCharacter(id, reason = 'inventory-workflow'){
    const item = character(id);
    if(!item) return Promise.resolve(false);
    const writes = [];
    window.saveAccountState?.();
    window.saveAsteriaState?.();
    window.AsteriaDataSync?.scheduleSave?.(reason);
    if(isOwnedCharacter(id, item) && window.AsteriaFirebase?.saveCharacter){
      writes.push(Promise.resolve(window.AsteriaFirebase.saveCharacter(id, item)));
    }
    campaignsForCharacter(id).forEach(campaign => {
      if(campaign?.id && window.AsteriaFirebase?.saveCampaignCharacter){
        writes.push(Promise.resolve(window.AsteriaFirebase.saveCampaignCharacter(campaign.id, id, item)));
      }
    });
    return Promise.all(writes).then(results => results.every(result => result !== false));
  }
  function persistCampaign(campaign, reason = 'campaign-inventory-workflow'){
    if(!campaign?.id) return;
    window.saveAsteriaState?.();
    window.AsteriaFirebase?.saveCampaign?.(campaign.id, campaign);
    window.AsteriaDataSync?.scheduleSave?.(reason);
  }

  function catalogEntries(){
    const source = window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries || window.ASTERIA_CONTENT_MANIFEST?.entries || [];
    const custom = array(window.ASTERIA_CUSTOM_ITEMS).map(item => ({
      ...item,
      title:item.title || item.name,
      type:'item',
      domain:'items',
      category:item.category || item.type || 'Custom Items',
      summary:item.summary || item.description || item.desc || 'Custom campaign item.',
      metadata:{
        ...(item.metadata || {}),
        type:'item',
        category:item.category || item.type || 'Custom Items',
        itemClass:item.itemClass || item.rarity || 'Common',
        image:item.image || ''
      }
    }));
    const seen = new Set();
    return [...array(source), ...custom].filter(entry => {
      const type = String(entry.type || entry.domain || entry.metadata?.type || '').toLowerCase();
      const path = String(entry.path || entry.sourcePath || '').toLowerCase();
      return type === 'item' || type === 'items' || path.includes('/items/');
    }).filter(entry => !/index$/i.test(String(entry.title || ''))).filter(entry => {
      const key = slug(entry.slug || entry.title || entry.name);
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function entryBySlug(value){
    const key = slug(value);
    return catalogEntries().find(entry => slug(entry.slug || entry.title) === key) || null;
  }
  function entryImage(entry){
    return entry?.imagePath || entry?.image || entry?.metadata?.image || entry?.metadata?.images?.card || '';
  }
  function itemSnapshot(entry, quantity = 1){
    const meta = entry?.metadata || {};
    const rarity = meta.itemClass || meta.item_class || meta.rarity || entry?.rarity || 'Common';
    const type = meta.itemType || meta.item_type || meta.type || entry?.subcategory || entry?.category || 'Item';
    const snapshot = {
      id:slug(entry?.slug || entry?.title || `item-${Date.now()}`),
      slug:slug(entry?.slug || entry?.title),
      name:entry?.title || entry?.name || 'Unknown Item',
      type:String(type),
      category:entry?.category || meta.category || '',
      itemClass:String(rarity),
      rarity:String(rarity),
      qty:Math.max(1, Number(quantity || 1)),
      desc:entry?.summary || meta.description || 'Open the item page for full information.',
      image:entryImage(entry),
      compendiumPath:entry?.route || entry?.path || entry?.sourcePath || '',
      marketValue:entry?.marketValue ?? meta.marketValue ?? meta.market_value,
      marketPrice:entry?.marketPrice ?? meta.marketPrice ?? meta.market_price
    };
    snapshot.allowedSlots = inferSlots(snapshot);
    snapshot.slot = snapshot.allowedSlots[0] || null;
    return pricing ? pricing.normalizeMarketPricing(snapshot, { legacy:true, removeLegacy:true, migratedRecord:true }) : snapshot;
  }
  function inferSlots(item){
    const explicit = array(item?.allowedSlots || item?.equipmentSlots || item?.metadata?.equipmentSlots).filter(slot => ALL_SLOTS.includes(slot));
    if(explicit.length) return explicit;
    const text = `${item?.name || ''} ${item?.type || ''} ${item?.category || ''} ${item?.subcategory || ''}`.toLowerCase();
    if(/potion|poison|elixir|draught|vial/.test(text)) return ALL_SLOTS.filter(slot => slot.startsWith('Potion / Poison'));
    if(/quiver|ammunition|arrow|bolt/.test(text)) return ['Quiver'];
    if(/shield/.test(text)) return ['Shield','Off Weapon'];
    if(/bow|crossbow|rifle|ranged/.test(text)) return ['Secondary Weapon'];
    if(/weapon|sword|axe|dagger|mace|spear|staff|wand/.test(text)) return ['Main Weapon','Off Weapon','Secondary Weapon'];
    if(/helmet|helm|hood|head/.test(text)) return ['Head'];
    if(/shoulder|pauldron/.test(text)) return ['Shoulders'];
    if(/breastplate|chest/.test(text)) return ['Chest'];
    if(/torso|armour|armor|robe/.test(text)) return ['Torso','Chest'];
    if(/cloak|cape|back/.test(text)) return ['Back'];
    if(/belt|waist/.test(text)) return ['Waist'];
    if(/glove|gauntlet|hand/.test(text)) return ['Hands'];
    if(/boot|shoe|feet/.test(text)) return ['Feet'];
    if(/necklace|amulet/.test(text)) return ['Necklace'];
    if(/ring/.test(text)) return ['Ring 1','Ring 2'];
    if(/trinket/.test(text)) return ['Trinket'];
    if(/charm/.test(text)) return ['Charm'];
    return [];
  }
  function ensureInventory(id = currentId()){
    window.ensureWebInventory?.(id);
    const item = character(id);
    if(!item) return null;
    item.inventory = array(item.inventory);
    item.bags = array(item.bags);
    return item;
  }
  function findItem(itemId, id = currentId()){
    return ensureInventory(id)?.inventory?.find(item => item.id === itemId || item.slug === itemId || item.name === itemId) || null;
  }
  function removeBagReferences(item, characterRecord){
    array(characterRecord?.bags).forEach(bag => {
      array(bag.slots).forEach(slot => {
        slot.items = array(slot.items).filter(reference => reference.id !== item.id);
      });
    });
    array(characterRecord?.storages).forEach(storage => {
      storage.itemIds = array(storage.itemIds).filter(itemId => itemId !== item.id);
    });
  }
  function firstEmptyBagSlot(characterRecord){
    for(const bag of array(characterRecord?.bags)){
      const total = Math.max(1, Number(bag.rows || 4) * Number(bag.cols || 4));
      bag.slots = array(bag.slots);
      for(let index = 1; index <= total; index++){
        let slotRecord = bag.slots.find(slot => Number(slot.slot) === index);
        if(!slotRecord){
          slotRecord = {slot:index, items:[]};
          bag.slots.push(slotRecord);
        }
        if(!array(slotRecord.items).length) return {bag, slotRecord};
      }
    }
    return null;
  }
  function placeInBag(itemId, bagId, slotNumber, id = currentId(), quantity){
    const record = ensureInventory(id);
    const item = findItem(itemId, id);
    const bag = record?.bags?.find(candidate => candidate.id === bagId);
    if(!record || !item || !bag) return false;
    bag.slots = array(bag.slots);
    let slotRecord = bag.slots.find(slot => Number(slot.slot) === Number(slotNumber));
    if(!slotRecord){
      slotRecord = {slot:Number(slotNumber), items:[]};
      bag.slots.push(slotRecord);
    }
    if(array(slotRecord.items).length && !slotRecord.items.some(reference => reference.id === item.id)){
      window.toast?.('That bag slot is already occupied.');
      return false;
    }
    removeBagReferences(item, record);
    item.equipped = false;
    item.equippedSlot = '';
    item.location = 'bag';
    item.bagId = bag.id;
    item.storageId = '';
    const existing = array(slotRecord.items).find(reference => reference.id === item.id);
    if(existing) existing.qty = Math.max(1, Number(quantity || item.qty || existing.qty || 1));
    else slotRecord.items = [{id:item.id, qty:Math.max(1, Number(quantity || item.qty || 1))}];
    persistCharacter(id, 'inventory-bag-placement');
    window.renderInventory?.();
    return true;
  }
  function equipItem(itemId, slot, id = currentId(), options = {}){
    const record = ensureInventory(id);
    const item = findItem(itemId, id);
    if(!record || !item || !slot) return false;
    const allowed = inferSlots(item);
    if(!allowed.includes(slot)){
      window.toast?.(`${item.name} cannot be equipped in ${slot}.`);
      return false;
    }
    const replaced = record.inventory.find(candidate => candidate.equipped && (candidate.equippedSlot || candidate.slot) === slot && candidate.id !== item.id);
    const replacementDestination = replaced ? firstEmptyBagSlot(record) : null;
    if(replaced && !replacementDestination){
      window.toast?.(`No empty bag slot is available for ${replaced.name}.`);
      return false;
    }
    if(replaced){
      replaced.equipped = false;
      replaced.equippedSlot = '';
      removeBagReferences(replaced, record);
      replacementDestination.slotRecord.items = [{id:replaced.id, qty:Math.max(1, Number(replaced.qty || 1))}];
    }
    removeBagReferences(item, record);
    item.equipped = true;
    item.equippedSlot = slot;
    item.location = 'equipment';
    item.bagId = '';
    item.storageId = '';
    if(options.persist !== false) persistCharacter(id, 'inventory-equip');
    if(options.render !== false) window.renderInventory?.();
    if(options.notify !== false) window.toast?.(`${item.name} equipped in ${slot}.`);
    return true;
  }
  function unequipItem(itemId, id = currentId()){
    const record = ensureInventory(id);
    const item = findItem(itemId, id);
    if(!record || !item) return false;
    const destination = firstEmptyBagSlot(record);
    if(!destination){
      window.toast?.(`No empty bag slot is available for ${item.name}.`);
      return false;
    }
    item.equipped = false;
    item.equippedSlot = '';
    removeBagReferences(item, record);
    destination.slotRecord.items = [{id:item.id, qty:Math.max(1, Number(item.qty || 1))}];
    item.location = 'bag';
    item.bagId = destination.bag.id;
    item.storageId = '';
    persistCharacter(id, 'inventory-unequip');
    window.renderInventory?.();
    return true;
  }
  function addSnapshot(snapshot, id = currentId(), bagId, slotNumber, options = {}){
    const record = ensureInventory(id);
    if(!record || !snapshot) return null;
    let item = record.inventory.find(existing => existing.id === snapshot.id && !existing.equipped);
    const quantity = Math.max(1, Number(snapshot.qty || 1));
    let destination = null;
    if(bagId && slotNumber){
      const bag = record.bags.find(candidate => candidate.id === bagId);
      if(!bag) return null;
      bag.slots = array(bag.slots);
      let slotRecord = bag.slots.find(candidate => Number(candidate.slot) === Number(slotNumber));
      if(!slotRecord){
        slotRecord = {slot:Number(slotNumber), items:[]};
        bag.slots.push(slotRecord);
      }
      if(array(slotRecord.items).length && !slotRecord.items.some(reference => reference.id === item?.id)){
        window.toast?.('That bag slot is already occupied.');
        return null;
      }
      destination = {bag, slotRecord};
    }else if(item){
      for(const bag of record.bags){
        const slotRecord = array(bag.slots).find(slot => array(slot.items).some(reference => reference.id === item.id));
        if(slotRecord){
          destination = {bag, slotRecord};
          break;
        }
      }
      destination = destination || firstEmptyBagSlot(record);
    }else{
      destination = firstEmptyBagSlot(record);
    }
    if(!destination){
      window.toast?.('No empty bag slot is available for that item.');
      return null;
    }
    if(item){
      item.qty = Number(item.qty || 0) + quantity;
    }else{
      item = clone(snapshot);
      if(record.inventory.some(existing => existing.id === item.id)) item.id = `${item.id}-${Date.now()}`;
      record.inventory.push(item);
    }
    removeBagReferences(item, record);
    destination.slotRecord.items = [{id:item.id, qty:Math.max(1, Number(item.qty || quantity))}];
    if(options.persist !== false) persistCharacter(id, 'inventory-add');
    if(options.render !== false) window.renderInventory?.();
    return item;
  }

  function ensureModal(){
    let modal = document.getElementById('asteriaWorkflowModal');
    if(modal) return modal;
    modal = document.createElement('div');
    modal.id = 'asteriaWorkflowModal';
    modal.className = 'asteria-workflow-backdrop';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <section class="asteria-workflow-modal" role="dialog" aria-modal="true">
        <header><div><p class="eyebrow" id="asteriaWorkflowEyebrow">Asteria</p><h2 id="asteriaWorkflowTitle">Window</h2></div><button type="button" class="asteria-workflow-close" aria-label="Close">&times;</button></header>
        <div id="asteriaWorkflowBody" class="asteria-workflow-body"></div>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelector('.asteria-workflow-close').addEventListener('click', closeModal);
    modal.addEventListener('mousedown', event => { if(event.target === modal) closeModal(); });
    return modal;
  }
  function openModal(title, eyebrow, content, className = ''){
    const modal = ensureModal();
    modal.querySelector('#asteriaWorkflowTitle').textContent = title;
    modal.querySelector('#asteriaWorkflowEyebrow').textContent = eyebrow;
    modal.querySelector('#asteriaWorkflowBody').innerHTML = content;
    modal.querySelector('.asteria-workflow-modal').className = `asteria-workflow-modal ${className}`.trim();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    return modal;
  }
  function closeModal(){
    const modal = document.getElementById('asteriaWorkflowModal');
    modal?.classList.remove('show');
    modal?.setAttribute('aria-hidden', 'true');
  }
  function itemCard(entry, action, label){
    const rarity = entry.metadata?.itemClass || entry.metadata?.item_class || entry.metadata?.rarity || 'Common';
    const image = entryImage(entry);
    return `<button type="button" class="workflow-item-card" data-workflow-${action}="${esc(entry.slug || slug(entry.title))}">
      <span class="workflow-rarity">${esc(rarity)}</span>
      <span class="workflow-item-image">${image ? `<img src="${esc(image)}" alt="">` : esc(String(entry.title || '?').charAt(0))}</span>
      <b>${esc(entry.title)}</b><small>${esc(label)}</small>
    </button>`;
  }
  function pickerResults(query = '', options = {}){
    const term = String(query).trim().toLowerCase();
    const equipSlot = options.equipSlot || '';
    return catalogEntries().filter(entry => !equipSlot || inferSlots(itemSnapshot(entry)).includes(equipSlot)).filter(entry => !term || [
      entry.title, entry.category, entry.subcategory, array(entry.tags).join(' '),
      entry.metadata?.itemClass, entry.metadata?.item_class, entry.metadata?.itemType
    ].join(' ').toLowerCase().includes(term)).slice(0, 120);
  }
  function renderItemPicker(query = ''){
    const modal = openModal('Item Compendium', 'Inventory Item Picker', `
      <div class="workflow-search-row"><input id="workflowItemSearch" type="search" value="${esc(query)}" placeholder="Search items, categories, or rarity..."></div>
      <div id="workflowItemResults" class="workflow-item-grid"></div>
    `);
    const draw = value => {
      modal.querySelector('#workflowItemResults').innerHTML = pickerResults(value, {equipSlot:pickerContext?.equipSlot}).map(entry => itemCard(entry, 'pick-item', pickerContext?.equipSlot ? `Equip to ${pickerContext.equipSlot}` : 'Add to inventory')).join('') || '<p>No compatible matching items found.</p>';
      modal.querySelectorAll('[data-workflow-pick-item]').forEach(button => button.addEventListener('click', () => choosePickerItem(button.dataset.workflowPickItem)));
    };
    const input = modal.querySelector('#workflowItemSearch');
    input.addEventListener('input', () => draw(input.value));
    draw(query);
    input.focus();
  }
  function openItemPicker(context = {}){
    pickerContext = Object.assign({}, context);
    renderItemPicker();
    return true;
  }
  function choosePickerItem(entrySlug){
    const entry = entryBySlug(entrySlug);
    if(!entry) return;
    const snapshot = itemSnapshot(entry, 1);
    if(pickerContext?.equipSlot && !inferSlots(snapshot).includes(pickerContext.equipSlot)){
      window.toast?.(`${snapshot.name} cannot be equipped in ${pickerContext.equipSlot}.`);
      return;
    }
    const item = addSnapshot(snapshot, currentId(), pickerContext?.bagId, pickerContext?.slotNo);
    if(item && pickerContext?.equipSlot) equipItem(item.id, pickerContext.equipSlot, currentId());
    if(item) closeModal();
  }

  function bindDragAndDrop(){
    document.addEventListener('dragstart', event => {
      const source = event.target.closest('[data-inventory-drag-item]');
      if(!source) return;
      dragPayload = {
        itemId:source.dataset.inventoryDragItem,
        bagId:source.dataset.bagId || '',
        slotNumber:Number(source.dataset.bagSlot || 0)
      };
      event.dataTransfer?.setData('text/plain', JSON.stringify(dragPayload));
      event.dataTransfer && (event.dataTransfer.effectAllowed = 'move');
      source.classList.add('dragging');
    });
    document.addEventListener('dragend', event => {
      event.target.closest('[data-inventory-drag-item]')?.classList.remove('dragging');
      document.querySelectorAll('.inventory-drag-over').forEach(element => element.classList.remove('inventory-drag-over'));
    });
    document.addEventListener('dragover', event => {
      const target = event.target.closest('[data-equipment-slot],[data-bag-id][data-bag-slot]');
      if(!target) return;
      event.preventDefault();
      target.classList.add('inventory-drag-over');
    });
    document.addEventListener('dragleave', event => event.target.closest('.inventory-drag-over')?.classList.remove('inventory-drag-over'));
    document.addEventListener('drop', event => {
      const target = event.target.closest('[data-equipment-slot],[data-bag-id][data-bag-slot]');
      if(!target) return;
      event.preventDefault();
      target.classList.remove('inventory-drag-over');
      let payload = dragPayload;
      try{ payload = JSON.parse(event.dataTransfer?.getData('text/plain') || '') || payload; }catch(error){}
      if(!payload?.itemId) return;
      if(target.dataset.equipmentSlot) equipItem(payload.itemId, target.dataset.equipmentSlot);
      else placeInBag(payload.itemId, target.dataset.bagId, Number(target.dataset.bagSlot));
    });
  }

  function rewardCharactersHtml(campaign){
    return campaignCharacterIds(campaign).map(id => {
      const item = getCampaignCharacter(id, campaign);
      return `<label class="workflow-check-card"><input type="checkbox" value="${esc(id)}" data-reward-character><span><b>${esc(item?.name || id)}</b><small>${esc(item?.race || '')} / ${esc(item?.klass || '')}</small></span></label>`;
    }).join('') || '<p>No linked campaign characters are available.</p>';
  }
  function rewardSelectedHtml(){
    if(!rewardPickerEntry) return '<p class="muted">Search the Item Compendium and select an item.</p>';
    return itemCard(rewardPickerEntry, 'reward-selected', 'Selected reward');
  }
  function renderRewardSearch(query = ''){
    const host = document.getElementById('gmRewardSearchResults');
    if(!host) return;
    host.innerHTML = pickerResults(query).slice(0, 18).map(entry => itemCard(entry, 'reward-item', 'Select reward')).join('');
    host.querySelectorAll('[data-workflow-reward-item]').forEach(button => button.addEventListener('click', () => {
      rewardPickerEntry = entryBySlug(button.dataset.workflowRewardItem);
      const selected = document.getElementById('gmRewardSelectedItem');
      if(selected) selected.innerHTML = rewardSelectedHtml();
    }));
  }
  async function sendGMReward(){
    const campaign = activeCampaign();
    const ids = Array.from(document.querySelectorAll('[data-reward-character]:checked')).map(input => input.value);
    const quantity = Math.max(1, Number(document.getElementById('gmRewardQuantity')?.value || 1));
    const message = document.getElementById('gmRewardMessage')?.value || 'The GM awarded an item.';
    if(!campaign?.id || !ids.length || !rewardPickerEntry){
      window.toast?.('Select at least one linked character and one item.');
      return;
    }
    const snapshot = itemSnapshot(rewardPickerEntry, quantity);
    const rewardId = `reward-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const writes=[];
    ids.forEach(id => {
      const record = getCampaignCharacter(id, campaign);
      if(!record) return;
      record.pendingItemRewards = array(record.pendingItemRewards);
      record.pendingItemRewards.push({
        id:rewardId,
        campaignId:campaign.id,
        campaignName:campaign.name || 'Campaign',
        item:clone(snapshot),
        message,
        status:'pending',
        createdAt:new Date().toISOString()
      });
      window.chars[id] = Object.assign(window.chars[id] || {}, record);
      if(window.AsteriaFirebase?.saveCampaignCharacter){
        writes.push(window.AsteriaFirebase.saveCampaignCharacter(campaign.id, id, window.chars[id]));
      }
    });
    window.saveAsteriaState?.();
    const results=await Promise.all(writes);
    if(writes.length === ids.length && results.every(Boolean)){
      window.toast?.(`Item reward delivered to ${ids.length} live character dashboard${ids.length === 1 ? '' : 's'}.`);
    }else{
      window.toast?.('Item reward changed locally, but Firebase delivery failed. Check the cloud sync warning and deployed Firestore rules.');
    }
  }
  function installGMRewardPanel(){
    const host = document.querySelector('#gm .gm-panels');
    if(!host || document.getElementById('gmItemRewardPanel')) return;
    const campaign = activeCampaign();
    const panel = document.createElement('section');
    panel.id = 'gmItemRewardPanel';
    panel.className = 'card workflow-gm-panel';
    panel.dataset.gmSystem = 'campaign-manager';
    panel.innerHTML = `
      <div class="section-head"><div><p class="eyebrow">GM Loot Tool</p><h3>Send Item Reward</h3></div><span class="pill">Campaign linked</span></div>
      <div class="workflow-two-column">
        <div><h4>Recipients</h4><div class="workflow-character-list">${rewardCharactersHtml(campaign)}</div></div>
        <div><label>Search Item Compendium<input id="gmRewardItemSearch" type="search" placeholder="Search exact item..."></label><div id="gmRewardSelectedItem">${rewardSelectedHtml()}</div><div id="gmRewardSearchResults" class="workflow-item-grid compact"></div></div>
      </div>
      <div class="workflow-form-row"><label>Quantity<input id="gmRewardQuantity" type="number" min="1" value="1"></label><label class="wide">Player message<input id="gmRewardMessage" value="The GM awarded an item."></label><button type="button" class="primary" id="gmSendItemReward">Send Reward</button></div>`;
    host.appendChild(panel);
    panel.querySelector('#gmRewardItemSearch').addEventListener('input', event => renderRewardSearch(event.target.value));
    panel.querySelector('#gmSendItemReward').addEventListener('click', sendGMReward);
    renderRewardSearch();
  }
  function pendingReward(id = currentId()){
    return array(character(id)?.pendingItemRewards).find(reward => reward.status === 'pending');
  }
  function showPendingReward(id = currentId()){
    if(window.AsteriaReactMigration?.isDashboardActive?.()) return;
    const reward = pendingReward(id);
    if(!reward || activeRewardId === reward.id && document.getElementById('asteriaWorkflowModal')?.classList.contains('show')) return;
    activeRewardId = reward.id;
    const slots = inferSlots(reward.item);
    const modal = openModal('Loot Reward', reward.campaignName || 'Campaign Reward', `
      <div class="workflow-reward-hero">
        <div class="workflow-item-image large">${reward.item.image ? `<img src="${esc(reward.item.image)}" alt="">` : esc(reward.item.name.charAt(0))}</div>
        <div><h3>${esc(reward.item.name)}</h3><p>${esc(reward.message)}</p><span class="workflow-rarity">${esc(reward.item.itemClass || 'Common')}</span><span>Quantity ${Number(reward.item.qty || 1)}</span></div>
      </div>
      ${slots.length ? `<label>Equip slot<select id="workflowRewardEquipSlot">${slots.map(slot => `<option>${esc(slot)}</option>`).join('')}</select></label>` : ''}
      <div class="workflow-modal-actions"><button type="button" data-reward-decline>Decline</button><button type="button" class="primary" data-reward-inventory>Add to Inventory</button>${slots.length ? '<button type="button" class="primary" data-reward-equip>Equip Item</button>' : ''}</div>
    `);
    modal.querySelector('[data-reward-inventory]').addEventListener('click', () => resolveReward(id, reward, 'inventory'));
    modal.querySelector('[data-reward-equip]')?.addEventListener('click', () => resolveReward(id, reward, 'equip', modal.querySelector('#workflowRewardEquipSlot')?.value));
    modal.querySelector('[data-reward-decline]').addEventListener('click', () => resolveReward(id, reward, 'declined'));
  }
  function setRewardActionsDisabled(modal, disabled){
    modal?.querySelectorAll('[data-reward-decline],[data-reward-inventory],[data-reward-equip]').forEach(button => {
      button.disabled = disabled;
    });
    modal?.setAttribute('aria-busy', disabled ? 'true' : 'false');
  }
  async function resolveReward(id, reward, action, slot){
    const record = character(id);
    const rewardId = String(reward?.id || '');
    if(!record || !rewardId || resolvingRewardIds.has(rewardId)) return false;
    record.resolvedItemRewardIds = array(record.resolvedItemRewardIds);
    if(record.resolvedItemRewardIds.includes(rewardId) || reward.status === 'accepted' || reward.status === 'declined'){
      closeModal();
      activeRewardId = '';
      return true;
    }
    const before = clone(record);
    const campaign = campaignsForCharacter(id).find(item => String(item?.id || '') === String(reward.campaignId || ''))
      || activeCampaign();
    const modal = document.getElementById('asteriaWorkflowModal');
    resolvingRewardIds.add(rewardId);
    setRewardActionsDisabled(modal, true);
    let resolved = false;
    try{
      if(action !== 'declined'){
        const item = addSnapshot(reward.item, id, undefined, undefined, { persist:false, render:false });
        if(!item) return;
        if(action === 'equip' && !equipItem(item.id, slot, id, { persist:false, render:false, notify:false })){
          window.toast?.(`${item.name} was added to inventory because it could not be equipped.`);
        }
      }
      reward.status = action === 'declined' ? 'declined' : 'accepted';
      reward.resolution = action;
      reward.resolvedAt = new Date().toISOString();
      record.resolvedItemRewardIds = Array.from(new Set([...record.resolvedItemRewardIds, rewardId]));
      if(campaign){
        campaign.characters = Object.assign({}, campaign.characters || {}, { [id]:record });
      }

      let saved = true;
      if(reward.campaignId && window.AsteriaFirebase?.resolveCampaignItemReward){
        const result = await window.AsteriaFirebase.resolveCampaignItemReward(
          reward.campaignId,
          id,
          rewardId,
          record
        );
        saved = Boolean(result?.ok);
        if(result?.character && !result.applied){
          window.chars[id] = Object.assign({}, record, result.character);
          if(campaign){
            campaign.characters = Object.assign({}, campaign.characters || {}, { [id]:window.chars[id] });
          }
        }
      }else{
        saved = await persistCharacter(id, 'item-reward-resolution');
      }
      if(!saved) throw new Error('The reward resolution could not be saved.');

      window.saveAccountState?.();
      window.saveAsteriaState?.();
      window.renderInventory?.();
      window.renderCoinPanel?.();
      closeModal();
      activeRewardId = '';
      resolved = true;
    }catch(error){
      window.chars[id] = before;
      if(campaign){
        campaign.characters = Object.assign({}, campaign.characters || {}, { [id]:before });
      }
      window.renderInventory?.();
      console.warn('Could not resolve the item reward.', error);
      window.toast?.('The item reward could not be saved. It remains pending so you can try again.');
    }finally{
      resolvingRewardIds.delete(rewardId);
      setRewardActionsDisabled(modal, false);
      if(resolved) setTimeout(() => showPendingReward(id), 100);
    }
    return resolved;
  }

  function shopSelectedHtml(){
    if(!shopPickerEntry) return '<p class="muted">Select an item to add to shop stock.</p>';
    return itemCard(shopPickerEntry, 'shop-selected', 'Selected stock item');
  }
  function renderShopSearch(query = ''){
    const host = document.getElementById('gmShopSearchResults');
    if(!host) return;
    host.innerHTML = pickerResults(query).slice(0, 18).map(entry => itemCard(entry, 'shop-item', 'Add to stock')).join('');
    host.querySelectorAll('[data-workflow-shop-item]').forEach(button => button.addEventListener('click', () => {
      shopPickerEntry = entryBySlug(button.dataset.workflowShopItem);
      const selected = document.getElementById('gmShopSelectedItem');
      if(selected) selected.innerHTML = shopSelectedHtml();
      const snapshot = shopPickerEntry ? itemSnapshot(shopPickerEntry, 1) : null;
      const price = snapshot && pricing ? pricing.getPlayerPurchasePriceCopper(snapshot) : null;
      const label = document.getElementById('gmShopStockPrice');
      if(label) label.textContent = price === null ? 'Needs Market Price' : `${price.toLocaleString()} copper`;
    }));
  }
  function renderShopDraft(){
    const host = document.getElementById('gmShopDraftStock');
    if(!host) return;
    host.innerHTML = shopDraftStock.map((stock, index) => `<div class="workflow-stock-row"><b>${esc(stock.item.name)}</b><span>${Number(stock.priceCopper).toLocaleString()} copper</span><span>x${stock.qty}</span><button type="button" data-remove-shop-stock="${index}">&times;</button></div>`).join('') || '<p class="muted">No stock added yet.</p>';
    host.querySelectorAll('[data-remove-shop-stock]').forEach(button => button.addEventListener('click', () => {
      shopDraftStock.splice(Number(button.dataset.removeShopStock), 1);
      renderShopDraft();
    }));
  }
  function addShopStock(){
    if(!shopPickerEntry){window.toast?.('Select an item first.');return;}
    const quantity = Math.max(1, Number(document.getElementById('gmShopStockQty')?.value || 1));
    const item = itemSnapshot(shopPickerEntry, 1);
    const priceCopper = pricing ? pricing.getPlayerPurchasePriceCopper(item) : null;
    if(priceCopper === null){window.toast?.(`${item.name} needs a Market Price before it can be stocked.`);return;}
    if(priceCopper === 0 && pricing?.marketPricingStatus(item).id === 'not-tradeable'){window.toast?.(`${item.name} is not normally tradeable.`);return;}
    const existing = shopDraftStock.find(stock => stock.item.id === slug(shopPickerEntry.slug || shopPickerEntry.title));
    if(existing){existing.qty += quantity;existing.priceCopper = priceCopper;}
    else shopDraftStock.push({item, qty:quantity, priceCopper});
    renderShopDraft();
  }
  function openCampaignShop(){
    const campaign = activeCampaign();
    const visitors = Array.from(document.querySelectorAll('[data-shop-character]:checked')).map(input => input.value);
    if(!campaign?.id || !visitors.length || !shopDraftStock.length){
      window.toast?.('Choose visitors and add at least one shop item.');
      return;
    }
    campaign.activeShop = {
      id:`shop-${Date.now()}`,
      name:document.getElementById('gmShopName')?.value || 'Campaign Store',
      image:document.getElementById('gmShopImage')?.value || '',
      visitorCharacterIds:visitors,
      stock:clone(shopDraftStock),
      status:'open',
      openedAt:new Date().toISOString()
    };
    persistCampaign(campaign, 'shop-opened');
    window.toast?.(`${campaign.activeShop.name} opened for ${visitors.length} character${visitors.length === 1 ? '' : 's'}.`);
  }
  function closeCampaignShop(){
    const campaign = activeCampaign();
    if(!campaign?.activeShop) return;
    campaign.activeShop.status = 'closed';
    campaign.activeShop.closedAt = new Date().toISOString();
    persistCampaign(campaign, 'shop-closed');
    window.toast?.('Campaign shop closed.');
  }
  function installGMShopPanel(){
    const host = document.querySelector('#gm .gm-panels');
    if(!host || document.getElementById('gmCampaignShopPanel')) return;
    const campaign = activeCampaign();
    const panel = document.createElement('section');
    panel.id = 'gmCampaignShopPanel';
    panel.className = 'card workflow-gm-panel';
    panel.dataset.gmSystem = 'economy';
    panel.innerHTML = `
      <div class="section-head"><div><p class="eyebrow">GM Economy Tool</p><h3>Campaign Shop</h3></div><span class="pill">${campaign?.activeShop?.status === 'open' ? 'Open' : 'Closed'}</span></div>
      <div class="workflow-two-column">
        <div><h4>Visiting Characters</h4><div class="workflow-character-list">${campaignCharacterIds(campaign).map(id => {const item=getCampaignCharacter(id,campaign);return `<label class="workflow-check-card"><input type="checkbox" value="${esc(id)}" data-shop-character><span><b>${esc(item?.name || id)}</b><small>${esc(item?.race || '')}</small></span></label>`;}).join('') || '<p>No linked characters.</p>'}</div><label>Shop name<input id="gmShopName" value="${esc(campaign?.activeShop?.name || 'Campaign Store')}"></label><label>Background image path<input id="gmShopImage" placeholder="Optional image URL or asset path"></label></div>
        <div><label>Search Item Compendium<input id="gmShopItemSearch" type="search" placeholder="Search stock..."></label><div id="gmShopSelectedItem">${shopSelectedHtml()}</div><div class="workflow-form-row"><label>Market Price <span id="gmShopStockPrice">Select an item</span></label><label>Stock<input id="gmShopStockQty" type="number" min="1" value="1"></label><button type="button" id="gmAddShopStock">Add Stock</button></div><div id="gmShopSearchResults" class="workflow-item-grid compact"></div></div>
      </div>
      <h4>Shop Stock</h4><div id="gmShopDraftStock"></div>
      <div class="workflow-modal-actions"><button type="button" id="gmCloseShop">Close Shop</button><button type="button" class="primary" id="gmOpenShop">Open Shop for Selected Players</button></div>`;
    host.appendChild(panel);
    if(campaign?.activeShop?.status === 'open') shopDraftStock = clone(campaign.activeShop.stock || []);
    panel.querySelector('#gmShopItemSearch').addEventListener('input', event => renderShopSearch(event.target.value));
    panel.querySelector('#gmAddShopStock').addEventListener('click', addShopStock);
    panel.querySelector('#gmOpenShop').addEventListener('click', openCampaignShop);
    panel.querySelector('#gmCloseShop').addEventListener('click', closeCampaignShop);
    renderShopSearch();
    renderShopDraft();
  }

  function characterCopper(record){
    return COINS.reduce((total, [key, value]) => total + Number(record?.coins?.[key] || 0) * value, 0);
  }
  function emptyBagSlotCount(record){
    return array(record?.bags).reduce((total, bag) => {
      const capacity = Math.max(1, Number(bag.rows || 4) * Number(bag.cols || 4));
      const occupied = array(bag.slots).filter(slot => array(slot.items).length).length;
      return total + Math.max(0, capacity - occupied);
    }, 0);
  }
  function setCharacterCopper(record, total){
    let remainder = Math.max(0, Math.floor(Number(total || 0)));
    record.coins = record.coins || {};
    COINS.forEach(([key, value]) => {
      record.coins[key] = Math.floor(remainder / value);
      remainder %= value;
    });
  }
  function shopForCharacter(id = currentId()){
    return array(window.campaigns).map(campaign => ({campaign, shop:campaign?.activeShop})).find(({shop}) => shop?.status === 'open' && array(shop.visitorCharacterIds).includes(id)) || null;
  }
  function priorShopQuantity(record, shopId, itemId){
    return array(record?.shopPurchases).filter(purchase => purchase.shopId === shopId && purchase.itemId === itemId).reduce((sum, purchase) => sum + Number(purchase.qty || 0), 0);
  }
  function renderShopModal(id, campaign, shop){
    activeShopId = shop.id;
    shopCart.clear();
    const background = shop.image ? ` style="--shop-background:url('${esc(shop.image)}')"` : '';
    const modal = openModal(shop.name, campaign.name || 'Campaign Shop', `
      <div class="workflow-shop-scene"${background}>
        <div><h3>${esc(shop.name)}</h3><p>Available coin: <b id="workflowShopCoins">${characterCopper(character(id)).toLocaleString()} copper</b></p></div>
      </div>
      <div class="workflow-shop-grid">${array(shop.stock).map((stock, index) => {
        const bought = priorShopQuantity(character(id), shop.id, stock.item.id);
        const available = Math.max(0, Number(stock.qty || 0) - bought);
        return `<article class="workflow-shop-card"><div class="workflow-item-image">${stock.item.image ? `<img src="${esc(stock.item.image)}" alt="">` : esc(stock.item.name.charAt(0))}</div><h4>${esc(stock.item.name)}</h4><p>${Number(stock.priceCopper || 0).toLocaleString()} copper</p><small>${available} available</small><div><button type="button" data-shop-minus="${index}">-</button><b data-shop-cart-count="${index}">0</b><button type="button" data-shop-plus="${index}" ${available ? '' : 'disabled'}>+</button></div></article>`;
      }).join('')}</div>
      <footer class="workflow-shop-checkout"><b>Total: <span id="workflowShopTotal">0</span> copper</b><button type="button" class="primary" data-shop-purchase>Purchase Items</button></footer>
    `, 'asteria-shop-modal');
    function redraw(){
      let total = 0;
      array(shop.stock).forEach((stock, index) => {
        const count = Number(shopCart.get(index) || 0);
        total += count * Number(stock.priceCopper || 0);
        const label = modal.querySelector(`[data-shop-cart-count="${index}"]`);
        if(label) label.textContent = count;
      });
      modal.querySelector('#workflowShopTotal').textContent = total.toLocaleString();
    }
    modal.querySelectorAll('[data-shop-plus]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.shopPlus);
      const stock = shop.stock[index];
      const available = Math.max(0, Number(stock.qty || 0) - priorShopQuantity(character(id), shop.id, stock.item.id));
      shopCart.set(index, Math.min(available, Number(shopCart.get(index) || 0) + 1));
      redraw();
    }));
    modal.querySelectorAll('[data-shop-minus]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.shopMinus);
      shopCart.set(index, Math.max(0, Number(shopCart.get(index) || 0) - 1));
      redraw();
    }));
    modal.querySelector('[data-shop-purchase]').addEventListener('click', () => purchaseShopCart(id, campaign, shop));
  }
  function purchaseShopCart(id, campaign, shop){
    const record = character(id);
    const lines = Array.from(shopCart.entries()).filter(([, quantity]) => quantity > 0);
    const total = lines.reduce((sum, [index, quantity]) => sum + Number(shop.stock[index].priceCopper || 0) * quantity, 0);
    if(!lines.length){window.toast?.('Add at least one item to the cart.');return;}
    if(characterCopper(record) < total){window.toast?.('There is not enough money in this character coin pouch.');return;}
    const neededSlots = lines.filter(([index]) => {
      const itemId = shop.stock[index].item.id;
      return !record.inventory?.some(item => item.id === itemId && !item.equipped);
    }).length;
    if(emptyBagSlotCount(record) < neededSlots){
      window.toast?.(`This purchase needs ${neededSlots} empty inventory slot${neededSlots === 1 ? '' : 's'}.`);
      return;
    }
    setCharacterCopper(record, characterCopper(record) - total);
    record.shopPurchases = array(record.shopPurchases);
    lines.forEach(([index, quantity]) => {
      const stock = shop.stock[index];
      addSnapshot(Object.assign(clone(stock.item), {qty:quantity}), id);
      record.shopPurchases.push({shopId:shop.id, campaignId:campaign.id, itemId:stock.item.id, itemName:stock.item.name, qty:quantity, priceCopper:stock.priceCopper, purchasedAt:new Date().toISOString()});
    });
    persistCharacter(id, 'shop-purchase');
    window.renderCoinPanel?.();
    closeModal();
    activeShopId = '';
    window.toast?.(`Purchase complete: ${total.toLocaleString()} copper.`);
  }
  function showActiveShop(id = currentId()){
    const found = shopForCharacter(id);
    if(!found || activeShopId === found.shop.id && document.getElementById('asteriaWorkflowModal')?.classList.contains('show')) return;
    renderShopModal(id, found.campaign, found.shop);
  }
  function showPlayerWorkflows(id = currentId()){
    if(pendingReward(id)) showPendingReward(id);
    else showActiveShop(id);
  }

  function installGMTools(){
    installGMRewardPanel();
    installGMShopPanel();
    window.applyGMSystemPanel?.();
  }
  function boot(){
    ensureModal();
    bindDragAndDrop();
    window.AsteriaViewHooks?.afterGMRender?.('inventory-reward-shop-tools', installGMTools);
    window.AsteriaViewHooks?.afterPlayerLoad?.('inventory-player-workflows', id => setTimeout(() => showPlayerWorkflows(id), 80));
    window.addEventListener('asteria:campaigns-refreshed', () => {
      if(document.getElementById('player')?.classList.contains('show')) showPlayerWorkflows();
      if(document.getElementById('gm')?.classList.contains('show')){
        document.getElementById('gmItemRewardPanel')?.remove();
        document.getElementById('gmCampaignShopPanel')?.remove();
        installGMTools();
      }
    });
    if(document.getElementById('gm')?.classList.contains('show')) installGMTools();
  }

  Object.assign(api, {
    catalogEntries,
    itemSnapshot,
    inferSlots,
    find:findItem,
    addSnapshot,
    placeInBag,
    equipItem,
    unequipItem,
    openItemPicker,
    openActiveShop:showActiveShop,
    showPendingReward,
    sendGMReward,
    resolveReward
  });
  window.toggleEquipItem = function(itemId){
    const item = findItem(itemId);
    if(!item) return false;
    if(item.equipped) return unequipItem(itemId);
    const slots = inferSlots(item);
    if(!slots.length){window.toast?.(`${item.name} is not equippable.`);return false;}
    if(slots.length === 1) return equipItem(itemId, slots[0]);
    openModal('Choose Equipment Slot', item.name, `<div class="workflow-slot-choice">${slots.map(slot => `<button type="button" data-equip-choice="${esc(slot)}">${esc(slot)}</button>`).join('')}</div>`);
    document.querySelectorAll('[data-equip-choice]').forEach(button => button.addEventListener('click', () => {
      equipItem(itemId, button.dataset.equipChoice);
      closeModal();
    }));
    return true;
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
})();
