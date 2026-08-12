function api() {
  return window.AsteriaFirebase || null;
}

export function waitForFirebase(timeout = 12000) {
  if(api()?.isReady?.()) return Promise.resolve(api());
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('asteria:firebase-ready', ready);
      reject(new Error('Firebase authentication did not become ready.'));
    }, timeout);
    const ready = () => {
      window.clearTimeout(timer);
      window.removeEventListener('asteria:firebase-ready', ready);
      resolve(api());
    };
    window.addEventListener('asteria:firebase-ready', ready, { once: true });
  });
}

function requireMethod(name) {
  const method = api()?.[name];
  if(typeof method !== 'function') throw new Error(`Asteria Firebase service is missing ${name}.`);
  return method.bind(api());
}

export const firebaseService = {
  currentUser: () => api()?.getUser?.() || null,
  currentProfile: () => api()?.getProfile?.() || null,
  loadCampaigns: () => requireMethod('loadCampaigns')(),
  subscribeCampaign: (campaignId, onChange) => requireMethod('subscribeCampaign')(campaignId, onChange),
  subscribeCharacters: (campaignId, onChange) => requireMethod('subscribeCampaignCharacters')(campaignId, onChange),
  subscribeSession: (campaignId, onChange) => requireMethod('subscribeLiveSession')(campaignId, onChange),
  subscribePresence: (campaignId, sessionId, onChange) => requireMethod('subscribeSessionPresence')(campaignId, sessionId, onChange),
  subscribeEvents: (campaignId, onChange, options) => requireMethod('subscribeCampaignEvents')(campaignId, onChange, options),
  subscribeEncounter: (campaignId, onChange) => requireMethod('subscribeCampaignEncounter')(campaignId, onChange),
  subscribePartyWorkspace: (campaignId, onChange) => requireMethod('subscribePartyWorkspace')(campaignId, onChange),
  subscribePartyChat: (campaignId, onChange) => requireMethod('subscribePartyChat')(campaignId, onChange),
  subscribeItemEcosystem: (campaignId, onChange) => requireMethod('subscribeCampaignItemEcosystem')(campaignId, onChange),
  startSession: campaignId => requireMethod('startLiveSession')(campaignId),
  pauseSession: campaignId => requireMethod('pauseLiveSession')(campaignId),
  endSession: (campaignId, reason) => requireMethod('endLiveSession')(campaignId, reason),
  expireSession: campaignId => requireMethod('expireLiveSession')(campaignId),
  setPresence: (campaignId, sessionId, state) => requireMethod('setSessionPresence')(campaignId, sessionId, state),
  acknowledgeEvent: (campaignId, eventId, patch) => requireMethod('acknowledgeCampaignEvent')(campaignId, eventId, patch),
  grantXP: (campaignId, characterId, amount, metadata) => requireMethod('grantCampaignXP')(campaignId, characterId, amount, metadata),
  createLootReward: (campaignId, characterId, item, metadata) => requireMethod('createLootReward')(campaignId, characterId, item, metadata),
  createMagicReward: (campaignId, characterId, magicType, metadata) => requireMethod('createMagicElementReward')(campaignId, characterId, magicType, metadata),
  respondMagicReward: (campaignId, characterId, eventId, accepted) => requireMethod('respondMagicElementReward')(campaignId, characterId, eventId, accepted),
  saveEncounter: (campaignId, encounter) => requireMethod('saveCampaignEncounter')(campaignId, encounter),
  updateResource: (campaignId, characterId, key, amount, metadata) => requireMethod('updateCampaignCharacterResource')(campaignId, characterId, key, amount, metadata),
  spendCP: (campaignId, characterId, key, amount) => requireMethod('spendCharacteristicPoints')(campaignId, characterId, key, amount),
  purchaseTalent: (campaignId, characterId, talent) => requireMethod('purchaseTalentRank')(campaignId, characterId, talent),
  recordSkillSuccess: (campaignId, characterId, skill) => requireMethod('recordSkillSuccess')(campaignId, characterId, skill),
  castSpell: (campaignId, characterId, spell, costs) => requireMethod('castCharacterSpell')(campaignId, characterId, spell, costs),
  updateInventory: (campaignId, characterId, operation) => requireMethod('updateCharacterInventory')(campaignId, characterId, operation),
  buyShopItem: (campaignId, characterId, shopId, stockIndex, quantity) => requireMethod('buyLiveShopItem')(campaignId, characterId, shopId, stockIndex, quantity),
  sellShopItem: (campaignId, characterId, shopId, itemId) => requireMethod('sellLiveShopItem')(campaignId, characterId, shopId, itemId),
  createTrade: (campaignId, characterId, recipientId, itemId, quantity, note) => requireMethod('createLiveTrade')(campaignId, characterId, recipientId, itemId, quantity, note),
  respondTrade: (campaignId, characterId, tradeId, accepted) => requireMethod('respondLiveTrade')(campaignId, characterId, tradeId, accepted),
  updateQuest: (campaignId, characterId, questId, status) => requireMethod('updateCharacterQuest')(campaignId, characterId, questId, status),
  addJournalEntry: (campaignId, characterId, entry) => requireMethod('addJournalEntry')(campaignId, characterId, entry),
  updatePartyNotes: (campaignId, notes) => requireMethod('updatePartyNotes')(campaignId, notes),
  sendPartyMessage: (campaignId, characterId, message) => requireMethod('sendPartyMessage')(campaignId, characterId, message),
  resolveLoot: (campaignId, characterId, reward, action, slot) => requireMethod('resolveLootReward')(campaignId, characterId, reward.id, action, slot)
};
