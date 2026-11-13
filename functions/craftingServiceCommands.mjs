// Phase 11.3: server-authorized GM stations, NPC service catalogue and repairs.
// Shared command receipts, ownership checks and Firestore transactions are reused.
import {
  normalizeCraftingStation,normalizeNPCService,stationAccessible,
  serviceSignature,repairTargetEligible,repairFingerprint,
  serviceInventoryPlan,applyApprovedRepair
} from '../src/state/craftingServicesModel.mjs';

export function createCraftingServiceCommands(context,helpers){
  const {db,currentUser,requestId,doc,runTransaction,serverTimestamp}=context;
  const {requireCampaignGM,requireLiveSession,liveCharacterRefs,
    verifyOwnedLiveCharacter,writeLiveCharacter,characterInventory,
    liveItemId,appendActivity,currencyTotal,setCurrencyTotal}=helpers;
  const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(s)&&
    !['__proto__','constructor','prototype'].includes(s);
  const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);
  const root=(cid,kind,id)=>doc(db,'campaigns',cid,kind,id);
  const stationFor=async(tx,cid,stationId,characterId)=>{
    if(!stationId)return null;
    if(!validId(stationId))throw Error('Station identifier is invalid.');
    const snap=await tx.get(root(cid,'craftingStations',stationId));
    if(!exists(snap))throw Error('The crafting station is unavailable.');
    const station=normalizeCraftingStation(snap.data(),stationId,snap.data());
    if(!stationAccessible(station,characterId))throw Error('This character cannot access the crafting station.');
    return station;
  };
  return {
    manageCraftingStation:async(campaignId,_scope,action={})=>{
      try{
        if(!['save','delete'].includes(action.type))throw Error('Choose save or delete.');
        const stationId=String(action.stationId||action.station?.id||
          (action.type==='save'?'station-'+requestId:''));
        if(!validId(stationId))throw Error('Choose a station ID.');
        const station=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const ref=root(campaignId,'craftingStations',stationId);
          const prior=await tx.get(ref);
          if(action.type==='delete'){
            if(!exists(prior))throw Error('Station already removed.');
            tx.delete(ref);return {id:stationId,status:'deleted'};
          }
          const next=normalizeCraftingStation(action.station||{},stationId,
            exists(prior)?prior.data():{});
          if(JSON.stringify(next).length>12000)throw Error('Station is too large.');
          tx.set(ref,{...next,createdAt:next.createdAt||Date.now(),
            updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
          return next;
        });
        return {ok:true,station};
      }catch(e){return {ok:false,error:e.message||String(e)};}
    },
    manageNPCService:async(campaignId,_scope,action={})=>{
      try{
        if(!['save','delete'].includes(action.type))throw Error('Choose save or delete.');
        const serviceId=String(action.serviceId||action.service?.id||
          (action.type==='save'?'npc-service-'+requestId:''));
        if(!validId(serviceId))throw Error('Choose a service ID.');
        const service=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const ref=root(campaignId,'npcCraftingServices',serviceId);
          const prior=await tx.get(ref);
          if(action.type==='delete'){
            if(!exists(prior))throw Error('Service already removed.');
            tx.delete(ref);return {id:serviceId,status:'deleted'};
          }
          const next=normalizeNPCService(action.service||{},serviceId,
            exists(prior)?prior.data():{});
          if(next.stationId){
            const station=await tx.get(root(campaignId,'craftingStations',next.stationId));
            if(!exists(station))throw Error('Choose an existing station.');
          }
          if(JSON.stringify(next).length>16000)throw Error('Service is too large.');
          tx.set(ref,{...next,createdAt:next.createdAt||Date.now(),
            updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
          return next;
        });
        return {ok:true,service};
      }catch(e){return {ok:false,error:e.message||String(e)};}
    },
    requestNPCRepair:async(campaignId,characterId,action={})=>{
      try{
        if(!validId(action.serviceId)||!validId(action.itemId))
          throw Error('Choose a repair service and one item.');
        const id='npc-repair-'+currentUser.uid+'-'+requestId;
        const request=await runTransaction(db,async tx=>{
          await requireLiveSession(tx,campaignId);
          const refs=liveCharacterRefs(campaignId,characterId);
          const [sheet,definition,prior]=await Promise.all([
            tx.get(refs.campaign),tx.get(root(campaignId,'npcCraftingServices',action.serviceId)),
            tx.get(root(campaignId,'npcRepairRequests',id))
          ]);
          if(!exists(sheet)||!exists(definition)||definition.data().status!=='published')
            throw Error('The character or repair service is unavailable.');
          if(exists(prior))throw Error('Repair request already exists.');
          const character={id:characterId,...sheet.data()};
          if(character.ownerUid!==currentUser.uid)
            throw Error('Only the character owner may request repairs.');
          await verifyOwnedLiveCharacter(tx,campaignId,characterId,character,refs);
          const service=normalizeNPCService(definition.data(),action.serviceId,definition.data());
          if(service.type!=='repair')throw Error('Only repair services can change equipment.');
          await stationFor(tx,campaignId,service.stationId,characterId);
          const inventory=characterInventory(character);
          const index=inventory.findIndex((row,i)=>liveItemId(row,i)===action.itemId);
          if(index<0||!repairTargetEligible(inventory[index],service))
            throw Error('Choose a damaged, eligible individual inventory item.');
          const materials=serviceInventoryPlan(service,inventory,index);
          if(!materials.ready)throw Error('Required repair materials are missing.');
          if(currencyTotal(character)<service.feeCopper)
            throw Error('Not enough currency for the repair fee.');
          const item=inventory[index];
          const record={id,serviceId:service.id,serviceName:service.name,
            characterId,characterName:String(character.name||'Character').slice(0,160),
            ownerUid:currentUser.uid,itemId:action.itemId,
            itemName:String(item.name||'Item').slice(0,160),
            itemFingerprint:repairFingerprint(item),service,
            status:'pending',createdBy:currentUser.uid,createdAt:serverTimestamp()};
          tx.set(root(campaignId,'npcRepairRequests',id),record);
          return {id,status:'pending',itemName:record.itemName};
        });
        return {ok:true,request};
      }catch(e){return {ok:false,error:e.message||String(e)};}
    },
    reviewNPCRepair:async(campaignId,_scope,repairRequestId,decision)=>{
      try{
        if(!validId(repairRequestId)||!['approve','reject'].includes(decision))
          throw Error('Choose a pending repair request and decision.');
        const result=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const ref=root(campaignId,'npcRepairRequests',repairRequestId);
          const saved=await tx.get(ref);
          if(!exists(saved))throw Error('Repair request not found.');
          const request=saved.data();
          if(request.status!=='pending')throw Error('Repair request already resolved.');
          if(decision==='reject'){
            tx.update(ref,{status:'rejected',resolvedBy:currentUser.uid,
              resolvedAt:serverTimestamp()});
            return {id:repairRequestId,status:'rejected'};
          }
          await requireLiveSession(tx,campaignId);
          const refs=liveCharacterRefs(campaignId,request.characterId);
          const [sheet,current]=await Promise.all([
            tx.get(refs.campaign),tx.get(root(campaignId,'npcCraftingServices',request.serviceId))
          ]);
          if(!exists(sheet)||!exists(current)||current.data().status!=='published')
            throw Error('The character or service is no longer available.');
          const character={id:request.characterId,...sheet.data()};
          if(character.ownerUid!==request.ownerUid)throw Error('Character ownership changed.');
          await verifyOwnedLiveCharacter(tx,campaignId,request.characterId,character,refs,true);
          const prior=normalizeNPCService(request.service,request.serviceId,request.service);
          const service=normalizeNPCService(current.data(),request.serviceId,current.data());
          if(service.type!=='repair'||serviceSignature(prior)!==serviceSignature(service))
            throw Error('Repair terms changed. Submit a new request.');
          await stationFor(tx,campaignId,service.stationId,request.characterId);
          const inventory=characterInventory(character);
          const index=inventory.findIndex((row,i)=>liveItemId(row,i)===request.itemId);
          if(index<0||repairFingerprint(inventory[index])!==request.itemFingerprint||
            !repairTargetEligible(inventory[index],service))
            throw Error('Item condition or identity changed. Submit a new request.');
          const materials=serviceInventoryPlan(service,inventory,index);
          if(!materials.ready)throw Error('Repair materials are no longer available.');
          const total=currencyTotal(character);
          if(total<service.feeCopper)throw Error('Insufficient currency for repair.');
          const next=inventory.map(row=>({...row}));
          for(const use of materials.allocations){
            if(use.index===index||!Number.isSafeInteger(use.quantity)||
              use.quantity<1||use.quantity>Number(next[use.index]?.qty||0))
              throw Error('Repair ingredient stack changed.');
            next[use.index].qty=Number(next[use.index].qty)-use.quantity;
          }
          next[index]=applyApprovedRepair(next[index],service);
          character.inventory=next.filter(row=>Number(row.qty??1)>0);
          setCurrencyTotal(character,total-service.feeCopper);
          appendActivity(character,{type:'npc-item-repaired',
            message:service.provider+' repaired '+request.itemName+
              ' to '+service.restoreTo+'% for '+service.feeCopper+' copper.'});
          writeLiveCharacter(tx,refs,character);
          tx.update(ref,{status:'approved',resolvedBy:currentUser.uid,
            resolvedAt:serverTimestamp(),feeSpentCopper:service.feeCopper});
          return {id:repairRequestId,status:'approved',itemName:request.itemName};
        });
        return {ok:true,request:result};
      }catch(e){return {ok:false,error:e.message||String(e)};}
    }
  };
}
