/**
 * The Open Dice set registry is global, so each mounted Asteria workspace
 * owns an isolated, consistently named set collection. A new selection
 * replaces that workspace's definitions only, never another user's scene.
 */
import {defaultDiceAppearance,validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
import {buildAsteriaCoreDiceSet,CORE_DICE_TYPES} from './coreDiceDesigns.mjs';
import {buildFamiliarDiceSet} from './familiarDiceDesign.mjs';
import {buildWatcherDiceSet} from './watcherDiceDesign.mjs';

export function coreSetIds(instanceId){
  if(typeof instanceId!=='string'||!/^[a-z0-9-]{1,48}$/.test(instanceId))
    throw Error('Invalid dice preview instance ID.');
  return Object.fromEntries(CORE_DICE_TYPES.map(type=>[
    type,'asteria-'+instanceId+'-'+type
  ]));
}
export function prepareCoreDesigns(api,appearance,instanceId){
  if(!api||typeof api.registerDiceSet!=='function'||typeof api.unregisterDiceSet!=='function')
    throw Error('Open Dice register/unregister API is required.');
  const checked=validateDiceAppearance(appearance);
  if(!checked.familyId)throw Error('Unknown dice family.');
  const ids=coreSetIds(instanceId);
  const completed=[];
  try{
    for(const [type,id] of Object.entries(ids)){
      const design=checked.familyId==='dice-watcher'?
        buildWatcherDiceSet(checked,{id,dieType:type}):
        checked.familyId==='dice-familiar'?
        buildFamiliarDiceSet(checked,{id,dieType:type}):
        buildAsteriaCoreDiceSet(checked,{id,dieType:type});
      api.registerDiceSet(design,{replace:true});
      completed.push(id);
    }
  }catch(error){
    for(const id of completed)api.unregisterDiceSet(id);
    throw error;
  }
  return ids;
}
export const prepareAsteriaDiceDesigns=prepareCoreDesigns;
export function releaseCoreDesigns(api,ids){
  if(!api||typeof api.unregisterDiceSet!=='function'||!ids)return;
  for(const id of Object.values(ids))api.unregisterDiceSet(id);
}
export function makeDefaultCoreDesigns(api,instanceId){
  return prepareCoreDesigns(api,defaultDiceAppearance(),instanceId);
}
