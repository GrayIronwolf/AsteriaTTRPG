// Phase 11.1 — campaign crafting requests use the same trusted transaction,
// linked-character ownership and inventory mirror as trade and loot actions.
import {normalizeCraftingRecipe,craftingInventoryPlan,craftingResultItem} from '../src/state/craftingRecipeModel.mjs';

export function createCraftingCommands(context,helpers){
  const {db,currentUser,requestId,doc,runTransaction,serverTimestamp}=context;
  const {requireCampaignGM,requireLiveSession,liveCharacterRefs,
    verifyOwnedLiveCharacter,writeLiveCharacter,characterInventory,
    placeCharacterItem,appendActivity}=helpers;
  const exists=s=>Boolean(s?.exists?.());
  const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(s);
  return {
    requestCraftingRecipe:async(campaignId,characterId,recipeId)=>{
      try{
        if(!validId(recipeId))throw Error('Choose a valid crafting recipe.');
        const id='craft-'+currentUser.uid+'-'+requestId;
        const result=await runTransaction(db,async tx=>{
          await requireLiveSession(tx,campaignId);
          const refs=liveCharacterRefs(campaignId,characterId);
          const recipeRef=doc(db,'campaigns',campaignId,'craftingRecipes',recipeId);
          const requestRef=doc(db,'campaigns',campaignId,'craftingRequests',id);
          const [characterSnap,recipeSnap,requestSnap]=await Promise.all([
            tx.get(refs.campaign),tx.get(recipeRef),tx.get(requestRef)
          ]);
          if(!exists(characterSnap))throw Error('Character unavailable.');
          if(!exists(recipeSnap)||recipeSnap.data().status!=='published')
            throw Error('This crafting recipe is not published.');
          if(exists(requestSnap))throw Error('This crafting request already exists.');
          const character={id:characterId,...characterSnap.data()};
          if(character.ownerUid!==currentUser.uid)throw Error('Only the character owner can request crafting.');
          await verifyOwnedLiveCharacter(tx,campaignId,characterId,character,refs);
          const recipe=normalizeCraftingRecipe(recipeSnap.data(),recipeId,recipeSnap.data());
          const plan=craftingInventoryPlan(recipe,characterInventory(character));
          if(!plan.ready)throw Error('You do not currently have all required crafting materials.');
          const request={
            id,recipeId,recipeName:recipe.name,characterId,characterName:String(character.name||'Character').slice(0,160),
            ownerUid:currentUser.uid,recipe,
            status:'pending',createdBy:currentUser.uid,
            createdAt:serverTimestamp()
          };
          tx.set(requestRef,request);
          return {id,status:'pending',recipeName:recipe.name};
        });
        return {ok:true,request:result};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    reviewCraftingRequest:async(campaignId,_scope,craftingRequestId,decision)=>{
      try{
        if(!validId(craftingRequestId))throw Error('Choose a valid crafting request.');
        if(!['approve','reject'].includes(decision))throw Error('Choose approve or reject.');
        const result=await runTransaction(db,async tx=>{
          await requireCampaignGM(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'craftingRequests',craftingRequestId);
          const requestSnap=await tx.get(ref);
          if(!exists(requestSnap))throw Error('Crafting request not found.');
          const request=requestSnap.data();
          if(request.status!=='pending')throw Error('This crafting request is already resolved.');
          if(decision==='reject'){
            tx.update(ref,{status:'rejected',resolvedBy:currentUser.uid,resolvedAt:serverTimestamp()});
            return {id:craftingRequestId,status:'rejected'};
          }
          await requireLiveSession(tx,campaignId);
          const refs=liveCharacterRefs(campaignId,request.characterId);
          const recipeRef=doc(db,'campaigns',campaignId,'craftingRecipes',request.recipeId);
          const [characterSnap,recipeSnap]=await Promise.all([
            tx.get(refs.campaign),tx.get(recipeRef)
          ]);
          if(!exists(characterSnap))throw Error('Crafting character is no longer linked.');
          if(!exists(recipeSnap)||recipeSnap.data().status!=='published')
            throw Error('The crafting recipe is no longer available.');
          const character={id:request.characterId,...characterSnap.data()};
          if(character.ownerUid!==request.ownerUid)throw Error('Character ownership changed.');
          await verifyOwnedLiveCharacter(tx,campaignId,request.characterId,character,refs,true);
          const original=normalizeCraftingRecipe(request.recipe,request.recipeId,request.recipe);
          const current=normalizeCraftingRecipe(recipeSnap.data(),request.recipeId,recipeSnap.data());
          // Material requirements, output and publication must not silently
          // change between proposal and approval.
          const signature=r=>JSON.stringify([r.materials,r.output,r.status]);
          if(signature(original)!==signature(current))
            throw Error('The recipe changed. Ask the player to submit a new request.');
          const inventory=characterInventory(character);
          const plan=craftingInventoryPlan(current,inventory);
          if(!plan.ready)throw Error('The character no longer has the required crafting materials.');
          // Preflight storage capacity before consuming any resources.
          const granted=placeCharacterItem(character,craftingResultItem(current),{});
          const working=characterInventory(character);
          const used=new Map();
          for(const row of plan.allocations){
            const item=inventory[row.index];
            const key=String(item.instanceId||item.id);
            const matched=working.find(x=>String(x.instanceId||x.id)===key);
            if(!matched)throw Error('An ingredient changed. Try again.');
            used.set(key,row.quantity);
          }
          for(const item of working){
            const key=String(item.instanceId||item.id);
            if(!used.has(key))continue;
            item.qty=Number(item.qty)-used.get(key);
            if(item.qty<0)throw Error('Crafting ingredients are no longer available.');
          }
          character.inventory=working.filter(row=>Number(row.qty)>0);
          appendActivity(character,{
            type:'crafting-completed',
            message:'Crafted '+current.output.quantity+' × '+current.output.name+
              ' using '+current.name+'.'
          });
          writeLiveCharacter(tx,refs,character);
          tx.update(ref,{
            status:'approved',resolvedBy:currentUser.uid,resolvedAt:serverTimestamp(),
            resultItemId:granted?.id||null
          });
          return {id:craftingRequestId,status:'approved',output:current.output.name};
        });
        return {ok:true,request:result};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    }
  };
}
