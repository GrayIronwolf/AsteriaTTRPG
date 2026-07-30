const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/data-sync.js'), 'utf8');
const events = [];
const saved = [];
const renders = [];
const listeners = {};

const playerView = {
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
      return id === 'player' ? playerView : null;
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
        tp:3
      }
    },
    campaigns: [{
      id:'campaign-1',
      party:['hero'],
      characters:{ hero:{ id:'hero', xp:100 } }
    }],
    session:{ role:'account', character:'hero' },
    selected:'hero',
    currentPlayerId() { return 'hero'; },
    loadPlayer(id) { renders.push(id); },
    renderCharacterDashboardNotices() {},
    deliverCharacterDashboardNotices() {},
    flashResource() {},
    renderPlayerHome() {},
    refreshSyncedViews() {},
    addEventListener(type, handler) {
      listeners[`window:${type}`] = handler;
    },
    dispatchEvent(event) {
      events.push(event);
    },
    AsteriaAuthBridge: {
      getSession() { return { role:'account', character:'hero' }; }
    },
    AsteriaFirebase: {
      getUser() { return { uid:'player-1' }; },
      isReady() { return true; },
      saveOwnedCharacterProgress(id, character) {
        saved.push({ id, xp:character.xp, level:character.level });
        return Promise.resolve(true);
      }
    }
  }
};

vm.createContext(context);
vm.runInContext(source, context);

context.window.AsteriaDataSync.mergeCampaignCharacters('campaign-1', {
  hero: {
    id:'hero',
    ownerUid:'player-1',
    name:'Test Hero',
    level:2,
    xp:350,
    xpMax:3000,
    cp:6,
    tp:6,
    progressionSync:{ revision:'xp-test-1', award:2250 }
  }
});

setImmediate(() => {
  const character = context.window.chars.hero;
  const xpEvent = events.find(event => event.type === 'asteria:xp-reward-realtime');
  const failures = [];
  if(character.xp !== 350 || character.level !== 2) failures.push('shared XP and level were not merged');
  if(character.cp !== 6 || character.tp !== 6) failures.push('shared CP and TP were not merged');
  if(!saved.some(entry => entry.id === 'hero' && entry.xp === 350 && entry.level === 2)) failures.push('received progression was not persisted to the owner record');
  if(!renders.includes('hero')) failures.push('active Character Dashboard was not rerendered');
  if(!xpEvent || xpEvent.detail?.id !== 'hero') failures.push('XP real-time event was not dispatched');

  if(failures.length) {
    console.error(`XP real-time sync test failed: ${failures.join('; ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('XP real-time sync test passed.');
});
