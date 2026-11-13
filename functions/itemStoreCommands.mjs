import {isCampaignGM,readCampaignMember} from './characterPermissions.mjs';
import {normalizeMarketPricing} from '../src/systems/items/marketPricing.mjs';
import {shopStockCompatible,merchantPriceCopper} from '../src/state/shopTransactionModel.mjs';
import {prepareGMRewardBundle} from '../src/state/gmRewardModel.mjs';

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
    stock:Array.isArray(previous.stock)?copy(previous.stock):[]
  };
  if(!id(output.id))throw Error('Choose a valid shop.');
  if(!output.name)throw Error('Enter a shop name.');
  if(output.stock.length>PHASE33_MAX_SHOP_STOCK)throw Error('This shop has too many stock types.');
  if(JSON.stringify(output).length>680000)throw Error('This shop record is too large.');
  return output;
}

export function applyGMShopAction(current,action={},shopId=''){
  if(action.type==='delete')return {...cleanGMShop({},current,shopId),status:'deleted',stock:[]};
  if(action.type==='save')return cleanGMShop(action.shop||{},current,shopId);
  const shop=cleanGMShop({},current,shopId);
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
  }else if(action.type==='remove-stock'){
    const i=Number(action.stockIndex);
    if(!Number.isSafeInteger(i)||i<0||i>=shop.stock.length)throw Error('Choose an existing stock item.');
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
    // One trusted write per shop, not the old monolithic itemEcosystem.shops array.
    manageCampaignShop:async(campaignId,_scope,action={})=>{
      try{
        const type=String(action.type||'save');
        if(!['save','stock','remove-stock','delete'].includes(type))throw Error('Choose a valid shop action.');
        const shopId=String(action.shopId||action.shop?.id||
          (type==='save'?'shop-'+requestId:''));
        if(!id(shopId))throw Error('Choose a valid shop identifier.');
        const data=await runTransaction(db,async tx=>{
          await gm(tx,campaignId);
          const ref=doc(db,'campaigns',campaignId,'shops',shopId);
          const legacyRef=doc(db,'campaigns',campaignId,'systems','itemEcosystem');
          const [stored,legacy]=await Promise.all([tx.get(ref),tx.get(legacyRef)]);
          const original=exists(stored)?stored.data():
            (Array.isArray(legacy.data()?.shops)?legacy.data().shops:[])
              .find(row=>String(row.id)===shopId);
          if(type!=='save'&&!original)throw Error('Shop not found.');
          if(type==='save'&&!original&&action.shop?.id&&String(action.shop.id)!==shopId)
            throw Error('Shop identity changed.');
          const shop=applyGMShopAction(original||{id:shopId},type==='save'?{...action,type}:{...action,type},shopId);
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
