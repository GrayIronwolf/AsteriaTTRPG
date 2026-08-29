import { SESSION_LIMIT_MS, applyCharacteristicAllocations, applyCharacteristicPoints, characterKnowsIdentify, firstFreeStorageSlot, nextSkillProgress, normalizeCharacterStorages, normalizeDashboardPreferences, parseResourceCost, slug, stackableStorageItem, talentRankCost, unidentifiedItemName } from './state/liveWorkspaceModel.mjs';
import { createAsteriaItem, getPlayerPurchasePriceCopper, getPlayerSaleValueCopper, marketPricingStatus, normalizeMarketPricing } from './systems/items/marketPricing.mjs';

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
    gmId: 'gm-demo', ownerUid:'player-demo', gmUids:['player-demo'],
    party: ['kael', 'lyra']
  };
  const characters = {
    kael: {
      id: 'kael', ownerUid: 'player-demo', campaignId: DEMO_CAMPAIGN_ID,
      name: 'Kael', race: 'Cavern Sprite', klass: 'Artificer', level: 12, naturalAC:2, armourType:'Medium Armour',
      image: 'assets/races/cavern-sprite/cavern-sprite-male-adult.png',
      gallery: [{ id:'gallery-kael-1', url:'assets/races/cavern-sprite/cavern-sprite-male-adult.png', name:'Cavern Sprite Portrait' }],
      hp: [74, 96], sp: [60, 80], mp: [110, 140], xp: 11800, xpMax: 16000,
      cp: 4, tp: 18, magicTypes: ['Light', 'Space', 'Life'],
      characteristics: { str: 12, dex: 18, agi: 17, con: 16, end: 15, int: 20, wis: 14, cha: 11, lck: 13 },
      equipment: {
        Head: { id:'leather-cap-equipped', name:'Leather Cap', type:'Armour', material:'Leather', materialBaseAC:1, quality:'Average', armourPieceType:'cap', armourType:'Medium Armour', equipped:true, equippedSlot:'Head' },
        Torso: { id:'iron-breastplate-equipped', name:'Iron Breastplate', type:'Armour', material:'Iron', materialBaseAC:1, quality:'Average', armourPieceType:'breastplate', armourType:'Medium Armour', equipped:true, equippedSlot:'Torso' },
        Back: { name: 'Traveller Cloak' },
        'Main Weapon': { name: 'Iron Longsword' },
        'Secondary Weapon': { name: 'Longbow' },
        'Off-Hand': { id:'wooden-shield-equipped', name:'Wooden Shield', type:'Shield', material:'Wood', materialBaseAC:0, quality:'Average', armourPieceType:'roundShield', equipped:true, equippedSlot:'Off-Hand' }
      },
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
      storageLimit:3, storages:[{ id:'kael-personal-chest', name:'Personal Chest', order:0, rows:4, cols:4, maxSlots:16 }],
      conditions: [], inventory: [
        { id:'field-notebook', name:'Field Notebook', qty:1, type:'Tool', rarity:'Common' },
        { id:'health-potion', name:'Health Potion', qty:3, type:'Consumable', rarity:'Common', effect:{ hp:10 } },
        { id:'iron-longsword', name:'Iron Longsword', qty:1, type:'Weapon', rarity:'Common', allowedSlots:['Main Weapon','Secondary Weapon'] },
        { id:'mana-potion', name:'Mana Potion', qty:2, type:'Consumable', rarity:'Common', effect:{ mp:10 } },
        { id:'iron-ore', name:'Iron Ore', qty:8, type:'Material', rarity:'Common' },
        { id:'antimony-ingot', name:'Antimony Ingot', qty:2, type:'Material', rarity:'Uncommon' },
        { id:'rope', name:'Rope', qty:1, type:'Tool', rarity:'Common' },
        { id:'rations', name:'Iron Rations', qty:6, type:'Consumable', rarity:'Common' }
        ,{ id:'sealed-relic', name:'Sealed Relic', trueName:'Moonwell Reliquary', qty:1, type:'Magic Item', rarity:'Rare', identified:false, description:'A silver reliquary carrying a dormant lunar blessing.' }
      ],
      quests:[{ id:'echoes-below', name:'Echoes Below', description:'Investigate the singing caverns.', status:'Active' }],
      journal:[{ id:'journal-1', title:'Arrival', body:'We reached the cavern gate before nightfall.', createdAt:new Date().toISOString() }],
      coins: { Copper: 42, Silver: 18, Gold: 9, 'Platinum Crown': 1 }
    },
    lyra: {
      id: 'lyra', ownerUid: 'player-lyra', campaignId: DEMO_CAMPAIGN_ID,
      name: 'Lyra', race: 'Air Pixie', klass: 'Druid', level: 8,
      image: 'assets/races/air-pixie/air-pixie-female-adult.png',
      hp: [62, 70], sp: [54, 65], mp: [92, 110], xp: 7200, xpMax: 10000,
      characteristics: { str: 8, dex: 17, agi: 19, con: 13, end: 12, int: 16, wis: 18, cha: 15, lck: 14 },
      quickSlots: [{ name: 'Healing Salve' }], unlockedTalents: [], spells: [{ name:'Identify', element:'Spirit', cost:4 }],
      storageLimit:3, storages:[{ id:'lyra-field-pack', name:'Field Pack', order:0, rows:4, cols:4, maxSlots:16 }],
      skills: [{ name: 'Nature', rankName: 'Adept' }], conditions: [{ name: 'Blessed' }],
      inventory:[{ id:'healing-salve', name:'Healing Salve', qty:2, type:'Consumable', rarity:'Common', effect:{hp:8}, storageId:'lyra-field-pack', storageSlot:0 }],
      coins: { Copper: 12, Silver: 31, Gold: 4 }
    }
  };
  let session = { id: 'session-001', status: 'active', number: 7, startedAt: Date.now(), expiresAt:Date.now()+SESSION_LIMIT_MS, maxDurationHours:10 };
  let events = [];
  let encounter = { status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] };
  let gmWorkspace=null;
  let partyWorkspace={ sharedNotes:'Meet at the western gate before the next expedition.', questLog:[] };
  let partyChat=[{ id:'chat-1', characterId:'lyra', ownerUid:'player-lyra', characterName:'Lyra', text:'I will bring the healing supplies.', createdAt:new Date().toISOString() }];
  let itemEcosystem={
    shops:[{ id:'moon-market', name:'Moon Market', type:'General Merchant', status:'open', buyModifier:1, sellModifier:1, currencyCopper:100000, visitorCharacterIds:['kael'], stock:[{ qty:4, priceCopper:25, item:{ id:'mana-vial', name:'Mana Vial', type:'Consumable', rarity:'Common', marketValue:.15, marketPrice:.25, effect:{mp:10} } }] }],
    playerItemRequests:[], directTrades:[], partyLoot:[], sharedStorages:[]
  };
  let customItems=[];
  const listeners = { campaign: [], characters: [], session: [], presence: [], events: [], encounter: [], gmWorkspace:[], partyWorkspace:[], partyChat:[], itemEcosystem:[], customItems:[] };
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
    if(key === 'gmWorkspace') callback(gmWorkspace ? clone(gmWorkspace) : null);
    if(key === 'partyWorkspace') callback(clone(partyWorkspace));
    if(key === 'partyChat') callback(clone(partyChat));
    if(key === 'itemEcosystem') callback(clone(itemEcosystem));
    if(key === 'customItems') callback(clone(customItems));
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
  const fixtureCurrencyTotal=character=>{
    const coins=character.coins||character.coinPouch||{};
    return [['royal_platinum',10000000000],['royal_crown',100000000],['platinum_crown',1000000],['gold',10000],['silver',100],['copper',1]].reduce((sum,[key,value])=>{
      const title=key.split('_').map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ');
      return sum+Number(coins[key]??coins[key.replaceAll('_',' ')]??coins[title]??0)*value;
    },0);
  };
  const setFixtureCurrencyTotal=(character,total)=>{
    let remainder=Math.max(0,Math.floor(Number(total||0)));
    character.coins={};
    [['Royal Platinum',10000000000],['Royal Crown',100000000],['Platinum Crown',1000000],['Gold',10000],['Silver',100],['Copper',1]].forEach(([key,value])=>{character.coins[key]=Math.floor(remainder/value);remainder%=value;});
  };
  const placeFixtureItem=(character,source,storageId='')=>{
    character.storages=normalizeCharacterStorages(character);
    const requested=character.storages.find(value=>value.id===storageId);
    const candidates=[requested,...character.storages].filter((value,index,all)=>value&&all.findIndex(record=>record.id===value.id)===index);
    if(!candidates.length)throw new Error(`${character.name} needs a storage container before receiving items.`);
    const item={...clone(source),qty:Math.max(1,Number(source.qty||1)),equipped:false,equippedSlot:''};
    character.inventory=Array.isArray(character.inventory)?character.inventory:[];
    for(const storage of candidates){
      const stacked=stackableStorageItem(character.inventory,item,storage.id);
      if(stacked){stacked.qty=Number(stacked.qty||1)+item.qty;return stacked;}
    }
    const placement=candidates.map(storage=>({storage,slot:firstFreeStorageSlot(character.inventory,storage)})).find(value=>value.slot>=0);
    if(!placement)throw new Error(`Every storage container for ${character.name} is full.`);
    const received={...item,id:eventId(slug(item.trueName||item.name||'item')),storageId:placement.storage.id,storageSlot:placement.slot};
    character.inventory.push(received);
    return received;
  };
  const itemRequestById=requestId=>(itemEcosystem.playerItemRequests||[]).find(value=>String(value.id)===String(requestId));

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
    subscribeGMWorkspace: (_campaignId, callback) => subscribe('gmWorkspace', callback),
    subscribePartyWorkspace: (_campaignId, callback) => subscribe('partyWorkspace', callback),
    subscribePartyChat: (_campaignId, callback) => subscribe('partyChat', callback),
    subscribeCampaignItemEcosystem: (_campaignId, callback) => subscribe('itemEcosystem', callback),
    subscribeCustomItems: callback => subscribe('customItems', callback),
    saveCampaignEncounter: async (_campaignId, next) => { encounter = { ...encounter, ...clone(next) }; notify('encounter'); return { ok:true }; },
    saveGMWorkspace: async (_campaignId,patch) => { gmWorkspace={...(gmWorkspace||{}),...clone(patch),version:'asteria-react-gm-workspace-v1'};notify('gmWorkspace');return {ok:true}; },
    assignCampaignQuest: async (_campaignId,quest,ids) => {(ids||[]).forEach(id=>{const character=characters[id];if(!character)return;const quests=[...(character.quests||[])];const index=quests.findIndex(value=>value.id===quest.id);if(index>=0)quests[index]={...quests[index],...clone(quest)};else quests.push(clone(quest));character.quests=quests;});notify('characters');return {ok:true,assigned:(ids||[]).length};},
    updateCampaignDetails: async (_campaignId,patch) => {Object.assign(campaign,clone(patch));notify('campaign');return {ok:true};},
    manageCampaignShop: async (_campaignId,action={}) => {const shops=[...(itemEcosystem.shops||[])];const shopId=String(action.shopId||action.shop?.id||'');const index=shops.findIndex(value=>String(value.id)===shopId);if(action.type==='delete'){if(index>=0)shops.splice(index,1);}else if(action.type==='stock'){if(index<0)return {ok:false,error:'Shop not found.'};shops[index].stock=[...(shops[index].stock||[]),{item:clone(action.item),qty:Number(action.quantity||1)}];}else if(action.type==='remove-stock'){if(index>=0)shops[index].stock=(shops[index].stock||[]).filter((_value,row)=>row!==Number(action.stockIndex));}else{const shop={id:shopId||eventId('shop'),name:'Campaign Shop',type:'General Goods',status:'closed',buyModifier:1,sellModifier:1,currencyCopper:100000,visitorCharacterIds:[],stock:[],...clone(action.shop||{})};if(index>=0)shops[index]=shop;else shops.push(shop);}itemEcosystem={...itemEcosystem,shops};notify('itemEcosystem');return {ok:true,shops:clone(shops)};},
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
      const priced=normalizeMarketPricing(clone(item),{legacy:true,removeLegacy:true,migratedRecord:true});const realName=priced.trueName||priced.name||priced.title||'Unknown Item';const unknown={...priced,trueName:realName,basicName:priced.basicName||unidentifiedItemName({...priced,identified:false}),identified:metadata.identified===true,name:metadata.identified===true?realName:priced.basicName||unidentifiedItemName({...priced,identified:false})};
      const event = { id: eventId('loot'), campaignId: DEMO_CAMPAIGN_ID, type: 'loot-reward', status: 'pending', targetCharacterId: characterId, payload: { item:unknown, message: metadata.message, campaignName: campaign.name } };
      events = [event, ...events]; notify('events'); return { ok: true, eventId: event.id };
    },
    identifyLootReward: async (_campaignId,characterId,id)=>{requireFixtureSession();const event=events.find(value=>value.id===id);if(!event)return {ok:false,error:'Reward not found.'};if(!characterKnowsIdentify(characters[characterId]))return {ok:false,error:'Identify spell required.'};event.payload.item.identified=true;event.payload.item.name=event.payload.item.trueName||event.payload.item.name;notify('events');return {ok:true};},
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
    updateCampaignCharacterCurrency: async (_campaignId, characterId, key, amount) => {
      updateCharacter(characterId,character=>{
        const currency=slug(key).replaceAll('-','_');
        character.coins={...(character.coins||{})};
        const storedKey=Object.keys(character.coins).find(value=>slug(value).replaceAll('-','_')===currency) || currency;
        character.coins[storedKey]=Math.max(0,Number(character.coins[storedKey]||0)+Number(amount||0));
        return character;
      });
      return {ok:true};
    },
    setCharacterACModifier: async (_campaignId,characterId,modifier={}) => {
      updateCharacter(characterId,character=>{
        const rows=Array.isArray(character.acModifiers)?character.acModifiers:[];
        const id=String(modifier.id||eventId('gm-ac'));
        character.acModifiers=modifier.remove
          ? rows.filter(value=>String(value.id)!==id)
          : [{id,type:'AC_MODIFIER',sourceType:'gm',name:modifier.name||'GM AC Modifier',value:Number(modifier.value||0),active:true,temporary:Number(modifier.durationMinutes||0)>0,expiresAt:Number(modifier.durationMinutes||0)>0?new Date(Date.now()+Number(modifier.durationMinutes)*60000).toISOString():''},...rows.filter(value=>String(value.id)!==id)];
        return character;
      });
      return {ok:true};
    },
    spendCharacteristicPoints: async (_campaignId,characterId,key,amount) => {
      const applied=applyCharacteristicPoints(characters[characterId],key,amount);updateCharacter(characterId,()=>applied.character);return {ok:true,applied:applied.applied};
    },
    spendCharacteristicAllocations: async (_campaignId,characterId,allocations) => {
      const applied=applyCharacteristicAllocations(characters[characterId],allocations);updateCharacter(characterId,()=>applied.character);return {ok:true,applied:applied.applied,total:applied.total};
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
      updateCharacter(characterId,next=>{
        const items=next.inventory||[];
        next.storageLimit=Math.max(3,Number(next.storageLimit||3));
        next.storages=normalizeCharacterStorages(next);
        if(operation.type==='create-storage'){
          if(next.storages.length>=next.storageLimit)throw new Error('Storage limit reached.');
          const rows=Math.max(1,Math.min(20,Number(operation.rows||4)));
          const cols=Math.max(1,Math.min(20,Number(operation.cols||4)));
          const storage={id:eventId('storage'),name:operation.name,order:next.storages.length,rows,cols,maxSlots:rows*cols};
          next.storages.push(storage);
          const knownStorageIds=new Set(next.storages.map(value=>value.id));
          let nextSlot=0;
          items.filter(item=>!item.equipped&&!knownStorageIds.has(item.storageId)).forEach(item=>{if(nextSlot<storage.maxSlots){item.storageId=storage.id;item.storageSlot=nextSlot;nextSlot+=1;}});
          return next;
        }
        if(operation.type==='reorder-storages'){
          const order=Array.isArray(operation.storageIds)?operation.storageIds:[];
          next.storages.sort((a,b)=>{
            const left=order.indexOf(a.id);const right=order.indexOf(b.id);
            return (left<0?Number.MAX_SAFE_INTEGER:left)-(right<0?Number.MAX_SAFE_INTEGER:right);
          }).forEach((storage,index)=>{storage.order=index;});
          return next;
        }
        if(operation.type==='add-item'){
          placeFixtureItem(next,{...operation.item,id:operation.item?.id||eventId('item')},operation.storageId||'');
          return next;
        }
        const index=items.findIndex(item=>String(item.id)===String(operation.itemId));
        const item=items[index];
        if(!item)throw new Error('Item not found.');
        if(operation.type==='equip'){
          const slot=String(operation.slot||item.slot||item.allowedSlots?.[0]||'').trim();
          const armourValidation=window.AsteriaArmour?.validateEquipmentChange?.(next,item,slot);
          if(armourValidation&&!armourValidation.ok)throw new Error(armourValidation.error||'This armour cannot be equipped in that location.');
          items.forEach(value=>{if(value.equippedSlot===slot){value.equipped=false;value.equippedSlot='';}});
          item.equipped=true;item.equippedSlot=slot;item.slot=slot;
          next.equipment={...(next.equipment||{})};
          Object.keys(next.equipment).forEach(key=>{if(key===slot||String(next.equipment[key]?.id||'')===String(item.id||''))delete next.equipment[key];});
          next.equipment[slot]=clone(item);
        }
        if(operation.type==='unequip'){item.equipped=false;item.equippedSlot='';}
        if(operation.type==='quick'){next.quickSlots=[...(next.quickSlots||[])];next.quickSlots[operation.index]=clone(item);}
        if(operation.type==='move-storage'){
          const storage=next.storages.find(value=>value.id===operation.storageId);
          const requested=Number(operation.storageSlot);
          const storageSlot=Number.isInteger(requested)?requested:firstFreeStorageSlot(items,storage||{},item.id);
          if(storageSlot<0)throw new Error(`${storage?.name||'Storage'} is full.`);
          if(items.some(value=>value.id!==item.id&&!value.equipped&&value.storageId===storage.id&&Number(value.storageSlot)===storageSlot))throw new Error('That grid slot is occupied.');
          item.storageId=operation.storageId;item.storageSlot=storageSlot;
        }
        if(operation.type==='identify'){if(!characterKnowsIdentify(next))throw new Error('Identify spell required.');item.identified=true;item.name=item.trueName||item.name;}
        if(operation.type==='read-spellbook'){if(item.identified===false)throw new Error('Identify this book first.');next.spells=[...(next.spells||[]),clone(item.spell||{name:item.trueName||item.name})];item.qty-=1;}
        if(operation.type==='use'){item.qty=Math.max(0,Number(item.qty||1)-1);for(const [resource,amount] of Object.entries(item.effect||{})){if(Array.isArray(next[resource]))next[resource][0]=Math.min(next[resource][1],next[resource][0]+Number(amount||0));}}
        next.inventory=items.filter(value=>Number(value.qty||1)>0);return next;
      });return {ok:true};
    },
    updateCharacterQuest: async (_campaignId,characterId,questId,status) => {updateCharacter(characterId,next=>{next.quests=(next.quests||[]).map(quest=>quest.id===questId?{...quest,status}:quest);return next;});return {ok:true};},
    addJournalEntry: async (_campaignId,characterId,entry) => {updateCharacter(characterId,next=>{next.journal=[{id:eventId('journal'),...entry,createdAt:new Date().toISOString()},...(next.journal||[])];return next;});return {ok:true};},
    updatePartyNotes: async (_campaignId,notes) => {requireFixtureSession();partyWorkspace={...partyWorkspace,sharedNotes:notes};notify('partyWorkspace');return {ok:true};},
    sendPartyMessage: async (_campaignId,characterId,text) => {requireFixtureSession();partyChat=[...partyChat,{id:eventId('chat'),characterId,ownerUid:'player-demo',characterName:characters[characterId]?.name||'Character',text,createdAt:new Date().toISOString()}];notify('partyChat');return {ok:true};},
    updateCharacterDashboardPreferences: async (_campaignId,characterId,preferences)=>{updateCharacter(characterId,next=>{next.dashboardPreferences=normalizeDashboardPreferences({dashboardPreferences:{...(next.dashboardPreferences||{}),...preferences}});return next;});return {ok:true};},
    createPartyOrganization: async (_campaignId,characterId,details)=>{requireFixtureSession();const organization={id:eventId('organization'),name:details.name,type:details.type,ownerCharacterId:characterId,memberCharacterIds:[characterId]};partyWorkspace={...partyWorkspace,organizations:[...(partyWorkspace.organizations||[]),organization]};notify('partyWorkspace');return {ok:true,organization};},
    uploadCharacterGalleryImage: async (_campaignId,characterId,file)=>{requireFixtureSession();const url=URL.createObjectURL(file);const image={id:eventId('gallery'),url,name:file.name};updateCharacter(characterId,next=>{next.gallery=[...(next.gallery||[]),image];if(!next.image)next.image=url;return next;});return {ok:true,image};},
    syncOwnedCharacterGalleryMedia: async ()=>({ok:true,changed:false}),
    refreshCharacterGalleryImage: async (_campaignId,characterId,imageId)=>{const image=(characters[characterId]?.gallery||[]).find(value=>value.id===imageId);return image?.url?{ok:true,url:image.url}:{ok:false,error:'Gallery image not found.'};},
    setCharacterGalleryPortrait: async (_campaignId,characterId,imageId)=>{updateCharacter(characterId,next=>{const image=(next.gallery||[]).find(value=>value.id===imageId);if(image){next.image=image.url;next.portrait=image.url;}return next;});return {ok:true};},
    deleteCharacterGalleryImage: async (_campaignId,characterId,imageId)=>{updateCharacter(characterId,next=>{next.gallery=(next.gallery||[]).filter(value=>value.id!==imageId);return next;});return {ok:true};},
    grantCharacterTitle: async (_campaignId,ids,title)=>{(ids||[]).forEach(id=>updateCharacter(id,next=>{next.titles=[...(next.titles||[]),{id:eventId('title'),text:title,source:'GM'}];return next;}));return {ok:true};},
    manageCharacterTitle: async (_campaignId,characterId,titleId,details={})=>{updateCharacter(characterId,next=>{const titles=Array.isArray(next.titles)?next.titles:[];if(details.revoke){next.titles=titles.filter(record=>String(record.id)!==String(titleId));if(next.dashboardPreferences?.visibleTitleId===titleId)next.dashboardPreferences={...next.dashboardPreferences,visibleTitleId:''};return next;}next.titles=titles.map(record=>String(record.id)===String(titleId)?{...record,text:String(details.text||record.text||'').trim()}:record);return next;});return {ok:true};},
    grantCharacterStorageSlots: async (_campaignId,ids,amount)=>{(ids||[]).forEach(id=>updateCharacter(id,next=>{next.storageLimit=Math.max(3,Number(next.storageLimit||3))+Number(amount||1);return next;}));return {ok:true};},
    createCustomItem: async (_campaignId,item)=>{try{requireFixtureSession();const priced=createAsteriaItem(clone(item));const record={...priced,id:eventId('custom'),name:item.name,title:item.name,custom:true};customItems=[...customItems,record];notify('customItems');return {ok:true,item:record};}catch(error){return {ok:false,error:error.message||String(error)};}},
    createLiveItemRequest: async (_campaignId,characterId,recipientId,itemId,mode='give',details={})=>{
      try{
        requireFixtureSession();
        const sender=characters[characterId];const recipient=characters[recipientId];
        if(!sender||!recipient||characterId===recipientId)throw new Error('Choose another linked character.');
        const item=(sender.inventory||[]).find(value=>String(value.id)===String(itemId));
        const action=['trade','sell','give','identify'].includes(mode)?mode:'give';
        const quantity=Math.max(1,Math.min(Number(details.quantity||1),Number(item?.qty||0)));
        if(!item||item.equipped||item.locked||item.bound||item.questItem||!quantity)throw new Error('This item cannot be offered.');
        if(action==='identify'&&item.identified!==false)throw new Error('Only unidentified items can be sent for identification.');
        const snapshot={...clone(item),sourceItemId:item.id,qty:action==='identify'?1:quantity,equipped:false,equippedSlot:'',location:action==='identify'?'inventory':'player-request-escrow'};
        if(action!=='identify')item.qty=Number(item.qty||1)-quantity;
        sender.inventory=(sender.inventory||[]).filter(value=>Number(value.qty??1)>0);
        const request={id:eventId('item-request'),version:2,sessionId:session.id,mode:action,fromCharacterId:characterId,fromCharacterName:sender.name,fromOwnerUid:sender.ownerUid,toCharacterId:recipientId,toCharacterName:recipient.name,toOwnerUid:recipient.ownerUid,item:snapshot,quantity:snapshot.qty,note:String(details.note||''),priceCopper:Math.max(0,Math.floor(Number(details.priceCopper||0))),requestedItem:String(details.requestedItem||''),status:'pending',recipientNotice:'unread',senderNotice:'waiting',createdAt:new Date().toISOString()};
        itemEcosystem.playerItemRequests=[request,...(itemEcosystem.playerItemRequests||[])];
        notify('characters');notify('itemEcosystem');
        return {ok:true,request,offer:request};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    respondLiveItemRequest: async (_campaignId,characterId,requestId,accepted,details={})=>{
      try{
        requireFixtureSession();
        const request=itemRequestById(requestId);
        if(!request||request.status!=='pending'||String(request.toCharacterId)!==String(characterId))throw new Error('This item request is no longer pending for this character.');
        const recipient=characters[characterId];const sender=characters[request.fromCharacterId];
        let revealedItem=null;let receivedItem=null;let exchangeItem=null;
        if(accepted&&request.mode==='identify'){
          if(!characterKnowsIdentify(recipient))throw new Error('This character does not know the Identify spell.');
          const original=(sender.inventory||[]).find(value=>String(value.id)===String(request.item.sourceItemId||request.item.id));
          if(!original)throw new Error('The item is no longer available to identify.');
          original.identified=true;original.name=original.trueName||original.name;revealedItem=clone(original);
        }else if(accepted){
          if(request.mode==='sell'){
            const price=Math.max(0,Number(request.priceCopper||0));
            if(fixtureCurrencyTotal(recipient)<price)throw new Error('Not enough currency for this purchase.');
            setFixtureCurrencyTotal(recipient,fixtureCurrencyTotal(recipient)-price);setFixtureCurrencyTotal(sender,fixtureCurrencyTotal(sender)+price);
          }
          if(request.mode==='trade'){
            const exchange=(recipient.inventory||[]).find(value=>String(value.id)===String(details.exchangeItemId||''));
            if(!exchange||exchange.equipped||exchange.locked||exchange.bound||exchange.questItem)throw new Error('Choose an available item to trade.');
            const exchangeQuantity=Math.max(1,Math.min(Number(details.exchangeQuantity||1),Number(exchange.qty||1)));
            exchangeItem={...clone(exchange),qty:exchangeQuantity};exchange.qty=Number(exchange.qty||1)-exchangeQuantity;
            recipient.inventory=recipient.inventory.filter(value=>Number(value.qty??1)>0);
            request.exchangeItem=exchangeItem;
            request.status='awaiting-sender';request.recipientNotice='acknowledged';request.senderNotice='unread';request.recipientAcceptedAt=new Date().toISOString();
            request.resolution={accepted:true,exchangeItem:{name:exchangeItem.name,qty:exchangeItem.qty},awaitingSender:true};
            notify('characters');notify('itemEcosystem');
            return {ok:true,awaitingSender:true};
          }
          receivedItem=placeFixtureItem(recipient,request.item,details.storageId||'');
        }else if(request.mode!=='identify')placeFixtureItem(sender,request.item,request.item.storageId||'');
        request.status=accepted?'accepted':'declined';request.recipientNotice='acknowledged';request.senderNotice='unread';request.resolvedAt=new Date().toISOString();
        request.resolution={accepted:Boolean(accepted),receivedItem:receivedItem?{name:receivedItem.name,qty:receivedItem.qty}:null,exchangeItem:exchangeItem?{name:exchangeItem.name,qty:exchangeItem.qty}:null,revealedItem:revealedItem?{name:revealedItem.name,rarity:revealedItem.rarity}:null,priceCopper:request.mode==='sell'?Number(request.priceCopper||0):0};
        notify('characters');notify('itemEcosystem');
        return {ok:true,revealedItem};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    cancelLiveItemRequest: async (_campaignId,characterId,requestId)=>{
      try{requireFixtureSession();const request=itemRequestById(requestId);if(!request||request.status!=='pending'||String(request.fromCharacterId)!==String(characterId))throw new Error('This request can no longer be cancelled.');if(request.mode!=='identify')placeFixtureItem(characters[characterId],request.item,request.item.storageId||'');request.status='cancelled';request.recipientNotice='cancelled';request.senderNotice='acknowledged';request.resolvedAt=new Date().toISOString();notify('characters');notify('itemEcosystem');return {ok:true};}catch(error){return {ok:false,error:error.message||String(error)};}
    },
    acknowledgeLiveItemRequest: async (_campaignId,characterId,requestId)=>{
      const request=itemRequestById(requestId);if(!request||request.status==='pending'||String(request.fromCharacterId)!==String(characterId))return {ok:false,error:'This result cannot be acknowledged.'};request.senderNotice='acknowledged';request.senderAcknowledgedAt=new Date().toISOString();notify('itemEcosystem');return {ok:true};
    },
    finalizeLiveItemTrade: async (_campaignId,characterId,requestId,accepted)=>{
      try{
        requireFixtureSession();
        const request=itemRequestById(requestId);
        if(!request||request.mode!=='trade'||request.status!=='awaiting-sender'||String(request.fromCharacterId)!==String(characterId))throw new Error('This trade is no longer awaiting final confirmation.');
        const sender=characters[request.fromCharacterId];const recipient=characters[request.toCharacterId];
        if(accepted){placeFixtureItem(recipient,request.item);placeFixtureItem(sender,request.exchangeItem);}
        else{placeFixtureItem(sender,request.item);placeFixtureItem(recipient,request.exchangeItem);}
        request.status=accepted?'accepted':'declined';request.senderNotice='acknowledged';request.recipientNotice='unread';request.resolvedAt=new Date().toISOString();
        request.resolution={...(request.resolution||{}),accepted:Boolean(accepted),awaitingSender:false,receivedItem:accepted?{name:request.item.name,qty:request.item.qty}:null};
        notify('characters');notify('itemEcosystem');return {ok:true};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    acknowledgeLiveItemRecipientUpdate: async (_campaignId,characterId,requestId)=>{const request=itemRequestById(requestId);if(!request||String(request.toCharacterId)!==String(characterId)||!['accepted','declined','cancelled'].includes(request.status))return {ok:false,error:'This update cannot be acknowledged.'};request.recipientNotice='acknowledged';request.recipientAcknowledgedAt=new Date().toISOString();notify('itemEcosystem');return {ok:true};},
    createLiveItemOffer: (...args)=>fixtureApi.createLiveItemRequest(...args),
    respondLiveItemOffer: (...args)=>fixtureApi.respondLiveItemRequest(...args),
    resolveLootReward: async (_campaignId,characterId,id,action,destination) => {requireFixtureSession();const event=events.find(value=>value.id===id);if(!event)return {ok:false,error:'Reward not found.'};if(action!=='declined')updateCharacter(characterId,next=>{const item={...normalizeMarketPricing(event.payload.item,{legacy:true,removeLegacy:true,migratedRecord:true}),id:event.payload.item.id||eventId('item'),equipped:action==='equip',equippedSlot:action==='equip'?destination:'',storageId:action==='equip'?normalizeCharacterStorages(next)[0].id:destination};next.inventory=[...(next.inventory||[]),item];return next;});events=events.map(value=>value.id===id?{...value,status:action==='declined'?'declined':action==='equip'?'equipped':'accepted',resolvedAt:new Date().toISOString()}:value);notify('events');return {ok:true};},
    buyLiveShopItem: async (_campaignId,characterId,shopId,stockIndex,quantity) => {try{requireFixtureSession();const shop=itemEcosystem.shops.find(value=>value.id===shopId);const stock=shop?.stock?.[stockIndex];if(!stock||stock.qty<quantity)throw new Error('Item unavailable.');const item=normalizeMarketPricing(stock.item,{legacy:true,removeLegacy:true,migratedRecord:true});const unitCost=getPlayerPurchasePriceCopper(item,shop.buyModifier??1);if(unitCost===null)throw new Error(`${item.name} needs a Market Price before it can be sold.`);if(unitCost===0&&marketPricingStatus(item).id==='not-tradeable')throw new Error(`${item.name} is not normally tradeable.`);updateCharacter(characterId,next=>{const cost=unitCost*quantity;if(fixtureCurrencyTotal(next)<cost)throw new Error('Not enough currency.');setFixtureCurrencyTotal(next,fixtureCurrencyTotal(next)-cost);next.inventory=[...(next.inventory||[]),{...item,id:eventId('item'),qty:quantity}];return next;});stock.qty-=quantity;notify('itemEcosystem');return {ok:true,cost:unitCost*quantity};}catch(error){return {ok:false,error:error.message||String(error)};}},
    sellLiveShopItem: async (_campaignId,characterId,shopId,itemId) => {try{requireFixtureSession();const shop=itemEcosystem.shops.find(value=>value.id===shopId);let paid=0;updateCharacter(characterId,next=>{const item=next.inventory.find(value=>value.id===itemId);if(!item)throw new Error('Item not found.');paid=getPlayerSaleValueCopper(item,shop?.sellModifier??1);if(!paid)throw new Error(`${item.name} has no Market Value and cannot normally be sold.`);item.qty-=1;next.inventory=next.inventory.filter(value=>value.qty>0);setFixtureCurrencyTotal(next,fixtureCurrencyTotal(next)+paid);return next;});return {ok:true,value:paid};}catch(error){return {ok:false,error:error.message||String(error)};}},
    createLiveTrade: (campaignId,characterId,recipientId,itemId,quantity,note)=>fixtureApi.createLiveItemRequest(campaignId,characterId,recipientId,itemId,'trade',{quantity,note}),
    respondLiveTrade: (campaignId,characterId,requestId,accepted)=>fixtureApi.respondLiveItemRequest(campaignId,characterId,requestId,accepted,{})
  };
  Object.defineProperty(window, 'AsteriaFirebase', {
    configurable: true,
    get: () => fixtureApi,
    set: () => {}
  });

  window.AsteriaInventory = Object.assign(window.AsteriaInventory || {}, {
    catalogEntries: () => [{ id: 'health-potion', name: 'Health Potion', title: 'Health Potion', itemClass: 'Common' }, { id: 'iron-longsword', name: 'Iron Longsword', title: 'Iron Longsword', itemClass: 'Common', type: 'Weapon' }],
    itemSnapshot: (item, quantity) => normalizeMarketPricing({ ...item, name: item.name || item.title, qty: Number(quantity || 1) }, { legacy: true, preserveSource: true }),
    inferSlots: item => String(item?.type || '').toLowerCase().includes('weapon') ? ['Main Weapon', 'Secondary Weapon'] : [],
    resolveReward: async (_characterId, reward) => { events = events.map(event => event.id === reward.id ? { ...event, status: 'accepted', resolvedAt: new Date().toISOString() } : event); notify('events'); return true; }
  });
  window.dispatchEvent(new CustomEvent('asteria:firebase-ready'));
  return true;
}
