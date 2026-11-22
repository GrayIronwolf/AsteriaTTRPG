import React,{useMemo} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {createFirebaseCampaignMediaService} from './presentation/firebaseCampaignMediaService.mjs';
import {CampaignPresentationController,CampaignPresentationDisplay} from './presentation/CampaignPresentationWorkspace.jsx';
import {RestrictedPresentationDisplay} from './presentation/HybridSessionManager.jsx';
import {GMMediaLibrary} from './presentation/GMMediaLibrary.jsx';
import {gmPartySummary} from './presentation/campaignMediaAccess.mjs';
import '../styles/player-presentation.css';

/** Phase 7 replaces the old standalone Player Display renderer and controller.
 * Media, scene, hybrid session and combat reads use the existing Firebase app.
 * No second JS/static display or duplicate presentation Firestore listener.
 */
function usePresentationApi(){
  const uid=firebaseService.currentUser()?.uid||'';
  return useMemo(()=>{
    const runtime=firebaseService.presentationRuntime();
    if(!uid||!runtime)return null;
    return createFirebaseCampaignMediaService({...runtime,enabled:true});
  },[uid]);
}
export function GMPlayerPresentationWorkspace({campaignId,characters={},onNavigate}){
  const api=usePresentationApi();
  const party=useMemo(()=>gmPartySummary(Object.entries(characters||{}).map(([id,value])=>
    ({id,...value}))),[characters]);
  if(!api)return <section role="alert">Sign in to an authorised campaign to use Share &amp; Present.</section>;
  return <section aria-label="GM Share & Present" data-testid="asteria-phase7-share-present">
    <CampaignPresentationController api={api} campaignId={campaignId} party={party}/>
    <GMMediaLibrary api={api} campaignId={campaignId} onNavigate={onNavigate}/>
  </section>;
}
export function PlayerPresentationDisplay({campaignId}){
  const api=usePresentationApi();
  const restricted=typeof window!=='undefined'&&new URLSearchParams(
    window.location.hash.split('?')[1]||'').get('viewer')==='restricted';
  if(!api)return <section role="alert">Sign in before opening a campaign presentation.</section>;
  return restricted?<RestrictedPresentationDisplay api={api} campaignId={campaignId}/>:
    <CampaignPresentationDisplay api={api} campaignId={campaignId} fullscreen/>;
}
