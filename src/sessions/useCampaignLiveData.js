import { useEffect, useMemo, useState } from 'react';
import { firebaseService, waitForFirebase } from '../firebase/asteriaFirebaseService.js';
import { mergeEvents } from '../state/liveEventReducer.mjs';

export function useCampaignLiveData(campaignId, { mode = 'character', characterId = '' } = {}) {
  const [campaign, setCampaign] = useState(null);
  const [characters, setCharacters] = useState({});
  const [session, setSession] = useState({ status: 'idle', id: '' });
  const [events, setEvents] = useState([]);
  const [encounter, setEncounter] = useState({ status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] });
  const [presence, setPresence] = useState({});
  const [online, setOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);

  useEffect(() => {
    if(!campaignId) return undefined;
    let active = true;
    const unsubscribers = [];
    setLoading(true);
    setError('');
    waitForFirebase().then(() => {
      if(!active) return;
      const uid = firebaseService.currentUser()?.uid || '';
      unsubscribers.push(firebaseService.subscribeCampaign(campaignId, value => { setCampaign(value); setLoading(false); }));
      unsubscribers.push(firebaseService.subscribeCharacters(campaignId, value => { setCharacters(value || {}); setLoading(false); }));
      unsubscribers.push(firebaseService.subscribeSession(campaignId, value => setSession(value || { status: 'idle', id: '' })));
      unsubscribers.push(firebaseService.subscribeEvents(campaignId, value => setEvents(previous => mergeEvents(previous, value || [])), {
        mode,
        targetOwnerUid: mode === 'character' ? uid : '',
        characterId
      }));
      if(mode === 'gm') unsubscribers.push(firebaseService.subscribeEncounter(campaignId, value => setEncounter(value || { status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] })));
    }).catch(reason => {
      if(active){ setError(reason.message || String(reason)); setLoading(false); }
    });
    return () => {
      active = false;
      unsubscribers.forEach(unsubscribe => { try { unsubscribe?.(); } catch {} });
    };
  }, [campaignId, characterId, mode]);

  useEffect(() => {
    if(!campaignId || !session?.id || !['active', 'paused'].includes(session.status)) return undefined;
    let unsubscribe = () => {};
    let timer = 0;
    const user = firebaseService.currentUser();
    if(!user) return undefined;
    try {
      unsubscribe = firebaseService.subscribePresence(campaignId, session.id, setPresence);
      const publish = () => firebaseService.setPresence(campaignId, session.id, {
        state: document.hidden ? 'away' : 'online',
        mode,
        characterId
      }).catch(() => {});
      publish();
      timer = window.setInterval(publish, 25000);
    } catch(reason) {
      setError(reason.message || String(reason));
    }
    return () => {
      window.clearInterval(timer);
      unsubscribe?.();
    };
  }, [campaignId, characterId, mode, session?.id, session?.status]);

  const character = useMemo(() => characters[characterId] || null, [characters, characterId]);
  return { campaign, characters, character, session, events, encounter, presence, online, loading, error, setEvents, setEncounter };
}
