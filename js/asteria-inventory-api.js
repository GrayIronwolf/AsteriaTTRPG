/* Asteria inventory API.
   Provides one stable doorway for inventory, crafting, loot, and economy systems. */
(function(){
  function currentId(){
    if(typeof window.currentPlayerId === 'function') return window.currentPlayerId();
    return window.selected || Object.keys(window.chars || {})[0];
  }

  function character(id = currentId()){
    return window.chars?.[id] || null;
  }

  function ensure(id = currentId()){
    if(typeof window.ensureWebInventory === 'function') window.ensureWebInventory(id);
    else if(typeof window.ensureInventory === 'function') window.ensureInventory();
    return character(id);
  }

  function items(id = currentId()){
    const c = ensure(id);
    return c?.inventory || [];
  }

  function find(itemId, id = currentId()){
    return items(id).find(item => item.id === itemId || item.name === itemId) || null;
  }

  function add(item, id = currentId()){
    const c = ensure(id);
    if(!c || !item) return null;
    c.inventory = c.inventory || [];
    const snapshot = {
      id: item.id || 'item-' + Date.now(),
      name: item.name || 'Unknown Item',
      type: item.type || 'Item',
      qty: Number(item.qty || 1),
      ...item
    };
    c.inventory.push(snapshot);
    window.saveAsteriaState?.();
    window.renderInventory?.();
    return snapshot;
  }

  function remove(itemId, id = currentId()){
    const c = ensure(id);
    if(!c?.inventory) return false;
    const index = c.inventory.findIndex(item => item.id === itemId || item.name === itemId);
    if(index < 0) return false;
    c.inventory.splice(index, 1);
    window.saveAsteriaState?.();
    window.renderInventory?.();
    return true;
  }

  window.AsteriaInventory = {
    currentId,
    character,
    ensure,
    items,
    find,
    add,
    remove,
    render(){ window.renderInventory?.(); },
    use(itemId){ window.useInventoryItem?.(itemId); },
    toggleEquip(itemId){ window.toggleEquipItem?.(itemId); }
  };
})();
