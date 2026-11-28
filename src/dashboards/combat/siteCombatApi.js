import {createFirebaseCampaignMediaService} from '../presentation/firebaseCampaignMediaService.mjs';
import {createFirebaseCombatService} from './firebaseCombatService.mjs';
import {battleMapMediaError} from '../../firebase/battleMapMedia.mjs';
/** Authenticated bridge to existing Firebase. No parallel database or combat state. */
export function createSiteCombatApi(){
 const bridge=window.AsteriaFirebase;
 const fixture=bridge?.getReactCombatFixtureService?.();
 if(fixture)return fixture;
 const runtime=bridge?.getReactCombatRuntime?.();
 return runtime?createFirebaseCombatService({...runtime,enabled:true}):null;
}
export function createSiteCombatMediaApi(){
 const bridge=window.AsteriaFirebase;
 const runtime=bridge?.getReactPresentationRuntime?.();
 if(runtime)return createFirebaseCampaignMediaService({...runtime,enabled:true});
 if(!bridge?.subscribeBattleMaps||!bridge?.fetchBattleMapMedia)return null;
 return {
   watchMaps:(campaignId,mode,onUpdate,onError)=>{
     try{return bridge.subscribeBattleMaps(campaignId,onUpdate,{gm:mode==='gm',onError});}
     catch(error){onError?.(error);return()=>{};}
   },
   fetchMapMedia:async(campaignId,map,mode,options)=>{
     const result=await bridge.fetchBattleMapMedia(campaignId,map,options);
     if(!result?.ok)throw battleMapMediaError(result?.code,result?.error||'Battle map media is unavailable.');
     return result.blob;
   }
 };
}
