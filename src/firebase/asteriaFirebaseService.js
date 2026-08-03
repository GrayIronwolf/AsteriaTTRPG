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
  startSession: campaignId => requireMethod('startLiveSession')(campaignId),
  pauseSession: campaignId => requireMethod('pauseLiveSession')(campaignId),
  endSession: campaignId => requireMethod('endLiveSession')(campaignId),
  setPresence: (campaignId, sessionId, state) => requireMethod('setSessionPresence')(campaignId, sessionId, state),
  acknowledgeEvent: (campaignId, eventId, patch) => requireMethod('acknowledgeCampaignEvent')(campaignId, eventId, patch),
  grantXP: (campaignId, characterId, amount, metadata) => requireMethod('grantCampaignXP')(campaignId, characterId, amount, metadata),
  createLootReward: (campaignId, characterId, item, metadata) => requireMethod('createLootReward')(campaignId, characterId, item, metadata),
  updateResource: (campaignId, characterId, key, amount, metadata) => requireMethod('updateCampaignCharacterResource')(campaignId, characterId, key, amount, metadata),
  resolveLoot: (characterId, reward, action, slot) => {
    const inventory = window.AsteriaInventory;
    if(typeof inventory?.resolveReward !== 'function') throw new Error('Asteria inventory reward resolver is unavailable.');
    return inventory.resolveReward(characterId, reward, action, slot);
  }
};
