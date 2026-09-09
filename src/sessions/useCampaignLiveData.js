import { useEffect, useMemo, useState } from 'react';
import { firebaseService, waitForFirebase } from '../firebase/asteriaFirebaseService.js';
import { mergeEvents } from '../state/liveEventReducer.mjs';
import { effectiveSession } from '../state/liveWorkspaceModel.mjs';
import { publishCustomItems } from '../app/legacyBridge.js';
import { LIVE_SYNC_STATES } from '../types/asteriaContracts.mjs';

export function useCampaignLiveData(campaignId, { mode = 'character', characterId = '' } = {}) {
  const [authUid, setAuthUid] = useState(() => firebaseService.currentUser()?.uid || '');
  useEffect(() => {
    const update = () => setAuthUid(firebaseService.currentUser()?.uid || '');
    window.addEventListener('asteria:firebase-ready', update);
    window.addEventListener('asteria:firebase-signed-out', update);
    return () => { window.removeEventListener('asteria:firebase-ready', update); window.removeEventListener('asteria:firebase-signed-out', update); };
  }, []);
  const [campaign, setCampaign] = useState(null);
  const [characters, setCharacters] = useState({});
  const [session, setSession] = useState({ status: 'idle', id: '' });
  const [events, setEvents] = useState([]);
  const [encounter, setEncounter] = useState({ status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] });
  const [gmWorkspace, setGMWorkspace] = useState(null);
  const [gmWorkspaceLoaded, setGMWorkspaceLoaded] = useState(false);
  const [presence, setPresence] = useState({});
  const [partyWorkspace, setPartyWorkspace] = useState({ sharedNotes:'', questLog:[] });
  const [partyChat, setPartyChat] = useState([]);
  const [itemEcosystem, setItemEcosystem] = useState({ shops:[], directTrades:[], partyLoot:[], sharedStorages:[] });
  const [customItems, setCustomItems] = useState([]);
  const [clock, setClock] = useState(Date.now());
  const [online, setOnline] = useState(navigator.onLine);
  const [connectionState, setConnectionState] = useState(navigator.onLine ? LIVE_SYNC_STATES.CONNECTING : LIVE_SYNC_STATES.DISCONNECTED);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const connected = () => {
      setOnline(true);
      setConnectionState(LIVE_SYNC_STATES.RECONNECTING);
    };
    const disconnected = () => {
      setOnline(false);
      setConnectionState(LIVE_SYNC_STATES.DISCONNECTED);
    };
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
    const required=new Set(['campaign','characters','session','partyWorkspace','partyChat','ecosystem','customItems','events',...(mode==='gm'?['encounter','gmWorkspace']:[])]);
    let failed=false;
    const serverReady=new Set();
    const accept=(name,callback)=>(value,metadata)=>{
      if(!active) return;
      callback(value);
      if(['campaign','characters'].includes(name)) {
        if(metadata?.fromCache) {serverReady.delete(name);if(!failed)setConnectionState(LIVE_SYNC_STATES.RECONNECTING);}
        else serverReady.add(name);
      }
      required.delete(name);
      if(!required.has('campaign') && !required.has('characters')) setLoading(false);
      if(!failed && !required.size && serverReady.size===2 && navigator.onLine) setConnectionState(LIVE_SYNC_STATES.CONNECTED);
    };
    const syncError=event=>{
      if(!active || (event.detail?.campaignId && event.detail.campaignId!==campaignId)) return;
      failed=true;
      setError(event.detail?.message || 'Firebase synchronization failed. Refresh to reconnect.');
      setLoading(false);
      setConnectionState(LIVE_SYNC_STATES.ERROR);
    };
    const signedOut=()=>{
      failed=true;
      setCharacters({});
      setCampaign(null);
      setError('You have signed out. Sign in to reconnect.');
      setLoading(false);
      setConnectionState(LIVE_SYNC_STATES.DISCONNECTED);
      unsubscribers.forEach(unsubscribe=>unsubscribe?.());
    };
    window.addEventListener('asteria:firebase-sync-error',syncError);
    window.addEventListener('asteria:firebase-signed-out',signedOut);
    setCampaign(null);
    setCharacters({});
    setSession({ status:'idle', id:'' });
    setEvents([]);
    setEncounter({ status:'ready', round:1, turnIndex:0, combatants:[], enemies:[] });
    setPresence({});
    setPartyWorkspace({ sharedNotes:'', questLog:[] });
    setPartyChat([]);
    setItemEcosystem({ shops:[], directTrades:[], partyLoot:[], sharedStorages:[] });
    setCustomItems([]);
    setLoading(true);
    if(mode === 'gm') { setGMWorkspace(null); setGMWorkspaceLoaded(false); }
    setError('');
    setConnectionState(navigator.onLine ? LIVE_SYNC_STATES.CONNECTING : LIVE_SYNC_STATES.DISCONNECTED);
    waitForFirebase().then(() => {
      if(!active) return;
      const uid = firebaseService.currentUser()?.uid || '';
      unsubscribers.push(firebaseService.subscribeCampaign(campaignId, accept('campaign', value=>{
        setCampaign(value);
        if(!value) syncError({detail:{message:'This campaign is unavailable or has been removed.'}});
      })));
      unsubscribers.push(firebaseService.subscribeCharacters(campaignId, accept('characters', value=>setCharacters(value||{}))));
      unsubscribers.push(firebaseService.subscribeSession(campaignId, accept('session', value=>setSession(effectiveSession(value||{status:'idle',id:''})))));
      unsubscribers.push(firebaseService.subscribePartyWorkspace(campaignId, accept('partyWorkspace',value=>setPartyWorkspace(value||{sharedNotes:'',questLog:[]}))));
      unsubscribers.push(firebaseService.subscribePartyChat(campaignId, accept('partyChat',value=>setPartyChat(value||[]))));
      unsubscribers.push(firebaseService.subscribeItemEcosystem(campaignId, accept('ecosystem',value=>setItemEcosystem(value||{shops:[],directTrades:[]}))));
      unsubscribers.push(firebaseService.subscribeCustomItems(accept('customItems',value=>{setCustomItems(value||[]);publishCustomItems(value||[]);})));
      unsubscribers.push(firebaseService.subscribeEvents(campaignId,accept('events',value=>setEvents(mergeEvents([],value||[]))),{mode,targetOwnerUid:mode==='character'?uid:'',characterId}));
      if(mode==='gm') {
        unsubscribers.push(firebaseService.subscribeEncounter(campaignId,accept('encounter',setEncounter)));
        unsubscribers.push(firebaseService.subscribeGMWorkspace(campaignId,accept('gmWorkspace',value=>{setGMWorkspace(value);setGMWorkspaceLoaded(true);})));
      }
    }).catch(reason => {
      if(active){
        setError(reason.message || String(reason));
        setLoading(false);
        setConnectionState(LIVE_SYNC_STATES.ERROR);
      }
    });
    return () => {
      active = false;
      window.removeEventListener('asteria:firebase-sync-error',syncError);
      window.removeEventListener('asteria:firebase-signed-out',signedOut);
      unsubscribers.forEach(unsubscribe => { try { unsubscribe?.(); } catch {} });
    };
  }, [campaignId, characterId, mode, online, authUid]);

  useEffect(() => {
    const timer=window.setInterval(()=>setClock(Date.now()),1000);
    return ()=>window.clearInterval(timer);
  },[]);

  const liveSession=useMemo(()=>effectiveSession(session,clock),[session,clock]);

  useEffect(()=>{
    if(mode !== 'gm' || !campaignId || !liveSession.expired) return;
    firebaseService.expireSession(campaignId).catch(()=>{});
  },[campaignId,liveSession.expired,mode]);

  useEffect(() => {
    if(!campaignId || !liveSession?.id || !['active', 'paused'].includes(liveSession.status)) return undefined;
    let unsubscribe = () => {};
    let timer = 0;
    const user = firebaseService.currentUser();
    if(!user) return undefined;
    try {
      unsubscribe = firebaseService.subscribePresence(campaignId, liveSession.id, setPresence);
      const publish = () => {
        if(document.hidden || !navigator.onLine) return;
        return firebaseService.setPresence(campaignId, liveSession.id, {
        state: document.hidden ? 'away' : 'online',
        mode,
        characterId
      }).catch(reason=>{setError(reason.message||String(reason));setConnectionState(LIVE_SYNC_STATES.ERROR);});
      };
      publish();
      document.addEventListener('visibilitychange',publish);
      timer = window.setInterval(publish, 60000);
      const stop=unsubscribe;
      unsubscribe=()=>{document.removeEventListener('visibilitychange',publish);stop?.();};
    } catch(reason) {
      setError(reason.message || String(reason));
    }
    return () => {
      window.clearInterval(timer);
      unsubscribe?.();
    };
  }, [campaignId, characterId, mode, liveSession?.id, liveSession?.status]);

  const character = useMemo(() => characters[characterId] || null, [characters, characterId]);
  const currentPresence=useMemo(()=>Object.fromEntries(Object.entries(presence).filter(([,record])=>{
    const value=record.updatedAt;
    const at=typeof value?.toMillis==='function'?value.toMillis():Number(value?.seconds||0)*1000||new Date(value||0).getTime();
    return at>0 && clock-at<150000;
  })),[presence,clock]);
  return { campaign, characters, character, session:liveSession, events, encounter, gmWorkspace, gmWorkspaceLoaded, presence:currentPresence, partyWorkspace, partyChat, itemEcosystem, customItems, online, connectionState, loading, error, setEvents, setEncounter };
}
