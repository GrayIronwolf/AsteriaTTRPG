/* Asteria inventory API.
   Canonical item model shared by inventory, equipment, bags, storage, loot,
   shops, trades, crafting, economy, and campaign sync. */
(function(){
  'use strict';

  const api = window.AsteriaInventory = window.AsteriaInventory || {};
  const pricing = window.AsteriaMarketPricing;
  const VERSION = 'asteria-item-ecosystem-v1';
  const CURRENCY = [
    { key:'royal_platinum', label:'Royal Platinum', value:10000000000 },
    { key:'royal_crown', label:'Royal Crown', value:100000000 },
    { key:'platinum_crown', label:'Platinum Crown', value:1000000 },
    { key:'gold', label:'Gold Crown', value:10000 },
    { key:'silver', label:'Silver Mark', value:100 },
    { key:'copper', label:'Copper Penny', value:1 }
  ];
  const EQUIPMENT_SLOTS = [
    'Head','Neck','Shoulders','Chest','Back','Hands','Waist','Legs','Feet',
    'Main Hand','Off Hand','Ranged Weapon','Ammunition',
    'Ring 1','Ring 2','Trinket','Relic','Tool 1','Tool 2',
    'Mount Head','Mount Body','Mount Bags','Pet Armour','Pet Charm',
    'Potion / Poison 1','Potion / Poison 2','Potion / Poison 3','Potion / Poison 4'
  ];
  const SLOT_ALIASES = {
    'Necklace':'Neck',
    'Torso':'Chest',
    'Main Weapon':'Main Hand',
    'Off Weapon':'Off Hand',
    'Secondary Weapon':'Ranged Weapon',
    'Quiver':'Ammunition',
    'Shield':'Off Hand',
    'Charm':'Relic'
  };

  function array(value){
    if(Array.isArray(value)) return value;
    if(value === undefined || value === null || value === '') return [];
    return [value];
  }
  function clone(value){
    try{return JSON.parse(JSON.stringify(value));}catch(error){return value;}
  }
  function slug(value){
    return String(value || '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function uid(prefix = 'item'){
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  }
  function number(value, fallback = 0){
    const parsed = Number(String(value ?? '').replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  function now(){
    return new Date().toISOString();
  }
  function currentId(){
    if(typeof window.currentPlayerId === 'function') return window.currentPlayerId();
    return window.session?.character || window.selected || Object.keys(window.chars || {})[0] || '';
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
    ])).filter(Boolean);
  }
  function isGM(){
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    const user = window.AsteriaFirebase?.getUser?.();
    const campaign = activeCampaign();
    return session.role === 'gm'
      || document.body?.dataset?.role === 'gm'
      || Boolean(user?.uid && campaign && (
        campaign.ownerUid === user.uid
        || campaign.gmId === user.uid
        || array(campaign.gmUids).includes(user.uid)
      ));
  }
  function isOwned(id = currentId()){
    const record = character(id);
    const user = window.AsteriaFirebase?.getUser?.();
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    const account = session.account || session.uid || session.user;
    const owned = array(window.accountUsers?.[account]?.characters);
    return isGM() || owned.includes(id) || Boolean(record && user?.uid && (!record.ownerUid || record.ownerUid === user.uid));
  }
  function isAccountOwned(id = currentId()){
    const record = character(id);
    const user = window.AsteriaFirebase?.getUser?.();
    const session = window.AsteriaAuthBridge?.getSession?.() || window.session || {};
    const account = session.account || session.uid || session.user;
    const owned = array(window.accountUsers?.[account]?.characters);
    return owned.includes(id) || Boolean(record && user?.uid && (!record.ownerUid || record.ownerUid === user.uid));
  }

  function itemKey(item){
    return slug(item?.catalogId || item?.slug || item?.name || item?.id);
  }
  function rarity(item){
    return String(item?.itemClass || item?.rarity || item?.metadata?.itemClass || 'Common');
  }
  function normalizeSlot(slot){
    return SLOT_ALIASES[slot] || slot || '';
  }
  function inferSlots(item){
    const explicit = array(item?.allowedSlots || item?.equipmentSlots || item?.metadata?.equipmentSlots)
      .map(normalizeSlot)
      .filter(slot => EQUIPMENT_SLOTS.includes(slot));
    if(explicit.length) return Array.from(new Set(explicit));
    const text = `${item?.name || ''} ${item?.type || ''} ${item?.category || ''} ${item?.subcategory || ''}`.toLowerCase();
    if(/potion|poison|elixir|draught|vial/.test(text)) return EQUIPMENT_SLOTS.filter(slot => slot.startsWith('Potion / Poison'));
    if(/quiver|ammunition|arrow|bolt/.test(text)) return ['Ammunition'];
    if(/shield/.test(text)) return ['Off Hand'];
    if(/bow|crossbow|rifle|ranged/.test(text)) return ['Ranged Weapon'];
    if(/weapon|sword|axe|dagger|mace|spear|staff|wand/.test(text)) return ['Main Hand','Off Hand'];
    if(/helmet|helm|hood|head/.test(text)) return ['Head'];
    if(/shoulder|pauldron/.test(text)) return ['Shoulders'];
    if(/breastplate|chest|torso|armour|armor|robe/.test(text)) return ['Chest'];
    if(/cloak|cape|back/.test(text)) return ['Back'];
    if(/belt|waist/.test(text)) return ['Waist'];
    if(/legging|trouser|greave|legs/.test(text)) return ['Legs'];
    if(/glove|gauntlet|hand/.test(text)) return ['Hands'];
    if(/boot|shoe|feet/.test(text)) return ['Feet'];
    if(/necklace|amulet/.test(text)) return ['Neck'];
    if(/ring/.test(text)) return ['Ring 1','Ring 2'];
    if(/trinket/.test(text)) return ['Trinket'];
    if(/relic|charm/.test(text)) return ['Relic'];
    if(/tool|kit/.test(text)) return ['Tool 1','Tool 2'];
    return [];
  }
  function normalizeHistory(history){
    return array(history).filter(Boolean).map(entry => typeof entry === 'string'
      ? { action:entry, at:now() }
      : Object.assign({ at:now() }, entry));
  }
  function normalizeItem(input = {}, options = {}){
    const source = clone(input) || {};
    const catalogId = slug(source.catalogId || source.slug || source.name || source.id || 'unknown-item');
    const acquiredAt = source.acquiredAt || source.receivedAt || source.createdAt || now();
    const item = Object.assign({}, source, {
      id:String(source.id || uid(catalogId || 'item')),
      instanceId:String(source.instanceId || source.id || uid(catalogId || 'item')),
      catalogId,
      slug:slug(source.slug || catalogId),
      name:String(source.name || source.title || 'Unknown Item'),
      type:String(source.type || source.itemType || source.category || 'Item'),
      category:String(source.category || ''),
      material:String(source.material || source.metadata?.material || ''),
      itemClass:rarity(source),
      rarity:rarity(source),
      quality:String(source.quality || 'Average'),
      qty:Math.max(0, Math.floor(number(source.qty ?? source.quantity, 1))),
      weight:Math.max(0, number(source.weight, 0)),
      condition:Math.max(0, Math.min(100, number(source.condition, 100))),
      durability:Math.max(0, number(source.durability, 100)),
      maxDurability:Math.max(1, number(source.maxDurability, 100)),
      acquiredAt,
      lastUsedAt:source.lastUsedAt || '',
      lastEquippedAt:source.lastEquippedAt || '',
      favourite:Boolean(source.favourite),
      locked:Boolean(source.locked),
      identified:source.identified !== false,
      questItem:Boolean(source.questItem),
      bound:Boolean(source.bound || source.characterBound || source.accountBound),
      tradeAvailable:source.tradeAvailable !== false,
      equipped:Boolean(source.equipped),
      equippedSlot:normalizeSlot(source.equippedSlot || (source.equipped ? source.slot : '')),
      allowedSlots:inferSlots(source),
      location:source.location || (source.equipped ? 'equipment' : 'inventory'),
      tags:array(source.tags),
      effects:source.effects || source.stats || {},
      requirements:source.requirements || {},
      enchantments:array(source.enchantments || source.enchantment),
      craftingMaterials:array(source.craftingMaterials || source.materials),
      history:normalizeHistory(source.history)
    });
    if(options.newInstance){
      item.id = uid(catalogId || 'item');
      item.instanceId = item.id;
      item.acquiredAt = now();
    }
    return pricing
      ? pricing.normalizeMarketPricing(item, { legacy:true, removeLegacy:true, migratedRecord:true })
      : Object.assign(item, { marketValue:0, marketPrice:null, pricingNeedsCompletion:true });
  }
  function normalizeBag(bag = {}, index = 0){
    const rows = Math.max(1, number(bag.rows, 4));
    const cols = Math.max(1, number(bag.cols, 4));
    return Object.assign({}, bag, {
      id:String(bag.id || uid('bag')),
      name:String(bag.name || `Bag ${index + 1}`),
      type:String(bag.type || 'General Backpack'),
      image:String(bag.image || ''),
      rows,
      cols,
      maxSlots:Math.max(1, number(bag.maxSlots, rows * cols)),
      maxWeight:Math.max(0, number(bag.maxWeight, 0)),
      allowedCategories:array(bag.allowedCategories),
      slots:array(bag.slots),
      equipped:bag.equipped !== false,
      locked:Boolean(bag.locked),
      collapsed:Boolean(bag.collapsed),
      order:number(bag.order, index)
    });
  }
  function defaultStorage(id){
    return {
      id:`personal-chest-${id || 'character'}`,
      name:'Personal Chest',
      type:'Character Chest',
      maxSlots:100,
      maxWeight:0,
      shared:false,
      permissions:{ owners:[id].filter(Boolean), viewers:[] },
      itemIds:[],
      lockedSections:[],
      activity:[]
    };
  }
  function ensure(id = currentId()){
    if(typeof window.ensureWebInventory === 'function') window.ensureWebInventory(id);
    else if(typeof window.ensureInventory === 'function') window.ensureInventory();
    const record = character(id);
    if(!record) return null;
    record.inventory = array(record.inventory).map(item => normalizeItem(item));
    record.bags = array(record.bags).map(normalizeBag);
    record.storages = array(record.storages);
    if(!record.storages.length) record.storages.push(defaultStorage(id));
    record.inventoryActivity = array(record.inventoryActivity);
    record.inventorySettings = Object.assign({
      view:'grid',
      sort:'newest',
      overencumbranceAllowed:true,
      activeTab:'inventory',
      filters:{}
    }, record.inventorySettings || {});
    record.wishlist = array(record.wishlist);
    record.coins = record.coins || {};
    CURRENCY.forEach(currency => {
      record.coins[currency.key] = Math.max(0, number(record.coins[currency.key], 0));
    });
    record.bags.forEach((bag, bagIndex) => {
      bag.order = number(bag.order, bagIndex);
      array(bag.slots).forEach(slot => array(slot.items).forEach(reference => {
        const item = record.inventory.find(candidate => candidate.id === reference.id);
        if(item && !item.equipped){
          item.location = 'bag';
          item.bagId = bag.id;
          item.bagSlot = number(slot.slot, 0);
        }
      }));
    });
    record.storages.forEach(storage => array(storage.itemIds).forEach(itemId => {
      const item = record.inventory.find(candidate => candidate.id === itemId);
      if(item){
        item.location = 'storage';
        item.storageId = storage.id;
      }
    }));
    return record;
  }
  function items(id = currentId()){
    return ensure(id)?.inventory || [];
  }
  function find(itemId, id = currentId()){
    const key = String(itemId || '');
    return items(id).find(item =>
      item.id === key
      || item.instanceId === key
      || item.catalogId === slug(key)
      || item.slug === slug(key)
      || item.name === key
    ) || null;
  }
  function sameStack(left, right){
    if(!left || !right || left.equipped || right.equipped || left.unique || right.unique) return false;
    return itemKey(left) === itemKey(right)
      && left.quality === right.quality
      && left.condition === right.condition
      && JSON.stringify(left.enchantments || []) === JSON.stringify(right.enchantments || []);
  }
  function persistCharacter(id = currentId(), reason = 'inventory-change'){
    const record = character(id);
    if(!record) return false;
    window.saveAccountState?.();
    window.saveAsteriaState?.();
    window.AsteriaDataSync?.scheduleSave?.(reason);
    if(isAccountOwned(id)) window.AsteriaFirebase?.saveCharacter?.(id, record);
    (window.campaigns || []).filter(campaign => campaignCharacterIds(campaign).includes(id)).forEach(campaign => {
      if(campaign?.id) window.AsteriaFirebase?.saveCampaignCharacter?.(campaign.id, id, record);
    });
    window.dispatchEvent(new CustomEvent('asteria:inventory-changed', { detail:{ id, reason, character:record } }));
    return true;
  }
  function persistCampaign(campaign = activeCampaign(), reason = 'item-ecosystem-change'){
    if(!campaign) return false;
    window.saveAsteriaState?.();
    window.AsteriaDataSync?.scheduleSave?.(reason);
    if(campaign.id){
      window.AsteriaFirebase?.saveCampaignItemEcosystem?.(campaign.id, ensureCampaign(campaign));
      const user = window.AsteriaFirebase?.getUser?.();
      const canSaveCampaign = user && (
        campaign.ownerUid === user.uid ||
        campaign.gmId === user.uid ||
        (campaign.gmUids || []).includes(user.uid)
      );
      if(canSaveCampaign) window.AsteriaFirebase?.saveCampaign?.(campaign.id, campaign);
    }
    window.dispatchEvent(new CustomEvent('asteria:item-campaign-changed', { detail:{ campaign, reason } }));
    return true;
  }
  function ensureCampaign(campaign = activeCampaign()){
    if(!campaign) return null;
    campaign.itemEcosystem = Object.assign({
      version:VERSION,
      partyLoot:[],
      lootTables:[],
      shops:[],
      directTrades:[],
      marketplace:[],
      sharedStorages:[],
      auditLog:[],
      settings:{
        distributionMethod:'need-greed',
        currencyShares:'equal',
        lootTimeLimitHours:24,
        allowOverencumbrance:true
      }
    }, campaign.itemEcosystem || {});
    const ecosystem = campaign.itemEcosystem;
    ['partyLoot','lootTables','shops','directTrades','marketplace','sharedStorages','auditLog'].forEach(key => {
      ecosystem[key] = array(ecosystem[key]);
    });
    if(!ecosystem.sharedStorages.length){
      ecosystem.sharedStorages.push({
        id:`party-chest-${campaign.id || slug(campaign.name)}`,
        name:'Party Chest',
        type:'Party Chest',
        maxSlots:200,
        maxWeight:0,
        shared:true,
        itemSnapshots:[],
        permissions:{ members:campaignCharacterIds(campaign), gm:true },
        activity:[]
      });
    }
    return ecosystem;
  }
  function notify(title, message, options = {}){
    if(typeof window.asteriaNotify === 'function'){
      window.asteriaNotify(Object.assign({
        level:'small',
        title,
        message,
        type:'item',
        sound:'item',
        sessionLog:false
      }, options));
    }else window.toast?.(`${title}: ${message}`);
  }
  function audit(action, input = {}){
    const id = input.characterId || currentId();
    const record = character(id);
    const user = window.AsteriaFirebase?.getUser?.();
    const entry = Object.assign({
      id:uid('audit'),
      at:now(),
      userUid:user?.uid || window.session?.account || 'local',
      characterId:id,
      characterName:record?.name || '',
      action,
      itemId:'',
      itemName:'',
      quantity:0,
      currency:{},
      previousOwner:'',
      newOwner:'',
      source:'',
      gmOverride:false,
      notes:''
    }, clone(input));
    if(record){
      record.inventoryActivity = array(record.inventoryActivity);
      record.inventoryActivity.unshift(entry);
      record.inventoryActivity = record.inventoryActivity.slice(0, 500);
    }
    const ecosystem = ensureCampaign();
    if(ecosystem){
      ecosystem.auditLog.unshift(entry);
      ecosystem.auditLog = ecosystem.auditLog.slice(0, 1500);
    }
    return entry;
  }
  function add(input, id = currentId(), options = {}){
    const record = ensure(id);
    if(!record || !input || (!isOwned(id) && !isGM())) return null;
    const incoming = normalizeItem(input, { newInstance:Boolean(options.newInstance) });
    let item = options.forceNew ? null : record.inventory.find(candidate => sameStack(candidate, incoming));
    if(item){
      item.qty += Math.max(1, incoming.qty);
      item.acquiredAt = now();
    }else{
      if(record.inventory.some(candidate => candidate.id === incoming.id)){
        incoming.id = uid(incoming.catalogId || 'item');
        incoming.instanceId = incoming.id;
      }
      item = incoming;
      record.inventory.push(item);
    }
    item.history.unshift({ action:'Acquired', at:now(), source:options.source || input.source || 'Inventory' });
    audit('item-received', {
      characterId:id,
      itemId:item.id,
      itemName:item.name,
      quantity:incoming.qty,
      source:options.source || input.source || 'Inventory',
      notes:options.notes || ''
    });
    persistCharacter(id, options.reason || 'inventory-add');
    notify('Item Received', `${record.name || 'Character'} received ${incoming.qty} × ${item.name}.`, { targetPlayer:id });
    return item;
  }
  function remove(itemId, id = currentId(), quantity, options = {}){
    const record = ensure(id);
    const item = find(itemId, id);
    if(!record || !item || (!isOwned(id) && !isGM())) return false;
    if(item.locked && !options.gmOverride){
      notify('Item Locked', `${item.name} is protected from removal.`, { type:'warning' });
      return false;
    }
    if((item.questItem || item.bound) && !options.gmOverride && ['drop','destroy','trade','sell'].includes(options.action)){
      notify('Restricted Item', `${item.name} cannot be ${options.action || 'removed'}.`, { type:'warning' });
      return false;
    }
    const amount = Math.max(1, Math.min(item.qty, number(quantity, item.qty)));
    item.qty -= amount;
    if(item.qty <= 0){
      record.inventory = record.inventory.filter(candidate => candidate.id !== item.id);
      record.bags.forEach(bag => array(bag.slots).forEach(slot => {
        slot.items = array(slot.items).filter(reference => reference.id !== item.id);
      }));
      record.storages.forEach(storage => {
        storage.itemIds = array(storage.itemIds).filter(idValue => idValue !== item.id);
      });
    }
    audit(options.action || 'item-removed', {
      characterId:id,
      itemId:item.id,
      itemName:item.name,
      quantity:amount,
      source:options.source || 'Inventory',
      gmOverride:Boolean(options.gmOverride),
      notes:options.notes || ''
    });
    persistCharacter(id, options.reason || 'inventory-remove');
    return true;
  }
  function splitStack(itemId, quantity, id = currentId()){
    const item = find(itemId, id);
    const amount = Math.floor(number(quantity, 0));
    if(!item || amount < 1 || amount >= item.qty) return null;
    item.qty -= amount;
    const split = normalizeItem(Object.assign({}, clone(item), {
      id:uid(item.catalogId || 'item'),
      instanceId:'',
      qty:amount,
      acquiredAt:now(),
      history:[{ action:'Stack split', at:now(), source:item.id }, ...item.history]
    }));
    split.instanceId = split.id;
    ensure(id).inventory.push(split);
    audit('stack-split', { characterId:id, itemId:item.id, itemName:item.name, quantity:amount, notes:`Created ${split.id}` });
    persistCharacter(id, 'inventory-stack-split');
    return split;
  }
  function combineStacks(sourceId, targetId, id = currentId()){
    const source = find(sourceId, id);
    const target = find(targetId, id);
    if(!sameStack(source, target) || source.id === target.id) return false;
    target.qty += source.qty;
    const amount = source.qty;
    ensure(id).inventory = ensure(id).inventory.filter(item => item.id !== source.id);
    audit('stacks-combined', { characterId:id, itemId:target.id, itemName:target.name, quantity:amount, notes:`Combined ${source.id}` });
    persistCharacter(id, 'inventory-stacks-combined');
    return true;
  }
  function setFlag(itemId, flag, value, id = currentId()){
    const item = find(itemId, id);
    if(!item || !['favourite','locked','tradeAvailable'].includes(flag)) return false;
    item[flag] = value === undefined ? !item[flag] : Boolean(value);
    audit(`item-${flag}`, { characterId:id, itemId:item.id, itemName:item.name, notes:String(item[flag]) });
    persistCharacter(id, `inventory-${flag}`);
    return item[flag];
  }
  function moveToStorage(itemId, storageId, id = currentId()){
    const record = ensure(id);
    const item = find(itemId, id);
    const storage = record?.storages?.find(candidate => candidate.id === storageId);
    if(!record || !item || !storage || item.equipped) return false;
    if(storage.maxSlots && array(storage.itemIds).length >= storage.maxSlots && !array(storage.itemIds).includes(item.id)) return false;
    record.bags.forEach(bag => array(bag.slots).forEach(slot => {
      slot.items = array(slot.items).filter(reference => reference.id !== item.id);
    }));
    record.storages.forEach(candidate => {
      candidate.itemIds = array(candidate.itemIds).filter(value => value !== item.id);
    });
    storage.itemIds.push(item.id);
    item.location = 'storage';
    item.storageId = storage.id;
    item.bagId = '';
    audit('item-stored', { characterId:id, itemId:item.id, itemName:item.name, quantity:item.qty, source:storage.name });
    persistCharacter(id, 'inventory-storage');
    return true;
  }
  function moveFromStorage(itemId, id = currentId()){
    const record = ensure(id);
    const item = find(itemId, id);
    if(!record || !item) return false;
    record.storages.forEach(storage => {
      storage.itemIds = array(storage.itemIds).filter(value => value !== item.id);
    });
    item.location = 'inventory';
    item.storageId = '';
    audit('item-retrieved', { characterId:id, itemId:item.id, itemName:item.name, quantity:item.qty });
    persistCharacter(id, 'inventory-storage-retrieve');
    return true;
  }
  function carriedItems(id = currentId()){
    return items(id).filter(item => item.location !== 'storage');
  }
  function carriedWeight(id = currentId()){
    return carriedItems(id).reduce((total, item) => total + item.weight * Math.max(0, item.qty), 0);
  }
  function equippedWeight(id = currentId()){
    return items(id).filter(item => item.equipped).reduce((total, item) => total + item.weight * Math.max(0, item.qty), 0);
  }
  function carryCapacity(id = currentId()){
    const record = ensure(id) || {};
    const explicit = number(record.maxCarryWeight ?? record.carryCapacity ?? record.inventoryCapacityWeight, 0);
    if(explicit > 0) return explicit;
    const strength = number(
      record.characteristics?.strength?.value
      ?? record.characteristics?.strength
      ?? record.stats?.strength
      ?? record.strength,
      10
    );
    return Math.max(20, strength * 10);
  }
  function encumbrance(id = currentId()){
    const weight = carriedWeight(id);
    const capacity = carryCapacity(id);
    const ratio = capacity ? weight / capacity : 0;
    return {
      weight,
      capacity,
      remaining:capacity - weight,
      ratio,
      state:ratio > 1 ? 'Over capacity' : ratio > .85 ? 'Heavily encumbered' : ratio > .65 ? 'Lightly encumbered' : 'Unencumbered'
    };
  }
  function requirements(item, id = currentId()){
    const record = ensure(id) || {};
    const required = item?.requirements || {};
    const failures = [];
    const classes = [record.klass, record.className, ...array(record.classes), ...array(record.secondaryClasses)].filter(Boolean).map(slug);
    if(required.level && number(record.level, 1) < number(required.level)) failures.push(`Level ${required.level}`);
    if(required.race && slug(record.race) !== slug(required.race)) failures.push(`Race: ${required.race}`);
    if(required.class && !classes.includes(slug(required.class))) failures.push(`Class: ${required.class}`);
    Object.entries(required.characteristics || {}).forEach(([key, value]) => {
      const actual = number(record.characteristics?.[key]?.value ?? record.characteristics?.[key] ?? record.stats?.[key], 0);
      if(actual < number(value)) failures.push(`${key} ${value}`);
    });
    array(required.skills).forEach(skill => {
      if(!array(record.skills).some(entry => slug(entry?.name || entry) === slug(skill))) failures.push(`Skill: ${skill}`);
    });
    array(required.talents).forEach(talent => {
      if(!array(record.unlockedTalents).some(entry => slug(entry?.name || entry) === slug(talent))) failures.push(`Talent: ${talent}`);
    });
    array(required.magicAffinity).forEach(magic => {
      if(!array(record.magicTypes || record.magicAffinities).map(slug).includes(slug(magic))) failures.push(`Affinity: ${magic}`);
    });
    return { met:failures.length === 0, failures };
  }
  function equipmentStats(id = currentId()){
    const totals = {};
    items(id).filter(item => item.equipped).forEach(item => {
      const source = item.stats || item.effects || {};
      Object.entries(source).forEach(([key, value]) => {
        if(typeof value === 'number') totals[key] = number(totals[key], 0) + value;
      });
    });
    return totals;
  }
  function filterItems(inputItems, filters = {}, sort = 'alphabetical'){
    const query = String(filters.query || '').trim().toLowerCase();
    let result = array(inputItems).filter(item => {
      const haystack = [
        item.name,item.type,item.category,item.material,item.rarity,item.quality,item.crafter,
        array(item.tags).join(' '),array(item.enchantments).map(value => value?.name || value).join(' '),
        item.magicElement,item.weaponType,item.armourType,item.profession,item.location
      ].join(' ').toLowerCase();
      if(query && !haystack.includes(query)) return false;
      if(filters.type && filters.type !== 'all' && slug(item.type) !== slug(filters.type)) return false;
      if(filters.category && filters.category !== 'all' && slug(item.category) !== slug(filters.category)) return false;
      if(filters.rarity && filters.rarity !== 'all' && slug(item.rarity) !== slug(filters.rarity)) return false;
      if(filters.quality && filters.quality !== 'all' && slug(item.quality) !== slug(filters.quality)) return false;
      if(filters.location && filters.location !== 'all' && slug(item.location) !== slug(filters.location)) return false;
      if(filters.equipped === 'yes' && !item.equipped) return false;
      if(filters.equipped === 'no' && item.equipped) return false;
      if(filters.favourite && !item.favourite) return false;
      if(filters.quest && !item.questItem) return false;
      if(filters.trade && (!item.tradeAvailable || item.locked || item.bound)) return false;
      if(filters.minValue !== undefined && item.marketValue < number(filters.minValue)) return false;
      if(filters.maxValue !== undefined && item.marketValue > number(filters.maxValue, Infinity)) return false;
      if(filters.minWeight !== undefined && item.weight < number(filters.minWeight)) return false;
      if(filters.maxWeight !== undefined && item.weight > number(filters.maxWeight, Infinity)) return false;
      return true;
    });
    const rarityOrder = ['Common','Uncommon','Unusual','Rare','Epic','Mythic','Legendary','Relic'];
    const compare = {
      alphabetical:(a,b) => a.name.localeCompare(b.name),
      newest:(a,b) => String(b.acquiredAt).localeCompare(String(a.acquiredAt)),
      oldest:(a,b) => String(a.acquiredAt).localeCompare(String(b.acquiredAt)),
      'value-high':(a,b) => b.marketValue - a.marketValue,
      'value-low':(a,b) => a.marketValue - b.marketValue,
      'weight-high':(a,b) => b.weight - a.weight,
      'weight-low':(a,b) => a.weight - b.weight,
      rarity:(a,b) => rarityOrder.indexOf(b.rarity) - rarityOrder.indexOf(a.rarity),
      quantity:(a,b) => b.qty - a.qty,
      condition:(a,b) => b.condition - a.condition,
      recent:(a,b) => String(b.lastUsedAt || b.acquiredAt).localeCompare(String(a.lastUsedAt || a.acquiredAt))
    };
    return result.sort(compare[sort] || compare.alphabetical);
  }
  function currencyTotal(record = ensure()){
    return CURRENCY.reduce((total, currency) => total + number(record?.coins?.[currency.key], 0) * currency.value, 0);
  }
  function setCurrencyTotal(record, total){
    let remainder = Math.max(0, Math.floor(number(total, 0)));
    record.coins = record.coins || {};
    CURRENCY.forEach(currency => {
      record.coins[currency.key] = Math.floor(remainder / currency.value);
      remainder %= currency.value;
    });
    return record.coins;
  }
  function adjustCurrency(id, copperDelta, details = {}){
    const record = ensure(id);
    if(!record || (!isOwned(id) && !isGM())) return false;
    const before = currencyTotal(record);
    const after = before + number(copperDelta, 0);
    if(after < 0) return false;
    setCurrencyTotal(record, after);
    audit(details.action || 'currency-change', {
      characterId:id,
      currency:{ copperEquivalent:number(copperDelta, 0) },
      source:details.source || '',
      notes:details.notes || ''
    });
    persistCharacter(id, details.reason || 'currency-change');
    return true;
  }

  Object.assign(api, {
    version:VERSION,
    CURRENCY,
    EQUIPMENT_SLOTS,
    SLOT_ALIASES,
    currentId,
    character,
    activeCampaign,
    campaignCharacterIds,
    isGM,
    isOwned,
    ensure,
    ensureCampaign,
    items,
    find,
    add,
    remove,
    normalizeItem,
    normalizeBag,
    inferSlots,
    splitStack,
    combineStacks,
    setFlag,
    moveToStorage,
    moveFromStorage,
    carriedItems,
    carriedWeight,
    equippedWeight,
    carryCapacity,
    encumbrance,
    requirements,
    equipmentStats,
    filterItems,
    currencyTotal,
    setCurrencyTotal,
    adjustCurrency,
    persistCharacter,
    persistCampaign,
    audit,
    notify,
    uid,
    slug,
    clone,
    array,
    render(){ window.renderInventory?.(); window.AsteriaItemEcosystem?.renderPlayer?.(); },
    use(itemId){ window.useInventoryItem?.(itemId); },
    toggleEquip(itemId){ window.toggleEquipItem?.(itemId); }
  });
})();
