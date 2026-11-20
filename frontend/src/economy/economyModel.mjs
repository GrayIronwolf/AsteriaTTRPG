/**
 * Phase 7.3: immutable read projections for the existing campaign economy.
 * NEVER copy raw private item documents into shared public party projections.
 * The existing Cloud Functions, not these view helpers, decide transactions.
 */
import {normalizeCharacterStorages} from '../../../src/state/liveWorkspaceModel.mjs';
import {craftingInventoryPlan} from '../../../src/state/craftingRecipeModel.mjs';
import {publicLootVoteSummary} from '../../../src/state/partyLootDistributionModel.mjs';
import {characterCurrencyCopper} from './economyCurrency.mjs';
import {merchantStockIdentity} from '../../../src/state/merchantInventoryModel.mjs';

const list=v=>Array.isArray(v)?v:[];
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const string=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const whole=(v,max=1000000)=>Number.isSafeInteger(Number(v))&&Number(v)>=0&&Number(v)<=max?Number(v):0;
export const ECONOMY_ID=/^[a-zA-Z0-9_-]{1,160}$/;
export const ECONOMY_ROLES=Object.freeze(['gm','player']);
export const TRADE_MODES=Object.freeze(['give','trade','sell','identify']);
export const LOOT_CHOICES=Object.freeze(['need','greed','pass']);
export const MAX_LOCAL_ROWS=120;

export function requireEconomyId(value){
  if(typeof value!=='string'||!ECONOMY_ID.test(value)||
    ['__proto__','prototype','constructor'].includes(value))
    throw Error('Invalid campaign economy identifier.');
  return value;
}
export function requireQuantity(value,max=1000000){
  if(!Number.isSafeInteger(value)||value<1||value>max)
    throw Error('Choose a valid whole quantity.');
  return value;
}
function iterable(source){
  if(Array.isArray(source))return source;
  if(record(source))return Object.entries(source).map(([key,value])=>
    record(value)?{...value,id:value.id||key,name:value.name||key}:
      {id:key,name:key,qty:typeof value==='number'?value:1});
  return [];
}
/** Explicitly excludes trueName, magic effects and price metadata from unidentified items. */
export function itemProjection(value={},gm=false){
  if(!record(value))return null;
  const unidentified=value.identified===false;
  const name=unidentified&&!gm?string(value.basicName,160)||'Unidentified Item':
    string(value.name||value.title||value.trueName,160)||'Unnamed Item';
  const id=String(value.instanceId||value.id||'');
  const quantity=whole(value.qty??value.quantity??1);
  return Object.freeze({
    id:ECONOMY_ID.test(id)?id:'',
    name,quantity,identified:!unidentified,
    type:unidentified&&!gm?'Unknown':string(value.type||value.itemType||value.category,100)||'Item',
    storageId:string(value.storageId,160),
    storageSlot:Number.isSafeInteger(Number(value.storageSlot))?Number(value.storageSlot):null,
    equipped:value.equipped===true,equippedSlot:string(value.equippedSlot||value.slot,100),
    stackable:value.stackable!==false&&value.unique!==true&&Number(value.maxStack||0)!==1,
    transferable:unidentified?false:!value.equipped&&!value.locked&&!value.bound&&!value.questItem&&quantity>0,
    sellable:unidentified?false:!value.equipped&&!value.locked&&!value.bound&&!value.questItem&&quantity>0,
    locked:value.locked===true,bound:value.bound===true,questItem:value.questItem===true,
    rawCondition:gm?value.condition??null:null,
    condition:Number.isFinite(Number(value.condition))?Number(value.condition):null,
    durability:Number.isFinite(Number(value.durability))?Number(value.durability):null,
    maxDurability:Number.isFinite(Number(value.maxDurability))?Number(value.maxDurability):null,
    hasEffect:!unidentified&&Boolean(value.effect||value.effects),
    spellbook:!unidentified&&(value.isSpellbook===true||Boolean(value.spell)),
    ...(gm?{trueName:string(value.trueName,160)}:{})
  });
}
export function inventoryProjection(character={},gm=false){
  const inventory=iterable(character.inventory).slice(0,500).map(row=>itemProjection(row,gm)).filter(Boolean);
  const storages=normalizeCharacterStorages(character).slice(0,32).map(row=>Object.freeze({
    id:string(row.id,160),name:string(row.name,80)||'Container',
    rows:whole(row.rows,20),cols:whole(row.cols,20),
    maxSlots:whole(row.maxSlots??(Number(row.rows||0)*Number(row.cols||0)),400),
    order:whole(row.order,100),
    itemCount:inventory.filter(x=>!x.equipped&&x.storageId===row.id).length
  }));
  const selectedQuickSlots=list(character.quickSlots);
  const quickSlots=Array.from({length:4},(_,index)=>{
    const slot=selectedQuickSlots[index];
    const id=typeof slot==='string'?slot:record(slot)?slot.itemId||slot.instanceId||slot.id:'';
    return inventory.find(item=>item.id===String(id||''))||null;
  });
  return Object.freeze({
    id:string(character.id,160),name:string(character.name,100)||'Character',
    ownerUid:gm?string(character.ownerUid,160):'',
    coreRevision:whole(character.coreRevision,1000000000),
    items:Object.freeze(inventory),quickSlots:Object.freeze(quickSlots),
    storages:Object.freeze(storages),
    currencyCopper:characterCurrencyCopper(character),
    coins:record(character.coins||character.coinPouch)?
      Object.freeze(Object.fromEntries(Object.entries(character.coins||character.coinPouch)
        .filter(([,v])=>Number.isFinite(Number(v))).map(([key,v])=>[key,Number(v)]))):Object.freeze({}),
    storageLimit:Math.max(0,whole(character.storageLimit||3,100)),
    hasOverflow:inventory.some(row=>!row.equipped&&!row.storageId)
  });
}
export function tradeProjection(rows=[],mode='player',uid='',characterId=''){
  return Object.freeze(list(rows).filter(row=>record(row)&&ECONOMY_ID.test(row.id||'')&&(
    mode==='gm'||((row.fromOwnerUid===uid||row.toOwnerUid===uid)&&
      (row.fromCharacterId===characterId||row.toCharacterId===characterId))
  )).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))
    .slice(0,100).map(row=>Object.freeze({
      id:row.id,mode:TRADE_MODES.includes(row.mode)?row.mode:'give',
      status:string(row.status,36),fromCharacterId:string(row.fromCharacterId,160),
      toCharacterId:string(row.toCharacterId,160),
      fromName:string(row.fromCharacterName,100),toName:string(row.toCharacterName,100),
      direction:row.fromCharacterId===characterId?'sent':'received',
      item:itemProjection(row.item,false),exchangeItem:itemProjection(row.exchangeItem,false),
      quantity:whole(row.quantity),priceCopper:whole(row.priceCopper,1000000000),
      requestedItem:string(row.requestedItem,200),note:string(row.note,600),
      senderNotice:string(row.senderNotice,30),recipientNotice:string(row.recipientNotice,30),
      returnedToOverflow:row.returnedToOverflow===true
    })));
}
export function shopProjection(rows=[],characterId='',gm=false){
  return Object.freeze(list(rows).filter(row=>record(row)&&ECONOMY_ID.test(row.id||'')&&
    row.status!=='deleted'&&row.deleted!==true)
    .slice(0,100).map(row=>Object.freeze({
      id:row.id,name:string(row.name,160),status:row.status==='open'?'open':'closed',
      type:string(row.type,90),region:string(row.region,120),npcName:string(row.npcName,100),
      canVisit:row.status==='open'&&(!list(row.visitorCharacterIds).length||
        list(row.visitorCharacterIds).includes(characterId)),
      visitors:Object.freeze(list(row.visitorCharacterIds).filter(x=>ECONOMY_ID.test(x)).slice(0,60)),
      currencyCopper:whole(row.currencyCopper,1000000000000),
      buyModifier:Number(row.buyModifier)||1,sellModifier:Number(row.sellModifier)||1,
      stock:Object.freeze(list(row.stock).slice(0,120).map((stock,index)=>Object.freeze({
        index,quantity:whole(stock.qty),
        ...(gm?{stockIdentity:merchantStockIdentity(stock.item)}:{}),
        item:itemProjection({...stock.item,id:stock.item?.id||'stock-'+index},false),
        priceCopper:stock.priceCopper===null||stock.priceCopper===undefined?null:
          Number.isSafeInteger(Number(stock.priceCopper))?Number(stock.priceCopper):null,
        minStanding:Number(stock.minStanding)||0,
        opportunityLabel:string(stock.opportunityLabel,100),
        restockTarget:whole(stock.restockTarget),lowStockAt:whole(stock.lowStockAt)
      })))
    })));
}
export function lootProjection(rows=[],character={},gm=false){
  return Object.freeze(list(rows).filter(row=>record(row)&&ECONOMY_ID.test(row.id||'')&&
    (gm||row.visibility==='revealed')).slice(0,120).map(row=>{
    const vote=publicLootVoteSummary(row,character);
    return Object.freeze({
      id:row.id,title:string(row.title,160),source:string(row.source,160),
      note:string(row.note,600),kind:row.kind==='currency'?'currency':'item',
      currencyCopper:whole(row.currencyCopper,1000000000000),item:itemProjection(row.item,false),
      status:string(row.status,32),visibility:string(row.visibility,30),
      claimedByCharacterId:string(row.claimedByCharacterId,160),
      distribution:Object.freeze({
        status:string(row.distribution?.status,32),
        roundId:string(row.distribution?.roundId,160),
        tally:vote?.tally||row.distribution?.tally||null,
        ownChoice:vote?.ownChoice||'',winnerCharacterId:string(row.distribution?.winnerCharacterId,160)
      })
    });
  }));
}
export function stashProjection(rows=[]){
  return Object.freeze(list(rows).filter(row=>record(row)&&ECONOMY_ID.test(row.id||''))
    .slice(0,100).map(row=>Object.freeze({
      id:row.id,name:string(row.name,160),kind:row.kind==='chest'?'chest':'stash',
      status:row.status==='closed'?'closed':'open',
      description:string(row.description,600),allowDeposits:row.allowDeposits!==false,
      allowWithdrawals:row.allowWithdrawals!==false,
      items:Object.freeze(list(row.items).slice(0,80).map(item=>itemProjection(item,false)).filter(Boolean))
    })));
}
export function craftingProjection(rows=[],kind='recipes',inventory=[]){
  return Object.freeze(list(rows).filter(row=>record(row)&&ECONOMY_ID.test(row.id||''))
    .slice(0,120).map(row=>{
      if(kind==='recipes'){
        const materials=list(row.materials).slice(0,12).map(m=>({
          name:string(m.name,160),itemCode:string(m.itemCode,128),quantity:whole(m.quantity,1000)
        }));
        const ready=craftingInventoryPlan({materials},inventory);
        return Object.freeze({
          id:row.id,name:string(row.name,160),description:string(row.description,1000),
          status:string(row.status,32),stationId:string(row.stationId,160),
          materials:Object.freeze(materials),output:row.output?Object.freeze({
            name:string(row.output.name,160),type:string(row.output.type,100),
            itemCode:string(row.output.itemCode,128),quantity:whole(row.output.quantity,100)
          }):null,
          ready:ready.ready,requirements:Object.freeze(ready.requirements)
        });
      }
      if(kind==='stations')return Object.freeze({
        id:row.id,name:string(row.name,160),type:string(row.type,100),
        status:string(row.status,32),location:string(row.location,160),
        description:string(row.description,600),
        allowedCharacterIds:Object.freeze(list(row.allowedCharacterIds).slice(0,50))
      });
      if(kind==='services')return Object.freeze({
        id:row.id,name:string(row.name,160),provider:string(row.provider,160),
        type:string(row.type,100),status:string(row.status,32),
        description:string(row.description,600),stationId:string(row.stationId,160),
        targetType:string(row.targetType,100),restoreTo:whole(row.restoreTo,100),
        feeCopper:whole(row.feeCopper,100000000),
        materials:Object.freeze(list(row.materials).slice(0,12).map(m=>({
          name:string(m.name,160),itemCode:string(m.itemCode,128),quantity:whole(m.quantity,1000)
        })))
      });
      return Object.freeze({
        id:row.id,characterId:string(row.characterId,160),
        characterName:string(row.characterName,100),
        ownerUid:kind==='gm'?string(row.ownerUid,160):'',
        status:string(row.status,32),recipeId:string(row.recipeId,160),
        recipeName:string(row.recipeName,160),serviceId:string(row.serviceId,160),
        serviceName:string(row.serviceName,160),itemId:string(row.itemId,160),
        itemName:string(row.itemName,160),createdAt:row.createdAt||null
      });
    }));
}
export function merchantDealProjection(rows=[],gm=false){
  return Object.freeze(list(rows).filter(row=>record(row)&&ECONOMY_ID.test(row.id||''))
    .slice(0,100).map(row=>Object.freeze({
      id:row.id,shopId:string(row.shopId,160),shopName:string(row.shopName,160),
      characterId:string(row.characterId,160),characterName:string(row.characterName,160),
      stockItemName:string(row.stockItemName,160),status:string(row.status,36),
      offeredCopper:whole(row.offeredCopper,1000000000),
      listedTotalCopper:whole(row.listedTotalCopper,10000000000),
      quantity:whole(row.quantity),note:string(row.note,500),
      ...(gm?{barterItemName:string(row.barterItemName,160)}:{})
    })));
}
export function economyProjection(state,role='player',uid='',characterId=''){
  if(!ECONOMY_ROLES.includes(role))throw Error('Unsupported economy role.');
  const own=state.character?inventoryProjection(state.character,role==='gm'):null;
  const inventory=state.character?iterable(state.character.inventory):[];
  const allowed=role==='gm'?state.party.map(x=>inventoryProjection(x,true)):Object.freeze([]);
  return Object.freeze({
    session:state.session,character:own,
    party:role==='gm'?Object.freeze(allowed):Object.freeze(state.publicParty||[]),
    stashes:stashProjection(state.stashes),
    loot:lootProjection(state.loot,state.character,role==='gm'),
    drafts:role==='gm'?lootProjection(state.drafts,{},true):Object.freeze([]),
    shops:shopProjection(state.shops,characterId,role==='gm'),
    trades:tradeProjection(state.trades,role,uid,characterId),
    merchantDeals:merchantDealProjection(state.merchantDeals,role==='gm'),
    recipes:craftingProjection(state.recipes,'recipes',inventory),
    stations:craftingProjection(state.stations,'stations'),
    services:craftingProjection(state.services,'services'),
    craftingRequests:craftingProjection(state.craftingRequests,'requests'),
    repairRequests:craftingProjection(state.repairRequests,'requests')
  });
}