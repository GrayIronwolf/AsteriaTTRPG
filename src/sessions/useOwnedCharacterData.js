import {useEffect,useState} from 'react';
import {firebaseService,waitForFirebase} from '../firebase/asteriaFirebaseService.js';

// The same dashboard can inspect an owner's private sheet before it joins a
// campaign. No campaign subscriptions, gameplay commands or automatic saves run.
export function useOwnedCharacterData(characterId) {
  const [uid,setUid]=useState(()=>firebaseService.currentUser()?.uid || '');
  const [state,setState]=useState({character:null,loading:true,error:'',connectionState:'connecting'});
  useEffect(()=>{
    const update=()=>setUid(firebaseService.currentUser()?.uid || '');
    window.addEventListener('asteria:firebase-ready',update);
    window.addEventListener('asteria:firebase-signed-out',update);
    return()=>{window.removeEventListener('asteria:firebase-ready',update);window.removeEventListener('asteria:firebase-signed-out',update);};
  },[]);
  useEffect(()=>{
    let active=true,unsubscribe=()=>{};
    const fail=error=>{if(active)setState({character:null,loading:false,error:error.message || String(error),connectionState:'error'});};
    setState({character:null,loading:true,error:'',connectionState:'connecting'});
    waitForFirebase().then(()=>{
      if(!active)return;
      unsubscribe=firebaseService.subscribeOwnedCharacter(characterId,(character,metadata)=>{
        if(active)setState({character,loading:false,error:character?'':'This saved character is unavailable for your account.',connectionState:metadata?.fromCache?'disconnected':'connected'});
      },fail);
    }).catch(fail);
    return()=>{active=false;unsubscribe();};
  },[characterId,uid]);
  const character=state.character?.ownerUid===firebaseService.currentUser()?.uid?state.character:null;
  return {...state,character,characters:character?{[character.id]:character}:{},campaign:null,
    session:{status:'idle',editable:false},events:[],presence:{},partyWorkspace:{},partyChat:[],
    itemEcosystem:{},encounter:{combatants:[],enemies:[]},clock:Date.now(),online:typeof navigator==='undefined'||navigator.onLine};
}
