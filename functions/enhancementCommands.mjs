// Phase 11.2 — server-authorized enhancement plans and requests.
// The existing authenticated handler provides receipt/idempotency and campaign
// membership. No browser-supplied mana, ingredient counts or target state is trusted.
import {
  normalizeEnhancementPlan,enchantmentPreview,enchantmentInventoryPlan,
  enhancementPlanSignature,enhancementTargetEligible,enhancementTargetFingerprint,
  applyApprovedEnhancement
} from '../src/state/itemEnhancementModel.mjs';
import {applyResourceChanges,resourceSnapshot} from '../src/state/resourceEngine.mjs';

export function createEnhancementCommands(context,helpers){
  const {db,currentUser,requestId,doc,runTransaction,serverTimestamp}=context;
  const {requireCampaignGM,requireLiveSession,liveCharacterRefs,
    verifyOwnedLiveCharacter,writeLiveCharacter,characterInventory,
    liveItemId,appendActivity}=helpers;
  const exists=row=>typeof row?.exists==='function'?row.exists():Boolean(row?.exists);
  const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
  const list=value=>Array.isArray(value)?value:[];
  return {
    manageEnhancementPlan:async(campaignId,_scope,action={})=>{
      try{
        if(!['save','delete'].includes(action.type))throw Error('Choose save or delete.');
        const planId=String(action.planId||action.plan?.id||
          (action.type==='save'?'enhance-'+requestId:''));
        if(!validId(planId))throw Error('Choose a valid enhancement plan.');
        const result=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'enhancementPlans',planId);
          const before=await tx.get(ref);
          if(action.type==='delete'){
            if(!exists(before))throw Error('This plan was already removed.');
            tx.delete(ref);
            return {id:planId,status:'deleted'};
          }
          const plan=normalizeEnhancementPlan(action.plan||{},planId,exists(before)?before.data():{});
          // Never publish invalid enchanted material costs or mana ranges.
          if(plan.mode==='enchantment')enchantmentPreview(plan,'Extreme');
          if(JSON.stringify(plan).length>16000)throw Error('Enhancement plan too large.');
          const createdAt=exists(before)?before.data().createdAt:Date.now();
          tx.set(ref,{...plan,createdAt,updatedBy:currentUser.uid,
            updatedAt:serverTimestamp()});
          return plan;
        });
        return {ok:true,plan:result};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    requestEnhancement:async(campaignId,characterId,action={})=>{
      try{
        if(!validId(action.planId)||!validId(action.itemId))
          throw Error('Choose an enhancement and a target item.');
        const stoneMode=action.stoneMode||'standard';
        const id='enh-'+currentUser.uid+'-'+requestId;
        const request=await runTransaction(db,async tx=>{
          await requireLiveSession(tx,campaignId);
          const refs=liveCharacterRefs(campaignId,characterId);
          const planRef=doc(db,'campaigns',campaignId,'enhancementPlans',action.planId);
          const requestRef=doc(db,'campaigns',campaignId,'enhancementRequests',id);
          const [characterSnap,planSnap,past]=await Promise.all([
            tx.get(refs.campaign),tx.get(planRef),tx.get(requestRef)
          ]);
          if(!exists(characterSnap))throw Error('Character not found.');
          if(!exists(planSnap)||planSnap.data().status!=='published')
            throw Error('Enhancement plan is unavailable.');
          if(exists(past))throw Error('This enhancement request already exists.');
          const character={id:characterId,...characterSnap.data()};
          if(character.ownerUid!==currentUser.uid)
            throw Error('Only the character owner can request enhancements.');
          await verifyOwnedLiveCharacter(tx,campaignId,characterId,character,refs);
          const plan=normalizeEnhancementPlan(planSnap.data(),action.planId,planSnap.data());
          const inventory=characterInventory(character);
          const targetIndex=inventory.findIndex((row,index)=>
            liveItemId(row,index)===action.itemId);
          if(targetIndex<0||!enhancementTargetEligible(inventory[targetIndex],plan))
            throw Error('Choose an eligible individual item to enhance.');
          const item=inventory[targetIndex];
          const affinity=String(item.enchantmentAffinity||item.materialAffinity||'None');
          const preview=enchantmentPreview(plan,affinity,stoneMode);
          const materials=enchantmentInventoryPlan(plan,inventory,targetIndex,stoneMode);
          if(!materials.ready)throw Error('Required materials are missing.');
          if(plan.manaCost){
            const mana=resourceSnapshot(character,'mp');
            if(mana.current<plan.manaCost)throw Error('Not enough Mana to enhance this item.');
          }
          const record={
            id,planId:action.planId,planName:plan.name,characterId,
            characterName:String(character.name||'Character').slice(0,160),
            ownerUid:currentUser.uid,itemId:action.itemId,
            itemName:String(item.name||'Item').slice(0,160),
            targetFingerprint:enhancementTargetFingerprint(item),
            plan,stoneMode,preview,status:'pending',
            createdBy:currentUser.uid,createdAt:serverTimestamp()
          };
          tx.set(requestRef,record);
          return {id,status:'pending',planName:plan.name,itemName:record.itemName};
        });
        return {ok:true,request};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    reviewEnhancement:async(campaignId,_scope,enhancementRequestId,decision)=>{
      try{
        if(!validId(enhancementRequestId)||!['approve','reject'].includes(decision))
          throw Error('Choose a pending enhancement and approve or reject.');
        const result=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'enhancementRequests',enhancementRequestId);
          const saved=await tx.get(ref);
          if(!exists(saved))throw Error('Enhancement request not found.');
          const request=saved.data();
          if(request.status!=='pending')throw Error('This request was already reviewed.');
          if(decision==='reject'){
            tx.update(ref,{status:'rejected',resolvedBy:currentUser.uid,
              resolvedAt:serverTimestamp()});
            return {id:enhancementRequestId,status:'rejected'};
          }
          await requireLiveSession(tx,campaignId);
          const refs=liveCharacterRefs(campaignId,request.characterId);
          const planRef=doc(db,'campaigns',campaignId,'enhancementPlans',request.planId);
          const [characterSnap,planSnap]=await Promise.all([
            tx.get(refs.campaign),tx.get(planRef)
          ]);
          if(!exists(characterSnap))throw Error('The target character is unavailable.');
          if(!exists(planSnap)||planSnap.data().status!=='published')
            throw Error('The enhancement plan is no longer published.');
          const character={id:request.characterId,...characterSnap.data()};
          if(character.ownerUid!==request.ownerUid)throw Error('Character ownership changed.');
          await verifyOwnedLiveCharacter(tx,campaignId,request.characterId,character,refs,true);
          const original=normalizeEnhancementPlan(request.plan,request.planId,request.plan);
          const plan=normalizeEnhancementPlan(planSnap.data(),request.planId,planSnap.data());
          if(enhancementPlanSignature(original)!==enhancementPlanSignature(plan))
            throw Error('The enhancement plan changed. Request a fresh review.');
          const inventory=characterInventory(character);
          const index=inventory.findIndex((row,i)=>liveItemId(row,i)===request.itemId);
          if(index<0)throw Error('The target item no longer exists.');
          const target=inventory[index];
          if(enhancementTargetFingerprint(target)!==request.targetFingerprint||
            !enhancementTargetEligible(target,plan))
            throw Error('The target item changed. Request another enhancement.');
          const affinity=String(target.enchantmentAffinity||target.materialAffinity||'None');
          enchantmentPreview(plan,affinity,request.stoneMode);
          const materialPlan=enchantmentInventoryPlan(plan,inventory,index,request.stoneMode);
          if(!materialPlan.ready)throw Error('Required enhancement materials are no longer available.');
          // Compute all changes in memory first. Any failure aborts the entire
          // Firebase transaction including material/MP costs and request status.
          const copy=inventory.map(row=>({...row}));
          for(const used of materialPlan.allocations){
            if(!Number.isSafeInteger(used.quantity)||used.quantity<1||
              used.index===index||used.quantity>Number(copy[used.index]?.qty||0))
              throw Error('An enhancement material stack changed.');
            copy[used.index].qty=Number(copy[used.index].qty)-used.quantity;
          }
          copy[index]=applyApprovedEnhancement(copy[index],plan);
          character.inventory=copy.filter(row=>Number(row.qty??1)>0);
          const paid=plan.manaCost?applyResourceChanges(character,{costs:{mp:plan.manaCost}}):character;
          Object.assign(character,paid);
          appendActivity(character,{type:'enhancement-completed',
            message:plan.effectName+' applied to '+request.itemName+' using '+plan.name+'.'});
          writeLiveCharacter(tx,refs,character);
          tx.update(ref,{status:'approved',resolvedBy:currentUser.uid,
            resolvedAt:serverTimestamp(),manaSpent:plan.manaCost,
            effectName:plan.effectName});
          return {id:enhancementRequestId,status:'approved',
            itemName:request.itemName,effectName:plan.effectName};
        });
        return {ok:true,request:result};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    }
  };
}
