import {createFirebaseCombatService} from './firebaseCombatService.mjs';
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
 if(!bridge?.subscribeBattleMaps||!bridge?.fetchBattleMapMedia)return null;
 return {
   watchMaps:(campaignId,mode,onUpdate,onError)=>{
     try{return bridge.subscribeBattleMaps(campaignId,onUpdate,{gm:mode==='gm'});}
     catch(error){onError?.(error);return()=>{};}
   },
   fetchMapMedia:(campaignId,map)=>bridge.fetchBattleMapMedia(campaignId,map)
 };
}
