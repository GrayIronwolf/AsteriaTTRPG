const DEMO_CAMPAIGN_ID = 'demo-campaign';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function installDevFixtures() {
  if(new URLSearchParams(window.location.search).get('reactFixture') !== '1') return false;
  document.documentElement.dataset.asteriaReactFixture = 'active';

  const campaign = {
    id: DEMO_CAMPAIGN_ID,
    name: 'Shadows of Elarion',
    ucn: '204015717454',
    gmId: 'gm-demo',
    party: ['kael', 'lyra']
  };
  const characters = {
    kael: {
      id: 'kael', ownerUid: 'player-demo', campaignId: DEMO_CAMPAIGN_ID,
      name: 'Kael', race: 'Cavern Sprite', klass: 'Artificer', level: 12,
      hp: [74, 96], sp: [60, 80], mp: [110, 140], xp: 11800, xpMax: 16000,
      characteristics: { str: 12, dex: 18, agi: 17, con: 16, end: 15, int: 20, wis: 14, cha: 11, lck: 13 },
      equipment: { Head: { name: 'Leather Hood' }, Chest: { name: 'Iron Breastplate' }, Back: { name: 'Traveller Cloak' }, 'Main Weapon': { name: 'Iron Longsword' }, 'Secondary Weapon': { name: 'Longbow' }, Shield: { name: 'Wooden Shield' } },
      quickSlots: [{ name: 'Health Potion' }, { name: 'Stamina Potion' }, { name: 'Mana Potion' }],
      unlockedTalents: [
        { name: 'Gadgeteer\'s Gambit', tier: 1, rank: 3, cost: '2 SP' },
        { name: 'Quick Assembly', tier: 2, rank: 2, cost: '4 SP' },
        { name: 'Item Analysis', tier: 2, rank: 1 }
      ],
      spells: [
        { name: 'Arcane Edge', element: 'Light', cost: 4 },
        { name: 'Mana Step', element: 'Space', cost: 6 },
        { name: 'Mending Spark', element: 'Life', cost: 3 }
      ],
      skills: [{ name: 'Engineering', rankName: 'Adept' }, { name: 'Alchemy', rankName: 'Journeyman' }, { name: 'Perception', rankName: 'Apprentice' }],
      conditions: [], inventory: [{ name: 'Field Notebook' }],
      coins: { Copper: 42, Silver: 18, Gold: 9, 'Platinum Crown': 1 }
    },
    lyra: {
      id: 'lyra', ownerUid: 'player-lyra', campaignId: DEMO_CAMPAIGN_ID,
      name: 'Lyra', race: 'Air Pixie', klass: 'Druid', level: 8,
      hp: [62, 70], sp: [54, 65], mp: [92, 110], xp: 7200, xpMax: 10000,
      characteristics: { str: 8, dex: 17, agi: 19, con: 13, end: 12, int: 16, wis: 18, cha: 15, lck: 14 },
      quickSlots: [{ name: 'Healing Salve' }], unlockedTalents: [], spells: [],
      skills: [{ name: 'Nature', rankName: 'Adept' }], conditions: [{ name: 'Blessed' }],
      coins: { Copper: 12, Silver: 31, Gold: 4 }
    }
  };
  let session = { id: 'session-001', status: 'active', number: 7, startedAt: Date.now() };
  let events = [];
  let encounter = { status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] };
  const listeners = { campaign: [], characters: [], session: [], presence: [], events: [], encounter: [] };
  const presence = {
    'gm-demo': { uid: 'gm-demo', state: 'online', mode: 'gm' },
    'player-demo': { uid: 'player-demo', state: 'online', mode: 'character', characterId: 'kael' }
  };

  const notify = key => listeners[key].forEach(callback => {
    if(key === 'campaign') callback(clone(campaign));
    if(key === 'characters') callback(clone(characters));
    if(key === 'session') callback(clone(session));
    if(key === 'presence') callback(clone(presence));
    if(key === 'events') callback(clone(events));
    if(key === 'encounter') callback(clone(encounter));
  });
  const subscribe = (key, callback) => {
    document.documentElement.dataset.asteriaFixtureSubscription = key;
    listeners[key].push(callback);
    queueMicrotask(() => notify(key));
    return () => { listeners[key] = listeners[key].filter(value => value !== callback); };
  };
  const eventId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const fixtureApi = {
    isReady: () => true,
    getUser: () => ({ uid: 'player-demo', email: 'preview@asteria.local' }),
    getProfile: () => ({ uid: 'player-demo', displayName: 'Preview Player' }),
    loadCharacters: async () => clone(characters),
    loadCampaigns: async () => [clone(campaign)],
    loadState: async () => ({}),
    saveCharacter: async (characterId, character) => {
      if(characterId && character) characters[characterId] = { ...characters[characterId], ...clone(character), id: characterId };
      notify('characters');
      return { ok: true };
    },
    saveCampaign: async (_campaignId, nextCampaign) => {
      if(nextCampaign) Object.assign(campaign, clone(nextCampaign));
      notify('campaign');
      return { ok: true };
    },
    saveState: async () => ({ ok: true }),
    subscribeCampaign: (_campaignId, callback) => subscribe('campaign', callback),
    subscribeCampaignCharacters: (_campaignId, callback) => subscribe('characters', callback),
    subscribeLiveSession: (_campaignId, callback) => subscribe('session', callback),
    subscribeSessionPresence: (_campaignId, _sessionId, callback) => subscribe('presence', callback),
    subscribeCampaignEvents: (_campaignId, callback) => subscribe('events', callback),
    subscribeCampaignEncounter: (_campaignId, callback) => subscribe('encounter', callback),
    saveCampaignEncounter: async (_campaignId, next) => { encounter = { ...encounter, ...clone(next) }; notify('encounter'); return { ok:true }; },
    startLiveSession: async () => { session = { ...session, id: session.id || eventId('session'), status: 'active' }; notify('session'); return { ok: true, session: clone(session) }; },
    pauseLiveSession: async () => { session = { ...session, status: 'paused' }; notify('session'); return { ok: true }; },
    endLiveSession: async () => { session = { ...session, status: 'ended', endedAt: Date.now() }; notify('session'); return { ok: true }; },
    setSessionPresence: async (_campaignId, _sessionId, state) => { presence['player-demo'] = { uid: 'player-demo', ...state }; notify('presence'); return { ok: true }; },
    acknowledgeCampaignEvent: async (_campaignId, id, patch) => { events = events.map(event => event.id === id ? { ...event, acknowledged: true, ...patch } : event); notify('events'); return { ok: true }; },
    grantCampaignXP: async (_campaignId, characterId, amount, metadata = {}) => {
      const character = characters[characterId];
      character.xp += Number(amount || 0);
      const event = { id: eventId('xp'), campaignId: DEMO_CAMPAIGN_ID, type: 'xp-reward', status: 'delivered', deliveryStatus: 'delivered', targetCharacterId: characterId, payload: { amount: Number(amount), reason: metadata.reason, characterName: character.name } };
      events = [event, ...events]; notify('characters'); notify('events'); return { ok: true, eventId: event.id };
    },
    createLootReward: async (_campaignId, characterId, item, metadata = {}) => {
      const event = { id: eventId('loot'), campaignId: DEMO_CAMPAIGN_ID, type: 'loot-reward', status: 'pending', targetCharacterId: characterId, payload: { item, message: metadata.message, campaignName: campaign.name } };
      events = [event, ...events]; notify('events'); return { ok: true, eventId: event.id };
    },
    createMagicElementReward: async (_campaignId, characterId, magicType, metadata = {}) => {
      const character=characters[characterId];
      const event={ id:eventId('magic'), campaignId:DEMO_CAMPAIGN_ID, type:'magic-element-reward', status:'pending', targetCharacterId:characterId, targetOwnerUid:character?.ownerUid || 'player-demo', payload:{ magicType, message:metadata.message, characterName:character?.name } };
      events=[event,...events]; notify('events'); return { ok:true, eventId:event.id };
    },
    respondMagicElementReward: async (_campaignId, characterId, id, accepted) => {
      const event=events.find(value => value.id === id);
      if(accepted && event){
        const character=characters[characterId];
        character.gmGrantedMagicTypes=Array.from(new Set([...(character.gmGrantedMagicTypes || []),event.payload.magicType]));
        character.character={ ...(character.character || {}), magic:{ ...(character.character?.magic || {}), gmGrantedTypes:character.gmGrantedMagicTypes.slice() } };
        notify('characters');
      }
      events=events.map(value => value.id === id ? { ...value, status:accepted ? 'accepted' : 'declined', acknowledged:true, resolvedAt:new Date().toISOString() } : value);
      notify('events'); return { ok:true, applied:true };
    },
    updateCampaignCharacterResource: async (_campaignId, characterId, key, amount) => {
      const resource = characters[characterId]?.[key];
      if(Array.isArray(resource)) resource[0] = Math.max(0, Math.min(resource[1], resource[0] + Number(amount || 0)));
      notify('characters'); return { ok: true };
    }
  };
  Object.defineProperty(window, 'AsteriaFirebase', {
    configurable: true,
    get: () => fixtureApi,
    set: () => {}
  });

  window.AsteriaInventory = Object.assign(window.AsteriaInventory || {}, {
    catalogEntries: () => [{ id: 'health-potion', name: 'Health Potion', title: 'Health Potion', itemClass: 'Common' }, { id: 'iron-longsword', name: 'Iron Longsword', title: 'Iron Longsword', itemClass: 'Common', type: 'Weapon' }],
    itemSnapshot: (item, quantity) => ({ ...item, name: item.name || item.title, qty: Number(quantity || 1) }),
    inferSlots: item => String(item?.type || '').toLowerCase().includes('weapon') ? ['Main Weapon', 'Secondary Weapon'] : [],
    resolveReward: async (_characterId, reward) => { events = events.map(event => event.id === reward.id ? { ...event, status: 'accepted', resolvedAt: new Date().toISOString() } : event); notify('events'); return true; }
  });
  window.dispatchEvent(new CustomEvent('asteria:firebase-ready'));
  return true;
}
