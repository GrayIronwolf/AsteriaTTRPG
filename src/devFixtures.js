import { SESSION_LIMIT_MS, applyCharacteristicPoints, nextSkillProgress, parseResourceCost, slug, talentRankCost } from './state/liveWorkspaceModel.mjs';

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
      cp: 4, tp: 18, magicTypes: ['Light', 'Space', 'Life'],
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
      racialTraits: [{ name:'Mana Sensitive', description:'Cavern Sprites can sense nearby magical currents.', effects:['Detect nearby active magic.'] }],
      conditions: [], inventory: [
        { id:'field-notebook', name:'Field Notebook', qty:1, type:'Tool', rarity:'Common' },
        { id:'health-potion', name:'Health Potion', qty:3, type:'Consumable', rarity:'Common', effect:{ hp:10 } },
        { id:'iron-longsword', name:'Iron Longsword', qty:1, type:'Weapon', rarity:'Common', allowedSlots:['Main Weapon','Secondary Weapon'] }
      ],
      quests:[{ id:'echoes-below', name:'Echoes Below', description:'Investigate the singing caverns.', status:'Active' }],
      journal:[{ id:'journal-1', title:'Arrival', body:'We reached the cavern gate before nightfall.', createdAt:new Date().toISOString() }],
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
  let session = { id: 'session-001', status: 'active', number: 7, startedAt: Date.now(), expiresAt:Date.now()+SESSION_LIMIT_MS, maxDurationHours:10 };
  let events = [];
  let encounter = { status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] };
  let partyWorkspace={ sharedNotes:'Meet at the western gate before the next expedition.', questLog:[] };
  let partyChat=[{ id:'chat-1', characterId:'lyra', ownerUid:'player-lyra', characterName:'Lyra', text:'I will bring the healing supplies.', createdAt:new Date().toISOString() }];
  let itemEcosystem={
    shops:[{ id:'moon-market', name:'Moon Market', type:'General Merchant', status:'open', visitorCharacterIds:['kael'], stock:[{ qty:4, priceCopper:25, item:{ id:'mana-vial', name:'Mana Vial', type:'Consumable', rarity:'Common', effect:{mp:10} } }] }],
    directTrades:[], partyLoot:[], sharedStorages:[]
  };
  const listeners = { campaign: [], characters: [], session: [], presence: [], events: [], encounter: [], partyWorkspace:[], partyChat:[], itemEcosystem:[] };
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
    if(key === 'partyWorkspace') callback(clone(partyWorkspace));
    if(key === 'partyChat') callback(clone(partyChat));
    if(key === 'itemEcosystem') callback(clone(itemEcosystem));
  });
  const subscribe = (key, callback) => {
    document.documentElement.dataset.asteriaFixtureSubscription = key;
    listeners[key].push(callback);
    queueMicrotask(() => notify(key));
    return () => { listeners[key] = listeners[key].filter(value => value !== callback); };
  };
  const eventId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const requireFixtureSession=()=>{
    if(session.status !== 'active' || Date.now() >= Number(session.expiresAt || 0)) throw new Error('The GM must start the session before this dashboard can be edited.');
  };
  const updateCharacter=(characterId,updater)=>{
    requireFixtureSession();
    const current=characters[characterId];
    if(!current) throw new Error('Character not found.');
    const next=updater(clone(current)) || current;
    characters[characterId]=next;
    notify('characters');
    return next;
  };

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
    subscribePartyWorkspace: (_campaignId, callback) => subscribe('partyWorkspace', callback),
    subscribePartyChat: (_campaignId, callback) => subscribe('partyChat', callback),
    subscribeCampaignItemEcosystem: (_campaignId, callback) => subscribe('itemEcosystem', callback),
    saveCampaignEncounter: async (_campaignId, next) => { encounter = { ...encounter, ...clone(next) }; notify('encounter'); return { ok:true }; },
    startLiveSession: async () => { const now=Date.now(); session = { ...session, id: session.id || eventId('session'), status: 'active', startedAt:session.startedAt||now, expiresAt:Number(session.expiresAt)>now?session.expiresAt:now+SESSION_LIMIT_MS, maxDurationHours:10 }; notify('session'); return { ok: true, session: clone(session) }; },
    pauseLiveSession: async () => { session = { ...session, status: 'paused' }; notify('session'); return { ok: true }; },
    endLiveSession: async (_campaignId,reason='gm-ended') => { session = { ...session, status: 'ended', endReason:reason, endedAt: Date.now() }; notify('session'); return { ok: true }; },
    expireLiveSession: async () => { if(Date.now()>=Number(session.expiresAt||0)) { session={...session,status:'ended',endReason:'time-limit',endedAt:Date.now()};notify('session'); } return {ok:true}; },
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
      updateCharacter(characterId,character=>{const resource=character[key];if(Array.isArray(resource))resource[0]=Math.max(0,Math.min(resource[1],resource[0]+Number(amount||0)));return character;});return {ok:true};
    },
    spendCharacteristicPoints: async (_campaignId,characterId,key,amount) => {
      const applied=applyCharacteristicPoints(characters[characterId],key,amount);updateCharacter(characterId,()=>applied.character);return {ok:true,applied:applied.applied};
    },
    purchaseTalentRank: async (_campaignId,characterId,talent) => {
      const character=characters[characterId];const current=(character.talents||{})[talent.name]?.rank||character.unlockedTalents?.find(value=>value.name===talent.name)?.rank||0;const cost=talentRankCost(current+1);
      if(Number(character.tp||0)<cost)return {ok:false,error:`Rank ${current+1} costs ${cost} TP.`};
      updateCharacter(characterId,next=>{next.tp=Number(next.tp||0)-cost;next.talents={...(next.talents||{}),[talent.name]:{...talent,rank:current+1,unlocked:true}};next.unlockedTalents=Object.values(next.talents);return next;});return {ok:true,rank:current+1,cost};
    },
    recordSkillSuccess: async (_campaignId,characterId,skill) => {
      let progress;updateCharacter(characterId,next=>{const key=slug(skill.name);progress=nextSkillProgress(next.skillProgress?.[key]||{name:skill.name,rank:skill.rank||skill.rankName,successes:skill.successes});next.skillProgress={...(next.skillProgress||{}),[key]:progress};return next;});return {ok:true,progress};
    },
    castCharacterSpell: async (_campaignId,characterId,spell,costs) => {
      updateCharacter(characterId,next=>{for(const [resource,amount] of Object.entries(costs||parseResourceCost(spell.cost))){if(Number(next[resource]?.[0]||0)<amount)throw new Error(`Not enough ${resource.toUpperCase()}.`);next[resource]=[next[resource][0]-amount,next[resource][1]];}return next;});return {ok:true};
    },
    updateCharacterInventory: async (_campaignId,characterId,operation) => {
      updateCharacter(characterId,next=>{const items=next.inventory||[];const index=items.findIndex(item=>String(item.id)===String(operation.itemId));const item=items[index];if(!item)throw new Error('Item not found.');if(operation.type==='equip'){item.equipped=true;item.equippedSlot=operation.slot;}if(operation.type==='unequip'){item.equipped=false;item.equippedSlot='';}if(operation.type==='quick'){next.quickSlots=[...(next.quickSlots||[])];next.quickSlots[operation.index]=clone(item);}if(operation.type==='use'){item.qty=Math.max(0,Number(item.qty||1)-1);for(const [resource,amount] of Object.entries(item.effect||{})){if(Array.isArray(next[resource]))next[resource][0]=Math.min(next[resource][1],next[resource][0]+Number(amount||0));}next.inventory=items.filter(value=>Number(value.qty||1)>0);}return next;});return {ok:true};
    },
    updateCharacterQuest: async (_campaignId,characterId,questId,status) => {updateCharacter(characterId,next=>{next.quests=(next.quests||[]).map(quest=>quest.id===questId?{...quest,status}:quest);return next;});return {ok:true};},
    addJournalEntry: async (_campaignId,characterId,entry) => {updateCharacter(characterId,next=>{next.journal=[{id:eventId('journal'),...entry,createdAt:new Date().toISOString()},...(next.journal||[])];return next;});return {ok:true};},
    updatePartyNotes: async (_campaignId,notes) => {requireFixtureSession();partyWorkspace={...partyWorkspace,sharedNotes:notes};notify('partyWorkspace');return {ok:true};},
    sendPartyMessage: async (_campaignId,characterId,text) => {requireFixtureSession();partyChat=[...partyChat,{id:eventId('chat'),characterId,ownerUid:'player-demo',characterName:characters[characterId]?.name||'Character',text,createdAt:new Date().toISOString()}];notify('partyChat');return {ok:true};},
    resolveLootReward: async (_campaignId,characterId,id,action,slot) => {requireFixtureSession();const event=events.find(value=>value.id===id);if(!event)return {ok:false,error:'Reward not found.'};if(action!=='declined')updateCharacter(characterId,next=>{const item={...event.payload.item,id:event.payload.item.id||eventId('item'),equipped:action==='equip',equippedSlot:action==='equip'?slot:''};next.inventory=[...(next.inventory||[]),item];return next;});events=events.map(value=>value.id===id?{...value,status:action==='declined'?'declined':action==='equip'?'equipped':'accepted',resolvedAt:new Date().toISOString()}:value);notify('events');return {ok:true};},
    buyLiveShopItem: async (_campaignId,characterId,shopId,stockIndex,quantity) => {requireFixtureSession();const shop=itemEcosystem.shops.find(value=>value.id===shopId);const stock=shop?.stock?.[stockIndex];if(!stock||stock.qty<quantity)return {ok:false,error:'Item unavailable.'};updateCharacter(characterId,next=>{next.inventory=[...(next.inventory||[]),{...stock.item,id:eventId('item'),qty:quantity}];return next;});stock.qty-=quantity;notify('itemEcosystem');return {ok:true};},
    sellLiveShopItem: async (_campaignId,characterId,_shopId,itemId) => {updateCharacter(characterId,next=>{const item=next.inventory.find(value=>value.id===itemId);if(!item)throw new Error('Item not found.');item.qty-=1;next.inventory=next.inventory.filter(value=>value.qty>0);return next;});return {ok:true};},
    createLiveTrade: async (_campaignId,characterId,recipientId,itemId,quantity,note) => {requireFixtureSession();const item=characters[characterId].inventory.find(value=>value.id===itemId);if(!item)return {ok:false,error:'Item not found.'};itemEcosystem.directTrades=[...itemEcosystem.directTrades,{id:eventId('trade'),fromCharacterId:characterId,toCharacterId:recipientId,item:clone(item),quantity,note,status:'pending'}];notify('itemEcosystem');return {ok:true};},
    respondLiveTrade: async (_campaignId,characterId,tradeId,accepted) => {requireFixtureSession();const trade=itemEcosystem.directTrades.find(value=>value.id===tradeId);if(!trade||trade.toCharacterId!==characterId)return {ok:false,error:'Trade unavailable.'};trade.status=accepted?'accepted':'declined';if(accepted)updateCharacter(characterId,next=>{next.inventory=[...(next.inventory||[]),{...trade.item,id:eventId('item'),qty:trade.quantity}];return next;});notify('itemEcosystem');return {ok:true};}
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
