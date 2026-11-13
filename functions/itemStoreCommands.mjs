import {isCampaignGM,readCampaignMember} from './characterPermissions.mjs';
import {normalizeMarketPricing} from '../src/systems/items/marketPricing.mjs';
import {shopStockCompatible,merchantPriceCopper} from '../src/state/shopTransactionModel.mjs';
import {prepareGMRewardBundle} from '../src/state/gmRewardModel.mjs';
import {merchantStockIdentity,validateRestockPolicy,merchantRestockPlan,MAX_MERCHANT_RESTOCK_AUDIT} from '../src/state/merchantInventoryModel.mjs';
import {moveMerchantOnRoute,merchantTravelState,normalizeMerchantRoute,MAX_MERCHANT_TRAVEL_HISTORY} from '../src/state/merchantTravelModel.mjs';
import {merchantRelationshipId,updateMerchantRelationship,validateMerchantOpportunity} from '../src/state/merchantRelationshipModel.mjs';
import {isLinkedCharacter} from './characterPermissions.mjs';
import {normalizeCraftingRecipe} from '../src/state/craftingRecipeModel.mjs';
import {normalizeMerchantTemplate,merchantTemplateStock} from '../src/state/merchantTemplateModel.mjs';
import {mergeGeneratedMerchantStock} from '../src/state/shopGeneratorIntegrationModel.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
const exists=row=>typeof row?.exists==='function'?row.exists():Boolean(row?.exists);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const safeText=(value,max)=>String(value??'').trim().slice(0,max);
const posNumber=(value,fallback,min=0,max=1e9)=>{
  const number=Number(value);
  return Number.isFinite(number)&&number>=min&&number<=max?number:fallback;
};
export const PHASE33_MAX_SHOP_STOCK=120;
export function cleanGMShop(input={},previous={},shopId=''){
  const output={
    id:shopId||previous.id,
    name:safeText(input.name??previous.name??'Campaign Shop',160),
    type:safeText(input.type??previous.type??'General Goods',90),
    npcId:safeText(input.npcId??previous.npcId??'',160),
    npcName:safeText(input.npcName??previous.npcName??'',160),
    locationId:safeText(input.locationId??previous.locationId??'',160),
    locationName:safeText(input.locationName??previous.locationName??'',160),
    region:safeText(input.region??previous.region??'',200),
    description:safeText(input.description??previous.description??'',2000),
    personality:safeText(input.personality??previous.personality??'',500),
    greeting:safeText(input.greeting??previous.greeting??'',500),
    specialOffer:safeText(input.specialOffer??previous.specialOffer??'',500),
    status:String(input.status??previous.status??'closed')==='open'?'open':'closed',
    image:safeText(input.image??previous.image??'',1000),
    buyModifier:posNumber(input.buyModifier??previous.buyModifier,1,0.1,10),
    sellModifier:posNumber(input.sellModifier??previous.sellModifier,1,0.1,10),
    currencyCopper:posNumber(input.currencyCopper??previous.currencyCopper,100000,0,1e12),
    visitorCharacterIds:Array.from(new Set(
      (Array.isArray(input.visitorCharacterIds)?input.visitorCharacterIds:previous.visitorCharacterIds||[])
        .filter(id).slice(0,60)
    )),
    stock:Array.isArray(previous.stock)?copy(previous.stock):[],
    restockHistory:Array.isArray(previous.restockHistory)?copy(previous.restockHistory).slice(0,MAX_MERCHANT_RESTOCK_AUDIT):[],
    travel:previous.travel&&typeof previous.travel==='object'?copy(previous.travel):null,
    travelHistory:Array.isArray(previous.travelHistory)?copy(previous.travelHistory).slice(0,MAX_MERCHANT_TRAVEL_HISTORY):[]
  };
  if(!id(output.id))throw Error('Choose a valid shop.');
  if(!output.name)throw Error('Enter a shop name.');
  if(output.stock.length>PHASE33_MAX_SHOP_STOCK)throw Error('This shop has too many stock types.');
  if(JSON.stringify(output).length>680000)throw Error('This shop record is too large.');
  return output;
}

export function applyGMShopAction(current,action={},shopId=''){
  if(action.type==='delete')return {...cleanGMShop({},current,shopId),status:'deleted',stock:[]};
  if(current?.status==='deleted')throw Error('Deleted shops cannot be modified.');
  if(action.type==='apply-generated-stock'){
    if(!current.id||current.deleted||current.status==='deleted')
      throw Error('Choose an existing active merchant.');
    const next=cleanGMShop({},current,shopId);
    const normalized=merchantTemplateStock(action.stock).map(row=>{
      const item=normalizeMarketPricing(copy(row.item),
        {legacy:true,removeLegacy:true,migratedRecord:true});
      return {...row,item,priceCopper:merchantPriceCopper(next,item,'buy')};
    });
    next.stock=mergeGeneratedMerchantStock(next.stock,normalized,action.mode).stock;
    if(JSON.stringify(next).length>680000)throw Error('Generated shop inventory is too large.');
    return next;
  }
  if(action.type==='create-from-template'){
    const template=normalizeMerchantTemplate(action.template);
    const next=cleanGMShop({
      ...template,...(action.shop||{}),id:shopId,status:'closed',
      visitorCharacterIds:[],currencyCopper:100000
    },{id:shopId},shopId);
    next.stock=template.stock.map(row=>{
      const item=normalizeMarketPricing(copy(row.item),
        {legacy:true,removeLegacy:true,migratedRecord:true});
      item.name=item.name||item.title;
      return {...row,item,priceCopper:merchantPriceCopper(next,item,'buy')};
    });
    if(next.stock.length>PHASE33_MAX_SHOP_STOCK||JSON.stringify(next).length>680000)
      throw Error('This merchant template would create an oversized shop.');
    return next;
  }
  if(action.type==='save'){
    const next=cleanGMShop(action.shop||{},current,shopId);
    if(merchantTravelState(current)==='travelling'&&
      (next.status!=='closed'||next.region!==current.region))
      throw Error('This merchant is travelling. Finish the journey before opening or relocating this shop.');
    return next;
  }
  const shop=cleanGMShop({},current,shopId);
  if(['assign-route','depart-route','arrive-route','unassign-route'].includes(action.type)){
    const changed=moveMerchantOnRoute(shop,action,action.route);
    if(JSON.stringify(changed).length>680000)throw Error('This shop record is too large.');
    return changed;
  }
  if(action.type==='configure-opportunity'){
    const index=Number(action.stockIndex);
    if(!Number.isSafeInteger(index)||index<0||index>=shop.stock.length)
      throw Error('Choose an existing stock item.');
    if(merchantStockIdentity(shop.stock[index].item)!==String(action.stockIdentity||''))
      throw Error('Shop stock changed. Refresh before configuring special access.');
    const policy=validateMerchantOpportunity(action.minStanding,action.opportunityLabel);
    Object.assign(shop.stock[index],policy);
    if(JSON.stringify(shop).length>680000)throw Error('Shop record too large.');
    return shop;
  }
  if(action.type==='stock'){
    const qty=Number(action.quantity);
    if(!Number.isSafeInteger(qty)||qty<1||qty>1000000)throw Error('Choose a stock quantity between 1 and 1,000,000.');
    const source=copy(action.item||{});
    if(!String(source.name||source.title||'').trim())throw Error('Choose a compendium item to stock.');
    const item=normalizeMarketPricing(source,{legacy:true,removeLegacy:true,migratedRecord:true});
    item.name=item.name||item.title;
    const row=shop.stock.find(value=>shopStockCompatible(value.item,item));
    if(row){
      if(!Number.isSafeInteger(Number(row.qty)+qty)||Number(row.qty)+qty>1000000)throw Error('This shop stack is too large.');
      row.qty+=qty;row.priceCopper=merchantPriceCopper(shop,row.item,'buy');
    }else{
      if(shop.stock.length>=PHASE33_MAX_SHOP_STOCK)throw Error('This shop has reached its stock limit.');
      shop.stock.push({item,qty,priceCopper:merchantPriceCopper(shop,item,'buy')});
    }
  }else if(['set-stock','configure-restock','restock','restock-all'].includes(action.type)){
    // Existing stock indices are never trusted alone: the GM must confirm the
    // item identity captured from the current view. The transaction protects
    // concurrent sales and other GM adjustments from being overwritten.
    const all=action.type==='restock-all';
    const index=Number(action.stockIndex);
    if(!all&&(!Number.isSafeInteger(index)||index<0||index>=shop.stock.length))
      throw Error('Choose an existing stock item.');
    if(!all&&merchantStockIdentity(shop.stock[index].item)!==String(action.stockIdentity||''))
      throw Error('Shop stock changed. Refresh this item before editing.');
    if(action.type==='set-stock'){
      const quantity=Number(action.quantity);
      if(!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000)
        throw Error('Choose a whole stock quantity between 0 and 1,000,000.');
      shop.stock[index].qty=quantity;
    }else if(action.type==='configure-restock'){
      const policy=validateRestockPolicy(Number(action.restockTarget),Number(action.lowStockAt));
      Object.assign(shop.stock[index],policy);
    }else{
      const plan=merchantRestockPlan(shop.stock,all?null:index);
      if(!plan.lines)throw Error('No configured items need restocking.');
      for(const row of plan.changes){
        shop.stock[row.index].qty=row.to;
      }
      const historyEntry={
        id:String(action.operationId||'').slice(0,100),
        action:all?'restock-all':'restock',
        lines:plan.lines,units:plan.units,
        summary:plan.changes.slice(0,15).map(entry=>({
          name:entry.itemName,from:entry.from,to:entry.to
        }))
      };
      shop.restockHistory=[historyEntry,...shop.restockHistory].slice(0,MAX_MERCHANT_RESTOCK_AUDIT);
    }
  }else if(action.type==='remove-stock'){
    const i=Number(action.stockIndex);
    if(!Number.isSafeInteger(i)||i<0||i>=shop.stock.length)throw Error('Choose an existing stock item.');
    if(action.stockIdentity&&merchantStockIdentity(shop.stock[i].item)!==String(action.stockIdentity))
      throw Error('Shop stock changed. Refresh this item before removing.');
    shop.stock.splice(i,1);
  }else throw Error('Choose a valid shop action.');
  if(JSON.stringify(shop).length>680000)throw Error('This shop record is too large.');
  return shop;
}

export function createItemStoreCommands({db,currentUser,requestId,doc,runTransaction,serverTimestamp}){
  const gm=async(tx,campaignId)=>{
    const snapshot=await tx.get(doc(db,'campaigns',campaignId));
    if(!exists(snapshot))throw Error('Campaign not found.');
    const campaign=snapshot.data();
    const membership=await readCampaignMember({get:async ref=>{
      const record=await tx.get(ref);return {exists:exists(record),data:()=>record.data()};
    }},db,campaignId,campaign,currentUser.uid);
    if(!isCampaignGM(campaign,currentUser.uid,membership))throw Error('Only the campaign GM can manage this system.');
    return campaign;
  };
  return {
    manageMerchantRelationship:async(campaignId,_scope,action={})=>{
      try{
        const shopId=String(action.shopId||''),characterId=String(action.characterId||'');
        const relationId=merchantRelationshipId(shopId,characterId);
        const saved=await runTransaction(db,async tx=>{
          const campaign=await gm(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'merchantRelationships',relationId);
          const shopRef=doc(db,'campaigns',campaignId,'shops',shopId);
          const characterRef=doc(db,'campaigns',campaignId,'characters',characterId);
          const [relation,shop,character]=await Promise.all([
            tx.get(ref),tx.get(shopRef),tx.get(characterRef)
          ]);
          if(!exists(shop)||shop.data()?.deleted||shop.data()?.status==='deleted')
            throw Error('Merchant is unavailable.');
          if(!exists(character)||!isLinkedCharacter(campaign,characterId,character.data(),campaignId))
            throw Error('Choose a currently linked campaign character.');
          const ownerUid=character.data().ownerUid;
          if(!ownerUid)throw Error('The character owner is unavailable.');
          const updated=updateMerchantRelationship(relation.data()||{},action,
            {shopId,characterId,ownerUid,operationId:requestId});
          updated.history[0].at=new Date().toISOString();
          updated.history[0].by=currentUser.uid;
          tx.set(ref,{...updated,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
          return updated;
        });
        return {ok:true,relationship:saved};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    // Campaign recipes are public only when deliberately published by a GM.
    // Legacy free-text GM crafting notes stay untouched in the GM workspace.
    manageCampaignCraftingRecipe:async(campaignId,_scope,action={})=>{
      try{
        if(!['save','delete'].includes(action.type))
          throw Error('Choose save or delete for a crafting recipe.');
        const recipeId=String(action.recipeId||action.recipe?.id||
          (action.type==='save'?'recipe-'+requestId:''));
        if(!id(recipeId))throw Error('Choose a valid recipe identifier.');
        const value=await runTransaction(db,async tx=>{
          await gm(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'craftingRecipes',recipeId);
          const previousSnap=await tx.get(ref);
          if(action.type==='delete'){
            if(!exists(previousSnap))throw Error('The recipe was already removed.');
            tx.delete(ref);
            return {id:recipeId,status:'deleted'};
          }
          const previous=exists(previousSnap)?previousSnap.data():{};
          const recipe=normalizeCraftingRecipe(action.recipe||{},recipeId,previous);
          if(recipe.stationId){
            const station=await tx.get(doc(db,'campaigns',campaignId,'craftingStations',recipe.stationId));
            if(!exists(station))throw Error('Choose an existing crafting station.');
          }
          recipe.createdAt=previous.createdAt||Date.now();
          if(JSON.stringify(recipe).length>18000)
            throw Error('This recipe definition is too large.');
          tx.set(ref,{...recipe,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
          return recipe;
        });
        return {ok:true,recipe:value};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    // One trusted write per shop, not the old monolithic itemEcosystem.shops array.
    manageCampaignShop:async(campaignId,_scope,action={})=>{
      try{
        const type=String(action.type||'save');
        if(!['save','stock','remove-stock','set-stock','configure-restock',
          'restock','restock-all','assign-route','depart-route','arrive-route',
          'unassign-route','configure-opportunity','create-from-template','apply-generated-stock','delete'].includes(type))
          throw Error('Choose a valid shop action.');
        const shopId=String(action.shopId||action.shop?.id||
          (['save','create-from-template'].includes(type)?'shop-'+requestId:''));
        if(!id(shopId))throw Error('Choose a valid shop identifier.');
        const data=await runTransaction(db,async tx=>{
          await gm(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'shops',shopId);
          const legacyRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
          const routeAction=['assign-route','depart-route','arrive-route','unassign-route'].includes(type);
          const workspaceRef=doc(db,'campaigns',campaignId,'systems','gmWorkspace');
          const [stored,legacy,workspaceSnap]=await Promise.all([
            tx.get(ref),tx.get(legacyRef),...(routeAction?[tx.get(workspaceRef)]:[])
          ]);
          let route=null;
          const priorShop=exists(stored)?stored.data():
            (Array.isArray(legacy.data()?.shops)?legacy.data().shops:[])
              .find(row=>String(row.id)===shopId);
          if(routeAction&&type!=='arrive-route'&&type!=='unassign-route'){
            const routeId=String(type==='assign-route'?action.routeId:priorShop?.travel?.routeId||'');
            const routes=Array.isArray(workspaceSnap?.data()?.economy?.routes)?
              workspaceSnap.data().economy.routes:[];
            const match=routes.find(row=>String(row?.id)===routeId);
            if(!match)throw Error('Selected trade route no longer exists.');
            route=normalizeMerchantRoute(match);
          }
          if(routeAction&&type==='arrive-route'&&priorShop?.travel?.routeId){
            // Arrival is allowed even if the GM removes a route mid-journey,
            // so an old travelling merchant can never become stranded.
            route=null;
          }
          const original=exists(stored)?stored.data():
            (Array.isArray(legacy.data()?.shops)?legacy.data().shops:[])
              .find(row=>String(row.id)===shopId);
          if(!['save','create-from-template'].includes(type)&&!original)throw Error('Shop not found.');
          if(type==='create-from-template'&&original)
            throw Error('A merchant template cannot overwrite an existing shop.');
          if(type==='save'&&!original&&action.shop?.id&&String(action.shop.id)!==shopId)
            throw Error('Shop identity changed.');
          const shop=applyGMShopAction(original||{id:shopId},
            {...action,type,operationId:requestId,route},shopId);
          if(routeAction&&shop.travelHistory?.length){
            shop.travelHistory[0].at=new Date().toISOString();
            shop.travelHistory[0].by=currentUser.uid;
          }
          // Record GM restock author and event time only on a successful commit,
          // without modifying the ordinary merchant currency/stock pricing rules.
          if(['restock','restock-all'].includes(type)&&shop.restockHistory.length){
            shop.restockHistory[0].at=new Date().toISOString();
            shop.restockHistory[0].by=currentUser.uid;
          }
          tx.set(ref,{...shop,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
          return shop;
        });
        return {ok:true,shop:data};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    manageGMRewardBundle:async(campaignId,_scope,action={})=>{
      try{
        if(!['save','delete'].includes(action.type))throw Error('Choose a valid bundle action.');
        const bundleId=String(action.id||action.bundle?.id||
          (action.type==='save'?'gm-bundle-'+requestId:''));
        if(!id(bundleId))throw Error('Choose a valid reward bundle.');
        const saved=await runTransaction(db,async tx=>{
          await gm(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'rewardBundles',bundleId);
          const previous=await tx.get(ref);
          if(action.type==='delete'){
            if(!exists(previous))return {id:bundleId,deleted:true};
            // A tombstone prevents a stale client-side cached template from
            // silently recreating an intentionally deleted bundle.
            tx.set(ref,{id:bundleId,deleted:true,updatedBy:currentUser.uid,updatedAt:serverTimestamp()},{merge:true});
            return {id:bundleId,deleted:true};
          }
          const bundle=prepareGMRewardBundle({...action.bundle,id:bundleId},exists(previous)?previous.data():{});
          tx.set(ref,{...bundle,deleted:false,updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
          return bundle;
        });
        return {ok:true,bundle:saved};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    // Copy a bounded batch into individual shop documents before clearing their
    // source entries. Legacy data stays available if the transaction fails.
    syncCampaignShopStores:async(campaignId,_scope)=>{
      try{
        const result=await runTransaction(db,async tx=>{
          await gm(tx,campaignId);
          const legacyRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
          const publicRef=doc(db,'campaigns',campaignId,'systems','itemPublic');
          const [snapshot,publicSnapshot]=await Promise.all([tx.get(legacyRef),tx.get(publicRef)]);
          const ecosystem=exists(snapshot)?snapshot.data():{};
          const original=Array.isArray(ecosystem.shops)?ecosystem.shops:[];
          const candidates=original.slice(0,8);
          const refs=candidates.map(value=>doc(db,'campaigns',campaignId,'shops',value.id));
          const existing=await Promise.all(refs.map(ref=>tx.get(ref)));
          for(let i=0;i<candidates.length;i++){
            const shop=candidates[i];
            if(!id(shop.id))throw Error('An existing shop has an invalid identifier. No shops were migrated.');
            if(!exists(existing[i])){
              tx.set(refs[i],{...cleanGMShop({},shop,shop.id),updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
            }
          }
          if(candidates.length){
            const remaining=original.slice(candidates.length);
            // Clear source only in the same transaction as the canonical copy.
            tx.update(legacyRef,{shops:remaining,updatedAt:serverTimestamp()});
            const previous=exists(publicSnapshot)?publicSnapshot.data():{};
            tx.set(publicRef,{
              version:'asteria-item-public-v1',
              shops:remaining,
              partyLoot:Array.isArray(previous.partyLoot)?previous.partyLoot:Array.isArray(ecosystem.partyLoot)?ecosystem.partyLoot:[],
              sharedStorages:Array.isArray(previous.sharedStorages)?previous.sharedStorages:Array.isArray(ecosystem.sharedStorages)?ecosystem.sharedStorages:[],
              updatedAt:serverTimestamp()
            },{merge:true});
          }
          return {migrated:candidates.length,remaining:Math.max(0,original.length-candidates.length)};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    },
    // Idempotent, capped migration of the old GM reward template array.
    // Never delete source data until every copied record is committed.
    syncGMRewardBundles:async(campaignId,_scope)=>{
      try{
        const result=await runTransaction(db,async tx=>{
          await gm(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'systems','gmWorkspace');
          const workspace=await tx.get(ref);
          if(!exists(workspace))return {migrated:0,remaining:0};
          const original=workspace.data();
          const items=Array.isArray(original.gameplay?.rewardBundles)?original.gameplay.rewardBundles:[];
          const ready=items.slice(0,20).filter(item=>id(item?.id));
          const refs=ready.map(item=>doc(db,'campaigns',campaignId,'rewardBundles',item.id));
          const snaps=await Promise.all(refs.map(value=>tx.get(value)));
          let migrated=0;
          for(let i=0;i<ready.length;i++){
            if(exists(snaps[i]))continue;
            const bundle=prepareGMRewardBundle(ready[i],ready[i]);
            tx.set(refs[i],{...bundle,deleted:false,updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
            migrated++;
          }
          const known=new Set(ready.map(value=>value.id));
          const pending=items.filter(value=>!known.has(value?.id));
          if(ready.length){
            tx.update(ref,{gameplay:{...original.gameplay,rewardBundles:pending},updatedAt:serverTimestamp()});
          }
          return {migrated,remaining:pending.length};
        });
        return {ok:true,...result};
      }catch(error){return {ok:false,error:error.message||String(error)};}
    }
  };
}
