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
  let accountCampaignUnsubscribe = null;
  const realtimeSubscriptions = new Map();
  const persistedProgressionSignatures = new Map();
  const persistedCharacterSignatures = new Map();
  const repairingRewardResolutions = new Map();
  const FINAL_REWARD_STATUSES = new Set(['accepted','declined']);

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
    const uid=window.AsteriaFirebase?.getUser?.()?.uid || '';
    const ids=new Set();
    if(Array.isArray(rec?.characters)) rec.characters.forEach(id=>ids.add(id));
    if(Array.isArray(s.profile?.characters)) s.profile.characters.forEach(id=>ids.add(id));
    if(s.character) ids.add(s.character);
    Object.entries(window.chars || {}).forEach(([id,character])=>{
      if(uid && character?.ownerUid === uid) ids.add(id);
    });
    return Array.from(ids).filter(id=>window.chars?.[id]);
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
    if(!Array.isArray(campaigns)) return;
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
    try{ accountCampaignUnsubscribe?.(); }catch(e){}
    accountCampaignUnsubscribe = null;
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
    if(campaign.characters && Object.keys(campaign.characters).length){
      mergeRealtimeCharacters(campaign.id,campaign.characters,{ source:'campaign-summary' });
    }
    window.renderCampaigns?.();
    if(document.getElementById('gm')?.classList.contains('show')) window.renderGM?.();
    window.dispatchEvent(new CustomEvent('asteria:campaign-realtime', { detail:{ campaign } }));
  }
  function mergeRealtimeItemEcosystem(campaignId, itemEcosystem){
    if(!campaignId || !itemEcosystem) return;
    let campaign=(window.campaigns||[]).find(item=>item?.id===campaignId);
    if(!campaign){
      campaign={ id:campaignId, name:'Linked Campaign', party:[], characters:{} };
      window.campaigns=[...(window.campaigns||[]),campaign];
    }
    campaign.itemEcosystem=safeClone(itemEcosystem);
    window.dispatchEvent(new CustomEvent('asteria:item-ecosystem-realtime', {
      detail:{ campaignId, itemEcosystem:campaign.itemEcosystem }
    }));
    window.AsteriaItemEcosystem?.renderPlayer?.();
    window.AsteriaItemEcosystem?.renderGM?.();
    if(document.getElementById('gm')?.classList.contains('show')) window.renderGM?.();
  }
  function mergeRealtimeProgression(campaignId, progression){
    const characters=progression?.characters || {};
    if(!Object.keys(characters).length) return;
    mergeRealtimeCharacters(campaignId,characters,{ source:'progression' });
    window.dispatchEvent(new CustomEvent('asteria:progression-realtime', {
      detail:{ campaignId, progression }
    }));
  }
  function progressionSignature(character){
    if(!character) return '';
    return [
      Number(character.level || 0),
      Number(character.xp || 0),
      Number(character.xpMax || 0),
      Number(character.cp || 0),
      Number(character.tp || 0),
      Number(character.pendingSkillChoices || 0),
      String(character.progressionSync?.revision || '')
    ].join(':');
  }
  function progressionChanged(previous, character){
    return progressionSignature(previous) !== progressionSignature(character);
  }
  function rewardId(reward){
    return String(reward?.id || '');
  }
  function mergeItemRewardState(previous={}, incoming={}){
    const previousRewards=Array.isArray(previous.pendingItemRewards) ? previous.pendingItemRewards : [];
    const incomingRewards=Array.isArray(incoming.pendingItemRewards) ? incoming.pendingItemRewards : [];
    const previousById=new Map(previousRewards.filter(reward=>rewardId(reward)).map(reward=>[rewardId(reward),reward]));
    const incomingById=new Map(incomingRewards.filter(reward=>rewardId(reward)).map(reward=>[rewardId(reward),reward]));
    const resolvedIds=new Set([
      ...(Array.isArray(previous.resolvedItemRewardIds) ? previous.resolvedItemRewardIds : []),
      ...(Array.isArray(incoming.resolvedItemRewardIds) ? incoming.resolvedItemRewardIds : [])
    ].map(String));
    [...previousRewards,...incomingRewards].forEach(reward=>{
      if(FINAL_REWARD_STATUSES.has(reward?.status) && rewardId(reward)) resolvedIds.add(rewardId(reward));
    });
    const ids=Array.from(new Set([...incomingById.keys(),...previousById.keys()]));
    const rewards=ids.map(id=>{
      const local=previousById.get(id);
      const shared=incomingById.get(id);
      if(FINAL_REWARD_STATUSES.has(local?.status) && !FINAL_REWARD_STATUSES.has(shared?.status)) return safeClone(local);
      if(FINAL_REWARD_STATUSES.has(shared?.status)) return safeClone(shared);
      if(resolvedIds.has(id)){
        return Object.assign({}, safeClone(shared || local || { id }), {
          status:local?.status === 'declined' ? 'declined' : 'accepted',
          resolvedAt:local?.resolvedAt || shared?.resolvedAt || new Date().toISOString()
        });
      }
      return safeClone(shared || local);
    });
    const staleResolvedIds=incomingRewards
      .filter(reward=>reward?.status === 'pending' && resolvedIds.has(rewardId(reward)))
      .map(reward=>rewardId(reward));
    return {
      rewards,
      resolvedIds:Array.from(resolvedIds),
      staleResolvedIds
    };
  }
  function activeSharedCharacterId(sharedCharacters){
    const session=getSession();
    const candidates=[
      window.currentPlayerId?.(),
      window.selected,
      session.character,
      session.profile?.activeCharacterId
    ].filter(Boolean);
    return candidates.find(id=>sharedCharacters[id]) || '';
  }
  function persistReceivedProgression(id, character, user){
    if(!character || character.ownerUid !== user?.uid || !window.AsteriaFirebase?.saveOwnedCharacterProgress) return;
    const signature=progressionSignature(character);
    if(persistedProgressionSignatures.get(id) === signature) return;
    persistedProgressionSignatures.set(id,signature);
    window.AsteriaFirebase.saveOwnedCharacterProgress(id,character).then(saved=>{
      if(!saved && persistedProgressionSignatures.get(id) === signature) persistedProgressionSignatures.delete(id);
    });
  }
  function receivedCharacterSignature(character){
    if(!character) return '';
    const inventory=(character.inventory || []).map(item=>[
      item?.id || item?.instanceId || item?.name || '',
      Number(item?.qty || 0),
      item?.location || '',
      item?.equipped ? 1 : 0
    ]);
    return JSON.stringify({
      progression:progressionSignature(character),
      hp:character.hp,
      sp:character.sp,
      mp:character.mp,
      bp:character.bp,
      inventory,
      pendingItemRewards:character.pendingItemRewards || [],
      resolvedItemRewardIds:character.resolvedItemRewardIds || [],
      coins:character.coins || {},
      quickSlots:character.quickSlots || [],
      bags:character.bags || []
    });
  }
  function realtimeCharacterSignature(character){
    if(!character) return '';
    return JSON.stringify({
      identity:[
        character.id || '',
        character.ownerUid || '',
        character.name || '',
        character.race || '',
        character.klass || character.class || ''
      ],
      state:receivedCharacterSignature(character),
      conditions:character.conditions || [],
      characteristics:character.characteristics || {},
      campaign:character.sharedCampaignId || ''
    });
  }
  function persistReceivedCharacter(id, character, user){
    if(!character || character.ownerUid !== user?.uid || !window.AsteriaFirebase?.saveOwnedCharacterSnapshot) return;
    const signature=receivedCharacterSignature(character);
    if(persistedCharacterSignatures.get(id) === signature) return;
    persistedCharacterSignatures.set(id,signature);
    window.AsteriaFirebase.saveOwnedCharacterSnapshot(id,character).then(saved=>{
      if(!saved && persistedCharacterSignatures.get(id) === signature) persistedCharacterSignatures.delete(id);
    });
  }
  function refreshRealtimePlayer(id){
    if(!id || !document.getElementById('player')?.classList.contains('show')) return;
    window.loadPlayer?.(id);
    window.renderCharacterDashboardNotices?.(id);
    window.deliverCharacterDashboardNotices?.(id);
    window.flashResource?.('xp');
  }
  function repairStaleRewardResolution(campaignId, id, character, rewardIds, user){
    if(character?.ownerUid !== user?.uid || !rewardIds.length || !window.AsteriaFirebase?.resolveCampaignItemReward) return;
    rewardIds.forEach(rewardId=>{
      const key=`${campaignId}:${id}:${rewardId}`;
      if(repairingRewardResolutions.has(key)) return;
      const repair=window.AsteriaFirebase.resolveCampaignItemReward(campaignId,id,rewardId,character)
        .finally(()=>repairingRewardResolutions.delete(key));
      repairingRewardResolutions.set(key,repair);
    });
  }
  function mergeRealtimeCharacters(campaignId, sharedCharacters, options={}){
    const user=window.AsteriaFirebase?.getUser?.();
    if(!user || !sharedCharacters) return;
    window.chars=window.chars||{};
    const campaign=(window.campaigns||[]).find(item=>item?.id===campaignId);
    if(campaign) campaign.characters=Object.assign({},campaign.characters||{});
    const progressionUpdates=[];
    const changedIds=new Set();
    Object.entries(sharedCharacters).forEach(([id,rawIncoming])=>{
      const incoming=rawIncoming;
      const before=window.chars[id]||{};
      const rewardState=mergeItemRewardState(before,incoming);
      const character=Object.assign({},before,incoming,{
        id,
        sharedCampaignId:campaignId,
        linkedCampaignIds:Array.from(new Set([...(before.linkedCampaignIds||[]),...(incoming.linkedCampaignIds||[]),campaignId])),
        pendingItemRewards:rewardState.rewards,
        resolvedItemRewardIds:rewardState.resolvedIds
      });
      if(rewardState.staleResolvedIds.length){
        character.inventory=safeClone(before.inventory || character.inventory || []);
        character.bags=safeClone(before.bags || character.bags || []);
        character.quickSlots=safeClone(before.quickSlots || character.quickSlots || []);
      }
      const changed=realtimeCharacterSignature(before) !== realtimeCharacterSignature(character);
      window.chars[id]=character;
      if(campaign){
        campaign.party=Array.from(new Set([...(campaign.party||[]),id]));
        campaign.characters[id]=Object.assign({},campaign.characters[id]||{},character);
      }
      repairStaleRewardResolution(campaignId,id,character,rewardState.staleResolvedIds,user);
      if(!changed) return;
      changedIds.add(id);
      if(progressionChanged(before,character)){
        progressionUpdates.push({ id, character, previous:before });
        persistReceivedProgression(id,character,user);
      }
      persistReceivedCharacter(id,character,user);
      window.dispatchEvent(new CustomEvent('asteria:character-realtime', {
        detail:{ id, campaignId, character, previous:before, owned:character.ownerUid===user.uid }
      }));
    });
    const current=activeSharedCharacterId(sharedCharacters);
    if(current && changedIds.has(current)){
      refreshRealtimePlayer(current);
      const update=progressionUpdates.find(item=>item.id===current);
      if(update){
        window.dispatchEvent(new CustomEvent('asteria:xp-reward-realtime', {
          detail:Object.assign({ campaignId },update)
        }));
        queueMicrotask(()=>refreshRealtimePlayer(current));
      }
    }
    if(changedIds.size){
      if(document.getElementById('gm')?.classList.contains('show')) window.renderGM?.();
      window.renderPlayerHome?.();
      window.refreshSyncedViews?.();
    }
  }
  function realtimeCampaignTargets(campaigns, user){
    const targets=new Map();
    (campaigns||[]).filter(Boolean).forEach(campaign=>{
      if(campaign?.id) targets.set(String(campaign.id),campaign);
    });
    ownedCharacterIds().forEach(id=>{
      const character=window.chars?.[id];
      if(!character) return;
      const linkedIds=[
        ...(Array.isArray(character.linkedCampaignIds)?character.linkedCampaignIds:[]),
        ...(character.sharedCampaignId?[character.sharedCampaignId]:[])
      ];
      linkedIds.filter(Boolean).forEach(campaignId=>{
        const key=String(campaignId);
        if(!targets.has(key)) targets.set(key,{ id:key, name:character.campaign || 'Linked Campaign' });
      });
    });
    return Array.from(targets.values()).filter(campaign=>{
      if(!campaign?.id) return false;
      if(!campaign.ownerUid && !campaign.gmUids && !campaign.playerUids && !campaign.players) return true;
      return campaign.ownerUid===user.uid
        || campaign.gmId===user.uid
        || (campaign.gmUids||[]).includes(user.uid)
        || (campaign.playerUids||[]).includes(user.uid)
        || campaign.players?.[user.uid];
    });
  }
  function startAccountCampaignDiscovery(){
    const user=window.AsteriaFirebase?.getUser?.();
    if(!user || !window.AsteriaFirebase?.subscribeAccountCampaigns) return;
    if(realtimeUid && realtimeUid!==user.uid) stopRealtimeCampaignSync();
    realtimeUid=user.uid;
    if(accountCampaignUnsubscribe) return;
    accountCampaignUnsubscribe=window.AsteriaFirebase.subscribeAccountCampaigns(campaigns=>{
      mergeCloudCampaigns(campaigns || []);
      setupRealtimeCampaignSync(window.campaigns || []);
      lastCampaignRefresh=Date.now();
    });
  }
  function setupRealtimeCampaignSync(campaigns=window.campaigns||[]){
    const user=window.AsteriaFirebase?.getUser?.();
    if(!user || !window.AsteriaFirebase?.subscribeCampaign || !window.AsteriaFirebase?.subscribeCampaignCharacters) return;
    if(realtimeUid && realtimeUid!==user.uid) stopRealtimeCampaignSync();
    realtimeUid=user.uid;
    startAccountCampaignDiscovery();
    const activeKeys=new Set();
    realtimeCampaignTargets(campaigns,user).forEach(campaign=>{
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
      startAccountCampaignDiscovery();
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
    if(!user) return;
    startAccountCampaignDiscovery();
    if(cloudLoadedForUid === user.uid){
      setupRealtimeCampaignSync(window.campaigns || []);
      return;
    }
    cloudLoadedForUid = user.uid;
    setSyncStatus('Cloud sync: loading account data...', 'info');
    try{
      await window.AsteriaFirebase?.loadCharacters?.();
      startAccountCampaignDiscovery();
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
    mergeCampaignCharacters: mergeRealtimeCharacters,
    mergeCampaignProgression: mergeRealtimeProgression,
    mergeItemRewardState,
    saveAppState,
    readAppState: readAppSystemState,
    status:()=>localMeta()
  };
  window.asteriaDataSync = window.AsteriaDataSync;

  window.addEventListener('asteria:firebase-ready', e=>{
    loadCloudData(e.detail?.source || 'auth');
    setTimeout(()=>scheduleCloudSave('auth-ready'), 1200);
  });
  window.addEventListener('asteria:firebase-sync-error', event=>{
    const detail=event.detail || {};
    const permissionDenied=String(detail.code || '').includes('permission-denied');
    setSyncStatus(
      permissionDenied
        ? 'Cloud delivery blocked by Firestore rules'
        : 'Cloud delivery interrupted - retrying',
      'warn'
    );
    if(permissionDenied){
      toast('Firebase blocked campaign delivery. Deploy the included firestore.rules, then refresh both accounts.');
    }
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
