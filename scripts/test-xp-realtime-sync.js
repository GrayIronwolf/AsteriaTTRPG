const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/data-sync.js'), 'utf8');
const events = [];
const persisted = [];
const renders = [];
const rewardRepairs = [];
const listeners = {};
let accountCampaignListener = null;
const campaignListeners = new Map();
const characterListeners = new Map();

const visiblePlayerView = {
  classList: {
    contains(name) {
      return name === 'show';
    }
  }
};

const context = {
  console,
  CustomEvent: class CustomEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  },
  clearTimeout,
  setTimeout,
  queueMicrotask,
  localStorage: {
    getItem() { return null; },
    setItem() {}
  },
  document: {
    hidden: false,
    body: { appendChild() {} },
    createElement() {
      return { className:'', dataset:{}, textContent:'' };
    },
    getElementById(id) {
      return id === 'player' ? visiblePlayerView : null;
    },
    addEventListener(type, handler) {
      listeners[`document:${type}`] = handler;
    }
  },
  window: {
    chars: {
      hero: {
        id:'hero',
        ownerUid:'player-1',
        name:'Test Hero',
        level:1,
        xp:100,
        xpMax:2000,
        cp:3,
        tp:3,
        linkedCampaignIds:['campaign-1'],
        inventory:[]
      }
    },
    campaigns: [],
    session:{ role:'account', character:'hero', profile:{ characters:['hero'] } },
    selected:'hero',
    currentPlayerId() { return 'hero'; },
    loadPlayer(id) { renders.push(id); },
    renderCharacterDashboardNotices() {},
    deliverCharacterDashboardNotices() {},
    flashResource() {},
    renderPlayerHome() {},
    renderCampaigns() {},
    refreshSyncedViews() {},
    saveAsteriaState() {},
    addEventListener(type, handler) {
      listeners[`window:${type}`] = handler;
    },
    dispatchEvent(event) {
      events.push(event);
    },
    AsteriaAuthBridge: {
      getSession() {
        return { role:'account', character:'hero', profile:{ characters:['hero'] } };
      }
    },
    AsteriaFirebase: {
      getUser() { return { uid:'player-1' }; },
      isReady() { return true; },
      saveOwnedCharacterProgress() { return Promise.resolve(true); },
      saveOwnedCharacterSnapshot(id, character) {
        persisted.push({
          id,
          xp:character.xp,
          level:character.level,
          inventory:character.inventory,
          rewards:character.pendingItemRewards
        });
        return Promise.resolve(true);
      },
      resolveCampaignItemReward(campaignId, characterId, rewardId, character) {
        rewardRepairs.push({
          campaignId,
          characterId,
          rewardId,
          status:character.pendingItemRewards?.find(reward => reward.id === rewardId)?.status
        });
        return Promise.resolve({ ok:true, applied:true, character });
      },
      subscribeAccountCampaigns(onChange) {
        accountCampaignListener = onChange;
        return () => {};
      },
      subscribeCampaign(id, onChange) {
        campaignListeners.set(id, onChange);
        return () => {};
      },
      subscribeCampaignCharacters(id, onChange) {
        characterListeners.set(id, onChange);
        return () => {};
      }
    }
  }
};

vm.createContext(context);
vm.runInContext(source, context);

context.window.AsteriaDataSync.watchCampaigns([]);
if(typeof accountCampaignListener !== 'function') {
  throw new Error('Account campaign discovery listener was not registered.');
}

accountCampaignListener([{
  id:'campaign-1',
  ownerUid:'gm-1',
  playerUids:['player-1'],
  party:['hero'],
  playerCharacterLinks:{ hero:'player-1' },
  characters:{ hero:{ id:'hero', ownerUid:'player-1', xp:100 } }
}]);

const characterListener = characterListeners.get('campaign-1');
if(typeof characterListener !== 'function') {
  throw new Error('Canonical campaign character listener was not registered.');
}

characterListener({
  hero: {
    id:'hero',
    ownerUid:'player-1',
    name:'Test Hero',
    level:2,
    xp:350,
    xpMax:3000,
    cp:6,
    tp:6,
    hp:[27,40],
    sp:[30,40],
    mp:[20,30],
    progressionSync:{ revision:'live-test-1', award:2250 },
    inventory:[{ id:'reward-sword', name:'Reward Sword', qty:1, location:'inventory' }],
    pendingItemRewards:[{
      id:'reward-1',
      status:'pending',
      item:{ id:'reward-sword', name:'Reward Sword', qty:1 }
    }]
  }
});

const initialPendingMerged = context.window.chars.hero.pendingItemRewards?.[0]?.id === 'reward-1'
  && context.window.chars.hero.pendingItemRewards?.[0]?.status === 'pending';
setImmediate(() => {
  context.window.chars.hero.pendingItemRewards[0].status = 'accepted';
  context.window.chars.hero.pendingItemRewards[0].resolvedAt = '2026-07-30T00:00:00.000Z';
  context.window.chars.hero.resolvedItemRewardIds = ['reward-1'];
  const renderCountBeforeStaleReward = renders.length;
  const eventCountBeforeStaleReward = events.length;

  characterListener({
    hero: {
      id:'hero',
      ownerUid:'player-1',
      name:'Test Hero',
      level:2,
      xp:350,
      xpMax:3000,
      cp:6,
      tp:6,
      hp:[27,40],
      sp:[30,40],
      mp:[20,30],
      progressionSync:{ revision:'live-test-1', award:2250 },
      inventory:[{ id:'reward-sword', name:'Reward Sword', qty:1, location:'inventory' }],
      pendingItemRewards:[{
        id:'reward-1',
        status:'pending',
        item:{ id:'reward-sword', name:'Reward Sword', qty:1 }
      }]
    }
  });

  setImmediate(() => {
    const character = context.window.chars.hero;
    const xpEvent = events.find(event => event.type === 'asteria:xp-reward-realtime');
    const characterEvent = events.find(event => event.type === 'asteria:character-realtime');
    const failures = [];

    if(!campaignListeners.has('campaign-1')) failures.push('campaign root listener was not registered');
    if(character.xp !== 350 || character.level !== 2) failures.push('XP and level were not merged');
    if(character.cp !== 6 || character.tp !== 6) failures.push('CP and TP were not merged');
    if(character.inventory?.[0]?.id !== 'reward-sword') failures.push('loot inventory was not merged');
    if(!initialPendingMerged) failures.push('pending loot notification was not initially merged');
    if(character.pendingItemRewards?.[0]?.status !== 'accepted') failures.push('a stale pending reward replaced the accepted resolution');
    if(character.resolvedItemRewardIds?.filter(id => id === 'reward-1').length !== 1) failures.push('the resolved reward ledger is not idempotent');
    if(character.inventory?.length !== 1 || character.inventory[0]?.qty !== 1) failures.push('a stale reward snapshot duplicated or removed inventory');
    if(renders.length !== renderCountBeforeStaleReward) failures.push('a stale reward snapshot rerendered the dashboard');
    if(events.length !== eventCountBeforeStaleReward) failures.push('a stale reward snapshot dispatched redundant realtime events');
    if(!rewardRepairs.some(repair =>
      repair.campaignId === 'campaign-1'
      && repair.characterId === 'hero'
      && repair.rewardId === 'reward-1'
      && repair.status === 'accepted'
    )) failures.push('the stale canonical reward was not repaired');
    if(!persisted.some(entry =>
      entry.id === 'hero'
      && entry.xp === 350
      && entry.inventory?.[0]?.id === 'reward-sword'
      && entry.rewards?.[0]?.id === 'reward-1'
    )) failures.push('the received full character snapshot was not persisted to the player account');
    if(!renders.includes('hero')) failures.push('active Character Dashboard was not rerendered');
    if(!xpEvent || xpEvent.detail?.id !== 'hero') failures.push('XP real-time event was not dispatched');
    if(!characterEvent || characterEvent.detail?.campaignId !== 'campaign-1') failures.push('character delivery event was not dispatched');

    if(failures.length) {
      console.error(`Live character delivery test failed: ${failures.join('; ')}`);
      process.exitCode = 1;
      return;
    }
    console.log('Live XP and loot delivery test passed.');
  });
});
