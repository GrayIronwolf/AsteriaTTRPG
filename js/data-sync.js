/* =========================
   Asteria v1.7.2.3 — Data Sync Foundation
   Firestore-backed character save/load with local fallback.
   ========================= */
(function(){
  const LOCAL_SYNC_KEY = 'asteria-v1-7-2-3-sync-meta';
  const APP_SYSTEM_STATE_KEY = 'asteria-v1-7-2-3-app-system-state';
  let syncTimer = null;
  let cloudLoadedForUid = null;
  let saveInProgress = false;
  let lastCampaignRefresh = 0;
  let realtimeUid = null;
  const realtimeSubscriptions = new Map();

  function safeClone(value){
    try{ return JSON.parse(JSON.stringify(value)); }catch(e){ return value; }
  }
  function getSession(){
    return window.AsteriaAuthBridge?.getSession?.() || window.session || {};
  }
  function isAuthed(){
    return Boolean(window.AsteriaFirebase?.isReady?.());
  }
  function toast(msg){
    if(window.toast) window.toast(msg);
    else console.log('[Asteria Sync]', msg);
  }
  function setSyncStatus(text, kind='info'){
    let el = document.getElementById('asteriaSyncStatus');
    if(!el){
      el = document.createElement('div');
      el.id = 'asteriaSyncStatus';
      el.className = 'asteria-sync-status';
      const access = document.getElementById('accessSummary');
      if(access && access.parentElement) access.parentElement.appendChild(el);
      else document.body.appendChild(el);
    }
    el.textContent = text;
    el.dataset.kind = kind;
  }
  function localMeta(update){
    try{
      const meta = JSON.parse(localStorage.getItem(LOCAL_SYNC_KEY) || '{}');
      if(update){
        Object.assign(meta, update, { updatedAt: Date.now() });
        localStorage.setItem(LOCAL_SYNC_KEY, JSON.stringify(meta));
      }
      return meta;
    }catch(e){ return {}; }
  }
  function readAppSystemState(){
    try{ return JSON.parse(localStorage.getItem(APP_SYSTEM_STATE_KEY) || '{}'); }
    catch(e){ return {}; }
  }
  function saveAppState(partial={}){
    try{
      const state = Object.assign({}, readAppSystemState(), safeClone(partial), { updatedAt: Date.now() });
      localStorage.setItem(APP_SYSTEM_STATE_KEY, JSON.stringify(state));
      scheduleCloudSave('app-system-state');
      return state;
    }catch(e){
      console.warn('Asteria app-state save failed', e);
      return readAppSystemState();
    }
  }
  function ownedCharacterIds(){
    const s = getSession();
    const account = s.account || s.uid || s.user;
    const rec = window.accountUsers?.[account];
    if(Array.isArray(rec?.characters)) return rec.characters.filter(id=>window.chars?.[id]);
    if(Array.isArray(s.profile?.characters)) return s.profile.characters.filter(id=>window.chars?.[id]);
    if(s.character && window.chars?.[s.character]) return [s.character];
    return [];
  }
  function exportOwnedCharacters(){
    const out = {};
    ownedCharacterIds().forEach(id=>{ out[id] = safeClone(Object.assign({ id }, window.chars[id])); });
    return out;
  }
  function exportCloudState(){
    return {
      version: 'asteria-auth-workspace-dashboard-system-v1',
      activeCampaign: window.activeCampaign ?? 0,
      campaigns: safeClone(window.campaigns || []),
      selected: window.selected || null,
      appSystemState: readAppSystemState(),
      ownedCharacterIds: ownedCharacterIds(),
      lastLocalSave: Date.now()
    };
  }
  function mergeCloudState(state){
    if(!state) return;
    try{
      if(Array.isArray(state.campaigns) && state.campaigns.length) window.campaigns = state.campaigns;
      if(typeof state.activeCampaign === 'number') window.activeCampaign = state.activeCampaign;
      if(state.selected && window.chars?.[state.selected]) window.selected = state.selected;
      if(state.appSystemState) localStorage.setItem(APP_SYSTEM_STATE_KEY, JSON.stringify(state.appSystemState));
      window.saveAsteriaState?.();
      window.renderCampaigns?.();
      window.renderPlayerHome?.();
      window.refreshSyncedViews?.();
    }catch(e){ console.warn('Cloud state merge failed', e); }
  }
  function mergeCloudCampaigns(campaigns){
    if(!Array.isArray(campaigns) || !campaigns.length) return;
    const activeId = window.campaigns?.[window.activeCampaign ?? 0]?.id || null;
    const merged = new Map((window.campaigns || []).filter(Boolean).map(campaign=>[campaign.id, campaign]));
    campaigns.forEach(campaign=>{
      if(!campaign?.id) return;
      merged.set(campaign.id, Object.assign({}, merged.get(campaign.id) || {}, campaign));
    });
    window.campaigns = Array.from(merged.values());
    if(activeId){
      const activeIndex = window.campaigns.findIndex(campaign=>campaign?.id === activeId);
      if(activeIndex >= 0) window.activeCampaign = activeIndex;
    }
    window.saveAsteriaState?.();
    window.renderCampaigns?.();
    if(document.getElementById('gm')?.classList.contains('show')) window.renderGM?.();
    window.refreshSyncedViews?.();
    window.dispatchEvent(new CustomEvent('asteria:campaigns-refreshed', { detail:{ campaigns:window.campaigns } }));
    setupRealtimeCampaignSync(window.campaigns);
  }
  function stopRealtimeCampaignSync(){
    realtimeSubscriptions.forEach(unsubscribe=>{
      try{ unsubscribe?.(); }catch(e){}
    });
    realtimeSubscriptions.clear();
    realtimeUid = null;
  }
  function mergeRealtimeCampaign(campaign){
    if(!campaign?.id) return;
    const index=(window.campaigns||[]).findIndex(item=>item?.id===campaign.id);
    if(index < 0) window.campaigns=[...(window.campaigns||[]),campaign];
    else window.campaigns[index]=Object.assign({},window.campaigns[index]||{},campaign);
    window.renderCampaigns?.();
    if(document.getElementById('gm')?.classList.contains('show')) window.renderGM?.();
    window.dispatchEvent(new CustomEvent('asteria:campaign-realtime', { detail:{ campaign } }));
  }
  function mergeRealtimeItemEcosystem(campaignId, itemEcosystem){
    if(!campaignId || !itemEcosystem) return;
    const campaign=(window.campaigns||[]).find(item=>item?.id===campaignId);
    if(!campaign) return;
    campaign.itemEcosystem=safeClone(itemEcosystem);
    window.dispatchEvent(new CustomEvent('asteria:item-ecosystem-realtime', {
      detail:{ campaignId, itemEcosystem:campaign.itemEcosystem }
    }));
    window.AsteriaItemEcosystem?.renderPlayer?.();
    window.AsteriaItemEcosystem?.renderGM?.();
    if(document.getElementById('gm')?.classList.contains('show')) window.renderGM?.();
  }
  function mergeRealtimeCharacters(campaignId, sharedCharacters){
    const user=window.AsteriaFirebase?.getUser?.();
    if(!user || !sharedCharacters) return;
    window.chars=window.chars||{};
    const campaign=(window.campaigns||[]).find(item=>item?.id===campaignId);
    if(campaign) campaign.characters=Object.assign({},campaign.characters||{});
    Object.entries(sharedCharacters).forEach(([id,incoming])=>{
      const before=window.chars[id]||{};
      const character=Object.assign({},before,incoming,{
        id,
        sharedCampaignId:campaignId,
        linkedCampaignIds:Array.from(new Set([...(before.linkedCampaignIds||[]),...(incoming.linkedCampaignIds||[]),campaignId]))
      });
      window.chars[id]=character;
      if(campaign){
        campaign.party=Array.from(new Set([...(campaign.party||[]),id]));
        campaign.characters[id]=Object.assign({},campaign.characters[id]||{},incoming);
      }
      window.dispatchEvent(new CustomEvent('asteria:character-realtime', {
        detail:{ id, campaignId, character, previous:before, owned:character.ownerUid===user.uid }
      }));
    });
    if(document.getElementById('player')?.classList.contains('show')){
      const current=window.currentPlayerId?.()||window.session?.character;
      if(current && sharedCharacters[current]) window.loadPlayer?.(current);
    }
    if(document.getElementById('gm')?.classList.contains('show')) window.renderGM?.();
    window.renderPlayerHome?.();
    window.refreshSyncedViews?.();
  }
  function setupRealtimeCampaignSync(campaigns=window.campaigns||[]){
    const user=window.AsteriaFirebase?.getUser?.();
    if(!user || !window.AsteriaFirebase?.subscribeCampaign || !window.AsteriaFirebase?.subscribeCampaignCharacters) return;
    if(realtimeUid && realtimeUid!==user.uid) stopRealtimeCampaignSync();
    realtimeUid=user.uid;
    const activeKeys=new Set();
    (campaigns||[]).filter(Boolean).forEach(campaign=>{
      if(!campaign.id) return;
      const campaignKey=`campaign:${campaign.id}`;
      const charactersKey=`characters:${campaign.id}`;
      const itemEcosystemKey=`item-ecosystem:${campaign.id}`;
      activeKeys.add(campaignKey);
      activeKeys.add(charactersKey);
      activeKeys.add(itemEcosystemKey);
      if(!realtimeSubscriptions.has(campaignKey)){
        realtimeSubscriptions.set(campaignKey,window.AsteriaFirebase.subscribeCampaign(campaign.id,mergeRealtimeCampaign));
      }
      if(!realtimeSubscriptions.has(charactersKey)){
        realtimeSubscriptions.set(charactersKey,window.AsteriaFirebase.subscribeCampaignCharacters(
          campaign.id,
          characters=>mergeRealtimeCharacters(campaign.id,characters)
        ));
      }
      if(window.AsteriaFirebase?.subscribeCampaignItemEcosystem && !realtimeSubscriptions.has(itemEcosystemKey)){
        realtimeSubscriptions.set(itemEcosystemKey,window.AsteriaFirebase.subscribeCampaignItemEcosystem(
          campaign.id,
          itemEcosystem=>mergeRealtimeItemEcosystem(campaign.id,itemEcosystem)
        ));
      }
    });
    realtimeSubscriptions.forEach((unsubscribe,key)=>{
      if(activeKeys.has(key)) return;
      try{unsubscribe?.();}catch(e){}
      realtimeSubscriptions.delete(key);
    });
  }
  async function refreshCloudCampaigns(reason='manual'){
    if(!isAuthed()) return [];
    try{
      const campaigns = await window.AsteriaFirebase?.loadCampaigns?.();
      mergeCloudCampaigns(campaigns);
      setupRealtimeCampaignSync(window.campaigns);
      lastCampaignRefresh = Date.now();
      localMeta({ lastCampaignRefresh, campaignRefreshReason:reason });
      return campaigns || [];
    }catch(err){
      console.warn('Shared campaign refresh failed', err);
      return [];
    }
  }
  async function loadCloudData(reason='login'){
    const user = window.AsteriaFirebase?.getUser?.();
    if(!user || cloudLoadedForUid === user.uid) return;
    cloudLoadedForUid = user.uid;
    setSyncStatus('Cloud sync: loading account data...', 'info');
    try{
      await window.AsteriaFirebase?.loadCharacters?.();
      const campaigns = await window.AsteriaFirebase?.loadCampaigns?.();
      const state = await window.AsteriaFirebase?.loadState?.();
      mergeCloudState(state);
      mergeCloudCampaigns(campaigns);
      lastCampaignRefresh = Date.now();
      localMeta({ uid:user.uid, lastLoad:Date.now(), reason });
      setSyncStatus('Cloud sync: connected', 'success');
      toast('Asteria cloud data loaded.');
    }catch(err){
      console.warn('Asteria cloud load failed', err);
      setSyncStatus('Cloud sync unavailable — using local fallback', 'warn');
    }
  }
  async function saveCloudData(reason='change'){
    if(saveInProgress || !isAuthed()) return false;
    saveInProgress = true;
    setSyncStatus('Cloud sync: saving...', 'info');
    try{
      const owned = exportOwnedCharacters();
      for(const [id, character] of Object.entries(owned)){
        await window.AsteriaFirebase.saveCharacter(id, character);
      }
      const user = window.AsteriaFirebase?.getUser?.();
      for(const campaign of (window.campaigns || [])){
        if(!campaign?.id || !user || (campaign.ownerUid !== user.uid && campaign.gmId !== user.uid && !(campaign.gmUids || []).includes(user.uid))) continue;
        await window.AsteriaFirebase.saveCampaign(campaign.id, campaign);
      }
      await window.AsteriaFirebase.saveState(exportCloudState());
      localMeta({ lastSave:Date.now(), reason, characterCount:Object.keys(owned).length });
      setSyncStatus('Cloud sync: saved', 'success');
      return true;
    }catch(err){
      console.warn('Asteria cloud save failed', err);
      setSyncStatus('Cloud sync save failed — local fallback active', 'warn');
      return false;
    }finally{
      saveInProgress = false;
    }
  }
  function scheduleCloudSave(reason='change'){
    clearTimeout(syncTimer);
    syncTimer = setTimeout(()=>saveCloudData(reason), 900);
  }

  function wrapGlobal(name, reason){
    const old = window[name];
    if(typeof old !== 'function' || old.__asteriaSyncWrapped) return;
    const wrapped = function(...args){
      const result = old.apply(this, args);
      try{ scheduleCloudSave(reason || name); }catch(e){}
      return result;
    };
    wrapped.__asteriaSyncWrapped = true;
    window[name] = wrapped;
  }
  function installWrappers(){
    wrapGlobal('saveAsteriaState', 'saveAsteriaState');
    wrapGlobal('adjustCharacterResource', 'resource-change');
    wrapGlobal('applyCharacteristicCP', 'characteristics');
    wrapGlobal('createCharacterForAccount', 'character-created');
    wrapGlobal('saveCampaignSettings', 'campaign-settings');
    wrapGlobal('createCampaign', 'campaign-created');
    wrapGlobal('addCampaign', 'campaign-created');
    wrapGlobal('changeTalentClass', 'talents');
    wrapGlobal('applyTalentDrafts', 'talents');
    wrapGlobal('useInventoryItem', 'inventory');
    wrapGlobal('createWebBag', 'inventory');
    wrapGlobal('addInventoryItemToBag', 'inventory');
    wrapGlobal('createWebBagForSlot', 'inventory');
  }

  window.AsteriaDataSync = {
    load: loadCloudData,
    save: saveCloudData,
    scheduleSave: scheduleCloudSave,
    refreshCampaigns: refreshCloudCampaigns,
    watchCampaigns: setupRealtimeCampaignSync,
    stopWatching: stopRealtimeCampaignSync,
    saveAppState,
    readAppState: readAppSystemState,
    status:()=>localMeta()
  };
  window.asteriaDataSync = window.AsteriaDataSync;

  window.addEventListener('asteria:firebase-ready', e=>{
    loadCloudData(e.detail?.source || 'auth');
    setTimeout(()=>scheduleCloudSave('auth-ready'), 1200);
  });
  window.addEventListener('focus', ()=>{
    if(isAuthed() && Date.now() - lastCampaignRefresh > 10000) refreshCloudCampaigns('window-focus');
  });
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden && isAuthed() && Date.now() - lastCampaignRefresh > 10000) refreshCloudCampaigns('window-visible');
  });
  document.addEventListener('DOMContentLoaded', ()=>{
    installWrappers();
    setTimeout(()=>{
      installWrappers();
      if(isAuthed()) loadCloudData('dom-ready');
      else setSyncStatus('Cloud sync: login required', 'info');
    }, 500);
  });
  window.addEventListener('beforeunload', ()=>{
    if(isAuthed()) saveCloudData('beforeunload');
  });
})();
