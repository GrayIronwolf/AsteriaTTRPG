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
  async function loadCloudData(reason='login'){
    const user = window.AsteriaFirebase?.getUser?.();
    if(!user || cloudLoadedForUid === user.uid) return;
    cloudLoadedForUid = user.uid;
    setSyncStatus('Cloud sync: loading account data...', 'info');
    try{
      await window.AsteriaFirebase?.loadCharacters?.();
      const state = await window.AsteriaFirebase?.loadState?.();
      mergeCloudState(state);
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
    saveAppState,
    readAppState: readAppSystemState,
    status:()=>localMeta()
  };
  window.asteriaDataSync = window.AsteriaDataSync;

  window.addEventListener('asteria:firebase-ready', e=>{
    loadCloudData(e.detail?.source || 'auth');
    setTimeout(()=>scheduleCloudSave('auth-ready'), 1200);
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
