import {isCampaignGM,readCampaignMember} from './characterPermissions.mjs';
import {cleanSecretItemLore,itemLoreKey,recordLoreOwnership,recordLoreDiscovery,visibleLoreDiscovery} from '../src/state/itemLoreModel.mjs';

const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);
const copy=v=>JSON.parse(JSON.stringify(v));
const itemKey=(v,i)=>String(v?.id||v?.instanceId||'');
export function createItemLoreCommands(context){
  const {db,currentUser,doc,runTransaction,serverTimestamp}=context;
  return {
    manageItemLore:async(campaignId,_scope,command={})=>{
      try{
        const type=String(command.type||'');
        if(!['save','reveal','owner'].includes(type))throw Error('Choose a valid lore action.');
        const characterId=String(command.characterId||'');
        const itemId=String(command.itemId||'');
        const loreId=itemLoreKey(characterId,itemId);
        const result=await runTransaction(db,async tx=>{
          const campaignSnapshot=await tx.get(doc(db,'campaigns',campaignId));
          if(!exists(campaignSnapshot))throw Error('Campaign unavailable.');
          const campaign=campaignSnapshot.data();
          const membership=await readCampaignMember({get:async ref=>{
            const record=await tx.get(ref);
            return {exists:exists(record),data:()=>record.data()};
          }},db,campaignId,campaign,currentUser.uid);
          if(!isCampaignGM(campaign,currentUser.uid,membership))throw Error('Only a campaign GM may edit secret item lore.');
          const charRef=doc(db,'campaigns',campaignId,'characters',characterId);
          const loreRef=doc(db,'campaigns',campaignId,'itemLore',loreId);
          const revealRef=doc(db,'campaigns',campaignId,'itemDiscoveries',loreId);
          const [characterSnapshot,loreSnapshot]=await Promise.all([
            tx.get(charRef),tx.get(loreRef)
          ]);
          if(!exists(characterSnapshot))throw Error('Campaign character unavailable.');
          const character=characterSnapshot.data();
          const item=[...(character.inventory||[]),...Object.values(character.equipment||{})]
            .find((v,i)=>v&&itemKey(v,i)===itemId);
          if(!item)throw Error('The selected item is no longer owned by this character.');
          if(!character.ownerUid)throw Error('The character must have a verified owner.');
          if(item.id!==itemId)throw Error('The item must have a stable inventory ID.');
          const prior=exists(loreSnapshot)?copy(loreSnapshot.data()):{};
          let secret=cleanSecretItemLore(type==='save'?command.lore||{}:{},prior,characterId,itemId);
          const now=new Date().toISOString();
          const currentOwner=String(character.name||'Character').slice(0,160);
          if(type==='save'&&!secret.ownershipHistory.length)
            secret=recordLoreOwnership(secret,currentOwner,currentUser.uid,now);
          if(type==='owner')secret=recordLoreOwnership(secret,command.ownerLabel,currentUser.uid,now);
          if(type==='reveal')secret=recordLoreDiscovery(secret,command.description,currentUser.uid,now);
          tx.set(loreRef,{...secret,updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
          // The public-facing record never copies curses, GM notes or hidden properties.
          // Ownership history is opt-in and discoveries are explicitly authored by the GM.
          const visible=visibleLoreDiscovery(secret,character.ownerUid,secret.discoveryHistory);
          tx.set(revealRef,{...visible,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
          return {id:loreId,type,status:'saved'};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    }
  };
}
